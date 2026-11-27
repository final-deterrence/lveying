import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultData, type DataStoreState } from './defaultData';
import { normalizeIp } from './ip';
export { normalizeIp } from './ip';

export function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function insertProgram(db: DatabaseSync, program: DataStoreState['programs'][number]): void {
  db.prepare(`INSERT INTO programs
    (id, title, performers, band_name, order_value, completed, parent_id, sub_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    program.id, program.title, JSON.stringify(program.performers ?? null),
    program.band_name ?? null, program.order, Number(program.completed),
    program.parentId ?? null, program.subOrder ?? null,
  );
}

export function insertDanmaku(db: DatabaseSync, danmaku: DataStoreState['danmakus'][number]): void {
  db.prepare(`INSERT INTO danmakus (id, content, timestamp, censor, censored_at, ip)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    danmaku.id, danmaku.content, danmaku.timestamp, Number(danmaku.censor),
    danmaku.censoredAt ?? null, danmaku.ip ? normalizeIp(danmaku.ip) : null,
  );
}

function initialize(db: DatabaseSync, dataDir: string): void {
  transaction(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS programs (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, performers TEXT,
        band_name TEXT, order_value INTEGER NOT NULL, completed INTEGER NOT NULL,
        parent_id TEXT, sub_order INTEGER
      );
      CREATE TABLE IF NOT EXISTS danmakus (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL, timestamp INTEGER NOT NULL,
        censor INTEGER NOT NULL CHECK (censor IN (0, 1)), censored_at INTEGER, ip TEXT
      );
      CREATE INDEX IF NOT EXISTS danmakus_recent ON danmakus(timestamp DESC, seq DESC);
      CREATE INDEX IF NOT EXISTS danmakus_status ON danmakus(censor, timestamp DESC, seq DESC);
      CREATE INDEX IF NOT EXISTS danmakus_public
        ON danmakus(censor, COALESCE(censored_at, timestamp) DESC, seq DESC);
      CREATE INDEX IF NOT EXISTS danmakus_ip ON danmakus(ip, censor);
      CREATE TABLE IF NOT EXISTS danmaku_rate_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        client_key TEXT NOT NULL, ip_key TEXT NOT NULL,
        content_hash TEXT NOT NULL, timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS danmaku_rate_client ON danmaku_rate_events(client_key, timestamp);
      CREATE INDEX IF NOT EXISTS danmaku_rate_ip ON danmaku_rate_events(ip_key, timestamp);
      CREATE INDEX IF NOT EXISTS danmaku_rate_duplicate ON danmaku_rate_events(client_key, content_hash, timestamp);
      CREATE INDEX IF NOT EXISTS danmaku_rate_expiry ON danmaku_rate_events(timestamp);
      CREATE TABLE IF NOT EXISTS danmaku_reviews (
        danmaku_id TEXT PRIMARY KEY REFERENCES danmakus(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        source TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
        reason TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS danmaku_reviews_status ON danmaku_reviews(status);
      CREATE TABLE IF NOT EXISTS danmaku_guard_counters (
        day TEXT NOT NULL, reason TEXT NOT NULL, total INTEGER NOT NULL,
        PRIMARY KEY (day, reason)
      );
      CREATE TABLE IF NOT EXISTS banned_ips (ip TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lottery_results (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL, numbers TEXT NOT NULL, timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lottery_recent ON lottery_results(timestamp DESC, seq DESC);
      CREATE TABLE IF NOT EXISTS lottery_unpublished (
        result_id TEXT PRIMARY KEY REFERENCES lottery_results(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS lottery_draw_requests (
        result_id TEXT PRIMARY KEY REFERENCES lottery_results(id) ON DELETE CASCADE,
        config TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lottery_stage_awards (
        award TEXT PRIMARY KEY,
        result_id TEXT NOT NULL UNIQUE REFERENCES lottery_results(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS lottery_reveal_progress (
        result_id TEXT PRIMARY KEY REFERENCES lottery_results(id) ON DELETE CASCADE,
        revealed_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS lottery_invalid_results (
        result_id TEXT PRIMARY KEY REFERENCES lottery_results(id) ON DELETE CASCADE,
        reason TEXT NOT NULL, timestamp INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lottery_ticket_replacements (
        result_id TEXT NOT NULL REFERENCES lottery_results(id) ON DELETE CASCADE,
        number INTEGER NOT NULL, substitute INTEGER, reason TEXT NOT NULL, timestamp INTEGER NOT NULL, replaced_at INTEGER,
        PRIMARY KEY (result_id, number)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS lottery_one_pending_ticket
        ON lottery_ticket_replacements(result_id) WHERE substitute IS NULL;
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY, passwordHash TEXT NOT NULL, role TEXT NOT NULL,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      INSERT OR IGNORE INTO metadata VALUES ('danmaku_revision', '0');
      CREATE TRIGGER IF NOT EXISTS danmakus_insert AFTER INSERT ON danmakus BEGIN
        UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'danmaku_revision';
      END;
      CREATE TRIGGER IF NOT EXISTS danmakus_update AFTER UPDATE ON danmakus BEGIN
        UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'danmaku_revision';
      END;
      CREATE TRIGGER IF NOT EXISTS danmakus_delete AFTER DELETE ON danmakus BEGIN
        UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'danmaku_revision';
      END;
    `);
    if (!db.prepare('PRAGMA table_info(lottery_ticket_replacements)').all().some(col => col.name === 'replaced_at')) {
      db.exec('ALTER TABLE lottery_ticket_replacements ADD COLUMN replaced_at INTEGER');
    }
    if (db.prepare("SELECT 1 FROM metadata WHERE key = 'initialized_v1'").get()) return;

    // 一次性导入；失败时回滚，不覆盖原 JSON，也不把损坏文件替换成默认数据。
    const storeFile = path.join(dataDir, 'store.json');
    const loaded = fs.existsSync(storeFile)
      ? JSON.parse(fs.readFileSync(storeFile, 'utf8')) : structuredClone(defaultData);
    const state: DataStoreState = {
      ...loaded, bannedIps: loaded.bannedIps ?? [],
      lotteryResults: loaded.lotteryResults ?? (loaded.lotteryResult ? [loaded.lotteryResult] : []),
    };
    if (!Array.isArray(state.programs) || !Array.isArray(state.danmakus)
      || !Array.isArray(state.bannedIps) || !Array.isArray(state.lotteryResults) || !state.lotteryConfig) {
      throw new Error('store.json 格式不正确，SQLite 迁移已取消，原文件未修改');
    }
    state.programs.forEach(program => insertProgram(db, program));
    state.danmakus.forEach(danmaku => insertDanmaku(db, danmaku));
    const ban = db.prepare('INSERT OR IGNORE INTO banned_ips VALUES (?)');
    state.bannedIps.forEach(ip => ban.run(normalizeIp(ip)));
    db.prepare("INSERT INTO settings VALUES ('lottery_config', ?)").run(JSON.stringify(state.lotteryConfig));
    const result = db.prepare('INSERT INTO lottery_results (id, title, numbers, timestamp) VALUES (?, ?, ?, ?)');
    state.lotteryResults.forEach(item => result.run(item.id, item.title, JSON.stringify(item.numbers), item.timestamp));

    const usersFile = path.join(dataDir, 'users.json');
    const now = new Date().toISOString();
    const users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, 'utf8')) : {
      admin: {
        username: 'admin', role: 'admin', createdAt: now, updatedAt: now,
        passwordHash: '$2a$10$wk0XSi7rOwEqDM1fQCNnxu96nXtwlKAsIa9SzWQtmH9ccZaIg4a5m',
      },
    };
    const userInsert = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)');
    for (const user of Object.values(users) as Record<string, string>[]) {
      userInsert.run(user.username, user.passwordHash, user.role, user.createdAt, user.updatedAt);
    }
    db.prepare("INSERT INTO metadata VALUES ('initialized_v1', '1')").run();
  });
}

// 热更新复用连接；延迟初始化，构建页面时不创建业务数据。
const globalDatabase = globalThis as typeof globalThis & { lveyingDatabases?: Map<string, DatabaseSync> };
const connections = globalDatabase.lveyingDatabases ??= new Map<string, DatabaseSync>();

export function getDatabase(): DatabaseSync {
  const dataDir = path.resolve(process.env.LVEYING_DATA_DIR || path.join(process.cwd(), 'data'));
  const file = path.join(dataDir, 'lveying.sqlite');
  const existing = connections.get(file);
  if (existing) return existing;
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  try {
    fs.chmodSync(file, 0o600);
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
    initialize(db, dataDir);
    connections.set(file, db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

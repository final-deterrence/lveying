import { randomInt, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Program, Danmaku, LotteryConfig, LotteryResult, StageAward, DanmakuPage, DanmakuFilter, DanmakuReview } from '../types';
import { defaultData, type DataStoreState } from './defaultData';
import { getDatabase, insertProgram, insertDanmaku, normalizeIp, transaction } from './database';
import { isTicketRange, MAX_TICKET_NUMBER } from '../public/wujiandao/tickets.mjs';

type Row = Record<string, unknown>;
export class LotteryError extends Error {}

export function validateLotteryConfig(config: LotteryConfig): void {
  if (!isTicketRange(config.minNumber, config.maxNumber)
    || !Number.isSafeInteger(config.count) || config.count < 1 || config.count > 100
    || config.count > config.maxNumber - config.minNumber + 1
    || typeof config.title !== 'string' || !config.title.trim() || config.title.length > 100) {
    throw new LotteryError(`请填写有效的奖项名称、号码范围（0000 至 ${MAX_TICKET_NUMBER}）和人数（1 至 100）`);
  }
}

function programFromRow(row: Row): Program {
  return {
    id: String(row.id), title: String(row.title),
    performers: JSON.parse(String(row.performers)), band_name: row.band_name as string | null,
    order: Number(row.order_value), completed: Boolean(row.completed),
    ...(row.parent_id === null ? {} : { parentId: String(row.parent_id) }),
    ...(row.sub_order === null ? {} : { subOrder: Number(row.sub_order) }),
  };
}

function danmakuFromRow(row: Row): Danmaku {
  return {
    id: String(row.id), content: String(row.content), timestamp: Number(row.timestamp), censor: Boolean(row.censor),
    ...(row.censored_at == null ? {} : { censoredAt: Number(row.censored_at) }),
    ...(row.ip == null ? {} : { ip: String(row.ip) }),
    ...(row.review_source == null ? {} : { review: {
      status: row.review_status as DanmakuReview['status'], source: row.review_source as DanmakuReview['source'], reason: String(row.review_reason),
    } }),
  };
}

function reviewWhere(filter: DanmakuFilter | boolean): string {
  if (filter === true || filter === 'pending') return "WHERE d.censor = 0 AND (r.status IS NULL OR r.status <> 'rejected')";
  if (filter === 'approved') return 'WHERE d.censor = 1';
  if (filter === 'rejected') return "WHERE d.censor = 0 AND r.status = 'rejected'";
  return '';
}

const reviewColumns = 'd.*, r.status AS review_status, r.source AS review_source, r.reason AS review_reason';
const reviewJoin = 'FROM danmakus d LEFT JOIN danmaku_reviews r ON r.danmaku_id = d.id';

function resultFromRow(row: Row): LotteryResult {
  return { id: String(row.id), title: String(row.title), numbers: JSON.parse(String(row.numbers)), timestamp: Number(row.timestamp),
    ...(row.pending_ticket == null ? {} : { pendingTicket: Number(row.pending_ticket) }) };
}

export class DataStore {
  private publicCache?: { revision: string; expires: number; items: Danmaku[] };

  constructor(private readonly connection?: DatabaseSync) {}
  private get db(): DatabaseSync { return this.connection ?? getDatabase(); }

  getPrograms(): Program[] {
    return this.db.prepare('SELECT * FROM programs ORDER BY order_value, parent_id IS NOT NULL, sub_order, rowid')
      .all().map(programFromRow);
  }

  getHierarchicalPrograms(): Program[] {
    const programs = this.getPrograms();
    return programs.filter(p => !p.parentId).flatMap(parent => [
      parent, ...programs.filter(p => p.parentId === parent.id).sort((a, b) => (a.subOrder || 0) - (b.subOrder || 0)),
    ]);
  }

  updatePrograms(programs: Program[]): void {
    transaction(this.db, () => {
      this.db.exec('DELETE FROM programs');
      programs.forEach(program => insertProgram(this.db, program));
    });
  }

  updateProgramStatus(id: string, completed: boolean): void {
    this.db.prepare('UPDATE programs SET completed = ? WHERE id = ?').run(Number(completed), id);
  }

  addProgram(title: string, order: number, performers?: Program['performers'], band_name?: string | null, parentId?: string, subOrder?: number): Program {
    const program: Program = { id: randomUUID(), title, order, completed: false, performers: performers ?? null, band_name: band_name ?? null, parentId, subOrder };
    insertProgram(this.db, program);
    return program;
  }

  deleteProgram(id: string): void {
    this.db.prepare('DELETE FROM programs WHERE id = ? OR parent_id = ?').run(id, id);
  }

  updateProgramDetails(id: string, title: string, order: number, performers?: Program['performers'], band_name?: string | null, parentId?: string, subOrder?: number): void {
    this.db.prepare('UPDATE programs SET title = ?, order_value = ?, performers = ?, band_name = ?, parent_id = ?, sub_order = ? WHERE id = ?')
      .run(title, order, JSON.stringify(performers ?? null), band_name ?? null, parentId ?? null, subOrder ?? null, id);
  }

  getDanmakus(page = 1, pageSize = 50, filter: DanmakuFilter | boolean = 'all'): DanmakuPage {
    const statsRow = this.db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(d.censor), 0) AS approved,
      COALESCE(SUM(CASE WHEN d.censor = 0 AND r.status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected ${reviewJoin}`).get()!;
    const stats = { total: Number(statsRow.total), approved: Number(statsRow.approved),
      pending: Number(statsRow.total) - Number(statsRow.approved) - Number(statsRow.rejected), rejected: Number(statsRow.rejected) };
    const normalizedFilter = filter === true ? 'pending' : filter === false ? 'all' : filter;
    const total = normalizedFilter === 'all' ? stats.total : stats[normalizedFilter];
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const rows = this.db.prepare(`SELECT ${reviewColumns} ${reviewJoin} ${reviewWhere(filter)}
      ORDER BY d.timestamp DESC, d.seq DESC LIMIT ? OFFSET ?`).all(pageSize, (currentPage - 1) * pageSize);
    return { danmakus: rows.map(danmakuFromRow), stats, pagination: { page: currentPage, pageSize, total, totalPages } };
  }

  exportDanmakus(after = 0, snapshot?: number, filter: DanmakuFilter | boolean = 'all') {
    const upper = snapshot ?? Number(this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM danmakus').get()!.seq);
    const where = reviewWhere(filter);
    const rows = this.db.prepare(`SELECT ${reviewColumns} ${reviewJoin} ${where || 'WHERE 1 = 1'} AND d.seq > ? AND d.seq <= ?
      ORDER BY d.seq LIMIT 1001`).all(after, upper);
    const batch = rows.slice(0, 1000);
    return { danmakus: batch.map(danmakuFromRow), snapshot: upper, nextCursor: Number(batch.at(-1)?.seq ?? after), hasMore: rows.length > 1000 };
  }

  // 数据库触发器使审核、撤回、删除和跨连接写入立即使共享快照缓存失效。
  getPublicDanmakus(): Danmaku[] {
    const revision = String(this.db.prepare("SELECT value FROM metadata WHERE key = 'danmaku_revision'").get()!.value);
    if (!this.publicCache || this.publicCache.revision !== revision || this.publicCache.expires <= Date.now()) {
      const items = this.db.prepare(`SELECT id, content, timestamp, censor, censored_at FROM danmakus
        WHERE censor = 1 ORDER BY COALESCE(censored_at, timestamp) DESC, seq DESC LIMIT 20`).all().map(danmakuFromRow);
      this.publicCache = { revision, expires: Date.now() + 1000, items };
    }
    return this.publicCache.items.map(item => ({ ...item }));
  }

  getCensoredDanmakus(): Danmaku[] { return this.getPublicDanmakus().reverse(); }

  addDanmaku(content: string, ip?: string): Danmaku {
    const danmaku: Danmaku = { id: randomUUID(), content, timestamp: Date.now(), censor: false, ip };
    insertDanmaku(this.db, danmaku);
    return danmaku;
  }

  updateDanmakuCensor(id: string, censor: boolean): boolean {
    return this.updateDanmakuReview(id, censor ? 'approved' : 'pending');
  }

  updateDanmakuReview(id: string, status: DanmakuReview['status']): boolean {
    return transaction(this.db, () => {
      const changed = this.db.prepare('UPDATE danmakus SET censor = ?, censored_at = ? WHERE id = ?')
        .run(Number(status === 'approved'), status === 'approved' ? Date.now() : null, id).changes;
      if (!changed) return false;
      const reason = status === 'approved' ? '管理员通过' : status === 'rejected' ? '管理员拦截' : '管理员转回待审核';
      this.db.prepare(`INSERT INTO danmaku_reviews (danmaku_id, status, source, reason) VALUES (?, ?, 'manual', ?)
        ON CONFLICT(danmaku_id) DO UPDATE SET status = excluded.status, source = excluded.source, reason = excluded.reason`)
        .run(id, status, reason);
      return true;
    });
  }

  clearDanmakus(): void { this.db.exec('DELETE FROM danmakus'); }
  deleteDanmaku(id: string): boolean { return this.db.prepare('DELETE FROM danmakus WHERE id = ?').run(id).changes > 0; }
  getBannedIps(): string[] { return this.db.prepare('SELECT ip FROM banned_ips ORDER BY rowid').all().map(row => String(row.ip)); }

  banIp(value: string): { success: boolean; affected: number } {
    if (!value) return { success: false, affected: 0 };
    const ip = normalizeIp(value);
    return transaction(this.db, () => {
      const inserted = this.db.prepare('INSERT OR IGNORE INTO banned_ips VALUES (?)').run(ip);
      if (!inserted.changes) return { success: false, affected: 0 };
      this.db.prepare(`INSERT INTO danmaku_reviews (danmaku_id, status, source, reason)
        SELECT id, 'rejected', 'manual', 'IP 已被管理员封禁' FROM danmakus WHERE ip = ?
        ON CONFLICT(danmaku_id) DO UPDATE SET status = excluded.status, source = excluded.source, reason = excluded.reason`).run(ip);
      const updated = this.db.prepare('UPDATE danmakus SET censor = 0, censored_at = NULL WHERE ip = ? AND censor = 1').run(ip);
      return { success: true, affected: Number(updated.changes) };
    });
  }

  unbanIp(ip: string): boolean { return this.db.prepare('DELETE FROM banned_ips WHERE ip = ?').run(normalizeIp(ip)).changes > 0; }
  clearBannedIps(): void { this.db.exec('DELETE FROM banned_ips'); }
  isIpBanned(ip: string): boolean { return Boolean(this.db.prepare('SELECT 1 FROM banned_ips WHERE ip = ?').get(normalizeIp(ip))); }

  getLotteryConfig(): LotteryConfig {
    return JSON.parse(String(this.db.prepare("SELECT value FROM settings WHERE key = 'lottery_config'").get()!.value));
  }

  updateLotteryConfig(config: Partial<LotteryConfig>): LotteryConfig {
    return transaction(this.db, () => {
      const updated = { ...this.getLotteryConfig(), ...config };
      validateLotteryConfig(updated);
      if (updated.awardCounts !== undefined && (!updated.awardCounts || typeof updated.awardCounts !== 'object'
        || Array.isArray(updated.awardCounts) || Object.entries(updated.awardCounts).some(([key, n]) =>
          !['third', 'second', 'first', 'grand'].includes(key) || !Number.isSafeInteger(n) || n < 1 || n > 100))) {
        throw new LotteryError('每档奖项的名额须为 1 至 100 的整数');
      }
      this.db.prepare("UPDATE settings SET value = ? WHERE key = 'lottery_config'").run(JSON.stringify(updated));
      return updated;
    });
  }

  addLotteryResult(title: string, numbers: number[]): LotteryResult {
    const result = { id: randomUUID(), title, numbers, timestamp: Date.now() };
    this.db.prepare('INSERT INTO lottery_results (id, title, numbers, timestamp) VALUES (?, ?, ?, ?)')
      .run(result.id, title, JSON.stringify(numbers), result.timestamp);
    return result;
  }

  getStageAwards(): Partial<Record<StageAward, LotteryResult>> {
    const rows = this.db.prepare(`SELECT a.award, r.*, t.number AS pending_ticket FROM lottery_stage_awards a
      JOIN lottery_results r ON r.id = a.result_id
      LEFT JOIN lottery_ticket_replacements t ON t.result_id=r.id AND t.substitute IS NULL`).all();
    return Object.fromEntries(rows.map(row => [String(row.award), resultFromRow(row)]));
  }

  drawLottery(id: string, config: LotteryConfig, award?: StageAward): LotteryResult {
    const title = typeof config.title === 'string' ? config.title.trim() : '';
    const requestConfig = JSON.stringify({ minNumber: config.minNumber, maxNumber: config.maxNumber, count: config.count, title });
    return transaction(this.db, () => {
      const existing = this.db.prepare('SELECT * FROM lottery_results WHERE id = ?').get(id);
      if (existing) {
        const result = resultFromRow(existing);
        const previous = this.db.prepare('SELECT config FROM lottery_draw_requests WHERE result_id = ?').get(id);
        if (!previous || previous.config !== requestConfig) throw new LotteryError('抽奖请求编号冲突');
        if (award && !this.db.prepare('SELECT 1 FROM lottery_stage_awards WHERE award = ? AND result_id = ?').get(award, id)) {
          throw new LotteryError('该请求已失效，请刷新导播台');
        }
        return award ? this.getStageAwards()[award]! : result;
      }
      validateLotteryConfig(config);
      // 两个导播窗口同时确认同一档时，后到的请求读取已提交的那一批。
      if (award) {
        const recorded = this.getStageAwards()[award];
        if (recorded) return recorded;
      }
      if (this.db.prepare('SELECT 1 FROM lottery_unpublished LIMIT 1').get()) throw new LotteryError('已有未揭晓的抽奖结果，请先恢复并揭晓');
      const numbers = this.sampleTickets(config);
      const result = { id, title, numbers, timestamp: Date.now() };
      this.db.prepare('INSERT INTO lottery_results (id, title, numbers, timestamp) VALUES (?, ?, ?, ?)')
        .run(id, result.title, JSON.stringify(numbers), result.timestamp);
      if (award) this.db.prepare('INSERT INTO lottery_stage_awards VALUES (?, ?)').run(award, id);
      else this.db.prepare('INSERT INTO lottery_unpublished VALUES (?)').run(id);
      this.db.prepare('INSERT INTO lottery_reveal_progress VALUES (?, ?)').run(id, award ? numbers.length : 0);
      this.db.prepare('INSERT INTO lottery_draw_requests VALUES (?, ?)').run(id, requestConfig);
      return result;
    });
  }

  private ticketPool({ minNumber, maxNumber }: LotteryConfig) {
    const used = new Set<number>();
    for (const row of this.db.prepare('SELECT numbers FROM lottery_results').all()) {
      for (const n of JSON.parse(String(row.numbers))) {
        if (Number.isSafeInteger(n) && n >= minNumber && n <= maxNumber) used.add(n);
      }
    }
    for (const row of this.db.prepare('SELECT number FROM lottery_ticket_replacements WHERE number BETWEEN ? AND ?').all(minNumber, maxNumber)) used.add(Number(row.number));
    return { excluded: Array.from(used).sort((a, b) => a - b), available: maxNumber - minNumber + 1 - used.size };
  }

  private sampleTickets(config: LotteryConfig): number[] {
    const { available, excluded } = this.ticketPool(config);
    if (available < config.count) throw new LotteryError(`可用号码仅剩 ${available} 个，不足以抽取 ${config.count} 人`);
    const chosen = new Set<number>();
    // Floyd sampling over free ranks avoids allocating the full ticket pool.
    for (let j = available - config.count; j < available; j++) {
      const candidate = randomInt(j + 1);
      chosen.add(chosen.has(candidate) ? j : candidate);
    }
    const numbers = Array.from(chosen).map(index => {
      let low = config.minNumber, high = config.maxNumber;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        let l = 0, r = excluded.length;
        while (l < r) { const m = Math.floor((l + r) / 2); if (excluded[m] <= mid) l = m + 1; else r = m; }
        if (mid - config.minNumber + 1 - l > index) high = mid; else low = mid + 1;
      }
      return low;
    });
    for (let i = numbers.length - 1; i > 0; i--) { const j = randomInt(i + 1); [numbers[i], numbers[j]] = [numbers[j], numbers[i]]; }
    return numbers;
  }

  updateGrandTicket(id: string, number: number, action: 'withdraw' | 'replace', reason: string): LotteryResult {
    if (!Number.isSafeInteger(number)) throw new LotteryError('请选择一张有效的中奖票');
    return transaction(this.db, () => {
      const grand = this.getStageAwards().grand;
      if (!grand || grand.id !== id || grand.numbers.length < 2) throw new LotteryError('只能在已揭晓的多人特等奖中逐张核券');
      const previous = this.db.prepare('SELECT substitute FROM lottery_ticket_replacements WHERE result_id=? AND number=?').get(id, number);
      // An excluded number can never return, so the batch and original ticket identify the operation across retries.
      if (previous && (action === 'withdraw' || previous.substitute != null)) return grand;
      const seat = grand.numbers.indexOf(number);
      if (seat < 0) throw new LotteryError('所选号码已不是本档有效票号，请刷新导播台');
      const config = { ...this.getLotteryConfig(), count: 1 };
      if (!isTicketRange(config.minNumber, config.maxNumber)) throw new LotteryError(`请先在抽奖设置中将票号范围设在 0000 至 ${MAX_TICKET_NUMBER} 之间`);
      if (action === 'withdraw') {
        if (!reason.trim() || reason.length > 200) throw new LotteryError('请填写作废原因');
        if (grand.pendingTicket !== undefined) throw new LotteryError('请先完成当前票号的补抽');
        if (!this.ticketPool(config).available) throw new LotteryError('已无可抽号码，请先核对号码范围');
        this.db.prepare('INSERT INTO lottery_ticket_replacements (result_id,number,reason,timestamp) VALUES (?,?,?,?)')
          .run(id, number, reason.trim(), Date.now());
        return { ...grand, pendingTicket: number };
      }
      if (!previous || grand.pendingTicket !== number) throw new LotteryError('请先确认所选奖券无效');
      const [substitute] = this.sampleTickets(config);
      grand.numbers[seat] = substitute;
      this.db.prepare('UPDATE lottery_results SET numbers=? WHERE id=?').run(JSON.stringify(grand.numbers), id);
      this.db.prepare('UPDATE lottery_ticket_replacements SET substitute=?, replaced_at=? WHERE result_id=? AND number=?')
        .run(substitute, Date.now(), id, number);
      delete grand.pendingTicket;
      return grand;
    });
  }

  getUnpublishedLotteryResult(): LotteryResult | null {
    const row = this.db.prepare('SELECT r.*, COALESCE(p.revealed_count, 0) AS revealed_count FROM lottery_results r JOIN lottery_unpublished u ON u.result_id = r.id LEFT JOIN lottery_reveal_progress p ON p.result_id = r.id ORDER BY r.seq DESC LIMIT 1').get();
    return row ? { ...resultFromRow(row), revealedCount: Number(row.revealed_count) } : null;
  }

  revealLotteryResult(id: string, count?: number): boolean {
    return transaction(this.db, () => {
      const row = this.db.prepare('SELECT numbers FROM lottery_results WHERE id = ?').get(id);
      if (!row) return false;
      if (this.db.prepare('SELECT 1 FROM lottery_invalid_results WHERE result_id = ?').get(id)) throw new LotteryError('该结果已作废');
      const total = (JSON.parse(String(row.numbers)) as number[]).length;
      const requested = count === undefined ? total : count;
      if (!Number.isSafeInteger(requested) || requested < 0 || requested > total) throw new LotteryError('无效的揭晓数量');
      this.db.prepare(`INSERT INTO lottery_reveal_progress VALUES (?, ?)
        ON CONFLICT(result_id) DO UPDATE SET revealed_count = MAX(revealed_count, excluded.revealed_count)`).run(id, requested);
      if (requested === total) this.db.prepare('DELETE FROM lottery_unpublished WHERE result_id = ?').run(id);
      return true;
    });
  }

  invalidateLotteryResult(id: string, reason: string): boolean {
    if (!reason.trim() || reason.length > 200) throw new LotteryError('请填写作废原因');
    return transaction(this.db, () => {
      const row = this.db.prepare('SELECT numbers FROM lottery_results WHERE id = ?').get(id);
      if (!row) return false;
      if (this.db.prepare("SELECT 1 FROM lottery_stage_awards WHERE result_id = ? AND award <> 'grand'").get(id)) {
        throw new LotteryError('只有单人特等奖可以现场核券重抽');
      }
      if ((JSON.parse(String(row.numbers)) as number[]).length !== 1 || this.db.prepare('SELECT 1 FROM lottery_unpublished WHERE result_id = ?').get(id)) throw new LotteryError('只能作废已全部揭晓的单人抽奖结果');
      this.db.prepare('INSERT OR IGNORE INTO lottery_invalid_results VALUES (?, ?, ?)').run(id, reason.trim(), Date.now());
      this.db.prepare('DELETE FROM lottery_stage_awards WHERE result_id = ?').run(id);
      return true;
    });
  }

  getAllLotteryResults(includeInvalid = false): LotteryResult[] {
    const batches = this.db.prepare(`SELECT r.*, p.revealed_count, i.timestamp AS invalidated_at, i.reason AS invalid_reason,
      t.number AS withdrawn, u.result_id AS unpublished FROM lottery_results r
      LEFT JOIN lottery_unpublished u ON u.result_id = r.id
      LEFT JOIN lottery_reveal_progress p ON p.result_id = r.id
      LEFT JOIN lottery_invalid_results i ON i.result_id = r.id
      LEFT JOIN lottery_ticket_replacements t ON t.result_id=r.id AND t.substitute IS NULL
      WHERE (? = 1 OR i.result_id IS NULL) ORDER BY r.timestamp DESC, r.seq DESC`).all(Number(includeInvalid)).flatMap(row => {
        const result = resultFromRow(row);
        const revealed = row.unpublished == null ? result.numbers.length : Number(row.revealed_count ?? 0);
        if (!revealed) return [];
        result.numbers = result.numbers.slice(0, revealed);
        if (row.withdrawn != null) result.numbers = result.numbers.filter(n => n !== Number(row.withdrawn));
        if (row.invalidated_at != null) { result.invalidatedAt = Number(row.invalidated_at); result.invalidReason = String(row.invalid_reason); }
        return [result];
      });
    if (!includeInvalid) return batches;
    const withdrawn = this.db.prepare(`SELECT t.*,r.title FROM lottery_ticket_replacements t
      JOIN lottery_results r ON r.id=t.result_id ORDER BY t.timestamp DESC`).all();
    for (const row of withdrawn) batches.push({ id: row.result_id + '/ticket/' + row.number, title: String(row.title),
      numbers: [Number(row.number)], timestamp: Number(row.timestamp), invalidatedAt: Number(row.timestamp), invalidReason: String(row.reason),
      ...(row.substitute == null ? {} : { replacementNumber: Number(row.substitute) }),
      ...(row.replaced_at == null ? {} : { replacedAt: Number(row.replaced_at) }) });
    return batches.sort((a,b) => b.timestamp-a.timestamp);
  }

  getLatestLotteryResult(): LotteryResult | null {
    return this.getAllLotteryResults()[0] ?? null;
  }

  deleteLotteryResult(id: string): boolean { return this.db.prepare('DELETE FROM lottery_results WHERE id = ?').run(id).changes > 0; }
  clearAllLotteryResults(): void { this.db.exec('DELETE FROM lottery_results'); }

  resetAllData(): void {
    transaction(this.db, () => {
      this.db.exec('DELETE FROM programs; DELETE FROM danmakus; DELETE FROM banned_ips; DELETE FROM lottery_results;');
      defaultData.programs.forEach(program => insertProgram(this.db, program));
      this.db.prepare("UPDATE settings SET value = ? WHERE key = 'lottery_config'").run(JSON.stringify(defaultData.lotteryConfig));
    });
  }

  getAllData(): DataStoreState {
    return {
      programs: this.getPrograms(), danmakus: this.db.prepare('SELECT * FROM danmakus ORDER BY seq').all().map(danmakuFromRow),
      bannedIps: this.getBannedIps(), lotteryConfig: this.getLotteryConfig(), lotteryResults: this.getAllLotteryResults().reverse(),
    };
  }
}

export const dataStore = new DataStore();

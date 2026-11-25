const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
const bcrypt = require('bcryptjs');

// 在临时目录编译实际存储与接口代码；测试始终使用独立数据库，不接触项目 data/。
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lveying-sqlite-test-'));
const compiled = path.join(temp, 'compiled');
fs.mkdirSync(compiled);
fs.symlinkSync(path.join(root, 'node_modules'), path.join(compiled, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const files = [
  'lib/defaultData.ts', 'lib/ip.ts', 'lib/database.ts', 'lib/dataStore.ts', 'lib/userManager.ts', 'lib/auth.ts',
  'lib/danmakuPolicy.ts', 'lib/danmakuGuard.ts', 'lib/lotteryStage.ts', 'app/api/admin/banned-ips/route.ts',
  'app/api/admin/danmaku-settings/route.ts',
  'app/api/lottery/draw/route.ts', 'app/api/lottery/history/route.ts', 'app/api/lottery/result/route.ts',
  'app/api/danmaku/route.ts', 'app/api/danmaku/public/route.ts', 'app/api/danmaku/censored/route.ts',
  'app/api/danmaku/export/route.ts',
];
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/(['"])@\/([^'"]+)\1/g, (_, quote, name) => JSON.stringify(path.join(compiled, name)));
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const destination = path.join(compiled, file.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, output);
}
const { getDatabase, transaction } = require(path.join(compiled, 'lib/database.js'));
const { DataStore } = require(path.join(compiled, 'lib/dataStore.js'));
const { UserManager } = require(path.join(compiled, 'lib/userManager.js'));
const { defaultData } = require(path.join(compiled, 'lib/defaultData.js'));
const { submitDanmaku, getDanmakuClientIp, getDanmakuClientId, DANMAKU_CLIENT_COOKIE } = require(path.join(compiled, 'lib/danmakuGuard.js'));
const { getDanmakuSettings, saveDanmakuSettings, reviewDanmaku, getDanmakuGuardStats, validateDanmakuSettings } = require(path.join(compiled, 'lib/danmakuPolicy.js'));
const { canonicalIp } = require(path.join(compiled, 'lib/ip.js'));
const { buildStageView, createRevealOrder, restoreRevealOrder, initialStage } = require(path.join(compiled, 'lib/lotteryStage.js'));

function fixture(legacy) {
  const directory = fs.mkdtempSync(path.join(temp, 'data-'));
  if (legacy) fs.writeFileSync(path.join(directory, 'store.json'), JSON.stringify(legacy));
  process.env.LVEYING_DATA_DIR = directory;
  return directory;
}

after(() => {
  for (const db of globalThis.lveyingDatabases.values()) db.close();
  delete process.env.LVEYING_DATA_DIR;
  fs.rmSync(temp, { recursive: true, force: true });
});

test('导入旧 JSON，保留节目、弹幕、抽奖、封禁、管理员密码；重启不重复导入', async () => {
  const legacy = structuredClone(defaultData);
  legacy.danmakus = [{ id: 'old', content: '旧弹幕', timestamp: 100, censor: true, censoredAt: 200, ip: '::ffff:1.2.3.4' }];
  legacy.bannedIps = ['::ffff:9.8.7.6'];
  delete legacy.lotteryResults;
  legacy.lotteryResult = { id: 'result', title: '特等奖', numbers: [18], timestamp: 300 };
  const directory = fixture(legacy);
  const passwordHash = await bcrypt.hash('existing-password', 4);
  const users = { admin: { username: 'admin', passwordHash, role: 'admin', createdAt: 'old-date', updatedAt: 'old-date' } };
  fs.writeFileSync(path.join(directory, 'users.json'), JSON.stringify(users));
  const store = new DataStore();
  assert.equal(store.getPrograms().length, 5);
  assert.equal(store.getDanmakus().danmakus[0].id, 'old');
  assert.equal(store.getDanmakus().danmakus[0].ip, '1.2.3.4');
  assert.deepEqual(store.getLatestLotteryResult().numbers, [18]);
  assert.equal(store.isIpBanned('9.8.7.6'), true);
  const manager = new UserManager();
  assert.equal(await manager.verifyPassword('admin', 'existing-password'), true);
  assert.equal(await manager.verifyPassword('admin', 'admin123'), false);
  assert.equal(await manager.updatePassword('admin', 'new-password'), true);
  assert.equal(await manager.verifyPassword('admin', 'new-password'), true);
  assert.equal(await manager.createUser('helper', 'helper-password'), true);
  assert.equal(manager.getAllUsers().some(user => 'passwordHash' in user), false);
  assert.equal(manager.deleteUser('helper'), true);
  const db = getDatabase();
  db.close();
  globalThis.lveyingDatabases.delete(path.join(directory, 'lveying.sqlite'));
  assert.equal(new DataStore().getDanmakus().stats.total, 1);
  assert.equal(await manager.verifyPassword('admin', 'new-password'), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'store.json'), 'utf8')), legacy);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'users.json'), 'utf8')), users);
  assert.equal(getDatabase().prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
});

test('损坏的旧数据中止迁移并回滚，修复后可重试', () => {
  const directory = fixture({ ...defaultData, danmakus: [{ id: 'broken', timestamp: 1, censor: false }] });
  const source = fs.readFileSync(path.join(directory, 'store.json'), 'utf8');
  assert.throws(() => getDatabase());
  assert.equal(fs.readFileSync(path.join(directory, 'store.json'), 'utf8'), source);
  const check = new DatabaseSync(path.join(directory, 'lveying.sqlite'));
  assert.equal(check.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'programs'").get().n, 0);
  check.close();
  fs.writeFileSync(path.join(directory, 'store.json'), JSON.stringify(defaultData));
  assert.equal(new DataStore().getPrograms().length, 5);
});

test('分页有稳定排序；晚审核、撤回、封禁、删除立即反映到公开快照且不泄漏 IP', () => {
  const legacy = structuredClone(defaultData);
  legacy.danmakus = Array.from({ length: 125 }, (_, i) => ({ id: `message-${i}`, content: `内容${i}`, timestamp: i, censor: i >= 100, censoredAt: i >= 100 ? i : undefined, ip: i % 2 ? '1.2.3.4' : '5.6.7.8' }));
  const directory = fixture(legacy);
  const store = new DataStore();
  assert.deepEqual(store.getDanmakus().stats, { total: 125, approved: 25, pending: 100, rejected: 0 });
  assert.equal(store.getDanmakus(1).danmakus.length, 50);
  assert.equal(store.getDanmakus(3).danmakus.length, 25);
  assert.equal(store.getDanmakus(1, 50, true).pagination.totalPages, 2);
  assert.equal(store.getDanmakus(999).pagination.page, 3);
  assert.equal(store.getPublicDanmakus().length, 20);
  assert.equal(store.getPublicDanmakus().some(item => 'ip' in item), false);
  assert.equal(store.updateDanmakuCensor('message-0', true), true);
  assert.equal(store.getPublicDanmakus()[0].id, 'message-0');
  const secondDb = new DatabaseSync(path.join(directory, 'lveying.sqlite'));
  const second = new DataStore(secondDb);
  second.updateDanmakuCensor('message-0', false);
  assert.equal(store.getPublicDanmakus().some(item => item.id === 'message-0'), false);
  const ban = store.banIp('::ffff:1.2.3.4');
  assert.equal(ban.success, true);
  assert.equal(ban.affected, 12);
  assert.equal(store.getPublicDanmakus().some(item => Number(item.id.split('-')[1]) % 2), false);
  assert.equal(store.deleteDanmaku('message-124'), true);
  assert.equal(store.getPublicDanmakus().some(item => item.id === 'message-124'), false);
  store.clearDanmakus();
  assert.deepEqual(store.getPublicDanmakus(), []);
  secondDb.close();
});

test('节目和抽奖局部写入不覆盖弹幕；事务失败不清空原节目', () => {
  fixture();
  const store = new DataStore();
  const message = store.addDanmaku('演出精彩', '127.0.0.1');
  const parent = store.addProgram('新节目', 0, [['演员', ['小明']]], '组合');
  const child = store.addProgram('子节目', 0, null, null, parent.id, 1);
  assert.equal(store.getHierarchicalPrograms()[1].id, child.id);
  store.updateProgramDetails(parent.id, '改名', 0, null, '组合');
  store.updateProgramStatus(parent.id, true);
  assert.equal(store.getPrograms()[0].completed, true);
  const result = store.addLotteryResult('一等奖', [1, 2, 3]);
  store.updateLotteryConfig({ count: 3 });
  assert.equal(store.getLotteryConfig().count, 3);
  assert.equal(store.getDanmakus().danmakus[0].id, message.id);
  const before = store.getPrograms();
  assert.throws(() => store.updatePrograms([before[0], before[0]]));
  assert.deepEqual(store.getPrograms(), before);
  store.deleteProgram(parent.id);
  assert.equal(store.getPrograms().some(item => item.id === child.id), false);
  assert.equal(store.deleteLotteryResult(result.id), true);
});

test('十万条历史记录时公开查询命中索引且只返回 20 条；导出分批且有结束边界', t => {
  fixture();
  const db = getDatabase();
  const insert = db.prepare('INSERT INTO danmakus (id, content, timestamp, censor, censored_at) VALUES (?, ?, ?, ?, ?)');
  transaction(db, () => {
    for (let i = 0; i < 100000; i++) insert.run(`bulk-${i}`, '历史弹幕', i, i % 2, i % 2 ? i : null);
  });
  const plan = db.prepare('EXPLAIN QUERY PLAN SELECT id, content FROM danmakus WHERE censor = 1 ORDER BY COALESCE(censored_at, timestamp) DESC, seq DESC LIMIT 20').all();
  assert.match(JSON.stringify(plan), /danmakus_public/);
  assert.doesNotMatch(JSON.stringify(plan), /TEMP B-TREE/);
  const store = new DataStore();
  const start = performance.now();
  for (let i = 0; i < 1000; i++) assert.equal(store.getPublicDanmakus().length, 20);
  t.diagnostic(`十万条历史下 1000 次缓存读取耗时 ${(performance.now() - start).toFixed(1)}ms（本机测试，不代表服务器容量）`);
  const batch = store.exportDanmakus();
  assert.equal(batch.danmakus.length, 1000);
  assert.equal(batch.hasMore, true);
  store.addDanmaku('导出期间的新消息');
  const last = store.exportDanmakus(99000, batch.snapshot);
  assert.equal(last.danmakus.length, 1000);
  assert.equal(last.hasMore, false);
  assert.equal(last.danmakus.some(item => item.content === '导出期间的新消息'), false);
});

test('多个进程并发写入，消息不丢失且 ID 不重复', async () => {
  const directory = fixture();
  getDatabase();
  const code = `const {DataStore}=require(${JSON.stringify(path.join(compiled, 'lib/dataStore.js'))});const store=new DataStore();for(let i=0;i<100;i++)store.addDanmaku('并发消息');`;
  await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', code], { env: { ...process.env, LVEYING_DATA_DIR: directory }, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('exit', status => status === 0 ? resolve() : reject(new Error(error)));
  })));
  const db = getDatabase();
  const counts = db.prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT id) AS uniqueIds FROM danmakus').get();
  assert.equal(counts.total, 400);
  assert.equal(counts.uniqueIds, 400);
});

test('API 分页校验、鉴权、公开脱敏及增删审核流程', async () => {
  fixture();
  const api = require(path.join(compiled, 'app/api/danmaku/route.js'));
  const publicApi = require(path.join(compiled, 'app/api/danmaku/public/route.js'));
  const screenApi = require(path.join(compiled, 'app/api/danmaku/censored/route.js'));
  const exportApi = require(path.join(compiled, 'app/api/danmaku/export/route.js'));
  const { generateToken } = require(path.join(compiled, 'lib/auth.js'));
  const headers = { Authorization: `Bearer ${generateToken({ role: 'admin', username: 'admin' })}`, 'Content-Type': 'application/json' };
  const url = 'http://localhost/api/danmaku';
  assert.equal((await api.GET(new Request(url))).status, 401);
  assert.equal((await exportApi.GET(new Request(url))).status, 401);
  assert.equal((await api.GET(new Request(url + '?pageSize=10000', { headers }))).status, 400);
  assert.equal((await api.GET(new Request(url + '?status=invalid', { headers }))).status, 400);
  const posted = await api.POST(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': '1.2.3.4' }, body: JSON.stringify({ content: '新弹幕' }) }));
  assert.deepEqual(await posted.json(), { success: true });
  const message = new DataStore().getDanmakus().danmakus[0];
  assert.equal(message.censor, false);
  assert.deepEqual((await (await publicApi.GET()).json()).danmakus, []);
  await api.PATCH(new Request(url, { method: 'PATCH', headers, body: JSON.stringify({ id: message.id, censor: true }) }));
  const publicItems = (await (await screenApi.GET()).json()).danmakus;
  assert.equal(publicItems[0].id, message.id);
  assert.equal('ip' in publicItems[0], false);
  assert.equal((await (await api.GET(new Request(url, { headers }))).json()).pagination.total, 1);
  assert.equal((await (await exportApi.GET(new Request(url, { headers }))).json()).danmakus.length, 1);
  assert.equal((await api.PATCH(new Request(url, { method: 'PATCH', headers, body: JSON.stringify({ id: message.id, reviewStatus: 'invalid' }) }))).status, 400);
  assert.equal((await api.PATCH(new Request(url, { method: 'PATCH', headers, body: JSON.stringify({ id: message.id, reviewStatus: 'rejected' }) }))).status, 200);
  assert.deepEqual((await (await screenApi.GET()).json()).danmakus, []);
  const rejected = await (await api.GET(new Request(url + '?status=rejected', { headers }))).json();
  assert.equal(rejected.danmakus[0].review.source, 'manual');
  assert.equal(rejected.stats.pending, 0);
  await api.DELETE(new Request(url, { method: 'DELETE', headers, body: '{}' }));
  assert.deepEqual((await (await screenApi.GET()).json()).danmakus, []);
});

test('在线备份包含 WAL 内最新写入，可恢复数据库', () => {
  const directory = fixture();
  const store = new DataStore();
  const message = store.addDanmaku('备份时尚在 WAL 中的记录');
  const destination = path.join(temp, 'backup.sqlite');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/backup-db.cjs'), destination], { env: { ...process.env, LVEYING_DATA_DIR: directory }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const backup = new DatabaseSync(destination, { readOnly: true });
  assert.equal(backup.prepare('SELECT id FROM danmakus').get().id, message.id);
  assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  backup.close();
});

test('自动审核只完整匹配允许短句，禁用词优先，未知内容和关闭规则时待审', () => {
  fixture();
  const settings = getDanmakuSettings();
  for (const content of ['加油', '加油！！！', '好听！', '学生节快乐~']) {
    assert.equal(reviewDanmaku(content, settings.moderation).status, 'approved', content);
  }
  for (const content of ['加油但是还有其他话', '别加油', '加油\u200b', '加油<script>', '联系我 https://example.com', '演员名字加油', '加油加油']) {
    assert.equal(reviewDanmaku(content, settings.moderation).status, 'pending', content);
  }
  const conflict = { enabled: true, allowPhrases: ['禁用广告', 'safe'], blockTerms: ['禁用', 'SPAM'] };
  for (const content of ['禁用广告', '欢迎 s.p.a.m', 'ＳＰＡＭ', 's\u200bp a m']) {
    assert.equal(reviewDanmaku(content, conflict).status, 'rejected', content);
  }
  assert.equal(reviewDanmaku('加油', { ...settings.moderation, enabled: false }).status, 'pending');
});

test('自动通过、拦截和待审独立统计；原因仅后台返回；人工可以覆盖与撤回', () => {
  fixture();
  const store = new DataStore();
  const settings = getDanmakuSettings();
  const now = Date.now();
  const approved = submitDanmaku('加油！', '1.2.3.4', 'browser-a', settings, now).danmaku;
  const pending = submitDanmaku('新节目真精彩', '1.2.3.4', 'browser-b', settings, now).danmaku;
  const rejected = submitDanmaku('傻逼', '1.2.3.4', 'browser-c', settings, now).danmaku;
  assert.deepEqual(store.getDanmakus().stats, { total: 3, approved: 1, pending: 1, rejected: 1 });
  assert.equal(store.getDanmakus(1, 50, 'pending').danmakus[0].id, pending.id);
  assert.equal(store.getDanmakus(1, 50, 'rejected').danmakus[0].review.source, 'auto');
  assert.match(store.getDanmakus(1, 50, 'rejected').danmakus[0].review.reason, /命中/);
  assert.deepEqual(store.getPublicDanmakus().map(d => d.id), [approved.id]);
  assert.equal(store.getPublicDanmakus().some(d => 'review' in d || 'ip' in d), false);
  assert.equal(store.exportDanmakus(0, undefined, 'rejected').danmakus[0].id, rejected.id);
  store.updateDanmakuReview(rejected.id, 'approved');
  assert.equal(store.getPublicDanmakus().some(d => d.id === rejected.id), true);
  assert.equal(store.getDanmakus(1, 50, 'approved').danmakus.find(d => d.id === rejected.id).review.source, 'manual');
  store.updateDanmakuReview(approved.id, 'rejected');
  assert.equal(store.getPublicDanmakus().some(d => d.id === approved.id), false);
  store.updateDanmakuReview(rejected.id, 'pending');
  assert.equal(store.getPublicDanmakus().some(d => d.id === rejected.id), false);
  assert.equal(store.getDanmakus(1, 50, true).stats.pending, 2);
  store.deleteDanmaku(approved.id);
  assert.equal(getDatabase().prepare('SELECT COUNT(*) AS n FROM danmaku_reviews WHERE danmaku_id = ?').get(approved.id).n, 0);
});

test('同一浏览器间隔 5 秒、滚动一分钟最多 10 条；清空弹幕不重置限流', () => {
  fixture();
  const settings = getDanmakuSettings();
  const now = Date.now();
  assert.equal(submitDanmaku('第一条', '1.2.3.4', 'client', settings, now).ok, true);
  const early = submitDanmaku('过快', '1.2.3.4', 'client', settings, now + 4999);
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'rate_limit');
  assert.equal(early.retryAfter, 1);
  for (let i = 1; i < 10; i++) assert.equal(submitDanmaku(`第${i}条`, '1.2.3.4', 'client', settings, now + 5000 * i).ok, true);
  assert.equal(submitDanmaku('第十一条', '1.2.3.4', 'client', settings, now + 50000).ok, false);
  new DataStore().clearDanmakus();
  assert.equal(submitDanmaku('清空后尝试', '1.2.3.4', 'client', settings, now + 59999).ok, false);
  assert.equal(submitDanmaku('窗口过期', '1.2.3.4', 'client', settings, now + 60000).ok, true);
  assert.equal(getDatabase().prepare('SELECT COUNT(*) AS n FROM danmakus').get().n, 1);
});

test('多人共用 IP 可分别发送，换浏览器不能绕过 IP 限制；IPv6 /64 及映射写法归一', () => {
  fixture();
  const settings = getDanmakuSettings();
  settings.rateLimit.ipPerMinute = 2;
  const now = Date.now();
  assert.equal(submitDanmaku('加油', '::ffff:1.2.3.4', 'a', settings, now).ok, true);
  assert.equal(submitDanmaku('加油', '1.2.3.4', 'b', settings, now).ok, true);
  assert.equal(submitDanmaku('加油', '::ffff:102:304', 'c', settings, now).reason, 'rate_limit');
  assert.equal(submitDanmaku('加油', '2001:DB8:ABCD:0001::1', 'v6a', settings, now).ok, true);
  assert.equal(submitDanmaku('加油', '2001:db8:abcd:1::2', 'v6b', settings, now).ok, true);
  assert.equal(submitDanmaku('加油', '2001:db8:abcd:1:ffff::3', 'v6c', settings, now).ok, false);
  assert.equal(submitDanmaku('加油', '2001:db8:abcd:2::1', 'v6d', settings, now).ok, true);
  assert.equal(canonicalIp('[2001:DB8:0:0:0:0:0:1]'), '2001:db8::1');
  for (const invalid of ['1.2.3.4, 5.6.7.8', 'unknown', '1.2.3.4:1234', '[1.2.3.4', '::1%eth0']) assert.equal(canonicalIp(invalid), null);
});

test('同一浏览器重复内容一分钟内过滤；别人的同样加油不受影响；限流记录跨重启保留', () => {
  const directory = fixture();
  const settings = getDanmakuSettings();
  const now = Date.now();
  assert.equal(submitDanmaku('HELLO  world', '1.2.3.4', 'a', settings, now).ok, true);
  assert.equal(submitDanmaku('ｈｅｌｌｏ world', '1.2.3.4', 'a', settings, now + 5000).reason, 'duplicate');
  assert.equal(submitDanmaku('HELLO  world', '1.2.3.4', 'b', settings, now + 5000).ok, true);
  getDatabase().close();
  globalThis.lveyingDatabases.delete(path.join(directory, 'lveying.sqlite'));
  assert.equal(submitDanmaku('hello world', '1.2.3.4', 'a', settings, now + 10000).reason, 'duplicate');
  assert.equal(submitDanmaku('hello world', '1.2.3.4', 'a', settings, now + 60000).ok, true);
});

test('服务端事务失败时限流计数、弹幕和审核记录一起回滚', () => {
  fixture();
  const db = getDatabase();
  db.exec("CREATE TRIGGER fail_review BEFORE INSERT ON danmaku_reviews BEGIN SELECT RAISE(ABORT, 'review failure'); END;");
  assert.throws(() => submitDanmaku('加油', '1.2.3.4', 'same-client'), /review failure/);
  for (const table of ['danmakus', 'danmaku_reviews', 'danmaku_rate_events']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  }
  db.exec('DROP TRIGGER fail_review');
  assert.equal(submitDanmaku('加油', '1.2.3.4', 'same-client').ok, true);
});

test('有效提交统一成功，不泄漏限流或审核结果；拦截计数只有管理员可见', async () => {
  fixture();
  const api = require(path.join(compiled, 'app/api/danmaku/route.js'));
  const url = 'https://festival.example/api/danmaku';
  let cookie = '';
  const post = async (content, extra = {}) => api.POST(new Request(url, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': '1.2.3.4', ...(cookie ? { Cookie: cookie } : {}), ...extra },
    body: JSON.stringify({ content }) }));
  const first = await post('加油！');
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { success: true });
  const setCookie = first.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=lax/i);
  cookie = setCookie.split(';')[0];
  const second = await post('其他内容');
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { success: true });
  assert.equal(second.headers.get('retry-after'), null);
  const third = await post('加油！');
  assert.deepEqual(await third.json(), { success: true });
  new DataStore().banIp('::ffff:102:304');
  const banned = await post('封禁后提交');
  assert.deepEqual(await banned.json(), { success: true });
  assert.deepEqual(getDanmakuGuardStats(), { day: getDanmakuGuardStats().day, rateLimited: 1, duplicates: 1, banned: 1 });
  assert.deepEqual(new DataStore().getPublicDanmakus(), []);
  assert.equal(new DataStore().getDanmakus().stats.rejected, 1);
  assert.equal(new DataStore().getDanmakus().stats.total, 1);
});

test('入口 IP 校验忽略伪造 X-Forwarded-For，生产环境缺失真实 IP 时拒绝提交', async t => {
  fixture();
  const original = process.env.NODE_ENV;
  t.after(() => { if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original; });
  process.env.NODE_ENV = 'production';
  const url = 'https://festival.example/api/danmaku';
  assert.equal(getDanmakuClientIp(new Request(url, { headers: { 'X-Forwarded-For': '8.8.8.8' } })), null);
  assert.equal(getDanmakuClientIp(new Request(url, { headers: { 'X-Real-IP': '1.2.3.4', 'X-Forwarded-For': '8.8.8.8' } })), '1.2.3.4');
  const api = require(path.join(compiled, 'app/api/danmaku/route.js'));
  for (const headers of [{}, { 'X-Real-IP': '1.2.3.4, 8.8.8.8' }]) {
    const result = await api.POST(new Request(url, { method: 'POST', headers, body: JSON.stringify({ content: '加油' }) }));
    assert.equal(result.status, 503);
  }
  assert.equal(new DataStore().getDanmakus().stats.total, 0);
  process.env.NODE_ENV = 'development';
  assert.equal(getDanmakuClientIp(new Request(url)), '127.0.0.1');
  const client = getDanmakuClientId(new Request(url));
  assert.match(client, /^[\da-f-]{36}$/);
  assert.equal(getDanmakuClientId(new Request(url, { headers: { cookie: `test=a; ${DANMAKU_CLIENT_COOKIE}=${client}` } })), client);
  assert.notEqual(getDanmakuClientId(new Request(url, { headers: { cookie: `${DANMAKU_CLIENT_COOKIE}=fake` } })), 'fake');
});

test('弹幕接口检查 JSON 和实际请求体大小，超大流式请求不写入数据库', async () => {
  fixture();
  const api = require(path.join(compiled, 'app/api/danmaku/route.js'));
  const url = 'http://localhost/api/danmaku';
  for (const body of ['{', 'null', '[]', JSON.stringify({ content: 12 }), JSON.stringify({ content: '  ' }), JSON.stringify({ content: '字'.repeat(41) })]) {
    const response = await api.POST(new Request(url, { method: 'POST', headers: { 'X-Real-IP': '1.2.3.4' }, body }));
    assert.equal(response.status, 400, body);
  }
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(4097))); controller.close(); } });
  const response = await api.POST(new Request(url, { method: 'POST', headers: { 'X-Real-IP': '1.2.3.4', 'Content-Length': '1' }, body: stream, duplex: 'half' }));
  assert.equal(response.status, 413);
  assert.equal(new DataStore().getDanmakus().stats.total, 0);
});

test('后台规则接口鉴权、校验、试审不发布；保存即时生效，旧审核状态保留', async () => {
  fixture();
  const api = require(path.join(compiled, 'app/api/admin/danmaku-settings/route.js'));
  const { generateToken } = require(path.join(compiled, 'lib/auth.js'));
  const url = 'http://localhost/api/admin/danmaku-settings';
  for (const method of ['GET', 'PUT', 'POST']) assert.equal((await api[method](new Request(url, { method }))).status, 401);
  const guest = { Authorization: `Bearer ${generateToken({ role: 'guest' })}` };
  assert.equal((await api.GET(new Request(url, { headers: guest }))).status, 401);
  const headers = { Authorization: `Bearer ${generateToken({ role: 'admin' })}`, 'Content-Type': 'application/json' };
  const settings = (await (await api.GET(new Request(url, { headers }))).json()).settings;
  const first = submitDanmaku('尚未允许的短句', '1.2.3.4', 'old-client').danmaku;
  for (const bad of [null, {}, { ...settings, rateLimit: { ...settings.rateLimit, ipPerMinute: 0 } }, { ...settings, moderation: { ...settings.moderation, allowPhrases: ['!!!'] } }]) {
    const response = await api.PUT(new Request(url, { method: 'PUT', headers, body: JSON.stringify(bad) }));
    assert.equal(response.status, 400);
  }
  settings.moderation.allowPhrases = ['尚未允许的短句'];
  settings.rateLimit.ipPerMinute = 800;
  assert.equal((await api.POST(new Request(url, { method: 'POST', headers, body: 'null' }))).status, 400);
  const preview = await api.POST(new Request(url, { method: 'POST', headers, body: JSON.stringify({ content: '尚未允许的短句', settings }) }));
  assert.equal((await preview.json()).review.status, 'approved');
  assert.equal(new DataStore().getDanmakus().stats.total, 1);
  assert.equal(getDanmakuSettings().rateLimit.ipPerMinute, 300);
  assert.equal((await api.PUT(new Request(url, { method: 'PUT', headers, body: JSON.stringify(settings) }))).status, 200);
  assert.equal(getDanmakuSettings().rateLimit.ipPerMinute, 800);
  const next = submitDanmaku('尚未允许的短句', '1.2.3.4', 'new-client').danmaku;
  assert.equal(next.censor, true);
  assert.equal(new DataStore().getDanmakus(1, 50, 'pending').danmakus[0].id, first.id);
  assert.equal(new DataStore().getPublicDanmakus()[0].id, next.id);
  settings.moderation.enabled = false;
  settings.rateLimit.enabled = false;
  saveDanmakuSettings(settings);
  assert.equal(submitDanmaku('尚未允许的短句', '1.2.3.4', 'new-client').danmaku.censor, false);
  assert.equal(submitDanmaku('尚未允许的短句', '1.2.3.4', 'new-client').ok, true);
  assert.throws(() => validateDanmakuSettings({ ...settings, moderation: { ...settings.moderation, blockTerms: ['.'] } }));
});

test('多个进程同时提交时 IP 配额不可超卖，自动审核与限流统计保持一致', async () => {
  const directory = fixture();
  const settings = getDanmakuSettings();
  settings.rateLimit.ipPerMinute = 7;
  saveDanmakuSettings(settings);
  const code = `const {submitDanmaku}=require(${JSON.stringify(path.join(compiled, 'lib/danmakuGuard.js'))});const {randomUUID}=require('node:crypto');for(let i=0;i<20;i++)submitDanmaku('加油','1.2.3.4',randomUUID());`;
  await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', code], { env: { ...process.env, LVEYING_DATA_DIR: directory }, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('exit', status => status === 0 ? resolve() : reject(new Error(error)));
  })));
  assert.equal(new DataStore().getDanmakus().stats.total, 7);
  assert.equal(new DataStore().getPublicDanmakus().length, 7);
  assert.equal(getDatabase().prepare('SELECT COUNT(*) AS n FROM danmaku_rate_events').get().n, 7);
  assert.equal(getDanmakuGuardStats().rateLimited, 73);
});

test('已迁移的 SQLite 自动补充审核和限流表，不重新导入 JSON 或修改已有结果', () => {
  const directory = fixture();
  const store = new DataStore();
  const old = store.addDanmaku('历史弹幕');
  store.updateDanmakuCensor(old.id, true);
  const db = getDatabase();
  db.exec('DROP TABLE danmaku_reviews; DROP TABLE danmaku_rate_events; DROP TABLE danmaku_guard_counters;');
  db.close();
  globalThis.lveyingDatabases.delete(path.join(directory, 'lveying.sqlite'));
  const upgraded = getDatabase();
  assert.equal(store.getPublicDanmakus()[0].id, old.id);
  assert.equal(upgraded.prepare('SELECT COUNT(*) AS n FROM danmaku_reviews').get().n, 0);
  assert.equal(submitDanmaku('加油', '1.2.3.4', 'after-upgrade').ok, true);
  assert.equal(store.getDanmakus().stats.approved, 2);
});

test('服务端抽奖排除历史号码、跨批次去重、请求幂等，并且揭晓前不公开', () => {
  const legacy = structuredClone(defaultData);
  legacy.lotteryResults = [{ id: 'legacy', title: '旧奖', numbers: [2, 4], timestamp: 10 }];
  fixture(legacy);
  const store = new DataStore();
  const config = { minNumber: 1, maxNumber: 8, count: 4, title: '自定义奖项' };
  const first = store.drawLottery('first', config);
  assert.equal(new Set(first.numbers).size, 4);
  assert.ok(first.numbers.every(n => n >= 1 && n <= 8 && n !== 2 && n !== 4));
  assert.deepEqual(store.drawLottery('first', config), first);
  assert.throws(() => store.drawLottery('first', { ...config, maxNumber: 9 }), /冲突/);
  assert.equal(store.getAllLotteryResults().length, 1);
  assert.equal(store.getLatestLotteryResult().id, 'legacy');
  assert.equal(store.getUnpublishedLotteryResult().id, 'first');
  assert.throws(() => store.drawLottery('other', config), /未揭晓/);
  assert.equal(store.revealLotteryResult('first'), true);
  assert.equal(store.revealLotteryResult('first'), true);
  assert.equal(store.getAllLotteryResults()[0].id, 'first');
  const second = store.drawLottery('second', { ...config, count: 2 });
  assert.equal(new Set([2, 4, ...first.numbers, ...second.numbers]).size, 8);
  store.revealLotteryResult('second');
  assert.throws(() => store.drawLottery('third', { ...config, count: 1 }), /不足/);
  assert.equal(store.getAllLotteryResults().length, 3);
  assert.throws(() => store.drawLottery('bad', { ...config, count: -1 }), /有效/);
});

test('抽奖 API 鉴权，禁止客户端直接提交号码，结果在揭晓后公开', async () => {
  fixture();
  const api = require(path.join(compiled, 'app/api/lottery/draw/route.js'));
  const history = require(path.join(compiled, 'app/api/lottery/history/route.js'));
  const resultApi = require(path.join(compiled, 'app/api/lottery/result/route.js'));
  const { generateToken } = require(path.join(compiled, 'lib/auth.js'));
  const url = 'http://localhost/api/lottery/draw';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${generateToken({ username: 'admin', role: 'admin' })}` };
  const body = JSON.stringify({ id: require('node:crypto').randomUUID(), config: { minNumber: 1, maxNumber: 3, count: 2, title: '测试奖' } });
  assert.equal((await api.POST(new Request(url, { method: 'POST', body }))).status, 401);
  assert.equal((await resultApi.POST(new Request(url, { method: 'POST', headers, body: JSON.stringify({ title: '伪造', numbers: [1] }) }))).status, 405);
  const drawn = await (await api.POST(new Request(url, { method: 'POST', headers, body }))).json();
  assert.equal((await (await history.GET(new Request('http://localhost/api/lottery/history'))).json()).history.length, 0);
  assert.equal((await (await api.GET(new Request(url, { headers }))).json()).result.id, drawn.result.id);
  assert.equal((await api.PUT(new Request(url, { method: 'PUT', headers, body: JSON.stringify({ id: drawn.result.id }) }))).status, 200);
  assert.deepEqual((await (await history.GET(new Request('http://localhost/api/lottery/history'))).json()).history[0].numbers, drawn.result.numbers);
});

test('多个进程同时抽奖时只能有一个未揭晓批次，号码不会被重复分配', async () => {
  const directory = fixture();
  new DataStore().getLotteryConfig();
  const code = `const {DataStore}=require(${JSON.stringify(path.join(compiled, 'lib/dataStore.js'))});const {randomUUID}=require('node:crypto');try{new DataStore().drawLottery(randomUUID(),{minNumber:1,maxNumber:10,count:5,title:'并发'})}catch(e){process.exitCode=e.message.includes('未揭晓')?7:8}`;
  const statuses = await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', code], { env: { ...process.env, LVEYING_DATA_DIR: directory }, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', resolve);
  })));
  assert.equal(statuses.filter(x => x === 0).length, 1, JSON.stringify(statuses));
  assert.equal(statuses.filter(x => x === 7).length, 3);
  assert.equal(new DataStore().getUnpublishedLotteryResult().numbers.length, 5);
});


test('逐个揭晓进度持久化、单调递增，作废记录保留且不再参与抽取', () => {
  fixture();
  const store = new DataStore();
  const config = { minNumber: 1, maxNumber: 4, count: 2, title: '测试奖' };
  const batch = store.drawLottery('batch', config);
  assert.deepEqual(store.getAllLotteryResults(), []);
  assert.throws(() => store.invalidateLotteryResult('batch', '核验失败'), /单人/);
  store.revealLotteryResult('batch', 1);
  assert.deepEqual(new DataStore().getAllLotteryResults()[0].numbers, batch.numbers.slice(0, 1));
  store.revealLotteryResult('batch', 0);
  assert.equal(new DataStore().getUnpublishedLotteryResult().revealedCount, 1);
  store.revealLotteryResult('batch', 2);
  assert.equal(store.getUnpublishedLotteryResult(), null);
  const single = store.drawLottery('single', { ...config, count: 1 });
  assert.throws(() => store.invalidateLotteryResult('single', '核验失败'), /揭晓/);
  store.revealLotteryResult('single', 1);
  store.invalidateLotteryResult('single', '核验失败');
  store.invalidateLotteryResult('single', '核验失败');
  assert.equal(store.getAllLotteryResults().some(r => r.id === 'single'), false);
  assert.equal(store.getAllLotteryResults(true).find(r => r.id === 'single').invalidReason, '核验失败');
  const retry = store.drawLottery('retry', { ...config, count: 1 });
  assert.equal(new Set([...batch.numbers, ...single.numbers, ...retry.numbers]).size, 4);
});

test('四档现场开奖一次提交即公开，两个导播台和刷新均读取同一批结果', () => {
  fixture();
  const store = new DataStore();
  const config = { minNumber: 0, maxNumber: 43, count: 30, title: '三等奖' };
  store.updateLotteryConfig({ awardCounts: { third: 30, second: 10, first: 3, grand: 1 } });
  assert.equal(new DataStore().getLotteryConfig().awardCounts.third, 30);
  assert.throws(() => store.updateLotteryConfig({ awardCounts: { grand: 0 } }), /名额/);
  const first = store.drawLottery('third-director', config, 'third');
  assert.deepEqual(new DataStore().getLatestLotteryResult().numbers, first.numbers);
  assert.deepEqual(store.drawLottery('third-retry', { ...config, count: 1 }, 'third'), first);
  const all = [...first.numbers];
  for (const [key, title, count] of [['second', '二等奖', 10], ['first', '一等奖', 3], ['grand', '特等奖', 1]]) {
    all.push(...store.drawLottery(key, { ...config, title, count }, key).numbers);
  }
  assert.equal(store.getAllLotteryResults().length, 4);
  assert.equal(new Set(all).size, 44);
  assert.deepEqual(new DataStore().getStageAwards().third, first);
  assert.equal(store.getUnpublishedLotteryResult(), null);
  store.invalidateLotteryResult('grand', '核券无效');
  assert.equal(store.getStageAwards().grand, undefined);
  assert.throws(() => store.drawLottery('grand', { ...config, title: '特等奖', count: 1 }, 'grand'), /失效/);
  assert.throws(() => store.drawLottery('new-grand', { ...config, title: '特等奖', count: 1 }, 'grand'), /不足/);
  store.clearAllLotteryResults();
  assert.deepEqual(store.getStageAwards(), {});
});

test('随机揭晓位置不重复，部分揭晓、刷新和全部揭晓均保持已有位置', () => {
  const random = Math.random;
  let order;
  try {
    Math.random = () => 0;
    order = createRevealOrder(5);
  } finally { Math.random = random; }
  assert.deepEqual(order, [1, 2, 3, 4, 0]);
  assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
  assert.deepEqual(createRevealOrder(1), [0]);
  const config = { minNumber: 1, maxNumber: 2000, count: 5, title: '测试奖' };
  const result = { id: 'random-slots', title: config.title, numbers: [301, 302, 303, 304, 305], timestamp: 1 };
  let state = { ...initialStage, scene: 2, result, revealed: 1, revealOrder: order };
  const first = buildStageView(state, config, null);
  assert.deepEqual(first.slots, [null, 301, null, null, null]);
  assert.deepEqual(buildStageView(JSON.parse(JSON.stringify(state)), config, null), first);
  for (let revealed = 2; revealed <= result.numbers.length; revealed++) {
    const before = buildStageView(state, config, null).slots;
    state = { ...state, revealed };
    const after = buildStageView(state, config, null).slots;
    assert.equal(after.filter(n => n !== null).length, revealed);
    before.forEach((n, i) => { if (n !== null) assert.equal(after[i], n); });
  }
  assert.deepEqual(buildStageView(state, config, null).slots, [305, 301, 302, 303, 304]);
  assert.deepEqual(result.numbers, [301, 302, 303, 304, 305]);
});

test('纯净大屏快照在滚动、加密、等待揭晓时不包含隐藏中奖号码或管理员请求', () => {
  const config = { minNumber: 1, maxNumber: 2000, count: 3, title: '测试奖' };
  const result = { id: 'secret-batch', title: config.title, numbers: [1871, 1872, 1873], timestamp: 1 };
  const state = { ...initialStage, scene: 2, result, revealed: 0, revealOrder: [2, 0, 1], request: { id: result.id, config } };
  for (const view of [
    buildStageView({ ...state, rolling: true }, config, null),
    buildStageView({ ...state, revealed: 3 }, config, 100),
    buildStageView(state, config, null),
  ]) {
    assert.deepEqual(view.slots, [null, null, null]);
    assert.deepEqual(view.heroNumbers, []);
    assert.equal('request' in view, false);
    assert.equal('result' in view, false);
    result.numbers.forEach(n => assert.equal(JSON.stringify(view).includes(String(n)), false));
  }
  const partial = buildStageView({ ...state, revealed: 1 }, config, null);
  assert.deepEqual(partial.slots, [null, null, 1871]);
  assert.equal(JSON.stringify(partial).includes('1872'), false);
  assert.equal(JSON.stringify(partial).includes('1873'), false);
});

test('旧批次保留顺序，台上互动只展示已揭晓号码，编辑无效人数不会使大屏崩溃', () => {
  const config = { minNumber: 1, maxNumber: 2000, count: 3, title: '测试奖' };
  const result = { id: 'legacy', title: config.title, numbers: [71, 72, 73], timestamp: 1 };
  const state = { ...initialStage, scene: 2, result, revealed: 2 };
  assert.deepEqual(buildStageView(state, config, null).slots, [71, 72, null]);
  assert.deepEqual(buildStageView({ ...state, scene: 16 }, config, null).heroNumbers, [71, 72]);
  assert.deepEqual(buildStageView({ ...state, scene: 16 }, config, 100).heroNumbers, []);
  assert.equal(buildStageView({ ...initialStage, scene: 2, drafts: { 2: { title: '编辑中', count: 2.5 } } }, config, null).slots.length, 2);
});

test('旧批次升级只打乱未揭晓位置，恢复新批次时不会重新打乱', () => {
  const random = Math.random;
  let order;
  try {
    Math.random = () => 0;
    order = restoreRevealOrder(5, 2);
  } finally { Math.random = random; }
  assert.deepEqual(order, [0, 1, 3, 4, 2]);
  assert.deepEqual(restoreRevealOrder(5, 3, order), order);
  assert.deepEqual(restoreRevealOrder(5, 5), [0, 1, 2, 3, 4]);
});

test('随机揭晓每一步只公开对应号码，服务端恢复进度后大屏仍保留同一布局', () => {
  const directory = fixture();
  const store = new DataStore();
  const config = { minNumber: 1, maxNumber: 2000, count: 5, title: '测试奖' };
  const result = store.drawLottery('random-recovery', config);
  const state = { ...initialStage, scene: 2, result, revealed: 0, revealOrder: [3, 0, 4, 1, 2] };
  assert.equal(store.getLatestLotteryResult(), null);
  let before = Array(5).fill(null);
  for (let count = 1; count <= result.numbers.length; count++) {
    store.revealLotteryResult(result.id, count);
    const publicNumbers = store.getLatestLotteryResult().numbers;
    assert.deepEqual(publicNumbers, result.numbers.slice(0, count));
    const view = buildStageView({ ...state, revealed: count }, config, null);
    assert.deepEqual(view.slots.filter(n => n !== null).sort((a, b) => a - b), [...publicNumbers].sort((a, b) => a - b));
    before.forEach((n, i) => { if (n !== null) assert.equal(view.slots[i], n); });
    before = view.slots;
    if (count === 2) {
      getDatabase().close();
      globalThis.lveyingDatabases.delete(path.join(directory, 'lveying.sqlite'));
      const recovered = new DataStore().getUnpublishedLotteryResult();
      const restored = JSON.parse(JSON.stringify(state));
      assert.deepEqual(buildStageView({ ...restored, result: recovered, revealed: recovered.revealedCount }, config, null), view);
    }
  }
  assert.equal(store.getUnpublishedLotteryResult(), null);
});

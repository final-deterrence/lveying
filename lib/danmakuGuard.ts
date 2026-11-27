import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { Danmaku, DanmakuSettings } from '../types';
import { getDatabase, insertDanmaku, transaction } from './database';
import { canonicalIp } from './ip';
import { getDanmakuSettings, guardDay, reviewDanmaku } from './danmakuPolicy';

export const DANMAKU_CLIENT_COOKIE = 'lveying_danmaku_client';
export const MAX_DANMAKU_BODY_BYTES = 4096;
const WINDOW_MS = 60_000;

export function getDanmakuClientIp(request: Request): string | null {
  // 只接受由入口 Nginx 覆盖的 X-Real-IP；不信任客户端可追加的 X-Forwarded-For。
  const header = request.headers.get('x-real-ip');
  if (header !== null) return canonicalIp(header);
  return process.env.NODE_ENV === 'production' ? null : '127.0.0.1';
}

function ipRateKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  // IPv6 按 /64 网段汇总，防止仅轮换同一网段的地址绕过 IP 上限。
  const [left, right] = ip.split('::');
  const leading = left ? left.split(':') : [];
  const trailing = right ? right.split(':') : [];
  const groups = right === undefined ? leading : [...leading, ...Array(8 - leading.length - trailing.length).fill('0'), ...trailing];
  return `${groups.slice(0, 4).map(group => group.padStart(4, '0')).join(':')}::/64`;
}

export function getDanmakuClientId(request: Request): string {
  const value = request.headers.get('cookie')?.split(';')
    .map(entry => entry.trim()).find(entry => entry.startsWith(`${DANMAKU_CLIENT_COOKIE}=`))
    ?.slice(DANMAKU_CLIENT_COOKIE.length + 1);
  return value && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)
    ? value.toLowerCase() : randomUUID();
}

type Submission =
  | { ok: true; danmaku: Danmaku }
  | { ok: false; reason: 'banned' }
  | { ok: false; reason: 'rate_limit' | 'duplicate'; retryAfter: number };

export function submitDanmaku(
  content: string, ip: string, clientId: string,
  settings?: DanmakuSettings, now = Date.now(),
): Submission {
  const db = getDatabase();
  const canonical = canonicalIp(ip);
  if (!canonical) throw new Error('无效的弹幕 IP');
  ip = canonical;
  const normalizedContent = content.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const contentHash = createHash('sha256').update(normalizedContent).digest('hex');
  const ipKey = ipRateKey(ip);

  // 限频检查、计数和消息写入在同一事务内，防止多请求/多进程同时通过检查。
  return transaction(db, () => {
    const config = settings ?? getDanmakuSettings();
    const policy = config.rateLimit;
    const cutoff = now - WINDOW_MS;
    const cleanup = db.prepare("SELECT value FROM metadata WHERE key = 'rate_cleanup_at'").get();
    if (!cleanup || now - Number(cleanup.value) >= WINDOW_MS) {
      db.prepare('DELETE FROM danmaku_rate_events WHERE timestamp <= ?').run(cutoff);
      db.prepare('DELETE FROM danmaku_guard_counters WHERE day < ?').run(guardDay(now - 30 * 24 * 60 * 60 * 1000));
      db.prepare("INSERT INTO metadata VALUES ('rate_cleanup_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(now));
    }
    const countBlocked = (reason: 'banned' | 'rate_limit' | 'duplicate') => {
      db.prepare(`INSERT INTO danmaku_guard_counters (day, reason, total) VALUES (?, ?, 1)
        ON CONFLICT(day, reason) DO UPDATE SET total = total + 1`).run(guardDay(now), reason);
    };
    if (db.prepare('SELECT 1 FROM banned_ips WHERE ip = ?').get(ip)) {
      countBlocked('banned');
      return { ok: false, reason: 'banned' };
    }
    if (policy.enabled) {
      const client = db.prepare(`SELECT COUNT(*) AS count, MIN(timestamp) AS oldest, MAX(timestamp) AS latest
        FROM danmaku_rate_events WHERE client_key = ? AND timestamp > ?`).get(clientId, cutoff)!;
      const network = db.prepare(`SELECT COUNT(*) AS count, MIN(timestamp) AS oldest
        FROM danmaku_rate_events WHERE ip_key = ? AND timestamp > ?`).get(ipKey, cutoff)!;
      const duplicate = db.prepare(`SELECT MAX(timestamp) AS latest FROM danmaku_rate_events
        WHERE client_key = ? AND content_hash = ? AND timestamp > ?`).get(clientId, contentHash, cutoff)!;

      let retryAt = now;
      let reason: 'rate_limit' | 'duplicate' = 'rate_limit';
      const deferUntil = (at: number, cause: typeof reason = 'rate_limit') => {
        if (at > retryAt) { retryAt = at; reason = cause; }
      };
      if (client.latest !== null) deferUntil(Number(client.latest) + policy.intervalSeconds * 1000);
      if (Number(client.count) >= policy.clientPerMinute) deferUntil(Number(client.oldest) + WINDOW_MS);
      if (Number(network.count) >= policy.ipPerMinute) deferUntil(Number(network.oldest) + WINDOW_MS);
      if (policy.rejectDuplicates && duplicate.latest !== null) deferUntil(Number(duplicate.latest) + WINDOW_MS, 'duplicate');
      if (retryAt > now) {
        const retryAfter = Math.max(1, Math.ceil((retryAt - now) / 1000));
        countBlocked(reason);
        return { ok: false, reason, retryAfter };
      }

      db.prepare('INSERT INTO danmaku_rate_events (client_key, ip_key, content_hash, timestamp) VALUES (?, ?, ?, ?)')
        .run(clientId, ipKey, contentHash, now);
    }
    const review = reviewDanmaku(content, config.moderation);
    const approved = review.status === 'approved';
    const danmaku: Danmaku = { id: randomUUID(), content, timestamp: now, censor: approved, ip,
      ...(approved ? { censoredAt: now } : {}), review };
    insertDanmaku(db, danmaku);
    db.prepare('INSERT INTO danmaku_reviews (danmaku_id, status, source, reason) VALUES (?, ?, ?, ?)')
      .run(danmaku.id, review.status, review.source, review.reason);
    return { ok: true, danmaku };
  });
}

export class DanmakuBodyError extends Error {
  constructor(public readonly status: 400 | 413, message: string) { super(message); }
}

export async function readDanmakuContent(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new DanmakuBodyError(400, '弹幕内容不能为空');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DANMAKU_BODY_BYTES) {
        await reader.cancel();
        throw new DanmakuBodyError(413, '提交内容过大');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new DanmakuBodyError(400, '请求内容必须是有效 JSON'); }
  const content = parsed && typeof parsed === 'object' && 'content' in parsed ? parsed.content : undefined;
  if (typeof content !== 'string' || !content.trim()) throw new DanmakuBodyError(400, '弹幕内容不能为空');
  if (content.trim().length > 40) throw new DanmakuBodyError(400, '弹幕不能超过40字');
  return content.trim();
}

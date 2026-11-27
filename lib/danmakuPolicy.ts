import type { DanmakuReview, DanmakuSettings } from '../types';
import { getDatabase } from './database';

export class DanmakuSettingsError extends Error {}

export function isDanmakuSubmissionOpen(): boolean {
  return getDatabase().prepare("SELECT value FROM settings WHERE key = 'danmaku_submission_open'").get()?.value === 'true';
}

export function setDanmakuSubmissionOpen(open: boolean): void {
  getDatabase().prepare(`INSERT INTO settings VALUES ('danmaku_submission_open', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(open));
}

function positiveInteger(value: unknown, name: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new DanmakuSettingsError(`${name} 必须是 1 到 ${max} 之间的整数`);
  }
  return value;
}

function envInteger(name: string, fallback: number): number {
  return process.env[name] === undefined ? fallback : Number(process.env[name]);
}

function phraseKey(value: string): string {
  // 白名单只放宽末尾语气标点；不忽略隐藏字符，不匹配子串或自由拼接。
  return value.normalize('NFKC').toLowerCase().trim().replace(/[!?。，,.~]+$/, '').trim();
}

function blockKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(new RegExp('[\\s\\p{P}\\p{Cf}]', 'gu'), '');
}

function wordList(value: unknown, name: string, normalize: (word: string) => string): string[] {
  if (!Array.isArray(value) || value.length > 200 || value.some(word => typeof word !== 'string' || !word.trim() || word.trim().length > 40 || !normalize(word))) {
    throw new DanmakuSettingsError(`${name} 最多 200 行，每行 1–40 字，不能只有标点或空白`);
  }
  return Array.from(new Set(value.map((word: string) => word.trim())));
}

export function validateDanmakuSettings(value: unknown): DanmakuSettings {
  if (!value || typeof value !== 'object') throw new DanmakuSettingsError('配置格式不正确');
  const { rateLimit: rate, moderation } = value as DanmakuSettings;
  if (!rate || !moderation || typeof rate.enabled !== 'boolean' || typeof rate.rejectDuplicates !== 'boolean' || typeof moderation.enabled !== 'boolean') {
    throw new DanmakuSettingsError('开关配置必须为布尔值');
  }
  return {
    rateLimit: {
      enabled: rate.enabled,
      intervalSeconds: positiveInteger(rate.intervalSeconds, '发送间隔（秒）', 60),
      clientPerMinute: positiveInteger(rate.clientPerMinute, '单浏览器每分钟条数', 600),
      ipPerMinute: positiveInteger(rate.ipPerMinute, '单 IP 每分钟条数', 10000),
      rejectDuplicates: rate.rejectDuplicates,
    },
    moderation: {
      enabled: moderation.enabled,
      allowPhrases: wordList(moderation.allowPhrases, '自动通过短句', phraseKey),
      blockTerms: wordList(moderation.blockTerms, '自动拦截词', blockKey),
    },
  };
}

export function getDanmakuSettings(): DanmakuSettings {
  const saved = getDatabase().prepare("SELECT value FROM settings WHERE key = 'danmaku_policy'").get();
  if (saved) return validateDanmakuSettings(JSON.parse(String(saved.value)));
  return validateDanmakuSettings({
    rateLimit: {
      enabled: true,
      intervalSeconds: envInteger('DANMAKU_SEND_INTERVAL_SECONDS', 5),
      clientPerMinute: envInteger('DANMAKU_CLIENT_PER_MINUTE', 10),
      ipPerMinute: envInteger('DANMAKU_IP_PER_MINUTE', 300),
      rejectDuplicates: true,
    },
    moderation: {
      enabled: true,
      allowPhrases: ['加油', '太棒了', '好听', '好看', '学生节快乐', '演出顺利', '辛苦了'],
      blockTerms: ['傻逼', '操你妈'],
    },
  });
}

export function saveDanmakuSettings(value: unknown): DanmakuSettings {
  const settings = validateDanmakuSettings(value);
  getDatabase().prepare("INSERT INTO settings VALUES ('danmaku_policy', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(settings));
  return settings;
}

export function reviewDanmaku(content: string, settings: DanmakuSettings['moderation']): DanmakuReview {
  if (!settings.enabled) return { status: 'pending', source: 'auto', reason: '自动审核已关闭，等待人工审核' };
  const normalized = blockKey(content);
  const blocked = settings.blockTerms.find(term => normalized.includes(blockKey(term)));
  if (blocked) return { status: 'rejected', source: 'auto', reason: `命中拦截词：${blocked}` };
  const phrase = phraseKey(content);
  const allowed = settings.allowPhrases.find(term => phrase === phraseKey(term));
  if (allowed) return { status: 'approved', source: 'auto', reason: `完整匹配通过短句：${allowed}` };
  return { status: 'pending', source: 'auto', reason: '未命中明确规则，等待人工审核' };
}

export function guardDay(now = Date.now()): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function getDanmakuGuardStats() {
  const day = guardDay();
  const rows = getDatabase().prepare('SELECT reason, total FROM danmaku_guard_counters WHERE day = ?').all(day);
  const counts = Object.fromEntries(rows.map(row => [String(row.reason), Number(row.total)]));
  return { day, rateLimited: counts.rate_limit ?? 0, duplicates: counts.duplicate ?? 0, banned: counts.banned ?? 0 };
}

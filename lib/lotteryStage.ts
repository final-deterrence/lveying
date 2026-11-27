import type { LotteryConfig, LotteryResult, StageAward } from '../types';
import { formatTicket } from '../public/wujiandao/tickets.mjs';

export const awards = {
  third: { title: '三等奖', count: 30, scene: 2 },
  second: { title: '二等奖', count: 10, scene: 6 },
  first: { title: '一等奖', count: 3, scene: 10 },
  grand: { title: '特等奖', count: 1, scene: 15 },
} as const;
export const awardKeys = Object.keys(awards) as StageAward[];

type Scene = { label: string; film: string; award: StageAward; draw?: { title: string; count: number } };
// Keep the original scene indices so an existing operator session can resume its batch.
export const scenes: Scene[] = [
  { label: '截获密电', film: 'incoming', award: 'third' },
  { label: '密电终端', film: 'brief-3', award: 'third' },
  { label: '三等奖', film: 'roll-3', award: 'third', draw: awards.third },
  { label: '第二层加密（旧场次）', film: 'brief-3', award: 'third' },
  { label: '三等奖第二批（旧场次）', film: 'roll-3', award: 'third', draw: { title: '三等奖', count: 15 } },
  { label: '机密档案', film: 'archive', award: 'second' },
  { label: '二等奖', film: 'roll-2', award: 'second', draw: awards.second },
  { label: '第一场结束', film: 'interval', award: 'second' },
  { label: '接听来电', film: 'ring', award: 'first' },
  { label: '秘密接头', film: 'call', award: 'first' },
  { label: '一等奖', film: 'roll-1', award: 'first', draw: awards.first },
  { label: '通话中断', film: 'break', award: 'first' },
  { label: '天台见面', film: 'roof', award: 'grand' },
  { label: '天台来客（旧场次）', film: 'roof', award: 'grand' },
  { label: '对峙（旧场次）', film: 'roof', award: 'grand' },
  { label: '特等奖', film: 'roll-0', award: 'grand', draw: awards.grand },
  { label: '现场核验', film: 'done-0', award: 'grand' },
  { label: '行动结束', film: 'end', award: 'grand' },
];
export const program = [0, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17];
export const chapterStarts = [0, 5, 8, 11] as const;
export function chapterStart(scene: number): number {
  return chapterStarts.reduce<number>((start, next) => next <= scene ? next : start, 0);
}

export type DrawRequest = { id: string; config: LotteryConfig; award?: StageAward };
export type Completed = { request: DrawRequest; result: LotteryResult; revealed: number; revealOrder?: number[] };
export type StageState = {
  completed: Record<string, Completed>;
  cueStartedAt?: number;
  usedNumbers?: number[];
  scene: number;
  rolling: boolean;
  request: DrawRequest | null;
  result: LotteryResult | null;
  revealed: number;
  revealOrder?: number[];
  replacementSeat?: number;
  drafts: Record<string, { title: string; count: number }>;
};
export const initialStage: StageState = { completed: {}, scene: 0, rolling: false, request: null, result: null, revealed: 0, drafts: {} };
export const STAGE_STATE_KEY = 'wujian-lottery-stage-v1';
export const STAGE_VIEW_KEY = 'wujian-lottery-screen-v1';
export const STAGE_CHANNEL = 'wujian-lottery-screen-v1';
export const formatNumber = formatTicket;
export const isSteppedAward = (award: StageAward, count: number): boolean =>
  award === 'first' && count >= 2 && count <= 6;

// 只打乱展示位置，不改变服务器中奖记录和公开结果的顺序。
export function createRevealOrder(count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function isRevealOrder(order: number[] | undefined, count: number): order is number[] {
  return order?.length === count && new Set(order).size === count
    && order.every(i => Number.isSafeInteger(i) && i >= 0 && i < count);
}

export function restoreRevealOrder(count: number, revealed: number, order?: number[]): number[] {
  if (isRevealOrder(order, count)) return order;
  // 兼容升级前的批次：保留已显示的位置，只打乱剩余空位。
  const known = Math.max(0, Math.min(count, revealed));
  return Array.from({ length: known }, (_, i) => i)
    .concat(createRevealOrder(count - known).map(i => i + known));
}

export type StageView = {
  film: string;
  award: StageAward;
  cueStartedAt: number;
  counts: Record<StageAward, number>;
  excluded: number[];
  scene: number;
  batchId: string | null;
  title: string;
  phase: 'standby' | 'rolling' | 'masking' | 'revealing' | 'complete';
  slots: (number | null)[];
  activeSlot?: number;
  replacementSlot?: number;
  heroNumbers: number[];
  minNumber: number;
  maxNumber: number;
  maskingStartedAt: number | null;
};

// 发送给投影窗口的快照仅包含已经揭晓的号码，不携带 request 或完整 result。
export function buildStageView(state: StageState, config: LotteryConfig, maskingStartedAt: number | null): StageView {
  const scene = scenes[state.scene] || scenes[0];
  const counts = Object.fromEntries(awardKeys.map(key => {
    const saved = state.drafts[String(awards[key].scene)];
    const n = saved?.count ?? config.awardCounts?.[key] ?? awards[key].count;
    return [key, Math.max(1, Math.min(100, Math.floor(n) || 1))];
  })) as Record<StageAward, number>;
  const draft = state.drafts[String(state.scene)] || (scene.draw && { ...scene.draw, count: counts[scene.award] });
  const verifyTickets = scene.film === 'done-0';
  const count = scene.draw || verifyTickets ? state.result?.numbers.length ?? Math.max(0, Math.min(100, Math.floor(draft?.count || 0))) : 0;
  const slots: (number | null)[] = Array(count).fill(null);
  const order = state.revealOrder;
  const validOrder = isRevealOrder(order, count);
  const stepped = Boolean(scene.draw && isSteppedAward(scene.award, count));
  const partial = Boolean(state.result && state.revealed < count);
  const stepRolling = Boolean(stepped && state.rolling && (!state.result || partial));
  const activeSlot = stepRolling ? (state.result ? state.revealed : 0) : undefined;
  const pendingTicket = scene.award === 'grand' && scene.draw ? state.result?.pendingTicket : undefined;
  const pendingIndex = pendingTicket === undefined ? -1 : state.result!.numbers.indexOf(pendingTicket);
  const replacementSlot = pendingIndex >= 0 ? (validOrder ? order![pendingIndex] : pendingIndex)
    : scene.draw && scene.award === 'grand' && !state.rolling ? state.replacementSeat : undefined;
  if (state.result && maskingStartedAt === null && (!state.rolling || pendingIndex >= 0 || (stepped && partial))) {
    for (let i = 0; i < Math.min(state.revealed, count); i++) {
      if (i === pendingIndex) continue;
      // 旧批次没有位置表时保持原布局，避免升级后已揭晓号码跳动。
      slots[validOrder ? order![i] : i] = state.result.numbers[i];
    }
  }
  const hidden = state.result && partial ? new Set(state.result.numbers.slice(state.revealed)) : null;
  const rawExcluded = state.rolling && pendingIndex < 0 && !partial && state.result && state.revealed === state.result.numbers.length
    ? (state.usedNumbers ?? []).filter(n => !state.result!.numbers.includes(n)) : state.usedNumbers ?? [];
  const excluded = hidden ? rawExcluded.filter(n => !hidden.has(n)) : rawExcluded;
  return {
    film: scene.film, award: scene.award, cueStartedAt: state.cueStartedAt ?? 0,
    counts: { ...counts, ...(count ? { [scene.award]: count } : {}) },
    excluded,
    scene: state.scene, batchId: state.result?.id ?? null, title: draft?.title ?? '', slots: scene.draw ? slots : [],
    ...(maskingStartedAt === null && activeSlot !== undefined ? { activeSlot } : {}),
    ...(maskingStartedAt === null && replacementSlot !== undefined ? { replacementSlot } : {}),
    phase: maskingStartedAt !== null ? 'masking' : state.rolling ? 'rolling'
      : state.result ? (state.revealed >= state.result.numbers.length ? 'complete' : 'revealing') : 'standby',
    heroNumbers: verifyTickets ? slots.filter((n): n is number => n !== null) : [],
    minNumber: config.minNumber, maxNumber: config.maxNumber, maskingStartedAt,
  };
}

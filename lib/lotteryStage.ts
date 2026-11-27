import type { LotteryConfig, LotteryResult } from '../types';

type Scene = { label: string; code: string; heading: string; text: string; cue: string; tone?: 'red' | 'blue'; draw?: { title: string; count: number } };
export const scenes: Scene[] = [
  { label: '情报进入', code: 'INCOMING TRANSMISSION', heading: '检测到未知加密信号', text: '信号来源：无间道现场\n保密等级：TOP SECRET', cue: '第一轮开场 · 主持人 E、F 引入' },
  { label: '三等奖介绍', code: 'MISSION 01 / 初级情报', heading: '破译三等奖幸运名单', text: '加密档案已截获\n等待解密授权', cue: '介绍三等奖及奖品；三等奖分两批揭晓' },
  { label: '三等奖 · 第一批', code: 'DECRYPTION / 第一层加密', heading: '三等奖 · 第一批', text: '情报准备就绪', cue: '开始滚动 → 主持人倒数 → 确认抽取 → 逐个揭晓', draw: { title: '三等奖', count: 15 } },
  { label: '第二层加密', code: 'WARNING / 第二层加密', heading: '检测到第二层加密', text: '剩余目标等待破译\n是否继续？ > YES', cue: '主持人 F 引出第二批' },
  { label: '三等奖 · 第二批', code: 'DECRYPTION / 第二层加密', heading: '三等奖 · 第二批', text: '继续破译', cue: '开始滚动 → 倒数 → 确认抽取 → 逐个揭晓', draw: { title: '三等奖', count: 15 } },
  { label: '二等奖介绍', code: 'ACCESS DENIED', heading: '检测到高级加密档案', text: '权限等级：CONFIDENTIAL\n等待授权', cue: '介绍二等奖及奖品', tone: 'red' },
  { label: '二等奖', code: 'MISSION 02 / 高级机密', heading: '二等奖幸运名单', text: '加密等级：★★★★★', cue: '开始滚动 → 倒数 → 确认抽取 → 逐个揭晓', tone: 'red', draw: { title: '二等奖', count: 10 } },
  { label: '第一轮结束', code: 'TO BE CONTINUED', heading: '第一阶段任务完成', text: '三等奖 / 二等奖已揭晓\n一等奖 / 特等奖尚未解密', cue: '提醒观众携带奖券登记领奖；转入节目' },
  { label: '神秘来电', code: 'INCOMING CALL', heading: '未知号码来电', text: '☎\n[ 拒绝 ]    [ 接听 ]', cue: '模拟铃声；主持人 A、B 对话后切换通话' },
  { label: '通话中', code: 'CALL CONNECTED', heading: '通话中', text: '“接头时间到了。”\n“你要找的三个人，已经混进了现场。”', cue: '预录声音占位；介绍一等奖并邀请老师上台' },
  { label: '一等奖', code: 'CONTACTS / 秘密接头', heading: '正在识别接头人员', text: '行动目标：秘密接头人', cue: '老师触发确认抽取；逐个揭晓接头人', draw: { title: '一等奖', count: 3 } },
  { label: '电话反转', code: 'WARNING / 另一条秘密通信', heading: '还有最后一个人', text: '“想知道他是谁……去天台。”\nCALL ENDED', cue: '电话挂断，转入天台', tone: 'blue' },
  { label: '天台', code: 'FINAL MISSION / 天台', heading: '我们之间，有一个卧底。', text: '身份 A：UNKNOWN　　　　身份 B：UNKNOWN', cue: '天台转场占位；风声、警笛及画面待接入', tone: 'blue' },
  { label: '特等奖介绍', code: 'TOP SECRET / 最终行动', heading: '最终身份即将揭晓', text: '特等奖奖品展示\n（奖品与图片待确定）', cue: '介绍特等奖奖品，随后返回最终对峙', tone: 'blue' },
  { label: '天台对峙', code: 'FINAL TARGET', heading: '身份核验中', text: '人物 A：“我等这一天，已经很久了。”\n人物 B：“你到底是谁？”', cue: '对白占位；邀请老师再次抽奖', tone: 'blue' },
  { label: '特等奖', code: 'IDENTITY / 最终身份', heading: '特等奖幸运号码', text: '等待最终身份确认', cue: '开始滚动 → 老师触发抽取 → 揭晓；核券失败时可作废并重抽', tone: 'blue', draw: { title: '特等奖', count: 1 } },
  { label: '台上互动', code: 'FINAL MISSION COMPLETE', heading: '最终身份确认成功', text: '请中奖观众上台 · 工作人员核对奖券\n特等奖奖品（待确认）', cue: '保留特等奖号码，主持人与观众互动', tone: 'blue' },
  { label: '行动完成', code: 'ALL MISSIONS COMPLETE', heading: '所有身份已揭晓', text: '感谢参与', cue: '切换至下一节目或散场流程', tone: 'blue' },
];

export type DrawRequest = { id: string; config: LotteryConfig };
export type Completed = { request: DrawRequest; result: LotteryResult; revealed: number; revealOrder?: number[] };
export type StageState = {
  completed: Record<string, Completed>;
  scene: number;
  rolling: boolean;
  request: DrawRequest | null;
  result: LotteryResult | null;
  revealed: number;
  revealOrder?: number[];
  drafts: Record<string, { title: string; count: number }>;
};
export const initialStage: StageState = { completed: {}, scene: 0, rolling: false, request: null, result: null, revealed: 0, drafts: {} };
export const STAGE_STATE_KEY = 'wujian-lottery-stage-v1';
export const STAGE_VIEW_KEY = 'wujian-lottery-screen-v1';
export const STAGE_CHANNEL = 'wujian-lottery-screen-v1';
export const MASK_DURATION = 1000;
export const REVEAL_ALL_DURATION = 1200;
export const formatNumber = (n: number) => String(n).padStart(7, '0');

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
  scene: number;
  batchId: string | null;
  title: string;
  phase: 'standby' | 'rolling' | 'masking' | 'revealing' | 'complete';
  slots: (number | null)[];
  heroNumbers: number[];
  minNumber: number;
  maxNumber: number;
  maskingStartedAt: number | null;
};

// 发送给投影窗口的快照仅包含已经揭晓的号码，不携带 request 或完整 result。
export function buildStageView(state: StageState, config: LotteryConfig, maskingStartedAt: number | null): StageView {
  const scene = scenes[state.scene] || scenes[0];
  const draft = state.drafts[String(state.scene)] || scene.draw;
  const count = scene.draw ? state.result?.numbers.length ?? Math.max(0, Math.min(100, Math.floor(draft?.count || 0))) : 0;
  const slots: (number | null)[] = Array(count).fill(null);
  const order = state.revealOrder;
  const validOrder = isRevealOrder(order, count);
  if (state.result && maskingStartedAt === null && !state.rolling) {
    for (let i = 0; i < Math.min(state.revealed, count); i++) {
      // 旧批次没有位置表时保持原布局，避免升级后已揭晓号码跳动。
      slots[validOrder ? order![i] : i] = state.result.numbers[i];
    }
  }
  return {
    scene: state.scene, batchId: state.result?.id ?? null, title: draft?.title ?? '', slots,
    phase: maskingStartedAt !== null ? 'masking' : state.rolling ? 'rolling'
      : state.result ? (state.revealed >= state.result.numbers.length ? 'complete' : 'revealing') : 'standby',
    heroNumbers: state.scene === 16 && maskingStartedAt === null && !state.rolling
      ? state.result?.numbers.slice(0, state.revealed) ?? [] : [],
    minNumber: config.minNumber, maxNumber: config.maxNumber, maskingStartedAt,
  };
}

import type { Program, Danmaku, LotteryConfig, LotteryResult } from '../types';

export interface DataStoreState {
  programs: Program[];
  danmakus: Danmaku[];
  bannedIps: string[];
  lotteryConfig: LotteryConfig;
  lotteryResults: LotteryResult[];
}

export const defaultData: DataStoreState = {
  programs: [
    { id: '1', title: '开场舞', performers: [['编导', ['张三', '李四']], ['表演者', ['王五', '赵六']]], band_name: '舞蹈团', order: 1, completed: false },
    { id: '2', title: '歌曲表演', performers: [['主唱', ['歌手A']]], band_name: null, order: 2, completed: false },
    { id: '3', title: '小品', performers: [['演员', ['演员甲', '演员乙']], ['编剧', ['编剧A']]], band_name: '喜剧组', order: 3, completed: false },
    { id: '4', title: '魔术表演', performers: [['魔术师', ['魔术师A']]], band_name: null, order: 4, completed: false },
    { id: '5', title: '抽奖环节', performers: [['主持人', ['主持人A']]], band_name: null, order: 5, completed: false },
  ],
  danmakus: [], bannedIps: [], lotteryResults: [],
  lotteryConfig: { minNumber: 1, maxNumber: 2000, count: 5, title: '一等奖' },
};

'use client';

import LotteryStage from '@/components/lottery/LotteryStage';
import { useStageScreen } from '@/lib/useLotteryStageSync';

// 纯展示窗口：不调用抽奖接口、不读取导播状态，也不注册控制快捷键。
export default function LotteryScreenPage() {
  const view = useStageScreen();
  return <LotteryStage view={view} />;
}

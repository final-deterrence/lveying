import { NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { dataStore, LotteryError } from '@/lib/dataStore';

export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const token = getTokenFromRequest(request);
  return token && verifyToken(token);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: '未授权' }, { status: 401 });
  return NextResponse.json({
    result: dataStore.getUnpublishedLotteryResult(),
    awards: dataStore.getStageAwards(),
    usedNumbers: dataStore.getAllLotteryResults(true).flatMap(batch => batch.numbers),
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: '未授权' }, { status: 401 });
  try {
    const { id, config, award } = await request.json();
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !config || typeof config !== 'object') {
      return NextResponse.json({ error: '无效的抽奖请求' }, { status: 400 });
    }
    if (award !== undefined && !['third', 'second', 'first', 'grand'].includes(award)) {
      return NextResponse.json({ error: '未知奖项' }, { status: 400 });
    }
    return NextResponse.json({ result: dataStore.drawLottery(id, config, award) });
  } catch (error) {
    if (error instanceof LotteryError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('抽奖失败:', error);
    return NextResponse.json({ error: '抽奖状态暂时无法确认，请刷新页面恢复' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: '未授权' }, { status: 401 });
  try {
    const { id, count, action, reason, number } = await request.json();
    if (typeof id !== 'string') return NextResponse.json({ error: '无效的抽奖结果' }, { status: 400 });
    if (action === 'withdraw' || action === 'replace') {
      return NextResponse.json({ result: dataStore.updateGrandTicket(id, number, action, typeof reason === 'string' ? reason : '') });
    }
    const ok = action === 'invalidate'
      ? dataStore.invalidateLotteryResult(id, typeof reason === 'string' ? reason : '')
      : dataStore.revealLotteryResult(id, count);
    if (!ok) return NextResponse.json({ error: '抽奖结果不存在' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof LotteryError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: '揭晓失败' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { dataStore } from '@/lib/dataStore';
import type { DanmakuFilter } from '@/types';

export const dynamic = 'force-dynamic';

// 只在主动导出时逐批读取历史，不让日常轮询加载全部弹幕。
export async function GET(request: Request) {
  const token = getTokenFromRequest(request);
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const after = Number(params.get('after') ?? 0);
  const snapshot = params.has('snapshot') ? Number(params.get('snapshot')) : undefined;
  const filter = params.get('status') ?? (params.get('pending') === 'true' ? 'pending' : 'all');
  if (!['all', 'pending', 'approved', 'rejected'].includes(filter)) {
    return NextResponse.json({ error: '无效的审核状态' }, { status: 400 });
  }
  if (!Number.isSafeInteger(after) || after < 0 || (snapshot !== undefined && (!Number.isSafeInteger(snapshot) || snapshot < 0))) {
    return NextResponse.json({ error: '无效的导出游标' }, { status: 400 });
  }
  try {
    return NextResponse.json(dataStore.exportDanmakus(after, snapshot, filter as DanmakuFilter), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('导出弹幕失败:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}

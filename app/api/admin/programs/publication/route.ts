import { NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { dataStore } from '@/lib/dataStore';

export async function PUT(request: Request) {
  const token = getTokenFromRequest(request);
  if (!token || verifyToken(token)?.role !== 'admin') {
    return NextResponse.json({ error: '请重新登录' }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (typeof body?.published !== 'boolean') {
      return NextResponse.json({ error: '发布状态无效' }, { status: 400 });
    }

    const { published } = body;
    if (!dataStore.setProgramSchedulePublished(published)) {
      return NextResponse.json({ error: '请先添加并保存至少一个主节目' }, { status: 400 });
    }

    return NextResponse.json({ published });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: '发布状态无效' }, { status: 400 });
    }
    console.error('更新节目单发布状态失败:', error);
    return NextResponse.json({ error: '更新节目单发布状态失败，请重试' }, { status: 500 });
  }
}

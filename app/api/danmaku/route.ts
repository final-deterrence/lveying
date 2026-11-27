import { NextResponse } from 'next/server';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { dataStore } from '@/lib/dataStore';
import type { DanmakuFilter } from '@/types';
import {
  DANMAKU_CLIENT_COOKIE, DanmakuBodyError, getDanmakuClientId,
  getDanmakuClientIp, readDanmakuContent, submitDanmaku,
} from '@/lib/danmakuGuard';

// 禁用缓存，确保每次都获取最新数据
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 验证管理员权限
function verifyAdmin(request: Request) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return null;
  }
  return verifyToken(token);
}

// GET - 获取弹幕列表（需要管理员权限）
export async function GET(request: Request) {
  try {
    const user = verifyAdmin(request);
    if (!user) {
      return NextResponse.json(
        { error: '未授权' },
        { status: 401 }
      );
    }

    const params = new URL(request.url).searchParams;
    const page = Number(params.get('page') ?? 1);
    const pageSize = Number(params.get('pageSize') ?? 50);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return NextResponse.json({ error: '无效的分页参数，pageSize 必须在 1 到 100 之间' }, { status: 400 });
    }
    const filter = params.get('status') ?? (params.get('pending') === 'true' ? 'pending' : 'all');
    if (!['all', 'pending', 'approved', 'rejected'].includes(filter)) {
      return NextResponse.json({ error: '无效的审核状态' }, { status: 400 });
    }
    return NextResponse.json(dataStore.getDanmakus(page, pageSize, filter as DanmakuFilter), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取弹幕失败' },
      { status: 500 }
    );
  }
}

// POST - 发送弹幕（guest端）
export async function POST(request: Request) {
  const clientId = getDanmakuClientId(request);
  const respond = (body: object, status = 200) => {
    const response = NextResponse.json(body, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });
    response.cookies.set(DANMAKU_CLIENT_COOKIE, clientId, {
      httpOnly: true, sameSite: 'lax', secure: new URL(request.url).protocol === 'https:',
      path: '/', maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  };
  try {
    const ip = getDanmakuClientIp(request);
    if (!ip) return respond({ error: '暂时无法发送弹幕，请稍后重试' }, 503);
    const content = await readDanmakuContent(request);
    // 有效提交统一确认处理；是否入队、通过或拦截只在后台显示。
    submitDanmaku(content, ip, clientId);
    return respond({ success: true });
  } catch (error) {
    if (error instanceof DanmakuBodyError) return respond({ error: error.message }, error.status);
    console.error('发送弹幕失败:', error);
    return respond({ error: '发送弹幕失败，请重试' }, 500);
  }
}

// DELETE - 删除弹幕（需要管理员权限）
export async function DELETE(request: Request) {
  try {
    const user = verifyAdmin(request);
    if (!user) {
      return NextResponse.json(
        { error: '未授权' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // 如果没有传id，则清空所有弹幕
    if (!body.id) {
      dataStore.clearDanmakus();
      return NextResponse.json({ success: true });
    }
    
    // 删除单个弹幕
    const success = dataStore.deleteDanmaku(body.id);
    
    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: '弹幕不存在' },
        { status: 404 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: '删除弹幕失败' },
      { status: 500 }
    );
  }
}

// PATCH - 更新弹幕审核状态（需要管理员权限）
export async function PATCH(request: Request) {
  try {
    const user = verifyAdmin(request);
    if (!user) {
      return NextResponse.json(
        { error: '未授权' },
        { status: 401 }
      );
    }

    const { id, censor, reviewStatus } = await request.json();
    const status = reviewStatus ?? (typeof censor === 'boolean' ? (censor ? 'approved' : 'pending') : null);

    if (typeof id !== 'string' || !id || !['approved', 'pending', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: '参数错误' },
        { status: 400 }
      );
    }

    const success = dataStore.updateDanmakuReview(id, status);
    
    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: '弹幕不存在' },
        { status: 404 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: '更新审核状态失败' },
      { status: 500 }
    );
  }
}



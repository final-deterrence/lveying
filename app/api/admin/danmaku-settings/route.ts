import { NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { DanmakuSettingsError, getDanmakuSettings, getDanmakuGuardStats, saveDanmakuSettings, reviewDanmaku, validateDanmakuSettings } from '@/lib/danmakuPolicy';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const token = getTokenFromRequest(request);
  return Boolean(token && verifyToken(token)?.role === 'admin');
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: '未授权' }, { status: 401 });
  try {
    return NextResponse.json({ settings: getDanmakuSettings(), stats: getDanmakuGuardStats() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('获取弹幕策略失败:', error);
    return NextResponse.json({ error: '获取配置失败' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: '未授权' }, { status: 401 });
  try {
    const settings = saveDanmakuSettings(await request.json());
    return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof DanmakuSettingsError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('保存弹幕策略失败:', error);
    return NextResponse.json({ error: '保存配置失败' }, { status: 500 });
  }
}

// 使用尚未保存的规则预览一条内容，不写入弹幕、不改变现有审核结果。
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: '未授权' }, { status: 401 });
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 40) {
      return NextResponse.json({ error: '请输入 1–40 字的测试内容' }, { status: 400 });
    }
    const settings = validateDanmakuSettings(body.settings);
    return NextResponse.json({ review: reviewDanmaku(body.content, settings.moderation) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof DanmakuSettingsError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: '预览失败' }, { status: 500 });
  }
}

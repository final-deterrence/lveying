import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/dataStore';
import { isDanmakuSubmissionOpen } from '@/lib/danmakuPolicy';

// 禁用缓存，确保每次都获取最新数据
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET - 获取已审核的弹幕列表（公开访问，用于游客页面显示）
export async function GET() {
  try {
    return NextResponse.json({
      danmakus: dataStore.getPublicDanmakus(),
      submissionOpen: isDanmakuSubmissionOpen(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: '获取弹幕失败' },
      { status: 500 }
    );
  }
}

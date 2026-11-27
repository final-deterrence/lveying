import { NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { getHomepageLinks, HomepageLinksError, saveHomepageLinks } from '@/lib/homepageLinks';

export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const token = getTokenFromRequest(request);
  return token && verifyToken(token)?.role === 'admin';
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: '请重新登录' }, { status: 401 });
  return NextResponse.json({ settings: getHomepageLinks() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: '请重新登录' }, { status: 401 });
  try {
    const settings = saveHomepageLinks(await request.json());
    return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof HomepageLinksError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: '首页内容格式错误' }, { status: 400 });
    console.error('保存首页内容失败:', error);
    return NextResponse.json({ error: '保存首页内容失败，请重试' }, { status: 500 });
  }
}

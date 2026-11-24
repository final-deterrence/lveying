import { NextResponse } from 'next/server';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { dataStore } from '@/lib/dataStore';
import { canonicalIp } from '@/lib/ip';

// 禁用缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function verifyAdmin(request: Request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(request: Request) {
  try {
    const user = verifyAdmin(request);
    if (!user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

  const ips = dataStore.getBannedIps();
  console.log('👮 获取封禁 IP：', ips);
    return NextResponse.json({ ips });
  } catch (error) {
    console.error('获取封禁 IP 列表失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = verifyAdmin(request);
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 });

    const { ip: rawIp } = await request.json();
    if (!rawIp || typeof rawIp !== 'string') return NextResponse.json({ error: '参数错误' }, { status: 400 });

    const ip = canonicalIp(rawIp);
    if (!ip) return NextResponse.json({ error: '无效的 IP 地址' }, { status: 400 });
  const result = dataStore.banIp(ip);
  console.log('👮 封禁请求', { rawIp, ip, result });
  if (result.success) return NextResponse.json({ success: true, ip, affected: result.affected });
    return NextResponse.json({ error: 'IP 已在封禁列表中' }, { status: 400 });
  } catch (error) {
    console.error('封禁 IP 失败:', error);
    return NextResponse.json({ error: '封禁失败' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = verifyAdmin(request);
    if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 });

  const { ip: rawIp } = await request.json();
  if (!rawIp) {
      // 如果没有 ip，清空所有封禁
      dataStore.clearBannedIps();
      console.log('👮 清空封禁 IP 列表');
      return NextResponse.json({ success: true });
    }

    const ip = typeof rawIp === 'string' ? canonicalIp(rawIp) : null;
    if (!ip) return NextResponse.json({ error: '无效的 IP 地址' }, { status: 400 });
  const success = dataStore.unbanIp(ip);
  console.log('👮 解封请求', { rawIp, ip, success });
  if (success) return NextResponse.json({ success: true, ip });
    return NextResponse.json({ error: 'IP 未在封禁列表' }, { status: 400 });
  } catch (error) {
    console.error('解封 IP 失败:', error);
    return NextResponse.json({ error: '解封失败' }, { status: 500 });
  }
}

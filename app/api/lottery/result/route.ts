import { NextResponse } from 'next/server';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { dataStore } from '@/lib/dataStore';

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

// GET - 获取抽奖结果（guest端 - 返回最新结果）
export async function GET() {
  try {
    const result = dataStore.getLatestLotteryResult();
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: '获取抽奖结果失败' },
      { status: 500 }
    );
  }
}

// POST - 添加新的抽奖结果（需要管理员权限）
export async function POST(request: Request) {
  try {
    const user = verifyAdmin(request);
    if (!user) {
      return NextResponse.json(
        { error: '未授权' },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: '请使用服务端抽奖接口' }, { status: 405 });
  } catch (error) {
    return NextResponse.json(
      { error: '添加抽奖结果失败' },
      { status: 500 }
    );
  }
}

// DELETE - 删除指定抽奖结果（需要管理员权限）
export async function DELETE(request: Request) {
  try {
    const user = verifyAdmin(request);
    if (!user) {
      return NextResponse.json(
        { error: '未授权' },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: '中奖记录不能单独删除，以免号码再次中奖' }, { status: 405 });
  } catch (error) {
    return NextResponse.json(
      { error: '删除抽奖结果失败' },
      { status: 500 }
    );
  }
}

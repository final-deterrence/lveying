'use client';

import { useEffect, useState } from 'react';
import GuestNavBar from '@/components/GuestNavBar';
import { formatNumber } from '@/lib/lotteryStage';
import { MAX_TICKET_NUMBER } from '@/public/wujiandao/tickets.mjs';
import type { LotteryResult } from '@/types';

export default function LotteryPage() {
  const [results, setResults] = useState<LotteryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    const refresh = async () => {
      try {
        const response = await fetch('/api/lottery/history', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('加载失败');
        const { history } = await response.json() as { history?: LotteryResult[] };
        if (controller.signal.aborted) return;
        setResults(history ?? []);
        setError(false);
      } catch { if (!controller.signal.aborted) setError(true); }
      finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = window.setTimeout(refresh, 5000);
        }
      }
    };
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);

  const awards = new Map<string, LotteryResult[]>();
  for (const result of results) {
    const group = awards.get(result.title);
    if (group) group.push(result);
    else awards.set(result.title, [result]);
  }

  return <main className="min-h-screen bg-[#10191d] text-[#f0e6d3]">
    <GuestNavBar dark />
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-28 sm:px-8">
      <h1 className="mb-7 border-b border-[#53615f] pb-5 text-3xl font-bold tracking-tight sm:text-4xl">抽奖结果</h1>
      {error && <p role="alert" className="mb-5 rounded border border-[#7f5b48] bg-[#30231d] px-4 py-3 text-[#f4ca9e]">
        连接暂时中断，正在重试。
      </p>}
      {loading && <p role="status" className="text-[#bcc8c1]">正在读取中奖号码…</p>}
      {!loading && !error && awards.size === 0 && <p role="status" className="text-[#bcc8c1]">请等待开奖。</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from(awards, ([title, batches]) => {
          const count = batches.reduce((n, batch) => n + batch.numbers.length, 0);
          const hasLongTicket = batches.some(batch => batch.numbers.some(number => number > MAX_TICKET_NUMBER));
          return <section key={title} className={`overflow-hidden rounded-md border border-[#40504f] bg-[#182428] ${count > 4 ? 'sm:col-span-2' : ''}`}>
            <h2 className="border-l-[3px] border-[#ccb88d] bg-[#233034] px-4 py-3 text-xl font-semibold sm:px-6">{title}</h2>
            <ul aria-label={title + '中奖号码'} className={`grid gap-2 p-4 sm:p-5 ${hasLongTicket ? 'grid-cols-[repeat(auto-fill,minmax(7.75rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))]'}`}>
              {batches.flatMap(batch => batch.numbers.map((number, i) => (
                <li key={`${batch.id}-${i}`} className="rounded-sm border border-[#354748] bg-[#121c20] px-2 py-2.5 text-center font-mono text-xl tabular-nums sm:py-3 sm:text-2xl">
                  {formatNumber(number)}
                </li>
              )))}
            </ul>
          </section>;
        })}
      </div>
    </div>
  </main>;
}

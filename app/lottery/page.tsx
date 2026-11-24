'use client';

import { useEffect, useState } from 'react';
import GuestNavBar from '@/components/GuestNavBar';
import type { LotteryResult } from '@/types';

export default function LotteryPage() {
  const [results, setResults] = useState<LotteryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch('/api/lottery/history', { cache: 'no-store' });
        if (!response.ok) throw new Error('加载失败');
        setResults((await response.json()).history || []);
        setError(false);
      } catch { setError(true); }
      finally { setLoading(false); }
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const titles = Array.from(new Set(results.map(result => result.title)));
  return <main className="min-h-screen bg-[#07100d] text-green-100">
    <GuestNavBar />
    <div className="max-w-5xl mx-auto px-5 pt-24 pb-16">
      <p className="text-green-400 tracking-widest text-sm">MISSION / LOTTERY RESULTS</p>
      <h1 className="text-3xl font-bold mt-3 mb-4">抽奖结果</h1>
      <p className="text-green-200/70 mb-8">已揭晓的中奖号码将在此显示，页面每 5 秒自动更新。</p>
      {error && <p role="alert" className="text-red-300 mb-4">更新失败，请检查网络或稍后重试。</p>}
      {loading ? <p>加载中…</p> : titles.length === 0 ? <p>暂未揭晓中奖号码，请等待开奖。</p> :
        <div className="space-y-6">{titles.map(title => <section key={title} className="border border-green-800 bg-green-950/40 rounded-lg p-5">
          <h2 className="text-xl font-bold mb-4">{title}</h2>
          <div className="flex flex-wrap gap-2">{results.filter(r => r.title === title).flatMap(r => r.numbers.map((number, i) =>
            <span key={`${r.id}-${i}`} className="font-mono text-lg bg-black/30 border border-green-900 px-3 py-2 rounded">{String(number).padStart(7, '0')}</span>
          ))}</div>
        </section>)}</div>}
    </div>
  </main>;
}

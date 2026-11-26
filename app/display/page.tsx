'use client';

import { useEffect, useState, useRef } from 'react';
import { Danmaku } from '@/types';

const MAX_LINES = 20;

export default function DisplayPage() {
  const [displayDanmakus, setDisplayDanmakus] = useState<Danmaku[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch('/api/danmaku/censored', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('获取弹幕失败');
        const data = await response.json();
        if (!disposed && Array.isArray(data.danmakus)) {
          const latest: Danmaku[] = data.danmakus.slice(-MAX_LINES);
          // 同步整份小快照，同时处理新审核、撤回、封禁和清空。
          setDisplayDanmakus(prev => JSON.stringify(prev) === JSON.stringify(latest) ? prev : latest);
        }
      } catch (error) {
        if (!controller.signal.aborted) console.error('获取弹幕失败:', error);
      }
      if (!disposed) timer = setTimeout(poll, 2000);
    };
    poll();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, []);

  // 当弹幕更新时，滚动到底部
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayDanmakus]);

  return (
    <div 
      className="festival-projection-backdrop min-h-screen text-white flex flex-col justify-end p-8"
    >
      <div className="space-y-2">
        {displayDanmakus.map((danmaku, index) => (
          <div
            key={danmaku.id}
            className={`${index > 0 ? 'border-t border-gray-400 pt-1' : ''}`}
          >
            <div
              className="font-medium animate-slideIn"
              style={{
                animationDelay: `${index * 0.05}s`,
                fontSize: '3.24rem',
                lineHeight: '1.5',
                textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.6)'
              }}
            >
              {danmaku.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(calc(-100% - 2rem));
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .animate-slideIn {
          animation: slideIn 0.5s cubic-bezier(0.34, 1.8, 0.64, 1) forwards;
          opacity: 0;
          transform: translateX(calc(-100% - 2rem));
        }
      `}</style>
    </div>
  );
}

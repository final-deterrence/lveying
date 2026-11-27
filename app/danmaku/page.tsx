'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import GuestNavBar from '@/components/GuestNavBar';

interface Danmaku {
  id: string;
  content: string;
  timestamp: number;
  censor: boolean;
  censoredAt?: number;
}

export default function DanmakuPage() {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [recentDanmakus, setRecentDanmakus] = useState<Danmaku[]>([]);
  const [loading, setLoading] = useState(true);
  const [submissionOpen, setSubmissionOpen] = useState<boolean | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // 获取最近的弹幕
  const fetchRecentDanmakus = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/danmaku/public', { signal, cache: 'no-store' });
      if (!response.ok) throw new Error('获取弹幕失败');
      const data = await response.json();
      if (signal?.aborted) return;
      // 服务端按审核通过时间返回最近 20 条，包括较晚通过审核的旧消息。
      const sortedDanmakus = (data.danmakus || []).slice(0, 20);
      setRecentDanmakus(sortedDanmakus);
      setSubmissionOpen(data.submissionOpen === true);
    } catch (error) {
      if (!signal?.aborted) console.error('获取弹幕失败:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      if (!document.hidden) await fetchRecentDanmakus(controller.signal);
      if (!disposed) timer = setTimeout(poll, 3000);
    };
    poll();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [fetchRecentDanmakus]);

  // 当弹幕更新时，滚动到底部显示最新弹幕
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [recentDanmakus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !submissionOpen) return;
    
    if (!content.trim()) {
      setMessage('请输入弹幕内容');
      return;
    }
    
    if (content.trim().length > 20) {
      setMessage('弹幕不能超过20字');
      return;
    }

    setSending(true);
    setMessage('');

    try {
      const response = await fetch('/api/danmaku', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (response.ok || response.status === 429) {
        setMessage('发送成功！');
        setContent('');
      } else {
        const data = await response.json().catch(() => ({}));
        if (response.status === 403 && data.submissionOpen === false) {
          setSubmissionOpen(false);
        } else {
          setMessage(data.error || '发送失败');
        }
      }
    } catch (error) {
      setMessage('发送失败，请重试');
    } finally {
      setSending(false);
    }
  };

  return (
    <div 
      className="festival-backdrop min-h-screen"
    >
      {/* 导航栏 */}
      <GuestNavBar />

      <div className="max-w-2xl mx-auto px-4 pt-20 pb-8 space-y-6">
        {/* 上半部分：最近弹幕展示 */}
        <div className="backdrop-blur-lg bg-white/30 rounded-2xl border border-white/20 shadow-2xl p-4 sm:p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
              <p className="mt-2 text-gray-800 text-sm drop-shadow-md">加载中...</p>
            </div>
          ) : recentDanmakus.length > 0 ? (
            <div className="relative">
              {/* 弹幕滚动容器 - 显示约8条弹幕的高度 */}
              <div 
                ref={scrollContainerRef}
                className="flex flex-col space-y-3 overflow-y-scroll custom-scrollbar h-[min(480px,46svh)] p-2 sm:p-4"
                style={{ 
                  scrollBehavior: 'smooth'
                }}
              >
                {recentDanmakus
                  .slice()
                  .reverse() // 反转数组，让最老的在上面，最新的在下面
                  .map((danmaku, index, arr) => {
                    // 检查是否是最新的弹幕（在反转数组中的最后一个）
                    const isNew = index === arr.length - 1;
                    return (
                      <div 
                        key={`${danmaku.id}-${danmaku.timestamp}`} 
                        className={`flex transform transition-all duration-500 ease-in-out ${
                          isNew ? 'animate-slide-up-fade-in' : ''
                        }`}
                      >
                        <div className="backdrop-blur-md bg-white/40 rounded-full px-6 py-3 border border-white/20 hover:bg-white/50 transition-all max-w-full shadow-lg">
                          <p className="text-gray-800 drop-shadow-md break-words font-medium">{danmaku.content}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
              
              {/* 底部渐变遮罩 */}
              {recentDanmakus.length > 8 && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white/30 to-transparent h-8 pointer-events-none rounded-b-xl"></div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 drop-shadow-md">暂无弹幕</p>
            </div>
          )}
        </div>

        {/* 下半部分：发送弹幕 */}
        <div className="backdrop-blur-lg bg-white/30 rounded-2xl border border-white/20 shadow-2xl p-4 sm:p-6">
          {submissionOpen ? (
            <form onSubmit={handleSubmit}>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="弹幕经审核后将公开展示"
                  aria-label="弹幕内容"
                  maxLength={20}
                  className="min-w-0 flex-1 px-4 py-3 backdrop-blur-md bg-white/80 border-2 border-white/30 rounded-full focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-gray-800"
                />
                <button
                  type="submit"
                  disabled={sending || !content.trim() || content.trim().length > 20}
                  aria-label="发送弹幕"
                  className="h-12 w-12 shrink-0 sm:h-14 sm:w-14 backdrop-blur-md bg-gradient-to-r from-blue-500/80 to-cyan-500/80 rounded-full shadow-lg border border-white/30 hover:from-blue-600/80 hover:to-cyan-600/80 transform hover:scale-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
                >
                  <Image src="/send.png" alt="发送" width={24} height={24} className="drop-shadow-lg" />
                </button>
              </div>
            </form>
          ) : (
            <p role="status" className="py-2 text-center font-medium text-gray-700">
              {submissionOpen === false ? '弹幕发送暂未开放' : loading ? '正在获取弹幕发送状态…' : '暂时无法获取弹幕发送状态'}
            </p>
          )}

          {submissionOpen && message && (
            <div
              className={`mt-4 p-4 rounded-xl text-center font-medium backdrop-blur-md border border-white/30 drop-shadow-md ${
                message.includes('成功')
                  ? 'bg-green-400/60 text-white'
                  : 'bg-red-400/60 text-white'
              }`}
            >
              {message}
            </div>
          )}
        </div>
        
        {/* 制作信息 */}
        <div className="text-center mt-4 pb-4">
          <p className="text-sm text-gray-800 drop-shadow-md">
            © 2025 <a href="https://www.weitao-jiang.cn" target="_blank" rel="noopener noreferrer" className="hover:underline">江玮陶</a>
            {' | '}
            <a href="https://github.com/CBDT-JWT/lveying" target="_blank" rel="noopener noreferrer" className="hover:underline">Github</a>
          </p>
        </div>
      </div>
    </div>
  );
}

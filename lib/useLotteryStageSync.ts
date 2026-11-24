'use client';

import { useEffect, useRef, useState } from 'react';
import { STAGE_CHANNEL, STAGE_VIEW_KEY, type StageView } from './lotteryStage';

export function useStageBroadcast(view: StageView | null) {
  const latest = useRef(view);
  latest.current = view;
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const connection = new BroadcastChannel(STAGE_CHANNEL);
    channel.current = connection;
    connection.onmessage = event => {
      if (event.data?.type === 'request-view' && latest.current) {
        connection.postMessage({ type: 'view', view: latest.current });
      }
    };
    return () => { connection.close(); channel.current = null; };
  }, []);
  useEffect(() => {
    if (!view) return;
    // storage 事件兼容不支持 BroadcastChannel 的浏览器，并供新窗口恢复画面。
    localStorage.setItem(STAGE_VIEW_KEY, JSON.stringify(view));
    channel.current?.postMessage({ type: 'view', view });
  }, [view]);
}

export function useStageScreen() {
  const [view, setView] = useState<StageView | null>(null);
  useEffect(() => {
    // 两条通知通道都从同一个快照读取，避免消息到达顺序不同导致画面退回旧进度。
    let previous: string | null | undefined;
    const read = (raw: string | null) => {
      if (raw === previous) return;
      previous = raw;
      try { setView(raw ? JSON.parse(raw) : null); } catch { setView(null); }
    };
    const stored = (event: StorageEvent) => {
      if (event.key === STAGE_VIEW_KEY || event.key === null) read(localStorage.getItem(STAGE_VIEW_KEY));
    };
    read(localStorage.getItem(STAGE_VIEW_KEY));
    window.addEventListener('storage', stored);
    const connection = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(STAGE_CHANNEL);
    if (connection) {
      connection.onmessage = event => {
        if (event.data?.type === 'view') read(localStorage.getItem(STAGE_VIEW_KEY));
      };
      connection.postMessage({ type: 'request-view' });
    }
    return () => { window.removeEventListener('storage', stored); connection?.close(); };
  }, []);
  return view;
}

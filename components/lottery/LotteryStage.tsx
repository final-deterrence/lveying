'use client';

import { useEffect, useRef } from 'react';
import type { StageView } from '@/lib/lotteryStage';

type FilmWindow = Window & { wujianFilm?: { present: (view: StageView) => void; toggleAudio: () => void } };

export default function LotteryStage({ view, director = false }: { view: StageView | null; director?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const film = () => (frame.current?.contentWindow as FilmWindow | null)?.wujianFilm;
  useEffect(() => { if (view) film()?.present(view); }, [view]);
  useEffect(() => {
    if (!director) return;
    const toggle = () => film()?.toggleAudio();
    window.addEventListener('lottery-toggle-audio', toggle);
    return () => window.removeEventListener('lottery-toggle-audio', toggle);
  }, [director]);
  return <main style={{ position: 'fixed', inset: 0, background: '#080e10' }}>
    {view ? <iframe ref={frame} title="无间道抽奖大屏" src="/wujiandao/film.html" tabIndex={-1}
      onLoad={() => { if (view) film()?.present(view); }}
      style={{ width: '100%', height: '100%', display: 'block', border: 0, pointerEvents: 'none' }} />
      : <span role="status" style={{ color: '#bac6bc', position: 'absolute', left: '5%', bottom: '6%' }}>等待导播连接</span>}
  </main>;
}

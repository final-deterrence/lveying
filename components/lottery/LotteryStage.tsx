'use client';

import { useEffect, useState, type MutableRefObject } from 'react';
import type { StageView } from '@/lib/lotteryStage';

export type StageCue = { film: string; startedAt: number; phase: 'painting' | 'scene' | 'entering' | 'rolling' | 'revealing' | 'held' };
export type StageFilm = {
  present: (view: StageView) => void;
  toggleAudio: () => void;
  advanceCue: (film: string, startedAt?: number) => { action: 'finish'; startedAt: number } | { action: 'advance' | 'wait' };
  subscribeCue: (listener: (cue: StageCue) => void) => () => void;
};
type FilmWindow = Window & { wujianFilm?: StageFilm };

export default function LotteryStage({ view, director = false, filmRef, onCue }: {
  view: StageView | null; director?: boolean; filmRef?: MutableRefObject<StageFilm | null>; onCue?: (cue: StageCue) => void;
}) {
  const [player, setPlayer] = useState<StageFilm | null>(null);
  useEffect(() => {
    if(filmRef)filmRef.current=player;
    return () => { if(filmRef)filmRef.current=null; };
  }, [player, filmRef]);
  useEffect(() => { if(player && onCue)return player.subscribeCue(onCue); }, [player, onCue]);
  useEffect(() => { if (view) player?.present(view); }, [player, view]);
  useEffect(() => {
    if (!director) return;
    const toggle = () => player?.toggleAudio();
    window.addEventListener('lottery-toggle-audio', toggle);
    return () => window.removeEventListener('lottery-toggle-audio', toggle);
  }, [director, player]);
  return <main className="lottery-stage" style={{ position: 'fixed', inset: 0, background: '#080e10' }}>
    {view ? <iframe title="无间道抽奖大屏" src="/wujiandao/film.html" tabIndex={-1}
      onLoad={e => setPlayer((e.currentTarget.contentWindow as FilmWindow | null)?.wujianFilm ?? null)}
      style={{ width: '100%', height: '100%', display: 'block', border: 0, pointerEvents: 'none' }} />
      : <span role="status" style={{ color: '#bac6bc', position: 'absolute', left: '5%', bottom: '6%' }}>等待导播连接</span>}
  </main>;
}

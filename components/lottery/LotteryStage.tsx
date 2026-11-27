'use client';

import { useEffect, useState } from 'react';
import { formatNumber, MASK_DURATION, scenes, type StageView } from '@/lib/lotteryStage';

const symbols = '#@%&*!';

export default function LotteryStage({ view }: { view: StageView | null }) {
  const [rollingText, setRollingText] = useState<string[]>([]);
  const [maskedDigits, setMaskedDigits] = useState(0);
  const phase = view?.phase;
  const count = view?.slots.length ?? 0;
  const min = view?.minNumber ?? 1;
  const max = view?.maxNumber ?? 2000;
  const maskingStartedAt = view?.maskingStartedAt;
  useEffect(() => {
    if (phase !== 'rolling' && phase !== 'masking') return;
    const update = () => setRollingText(Array.from({ length: count }, () => {
      const digits = formatNumber(min + Math.floor(Math.random() * (max - min + 1)));
      return Array.from(digits, digit => phase === 'masking' || Math.random() < 0.4
        ? symbols[Math.floor(Math.random() * symbols.length)] : digit).join('');
    }));
    update();
    const timer = window.setInterval(update, 50);
    return () => window.clearInterval(timer);
  }, [phase, count, min, max]);
  useEffect(() => {
    if (phase !== 'masking' || maskingStartedAt == null) return;
    const update = () => setMaskedDigits(Math.max(0, Math.min(7, Math.floor((Date.now() - maskingStartedAt) * 7 / MASK_DURATION))));
    update();
    const timer = window.setInterval(update, 25);
    return () => window.clearInterval(timer);
  }, [phase, maskingStartedAt]);

  const scene = scenes[view?.scene ?? 0] || scenes[0];
  const cols = count <= 3 ? Math.max(1, count) : Math.min(5, count);
  const color = scene.tone === 'red' ? '#f87171' : scene.tone === 'blue' ? '#a5c7df' : '#86efac';
  const statuses = {
    standby: '等待开始 / STANDBY', rolling: '正在识别 · 等待确认抽取', masking: '正在加密中奖号码',
    revealing: '正在逐个解密', complete: '身份确认成功 / COMPLETE',
  };
  return <main className="lottery-stage festival-projection-backdrop" style={{ color, '--accent': color } as React.CSSProperties}>
    <div className="texture" />
    <div className="stage-body">
      <div className="overline">无间道 · 潜伏行动 <span>{view ? scene.code : 'STANDBY'}</span></div>
      <h1>{view ? scene.heading : '等待导播连接'}</h1>
      {view && scene.draw ? <>
        <p className="draw-name">{view.title} <span> / {count} 人</span></p>
        <div className="status">{statuses[view.phase]}</div>
        <div className="slots" key={view.batchId ?? scene.code}
          style={{ '--slot-columns': cols, '--phone-slot-columns': Math.min(3, cols) } as React.CSSProperties}>
          {view.slots.map((number, i) => <div className={`slot ${number !== null ? 'revealed' : ''}`} key={i}>
            {view.phase === 'masking' ? '?'.repeat(maskedDigits) + (rollingText[i] || '#######').replace(/[0-9]/g, '#').slice(maskedDigits)
              : view.phase === 'rolling' ? (rollingText[i] || '#######') : number !== null ? formatNumber(number) : '???????'}
          </div>)}
        </div>
      </> : <>
        <p className="scene-text">{view ? scene.text : '无间道 · 潜伏行动'}</p>
        {!!view?.heroNumbers.length && <div className="hero-number">{view.heroNumbers.map(formatNumber).join('　')}</div>}
      </>}
      <div className="bottom-line">TOP SECRET <span>{view ? `MISSION ${String(view.scene + 1).padStart(2, '0')} / ${scenes.length}` : 'STANDBY'}</span></div>
    </div>
    <style jsx>{`
      .lottery-stage{min-height:100vh;position:relative;overflow:hidden;font-family:ui-monospace,monospace;display:flex;align-items:center;justify-content:center}
      .texture{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0px,transparent 3px,#ffffff05 4px);pointer-events:none}
      .stage-body{width:min(88vw,1500px);text-align:center;position:relative}
      .overline,.bottom-line{display:flex;justify-content:space-between;border-bottom:1px solid var(--accent);padding:1rem 0;font-size:clamp(12px,1.2vw,20px);letter-spacing:.16em;opacity:.8}
      .bottom-line{border-bottom:0;border-top:1px solid var(--accent);margin-top:2rem}
      h1{font-size:clamp(32px,4.5vw,76px);font-weight:700;margin:3vh 0;letter-spacing:.08em}
      .scene-text{white-space:pre-line;line-height:2;font-size:clamp(22px,2.5vw,44px);min-height:28vh;display:flex;align-items:center;justify-content:center}
      .draw-name{font-size:clamp(20px,2vw,34px);margin:0}.draw-name span{opacity:.65;font-size:.65em}
      .status{letter-spacing:.1em;margin:1.5vh 0;font-size:clamp(14px,1.2vw,20px)}
      .slots{display:grid;grid-template-columns:repeat(var(--slot-columns),minmax(0,1fr));gap:clamp(8px,1vw,20px);max-width:1250px;margin:2vh auto}
      .slot{display:flex;align-items:center;justify-content:center;line-height:1.2;border:1px solid currentColor;background:#0b1a16;padding:clamp(8px,1vw,18px) 2px;font-size:clamp(14px,2.4vw,42px);letter-spacing:.05em;color:#78958a}
      .slot.revealed{color:#fff;text-shadow:0 0 18px var(--accent);border-color:var(--accent);animation:reveal .22s ease-out}
      @keyframes reveal{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
      .hero-number{font-size:clamp(48px,6vw,110px);color:#fff}
      @media(max-width:640px){
        .stage-body{padding:1rem 0}
        .overline,.bottom-line{gap:1rem;letter-spacing:.08em}
        .overline{text-align:left}.overline span{text-align:right}
        .slots{grid-template-columns:repeat(var(--phone-slot-columns),minmax(0,1fr))}
      }
      @media(prefers-reduced-motion:reduce){.slot.revealed{animation:none}}
    `}</style>
  </main>;
}

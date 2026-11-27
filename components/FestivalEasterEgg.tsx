'use client';

import { useState } from 'react';
import Image from 'next/image';

interface FlyingS {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  size: number;
}

export default function FestivalEasterEgg() {
  const [exploded, setExploded] = useState(false);
  const [flyingS, setFlyingS] = useState<FlyingS[]>([]);

  const handleServerClick = () => {
    if (exploded) return;
    
    setExploded(true);
    
    // 生成飞散的字母
    const newFlyingS: FlyingS[] = [];
    for (let i = 0; i < 100; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 20;
      newFlyingS.push({
        id: i,
        x: 30, // server图标中心位置
        y: window.innerHeight - 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5, // 向上偏移
        rotation: Math.random() * 360,
        size: 20 + Math.random() * 40,
      });
    }
    setFlyingS(newFlyingS);

    // 动画
    let frame = 0;
    const animate = () => {
      frame++;
      if (frame > 300) { // 5秒后停止
        setExploded(false);
        setFlyingS([]);
        return;
      }

      setFlyingS(prev => prev.map(s => ({
        ...s,
        x: s.x + s.vx,
        y: s.y + s.vy,
        vy: s.vy + 0.3, // 重力
        rotation: s.rotation + 5,
      })));

      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  };

  return <>
    <button type="button" onClick={handleServerClick} disabled={exploded}
      aria-label="播放网站彩蛋"
      className="fixed bottom-3 left-3 z-40 rounded-lg shadow-md transition-opacity disabled:opacity-0">
      <Image src="/theme/icon.png" alt="" className="rounded-lg" width={24} height={24} />
    </button>
        {flyingS.map(s => (
          <div
            key={s.id}
            className="fixed text-white font-bold pointer-events-none z-50"
            style={{
              left: `${s.x}px`,
              top: `${s.y}px`,
              fontSize: `${s.size}px`,
              transform: `rotate(${s.rotation}deg)`,
              textShadow: '0 0 20px rgba(255, 255, 255, 0.8), 0 0 40px rgba(255, 255, 255, 0.5)',
            }}
          >
            S
          </div>
        ))}
        
  </>;
}

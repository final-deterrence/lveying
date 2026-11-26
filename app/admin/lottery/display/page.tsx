'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { LotteryConfig, LotteryResult } from '@/types';

import LotteryStage from '@/components/lottery/LotteryStage';
import { buildStageView, createRevealOrder, formatNumber, initialStage, MASK_DURATION, REVEAL_ALL_DURATION, restoreRevealOrder, scenes, STAGE_STATE_KEY, type StageState } from '@/lib/lotteryStage';
import { useStageBroadcast } from '@/lib/useLotteryStageSync';

export default function LotteryDisplayPage() {
  const router = useRouter();
  const [state, setState] = useState<StageState>(initialStage);
  const [config, setConfig] = useState<LotteryConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [controls, setControls] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [maskingStartedAt, setMaskingStartedAt] = useState<number | null>(null);
  const masking = maskingStartedAt !== null;
  const mounted = useRef(false);
  const maskingRef = useRef(false);
  const lock = useRef(false);
  const stateRef = useRef(state);
  const save = (next: StageState) => { stateRef.current = next; setState(next); localStorage.setItem(STAGE_STATE_KEY, JSON.stringify(next)); };
  const token = () => localStorage.getItem('adminToken') || '';
  class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
  const api = async (method: string, body?: unknown) => {
    const response = await fetch('/api/lottery/draw', { method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new ApiError(data.error || '请求失败，请重试', response.status);
    return data;
  };
  useEffect(() => {
    const run = async () => {
      const auth = token();
      if (!auth) { router.push('/admin'); return; }
      try {
        const oldQueue = localStorage.getItem('pendingLotteryResults');
        if (oldQueue && oldQueue !== '[]') throw new Error('发现旧版未提交的中奖记录，请先备份并处理，暂不能抽奖。');
        const res = await fetch('/api/lottery/config', { headers: { Authorization: `Bearer ${auth}` } });
        if (!res.ok) throw new Error('读取抽奖配置失败，请重新登录');
        setConfig((await res.json()).config);
        let saved: StageState = initialStage;
        const raw = localStorage.getItem(STAGE_STATE_KEY);
        if (raw) saved = { ...initialStage, ...JSON.parse(raw) };
        const pending = (await api('GET')).result as LotteryResult | null;
        if (saved.request) {
          if (pending && pending.id !== saved.request.id) throw new Error('数据库存在另一设备创建的未完成抽奖，请回到原设备完成揭晓。');
          try {
            const recovered = (await api('POST', saved.request)).result as LotteryResult;
            // 请求可能在上次断开时尚未提交；重试新建的批次也必须保持隐藏。
            const currentPending = (await api('GET')).result as LotteryResult | null;
            const revealed = currentPending?.id === recovered.id ? (currentPending.revealedCount ?? 0) : recovered.numbers.length;
            saved = { ...saved, rolling: false, result: recovered, revealed };
          } catch (e) {
            if (!(e instanceof ApiError) || e.status !== 400 || pending) throw e;
            saved = { ...saved, request: null, result: null, revealed: 0, rolling: false };
            setError(e.message);
          }
        } else if (pending) {
          throw new Error('数据库存在另一设备创建的未完成抽奖，请回到原设备完成揭晓。');
        }
        if (saved.result) saved = { ...saved, revealOrder: restoreRevealOrder(saved.result.numbers.length, saved.revealed, saved.revealOrder) };
        save(saved);
        setReady(true);
      } catch (e) { setError(e instanceof Error ? e.message : '恢复抽奖状态失败'); }
    };
    run();
    // 场景恢复仅在页面打开时执行。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);
  const scene = scenes[state.scene] || scenes[0];
  const draft = state.drafts[String(state.scene)] || scene.draw;
  const blocked = busy || !ready || masking;
  const perform = async (action: () => Promise<void>) => {
    if (lock.current || !ready || maskingRef.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试'); }
    finally { lock.current = false; setBusy(false); }
  };
  const start = () => {
    if (blocked || lock.current || maskingRef.current || !scene.draw || state.result || state.request || !draft
      || !draft.title.trim() || !Number.isSafeInteger(draft.count) || draft.count < 1 || draft.count > 100) return;
    save({ ...state, rolling: true, revealOrder: createRevealOrder(draft.count) });
  };
  const draw = () => perform(async () => {
    const s = stateRef.current;
    if (!s.rolling || !draft || !config) return;
    const request = s.request || { id: crypto.randomUUID(), config: { ...config, title: draft.title, count: draft.count } };
    save({ ...s, request, revealOrder: restoreRevealOrder(request.config.count, 0, s.revealOrder) });
    try {
      const result = (await api('POST', request)).result as LotteryResult;
      // 等服务器确认结果已持久化后才开始遮盖动画。
      maskingRef.current = true;
      setMaskingStartedAt(Date.now());
      save({ ...stateRef.current, result, rolling: false, revealed: 0 });
    } catch (e) {
      // 明确拒绝意味着事务未提交；网络错误或服务器错误保留编号重试。
      if (e instanceof ApiError && e.status === 400) save({ ...stateRef.current, request: null, rolling: false });
      throw e;
    }
  });
  const reveal = (all = false) => perform(async () => {
    const s = stateRef.current;
    if (!s.result) return;
    const target = all ? s.result.numbers.length : Math.min(s.revealed + 1, s.result.numbers.length);
    const remaining = target - s.revealed;
    const started = performance.now();
    for (let count = s.revealed + 1; count <= target; count++) {
      if (!mounted.current) return;
      // 每次只公开一个号码；失败即停，已确认的进度和位置均保留。
      await api('PUT', { id: s.result.id, count });
      if (!mounted.current) return;
      save({ ...stateRef.current, revealed: count });
      if (count < target) {
        const nextAt = started + (count - s.revealed) * REVEAL_ALL_DURATION / Math.max(1, remaining - 1);
        const delay = nextAt - performance.now();
        if (delay > 0) await new Promise(resolve => window.setTimeout(resolve, delay));
      }
    }
  });
  const changeScene = (index: number) => {
    if (blocked || lock.current || maskingRef.current || index < 0 || index >= scenes.length) return;
    if (state.request && (!state.result || state.revealed < state.result.numbers.length)) { setError('请先完成本批号码揭晓，再切换场景。'); return; }
    if (state.rolling && !confirm('当前正在滚动，确定离开此场景？')) return;
    setError('');
    const completed = { ...state.completed };
    if (scenes[state.scene].draw && state.request && state.result && state.revealed === state.result.numbers.length) {
      completed[String(state.scene)] = { request: state.request, result: state.result, revealed: state.revealed, revealOrder: state.revealOrder };
    }
    const previous = completed[String(index)];
    const special = completed['15'];
    save({ ...state, completed, scene: index, rolling: false, request: previous?.request ?? null,
      result: previous?.result ?? (index === 16 ? special?.result : null) ?? null,
      revealed: previous?.revealed ?? (index === 16 ? special?.revealed : 0) ?? 0,
      revealOrder: previous?.revealOrder ?? (index === 16 ? special?.revealOrder : undefined) });
  };
  const redraw = () => perform(async () => {
    const s = stateRef.current;
    if (!s.result || s.result.numbers.length !== 1 || s.revealed !== 1) return;
    if (!confirm(`确认号码 ${formatNumber(s.result.numbers[0])} 无效并重抽？原记录会保留，号码不会再次被抽中。`)) return;
    await api('PUT', { id: s.result.id, action: 'invalidate', reason: '现场核验后确认无效，执行重抽' });
    const completed = { ...s.completed }; delete completed[String(s.scene)];
    save({ ...s, completed, request: null, result: null, revealed: 0, rolling: false, revealOrder: undefined });
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.repeat || (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,button,a,[contenteditable="true"]'))) return;
      if (event.key.toLowerCase() === 'h') { setControls(v => !v); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); changeScene(state.scene + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); changeScene(state.scene - 1); }
      if (event.code === 'Space' && scene.draw && !maskingRef.current) { event.preventDefault(); if (!state.rolling && !state.result) start(); else if (state.rolling) draw(); else reveal(); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });
  const updateDraft = (value: { title: string; count: number }) => save({ ...state, drafts: { ...state.drafts, [String(state.scene)]: value } });
  const slots = state.result?.numbers.length ?? (draft?.count || 0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (maskingStartedAt === null) return;
    const timer = window.setTimeout(() => {
      maskingRef.current = false;
      setMaskingStartedAt(null);
    }, Math.max(0, maskingStartedAt + MASK_DURATION - Date.now()));
    return () => window.clearTimeout(timer);
  }, [maskingStartedAt]);
  const view = useMemo(() => ready && config ? buildStageView(state, config, maskingStartedAt) : null,
    [ready, config, state, maskingStartedAt]);
  useStageBroadcast(view);
  const openScreen = () => {
    const screen = window.open('/admin/lottery/screen', 'wujian-lottery-screen', 'popup,width=1280,height=720');
    if (!screen) setError('大屏窗口未能打开，请允许此网站弹出窗口后重试。');
  };
  return <div className="director-layout">
    <LotteryStage view={view} />
    {controls && <aside className="controls">
      <div className="control-head"><strong>抽奖导播台</strong><button onClick={() => setControls(false)}>隐藏 H</button></div>
      <div className="buttons nav"><button onClick={openScreen}>打开纯净大屏 ↗</button></div>
      <p>将新窗口移到投影屏并按 F11 全屏；本窗口保留在电脑上操作。请使用同一浏览器、同一网站地址，并保持导播台打开。</p>
      <label>场景 <select value={state.scene} onChange={e => changeScene(Number(e.target.value))} disabled={blocked}>{scenes.map((s, i) => <option value={i} key={s.label}>{String(i + 1).padStart(2, '0')} · {s.label}</option>)}</select></label>
      <p>{scene.cue}</p>
      {scene.draw && draft && <>
        <div className="fields"><label>奖项<input value={draft.title} disabled={blocked || state.rolling || !!state.request} onChange={e => updateDraft({ ...draft, title: e.target.value })}/></label><label>人数<input type="number" min="1" max="100" value={draft.count || ''} disabled={blocked || state.rolling || !!state.request} onChange={e => updateDraft({ ...draft, count: Number(e.target.value) })}/></label></div>
        <p>号码范围：{config ? `${config.minNumber}–${config.maxNumber}` : '读取中'}；可在抽奖设置中修改。</p>
        <div className="buttons">
          <button disabled={blocked || state.rolling || !!state.request || !!state.result || !draft.title.trim() || !Number.isSafeInteger(draft.count) || draft.count < 1 || draft.count > 100} onClick={start}>开始滚动</button>
          <button disabled={blocked || !state.rolling} onClick={draw}>{state.request ? '重试确认' : '确认抽取'}</button>
          <button disabled={blocked || !state.result || state.revealed >= slots} onClick={() => reveal()}>随机揭晓下一个</button>
          <button disabled={blocked || !state.result || state.revealed >= slots} onClick={() => reveal(true)}>随机揭晓全部</button>
          {state.scene === 15 && <button className="danger" disabled={blocked || !state.result || slots !== 1 || state.revealed !== 1} onClick={redraw}>核验无效 · 重抽</button>}
        </div>
      </>}
      {scene.draw && <p>逐个随机点亮号码；揭晓全部通常约 1.2 秒，网络较慢时会延长。</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="buttons nav"><button disabled={blocked || state.scene === 0} onClick={() => changeScene(state.scene - 1)}>上一场</button><button disabled={blocked || state.scene === scenes.length - 1} onClick={() => changeScene(state.scene + 1)}>下一场</button></div>
      <p>空格：开始 / 确认 / 揭晓下一个<br/>方向键：切换场景　H：显示 / 隐藏控制</p>
    </aside>}
    {!controls && <button className="show-controls" onClick={() => setControls(true)}>控制 H</button>}
    <style jsx>{`
      .controls{position:fixed;right:12px;top:12px;z-index:10;background:#101a18ee;color:#edf5f0;border:1px solid #50645d;border-radius:8px;padding:14px;width:min(340px,95vw);max-height:95vh;overflow:auto;font:14px system-ui}.control-head{display:flex;justify-content:space-between;align-items:center;font-size:16px}.controls label{display:block;margin-top:8px}.controls select,.controls input{display:block;width:100%;background:#1c2d27;border:1px solid #52665c;color:white;padding:7px;border-radius:4px}.controls p{line-height:1.5;color:#b5c8bf;font-size:12px;margin:10px 0}.fields{display:grid;grid-template-columns:2fr 1fr;gap:8px}.buttons{display:flex;gap:6px;flex-wrap:wrap}.controls button,.show-controls{background:#25463a;border:1px solid #5d8976;color:#fff;padding:7px 10px;border-radius:4px}.controls button:disabled{opacity:.4}.controls .danger{background:#612b2b}.controls .error{color:#ff9c9c;font-size:14px}.nav{margin-top:12px}.show-controls{position:fixed;right:10px;top:10px;z-index:10;opacity:.5}
      @media(max-width:640px){
        .director-layout{min-height:100vh;background:#07100d}
        .director-layout :global(.lottery-stage){min-height:52svh}
        .controls{position:relative;inset:auto;width:auto;max-height:none;margin:0 12px 12px;overflow:visible}
        .controls select,.controls input{font-size:16px}
      }
    `}</style>
  </div>;
}

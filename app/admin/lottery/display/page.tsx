'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import LotteryStage from '@/components/lottery/LotteryStage';
import { awards, awardKeys, buildStageView, formatNumber, initialStage, program, restoreRevealOrder, scenes, STAGE_STATE_KEY, type Completed, type DrawRequest, type StageState } from '@/lib/lotteryStage';
import { useStageBroadcast } from '@/lib/useLotteryStageSync';
import type { LotteryConfig, LotteryResult, StageAward } from '@/types';

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function lotteryApi(method: string, body?: unknown, resource = 'draw') {
  const response = await fetch('/api/lottery/' + resource, {
    method, cache: 'no-store', headers: { Authorization: 'Bearer ' + (localStorage.getItem('adminToken') || ''), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || '请求失败，请重试', response.status);
  return data;
}

function completedBatch(request: DrawRequest, result: LotteryResult, order?: number[]): Completed {
  return { request: { ...request, id: result.id }, result, revealed: result.numbers.length,
    revealOrder: order ?? result.numbers.map((_, i) => i) };
}
const emptyBatch = { request: null, result: null, revealed: 0, revealOrder: undefined };

export default function LotteryDisplayPage() {
  const router = useRouter();
  const [state, setState] = useState<StageState>(initialStage);
  const latest = useRef(state);
  const lock = useRef(false);
  const countInput = useRef<HTMLInputElement>(null);
  const editingCount = useRef<{ original: number; closePanel: boolean } | null>(null);
  const [config, setConfig] = useState<LotteryConfig | null>(null);
  const [controls, setControls] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = (next: StageState) => {
    localStorage.setItem(STAGE_STATE_KEY, JSON.stringify(next));
    latest.current = next;
    setState(next);
  };

  useEffect(() => {
    let active = true;
    async function open() {
      if (!localStorage.getItem('adminToken')) { router.replace('/admin'); return; }
      const queue = localStorage.getItem('pendingLotteryResults');
      if (queue && queue !== '[]') throw new Error('请先处理旧版未提交的中奖记录。');
      const [settings, server] = await Promise.all([lotteryApi('GET', undefined, 'config'), lotteryApi('GET')]);
      if (!active) return;
      const cfg: LotteryConfig = settings.config;
      const raw = localStorage.getItem(STAGE_STATE_KEY);
      const saved: StageState = { ...initialStage, ...(raw ? JSON.parse(raw) : {}), usedNumbers: server.usedNumbers };
      const pending: LotteryResult | null = server.result;
      if (pending && pending.id !== saved.request?.id) throw new Error('另一台导播设备有尚未揭晓的旧批次，请在原设备完成揭晓。');
      const completed = { ...saved.completed };
      for (const key of awardKeys) {
        const index = awards[key].scene;
        const result: LotteryResult | undefined = server.awards[key];
        if (result) completed[index] = completedBatch({ id: result.id, award: key, config: { ...cfg, title: result.title, count: result.numbers.length } }, result);
        else if (completed[index]?.request.award) delete completed[index];
      }
      saved.completed = completed;
      if (!scenes[saved.scene]) saved.scene = 0;
      if (saved.scene === 3 || (saved.scene === 4 && !saved.request && !completed[4])) saved.scene = 1;
      const previous = completed[saved.scene] ?? (saved.scene === 16 ? completed[15] : undefined);
      if (previous) Object.assign(saved, previous, { rolling: saved.rolling && saved.result?.id === previous.result.id });
      else if (pending) Object.assign(saved, { result: pending, rolling: false, revealed: pending.revealedCount ?? 0,
        revealOrder: restoreRevealOrder(pending.numbers.length, pending.revealedCount ?? 0, saved.revealOrder) });
      else if (saved.request && saved.result && !saved.request.award) {
        // Older releases stored the current batch on leaving the scene. Recover its last confirmed state.
        Object.assign(saved, completedBatch(saved.request, saved.result, saved.revealOrder), { rolling: false });
        saved.completed[saved.scene] = completedBatch(saved.request, saved.result, saved.revealOrder);
      } else if (saved.request?.award && saved.result) Object.assign(saved, emptyBatch);
      saved.cueStartedAt ??= Date.now();
      save(saved);
      setConfig(cfg);
    }
    open().catch(e => { if (active) setError(e.message || '导播台恢复失败，请刷新重试'); });
    return () => { active = false; };
  }, [router]);

  const scene = scenes[state.scene];
  const draft = state.drafts[state.scene] ?? { title: scene.draw?.title ?? '', count: config?.awardCounts?.[scene.award] ?? scene.draw?.count ?? 1 };
  const valid = draft.title.trim() && Number.isSafeInteger(draft.count) && draft.count >= 1 && draft.count <= 100;
  const view = useMemo(() => config ? buildStageView(state, config, null) : null, [state, config]);
  useStageBroadcast(view);

  function move(index: number) {
    const s = latest.current;
    if (!config || lock.current || !scenes[index]) return;
    if (s.request && (!s.result || s.revealed < s.result.numbers.length)) {
      setControls(true); setError('请先重试本次开奖，再切换场景。'); return;
    }
    const previous = s.completed[index] ?? (index === 16 ? s.completed[15] : undefined);
    setError('');
    save({ ...s, ...emptyBatch, ...previous, scene: index, rolling: !!scenes[index].draw && !previous, cueStartedAt: Date.now() });
  }
  function step(direction: number) {
    const s = latest.current;
    const index = s.scene;
    if (direction < 0 && config && !lock.current && scenes[index].draw && s.result && !s.rolling && s.revealed === s.result.numbers.length) {
      save({ ...s, rolling: true, cueStartedAt: Date.now() });
      return;
    }
    const next = direction > 0 ? program.find(n => n > index) : [...program].reverse().find(n => n < index);
    if (next !== undefined) move(next);
  }
  async function perform(action: () => Promise<void>) {
    if (!config || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (e) {
      setControls(true);
      setError(e instanceof TypeError ? '连接中断。恢复网络后请重试本次操作。' : e instanceof Error ? e.message : '请求失败，请重试');
    }
    finally { lock.current = false; setBusy(false); }
  }
  function draw() {
    if (!config || !scene.draw || (!valid && !state.request)) return;
    void perform(async () => {
      const s = latest.current;
      if (s.result && s.revealed === s.result.numbers.length) return;
      const request: DrawRequest = s.request ?? { id: crypto.randomUUID(), award: scene.award, config: { ...config, ...draft } };
      save({ ...s, rolling: !s.result, request });
      let result: LotteryResult;
      try {
        result = s.result ?? (await lotteryApi('POST', request)).result;
        // Finish a pending draw made by the old two-step implementation with its original ID.
        if (!request.award) await lotteryApi('PUT', { id: result.id, count: result.numbers.length });
      } catch (e) {
        if (e instanceof ApiError && e.status === 400 && !s.result) save({ ...s, request: null, rolling: true });
        throw e;
      }
      const batch = completedBatch(request, result, s.revealOrder);
      save({ ...s, ...batch, rolling: false, cueStartedAt: Date.now(),
        completed: { ...s.completed, [s.scene]: batch }, usedNumbers: Array.from(new Set([...(s.usedNumbers ?? []), ...result.numbers])) });
    });
  }
  function advance() {
    if (!config || lock.current) return;
    if (scene.draw && state.rolling && state.result && state.revealed === state.result.numbers.length) {
      save({ ...state, rolling: false, cueStartedAt: Date.now() });
    } else if (scene.draw && (!state.result || state.revealed < state.result.numbers.length)) draw();
    else step(1);
  }
  function redraw() {
    void perform(async () => {
      const s = latest.current;
      if (s.scene !== 15 || !s.result || s.result.numbers.length !== 1 || s.revealed !== 1) return;
      if (!window.confirm('确认 ' + formatNumber(s.result.numbers[0]) + ' 核券无效并重新抽取特等奖？')) return;
      await lotteryApi('PUT', { id: s.result.id, action: 'invalidate', reason: '现场核券无效' });
      const completed = { ...s.completed }; delete completed[15];
      save({ ...s, ...emptyBatch, completed, rolling: true, cueStartedAt: Date.now() });
    });
  }

  useEffect(() => {
    if (!config || state.scene !== 12) return;
    const timer = window.setTimeout(() => move(15), Math.max(0, (state.cueStartedAt ?? Date.now()) + 10600 - Date.now()));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scene, state.cueStartedAt, config]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (e.target instanceof HTMLElement && e.target.closest('button,a') && [' ', 'enter'].includes(key)) return;
      if ([' ', 'enter', 'arrowright', 'pagedown'].includes(key)) advance();
      else if (key === 'arrowleft' || key === 'pageup') step(-1);
      else if (key === 'h') setControls(v => !v);
      else if (key === 'n' && scene.draw && !state.request && !busy && config) {
        editingCount.current = { original: draft.count, closePanel: !controls };
        setControls(true);
        requestAnimationFrame(() => { countInput.current?.focus(); countInput.current?.select(); });
      }
      else if (key === 'm') window.dispatchEvent(new Event('lottery-toggle-audio'));
      else if (key === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => setError('请按 F11 全屏'));
      else if (key === 'r') move(({ third: 0, second: 5, first: 8, grand: 11 })[scene.award]);
      else if (['1','2','3','4'].includes(key)) move([0,5,8,11][Number(key)-1]);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  const updateDraft = (value: typeof draft) => save({ ...latest.current, drafts: { ...latest.current.drafts, [state.scene]: value } });
  return <>
    <LotteryStage view={view} director />
    {controls && <aside className="controls" onClick={e => {
      if (e.target instanceof HTMLButtonElement && e.detail > 0) e.target.blur();
    }}>
      <div className="control-head"><strong>抽奖导播台</strong><button onClick={() => setControls(false)}>隐藏 H</button></div>
      <button onClick={() => { if (!window.open('/admin/lottery/screen','wujian-lottery-screen','popup,width=1280,height=720')) setError('请允许弹出窗口后重试'); }}>打开纯净大屏</button>
      <label>场景<select value={state.scene} disabled={busy || !config} onChange={e => { move(Number(e.target.value)); e.target.blur(); }}>
        {scenes.map((item, index) => (program.includes(index) || index === state.scene || state.completed[index]) && <option key={index} value={index}>{item.label}</option>)}
      </select></label>
      {scene.draw && <div className="fields">
        <label>奖项<input value={state.result?.title ?? draft.title} disabled={busy || !!state.request} onChange={e => updateDraft({ ...draft, title: e.target.value })} /></label>
        <label>本场名额<input ref={countInput} type="number" min="1" max="100" value={state.result?.numbers.length ?? (draft.count || '')} disabled={busy || !!state.request}
          onChange={e => updateDraft({ ...draft, count: Number(e.target.value) })}
          onBlur={() => { editingCount.current = null; }}
          onKeyDown={e => {
            if (e.key !== 'Enter' && e.key !== 'Escape') return;
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Enter' && !valid) { setError('名额须为 1 至 100 的整数'); return; }
            const edit = editingCount.current;
            if (edit && e.key === 'Escape') updateDraft({ ...draft, count: edit.original });
            if (edit?.closePanel) setControls(false);
            setError(''); e.currentTarget.blur();
          }} /></label>
      </div>}
      {error && <p role="alert">{error}</p>}
      <div className="nav"><button disabled={busy || !config || state.scene === 0} onClick={() => step(-1)}>上一幕</button>
        <button disabled={busy || !config || state.scene === 17 || (!!scene.draw && !state.request && !valid)} onClick={advance}>
          {scene.draw && (!state.result || state.revealed < state.result.numbers.length) ? state.request ? '重试开奖' : '确认开奖' : '下一幕'}</button></div>
      {state.scene === 15 && state.result?.numbers.length === 1 && state.revealed === 1 && <button onClick={redraw} disabled={busy}>核券无效 · 重抽</button>}
      <p>空格推进或开奖，← 回上一幕，1–4 选奖，N 改名额，R 重看入场，M 切换音效，F 全屏，H 收起导播台。</p>
    </aside>}
    <style jsx>{`
      .controls{position:fixed;right:16px;top:16px;z-index:10;background:#101a18f5;color:#edf5f0;border:1px solid #50645d;border-radius:8px;padding:16px;width:min(330px,94vw);max-height:94vh;overflow:auto;font:15px/1.5 system-ui}
      .control-head,.nav,.fields{display:flex;align-items:center;gap:10px}.control-head{justify-content:space-between;margin-bottom:12px}
      .controls label{display:block;margin-top:10px}.fields label{flex:1;min-width:0}.controls select,.controls input{display:block;width:100%;background:#1c2d27;border:1px solid #52665c;color:white;padding:6px;border-radius:4px}
      .controls button{padding:6px 10px;background:#25463a;border:1px solid #5d8976;color:white;border-radius:4px}.controls button:disabled{opacity:.45}.nav{margin:12px 0}.controls p{color:#c1ccc6;margin:8px 0 0}.controls p[role=alert]{color:#ffad9b}
    `}</style>
  </>;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import LotteryStage, { type StageCue, type StageFilm } from '@/components/lottery/LotteryStage';
import { isTicketRange, MAX_TICKET_NUMBER } from '@/public/wujiandao/tickets.mjs';
import { awards, awardKeys, buildStageView, chapterStart, chapterStarts, formatNumber, initialStage, isSteppedAward, program, restoreRevealOrder, scenes, STAGE_STATE_KEY, type Completed, type DrawRequest, type StageState } from '@/lib/lotteryStage';
import { useStageBroadcast } from '@/lib/useLotteryStageSync';
import type { LotteryConfig, LotteryResult } from '@/types';

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

function completedBatch(request: DrawRequest, result: LotteryResult, order?: number[], revealed = result.revealedCount ?? result.numbers.length): Completed {
  return { request: { ...request, id: result.id }, result, revealed,
    revealOrder: order ?? result.numbers.map((_, i) => i) };
}
const emptyBatch = { request: null, result: null, revealed: 0, revealOrder: undefined, replacementSeat: undefined };
const panelPreference = 'wujian-lottery-director-panel';

function newDrawId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // A director may run on a local HTTP address where only getRandomValues is available.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export default function LotteryDisplayPage() {
  const router = useRouter();
  const [state, setState] = useState<StageState>(initialStage);
  const latest = useRef(state);
  const lock = useRef(false);
  const film = useRef<StageFilm | null>(null);
  const [paintedCue, setPaintedCue] = useState<StageCue | null>(null);
  const countInput = useRef<HTMLInputElement>(null);
  const editingCount = useRef<{ closePanel: boolean } | null>(null);
  const [countText, setCountText] = useState<string | null>(null);
  const [config, setConfig] = useState<LotteryConfig | null>(null);
  const [controls, setControls] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ticketChoice, setTicketChoice] = useState('');
  useEffect(() => {
    setControls(sessionStorage.getItem(panelPreference) !== 'hidden');
  }, []);

  function rememberControls(open: boolean) {
    sessionStorage.setItem(panelPreference, open ? 'shown' : 'hidden');
    setControls(open);
  }

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
      const stageAwardIds = new Set(Object.values(server.awards as Record<string, LotteryResult | undefined>).filter((r): r is LotteryResult => !!r).map(r => r.id));
      if (pending && !stageAwardIds.has(pending.id) && pending.id !== saved.request?.id) throw new Error('另一台导播设备有尚未揭晓的旧批次，请在原设备完成揭晓。');
      const completed = { ...saved.completed };
      let partialScene: number | null = null;
      for (const key of awardKeys) {
        const index = awards[key].scene;
        const result: LotteryResult | undefined = server.awards[key];
        if (result) {
          const revealed = result.revealedCount ?? result.numbers.length;
          const earlier = completed[index]?.result.id === result.id ? completed[index] : saved.result?.id === result.id ? saved : undefined;
          completed[index] = completedBatch({ id: result.id, award: key, config: { ...cfg, title: result.title, count: result.numbers.length } },
            result, earlier ? restoreRevealOrder(result.numbers.length, revealed, earlier.revealOrder) : undefined, revealed);
          if (revealed < result.numbers.length) partialScene = index;
        }
        else if (completed[index]?.request.award) delete completed[index];
      }
      saved.completed = completed;
      if (!scenes[saved.scene]) saved.scene = 0;
      if (saved.scene === 3 || (saved.scene === 4 && !saved.request && !completed[4])) saved.scene = 1;
      if (saved.scene === 16 && !completed[15]) saved.scene = 15;
      const previous = completed[saved.scene] ?? (saved.scene === 16 ? completed[15] : undefined);
      if (completed[15]?.result.pendingTicket !== undefined) {
        Object.assign(saved, completed[15], { scene: 15, rolling: true, replacementSeat: undefined });
      } else if (partialScene !== null) {
        Object.assign(saved, completed[partialScene], { scene: partialScene, rolling: false, replacementSeat: undefined });
      } else if (previous) Object.assign(saved, previous, { rolling: saved.rolling && saved.result?.id === previous.result.id && saved.result?.pendingTicket === undefined });
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
    open().catch(e => {
      if (!active) return;
      setControls(true);
      setError(e.message || '导播台恢复失败，请刷新重试');
    });
    return () => { active = false; };
  }, [router]);

  const scene = scenes[state.scene];
  const draft = state.drafts[state.scene] ?? { title: scene.draw?.title ?? '', count: config?.awardCounts?.[scene.award] ?? scene.draw?.count ?? 1 };
  const valid = draft.title.trim() && draft.title.length <= 100 && Number.isSafeInteger(draft.count) && draft.count >= 1 && draft.count <= 100;
  const available = useMemo(() => {
    if (!config || !isTicketRange(config.minNumber, config.maxNumber)) return 0;
    const taken = new Set(state.usedNumbers?.filter(n => n >= config.minNumber && n <= config.maxNumber));
    return config.maxNumber - config.minNumber + 1 - taken.size;
  }, [config, state.usedNumbers]);
  const replacing = state.result?.pendingTicket !== undefined;
  let capacityNotice = '';
  if (scene.draw && config && !state.request) {
    if (!isTicketRange(config.minNumber, config.maxNumber)) capacityNotice = `请在抽奖设置中将票号范围设在 0000 至 ${MAX_TICKET_NUMBER} 之间，保存后刷新导播台。`;
    else if (draft.count > available) capacityNotice = `本档设为 ${draft.count} 人，当前可抽 ${available} 个号码。${available ? '按 N 调整名额。' : '请先检查号码范围。'}`;
  }
  const view = useMemo(() => config ? buildStageView(state, config, null) : null, [state, config]);
  useStageBroadcast(view);

  function move(index: number, replayRoll = false) {
    const s = latest.current;
    if (!config || lock.current || !scenes[index]) return;
    if (s.result?.pendingTicket !== undefined) { setControls(true); setError('请先确认当前席位的补抽'); return; }
    if (s.request && (!s.result || s.revealed < s.result.numbers.length)) {
      setControls(true); setError(s.result ? '请先完成本档剩余席位的揭晓，再切换场景。' : '请先重试本次开奖，再切换场景。'); return;
    }
    const previous = s.completed[index] ?? (index === 16 ? s.completed[15] : undefined);
    setError(''); setTicketChoice('');
    setCountText(null); editingCount.current = null;
    save({ ...s, ...emptyBatch, ...previous, scene: index, rolling: !!scenes[index].draw && (!previous || replayRoll), cueStartedAt: Date.now() });
  }
  function step(direction: number) {
    const s = latest.current;
    const index = s.scene;
    if (direction < 0 && config && !lock.current && scenes[index].draw && s.result && s.rolling && s.revealed > 0 && s.revealed < s.result.numbers.length) {
      save({ ...s, rolling: false, cueStartedAt: Date.now() });
      return;
    }
    if (direction < 0 && config && !lock.current && scenes[index].draw && s.result && !s.rolling && s.revealed === s.result.numbers.length) {
      save({ ...s, rolling: true, replacementSeat: undefined, cueStartedAt: Date.now() });
      return;
    }
    const next = direction > 0 ? program.find(n => n > index) : [...program].reverse().find(n => n < index);
    if (next !== undefined) move(next, direction > 0 && !scenes[index].draw && scenes[index].award === scenes[next].award);
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
    if (capacityNotice) { setControls(true); return; }
    void perform(async () => {
      const s = latest.current;
      if (s.result && s.revealed === s.result.numbers.length) return;
      const request: DrawRequest = s.request ?? { id: newDrawId(), award: scene.award, config: { ...config, ...draft } };
      const stepped = request.award ? isSteppedAward(request.award, request.config.count) : false;
      save({ ...s, rolling: !s.result, request });
      let result: LotteryResult;
      try {
        result = s.result ?? (await lotteryApi('POST', stepped ? { ...request, revealCount: 1 } : request)).result;
        // Finish a pending draw made by the old two-step implementation with its original ID.
        if (!request.award) await lotteryApi('PUT', { id: result.id, count: result.numbers.length });
      } catch (e) {
        if (e instanceof ApiError && e.status === 400 && !s.result) save({ ...s, request: null, rolling: true });
        throw e;
      }
      const revealed = request.award ? (result.revealedCount ?? result.numbers.length) : result.numbers.length;
      const batch = completedBatch(request, result, s.revealOrder, revealed);
      save({ ...s, ...batch, rolling: result.pendingTicket !== undefined, cueStartedAt: Date.now(),
        completed: { ...s.completed, [s.scene]: batch }, usedNumbers: Array.from(new Set([...(s.usedNumbers ?? []), ...result.numbers.slice(0, revealed)])) });
    });
  }
  function revealNext() {
    void perform(async () => {
      const s = latest.current;
      if (!s.result || !s.request || s.revealed >= s.result.numbers.length) return;
      const nextCount = s.revealed + 1;
      await lotteryApi('PUT', { id: s.result.id, count: nextCount });
      const updatedResult: LotteryResult = nextCount >= s.result.numbers.length
        ? (() => { const copy = { ...s.result }; delete copy.revealedCount; return copy; })()
        : { ...s.result, revealedCount: nextCount };
      const batch = completedBatch(s.request, updatedResult, s.revealOrder, nextCount);
      save({ ...s, ...batch, rolling: false, cueStartedAt: Date.now(),
        completed: { ...s.completed, [s.scene]: batch }, usedNumbers: Array.from(new Set([...(s.usedNumbers ?? []), ...updatedResult.numbers.slice(0, nextCount)])) });
    });
  }
  function advance() {
    if (!config || lock.current) return;
    const s = latest.current, here = scenes[s.scene];
    if (here.draw && (!s.request || !!s.result)) {
      const cue = film.current?.advanceCue(here.film, s.cueStartedAt);
      if (!cue || cue.action === 'wait') return;
      if (cue.action === 'finish') { save({ ...s, cueStartedAt: cue.startedAt }); return; }
    }
    if (here.draw && s.rolling && s.result?.pendingTicket !== undefined) {
      updateTicket('replace', s.result.pendingTicket);
    } else if (here.draw && s.result && s.revealed < s.result.numbers.length) {
      if (s.rolling) revealNext();
      else save({ ...s, rolling: true, cueStartedAt: Date.now() });
    } else if (here.draw && s.rolling && s.result && s.revealed === s.result.numbers.length) {
      save({ ...s, rolling: false, cueStartedAt: Date.now() });
    } else if (here.draw && !s.result) draw();
    else step(1);
  }
  function updateTicket(action: 'withdraw' | 'replace', number: number) {
    void perform(async () => {
      const s=latest.current;
      if (!s.result || !s.request) return;
      const withdrawn = s.result.numbers.indexOf(number);
      const { result }: {result: LotteryResult} = await lotteryApi('PUT', { id:s.result.id, action, number, reason:'现场核券无效' });
      const batch=completedBatch(s.request,result,s.revealOrder);
      const seat=withdrawn<0?undefined:batch.revealOrder?.[withdrawn];
      save({ ...s, ...batch, completed:{...s.completed,15:batch}, scene:15, rolling:result.pendingTicket !== undefined,
        replacementSeat:seat, cueStartedAt:Date.now(), usedNumbers:Array.from(new Set([...(s.usedNumbers??[]),number,...result.numbers])) });
      setTicketChoice('');
    });
  }
  function redraw() {
    const current = latest.current;
    if (!current.result || current.rolling || current.revealed !== current.result.numbers.length) return;
    if (available < 1) { setError('已无可抽号码，请先核对号码范围'); return; }
    if (current.result.numbers.length > 1) {
      const number = Number(ticketChoice);
      if (!ticketChoice || !current.result.numbers.includes(number)) return;
      if (window.confirm('确认奖券 '+formatNumber(number)+' 无效？此席位将单独滚号，其余中奖票继续有效。')) updateTicket('withdraw',number);
      return;
    }
    void perform(async () => {
      const s = latest.current;
      if ((s.scene !== 15 && s.scene !== 16) || s.rolling || !s.result || s.result.numbers.length !== 1 || s.revealed !== 1) return;
      if (!window.confirm('确认 ' + formatNumber(s.result.numbers[0]) + ' 核券无效并重新抽取特等奖？')) return;
      await lotteryApi('PUT', { id: s.result.id, action: 'invalidate', reason: '现场核券无效' });
      const completed = { ...s.completed }; delete completed[15];
      save({ ...s, ...emptyBatch, completed, scene: 15, rolling: true, drafts:{...s.drafts,15:{title:s.result.title,count:1}}, cueStartedAt: Date.now() });
    });
  }

  useEffect(() => {
    const autoNext: Record<number, [number, number]> = { 0: [1, 12300], 8: [9, 9800], 11: [12, 8100] };
    const next = autoNext[state.scene];
    if (!config || !next) return;
    const timer = window.setTimeout(() => {
      if (latest.current.scene === state.scene) move(next[0]);
    }, Math.max(0, (state.cueStartedAt ?? Date.now()) + next[1] - Date.now()));
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
      else if (key === 'h') rememberControls(!controls);
      else if (key === 'n' && scene.draw && !state.request && !busy && config) {
        const edit = { closePanel: !controls };
        editingCount.current = edit;
        setControls(true);
        requestAnimationFrame(() => {
          if (editingCount.current !== edit) return;
          countInput.current?.focus();
          countInput.current?.select();
        });
      }
      else if (key === 'm') window.dispatchEvent(new Event('lottery-toggle-audio'));
      else if (key === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => setError('请按 F11 全屏'));
      else if (key === 'r') move(chapterStart(state.scene));
      else if (['1','2','3','4'].includes(key)) move(chapterStarts[Number(key)-1]);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  const updateDraft = (value: typeof draft) => save({ ...latest.current, drafts: { ...latest.current.drafts, [state.scene]: value } });
  function finishCount(text: string, cancel: boolean, close: boolean) {
    const edit = editingCount.current;
    if (!edit) return;
    const count = Number(text);
    const acceptable = text.trim() !== '' && Number.isInteger(count) && count >= 1 && count <= 100;
    const problem = !acceptable ? '名额须为 1 至 100 的整数' : count > available ? `当前可抽 ${available} 个号码` : '';
    if (!cancel && problem && close) { setError(problem); return; }
    editingCount.current = null; setCountText(null);
    if (!cancel && !problem && count !== draft.count) updateDraft({ ...draft, count });
    setError(cancel || !problem ? '' : problem + '，名额仍为 ' + draft.count);
    if (close) {
      if (edit.closePanel) setControls(false);
      countInput.current?.blur();
    }
  }
  const phase=paintedCue?.film===scene.film && paintedCue.startedAt===state.cueStartedAt ? paintedCue.phase : 'painting';
  const pending=!!state.request && !state.result;
  const partial=!!state.result && state.revealed<state.result.numbers.length;
  function nextAction(){
    if(!config)return '载入导播台…';
    if(busy)return '处理中…';
    if(pending)return '重试开奖';
    if(state.scene===17)return '已结束';
    if(scene.draw){
      if(phase==='painting')return '画面就绪中…';
      if(phase==='entering')return '快进到滚号';
      if(partial){
        if(phase==='revealing')return '快进到当前号码';
        return state.rolling?`确认开奖（第 ${state.revealed+1}/${state.result!.numbers.length} 位）`:`滚动第 ${state.revealed+1}/${state.result!.numbers.length} 位`;
      }
      if(phase==='revealing')return '快进到完整名单';
      if(phase==='rolling'){
        if(replacing)return '确认补抽';
        if(state.result)return '揭晓原号码';
        return isSteppedAward(scene.award, draft.count)?`确认开奖（第 1/${draft.count} 位）`:'确认开奖';
      }
    }
    const next=program.find(index=>index>state.scene);
    if(next!==undefined && scenes[next].draw)return '进入滚号';
    if(next===7)return '进入幕间';
    if(state.scene===7)return '开始第二场';
    if(next===16)return '进入核券';
    return '下一幕';
  }
  const preparing=!!scene.draw && !pending && phase==='painting';
  return <>
    <LotteryStage view={view} director filmRef={film} onCue={setPaintedCue} />
    {controls && <aside className="controls" onClick={e => {
      if (e.target instanceof HTMLButtonElement && e.detail > 0) e.target.blur();
    }}>
      <div className="control-head"><strong>抽奖导播台</strong><button onClick={() => rememberControls(false)}>隐藏 H</button></div>
      <button onClick={() => { if (!window.open('/admin/lottery/screen','wujian-lottery-screen','popup,width=1280,height=720')) setError('请允许弹出窗口后重试'); }}>打开纯净大屏</button>
      <label>场景<select value={state.scene} disabled={busy || !config} onChange={e => { move(Number(e.target.value)); e.target.blur(); }}>
        {scenes.map((item, index) => (program.includes(index) || index === state.scene || state.completed[index]) && <option key={index} value={index}>{item.label}</option>)}
      </select></label>
      {scene.draw && <div className="fields">
        <label>奖项<input value={state.result?.title ?? draft.title} maxLength={100} disabled={busy || !!state.request} onChange={e => updateDraft({ ...draft, title: e.target.value })} /></label>
        <label>本场名额<input ref={countInput} type="number" min="1" max="100" value={state.result?.numbers.length ?? countText ?? draft.count} disabled={busy || !!state.request}
          onFocus={() => { editingCount.current ??= { closePanel: false }; }}
          onChange={e => setCountText(e.target.value)}
          onBlur={e => finishCount(e.currentTarget.value, false, false)}
          onKeyDown={e => {
            if (e.key !== 'Enter' && e.key !== 'Escape') return;
            e.preventDefault(); e.stopPropagation();
            finishCount(e.currentTarget.value, e.key === 'Escape', true);
          }} /></label>
      </div>}
      {(error || capacityNotice) && <p role="alert">{error || capacityNotice}</p>}
      <div className="nav"><button disabled={busy || !config || state.scene === 0} onClick={() => step(-1)}>上一幕</button>
        <button disabled={busy || !config || preparing || state.scene === 17 || (!!scene.draw && !state.request && (!valid || !!capacityNotice))} onClick={advance}>
          {nextAction()}</button></div>
      {(state.scene === 15 || state.scene === 16) && phase==='held' && !state.rolling && state.result && state.revealed === state.result.numbers.length && <>
        {state.result.numbers.length>1 && <label>未通过核验的票号<select value={ticketChoice} disabled={busy} onChange={e=>{setTicketChoice(e.target.value);e.target.blur();}}>
          <option value="">选择票号</option>
          {(state.scene===16?view?.heroNumbers:view?.slots)?.map(n=>n!==null && <option key={n} value={n}>{formatNumber(n)}</option>)}
        </select></label>}
        <button onClick={redraw} disabled={busy || (state.result.numbers.length>1 && !ticketChoice)}>核券无效 · 重抽</button>
      </>}
      <p>入场和显影中按空格可快进。号码滚动时按空格开奖，定格后再按进入下一幕。← 回退，1–4 选奖，N 改名额，R 重看入场，M 切换音效，F 全屏，H 收起导播台。</p>
    </aside>}
    <style jsx>{`
      .controls{position:fixed;right:16px;top:16px;z-index:10;background:#101a18f5;color:#edf5f0;border:1px solid #50645d;border-radius:8px;padding:16px;width:min(330px,94vw);max-height:94vh;overflow:auto;font:15px/1.5 system-ui}
      .control-head,.nav,.fields{display:flex;align-items:center;gap:10px}.control-head{justify-content:space-between;margin-bottom:12px}
      .controls label{display:block;margin-top:10px}.fields label{flex:1;min-width:0}.controls select,.controls input{display:block;width:100%;background:#1c2d27;border:1px solid #52665c;color:white;padding:6px;border-radius:4px}
      .controls button{padding:6px 10px;background:#25463a;border:1px solid #5d8976;color:white;border-radius:4px}.controls button:disabled{opacity:.45}.nav{margin:12px 0}.controls p{color:#c1ccc6;margin:8px 0 0}.controls p[role=alert]{color:#ffad9b}
    `}</style>
  </>;
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { DanmakuReview, DanmakuSettings } from '@/types';

type GuardStats = { day: string; rateLimited: number; duplicates: number; banned: number };
const fieldClass = 'w-full mt-1 rounded-lg border border-gray-300 bg-white p-2 text-gray-900';
const statusNames = { pending: '转人工审核', approved: '自动通过', rejected: '自动拦截' };

export default function DanmakuSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<DanmakuSettings | null>(null);
  const [allowText, setAllowText] = useState('');
  const [blockText, setBlockText] = useState('');
  const [stats, setStats] = useState<GuardStats | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sample, setSample] = useState('');
  const [preview, setPreview] = useState<DanmakuReview | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) { router.push('/admin'); return; }
    const controller = new AbortController();
    fetch('/api/admin/danmaku-settings', {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
    }).then(async response => {
      if (response.status === 401) { router.push('/admin'); return; }
      if (!response.ok) throw new Error('获取配置失败');
      const data = await response.json();
      if (controller.signal.aborted) return;
      setSettings(data.settings);
      setAllowText(data.settings.moderation.allowPhrases.join('\n'));
      setBlockText(data.settings.moderation.blockTerms.join('\n'));
      setStats(data.stats);
    }).catch(() => { if (!controller.signal.aborted) setError('获取配置失败，请刷新页面重试'); });
    return () => controller.abort();
  }, [router]);

  const draft = (): DanmakuSettings => ({
    ...settings!,
    moderation: {
      ...settings!.moderation,
      allowPhrases: allowText.split('\n').map(line => line.trim()).filter(Boolean),
      blockTerms: blockText.split('\n').map(line => line.trim()).filter(Boolean),
    },
  });

  const updateRate = (patch: Partial<DanmakuSettings['rateLimit']>) => {
    setSettings(current => current && ({ ...current, rateLimit: { ...current.rateLimit, ...patch } }));
    setNotice('');
    setPreview(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setNotice(''); setError('');
    try {
      const response = await fetch('/api/admin/danmaku-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
        body: JSON.stringify(draft()),
      });
      if (response.status === 401) { router.push('/admin'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存失败');
      setSettings(data.settings);
      setNotice('已保存，立即用于新提交的弹幕；已有审核结果不变。');
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(false); }
  };

  const testSample = async () => {
    setTesting(true); setPreview(null); setError('');
    try {
      const response = await fetch('/api/admin/danmaku-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
        body: JSON.stringify({ content: sample, settings: draft() }),
      });
      if (response.status === 401) { router.push('/admin'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '预览失败');
      setPreview(data.review);
    } catch (error) { setError(error instanceof Error ? error.message : '预览失败'); }
    finally { setTesting(false); }
  };

  const refreshStats = async () => {
    try {
      const response = await fetch('/api/admin/danmaku-settings', {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }, cache: 'no-store',
      });
      if (response.status === 401) { router.push('/admin'); return; }
      if (!response.ok) throw new Error();
      setStats((await response.json()).stats);
      setError('');
    } catch { setError('刷新统计失败，请重试'); }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-gray-800">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between gap-3 items-center">
          <h1 className="text-2xl font-bold">限流与自动审核</h1>
          <Link href="/admin/danmaku" className="rounded-lg bg-white px-4 py-2 shadow-sm">返回弹幕管理</Link>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-700">{notice}</p>}
        {stats && (
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex justify-between gap-3 mb-3">
              <h2 className="font-semibold">今日拦截统计（{stats.day}，北京时间）</h2>
              <button type="button" onClick={refreshStats} className="text-blue-700">刷新统计</button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[[stats.rateLimited, '超出频率'], [stats.duplicates, '重复内容'], [stats.banned, '已封禁 IP 的请求']].map(([count, label]) => (
                <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-2xl font-bold">{count}</p><p className="text-sm">{label}</p></div>
              ))}
            </div>
            <p className="mt-3 text-sm text-gray-600">以上请求不进入审核队列；内容规则拦截的弹幕可在“已拦截”列表复核。</p>
          </section>
        )}
        {!settings && !error && <p>加载中...</p>}
        {settings && (
          <form onSubmit={save} className="space-y-6">
            <fieldset disabled={saving || testing} className="space-y-6">
            <section className="rounded-xl bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold">发送限制</h2>
              <label className="flex gap-2 items-center"><input type="checkbox" checked={settings.rateLimit.enabled}
                onChange={event => updateRate({ enabled: event.target.checked })} />启用服务端限流</label>
              <div className="grid sm:grid-cols-3 gap-4">
                <label>同一浏览器最短间隔（秒）<input type="number" min={1} max={60} required className={fieldClass}
                  value={settings.rateLimit.intervalSeconds} onChange={event => updateRate({ intervalSeconds: Number(event.target.value) })} /></label>
                <label>同一浏览器每分钟最多（条）<input type="number" min={1} max={600} required className={fieldClass}
                  value={settings.rateLimit.clientPerMinute} onChange={event => updateRate({ clientPerMinute: Number(event.target.value) })} /></label>
                <label>同一 IP 每分钟最多（条）<input type="number" min={1} max={10000} required className={fieldClass}
                  value={settings.rateLimit.ipPerMinute} onChange={event => updateRate({ ipPerMinute: Number(event.target.value) })} /></label>
              </div>
              <label className="flex gap-2 items-center"><input type="checkbox" checked={settings.rateLimit.rejectDuplicates}
                onChange={event => updateRate({ rejectDuplicates: event.target.checked })} />限流开启时，过滤同一浏览器一分钟内的重复内容</label>
              <p className="text-sm text-gray-600">校园网可能多人共用出口 IP，请根据彩排情况调整 IP 上限。IPv6 按 /64 网段合计。观众提交后统一看到“发送成功”，不会展示限流规则。</p>
            </section>
            <section className="rounded-xl bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold">自动审核辅助</h2>
              <label className="flex gap-2 items-center"><input type="checkbox" checked={settings.moderation.enabled}
                onChange={event => { setSettings({ ...settings, moderation: { ...settings.moderation, enabled: event.target.checked } }); setPreview(null); setNotice(''); }} />启用规则审核</label>
              <p className="text-sm text-gray-600">优先拦截禁用词；完整匹配允许短句才自动通过；其他内容交给人工。关闭后，新弹幕全部待审。词表无法覆盖所有语境和变体。</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <label>自动通过短句（每行一条，最多 200 条）<textarea rows={8} className={fieldClass} value={allowText}
                  onChange={event => { setAllowText(event.target.value); setPreview(null); setNotice(''); }} />
                  <span className="text-sm text-gray-600">可忽略末尾常用语气标点，例如“加油！”；附加其他文字仍交给人工。</span></label>
                <label>自动拦截词（每行一条，最多 200 条）<textarea rows={8} className={fieldClass} value={blockText}
                  onChange={event => { setBlockText(event.target.value); setPreview(null); setNotice(''); }} />
                  <span className="text-sm text-gray-600">包含即拦截，忽略大小写、全半角、空白和分隔标点；管理员可复核误判。</span></label>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 space-y-2">
                <label htmlFor="sample">用当前编辑中的规则试审（不发送弹幕）</label>
                <div className="flex gap-2"><input id="sample" maxLength={40} className={fieldClass} value={sample}
                  onChange={event => { setSample(event.target.value); setPreview(null); }} placeholder="例如：加油！" />
                  <button type="button" disabled={testing || !sample.trim()} onClick={testSample}
                    className="shrink-0 rounded-lg bg-slate-700 text-white px-4 disabled:opacity-50">{testing ? '试审中…' : '试审'}</button></div>
                {preview && <p role="status" className="text-sm">{statusNames[preview.status]} · {preview.reason}</p>}
              </div>
              <p className="text-sm text-gray-600">保存只影响新提交的弹幕。通过或拦截的记录会标注原因，可在弹幕管理中手动修改。</p>
            </section>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-6 py-3 text-white disabled:opacity-50">{saving ? '保存中…' : '保存并生效'}</button>
            </fieldset>
          </form>
        )}
      </div>
    </main>
  );
}

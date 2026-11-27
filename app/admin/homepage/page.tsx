'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ArticleLink, HomepageLinks } from '@/lib/homepageLinks';

const fieldClass = 'mt-1 w-full rounded-lg border border-[#712e3a]/30 bg-white px-3 py-2';

export default function AdminHomepage() {
  const router = useRouter();
  const [settings, setSettings] = useState<HomepageLinks | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const token = localStorage.getItem('adminToken');
    if (!token) { router.replace('/admin'); return; }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/homepage', {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal,
      });
      if (response.status === 401) { router.replace('/admin'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '载入首页内容失败');
      setSettings(data.settings);
      setConflict(false);
    } catch (error) {
      if (!signal?.aborted) setError(error instanceof Error ? error.message : '载入首页内容失败');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings || saving || conflict) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/homepage', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken') ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      if (response.status === 401) { router.replace('/admin'); return; }
      if (response.status === 409) setConflict(true);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存首页内容失败');
      setSettings(data.settings);
      setNotice('已发布，刷新首页即可看到更新。');
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存首页内容失败');
    } finally {
      setSaving(false);
    }
  };

  const editArticle = (index: number, field: keyof ArticleLink, value: string) => {
    if (!settings) return;
    setNotice('');
    setSettings({ ...settings, articles: settings.articles.map((article, i) =>
      i === index ? { ...article, [field]: value } : article) });
  };

  return (
    <main className="festival-backdrop min-h-screen px-4 py-8 text-[#2c1821]">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">首页内容</h1>
          <div className="flex gap-4 text-sm font-medium">
            <Link href="/admin/dashboard" className="underline">返回控制台</Link>
            <a href="/" target="_blank" rel="noopener noreferrer" className="underline">预览首页 ↗</a>
          </div>
        </header>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
        {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{notice}</p>}
        {loading && <p role="status">正在载入首页内容…</p>}
        {!loading && (!settings || conflict) && (
          <button type="button" onClick={() => void load()} className="rounded-lg bg-white px-4 py-2 font-medium">
            {conflict ? '放弃本次编辑并载入最新内容' : '重新载入'}
          </button>
        )}
        {settings && (
          <form onSubmit={publish}>
            <fieldset disabled={saving || loading || conflict} className="space-y-5">
              <section className="rounded-2xl border border-white/50 bg-white/40 p-4 shadow-lg backdrop-blur-lg sm:p-6" aria-labelledby="video-heading">
                <h2 id="video-heading" className="mb-3 text-xl font-bold">宣传片</h2>
                <label className="block font-medium">
                  B 站视频链接
                  <input type="url" className={fieldClass} value={settings.videoUrl}
                    onChange={event => { setNotice(''); setSettings({ ...settings, videoUrl: event.target.value }); }} />
                </label>
                <p className="mt-2 text-sm text-[#684752]">使用完整视频链接可在首页播放。分享短链接会打开 B 站。清空后隐藏宣传片。</p>
              </section>
              <section className="space-y-4 rounded-2xl border border-white/50 bg-white/40 p-4 shadow-lg backdrop-blur-lg sm:p-6" aria-labelledby="articles-heading">
                <h2 id="articles-heading" className="text-xl font-bold">公众号文章</h2>
                {settings.articles.map((article, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border border-[#712e3a]/20 bg-white/30 p-3 sm:p-4">
                    <label className="min-w-0">
                      文章标题
                      <input required className={fieldClass} value={article.title} onChange={event => editArticle(index, 'title', event.target.value)} />
                    </label>
                    <label className="min-w-0">
                      微信文章链接
                      <input type="url" required className={fieldClass} value={article.url} onChange={event => editArticle(index, 'url', event.target.value)} />
                    </label>
                    <button type="button" aria-label={`移除第 ${index + 1} 条文章`} onClick={() => {
                      setNotice('');
                      setSettings({ ...settings, articles: settings.articles.filter((_, i) => i !== index) });
                    }} className="justify-self-start rounded-lg border border-red-200 px-3 py-2 text-red-800">移除</button>
                  </div>
                ))}
                <button type="button" onClick={() => {
                  setNotice('');
                  setSettings({ ...settings, articles: [...settings.articles, { title: '', url: '' }] });
                }} className="rounded-lg border border-[#712e3a]/40 px-4 py-2 font-medium">添加文章</button>
              </section>
              <button type="submit" className="rounded-lg bg-[#772938] px-5 py-3 font-bold text-white disabled:opacity-60">
                {saving ? '发布中…' : '保存并发布'}
              </button>
            </fieldset>
          </form>
        )}
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { Danmaku, DanmakuPage, DanmakuFilter, DanmakuReviewStatus } from '@/types';

export default function AdminDanmakuPage() {
  const [danmakus, setDanmakus] = useState<Danmaku[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<DanmakuFilter>('pending');
  const [exporting, setExporting] = useState(false);
  const [bannedIps, setBannedIps] = useState<string[]>([]);
  const [showBannedList, setShowBannedList] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [stats, setStats] = useState({ total: 0, approved: 0, pending: 0, rejected: 0 });
  const [error, setError] = useState('');
  const [submissionOpen, setSubmissionOpen] = useState<boolean | null>(null);
  const [updatingSubmission, setUpdatingSubmission] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const router = useRouter();

  const normalizeIpLocal = (ipStr?: string) => {
    if (!ipStr) return '';
    let ip = ipStr.replace(/^\[|\]$/g, '');
    ip = ip.split('%')[0];
    const match = ip.match(/(?:.*::ffff:)?(\d+\.\d+\.\d+\.\d+)$/i);
    if (match) return match[1];
    return ip;
  };

  const fetchDanmakus = useCallback(async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) { router.push('/admin'); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch(`/api/danmaku?page=${page}&pageSize=50&status=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (response.status === 401) { router.push('/admin'); return; }
      if (!response.ok) throw new Error('获取弹幕失败');
      const data: DanmakuPage & { submissionOpen: boolean } = await response.json();
      if (controller.signal.aborted) return;
      setDanmakus(data.danmakus);
      setPagination(data.pagination);
      setStats(data.stats);
      setSubmissionOpen(data.submissionOpen);
      setPage(data.pagination.page);
      setError('');
    } catch (error) {
      if (!controller.signal.aborted) setError('获取弹幕失败，稍后自动重试');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [page, filter, router]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden) await fetchDanmakus();
      if (!disposed) timer = setTimeout(poll, 3000);
    };
    poll();
    return () => { disposed = true; clearTimeout(timer); requestRef.current?.abort(); };
  }, [fetchDanmakus]);

  useEffect(() => { fetchBannedIps(); }, []);

  const updateSubmission = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      router.replace('/admin');
      return;
    }

    setUpdatingSubmission(true);
    setSubmissionError('');
    try {
      const response = await fetch('/api/danmaku', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ submissionOpen: !submissionOpen }),
      });
      if (response.status === 401) {
        router.replace('/admin');
        return;
      }
      if (!response.ok) throw new Error('更新弹幕发送状态失败');
      const data = await response.json();
      requestRef.current?.abort();
      setSubmissionOpen(data.submissionOpen);
    } catch (error) {
      setSubmissionError('更新弹幕发送状态失败，请重试');
    } finally {
      setUpdatingSubmission(false);
    }
  };

  const deleteDanmaku = async (id: string) => {
    if (!confirm('确定要删除这条弹幕吗？')) return;
    
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setDeleting(id);
    try {
      const response = await fetch('/api/danmaku', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });

      if (response.ok) {
        await fetchDanmakus();
      } else {
        console.error('删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
    } finally {
      setDeleting(null);
    }
  };

  // 筛选弹幕
  const filteredDanmakus = danmakus;

  const clearAllDanmakus = async () => {
    if (!confirm('确定要清空所有弹幕吗？')) return;

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const response = await fetch('/api/danmaku', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error('清空弹幕失败');
      await fetchDanmakus();
    } catch (error) {
      console.error('清空弹幕失败:', error);
    }
  };

  const fetchBannedIps = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const response = await fetch('/api/admin/banned-ips', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setBannedIps(data.ips || []);
    } catch (error) {
      console.error('获取封禁IP列表失败:', error);
    }
  };

  const banIp = async (ip: string) => {
    if (!confirm(`确认封禁 IP ${ip} 吗？`)) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
  const response = await fetch('/api/admin/banned-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ip }),
      });
      const result = await response.json();
      if (response.ok) {
        // 如果后端返回规范化 ip，则使用后端返回的 ip 来更新本地列表
        const addedIp = result.ip || ip;
        setBannedIps((prev) => {
          if (prev.includes(addedIp)) return prev;
          return [...prev, addedIp];
        });
        // 重新拉取以确保和服务端一致
        fetchBannedIps();
        // 刷新弹幕列表以反映取消审核的历史弹幕
        fetchDanmakus();
        // 显示提示，告知取消了多少已审核弹幕
        if (result.affected && result.affected > 0) {
          alert(`已封禁 ${addedIp}，并取消了 ${result.affected} 条已审核弹幕`);
        } else {
          alert(`已封禁 ${addedIp}`);
        }
      } else {
        alert(result.error || '封禁失败');
      }
    } catch (error) {
      console.error('封禁IP失败:', error);
    }
  };

  const unbanIp = async (ip: string) => {
    if (!confirm(`确认解封 IP ${ip} 吗？`)) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const response = await fetch('/api/admin/banned-ips', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ip }),
      });
      const result = await response.json();
      if (response.ok) {
        const removedIp = result.ip || ip;
        setBannedIps((prev) => prev.filter((p) => p !== removedIp));
        // 为了避免 UI 与服务端不同步，重新拉取一次最新封禁列表
        fetchBannedIps();
        // 刷新弹幕列表（虽然解封不自动恢复历史弹幕为已审核，但可保持 UI 最新）
        fetchDanmakus();
        alert(`已解封 ${removedIp}`);
      } else {
        alert(result.error || '解封失败');
      }
    } catch (error) {
      console.error('解封IP失败:', error);
    }
  };

  const exportDanmakus = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      setExporting(true);
      const entries: Danmaku[] = [];
      let cursor = 0;
      let snapshot: number | undefined;
      let hasMore = true;
      while (hasMore) {
        const params = new URLSearchParams({ after: String(cursor), status: filter });
        if (snapshot !== undefined) params.set('snapshot', String(snapshot));
        const response = await fetch(`/api/danmaku/export?${params}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('导出弹幕失败');
        const batch: { danmakus: Danmaku[]; nextCursor: number; snapshot: number; hasMore: boolean } = await response.json();
        entries.push(...batch.danmakus);
        cursor = batch.nextCursor;
        snapshot = batch.snapshot;
        hasMore = batch.hasMore;
      }
      entries.sort((a, b) => b.timestamp - a.timestamp);
      // 构建表头
      const rows: (string | number)[][] = [["时间", "IP", "审核状态", "审核来源", "审核原因", "内容"]];
      entries.forEach(d => {
        rows.push([
          new Date(d.timestamp).toLocaleString('zh-CN'),
          d.ip || '',
          d.censor ? '已通过' : d.review?.status === 'rejected' ? '已拦截' : '待审核',
          d.review?.source === 'auto' ? '自动' : d.review?.source === 'manual' ? '人工' : '历史数据',
          d.review?.reason || '',
          d.content || '',
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '弹幕导出');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `danmakus_${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('导出失败:', err);
      alert('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  const setReview = async (id: string, status: DanmakuReviewStatus) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const response = await fetch('/api/danmaku', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, reviewStatus: status }),
      });

      if (response.ok) {
        await fetchDanmakus();
      } else {
        setError('更新审核状态失败，请重试');
      }
    } catch (error) {
      setError('更新审核状态失败，请重试');
    }
  };

  if (loading) {
    return (
      <div 
        className="festival-backdrop min-h-screen flex items-center justify-center"
      >
        <div className="text-gray-800 text-xl font-semibold drop-shadow-lg backdrop-blur-lg bg-white/30 rounded-2xl border border-white/20 p-8">
          加载中...
        </div>
      </div>
    );
  }

  return (
    <div 
      className="festival-backdrop min-h-screen p-4"
    >
      <div className="max-w-4xl mx-auto">
        <div className="backdrop-blur-lg bg-white/30 rounded-2xl border border-white/20 shadow-2xl p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-800 drop-shadow-lg">弹幕管理</h1>
              
              <label className="text-sm text-gray-800">审核状态
                <select value={filter} onChange={e => { setPage(1); setFilter(e.target.value as DanmakuFilter); }}
                  className="ml-2 p-2 rounded-lg bg-white/70">
                  <option value="pending">待审核</option>
                  <option value="approved">已通过</option>
                  <option value="rejected">已拦截</option>
                  <option value="all">全部弹幕</option>
                </select>
              </label>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/danmaku/settings" className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                限流与自动审核
              </Link>
              <button
                onClick={exportDanmakus}
                disabled={exporting || filteredDanmakus.length === 0}
                className="px-4 py-2 backdrop-blur-md bg-white/20 border border-white/30 text-gray-800 rounded-xl hover:bg-white/30 transition-all disabled:opacity-50"
              >
                {exporting ? '导出中...' : '导出弹幕 (Excel)'}
              </button>
              <button
                onClick={() => setShowBannedList((s) => !s)}
                className="px-4 py-2 backdrop-blur-md bg-white/20 border border-white/30 text-gray-800 rounded-xl hover:bg-white/30 transition-all"
              >
                封禁 IP 列表 ({bannedIps.length})
              </button>
              <button
                onClick={clearAllDanmakus}
                className="px-6 py-2 backdrop-blur-md bg-white/20 border border-white/30 text-gray-800 rounded-xl hover:bg-white/30 transition-all"
              >
                清空弹幕
              </button>
              <Link
                href="/admin/dashboard"
                className="px-6 py-2 backdrop-blur-md bg-white/20 border border-white/30 text-gray-800 rounded-xl hover:bg-white/30 transition-all"
              >
                返回控制台
              </Link>
            </div>
          </div>
          {submissionOpen !== null && (
            <section aria-label="弹幕发送" className="mb-6 rounded-xl border border-white/30 bg-white/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p role="status" className="font-medium text-gray-800">
                  {submissionOpen ? '弹幕发送已开放' : '弹幕发送已关闭'}
                </p>
                <button
                  type="button"
                  onClick={updateSubmission}
                  disabled={updatingSubmission}
                  className={`rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50 ${
                    submissionOpen ? 'bg-gray-600 hover:bg-gray-700' : 'bg-[#743a43] hover:bg-[#633139]'
                  }`}
                >
                  {updatingSubmission ? '提交中…' : submissionOpen ? '暂停发送' : '开放弹幕发送'}
                </button>
              </div>
              {submissionError && <p role="alert" className="mt-2 text-sm text-red-700">{submissionError}</p>}
            </section>
          )}
          {showBannedList && (
            <div className="mt-4 p-4 bg-white/10 rounded-xl border border-white/20">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">封禁 IP 列表 ({bannedIps.length})</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!confirm('确认清空所有封禁 IP 吗？')) return;
                      const token = localStorage.getItem('adminToken');
                      if (!token) return;
                      try {
                        const response = await fetch('/api/admin/banned-ips', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({}),
                        });
                        if (response.ok) {
                          setBannedIps([]);
                        } else {
                          const data = await response.json();
                          alert(data.error || '清空失败');
                        }
                      } catch (err) {
                        console.error('清空封禁失败:', err);
                      }
                    }}
                    className="px-3 py-1 bg-red-500/60 text-white rounded-lg text-sm"
                  >
                    清空封禁
                  </button>
                  <button
                    onClick={() => setShowBannedList(false)}
                    className="px-3 py-1 bg-white/20 text-gray-800 rounded-lg text-sm"
                  >
                    关闭
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {bannedIps.map(ip => (
                  <div key={ip} className="flex justify-between items-center">
                    <div className="text-sm text-gray-700">{ip}</div>
                    <div>
                      <button
                        onClick={() => unbanIp(ip)}
                        className="px-3 py-1 bg-green-500/60 text-white rounded-lg text-sm"
                      >
                        解封
                      </button>
                    </div>
                  </div>
                ))}
                {bannedIps.length === 0 && (
                  <div className="text-sm text-gray-500">暂无封禁 IP</div>
                )}
              </div>
            </div>
          )}

          {/* 统计信息 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-xl">
              <div className="text-sm text-blue-600 mb-1">
                弹幕总数
              </div>
              <div className="text-3xl font-bold text-blue-700">
                {stats.total}
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-xl">
              <div className="text-sm text-green-600 mb-1">已通过</div>
              <div className="text-3xl font-bold text-green-700">
                {stats.approved}
              </div>
            </div>
            <div className="bg-purple-50 p-4 rounded-xl">
              <div className="text-sm text-purple-600 mb-1">待审核</div>
              <div className="text-3xl font-bold text-purple-700">
                {stats.pending}
              </div>
            </div>
            <div className="bg-red-50 p-4 rounded-xl">
              <div className="text-sm text-red-600 mb-1">已拦截</div>
              <div className="text-3xl font-bold text-red-700">{stats.rejected}</div>
            </div>
          </div>

          {error && <p className="text-red-700 mb-3" role="alert">{error}</p>}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-gray-800">
            <button onClick={() => setPage(p => p - 1)} disabled={page <= 1}
              className="px-4 py-2 rounded-lg bg-white/40 disabled:opacity-40">上一页</button>
            <span>第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 条</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pagination.totalPages}
              className="px-4 py-2 rounded-lg bg-white/40 disabled:opacity-40">下一页</button>
          </div>
          {/* 弹幕列表 */}
          {filteredDanmakus.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4 text-gray-500">
                {filter === 'pending' ? '🎯' : '📝'}
              </div>
              <p className="text-gray-600 text-lg">
                当前筛选下暂无弹幕
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredDanmakus.map((danmaku) => (
                <div
                  key={danmaku.id}
                  className={`rounded-xl p-4 transition-all backdrop-blur-sm border border-white/20 ${
                    danmaku.censor 
                      ? 'bg-white/10' 
                      : 'bg-purple-400/20 border-purple-300/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center mb-2">
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded backdrop-blur-md border ${
                            danmaku.censor
                              ? 'bg-green-400/20 border-green-300/30 text-green-700'
                              : 'bg-purple-400/20 border-purple-300/30 text-purple-700'
                          }`}
                        >
                          {danmaku.censor ? '已通过' : danmaku.review?.status === 'rejected' ? '已拦截' : '待审核'}
                        </span>
                      </div>
                      <p className="text-gray-800 text-lg mb-2 drop-shadow-lg break-all whitespace-normal">
                        {danmaku.content}
                      </p>
                      <p className="text-sm text-gray-600 drop-shadow-lg">
                        {new Date(danmaku.timestamp).toLocaleString('zh-CN')}
                      </p>
                      {danmaku.ip && (
                        <p className="text-xs text-gray-500 mt-1">IP: {danmaku.ip}</p>
                      )}
                      {danmaku.review && (
                        <p className="text-xs text-gray-600 mt-1 break-words">
                          {danmaku.review.source === 'auto' ? '自动审核' : '人工审核'} · {danmaku.review.reason}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 flex flex-col gap-2">
                      <button
                        onClick={() => setReview(danmaku.id, danmaku.censor ? 'pending' : 'approved')}
                        className={`px-4 py-2 rounded-lg font-medium transition-all backdrop-blur-md border text-white ${
                          danmaku.censor
                            ? 'bg-gray-500/60 border-gray-400/50 hover:bg-gray-500/80'
                            : 'bg-green-500/60 border-green-400/50 hover:bg-green-500/80'
                        }`}
                      >
                        {danmaku.censor ? '撤回待审' : '审核通过'}
                      </button>
                      {!danmaku.censor && (
                        <button onClick={() => setReview(danmaku.id, danmaku.review?.status === 'rejected' ? 'pending' : 'rejected')}
                          className="px-4 py-2 rounded-lg bg-orange-600 text-white">
                          {danmaku.review?.status === 'rejected' ? '转回待审' : '拦截'}
                        </button>
                      )}
                      <button
                        onClick={() => deleteDanmaku(danmaku.id)}
                        disabled={deleting === danmaku.id}
                        className="px-4 py-2 rounded-lg font-medium transition-all backdrop-blur-md bg-red-500/60 border border-red-400/50 text-white hover:bg-red-500/80 disabled:opacity-50"
                      >
                        {deleting === danmaku.id ? '删除中...' : '删除'}
                      </button>
                      {danmaku.ip && (
                        <button
                          onClick={() => (bannedIps.includes(normalizeIpLocal(danmaku.ip)) ? unbanIp(danmaku.ip!) : banIp(danmaku.ip!))}
                          className={`px-4 py-2 rounded-lg font-medium transition-all backdrop-blur-md border text-white ${
                            bannedIps.includes(normalizeIpLocal(danmaku.ip))
                              ? 'bg-yellow-500/60 border-yellow-400/50 hover:bg-yellow-500/80'
                              : 'bg-red-500/60 border-red-400/50 hover:bg-red-500/80'
                          }`}
                        >
                          {bannedIps.includes(normalizeIpLocal(danmaku.ip)) ? '解封IP' : '封禁IP'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

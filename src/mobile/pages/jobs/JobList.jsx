import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import JobCard from './JobCard';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'Chờ XN', label: 'Chờ XN' },
  { id: 'Đang làm', label: 'Đang làm' },
  { id: 'Hoàn thành', label: 'Xong' },
];

export default function JobList({ user, tenantId, onOpenJob }) {
  const [jobs, setJobs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [techFilter, setTechFilter] = useState('all');
  const [viewTab, setViewTab] = useState('my'); // 'my' | 'all'
  const [permLevel, setPermLevel] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Load permission
  useEffect(() => {
    if (!user?.id || !tenantId) return;
    const loadPerm = async () => {
      const { data: u } = await supabase
        .from('users').select('role')
        .eq('id', user.id).single();
      if (u?.role === 'Admin' || u?.role === 'admin' || u?.role === 'Manager') {
        setPermLevel(3);
        return;
      }
      const { data: perm } = await supabase
        .from('user_permissions').select('permission_level')
        .eq('user_id', user.id).eq('module', 'technical').single();
      setPermLevel(perm?.permission_level || 1);
    };
    loadPerm();
  }, [user?.id, tenantId]);

  // Load jobs — server-side filter + pagination
  const loadJobs = useCallback(async (pg = 1, append = false) => {
    if (!tenantId) return;
    if (pg === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0);
      const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

      const from = (pg - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('technical_jobs')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
        .order('scheduled_date', { ascending: false })
        .order('scheduled_time', { ascending: false })
        .range(from, to);

      // Server-side "Của tôi" filter
      if (viewTab === 'my' || permLevel < 2) {
        const safe = (user?.name || '').replace(/"/g, '\\"');
        query = query.or(`created_by.eq."${safe}",technicians.cs.["${safe}"]`);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, count, error } = await query;
      if (!error) {
        if (append) {
          setJobs(prev => [...prev, ...(data || [])]);
        } else {
          setJobs(data || []);
        }
        setTotalCount(count || 0);
        setPage(pg);
      }
    } catch (err) {
      console.error('Error loading jobs:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tenantId, selectedMonth, statusFilter, viewTab, permLevel, user?.name]);

  useEffect(() => { loadJobs(1); }, [loadJobs]);

  // Realtime
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase.channel(`mobile-joblist-${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'technical_jobs',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => loadJobs(1))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantId, loadJobs]);

  // Get unique technicians from loaded jobs for filter dropdown
  const allTechs = useMemo(() => {
    const set = new Set();
    jobs.forEach(j => (j.technicians || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [jobs]);

  // Client-side tech filter (additional filter on loaded results)
  const filtered = useMemo(() => {
    if (techFilter === 'all') return jobs;
    return jobs.filter(j => (j.technicians || []).includes(techFilter));
  }, [jobs, techFilter]);

  const hasMore = page * PAGE_SIZE < totalCount;
  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore) loadJobs(page + 1, true);
  }, [hasMore, loadingMore, page, loadJobs]);

  const handleMonthChange = (delta) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setTechFilter('all');
  };

  const handleViewTabChange = (tab) => {
    setViewTab(tab);
    setTechFilter('all');
  };

  const monthLabel = (() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  })();

  return (
    <div className="mjob-list-view">
      {/* View tabs: My / All */}
      {permLevel >= 2 && (
        <div className="mjob-view-tabs">
          <button className={`mjob-view-tab ${viewTab === 'my' ? 'active' : ''}`} onClick={() => handleViewTabChange('my')}>
            Của tôi
          </button>
          <button className={`mjob-view-tab ${viewTab === 'all' ? 'active' : ''}`} onClick={() => handleViewTabChange('all')}>
            Tất cả
          </button>
        </div>
      )}

      {/* Month selector */}
      <div className="mjob-month-nav">
        <button onClick={() => handleMonthChange(-1)}>◀</button>
        <span>{monthLabel}</span>
        <button onClick={() => handleMonthChange(1)}>▶</button>
      </div>

      {/* Status filter */}
      <div className="mjob-status-tabs">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s.id}
            className={`mjob-status-tab ${statusFilter === s.id ? 'active' : ''}`}
            onClick={() => setStatusFilter(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Tech filter */}
      {allTechs.length > 0 && (
        <div className="mjob-tech-filter">
          <select value={techFilter} onChange={e => setTechFilter(e.target.value)} className="mjob-tech-select">
            <option value="all">Tất cả KTV</option>
            {allTechs.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Count */}
      <div className="mjob-count">
        {totalCount} công việc{filtered.length < totalCount ? ` (${filtered.length} hiển thị)` : ''}
      </div>

      {/* Job list */}
      <div className="mjob-list">
        {loading ? (
          <div className="mjob-empty">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="mjob-empty">Không có công việc nào</div>
        ) : (
          <>
            {filtered.map(job => (
              <JobCard key={job.id} job={job} onClick={() => onOpenJob(job)} />
            ))}
            {hasMore && (
              <button
                className="mjob-load-more"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

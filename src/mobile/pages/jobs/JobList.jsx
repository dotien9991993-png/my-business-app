import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import JobCard from './JobCard';

const STATUS_OPTIONS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'Chờ XN', label: 'Chờ XN' },
  { id: 'Đang làm', label: 'Đang làm' },
  { id: 'Hoàn thành', label: 'Xong' },
];

export default function JobList({ user, tenantId, onOpenJob }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
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

  // Load jobs
  const loadJobs = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0);
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

    let query = supabase
      .from('technical_jobs')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('scheduled_date', monthStart)
      .lte('scheduled_date', monthEnd)
      .order('scheduled_date', { ascending: false })
      .order('scheduled_time', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (!error) setJobs(data || []);
    setLoading(false);
  }, [tenantId, selectedMonth, statusFilter]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Realtime
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase.channel(`mobile-joblist-${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'technical_jobs',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => loadJobs())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantId, loadJobs]);

  // Get unique technicians for filter
  const allTechs = useMemo(() => {
    const set = new Set();
    jobs.forEach(j => (j.technicians || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [jobs]);

  // Filter jobs
  const filtered = useMemo(() => {
    let result = jobs;

    // View tab filter
    if (viewTab === 'my' || permLevel < 2) {
      result = result.filter(j =>
        j.created_by === user?.name ||
        (j.technicians || []).includes(user?.name)
      );
    }

    // Tech filter
    if (techFilter !== 'all') {
      result = result.filter(j => (j.technicians || []).includes(techFilter));
    }

    return result;
  }, [jobs, viewTab, permLevel, user?.name, techFilter]);

  const handleMonthChange = (delta) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
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
          <button className={`mjob-view-tab ${viewTab === 'my' ? 'active' : ''}`} onClick={() => setViewTab('my')}>
            Của tôi
          </button>
          <button className={`mjob-view-tab ${viewTab === 'all' ? 'active' : ''}`} onClick={() => setViewTab('all')}>
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
      <div className="mjob-count">{filtered.length} công việc</div>

      {/* Job list */}
      <div className="mjob-list">
        {loading ? (
          <div className="mjob-empty">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="mjob-empty">Không có công việc nào</div>
        ) : (
          filtered.map(job => (
            <JobCard key={job.id} job={job} onClick={() => onOpenJob(job)} />
          ))
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';

const PAGE_SIZE = 30;

export function useMobileJobs(userId, userName, tenantId) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    tab: 'my',          // 'my' | 'all'
    status: 'all',      // all | Chờ XN | Đang làm | Hoàn thành | Hủy
    dateRange: 'all',   // all | today | week | month
  });
  const [permLevel, setPermLevel] = useState(1);

  // Load permission
  useEffect(() => {
    if (!userId || !tenantId) return;
    const loadPerm = async () => {
      const { data: user } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      if (user?.role === 'Admin' || user?.role === 'admin' || user?.role === 'Manager') {
        setPermLevel(3);
        return;
      }
      const { data: perm } = await supabase
        .from('user_permissions')
        .select('permission_level')
        .eq('user_id', userId)
        .eq('module', 'technical')
        .single();
      setPermLevel(perm?.permission_level || 1);
    };
    loadPerm();
  }, [userId, tenantId]);

  // Load jobs
  const loadJobs = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('technical_jobs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('scheduled_date', { ascending: false })
        .order('scheduled_time', { ascending: false })
        .limit(PAGE_SIZE);

      // Status filter
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      // Date range filter
      if (filters.dateRange !== 'all') {
        const now = new Date();
        const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const todayStr = vnNow.toLocaleDateString('en-CA');

        if (filters.dateRange === 'today') {
          query = query.eq('scheduled_date', todayStr);
        } else if (filters.dateRange === 'week') {
          const weekLater = new Date(vnNow);
          weekLater.setDate(weekLater.getDate() + 7);
          query = query
            .gte('scheduled_date', todayStr)
            .lte('scheduled_date', weekLater.toLocaleDateString('en-CA'));
        } else if (filters.dateRange === 'month') {
          const monthStart = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, '0')}-01`;
          const monthEnd = new Date(vnNow.getFullYear(), vnNow.getMonth() + 1, 0);
          query = query
            .gte('scheduled_date', monthStart)
            .lte('scheduled_date', monthEnd.toLocaleDateString('en-CA'));
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      let result = data || [];

      // Filter by permission / tab
      if (filters.tab === 'my' || permLevel < 2) {
        result = result.filter(j =>
          j.created_by === userName ||
          (j.technicians || []).includes(userName)
        );
      }

      setJobs(result);
    } catch (err) {
      console.error('Error loading jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, userName, permLevel, filters]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Realtime
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase.channel(`mobile-jobs-${tenantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'technical_jobs',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => { loadJobs(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, loadJobs]);

  // Update job status
  const updateJobStatus = useCallback(async (jobId, newStatus) => {
    const { error } = await supabase
      .from('technical_jobs')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (error) throw error;
  }, []);

  // Add expense
  const addExpense = useCallback(async (jobId, expense, currentExpenses = []) => {
    const newExpense = {
      id: Date.now(),
      ...expense,
      addedBy: userName,
      addedAt: new Date().toISOString(),
    };
    const updated = [...currentExpenses, newExpense];
    const { error } = await supabase
      .from('technical_jobs')
      .update({ expenses: updated })
      .eq('id', jobId);
    if (error) throw error;
    return updated;
  }, [userName]);

  // Update filters
  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  return {
    jobs,
    loading,
    filters,
    permLevel,
    updateFilter,
    updateJobStatus,
    addExpense,
    refresh: loadJobs,
  };
}

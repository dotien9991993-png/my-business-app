import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';

const PAGE_SIZE = 20;

export function useMobileMedia(userId, userName, tenantId) {
  const [tasks, setTasks] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    tab: 'my',        // 'my' | 'all'
    status: 'all',    // all | Đang Làm | Chờ Duyệt | Đã Duyệt | Hoàn Thành
    dateRange: 'all', // all | today | week | month | overdue
  });
  const [permLevel, setPermLevel] = useState(1);

  // Load permission level for media module
  useEffect(() => {
    if (!userId || !tenantId) return;
    const loadPerm = async () => {
      const { data: user } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      if (user?.role === 'Admin' || user?.role === 'admin') {
        setPermLevel(3);
        return;
      }
      const { data: perm } = await supabase
        .from('user_permissions')
        .select('permission_level')
        .eq('user_id', userId)
        .eq('module', 'media')
        .single();
      setPermLevel(perm?.permission_level || 1);
    };
    loadPerm();
  }, [userId, tenantId]);

  // Load tasks — server-side filter + pagination
  const loadTasks = useCallback(async (pg = 1, append = false) => {
    if (!tenantId || !userName) return;
    if (pg === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const from = (pg - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('tasks')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(from, to);

      // Server-side "Của tôi" filter — check all roles user can have
      if (filters.tab === 'my' || permLevel < 2) {
        const safe = userName.replace(/"/g, '\\"');
        query = query.or(
          `assignee.eq."${safe}",created_by.eq."${safe}",cameramen.cs.["${safe}"],editors.cs.["${safe}"],actors.cs.["${safe}"]`
        );
      }

      // Status filter
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      // Date range filter
      if (filters.dateRange === 'overdue') {
        const now = new Date();
        const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const todayStr = vnNow.toLocaleDateString('en-CA');
        query = query.lt('due_date', todayStr).neq('status', 'Hoàn Thành');
      } else if (filters.dateRange !== 'all') {
        const now = new Date();
        const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const todayStr = vnNow.toLocaleDateString('en-CA');

        if (filters.dateRange === 'today') {
          query = query
            .gte('due_date', todayStr + 'T00:00:00')
            .lte('due_date', todayStr + 'T23:59:59');
        } else if (filters.dateRange === 'week') {
          const weekLater = new Date(vnNow);
          weekLater.setDate(weekLater.getDate() + 7);
          query = query
            .gte('due_date', todayStr + 'T00:00:00')
            .lte('due_date', weekLater.toLocaleDateString('en-CA') + 'T23:59:59');
        } else if (filters.dateRange === 'month') {
          const monthEnd = new Date(vnNow.getFullYear(), vnNow.getMonth() + 1, 0);
          const monthStart = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, '0')}-01`;
          query = query
            .gte('due_date', monthStart + 'T00:00:00')
            .lte('due_date', monthEnd.toLocaleDateString('en-CA') + 'T23:59:59');
        }
      }

      const { data, count, error } = await query;
      if (error) throw error;

      if (append) {
        setTasks(prev => [...prev, ...(data || [])]);
      } else {
        setTasks(data || []);
      }
      setTotalCount(count || 0);
      setPage(pg);
    } catch (err) {
      console.error('Error loading tasks:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tenantId, userName, permLevel, filters]);

  useEffect(() => { loadTasks(1); }, [loadTasks]);

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase.channel(`mobile-tasks-${tenantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => { loadTasks(1); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, loadTasks]);

  // Update task status
  const updateTaskStatus = useCallback(async (taskId, newStatus) => {
    const now = new Date().toISOString();
    const updateData = { status: newStatus, updated_at: now };

    if (newStatus === 'Đã Quay') updateData.filmed_at = now;
    if (newStatus === 'Đang Edit') updateData.edit_started_at = now;
    if (newStatus === 'Hoàn Thành') {
      updateData.edited_at = now;
      updateData.completed_at = now;
    }

    const { error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId);

    if (error) throw error;
  }, []);

  // Add comment
  const addComment = useCallback(async (taskId, text, currentComments = []) => {
    const now = new Date();
    const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const timeStr = `${String(vnNow.getDate()).padStart(2, '0')}/${String(vnNow.getMonth() + 1).padStart(2, '0')} ${String(vnNow.getHours()).padStart(2, '0')}:${String(vnNow.getMinutes()).padStart(2, '0')}`;

    const newComment = {
      user: userName,
      text,
      time: timeStr,
    };

    const updatedComments = [...currentComments, newComment];

    const { error } = await supabase
      .from('tasks')
      .update({ comments: updatedComments, updated_at: new Date().toISOString() })
      .eq('id', taskId);

    if (error) throw error;
    return updatedComments;
  }, [userName]);

  // Update filters
  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const hasMore = page * PAGE_SIZE < totalCount;
  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore) loadTasks(page + 1, true);
  }, [hasMore, loadingMore, page, loadTasks]);

  return {
    tasks,
    totalCount,
    loading,
    loadingMore,
    filters,
    permLevel,
    updateFilter,
    updateTaskStatus,
    addComment,
    hasMore,
    loadMore,
    refresh: () => loadTasks(1),
  };
}

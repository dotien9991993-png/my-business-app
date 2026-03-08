import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';

export function useMobileMedia(userId, userName, tenantId) {
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
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

  // Load ALL tasks — giống hệt desktop (DataContext.jsx loadTasks)
  const loadTasks = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllTasks(data || []);
    } catch (err) {
      console.error('Error loading tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase.channel(`mobile-tasks-${tenantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => { loadTasks(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, loadTasks]);

  // Client-side filter — giống hệt desktop MyTasksView.jsx line 31-37
  const tasks = useMemo(() => {
    let result = allTasks;

    // "Của tôi" filter — check 5 fields giống desktop
    if (filters.tab === 'my' || permLevel < 2) {
      result = result.filter(t =>
        t.assignee === userName ||
        t.created_by === userName ||
        (t.cameramen || []).includes(userName) ||
        (t.editors || []).includes(userName) ||
        (t.actors || []).includes(userName)
      );
    }

    // Status filter
    if (filters.status !== 'all') {
      result = result.filter(t => t.status === filters.status);
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
      const todayStr = vnNow.toLocaleDateString('en-CA');

      if (filters.dateRange === 'overdue') {
        result = result.filter(t =>
          t.due_date && t.due_date < todayStr && t.status !== 'Hoàn Thành'
        );
      } else if (filters.dateRange === 'today') {
        result = result.filter(t =>
          t.due_date && t.due_date.startsWith(todayStr)
        );
      } else if (filters.dateRange === 'week') {
        const weekLater = new Date(vnNow);
        weekLater.setDate(weekLater.getDate() + 7);
        const weekStr = weekLater.toLocaleDateString('en-CA');
        result = result.filter(t =>
          t.due_date && t.due_date >= todayStr && t.due_date <= weekStr
        );
      } else if (filters.dateRange === 'month') {
        const monthStart = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, '0')}-01`;
        const monthEnd = new Date(vnNow.getFullYear(), vnNow.getMonth() + 1, 0);
        const monthEndStr = monthEnd.toLocaleDateString('en-CA');
        result = result.filter(t =>
          t.due_date && t.due_date >= monthStart && t.due_date <= monthEndStr
        );
      }
    }

    return result;
  }, [allTasks, userName, permLevel, filters]);

  // Update task status + create notification
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

    // Create notification for task assignee / admins
    try {
      const task = allTasks.find(t => t.id === taskId);
      if (!task) return;

      const statusIcons = { 'Đã Quay': '📹', 'Đang Edit': '✂️', 'Chờ Duyệt': '🔵', 'Hoàn Thành': '✅' };
      const icon = statusIcons[newStatus] || '🎬';

      const recipients = new Set();

      // Notify admins
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('role', ['Admin', 'admin', 'Manager'])
        .neq('id', userId);
      (admins || []).forEach(a => recipients.add(a.id));

      // Notify task creator if different
      if (task.created_by_user_id && task.created_by_user_id !== userId) {
        recipients.add(task.created_by_user_id);
      }

      const notifications = [...recipients].map(uid => ({
        tenant_id: tenantId,
        user_id: uid,
        type: 'task_status_changed',
        title: `${icon} ${task.title || 'Task'}`,
        message: `${userName} cập nhật → ${newStatus}`,
        icon,
        reference_type: 'task',
        reference_id: taskId,
        created_by: userId,
        is_read: false,
      }));

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }
    } catch (_) { /* non-critical */ }
  }, [allTasks, userId, userName, tenantId]);

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

  return {
    tasks,
    allTasks,
    loading,
    filters,
    permLevel,
    updateFilter,
    updateTaskStatus,
    addComment,
    refresh: loadTasks,
  };
}

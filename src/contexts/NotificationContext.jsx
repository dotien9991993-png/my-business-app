import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { formatMoney } from '../utils/formatUtils';
import { isAdmin } from '../utils/permissionUtils';
import { useApp } from './AppContext';
import { playNotificationSound, playAlertSound, showBrowserNotification } from '../utils/notificationSound';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { tenant, currentUser, allUsers } = useApp();

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Load notifications từ Supabase
  const loadNotifications = useCallback(async () => {
    if (!tenant || !currentUser) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  }, [tenant, currentUser]);

  // Tạo thông báo mới
  const createNotification = useCallback(async ({
    userId,
    type,
    title,
    message,
    icon = '🔔',
    referenceType = null,
    referenceId = null,
    data = {}
  }) => {
    if (!tenant) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          tenant_id: tenant.id,
          user_id: userId,
          type,
          title,
          message,
          icon,
          reference_type: referenceType,
          reference_id: referenceId,
          data,
          created_by: currentUser?.id
        });
      if (error) throw error;
    } catch (err) {
      console.error('Error creating notification:', err);
    }
  }, [tenant, currentUser]);

  // Gửi thông báo cho nhiều người
  const notifyUsers = useCallback(async (userIds, notifData) => {
    if (!tenant || !userIds.length) return;
    try {
      const notifs = userIds.map(userId => ({
        tenant_id: tenant.id,
        user_id: userId,
        type: notifData.type,
        title: notifData.title,
        message: notifData.message,
        icon: notifData.icon || '🔔',
        reference_type: notifData.referenceType || null,
        reference_id: notifData.referenceId || null,
        data: notifData.data || {},
        created_by: currentUser?.id
      }));
      const { error } = await supabase.from('notifications').insert(notifs);
      if (error) throw error;
    } catch (err) {
      console.error('Error notifying users:', err);
    }
  }, [tenant, currentUser]);

  // Thông báo cho Admin/Manager
  const notifyAdmins = useCallback(async (notifData) => {
    const adminIds = (allUsers || [])
      .filter(u => isAdmin(u) || u.role === 'Manager')
      .map(u => u.id);
    await notifyUsers(adminIds, notifData);
  }, [allUsers, notifyUsers]);

  // Đánh dấu đã đọc
  const markAsRead = useCallback(async (notifId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notifId);
      if (error) throw error;
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  }, []);

  // Đánh dấu tất cả đã đọc
  const markAllAsRead = useCallback(async () => {
    if (!currentUser) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', currentUser.id)
        .eq('is_read', false);
      if (error) throw error;
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  }, [currentUser]);

  // Xóa thông báo
  const deleteNotification = useCallback(async (notifId) => {
    try {
      const notif = notifications.find(n => n.id === notifId);
      const { error } = await supabase.from('notifications').delete().eq('id', notifId);
      if (error) throw error;
      setNotifications(prev => prev.filter(n => n.id !== notifId));
      if (notif && !notif.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
      alert('❌ Lỗi khi xóa: ' + err.message);
    }
  }, [notifications]);

  // Xóa tất cả đã đọc
  const clearReadNotifications = useCallback(async () => {
    if (!currentUser) return;
    try {
      const readNotifIds = notifications.filter(n => n.is_read).map(n => n.id);
      if (readNotifIds.length === 0) return;
      const { error } = await supabase.from('notifications').delete().in('id', readNotifIds);
      if (error) throw error;
      setNotifications(prev => prev.filter(n => !n.is_read));
    } catch (err) {
      console.error('Error clearing notifications:', err);
      alert('❌ Lỗi khi xóa: ' + err.message);
    }
  }, [currentUser, notifications]);

  // ---- Notification Helpers ----
  const notifyTaskAssigned = useCallback(async (task, assigneeId) => {
    await createNotification({
      userId: assigneeId, type: 'task_assigned',
      title: '📝 Task mới được giao',
      message: `Bạn được giao task: "${task.title}"`,
      icon: '📝', referenceType: 'task', referenceId: task.id,
      data: { taskTitle: task.title, dueDate: task.dueDate }
    });
  }, [createNotification]);

  const notifyTaskCompleted = useCallback(async (task) => {
    await notifyAdmins({
      type: 'task_completed', title: '✅ Task hoàn thành',
      message: `${currentUser?.name} đã hoàn thành: "${task.title}"`,
      icon: '✅', referenceType: 'task', referenceId: task.id
    });
  }, [currentUser, notifyAdmins]);

  const notifyTaskRejected = useCallback(async (task, assigneeId, reason) => {
    await createNotification({
      userId: assigneeId, type: 'task_rejected',
      title: '❌ Task bị từ chối',
      message: `Task "${task.title}" bị từ chối: ${reason || 'Không đạt yêu cầu'}`,
      icon: '❌', referenceType: 'task', referenceId: task.id, data: { reason }
    });
  }, [createNotification]);

  const notifyNewJob = useCallback(async (job, technicianIds) => {
    await notifyUsers(technicianIds, {
      type: 'job_assigned', title: '🔧 Công việc kỹ thuật mới',
      message: `Công việc mới: "${job.title}" tại ${job.address}`,
      icon: '🔧', referenceType: 'job', referenceId: job.id,
      data: { address: job.address, scheduledDate: job.scheduled_date }
    });
  }, [notifyUsers]);

  const notifyJobStatusChanged = useCallback(async (job, creatorId) => {
    await createNotification({
      userId: creatorId, type: 'job_status_changed',
      title: '📍 Cập nhật công việc',
      message: `"${job.title}" → ${job.status}`,
      icon: job.status === 'Hoàn thành' ? '✅' : '📍',
      referenceType: 'job', referenceId: job.id
    });
  }, [createNotification]);

  const notifyFinancePending = useCallback(async (receipt) => {
    await notifyAdmins({
      type: 'finance_pending',
      title: receipt.type === 'thu' ? '💵 Phiếu thu chờ duyệt' : '💸 Phiếu chi chờ duyệt',
      message: `${currentUser?.name} tạo phiếu ${receipt.type}: ${formatMoney(receipt.amount)}`,
      icon: receipt.type === 'thu' ? '💵' : '💸',
      referenceType: 'receipt', referenceId: receipt.id,
      data: { amount: receipt.amount, type: receipt.type }
    });
  }, [currentUser, notifyAdmins]);

  const notifyFinanceApproved = useCallback(async (receipt, creatorId, approved) => {
    await createNotification({
      userId: creatorId,
      type: approved ? 'finance_approved' : 'finance_rejected',
      title: approved ? '✅ Phiếu đã được duyệt' : '❌ Phiếu bị từ chối',
      message: `Phiếu ${receipt.type} ${receipt.receipt_number}: ${formatMoney(receipt.amount)}`,
      icon: approved ? '✅' : '❌',
      referenceType: 'receipt', referenceId: receipt.id
    });
  }, [createNotification]);

  const notifySalaryCreated = useCallback(async (salary, employeeId) => {
    await createNotification({
      userId: employeeId, type: 'salary_created',
      title: '💰 Bảng lương mới',
      message: `Bảng lương tháng ${salary.month} đã sẵn sàng: ${formatMoney(salary.total_salary)}`,
      icon: '💰', referenceType: 'salary', referenceId: salary.id,
      data: { month: salary.month, amount: salary.total_salary }
    });
  }, [createNotification]);

  const notifySalaryPaid = useCallback(async (salary, employeeId) => {
    await createNotification({
      userId: employeeId, type: 'salary_paid',
      title: '💵 Lương đã thanh toán',
      message: `Lương tháng ${salary.month}: ${formatMoney(salary.total_salary)} đã được thanh toán`,
      icon: '💵', referenceType: 'salary', referenceId: salary.id
    });
  }, [createNotification]);

  const notifyNewComment = useCallback(async (task, commenterId, commentText) => {
    if (task.assignee_id && task.assignee_id !== commenterId) {
      const assigneeUser = (allUsers || []).find(u => u.name === task.assignee);
      if (assigneeUser) {
        await createNotification({
          userId: assigneeUser.id, type: 'comment_new',
          title: '💬 Bình luận mới',
          message: `${currentUser?.name}: "${commentText.substring(0, 50)}${commentText.length > 50 ? '...' : ''}"`,
          icon: '💬', referenceType: 'task', referenceId: task.id
        });
      }
    }
  }, [allUsers, currentUser, createNotification]);

  // Legacy addNotification
  const addNotification = useCallback((notif) => {
    if (currentUser) {
      createNotification({
        userId: currentUser.id,
        type: notif.type || 'general',
        title: notif.title,
        message: notif.message,
        icon: notif.title?.charAt(0) || '🔔',
        referenceType: notif.taskId ? 'task' : null,
        referenceId: notif.taskId || null
      });
    }
  }, [currentUser, createNotification]);

  // Check deadline notifications - batch query instead of N+1
  const checkDeadlineNotifications = useCallback(async (tasks) => {
    if (!currentUser || !tasks?.length || !tenant) return;
    const now = new Date();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Filter relevant tasks first
    const relevantTasks = tasks.filter(task => {
      if (task.assignee !== currentUser.name) return false;
      if (task.status === 'Hoàn Thành') return false;
      if (!task.dueDate) return false;
      // Nếu due_date chỉ có date (không có 'T'), Supabase trả "YYYY-MM-DD"
      // → set deadline = cuối ngày đó (23:59:59 VN) thay vì 00:00 UTC (= 07:00 VN)
      let dd;
      if (task.dueDate.includes('T')) {
        dd = new Date(task.dueDate);
      } else {
        const [y, m, d] = task.dueDate.split('-').map(Number);
        dd = new Date(y, m - 1, d, 23, 59, 59); // cuối ngày local
      }
      const diffHours = (dd - now) / (1000 * 60 * 60);
      return (diffHours > 0 && diffHours <= 1) || (diffHours < 0 && diffHours > -24);
    });

    if (relevantTasks.length === 0) return;

    // Batch fetch existing notifications for all relevant tasks
    const taskIds = relevantTasks.map(t => t.id);
    const { data: existingNotifs } = await supabase
      .from('notifications').select('reference_id, type')
      .eq('user_id', currentUser.id)
      .in('type', ['deadline_warning', 'deadline_overdue'])
      .in('reference_id', taskIds)
      .gte('created_at', oneDayAgo);

    const existingSet = new Set((existingNotifs || []).map(n => `${n.type}:${n.reference_id}`));

    for (const task of relevantTasks) {
      // Xử lý date-only string: set cuối ngày thay vì 00:00 UTC
      let dueDate;
      if (task.dueDate.includes('T')) {
        dueDate = new Date(task.dueDate);
      } else {
        const [y, m, d] = task.dueDate.split('-').map(Number);
        dueDate = new Date(y, m - 1, d, 23, 59, 59); // cuối ngày local
      }
      const diffHours = (dueDate - now) / (1000 * 60 * 60);

      if (diffHours > 0 && diffHours <= 1 && !existingSet.has(`deadline_warning:${task.id}`)) {
        const diffMinutes = Math.floor(diffHours * 60);
        await createNotification({
          userId: currentUser.id, type: 'deadline_warning',
          title: '⏰ Sắp đến deadline',
          message: `Task "${task.title}" sẽ đến hạn trong ${diffMinutes} phút`,
          icon: '⏰', referenceType: 'task', referenceId: task.id
        });
      }

      if (diffHours < 0 && diffHours > -24 && !existingSet.has(`deadline_overdue:${task.id}`)) {
        await createNotification({
          userId: currentUser.id, type: 'deadline_overdue',
          title: '🚨 Task quá hạn!',
          message: `Task "${task.title}" đã quá hạn ${Math.abs(Math.floor(diffHours))} giờ`,
          icon: '🚨', referenceType: 'task', referenceId: task.id
        });
      }
    }
  }, [currentUser, tenant, createNotification]);

  // Subscribe realtime notifications
  useEffect(() => {
    if (!tenant || !currentUser) return;
    loadNotifications();

    const notifChannel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
        (payload) => {
          const notif = payload.new;
          setNotifications(prev => [notif, ...prev]);
          setUnreadCount(prev => prev + 1);

          // Phát âm thanh theo loại thông báo
          const alertTypes = ['deadline_overdue', 'finance_pending', 'task_rejected'];
          if (alertTypes.includes(notif.type)) {
            playAlertSound();
          } else {
            playNotificationSound();
          }

          // Browser push notification khi tab ẩn
          if (document.hidden) {
            showBrowserNotification(
              notif.title || '🔔 Thông báo mới',
              notif.message || '',
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(notifChannel); };
  }, [tenant, currentUser, loadNotifications]);

  const value = {
    notifications, showNotifications, setShowNotifications, unreadCount,
    loadNotifications, createNotification, notifyUsers, notifyAdmins,
    markAsRead, markAllAsRead, deleteNotification, clearReadNotifications,
    notifyTaskAssigned, notifyTaskCompleted, notifyTaskRejected,
    notifyNewJob, notifyJobStatusChanged,
    notifyFinancePending, notifyFinanceApproved,
    notifySalaryCreated, notifySalaryPaid,
    notifyNewComment, addNotification, checkDeadlineNotifications
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
};

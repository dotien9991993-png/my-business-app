import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';

export default function NotificationsPage({ user, tenantId, onBack, onNavigateEntity }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!user?.id || !tenantId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setNotifications(data || []);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, tenantId]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id || !tenantId) return;
    const channel = supabase.channel(`mobile-notif-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => loadNotifications())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, tenantId, loadNotifications]);

  const markAsRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleTap = (notif) => {
    if (!notif.is_read) markAsRead(notif.id);
    // Navigate to entity — map notification reference_type to app entity type
    if (notif.reference_type && notif.reference_id && onNavigateEntity) {
      const typeMap = { task: 'task', job: 'technical_job', receipt: 'receipt', salary: 'salary' };
      onNavigateEntity({ type: typeMap[notif.reference_type] || notif.reference_type, id: notif.reference_id });
    }
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return d.toLocaleDateString('vi-VN');
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="mobile-page mnotif-page">
      {/* Header */}
      <div className="mnotif-header">
        <button className="mnotif-back" onClick={onBack}>← Quay lại</button>
        <h2 className="mnotif-title">Thông báo</h2>
        {unreadCount > 0 && (
          <button className="mnotif-read-all" onClick={markAllAsRead}>
            Đọc tất cả
          </button>
        )}
      </div>

      {/* List */}
      <div className="mnotif-list">
        {loading ? (
          <div className="mnotif-loading">Đang tải...</div>
        ) : notifications.length === 0 ? (
          <div className="mnotif-empty">
            <span>🔔</span>
            <p>Chưa có thông báo nào</p>
          </div>
        ) : (
          notifications.map(notif => (
            <button
              key={notif.id}
              className={`mnotif-item ${!notif.is_read ? 'unread' : ''}`}
              onClick={() => handleTap(notif)}
            >
              <span className="mnotif-item-icon">{notif.icon || '🔔'}</span>
              <div className="mnotif-item-body">
                <span className="mnotif-item-title">{notif.title}</span>
                <span className="mnotif-item-msg">{notif.message}</span>
                <span className="mnotif-item-time">{formatTime(notif.created_at)}</span>
              </div>
              {!notif.is_read && <span className="mnotif-item-dot" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

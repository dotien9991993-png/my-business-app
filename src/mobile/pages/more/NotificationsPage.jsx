import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import MobilePullRefresh from '../../components/MobilePullRefresh';

export default function NotificationsPage({ user, tenantId, onBack, onNavigateEntity }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Query giống hệt desktop NotificationContext.loadNotifications
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

  // Realtime — giống desktop NotificationContext channel setup
  useEffect(() => {
    if (!user?.id || !tenantId) return;
    const channel = supabase.channel(`mobile-notif-list-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => loadNotifications())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, tenantId, loadNotifications]);

  // markAsRead — giống desktop NotificationContext.markAsRead
  const markAsRead = async (id) => {
    await supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  // markAllAsRead — giống desktop NotificationContext.markAllAsRead
  const markAllAsRead = async () => {
    if (!user?.id || !tenantId) return;
    await supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleTap = (notif) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.reference_type && notif.reference_id && onNavigateEntity) {
      // Map notification reference_type → app entity type (giống desktop NotificationsDropdown routing)
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
    if (diffDays === 1) return 'Hôm qua';
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return d.toLocaleDateString('vi-VN');
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="mobile-page mnotif-page">
      {/* Header */}
      <div className="mnotif-header">
        <button className="mnotif-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="mnotif-title">Thông báo</h2>
        {unreadCount > 0 && (
          <button className="mnotif-read-all" onClick={markAllAsRead}>
            Đọc tất cả
          </button>
        )}
      </div>

      {/* List */}
      <MobilePullRefresh onRefresh={loadNotifications}>
        <div className="mnotif-list">
          {loading ? (
            <div className="mnotif-empty">
              <p>Đang tải...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="mnotif-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              <p>Không có thông báo</p>
            </div>
          ) : (
            notifications.map(notif => (
              <button
                key={notif.id}
                className={`mnotif-item ${!notif.is_read ? 'unread' : ''}`}
                onClick={() => handleTap(notif)}
              >
                {!notif.is_read && <span className="mnotif-dot" />}
                <span className="mnotif-icon">{notif.icon || '🔔'}</span>
                <div className="mnotif-body">
                  <span className="mnotif-item-title">{notif.title}</span>
                  <span className="mnotif-msg">{notif.message}</span>
                  <span className="mnotif-time">{formatTime(notif.created_at)}</span>
                </div>
              </button>
            ))
          )}
          <div style={{ height: 100 }} />
        </div>
      </MobilePullRefresh>
    </div>
  );
}

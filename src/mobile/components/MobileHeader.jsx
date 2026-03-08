import React, { useState, useEffect, useCallback } from 'react';
import logo from '../../assets/logo.png';
import { supabase } from '../../supabaseClient';

export default function MobileHeader({ user, tenantId, onNavigate }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Count unread notifications
  useEffect(() => {
    if (!user?.id || !tenantId) return;
    const loadUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadCount(count || 0);
    };
    loadUnread();

    // Realtime subscription
    const channel = supabase.channel('mobile-notif-badge')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, () => loadUnread())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id, tenantId]);

  // Navigate to attendance page
  const handleGoToAttendance = useCallback(() => {
    if (onNavigate) onNavigate('attendance');
  }, [onNavigate]);

  // Load notifications list
  const handleOpenNotifications = useCallback(async () => {
    setShowNotifications(true);
    if (!user?.id || !tenantId) return;
    const { data } = await supabase
      .from('notifications').select('*')
      .eq('tenant_id', tenantId).eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifications(data || []);
  }, [user?.id, tenantId]);

  // Mark all as read
  const handleMarkAllRead = useCallback(async () => {
    if (!user?.id || !tenantId) return;
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('tenant_id', tenantId).eq('user_id', user.id).eq('is_read', false);
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }, [user?.id, tenantId]);

  return (
    <>
      <header className="mobile-header">
        <div className="mobile-header-content">
          <div className="mobile-header-left"></div>
          <div className="mobile-header-center">
            <img src={logo} alt="Hoàng Nam Audio" className="mobile-header-logo" />
          </div>
          <div className="mobile-header-right">
            <button className="mobile-header-icon" onClick={handleGoToAttendance}>
              ⏰
            </button>
            <button className="mobile-header-icon" onClick={handleOpenNotifications}>
              🔔
              {unreadCount > 0 && (
                <span className="mobile-header-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Notifications panel */}
      {showNotifications && (
        <div className="mobile-notif-overlay" onClick={() => setShowNotifications(false)}>
          <div className="mobile-notif-panel" onClick={e => e.stopPropagation()}>
            <div className="mobile-notif-header">
              <span className="mobile-notif-title">Thông báo</span>
              {unreadCount > 0 && (
                <button className="mobile-notif-mark-read" onClick={handleMarkAllRead}>
                  Đọc tất cả
                </button>
              )}
              <button className="mobile-notif-close" onClick={() => setShowNotifications(false)}>✕</button>
            </div>
            <div className="mobile-notif-list">
              {notifications.length === 0 ? (
                <div className="mobile-notif-empty">Không có thông báo</div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className={`mobile-notif-item ${!n.is_read ? 'unread' : ''}`}>
                    <span className="mobile-notif-icon">{n.icon || '🔔'}</span>
                    <div className="mobile-notif-body">
                      <div className="mobile-notif-item-title">{n.title}</div>
                      <div className="mobile-notif-msg">{n.content || n.message || 'Thông báo mới'}</div>
                      <div className="mobile-notif-time">
                        {new Date(n.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

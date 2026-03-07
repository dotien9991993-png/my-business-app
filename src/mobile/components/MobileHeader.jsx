import React, { useState, useEffect, useCallback, useRef } from 'react';
import logo from '../../assets/logo.png';
import { supabase } from '../../supabaseClient';
import { getNowISOVN, getTodayVN } from '../../utils/dateUtils';

export default function MobileHeader({ user, tenantId }) {
  const [toast, setToast] = useState(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const employeeRef = useRef(null);
  const shiftRef = useRef(null);

  // Load employee + shift (once)
  useEffect(() => {
    if (!user?.name || !tenantId) return;
    const load = async () => {
      const { data: allEmp } = await supabase
        .from('employees').select('*').eq('tenant_id', tenantId);
      const emp = (allEmp || []).find(e => e.full_name === user.name && e.status === 'active');
      employeeRef.current = emp || null;

      if (emp) {
        const { data: shifts } = await supabase
          .from('work_shifts').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('start_time');
        if (shifts?.length > 0) {
          shiftRef.current = emp.shift_id ? (shifts.find(s => s.id === emp.shift_id) || shifts[0]) : shifts[0];
        }
      }
    };
    load();
  }, [user?.name, tenantId]);

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

  // Show toast helper
  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Quick check-in/check-out
  const handleQuickCheckIn = useCallback(async () => {
    const emp = employeeRef.current;
    if (!emp) {
      showToast('⚠️ Chưa có hồ sơ nhân viên');
      return;
    }
    if (quickLoading) return;
    setQuickLoading(true);

    try {
      const today = getTodayVN();

      // Get today's records
      const { data: records } = await supabase
        .from('hrm_attendances').select('*')
        .eq('employee_id', emp.id).eq('tenant_id', tenantId).eq('date', today)
        .order('shift_number', { ascending: true });

      const openShift = (records || []).find(r => r.check_in && !r.check_out);

      if (openShift) {
        // Check-out
        const nowISO = getNowISOVN();
        const shift = shiftRef.current;
        const isEarly = openShift.shift_number === 1 && shift?.end_time
          ? (() => {
              const now = new Date(nowISO);
              const [eh, em] = shift.end_time.split(':').map(Number);
              const end = new Date(now); end.setHours(eh, em, 0, 0);
              return now < end;
            })()
          : false;

        const updateData = { check_out: nowISO, check_out_method: 'manual' };
        if (isEarly && openShift.status !== 'late') updateData.status = 'early_leave';

        const { error } = await supabase
          .from('hrm_attendances').update(updateData).eq('id', openShift.id);

        if (error) throw error;
        const time = new Date(nowISO).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
        showToast(`✅ Đã chấm công ra lúc ${time}`);

      } else {
        // Check if all shifts are closed
        const allClosed = (records || []).length > 0 && (records || []).every(r => r.check_in && r.check_out);

        if (allClosed && (records || []).length > 0) {
          // Already done, create new shift
        }

        // Check-in
        const nowISO = getNowISOVN();
        const shiftNum = (records || []).length + 1;
        const shift = shiftRef.current;
        const isLate = shiftNum === 1 && shift?.start_time
          ? (() => {
              const now = new Date(nowISO);
              const [sh, sm] = shift.start_time.split(':').map(Number);
              const start = new Date(now); start.setHours(sh, sm, 0, 0);
              return now > start;
            })()
          : false;

        const { error } = await supabase
          .from('hrm_attendances').insert({
            tenant_id: tenantId,
            employee_id: emp.id,
            date: today,
            shift_number: shiftNum,
            check_in: nowISO,
            check_in_method: 'manual',
            status: isLate ? 'late' : 'present'
          });

        if (error) throw error;
        const time = new Date(nowISO).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
        showToast(`✅ Đã chấm công vào lúc ${time}${isLate ? ' (Trễ)' : ''}`);
      }
    } catch (err) {
      console.error('Quick check-in error:', err);
      showToast('❌ Lỗi: ' + (err.message || 'Không thể chấm công'));
    } finally {
      setQuickLoading(false);
    }
  }, [tenantId, quickLoading, showToast]);

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
            <button
              className={`mobile-header-icon ${quickLoading ? 'loading' : ''}`}
              onClick={handleQuickCheckIn}
              disabled={quickLoading}
            >
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

      {/* Toast */}
      {toast && <div className="mobile-toast">{toast}</div>}

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
                      <div className="mobile-notif-msg">{n.message}</div>
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

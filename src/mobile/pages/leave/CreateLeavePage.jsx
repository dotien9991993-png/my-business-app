import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { calcDays } from '../../hooks/useMobileLeave';
import { haptic } from '../../utils/haptics';

const LEAVE_TYPES = {
  annual_leave: { label: 'Nghỉ phép năm', icon: '🏖️' },
  sick_leave: { label: 'Nghỉ ốm', icon: '🏥' },
  unpaid_leave: { label: 'Nghỉ không lương', icon: '📋' },
  overtime: { label: 'Tăng ca', icon: '⏰' },
  business_trip: { label: 'Công tác', icon: '✈️' },
  work_from_home: { label: 'WFH', icon: '🏠' },
};

const getTodayVN = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

// Giống desktop: DP-YYYYMMDD-XXX
const generateLeaveCode = () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `DP-${y}${m}${d}-${rand}`;
};

export default function CreateLeavePage({ user, tenantId, onBack }) {
  const [type, setType] = useState('annual_leave');
  const [startDate, setStartDate] = useState(getTodayVN());
  const [endDate, setEndDate] = useState(getTodayVN());
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Tìm employee record cho user hiện tại — query trực tiếp
  const [employee, setEmployee] = useState(null);
  const [empLoading, setEmpLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !tenantId) return;
    (async () => {
      setEmpLoading(true);
      // Thử match giống desktop: user_id OR email
      let emp = null;

      // Try 1: match by user_id
      const { data: byUserId } = await supabase
        .from('employees').select('id, full_name, user_id, email')
        .eq('tenant_id', tenantId).eq('status', 'active').eq('user_id', user.id).limit(1);
      if (byUserId?.length > 0) { emp = byUserId[0]; }

      // Try 2: match by email
      if (!emp && user.email) {
        const { data: byEmail } = await supabase
          .from('employees').select('id, full_name, user_id, email')
          .eq('tenant_id', tenantId).eq('status', 'active').eq('email', user.email).limit(1);
        if (byEmail?.length > 0) { emp = byEmail[0]; }
      }

      // Try 3: match by full_name (last resort)
      if (!emp && user.name) {
        const { data: byName } = await supabase
          .from('employees').select('id, full_name, user_id, email')
          .eq('tenant_id', tenantId).eq('status', 'active').eq('full_name', user.name).limit(1);
        if (byName?.length > 0) { emp = byName[0]; }
      }

      setEmployee(emp);
      setEmpLoading(false);
    })();
  }, [user?.id, user?.email, user?.name, tenantId]);

  const days = useMemo(() => calcDays(startDate, endDate, isHalfDay), [startDate, endDate, isHalfDay]);

  // Submit — insert giống HỆT desktop HrmLeaveRequestsView.handleCreateRequest
  const handleSubmit = async () => {
    if (!employee?.id) {
      alert('Tài khoản chưa liên kết hồ sơ nhân viên. Vui lòng liên hệ admin.');
      return;
    }
    if (!startDate || !endDate) { alert('Vui lòng chọn ngày'); return; }
    if (new Date(endDate) < new Date(startDate)) { alert('Ngày kết thúc phải sau ngày bắt đầu'); return; }
    if (!reason.trim()) { alert('Vui lòng nhập lý do'); return; }
    const d = calcDays(startDate, endDate, isHalfDay);
    if (d <= 0) { alert('Số ngày nghỉ không hợp lệ'); return; }

    setSubmitting(true);
    try {
      const code = generateLeaveCode();

      // Insert giống hệt desktop line 235-246
      const { data: insertedLeave, error } = await supabase.from('leave_requests').insert({
        tenant_id: tenantId,
        code,
        employee_id: employee.id,
        type,
        start_date: startDate,
        end_date: endDate,
        days: d,
        reason: reason.trim(),
        status: 'pending',
        created_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;

      // Notification admin — giống desktop + finance pattern
      try {
        const typeName = LEAVE_TYPES[type]?.label || type;
        const { data: admins, error: adminErr } = await supabase.from('users').select('id, role')
          .eq('tenant_id', tenantId).eq('is_active', true);
        console.log('[Leave] Admin query result:', admins?.length, 'users, error:', adminErr);

        const adminList = (admins || []).filter(u =>
          (u.role === 'Admin' || u.role === 'admin' || u.role === 'Manager') && u.id !== user.id
        );
        console.log('[Leave] Filtered admins to notify:', adminList.length);

        if (adminList.length > 0) {
          const notifs = adminList.map(u => ({
            tenant_id: tenantId,
            user_id: u.id,
            type: 'leave_request_new',
            title: '📝 Đơn nghỉ phép mới',
            message: `${employee.full_name || user.name} xin nghỉ ${typeName} từ ${startDate} đến ${endDate} (${d} ngày)`,
            icon: '📝',
            reference_type: 'leave_request',
            reference_id: insertedLeave?.id || null,
            created_by: user.id,
            is_read: false,
          }));
          const { error: notifErr } = await supabase.from('notifications').insert(notifs);
          console.log('[Leave] Notification insert result:', notifErr ? 'ERROR: ' + notifErr.message : 'OK');
        }
      } catch (notifError) {
        console.error('[Leave] Notification error:', notifError);
      }

      await haptic('heavy');
      alert('Tạo đơn nghỉ phép thành công!');
      onBack();
    } catch (err) {
      alert('Lỗi tạo đơn: ' + (err.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-page mlv-create-page mpage-slide-in">
      <div className="mlv-create-header">
        <button className="mlv-create-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="mlv-create-title">Tạo đơn nghỉ phép</h2>
      </div>

      <div className="mlv-create-body">
        {/* Người tạo đơn */}
        {empLoading ? (
          <div className="mlv-create-user-info">Đang tải...</div>
        ) : employee ? (
          <div className="mlv-create-user-info">
            Tạo đơn cho: <strong>{employee.full_name || user?.name}</strong>
          </div>
        ) : (
          <div className="mlv-create-user-info" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#991B1B' }}>
            Tài khoản chưa liên kết hồ sơ nhân viên. Liên hệ admin để được hỗ trợ.
          </div>
        )}

        {/* Loại đơn */}
        <div className="mlv-create-section">
          <label className="mlv-create-label">Loại đơn <span className="mlv-req">*</span></label>
          <select className="mlv-create-input mlv-create-select" value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </div>

        {/* Ngày */}
        <div className="mlv-create-section">
          <div className="mlv-create-row">
            <div className="mlv-create-col">
              <label className="mlv-create-label">Từ ngày <span className="mlv-req">*</span></label>
              <input type="date" className="mlv-create-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="mlv-create-col">
              <label className="mlv-create-label">Đến ngày <span className="mlv-req">*</span></label>
              <input type="date" className="mlv-create-input" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} />
            </div>
          </div>

          <div className="mlv-create-halfday">
            <label className="mlv-create-checkbox">
              <input type="checkbox" checked={isHalfDay} onChange={e => setIsHalfDay(e.target.checked)} />
              Nghỉ nửa ngày
            </label>
            <span className="mlv-create-days-count">{days} ngày</span>
          </div>
        </div>

        {/* Lý do */}
        <div className="mlv-create-section">
          <label className="mlv-create-label">Lý do <span className="mlv-req">*</span></label>
          <textarea className="mlv-create-input mlv-create-textarea" value={reason} onChange={e => setReason(e.target.value)} placeholder="Nhập lý do xin nghỉ..." rows={3} />
        </div>

        <div style={{ height: 130 }} />
      </div>

      <div className="mlv-create-footer">
        <button className="mlv-create-submit" onClick={handleSubmit} disabled={submitting || !employee}>
          {submitting ? 'Đang tạo...' : 'Tạo đơn'}
        </button>
      </div>
    </div>
  );
}

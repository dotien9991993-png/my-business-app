import React, { useState } from 'react';
import { useMobileLeave } from '../../hooks/useMobileLeave';
import { haptic } from '../../utils/haptics';

const LEAVE_TYPES = {
  annual_leave: { label: 'Nghỉ phép năm', icon: '🏖️' },
  sick_leave: { label: 'Nghỉ ốm', icon: '🏥' },
  unpaid_leave: { label: 'Nghỉ không lương', icon: '📋' },
  overtime: { label: 'Tăng ca', icon: '⏰' },
  business_trip: { label: 'Công tác', icon: '✈️' },
  work_from_home: { label: 'WFH', icon: '🏠' },
};
const STATUSES = {
  pending: { label: 'Chờ duyệt', cls: 'mlv-badge-pending' },
  approved: { label: 'Đã duyệt', cls: 'mlv-badge-approved' },
  rejected: { label: 'Từ chối', cls: 'mlv-badge-rejected' },
  cancelled: { label: 'Đã hủy', cls: 'mlv-badge-cancelled' },
};
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
const fmtDateTime = (s) => s ? new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';

export default function LeaveDetailPage({ request: req, user, tenantId, onBack }) {
  const { employees, leaveBalances, currentEmployee, permLevel, approveRequest, rejectRequest, cancelRequest } = useMobileLeave(user?.id, user?.name, tenantId, user?.email);

  const [saving, setSaving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const emp = employees.find(e => e.id === req.employee_id);
  const t = LEAVE_TYPES[req.type] || { label: req.type, icon: '📋' };
  const s = STATUSES[req.status] || STATUSES.pending;
  const balance = leaveBalances.find(b => b.employee_id === req.employee_id && b.year === new Date().getFullYear());
  const approver = req.approved_by ? employees.find(e => e.user_id === req.approved_by) : null;

  const isAdmin = permLevel >= 2;
  const isOwner = currentEmployee?.id === req.employee_id;
  const canApprove = isAdmin && req.status === 'pending';
  const canCancel = (isOwner || isAdmin) && req.status === 'pending';

  const handleApprove = async () => {
    if (!confirm('Duyệt đơn ngh��� phép này?')) return;
    setSaving(true);
    try {
      await approveRequest(req);
      await haptic();
      alert('Đã duyệt đơn!');
      onBack();
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { alert('Vui lòng nhập lý do từ chối'); return; }
    setSaving(true);
    try {
      await rejectRequest(req, rejectReason);
      await haptic();
      alert('Đã t�� chối đơn!');
      onBack();
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setSaving(false); setShowRejectModal(false); }
  };

  const handleCancel = async () => {
    if (!confirm('Hủy đơn nghỉ phép này?')) return;
    setSaving(true);
    try {
      await cancelRequest(req);
      await haptic();
      alert('Đã hủy đơn!');
      onBack();
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setSaving(false); }
  };

  const headerBg = req.status === 'approved' ? 'linear-gradient(135deg, #16a34a, #15803d)' :
    req.status === 'rejected' ? 'linear-gradient(135deg, #dc2626, #b91c1c)' :
    req.status === 'cancelled' ? 'linear-gradient(135deg, #6b7280, #4b5563)' :
    'linear-gradient(135deg, #f59e0b, #d97706)';

  return (
    <div className="mobile-page mlv-detail-page mpage-slide-in">
      {/* Header */}
      <div className="mlv-detail-header" style={{ background: headerBg }}>
        <button className="mlv-detail-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Quay lại
        </button>
        <div className="mlv-detail-header-info">
          <span className="mlv-detail-code">{req.code}</span>
          <h2 className="mlv-detail-title">{t.icon} {t.label}</h2>
          <span className={`mlv-badge ${s.cls}`}>{s.label}</span>
        </div>
      </div>

      <div className="mlv-detail-body">
        {/* Nhân viên */}
        <div className="mlv-detail-section">
          <h4 className="mlv-detail-section-title">Nhân viên</h4>
          <div className="mlv-detail-card">
            <div className="mlv-detail-emp">
              <div className="mlv-detail-emp-avatar">{emp?.full_name?.charAt(0) || '?'}</div>
              <div>
                <div className="mlv-detail-emp-name">{emp?.full_name || '—'}</div>
                <div className="mlv-detail-emp-pos">{emp?.position || ''} {emp?.department ? `· ${emp.department}` : ''}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Chi tiết */}
        <div className="mlv-detail-section">
          <h4 className="mlv-detail-section-title">Chi tiết đơn</h4>
          <div className="mlv-detail-card">
            <div className="mlv-detail-row"><span>Loại đơn</span><span>{t.icon} {t.label}</span></div>
            <div className="mlv-detail-row"><span>Từ ngày</span><span>📅 {fmtDate(req.start_date)}</span></div>
            <div className="mlv-detail-row"><span>��ến ngày</span><span>📅 {fmtDate(req.end_date)}</span></div>
            <div className="mlv-detail-row"><span>Số ngày</span><span className="mlv-detail-days">{req.days} ngày{req.days % 1 !== 0 ? ' (nửa ngày)' : ''}</span></div>
            <div className="mlv-detail-row"><span>Ngày tạo</span><span>{fmtDateTime(req.created_at)}</span></div>
          </div>
        </div>

        {/* Lý do */}
        {req.reason && (
          <div className="mlv-detail-section">
            <h4 className="mlv-detail-section-title">Lý do</h4>
            <div className="mlv-detail-card">
              <p className="mlv-detail-reason">{req.reason}</p>
            </div>
          </div>
        )}

        {/* Phép năm */}
        {balance && (
          <div className="mlv-detail-section">
            <h4 className="mlv-detail-section-title">Phép năm {new Date().getFullYear()}</h4>
            <div className="mlv-detail-balance">
              <div className="mlv-bal-item mlv-bal-total"><span className="mlv-bal-num">{balance.total_days || 0}</span><span className="mlv-bal-label">Tổng phép</span></div>
              <div className="mlv-bal-item mlv-bal-used"><span className="mlv-bal-num">{balance.used_days || 0}</span><span className="mlv-bal-label">Đã dùng</span></div>
              <div className="mlv-bal-item mlv-bal-left"><span className="mlv-bal-num">{(balance.total_days || 0) - (balance.used_days || 0)}</span><span className="mlv-bal-label">Còn lại</span></div>
            </div>
          </div>
        )}

        {/* Lịch sử duyệt */}
        {(req.status === 'approved' || req.status === 'rejected') && (
          <div className="mlv-detail-section">
            <h4 className="mlv-detail-section-title">Lịch sử duyệt</h4>
            <div className={`mlv-detail-card ${req.status === 'approved' ? 'mlv-detail-card-green' : 'mlv-detail-card-red'}`}>
              <div className="mlv-detail-row"><span>{req.status === 'approved' ? '✅' : '❌'} {approver?.full_name || 'Admin'}</span></div>
              <div className="mlv-detail-row"><span>{fmtDateTime(req.approved_at)}</span></div>
              {req.reject_reason && <div className="mlv-detail-reject-reason">Lý do: {req.reject_reason}</div>}
            </div>
          </div>
        )}

        <div style={{ height: canApprove || canCancel ? 130 : 100 }} />
      </div>

      {/* Actions */}
      {(canApprove || canCancel) && (
        <div className="mlv-detail-actions">
          {canCancel && <button className="mlv-act-cancel" onClick={handleCancel} disabled={saving}>Hủy đơn</button>}
          {canApprove && (
            <>
              <button className="mlv-act-reject" onClick={() => setShowRejectModal(true)} disabled={saving}>Từ chối</button>
              <button className="mlv-act-approve" onClick={handleApprove} disabled={saving}>{saving ? '...' : 'Duyệt'}</button>
            </>
          )}
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal && (
        <div className="mlv-reject-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="mlv-reject-modal" onClick={e => e.stopPropagation()}>
            <h3>Lý do từ chối</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Nhập lý do từ chối..." rows={3} />
            <div className="mlv-reject-btns">
              <button onClick={() => setShowRejectModal(false)}>Đóng</button>
              <button className="mlv-reject-confirm" onClick={handleReject} disabled={saving || !rejectReason.trim()}>{saving ? '...' : 'Xác nhận từ chối'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

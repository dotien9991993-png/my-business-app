import React, { useState, useMemo } from 'react';
import { useMobileLeave } from '../../hooks/useMobileLeave';
import MobilePullRefresh from '../../components/MobilePullRefresh';

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

const getCurrentMonth = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';

export default function LeaveRequestsPage({ user, tenantId, onBack, onOpenDetail, onOpenCreate }) {
  const { allRequests, employees, currentEmployee, loading, permLevel, getFilteredRequests, refresh } = useMobileLeave(user?.id, user?.name, tenantId, user?.email);

  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());

  const filtered = useMemo(() => {
    return getFilteredRequests({ type: filterType, status: filterStatus, month: filterMonth });
  }, [getFilteredRequests, filterType, filterStatus, filterMonth]);

  // Stats tháng hiện tại — giống desktop
  const stats = useMemo(() => {
    const monthReqs = allRequests.filter(r => r.created_at?.substring(0, 7) === filterMonth);
    if (permLevel <= 1 && currentEmployee) {
      const mine = monthReqs.filter(r => r.employee_id === currentEmployee.id);
      return { total: mine.length, pending: mine.filter(r => r.status === 'pending').length, approved: mine.filter(r => r.status === 'approved').length, rejected: mine.filter(r => r.status === 'rejected').length };
    }
    return { total: monthReqs.length, pending: monthReqs.filter(r => r.status === 'pending').length, approved: monthReqs.filter(r => r.status === 'approved').length, rejected: monthReqs.filter(r => r.status === 'rejected').length };
  }, [allRequests, filterMonth, permLevel, currentEmployee]);

  const getEmpName = (empId) => employees.find(e => e.id === empId)?.full_name || '—';

  return (
    <div className="mobile-page mlv-page">
      {/* Header */}
      <div className="mlv-header">
        <button className="mlv-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="mlv-title">Đơn từ</h2>
        <button className="mlv-add-btn" onClick={onOpenCreate}>+</button>
      </div>

      <MobilePullRefresh onRefresh={refresh}>
        <div className="mlv-body">
          {/* Stats */}
          <div className="mlv-stats">
            <div className="mlv-stat"><span className="mlv-stat-num">{stats.total}</span><span className="mlv-stat-label">Tổng</span></div>
            <div className="mlv-stat mlv-stat-pending"><span className="mlv-stat-num">{stats.pending}</span><span className="mlv-stat-label">Chờ duyệt</span></div>
            <div className="mlv-stat mlv-stat-approved"><span className="mlv-stat-num">{stats.approved}</span><span className="mlv-stat-label">Đã duyệt</span></div>
            <div className="mlv-stat mlv-stat-rejected"><span className="mlv-stat-num">{stats.rejected}</span><span className="mlv-stat-label">Từ chối</span></div>
          </div>

          {/* Filters */}
          <div className="mlv-filters">
            <select className="mlv-filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">Tất cả loại</option>
              {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select className="mlv-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">Tất cả</option>
              {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input type="month" className="mlv-filter-select" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
          </div>

          {/* List */}
          {loading ? (
            <div className="mlv-empty">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="mlv-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              <p>Không có đơn từ nào</p>
            </div>
          ) : (
            <div className="mlv-list">
              {filtered.map(req => {
                const t = LEAVE_TYPES[req.type] || { label: req.type, icon: '📋' };
                const s = STATUSES[req.status] || STATUSES.pending;
                return (
                  <button key={req.id} className="mlv-card" onClick={() => onOpenDetail(req)}>
                    <div className="mlv-card-top">
                      <span className="mlv-card-code">{req.code}</span>
                      <span className={`mlv-badge ${s.cls}`}>{s.label}</span>
                    </div>
                    {permLevel >= 2 && <div className="mlv-card-emp">{getEmpName(req.employee_id)}</div>}
                    <div className="mlv-card-type">{t.icon} {t.label}</div>
                    <div className="mlv-card-dates">
                      {fmtDate(req.start_date)} → {fmtDate(req.end_date)} · {req.days} ngày{req.days % 1 !== 0 ? ' (nửa ngày)' : ''}
                    </div>
                    {req.reason && <div className="mlv-card-reason">{req.reason}</div>}
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ height: 100 }} />
        </div>
      </MobilePullRefresh>
    </div>
  );
}

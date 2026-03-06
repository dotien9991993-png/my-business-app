import React, { useState, useEffect } from 'react';
import { useMobileProfile } from '../../hooks/useMobileProfile';
import { formatMoney } from '../../utils/formatters';

const SALARY_STATUS = {
  draft: { label: 'Nháp', cls: 'mprof-sal-draft' },
  approved: { label: 'Đã duyệt', cls: 'mprof-sal-approved' },
  paid: { label: 'Đã trả', cls: 'mprof-sal-paid' },
};

export default function ProfilePage({ user, tenantId, onLogout, initialView, onBack }) {
  const { fetchSalaries, changePassword, loading } = useMobileProfile(user?.id, tenantId);

  const [view, setView] = useState(initialView || 'menu'); // menu | info | salary | password | salaryDetail
  const [salaries, setSalaries] = useState([]);
  const [salaryYear, setSalaryYear] = useState(new Date().getFullYear());
  const [selectedSalary, setSelectedSalary] = useState(null);
  const [loadingSalary, setLoadingSalary] = useState(false);

  // Password form
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Load salaries when salary view opened
  useEffect(() => {
    if (view === 'salary') {
      setLoadingSalary(true);
      fetchSalaries(salaryYear).then(data => {
        setSalaries(data);
        setLoadingSalary(false);
      }).catch(() => setLoadingSalary(false));
    }
  }, [view, salaryYear, fetchSalaries]);

  const handleBack = () => {
    if (view === 'salaryDetail') {
      setView('salary');
      setSelectedSalary(null);
    } else if (initialView && onBack) {
      onBack();
    } else {
      setView('menu');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPw !== confirmPw) { setPwError('Mật khẩu xác nhận không khớp'); return; }
    if (newPw.length < 6) { setPwError('Mật khẩu mới tối thiểu 6 ký tự'); return; }

    setPwLoading(true);
    try {
      await changePassword(oldPw, newPw);
      setPwSuccess('Đổi mật khẩu thành công!');
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwLoading(false);
    }
  };

  const handleOpenSalaryDetail = (salary) => {
    setSelectedSalary(salary);
    setView('salaryDetail');
  };

  // Sub-page header
  if (view !== 'menu') {
    return (
      <div className="mobile-page mprof-subpage">
        <div className="mprof-sub-header">
          <button className="mprof-back-btn" onClick={handleBack}>← Quay lại</button>
          <span className="mprof-sub-title">
            {view === 'info' && 'Thông tin cá nhân'}
            {view === 'salary' && 'Phiếu lương'}
            {view === 'salaryDetail' && 'Chi tiết lương'}
            {view === 'password' && 'Đổi mật khẩu'}
          </span>
        </div>

        {/* Personal info view */}
        {view === 'info' && (
          <div className="mprof-info-list">
            <InfoRow label="Họ tên" value={user?.name} />
            <InfoRow label="Email" value={user?.email} />
            <InfoRow label="SĐT" value={user?.phone} />
            <InfoRow label="Chức vụ" value={user?.role} />
            <InfoRow label="Team" value={user?.team} />
            <InfoRow label="Ngày sinh" value={formatDateVN(user?.date_of_birth)} />
            <InfoRow label="Địa chỉ" value={user?.address} />
            <InfoRow label="Ngày vào làm" value={formatDateVN(user?.start_date)} />
            <InfoRow label="Ngân hàng" value={user?.bank_name} />
            <InfoRow label="Số TK" value={user?.bank_account} />
          </div>
        )}

        {/* Salary list view */}
        {view === 'salary' && (
          <div className="mprof-salary-page">
            <div className="mprof-year-nav">
              <button onClick={() => setSalaryYear(y => y - 1)}>◀</button>
              <span className="mprof-year-label">{salaryYear}</span>
              <button onClick={() => setSalaryYear(y => y + 1)}>▶</button>
            </div>
            {loadingSalary ? (
              <div className="mprof-empty">Đang tải...</div>
            ) : salaries.length === 0 ? (
              <div className="mprof-empty">Chưa có phiếu lương năm {salaryYear}</div>
            ) : (
              <div className="mprof-salary-list">
                {salaries.map(s => {
                  const st = SALARY_STATUS[s.status] || SALARY_STATUS.draft;
                  const monthLabel = formatMonth(s.month);
                  return (
                    <button key={s.id} className="mprof-salary-card" onClick={() => handleOpenSalaryDetail(s)}>
                      <div className="mprof-sal-top">
                        <span className="mprof-sal-month">{monthLabel}</span>
                        <span className={`mprof-sal-badge ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="mprof-sal-total">{formatMoney(s.total_salary)}</div>
                      <div className="mprof-sal-breakdown">
                        <span>Cơ bản: {formatMoney(s.actual_basic)}</span>
                        {(s.media_total || 0) > 0 && <span>Media: {formatMoney(s.media_total)}</span>}
                        {(s.kythuat_total || 0) > 0 && <span>KT: {formatMoney(s.kythuat_total)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Salary detail view */}
        {view === 'salaryDetail' && selectedSalary && (
          <SalaryDetail salary={selectedSalary} />
        )}

        {/* Change password view */}
        {view === 'password' && (
          <form className="mprof-pw-form" onSubmit={handleChangePassword}>
            <div className="mprof-pw-field">
              <label>Mật khẩu cũ</label>
              <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} required autoComplete="current-password" />
            </div>
            <div className="mprof-pw-field">
              <label>Mật khẩu mới</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required autoComplete="new-password" />
            </div>
            <div className="mprof-pw-field">
              <label>Xác nhận mật khẩu mới</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required autoComplete="new-password" />
            </div>
            {pwError && <div className="mprof-pw-error">{pwError}</div>}
            {pwSuccess && <div className="mprof-pw-success">{pwSuccess}</div>}
            <button type="submit" className="mprof-pw-submit" disabled={pwLoading}>
              {pwLoading ? 'Đang xử lý...' : 'Đổi mật khẩu'}
            </button>
          </form>
        )}
      </div>
    );
  }

  // Main menu view
  return (
    <div className="mobile-page mprof-page">
      <div className="mprof-header">
        <div className="mprof-avatar">
          {user?.avatar_url
            ? <img src={user.avatar_url} alt="" />
            : <span>{user?.name?.charAt(0)?.toUpperCase() || '?'}</span>
          }
        </div>
        <h2 className="mprof-name">{user?.name || 'Người dùng'}</h2>
        <p className="mprof-role">{user?.role || 'Nhân viên'}</p>
        {user?.team && <p className="mprof-team">{user.team}</p>}
      </div>

      <div className="mprof-menu">
        <button className="mprof-menu-item" onClick={() => setView('info')}>
          <span className="mprof-menu-icon">👤</span>
          <span className="mprof-menu-label">Thông tin cá nhân</span>
          <span className="mprof-menu-arrow">▶</span>
        </button>
        <button className="mprof-menu-item" onClick={() => setView('salary')}>
          <span className="mprof-menu-icon">💰</span>
          <span className="mprof-menu-label">Phiếu lương</span>
          <span className="mprof-menu-arrow">▶</span>
        </button>
        <button className="mprof-menu-item" onClick={() => setView('password')}>
          <span className="mprof-menu-icon">🔒</span>
          <span className="mprof-menu-label">Đổi mật khẩu</span>
          <span className="mprof-menu-arrow">▶</span>
        </button>
        <div className="mprof-menu-divider" />
        <button className="mprof-menu-item mprof-menu-danger" onClick={onLogout}>
          <span className="mprof-menu-icon">🚪</span>
          <span className="mprof-menu-label">Đăng xuất</span>
        </button>
      </div>
    </div>
  );
}

// Info row component
function InfoRow({ label, value }) {
  return (
    <div className="mprof-info-row">
      <span className="mprof-info-label">{label}</span>
      <span className="mprof-info-val">{value || '—'}</span>
    </div>
  );
}

// Salary detail component
function SalaryDetail({ salary }) {
  const s = salary;
  const st = SALARY_STATUS[s.status] || SALARY_STATUS.draft;

  const sections = [
    { label: 'Lương cơ bản', items: [
      { label: 'Lương tháng', val: formatMoney(s.basic_salary) },
      { label: 'Lương/ngày', val: formatMoney(s.basic_per_day) },
      { label: 'Ngày công', val: s.work_days },
      { label: 'Thực nhận CB', val: formatMoney(s.actual_basic), bold: true },
    ]},
  ];

  if ((s.media_total || 0) > 0) {
    sections.push({ label: 'Quay & Dựng', items: [
      { label: 'Số video', val: s.media_videos },
      { label: 'Đơn giá/video', val: formatMoney(s.media_per_video) },
      { label: 'Tổng', val: formatMoney(s.media_total), bold: true },
    ]});
  }

  if ((s.media_actor_total || 0) > 0) {
    sections.push({ label: 'Diễn viên', items: [
      { label: 'Số lần', val: s.media_actor_count },
      { label: 'Đơn giá', val: formatMoney(s.media_actor_per_video) },
      { label: 'Tổng', val: formatMoney(s.media_actor_total), bold: true },
    ]});
  }

  if ((s.kythuat_total || 0) > 0) {
    sections.push({ label: 'Kỹ thuật', items: [
      { label: 'Số job', val: s.kythuat_jobs },
      { label: 'Đơn giá', val: formatMoney(s.kythuat_per_job) },
      { label: 'Tổng', val: formatMoney(s.kythuat_total), bold: true },
    ]});
  }

  if ((s.livestream_total || 0) > 0) {
    sections.push({ label: 'Livestream', items: [
      { label: 'Doanh thu', val: formatMoney(s.livestream_revenue) },
      { label: 'Hoa hồng %', val: `${s.livestream_commission}%` },
      { label: 'Tổng', val: formatMoney(s.livestream_total), bold: true },
    ]});
  }

  if ((s.kho_total || 0) > 0) {
    sections.push({ label: 'Kho', items: [
      { label: 'Số đơn', val: s.kho_orders },
      { label: 'Đơn giá', val: formatMoney(s.kho_per_order) },
      { label: 'Tổng', val: formatMoney(s.kho_total), bold: true },
    ]});
  }

  if ((s.sale_total || 0) > 0) {
    sections.push({ label: 'Sales', items: [
      { label: 'Doanh thu', val: formatMoney(s.sale_revenue) },
      { label: 'Hoa hồng %', val: `${s.sale_commission}%` },
      { label: 'Tổng', val: formatMoney(s.sale_total), bold: true },
    ]});
  }

  const customItems = s.custom_items || [];

  return (
    <div className="mprof-sal-detail">
      <div className="mprof-sal-detail-header">
        <span className="mprof-sal-detail-month">{formatMonth(s.month)}</span>
        <span className={`mprof-sal-badge ${st.cls}`}>{st.label}</span>
      </div>

      <div className="mprof-sal-detail-total">
        <span className="mprof-sal-detail-total-label">Tổng lương</span>
        <span className="mprof-sal-detail-total-val">{formatMoney(s.total_salary)}</span>
      </div>

      {sections.map((sec, i) => (
        <div key={i} className="mprof-sal-section">
          <h4 className="mprof-sal-section-title">{sec.label}</h4>
          {sec.items.map((item, j) => (
            <div key={j} className={`mprof-sal-row ${item.bold ? 'bold' : ''}`}>
              <span>{item.label}</span>
              <span>{item.val}</span>
            </div>
          ))}
        </div>
      ))}

      {customItems.length > 0 && (
        <div className="mprof-sal-section">
          <h4 className="mprof-sal-section-title">Khoản khác</h4>
          {customItems.map((item, i) => (
            <div key={i} className="mprof-sal-row">
              <span>{item.name}</span>
              <span>{formatMoney(item.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {((s.bonus || 0) > 0 || (s.deduction || 0) > 0) && (
        <div className="mprof-sal-section">
          <h4 className="mprof-sal-section-title">Điều chỉnh</h4>
          {(s.bonus || 0) > 0 && (
            <div className="mprof-sal-row">
              <span>Thưởng</span>
              <span className="mprof-text-green">+{formatMoney(s.bonus)}</span>
            </div>
          )}
          {(s.deduction || 0) > 0 && (
            <div className="mprof-sal-row">
              <span>Khấu trừ</span>
              <span className="mprof-text-red">-{formatMoney(s.deduction)}</span>
            </div>
          )}
        </div>
      )}

      {s.note && (
        <div className="mprof-sal-note">
          <span className="mprof-sal-note-label">Ghi chú:</span>
          <span>{s.note}</span>
        </div>
      )}
    </div>
  );
}

function formatMonth(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  return `Tháng ${parseInt(m)}/${y}`;
}

function formatDateVN(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

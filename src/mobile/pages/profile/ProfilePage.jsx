import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { useMobileProfile } from '../../hooks/useMobileProfile';
import { uploadImage } from '../../../utils/cloudinaryUpload';
import { formatMoney } from '../../utils/formatters';
import { haptic } from '../../utils/haptics';

const SALARY_STATUS = {
  draft: { label: 'Nháp', cls: 'mprof-sal-draft' },
  approved: { label: 'Đã duyệt', cls: 'mprof-sal-approved' },
  paid: { label: 'Đã trả', cls: 'mprof-sal-paid' },
};

export default function ProfilePage({ user, tenantId, onLogout, initialView, onBack }) {
  const { fetchSalaries, updateProfile } = useMobileProfile(user?.id, tenantId);

  const [view, setView] = useState(initialView || 'menu');
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

  // Edit profile state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef(null);

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
    if (editing) { setEditing(false); return; }
    if (view === 'salaryDetail') { setView('salary'); setSelectedSalary(null); }
    else if (initialView && onBack) { onBack(); }
    else { setView('menu'); }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  // --- Profile edit ---
  const startEditing = () => {
    setEditForm({
      name: user?.name || '',
      phone: user?.phone || '',
      address: user?.address || '',
      date_of_birth: user?.date_of_birth || '',
      bank_name: user?.bank_name || '',
      bank_account: user?.bank_account || '',
      avatar_url: user?.avatar_url || '',
    });
    setEditing(true);
  };

  // Avatar pick — dùng Cloudinary giống desktop HrmEmployeesView
  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Ảnh tối đa 5MB'); return; }
    setAvatarUploading(true);
    try {
      const result = await uploadImage(file, 'avatars');
      setEditForm(prev => ({ ...prev, avatar_url: result.url }));
    } catch (err) {
      alert('Lỗi upload ảnh: ' + err.message);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  // Save — update bảng users, ĐÚNG columns như desktop ProfileModal
  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const fields = {
        name: editForm.name || null,
        phone: editForm.phone || null,
        address: editForm.address || null,
        date_of_birth: editForm.date_of_birth || null,
        bank_name: editForm.bank_name || null,
        bank_account: editForm.bank_account || null,
      };
      // Avatar update — nếu đã đổi
      if (editForm.avatar_url !== (user?.avatar_url || '')) {
        fields.avatar_url = editForm.avatar_url || null;
      }
      await updateProfile(fields);
      // Update local user object cho UI phản ánh ngay
      Object.assign(user, fields);
      await haptic();
      setEditing(false);
      showToast('Cập nhật thành công');
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Change password ---
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(''); setPwSuccess('');
    if (newPw !== confirmPw) { setPwError('Mật khẩu xác nhận không khớp'); return; }
    if (newPw.length < 6) { setPwError('Mật khẩu mới tối thiểu 6 ký tự'); return; }
    setPwLoading(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user?.email, password: oldPw });
      if (signInErr) throw new Error('Mật khẩu hiện tại không đúng');
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) throw new Error('Không thể cập nhật mật khẩu');
      setPwSuccess('Đổi mật khẩu thành công!');
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) { setPwError(err.message); }
    finally { setPwLoading(false); }
  };

  const handleOpenSalaryDetail = (salary) => { setSelectedSalary(salary); setView('salaryDetail'); };

  // Sub-page views
  if (view !== 'menu') {
    return (
      <div className="mobile-page mprof-subpage">
        <div className="mprof-sub-header">
          <button className="mprof-back-btn" onClick={handleBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="mprof-sub-title">
            {view === 'info' && 'Thông tin cá nhân'}
            {view === 'salary' && 'Phiếu lương'}
            {view === 'salaryDetail' && 'Chi tiết lương'}
            {view === 'password' && 'Đổi mật khẩu'}
          </span>
          {view === 'info' && !editing && (
            <button className="mprof-edit-header-btn" onClick={startEditing}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          )}
          {view === 'info' && editing && (
            <button className="mprof-cancel-header-btn" onClick={() => setEditing(false)}>Huỷ</button>
          )}
        </div>

        {/* === Info view === */}
        {view === 'info' && (
          <div className="mprof-info-page">
            {/* Avatar */}
            <div className="mprof-info-avatar-wrap">
              <button className="mprof-info-avatar-btn" onClick={editing ? handleAvatarPick : undefined}>
                <div className="mprof-info-avatar">
                  {(editing ? editForm.avatar_url : user?.avatar_url)
                    ? <img src={editing ? editForm.avatar_url : user?.avatar_url} alt="" />
                    : <span>{user?.name?.charAt(0)?.toUpperCase() || '?'}</span>
                  }
                  {avatarUploading && <div className="mprof-info-avatar-spinner">...</div>}
                </div>
                {editing && <span className="mprof-info-avatar-hint">Đổi ảnh đại diện</span>}
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarChange} />
            </div>

            {/* Fields */}
            <div className="mprof-info-list">
              <EditableRow label="Họ tên" value={editing ? editForm.name : user?.name} editing={editing} onChange={v => setEditForm(p => ({ ...p, name: v }))} />
              <EditableRow label="SĐT" value={editing ? editForm.phone : user?.phone} editing={editing} type="tel" onChange={v => setEditForm(p => ({ ...p, phone: v }))} />
              <EditableRow label="Ngày sinh" value={editing ? editForm.date_of_birth : user?.date_of_birth} editing={editing} type="date" onChange={v => setEditForm(p => ({ ...p, date_of_birth: v }))} displayValue={!editing ? formatDateVN(user?.date_of_birth) : undefined} />
              <EditableRow label="Địa chỉ" value={editing ? editForm.address : user?.address} editing={editing} onChange={v => setEditForm(p => ({ ...p, address: v }))} />
              <EditableRow label="Ngân hàng" value={editing ? editForm.bank_name : user?.bank_name} editing={editing} onChange={v => setEditForm(p => ({ ...p, bank_name: v }))} />
              <EditableRow label="Số TK" value={editing ? editForm.bank_account : user?.bank_account} editing={editing} onChange={v => setEditForm(p => ({ ...p, bank_account: v }))} />
              <InfoRow label="Email" value={user?.email} locked />
              <InfoRow label="Chức vụ" value={user?.role} locked />
              <InfoRow label="Team" value={user?.team} locked />
              <InfoRow label="Ngày vào làm" value={formatDateVN(user?.start_date)} locked />
            </div>

            {editing && (
              <div className="mprof-info-save-wrap">
                <button className="mprof-info-save-btn" onClick={handleSaveProfile} disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            )}
            <div style={{ height: editing ? 130 : 100 }} />
          </div>
        )}

        {/* === Salary list === */}
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
                  return (
                    <button key={s.id} className="mprof-salary-card" onClick={() => handleOpenSalaryDetail(s)}>
                      <div className="mprof-sal-top">
                        <span className="mprof-sal-month">{formatMonth(s.month)}</span>
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

        {/* === Salary detail === */}
        {view === 'salaryDetail' && selectedSalary && <SalaryDetail salary={selectedSalary} />}

        {/* === Change password === */}
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

        {/* Toast */}
        {toast && <div className="mprof-toast">{toast}</div>}
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

// Editable row — edit mode shows input, view mode shows text
function EditableRow({ label, value, editing, type = 'text', onChange, displayValue }) {
  if (editing) {
    return (
      <div className="mprof-info-row mprof-info-row-edit">
        <span className="mprof-info-label">{label}</span>
        <input
          className="mprof-info-input"
          type={type}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={label}
        />
      </div>
    );
  }
  return (
    <div className="mprof-info-row">
      <span className="mprof-info-label">{label}</span>
      <span className="mprof-info-val">{displayValue || value || '—'}</span>
    </div>
  );
}

// Read-only row with lock icon
function InfoRow({ label, value, locked }) {
  return (
    <div className={`mprof-info-row ${locked ? 'mprof-info-locked' : ''}`}>
      <span className="mprof-info-label">{label}</span>
      <span className="mprof-info-val">{value || '—'}</span>
      {locked && (
        <svg className="mprof-info-lock-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
      )}
    </div>
  );
}

// Salary detail component (unchanged)
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

      {/* Media breakdown — 4 ô Content/Quay/Dựng/Diễn */}
      {s.detail && (
        (s.detail.media_content_count > 0 ||
         s.detail.media_film_count > 0 ||
         s.detail.media_edit_count > 0 ||
         s.detail.media_actor_count > 0) && (
          <div className="mprof-sal-section">
            <h4 className="mprof-sal-section-title">📊 Công việc Media</h4>
            <div className="mprof-media-grid">
              <div className="mprof-media-cell mprof-media-content">
                <div className="mprof-media-icon">📝</div>
                <div className="mprof-media-num">{s.detail.media_content_count || 0}</div>
                <div className="mprof-media-lbl">Content</div>
              </div>
              <div className="mprof-media-cell mprof-media-film">
                <div className="mprof-media-icon">🎥</div>
                <div className="mprof-media-num">{s.detail.media_film_count || 0}</div>
                <div className="mprof-media-lbl">Quay</div>
              </div>
              <div className="mprof-media-cell mprof-media-edit">
                <div className="mprof-media-icon">✂️</div>
                <div className="mprof-media-num">{s.detail.media_edit_count || 0}</div>
                <div className="mprof-media-lbl">Dựng</div>
              </div>
              <div className="mprof-media-cell mprof-media-actor">
                <div className="mprof-media-icon">🎭</div>
                <div className="mprof-media-num">{s.detail.media_actor_count || 0}</div>
                <div className="mprof-media-lbl">Diễn</div>
              </div>
            </div>
          </div>
        )
      )}

      {sections.map((sec, i) => (
        <div key={i} className="mprof-sal-section">
          <h4 className="mprof-sal-section-title">{sec.label}</h4>
          {sec.items.map((item, j) => (
            <div key={j} className={`mprof-sal-row ${item.bold ? 'bold' : ''}`}>
              <span>{item.label}</span><span>{item.val}</span>
            </div>
          ))}
        </div>
      ))}
      {customItems.length > 0 && (
        <div className="mprof-sal-section">
          <h4 className="mprof-sal-section-title">Khoản khác</h4>
          {customItems.map((item, i) => (
            <div key={i} className="mprof-sal-row"><span>{item.name}</span><span>{formatMoney(item.amount)}</span></div>
          ))}
        </div>
      )}
      {((s.bonus || 0) > 0 || (s.deduction || 0) > 0) && (
        <div className="mprof-sal-section">
          <h4 className="mprof-sal-section-title">Điều chỉnh</h4>
          {(s.bonus || 0) > 0 && <div className="mprof-sal-row"><span>Thưởng</span><span className="mprof-text-green">+{formatMoney(s.bonus)}</span></div>}
          {(s.deduction || 0) > 0 && <div className="mprof-sal-row"><span>Khấu trừ</span><span className="mprof-text-red">-{formatMoney(s.deduction)}</span></div>}
        </div>
      )}
      {s.note && (
        <div className="mprof-sal-note"><span className="mprof-sal-note-label">Ghi chú:</span><span>{s.note}</span></div>
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

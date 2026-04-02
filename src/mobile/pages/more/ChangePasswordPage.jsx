import React, { useState } from 'react';
import { useMobileProfile } from '../../hooks/useMobileProfile';
import { haptic } from '../../utils/haptics';

export default function ChangePasswordPage({ user, tenantId, onBack }) {
  const { changePassword } = useMobileProfile(user?.id, tenantId);

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!oldPw) { setError('Nhập mật khẩu cũ'); return; }
    if (newPw.length < 6) { setError('Mật khẩu mới tối thiểu 6 ký tự'); return; }
    if (newPw !== confirmPw) { setError('Mật khẩu mới không khớp'); return; }

    setSubmitting(true);
    try {
      await changePassword(oldPw, newPw);
      await haptic();
      setSuccess(true);
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setError(err.message || 'Lỗi đổi mật khẩu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-page mchpw-page">
      {/* Header */}
      <div className="mchpw-header">
        <button className="mchpw-back" onClick={onBack}>← Quay lại</button>
        <h2 className="mchpw-title">Đổi mật khẩu</h2>
      </div>

      <div className="mchpw-body">
        <div className="mchpw-section">
          {success && (
            <div className="mchpw-success">Đổi mật khẩu thành công!</div>
          )}
          {error && (
            <div className="mchpw-error">{error}</div>
          )}

          <label className="mchpw-label">Mật khẩu cũ</label>
          <input
            type="password"
            className="mchpw-input"
            value={oldPw}
            onChange={e => { setOldPw(e.target.value); setError(''); setSuccess(false); }}
            placeholder="Nhập mật khẩu hiện tại"
            autoComplete="current-password"
          />

          <label className="mchpw-label">Mật khẩu mới</label>
          <input
            type="password"
            className="mchpw-input"
            value={newPw}
            onChange={e => { setNewPw(e.target.value); setError(''); setSuccess(false); }}
            placeholder="Tối thiểu 6 ký tự"
            autoComplete="new-password"
          />

          <label className="mchpw-label">Xác nhận mật khẩu mới</label>
          <input
            type="password"
            className="mchpw-input"
            value={confirmPw}
            onChange={e => { setConfirmPw(e.target.value); setError(''); setSuccess(false); }}
            placeholder="Nhập lại mật khẩu mới"
            autoComplete="new-password"
          />

          <button
            className="mchpw-submit"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Đang xử lý...' : 'Đổi mật khẩu'}
          </button>
        </div>
      </div>
    </div>
  );
}

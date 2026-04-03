import React, { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { haptic } from '../../utils/haptics';

export default function ChangePasswordPage({ user, onBack }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const clearMessages = () => { setError(''); setSuccess(false); };

  const handleSubmit = async () => {
    clearMessages();
    if (!oldPw) { setError('Vui lòng nhập mật khẩu hiện tại'); return; }
    if (newPw.length < 6) { setError('Mật khẩu mới tối thiểu 6 ký tự'); return; }
    if (newPw !== confirmPw) { setError('Mật khẩu mới không khớp'); return; }

    setSubmitting(true);
    try {
      // Bước 1: Verify mật khẩu cũ qua Supabase Auth
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: oldPw,
      });
      if (signInErr) throw new Error('Mật khẩu hiện tại không đúng');

      // Bước 2: Đổi mật khẩu mới qua Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPw,
      });
      if (updateErr) throw new Error('Không thể cập nhật mật khẩu: ' + updateErr.message);

      await haptic('heavy');
      setSuccess(true);
      setOldPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => onBack(), 1500);
    } catch (err) {
      setError(err.message || 'Lỗi đổi mật khẩu');
    } finally {
      setSubmitting(false);
    }
  };

  const EyeIcon = ({ show }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {show ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </>
      )}
    </svg>
  );

  return (
    <div className="mobile-page mchpw-page">
      {/* Header */}
      <div className="mchpw-header">
        <button className="mchpw-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="mchpw-title">Đổi mật khẩu</h2>
      </div>

      <div className="mchpw-body">
        <div className="mchpw-section">
          {success && (
            <div className="mchpw-success">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
              Đổi mật khẩu thành công!
            </div>
          )}
          {error && (
            <div className="mchpw-error">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {error}
            </div>
          )}

          <label className="mchpw-label">Mật khẩu hiện tại</label>
          <div className="mchpw-input-wrap">
            <input
              type={showOld ? 'text' : 'password'}
              className="mchpw-input"
              value={oldPw}
              onChange={e => { setOldPw(e.target.value); clearMessages(); }}
              placeholder="Nhập mật khẩu hiện tại"
              autoComplete="current-password"
            />
            <button className="mchpw-eye" type="button" onClick={() => setShowOld(!showOld)}>
              <EyeIcon show={showOld} />
            </button>
          </div>

          <label className="mchpw-label">Mật khẩu mới</label>
          <div className="mchpw-input-wrap">
            <input
              type={showNew ? 'text' : 'password'}
              className="mchpw-input"
              value={newPw}
              onChange={e => { setNewPw(e.target.value); clearMessages(); }}
              placeholder="Tối thiểu 6 ký tự"
              autoComplete="new-password"
            />
            <button className="mchpw-eye" type="button" onClick={() => setShowNew(!showNew)}>
              <EyeIcon show={showNew} />
            </button>
          </div>

          <label className="mchpw-label">Xác nhận mật khẩu mới</label>
          <div className="mchpw-input-wrap">
            <input
              type={showConfirm ? 'text' : 'password'}
              className="mchpw-input"
              value={confirmPw}
              onChange={e => { setConfirmPw(e.target.value); clearMessages(); }}
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
            />
            <button className="mchpw-eye" type="button" onClick={() => setShowConfirm(!showConfirm)}>
              <EyeIcon show={showConfirm} />
            </button>
          </div>
        </div>

        <div style={{ height: 100 }} />
      </div>

      {/* Sticky submit */}
      <div className="mchpw-footer">
        <button
          className="mchpw-submit"
          onClick={handleSubmit}
          disabled={submitting || success}
        >
          {submitting ? 'Đang xử lý...' : 'Đổi mật khẩu'}
        </button>
      </div>
    </div>
  );
}

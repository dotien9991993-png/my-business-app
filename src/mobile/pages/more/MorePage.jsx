import React, { useState } from 'react';

export default function MorePage({ user, tenantId, onNavigate, onLogout }) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  return (
    <div className="mobile-page mmore-page">
      {/* User header */}
      <div className="mmore-user-header">
        <div className="mmore-avatar">
          {user?.avatar_url
            ? <img src={user.avatar_url} alt="" />
            : <span>{user?.name?.charAt(0)?.toUpperCase() || '?'}</span>
          }
        </div>
        <div className="mmore-user-info">
          <span className="mmore-user-name">{user?.name || 'Người dùng'}</span>
          <span className="mmore-user-role">{user?.role || 'Nhân viên'}</span>
          {user?.team && <span className="mmore-user-team">{user.team}</span>}
        </div>
      </div>

      {/* Menu items */}
      <div className="mmore-menu">
        <button className="mmore-menu-item" onClick={() => onNavigate('attendance')}>
          <span className="mmore-menu-icon">✅</span>
          <span className="mmore-menu-label">Chấm công</span>
          <span className="mmore-menu-arrow">▶</span>
        </button>
        <button className="mmore-menu-item" onClick={() => onNavigate('salary')}>
          <span className="mmore-menu-icon">💰</span>
          <span className="mmore-menu-label">Xem lương</span>
          <span className="mmore-menu-arrow">▶</span>
        </button>
        <button className="mmore-menu-item" onClick={() => onNavigate('profile')}>
          <span className="mmore-menu-icon">👤</span>
          <span className="mmore-menu-label">Thông tin cá nhân</span>
          <span className="mmore-menu-arrow">▶</span>
        </button>
      </div>

      <div className="mmore-menu mmore-menu-bottom">
        <button className="mmore-menu-item mmore-menu-danger" onClick={() => setShowLogoutConfirm(true)}>
          <span className="mmore-menu-icon">🚪</span>
          <span className="mmore-menu-label">Đăng xuất</span>
        </button>
      </div>

      {/* Logout confirm dialog */}
      {showLogoutConfirm && (
        <div className="mmore-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="mmore-dialog" onClick={e => e.stopPropagation()}>
            <h3 className="mmore-dialog-title">Đăng xuất?</h3>
            <p className="mmore-dialog-text">Bạn có chắc muốn đăng xuất khỏi ứng dụng?</p>
            <div className="mmore-dialog-actions">
              <button className="mmore-dialog-cancel" onClick={() => setShowLogoutConfirm(false)}>Huỷ</button>
              <button className="mmore-dialog-confirm" onClick={handleLogout}>Đăng xuất</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

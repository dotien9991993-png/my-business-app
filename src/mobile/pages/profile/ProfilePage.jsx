import React from 'react';

export default function ProfilePage({ user, tenantId, onLogout }) {
  return (
    <div className="mobile-page">
      <div className="mobile-profile-header">
        <div className="mobile-profile-avatar">
          {user?.avatar_url
            ? <img src={user.avatar_url} alt="" />
            : <span>{user?.name?.charAt(0)?.toUpperCase() || '?'}</span>
          }
        </div>
        <h2 className="mobile-profile-name">{user?.name || 'Người dùng'}</h2>
        <p className="mobile-profile-role">{user?.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}</p>
      </div>

      <div className="mobile-menu-list">
        <button className="mobile-menu-item">
          <span>👤</span> Thông tin cá nhân
        </button>
        <button className="mobile-menu-item">
          <span>💰</span> Phiếu lương
        </button>
        <button className="mobile-menu-item">
          <span>🔒</span> Đổi mật khẩu
        </button>
        <button className="mobile-menu-item danger" onClick={onLogout}>
          <span>🚪</span> Đăng xuất
        </button>
      </div>
    </div>
  );
}

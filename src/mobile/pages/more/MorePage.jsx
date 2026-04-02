import React, { useState } from 'react';

const APP_VERSION = '1.0.0';

export default function MorePage({ user, onNavigate, onLogout, unreadNotifCount = 0 }) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  const openPrivacy = async () => {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: 'https://in.hoangnamaudio.vn/#privacy' });
    } catch (_) {
      window.open('https://in.hoangnamaudio.vn/#privacy', '_blank');
    }
  };

  const openAppStoreRating = async () => {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: 'https://apps.apple.com/app/hoang-nam-audio/id6740003565?action=write-review' });
    } catch (_) {
      window.open('https://apps.apple.com/app/hoang-nam-audio/id6740003565?action=write-review', '_blank');
    }
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

      {/* Group 1: Công việc */}
      <div className="mmore-group">
        <div className="mmore-group-title">Công việc</div>
        <div className="mmore-menu">
          <MenuItem icon="✅" label="Chấm công" onClick={() => onNavigate('attendance')} />
          <MenuItem icon="💰" label="Xem lương" onClick={() => onNavigate('salary')} />
        </div>
      </div>

      {/* Group 2: Thông báo */}
      <div className="mmore-group">
        <div className="mmore-group-title">Thông báo</div>
        <div className="mmore-menu">
          <MenuItem
            icon="🔔"
            label="Thông báo"
            onClick={() => onNavigate('notifications')}
            badge={unreadNotifCount}
          />
        </div>
      </div>

      {/* Group 3: Tài khoản */}
      <div className="mmore-group">
        <div className="mmore-group-title">Tài khoản</div>
        <div className="mmore-menu">
          <MenuItem icon="🔑" label="Đổi mật khẩu" onClick={() => onNavigate('password')} />
          <MenuItem icon="👤" label="Thông tin cá nhân" onClick={() => onNavigate('profile')} />
        </div>
      </div>

      {/* Group 4: Ứng dụng */}
      <div className="mmore-group">
        <div className="mmore-group-title">Ứng dụng</div>
        <div className="mmore-menu">
          <MenuItem icon="ℹ️" label="Phiên bản ứng dụng" right={`v${APP_VERSION}`} disabled />
          <MenuItem icon="📜" label="Chính sách bảo mật" onClick={openPrivacy} />
          <MenuItem icon="⭐" label="Đánh giá ứng dụng" onClick={openAppStoreRating} />
        </div>
      </div>

      {/* Group 5: Đăng xuất */}
      <div className="mmore-group">
        <div className="mmore-menu">
          <button className="mmore-menu-item mmore-menu-danger" onClick={() => setShowLogoutConfirm(true)}>
            <span className="mmore-menu-icon">🚪</span>
            <span className="mmore-menu-label">Đăng xuất</span>
          </button>
        </div>
      </div>

      <div style={{ height: 20 }} />

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

function MenuItem({ icon, label, onClick, badge, right, disabled }) {
  return (
    <button className={`mmore-menu-item ${disabled ? 'mmore-menu-disabled' : ''}`} onClick={disabled ? undefined : onClick}>
      <span className="mmore-menu-icon">{icon}</span>
      <span className="mmore-menu-label">{label}</span>
      {badge > 0 && (
        <span className="mmore-menu-badge">{badge > 99 ? '99+' : badge}</span>
      )}
      {right && <span className="mmore-menu-right">{right}</span>}
      {!disabled && !right && <span className="mmore-menu-arrow">▶</span>}
    </button>
  );
}

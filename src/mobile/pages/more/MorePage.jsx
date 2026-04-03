import React, { useState } from 'react';
import { haptic } from '../../utils/haptics';

const APP_VERSION = '1.0.0';

// SVG Icons — inline, không dùng emoji
const Icons = {
  attendance: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  ),
  salary: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A32D2D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  ),
  person: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  lock: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#534AB7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
  shield: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  star: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  clipboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  ),
  chevron: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
};

const ICON_COLORS = {
  attendance: '#E6F1FB',
  salary: '#FAEEDA',
  bell: '#FCEBEB',
  person: '#E1F5EE',
  lock: '#EEEDFE',
  info: '#F3F4F6',
  shield: '#E6F1FB',
  star: '#FAEEDA',
  clipboard: '#FAEEDA',
};

export default function MorePage({ user, onNavigate, onLogout, unreadNotifCount = 0 }) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  const handleNav = (page) => {
    haptic();
    onNavigate(page);
  };

  const openPrivacy = async () => {
    haptic();
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: 'https://in.hoangnamaudio.vn/#privacy' });
    } catch (_) {
      window.open('https://in.hoangnamaudio.vn/#privacy', '_blank');
    }
  };

  const openAppStoreRating = async () => {
    haptic();
    // TODO: Replace with actual App Store URL when published
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: 'https://apps.apple.com/app/hoang-nam-audio/id6740003565?action=write-review' });
    } catch (_) {
      window.open('https://apps.apple.com/app/hoang-nam-audio/id6740003565?action=write-review', '_blank');
    }
  };

  return (
    <div className="mobile-page mmore-page">
      {/* Profile Card */}
      <div className="mmore-profile-card">
        <div className="mmore-avatar-wrap">
          <div className="mmore-avatar2">
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="" />
              : <span>{user?.name?.charAt(0)?.toUpperCase() || '?'}</span>
            }
          </div>
          <button className="mmore-avatar-edit" onClick={() => handleNav('profile')}>
            {Icons.edit}
          </button>
        </div>
        <div className="mmore-profile-info">
          <span className="mmore-profile-name">{user?.name || 'Người dùng'}</span>
          <span className="mmore-profile-role">{user?.role || 'Nhân viên'}</span>
          {user?.team && <span className="mmore-profile-team">{user.team}</span>}
        </div>
      </div>

      {/* Menu Groups */}
      <div className="mmore-groups">

        {/* CÔNG VIỆC */}
        <div className="mmore-grp">
          <div className="mmore-grp-title">Công việc</div>
          <div className="mmore-card">
            <MenuItem icon={Icons.attendance} bg={ICON_COLORS.attendance} label="Chấm công" onClick={() => handleNav('attendance')} />
            <div className="mmore-divider" />
            <MenuItem icon={Icons.salary} bg={ICON_COLORS.salary} label="Xem lương" onClick={() => handleNav('salary')} />
            <div className="mmore-divider" />
            <MenuItem icon={Icons.clipboard} bg={ICON_COLORS.clipboard} label="Đơn từ" onClick={() => handleNav('leave')} />
          </div>
        </div>

        {/* THÔNG BÁO */}
        <div className="mmore-grp">
          <div className="mmore-grp-title">Thông báo</div>
          <div className="mmore-card">
            <MenuItem icon={Icons.bell} bg={ICON_COLORS.bell} label="Thông báo" onClick={() => handleNav('notifications')} badge={unreadNotifCount} />
          </div>
        </div>

        {/* TÀI KHOẢN */}
        <div className="mmore-grp">
          <div className="mmore-grp-title">Tài khoản</div>
          <div className="mmore-card">
            <MenuItem icon={Icons.person} bg={ICON_COLORS.person} label="Thông tin cá nhân" onClick={() => handleNav('profile')} />
            <div className="mmore-divider" />
            <MenuItem icon={Icons.lock} bg={ICON_COLORS.lock} label="Đổi mật khẩu" onClick={() => handleNav('password')} />
          </div>
        </div>

        {/* ỨNG DỤNG */}
        <div className="mmore-grp">
          <div className="mmore-grp-title">Ứng dụng</div>
          <div className="mmore-card">
            <MenuItem icon={Icons.info} bg={ICON_COLORS.info} label="Phiên bản" right={`v${APP_VERSION}`} />
            <div className="mmore-divider" />
            <MenuItem icon={Icons.shield} bg={ICON_COLORS.shield} label="Chính sách bảo mật" onClick={openPrivacy} />
            <div className="mmore-divider" />
            <MenuItem icon={Icons.star} bg={ICON_COLORS.star} label="Đánh giá ứng dụng" onClick={openAppStoreRating} />
          </div>
        </div>

        {/* ĐĂNG XUẤT */}
        <div className="mmore-grp">
          <div className="mmore-card">
            <button className="mmore-logout-btn" onClick={() => { haptic(); setShowLogoutConfirm(true); }}>
              Đăng xuất
            </button>
          </div>
        </div>

        <div style={{ height: 100 }} />
      </div>

      {/* Logout confirm */}
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

function MenuItem({ icon, bg, label, onClick, badge, right }) {
  const hasAction = !!onClick;
  return (
    <button className="mmore-item" onClick={hasAction ? onClick : undefined} style={!hasAction ? { cursor: 'default' } : undefined}>
      <span className="mmore-item-icon" style={{ background: bg }}>
        {icon}
      </span>
      <span className="mmore-item-label">{label}</span>
      {badge > 0 && (
        <span className="mmore-item-badge">{badge > 99 ? '99+' : badge}</span>
      )}
      {right && <span className="mmore-item-right">{right}</span>}
      {hasAction && !right && <span className="mmore-item-arrow">{Icons.chevron}</span>}
    </button>
  );
}

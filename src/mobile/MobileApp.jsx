import React, { useState } from 'react';
import { useMobileAuth } from './hooks/useMobileAuth';
import MobileHeader from './components/MobileHeader';
import MobileBottomNav from './components/MobileBottomNav';
import MobileLoading from './components/MobileLoading';
import ChatPage from './pages/chat/ChatPage';
import AttendancePage from './pages/attendance/AttendancePage';
import OrdersPage from './pages/orders/OrdersPage';
import MediaPage from './pages/media/MediaPage';
import ProfilePage from './pages/profile/ProfilePage';
import './styles/mobile.css';

const TAB_TITLES = {
  chat: 'Chat',
  attendance: 'Chấm công',
  orders: 'Đơn hàng',
  media: 'Video',
  profile: 'Tôi',
};

export default function MobileApp() {
  const { currentUser, tenant, tenantId, loading, login, logout } = useMobileAuth();
  const [activeTab, setActiveTab] = useState('chat');
  const [hideNav, setHideNav] = useState(false);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  if (loading) return <MobileLoading text="Đang tải..." />;

  if (!tenant) {
    return (
      <div className="mobile-app">
        <div className="mobile-error">
          <span>⚠️</span>
          <h2>Không thể kết nối</h2>
          <p>Vui lòng kiểm tra kết nối mạng</p>
        </div>
      </div>
    );
  }

  // Login screen
  if (!currentUser) {
    const handleLogin = async (e) => {
      e.preventDefault();
      setLoginError('');
      setLoginLoading(true);
      try {
        await login(loginUsername, loginPassword);
      } catch (err) {
        setLoginError(err.message);
      } finally {
        setLoginLoading(false);
      }
    };

    return (
      <div className="mobile-app">
        <div className="mobile-login">
          <div className="mobile-login-logo">
            {tenant.logo_url && <img src={tenant.logo_url} alt="" />}
            <h1>{tenant.name}</h1>
            <p>{tenant.slogan || 'Quản lý doanh nghiệp'}</p>
          </div>
          <form onSubmit={handleLogin} className="mobile-login-form">
            <input
              type="text"
              placeholder="Tên đăng nhập"
              value={loginUsername}
              onChange={e => setLoginUsername(e.target.value)}
              autoComplete="username"
              required
            />
            <input
              type="password"
              placeholder="Mật khẩu"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {loginError && <div className="mobile-login-error">{loginError}</div>}
            <button type="submit" disabled={loginLoading}>
              {loginLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main app
  const renderPage = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatPage user={currentUser} tenantId={tenantId} onHideNav={setHideNav} />;
      case 'attendance':
        return <AttendancePage user={currentUser} tenantId={tenantId} />;
      case 'orders':
        return <OrdersPage user={currentUser} tenantId={tenantId} />;
      case 'media':
        return <MediaPage user={currentUser} tenantId={tenantId} />;
      case 'profile':
        return <ProfilePage user={currentUser} tenantId={tenantId} onLogout={logout} />;
      default:
        return null;
    }
  };

  return (
    <div className="mobile-app">
      {!hideNav && <MobileHeader title={TAB_TITLES[activeTab]} />}
      <main className="mobile-content">
        {renderPage()}
      </main>
      {!hideNav && (
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
    </div>
  );
}

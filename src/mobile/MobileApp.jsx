import React, { useState, useEffect, useMemo } from 'react';
import { useMobileAuth } from './hooks/useMobileAuth';
import { useMobileChatBadge } from './hooks/useMobileChatBadge';
import MobileHeader from './components/MobileHeader';
import MobileBottomNav from './components/MobileBottomNav';
import MobileLoading from './components/MobileLoading';
import MobileErrorBoundary from './components/MobileErrorBoundary';
import ChatPage from './pages/chat/ChatPage';
import OrdersPage from './pages/orders/OrdersPage';
import MediaPage from './pages/media/MediaPage';
import JobsPage from './pages/jobs/JobsPage';
import MorePage from './pages/more/MorePage';
import AttendancePage from './pages/attendance/AttendancePage';
import ProfilePage from './pages/profile/ProfilePage';
import splashLogo from './assets/logo-splash.png';
import './styles/mobile.css';

export default function MobileApp() {
  const { currentUser, tenant, tenantId, loading, login, logout } = useMobileAuth();
  const { totalUnread: chatUnread } = useMobileChatBadge(currentUser?.id, tenantId);
  const [activeTab, setActiveTab] = useState('chat');
  const [hideNav, setHideNav] = useState(false);
  const [subPage, setSubPage] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Splash screen — show 2s then fade out
  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 2000);
    const hideTimer = setTimeout(() => setShowSplash(false), 2300);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, []);

  // Offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (showSplash) {
    return (
      <div className={`mobile-splash ${splashFading ? 'fade-out' : ''}`}>
        <img src={splashLogo} alt="" className="mobile-splash-logo" />
      </div>
    );
  }

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
              placeholder="Email"
              value={loginUsername}
              onChange={e => setLoginUsername(e.target.value)}
              autoComplete="email"
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

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSubPage(null);
  };

  const handleMoreNavigate = (page) => {
    setSubPage(page);
  };

  const handleSubPageBack = () => {
    setSubPage(null);
  };

  const renderPage = () => {
    if (activeTab === 'more' && subPage) {
      switch (subPage) {
        case 'attendance':
          return <MobileErrorBoundary><AttendancePage user={currentUser} tenantId={tenantId} onBack={handleSubPageBack} /></MobileErrorBoundary>;
        case 'salary':
          return <MobileErrorBoundary><ProfilePage user={currentUser} tenantId={tenantId} onLogout={logout} initialView="salary" onBack={handleSubPageBack} /></MobileErrorBoundary>;
        case 'profile':
          return <MobileErrorBoundary><ProfilePage user={currentUser} tenantId={tenantId} onLogout={logout} initialView="info" onBack={handleSubPageBack} /></MobileErrorBoundary>;
        default:
          break;
      }
    }

    switch (activeTab) {
      case 'chat':
        return <MobileErrorBoundary><ChatPage user={currentUser} tenantId={tenantId} onHideNav={setHideNav} /></MobileErrorBoundary>;
      case 'orders':
        return <MobileErrorBoundary><OrdersPage user={currentUser} tenantId={tenantId} /></MobileErrorBoundary>;
      case 'media':
        return <MobileErrorBoundary><MediaPage user={currentUser} tenantId={tenantId} /></MobileErrorBoundary>;
      case 'jobs':
        return <MobileErrorBoundary><JobsPage user={currentUser} tenantId={tenantId} /></MobileErrorBoundary>;
      case 'more':
        return <MobileErrorBoundary><MorePage user={currentUser} tenantId={tenantId} onNavigate={handleMoreNavigate} onLogout={logout} /></MobileErrorBoundary>;
      default:
        return null;
    }
  };

  return (
    <div className="mobile-app">
      {!isOnline && (
        <div className="mobile-offline-bar">
          📡 Không có kết nối mạng
        </div>
      )}
      {!hideNav && <MobileHeader user={currentUser} tenantId={tenantId} onNavigate={(page) => { setActiveTab('more'); setSubPage(page); }} />}
      <main className="mobile-content">
        {renderPage()}
      </main>
      {!hideNav && (
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          badges={{ chat: chatUnread }}
        />
      )}
    </div>
  );
}

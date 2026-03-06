import React, { useState } from 'react';
import { useMobileAuth } from './hooks/useMobileAuth';
import MobileHeader from './components/MobileHeader';
import MobileBottomNav from './components/MobileBottomNav';
import MobileLoading from './components/MobileLoading';
import ChatPage from './pages/chat/ChatPage';
import OrdersPage from './pages/orders/OrdersPage';
import MediaPage from './pages/media/MediaPage';
import JobsPage from './pages/jobs/JobsPage';
import MorePage from './pages/more/MorePage';
import AttendancePage from './pages/attendance/AttendancePage';
import ProfilePage from './pages/profile/ProfilePage';
import './styles/mobile.css';

export default function MobileApp() {
  const { currentUser, tenant, tenantId, loading, login, logout } = useMobileAuth();
  const [activeTab, setActiveTab] = useState('chat');
  const [hideNav, setHideNav] = useState(false);
  // Sub-page navigation from MorePage
  const [subPage, setSubPage] = useState(null); // 'attendance' | 'salary' | 'profile' | null

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

  // Handle tab change — reset subPage when switching tabs
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSubPage(null);
  };

  // Navigate to sub-page from MorePage
  const handleMoreNavigate = (page) => {
    setSubPage(page);
  };

  const handleSubPageBack = () => {
    setSubPage(null);
  };

  // Main app
  const renderPage = () => {
    // Sub-pages from MorePage
    if (activeTab === 'more' && subPage) {
      switch (subPage) {
        case 'attendance':
          return <AttendancePage user={currentUser} tenantId={tenantId} onBack={handleSubPageBack} />;
        case 'salary':
          return <ProfilePage user={currentUser} tenantId={tenantId} onLogout={logout} initialView="salary" onBack={handleSubPageBack} />;
        case 'profile':
          return <ProfilePage user={currentUser} tenantId={tenantId} onLogout={logout} initialView="info" onBack={handleSubPageBack} />;
        default:
          break;
      }
    }

    switch (activeTab) {
      case 'chat':
        return <ChatPage user={currentUser} tenantId={tenantId} onHideNav={setHideNav} />;
      case 'orders':
        return <OrdersPage user={currentUser} tenantId={tenantId} />;
      case 'media':
        return <MediaPage user={currentUser} tenantId={tenantId} />;
      case 'jobs':
        return <JobsPage user={currentUser} tenantId={tenantId} />;
      case 'more':
        return <MorePage user={currentUser} tenantId={tenantId} onNavigate={handleMoreNavigate} onLogout={logout} />;
      default:
        return null;
    }
  };

  return (
    <div className="mobile-app">
      {!hideNav && <MobileHeader tenant={tenant} />}
      <main className="mobile-content">
        {renderPage()}
      </main>
      {!hideNav && (
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      )}
    </div>
  );
}

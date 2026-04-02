import React, { useState, useEffect, useCallback } from 'react';
import { useMobileAuth } from './hooks/useMobileAuth';
import { useMobileChatBadge } from './hooks/useMobileChatBadge';
import { usePushNotifications } from './hooks/usePushNotifications';
import MobileHeader from './components/MobileHeader';
import MobileBottomNav from './components/MobileBottomNav';
import MobileLoading from './components/MobileLoading';
import MobileErrorBoundary from './components/MobileErrorBoundary';
import ChatPage from './pages/chat/ChatPage';
import OrdersPage from './pages/orders/OrdersPage';
import MediaPage from './pages/media/MediaPage';
import JobsPage from './pages/jobs/JobsPage';
import MorePage from './pages/more/MorePage';
import NotificationsPage from './pages/more/NotificationsPage';
import ChangePasswordPage from './pages/more/ChangePasswordPage';
import AttendancePage from './pages/attendance/AttendancePage';
import ProfilePage from './pages/profile/ProfilePage';
import { supabase } from '../supabaseClient';
import splashLogo from './assets/logo-splash.png';
import './styles/mobile.css';

export default function MobileApp() {
  const { currentUser, tenant, tenantId, loading, login, logout } = useMobileAuth();
  const { totalUnread: chatUnread } = useMobileChatBadge(currentUser?.id, tenantId);
  const [notifUnread, setNotifUnread] = useState(0);

  // Load notification unread count
  useEffect(() => {
    if (!currentUser?.id || !tenantId) return;
    const loadCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('user_id', currentUser.id)
        .eq('is_read', false);
      setNotifUnread(count || 0);
    };
    loadCount();
    const ch = supabase.channel(`mobile-notif-badge-${currentUser.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${currentUser.id}`,
      }, () => loadCount())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [currentUser?.id, tenantId]);

  const [activeTab, setActiveTab] = useState('chat');
  const [hideNav, setHideNav] = useState(false);
  const [subPage, setSubPage] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [entityToOpen, setEntityToOpen] = useState(null);

  // Push notification: navigate khi tap notification
  const handlePushNavigate = useCallback((data) => {
    const TAB_MAP = { order: 'orders', task: 'media', technical_job: 'jobs' };
    const tab = TAB_MAP[data.type];
    if (tab) {
      setActiveTab(tab);
      setEntityToOpen({ type: data.type, id: data.id });
    }
  }, []);
  usePushNotifications(currentUser, tenantId, handlePushNavigate);

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

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
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

  const handleEntityNavigate = (attachment) => {
    if (!attachment?.type || !attachment?.id) return;
    const TAB_MAP = { order: 'orders', task: 'media', technical_job: 'jobs' };
    const tab = TAB_MAP[attachment.type];
    if (!tab) {
      alert(`${attachment.title || 'Chi tiết'}\n${attachment.subtitle || ''}\n${attachment.status_label || ''}`);
      return;
    }
    setHideNav(false);
    setSubPage(null);
    setActiveTab(tab);
    setEntityToOpen({ type: attachment.type, id: attachment.id });
  };

  const handleEntityOpened = () => {
    setEntityToOpen(null);
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
        case 'notifications':
          return <MobileErrorBoundary><NotificationsPage user={currentUser} tenantId={tenantId} onBack={handleSubPageBack} onNavigateEntity={handleEntityNavigate} /></MobileErrorBoundary>;
        case 'password':
          return <MobileErrorBoundary><ChangePasswordPage user={currentUser} tenantId={tenantId} onBack={handleSubPageBack} /></MobileErrorBoundary>;
        default:
          break;
      }
    }

    switch (activeTab) {
      case 'chat':
        return <MobileErrorBoundary><ChatPage user={currentUser} tenantId={tenantId} onHideNav={setHideNav} onEntityNavigate={handleEntityNavigate} /></MobileErrorBoundary>;
      case 'orders':
        return <MobileErrorBoundary><OrdersPage user={currentUser} tenantId={tenantId} openEntityId={entityToOpen?.type === 'order' ? entityToOpen.id : null} onEntityOpened={handleEntityOpened} /></MobileErrorBoundary>;
      case 'media':
        return <MobileErrorBoundary><MediaPage user={currentUser} tenantId={tenantId} openEntityId={entityToOpen?.type === 'task' ? entityToOpen.id : null} onEntityOpened={handleEntityOpened} /></MobileErrorBoundary>;
      case 'jobs':
        return <MobileErrorBoundary><JobsPage user={currentUser} tenantId={tenantId} openEntityId={entityToOpen?.type === 'technical_job' ? entityToOpen.id : null} onEntityOpened={handleEntityOpened} /></MobileErrorBoundary>;
      case 'more':
        return <MobileErrorBoundary><MorePage user={currentUser} tenantId={tenantId} onNavigate={handleMoreNavigate} onLogout={logout} unreadNotifCount={notifUnread} /></MobileErrorBoundary>;
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
      {!hideNav && <MobileHeader
        user={currentUser}
        tenantId={tenantId}
        onNavigate={(page) => { setActiveTab('more'); setSubPage(page); }}
        onNotifNavigate={(tab, sub) => { setActiveTab(tab); setSubPage(sub); }}
      />}
      <main className="mobile-content">
        {renderPage()}
      </main>
      {!hideNav && (
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          badges={{ chat: chatUnread, more: notifUnread }}
        />
      )}
    </div>
  );
}

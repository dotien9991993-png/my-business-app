import React, { useEffect, Suspense, Component } from 'react';
import { supabase } from './supabaseClient';

// Context providers
import { AppProvider, useApp } from './contexts/AppContext';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';
import { DataProvider, useData } from './contexts/DataContext';

// Layout components
import LoginModal from './components/auth/LoginModal';
import RegisterModal from './components/auth/RegisterModal';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import ModuleTabBar from './components/layout/ModuleTabBar';
import MobileBottomTabs from './components/layout/MobileBottomTabs';
import AttendancePopup from './components/shared/AttendancePopup';
import PermissionsModal from './components/shared/PermissionsModal';

// Lazy import with retry (handles chunk load failures)
const lazyWithRetry = (importFn) => React.lazy(() =>
  importFn().catch(() => {
    const key = 'chunk_reload';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      window.location.reload();
    }
    return { default: () => null };
  })
);

// Module components (lazy loaded with retry)
const DashboardModule = lazyWithRetry(() => import('./modules/dashboard'));
const MediaModule = lazyWithRetry(() => import('./modules/media'));
const TechnicalModule = lazyWithRetry(() => import('./modules/technical'));
const WarehouseModule = lazyWithRetry(() => import('./modules/warehouse'));
const SalesModule = lazyWithRetry(() => import('./modules/sales'));
const FinanceModule = lazyWithRetry(() => import('./modules/finance'));
const MySalaryView = lazyWithRetry(() => import('./modules/finance/MySalaryView'));
const SettingsModule = lazyWithRetry(() => import('./modules/settings'));
const WarrantyModule = lazyWithRetry(() => import('./modules/warranty'));
const HrmModule = lazyWithRetry(() => import('./modules/hrm'));
const PublicWarrantyCheck = lazyWithRetry(() => import('./components/shared/PublicWarrantyCheck'));
const PrivacyPolicy = lazyWithRetry(() => import('./components/shared/PrivacyPolicy'));
const ChatModule = lazyWithRetry(() => import('./modules/chat'));
const ChatPopupManager = lazyWithRetry(() => import('./components/chat/ChatPopupManager'));
import { isAdmin } from './utils/permissionUtils';
import { requestNotificationPermission } from './utils/notificationSound';

// Global modals (lazy loaded with retry)
const CreateTaskModal = lazyWithRetry(() => import('./modules/media/CreateTaskModal'));
const TaskModal = lazyWithRetry(() => import('./modules/media/TaskModal'));
const CreateJobModal = lazyWithRetry(() => import('./modules/technical/CreateJobModal'));
const JobDetailModal = lazyWithRetry(() => import('./modules/technical/JobDetailModal'));

// ErrorBoundary — catches JS errors in module rendering
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(err, info) {
    console.error('ErrorBoundary caught:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-red-800 mb-2">Đã xảy ra lỗi</h2>
            <p className="text-red-600 mb-4 text-sm">{this.state.error?.message || 'Không thể tải module'}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mr-2"
            >Thử lại</button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >Tải lại trang</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// SilentErrorBoundary — for layout/popup components outside main content
// Renders nothing on error (graceful degradation) instead of crashing entire app
class SilentErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    console.error('SilentErrorBoundary caught:', err, info);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const ModuleLoading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="animate-spin text-4xl">⚙️</div>
  </div>
);

const NoModuleAccess = ({ moduleName }) => (
  <div className="p-6">
    <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
      <p className="text-red-600">Bạn không có quyền truy cập module {moduleName}.</p>
    </div>
  </div>
);

function AppContent() {
  const {
    tenant, tenantLoading, tenantError,
    isLoggedIn, currentUser, setCurrentUser,
    showLoginModal, setShowLoginModal, showRegisterModal, setShowRegisterModal,
    handleLogin, handleRegister,
    activeModule, setActiveModule, activeTab, setActiveTab, navigateTo,
    showMobileSidebar, setShowMobileSidebar,
    allUsers, showPermissionsModal, setShowPermissionsModal,
    canAccessModule, canAccessTab,
    loadUsers,
    setIsLoggedIn
  } = useApp();

  const {
    tasks, technicalJobs, receiptsPayments, orders,
    todayAttendances, setTodayAttendances,
    selectedTask, setSelectedTask, showModal, setShowModal,
    showCreateTaskModal, setShowCreateTaskModal,
    showCreateJobModal, setShowCreateJobModal, prefillJobData,
    selectedJob, setSelectedJob, showJobModal, setShowJobModal,
    showAttendancePopup, setShowAttendancePopup,
    changeStatus, createNewTask, createTechnicalJob, deleteTechnicalJob,
    addComment, addPostLink, removePostLink, deleteTask, loadTasks,
    loadTechnicalJobs, loadFinanceData, refreshAllData,
    saveJobEditDraft, loadJobEditDraft, clearJobEditDraft
  } = useData();

  const {
    notifications, showNotifications, setShowNotifications, unreadCount,
    markAsRead, markAllAsRead, deleteNotification, clearReadNotifications,
    addNotification, checkDeadlineNotifications
  } = useNotifications();

  // Clear chunk reload flag on successful load
  useEffect(() => {
    sessionStorage.removeItem('chunk_reload');
  }, []);

  // Xin quyền browser notification sau khi đăng nhập
  useEffect(() => {
    if (isLoggedIn) {
      requestNotificationPermission();
    }
  }, [isLoggedIn]);

  // Deadline check interval (needs tasks from DataContext)
  useEffect(() => {
    if (!currentUser || !tasks?.length) return;
    const timeout = setTimeout(() => { checkDeadlineNotifications(tasks); }, 5000);
    const interval = setInterval(() => checkDeadlineNotifications(tasks), 60 * 60 * 1000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [tasks, currentUser, checkDeadlineNotifications]);

  // Loading tenant
  if (tenantLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin text-6xl mb-4">⚙️</div>
          <h2 className="text-xl font-bold text-gray-800">Đang tải...</h2>
          <p className="text-gray-500 mt-2">Vui lòng chờ trong giây lát</p>
        </div>
      </div>
    );
  }

  // Tenant error
  if (tenantError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-600 mb-2">Không thể truy cập</h2>
          <p className="text-gray-600 mb-6">{tenantError}</p>
          <div className="text-sm text-gray-500">
            <p>Liên hệ hỗ trợ:</p>
            <p className="font-medium">support@yourdomain.com</p>
          </div>
        </div>
      </div>
    );
  }

  // Public privacy policy (no login required, required for App Store)
  if (window.location.hash.startsWith('#privacy')) {
    return <Suspense fallback={<ModuleLoading />}><PrivacyPolicy /></Suspense>;
  }

  // Public warranty check (no login required)
  if (window.location.hash.startsWith('#warranty-check')) {
    return <Suspense fallback={<ModuleLoading />}><PublicWarrantyCheck tenant={tenant} /></Suspense>;
  }

  // Not logged in
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img
                src={tenant.logo_url || "/logo.png?v=2"}
                alt={tenant.name}
                className="h-32 w-auto"
              />
            </div>
            <h1 className="text-3xl font-bold mb-2">{tenant.name}</h1>
            <p className="text-gray-600">{tenant.slogan || 'Làm việc hăng say, tiền ngay về túi'}</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setShowLoginModal(true)}
              className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-lg"
            >
              🔐 Đăng Nhập
            </button>
            <button
              onClick={() => setShowRegisterModal(true)}
              className="w-full px-6 py-4 bg-white hover:bg-gray-50 text-blue-600 border-2 border-blue-600 rounded-xl font-medium text-lg"
            >
              📝 Đăng Ký
            </button>
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <div className="text-sm font-medium mb-2">✨ Tính năng:</div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>✅ Quản lý tasks & deadline</li>
              <li>✅ Theo dõi tiến độ team</li>
              <li>✅ Báo cáo & phân tích</li>
              <li>✅ Automation & templates</li>
            </ul>
          </div>
        </div>

        {showLoginModal && <LoginModal onLogin={handleLogin} onClose={() => setShowLoginModal(false)} onSwitchToRegister={() => { setShowLoginModal(false); setShowRegisterModal(true); }} />}
        {showRegisterModal && <RegisterModal onRegister={handleRegister} onClose={() => setShowRegisterModal(false)} onSwitchToLogin={() => { setShowRegisterModal(false); setShowLoginModal(true); }} />}
      </div>
    );
  }

  // Main authenticated layout
  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        tenant={tenant}
        currentUser={currentUser}
        todayAttendances={todayAttendances}
        showNotifications={showNotifications}
        setShowNotifications={setShowNotifications}
        unreadCount={unreadCount}
        showMobileSidebar={showMobileSidebar}
        setShowMobileSidebar={setShowMobileSidebar}
        setShowAttendancePopup={setShowAttendancePopup}
        setShowPermissionsModal={setShowPermissionsModal}
        setIsLoggedIn={setIsLoggedIn}
        setCurrentUser={setCurrentUser}
        setActiveTab={setActiveTab}
        refreshAllData={refreshAllData}
        notifications={notifications}
        markAsRead={markAsRead}
        markAllAsRead={markAllAsRead}
        deleteNotification={deleteNotification}
        clearReadNotifications={clearReadNotifications}
        tasks={tasks}
        technicalJobs={technicalJobs}
        receiptsPayments={receiptsPayments}
        setSelectedTask={setSelectedTask}
        setShowModal={setShowModal}
        setActiveModule={setActiveModule}
        setSelectedJob={setSelectedJob}
        setShowJobModal={setShowJobModal}
        navigateTo={navigateTo}
      />

      <Sidebar
        showMobileSidebar={showMobileSidebar}
        setShowMobileSidebar={setShowMobileSidebar}
        currentUser={currentUser}
        activeModule={activeModule}
        activeTab={activeTab}
        navigateTo={navigateTo}
        canAccessTab={canAccessTab}
        technicalJobs={technicalJobs}
        setShowPermissionsModal={setShowPermissionsModal}
        setIsLoggedIn={setIsLoggedIn}
        setCurrentUser={setCurrentUser}
        setActiveTab={setActiveTab}
        tenant={tenant}
        allUsers={allUsers}
      />

      <ModuleTabBar
        currentUser={currentUser}
        activeModule={activeModule}
        activeTab={activeTab}
        navigateTo={navigateTo}
        canAccessTab={canAccessTab}
        receiptsPayments={receiptsPayments}
        orders={orders}
      />

      <div className="max-w-7xl mx-auto pb-20 md:pb-0">
        <ErrorBoundary key={activeModule}>
          <Suspense fallback={<ModuleLoading />}>
            {activeModule === 'dashboard' && (canAccessModule('dashboard') ? <DashboardModule /> : <NoModuleAccess moduleName="Báo Cáo" />)}

            {activeModule === 'media' && (canAccessModule('media') ? <MediaModule /> : <NoModuleAccess moduleName="Media" />)}

            {activeModule === 'warehouse' && (canAccessModule('warehouse') ? <WarehouseModule /> : <NoModuleAccess moduleName="Kho" />)}

            {activeModule === 'sales' && (canAccessModule('sales') ? <SalesModule /> : <NoModuleAccess moduleName="Sale" />)}

            {activeModule === 'technical' && (canAccessModule('technical') ? <TechnicalModule /> : <NoModuleAccess moduleName="Kỹ thuật" />)}

            {activeModule === 'finance' && (canAccessModule('finance') ? <FinanceModule /> : activeTab === 'salaries' && !isAdmin(currentUser) ? <MySalaryView /> : <NoModuleAccess moduleName="Tài chính" />)}

            {activeModule === 'warranty' && (canAccessModule('warranty') ? <WarrantyModule /> : <NoModuleAccess moduleName="Bảo hành" />)}

            {activeModule === 'hrm' && (canAccessModule('hrm') ? <HrmModule /> : <NoModuleAccess moduleName="Nhân sự" />)}

            {activeModule === 'settings' && (isAdmin(currentUser) ? <SettingsModule /> : <NoModuleAccess moduleName="Cài đặt" />)}

            {activeModule === 'chat' && <ChatModule />}
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Global modals */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          {showModal && <TaskModal selectedTask={selectedTask} setSelectedTask={setSelectedTask} setShowModal={setShowModal} currentUser={currentUser} allUsers={allUsers} tenant={tenant} changeStatus={changeStatus} addComment={addComment} addPostLink={addPostLink} removePostLink={removePostLink} deleteTask={deleteTask} loadTasks={loadTasks} addNotification={addNotification} />}
          {showCreateTaskModal && <CreateTaskModal currentUser={currentUser} allUsers={allUsers} tenant={tenant} setShowCreateTaskModal={setShowCreateTaskModal} createNewTask={createNewTask} />}
          {showCreateJobModal && <CreateJobModal showCreateJobModal={showCreateJobModal} setShowCreateJobModal={setShowCreateJobModal} prefillJobData={prefillJobData} currentUser={currentUser} allUsers={allUsers} createTechnicalJob={createTechnicalJob} />}
          {showJobModal && <JobDetailModal selectedJob={selectedJob} setSelectedJob={setSelectedJob} showJobModal={showJobModal} setShowJobModal={setShowJobModal} currentUser={currentUser} tenant={tenant} allUsers={allUsers} loadTechnicalJobs={loadTechnicalJobs} loadFinanceData={loadFinanceData} saveJobEditDraft={saveJobEditDraft} loadJobEditDraft={loadJobEditDraft} clearJobEditDraft={clearJobEditDraft} deleteTechnicalJob={deleteTechnicalJob} addNotification={addNotification} />}
        </Suspense>
      </ErrorBoundary>
      {showPermissionsModal && <SilentErrorBoundary><PermissionsModal allUsers={allUsers} onClose={() => setShowPermissionsModal(false)} loadUsers={loadUsers} supabase={supabase} /></SilentErrorBoundary>}

      <SilentErrorBoundary>
        <MobileBottomTabs
          activeModule={activeModule}
          activeTab={activeTab}
          navigateTo={navigateTo}
          technicalJobs={technicalJobs}
          tasks={tasks}
          currentUser={currentUser}
          receiptsPayments={receiptsPayments}
          orders={orders}
          canAccessTab={canAccessTab}
        />
      </SilentErrorBoundary>

      {/* Chat Popup System */}
      <SilentErrorBoundary>
        <Suspense fallback={null}>
          <ChatPopupManager />
        </Suspense>
      </SilentErrorBoundary>

      {showAttendancePopup && (
        <SilentErrorBoundary>
          <AttendancePopup
            currentUser={currentUser}
            tenant={tenant}
            todayAttendances={todayAttendances}
            setTodayAttendances={setTodayAttendances}
            onClose={() => setShowAttendancePopup(false)}
          />
        </SilentErrorBoundary>
      )}

    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NotificationProvider>
        <DataProvider>
          <AppContent />
        </DataProvider>
      </NotificationProvider>
    </AppProvider>
  );
}

import React, { useEffect, Suspense } from 'react';
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

// Module components (lazy loaded)
const DashboardModule = React.lazy(() => import('./modules/dashboard'));
const MediaModule = React.lazy(() => import('./modules/media'));
const TechnicalModule = React.lazy(() => import('./modules/technical'));
const WarehouseModule = React.lazy(() => import('./modules/warehouse'));
const SalesModule = React.lazy(() => import('./modules/sales'));
const FinanceModule = React.lazy(() => import('./modules/finance'));
const MySalaryView = React.lazy(() => import('./modules/finance/MySalaryView'));
const SettingsModule = React.lazy(() => import('./modules/settings'));
const WarrantyModule = React.lazy(() => import('./modules/warranty'));
const HrmModule = React.lazy(() => import('./modules/hrm'));
const PublicWarrantyCheck = React.lazy(() => import('./components/shared/PublicWarrantyCheck'));
const ChatModule = React.lazy(() => import('./modules/chat'));
const ChatWidget = React.lazy(() => import('./components/chat/ChatWidget'));
import { isAdmin } from './utils/permissionUtils';

// Global modals (lazy loaded)
const CreateTaskModal = React.lazy(() => import('./modules/media/CreateTaskModal'));
const TaskModal = React.lazy(() => import('./modules/media/TaskModal'));
const CreateJobModal = React.lazy(() => import('./modules/technical/CreateJobModal'));
const JobDetailModal = React.lazy(() => import('./modules/technical/JobDetailModal'));

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
        <Suspense fallback={<ModuleLoading />}>
          {activeModule === 'dashboard' && !canAccessModule('dashboard') && <NoModuleAccess moduleName="Báo Cáo" />}
          {activeModule === 'dashboard' && canAccessModule('dashboard') && <DashboardModule />}

          {activeModule === 'media' && !canAccessModule('media') && <NoModuleAccess moduleName="Media" />}
          {activeModule === 'media' && canAccessModule('media') && <MediaModule />}

          {activeModule === 'warehouse' && !canAccessModule('warehouse') && <NoModuleAccess moduleName="Kho" />}
          {activeModule === 'warehouse' && canAccessModule('warehouse') && <WarehouseModule />}

          {activeModule === 'sales' && !canAccessModule('sales') && <NoModuleAccess moduleName="Sale" />}
          {activeModule === 'sales' && canAccessModule('sales') && <SalesModule />}

          {activeModule === 'technical' && !canAccessModule('technical') && <NoModuleAccess moduleName="Kỹ thuật" />}
          {activeModule === 'technical' && canAccessModule('technical') && <TechnicalModule />}

          {activeModule === 'finance' && !canAccessModule('finance') && activeTab === 'salaries' && currentUser?.role !== 'Admin' && currentUser?.role !== 'admin' && <MySalaryView />}
          {activeModule === 'finance' && !canAccessModule('finance') && activeTab !== 'salaries' && <NoModuleAccess moduleName="Tài chính" />}
          {activeModule === 'finance' && canAccessModule('finance') && <FinanceModule />}

          {activeModule === 'warranty' && !canAccessModule('warranty') && <NoModuleAccess moduleName="Bảo hành" />}
          {activeModule === 'warranty' && canAccessModule('warranty') && <WarrantyModule />}

          {activeModule === 'hrm' && !canAccessModule('hrm') && <NoModuleAccess moduleName="Nhân sự" />}
          {activeModule === 'hrm' && canAccessModule('hrm') && <HrmModule />}

          {activeModule === 'settings' && isAdmin(currentUser) && <SettingsModule />}

          {activeModule === 'chat' && <ChatModule />}
        </Suspense>
      </div>

      {/* Global modals */}
      <Suspense fallback={null}>
        {showModal && <TaskModal selectedTask={selectedTask} setSelectedTask={setSelectedTask} setShowModal={setShowModal} currentUser={currentUser} allUsers={allUsers} tenant={tenant} changeStatus={changeStatus} addComment={addComment} addPostLink={addPostLink} removePostLink={removePostLink} deleteTask={deleteTask} loadTasks={loadTasks} addNotification={addNotification} />}
        {showCreateTaskModal && <CreateTaskModal currentUser={currentUser} allUsers={allUsers} tenant={tenant} setShowCreateTaskModal={setShowCreateTaskModal} createNewTask={createNewTask} />}
        {showCreateJobModal && <CreateJobModal showCreateJobModal={showCreateJobModal} setShowCreateJobModal={setShowCreateJobModal} prefillJobData={prefillJobData} currentUser={currentUser} allUsers={allUsers} createTechnicalJob={createTechnicalJob} />}
        {showJobModal && <JobDetailModal selectedJob={selectedJob} setSelectedJob={setSelectedJob} showJobModal={showJobModal} setShowJobModal={setShowJobModal} currentUser={currentUser} tenant={tenant} allUsers={allUsers} loadTechnicalJobs={loadTechnicalJobs} loadFinanceData={loadFinanceData} saveJobEditDraft={saveJobEditDraft} loadJobEditDraft={loadJobEditDraft} clearJobEditDraft={clearJobEditDraft} deleteTechnicalJob={deleteTechnicalJob} addNotification={addNotification} />}
      </Suspense>
      {showPermissionsModal && <PermissionsModal allUsers={allUsers} onClose={() => setShowPermissionsModal(false)} loadUsers={loadUsers} supabase={supabase} />}

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

      {/* Chat Widget */}
      <Suspense fallback={null}>
        <ChatWidget />
      </Suspense>

      {/* Floating Attendance Button - Desktop */}
      {(() => {
        const currentShift = todayAttendances.find(a => a.check_in && !a.check_out);
        const totalHours = todayAttendances.reduce((sum, a) => sum + parseFloat(a.work_hours || 0), 0);
        const allCheckedOut = todayAttendances.length > 0 && todayAttendances.every(a => a.check_out);

        return (
          <button
            onClick={() => setShowAttendancePopup(true)}
            className={`hidden md:flex fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-lg items-center justify-center text-2xl transition-all hover:scale-110 ${
              currentShift ? 'bg-blue-500 text-white' : allCheckedOut ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white animate-bounce'
            }`}
            title={currentShift ? 'Đang làm việc' : allCheckedOut ? `Đã làm ${totalHours.toFixed(1)}h` : 'Chấm công'}
          >
            {currentShift ? '🟢' : allCheckedOut ? '✅' : '⏰'}
          </button>
        );
      })()}

      {showAttendancePopup && (
        <AttendancePopup
          currentUser={currentUser}
          tenant={tenant}
          todayAttendances={todayAttendances}
          setTodayAttendances={setTodayAttendances}
          onClose={() => setShowAttendancePopup(false)}
        />
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

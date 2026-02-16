import React, { useState } from 'react';
import NotificationsDropdown from '../shared/NotificationsDropdown';
import ProfileModal from '../shared/ProfileModal';
import { isAdmin } from '../../utils/permissionUtils';
import { logActivity } from '../../lib/activityLog';

export default function Header({
  tenant,
  currentUser,
  todayAttendances,
  showNotifications,
  setShowNotifications,
  unreadCount,
  showMobileSidebar,
  setShowMobileSidebar,
  setShowPermissionsModal,
  setIsLoggedIn,
  setCurrentUser,
  setActiveTab,
  refreshAllData,
  notifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  tasks,
  technicalJobs,
  receiptsPayments,
  setSelectedTask,
  setShowModal,
  setActiveModule,
  setSelectedJob,
  setShowJobModal,
  navigateTo,
}) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const handleLogout = () => {
    logActivity({
      tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
      module: 'auth', action: 'logout', description: `${currentUser?.name} đăng xuất`
    });
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActiveTab('dashboard');
    localStorage.removeItem(`${tenant.slug}_user`);
    localStorage.removeItem(`${tenant.slug}_loggedIn`);
    setShowUserMenu(false);
  };

  return (
    <div className="bg-white shadow sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
        {/* Mobile Header */}
        <div className="flex md:hidden justify-between items-center">
          <button
            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center">
            <img src="/logo.png" alt="Logo" className="h-10 w-10 rounded-lg object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refreshAllData();
                const btn = document.getElementById('refresh-btn-mobile');
                if (btn) {
                  btn.classList.add('animate-spin');
                  setTimeout(() => btn.classList.remove('animate-spin'), 1000);
                }
              }}
              className="p-2 hover:bg-gray-100 rounded-full"
              title="Làm mới dữ liệu"
            >
              <span id="refresh-btn-mobile" className="text-xl inline-block">{'\uD83D\uDD04'}</span>
            </button>
            {(() => {
              const currentShift = todayAttendances.find(a => a.check_in && !a.check_out);
              const allDone = todayAttendances.length > 0 && todayAttendances.every(a => a.check_out);
              return (
                <button
                  onClick={() => navigateTo('hrm', 'attendance')}
                  className={`relative p-2 rounded-full ${
                    currentShift ? 'bg-blue-100' : allDone ? 'bg-green-100' : 'bg-yellow-100 animate-pulse'
                  }`}
                >
                  <span className="text-xl">{currentShift ? '\uD83D\uDFE2' : allDone ? '\u2705' : '\u23F0'}</span>
                </button>
              );
            })()}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 hover:bg-gray-100 rounded-full"
              >
                <span className="text-xl">{'\uD83D\uDD14'}</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <NotificationsDropdown
                showNotifications={showNotifications}
                notifications={notifications}
                unreadCount={unreadCount}
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
                setActiveTab={setActiveTab}
                setSelectedJob={setSelectedJob}
                setShowJobModal={setShowJobModal}
                setShowNotifications={setShowNotifications}
              />
            </div>
            {/* Mobile user avatar */}
            <div className="relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)}>
                <div className="w-9 h-9 text-sm rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                  {currentUser.name?.charAt(0)?.toUpperCase()}
                </div>
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border z-50 py-2">
                    <div className="px-4 py-3 border-b">
                      <div className="font-medium text-sm">{currentUser.name}</div>
                      <div className="text-xs text-gray-500">{currentUser.email}</div>
                    </div>
                    <button onClick={() => { setShowProfile(true); setShowUserMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                      <span>👤</span> Hồ sơ cá nhân
                    </button>
                    {isAdmin(currentUser) && (
                      <button onClick={() => { setShowPermissionsModal(true); setShowUserMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                        <span>🔐</span> Phân quyền
                      </button>
                    )}
                    {isAdmin(currentUser) && navigateTo && (
                      <button onClick={() => { navigateTo('settings', 'company'); setShowUserMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                        <span>⚙️</span> Cấu hình hệ thống
                      </button>
                    )}
                    <div className="border-t my-1" />
                    <button onClick={handleLogout} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                      <span>🚪</span> Đăng xuất
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt={tenant.name} className="h-14 w-14 rounded-lg object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
            <div>
              <h1 className="text-2xl font-bold text-green-800">{tenant.name}</h1>
              <p className="text-gray-600 text-sm">{tenant.slogan || 'Làm việc hăng say, tiền ngay về túi'}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {(() => {
              const currentShift = todayAttendances.find(a => a.check_in && !a.check_out);
              const totalHours = todayAttendances.reduce((sum, a) => sum + parseFloat(a.work_hours || 0), 0);
              const allDone = todayAttendances.length > 0 && todayAttendances.every(a => a.check_out);
              return (
                <button
                  onClick={() => navigateTo('hrm', 'attendance')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                    currentShift ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      : allDone ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 animate-pulse'
                  }`}
                >
                  {currentShift ? (
                    <>{'\uD83D\uDFE2'} Ca {todayAttendances.length}: {currentShift.check_in?.slice(0,5)}</>
                  ) : allDone ? (
                    <>{'\u2705'} {todayAttendances.length} ca - {totalHours.toFixed(1)}h</>
                  ) : (
                    <>{'\u23F0'} Chấm công</>
                  )}
                </button>
              );
            })()}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <span className="text-2xl">{'\uD83D\uDD14'}</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <NotificationsDropdown
                showNotifications={showNotifications}
                notifications={notifications}
                unreadCount={unreadCount}
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
                setActiveTab={setActiveTab}
                setSelectedJob={setSelectedJob}
                setShowJobModal={setShowJobModal}
                setShowNotifications={setShowNotifications}
              />
            </div>
            {/* User dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="text-right">
                  <div className="font-medium text-sm">{currentUser.name}</div>
                  <div className="text-xs text-gray-500">{currentUser.role} - {currentUser.team}</div>
                </div>
                <div className="w-9 h-9 text-sm rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                  {currentUser.name?.charAt(0)?.toUpperCase()}
                </div>
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border z-50 py-2">
                    <div className="px-4 py-3 border-b">
                      <div className="font-medium text-sm">{currentUser.name}</div>
                      <div className="text-xs text-gray-500">{currentUser.email}</div>
                    </div>
                    <button onClick={() => { setShowProfile(true); setShowUserMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                      <span>👤</span> Hồ sơ cá nhân
                    </button>
                    {isAdmin(currentUser) && (
                      <button onClick={() => { setShowPermissionsModal(true); setShowUserMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                        <span>🔐</span> Phân quyền
                      </button>
                    )}
                    {isAdmin(currentUser) && navigateTo && (
                      <button onClick={() => { navigateTo('settings', 'company'); setShowUserMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                        <span>⚙️</span> Cấu hình hệ thống
                      </button>
                    )}
                    <div className="border-t my-1" />
                    <button onClick={handleLogout} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                      <span>🚪</span> Đăng xuất
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile Modal */}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}

import React from 'react';
import { getTodayVN } from '../../utils/dateUtils';
import { isAdmin as isAdminRole } from '../../utils/permissionUtils';
import { logActivity } from '../../lib/activityLog';

const Sidebar = ({
  showMobileSidebar,
  setShowMobileSidebar,
  currentUser,
  activeModule,
  activeTab,
  navigateTo,
  canAccessTab,
  technicalJobs,
  setShowPermissionsModal,
  setIsLoggedIn,
  setCurrentUser,
  setActiveTab,
  tenant,
  allUsers
}) => {
  const isAdmin = isAdminRole(currentUser);
  const isSalaryMode = activeModule === 'finance' && activeTab === 'salaries' && !isAdmin;
  const pendingUsersCount = (allUsers || []).filter(u => u.status === 'pending').length;

  if (!showMobileSidebar) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={() => setShowMobileSidebar(false)}
      />
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-white z-50 shadow-xl md:hidden overflow-y-auto">
        <div className="p-3 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-bold">Menu</h2>
            <button
              onClick={() => setShowMobileSidebar(false)}
              className="p-1 hover:bg-white/20 rounded"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="text-sm opacity-90">{currentUser.name}</div>
          <div className="text-xs opacity-75">{currentUser.role} • {currentUser.team}</div>
        </div>

        {/* Module Selection */}
        <div className="p-3 border-b">
          <div className="text-xs font-semibold text-gray-500 mb-2">BỘ PHẬN</div>
          {(isAdmin || (currentUser.permissions && currentUser.permissions.dashboard > 0)) && (
            <button
              onClick={() => { navigateTo('dashboard', 'overview'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                activeModule === 'dashboard' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
              }`}
            >
              📊 Báo Cáo
            </button>
          )}
          {(isAdminRole(currentUser) || (currentUser.permissions && currentUser.permissions.media > 0)) && (
            <button
              onClick={() => { navigateTo('media', 'dashboard'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                activeModule === 'media' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
              }`}
            >
              🎬 Media
            </button>
          )}
          {(isAdminRole(currentUser) || (currentUser.permissions && currentUser.permissions.warehouse > 0)) && (
            <button
              onClick={() => { navigateTo('warehouse', 'inventory'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                activeModule === 'warehouse' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
              }`}
            >
              📦 Kho
            </button>
          )}
          {(isAdminRole(currentUser) || (currentUser.permissions && currentUser.permissions.sales > 0)) && (
            <button
              onClick={() => { navigateTo('sales', 'orders'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                activeModule === 'sales' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
              }`}
            >
              🛒 Sale
            </button>
          )}
          {(isAdminRole(currentUser) || (currentUser.permissions && currentUser.permissions.technical > 0)) && (
            <button
              onClick={() => { navigateTo('technical', 'jobs'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                activeModule === 'technical' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
              }`}
            >
              🔧 Kỹ Thuật
            </button>
          )}
          {(isAdmin || (currentUser.permissions && currentUser.permissions.finance > 0)) && (
            <button
              onClick={() => { navigateTo('finance', 'dashboard'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                activeModule === 'finance' && !isSalaryMode ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
              }`}
            >
              💰 Tài Chính
            </button>
          )}
          {(isAdmin || (currentUser.permissions && currentUser.permissions.warranty > 0)) && (
            <button
              onClick={() => { navigateTo('warranty', 'lookup'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                activeModule === 'warranty' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
              }`}
            >
              🛡️ Bảo Hành
            </button>
          )}
          {(isAdmin || (currentUser.permissions && currentUser.permissions.hrm > 0)) && (
            <button
              onClick={() => { navigateTo('hrm', 'employees'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                activeModule === 'hrm' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
              }`}
            >
              👤 Nhân Sự
            </button>
          )}
          {!isAdmin && (
            <button
              onClick={() => { navigateTo('finance', 'salaries'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                isSalaryMode ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
              }`}
            >
              💰 Lương Của Tôi
            </button>
          )}
          <button
            onClick={() => { navigateTo('chat', 'messages'); setShowMobileSidebar(false); }}
            className={`w-full px-3 py-2.5 rounded-lg font-medium text-left text-sm ${
              activeModule === 'chat' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
            }`}
          >
            💬 Tin Nhắn
          </button>
        </div>

        {/* Admin Functions */}
        {isAdminRole(currentUser) && (
          <div className="p-3 border-b bg-purple-50">
            <div className="text-xs font-semibold text-purple-700 mb-2">ADMIN</div>
            <button
              onClick={() => { navigateTo('media', 'automation'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                activeTab === 'automation' ? 'bg-purple-600 text-white' : 'bg-white hover:bg-purple-100'
              }`}
            >
              ⚙️ Automation
            </button>
            <button
              onClick={() => { navigateTo('media', 'users'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg font-medium text-left text-sm flex items-center justify-between ${
                activeTab === 'users' ? 'bg-purple-600 text-white' : 'bg-white hover:bg-purple-100'
              }`}
            >
              <span>👥 Users</span>
              {pendingUsersCount > 0 && (
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                  activeTab === 'users' ? 'bg-white text-purple-700' : 'bg-amber-500 text-white'
                }`}>
                  {pendingUsersCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { navigateTo('settings', 'company'); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mt-1.5 font-medium text-left text-sm ${
                activeModule === 'settings' ? 'bg-purple-600 text-white' : 'bg-white hover:bg-purple-100'
              }`}
            >
              ⚙️ Cấu Hình
            </button>
          </div>
        )}

        {/* Tabs Navigation */}
        <div className="p-3">
          <div className="text-xs font-semibold text-gray-500 mb-2">CHỨC NĂNG</div>
          {(activeModule === 'dashboard' ? [
            { id: 'overview', l: '📊 Tổng Quan', minLevel: 1 },
            { id: 'revenue', l: '📈 Doanh Thu', minLevel: 2 },
            { id: 'products', l: '📦 Hàng Hóa', minLevel: 2 },
            { id: 'customers', l: '👥 Khách Hàng', minLevel: 2 },
            { id: 'staff', l: '👤 Nhân Viên', minLevel: 3 },
            { id: 'finance', l: '💰 Tài Chính', minLevel: 3 },
            { id: 'warranty', l: '🛡️ Bảo Hành', minLevel: 3 },
            { id: 'comparison', l: '📊 So Sánh', minLevel: 3 }
          ].filter(t => isAdmin || (currentUser.permissions?.dashboard || 0) >= t.minLevel) : activeModule === 'media' ? [
            { id: 'mytasks', l: '📝 Của Tôi' },
            { id: 'dashboard', l: '📊 Dashboard' },
            { id: 'tasks', l: '🎬 Video', tabKey: 'videos' },
            { id: 'calendar', l: '📅 Lịch', tabKey: 'calendar' },
            { id: 'report', l: '📈 Báo Cáo', tabKey: 'report' },
            { id: 'performance', l: '📊 Hiệu Suất' }
          ] : activeModule === 'warehouse' ? [
            { id: 'inventory', l: '📦 Tồn Kho', tabKey: 'inventory' },
            { id: 'import', l: '📥 Nhập Kho', tabKey: 'import' },
            { id: 'export', l: '📤 Xuất Kho', tabKey: 'export' },
            { id: 'transfer', l: '🔄 Chuyển Kho', tabKey: 'transfer' },
            { id: 'stocktake', l: '📝 Kiểm Kê', tabKey: 'stocktake' },
            { id: 'history', l: '📋 Lịch Sử', tabKey: 'products' },
            { id: 'report', l: '📊 Báo Cáo', tabKey: 'report' },
            { id: 'suppliers', l: '🏢 NCC', tabKey: 'suppliers' },
            { id: 'warehouses', l: '🏭 Quản Lý Kho', tabKey: 'warehouses' }
          ] : activeModule === 'sales' ? [
            { id: 'orders', l: '🛒 Đơn Hàng', tabKey: 'orders' },
            { id: 'reconciliation', l: '📊 Đối Soát' },
            { id: 'customers', l: '👥 Khách Hàng' },
            { id: 'products', l: '📱 Sản Phẩm' },
            { id: 'report', l: '📈 Báo Cáo' }
          ] : activeModule === 'technical' ? [
            { id: 'today', l: '📅 Hôm Nay', highlight: true },
            { id: 'calendar', l: '🗓️ Lịch' },
            { id: 'jobs', l: '📋 Công Việc' },
            { id: 'wages', l: '💰 Tính Công' },
            { id: 'summary', l: '📊 Tổng Quan' }
          ] : activeModule === 'warranty' ? [
            { id: 'lookup', l: '🔍 Tra Cứu' },
            { id: 'serials', l: '🏷️ Serial' },
            { id: 'cards', l: '🛡️ Thẻ BH' },
            { id: 'repairs', l: '🔧 Sửa Chữa' },
            { id: 'requests', l: '📩 Yêu Cầu BH' },
            { id: 'dashboard', l: '📊 Tổng Quan' }
          ] : activeModule === 'hrm' ? [
            { id: 'employees', l: '👤 Nhân Viên', tabKey: 'employees' },
            { id: 'attendance', l: '⏰ Chấm Công', tabKey: 'attendance' },
            { id: 'schedule', l: '📅 Lịch Làm Việc', tabKey: 'schedule' },
            { id: 'kpi', l: '🎯 KPI', tabKey: 'kpi' },
            { id: 'payroll', l: '💰 Lương', tabKey: 'payroll' },
            { id: 'leaves', l: '📋 Đơn Từ', tabKey: 'leaves' },
            { id: 'report', l: '📊 Báo Cáo', tabKey: 'report' },
            { id: 'settings', l: '⚙️ Cài Đặt', tabKey: 'settings' }
          ] : activeModule === 'finance' ? (isSalaryMode ? [] : [
            { id: 'dashboard', l: '📊 Tổng Quan', tabKey: 'overview' },
            { id: 'receipts', l: '🧾 Thu/Chi', tabKey: 'receipts' },
            { id: 'debts', l: '📋 Công Nợ', tabKey: 'debts' },
            ...(isAdmin ? [{ id: 'salaries', l: '💰 Lương', tabKey: 'salaries' }] : []),
            { id: 'reports', l: '📈 Báo Cáo', tabKey: 'reports' }
          ]) : activeModule === 'settings' ? [
            { id: 'company', l: '🏢 Công Ty' },
            { id: 'warehouses', l: '🏭 Kho' },
            { id: 'finance', l: '💰 Tài Chính' },
            { id: 'products', l: '📦 Sản Phẩm' },
            { id: 'shipping', l: '🚚 Vận Chuyển' },
            { id: 'logs', l: '📋 Lịch Sử HĐ' },
            { id: 'backup', l: '💾 Sao Lưu' }
          ] : []).filter(t => !t.tabKey || canAccessTab(activeModule, t.tabKey)).map(t => {
            const todayJobsCount = t.id === 'today' ? technicalJobs.filter(j => j.scheduledDate === getTodayVN() && j.status !== 'Hủy' && j.status !== 'Hoàn thành').length : 0;
            return (
            <button
              key={t.id}
              onClick={() => { navigateTo(activeModule, t.id); setShowMobileSidebar(false); }}
              className={`w-full px-3 py-2.5 rounded-lg mb-1 text-left font-medium text-sm flex items-center justify-between ${
                activeTab === t.id
                  ? t.highlight ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'
                  : t.highlight ? 'bg-orange-50 text-orange-700 hover:bg-orange-100' : 'hover:bg-gray-100'
              }`}
            >
              <span>{t.l}</span>
              {t.id === 'today' && todayJobsCount > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === t.id ? 'bg-white text-orange-600' : 'bg-orange-500 text-white'
                }`}>
                  {todayJobsCount}
                </span>
              )}
            </button>
          );
          })}
        </div>

        {/* Admin Buttons */}
        <div className="p-3 border-t space-y-1.5">
          {isAdminRole(currentUser) && (
            <button
              onClick={() => { setShowPermissionsModal(true); setShowMobileSidebar(false); }}
              className="w-full px-3 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm"
            >
              🔐 Phân Quyền
            </button>
          )}
          <button
            onClick={() => {
              logActivity({
                tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
                module: 'auth', action: 'logout', description: `${currentUser?.name} đăng xuất`
              });
              setIsLoggedIn(false);
              setCurrentUser(null);
              setActiveTab('dashboard');
              localStorage.removeItem(`${tenant.slug}_user`);
              localStorage.removeItem(`${tenant.slug}_loggedIn`);
              setShowMobileSidebar(false);
            }}
            className="w-full px-3 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm"
          >
            🚪 Đăng xuất
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;

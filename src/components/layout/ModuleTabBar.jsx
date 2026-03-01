import React from 'react';
import { isAdmin as isAdminRole } from '../../utils/permissionUtils';

const ModuleTabBar = ({ currentUser, activeModule, activeTab, navigateTo, canAccessTab, receiptsPayments, orders }) => {
  const isAdmin = isAdminRole(currentUser);
  const isSalaryMode = activeModule === 'finance' && activeTab === 'salaries' && !isAdmin;

  return (
    <>
      {/* Module Selector - Desktop Only */}
      <div className="hidden md:block bg-gradient-to-r from-green-700 to-green-800">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {(isAdmin || (currentUser.permissions && currentUser.permissions.dashboard > 0)) && (
            <button
              onClick={() => navigateTo('dashboard', 'overview')}
              className={`px-3 py-2.5 font-semibold text-sm whitespace-nowrap transition-all rounded-t-lg ${
                activeModule === 'dashboard' ? 'bg-white text-green-700' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              📊 Báo Cáo
            </button>
          )}
          {(isAdminRole(currentUser) || (currentUser.permissions && currentUser.permissions.media > 0)) && (
            <button
              onClick={() => navigateTo('media', 'dashboard')}
              className={`px-3 py-2.5 font-semibold text-sm whitespace-nowrap transition-all rounded-t-lg ${
                activeModule === 'media' ? 'bg-white text-green-700' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🎬 Media
            </button>
          )}
          {(isAdminRole(currentUser) || (currentUser.permissions && currentUser.permissions.warehouse > 0)) && (
            <button
              onClick={() => navigateTo('warehouse', 'inventory')}
              className={`px-3 py-2.5 font-semibold text-sm whitespace-nowrap transition-all rounded-t-lg ${
                activeModule === 'warehouse' ? 'bg-white text-green-700' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              📦 Kho
            </button>
          )}
          {(isAdminRole(currentUser) || (currentUser.permissions && currentUser.permissions.sales > 0)) && (
            <button
              onClick={() => navigateTo('sales', 'orders')}
              className={`px-3 py-2.5 font-semibold text-sm whitespace-nowrap transition-all rounded-t-lg ${
                activeModule === 'sales' ? 'bg-white text-green-700' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🛒 Sale
            </button>
          )}
          {(isAdminRole(currentUser) || (currentUser.permissions && currentUser.permissions.technical > 0)) && (
            <button
              onClick={() => navigateTo('technical', 'today')}
              className={`px-3 py-2.5 font-semibold text-sm whitespace-nowrap transition-all rounded-t-lg ${
                activeModule === 'technical' ? 'bg-white text-green-700' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🔧 Kỹ Thuật
            </button>
          )}
          {(isAdmin || (currentUser.permissions && currentUser.permissions.finance > 0)) && (
            <button
              onClick={() => navigateTo('finance', 'dashboard')}
              className={`px-3 py-2.5 font-semibold text-sm whitespace-nowrap transition-all rounded-t-lg ${
                activeModule === 'finance' && !isSalaryMode ? 'bg-white text-green-700' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              💰 Tài Chính
            </button>
          )}
          {(isAdminRole(currentUser) || (currentUser.permissions && currentUser.permissions.warranty > 0)) && (
            <button
              onClick={() => navigateTo('warranty', 'lookup')}
              className={`px-3 py-2.5 font-semibold text-sm whitespace-nowrap transition-all rounded-t-lg ${
                activeModule === 'warranty' ? 'bg-white text-green-700' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🛡️ Bảo Hành
            </button>
          )}
          {(isAdminRole(currentUser) || (currentUser.permissions && currentUser.permissions.hrm > 0)) && (
            <button
              onClick={() => navigateTo('hrm', 'employees')}
              className={`px-3 py-2.5 font-semibold text-sm whitespace-nowrap transition-all rounded-t-lg ${
                activeModule === 'hrm' ? 'bg-white text-green-700' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              👤 Nhân Sự
            </button>
          )}
          {!isAdmin && (
            <button
              onClick={() => navigateTo('finance', 'salaries')}
              className={`px-3 py-2.5 font-semibold text-sm whitespace-nowrap transition-all rounded-t-lg ${
                isSalaryMode ? 'bg-white text-green-700' : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              💰 Lương
            </button>
          )}
          <button
            onClick={() => navigateTo('chat', 'messages')}
            className={`px-3 py-2.5 font-semibold text-sm whitespace-nowrap transition-all rounded-t-lg ${
              activeModule === 'chat' ? 'bg-white text-green-700' : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            💬 Tin Nhắn
          </button>
        </div>
      </div>

      {/* Desktop Tab Bar - hide for chat module */}
      <div className={`hidden ${activeModule === 'chat' ? '' : 'md:block'} bg-white border-b`}>
        <div className="max-w-7xl mx-auto px-6 flex gap-2 overflow-x-auto">
          {isSalaryMode ? (
            <button className="px-6 py-3 font-medium border-b-4 border-green-700 text-green-700 whitespace-nowrap">
              💰 Lương Của Tôi
            </button>
          ) : (activeModule === 'dashboard' ? [
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
            { id: 'performance', l: '📊 Hiệu Suất' },
            { id: 'ekips', l: '👥 Ekip' },
            ...(isAdmin ? [{ id: 'overview', l: '📊 Tổng Quan' }] : [])
          ] : activeModule === 'warehouse' ? [
            { id: 'inventory', l: '📦 Tồn Kho', tabKey: 'inventory' },
            { id: 'import', l: '📥 Nhập', tabKey: 'import' },
            { id: 'export', l: '📤 Xuất', tabKey: 'export' },
            { id: 'transfer', l: '🔄 Chuyển', tabKey: 'transfer' },
            { id: 'stocktake', l: '📝 Kiểm Kê', tabKey: 'stocktake' },
            { id: 'history', l: '📋 Lịch Sử', tabKey: 'products' },
            { id: 'report', l: '📊 Báo Cáo', tabKey: 'report' },
            { id: 'suppliers', l: '🏢 NCC', tabKey: 'suppliers' },
            { id: 'warehouses', l: '🏭 Kho', tabKey: 'warehouses' }
          ] : activeModule === 'sales' ? [
            { id: 'orders', l: '🛒 Đơn Hàng', tabKey: 'orders' },
            { id: 'reconciliation', l: '📊 Đối Soát' },
            { id: 'customers', l: '👥 Khách Hàng' },
            { id: 'products', l: '📱 Sản Phẩm' },
            { id: 'cashbook', l: '📒 Sổ Quỹ' },
            { id: 'report', l: '📈 Báo Cáo' }
          ] : activeModule === 'technical' ? [
            { id: 'today', l: '📅 Hôm Nay' },
            { id: 'calendar', l: '🗓️ Lịch' },
            { id: 'jobs', l: '📋 Công Việc' },
            { id: 'wages', l: '💰 Tiền Công' },
            { id: 'summary', l: '📊 Tổng Hợp' }
          ] : activeModule === 'warranty' ? [
            { id: 'lookup', l: '🔍 Tra Cứu', tabKey: 'lookup' },
            { id: 'serials', l: '🏷️ Serial', tabKey: 'serials' },
            { id: 'cards', l: '🛡️ Thẻ BH', tabKey: 'cards' },
            { id: 'repairs', l: '🔧 Sửa Chữa', tabKey: 'repairs' },
            { id: 'requests', l: '📩 Yêu Cầu', tabKey: 'requests' },
            { id: 'dashboard', l: '📊 Tổng Quan', tabKey: 'dashboard' }
          ] : activeModule === 'hrm' ? [
            { id: 'employees', l: '👤 Nhân Viên', tabKey: 'employees' },
            { id: 'attendance', l: '⏰ Chấm Công', tabKey: 'attendance' },
            { id: 'schedule', l: '📅 Lịch', tabKey: 'schedule' },
            { id: 'kpi', l: '🎯 KPI', tabKey: 'kpi' },
            { id: 'payroll', l: '💰 Lương', tabKey: 'payroll' },
            { id: 'leaves', l: '📋 Đơn Từ', tabKey: 'leaves' },
            { id: 'report', l: '📊 Báo Cáo', tabKey: 'report' },
            { id: 'settings', l: '⚙️ Cài Đặt', tabKey: 'settings' }
          ] : activeModule === 'finance' ? [
            { id: 'dashboard', l: '📊 Tổng Quan', tabKey: 'overview' },
            { id: 'receipts', l: '🧾 Thu/Chi', tabKey: 'receipts' },
            { id: 'debts', l: '📋 Công Nợ', tabKey: 'debts' },
            ...(isAdmin ? [{ id: 'salaries', l: '💰 Lương', tabKey: 'salaries' }] : []),
            { id: 'reports', l: '📈 Báo Cáo', tabKey: 'reports' }
          ] : activeModule === 'settings' ? [
            { id: 'company', l: '🏢 Công Ty' },
            { id: 'warehouses', l: '🏭 Kho' },
            { id: 'finance', l: '💰 Tài Chính' },
            { id: 'products', l: '📦 Sản Phẩm' },
            { id: 'shipping', l: '🚚 Vận Chuyển' },
            { id: 'zalo', l: '📱 Zalo OA' },
            { id: 'social', l: '📊 MXH' },
            { id: 'logs', l: '📋 Lịch Sử HĐ' },
            { id: 'backup', l: '💾 Sao Lưu' }
          ] : []).filter(t => !t.tabKey || canAccessTab(activeModule, t.tabKey)).map(t => {
            const pendingCount = (t.id === 'receipts' && activeModule === 'finance')
              ? (receiptsPayments || []).filter(r => r.status === 'pending').length
              : (t.id === 'reconciliation' && activeModule === 'sales')
              ? (orders || []).filter(o => ['shipping', 'delivered'].includes(o.status)).length
              : 0;
            return (
              <button key={t.id} onClick={() => navigateTo(activeModule, t.id)} className={`px-6 py-3 font-medium border-b-4 whitespace-nowrap relative ${activeTab === t.id ? 'border-green-700 text-green-700' : 'border-transparent text-gray-600 hover:text-green-600'}`}>
                {t.l}
                {pendingCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Title Bar - hide for chat module (has own layout) */}
      <div className={`md:hidden bg-white border-b px-4 py-3 sticky top-[52px] z-30 ${activeModule === 'chat' ? 'hidden' : ''}`}>
        <h2 className="font-bold text-lg">
          {isSalaryMode ? '💰 Lương Của Tôi' : (activeModule === 'dashboard' ? [
            { id: 'overview', l: '📊 Tổng Quan Doanh Nghiệp', minLevel: 1 },
            { id: 'revenue', l: '📈 Báo Cáo Doanh Thu', minLevel: 2 },
            { id: 'products', l: '📦 Báo Cáo Hàng Hóa', minLevel: 2 },
            { id: 'customers', l: '👥 Báo Cáo Khách Hàng', minLevel: 2 },
            { id: 'staff', l: '👤 Báo Cáo Nhân Viên', minLevel: 3 },
            { id: 'finance', l: '💰 Báo Cáo Tài Chính', minLevel: 3 },
            { id: 'warranty', l: '🛡️ Báo Cáo Bảo Hành', minLevel: 3 },
            { id: 'comparison', l: '📊 So Sánh Theo Kỳ', minLevel: 3 }
          ].filter(t => isAdmin || (currentUser.permissions?.dashboard || 0) >= t.minLevel) : activeModule === 'media' ? [
            { id: 'mytasks', l: '📝 Của Tôi' },
            { id: 'dashboard', l: '📊 Dashboard' },
            { id: 'tasks', l: '🎬 Video' },
            { id: 'calendar', l: '📅 Lịch' },
            { id: 'report', l: '📈 Báo Cáo' },
            { id: 'performance', l: '📊 Hiệu Suất' },
            { id: 'ekips', l: '👥 Ekip' },
            { id: 'automation', l: '⚙️ Automation' },
            { id: 'users', l: '👥 Users' }
          ] : activeModule === 'warehouse' ? [
            { id: 'inventory', l: '📦 Tồn Kho' },
            { id: 'import', l: '📥 Nhập Kho' },
            { id: 'export', l: '📤 Xuất Kho' },
            { id: 'transfer', l: '🔄 Chuyển Kho' },
            { id: 'stocktake', l: '📝 Kiểm Kê' },
            { id: 'history', l: '📋 Lịch Sử' },
            { id: 'report', l: '📊 Báo Cáo' },
            { id: 'suppliers', l: '🏢 Nhà Cung Cấp' },
            { id: 'warehouses', l: '🏭 Kho' }
          ] : activeModule === 'sales' ? [
            { id: 'orders', l: '🛒 Đơn Hàng' },
            { id: 'reconciliation', l: '📊 Đối Soát' },
            { id: 'customers', l: '👥 Khách Hàng' },
            { id: 'products', l: '📱 Sản Phẩm' },
            { id: 'cashbook', l: '📒 Sổ Quỹ' },
            { id: 'report', l: '📈 Báo Cáo' }
          ] : activeModule === 'technical' ? [
            { id: 'today', l: '📅 Hôm Nay' },
            { id: 'calendar', l: '🗓️ Lịch' },
            { id: 'jobs', l: '📋 Công Việc' },
            { id: 'wages', l: '💰 Tiền Công' },
            { id: 'summary', l: '📊 Tổng Hợp' }
          ] : activeModule === 'warranty' ? [
            { id: 'lookup', l: '🔍 Tra Cứu' },
            { id: 'serials', l: '🏷️ Serial' },
            { id: 'cards', l: '🛡️ Thẻ BH' },
            { id: 'repairs', l: '🔧 Sửa Chữa' },
            { id: 'requests', l: '📩 Yêu Cầu BH' },
            { id: 'dashboard', l: '📊 Tổng Quan' }
          ] : activeModule === 'hrm' ? [
            { id: 'employees', l: '👤 Nhân Viên' },
            { id: 'attendance', l: '⏰ Chấm Công' },
            { id: 'schedule', l: '📅 Lịch Làm Việc' },
            { id: 'kpi', l: '🎯 KPI' },
            { id: 'payroll', l: '💰 Lương' },
            { id: 'leaves', l: '📋 Đơn Từ' },
            { id: 'report', l: '📊 Báo Cáo' },
            { id: 'settings', l: '⚙️ Cài Đặt' }
          ] : activeModule === 'finance' ? [
            { id: 'dashboard', l: '📊 Tổng Quan' },
            { id: 'receipts', l: '🧾 Thu/Chi' },
            { id: 'debts', l: '📋 Công Nợ' },
            ...(isAdmin ? [{ id: 'salaries', l: '💰 Lương' }] : []),
            { id: 'reports', l: '📈 Báo Cáo' }
          ] : activeModule === 'settings' ? [
            { id: 'company', l: '🏢 Công Ty' },
            { id: 'warehouses', l: '🏭 Kho' },
            { id: 'finance', l: '💰 Tài Chính' },
            { id: 'products', l: '📦 Sản Phẩm' },
            { id: 'shipping', l: '🚚 Vận Chuyển' },
            { id: 'zalo', l: '📱 Zalo OA' },
            { id: 'social', l: '📊 Mạng Xã Hội' },
            { id: 'logs', l: '📋 Lịch Sử HĐ' },
            { id: 'backup', l: '💾 Sao Lưu' }
          ] : []).find(t => t.id === activeTab)?.l || ''}
        </h2>
      </div>
    </>
  );
};

export default ModuleTabBar;

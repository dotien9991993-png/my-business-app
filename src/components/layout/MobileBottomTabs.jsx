import React from 'react';
import { getTodayVN } from '../../utils/dateUtils';
import { isAdmin as isAdminRole } from '../../utils/permissionUtils';

export default function MobileBottomTabs({
  activeModule,
  activeTab,
  navigateTo,
  technicalJobs,
  tasks,
  currentUser,
  receiptsPayments,
  orders,
  canAccessTab
}) {
  const [showWarehouseMoreMenu, setShowWarehouseMoreMenu] = React.useState(false);
  const [showHrmMoreMenu, setShowHrmMoreMenu] = React.useState(false);
  const [showDashboardMoreMenu, setShowDashboardMoreMenu] = React.useState(false);

  // Chat module has its own full layout, no bottom tabs needed
  if (activeModule === 'chat') return null;

  if (activeModule === 'dashboard') {
    const dashLevel = isAdminRole(currentUser) ? 3 : (currentUser?.permissions?.dashboard || 0);
    const allDashTabs = [
      { id: 'overview', icon: '📊', label: 'Tổng Quan', highlight: true, minLevel: 1 },
      { id: 'revenue', icon: '📈', label: 'Doanh Thu', minLevel: 2 },
      { id: 'products', icon: '📦', label: 'Hàng Hóa', minLevel: 2 },
      { id: 'customers', icon: '👥', label: 'Khách Hàng', minLevel: 2 },
      { id: 'staff', icon: '👤', label: 'Nhân Viên', minLevel: 3 },
      { id: 'finance', icon: '💰', label: 'Tài Chính', minLevel: 3 },
      { id: 'warranty', icon: '🛡️', label: 'Bảo Hành', minLevel: 3 },
      { id: 'comparison', icon: '📊', label: 'So Sánh', minLevel: 3 }
    ].filter(t => dashLevel >= t.minLevel);
    const mainTabs = allDashTabs.slice(0, 4);
    const moreTabs = allDashTabs.slice(4);
    const isMoreActive = moreTabs.some(t => t.id === activeTab);
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
        {moreTabs.length > 0 && showDashboardMoreMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDashboardMoreMenu(false)} />
            <div className="absolute bottom-full right-0 mb-1 mr-2 bg-white rounded-xl shadow-xl border z-50 overflow-hidden min-w-[160px]">
              {moreTabs.map(tab => (
                <button key={tab.id} onClick={() => { navigateTo('dashboard', tab.id); setShowDashboardMoreMenu(false); }}
                  className={`w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-2 ${activeTab === tab.id ? 'bg-green-100 text-green-700' : 'hover:bg-gray-50'}`}>
                  <span>{tab.icon}</span> {tab.label}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex">
          {mainTabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo('dashboard', tab.id)}
                className={`flex-1 py-2 flex flex-col items-center relative ${
                  isActive
                    ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                    : 'text-green-300'
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                    tab.highlight ? 'bg-orange-400' : 'bg-white'
                  }`} />
                )}
              </button>
            );
          })}
          {moreTabs.length > 0 && (
            <button
              onClick={() => setShowDashboardMoreMenu(!showDashboardMoreMenu)}
              className={`flex-1 py-2 flex flex-col items-center relative ${
                isMoreActive ? 'text-white bg-green-900' : 'text-green-300'
              }`}
            >
              <span className="text-lg">...</span>
              <span className="text-[9px] mt-0.5 font-medium">Thêm</span>
              {isMoreActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full bg-white" />
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (activeModule === 'technical') {
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
        <div className="flex">
          {[
            { id: 'today', icon: '📅', label: 'Hôm Nay', highlight: true },
            { id: 'calendar', icon: '🗓️', label: 'Lịch' },
            { id: 'jobs', icon: '📋', label: 'Việc' },
            { id: 'wages', icon: '💰', label: 'Công' },
            { id: 'summary', icon: '📊', label: 'Tổng' }
          ].map(tab => {
            const todayCount = tab.id === 'today' ? technicalJobs.filter(j => j.scheduledDate === getTodayVN() && j.status !== 'Hủy' && j.status !== 'Hoàn thành').length : 0;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo('technical', tab.id)}
                className={`flex-1 py-2 flex flex-col items-center relative ${
                  isActive
                    ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                    : 'text-green-300'
                }`}
              >
                <span className="text-lg relative">
                  {tab.icon}
                  {tab.id === 'today' && todayCount > 0 && (
                    <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                      {todayCount}
                    </span>
                  )}
                </span>
                <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                    tab.highlight ? 'bg-orange-400' : 'bg-white'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (activeModule === 'media') {
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
        <div className="flex">
          {[
            { id: 'mytasks', icon: '📝', label: 'Của Tôi', highlight: true },
            { id: 'dashboard', icon: '📊', label: 'Tổng' },
            { id: 'tasks', icon: '🎬', label: 'Video' },
            { id: 'calendar', icon: '📅', label: 'Lịch' },
            { id: 'report', icon: '📈', label: 'B.Cáo' }
          ].map(tab => {
            const myTasksCount = tab.id === 'mytasks'
              ? tasks.filter(t =>
                  t.assignee === currentUser.name &&
                  t.status !== 'done' &&
                  t.status !== 'completed' &&
                  t.status !== 'Hoàn thành'
                ).length
              : 0;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo('media', tab.id)}
                className={`flex-1 py-2 flex flex-col items-center relative ${
                  isActive
                    ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                    : 'text-green-300'
                }`}
              >
                <span className="text-lg relative">
                  {tab.icon}
                  {tab.id === 'mytasks' && myTasksCount > 0 && (
                    <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                      {myTasksCount > 9 ? '9+' : myTasksCount}
                    </span>
                  )}
                </span>
                <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                    tab.highlight ? 'bg-orange-400' : 'bg-white'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (activeModule === 'sales') {
    const newOrders = (orders || []).filter(o => o.status === 'new').length;
    const pendingReconciliation = (orders || []).filter(o => ['shipping', 'delivered'].includes(o.status)).length;
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
        <div className="flex">
          {[
            { id: 'orders', icon: '🛒', label: 'Đơn', highlight: true, tabKey: 'orders' },
            { id: 'reconciliation', icon: '📊', label: 'Đ.Soát', tabKey: 'reconciliation' },
            { id: 'customers', icon: '👥', label: 'Khách', tabKey: 'customers' },
            { id: 'products', icon: '📦', label: 'SP', tabKey: 'products' },
            { id: 'report', icon: '📈', label: 'B.Cáo', tabKey: 'report' }
          ].filter(t => !canAccessTab || !t.tabKey || canAccessTab('sales', t.tabKey)).map(tab => {
            const badgeCount = tab.id === 'orders' ? newOrders
              : tab.id === 'reconciliation' ? pendingReconciliation : 0;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo('sales', tab.id)}
                className={`flex-1 py-2 flex flex-col items-center relative ${
                  isActive
                    ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                    : 'text-green-300'
                }`}
              >
                <span className="text-lg relative">
                  {tab.icon}
                  {badgeCount > 0 && (
                    <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  )}
                </span>
                <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                    tab.highlight ? 'bg-orange-400' : 'bg-white'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const isAdmin = isAdminRole(currentUser);

  // Non-admin employee at salary view - show minimal bottom bar
  if (activeModule === 'finance' && activeTab === 'salaries' && !isAdmin) {
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
        <div className="flex">
          <button
            onClick={() => navigateTo('media', 'dashboard')}
            className="flex-1 py-2 flex flex-col items-center relative text-green-300"
          >
            <span className="text-lg">🏠</span>
            <span className="text-[9px] mt-0.5 font-medium">Trang chủ</span>
          </button>
          <button
            className="flex-1 py-2 flex flex-col items-center relative text-white bg-green-900"
          >
            <span className="text-lg">💰</span>
            <span className="text-[9px] mt-0.5 font-medium">Lương</span>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full bg-white" />
          </button>
        </div>
      </div>
    );
  }

  if (activeModule === 'finance') {
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
        <div className="flex">
          {[
            { id: 'dashboard', icon: '📊', label: 'Tổng', highlight: true, tabKey: 'overview' },
            { id: 'receipts', icon: '🧾', label: 'Thu/Chi', tabKey: 'receipts' },
            ...(isAdmin ? [{ id: 'salaries', icon: '💰', label: 'Lương', tabKey: 'salaries' }] : []),
            { id: 'debts', icon: '💳', label: 'Công nợ', tabKey: 'debts' },
            { id: 'reports', icon: '📈', label: 'B.Cáo', tabKey: 'reports' }
          ].filter(t => !canAccessTab || !t.tabKey || canAccessTab('finance', t.tabKey)).map(tab => {
            const pendingCount = tab.id === 'receipts'
              ? (receiptsPayments || []).filter(r => r.status === 'pending').length
              : 0;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo('finance', tab.id)}
                className={`flex-1 py-2 flex flex-col items-center relative ${
                  isActive
                    ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                    : 'text-green-300'
                }`}
              >
                <span className="text-lg relative">
                  {tab.icon}
                  {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </span>
                <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                    tab.highlight ? 'bg-orange-400' : 'bg-white'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (activeModule === 'warehouse') {
    const showMoreMenu = showWarehouseMoreMenu;
    const setShowMoreMenu = setShowWarehouseMoreMenu;
    const moreTabs = [
      { id: 'stocktake', icon: '📝', label: 'Kiểm Kê', tabKey: 'stocktake' },
      { id: 'po', icon: '📋', label: 'Đơn Mua', tabKey: 'po' },
      { id: 'history', icon: '📋', label: 'Lịch Sử', tabKey: 'products' },
      { id: 'report', icon: '📊', label: 'Báo Cáo', tabKey: 'report' },
      { id: 'suppliers', icon: '🏢', label: 'NCC', tabKey: 'suppliers' },
      { id: 'warehouses', icon: '🏭', label: 'Kho', tabKey: 'warehouses' }
    ].filter(t => !canAccessTab || !t.tabKey || canAccessTab('warehouse', t.tabKey));
    const isMoreActive = moreTabs.some(t => t.id === activeTab);
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
        {showMoreMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
            <div className="absolute bottom-full right-0 mb-1 mr-2 bg-white rounded-xl shadow-xl border z-50 overflow-hidden min-w-[160px]">
              {moreTabs.map(tab => (
                <button key={tab.id} onClick={() => { navigateTo('warehouse', tab.id); setShowMoreMenu(false); }}
                  className={`w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-2 ${activeTab === tab.id ? 'bg-green-100 text-green-700' : 'hover:bg-gray-50'}`}>
                  <span>{tab.icon}</span> {tab.label}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex">
          {[
            { id: 'inventory', icon: '📦', label: 'Tồn Kho', highlight: true, tabKey: 'inventory' },
            { id: 'import', icon: '📥', label: 'Nhập', tabKey: 'import' },
            { id: 'export', icon: '📤', label: 'Xuất', tabKey: 'export' },
            { id: 'transfer', icon: '🔄', label: 'Chuyển', tabKey: 'transfer' }
          ].filter(t => !canAccessTab || !t.tabKey || canAccessTab('warehouse', t.tabKey)).map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo('warehouse', tab.id)}
                className={`flex-1 py-2 flex flex-col items-center relative ${
                  isActive
                    ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                    : 'text-green-300'
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                    tab.highlight ? 'bg-orange-400' : 'bg-white'
                  }`} />
                )}
              </button>
            );
          })}
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`flex-1 py-2 flex flex-col items-center relative ${
              isMoreActive ? 'text-white bg-green-900' : 'text-green-300'
            }`}
          >
            <span className="text-lg">...</span>
            <span className="text-[9px] mt-0.5 font-medium">Thêm</span>
            {isMoreActive && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full bg-white" />
            )}
          </button>
        </div>
      </div>
    );
  }

  if (activeModule === 'warranty') {
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
        <div className="flex">
          {[
            { id: 'lookup', icon: '🔍', label: 'Tra Cứu', highlight: true, tabKey: 'lookup' },
            { id: 'serials', icon: '🏷️', label: 'Serial', tabKey: 'serials' },
            { id: 'cards', icon: '🛡️', label: 'Thẻ BH', tabKey: 'cards' },
            { id: 'repairs', icon: '🔧', label: 'Sửa', tabKey: 'repairs' },
            { id: 'requests', icon: '📩', label: 'Yêu Cầu', tabKey: 'requests' }
          ].filter(t => !canAccessTab || !t.tabKey || canAccessTab('warranty', t.tabKey)).map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo('warranty', tab.id)}
                className={`flex-1 py-2 flex flex-col items-center relative ${
                  isActive
                    ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                    : 'text-green-300'
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                    tab.highlight ? 'bg-orange-400' : 'bg-white'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (activeModule === 'hrm') {
    const showMoreMenu = showHrmMoreMenu;
    const setShowMoreMenu = setShowHrmMoreMenu;
    const moreTabs = [
      { id: 'leaves', icon: '📋', label: 'Đơn Từ', tabKey: 'leaves' },
      { id: 'report', icon: '📊', label: 'Báo Cáo', tabKey: 'report' },
      { id: 'settings', icon: '⚙️', label: 'Cài Đặt', tabKey: 'settings' }
    ].filter(t => !canAccessTab || !t.tabKey || canAccessTab('hrm', t.tabKey));
    const isMoreActive = moreTabs.some(t => t.id === activeTab);
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
        {showMoreMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
            <div className="absolute bottom-full right-0 mb-1 mr-2 bg-white rounded-xl shadow-xl border z-50 overflow-hidden min-w-[160px]">
              {moreTabs.map(tab => (
                <button key={tab.id} onClick={() => { navigateTo('hrm', tab.id); setShowMoreMenu(false); }}
                  className={`w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-2 ${activeTab === tab.id ? 'bg-green-100 text-green-700' : 'hover:bg-gray-50'}`}>
                  <span>{tab.icon}</span> {tab.label}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex">
          {[
            { id: 'employees', icon: '👤', label: 'NV', highlight: true, tabKey: 'employees' },
            { id: 'attendance', icon: '⏰', label: 'Chấm', tabKey: 'attendance' },
            { id: 'schedule', icon: '📅', label: 'Lịch', tabKey: 'schedule' },
            { id: 'kpi', icon: '🎯', label: 'KPI', tabKey: 'kpi' },
            { id: 'payroll', icon: '💰', label: 'Lương', tabKey: 'payroll' }
          ].filter(t => !canAccessTab || !t.tabKey || canAccessTab('hrm', t.tabKey)).map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo('hrm', tab.id)}
                className={`flex-1 py-2 flex flex-col items-center relative ${
                  isActive
                    ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                    : 'text-green-300'
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                    tab.highlight ? 'bg-orange-400' : 'bg-white'
                  }`} />
                )}
              </button>
            );
          })}
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`flex-1 py-2 flex flex-col items-center relative ${
              isMoreActive ? 'text-white bg-green-900' : 'text-green-300'
            }`}
          >
            <span className="text-lg">...</span>
            <span className="text-[9px] mt-0.5 font-medium">Thêm</span>
            {isMoreActive && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full bg-white" />
            )}
          </button>
        </div>
      </div>
    );
  }

  if (activeModule === 'settings') {
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        <div className="flex bg-gradient-to-r from-purple-700 to-purple-800 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
          {[
            { id: 'company', icon: '🏢', label: 'Công Ty' },
            { id: 'warehouses', icon: '🏭', label: 'Kho' },
            { id: 'products', icon: '📦', label: 'SP' },
            { id: 'shipping', icon: '🚚', label: 'Ship' },
            { id: 'logs', icon: '📋', label: 'Log' },
            { id: 'backup', icon: '💾', label: 'Backup' }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => navigateTo('settings', tab.id)}
                className={`flex-1 flex flex-col items-center py-2.5 relative transition-all duration-200 ${isActive ? 'text-white' : 'text-purple-300'}`}>
                <span className="text-lg">{tab.icon}</span>
                <span className="text-[9px] mt-0.5 font-medium">{tab.label}</span>
                {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full bg-white" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

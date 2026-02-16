import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { isAdmin } from '../../utils/permissionUtils';

import { receiptCategories as defaultReceiptCategories } from '../../constants/financeConstants';
import FinanceDashboard from './FinanceDashboard';
import ReceiptsView from './ReceiptsView';
import DebtsView from './DebtsView';
import SalariesView from './SalariesView';
import MySalaryView from './MySalaryView';
import ReportsView from './ReportsView';

const NoAccess = () => (
  <div className="p-6">
    <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
      <p className="text-red-600">Bạn không được phép xem mục này. Vui lòng liên hệ Admin.</p>
    </div>
  </div>
);

export default function FinanceModule() {
  const { activeTab, currentUser, tenant, allUsers, canAccessTab, getPermissionLevel, canCreateFinance, canEditOwnFinance, navigateTo } = useApp();
  const { receiptsPayments, debts, salaries, tasks, technicalJobs, attendances, loadFinanceData, getSettingValue } = useData();

  const dynamicReceiptCategories = {
    thu: getSettingValue('finance', 'receipt_categories_thu', null) || defaultReceiptCategories.thu,
    chi: getSettingValue('finance', 'receipt_categories_chi', null) || defaultReceiptCategories.chi
  };
  const { createNotification } = useNotifications();

  return (
    <>
      {activeTab === 'dashboard' && canAccessTab('finance', 'overview') && <FinanceDashboard currentUser={currentUser} receiptsPayments={receiptsPayments} debts={debts} salaries={salaries} getPermissionLevel={getPermissionLevel} navigateTo={navigateTo} />}
      {activeTab === 'receipts' && canAccessTab('finance', 'receipts') && <ReceiptsView currentUser={currentUser} tenant={tenant} allUsers={allUsers} receiptsPayments={receiptsPayments} getPermissionLevel={getPermissionLevel} canCreateFinance={canCreateFinance} canEditOwnFinance={canEditOwnFinance} createNotification={createNotification} loadFinanceData={loadFinanceData} receiptCategories={dynamicReceiptCategories} />}
      {activeTab === 'debts' && canAccessTab('finance', 'debts') && <DebtsView currentUser={currentUser} tenant={tenant} debts={debts} receiptsPayments={receiptsPayments} getPermissionLevel={getPermissionLevel} canCreateFinance={canCreateFinance} canEditOwnFinance={canEditOwnFinance} loadFinanceData={loadFinanceData} />}
      {activeTab === 'salaries' && canAccessTab('finance', 'salaries') && (
        isAdmin(currentUser)
          ? <SalariesView tenant={tenant} currentUser={currentUser} allUsers={allUsers} tasks={tasks} technicalJobs={technicalJobs} attendances={attendances} loadFinanceData={loadFinanceData} />
          : <MySalaryView />
      )}
      {activeTab === 'salaries' && !canAccessTab('finance', 'salaries') && !isAdmin(currentUser) && <MySalaryView />}
      {activeTab === 'reports' && canAccessTab('finance', 'reports') && <ReportsView currentUser={currentUser} receiptsPayments={receiptsPayments} debts={debts} salaries={salaries} getPermissionLevel={getPermissionLevel} />}
      {!canAccessTab('finance', activeTab === 'dashboard' ? 'overview' : activeTab) && activeTab !== 'salaries' && <NoAccess />}
      {activeTab === 'salaries' && !canAccessTab('finance', 'salaries') && isAdmin(currentUser) && <NoAccess />}
    </>
  );
}

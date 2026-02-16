import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';

import WarrantyLookupView from './WarrantyLookupView';
import WarrantySerialView from './WarrantySerialView';
import WarrantyCardsView from './WarrantyCardsView';
import WarrantyRepairView from './WarrantyRepairView';
import WarrantyDashboard from './WarrantyDashboard';
import WarrantyRequestsView from './WarrantyRequestsView';

const NoAccess = () => (
  <div className="p-6">
    <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
      <p className="text-red-600">Bạn không được phép xem mục này.</p>
    </div>
  </div>
);

export default function WarrantyModule() {
  const { activeTab, currentUser, tenant, canAccessTab, hasPermission, canEdit, getPermissionLevel } = useApp();
  const { serials, warrantyCards, warrantyRepairs, warrantyRequests, products, customers, warehouses, loadWarrantyData, loadFinanceData, loadWarehouseData, allUsers } = useData();

  const permissionProps = { hasPermission, canEdit, getPermissionLevel };
  const commonProps = { tenant, currentUser, serials, warrantyCards, warrantyRepairs, products, customers, warehouses, loadWarrantyData, loadFinanceData, loadWarehouseData, ...permissionProps };

  return (
    <>
      {activeTab === 'lookup' && canAccessTab('warranty', 'lookup') && <WarrantyLookupView {...commonProps} />}
      {activeTab === 'serials' && canAccessTab('warranty', 'serials') && <WarrantySerialView {...commonProps} />}
      {activeTab === 'cards' && canAccessTab('warranty', 'cards') && <WarrantyCardsView {...commonProps} />}
      {activeTab === 'repairs' && canAccessTab('warranty', 'repairs') && <WarrantyRepairView {...commonProps} allUsers={allUsers} />}
      {activeTab === 'dashboard' && canAccessTab('warranty', 'dashboard') && <WarrantyDashboard {...commonProps} />}
      {activeTab === 'requests' && canAccessTab('warranty', 'requests') && <WarrantyRequestsView {...commonProps} warrantyRequests={warrantyRequests} />}
      {!canAccessTab('warranty', activeTab) && <NoAccess />}
    </>
  );
}

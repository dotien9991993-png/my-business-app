import React, { Suspense } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';

import WarehouseInventoryView from './WarehouseInventoryView';
import WarehouseImportView from './WarehouseImportView';
import WarehouseExportView from './WarehouseExportView';
import WarehouseHistoryView from './WarehouseHistoryView';
import WarehousesView from './WarehousesView';
import WarehouseStocktakeView from './WarehouseStocktakeView';
import WarehouseTransferView from './WarehouseTransferView';
// Lazy load views
const WarehouseReportView = React.lazy(() => import('./WarehouseReportView'));
const PurchaseOrderView = React.lazy(() => import('./PurchaseOrderView'));
import WarehouseSuppliersView from './WarehouseSuppliersView';

const NoAccess = () => (
  <div className="p-6">
    <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
      <p className="text-red-600">Bạn không được phép xem mục này.</p>
    </div>
  </div>
);

export default function WarehouseModule() {
  const { activeTab, currentUser, tenant, canAccessTab, hasPermission, canEdit, getPermissionLevel } = useApp();
  const { products, stockTransactions, loadWarehouseData, warehouses, warehouseStock, getSettingValue, comboItems, productVariants, suppliers, stocktakes, transfers, orders, purchaseOrders, purchaseOrderItems, supplierPayments } = useData();

  const dynamicCategories = getSettingValue('product', 'categories', null);
  const dynamicUnits = getSettingValue('product', 'units', null);

  const tabPermissionMap = {
    history: 'products',
  };
  const getTabPermission = (tab) => tabPermissionMap[tab] || tab;

  const tabFallback = <div className="flex items-center justify-center py-20"><div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" /></div>;

  return (
    <Suspense fallback={tabFallback}>
      {activeTab === 'inventory' && canAccessTab('warehouse', 'inventory') && <WarehouseInventoryView products={products} warehouses={warehouses} warehouseStock={warehouseStock} loadWarehouseData={loadWarehouseData} tenant={tenant} currentUser={currentUser} dynamicCategories={dynamicCategories} dynamicUnits={dynamicUnits} comboItems={comboItems} productVariants={productVariants} orders={orders} suppliers={suppliers} hasPermission={hasPermission} canEdit={canEdit} getPermissionLevel={getPermissionLevel} />}
      {activeTab === 'import' && canAccessTab('warehouse', 'import') && <WarehouseImportView products={products} warehouses={warehouses} warehouseStock={warehouseStock} stockTransactions={stockTransactions} loadWarehouseData={loadWarehouseData} tenant={tenant} currentUser={currentUser} suppliers={suppliers} hasPermission={hasPermission} canEdit={canEdit} getPermissionLevel={getPermissionLevel} />}
      {activeTab === 'export' && canAccessTab('warehouse', 'export') && <WarehouseExportView products={products} warehouses={warehouses} warehouseStock={warehouseStock} stockTransactions={stockTransactions} loadWarehouseData={loadWarehouseData} tenant={tenant} currentUser={currentUser} hasPermission={hasPermission} canEdit={canEdit} getPermissionLevel={getPermissionLevel} />}
      {activeTab === 'transfer' && canAccessTab('warehouse', 'transfer') && <WarehouseTransferView transfers={transfers} products={products} warehouses={warehouses} warehouseStock={warehouseStock} loadWarehouseData={loadWarehouseData} tenant={tenant} currentUser={currentUser} hasPermission={hasPermission} canEdit={canEdit} />}
      {activeTab === 'stocktake' && canAccessTab('warehouse', 'stocktake') && <WarehouseStocktakeView stocktakes={stocktakes} products={products} warehouses={warehouses} warehouseStock={warehouseStock} loadWarehouseData={loadWarehouseData} tenant={tenant} currentUser={currentUser} hasPermission={hasPermission} canEdit={canEdit} productVariants={productVariants} />}
      {activeTab === 'history' && canAccessTab('warehouse', 'products') && <WarehouseHistoryView stockTransactions={stockTransactions} warehouses={warehouses} />}
      {activeTab === 'report' && canAccessTab('warehouse', 'report') && <WarehouseReportView products={products} stockTransactions={stockTransactions} warehouses={warehouses} warehouseStock={warehouseStock} tenant={tenant} hasPermission={hasPermission} canEdit={canEdit} getPermissionLevel={getPermissionLevel} suppliers={suppliers} supplierPayments={supplierPayments} />}
      {activeTab === 'po' && canAccessTab('warehouse', 'po') && <PurchaseOrderView purchaseOrders={purchaseOrders} purchaseOrderItems={purchaseOrderItems} suppliers={suppliers} products={products} warehouses={warehouses} warehouseStock={warehouseStock} loadWarehouseData={loadWarehouseData} tenant={tenant} currentUser={currentUser} hasPermission={hasPermission} canEdit={canEdit} />}
      {activeTab === 'suppliers' && canAccessTab('warehouse', 'suppliers') && <WarehouseSuppliersView suppliers={suppliers} products={products} stockTransactions={stockTransactions} loadWarehouseData={loadWarehouseData} tenant={tenant} currentUser={currentUser} warehouses={warehouses} hasPermission={hasPermission} canEdit={canEdit} supplierPayments={supplierPayments} />}
      {activeTab === 'warehouses' && canAccessTab('warehouse', 'warehouses') && <WarehousesView warehouses={warehouses} warehouseStock={warehouseStock} products={products} loadWarehouseData={loadWarehouseData} tenant={tenant} currentUser={currentUser} hasPermission={hasPermission} canEdit={canEdit} />}
      {!canAccessTab('warehouse', getTabPermission(activeTab)) && <NoAccess />}
    </Suspense>
  );
}

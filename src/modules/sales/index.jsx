import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';
import { shippingProviders as defaultShippingProviders } from '../../constants/salesConstants';

import SalesOrdersView from './SalesOrdersView';
import SalesCustomersView from './SalesCustomersView';
import SalesProductsView from './SalesProductsView';
import SalesReportView from './SalesReportView';
import SalesReconciliationView from './SalesReconciliationView';
import SalesShippingView from './SalesShippingView';
import SalesCodView from './SalesCodView';
import SalesCouponsView from './SalesCouponsView';
import SalesCashBookView from './SalesCashBookView';

const NoAccess = () => (
  <div className="p-6">
    <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
      <p className="text-red-600">Bạn không được phép xem mục này.</p>
    </div>
  </div>
);

export default function SalesModule() {
  const { activeTab, currentUser, tenant, canAccessTab, hasPermission, canEdit, getPermissionLevel, filterByPermission } = useApp();
  const { orders, customers, customerAddresses, products, loadSalesData, loadWarehouseData, loadFinanceData, createTechnicalJob, warehouses, warehouseStock, getSettingValue, shippingConfigs, warrantyCards, warrantyRepairs, comboItems, productVariants } = useData();

  const dynamicCategories = getSettingValue('product', 'categories', null);

  // Build dynamic shipping providers: active API providers + other providers + fallback
  const dynamicShippingProviders = React.useMemo(() => {
    const activeApiProviders = (shippingConfigs || [])
      .filter(c => c.is_active && c.api_token)
      .map(c => {
        if (c.provider === 'ghn') return 'GHN';
        if (c.provider === 'ghtk') return 'GHTK';
        if (c.provider === 'viettel_post') return 'Viettel Post';
        return c.provider;
      });
    const otherProviders = getSettingValue('shipping', 'other_providers', null);
    if (activeApiProviders.length > 0 || otherProviders) {
      return [...new Set([...activeApiProviders, ...(otherProviders || [])])];
    }
    return defaultShippingProviders;
  }, [shippingConfigs, getSettingValue]);

  return (
    <>
      {activeTab === 'orders' && canAccessTab('sales', 'orders') && (
        <SalesOrdersView
          tenant={tenant} currentUser={currentUser}
          orders={orders} customers={customers} products={products}
          customerAddresses={customerAddresses}
          loadSalesData={loadSalesData} loadWarehouseData={loadWarehouseData}
          loadFinanceData={loadFinanceData} createTechnicalJob={createTechnicalJob}
          warehouses={warehouses} warehouseStock={warehouseStock}
          dynamicShippingProviders={dynamicShippingProviders}
          shippingConfigs={shippingConfigs} getSettingValue={getSettingValue}
          comboItems={comboItems} productVariants={productVariants}
          hasPermission={hasPermission} canEdit={canEdit}
          getPermissionLevel={getPermissionLevel} filterByPermission={filterByPermission}
        />
      )}
      {activeTab === 'customers' && canAccessTab('sales', 'customers') && (
        <SalesCustomersView
          tenant={tenant} currentUser={currentUser}
          customers={customers} orders={orders}
          customerAddresses={customerAddresses}
          loadSalesData={loadSalesData}
          warrantyCards={warrantyCards} warrantyRepairs={warrantyRepairs}
          hasPermission={hasPermission} canEdit={canEdit}
          getPermissionLevel={getPermissionLevel} filterByPermission={filterByPermission}
        />
      )}
      {activeTab === 'products' && canAccessTab('sales', 'products') && (
        <SalesProductsView
          tenant={tenant} products={products} orders={orders}
          currentUser={currentUser} dynamicCategories={dynamicCategories}
          comboItems={comboItems} productVariants={productVariants}
          getPermissionLevel={getPermissionLevel}
        />
      )}
      {activeTab === 'report' && canAccessTab('sales', 'report') && (
        <SalesReportView
          orders={orders} products={products} customers={customers}
          currentUser={currentUser} tenant={tenant}
        />
      )}
      {activeTab === 'shipping' && canAccessTab('sales', 'shipping') && (
        <SalesShippingView
          tenant={tenant} currentUser={currentUser}
          loadSalesData={loadSalesData}
          shippingConfigs={shippingConfigs} getSettingValue={getSettingValue}
          hasPermission={hasPermission}
        />
      )}
      {activeTab === 'cod' && canAccessTab('sales', 'cod') && (
        <SalesCodView
          tenant={tenant} currentUser={currentUser}
          loadSalesData={loadSalesData} loadFinanceData={loadFinanceData}
          hasPermission={hasPermission}
        />
      )}
      {activeTab === 'coupons' && canAccessTab('sales', 'coupons') && (
        <SalesCouponsView
          tenant={tenant} currentUser={currentUser}
          hasPermission={hasPermission} getPermissionLevel={getPermissionLevel}
        />
      )}
      {activeTab === 'cashbook' && canAccessTab('sales', 'cashbook') && (
        <SalesCashBookView
          tenant={tenant} currentUser={currentUser}
          hasPermission={hasPermission}
          getPermissionLevel={getPermissionLevel}
        />
      )}
      {activeTab === 'reconciliation' && (
        <SalesReconciliationView
          tenant={tenant} currentUser={currentUser}
          orders={orders} loadSalesData={loadSalesData}
          loadWarehouseData={loadWarehouseData} loadFinanceData={loadFinanceData}
          warehouses={warehouses}
          hasPermission={hasPermission} canEdit={canEdit}
          getPermissionLevel={getPermissionLevel}
        />
      )}
      {!canAccessTab('sales', activeTab) && activeTab !== 'reconciliation' && <NoAccess />}
    </>
  );
}

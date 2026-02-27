import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';

import CompanySettings from './CompanySettings';
import WarehouseSettings from './WarehouseSettings';
import FinanceSettings from './FinanceSettings';
import ProductSettings from './ProductSettings';
import ShippingSettings from './ShippingSettings';
import ZaloOASettings from './ZaloOASettings';
import ActivityLogView from './ActivityLogView';
import BackupSettings from './BackupSettings';
import SocialPagesSettings from './SocialPagesSettings';

export default function SettingsModule() {
  const { activeTab, tenant, currentUser } = useApp();
  const {
    systemSettings, shippingConfigs, getSettingValue, loadSettingsData,
    warehouses, warehouseStock, products, loadWarehouseData
  } = useData();

  const commonProps = { tenant, currentUser, systemSettings, getSettingValue, loadSettingsData };

  return (
    <>
      {activeTab === 'company' && (
        <CompanySettings {...commonProps} />
      )}
      {activeTab === 'warehouses' && (
        <WarehouseSettings
          warehouses={warehouses} warehouseStock={warehouseStock}
          products={products} loadWarehouseData={loadWarehouseData}
          tenant={tenant} currentUser={currentUser}
        />
      )}
      {activeTab === 'finance' && (
        <FinanceSettings {...commonProps} />
      )}
      {activeTab === 'products' && (
        <ProductSettings {...commonProps} />
      )}
      {activeTab === 'shipping' && (
        <ShippingSettings {...commonProps} shippingConfigs={shippingConfigs} />
      )}
      {activeTab === 'zalo' && (
        <ZaloOASettings tenant={tenant} currentUser={currentUser} />
      )}
      {activeTab === 'social' && (
        <SocialPagesSettings tenant={tenant} currentUser={currentUser} />
      )}
      {activeTab === 'logs' && (
        <ActivityLogView tenant={tenant} currentUser={currentUser} />
      )}
      {activeTab === 'backup' && (
        <BackupSettings tenant={tenant} />
      )}
    </>
  );
}

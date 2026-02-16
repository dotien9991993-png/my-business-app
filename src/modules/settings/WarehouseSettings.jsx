import React from 'react';
import WarehousesView from '../warehouse/WarehousesView';

export default function WarehouseSettings({ warehouses, warehouseStock, products, loadWarehouseData, tenant, currentUser }) {
  return <WarehousesView
    warehouses={warehouses} warehouseStock={warehouseStock}
    products={products} loadWarehouseData={loadWarehouseData}
    tenant={tenant} currentUser={currentUser}
  />;
}

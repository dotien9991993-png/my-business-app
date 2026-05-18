/**
 * Helpers gọi các Atomic RPC mới (batch 1-3 migrations)
 * Mục đích: thay thế việc loop client-side dễ bị race condition.
 */
import { supabase } from '../supabaseClient';

// ---- Sinh số chứng từ atomic ----

export async function genOrderNumber(tenantId) {
  const { data, error } = await supabase.rpc('gen_order_number', { p_tenant: tenantId });
  if (error) throw error;
  return data;
}

export async function genReceiptNumber(tenantId) {
  const { data, error } = await supabase.rpc('gen_receipt_number', { p_tenant: tenantId });
  if (error) throw error;
  return data;
}

export async function genStockTxNumber(tenantId, type) {
  const { data, error } = await supabase.rpc('gen_stock_tx_number', {
    p_tenant: tenantId, p_type: type,
  });
  if (error) throw error;
  return data;
}

export async function genTransferCode(tenantId) {
  const { data, error } = await supabase.rpc('gen_transfer_code', { p_tenant: tenantId });
  if (error) throw error;
  return data;
}

export async function genStocktakeCode(tenantId) {
  const { data, error } = await supabase.rpc('gen_stocktake_code', { p_tenant: tenantId });
  if (error) throw error;
  return data;
}

export async function genSupplierReturnCode(tenantId) {
  const { data, error } = await supabase.rpc('gen_supplier_return_code', { p_tenant: tenantId });
  if (error) throw error;
  return data;
}

export async function genSku(tenantId) {
  const { data, error } = await supabase.rpc('gen_sku', { p_tenant: tenantId });
  if (error) throw error;
  return data;
}

// ---- Atomic flows ----

/**
 * Chuyển kho nhiều SP atomic
 * @param {string} tenantId
 * @param {string} fromWarehouseId
 * @param {string} toWarehouseId
 * @param {Array<{product_id, quantity, variant_id?}>} items
 * @param {string} userName
 * @param {string} note
 * @returns {Promise<string>} transfer_id
 */
export async function transferStockMulti(tenantId, fromWarehouseId, toWarehouseId, items, userName, note = '') {
  const { data, error } = await supabase.rpc('transfer_stock_multi', {
    p_tenant: tenantId,
    p_from_warehouse: fromWarehouseId,
    p_to_warehouse: toWarehouseId,
    p_items: items,
    p_user: userName,
    p_note: note,
  });
  if (error) throw error;
  return data;
}

/**
 * Duyệt phiếu nhập atomic — cộng kho + cập nhật WAC
 */
export async function approveImport(transactionId, userName) {
  const { data, error } = await supabase.rpc('approve_import_atomic', {
    p_transaction_id: transactionId,
    p_user: userName,
  });
  if (error) throw error;
  return data;
}

/**
 * Duyệt phiếu xuất atomic
 */
export async function approveExport(transactionId, userName) {
  const { data, error } = await supabase.rpc('approve_export_atomic', {
    p_transaction_id: transactionId,
    p_user: userName,
  });
  if (error) throw error;
  return data;
}

/**
 * Xác nhận trả NCC — trừ kho + tạo công nợ ngược
 */
export async function confirmSupplierReturn(returnId, userName) {
  const { data, error } = await supabase.rpc('confirm_supplier_return_atomic', {
    p_return_id: returnId,
    p_user: userName,
  });
  if (error) throw error;
  return data;
}

/**
 * Gộp nhiều đơn → 1 đơn mới
 */
export async function mergeOrders(tenantId, oldOrderIds, newOrder, newItems, warehouseId, userName) {
  const { data, error } = await supabase.rpc('merge_orders_atomic', {
    p_tenant: tenantId,
    p_old_order_ids: oldOrderIds,
    p_new_order: newOrder,
    p_new_items: newItems,
    p_warehouse_id: warehouseId,
    p_user: userName,
  });
  if (error) throw error;
  return data;
}

/**
 * Hoàn tất kiểm kê — SET stock tuyệt đối
 */
export async function completeStocktake(stocktakeId, userName) {
  const { data, error } = await supabase.rpc('complete_stocktake_atomic', {
    p_stocktake_id: stocktakeId,
    p_user: userName,
  });
  if (error) throw error;
  return data;
}

/**
 * Xác nhận đã nhận COD: tự tạo phiếu thu + sổ quỹ + cập nhật đơn
 */
export async function confirmCodReceived(reconciliationId, userName) {
  const { data, error } = await supabase.rpc('confirm_cod_received_atomic', {
    p_reconciliation_id: reconciliationId,
    p_user: userName,
  });
  if (error) throw error;
  return data;
}

/**
 * Đổi status nhiều đơn cùng lúc
 * @returns {Promise<number>} số đơn đã cập nhật
 */
export async function bulkUpdateOrderStatus(tenantId, orderIds, newStatus, userName) {
  const { data, error } = await supabase.rpc('bulk_update_order_status', {
    p_tenant: tenantId,
    p_order_ids: orderIds,
    p_new_status: newStatus,
    p_user: userName,
  });
  if (error) throw error;
  return data;
}

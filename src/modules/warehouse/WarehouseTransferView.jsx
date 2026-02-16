import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { getDateStrVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';

export default function WarehouseTransferView({
  transfers,
  products,
  warehouses,
  warehouseStock,
  loadWarehouseData,
  tenant,
  currentUser,
  hasPermission,
  canEdit
}) {
  // --- State ---
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [transferItems, setTransferItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Create form state
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [formItems, setFormItems] = useState([{ product_id: '', quantity: '' }]);
  const [formNote, setFormNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // --- Helpers ---
  const genTransferCode = () => {
    const dateStr = getDateStrVN();
    const rand = String(Math.floor(Math.random() * 900) + 100);
    return `CK-${dateStr}-${rand}`;
  };

  const getWarehouseQty = (productId, warehouseId) => {
    if (!warehouseStock || !productId || !warehouseId) return 0;
    const entry = warehouseStock.find(
      ws => String(ws.product_id) === String(productId) && String(ws.warehouse_id) === String(warehouseId)
    );
    return entry ? (entry.quantity || 0) : 0;
  };

  const getWarehouseName = (id) => {
    if (!id || !warehouses) return '—';
    const wh = warehouses.find(w => String(w.id) === String(id));
    return wh ? wh.name : '—';
  };

  const getProductName = (id) => {
    if (!id || !products) return '—';
    const p = products.find(pr => String(pr.id) === String(id));
    return p ? p.name : '—';
  };

  const statusLabels = {
    pending: 'Chờ xử lý',
    in_transit: 'Đang vận chuyển',
    received: 'Đã nhận',
    cancelled: 'Đã hủy'
  };

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_transit: 'bg-blue-100 text-blue-800',
    received: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800'
  };

  // --- Stats ---
  const stats = useMemo(() => {
    const list = transfers || [];
    return {
      total: list.length,
      pending: list.filter(t => t.status === 'pending').length,
      in_transit: list.filter(t => t.status === 'in_transit').length,
      received: list.filter(t => t.status === 'received').length
    };
  }, [transfers]);

  // --- Filtered list ---
  const filteredTransfers = useMemo(() => {
    const list = transfers || [];
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(t =>
      (t.transfer_code || '').toLowerCase().includes(term) ||
      getWarehouseName(t.from_warehouse_id).toLowerCase().includes(term) ||
      getWarehouseName(t.to_warehouse_id).toLowerCase().includes(term) ||
      (statusLabels[t.status] || '').toLowerCase().includes(term)
    );
  }, [transfers, searchTerm, warehouses]);

  // --- Non-combo products for source warehouse ---
  const availableProducts = useMemo(() => {
    if (!products || !fromWarehouseId) return [];
    return products.filter(p => !p.is_combo && getWarehouseQty(p.id, fromWarehouseId) > 0);
  }, [products, fromWarehouseId, warehouseStock]);

  // --- Form item handlers ---
  const addFormItem = () => {
    setFormItems(prev => [...prev, { product_id: '', quantity: '' }]);
  };

  const removeFormItem = (index) => {
    setFormItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateFormItem = (index, field, value) => {
    setFormItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const totalFormItems = useMemo(() => {
    return formItems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
  }, [formItems]);

  // --- Reset create form ---
  const resetCreateForm = () => {
    setFromWarehouseId('');
    setToWarehouseId('');
    setFormItems([{ product_id: '', quantity: '' }]);
    setFormNote('');
  };

  // --- CRUD handlers ---
  const handleCreate = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Bạn không có quyền tạo phiếu chuyển kho'); return; }
    if (!fromWarehouseId || !toWarehouseId) {
      alert('Vui lòng chọn kho xuất và kho nhận.');
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      alert('Kho xuất và kho nhận phải khác nhau.');
      return;
    }
    const validItems = formItems.filter(it => it.product_id && parseInt(it.quantity) > 0);
    if (validItems.length === 0) {
      alert('Vui lòng thêm ít nhất một sản phẩm.');
      return;
    }
    // Validate stock
    for (const item of validItems) {
      const qty = parseInt(item.quantity);
      const stock = getWarehouseQty(item.product_id, fromWarehouseId);
      if (qty > stock) {
        const pName = getProductName(item.product_id);
        alert(`Sản phẩm "${pName}" chỉ còn ${stock} tại kho xuất, không thể chuyển ${qty}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const transferCode = genTransferCode();
      const { data: transfer, error: tErr } = await supabase
        .from('warehouse_transfers')
        .insert({
          tenant_id: tenant.id,
          transfer_code: transferCode,
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          status: 'pending',
          total_items: validItems.reduce((s, it) => s + parseInt(it.quantity), 0),
          note: formNote.trim() || null,
          created_by: currentUser?.name || null,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (tErr) throw tErr;

      const itemRows = validItems.map(it => ({
        tenant_id: tenant.id,
        transfer_id: transfer.id,
        product_id: it.product_id,
        sent_qty: parseInt(it.quantity),
        received_qty: 0
      }));

      const { error: iErr } = await supabase
        .from('warehouse_transfer_items')
        .insert(itemRows);

      if (iErr) throw iErr;

      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'warehouse', action: 'create', entityType: 'transfer', entityId: transfer.id, entityName: transferCode, description: `Tạo phiếu chuyển kho ${transferCode}: ${getWarehouseName(fromWarehouseId)} → ${getWarehouseName(toWarehouseId)}` });
      await loadWarehouseData();
      setShowCreateModal(false);
      resetCreateForm();
      alert('Tạo phiếu chuyển kho thành công!');
    } catch (err) {
      console.error('Create transfer error:', err);
      alert('Lỗi tạo phiếu: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmTransit = async () => {
    if (!selectedTransfer) return;
    if (!confirm('Xác nhận xuất kho? Tồn kho sẽ bị trừ tại kho xuất.')) return;
    setActionLoading(true);
    try {
      // Deduct stock from source warehouse
      for (const item of transferItems) {
        const { error } = await supabase.rpc('adjust_warehouse_stock', {
          p_warehouse_id: selectedTransfer.from_warehouse_id,
          p_product_id: item.product_id,
          p_delta: -item.sent_qty
        });
        if (error) throw error;
      }

      // Update status
      const { error: uErr } = await supabase
        .from('warehouse_transfers')
        .update({ status: 'in_transit', updated_at: new Date().toISOString() })
        .eq('id', selectedTransfer.id);

      if (uErr) throw uErr;

      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'warehouse', action: 'update', entityType: 'transfer', entityId: selectedTransfer.id, entityName: selectedTransfer.transfer_code, description: `Xác nhận xuất kho ${selectedTransfer.transfer_code}: chuyển sang đang vận chuyển` });
      await loadWarehouseData();
      setSelectedTransfer(prev => ({ ...prev, status: 'in_transit' }));
      alert('Đã xác nhận xuất kho. Hàng đang vận chuyển.');
    } catch (err) {
      console.error('Confirm transit error:', err);
      alert('Lỗi: ' + (err.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceive = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Bạn không có quyền xác nhận nhận hàng'); return; }
    if (!selectedTransfer) return;
    if (!confirm('Xác nhận nhận hàng? Tồn kho sẽ được cộng vào kho nhận.')) return;
    setActionLoading(true);
    try {
      // Add stock to destination warehouse
      for (const item of transferItems) {
        const receivedQty = item.received_qty || item.sent_qty;
        const { error } = await supabase.rpc('adjust_warehouse_stock', {
          p_warehouse_id: selectedTransfer.to_warehouse_id,
          p_product_id: item.product_id,
          p_delta: receivedQty
        });
        if (error) throw error;

        // Update received_qty in transfer items
        await supabase
          .from('warehouse_transfer_items')
          .update({ received_qty: receivedQty })
          .eq('id', item.id);
      }

      // Update transfer status
      const { error: uErr } = await supabase
        .from('warehouse_transfers')
        .update({
          status: 'received',
          received_by: currentUser?.name || null,
          received_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedTransfer.id);

      if (uErr) throw uErr;

      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'warehouse', action: 'update', entityType: 'transfer', entityId: selectedTransfer.id, entityName: selectedTransfer.transfer_code, description: `Nhận hàng ${selectedTransfer.transfer_code}: ${getWarehouseName(selectedTransfer.to_warehouse_id)}` });
      await loadWarehouseData();
      setSelectedTransfer(prev => ({ ...prev, status: 'received' }));
      alert('Đã xác nhận nhận hàng thành công!');
    } catch (err) {
      console.error('Receive error:', err);
      alert('Lỗi: ' + (err.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!canEdit('warehouse')) { alert('Bạn không có quyền hủy phiếu chuyển kho'); return; }
    if (!selectedTransfer) return;
    const st = selectedTransfer.status;
    if (st === 'received' || st === 'cancelled') return;

    const msg = st === 'in_transit'
      ? 'Hủy phiếu đang vận chuyển? Tồn kho sẽ được hoàn lại kho xuất.'
      : 'Hủy phiếu chuyển kho này?';
    if (!confirm(msg)) return;

    setActionLoading(true);
    try {
      // If in_transit, restore source stock
      if (st === 'in_transit') {
        for (const item of transferItems) {
          const { error } = await supabase.rpc('adjust_warehouse_stock', {
            p_warehouse_id: selectedTransfer.from_warehouse_id,
            p_product_id: item.product_id,
            p_delta: item.sent_qty
          });
          if (error) throw error;
        }
      }

      const { error: uErr } = await supabase
        .from('warehouse_transfers')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', selectedTransfer.id);

      if (uErr) throw uErr;

      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'warehouse', action: 'cancel', entityType: 'transfer', entityId: selectedTransfer.id, entityName: selectedTransfer.transfer_code, description: `Hủy phiếu chuyển kho ${selectedTransfer.transfer_code}` });
      await loadWarehouseData();
      setSelectedTransfer(prev => ({ ...prev, status: 'cancelled' }));
      alert('Đã hủy phiếu chuyển kho.');
    } catch (err) {
      console.error('Cancel error:', err);
      alert('Lỗi: ' + (err.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  // --- Open detail ---
  const openDetail = async (transfer) => {
    setSelectedTransfer(transfer);
    setShowDetailModal(true);
    try {
      const { data, error } = await supabase
        .from('warehouse_transfer_items')
        .select('*')
        .eq('transfer_id', transfer.id);
      if (error) throw error;
      setTransferItems(data || []);
    } catch (err) {
      console.error('Load transfer items error:', err);
      setTransferItems([]);
    }
  };

  const updateReceivedQty = (itemId, value) => {
    setTransferItems(prev =>
      prev.map(it => it.id === itemId ? { ...it, received_qty: parseInt(value) || 0 } : it)
    );
  };

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-800">Chuyển kho</h2>
        {hasPermission('warehouse', 2) && (
          <button
            onClick={() => { resetCreateForm(); setShowCreateModal(true); }}
            className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition font-medium shadow-sm"
          >
            + Tạo phiếu chuyển kho
          </button>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-amber-500">
          <div className="text-sm text-gray-500">Tổng phiếu</div>
          <div className="text-2xl font-bold text-amber-700">{stats.total}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-yellow-400">
          <div className="text-sm text-gray-500">Chờ xử lý</div>
          <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-400">
          <div className="text-sm text-gray-500">Đang vận chuyển</div>
          <div className="text-2xl font-bold text-blue-700">{stats.in_transit}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
          <div className="text-sm text-gray-500">Đã nhận</div>
          <div className="text-2xl font-bold text-green-700">{stats.received}</div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <input
          type="text"
          placeholder="Tìm kiếm theo mã phiếu, kho..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
        />
      </div>

      {/* Transfer list table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Mã phiếu</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ngày tạo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kho xuất → Kho nhận</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">SL sản phẩm</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    {searchTerm ? 'Không tìm thấy phiếu nào.' : 'Chưa có phiếu chuyển kho nào.'}
                  </td>
                </tr>
              ) : (
                filteredTransfers.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(t)}>
                    <td className="px-4 py-3 font-medium text-amber-700">{t.transfer_code || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {getWarehouseName(t.from_warehouse_id)} → {getWarehouseName(t.to_warehouse_id)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusColors[t.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[t.status] || t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">{t.total_items || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); openDetail(t); }}
                        className="text-amber-600 hover:text-amber-800 font-medium"
                      >
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========== CREATE MODAL ========== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b bg-amber-50 rounded-t-2xl">
              <h3 className="text-lg font-bold text-amber-800">Tạo phiếu chuyển kho</h3>
            </div>
            <div className="p-6 space-y-5">
              {/* Warehouse selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kho xuất <span className="text-red-500">*</span></label>
                  <select
                    value={fromWarehouseId}
                    onChange={e => {
                      setFromWarehouseId(e.target.value);
                      // Reset items when source changes
                      setFormItems([{ product_id: '', quantity: '' }]);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  >
                    <option value="">-- Chọn kho xuất --</option>
                    {(warehouses || []).map(wh => (
                      <option key={wh.id} value={wh.id}>{wh.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kho nhận <span className="text-red-500">*</span></label>
                  <select
                    value={toWarehouseId}
                    onChange={e => setToWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  >
                    <option value="">-- Chọn kho nhận --</option>
                    {(warehouses || []).filter(wh => String(wh.id) !== String(fromWarehouseId)).map(wh => (
                      <option key={wh.id} value={wh.id}>{wh.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {fromWarehouseId === toWarehouseId && fromWarehouseId && (
                <p className="text-red-500 text-sm">Kho xuất và kho nhận phải khác nhau!</p>
              )}

              {/* Product items */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sản phẩm chuyển kho</label>
                <div className="space-y-3">
                  {formItems.map((item, idx) => {
                    const maxStock = item.product_id ? getWarehouseQty(item.product_id, fromWarehouseId) : 0;
                    return (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="flex-1">
                          <select
                            value={item.product_id}
                            onChange={e => updateFormItem(idx, 'product_id', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                          >
                            <option value="">-- Chọn sản phẩm --</option>
                            {availableProducts.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} (Tồn: {getWarehouseQty(p.id, fromWarehouseId)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-28">
                          <input
                            type="number"
                            min="1"
                            max={maxStock}
                            placeholder="Số lượng"
                            value={item.quantity}
                            onChange={e => updateFormItem(idx, 'quantity', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                          />
                          {item.product_id && (
                            <div className="text-xs text-gray-400 mt-0.5">Tối đa: {maxStock}</div>
                          )}
                        </div>
                        <button
                          onClick={() => removeFormItem(idx)}
                          disabled={formItems.length <= 1}
                          className="mt-1 p-1.5 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Xóa dòng"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={addFormItem}
                  className="mt-2 text-sm text-amber-600 hover:text-amber-800 font-medium"
                >
                  + Thêm sản phẩm
                </button>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea
                  value={formNote}
                  onChange={e => setFormNote(e.target.value)}
                  rows={3}
                  placeholder="Ghi chú cho phiếu chuyển kho..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                />
              </div>

              {/* Summary */}
              <div className="bg-amber-50 rounded-lg p-3 text-sm">
                <span className="font-medium text-amber-800">Tổng số lượng: </span>
                <span className="text-amber-700 font-bold">{totalFormItems}</span>
              </div>
            </div>

            {/* Modal actions */}
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition"
              >
                Đóng
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-5 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition font-medium disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Tạo phiếu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== DETAIL MODAL ========== */}
      {showDetailModal && selectedTransfer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b bg-amber-50 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-amber-800">
                  Phiếu chuyển kho: {selectedTransfer.transfer_code}
                </h3>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[selectedTransfer.status] || 'bg-gray-100 text-gray-600'}`}>
                  {statusLabels[selectedTransfer.status] || selectedTransfer.status}
                </span>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Transfer info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">Ngày tạo</div>
                  <div className="font-medium">
                    {selectedTransfer.created_at ? new Date(selectedTransfer.created_at).toLocaleString('vi-VN') : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Người tạo</div>
                  <div className="font-medium">{selectedTransfer.created_by || '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500">Kho xuất</div>
                  <div className="font-medium text-red-600">{getWarehouseName(selectedTransfer.from_warehouse_id)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Kho nhận</div>
                  <div className="font-medium text-green-600">{getWarehouseName(selectedTransfer.to_warehouse_id)}</div>
                </div>
                {selectedTransfer.note && (
                  <div className="col-span-2">
                    <div className="text-gray-500">Ghi chú</div>
                    <div className="font-medium">{selectedTransfer.note}</div>
                  </div>
                )}
                {selectedTransfer.received_at && (
                  <div>
                    <div className="text-gray-500">Ngày nhận</div>
                    <div className="font-medium">{new Date(selectedTransfer.received_at).toLocaleString('vi-VN')}</div>
                  </div>
                )}
              </div>

              {/* Items table */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Danh sách sản phẩm</h4>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Sản phẩm</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">SL gửi</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">SL nhận</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">Chênh lệch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transferItems.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-4 text-gray-400">Đang tải...</td>
                        </tr>
                      ) : (
                        transferItems.map(item => {
                          const receivedQty = item.received_qty || 0;
                          const diff = receivedQty - item.sent_qty;
                          const isReceiving = selectedTransfer.status === 'in_transit';
                          return (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">{getProductName(item.product_id)}</td>
                              <td className="px-3 py-2 text-center font-medium">{item.sent_qty}</td>
                              <td className="px-3 py-2 text-center">
                                {isReceiving ? (
                                  <input
                                    type="number"
                                    min="0"
                                    max={item.sent_qty}
                                    value={item.received_qty || item.sent_qty}
                                    onChange={e => updateReceivedQty(item.id, e.target.value)}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-center text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                                  />
                                ) : (
                                  <span className="font-medium">{receivedQty}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {selectedTransfer.status === 'received' ? (
                                  <span className={`font-medium ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                    {diff === 0 ? '0' : (diff > 0 ? `+${diff}` : diff)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="p-6 border-t flex flex-wrap justify-end gap-3">
              {/* Cancel button for pending or in_transit */}
              {canEdit('warehouse') && (selectedTransfer.status === 'pending' || selectedTransfer.status === 'in_transit') && (
                <button
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition font-medium disabled:opacity-50"
                >
                  {actionLoading ? 'Đang xử lý...' : 'Hủy phiếu'}
                </button>
              )}

              {/* Confirm transit for pending */}
              {hasPermission('warehouse', 2) && selectedTransfer.status === 'pending' && (
                <button
                  onClick={handleConfirmTransit}
                  disabled={actionLoading}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium disabled:opacity-50"
                >
                  {actionLoading ? 'Đang xử lý...' : 'Xác nhận xuất kho'}
                </button>
              )}

              {/* Receive for in_transit */}
              {hasPermission('warehouse', 2) && selectedTransfer.status === 'in_transit' && (
                <button
                  onClick={handleReceive}
                  disabled={actionLoading}
                  className="px-5 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-medium disabled:opacity-50"
                >
                  {actionLoading ? 'Đang xử lý...' : 'Xác nhận nhận hàng'}
                </button>
              )}

              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

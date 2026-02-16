import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { getNowISOVN, getDateStrVN } from '../../utils/dateUtils';

export default function WarehousesView({ warehouses, warehouseStock, products, loadWarehouseData, tenant, currentUser, canEdit }) {
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formManager, setFormManager] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);

  // Transfer state
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferProduct, setTransferProduct] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferSearch, setTransferSearch] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const resetForm = () => {
    setFormName(''); setFormCode(''); setFormAddress(''); setFormPhone(''); setFormManager(''); setFormIsDefault(false);
  };

  const fillForm = (w) => {
    setFormName(w.name || ''); setFormCode(w.code || ''); setFormAddress(w.address || '');
    setFormPhone(w.phone || ''); setFormManager(w.manager || ''); setFormIsDefault(w.is_default || false);
  };

  // ---- Stock per warehouse ----
  const getWarehouseStats = (warehouseId) => {
    const stocks = warehouseStock.filter(ws => ws.warehouse_id === warehouseId);
    const productCount = stocks.filter(ws => ws.quantity > 0).length;
    const totalQty = stocks.reduce((s, ws) => s + (ws.quantity || 0), 0);
    const totalValue = stocks.reduce((s, ws) => {
      const prod = (products || []).find(p => p.id === ws.product_id);
      return s + (ws.quantity || 0) * parseFloat(prod?.import_price || 0);
    }, 0);
    return { productCount, totalQty, totalValue };
  };

  // ---- Stats ----
  const stats = useMemo(() => {
    const totalProducts = new Set(warehouseStock.filter(ws => ws.quantity > 0).map(ws => ws.product_id)).size;
    const totalQty = warehouseStock.reduce((s, ws) => s + (ws.quantity || 0), 0);
    const totalValue = warehouseStock.reduce((s, ws) => {
      const prod = (products || []).find(p => p.id === ws.product_id);
      return s + (ws.quantity || 0) * parseFloat(prod?.import_price || 0);
    }, 0);
    return { warehouseCount: warehouses.length, totalProducts, totalQty, totalValue };
  }, [warehouses, warehouseStock, products]);

  // ---- Filtered warehouses ----
  const filtered = useMemo(() => {
    if (!search.trim()) return warehouses;
    const q = search.toLowerCase();
    return warehouses.filter(w =>
      (w.name || '').toLowerCase().includes(q) || (w.code || '').toLowerCase().includes(q) || (w.address || '').toLowerCase().includes(q)
    );
  }, [warehouses, search]);

  // ---- CRUD ----
  const handleCreate = async () => {
    if (!canEdit('warehouse')) { alert('Bạn không có quyền tạo kho'); return; }
    if (!formName.trim()) return alert('Vui lòng nhập tên kho');
    if (submitting) return;
    setSubmitting(true);
    try {
      if (formIsDefault) {
        await supabase.from('warehouses').update({ is_default: false }).eq('tenant_id', tenant.id).eq('is_default', true);
      }
      const { error } = await supabase.from('warehouses').insert([{
        tenant_id: tenant.id, name: formName.trim(), code: formCode.trim(),
        address: formAddress.trim(), phone: formPhone.trim(), manager: formManager.trim(),
        is_default: formIsDefault, created_by: currentUser.name
      }]);
      if (error) throw error;
      showToast('Đã tạo kho mới!');
      setShowCreateModal(false); resetForm();
      await loadWarehouseData();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); } finally { setSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (!canEdit('warehouse')) { alert('Bạn không có quyền chỉnh sửa kho'); return; }
    if (!formName.trim() || !selectedWarehouse || submitting) return;
    setSubmitting(true);
    try {
      if (formIsDefault && !selectedWarehouse.is_default) {
        await supabase.from('warehouses').update({ is_default: false }).eq('tenant_id', tenant.id).eq('is_default', true);
      }
      const { error } = await supabase.from('warehouses').update({
        name: formName.trim(), code: formCode.trim(), address: formAddress.trim(),
        phone: formPhone.trim(), manager: formManager.trim(), is_default: formIsDefault,
        updated_at: getNowISOVN()
      }).eq('id', selectedWarehouse.id);
      if (error) throw error;
      showToast('Đã cập nhật!');
      setEditMode(false);
      setSelectedWarehouse(prev => ({ ...prev, name: formName.trim(), code: formCode.trim(), address: formAddress.trim(), phone: formPhone.trim(), manager: formManager.trim(), is_default: formIsDefault }));
      await loadWarehouseData();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!canEdit('warehouse')) { alert('Bạn không có quyền xóa kho'); return; }
    const s = getWarehouseStats(id);
    if (s.totalQty > 0) return alert('Không thể xóa kho còn hàng. Vui lòng chuyển hết hàng sang kho khác trước.');
    const wh = warehouses.find(w => w.id === id);
    if (wh?.is_default) return alert('Không thể xóa kho mặc định. Vui lòng đặt kho khác làm mặc định trước.');
    if (!window.confirm('Xóa kho này?')) return;
    try {
      await supabase.from('warehouses').update({ is_active: false, updated_at: getNowISOVN() }).eq('id', id);
      showToast('Đã xóa kho!');
      setShowDetailModal(false); setSelectedWarehouse(null);
      await loadWarehouseData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  // ---- Transfer stock ----
  const transferableProducts = useMemo(() => {
    if (!transferFrom) return [];
    const stocks = warehouseStock.filter(ws => ws.warehouse_id === transferFrom && ws.quantity > 0);
    return stocks.map(ws => {
      const prod = (products || []).find(p => p.id === ws.product_id);
      return prod ? { ...prod, available: ws.quantity } : null;
    }).filter(Boolean);
  }, [transferFrom, warehouseStock, products]);

  const filteredTransferProducts = useMemo(() => {
    if (!transferSearch.trim()) return transferableProducts;
    const q = transferSearch.toLowerCase();
    return transferableProducts.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }, [transferableProducts, transferSearch]);

  const selectedTransferProduct = transferableProducts.find(p => p.id === transferProduct);

  const handleTransfer = async () => {
    if (!transferFrom || !transferTo || !transferProduct || !transferQty) return alert('Vui lòng điền đầy đủ thông tin');
    const qty = parseInt(transferQty);
    if (qty <= 0) return alert('Số lượng phải lớn hơn 0');
    if (selectedTransferProduct && qty > selectedTransferProduct.available) return alert(`Tồn kho chỉ có ${selectedTransferProduct.available}`);
    if (submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('transfer_stock', {
        p_from_warehouse_id: transferFrom,
        p_to_warehouse_id: transferTo,
        p_product_id: transferProduct,
        p_quantity: qty
      });
      if (error) throw error;

      const fromName = warehouses.find(w => w.id === transferFrom)?.name || '';
      const toName = warehouses.find(w => w.id === transferTo)?.name || '';
      const prodName = selectedTransferProduct?.name || '';
      const dateStr = getDateStrVN();
      const txNum = `CK-${dateStr}-${String(Math.floor(Math.random() * 900) + 100)}`;

      await supabase.from('stock_transactions').insert([{
        tenant_id: tenant.id, transaction_number: txNum, type: 'transfer',
        transaction_date: dateStr, warehouse_id: transferFrom, transfer_to_warehouse_id: transferTo,
        total_amount: 0, note: `Chuyển kho: ${fromName} → ${toName} - ${prodName} x${qty}`,
        status: 'completed', created_by: currentUser.name
      }]);

      showToast(`Đã chuyển ${qty} ${prodName} từ ${fromName} → ${toName}`);
      setTransferProduct(''); setTransferQty(''); setTransferSearch('');
      await loadWarehouseData();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); } finally { setSubmitting(false); }
  };

  // ---- Detail: stock list for warehouse ----
  const warehouseProducts = useMemo(() => {
    if (!selectedWarehouse) return [];
    return warehouseStock
      .filter(ws => ws.warehouse_id === selectedWarehouse.id && ws.quantity > 0)
      .map(ws => {
        const prod = (products || []).find(p => p.id === ws.product_id);
        return prod ? { ...ws, product: prod } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.quantity - a.quantity);
  }, [selectedWarehouse, warehouseStock, products]);

  // ---- Form fields (rendered inline to prevent input focus loss) ----
  const formFieldsJsx = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên kho *</label>
          <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="VD: Kho chính"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mã kho</label>
          <input value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="VD: KHO01"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
        <input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="Số nhà, đường, quận..."
          className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
          <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="0901234567"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Người quản lý</label>
          <input value={formManager} onChange={e => setFormManager(e.target.value)} placeholder="Tên người quản lý"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={formIsDefault} onChange={e => setFormIsDefault(e.target.checked)} className="w-4 h-4 rounded text-green-600" />
        <span className="text-sm">Đặt làm kho mặc định</span>
      </label>
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">🏭 Quản Lý Kho</h2>
          <p className="text-sm text-gray-500">{warehouses.length} kho hàng</p>
        </div>
        <div className="flex gap-2">
          {canEdit('warehouse') && (
            <button onClick={() => { setTransferFrom(''); setTransferTo(''); setTransferProduct(''); setTransferQty(''); setTransferSearch(''); setShowTransferModal(true); }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm">
              🔄 Chuyển kho
            </button>
          )}
          {canEdit('warehouse') && (
            <button onClick={() => { resetForm(); setShowCreateModal(true); }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm">
              + Thêm kho
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-amber-50 p-3 rounded-xl text-center border border-amber-200">
          <div className="text-2xl font-bold text-amber-700">{stats.warehouseCount}</div>
          <div className="text-xs text-gray-600">Kho hàng</div>
        </div>
        <div className="bg-blue-50 p-3 rounded-xl text-center border border-blue-200">
          <div className="text-2xl font-bold text-blue-700">{stats.totalProducts}</div>
          <div className="text-xs text-gray-600">Sản phẩm</div>
        </div>
        <div className="bg-green-50 p-3 rounded-xl text-center border border-green-200">
          <div className="text-2xl font-bold text-green-700">{stats.totalQty.toLocaleString()}</div>
          <div className="text-xs text-gray-600">Tổng tồn kho</div>
        </div>
        <div className="bg-purple-50 p-3 rounded-xl text-center border border-purple-200">
          <div className="text-lg font-bold text-purple-700">{formatMoney(stats.totalValue)}</div>
          <div className="text-xs text-gray-600">Giá trị tồn</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kho theo tên, mã, địa chỉ..."
          className="w-full border rounded-lg px-4 py-2.5 text-sm pl-10" />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
      </div>

      {/* Warehouse list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">🏭</div><p>Chưa có kho hàng</p></div>
        ) : filtered.map(w => {
          const s = getWarehouseStats(w.id);
          return (
            <div key={w.id} onClick={() => { setSelectedWarehouse(w); fillForm(w); setEditMode(false); setShowDetailModal(true); }}
              className="bg-white rounded-xl border p-4 hover:shadow-md cursor-pointer transition-shadow">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{w.name}</span>
                    {w.code && <span className="text-xs font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{w.code}</span>}
                    {w.is_default && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Mặc định</span>}
                  </div>
                  {w.address && <div className="text-sm text-gray-500 mt-1">📍 {w.address}</div>}
                  <div className="text-xs text-gray-400 mt-1 flex gap-3">
                    {w.phone && <span>📱 {w.phone}</span>}
                    {w.manager && <span>👤 {w.manager}</span>}
                  </div>
                </div>
                <div className="text-right ml-4 flex-shrink-0">
                  <div className="text-sm font-medium text-gray-900">{s.productCount} SP</div>
                  <div className="text-sm text-green-600 font-bold">{s.totalQty.toLocaleString()} đơn vị</div>
                  <div className="text-xs text-gray-500">{formatMoney(s.totalValue)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ====== CREATE MODAL ====== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Thêm kho mới</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {formFieldsJsx}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Hủy</button>
              <button onClick={handleCreate} disabled={submitting}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white ${submitting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
                {submitting ? 'Đang tạo...' : 'Tạo kho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== DETAIL MODAL ====== */}
      {showDetailModal && selectedWarehouse && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full my-4">
            <div className="p-4 border-b bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-t-xl flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{selectedWarehouse.name}</h3>
                  {selectedWarehouse.is_default && <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Mặc định</span>}
                </div>
                <div className="text-sm text-amber-100 flex gap-3">
                  {selectedWarehouse.code && <span>{selectedWarehouse.code}</span>}
                  {selectedWarehouse.address && <span>📍 {selectedWarehouse.address}</span>}
                </div>
              </div>
              <button onClick={() => { setShowDetailModal(false); setSelectedWarehouse(null); }} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            <div className="p-4 space-y-4">
              {/* Stats */}
              {(() => {
                const s = getWarehouseStats(selectedWarehouse.id);
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-50 p-3 rounded-lg text-center">
                      <div className="text-lg font-bold text-blue-700">{s.productCount}</div>
                      <div className="text-xs text-gray-600">Sản phẩm</div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg text-center">
                      <div className="text-lg font-bold text-green-700">{s.totalQty.toLocaleString()}</div>
                      <div className="text-xs text-gray-600">Tổng tồn</div>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg text-center">
                      <div className="text-lg font-bold text-purple-700">{formatMoney(s.totalValue)}</div>
                      <div className="text-xs text-gray-600">Giá trị</div>
                    </div>
                  </div>
                );
              })()}

              {/* Edit form or info */}
              {editMode ? (
                <>
                  {formFieldsJsx}
                  <div className="flex gap-2">
                    <button onClick={() => { setEditMode(false); fillForm(selectedWarehouse); }} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Hủy</button>
                    <button onClick={handleUpdate} disabled={submitting}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white ${submitting ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                      {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                    {selectedWarehouse.phone && <div><span className="text-gray-500">SĐT:</span> {selectedWarehouse.phone}</div>}
                    {selectedWarehouse.manager && <div><span className="text-gray-500">Quản lý:</span> {selectedWarehouse.manager}</div>}
                    {selectedWarehouse.address && <div><span className="text-gray-500">Địa chỉ:</span> {selectedWarehouse.address}</div>}
                  </div>
                  {canEdit('warehouse') && (
                    <div className="flex gap-2">
                      <button onClick={() => setEditMode(true)} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">✏️ Sửa</button>
                      <button onClick={() => handleDelete(selectedWarehouse.id)} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium">🗑️ Xóa</button>
                    </div>
                  )}
                </>
              )}

              {/* Products in warehouse */}
              <div>
                <h4 className="font-bold text-sm mb-2">Sản phẩm trong kho ({warehouseProducts.length})</h4>
                {warehouseProducts.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Chưa có sản phẩm trong kho này</p>
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {warehouseProducts.map(ws => (
                      <div key={ws.id} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-lg text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{ws.product?.name}</div>
                          <div className="text-xs text-gray-500">{ws.product?.sku} • {ws.product?.category || ''}</div>
                        </div>
                        <div className="text-right ml-3">
                          <div className="font-bold">{ws.quantity} {ws.product?.unit || ''}</div>
                          <div className="text-xs text-gray-500">{formatMoney(ws.quantity * parseFloat(ws.product?.import_price || 0))}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== TRANSFER MODAL ====== */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">🔄 Chuyển kho</h3>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Từ kho *</label>
                  <select value={transferFrom} onChange={e => { setTransferFrom(e.target.value); setTransferProduct(''); setTransferQty(''); }}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Chọn kho nguồn</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} {w.is_default ? '(MĐ)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đến kho *</label>
                  <select value={transferTo} onChange={e => setTransferTo(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Chọn kho đích</option>
                    {warehouses.filter(w => w.id !== transferFrom).map(w => <option key={w.id} value={w.id}>{w.name} {w.is_default ? '(MĐ)' : ''}</option>)}
                  </select>
                </div>
              </div>

              {transferFrom && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sản phẩm *</label>
                  <input value={transferSearch} onChange={e => setTransferSearch(e.target.value)}
                    placeholder="Tìm sản phẩm..." className="w-full border rounded-lg px-3 py-2 text-sm mb-1" />
                  {transferProduct ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2 flex justify-between items-center">
                      <div className="text-sm font-medium">{selectedTransferProduct?.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Tồn: {selectedTransferProduct?.available}</span>
                        <button onClick={() => { setTransferProduct(''); setTransferQty(''); }} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto border rounded-lg">
                      {filteredTransferProducts.length === 0 ? (
                        <p className="p-3 text-sm text-gray-400 text-center">Không có sản phẩm khả dụng</p>
                      ) : filteredTransferProducts.map(p => (
                        <button key={p.id} onClick={() => { setTransferProduct(p.id); setTransferSearch(''); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex justify-between border-b last:border-0">
                          <div>
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-gray-500">{p.sku || ''}</div>
                          </div>
                          <span className="text-xs text-gray-500 self-center">Tồn: {p.available}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {transferProduct && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng chuyển *</label>
                  <input type="number" min="1" max={selectedTransferProduct?.available || 0}
                    value={transferQty} onChange={e => setTransferQty(e.target.value)}
                    placeholder={`Tối đa: ${selectedTransferProduct?.available || 0}`}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowTransferModal(false)} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Hủy</button>
              <button onClick={handleTransfer} disabled={submitting || !transferFrom || !transferTo || !transferProduct || !transferQty}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white ${submitting || !transferProduct ? 'bg-gray-400' : 'bg-purple-600 hover:bg-purple-700'}`}>
                {submitting ? 'Đang chuyển...' : 'Chuyển kho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {toast.type === 'error' ? '❌' : '✅'} {toast.msg}
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { getTodayVN, getDateStrVN, getNowISOVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';
import { calculateWAC } from '../../utils/wacUtils';

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

const STATUS_MAP = {
  draft: { label: 'Nháp', color: 'bg-gray-100 text-gray-700' },
  confirmed: { label: 'Đã xác nhận', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Đã huỷ', color: 'bg-red-100 text-red-700' },
};

export default function SupplierReturnView({
  supplierReturns, supplierReturnItems, suppliers, products,
  purchaseOrders, purchaseOrderItems, warehouses, warehouseStock,
  loadWarehouseData, tenant, currentUser, hasPermission, canEdit
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formPoId, setFormPoId] = useState('');
  const [formReturnDate, setFormReturnDate] = useState(getTodayVN());
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState([{ product_id: '', quantity: 1, unit_price: 0, reason: '', warehouse_id: '' }]);

  // Derived data
  const returnsWithItems = useMemo(() => {
    return (supplierReturns || []).map(r => ({
      ...r,
      items: (supplierReturnItems || []).filter(i => i.return_id === r.id),
      supplier: (suppliers || []).find(s => s.id === r.supplier_id)
    }));
  }, [supplierReturns, supplierReturnItems, suppliers]);

  const filteredReturns = useMemo(() => {
    let result = returnsWithItems;
    if (filterStatus !== 'all') result = result.filter(r => r.status === filterStatus);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.return_number?.toLowerCase().includes(term) ||
        r.supplier?.name?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [returnsWithItems, filterStatus, searchTerm]);

  const stats = useMemo(() => ({
    total: (supplierReturns || []).length,
    draft: (supplierReturns || []).filter(r => r.status === 'draft').length,
    confirmed: (supplierReturns || []).filter(r => r.status === 'confirmed').length,
    totalAmount: (supplierReturns || []).filter(r => r.status !== 'cancelled').reduce((s, r) => s + Number(r.total_amount || 0), 0),
  }), [supplierReturns]);

  // POs for selected supplier
  const supplierPOs = useMemo(() => {
    if (!formSupplierId) return [];
    return (purchaseOrders || []).filter(po => po.supplier_id === formSupplierId && po.status !== 'cancelled');
  }, [formSupplierId, purchaseOrders]);

  const generateReturnNumber = async () => {
    const dateStr = getDateStrVN();
    const { count } = await supabase
      .from('supplier_returns')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .like('return_number', `RTN-${dateStr}%`);
    return `RTN-${dateStr}-${String((count || 0) + 1).padStart(3, '0')}`;
  };

  const resetForm = () => {
    setFormSupplierId(''); setFormPoId(''); setFormReturnDate(getTodayVN());
    setFormReason(''); setFormNotes('');
    setFormItems([{ product_id: '', quantity: 1, unit_price: 0, reason: '', warehouse_id: '' }]);
    setIsEditing(false);
  };

  const openCreate = () => { resetForm(); setShowCreateModal(true); };

  const openEdit = (ret) => {
    setIsEditing(true);
    setSelectedReturn(ret);
    setFormSupplierId(ret.supplier_id);
    setFormPoId(ret.po_id || '');
    setFormReturnDate(ret.return_date || getTodayVN());
    setFormReason(ret.reason || '');
    setFormNotes(ret.notes || '');
    const items = (supplierReturnItems || []).filter(i => i.return_id === ret.id);
    setFormItems(items.length > 0 ? items.map(i => ({
      product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price || 0,
      reason: i.reason || '', warehouse_id: i.warehouse_id || ''
    })) : [{ product_id: '', quantity: 1, unit_price: 0, reason: '', warehouse_id: '' }]);
    setShowCreateModal(true);
  };

  const openDetail = (ret) => { setSelectedReturn(ret); setShowDetailModal(true); };

  // Add/remove items
  const addItem = () => setFormItems([...formItems, { product_id: '', quantity: 1, unit_price: 0, reason: '', warehouse_id: '' }]);
  const removeItem = (idx) => formItems.length > 1 && setFormItems(formItems.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) => {
    const updated = [...formItems];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === 'product_id' && value) {
      const product = products.find(p => p.id === value);
      if (product) updated[idx].unit_price = product.avg_cost || product.import_price || 0;
    }
    setFormItems(updated);
  };

  const formTotal = formItems.reduce((s, i) => s + (i.quantity * i.unit_price), 0);

  // Save
  const handleSave = async () => {
    if (!formSupplierId) { alert('Vui lòng chọn NCC!'); return; }
    const validItems = formItems.filter(i => i.product_id && i.quantity > 0);
    if (validItems.length === 0) { alert('Thêm ít nhất 1 sản phẩm!'); return; }
    setSaving(true);
    try {
      const totalAmount = validItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      if (isEditing && selectedReturn) {
        // Update
        await supabase.from('supplier_returns').update({
          supplier_id: formSupplierId, po_id: formPoId || null,
          return_date: formReturnDate, reason: formReason, notes: formNotes,
          total_amount: totalAmount, updated_at: getNowISOVN()
        }).eq('id', selectedReturn.id);
        await supabase.from('supplier_return_items').delete().eq('return_id', selectedReturn.id);
        await supabase.from('supplier_return_items').insert(validItems.map(i => ({
          return_id: selectedReturn.id, product_id: i.product_id,
          quantity: i.quantity, unit_price: i.unit_price,
          reason: i.reason || null, warehouse_id: i.warehouse_id || null
        })));
        logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'supplier_return', entityId: selectedReturn.id, entityName: selectedReturn.return_number, description: `Cập nhật phiếu trả NCC ${selectedReturn.return_number}` });
      } else {
        // Create
        const returnNumber = await generateReturnNumber();
        const { data: newReturn, error } = await supabase.from('supplier_returns').insert([{
          tenant_id: tenant.id, return_number: returnNumber,
          supplier_id: formSupplierId, po_id: formPoId || null,
          return_date: formReturnDate, reason: formReason, notes: formNotes,
          total_amount: totalAmount, status: 'draft',
          created_by: currentUser.id
        }]).select().single();
        if (error) throw error;
        await supabase.from('supplier_return_items').insert(validItems.map(i => ({
          return_id: newReturn.id, product_id: i.product_id,
          quantity: i.quantity, unit_price: i.unit_price,
          reason: i.reason || null, warehouse_id: i.warehouse_id || null
        })));
        logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'create', entityType: 'supplier_return', entityId: newReturn.id, entityName: returnNumber, description: `Tạo phiếu trả NCC ${returnNumber}` });
      }
      setShowCreateModal(false); resetForm(); loadWarehouseData();
    } catch (error) { alert('Lỗi: ' + error.message); } finally { setSaving(false); }
  };

  // Confirm: deduct stock + reverse WAC
  const handleConfirm = async (ret) => {
    if (!window.confirm('Xác nhận phiếu trả hàng? Tồn kho sẽ giảm.')) return;
    setSaving(true);
    try {
      const items = (supplierReturnItems || []).filter(i => i.return_id === ret.id);
      // 1. Deduct stock per item
      for (const item of items) {
        const whId = item.warehouse_id || (warehouses || []).find(w => w.is_default)?.id;
        if (whId) {
          const { error } = await supabase.rpc('adjust_warehouse_stock', {
            p_warehouse_id: whId, p_product_id: item.product_id, p_delta: -item.quantity
          });
          if (error) throw error;
        }
      }
      // 2. Create stock_transaction
      const supplier = (suppliers || []).find(s => s.id === ret.supplier_id);
      const { data: txData } = await supabase.from('stock_transactions').insert([{
        tenant_id: tenant.id, transaction_number: `EXP-RTN-${Date.now()}`,
        type: 'export', transaction_date: getTodayVN(),
        partner_name: supplier?.name || 'NCC', supplier_id: ret.supplier_id,
        total_amount: Number(ret.total_amount || 0),
        note: `Trả hàng NCC - ${ret.return_number}`,
        status: 'completed', created_by: currentUser.name,
        warehouse_id: items[0]?.warehouse_id || null
      }]).select().single();
      // 3. Create stock_transaction_items
      if (txData) {
        await supabase.from('stock_transaction_items').insert(items.map(i => ({
          transaction_id: txData.id, product_id: i.product_id,
          quantity: i.quantity, unit_price: i.unit_price || 0
        })));
      }
      // 4. Reverse WAC per product
      for (const item of items) {
        const product = products.find(p => p.id === item.product_id);
        if (!product) continue;
        const currentStock = product.stock_quantity || 0;
        const currentAvg = product.avg_cost || 0;
        const returnQty = item.quantity;
        const returnPrice = item.unit_price || 0;
        const newStock = currentStock - returnQty;
        let newAvg = currentAvg;
        if (newStock > 0) {
          newAvg = ((currentStock * currentAvg) - (returnQty * returnPrice)) / newStock;
          if (newAvg < 0) newAvg = currentAvg; // safety
        }
        await supabase.from('products').update({
          avg_cost: Math.round(newAvg), updated_at: getNowISOVN()
        }).eq('id', product.id);
        // Insert cost_price_history
        await supabase.from('cost_price_history').insert([{
          tenant_id: tenant.id, product_id: product.id,
          old_avg_cost: currentAvg, new_avg_cost: Math.round(newAvg),
          quantity: -returnQty, unit_price: returnPrice,
          transaction_type: 'supplier_return', reference_id: ret.id,
          note: `Trả NCC - ${ret.return_number}`
        }]);
      }
      // 5. Update status
      await supabase.from('supplier_returns').update({
        status: 'confirmed', updated_at: getNowISOVN()
      }).eq('id', ret.id);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'supplier_return', entityId: ret.id, entityName: ret.return_number, description: `Xác nhận phiếu trả NCC ${ret.return_number} - Giảm tồn kho` });
      loadWarehouseData();
    } catch (error) { alert('Lỗi: ' + error.message); } finally { setSaving(false); }
  };

  const handleComplete = async (ret) => {
    if (!window.confirm('Hoàn thành phiếu trả hàng?')) return;
    try {
      await supabase.from('supplier_returns').update({
        status: 'completed', updated_at: getNowISOVN()
      }).eq('id', ret.id);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'supplier_return', entityId: ret.id, entityName: ret.return_number, description: `Hoàn thành phiếu trả NCC ${ret.return_number}` });
      loadWarehouseData();
    } catch (error) { alert('Lỗi: ' + error.message); }
  };

  const handleCancel = async (ret) => {
    if (!window.confirm('Huỷ phiếu trả hàng?')) return;
    try {
      await supabase.from('supplier_returns').update({
        status: 'cancelled', updated_at: getNowISOVN()
      }).eq('id', ret.id);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'supplier_return', entityId: ret.id, entityName: ret.return_number, description: `Huỷ phiếu trả NCC ${ret.return_number}` });
      loadWarehouseData();
    } catch (error) { alert('Lỗi: ' + error.message); }
  };

  if (!hasPermission('warehouse', 1)) {
    return (
      <div className="p-8 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-red-800">Không có quyền truy cập</h2>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-gray-600 text-sm">Tổng phiếu</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-gray-400">
          <div className="text-2xl font-bold text-gray-600">{stats.draft}</div>
          <div className="text-gray-600 text-sm">Nháp</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-400">
          <div className="text-2xl font-bold text-blue-600">{stats.confirmed}</div>
          <div className="text-gray-600 text-sm">Đã xác nhận</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-orange-500">
          <div className="text-2xl font-bold text-orange-600">{formatMoney(stats.totalAmount)}</div>
          <div className="text-gray-600 text-sm">Tổng giá trị</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {hasPermission('warehouse', 2) && (
            <button onClick={openCreate} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium text-sm">
              ↩️ Tạo Phiếu Trả
            </button>
          )}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="all">Tất cả</option>
            <option value="draft">Nháp</option>
            <option value="confirmed">Đã xác nhận</option>
            <option value="completed">Hoàn thành</option>
            <option value="cancelled">Đã huỷ</option>
          </select>
        </div>
        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm theo mã phiếu, NCC..." className="px-3 py-2 border rounded-lg text-sm w-full sm:w-64" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Mã phiếu</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">NCC</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 hidden md:table-cell">Ngày trả</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Tổng tiền</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredReturns.length === 0 ? (
                <tr><td colSpan="6" className="px-4 py-12 text-center text-gray-500">
                  <div className="text-4xl mb-2">↩️</div>Chưa có phiếu trả hàng
                </td></tr>
              ) : filteredReturns.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(r)}>
                  <td className="px-4 py-3 font-mono text-orange-600 font-medium">{r.return_number}</td>
                  <td className="px-4 py-3">{r.supplier?.name || 'N/A'}</td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">{r.return_date}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(r.total_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_MAP[r.status]?.color || 'bg-gray-100'}`}>
                      {STATUS_MAP[r.status]?.label || r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-center gap-1">
                      {r.status === 'draft' && hasPermission('warehouse', 2) && (
                        <>
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-amber-100 rounded text-amber-600" title="Sửa">✏️</button>
                          <button onClick={() => handleConfirm(r)} disabled={saving} className="p-1.5 hover:bg-blue-100 rounded text-blue-600" title="Xác nhận">✅</button>
                          <button onClick={() => handleCancel(r)} className="p-1.5 hover:bg-red-100 rounded text-red-600" title="Huỷ">❌</button>
                        </>
                      )}
                      {r.status === 'confirmed' && hasPermission('warehouse', 2) && (
                        <>
                          <button onClick={() => handleComplete(r)} className="p-1.5 hover:bg-green-100 rounded text-green-600" title="Hoàn thành">🏁</button>
                          <button onClick={() => handleCancel(r)} className="p-1.5 hover:bg-red-100 rounded text-red-600" title="Huỷ">❌</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold">↩️ {isEditing ? 'Sửa' : 'Tạo'} Phiếu Trả Hàng NCC</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp *</label>
                  <select value={formSupplierId} onChange={(e) => { setFormSupplierId(e.target.value); setFormPoId(''); }}
                    className="w-full px-3 py-2 border rounded-lg">
                    <option value="">-- Chọn NCC --</option>
                    {(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn mua liên quan</label>
                  <select value={formPoId} onChange={(e) => setFormPoId(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">-- Không chọn --</option>
                    {supplierPOs.map(po => <option key={po.id} value={po.id}>{po.po_number} - {formatMoney(po.total_amount)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày trả</label>
                  <input type="date" value={formReturnDate} onChange={(e) => setFormReturnDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lý do chung</label>
                  <input type="text" value={formReason} onChange={(e) => setFormReason(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="VD: Hàng lỗi, sai model..." />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-semibold text-gray-700">Sản phẩm trả</label>
                  <button onClick={addItem} className="text-sm text-orange-600 hover:text-orange-700">+ Thêm SP</button>
                </div>
                <div className="space-y-2">
                  {formItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-gray-50 p-3 rounded-lg">
                      <div className="col-span-12 md:col-span-3">
                        <label className="text-xs text-gray-500">Sản phẩm</label>
                        <select value={item.product_id} onChange={(e) => updateItem(idx, 'product_id', e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm">
                          <option value="">-- Chọn --</option>
                          {(products || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="text-xs text-gray-500">SL trả</label>
                        <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)} className="w-full px-2 py-1.5 border rounded text-sm" />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="text-xs text-gray-500">Đơn giá</label>
                        <input type="number" min="0" value={item.unit_price} onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 border rounded text-sm" />
                      </div>
                      <div className="col-span-12 md:col-span-2">
                        <label className="text-xs text-gray-500">Kho xuất</label>
                        <select value={item.warehouse_id} onChange={(e) => updateItem(idx, 'warehouse_id', e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm">
                          <option value="">-- Kho --</option>
                          {(warehouses || []).filter(w => w.is_active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-10 md:col-span-2">
                        <label className="text-xs text-gray-500">Lý do</label>
                        <input type="text" value={item.reason} onChange={(e) => updateItem(idx, 'reason', e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="Lỗi..." />
                      </div>
                      <div className="col-span-2 md:col-span-1 flex justify-end">
                        {formItems.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Xóa">🗑️</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-right font-semibold text-lg">
                  Tổng: <span className="text-orange-600">{formatMoney(formTotal)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg" />
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3 justify-end sticky bottom-0">
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Hủy</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium disabled:opacity-50">
                {saving ? 'Đang lưu...' : isEditing ? '💾 Cập nhật' : '💾 Tạo phiếu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedReturn && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">↩️ Chi Tiết Phiếu Trả</h2>
                  <p className="text-orange-600 font-mono mt-1">{selectedReturn.return_number}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_MAP[selectedReturn.status]?.color}`}>
                  {STATUS_MAP[selectedReturn.status]?.label}
                </span>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">NCC:</span> <span className="font-medium">{selectedReturn.supplier?.name}</span></div>
                <div><span className="text-gray-500">Ngày trả:</span> <span className="font-medium">{selectedReturn.return_date}</span></div>
                {selectedReturn.reason && <div className="col-span-2"><span className="text-gray-500">Lý do:</span> <span className="font-medium">{selectedReturn.reason}</span></div>}
                {selectedReturn.notes && <div className="col-span-2"><span className="text-gray-500">Ghi chú:</span> <span className="font-medium">{selectedReturn.notes}</span></div>}
              </div>
              <div className="bg-gray-50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Sản phẩm</th>
                      <th className="px-3 py-2 text-right">SL</th>
                      <th className="px-3 py-2 text-right">Đơn giá</th>
                      <th className="px-3 py-2 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(selectedReturn.items || []).map(item => {
                      const product = products.find(p => p.id === item.product_id);
                      return (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{product?.name || 'N/A'}{item.reason && <div className="text-xs text-gray-400">{item.reason}</div>}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(item.unit_price)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatMoney(item.quantity * item.unit_price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-orange-50">
                    <tr>
                      <td colSpan="3" className="px-3 py-2 text-right font-bold">Tổng cộng:</td>
                      <td className="px-3 py-2 text-right font-bold text-orange-600">{formatMoney(selectedReturn.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end">
              <button onClick={() => setShowDetailModal(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

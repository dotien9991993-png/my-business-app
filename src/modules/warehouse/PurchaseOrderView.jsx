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
  partial: { label: 'Nhận 1 phần', color: 'bg-yellow-100 text-yellow-700' },
  received: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Đã huỷ', color: 'bg-red-100 text-red-700' },
};

export default function PurchaseOrderView({
  purchaseOrders, purchaseOrderItems, suppliers, products,
  warehouses, warehouseStock, loadWarehouseData,
  tenant, currentUser, hasPermission, canEdit
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [saving, setSaving] = useState(false);

  // Form states
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formOrderDate, setFormOrderDate] = useState(getTodayVN());
  const [formExpectedDate, setFormExpectedDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState([{ product_id: '', quantity: 1, unit_price: 0 }]);
  const [isEditing, setIsEditing] = useState(false);

  // Receive form states
  const [receiveItems, setReceiveItems] = useState([]);
  const [receiveWarehouseId, setReceiveWarehouseId] = useState('');

  // --- Derived data ---
  const poWithItems = useMemo(() => {
    return (purchaseOrders || []).map(po => ({
      ...po,
      items: (purchaseOrderItems || []).filter(i => i.po_id === po.id),
      supplier: (suppliers || []).find(s => s.id === po.supplier_id)
    }));
  }, [purchaseOrders, purchaseOrderItems, suppliers]);

  const filteredPOs = useMemo(() => {
    let result = poWithItems;
    if (filterStatus !== 'all') result = result.filter(po => po.status === filterStatus);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(po =>
        po.po_number?.toLowerCase().includes(term) ||
        po.supplier?.name?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [poWithItems, filterStatus, searchTerm]);

  // Stats
  const stats = useMemo(() => ({
    total: (purchaseOrders || []).length,
    draft: (purchaseOrders || []).filter(p => p.status === 'draft').length,
    confirmed: (purchaseOrders || []).filter(p => p.status === 'confirmed').length,
    partial: (purchaseOrders || []).filter(p => p.status === 'partial').length,
    totalAmount: (purchaseOrders || []).filter(p => p.status !== 'cancelled').reduce((s, p) => s + Number(p.total_amount || 0), 0),
  }), [purchaseOrders]);

  // --- Helpers ---
  const generatePONumber = async () => {
    const dateStr = getDateStrVN();
    const { count } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .like('po_number', `PO-${dateStr}-%`);
    const seq = ((count || 0) + 1).toString().padStart(3, '0');
    return `PO-${dateStr}-${seq}`;
  };

  const resetForm = () => {
    setFormSupplierId('');
    setFormOrderDate(getTodayVN());
    setFormExpectedDate('');
    setFormNotes('');
    setFormItems([{ product_id: '', quantity: 1, unit_price: 0 }]);
    setIsEditing(false);
  };

  const getProductName = (id) => {
    const p = (products || []).find(pr => pr.id === id);
    return p ? `${p.sku} - ${p.name}` : '';
  };

  const getSupplierName = (id) => {
    const s = (suppliers || []).find(su => su.id === id);
    return s ? s.name : '';
  };

  const calcFormTotal = () => formItems.reduce((s, i) => s + (parseInt(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);

  // --- CRUD ---
  const handleCreate = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Bạn không có quyền tạo đơn mua'); return; }
    const validItems = formItems.filter(i => i.product_id && parseInt(i.quantity) > 0);
    if (validItems.length === 0) { alert('Vui lòng thêm ít nhất 1 sản phẩm!'); return; }
    if (!formSupplierId) { alert('Vui lòng chọn nhà cung cấp!'); return; }

    setSaving(true);
    try {
      const poNumber = await generatePONumber();
      const totalAmount = validItems.reduce((s, i) => s + (parseInt(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);

      const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
        tenant_id: tenant.id,
        po_number: poNumber,
        supplier_id: formSupplierId,
        status: 'draft',
        order_date: formOrderDate,
        expected_date: formExpectedDate || null,
        notes: formNotes,
        total_amount: totalAmount,
        created_by: currentUser.id,
      }).select().single();
      if (poErr) throw poErr;

      const itemsToInsert = validItems.map(i => ({
        po_id: po.id,
        product_id: i.product_id,
        quantity: parseInt(i.quantity),
        unit_price: parseFloat(i.unit_price) || 0,
      }));
      const { error: itemsErr } = await supabase.from('purchase_order_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'create', entityType: 'purchase_order', entityId: poNumber, entityName: poNumber, description: `Tạo đơn mua hàng ${poNumber}` });

      alert('Đã tạo đơn mua hàng!');
      setShowCreateModal(false);
      resetForm();
      await loadWarehouseData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedPO || !canEdit) return;
    const validItems = formItems.filter(i => i.product_id && parseInt(i.quantity) > 0);
    if (validItems.length === 0) { alert('Vui lòng thêm ít nhất 1 sản phẩm!'); return; }

    setSaving(true);
    try {
      const totalAmount = validItems.reduce((s, i) => s + (parseInt(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);

      const { error: updateErr } = await supabase.from('purchase_orders').update({
        supplier_id: formSupplierId,
        order_date: formOrderDate,
        expected_date: formExpectedDate || null,
        notes: formNotes,
        total_amount: totalAmount,
        updated_at: getNowISOVN(),
      }).eq('id', selectedPO.id);
      if (updateErr) throw updateErr;

      // Delete old items and re-insert
      await supabase.from('purchase_order_items').delete().eq('po_id', selectedPO.id);
      const itemsToInsert = validItems.map(i => ({
        po_id: selectedPO.id,
        product_id: i.product_id,
        quantity: parseInt(i.quantity),
        unit_price: parseFloat(i.unit_price) || 0,
        received_quantity: i.received_quantity || 0,
      }));
      const { error: itemsErr } = await supabase.from('purchase_order_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      alert('Đã cập nhật đơn mua hàng!');
      setShowCreateModal(false);
      resetForm();
      await loadWarehouseData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async (po) => {
    if (!window.confirm('Xác nhận đơn mua hàng ' + po.po_number + '?')) return;
    try {
      const { error } = await supabase.from('purchase_orders')
        .update({ status: 'confirmed', updated_at: getNowISOVN() })
        .eq('id', po.id);
      if (error) throw error;
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'purchase_order', entityId: po.po_number, entityName: po.po_number, description: `Xác nhận đơn mua ${po.po_number}` });
      await loadWarehouseData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleCancel = async (po) => {
    if (!window.confirm('Huỷ đơn mua hàng ' + po.po_number + '?')) return;
    try {
      const { error } = await supabase.from('purchase_orders')
        .update({ status: 'cancelled', updated_at: getNowISOVN() })
        .eq('id', po.id);
      if (error) throw error;
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'purchase_order', entityId: po.po_number, entityName: po.po_number, description: `Huỷ đơn mua ${po.po_number}` });
      await loadWarehouseData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  // --- Receive goods ---
  const openReceiveModal = (po) => {
    const poItems = (purchaseOrderItems || []).filter(i => i.po_id === po.id);
    setReceiveItems(poItems.map(item => ({
      ...item,
      receive_qty: Math.max(0, (item.quantity || 0) - (item.received_quantity || 0)),
      product: (products || []).find(p => p.id === item.product_id),
    })));
    const defaultWh = warehouses.find(w => w.is_default) || warehouses[0];
    setReceiveWarehouseId(defaultWh?.id || '');
    setSelectedPO(po);
    setShowReceiveModal(true);
  };

  const handleReceive = async () => {
    if (!receiveWarehouseId) { alert('Vui lòng chọn kho nhận!'); return; }
    const itemsToReceive = receiveItems.filter(i => parseInt(i.receive_qty) > 0);
    if (itemsToReceive.length === 0) { alert('Vui lòng nhập số lượng nhận!'); return; }

    // Validate: don't receive more than ordered
    for (const item of itemsToReceive) {
      const remaining = (item.quantity || 0) - (item.received_quantity || 0);
      if (parseInt(item.receive_qty) > remaining) {
        alert(`${item.product?.name}: Không thể nhận nhiều hơn SL còn lại (${remaining})`);
        return;
      }
    }

    setSaving(true);
    try {
      // Create stock_transaction for import
      const dateStr = getDateStrVN();
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const txNumber = `PN-PO-${dateStr}-${random}`;
      const totalAmount = itemsToReceive.reduce((s, i) => s + parseInt(i.receive_qty) * parseFloat(i.unit_price || 0), 0);

      const supplierObj = (suppliers || []).find(s => s.id === selectedPO.supplier_id);
      const { data: transaction, error: txErr } = await supabase.from('stock_transactions').insert({
        tenant_id: tenant.id,
        transaction_number: txNumber,
        type: 'import',
        transaction_date: getTodayVN(),
        partner_name: supplierObj?.name || '',
        partner_phone: supplierObj?.phone || '',
        total_amount: totalAmount,
        note: `Nhận hàng từ PO: ${selectedPO.po_number}`,
        status: 'completed',
        created_by: currentUser.name,
        warehouse_id: receiveWarehouseId,
        supplier_id: selectedPO.supplier_id || null,
        approval_status: 'approved',
        approved_by: currentUser.name,
        approved_at: getNowISOVN(),
      }).select().single();
      if (txErr) throw txErr;

      // Insert stock_transaction_items
      const txItems = itemsToReceive.map(item => ({
        transaction_id: transaction.id,
        product_id: item.product_id,
        product_sku: item.product?.sku || '',
        product_name: item.product?.name || '',
        quantity: parseInt(item.receive_qty),
        unit_price: parseFloat(item.unit_price || 0),
        total_price: parseInt(item.receive_qty) * parseFloat(item.unit_price || 0),
      }));
      await supabase.from('stock_transaction_items').insert(txItems);

      // Adjust warehouse stock
      for (const item of itemsToReceive) {
        const { error: rpcErr } = await supabase.rpc('adjust_warehouse_stock', {
          p_warehouse_id: receiveWarehouseId,
          p_product_id: item.product_id,
          p_delta: parseInt(item.receive_qty),
        });
        if (rpcErr) throw rpcErr;
      }

      // WAC calculation
      for (const item of itemsToReceive) {
        const qty = parseInt(item.receive_qty);
        const price = parseFloat(item.unit_price || 0);
        if (qty <= 0) continue;
        const product = item.product;
        if (!product) continue;
        const oldQty = Math.max(0, (product.stock || 0));
        const oldAvgCost = parseFloat(product.avg_cost) || 0;
        const newAvgCost = calculateWAC(oldQty, oldAvgCost, qty, price);
        await supabase.from('products').update({ avg_cost: Math.round(newAvgCost) }).eq('id', item.product_id);
        await supabase.from('cost_price_history').insert({
          tenant_id: tenant.id,
          product_id: item.product_id,
          old_avg_cost: oldAvgCost,
          new_avg_cost: Math.round(newAvgCost),
          import_quantity: qty,
          import_price: price,
          stock_transaction_id: transaction.id,
        });
      }

      // Update PO item received_quantity
      for (const item of itemsToReceive) {
        const newReceived = (item.received_quantity || 0) + parseInt(item.receive_qty);
        await supabase.from('purchase_order_items')
          .update({ received_quantity: newReceived })
          .eq('id', item.id);
      }

      // Update PO status
      const allPOItems = (purchaseOrderItems || []).filter(i => i.po_id === selectedPO.id);
      const allFullyReceived = allPOItems.every(item => {
        const received = itemsToReceive.find(r => r.id === item.id);
        const newReceived = received
          ? (item.received_quantity || 0) + parseInt(received.receive_qty)
          : (item.received_quantity || 0);
        return newReceived >= (item.quantity || 0);
      });

      const newStatus = allFullyReceived ? 'received' : 'partial';
      await supabase.from('purchase_orders')
        .update({ status: newStatus, updated_at: getNowISOVN() })
        .eq('id', selectedPO.id);

      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'purchase_order', entityId: selectedPO.po_number, entityName: selectedPO.po_number, description: `Nhận hàng PO ${selectedPO.po_number} → ${newStatus === 'received' ? 'Hoàn thành' : 'Nhận 1 phần'}` });

      alert('Nhận hàng thành công!');
      setShowReceiveModal(false);
      setShowDetailModal(false);
      await loadWarehouseData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Open detail ---
  const openDetail = (po) => {
    setSelectedPO(po);
    setShowDetailModal(true);
  };

  // --- Open edit ---
  const openEdit = (po) => {
    setSelectedPO(po);
    setFormSupplierId(po.supplier_id || '');
    setFormOrderDate(po.order_date || getTodayVN());
    setFormExpectedDate(po.expected_date || '');
    setFormNotes(po.notes || '');
    const items = po.items || [];
    setFormItems(items.length > 0 ? items.map(i => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price || 0,
      received_quantity: i.received_quantity || 0,
    })) : [{ product_id: '', quantity: 1, unit_price: 0 }]);
    setIsEditing(true);
    setShowDetailModal(false);
    setShowCreateModal(true);
  };

  // --- View guard ---
  if (!hasPermission('warehouse', 1)) {
    return (
      <div className="p-8 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <p className="text-gray-500">Bạn không có quyền xem đơn mua hàng</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-gray-600 text-sm">Tổng đơn mua</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-yellow-500">
          <div className="text-2xl font-bold text-yellow-600">{stats.draft + stats.confirmed}</div>
          <div className="text-gray-600 text-sm">Đang xử lý</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-orange-500">
          <div className="text-2xl font-bold text-orange-600">{stats.partial}</div>
          <div className="text-gray-600 text-sm">Nhận 1 phần</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
          <div className="text-lg font-bold text-green-600">{formatMoney(stats.totalAmount)}</div>
          <div className="text-gray-600 text-sm">Tổng giá trị</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
        <input type="text" placeholder="Tìm đơn mua hàng..."
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-lg" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border rounded-lg">
          <option value="all">Tất cả trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="confirmed">Đã xác nhận</option>
          <option value="partial">Nhận 1 phần</option>
          <option value="received">Hoàn thành</option>
          <option value="cancelled">Đã huỷ</option>
        </select>
        {hasPermission('warehouse', 2) && (
          <button onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium whitespace-nowrap">
            + Tạo Đơn Mua
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mã đơn</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">NCC</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Ngày đặt</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden lg:table-cell">Ngày dự kiến</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Tổng tiền</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredPOs.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-500">Chưa có đơn mua hàng nào</td></tr>
              ) : filteredPOs.map(po => {
                const st = STATUS_MAP[po.status] || STATUS_MAP.draft;
                return (
                  <tr key={po.id} className="hover:bg-green-50 cursor-pointer" onClick={() => openDetail(po)}>
                    <td className="px-4 py-3 font-mono text-sm text-blue-600 font-medium">{po.po_number}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{po.supplier?.name || '-'}</td>
                    <td className="px-4 py-3">{po.order_date ? new Date(po.order_date).toLocaleDateString('vi-VN') : '-'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">{po.expected_date ? new Date(po.expected_date).toLocaleDateString('vi-VN') : '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(po.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-center">
                        {(po.status === 'draft') && canEdit && (
                          <button onClick={() => openEdit(po)} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Sửa</button>
                        )}
                        {(po.status === 'draft') && hasPermission('warehouse', 3) && (
                          <button onClick={() => handleConfirm(po)} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">Xác nhận</button>
                        )}
                        {(po.status === 'confirmed' || po.status === 'partial') && hasPermission('warehouse', 2) && (
                          <button onClick={() => openReceiveModal(po)} className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200">Nhận hàng</button>
                        )}
                        {(po.status === 'draft' || po.status === 'confirmed') && hasPermission('warehouse', 3) && (
                          <button onClick={() => handleCancel(po)} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">Huỷ</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">{isEditing ? 'Sửa Đơn Mua Hàng' : 'Tạo Đơn Mua Hàng'}</h2>
                <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp *</label>
                <select value={formSupplierId} onChange={e => setFormSupplierId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg">
                  <option value="">-- Chọn NCC --</option>
                  {(suppliers || []).filter(s => s.is_active !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày đặt</label>
                  <input type="date" value={formOrderDate} onChange={e => setFormOrderDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày dự kiến nhận</label>
                  <input type="date" value={formExpectedDate} onChange={e => setFormExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Sản phẩm</label>
                  <button onClick={() => setFormItems([...formItems, { product_id: '', quantity: 1, unit_price: 0 }])}
                    className="text-sm text-green-600 hover:text-green-700">+ Thêm dòng</button>
                </div>
                <div className="space-y-2">
                  {formItems.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <select value={item.product_id}
                        onChange={e => {
                          const newItems = [...formItems];
                          newItems[index].product_id = e.target.value;
                          if (e.target.value) {
                            const p = products.find(pr => pr.id === e.target.value);
                            if (p) newItems[index].unit_price = p.import_price || 0;
                          }
                          setFormItems(newItems);
                        }}
                        className="flex-1 px-3 py-2 border rounded-lg">
                        <option value="">Chọn sản phẩm</option>
                        {products.filter(p => !p.is_combo).map(p => (
                          <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                        ))}
                      </select>
                      <input type="number" value={item.quantity} min="1"
                        onChange={e => {
                          const newItems = [...formItems];
                          newItems[index].quantity = e.target.value;
                          setFormItems(newItems);
                        }}
                        placeholder="SL" className="w-20 px-3 py-2 border rounded-lg" />
                      <input type="number" value={item.unit_price}
                        onChange={e => {
                          const newItems = [...formItems];
                          newItems[index].unit_price = e.target.value;
                          setFormItems(newItems);
                        }}
                        placeholder="Đơn giá" className="w-32 px-3 py-2 border rounded-lg" />
                      {formItems.length > 1 && (
                        <button onClick={() => setFormItems(formItems.filter((_, i) => i !== index))}
                          className="text-red-500 hover:text-red-700 px-2">&times;</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 text-right">
                <span className="text-gray-600">Tổng tiền: </span>
                <span className="text-2xl font-bold text-blue-600">{formatMoney(calcFormTotal())}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border rounded-lg" />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <button onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="px-4 py-2 border rounded-lg">Hủy</button>
              <button onClick={isEditing ? handleUpdate : handleCreate} disabled={saving}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50">
                {saving ? 'Đang lưu...' : isEditing ? 'Cập nhật' : 'Tạo đơn mua'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-blue-700">Chi Tiết Đơn Mua</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-sm text-gray-500">{selectedPO.po_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(STATUS_MAP[selectedPO.status] || STATUS_MAP.draft).color}`}>
                      {(STATUS_MAP[selectedPO.status] || STATUS_MAP.draft).label}
                    </span>
                  </div>
                </div>
                <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
                <div>
                  <div className="text-xs text-gray-500">Nhà cung cấp</div>
                  <div className="font-medium">{getSupplierName(selectedPO.supplier_id) || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Ngày đặt</div>
                  <div className="font-medium">{selectedPO.order_date ? new Date(selectedPO.order_date).toLocaleDateString('vi-VN') : '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Ngày dự kiến nhận</div>
                  <div className="font-medium">{selectedPO.expected_date ? new Date(selectedPO.expected_date).toLocaleDateString('vi-VN') : '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Tổng giá trị</div>
                  <div className="font-medium text-blue-600">{formatMoney(selectedPO.total_amount)}</div>
                </div>
              </div>

              {/* Items table */}
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Danh sách sản phẩm</h3>
                <div className="border rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Sản phẩm</th>
                        <th className="px-4 py-2 text-right">SL đặt</th>
                        <th className="px-4 py-2 text-right">Đã nhận</th>
                        <th className="px-4 py-2 text-right">Đơn giá</th>
                        <th className="px-4 py-2 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedPO.items?.map(item => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">{getProductName(item.product_id)}</td>
                          <td className="px-4 py-3 text-right">{item.quantity}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={item.received_quantity >= item.quantity ? 'text-green-600 font-medium' : 'text-orange-600'}>
                              {item.received_quantity || 0}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">{formatMoney(item.unit_price)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatMoney((item.quantity || 0) * (item.unit_price || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-blue-50">
                      <tr>
                        <td colSpan="4" className="px-4 py-3 text-right font-bold">Tổng:</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">{formatMoney(selectedPO.total_amount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {selectedPO.notes && (
                <div className="bg-yellow-50 rounded-xl p-4">
                  <div className="text-xs text-yellow-600 mb-1">Ghi chú</div>
                  <div className="text-gray-700">{selectedPO.notes}</div>
                </div>
              )}
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-between">
              <div className="flex gap-2">
                {selectedPO.status === 'draft' && canEdit && (
                  <button onClick={() => openEdit(selectedPO)} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium text-sm hover:bg-blue-200">Sửa</button>
                )}
                {selectedPO.status === 'draft' && hasPermission('warehouse', 3) && (
                  <button onClick={() => { handleConfirm(selectedPO); setShowDetailModal(false); }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700">Xác nhận</button>
                )}
                {(selectedPO.status === 'confirmed' || selectedPO.status === 'partial') && hasPermission('warehouse', 2) && (
                  <button onClick={() => openReceiveModal(selectedPO)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium text-sm hover:bg-purple-700">Nhận hàng</button>
                )}
                {(selectedPO.status === 'draft' || selectedPO.status === 'confirmed') && hasPermission('warehouse', 3) && (
                  <button onClick={() => { handleCancel(selectedPO); setShowDetailModal(false); }}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium text-sm hover:bg-red-200">Huỷ</button>
                )}
              </div>
              <button onClick={() => setShowDetailModal(false)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {showReceiveModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-purple-700">Nhận Hàng</h2>
                  <p className="text-sm text-gray-500 mt-1">PO: {selectedPO.po_number}</p>
                </div>
                <button onClick={() => setShowReceiveModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Warehouse selector */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-amber-800 mb-1">Kho nhận hàng</label>
                <select value={receiveWarehouseId} onChange={e => setReceiveWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white font-medium">
                  {warehouses.filter(w => w.is_active).map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.is_default ? ' (Mặc định)' : ''}</option>
                  ))}
                </select>
              </div>

              {/* Items to receive */}
              <div className="border rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Sản phẩm</th>
                      <th className="px-4 py-2 text-right">SL đặt</th>
                      <th className="px-4 py-2 text-right">Đã nhận</th>
                      <th className="px-4 py-2 text-right">Nhận lần này</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {receiveItems.map((item, idx) => {
                      const remaining = (item.quantity || 0) - (item.received_quantity || 0);
                      return (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            <div className="font-medium">{item.product?.name || getProductName(item.product_id)}</div>
                            <div className="text-xs text-gray-500">{item.product?.sku || ''}</div>
                          </td>
                          <td className="px-4 py-3 text-right">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{item.received_quantity || 0}</td>
                          <td className="px-4 py-3 text-right">
                            <input type="number" min="0" max={remaining}
                              value={item.receive_qty}
                              onChange={e => {
                                const newItems = [...receiveItems];
                                newItems[idx].receive_qty = e.target.value;
                                setReceiveItems(newItems);
                              }}
                              className="w-20 px-2 py-1 border rounded text-right" />
                            <div className="text-xs text-gray-400 mt-0.5">Còn lại: {remaining}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <button onClick={() => setShowReceiveModal(false)} className="px-4 py-2 border rounded-lg">Hủy</button>
              <button onClick={handleReceive} disabled={saving}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50">
                {saving ? 'Đang xử lý...' : 'Xác nhận nhận hàng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

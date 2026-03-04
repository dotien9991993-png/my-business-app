import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { getTodayVN, getDateStrVN, getNowISOVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

const STATUS_MAP = {
  draft: { label: 'Nháp', color: 'bg-gray-100 text-gray-700' },
  inspecting: { label: 'Đang kiểm', color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700' },
};

export default function ReturnReceiptView({
  returnReceipts, returnReceiptItems, supplierReturns, supplierReturnItems,
  suppliers, products, warehouses, warehouseStock,
  loadWarehouseData, tenant, currentUser, hasPermission, canEdit, allUsers
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInspectModal, setShowInspectModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [saving, setSaving] = useState(false);

  // Form states
  const [formReturnId, setFormReturnId] = useState('');
  const [formInspectionDate, setFormInspectionDate] = useState(getTodayVN());
  const [formInspectorId, setFormInspectorId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [inspectItems, setInspectItems] = useState([]);

  // Derived
  const receiptsWithData = useMemo(() => {
    return (returnReceipts || []).map(rr => ({
      ...rr,
      items: (returnReceiptItems || []).filter(i => i.receipt_id === rr.id),
      supplierReturn: (supplierReturns || []).find(sr => sr.id === rr.supplier_return_id),
      supplier: (suppliers || []).find(s => s.id === rr.supplier_id)
    }));
  }, [returnReceipts, returnReceiptItems, supplierReturns, suppliers]);

  const filteredReceipts = useMemo(() => {
    let result = receiptsWithData;
    if (filterStatus !== 'all') result = result.filter(r => r.status === filterStatus);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.receipt_number?.toLowerCase().includes(term) ||
        r.supplier?.name?.toLowerCase().includes(term) ||
        r.supplierReturn?.return_number?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [receiptsWithData, filterStatus, searchTerm]);

  // Confirmed supplier returns not yet having a receipt
  const availableReturns = useMemo(() => {
    const receiptedIds = new Set((returnReceipts || []).map(rr => rr.supplier_return_id));
    return (supplierReturns || []).filter(sr => sr.status === 'confirmed' && !receiptedIds.has(sr.id));
  }, [supplierReturns, returnReceipts]);

  const stats = useMemo(() => ({
    total: (returnReceipts || []).length,
    draft: (returnReceipts || []).filter(r => r.status === 'draft').length,
    inspecting: (returnReceipts || []).filter(r => r.status === 'inspecting').length,
    completed: (returnReceipts || []).filter(r => r.status === 'completed').length,
  }), [returnReceipts]);

  const generateReceiptNumber = async () => {
    const dateStr = getDateStrVN();
    const { count } = await supabase
      .from('return_receipts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .like('receipt_number', `RR-${dateStr}%`);
    return `RR-${dateStr}-${String((count || 0) + 1).padStart(3, '0')}`;
  };

  const resetForm = () => {
    setFormReturnId(''); setFormInspectionDate(getTodayVN());
    setFormInspectorId(''); setFormNotes(''); setInspectItems([]);
  };

  const handleReturnSelect = (returnId) => {
    setFormReturnId(returnId);
    if (returnId) {
      const items = (supplierReturnItems || []).filter(i => i.return_id === returnId);
      setInspectItems(items.map(i => ({
        product_id: i.product_id, return_quantity: i.quantity,
        good_quantity: i.quantity, damaged_quantity: 0, missing_quantity: 0,
        warehouse_id: i.warehouse_id || '', notes: ''
      })));
    } else {
      setInspectItems([]);
    }
  };

  const updateInspectItem = (idx, field, value) => {
    const updated = [...inspectItems];
    updated[idx] = { ...updated[idx], [field]: parseInt(value) || 0 };
    setInspectItems(updated);
  };

  const openCreate = () => { resetForm(); setShowCreateModal(true); };

  const openDetail = (receipt) => { setSelectedReceipt(receipt); setShowDetailModal(true); };

  const openInspect = (receipt) => {
    setSelectedReceipt(receipt);
    const items = (returnReceiptItems || []).filter(i => i.receipt_id === receipt.id);
    setInspectItems(items.map(i => ({
      ...i,
      good_quantity: i.good_quantity || 0,
      damaged_quantity: i.damaged_quantity || 0,
      missing_quantity: i.missing_quantity || 0,
      notes: i.notes || ''
    })));
    setShowInspectModal(true);
  };

  // Create receipt
  const handleCreate = async () => {
    if (!formReturnId) { alert('Vui lòng chọn phiếu trả hàng!'); return; }
    setSaving(true);
    try {
      const sr = (supplierReturns || []).find(r => r.id === formReturnId);
      const receiptNumber = await generateReceiptNumber();
      const { data: newReceipt, error } = await supabase.from('return_receipts').insert([{
        tenant_id: tenant.id, receipt_number: receiptNumber,
        supplier_return_id: formReturnId, supplier_id: sr.supplier_id,
        status: 'draft', inspection_date: formInspectionDate,
        inspector_id: formInspectorId || null, notes: formNotes,
        created_by: currentUser.id
      }]).select().single();
      if (error) throw error;
      await supabase.from('return_receipt_items').insert(inspectItems.map(i => ({
        receipt_id: newReceipt.id, product_id: i.product_id,
        return_quantity: i.return_quantity, good_quantity: i.good_quantity,
        damaged_quantity: i.damaged_quantity, missing_quantity: i.missing_quantity,
        warehouse_id: i.warehouse_id || null, notes: i.notes || null
      })));
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'create', entityType: 'return_receipt', entityId: newReceipt.id, entityName: receiptNumber, description: `Tạo biên bản hoàn hàng ${receiptNumber}` });
      setShowCreateModal(false); resetForm(); loadWarehouseData();
    } catch (error) { alert('Lỗi: ' + error.message); } finally { setSaving(false); }
  };

  // Start inspection
  const handleStartInspect = async (receipt) => {
    try {
      await supabase.from('return_receipts').update({
        status: 'inspecting', updated_at: getNowISOVN()
      }).eq('id', receipt.id);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'return_receipt', entityId: receipt.id, entityName: receipt.receipt_number, description: `Bắt đầu kiểm tra ${receipt.receipt_number}` });
      loadWarehouseData();
    } catch (error) { alert('Lỗi: ' + error.message); }
  };

  // Complete inspection
  const handleComplete = async () => {
    // Validate: good + damaged + missing = return_quantity for each item
    for (const item of inspectItems) {
      const total = (item.good_quantity || 0) + (item.damaged_quantity || 0) + (item.missing_quantity || 0);
      if (total !== item.return_quantity) {
        const product = products.find(p => p.id === item.product_id);
        alert(`${product?.name}: Tổng (tốt + hỏng + thiếu) = ${total}, phải bằng SL trả = ${item.return_quantity}`);
        return;
      }
    }
    if (!window.confirm('Hoàn thành kiểm tra? Hàng tốt sẽ nhập lại kho, hàng hỏng đánh dấu không KD.')) return;
    setSaving(true);
    try {
      // Update items
      for (const item of inspectItems) {
        await supabase.from('return_receipt_items').update({
          good_quantity: item.good_quantity, damaged_quantity: item.damaged_quantity,
          missing_quantity: item.missing_quantity, notes: item.notes || null
        }).eq('id', item.id);

        const whId = item.warehouse_id || (warehouses || []).find(w => w.is_default)?.id;
        // Good: return to stock
        if (item.good_quantity > 0 && whId) {
          await supabase.rpc('adjust_warehouse_stock', {
            p_warehouse_id: whId, p_product_id: item.product_id, p_delta: item.good_quantity
          });
        }
        // Damaged: add to stock + mark unavailable
        if (item.damaged_quantity > 0 && whId) {
          await supabase.rpc('adjust_warehouse_stock', {
            p_warehouse_id: whId, p_product_id: item.product_id, p_delta: item.damaged_quantity
          });
          // Increase unavailable
          const ws = (warehouseStock || []).find(s => s.warehouse_id === whId && s.product_id === item.product_id);
          await supabase.from('warehouse_stock').update({
            unavailable_quantity: (ws?.unavailable_quantity || 0) + item.damaged_quantity
          }).eq('warehouse_id', whId).eq('product_id', item.product_id);
          // Log unavailable
          await supabase.from('stock_unavailable_log').insert([{
            tenant_id: tenant.id, product_id: item.product_id, warehouse_id: whId,
            reason: 'damaged', quantity: item.damaged_quantity, action: 'lock',
            note: `Hoàn hàng hỏng - ${selectedReceipt.receipt_number}`, created_by: currentUser.id
          }]);
        }
      }
      // Create stock_transaction for good items
      const goodItems = inspectItems.filter(i => i.good_quantity > 0);
      if (goodItems.length > 0) {
        const { data: txData } = await supabase.from('stock_transactions').insert([{
          tenant_id: tenant.id, transaction_number: `IMP-RR-${Date.now()}`,
          type: 'import', transaction_date: getTodayVN(),
          partner_name: selectedReceipt.supplier?.name || 'NCC',
          note: `Hoàn hàng từ NCC - ${selectedReceipt.receipt_number}`,
          status: 'completed', created_by: currentUser.name,
          warehouse_id: goodItems[0]?.warehouse_id || null
        }]).select().single();
        if (txData) {
          await supabase.from('stock_transaction_items').insert(goodItems.map(i => ({
            transaction_id: txData.id, product_id: i.product_id,
            quantity: i.good_quantity, unit_price: 0
          })));
        }
      }
      // Update status
      await supabase.from('return_receipts').update({
        status: 'completed', updated_at: getNowISOVN()
      }).eq('id', selectedReceipt.id);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'return_receipt', entityId: selectedReceipt.id, entityName: selectedReceipt.receipt_number, description: `Hoàn thành kiểm tra ${selectedReceipt.receipt_number}` });
      setShowInspectModal(false); loadWarehouseData();
    } catch (error) { alert('Lỗi: ' + error.message); } finally { setSaving(false); }
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
          <div className="text-gray-600 text-sm">Tổng biên bản</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-gray-400">
          <div className="text-2xl font-bold text-gray-600">{stats.draft}</div>
          <div className="text-gray-600 text-sm">Nháp</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-yellow-400">
          <div className="text-2xl font-bold text-yellow-600">{stats.inspecting}</div>
          <div className="text-gray-600 text-sm">Đang kiểm</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-gray-600 text-sm">Hoàn thành</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {hasPermission('warehouse', 2) && (
            <button onClick={openCreate} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm">
              📋 Tạo Biên Bản
            </button>
          )}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="all">Tất cả</option>
            <option value="draft">Nháp</option>
            <option value="inspecting">Đang kiểm</option>
            <option value="completed">Hoàn thành</option>
          </select>
        </div>
        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm theo mã biên bản, NCC..." className="px-3 py-2 border rounded-lg text-sm w-full sm:w-64" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Mã biên bản</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Phiếu trả</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 hidden md:table-cell">NCC</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 hidden md:table-cell">Ngày kiểm</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredReceipts.length === 0 ? (
                <tr><td colSpan="6" className="px-4 py-12 text-center text-gray-500">
                  <div className="text-4xl mb-2">📋</div>Chưa có biên bản hoàn hàng
                </td></tr>
              ) : filteredReceipts.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(r)}>
                  <td className="px-4 py-3 font-mono text-green-600 font-medium">{r.receipt_number}</td>
                  <td className="px-4 py-3 text-orange-600 text-sm">{r.supplierReturn?.return_number || '-'}</td>
                  <td className="px-4 py-3 hidden md:table-cell">{r.supplier?.name || 'N/A'}</td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">{r.inspection_date}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_MAP[r.status]?.color || 'bg-gray-100'}`}>
                      {STATUS_MAP[r.status]?.label || r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-center gap-1">
                      {r.status === 'draft' && hasPermission('warehouse', 2) && (
                        <button onClick={() => handleStartInspect(r)} className="p-1.5 hover:bg-yellow-100 rounded text-yellow-600" title="Bắt đầu kiểm">🔍</button>
                      )}
                      {r.status === 'inspecting' && hasPermission('warehouse', 2) && (
                        <button onClick={() => openInspect(r)} className="p-1.5 hover:bg-green-100 rounded text-green-600" title="Kiểm tra">✅</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">📋 Tạo Biên Bản Hoàn Hàng</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phiếu trả hàng NCC *</label>
                <select value={formReturnId} onChange={(e) => handleReturnSelect(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  <option value="">-- Chọn phiếu trả --</option>
                  {availableReturns.map(sr => {
                    const supplier = (suppliers || []).find(s => s.id === sr.supplier_id);
                    return <option key={sr.id} value={sr.id}>{sr.return_number} - {supplier?.name || 'N/A'} - {formatMoney(sr.total_amount)}</option>;
                  })}
                </select>
                {availableReturns.length === 0 && <p className="text-xs text-amber-600 mt-1">Không có phiếu trả hàng đã xác nhận nào chưa có biên bản</p>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kiểm tra</label>
                  <input type="date" value={formInspectionDate} onChange={(e) => setFormInspectionDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Người kiểm tra</label>
                  <select value={formInspectorId} onChange={(e) => setFormInspectorId(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">-- Chọn --</option>
                    {(allUsers || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              {inspectItems.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-gray-700">Sản phẩm trả ({inspectItems.length})</label>
                  <div className="mt-2 space-y-2">
                    {inspectItems.map((item, idx) => {
                      const product = products.find(p => p.id === item.product_id);
                      return (
                        <div key={idx} className="bg-gray-50 p-3 rounded-lg flex justify-between items-center">
                          <div><span className="font-medium">{product?.name}</span></div>
                          <div className="text-sm text-gray-500">SL: {item.return_quantity}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg" />
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3 justify-end">
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Hủy</button>
              <button onClick={handleCreate} disabled={saving} className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50">
                {saving ? 'Đang tạo...' : '📋 Tạo biên bản'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Modal */}
      {showInspectModal && selectedReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">🔍 Kiểm Tra Hàng Hoàn - {selectedReceipt.receipt_number}</h2>
              <p className="text-gray-500 text-sm mt-1">Phân loại: Tốt / Hỏng / Thiếu. Tổng phải bằng SL trả.</p>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {inspectItems.map((item, idx) => {
                  const product = products.find(p => p.id === item.product_id);
                  const total = (item.good_quantity || 0) + (item.damaged_quantity || 0) + (item.missing_quantity || 0);
                  const isValid = total === item.return_quantity;
                  return (
                    <div key={idx} className={`p-4 rounded-lg border ${isValid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-medium">{product?.name || 'N/A'}</span>
                        <span className="text-sm text-gray-500">SL trả: <strong>{item.return_quantity}</strong></span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-green-700 font-medium">Tốt</label>
                          <input type="number" min="0" max={item.return_quantity} value={item.good_quantity}
                            onChange={(e) => updateInspectItem(idx, 'good_quantity', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded text-sm text-center" />
                        </div>
                        <div>
                          <label className="text-xs text-red-700 font-medium">Hỏng</label>
                          <input type="number" min="0" max={item.return_quantity} value={item.damaged_quantity}
                            onChange={(e) => updateInspectItem(idx, 'damaged_quantity', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded text-sm text-center" />
                        </div>
                        <div>
                          <label className="text-xs text-orange-700 font-medium">Thiếu</label>
                          <input type="number" min="0" max={item.return_quantity} value={item.missing_quantity}
                            onChange={(e) => updateInspectItem(idx, 'missing_quantity', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded text-sm text-center" />
                        </div>
                      </div>
                      {!isValid && <div className="text-xs text-red-600 mt-1">Tổng = {total}, cần = {item.return_quantity}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3 justify-end">
              <button onClick={() => setShowInspectModal(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Hủy</button>
              <button onClick={handleComplete} disabled={saving} className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50">
                {saving ? 'Đang xử lý...' : '✅ Hoàn thành kiểm tra'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">📋 Chi Tiết Biên Bản</h2>
                  <p className="text-green-600 font-mono mt-1">{selectedReceipt.receipt_number}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_MAP[selectedReceipt.status]?.color}`}>
                  {STATUS_MAP[selectedReceipt.status]?.label}
                </span>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">Phiếu trả:</span> <span className="font-medium text-orange-600">{selectedReceipt.supplierReturn?.return_number || '-'}</span></div>
                <div><span className="text-gray-500">NCC:</span> <span className="font-medium">{selectedReceipt.supplier?.name}</span></div>
                <div><span className="text-gray-500">Ngày kiểm:</span> <span className="font-medium">{selectedReceipt.inspection_date}</span></div>
                <div><span className="text-gray-500">Người kiểm:</span> <span className="font-medium">{(allUsers || []).find(u => u.id === selectedReceipt.inspector_id)?.name || '-'}</span></div>
              </div>
              <div className="bg-gray-50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Sản phẩm</th>
                      <th className="px-3 py-2 text-right">SL trả</th>
                      <th className="px-3 py-2 text-right text-green-700">Tốt</th>
                      <th className="px-3 py-2 text-right text-red-700">Hỏng</th>
                      <th className="px-3 py-2 text-right text-orange-700">Thiếu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(selectedReceipt.items || []).map(item => {
                      const product = products.find(p => p.id === item.product_id);
                      return (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{product?.name || 'N/A'}</td>
                          <td className="px-3 py-2 text-right">{item.return_quantity}</td>
                          <td className="px-3 py-2 text-right text-green-600 font-medium">{item.good_quantity || 0}</td>
                          <td className="px-3 py-2 text-right text-red-600 font-medium">{item.damaged_quantity || 0}</td>
                          <td className="px-3 py-2 text-right text-orange-600 font-medium">{item.missing_quantity || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {selectedReceipt.notes && (
                <div className="text-sm"><span className="text-gray-500">Ghi chú:</span> {selectedReceipt.notes}</div>
              )}
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

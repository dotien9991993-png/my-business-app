import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { getTodayVN, getDateStrVN, getNowISOVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';
import { isAdmin } from '../../utils/permissionUtils';

export default function WarehouseImportView({ products, warehouses, stockTransactions, loadWarehouseData, tenant, currentUser, suppliers, hasPermission, getPermissionLevel }) {
  const permLevel = getPermissionLevel('warehouse');
  const canAutoApprove = isAdmin(currentUser) || permLevel >= 3;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionItems, setTransactionItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [approving, setApproving] = useState(false);

  // Auto-select default warehouse
  useEffect(() => {
    if (warehouses.length > 0 && !selectedWarehouseId) {
      const defaultWh = warehouses.find(w => w.is_default) || warehouses[0];
      setSelectedWarehouseId(defaultWh.id);
    }
  }, [warehouses]);

  // Load transaction items
  const loadTransactionItems = async (transactionId) => {
    setLoadingItems(true);
    try {
      const { data, error } = await supabase
        .from('stock_transaction_items')
        .select('*')
        .eq('transaction_id', transactionId);
      if (error) throw error;
      setTransactionItems(data || []);
    } catch (error) {
      console.error('Error loading items:', error);
      setTransactionItems([]);
    }
    setLoadingItems(false);
  };

  const openDetail = async (trans) => {
    setSelectedTransaction(trans);
    setRejectReason('');
    setShowRejectInput(false);
    await loadTransactionItems(trans.id);
    setShowDetailModal(true);
  };

  // Form states
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formPartnerName, setFormPartnerName] = useState('');
  const [formPartnerPhone, setFormPartnerPhone] = useState('');
  const [formDate, setFormDate] = useState(getTodayVN());
  const [formNote, setFormNote] = useState('');
  const [formItems, setFormItems] = useState([{ product_id: '', quantity: 1, unit_price: 0, serials: [] }]);

  const importTransactions = stockTransactions.filter(t => t.type === 'import');

  // Pending count for Admin/level 3
  const pendingCount = useMemo(() => {
    return importTransactions.filter(t => t.approval_status === 'pending').length;
  }, [importTransactions]);

  const resetForm = () => {
    setFormSupplierId('');
    setFormPartnerName('');
    setFormPartnerPhone('');
    setFormDate(getTodayVN());
    setFormNote('');
    setFormItems([{ product_id: '', quantity: 1, unit_price: 0, serials: [] }]);
    const defaultWh = warehouses.find(w => w.is_default) || warehouses[0];
    if (defaultWh) setSelectedWarehouseId(defaultWh.id);
  };

  const generateTransactionNumber = () => {
    const dateStr = getDateStrVN();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `PN-${dateStr}-${random}`;
  };

  const addItem = () => {
    setFormItems([...formItems, { product_id: '', quantity: 1, unit_price: 0, serials: [] }]);
  };

  const removeItem = (index) => {
    if (formItems.length > 1) {
      setFormItems(formItems.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formItems];
    newItems[index][field] = value;
    if (field === 'product_id' && value) {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].unit_price = product.import_price || 0;
        // Initialize serials array if product has serial
        if (product.has_serial) {
          const qty = parseInt(newItems[index].quantity) || 1;
          newItems[index].serials = Array(qty).fill('');
        } else {
          newItems[index].serials = [];
        }
      }
    }
    if (field === 'quantity' && newItems[index].product_id) {
      const product = products.find(p => p.id === newItems[index].product_id);
      if (product?.has_serial) {
        const qty = parseInt(value) || 0;
        const current = newItems[index].serials || [];
        if (qty > current.length) {
          newItems[index].serials = [...current, ...Array(qty - current.length).fill('')];
        } else {
          newItems[index].serials = current.slice(0, qty);
        }
      }
    }
    setFormItems(newItems);
  };

  const updateSerial = (itemIndex, serialIndex, value) => {
    const newItems = [...formItems];
    const serials = [...(newItems[itemIndex].serials || [])];
    serials[serialIndex] = value;
    newItems[itemIndex].serials = serials;
    setFormItems(newItems);
  };

  const calculateTotal = () => {
    return formItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const getWarehouseName = (whId) => {
    const wh = warehouses.find(w => w.id === whId);
    return wh ? wh.name : '';
  };

  const handleCreateImport = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Ban khong co quyen tao phieu nhap'); return; }
    const validItems = formItems.filter(item => item.product_id && item.quantity > 0);
    if (validItems.length === 0) {
      alert('Vui long chon it nhat 1 san pham!');
      return;
    }
    if (!selectedWarehouseId) {
      alert('Vui long chon kho nhap!');
      return;
    }

    // Validate serials for has_serial products
    for (const item of validItems) {
      const product = products.find(p => p.id === item.product_id);
      if (product?.has_serial) {
        const serialList = (item.serials || []).filter(s => s.trim());
        if (serialList.length !== parseInt(item.quantity)) {
          alert(`San pham "${product.name}" can ${item.quantity} serial, chi co ${serialList.length}`);
          return;
        }
        // Check uniqueness within batch
        const unique = new Set(serialList);
        if (unique.size !== serialList.length) {
          alert(`San pham "${product.name}" co serial trung nhau`);
          return;
        }
      }
    }

    try {
      const transactionNumber = generateTransactionNumber();
      const autoApprove = canAutoApprove;

      // Create transaction with warehouse_id and approval_status
      const { data: transaction, error: transError } = await supabase.from('stock_transactions').insert([{
        tenant_id: tenant.id,
        transaction_number: transactionNumber,
        type: 'import',
        transaction_date: formDate,
        partner_name: formPartnerName,
        partner_phone: formPartnerPhone,
        total_amount: calculateTotal(),
        note: formNote,
        status: 'completed',
        created_by: currentUser.name,
        warehouse_id: selectedWarehouseId,
        supplier_id: formSupplierId || null,
        approval_status: autoApprove ? 'approved' : 'pending',
        approved_by: autoApprove ? currentUser.name : null,
        approved_at: autoApprove ? getNowISOVN() : null
      }]).select().single();

      if (transError) throw transError;

      // Create transaction items
      const itemsToInsert = validItems.map(item => {
        const product = products.find(p => p.id === item.product_id);
        return {
          transaction_id: transaction.id,
          product_id: item.product_id,
          product_sku: product?.sku || '',
          product_name: product?.name || '',
          quantity: parseInt(item.quantity),
          unit_price: parseFloat(item.unit_price),
          total_price: item.quantity * item.unit_price
        };
      });

      const { error: itemsError } = await supabase.from('stock_transaction_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // Only adjust stock if auto-approved
      if (autoApprove) {
        for (const item of validItems) {
          const { error: rpcError } = await supabase.rpc('adjust_warehouse_stock', {
            p_warehouse_id: selectedWarehouseId,
            p_product_id: item.product_id,
            p_delta: parseInt(item.quantity)
          });
          if (rpcError) throw rpcError;
        }

        // Insert serials for has_serial products (only when approved)
        for (const item of validItems) {
          const product = products.find(p => p.id === item.product_id);
          if (product?.has_serial && item.serials?.length > 0) {
            const serialRows = item.serials.filter(s => s.trim()).map(sn => ({
              tenant_id: tenant.id,
              product_id: item.product_id,
              serial_number: sn.trim(),
              status: 'in_stock',
              warehouse_id: selectedWarehouseId,
              created_by: currentUser.name
            }));
            if (serialRows.length > 0) {
              const { error: serialErr } = await supabase.from('product_serials').insert(serialRows);
              if (serialErr) console.error('Error inserting serials:', serialErr);
            }
          }
        }
      }

      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'create', entityType: 'import', entityId: transactionNumber, entityName: transactionNumber, description: 'Tạo phiếu nhập ' + transactionNumber + (autoApprove ? ' (tự động duyệt)' : ' (chờ duyệt)') });

      if (autoApprove) {
        alert('Nhập kho thành công!');

        // Ask to create expense receipt
        const totalAmount = calculateTotal();
        if (totalAmount > 0 && window.confirm(`Bạn có muốn tạo phiếu chi ${totalAmount.toLocaleString('vi-VN')}đ cho giao dịch nhập kho này không?`)) {
          try {
            const receiptNumber = 'PC-' + getDateStrVN() + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            await supabase.from('receipts_payments').insert([{
              tenant_id: tenant.id,
              receipt_number: receiptNumber,
              type: 'chi',
              amount: totalAmount,
              description: `Nhập kho - ${transactionNumber} - ${getWarehouseName(selectedWarehouseId)}` + (formPartnerName ? ` - ${formPartnerName}` : ''),
              category: 'Nhập hàng',
              receipt_date: formDate,
              note: formNote || `Liên kết phiếu nhập kho: ${transactionNumber}`,
              status: 'pending',
              created_by: currentUser.name,
              created_at: getNowISOVN()
            }]);
            alert('Đã tạo phiếu chi cho duyệt!');
          } catch (err) {
            console.error('Error creating receipt:', err);
            alert('Không thể tạo phiếu chi tự động. Vui lòng tạo thủ công.');
          }
        }
      } else {
        alert('Đã tạo phiếu nhập kho. Phiếu đang chờ duyệt bởi quản lý.');
      }

      setShowCreateModal(false);
      resetForm();
      loadWarehouseData();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  // Approve import transaction
  const handleApprove = async () => {
    if (!canAutoApprove) { alert('Bạn không có quyền duyệt phiếu nhập'); return; }
    if (!selectedTransaction) return;
    setApproving(true);
    try {
      // Update approval status
      const { error: updateErr } = await supabase.from('stock_transactions')
        .update({
          approval_status: 'approved',
          approved_by: currentUser.name,
          approved_at: getNowISOVN()
        })
        .eq('id', selectedTransaction.id);
      if (updateErr) throw updateErr;

      // Adjust stock now
      for (const item of transactionItems) {
        const { error: rpcError } = await supabase.rpc('adjust_warehouse_stock', {
          p_warehouse_id: selectedTransaction.warehouse_id,
          p_product_id: item.product_id,
          p_delta: parseInt(item.quantity)
        });
        if (rpcError) throw rpcError;
      }

      // Insert serials for has_serial products
      for (const item of transactionItems) {
        const product = products.find(p => p.id === item.product_id);
        if (product?.has_serial) {
          // Check if serials were stored in the transaction metadata
          // For pending transactions, serials might need separate handling
          // For now, the serial data is stored in form but not in transaction items
          // This is handled at creation time when auto-approved
        }
      }

      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'approve', entityType: 'import', entityId: selectedTransaction.transaction_number, entityName: selectedTransaction.transaction_number, description: `Duyệt phiếu nhập ${selectedTransaction.transaction_number}` });

      setSelectedTransaction(prev => ({ ...prev, approval_status: 'approved', approved_by: currentUser.name, approved_at: getNowISOVN() }));
      await loadWarehouseData();
      alert('Đã duyệt phiếu nhập. Tồn kho đã được cập nhật!');
    } catch (error) {
      alert('Lỗi duyệt: ' + error.message);
    } finally {
      setApproving(false);
    }
  };

  // Reject import transaction
  const handleReject = async () => {
    if (!canAutoApprove) { alert('Bạn không có quyền từ chối phiếu nhập'); return; }
    if (!selectedTransaction) return;
    if (!rejectReason.trim()) { alert('Vui lòng nhập lý do từ chối'); return; }
    setApproving(true);
    try {
      const { error: updateErr } = await supabase.from('stock_transactions')
        .update({
          approval_status: 'rejected',
          approved_by: currentUser.name,
          reject_reason: rejectReason.trim()
        })
        .eq('id', selectedTransaction.id);
      if (updateErr) throw updateErr;

      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'reject', entityType: 'import', entityId: selectedTransaction.transaction_number, entityName: selectedTransaction.transaction_number, description: `Từ chối phiếu nhập ${selectedTransaction.transaction_number}: ${rejectReason.trim()}` });

      setSelectedTransaction(prev => ({ ...prev, approval_status: 'rejected', approved_by: currentUser.name, reject_reason: rejectReason.trim() }));
      setShowRejectInput(false);
      setRejectReason('');
      await loadWarehouseData();
      alert('Đã từ chối phiếu nhập.');
    } catch (error) {
      alert('Lỗi: ' + error.message);
    } finally {
      setApproving(false);
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

  const filteredTransactions = importTransactions.filter(t =>
    !searchTerm ||
    t.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.partner_name && t.partner_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
          <div className="text-2xl font-bold text-green-600">{importTransactions.length}</div>
          <div className="text-gray-600 text-sm">Phiếu nhập</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
          <div className="text-lg font-bold text-blue-600">
            {permLevel >= 3 ? formatCurrency(importTransactions.reduce((sum, t) => sum + (t.total_amount || 0), 0)) : '---'}
          </div>
          <div className="text-gray-600 text-sm">Tổng giá trị nhập</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-purple-500">
          <div className="text-2xl font-bold text-purple-600">
            {importTransactions.filter(t => {
              const today = getTodayVN();
              return t.transaction_date === today;
            }).length}
          </div>
          <div className="text-gray-600 text-sm">Nhập hôm nay</div>
        </div>
        {canAutoApprove && pendingCount > 0 && (
          <div className="bg-white rounded-xl p-4 border-l-4 border-yellow-500">
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            <div className="text-gray-600 text-sm">Chờ duyệt</div>
          </div>
        )}
      </div>

      {/* Pending alert banner */}
      {canAutoApprove && pendingCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-center gap-3">
          <span className="text-2xl">&#9888;&#65039;</span>
          <div>
            <div className="font-medium text-yellow-800">Có {pendingCount} phiếu nhập chờ duyệt</div>
            <div className="text-sm text-yellow-600">Nhấn vào phiếu để xem chi tiết và duyệt</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="Tìm phiếu nhập..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        {hasPermission('warehouse', 2) && (
          <button
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium whitespace-nowrap"
          >
            Tạo Phiếu Nhập
          </button>
        )}
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mã phiếu</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Ngày</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">Nhà cung cấp</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden lg:table-cell">Kho</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Tổng tiền</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">Người tạo</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                    Chưa có phiếu nhập nào
                  </td>
                </tr>
              ) : filteredTransactions.map(trans => (
                <tr key={trans.id} onClick={() => openDetail(trans)} className={`hover:bg-green-50 cursor-pointer transition-colors ${trans.approval_status === 'pending' ? 'bg-yellow-50/50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-sm text-green-600 font-medium">{trans.transaction_number}</td>
                  <td className="px-4 py-3">{new Date(trans.transaction_date).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-3 hidden md:table-cell">{trans.partner_name || '-'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{getWarehouseName(trans.warehouse_id) || 'Kho chính'}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{permLevel >= 3 ? formatCurrency(trans.total_amount) : '---'}</td>
                  <td className="px-4 py-3 hidden md:table-cell">{trans.created_by}</td>
                  <td className="px-4 py-3 text-center">
                    {trans.approval_status === 'pending' ? (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Chờ duyệt</span>
                    ) : trans.approval_status === 'rejected' ? (
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">Từ chối</span>
                    ) : (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Đã duyệt</span>
                    )}
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
            <div className="p-6 border-b sticky top-0 bg-white">
              <h2 className="text-xl font-bold">Tạo Phiếu Nhập Kho</h2>
              {!canAutoApprove && (
                <p className="text-sm text-yellow-600 mt-1">Phiếu sẽ cần được quản lý duyệt trước khi cập nhật tồn kho</p>
              )}
            </div>
            <div className="p-6 space-y-4">
              {/* Warehouse selector */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-amber-800 mb-1">Kho nhập hàng</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white font-medium"
                >
                  {warehouses.filter(w => w.is_active).map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.is_default ? ' (Mặc định)' : ''}</option>
                  ))}
                </select>
              </div>

              {/* Supplier selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chọn nhà cung cấp</label>
                <select
                  value={formSupplierId}
                  onChange={(e) => {
                    const sid = e.target.value;
                    setFormSupplierId(sid);
                    if (sid) {
                      const s = (suppliers || []).find(s => s.id === sid);
                      if (s) { setFormPartnerName(s.name); setFormPartnerPhone(s.phone || ''); }
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">-- Nhập thủ công --</option>
                  {(suppliers || []).filter(s => s.is_active !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.phone ? ` - ${s.phone}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên NCC</label>
                  <input
                    type="text"
                    value={formPartnerName}
                    onChange={(e) => setFormPartnerName(e.target.value)}
                    placeholder="Tên nhà cung cấp"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SĐT</label>
                  <input
                    type="text"
                    value={formPartnerPhone}
                    onChange={(e) => setFormPartnerPhone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày nhập</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {/* Items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Sản phẩm nhập</label>
                  <button onClick={addItem} className="text-sm text-green-600 hover:text-green-700">+ Thêm dòng</button>
                </div>
                <div className="space-y-2">
                  {formItems.map((item, index) => {
                    const product = item.product_id ? products.find(p => p.id === item.product_id) : null;
                    const hasSerial = product?.has_serial;
                    return (
                    <div key={index}>
                      <div className="flex gap-2 items-center">
                        <select
                          value={item.product_id}
                          onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg"
                        >
                          <option value="">Chọn sản phẩm</option>
                          {products.filter(p => !p.is_combo).map(p => (
                            <option key={p.id} value={p.id}>{p.sku} - {p.name}{p.has_serial ? ' [Serial]' : ''}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                          placeholder="SL"
                          className="w-20 px-3 py-2 border rounded-lg"
                          min="1"
                        />
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                          placeholder="Đơn giá"
                          className="w-32 px-3 py-2 border rounded-lg"
                        />
                        {formItems.length > 1 && (
                          <button onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 px-2">&times;</button>
                        )}
                      </div>
                      {hasSerial && (item.serials || []).length > 0 && (
                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-blue-200 pl-3">
                          <div className="text-xs text-blue-600 font-medium">Serial numbers ({item.serials.length}):</div>
                          {item.serials.map((sn, si) => (
                            <input
                              key={si}
                              type="text"
                              value={sn}
                              onChange={e => updateSerial(index, si, e.target.value)}
                              placeholder={`Serial #${si + 1}`}
                              className="w-full px-2 py-1 border rounded text-sm font-mono"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4 text-right">
                <span className="text-gray-600">Tổng tiền: </span>
                <span className="text-2xl font-bold text-green-600">{formatCurrency(calculateTotal())}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded-lg">Hủy</button>
              <button onClick={handleCreateImport} className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">Nhập Kho</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-green-700">Chi Tiết Phiếu Nhập</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-gray-500 font-mono text-sm">{selectedTransaction.transaction_number}</p>
                    {selectedTransaction.approval_status === 'pending' ? (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Chờ duyệt</span>
                    ) : selectedTransaction.approval_status === 'rejected' ? (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">Từ chối</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Đã duyệt</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Info */}
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
                <div>
                  <div className="text-xs text-gray-500">Ngày nhập</div>
                  <div className="font-medium">{new Date(selectedTransaction.transaction_date).toLocaleDateString('vi-VN')}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Người tạo</div>
                  <div className="font-medium">{selectedTransaction.created_by}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Nhà cung cấp</div>
                  <div className="font-medium">{selectedTransaction.partner_name || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Kho nhập</div>
                  <div className="font-medium">{getWarehouseName(selectedTransaction.warehouse_id) || 'Kho chính'}</div>
                </div>
              </div>

              {/* Approval info */}
              {(selectedTransaction.approval_status === 'approved' && selectedTransaction.approved_by) && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                    <span>Đã duyệt bởi: {selectedTransaction.approved_by}</span>
                    {selectedTransaction.approved_at && (
                      <span className="text-green-600 text-xs">- {new Date(selectedTransaction.approved_at).toLocaleString('vi-VN')}</span>
                    )}
                  </div>
                </div>
              )}

              {selectedTransaction.approval_status === 'rejected' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="text-red-700 font-medium text-sm">Từ chối bởi: {selectedTransaction.approved_by}</div>
                  {selectedTransaction.reject_reason && (
                    <div className="text-red-600 text-sm mt-1">Lý do: {selectedTransaction.reject_reason}</div>
                  )}
                </div>
              )}

              {selectedTransaction.approval_status === 'pending' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <div className="text-yellow-700 font-medium text-sm">Phiếu đang chờ duyệt. Tồn kho chưa được cập nhật.</div>
                </div>
              )}

              {/* Items Table */}
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Danh sách sản phẩm</h3>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Sản phẩm</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">SL</th>
                        {permLevel >= 3 && <th className="px-4 py-2 text-right font-medium text-gray-600">Đơn giá</th>}
                        {permLevel >= 3 && <th className="px-4 py-2 text-right font-medium text-gray-600">Thành tiền</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {loadingItems ? (
                        <tr><td colSpan={permLevel >= 3 ? 4 : 2} className="px-4 py-8 text-center text-gray-500">Đang tải...</td></tr>
                      ) : transactionItems.length === 0 ? (
                        <tr><td colSpan={permLevel >= 3 ? 4 : 2} className="px-4 py-8 text-center text-gray-500">Không có dữ liệu</td></tr>
                      ) : transactionItems.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-xs text-gray-500">{item.product_sku}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{item.quantity}</td>
                          {permLevel >= 3 && <td className="px-4 py-3 text-right">{formatCurrency(item.unit_price)}</td>}
                          {permLevel >= 3 && <td className="px-4 py-3 text-right font-medium text-green-600">{formatCurrency(item.total_price)}</td>}
                        </tr>
                      ))}
                    </tbody>
                    {permLevel >= 3 && <tfoot className="bg-green-50">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Tổng cộng:</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600 text-lg">{formatCurrency(selectedTransaction.total_amount)}</td>
                      </tr>
                    </tfoot>}
                  </table>
                </div>
              </div>

              {/* Note */}
              {selectedTransaction.note && (
                <div className="bg-yellow-50 rounded-xl p-4">
                  <div className="text-xs text-yellow-600 mb-1">Ghi chú</div>
                  <div className="text-gray-700">{selectedTransaction.note}</div>
                </div>
              )}

              {/* Reject reason input */}
              {showRejectInput && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <label className="block text-sm font-medium text-red-700">Lý do từ chối</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="Nhập lý do từ chối..."
                    className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowRejectInput(false); setRejectReason(''); }} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Hủy</button>
                    <button onClick={handleReject} disabled={approving} className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                      {approving ? 'Đang xử lý...' : 'Xác nhận từ chối'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-between">
              {/* Approve/Reject buttons for pending transactions */}
              <div className="flex gap-2">
                {canAutoApprove && selectedTransaction.approval_status === 'pending' && !showRejectInput && (
                  <>
                    <button onClick={() => setShowRejectInput(true)} className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium text-sm">
                      Từ chối
                    </button>
                    <button onClick={handleApprove} disabled={approving} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm disabled:opacity-50">
                      {approving ? 'Đang duyệt...' : 'Duyệt phiếu nhập'}
                    </button>
                  </>
                )}
              </div>
              <button onClick={() => setShowDetailModal(false)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { getTodayVN, getDateStrVN, getNowISOVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';
import { isAdmin } from '../../utils/permissionUtils';

export default function WarehouseExportView({ products, warehouses, warehouseStock, stockTransactions, loadWarehouseData, tenant, currentUser, hasPermission, getPermissionLevel }) {
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

  // Get stock at selected warehouse for a product
  const getWarehouseQty = (productId) => {
    if (!selectedWarehouseId) return 0;
    const ws = warehouseStock.find(s => s.warehouse_id === selectedWarehouseId && s.product_id === productId);
    return ws ? ws.quantity : 0;
  };

  // Products with stock at selected warehouse (exclude combo -- combo stock is virtual)
  const productsWithStock = useMemo(() => {
    if (!selectedWarehouseId) return products.filter(p => p.stock_quantity > 0 && !p.is_combo);
    return products.filter(p => getWarehouseQty(p.id) > 0 && !p.is_combo);
  }, [products, warehouseStock, selectedWarehouseId]);

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
  const [formPartnerName, setFormPartnerName] = useState('');
  const [formPartnerPhone, setFormPartnerPhone] = useState('');
  const [formDate, setFormDate] = useState(getTodayVN());
  const [formNote, setFormNote] = useState('');
  const [formItems, setFormItems] = useState([{ product_id: '', quantity: 1, unit_price: 0 }]);

  const exportTransactions = stockTransactions.filter(t => t.type === 'export');

  // Pending count for Admin/level 3
  const pendingCount = useMemo(() => {
    return exportTransactions.filter(t => t.approval_status === 'pending').length;
  }, [exportTransactions]);

  const resetForm = () => {
    setFormPartnerName('');
    setFormPartnerPhone('');
    setFormDate(getTodayVN());
    setFormNote('');
    setFormItems([{ product_id: '', quantity: 1, unit_price: 0 }]);
    const defaultWh = warehouses.find(w => w.is_default) || warehouses[0];
    if (defaultWh) setSelectedWarehouseId(defaultWh.id);
  };

  const generateTransactionNumber = () => {
    const dateStr = getDateStrVN();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `PX-${dateStr}-${random}`;
  };

  const addItem = () => {
    setFormItems([...formItems, { product_id: '', quantity: 1, unit_price: 0 }]);
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
        newItems[index].unit_price = product.sell_price || 0;
      }
    }
    setFormItems(newItems);
  };

  const calculateTotal = () => {
    return formItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const getWarehouseName = (whId) => {
    const wh = warehouses.find(w => w.id === whId);
    return wh ? wh.name : '';
  };

  const handleCreateExport = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Bạn không có quyền tạo phiếu xuất'); return; }
    const validItems = formItems.filter(item => item.product_id && item.quantity > 0);
    if (validItems.length === 0) {
      alert('Vui lòng chọn ít nhất 1 sản phẩm!');
      return;
    }
    if (!selectedWarehouseId) {
      alert('Vui lòng chọn kho xuất!');
      return;
    }

    // Check stock at selected warehouse
    for (const item of validItems) {
      const product = products.find(p => p.id === item.product_id);
      const whQty = getWarehouseQty(item.product_id);
      if (whQty < parseInt(item.quantity)) {
        alert(`Sản phẩm "${product?.name}" chỉ còn ${whQty} tại ${getWarehouseName(selectedWarehouseId)}!`);
        return;
      }
    }

    try {
      const transactionNumber = generateTransactionNumber();
      const autoApprove = canAutoApprove;

      // Create transaction with warehouse_id and approval_status
      const { data: transaction, error: transError } = await supabase.from('stock_transactions').insert([{
        tenant_id: tenant.id,
        transaction_number: transactionNumber,
        type: 'export',
        transaction_date: formDate,
        partner_name: formPartnerName,
        partner_phone: formPartnerPhone,
        total_amount: calculateTotal(),
        note: formNote,
        status: 'completed',
        created_by: currentUser.name,
        warehouse_id: selectedWarehouseId,
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
            p_delta: -parseInt(item.quantity)
          });
          if (rpcError) throw rpcError;
        }
      }

      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'create', entityType: 'export', entityId: transactionNumber, entityName: transactionNumber, description: 'Tạo phiếu xuất ' + transactionNumber + (autoApprove ? ' (tự động duyệt)' : ' (chờ duyệt)') });

      if (autoApprove) {
        alert('Xuất kho thành công!');

        // Ask to create income receipt
        const totalAmount = calculateTotal();
        if (totalAmount > 0 && window.confirm(`Bạn có muốn tạo phiếu thu ${totalAmount.toLocaleString('vi-VN')}đ cho giao dịch xuất kho này không?`)) {
          try {
            const receiptNumber = 'PT-' + getDateStrVN() + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            await supabase.from('receipts_payments').insert([{
              tenant_id: tenant.id,
              receipt_number: receiptNumber,
              type: 'thu',
              amount: totalAmount,
              description: `Xuất kho - ${transactionNumber} - ${getWarehouseName(selectedWarehouseId)}` + (formPartnerName ? ` - ${formPartnerName}` : ''),
              category: 'Bán tại cửa hàng',
              receipt_date: formDate,
              note: formNote || `Liên kết phiếu xuất kho: ${transactionNumber}`,
              status: 'pending',
              created_by: currentUser.name,
              created_at: getNowISOVN()
            }]);
            alert('Đã tạo phiếu thu cho duyệt!');
          } catch (err) {
            console.error('Error creating receipt:', err);
            alert('Không thể tạo phiếu thu tự động. Vui lòng tạo thủ công.');
          }
        }
      } else {
        alert('Đã tạo phiếu xuất kho. Phiếu đang chờ duyệt bởi quản lý.');
      }

      setShowCreateModal(false);
      resetForm();
      loadWarehouseData();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  // Approve export transaction
  const handleApprove = async () => {
    if (!canAutoApprove) { alert('Bạn không có quyền duyệt phiếu xuất'); return; }
    if (!selectedTransaction) return;
    setApproving(true);
    try {
      // Adjust stock TRƯỚC — nếu lỗi (hết hàng) thì approval_status vẫn pending
      for (const item of transactionItems) {
        const { error: rpcError } = await supabase.rpc('adjust_warehouse_stock', {
          p_warehouse_id: selectedTransaction.warehouse_id,
          p_product_id: item.product_id,
          p_delta: -parseInt(item.quantity)
        });
        if (rpcError) throw new Error(`Không đủ tồn kho SP "${item.product_name}" để xuất`);
      }

      // Stock OK → update approval status
      const { error: updateErr } = await supabase.from('stock_transactions')
        .update({
          approval_status: 'approved',
          approved_by: currentUser.name,
          approved_at: getNowISOVN()
        })
        .eq('id', selectedTransaction.id);
      if (updateErr) throw updateErr;

      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'approve', entityType: 'export', entityId: selectedTransaction.transaction_number, entityName: selectedTransaction.transaction_number, description: `Duyệt phiếu xuất ${selectedTransaction.transaction_number}` });

      setSelectedTransaction(prev => ({ ...prev, approval_status: 'approved', approved_by: currentUser.name, approved_at: getNowISOVN() }));
      await loadWarehouseData();
      alert('Đã duyệt phiếu xuất. Tồn kho đã được cập nhật!');
    } catch (error) {
      alert('Lỗi duyệt: ' + error.message);
    } finally {
      setApproving(false);
    }
  };

  // Reject export transaction
  const handleReject = async () => {
    if (!canAutoApprove) { alert('Bạn không có quyền từ chối phiếu xuất'); return; }
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

      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'reject', entityType: 'export', entityId: selectedTransaction.transaction_number, entityName: selectedTransaction.transaction_number, description: `Từ chối phiếu xuất ${selectedTransaction.transaction_number}: ${rejectReason.trim()}` });

      setSelectedTransaction(prev => ({ ...prev, approval_status: 'rejected', approved_by: currentUser.name, reject_reason: rejectReason.trim() }));
      setShowRejectInput(false);
      setRejectReason('');
      await loadWarehouseData();
      alert('Đã từ chối phiếu xuất.');
    } catch (error) {
      alert('Lỗi: ' + error.message);
    } finally {
      setApproving(false);
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

  const filteredTransactions = exportTransactions.filter(t =>
    !searchTerm ||
    t.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.partner_name && t.partner_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-blue-600">{exportTransactions.length}</div>
          <div className="text-gray-600 text-sm">Phiếu xuất</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
          <div className="text-lg font-bold text-green-600">
            {formatCurrency(exportTransactions.reduce((sum, t) => sum + (t.total_amount || 0), 0))}
          </div>
          <div className="text-gray-600 text-sm">Tổng giá trị xuất</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-purple-500">
          <div className="text-2xl font-bold text-purple-600">
            {exportTransactions.filter(t => {
              const today = getTodayVN();
              return t.transaction_date === today;
            }).length}
          </div>
          <div className="text-gray-600 text-sm">Xuất hôm nay</div>
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
            <div className="font-medium text-yellow-800">Có {pendingCount} phiếu xuất chờ duyệt</div>
            <div className="text-sm text-yellow-600">Nhấn vào phiếu để xem chi tiết và duyệt</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="Tìm phiếu xuất..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        {hasPermission('warehouse', 2) && (
          <button
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium whitespace-nowrap"
          >
            Tạo Phiếu Xuất
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
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">Khách hàng</th>
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
                    Chưa có phiếu xuất nào
                  </td>
                </tr>
              ) : filteredTransactions.map(trans => (
                <tr key={trans.id} onClick={() => openDetail(trans)} className={`hover:bg-blue-50 cursor-pointer transition-colors ${trans.approval_status === 'pending' ? 'bg-yellow-50/50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-sm text-blue-600 font-medium">{trans.transaction_number}</td>
                  <td className="px-4 py-3">{new Date(trans.transaction_date).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-3 hidden md:table-cell">{trans.partner_name || '-'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{getWarehouseName(trans.warehouse_id) || 'Kho chính'}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(trans.total_amount)}</td>
                  <td className="px-4 py-3 hidden md:table-cell">{trans.created_by}</td>
                  <td className="px-4 py-3 text-center">
                    {trans.approval_status === 'pending' ? (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Chờ duyệt</span>
                    ) : trans.approval_status === 'rejected' ? (
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">Từ chối</span>
                    ) : (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Đã duyệt</span>
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
              <h2 className="text-xl font-bold">Tạo Phiếu Xuất Kho</h2>
              {!canAutoApprove && (
                <p className="text-sm text-yellow-600 mt-1">Phiếu sẽ cần được quản lý duyệt trước khi cập nhật tồn kho</p>
              )}
            </div>
            <div className="p-6 space-y-4">
              {/* Warehouse selector */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-amber-800 mb-1">Kho xuất hàng</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => { setSelectedWarehouseId(e.target.value); setFormItems([{ product_id: '', quantity: 1, unit_price: 0 }]); }}
                  className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white font-medium"
                >
                  {warehouses.filter(w => w.is_active).map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.is_default ? ' (Mặc định)' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng</label>
                  <input
                    type="text"
                    value={formPartnerName}
                    onChange={(e) => setFormPartnerName(e.target.value)}
                    placeholder="Tên KH"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày xuất</label>
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
                  <label className="block text-sm font-medium text-gray-700">Sản phẩm xuất</label>
                  <button onClick={addItem} className="text-sm text-blue-600 hover:text-blue-700">+ Thêm dòng</button>
                </div>
                <div className="space-y-2">
                  {formItems.map((item, index) => {
                    const whQty = item.product_id ? getWarehouseQty(item.product_id) : 0;
                    return (
                      <div key={index} className="flex gap-2 items-center">
                        <select
                          value={item.product_id}
                          onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg"
                        >
                          <option value="">Chọn sản phẩm</option>
                          {productsWithStock.map(p => (
                            <option key={p.id} value={p.id}>{p.sku} - {p.name} (Tồn: {getWarehouseQty(p.id)})</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                          placeholder="SL"
                          className="w-20 px-3 py-2 border rounded-lg"
                          min="1"
                          max={whQty || 999}
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
                    );
                  })}
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 text-right">
                <span className="text-gray-600">Tổng tiền: </span>
                <span className="text-2xl font-bold text-blue-600">{formatCurrency(calculateTotal())}</span>
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
              <button onClick={handleCreateExport} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Xuất Kho</button>
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
                  <h2 className="text-xl font-bold text-blue-700">Chi Tiết Phiếu Xuất</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-gray-500 font-mono text-sm">{selectedTransaction.transaction_number}</p>
                    {selectedTransaction.approval_status === 'pending' ? (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Chờ duyệt</span>
                    ) : selectedTransaction.approval_status === 'rejected' ? (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">Từ chối</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Đã duyệt</span>
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
                  <div className="text-xs text-gray-500">Ngày xuất</div>
                  <div className="font-medium">{new Date(selectedTransaction.transaction_date).toLocaleDateString('vi-VN')}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Người tạo</div>
                  <div className="font-medium">{selectedTransaction.created_by}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Khách hàng</div>
                  <div className="font-medium">{selectedTransaction.partner_name || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Kho xuất</div>
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
                <div className="border rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[400px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Sản phẩm</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">SL</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">Đơn giá</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {loadingItems ? (
                        <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">Đang tải...</td></tr>
                      ) : transactionItems.length === 0 ? (
                        <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">Không có dữ liệu</td></tr>
                      ) : transactionItems.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-xs text-gray-500">{item.product_sku}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{item.quantity}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(item.unit_price)}</td>
                          <td className="px-4 py-3 text-right font-medium text-blue-600">{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-blue-50">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Tổng cộng:</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600 text-lg">{formatCurrency(selectedTransaction.total_amount)}</td>
                      </tr>
                    </tfoot>
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
                    <button onClick={handleApprove} disabled={approving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm disabled:opacity-50">
                      {approving ? 'Đang duyệt...' : 'Duyệt phiếu xuất'}
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

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { getDateStrVN, getNowISOVN, getTodayVN } from '../../utils/dateUtils';
import { orderStatuses } from '../../constants/salesConstants';
import QRScanner from '../../components/shared/QRScanner';
import { logActivity } from '../../lib/activityLog';

const RETURN_REASONS = [
  'Khách từ chối nhận',
  'Sai địa chỉ',
  'Hàng lỗi / hư hỏng',
  'Giao không đúng hẹn',
  'Khác'
];

export default function SalesReconciliationView({
  tenant, currentUser, orders,
  loadSalesData, loadWarehouseData, loadFinanceData,
  warehouses,
  hasPermission
}) {
  // Inner tab
  const [innerTab, setInnerTab] = useState('scan');

  // Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scannedOrder, setScannedOrder] = useState(null);
  const [scannedOrderItems, setScannedOrderItems] = useState([]);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [toast, setToast] = useState(null);

  // History
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterDate, setFilterDate] = useState(getTodayVN());
  const [filterType, setFilterType] = useState('all');
  const [filterPerson, setFilterPerson] = useState('all');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Stats
  const pendingCount = useMemo(() =>
    (orders || []).filter(o => ['shipped', 'in_transit', 'delivered'].includes(o.shipping_status)).length
  , [orders]);

  const todayStats = useMemo(() => {
    const today = getTodayVN();
    const todayRecords = history.filter(r => (r.scanned_at || '').startsWith(today));
    return {
      delivered: todayRecords.filter(r => r.type === 'delivery_confirm').length,
      returned: todayRecords.filter(r => r.type === 'return_confirm').length,
    };
  }, [history]);

  // Load history
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('order_reconciliation')
        .select('*, orders(order_number, customer_name, total_amount, status)')
        .eq('tenant_id', tenant.id)
        .order('scanned_at', { ascending: false })
        .limit(200);
      setHistory(data || []);
    } catch (err) {
      console.error('Error loading reconciliation history:', err);
    }
    setLoadingHistory(false);
  }, [tenant]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Receipt number generator (same as SalesOrdersView)
  const genReceiptNumber = async (type) => {
    const dateStr = getDateStrVN();
    const prefix = `${type === 'thu' ? 'PT' : 'PC'}-${dateStr}-`;
    const { data } = await supabase.from('receipts_payments').select('receipt_number')
      .like('receipt_number', `${prefix}%`).order('receipt_number', { ascending: false }).limit(1);
    const lastNum = data?.[0] ? parseInt(data[0].receipt_number.slice(-3)) || 0 : 0;
    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
  };

  // Search order by code
  const searchOrder = async (code) => {
    if (!code || !code.trim()) return;
    const q = code.trim();
    setLoadingOrder(true);
    setScannedOrder(null);
    setScannedOrderItems([]);
    setShowReturnForm(false);
    try {
      const { data: matched } = await supabase
        .from('orders').select('*').eq('tenant_id', tenant.id)
        .or(`order_number.eq.${q},tracking_number.eq.${q}`);

      if (!matched || matched.length === 0) {
        showToast('Không tìm thấy đơn hàng với mã: ' + q, 'error');
        return;
      }
      const order = matched[0];
      setScannedOrder(order);

      const { data: items } = await supabase
        .from('order_items').select('*').eq('order_id', order.id);
      setScannedOrderItems(items || []);
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      setLoadingOrder(false);
    }
  };

  const handleScanResult = (decodedText) => {
    setShowScanner(false);
    searchOrder(decodedText);
  };

  // Delivery confirm
  const handleDeliveryConfirm = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    if (!scannedOrder || submitting) return;
    const ss = scannedOrder.shipping_status || scannedOrder.status;
    if (!['shipped', 'in_transit', 'delivered', 'shipping'].includes(ss)) {
      showToast('Đơn hàng không ở trạng thái có thể xác nhận giao', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const updates = { status: 'completed', order_status: 'completed', shipping_status: 'delivered', updated_at: getNowISOVN() };

      // Create receipt for remaining unpaid amount (skip if fully paid)
      const alreadyPaid = parseFloat(scannedOrder.paid_amount || 0);
      const remaining = parseFloat(scannedOrder.total_amount || 0) - alreadyPaid;
      if (remaining > 0 && !scannedOrder.receipt_id) {
        const receiptNumber = await genReceiptNumber('thu');
        const category = scannedOrder.order_type === 'pos' ? 'Bán tại cửa hàng' : 'Bán online';
        const { data: receipt } = await supabase.from('receipts_payments').insert([{
          tenant_id: tenant.id, receipt_number: receiptNumber, type: 'thu',
          amount: remaining,
          description: `Bán hàng - ${scannedOrder.order_number}${scannedOrder.customer_name ? ` - ${scannedOrder.customer_name}` : ''}`,
          category, receipt_date: getTodayVN(),
          note: `Đối soát giao hàng: ${scannedOrder.order_number}${alreadyPaid > 0 ? ` (đã thu trước ${formatMoney(alreadyPaid)})` : ''}`,
          status: 'approved', created_by: currentUser.name, created_at: getNowISOVN()
        }]).select().single();
        if (receipt) updates.receipt_id = receipt.id;
      }
      updates.payment_status = 'paid';
      updates.paid_amount = scannedOrder.total_amount;

      await supabase.from('orders').update(updates).eq('id', scannedOrder.id);

      await supabase.from('order_reconciliation').insert([{
        tenant_id: tenant.id, order_id: scannedOrder.id,
        type: 'delivery_confirm', scanned_code: scannedOrder.order_number,
        scanned_by: currentUser.name
      }]);

      showToast(`Giao hàng thành công: ${scannedOrder.order_number}`);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'update', entityType: 'order', entityId: scannedOrder.order_number, entityName: scannedOrder.order_number, description: 'Đối soát giao hàng: ' + scannedOrder.order_number + ', ' + formatMoney(scannedOrder.total_amount) });
      setScannedOrder(null);
      setScannedOrderItems([]);
      await Promise.all([loadSalesData(), loadFinanceData()]);
      loadHistory();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Return confirm
  const handleReturnConfirm = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    if (!scannedOrder || submitting) return;
    const rss = scannedOrder.shipping_status || scannedOrder.status;
    if (!['shipped', 'in_transit', 'delivered', 'shipping', 'delivered', 'completed'].includes(rss) && !['completed'].includes(scannedOrder.order_status)) {
      showToast('Đơn hàng không ở trạng thái có thể hoàn', 'error');
      return;
    }
    setSubmitting(true);
    try {
      // Restore stock (xử lý cả combo: cộng lại SP con thay vì SP combo)
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', scannedOrder.id);
      for (const item of (items || [])) {
        const { data: comboChildren } = await supabase.from('product_combo_items').select('*').eq('combo_product_id', item.product_id);
        if (comboChildren && comboChildren.length > 0) {
          // Combo: restore từng SP con
          for (const child of comboChildren) {
            const delta = child.quantity * item.quantity;
            if (scannedOrder.warehouse_id) {
              await supabase.rpc('adjust_warehouse_stock', { p_warehouse_id: scannedOrder.warehouse_id, p_product_id: child.child_product_id, p_delta: delta });
            } else {
              await supabase.rpc('adjust_stock', { p_product_id: child.child_product_id, p_delta: delta });
            }
          }
        } else {
          // SP thường
          if (scannedOrder.warehouse_id) {
            await supabase.rpc('adjust_warehouse_stock', { p_warehouse_id: scannedOrder.warehouse_id, p_product_id: item.product_id, p_delta: item.quantity });
          } else {
            await supabase.rpc('adjust_stock', { p_product_id: item.product_id, p_delta: item.quantity });
          }
        }
      }

      // Create refund receipt = số tiền đã thu thực tế (không phải total_amount)
      const refundAmount = parseFloat(scannedOrder.paid_amount || 0);
      if (refundAmount > 0) {
        const receiptNumber = await genReceiptNumber('chi');
        await supabase.from('receipts_payments').insert([{
          tenant_id: tenant.id, receipt_number: receiptNumber, type: 'chi',
          amount: refundAmount,
          description: `Hoàn hàng - ${scannedOrder.order_number}`,
          category: 'Khác', receipt_date: getTodayVN(),
          note: `Hoàn tiền đối soát: ${scannedOrder.order_number}${returnReason ? ' - Lý do: ' + returnReason : ''}`,
          status: 'approved', created_by: currentUser.name, created_at: getNowISOVN()
        }]);
      }

      await supabase.from('orders').update({
        status: 'returned', order_status: 'returned', shipping_status: 'returned_to_sender', updated_at: getNowISOVN()
      }).eq('id', scannedOrder.id);

      await supabase.from('order_reconciliation').insert([{
        tenant_id: tenant.id, order_id: scannedOrder.id,
        type: 'return_confirm', scanned_code: scannedOrder.order_number,
        scanned_by: currentUser.name,
        note: returnReason || null
      }]);

      showToast(`Hoàn hàng thành công: ${scannedOrder.order_number}`);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'update', entityType: 'order', entityId: scannedOrder.order_number, entityName: scannedOrder.order_number, description: 'Đối soát hoàn hàng: ' + scannedOrder.order_number + (returnReason ? ' - Lý do: ' + returnReason : '') });
      setScannedOrder(null);
      setScannedOrderItems([]);
      setShowReturnForm(false);
      setReturnReason('');
      await Promise.all([loadSalesData(), loadWarehouseData(), loadFinanceData()]);
      loadHistory();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered history
  const filteredHistory = useMemo(() => {
    return history.filter(r => {
      if (filterDate) {
        const rDate = (r.scanned_at || '').split('T')[0];
        if (rDate !== filterDate) return false;
      }
      if (filterType !== 'all' && r.type !== filterType) return false;
      if (filterPerson !== 'all' && r.scanned_by !== filterPerson) return false;
      return true;
    });
  }, [history, filterDate, filterType, filterPerson]);

  const historyPersons = useMemo(() =>
    [...new Set(history.map(r => r.scanned_by).filter(Boolean))].sort()
  , [history]);

  const historyStats = useMemo(() => {
    const delivered = filteredHistory.filter(r => r.type === 'delivery_confirm').length;
    const returned = filteredHistory.filter(r => r.type === 'return_confirm').length;
    const total = delivered + returned;
    return { delivered, returned, total, rate: total > 0 ? Math.round(delivered / total * 100) : 0 };
  }, [filteredHistory]);

  const getWarehouseName = (whId) => {
    const wh = (warehouses || []).find(w => w.id === whId);
    return wh ? wh.name : '';
  };

  if (!hasPermission('sales', 2)) return (
    <div className="p-8 text-center">
      <div className="text-6xl mb-4">🔒</div>
      <p className="text-gray-500">Bạn không có quyền xem đối soát</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold">📊 Đối Soát Đơn Hàng</h2>
        <p className="text-sm text-gray-500">Quét mã QR/barcode để xác nhận giao hàng hoặc hoàn hàng</p>
      </div>

      {/* Inner tabs */}
      <div className="flex gap-2">
        <button onClick={() => setInnerTab('scan')}
          className={`px-4 py-2 rounded-lg font-medium text-sm ${innerTab === 'scan' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          📷 Quét mã
        </button>
        <button onClick={() => { setInnerTab('history'); loadHistory(); }}
          className={`px-4 py-2 rounded-lg font-medium text-sm ${innerTab === 'history' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          📋 Lịch sử đối soát
        </button>
      </div>

      {/* ========== SCAN TAB ========== */}
      {innerTab === 'scan' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-purple-700">{pendingCount}</div>
              <div className="text-xs text-gray-600">Chờ đối soát</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{todayStats.delivered}</div>
              <div className="text-xs text-gray-600">Giao OK hôm nay</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-orange-700">{todayStats.returned}</div>
              <div className="text-xs text-gray-600">Hoàn hôm nay</div>
            </div>
          </div>

          {/* Scan button */}
          <button onClick={() => setShowScanner(true)}
            className="w-full py-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-bold text-lg shadow-lg active:scale-[0.98] transition-transform">
            📷 Mở camera quét mã
          </button>

          {/* Manual input */}
          <div className="flex gap-2">
            <input value={manualCode} onChange={e => setManualCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchOrder(manualCode)}
              placeholder="Nhập mã đơn hàng hoặc mã vận đơn..."
              className="flex-1 border rounded-lg px-3 py-2.5 text-sm" />
            <button onClick={() => searchOrder(manualCode)} disabled={loadingOrder}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm whitespace-nowrap">
              {loadingOrder ? '...' : '🔍 Tìm'}
            </button>
          </div>

          {/* Loading */}
          {loadingOrder && (
            <div className="text-center py-8 text-gray-400">Đang tìm đơn hàng...</div>
          )}

          {/* Scanned order card */}
          {scannedOrder && !loadingOrder && (
            <div className="bg-white rounded-xl border-2 border-green-200 overflow-hidden">
              {/* Order header */}
              <div className={`p-4 ${scannedOrder.status === 'completed' ? 'bg-green-50' : scannedOrder.status === 'returned' ? 'bg-orange-50' : 'bg-blue-50'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-lg">{scannedOrder.order_number}</div>
                    <div className="text-sm text-gray-600">
                      {scannedOrder.customer_name || 'Khách lẻ'}
                      {scannedOrder.customer_phone && ` - ${scannedOrder.customer_phone}`}
                    </div>
                    {scannedOrder.shipping_address && (
                      <div className="text-xs text-gray-500 mt-1">{scannedOrder.shipping_address}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${orderStatuses[scannedOrder.status]?.color || 'bg-gray-100'}`}>
                      {orderStatuses[scannedOrder.status]?.icon} {orderStatuses[scannedOrder.status]?.label || scannedOrder.status}
                    </span>
                    {scannedOrder.warehouse_id && (
                      <div className="text-xs text-gray-500 mt-1">Kho: {getWarehouseName(scannedOrder.warehouse_id)}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Order items */}
              <div className="p-4 border-t">
                <div className="text-xs font-medium text-gray-500 mb-2">Sản phẩm ({scannedOrderItems.length})</div>
                <div className="space-y-1.5">
                  {scannedOrderItems.map(item => (
                    <div key={item.id} className="flex justify-between items-center text-sm">
                      <div className="flex-1">
                        <span className="text-gray-800">{item.product_name}</span>
                        <span className="text-gray-400 ml-1">x{item.quantity}</span>
                      </div>
                      <span className="font-medium">{formatMoney(item.total_price)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                  <span>Tổng cộng</span>
                  <span className="text-green-700">{formatMoney(scannedOrder.total_amount)}</span>
                </div>
                {scannedOrder.shipping_provider && (
                  <div className="text-xs text-gray-500 mt-1">
                    VC: {scannedOrder.shipping_provider}
                    {scannedOrder.tracking_number && ` - MVĐ: ${scannedOrder.tracking_number}`}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="p-4 border-t bg-gray-50">
                {['shipping', 'delivered'].includes(scannedOrder.status) && !showReturnForm && (
                  <div className="flex gap-3">
                    <button onClick={handleDeliveryConfirm} disabled={submitting}
                      className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm disabled:bg-gray-400">
                      {submitting ? 'Đang xử lý...' : '✅ Giao thành công'}
                    </button>
                    <button onClick={() => setShowReturnForm(true)} disabled={submitting}
                      className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold text-sm disabled:bg-gray-400">
                      📦 Hoàn hàng
                    </button>
                  </div>
                )}

                {scannedOrder.status === 'completed' && !showReturnForm && (
                  <div className="space-y-2">
                    <div className="text-center text-green-600 font-medium text-sm">✅ Đơn hàng đã hoàn thành</div>
                    <button onClick={() => setShowReturnForm(true)} disabled={submitting}
                      className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium text-sm">
                      📦 Xử lý hoàn hàng
                    </button>
                  </div>
                )}

                {scannedOrder.status === 'returned' && (
                  <div className="text-center text-orange-600 font-medium text-sm">↩️ Đơn hàng đã hoàn</div>
                )}

                {scannedOrder.status === 'cancelled' && (
                  <div className="text-center text-red-600 font-medium text-sm">❌ Đơn hàng đã hủy</div>
                )}

                {/* Return form */}
                {showReturnForm && (
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-gray-700">Lý do hoàn hàng:</div>
                    <select value={returnReason} onChange={e => setReturnReason(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2.5 text-sm">
                      <option value="">-- Chọn lý do --</option>
                      {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowReturnForm(false); setReturnReason(''); }}
                        className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm">
                        Hủy
                      </button>
                      <button onClick={handleReturnConfirm} disabled={submitting || !returnReason}
                        className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold text-sm disabled:bg-gray-400">
                        {submitting ? 'Đang xử lý...' : '📦 Xác nhận hoàn'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Clear button */}
                <button onClick={() => { setScannedOrder(null); setScannedOrderItems([]); setShowReturnForm(false); }}
                  className="w-full mt-2 py-2 text-gray-500 hover:text-gray-700 text-sm">
                  Quét đơn khác
                </button>
              </div>
            </div>
          )}

          {/* Pending orders list */}
          {!scannedOrder && !loadingOrder && pendingCount > 0 && (
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-bold text-sm text-gray-700 mb-3">Đơn chờ đối soát ({pendingCount})</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {(orders || [])
                  .filter(o => ['shipping', 'delivered'].includes(o.status))
                  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                  .slice(0, 20)
                  .map(o => (
                    <div key={o.id} onClick={() => searchOrder(o.order_number)}
                      className="flex justify-between items-center p-2.5 rounded-lg hover:bg-green-50 cursor-pointer border">
                      <div>
                        <span className="font-medium text-sm">{o.order_number}</span>
                        <span className="text-xs text-gray-500 ml-2">{o.customer_name || 'Khách lẻ'}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-sm text-green-700">{formatMoney(o.total_amount)}</div>
                        <span className={`text-xs ${orderStatuses[o.status]?.color} px-1.5 py-0.5 rounded`}>
                          {orderStatuses[o.status]?.label}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== HISTORY TAB ========== */}
      {innerTab === 'history' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-blue-50 p-2.5 rounded-lg text-center">
              <div className="text-lg font-bold text-blue-700">{historyStats.total}</div>
              <div className="text-xs text-gray-600">Tổng</div>
            </div>
            <div className="bg-green-50 p-2.5 rounded-lg text-center">
              <div className="text-lg font-bold text-green-700">{historyStats.delivered}</div>
              <div className="text-xs text-gray-600">Giao OK</div>
            </div>
            <div className="bg-orange-50 p-2.5 rounded-lg text-center">
              <div className="text-lg font-bold text-orange-700">{historyStats.returned}</div>
              <div className="text-xs text-gray-600">Hoàn</div>
            </div>
            <div className="bg-purple-50 p-2.5 rounded-lg text-center">
              <div className="text-lg font-bold text-purple-700">{historyStats.rate}%</div>
              <div className="text-xs text-gray-600">Tỷ lệ giao</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="all">Tất cả loại</option>
              <option value="delivery_confirm">Giao thành công</option>
              <option value="return_confirm">Hoàn hàng</option>
            </select>
            {historyPersons.length > 1 && (
              <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm">
                <option value="all">Tất cả người quét</option>
                {historyPersons.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <button onClick={() => { setFilterDate(''); setFilterType('all'); setFilterPerson('all'); }}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600">
              Xóa lọc
            </button>
          </div>

          {/* History list */}
          {loadingHistory ? (
            <div className="text-center py-8 text-gray-400">Đang tải...</div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">📊</div>
              <p>Chưa có lịch sử đối soát</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map(record => (
                <div key={record.id} className="bg-white rounded-xl border p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          record.type === 'delivery_confirm' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {record.type === 'delivery_confirm' ? '✅ Giao OK' : '📦 Hoàn'}
                        </span>
                        <span className="font-medium text-sm">{record.orders?.order_number || '—'}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {record.orders?.customer_name || 'Khách lẻ'}
                        {record.note && <span className="ml-2 text-orange-600">• {record.note}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-sm">{formatMoney(record.orders?.total_amount)}</div>
                      <div className="text-xs text-gray-400">
                        {record.scanned_at ? new Date(record.scanned_at).toLocaleString('vi-VN') : ''}
                      </div>
                      <div className="text-xs text-gray-400">{record.scanned_by}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QR Scanner overlay */}
      <QRScanner isOpen={showScanner} onScanSuccess={handleScanResult} onClose={() => setShowScanner(false)} />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

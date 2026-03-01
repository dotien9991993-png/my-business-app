import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { getNowISOVN } from '../../utils/dateUtils';
import { orderStatuses } from '../../constants/salesConstants';
import * as vtpApi from '../../utils/viettelpostApi';

export default function SalesShippingView({ tenant, currentUser: _currentUser, loadSalesData, shippingConfigs, getSettingValue, hasPermission }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [trackingEvents, setTrackingEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [sendingVtp, setSendingVtp] = useState(null);
  const [toast, setToast] = useState(null);

  const vtpConfig = (shippingConfigs || []).find(c => c.provider === 'viettel_post' && c.is_active && c.api_token);
  const vtpToken = vtpConfig?.api_token;

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load shipping orders (status: confirmed, packing, shipping, delivered)
  const loadOrders = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      let query = supabase.from('orders').select('*')
        .eq('tenant_id', tenant.id)
        .eq('order_type', 'online')
        .in('shipping_status', ['pending', 'packing', 'shipped', 'in_transit', 'delivered', 'delivery_failed'])
        .order('created_at', { ascending: false });

      if (filterStartDate) query = query.gte('created_at', filterStartDate + 'T00:00:00');
      if (filterEndDate) query = query.lte('created_at', filterEndDate + 'T23:59:59');

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Load shipping orders error:', err);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, filterStartDate, filterEndDate]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Load tracking events for selected order
  const loadTrackingEvents = async (orderId) => {
    setLoadingEvents(true);
    try {
      const { data } = await supabase.from('shipping_tracking_events')
        .select('*').eq('order_id', orderId)
        .order('event_time', { ascending: false });
      setTrackingEvents(data || []);
    } catch (err) { console.error(err); }
    finally { setLoadingEvents(false); }
  };

  // Stats
  const stats = useMemo(() => {
    const all = orders;
    return {
      waiting: all.filter(o => ['pending', 'packing'].includes(o.shipping_status)).length,
      shipping: all.filter(o => ['shipped', 'in_transit'].includes(o.shipping_status)).length,
      delivered: all.filter(o => o.shipping_status === 'delivered').length,
      totalCod: all.filter(o => ['shipped', 'in_transit'].includes(o.shipping_status)).reduce((sum, o) => sum + ((o.total_amount || 0) - (o.paid_amount || 0)), 0),
    };
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (filterStatus === 'waiting') result = result.filter(o => ['pending', 'packing'].includes(o.shipping_status));
    else if (filterStatus === 'shipping') result = result.filter(o => ['shipped', 'in_transit'].includes(o.shipping_status));
    else if (filterStatus === 'delivered') result = result.filter(o => o.shipping_status === 'delivered');
    else if (filterStatus !== 'all') result = result.filter(o => o.shipping_status === filterStatus);
    if (filterProvider !== 'all') result = result.filter(o => o.shipping_provider === filterProvider);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(o =>
        (o.order_number || '').toLowerCase().includes(s) ||
        (o.customer_name || '').toLowerCase().includes(s) ||
        (o.tracking_number || '').toLowerCase().includes(s)
      );
    }
    return result;
  }, [orders, filterStatus, filterProvider, search]);

  // Unique providers from orders
  const providers = useMemo(() => {
    return [...new Set(orders.map(o => o.shipping_provider).filter(Boolean))];
  }, [orders]);

  // Send to VTP
  const handleSendVtp = async (order) => {
    if (!vtpToken || sendingVtp) return;
    const sender = getSettingValue ? getSettingValue('shipping', 'vtp_sender_address', null) : null;
    if (!sender?.province_id) return alert('Chưa cấu hình địa chỉ lấy hàng VTP trong Cài đặt > Vận chuyển');
    const meta = order.shipping_metadata || {};
    if (!meta.province_id) return alert('Đơn hàng chưa có thông tin địa chỉ VTP');

    setSendingVtp(order.id);
    try {
      // Load order items
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
      const orderItems = items || [];
      const totalWeight = order.total_weight || orderItems.reduce((sum, i) => sum + (i.quantity || 1) * 500, 0);
      const codAmount = order.payment_status === 'paid' ? 0 : (order.total_amount - (order.paid_amount || 0));

      const result = await vtpApi.createOrder(vtpToken, {
        partnerOrderNumber: order.order_number,
        senderName: sender.name, senderPhone: sender.phone, senderAddress: sender.address,
        senderProvince: Number(sender.province_id), senderDistrict: Number(sender.district_id), senderWard: Number(sender.ward_id || 0),
        receiverName: order.customer_name || 'Khách hàng',
        receiverPhone: order.customer_phone || '',
        receiverAddress: order.shipping_address || '',
        receiverProvince: Number(meta.province_id), receiverDistrict: Number(meta.district_id), receiverWard: Number(meta.ward_id || 0),
        productName: orderItems.map(i => i.product_name).join(', ').slice(0, 200) || 'Hàng hóa',
        productQuantity: orderItems.reduce((s, i) => s + i.quantity, 0),
        productWeight: totalWeight, productPrice: order.total_amount,
        codAmount, orderService: order.shipping_service || 'VCN',
        orderNote: order.note || '',
        items: orderItems
      });

      if (result.success && result.data) {
        const vtpCode = result.data.ORDER_NUMBER || result.data.order_code || '';
        const newMeta = { ...meta, vtp_order_code: vtpCode };
        await supabase.from('orders').update({
          tracking_number: vtpCode,
          shipping_metadata: newMeta,
          status: 'shipping',
          order_status: 'confirmed',
          shipping_status: 'shipped',
          updated_at: getNowISOVN()
        }).eq('id', order.id);

        // Insert tracking event
        await supabase.from('shipping_tracking_events').insert([{
          tenant_id: tenant.id, order_id: order.id,
          tracking_number: vtpCode, status: 'created',
          description: 'Đã tạo đơn Viettel Post', source: 'vtp_api'
        }]);

        // Auto-create COD record
        if (codAmount > 0) {
          await supabase.from('cod_reconciliation').insert([{
            tenant_id: tenant.id, order_id: order.id,
            order_number: order.order_number, shipping_provider: 'Viettel Post',
            tracking_number: vtpCode, cod_amount: codAmount, status: 'pending'
          }]);
        }

        showToast(`Đã gửi VTP: ${vtpCode}`);
        loadOrders();
      } else {
        alert('Lỗi tạo đơn VTP: ' + (result.error || 'Không xác định'));
      }
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setSendingVtp(null); }
  };

  // Refresh VTP tracking
  const handleRefreshTracking = async (order) => {
    if (!vtpToken || !order.shipping_metadata?.vtp_order_code) return;
    try {
      const result = await vtpApi.getOrderDetail(vtpToken, order.shipping_metadata.vtp_order_code);
      if (result.success && result.data) {
        const statusText = result.data.STATUS_NAME || result.data.status_name || '';
        const newMeta = { ...order.shipping_metadata, vtp_status: statusText };
        await supabase.from('orders').update({ shipping_metadata: newMeta, updated_at: getNowISOVN() }).eq('id', order.id);

        // Insert tracking event
        await supabase.from('shipping_tracking_events').insert([{
          tenant_id: tenant.id, order_id: order.id,
          tracking_number: order.shipping_metadata.vtp_order_code,
          status: statusText, description: `VTP: ${statusText}`, source: 'vtp_api'
        }]);

        showToast('Đã cập nhật tracking');
        loadOrders();
        if (selectedOrder?.id === order.id) loadTrackingEvents(order.id);
      }
    } catch (err) { console.error(err); }
  };

  // Mark as delivered
  const handleMarkDelivered = async (order) => {
    if (!window.confirm(`Đánh dấu đơn ${order.order_number} đã giao?`)) return;
    try {
      await supabase.from('orders').update({ status: 'delivered', shipping_status: 'delivered', updated_at: getNowISOVN() }).eq('id', order.id);
      await supabase.from('shipping_tracking_events').insert([{
        tenant_id: tenant.id, order_id: order.id,
        tracking_number: order.tracking_number,
        status: 'delivered', description: 'Đánh dấu đã giao hàng', source: 'manual'
      }]);
      showToast('Đã cập nhật trạng thái');
      loadOrders();
      if (loadSalesData) loadSalesData();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-yellow-700">{stats.waiting}</div>
          <div className="text-xs text-yellow-600">Chờ gửi VC</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-purple-700">{stats.shipping}</div>
          <div className="text-xs text-purple-600">Đang giao</div>
        </div>
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-cyan-700">{stats.delivered}</div>
          <div className="text-xs text-cyan-600">Đã giao</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-700">{formatMoney(stats.totalCod)}</div>
          <div className="text-xs text-green-600">COD đang giao</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm mã đơn, KH, mã vận đơn..."
          className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="all">Tất cả TT</option>
          <option value="waiting">Chờ gửi VC</option>
          <option value="shipping">Đang giao</option>
          <option value="delivered">Đã giao</option>
        </select>
        <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="all">Tất cả VC</option>
          {providers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Đang tải...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-400">Không có đơn hàng nào</div>
      ) : (
        <div className="space-y-2">
          {filteredOrders.map(order => {
            const codAmount = (order.total_amount || 0) - (order.paid_amount || 0);
            const vtpCode = order.shipping_metadata?.vtp_order_code;
            const vtpStatus = order.shipping_metadata?.vtp_status;
            const canSendVtp = order.shipping_provider === 'Viettel Post' && vtpToken &&
              ['confirmed', 'packing'].includes(order.status) && !vtpCode;

            return (
              <div key={order.id} className="bg-white border rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{order.order_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${orderStatuses[order.status]?.color}`}>
                      {orderStatuses[order.status]?.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString('vi-VN')}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-700">{order.customer_name || 'Khách lẻ'}</span>
                    {order.customer_phone && <span className="text-gray-400 ml-1">• {order.customer_phone}</span>}
                  </div>
                  <span className="font-medium text-green-700">{formatMoney(order.total_amount)}</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {order.shipping_provider && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">{order.shipping_provider}</span>
                  )}
                  {order.tracking_number && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">MVĐ: {order.tracking_number}</span>
                  )}
                  {vtpCode && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">VTP: {vtpCode}</span>
                  )}
                  {vtpStatus && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{vtpStatus}</span>
                  )}
                  {codAmount > 0 && (
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">COD: {formatMoney(codAmount)}</span>
                  )}
                </div>

                {/* Actions */}
                {hasPermission('sales', 2) && (
                  <div className="flex gap-2 flex-wrap">
                    {canSendVtp && (
                      <button onClick={() => handleSendVtp(order)} disabled={sendingVtp === order.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white ${sendingVtp === order.id ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}>
                        {sendingVtp === order.id ? 'Đang gửi...' : '📦 Gửi VTP'}
                      </button>
                    )}
                    {vtpCode && (
                      <button onClick={() => handleRefreshTracking(order)}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200">
                        🔄 Cập nhật tracking
                      </button>
                    )}
                    {order.status === 'shipping' && (
                      <button onClick={() => handleMarkDelivered(order)}
                        className="px-3 py-1.5 bg-cyan-100 text-cyan-700 rounded-lg text-xs font-medium hover:bg-cyan-200">
                        📬 Đã giao
                      </button>
                    )}
                    <button onClick={() => { setSelectedOrder(order); loadTrackingEvents(order.id); }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200">
                      📋 Timeline
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tracking timeline modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-lg w-full my-4">
            <div className="p-4 border-b bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-t-xl flex justify-between items-center">
              <div>
                <h3 className="font-bold">Timeline vận chuyển</h3>
                <div className="text-sm text-purple-200">{selectedOrder.order_number}</div>
              </div>
              <button onClick={() => { setSelectedOrder(null); setTrackingEvents([]); }} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-4">
              {/* Order info */}
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
                <div><span className="font-medium">KH:</span> {selectedOrder.customer_name || 'Khách lẻ'} {selectedOrder.customer_phone && `• ${selectedOrder.customer_phone}`}</div>
                <div><span className="font-medium">VC:</span> {selectedOrder.shipping_provider} {selectedOrder.tracking_number && `• MVĐ: ${selectedOrder.tracking_number}`}</div>
                <div><span className="font-medium">Địa chỉ:</span> {selectedOrder.shipping_address || '—'}</div>
              </div>

              {/* Timeline */}
              {loadingEvents ? (
                <div className="text-center py-4 text-gray-400">Đang tải...</div>
              ) : trackingEvents.length === 0 ? (
                <div className="text-center py-4 text-gray-400">Chưa có sự kiện nào</div>
              ) : (
                <div className="space-y-3">
                  {trackingEvents.map((event, idx) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {idx < trackingEvents.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
                      </div>
                      <div className="flex-1 pb-3">
                        <div className="text-sm font-medium">{event.description || event.status}</div>
                        {event.location && <div className="text-xs text-gray-500">{event.location}</div>}
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(event.event_time).toLocaleString('vi-VN')}
                          {event.source === 'vtp_api' && <span className="ml-1 text-red-500">(VTP)</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import { formatMoney } from '../../utils/formatUtils';
import { getDateStrVN, getNowISOVN, getTodayVN } from '../../utils/dateUtils';
import { orderStatuses, orderStatusFlow, orderTypes, paymentMethods, shippingProviders, shippingPayers, paymentStatuses, orderSources, shippingServices, orderStatusValues, shippingStatusValues, paymentStatusValues, orderStatusFlow3 } from '../../constants/salesConstants';
import QRCode from 'qrcode';
import AddressPicker from '../../components/shared/AddressPicker';
import QRScanner from '../../components/shared/QRScanner';
import * as vtpApi from '../../utils/viettelpostApi';
import HaravanImportModal from './HaravanImportModal';
import { logActivity } from '../../lib/activityLog';
import { sendOrderConfirmation, sendShippingNotification } from '../../utils/zaloAutomation';

export default function SalesOrdersView({ tenant, currentUser, orders, customers, products, customerAddresses, loadSalesData, loadWarehouseData, loadFinanceData, createTechnicalJob: _createTechnicalJob, warehouses, warehouseStock, dynamicShippingProviders, shippingConfigs, getSettingValue, comboItems, productVariants, hasPermission, canEdit: _canEditSales, getPermissionLevel, filterByPermission: _filterByPermission }) {
  const { pendingOpenRecord, setPendingOpenRecord, allUsers } = useApp();
  const permLevel = getPermissionLevel('sales');
  const _effectiveShippingProviders = dynamicShippingProviders || shippingProviders;
  const vtpConfig = (shippingConfigs || []).find(c => c.provider === 'viettel_post' && c.is_active && c.api_token);
  const vtpToken = vtpConfig?.api_token;
  // ---- View state ----
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOrderStatus, setFilterOrderStatus] = useState('all');
  const [filterShippingStatus, setFilterShippingStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [showPaymentInput, setShowPaymentInput] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  // Return state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnItems, setReturnItems] = useState([]);
  const [returnReason, setReturnReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [orderReturns, setOrderReturns] = useState([]);
  // Exchange state
  const [statusLogs, setStatusLogs] = useState([]);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [exchangeReturnItems, setExchangeReturnItems] = useState([]);
  const [exchangeNewItems, setExchangeNewItems] = useState([]);
  const [exchangeProductSearch, setExchangeProductSearch] = useState('');
  const [exchangeReason, setExchangeReason] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterCreatedBy, setFilterCreatedBy] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterShipping, setFilterShipping] = useState('all');
  const [showHaravanImport, setShowHaravanImport] = useState(false);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  // Bulk selection state
  const [checkedOrderIds, setCheckedOrderIds] = useState(new Set());
  const [showBulkVtpModal, setShowBulkVtpModal] = useState(false);
  const [bulkVtpService, setBulkVtpService] = useState('VCN');
  const [bulkVtpPayer, setBulkVtpPayer] = useState('receiver');
  const [bulkVtpCod, setBulkVtpCod] = useState('cod');
  const [bulkVtpProgress, setBulkVtpProgress] = useState(null); // { current, total, results: [] }
  const [vtpServicesList, setVtpServicesList] = useState([]); // real services from API
  const [loadingVtpServices, setLoadingVtpServices] = useState(false);

  // Server-side pagination state
  const [serverOrders, setServerOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState({ total: 0, waiting_confirm: 0, not_shipped: 0, shipping: 0, completed: 0 });
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [pageItemsMap, setPageItemsMap] = useState({});

  // Debounce search input → search (400ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Auto-select default warehouse
  React.useEffect(() => {
    if ((warehouses || []).length > 0 && !selectedWarehouseId) {
      const defaultWh = warehouses.find(w => w.is_default) || warehouses[0];
      setSelectedWarehouseId(defaultWh.id);
    }
  }, [warehouses]);

  // Get stock at selected warehouse for a product
  const getWarehouseQty = useCallback((productId) => {
    if (!selectedWarehouseId || !(warehouseStock || []).length) return null;
    const ws = warehouseStock.find(s => s.warehouse_id === selectedWarehouseId && s.product_id === productId);
    return ws ? ws.quantity : 0;
  }, [selectedWarehouseId, warehouseStock]);

  const getWarehouseName = (whId) => {
    const wh = (warehouses || []).find(w => w.id === whId);
    return wh ? wh.name : '';
  };

  // Tính tồn kho combo = MIN(tồn SP con / qty trong combo)
  const getComboStock = useCallback((productId) => {
    const items = (comboItems || []).filter(ci => ci.combo_product_id === productId);
    if (items.length === 0) return 0;
    return Math.min(...items.map(ci => {
      const child = products.find(p => p.id === ci.child_product_id);
      const childStock = getWarehouseQty(child?.id) ?? (child?.stock_quantity || 0);
      return Math.floor(childStock / ci.quantity);
    }));
  }, [comboItems, products, getWarehouseQty]);

  // Lấy danh sách SP con của combo (dùng cho tooltip)
  const getComboChildrenLabel = useCallback((productId) => {
    const items = (comboItems || []).filter(ci => ci.combo_product_id === productId);
    return items.map(ci => {
      const child = products.find(p => p.id === ci.child_product_id);
      return `${child?.name || '?'} x${ci.quantity}`;
    }).join(', ');
  }, [comboItems, products]);

  // ---- Server-side paginated orders ----
  const PAGE_SIZE = 50;

  const loadPagedOrders = useCallback(async () => {
    if (!tenant?.id) return;
    setLoadingOrders(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const applyFilters = (query) => {
        query = query.eq('tenant_id', tenant.id);
        if (permLevel === 1) query = query.eq('created_by', currentUser.name);
        if (filterStatus !== 'all') query = query.eq('status', filterStatus);
        if (filterOrderStatus !== 'all') query = query.eq('order_status', filterOrderStatus);
        if (filterShippingStatus !== 'all') query = query.eq('shipping_status', filterShippingStatus);
        if (filterType !== 'all') query = query.eq('order_type', filterType);
        if (filterPayment !== 'all') {
          // Support both partial and partial_paid
          if (filterPayment === 'partial_paid') {
            query = query.in('payment_status', ['partial', 'partial_paid']);
          } else {
            query = query.eq('payment_status', filterPayment);
          }
        }
        if (filterCreatedBy !== 'all') query = query.eq('created_by', filterCreatedBy);
        if (filterSource !== 'all') query = query.eq('order_source', filterSource);
        if (filterShipping === 'not_shipped') {
          query = query.in('shipping_status', ['pending', 'packing']).is('tracking_number', null);
        } else if (filterShipping === 'shipped') {
          query = query.not('tracking_number', 'is', null);
        } else if (filterShipping === 'shipping') {
          query = query.in('shipping_status', ['shipped', 'in_transit']);
        } else if (filterShipping === 'delivered') {
          query = query.eq('shipping_status', 'delivered');
        } else if (filterShipping === 'returning') {
          query = query.in('shipping_status', ['returned_to_sender', 'delivery_failed']);
        }
        if (filterStartDate) query = query.gte('created_at', filterStartDate);
        if (filterEndDate) query = query.lte('created_at', filterEndDate + 'T23:59:59');
        if (search.trim()) {
          const q = search.trim().replace(/[,%]/g, '');
          if (q) query = query.or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`);
        }
        return query;
      };

      const addUserFilter = (q) => permLevel === 1 ? q.eq('created_by', currentUser.name) : q;
      const [dataRes, waitConfirmRes, notShippedRes, shippingRes, compRes, totalRes] = await Promise.all([
        applyFilters(supabase.from('orders').select('*', { count: 'exact' }))
          .order(sortBy, { ascending: sortOrder === 'asc' })
          .range(from, to),
        addUserFilter(supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('order_status', 'open')),
        addUserFilter(supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).in('shipping_status', ['pending', 'packing']).is('tracking_number', null)),
        addUserFilter(supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).in('shipping_status', ['shipped', 'in_transit'])),
        addUserFilter(supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('order_status', 'completed')),
        addUserFilter(supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)),
      ]);

      setServerOrders(dataRes.data || []);
      setTotalCount(dataRes.count || 0);
      setStatusCounts({
        total: totalRes.count || 0,
        waiting_confirm: waitConfirmRes.count || 0,
        not_shipped: notShippedRes.count || 0,
        shipping: shippingRes.count || 0,
        completed: compRes.count || 0,
      });
    } catch (err) {
      console.error('loadPagedOrders error:', err);
    } finally {
      setLoadingOrders(false);
    }
  }, [tenant?.id, page, filterStatus, filterOrderStatus, filterShippingStatus, filterType, filterPayment, filterCreatedBy, filterSource, filterShipping, filterStartDate, filterEndDate, search, sortBy, sortOrder, permLevel, currentUser.name]);

  useEffect(() => {
    loadPagedOrders();
  }, [loadPagedOrders]);

  // Batch-load order items for visible page (product preview on cards)
  useEffect(() => {
    if (serverOrders.length === 0) { setPageItemsMap({}); return; }
    const orderIds = serverOrders.map(o => o.id);
    supabase.from('order_items').select('order_id, product_name, quantity')
      .in('order_id', orderIds)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(item => {
          if (!map[item.order_id]) map[item.order_id] = [];
          map[item.order_id].push(item);
        });
        setPageItemsMap(map);
      });
  }, [serverOrders]);

  // Shipping status label helper
  const getShippingLabel = (o) => {
    const ss = o.shipping_status || 'pending';
    if (ss === 'delivered') return { icon: '📬', text: 'Đã giao', color: 'text-cyan-600' };
    if (ss === 'returned_to_sender') return { icon: '↩️', text: 'Hoàn về', color: 'text-orange-600' };
    if (ss === 'delivery_failed') return { icon: '⚠️', text: 'Giao thất bại', color: 'text-red-600' };
    if (ss === 'in_transit') return { icon: '🛵', text: 'Đang vận chuyển', color: 'text-blue-600' };
    if (ss === 'shipped') return { icon: '🚚', text: 'Đã giao VC', color: 'text-purple-600' };
    if (ss === 'packing') return { icon: '📦', text: 'Đóng gói', color: 'text-yellow-600' };
    if (ss === 'pickup') return { icon: '🏪', text: 'Lấy tại shop', color: 'text-teal-600' };
    // Fallback for pending
    if (o.tracking_number) return { icon: '📤', text: 'Đã đẩy đơn', color: 'text-blue-600' };
    const os = o.order_status || o.status;
    if (['open', 'new', 'completed', 'cancelled'].includes(os) && ss === 'pending') return null;
    return { icon: '⏳', text: 'Chưa đẩy đơn', color: 'text-amber-600' };
  };

  // Items preview text helper
  const getItemsPreview = (orderId) => {
    const items = pageItemsMap[orderId];
    if (!items || items.length === 0) return '';
    const first2 = items.slice(0, 2).map(i => `${i.product_name} x${i.quantity}`);
    const rest = items.length - 2;
    return first2.join(', ') + (rest > 0 ? ` và ${rest} SP khác` : '');
  };

  // ---- Create form state ----
  const [orderType, setOrderType] = useState('online');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingProvider, setShippingProvider] = useState('');
  const [shippingFee, setShippingFee] = useState('');
  const [shippingPayer, setShippingPayer] = useState('customer');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [discountAmount, _setDiscountAmount] = useState('');
  const [_discountNote, _setDiscountNote] = useState('');
  const [_note, _setNote] = useState('');
  const [_needsInstallation, _setNeedsInstallation] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [cartItems, setCartItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Scanner state
  const [showScanner, setShowScanner] = useState(false);

  // Product grid state
  const [categoryFilter, _setCategoryFilter] = useState('');
  const [productSortBy, _setProductSortBy] = useState('name');

  // Multi-payment state
  const [paymentSplits, setPaymentSplits] = useState([{ method: 'cash', amount: '' }]);

  // VTP-specific state
  const [shippingAddressData, setShippingAddressData] = useState(null);
  const [shippingAddressDetail, setShippingAddressDetail] = useState('');
  const [_calculatingFee, setCalculatingFee] = useState(false);
  const [sendingVtp, setSendingVtp] = useState(false);
  const [_vtpTracking, setVtpTracking] = useState(null);

  // New form fields
  const [_orderSource, _setOrderSource] = useState('manual');
  const [internalNote, setInternalNote] = useState('');
  const [totalWeight, _setTotalWeight] = useState('');
  const [shippingService, _setShippingService] = useState('VCN');

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');

  const _isVTP = shippingProvider === 'Viettel Post' && !!vtpToken;

  // ---- Helpers: unique number generators ----
  const genOrderNumber = async () => {
    const dateStr = getDateStrVN();
    const prefix = `DH-${dateStr}-`;
    const { data } = await supabase.from('orders').select('order_number')
      .like('order_number', `${prefix}%`).order('order_number', { ascending: false }).limit(1);
    const lastNum = data?.[0] ? parseInt(data[0].order_number.slice(-3)) || 0 : 0;
    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
  };

  const genReceiptNumber = async (type) => {
    const dateStr = getDateStrVN();
    const prefix = `${type === 'thu' ? 'PT' : 'PC'}-${dateStr}-`;
    const { data } = await supabase.from('receipts_payments').select('receipt_number')
      .like('receipt_number', `${prefix}%`).order('receipt_number', { ascending: false }).limit(1);
    const lastNum = data?.[0] ? parseInt(data[0].receipt_number.slice(-3)) || 0 : 0;
    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
  };

  const resetForm = () => {
    setOrderType('online'); setCustomerId(''); setCustomerName(''); setCustomerPhone('');
    setShippingAddress(''); setShippingAddressData(null); setShippingAddressDetail('');
    setCartItems([]); setProductSearch(''); setCustomerSearch('');
    setShowCustomerDropdown(false); setInternalNote('');
    setPaymentMethod('cod'); setShippingProvider(''); setShippingFee(''); setShippingPayer('customer'); setSelectedAddressId('');
    setCouponCode(''); setAppliedCoupon(null); setCouponDiscount(0); setCouponError('');
    const defaultWh = (warehouses || []).find(w => w.is_default) || (warehouses || [])[0];
    if (defaultWh) setSelectedWarehouseId(defaultWh.id);
  };

  // ---- Coupon validation ----
  const validateAndApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponError('Vui lòng nhập mã giảm giá'); return; }
    setCouponError('');
    try {
      const { data: coupon, error } = await supabase.from('coupons').select('*')
        .eq('tenant_id', tenant.id).eq('code', code).eq('is_active', true).maybeSingle();
      if (error) throw error;
      if (!coupon) { setCouponError('Mã không tồn tại hoặc đã tắt'); return; }

      // Check dates
      const today = getTodayVN();
      if (coupon.start_date && today < coupon.start_date) { setCouponError('Mã chưa có hiệu lực'); return; }
      if (coupon.end_date && today > coupon.end_date) { setCouponError('Mã đã hết hạn'); return; }

      // Check usage limit
      if (coupon.usage_limit > 0 && coupon.usage_count >= coupon.usage_limit) { setCouponError('Mã đã hết lượt sử dụng'); return; }

      // Check per-customer limit
      if (coupon.per_customer_limit > 0 && customerPhone.trim()) {
        const { count } = await supabase.from('coupon_usage').select('id', { count: 'exact', head: true })
          .eq('coupon_id', coupon.id).eq('customer_phone', customerPhone.trim());
        if ((count || 0) >= coupon.per_customer_limit) { setCouponError('Bạn đã dùng hết lượt cho mã này'); return; }
      }

      // Check min order value
      if (coupon.min_order_value > 0 && subtotal < coupon.min_order_value) {
        setCouponError(`Đơn tối thiểu ${formatMoney(coupon.min_order_value)}`); return;
      }

      // Check applicable products
      if (coupon.applicable_products?.length > 0) {
        const cartProductIds = cartItems.map(i => i.product_id);
        const hasApplicable = cartProductIds.some(pid => coupon.applicable_products.includes(pid));
        if (!hasApplicable) { setCouponError('Mã không áp dụng cho sản phẩm trong giỏ'); return; }
      }

      // Calculate discount
      let disc = 0;
      if (coupon.type === 'percentage') {
        disc = subtotal * (coupon.value / 100);
        if (coupon.max_discount > 0) disc = Math.min(disc, coupon.max_discount);
      } else if (coupon.type === 'fixed') {
        disc = coupon.value;
      } else if (coupon.type === 'free_shipping') {
        disc = shipFee; // discount equals shipping fee
      }
      disc = Math.min(disc, subtotal); // don't exceed subtotal

      setAppliedCoupon(coupon);
      setCouponDiscount(disc);
      setCouponError('');
    } catch (err) { console.error(err); setCouponError('Lỗi kiểm tra mã'); }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null); setCouponDiscount(0); setCouponCode(''); setCouponError('');
  };

  // ---- VTP: Calculate shipping fee ----
  const _handleCalcVtpFee = async () => {
    if (!vtpToken || !shippingAddressData?.district_id) return alert('Vui lòng chọn đầy đủ tỉnh/quận/phường');
    const sender = getSettingValue ? getSettingValue('shipping', 'vtp_sender_address', null) : null;
    if (!sender?.province_id) return alert('Chưa cấu hình địa chỉ lấy hàng VTP trong Cài đặt > Vận chuyển');
    setCalculatingFee(true);
    try {
      const weight = parseInt(totalWeight) || cartItems.reduce((sum, i) => sum + (i.quantity || 1) * 500, 0); // 500g/item default
      const totalPrice = cartItems.reduce((sum, i) => sum + (i.quantity || 1) * (i.price || 0), 0);
      const result = await vtpApi.calculateFee(vtpToken, {
        senderProvince: sender.province_id, senderDistrict: sender.district_id,
        receiverProvince: shippingAddressData.province_id, receiverDistrict: shippingAddressData.district_id,
        productWeight: weight, productPrice: totalPrice, codAmount: totalPrice,
        orderService: shippingService
      });
      if (result.success && result.data) {
        const fee = result.data.MONEY_TOTAL || result.data.MONEY_TOTALFEE || result.data.MONEY_FEE || 0;
        setShippingFee(String(fee));
        showToast(`Phí ship VTP: ${formatMoney(fee)}`);
      } else {
        showToast(result.error || 'Không thể tính phí');
      }
    } catch (err) { showToast('Lỗi tính phí: ' + err.message); }
    finally { setCalculatingFee(false); }
  };

  // ---- VTP: Create shipping order ----
  const handleSendVtp = async () => {
    if (!vtpToken || !selectedOrder || sendingVtp) return;
    const sender = getSettingValue ? getSettingValue('shipping', 'vtp_sender_address', null) : null;
    if (!sender?.province_id) return alert('Chưa cấu hình địa chỉ lấy hàng VTP trong Cài đặt > Vận chuyển');
    const meta = selectedOrder.shipping_metadata || {};
    if (!meta.province_id) return alert('Đơn hàng chưa có thông tin địa chỉ VTP');
    setSendingVtp(true);
    try {
      const totalWeight = orderItems.reduce((sum, i) => sum + (i.quantity || 1) * 500, 0);
      const codAmount = selectedOrder.payment_status === 'paid' ? 0 : (selectedOrder.total_amount - (selectedOrder.paid_amount || 0));
      const svcCode = selectedOrder.shipping_service || 'VCN';
      const result = await vtpApi.createOrder(vtpToken, {
        partnerOrderNumber: selectedOrder.order_number,
        senderName: sender.name, senderPhone: sender.phone, senderAddress: sender.address,
        senderProvince: Number(sender.province_id), senderDistrict: Number(sender.district_id), senderWard: Number(sender.ward_id || 0),
        receiverName: selectedOrder.customer_name || 'Khách hàng',
        receiverPhone: selectedOrder.customer_phone || '',
        receiverAddress: selectedOrder.shipping_address || '',
        receiverProvince: Number(meta.province_id), receiverDistrict: Number(meta.district_id), receiverWard: Number(meta.ward_id || 0),
        productName: orderItems.map(i => i.product_name).join(', ').slice(0, 200) || 'Hàng hóa',
        productDescription: orderItems.map(i => `${i.product_name} x${i.quantity}`).join(', ').slice(0, 200),
        productQuantity: orderItems.reduce((s, i) => s + i.quantity, 0),
        productWeight: totalWeight, productPrice: selectedOrder.total_amount,
        codAmount, orderService: svcCode, orderNote: selectedOrder.note || '',
        items: orderItems
      });

      if (result.success && result.data) {
        const vtpCode = result.data.ORDER_NUMBER || '';
        if (!vtpCode) {
          console.warn('[VTP] Không có ORDER_NUMBER:', result.data);
          alert('VTP không trả về mã vận đơn. Kiểm tra lại thông tin đơn hàng.');
          return;
        }
        const newMeta = { ...meta, vtp_order_code: vtpCode, vtp_service: svcCode };
        await supabase.from('orders').update({
          tracking_number: vtpCode, shipping_metadata: newMeta,
          shipping_provider: 'Viettel Post', shipping_service: svcCode,
          status: 'shipping', order_status: 'confirmed', shipping_status: 'shipped',
          updated_at: getNowISOVN()
        }).eq('id', selectedOrder.id);
        setSelectedOrder(prev => ({ ...prev, tracking_number: vtpCode, shipping_metadata: newMeta, shipping_provider: 'Viettel Post', shipping_service: svcCode, status: 'shipping', order_status: 'confirmed', shipping_status: 'shipped' }));
        setEditTracking(vtpCode);
        showToast('Đã gửi đơn Viettel Post: ' + vtpCode);
        logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'shipping', entityType: 'order', entityId: selectedOrder.order_number, entityName: selectedOrder.order_number, description: `Đẩy đơn VTP: ${selectedOrder.order_number} → ${vtpCode}` });
        await Promise.all([loadSalesData(), loadPagedOrders()]);
      } else {
        const errMsg = result.error || 'Không xác định';
        console.error('[VTP] Lỗi tạo đơn:', errMsg);
        alert('Lỗi tạo đơn VTP:\n' + errMsg + (errMsg.includes('hết hạn') ? '\n\nVui lòng vào Cài đặt > Vận chuyển → Kết nối lại VTP.' : ''));
      }
    } catch (err) { console.error('[VTP] Exception:', err); alert('Lỗi: ' + err.message); }
    finally { setSendingVtp(false); }
  };

  // ---- VTP: Get tracking ----
  const handleRefreshVtpTracking = async () => {
    if (!vtpToken || !selectedOrder?.shipping_metadata?.vtp_order_code) return;
    try {
      const result = await vtpApi.getOrderDetail(vtpToken, selectedOrder.shipping_metadata.vtp_order_code);
      if (result.success && result.data) {
        const statusText = result.data.STATUS_NAME || result.data.status_name || '';
        const newMeta = { ...selectedOrder.shipping_metadata, vtp_status: statusText };
        await supabase.from('orders').update({ shipping_metadata: newMeta, updated_at: getNowISOVN() }).eq('id', selectedOrder.id);
        setSelectedOrder(prev => ({ ...prev, shipping_metadata: newMeta }));
        setVtpTracking(result.data);
        showToast('Đã cập nhật tracking VTP');
      }
    } catch (err) { console.error(err); }
  };

  // ---- Cart logic ----
  // State for variant selector popup
  const [showVariantPicker, setShowVariantPicker] = useState(null); // product object or null

  const addToCart = (product, variant = null) => {
    // If product has variants and no variant selected, show picker
    if (product.has_variants && !variant) {
      const variants = (productVariants || []).filter(v => v.product_id === product.id);
      if (variants.length > 0) {
        setShowVariantPicker(product);
        return;
      }
    }
    const cartKey = variant ? `${product.id}_${variant.id}` : product.id;
    const stock = getProductStock(product);
    const existing = cartItems.find(i => (variant ? i._cartKey === cartKey : i.product_id === product.id && !i.variant_id));
    if (existing) {
      setCartItems(prev => prev.map(i => (variant ? i._cartKey === cartKey : i.product_id === product.id && !i.variant_id) ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCartItems(prev => [...prev, {
        _cartKey: cartKey,
        product_id: product.id, product_name: product.name,
        product_sku: variant ? (variant.sku || product.sku || '') : (product.sku || ''),
        unit_price: parseFloat(variant ? (variant.price || product.sell_price) : (product.sell_price || 0)),
        quantity: 1, discount: 0,
        warranty_months: product.warranty_months || 0, stock,
        is_combo: product.is_combo || false,
        variant_id: variant?.id || null,
        variant_name: variant?.variant_name || null
      }]);
    }
    setProductSearch('');
    setShowVariantPicker(null);
  };

  const updateCartItem = (idx, field, value) => {
    setCartItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeCartItem = (idx) => {
    setCartItems(prev => prev.filter((_, i) => i !== idx));
  };

  const subtotal = cartItems.reduce((s, i) => s + ((parseFloat(i.unit_price) - parseFloat(i.discount || 0)) * parseInt(i.quantity || 0)), 0);
  const discount = parseFloat(discountAmount || 0);
  const shipFee = parseFloat(shippingFee || 0);
  const shipForCustomer = shippingPayer === 'customer' ? shipFee : 0;
  const totalAmount = subtotal - discount - couponDiscount + shipForCustomer;

  // ---- Product categories ----
  const _productCategories = useMemo(() => {
    const cats = new Set();
    (products || []).forEach(p => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [products]);

  // ---- Product grid (all products, filtered/sorted) ----
  const getProductStock = useCallback((p) => {
    if (p.is_combo) return getComboStock(p.id);
    return getWarehouseQty(p.id) ?? (p.stock_quantity || 0);
  }, [getComboStock, getWarehouseQty]);

  const displayProducts = useMemo(() => {
    let list = (products || []).filter(p => p.is_active !== false);
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q)
      );
    }
    if (categoryFilter) {
      list = list.filter(p => p.category === categoryFilter);
    }
    list = [...list].sort((a, b) => {
      const aStock = getProductStock(a);
      const bStock = getProductStock(b);
      if (aStock <= 0 && bStock > 0) return 1;
      if (aStock > 0 && bStock <= 0) return -1;
      if (productSortBy === 'price_asc') return (a.sell_price || 0) - (b.sell_price || 0);
      if (productSortBy === 'price_desc') return (b.sell_price || 0) - (a.sell_price || 0);
      if (productSortBy === 'stock_desc') return bStock - aStock;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [products, productSearch, categoryFilter, productSortBy, getProductStock]);

  // ---- Customer search ----
  const searchedCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const q = customerSearch.toLowerCase();
    return (customers || []).filter(c =>
      (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
    ).slice(0, 5);
  }, [customers, customerSearch]);

  // (filteredOrders + stats replaced by server-side loadPagedOrders)

  // ---- Create order ----
  const handleCreateOrder = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    if (cartItems.length === 0) return alert('Vui lòng thêm sản phẩm');
    if (submitting) return;
    // Pre-check stock at selected warehouse (combo: check each child)
    for (const item of cartItems) {
      if (item.is_combo) {
        const children = (comboItems || []).filter(ci => ci.combo_product_id === item.product_id);
        for (const child of children) {
          const cWhQty = getWarehouseQty(child.child_product_id);
          const cStock = cWhQty !== null ? cWhQty : ((products || []).find(p => p.id === child.child_product_id)?.stock_quantity || 0);
          const needed = child.quantity * parseInt(item.quantity);
          if (cStock < needed) {
            const cName = (products || []).find(p => p.id === child.child_product_id)?.name || '?';
            return alert(`Không đủ tồn kho SP con: ${cName} (tồn: ${cStock}, cần: ${needed}) trong combo ${item.product_name}`);
          }
        }
      } else {
        const whQty = getWarehouseQty(item.product_id);
        const stock = whQty !== null ? whQty : ((products || []).find(p => p.id === item.product_id)?.stock_quantity || 0);
        if (stock < item.quantity) {
          return alert(`Không đủ tồn kho: ${item.product_name} (tồn: ${stock}, cần: ${item.quantity})`);
        }
      }
    }

    setSubmitting(true);
    try {
      // Auto find/create customer if phone provided
      let resolvedCustomerId = customerId || null;
      if (!resolvedCustomerId && customerPhone.trim()) {
        const { data: existingCust } = await supabase.from('customers').select('id, name')
          .eq('tenant_id', tenant.id).eq('phone', customerPhone.trim()).maybeSingle();
        if (existingCust) {
          resolvedCustomerId = existingCust.id;
        } else if (customerName.trim()) {
          const { data: newCust, error: custErr } = await supabase.from('customers').insert([{
            tenant_id: tenant.id, name: customerName.trim(), phone: customerPhone.trim(),
            address: shippingAddress || '', source: orderType === 'pos' ? 'walk_in' : 'online',
            last_purchase_at: getNowISOVN(), created_by: currentUser.name
          }]).select().single();
          if (!custErr && newCust) resolvedCustomerId = newCust.id;
        }
      }
      // Update last_purchase_at for existing customer
      if (resolvedCustomerId && resolvedCustomerId === customerId) {
        await supabase.from('customers').update({ last_purchase_at: getNowISOVN() }).eq('id', resolvedCustomerId);
      }

      const orderNumber = await genOrderNumber();
      const isPOS = orderType === 'pos';

      // Build shipping address from AddressPicker if available
      let finalShippingAddress = null;
      let finalShippingMetadata = {};
      if (shippingAddressData) {
        finalShippingAddress = [shippingAddressDetail, shippingAddressData.ward_name, shippingAddressData.district_name, shippingAddressData.province_name].filter(Boolean).join(', ');
        finalShippingMetadata = { ...shippingAddressData };
      } else if (shippingAddress.trim()) {
        finalShippingAddress = shippingAddress;
      }

      // Insert order with hard defaults
      const { data: order, error: orderErr } = await supabase.from('orders').insert([{
        tenant_id: tenant.id, order_number: orderNumber, order_type: orderType,
        status: 'confirmed',
        order_status: 'confirmed', shipping_status: 'pending',
        customer_id: resolvedCustomerId,
        customer_name: customerName, customer_phone: customerPhone,
        shipping_address: finalShippingAddress,
        shipping_provider: shippingProvider || null,
        shipping_fee: shipFee, shipping_payer: shippingPayer,
        shipping_metadata: finalShippingMetadata,
        discount_amount: couponDiscount, discount_note: appliedCoupon ? `Mã: ${appliedCoupon.code}` : '',
        coupon_id: appliedCoupon?.id || null, coupon_code: appliedCoupon?.code || null,
        subtotal, total_amount: totalAmount,
        payment_method: paymentMethod, payment_status: 'unpaid',
        paid_amount: 0,
        payment_splits: [],
        note: '', needs_installation: false,
        created_by: currentUser.name,
        warehouse_id: selectedWarehouseId || null,
        order_source: 'manual',
        internal_note: internalNote || null,
        total_weight: 0,
        shipping_service: null
      }]).select().single();
      if (orderErr) throw orderErr;

      // Insert order items
      const itemsData = cartItems.map(item => ({
        order_id: order.id, product_id: item.product_id,
        product_name: item.variant_name ? `${item.product_name} - ${item.variant_name}` : item.product_name,
        product_sku: item.product_sku, quantity: parseInt(item.quantity),
        unit_price: parseFloat(item.unit_price), discount: parseFloat(item.discount || 0),
        total_price: (parseFloat(item.unit_price) - parseFloat(item.discount || 0)) * parseInt(item.quantity),
        warranty_months: item.warranty_months || null,
        variant_id: item.variant_id || null,
        variant_name: item.variant_name || null
      }));
      const { error: itemsErr } = await supabase.from('order_items').insert(itemsData);
      if (itemsErr) throw itemsErr;

      // Deduct stock atomically for all orders (POS + online đều tạo với status 'confirmed')
      for (const item of cartItems) {
        if (item.is_combo) {
          // Combo: trừ kho từng SP con
          const children = (comboItems || []).filter(ci => ci.combo_product_id === item.product_id);
          for (const child of children) {
            const delta = -(child.quantity * parseInt(item.quantity));
            if (selectedWarehouseId) {
              const { error: stockErr } = await supabase.rpc('adjust_warehouse_stock', {
                p_warehouse_id: selectedWarehouseId, p_product_id: child.child_product_id, p_delta: delta
              });
              if (stockErr) throw new Error(`Không đủ tồn kho SP con trong combo: ${item.product_name}`);
            } else {
              const { error: stockErr } = await supabase.rpc('adjust_stock', {
                p_product_id: child.child_product_id, p_delta: delta
              });
              if (stockErr) throw new Error(`Không đủ tồn kho SP con trong combo: ${item.product_name}`);
            }
          }
        } else {
          if (selectedWarehouseId) {
            const { error: stockErr } = await supabase.rpc('adjust_warehouse_stock', {
              p_warehouse_id: selectedWarehouseId, p_product_id: item.product_id, p_delta: -parseInt(item.quantity)
            });
            if (stockErr) throw new Error(`Không đủ tồn kho: ${item.product_name}`);
          } else {
            const { error: stockErr } = await supabase.rpc('adjust_stock', {
              p_product_id: item.product_id, p_delta: -parseInt(item.quantity)
            });
            if (stockErr) throw new Error(`Không đủ tồn kho: ${item.product_name}`);
          }
        }
      }

      // Increment coupon usage
      if (appliedCoupon) {
        await supabase.rpc('increment_coupon_usage', { p_coupon_id: appliedCoupon.id });
        await supabase.from('coupon_usage').insert([{
          tenant_id: tenant.id, coupon_id: appliedCoupon.id, order_id: order.id,
          customer_phone: customerPhone.trim() || null, discount_amount: couponDiscount
        }]);
      }

      showToast('Tạo đơn thành công! ' + orderNumber);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'create', entityType: 'order', entityId: orderNumber, entityName: orderNumber, description: 'Tạo đơn ' + orderNumber + ', KH: ' + (customerName || 'Khách lẻ') + ', ' + formatMoney(totalAmount) });

      // Zalo OA: Queue xác nhận đơn hàng
      if (customerPhone?.trim()) {
        sendOrderConfirmation(tenant.id, {
          id: order.id, order_code: orderNumber,
          total_amount: totalAmount,
          items: cartItems.map(i => ({ product_name: i.product_name }))
        }, {
          id: resolvedCustomerId, name: customerName, phone: customerPhone
        }).catch(() => {}); // Silent - không block flow chính
      }

      setShowCreateModal(false); resetForm();
      await Promise.all([loadSalesData(), loadWarehouseData(), loadFinanceData(), loadPagedOrders()]);
    } catch (err) { console.error(err); alert('❌ Lỗi: ' + err.message); } finally { setSubmitting(false); }
  };

  // ---- Load order items for detail ----
  const loadOrderItems = async (orderId) => {
    setLoadingItems(true);
    try {
      const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId);
      setOrderItems(data || []);
    } catch (err) { console.error(err); }
    finally { setLoadingItems(false); }
  };

  const loadOrderTimeline = async (orderId, orderNumber) => {
    try {
      // Load both status logs and activity logs
      const [statusResult, activityResult] = await Promise.all([
        supabase.from('order_status_logs').select('*').eq('order_id', orderId).order('created_at', { ascending: false }).limit(50),
        supabase.from('activity_logs').select('*').eq('entity_type', 'order').eq('entity_id', orderNumber).order('created_at', { ascending: false }).limit(50)
      ]);
      const statusLogs = (statusResult.data || []).map(log => ({ ...log, _type: 'status' }));
      const activityLogs = (activityResult.data || []).map(log => ({ ...log, _type: 'activity' }));
      const merged = [...statusLogs, ...activityLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setStatusLogs(merged);
    } catch (err) { console.warn('Timeline load error:', err.message); setStatusLogs([]); }
  };

  // Open order detail from chat attachment
  useEffect(() => {
    if (pendingOpenRecord?.type === 'order' && pendingOpenRecord.id) {
      const order = orders.find(o => o.id === pendingOpenRecord.id);
      if (order) {
        setSelectedOrder(order);
        loadOrderItems(order.id);
        loadOrderReturns(order.id);
        loadOrderTimeline(order.id, order.order_number);
        setEditMode(false);
        setShowPaymentInput(false);
        setShowDetailModal(true);
      }
      setPendingOpenRecord(null);
    }
  }, [pendingOpenRecord]);

  // ---- Change order status ----
  const changeOrderStatus = async (orderId, newStatus, order) => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    const statusLabel = orderStatuses[newStatus]?.label || newStatus;
    if (!window.confirm(`Chuyển đơn hàng sang "${statusLabel}"?`)) return;
    if (submitting) return;
    setSubmitting(true);

    try {
      // Map legacy status → 3-way status fields
      const statusMap = {
        new: { order_status: 'open', shipping_status: 'pending' },
        confirmed: { order_status: 'confirmed', shipping_status: 'pending' },
        packing: { order_status: 'confirmed', shipping_status: 'packing' },
        shipping: { order_status: 'confirmed', shipping_status: 'shipped' },
        delivered: { order_status: 'confirmed', shipping_status: 'delivered' },
        completed: { order_status: 'completed', shipping_status: 'delivered' },
        cancelled: { order_status: 'cancelled' },
        returned: { order_status: 'returned', shipping_status: 'returned_to_sender' },
      };
      const mapped = statusMap[newStatus] || {};
      const updates = { status: newStatus, ...mapped, updated_at: getNowISOVN() };

      // (Stock đã được trừ khi tạo đơn — không trừ lại ở đây)

      // Completed → create receipt for remaining unpaid amount (skip if already fully paid)
      if (newStatus === 'completed') {
        const alreadyPaid = parseFloat(order.paid_amount || 0);
        const remaining = parseFloat(order.total_amount || 0) - alreadyPaid;
        if (remaining > 0 && !order.receipt_id) {
          const receiptNumber = await genReceiptNumber('thu');
          const category = order.order_type === 'pos' ? 'Bán tại cửa hàng' : 'Lắp đặt tại nhà khách';
          const { data: receipt } = await supabase.from('receipts_payments').insert([{
            tenant_id: tenant.id, receipt_number: receiptNumber, type: 'thu',
            amount: remaining, description: `Bán hàng - ${order.order_number}` + (order.customer_name ? ` - ${order.customer_name}` : ''),
            category, receipt_date: getTodayVN(), note: `Đơn hàng: ${order.order_number}${alreadyPaid > 0 ? ` (đã thu trước ${formatMoney(alreadyPaid)})` : ''}`,
            status: 'approved', created_by: currentUser.name, created_at: getNowISOVN()
          }]).select().single();
          if (receipt) updates.receipt_id = receipt.id;
        }
        updates.payment_status = 'paid';
        updates.paid_amount = order.total_amount;
      }

      // Cancelled → restore stock to order's warehouse + restore serials
      // Haravan import không trừ kho nên không cần cộng lại
      if (newStatus === 'cancelled') {
        const isImported = order.order_source === 'haravan_import' || order.source === 'haravan_import';
        const stockDeducted = !isImported && ['confirmed', 'packing', 'shipping', 'delivered'].includes(order.status);
        if (stockDeducted) {
          const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId);
          for (const item of (items || [])) {
            const { data: comboChildren } = await supabase.from('product_combo_items').select('*').eq('combo_product_id', item.product_id);
            if (comboChildren && comboChildren.length > 0) {
              for (const child of comboChildren) {
                const delta = child.quantity * item.quantity;
                if (order.warehouse_id) {
                  await supabase.rpc('adjust_warehouse_stock', { p_warehouse_id: order.warehouse_id, p_product_id: child.child_product_id, p_delta: delta });
                } else {
                  await supabase.rpc('adjust_stock', { p_product_id: child.child_product_id, p_delta: delta });
                }
              }
            } else {
              if (order.warehouse_id) {
                await supabase.rpc('adjust_warehouse_stock', { p_warehouse_id: order.warehouse_id, p_product_id: item.product_id, p_delta: item.quantity });
              } else {
                await supabase.rpc('adjust_stock', { p_product_id: item.product_id, p_delta: item.quantity });
              }
            }
          }
        }
        // Restore serials to in_stock + void warranty cards
        await supabase.from('product_serials').update({
          status: 'in_stock', sold_order_id: null, sold_at: null,
          warranty_start: null, warranty_end: null,
          customer_name: null, customer_phone: null, updated_at: getNowISOVN()
        }).eq('sold_order_id', orderId);
        await supabase.from('warranty_cards').update({
          status: 'voided', void_reason: 'Đơn hàng đã hủy', updated_at: getNowISOVN()
        }).eq('order_id', orderId);
        // Decrement coupon usage if order used a coupon
        if (order.coupon_id) {
          await supabase.rpc('decrement_coupon_usage', { p_coupon_id: order.coupon_id });
        }
      }

      // Returned → restore stock to order's warehouse + create refund receipt + restore serials
      if (newStatus === 'returned') {
        const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId);
        for (const item of (items || [])) {
          const { data: comboChildren } = await supabase.from('product_combo_items').select('*').eq('combo_product_id', item.product_id);
          if (comboChildren && comboChildren.length > 0) {
            for (const child of comboChildren) {
              const delta = child.quantity * item.quantity;
              if (order.warehouse_id) {
                await supabase.rpc('adjust_warehouse_stock', { p_warehouse_id: order.warehouse_id, p_product_id: child.child_product_id, p_delta: delta });
              } else {
                await supabase.rpc('adjust_stock', { p_product_id: child.child_product_id, p_delta: delta });
              }
            }
          } else {
            if (order.warehouse_id) {
              await supabase.rpc('adjust_warehouse_stock', { p_warehouse_id: order.warehouse_id, p_product_id: item.product_id, p_delta: item.quantity });
            } else {
              await supabase.rpc('adjust_stock', { p_product_id: item.product_id, p_delta: item.quantity });
            }
          }
        }
        // Hoàn tiền = số tiền đã thu thực tế (không phải total_amount)
        const refundAmount = parseFloat(order.paid_amount || 0);
        if (refundAmount > 0) {
          const receiptNumber = await genReceiptNumber('chi');
          await supabase.from('receipts_payments').insert([{
            tenant_id: tenant.id, receipt_number: receiptNumber, type: 'chi',
            amount: refundAmount, description: `Trả hàng - ${order.order_number}`,
            category: 'Khác', receipt_date: getTodayVN(), note: `Hoàn tiền đơn hàng: ${order.order_number}`,
            status: 'approved', created_by: currentUser.name, created_at: getNowISOVN()
          }]);
        }
        // Restore serials + void warranty
        await supabase.from('product_serials').update({
          status: 'returned', updated_at: getNowISOVN()
        }).eq('sold_order_id', orderId);
        await supabase.from('warranty_cards').update({
          status: 'voided', void_reason: 'Trả hàng', updated_at: getNowISOVN()
        }).eq('order_id', orderId);
        // Decrement coupon usage if order used a coupon
        if (order.coupon_id) {
          await supabase.rpc('decrement_coupon_usage', { p_coupon_id: order.coupon_id });
        }
      }

      const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
      if (error) throw error;
      showToast('Đã cập nhật trạng thái!');
      if (newStatus === 'cancelled') {
        logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'cancel', entityType: 'order', entityId: order.order_number, entityName: order.order_number, description: 'Hủy đơn ' + order.order_number });
      } else {
        logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'update', entityType: 'order', entityId: order.order_number, entityName: order.order_number, description: 'Cập nhật trạng thái đơn ' + order.order_number + ': ' + statusLabel });
      }

      // Zalo OA: Gửi thông báo giao hàng
      if (newStatus === 'shipping' && order.customer_phone) {
        sendShippingNotification(tenant.id, {
          id: orderId, order_code: order.order_number
        }, {
          id: order.customer_id, name: order.customer_name, phone: order.customer_phone
        }, {
          carrier: order.shipping_provider || '',
          tracking_code: order.tracking_number || '',
          estimated_date: 'Trong 2-3 ngày',
        }).catch(() => {});
      }
      setSelectedOrder(prev => prev ? { ...prev, ...updates } : prev);
      await Promise.all([loadSalesData(), loadWarehouseData(), loadFinanceData(), loadPagedOrders()]);
    } catch (err) { console.error(err); alert('❌ Lỗi: ' + err.message); } finally { setSubmitting(false); }
  };

  // ---- Update tracking ----
  const [editTracking, setEditTracking] = useState('');
  const saveTracking = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    if (!selectedOrder) return;
    try {
      await supabase.from('orders').update({ tracking_number: editTracking, updated_at: getNowISOVN() }).eq('id', selectedOrder.id);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'update', entityType: 'order', entityId: selectedOrder.order_number, entityName: selectedOrder.order_number, description: `Cập nhật tracking: ${selectedOrder.order_number} → ${editTracking}` });
      setSelectedOrder(prev => ({ ...prev, tracking_number: editTracking }));
      await Promise.all([loadSalesData(), loadPagedOrders()]);
    } catch (err) { alert('❌ Lỗi: ' + err.message); }
  };

  // ---- Print invoice (A5 layout) ----
  const printInvoice = async () => {
    if (!selectedOrder) return;
    const items = orderItems;
    let qrHtml = '';
    try {
      const qrDataUrl = await QRCode.toDataURL(selectedOrder.order_number, { width: 200, margin: 1 });
      qrHtml = `<div style="margin-top:12px"><img src="${qrDataUrl}" style="width:100px;height:100px"><p style="font-size:10px;color:#888;margin:2px 0">Quét mã để tra cứu</p></div>`;
    } catch (_e) { /* ignore QR error */ }
    const logoHtml = tenant.logo_url ? `<img src="${tenant.logo_url}" style="max-height:50px;max-width:150px;object-fit:contain;margin-bottom:6px" crossorigin="anonymous" onerror="this.style.display='none'">` : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hóa đơn ${selectedOrder.order_number}</title>
<style>
@page{size:A5;margin:12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;max-width:148mm;margin:0 auto;padding:15px;font-size:13px;color:#333}
.header{text-align:center;margin-bottom:15px;padding-bottom:12px;border-bottom:2px solid #222}
.header h2{font-size:18px;margin:4px 0}
.header p{font-size:11px;color:#555;margin:2px 0}
.title{text-align:center;font-size:20px;font-weight:bold;margin:15px 0 5px;letter-spacing:1px}
.order-info{margin:10px 0;font-size:12px;line-height:1.6}
.order-info b{color:#222}
table.items{width:100%;border-collapse:collapse;margin:12px 0}
table.items th,table.items td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:12px}
table.items th{background:#f5f5f5;font-weight:600;color:#444}
table.items td.r{text-align:right}
table.summary{width:100%;margin:8px 0}
table.summary td{padding:4px 8px;font-size:13px}
table.summary td.r{text-align:right}
table.summary .total{font-size:16px;font-weight:bold;color:#222;border-top:2px solid #222}
.footer{text-align:center;margin-top:20px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#666}
.footer-row{display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px}
@media print{body{margin:0;padding:10mm}}
</style></head><body>
<div class="header">${logoHtml}<h2>${tenant.name || ''}</h2>
${tenant.address ? `<p>${tenant.address}</p>` : ''}${tenant.phone ? `<p>ĐT: ${tenant.phone}</p>` : ''}</div>
<div class="title">ĐƠN HÀNG #${selectedOrder.order_number}</div>
<div class="order-info">
<p><b>Ngày:</b> ${new Date(selectedOrder.created_at).toLocaleString('vi-VN')}</p>
<p><b>Khách hàng:</b> ${selectedOrder.customer_name || 'Khách lẻ'}${selectedOrder.customer_phone ? ' - ' + selectedOrder.customer_phone : ''}</p>
${selectedOrder.shipping_address ? `<p><b>Địa chỉ:</b> ${selectedOrder.shipping_address}</p>` : ''}
</div>
<table class="items"><thead><tr><th>STT</th><th>Sản phẩm</th><th class="r">SL</th><th class="r">Đơn giá</th><th class="r">Thành tiền</th></tr></thead><tbody>
${items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.product_name}${i.warranty_months ? ` <small>(BH: ${i.warranty_months}th)</small>` : ''}</td><td class="r">${i.quantity}</td><td class="r">${formatMoney(i.unit_price)}</td><td class="r">${formatMoney(i.total_price)}</td></tr>`).join('')}</tbody></table>
<table class="summary"><tr><td>Tạm tính</td><td class="r">${formatMoney(selectedOrder.subtotal)}</td></tr>
${selectedOrder.discount_amount > 0 ? `<tr><td>Chiết khấu</td><td class="r">-${formatMoney(selectedOrder.discount_amount)}</td></tr>` : ''}
${selectedOrder.shipping_fee > 0 && selectedOrder.shipping_payer === 'shop' ? `<tr><td>Phí ship (shop)</td><td class="r">${formatMoney(selectedOrder.shipping_fee)}</td></tr>` : ''}
<tr class="total"><td><b>TỔNG CỘNG</b></td><td class="r"><b>${formatMoney(selectedOrder.total_amount)}</b></td></tr></table>
<p style="font-size:12px;margin:6px 0">Thanh toán: ${paymentMethods[selectedOrder.payment_method]?.label || selectedOrder.payment_method}</p>
${selectedOrder.paid_amount > 0 && selectedOrder.paid_amount < selectedOrder.total_amount ? `<p style="font-size:12px">Đã TT: ${formatMoney(selectedOrder.paid_amount)} | Còn lại: ${formatMoney(selectedOrder.total_amount - selectedOrder.paid_amount)}</p>` : ''}
${selectedOrder.note ? `<p style="font-size:12px;margin:4px 0">Ghi chú: ${selectedOrder.note}</p>` : ''}
<div class="footer-row"><div>${qrHtml}</div><div style="text-align:right"><p>${tenant.invoice_footer || 'Cảm ơn quý khách!'}</p><p style="margin-top:4px">NV: ${selectedOrder.created_by}</p></div></div>
<script>window.onload=function(){window.print()}</script></body></html>`;
    const win = window.open('', '_blank', 'width=600,height=800');
    win.document.write(html);
    win.document.close();
    logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'print', entityType: 'order', entityId: selectedOrder.order_number, entityName: selectedOrder.order_number, description: `In hóa đơn: ${selectedOrder.order_number}` });
  };

  // ---- Print packing slip (for warehouse - no prices) ----
  const printPackingSlip = async () => {
    if (!selectedOrder) return;
    const items = orderItems;
    const totalItems = items.reduce((s, i) => s + i.quantity, 0);
    let qrHtml = '';
    try {
      const qrDataUrl = await QRCode.toDataURL(selectedOrder.order_number, { width: 200, margin: 1 });
      qrHtml = `<div style="text-align:center;margin:15px 0"><img src="${qrDataUrl}" style="width:100px;height:100px"><p style="font-size:10px;color:#888;margin:2px 0">Quét mã để đối soát</p></div>`;
    } catch (_e) { /* ignore QR error */ }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Phiếu đóng gói ${selectedOrder.order_number}</title>
<style>
@page{size:A5;margin:10mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;max-width:148mm;margin:0 auto;padding:15px;font-size:13px;color:#333}
.header{text-align:center;padding-bottom:10px;border-bottom:2px solid #222;margin-bottom:12px}
.header h3{font-size:16px;letter-spacing:1px;margin-top:6px}
.info{margin:10px 0;font-size:12px;line-height:1.7}
.info b{color:#222}
.ship-box{border:2px dashed #666;padding:12px;margin:10px 0;border-radius:8px;background:#fafafa}
table{width:100%;border-collapse:collapse;margin:10px 0}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:12px}
th{background:#f0f0f0;font-weight:600}
td.r{text-align:right}
td.c{text-align:center}
.check-col{width:60px;text-align:center}
.summary{margin:10px 0;font-size:13px;font-weight:bold}
.pack-by{margin-top:30px;font-size:12px}
@media print{body{margin:0;padding:8mm}}
</style></head><body>
<div class="header"><h3>PHIẾU ĐÓNG GÓI</h3><p style="font-size:14px;font-weight:bold;margin-top:4px">${selectedOrder.order_number}</p></div>
<div class="ship-box">
<p><b>Khách hàng:</b> ${selectedOrder.customer_name || 'Khách lẻ'}</p>
${selectedOrder.customer_phone ? `<p><b>SĐT:</b> ${selectedOrder.customer_phone}</p>` : ''}
${selectedOrder.shipping_address ? `<p><b>Địa chỉ:</b> ${selectedOrder.shipping_address}</p>` : ''}
</div>
<table><thead><tr><th>STT</th><th>Sản phẩm</th><th>SKU</th><th class="r">SL</th><th class="check-col">Đã kiểm</th></tr></thead><tbody>
${items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.product_name}</td><td>${i.product_sku || '—'}</td><td class="r">${i.quantity}</td><td class="c">☐</td></tr>`).join('')}</tbody></table>
<div class="summary">Tổng số item: ${totalItems}</div>
${qrHtml}
${selectedOrder.note ? `<p style="font-size:12px;margin:6px 0"><b>Ghi chú:</b> ${selectedOrder.note}</p>` : ''}
<div class="pack-by">Đóng gói bởi: _________________________ &nbsp;&nbsp; Ngày: ${new Date().toLocaleDateString('vi-VN')}</div>
<script>window.onload=function(){window.print()}</script></body></html>`;
    const win = window.open('', '_blank', 'width=600,height=800');
    win.document.write(html); win.document.close();
    logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'print', entityType: 'order', entityId: selectedOrder.order_number, entityName: selectedOrder.order_number, description: `In phiếu đóng gói: ${selectedOrder.order_number}` });
  };

  // ---- Edit order ----
  const enterEditMode = () => {
    setEditData({
      customer_name: selectedOrder.customer_name || '',
      customer_phone: selectedOrder.customer_phone || '',
      shipping_address: selectedOrder.shipping_address || '',
      discount_amount: selectedOrder.discount_amount || 0,
      discount_note: selectedOrder.discount_note || '',
      note: selectedOrder.note || '',
      payment_method: selectedOrder.payment_method || 'cod',
      shipping_provider: selectedOrder.shipping_provider || '',
      shipping_fee: selectedOrder.shipping_fee || 0,
      shipping_payer: selectedOrder.shipping_payer || 'customer',
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    if (!selectedOrder || submitting) return;
    setSubmitting(true);
    try {
      const newDiscount = parseFloat(editData.discount_amount || 0);
      const editShipFee = parseFloat(editData.shipping_fee ?? selectedOrder.shipping_fee ?? 0);
      const editShipPayer = editData.shipping_payer || selectedOrder.shipping_payer || 'customer';
      const shipForCust = editShipPayer === 'customer' ? editShipFee : 0;
      const newTotal = parseFloat(selectedOrder.subtotal || 0) - newDiscount + shipForCust;
      const updates = {
        customer_name: editData.customer_name, customer_phone: editData.customer_phone,
        shipping_address: editData.shipping_address, discount_amount: newDiscount,
        discount_note: editData.discount_note, note: editData.note,
        payment_method: editData.payment_method || selectedOrder.payment_method,
        shipping_provider: editData.shipping_provider || null,
        shipping_fee: editShipFee, shipping_payer: editShipPayer,
        total_amount: newTotal, updated_at: getNowISOVN()
      };
      const { error } = await supabase.from('orders').update(updates).eq('id', selectedOrder.id);
      if (error) throw error;
      showToast('Đã cập nhật đơn hàng!');
      const changedFields = Object.keys(updates).filter(k => k !== 'updated_at' && updates[k] !== selectedOrder[k]).join(', ');
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'update', entityType: 'order', entityId: selectedOrder.order_number, entityName: selectedOrder.order_number, oldData: { customer_name: selectedOrder.customer_name, discount_amount: selectedOrder.discount_amount, note: selectedOrder.note }, newData: updates, description: 'Cập nhật đơn ' + selectedOrder.order_number + (changedFields ? ' (' + changedFields + ')' : '') });
      setSelectedOrder(prev => ({ ...prev, ...updates }));
      setEditMode(false);
      await Promise.all([loadSalesData(), loadPagedOrders()]);
    } catch (err) { console.error(err); alert('❌ Lỗi: ' + err.message); } finally { setSubmitting(false); }
  };

  // ---- Partial payment ----
  const handlePartialPayment = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    if (!selectedOrder || submitting) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) return alert('Vui lòng nhập số tiền hợp lệ');
    const currentPaid = parseFloat(selectedOrder.paid_amount || 0);
    const total = parseFloat(selectedOrder.total_amount || 0);
    const remaining = total - currentPaid;
    if (amount > remaining) return alert(`Số tiền vượt quá còn lại: ${formatMoney(remaining)}`);
    const newPaid = currentPaid + amount;
    const newStatus = newPaid >= total ? 'paid' : 'partial';
    setSubmitting(true);
    try {
      const { error } = await supabase.from('orders').update({
        paid_amount: newPaid, payment_status: newStatus, updated_at: getNowISOVN()
      }).eq('id', selectedOrder.id);
      if (error) throw error;
      const receiptNumber = await genReceiptNumber('thu');
      await supabase.from('receipts_payments').insert([{
        tenant_id: tenant.id, receipt_number: receiptNumber, type: 'thu',
        amount, description: `Thanh toán - ${selectedOrder.order_number}${selectedOrder.customer_name ? ' - ' + selectedOrder.customer_name : ''}`,
        category: 'Thu nợ khách hàng', receipt_date: getTodayVN(),
        note: `Thanh toán đơn hàng: ${selectedOrder.order_number}`,
        status: 'approved', created_by: currentUser.name, created_at: getNowISOVN()
      }]);
      showToast(`Đã ghi nhận thanh toán ${formatMoney(amount)}!`);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'payment', entityType: 'order', entityId: selectedOrder.order_number, entityName: selectedOrder.order_number, description: `Thanh toán ${formatMoney(amount)} cho đơn ${selectedOrder.order_number} (${newStatus === 'paid' ? 'Đã thanh toán đủ' : 'Thanh toán 1 phần'})` });
      setSelectedOrder(prev => ({ ...prev, paid_amount: newPaid, payment_status: newStatus }));
      setPaymentAmount(''); setShowPaymentInput(false);
      await Promise.all([loadSalesData(), loadFinanceData(), loadPagedOrders()]);
    } catch (err) { console.error(err); alert('❌ Lỗi: ' + err.message); } finally { setSubmitting(false); }
  };

  // ---- Partial Return ----
  const genReturnCode = async () => {
    const dateStr = getDateStrVN();
    const prefix = `TH-${dateStr}-`;
    const { data } = await supabase.from('order_returns').select('return_code')
      .like('return_code', `${prefix}%`).order('return_code', { ascending: false }).limit(1);
    const lastNum = data?.[0] ? parseInt(data[0].return_code.slice(-3)) || 0 : 0;
    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
  };

  const openReturnModal = () => {
    if (!orderItems.length) return alert('Chưa có sản phẩm để trả');
    setReturnItems(orderItems.map(item => ({
      ...item, return_qty: 0, condition: 'good', note: ''
    })));
    setReturnReason(''); setRefundMethod('cash');
    setShowReturnModal(true);
  };

  const loadOrderReturns = async (orderId) => {
    const { data } = await supabase.from('order_returns').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
    setOrderReturns(data || []);
  };

  const handleSubmitReturn = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    const itemsToReturn = returnItems.filter(i => i.return_qty > 0);
    if (itemsToReturn.length === 0) return alert('Vui lòng chọn ít nhất 1 sản phẩm để trả');
    for (const item of itemsToReturn) {
      if (item.return_qty > item.quantity) return alert(`Số lượng trả ${item.product_name} vượt quá số lượng đã mua`);
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const returnCode = await genReturnCode();
      const totalRefund = itemsToReturn.reduce((s, i) => s + i.return_qty * parseFloat(i.unit_price), 0);

      // Insert order_returns
      const { data: returnRecord, error: retErr } = await supabase.from('order_returns').insert([{
        tenant_id: tenant.id, order_id: selectedOrder.id,
        return_code: returnCode, reason: returnReason,
        status: 'completed', total_refund: totalRefund,
        refund_method: refundMethod,
        created_by: currentUser.id, created_at: getNowISOVN()
      }]).select().single();
      if (retErr) throw retErr;

      // Insert return items
      const returnItemsData = itemsToReturn.map(i => ({
        return_id: returnRecord.id, product_id: i.product_id,
        product_name: i.product_name, quantity: i.return_qty,
        unit_price: parseFloat(i.unit_price),
        subtotal: i.return_qty * parseFloat(i.unit_price),
        condition: i.condition, note: i.note
      }));
      const { error: itemsErr } = await supabase.from('order_return_items').insert(returnItemsData);
      if (itemsErr) throw itemsErr;

      // Restore stock
      for (const item of itemsToReturn) {
        const warehouseId = selectedOrder.warehouse_id;
        if (warehouseId) {
          await supabase.rpc('adjust_warehouse_stock', {
            p_warehouse_id: warehouseId, p_product_id: item.product_id, p_delta: item.return_qty
          });
        } else {
          await supabase.rpc('adjust_stock', { p_product_id: item.product_id, p_delta: item.return_qty });
        }
      }

      // Create refund receipt
      if (totalRefund > 0) {
        const receiptNumber = await genReceiptNumber('chi');
        await supabase.from('receipts_payments').insert([{
          tenant_id: tenant.id, receipt_number: receiptNumber, type: 'chi',
          amount: totalRefund, description: `Hoàn tiền trả hàng - ${selectedOrder.order_number} - ${returnCode}`,
          category: 'Hoàn tiền khách hàng', receipt_date: getTodayVN(),
          note: `Trả hàng: ${returnCode}, Lý do: ${returnReason || 'Không ghi'}`,
          status: 'approved', created_by: currentUser.name, created_at: getNowISOVN()
        }]);
      }

      showToast(`Trả hàng thành công! ${returnCode} - Hoàn ${formatMoney(totalRefund)}`);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'return', entityType: 'order', entityId: selectedOrder.order_number, entityName: returnCode, description: `Trả hàng ${returnCode} từ đơn ${selectedOrder.order_number}: ${itemsToReturn.map(i => `${i.product_name} x${i.return_qty}`).join(', ')} → Hoàn ${formatMoney(totalRefund)}` });

      setShowReturnModal(false);
      await loadOrderReturns(selectedOrder.id);
      await Promise.all([loadSalesData(), loadWarehouseData(), loadFinanceData(), loadPagedOrders()]);
    } catch (err) { console.error(err); alert('❌ Lỗi: ' + err.message); } finally { setSubmitting(false); }
  };

  // ---- Exchange (đổi hàng) ----
  const openExchangeModal = () => {
    if (!orderItems.length) return alert('Chưa có sản phẩm để đổi');
    setExchangeReturnItems(orderItems.map(item => ({
      ...item, return_qty: 0, condition: 'good'
    })));
    setExchangeNewItems([]);
    setExchangeProductSearch('');
    setExchangeReason('');
    setShowExchangeModal(true);
  };

  const addExchangeProduct = (p) => {
    const existing = exchangeNewItems.find(i => i.product_id === p.id);
    if (existing) {
      setExchangeNewItems(prev => prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setExchangeNewItems(prev => [...prev, {
        product_id: p.id, product_name: p.name, product_sku: p.sku || '',
        unit_price: p.sell_price || 0, quantity: 1, is_combo: p.is_combo || false,
        stock: getProductStock(p), warranty_months: p.warranty_months || null
      }]);
    }
    setExchangeProductSearch('');
  };

  const handleSubmitExchange = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    const itemsToReturn = exchangeReturnItems.filter(i => i.return_qty > 0);
    if (itemsToReturn.length === 0) return alert('Vui lòng chọn ít nhất 1 SP trả lại');
    if (exchangeNewItems.length === 0) return alert('Vui lòng chọn ít nhất 1 SP mới');
    if (submitting) return;
    setSubmitting(true);
    try {
      const returnTotal = itemsToReturn.reduce((s, i) => s + i.return_qty * parseFloat(i.unit_price), 0);
      const newTotal = exchangeNewItems.reduce((s, i) => s + i.quantity * parseFloat(i.unit_price), 0);
      const diff = newTotal - returnTotal;

      // 1. Create return record
      const returnCode = await genReturnCode();
      const { data: returnRecord, error: retErr } = await supabase.from('order_returns').insert([{
        tenant_id: tenant.id, order_id: selectedOrder.id,
        return_code: returnCode, reason: exchangeReason || 'Đổi hàng',
        status: 'completed', total_refund: returnTotal,
        refund_method: 'exchange',
        created_by: currentUser.id, created_at: getNowISOVN()
      }]).select().single();
      if (retErr) throw retErr;

      const returnItemsData = itemsToReturn.map(i => ({
        return_id: returnRecord.id, product_id: i.product_id,
        product_name: i.product_name, quantity: i.return_qty,
        unit_price: parseFloat(i.unit_price),
        subtotal: i.return_qty * parseFloat(i.unit_price),
        condition: i.condition, note: 'Đổi hàng'
      }));
      await supabase.from('order_return_items').insert(returnItemsData);

      // 2. Restore stock for returned items
      const warehouseId = selectedOrder.warehouse_id;
      for (const item of itemsToReturn) {
        if (warehouseId) {
          await supabase.rpc('adjust_warehouse_stock', {
            p_warehouse_id: warehouseId, p_product_id: item.product_id, p_delta: item.return_qty
          });
        } else {
          await supabase.rpc('adjust_stock', { p_product_id: item.product_id, p_delta: item.return_qty });
        }
      }

      // 3. Create new order for exchange items
      const orderNumber = await genOrderNumber();
      const { data: newOrder, error: orderErr } = await supabase.from('orders').insert([{
        tenant_id: tenant.id, order_number: orderNumber, order_type: selectedOrder.order_type,
        status: 'confirmed', order_status: 'confirmed', shipping_status: 'pending',
        customer_id: selectedOrder.customer_id,
        customer_name: selectedOrder.customer_name, customer_phone: selectedOrder.customer_phone,
        shipping_address: selectedOrder.shipping_address,
        subtotal: newTotal, total_amount: Math.abs(diff) < 1 ? 0 : diff,
        payment_method: diff > 0 ? 'cash' : 'transfer',
        payment_status: Math.abs(diff) < 1 ? 'paid' : 'unpaid',
        paid_amount: 0,
        note: `Đổi hàng từ đơn ${selectedOrder.order_number} (${returnCode})`,
        created_by: currentUser.name,
        warehouse_id: warehouseId || null, order_source: 'manual',
        internal_note: `Đổi hàng: trả ${formatMoney(returnTotal)}, mới ${formatMoney(newTotal)}, chênh lệch ${diff > 0 ? '+' : ''}${formatMoney(diff)}`
      }]).select().single();
      if (orderErr) throw orderErr;

      // 4. Insert new order items + deduct stock
      const newItemsData = exchangeNewItems.map(item => ({
        order_id: newOrder.id, product_id: item.product_id, product_name: item.product_name,
        product_sku: item.product_sku, quantity: item.quantity,
        unit_price: parseFloat(item.unit_price), discount: 0,
        total_price: parseFloat(item.unit_price) * item.quantity,
        variant_id: item.variant_id || null, variant_name: item.variant_name || null
      }));
      await supabase.from('order_items').insert(newItemsData);

      for (const item of exchangeNewItems) {
        if (warehouseId) {
          await supabase.rpc('adjust_warehouse_stock', {
            p_warehouse_id: warehouseId, p_product_id: item.product_id, p_delta: -item.quantity
          });
        } else {
          await supabase.rpc('adjust_stock', { p_product_id: item.product_id, p_delta: -item.quantity });
        }
      }

      // 5. Create receipt for the difference
      if (Math.abs(diff) >= 1) {
        if (diff > 0) {
          const receiptNumber = await genReceiptNumber('thu');
          await supabase.from('receipts_payments').insert([{
            tenant_id: tenant.id, receipt_number: receiptNumber, type: 'thu',
            amount: diff, description: `Thu thêm đổi hàng - ${selectedOrder.order_number} → ${orderNumber}`,
            category: 'Bán hàng', receipt_date: getTodayVN(),
            status: 'approved', created_by: currentUser.name, created_at: getNowISOVN()
          }]);
        } else {
          const receiptNumber = await genReceiptNumber('chi');
          await supabase.from('receipts_payments').insert([{
            tenant_id: tenant.id, receipt_number: receiptNumber, type: 'chi',
            amount: Math.abs(diff), description: `Hoàn tiền đổi hàng - ${selectedOrder.order_number} → ${orderNumber}`,
            category: 'Hoàn tiền khách hàng', receipt_date: getTodayVN(),
            status: 'approved', created_by: currentUser.name, created_at: getNowISOVN()
          }]);
        }
      }

      showToast(`Đổi hàng thành công! Đơn mới: ${orderNumber}`);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'exchange', entityType: 'order', entityId: selectedOrder.order_number, entityName: orderNumber, description: `Đổi hàng từ ${selectedOrder.order_number} → ${orderNumber}: trả ${itemsToReturn.map(i => `${i.product_name}x${i.return_qty}`).join(', ')}, mới ${exchangeNewItems.map(i => `${i.product_name}x${i.quantity}`).join(', ')}, chênh lệch ${diff > 0 ? '+' : ''}${formatMoney(diff)}` });

      setShowExchangeModal(false);
      await loadOrderReturns(selectedOrder.id);
      await Promise.all([loadSalesData(), loadWarehouseData(), loadFinanceData(), loadPagedOrders()]);
    } catch (err) { console.error(err); alert('❌ Lỗi: ' + err.message); } finally { setSubmitting(false); }
  };

  // ---- Quick reorder ----
  const handleReorder = () => {
    if (cartItems.length > 0 && !window.confirm('Giỏ hàng hiện tại sẽ bị thay thế. Tiếp tục?')) return;
    const newCart = orderItems.map(item => {
      const prod = (products || []).find(p => p.id === item.product_id);
      return {
        product_id: item.product_id, product_name: item.product_name,
        product_sku: item.product_sku || '', unit_price: parseFloat(item.unit_price),
        quantity: item.quantity, discount: parseFloat(item.discount || 0),
        warranty_months: item.warranty_months || 0,
        stock: prod?.stock_quantity || 0
      };
    });
    setCartItems(newCart);
    setCustomerName(selectedOrder.customer_name || '');
    setCustomerPhone(selectedOrder.customer_phone || '');
    setCustomerId(selectedOrder.customer_id || '');
    setOrderType(selectedOrder.order_type || 'pos');
    if (selectedOrder.order_type === 'online') {
      setShippingAddress(selectedOrder.shipping_address || '');
      setShippingProvider(selectedOrder.shipping_provider || '');
    }
    setShowDetailModal(false);
    setShowCreateModal(true);
  };

  // ---- Toast ----
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ---- Bulk selection helpers ----
  const canBulkSelect = (o) => ['pending', 'packing'].includes(o.shipping_status || 'pending') && (o.order_status || o.status) !== 'cancelled' && !o.tracking_number;
  const selectableOnPage = serverOrders.filter(canBulkSelect);
  const allPageSelected = selectableOnPage.length > 0 && selectableOnPage.every(o => checkedOrderIds.has(o.id));

  const toggleCheck = (id) => {
    setCheckedOrderIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllPage = () => {
    if (allPageSelected) {
      setCheckedOrderIds(prev => {
        const next = new Set(prev);
        selectableOnPage.forEach(o => next.delete(o.id));
        return next;
      });
    } else {
      setCheckedOrderIds(prev => {
        const next = new Set(prev);
        selectableOnPage.forEach(o => next.add(o.id));
        return next;
      });
    }
  };

  const checkedOrders = serverOrders.filter(o => checkedOrderIds.has(o.id));
  const checkedTotal = checkedOrders.reduce((s, o) => s + (o.total_amount || 0), 0);

  // ---- Bulk print invoices ----
  const handleBulkPrint = async () => {
    if (checkedOrderIds.size === 0) return;
    const orderIds = [...checkedOrderIds];
    const pages = [];
    for (const oid of orderIds) {
      const order = serverOrders.find(o => o.id === oid);
      if (!order) continue;
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', oid);
      const oItems = items || [];
      if (oItems.length === 0) continue;
      let qrHtml = '';
      try {
        const qrDataUrl = await QRCode.toDataURL(order.order_number, { width: 200, margin: 1 });
        qrHtml = `<div style="margin-top:8px"><img src="${qrDataUrl}" style="width:80px;height:80px"></div>`;
      } catch (_e) { /* ignore */ }
      const logoHtml = tenant.logo_url ? `<img src="${tenant.logo_url}" style="max-height:40px;max-width:120px;object-fit:contain;margin-bottom:4px" crossorigin="anonymous" onerror="this.style.display='none'">` : '';
      pages.push(`<div class="page">
<div class="header">${logoHtml}<h2>${tenant.name || ''}</h2></div>
<div class="title">ĐƠN HÀNG #${order.order_number}</div>
<div class="order-info">
<p><b>Ngày:</b> ${new Date(order.created_at).toLocaleString('vi-VN')}</p>
<p><b>Khách:</b> ${order.customer_name || 'Khách lẻ'}${order.customer_phone ? ' - ' + order.customer_phone : ''}</p>
${order.shipping_address ? `<p><b>Địa chỉ:</b> ${order.shipping_address}</p>` : ''}
</div>
<table class="items"><thead><tr><th>STT</th><th>Sản phẩm</th><th class="r">SL</th><th class="r">Đơn giá</th><th class="r">Thành tiền</th></tr></thead><tbody>
${oItems.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.product_name}</td><td class="r">${i.quantity}</td><td class="r">${formatMoney(i.unit_price)}</td><td class="r">${formatMoney(i.total_price)}</td></tr>`).join('')}</tbody></table>
<table class="summary"><tr class="total"><td><b>TỔNG CỘNG</b></td><td class="r"><b>${formatMoney(order.total_amount)}</b></td></tr></table>
<div class="footer-row"><div>${qrHtml}</div><div style="text-align:right;font-size:11px"><p>NV: ${order.created_by || ''}</p></div></div>
</div>`);
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>In hàng loạt (${pages.length} đơn)</title>
<style>
@page{size:A5;margin:10mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#333}
.page{max-width:148mm;margin:0 auto;padding:12px;page-break-after:always}
.page:last-child{page-break-after:auto}
.header{text-align:center;padding-bottom:8px;border-bottom:2px solid #222;margin-bottom:10px}
.header h2{font-size:16px;margin:4px 0}
.title{text-align:center;font-size:17px;font-weight:bold;margin:10px 0 5px;letter-spacing:1px}
.order-info{margin:8px 0;font-size:11px;line-height:1.5}
table.items{width:100%;border-collapse:collapse;margin:10px 0}
table.items th,table.items td{border:1px solid #ccc;padding:5px 6px;text-align:left;font-size:11px}
table.items th{background:#f5f5f5;font-weight:600}
.r{text-align:right}
table.summary{width:100%;margin:6px 0}
table.summary td{padding:3px 6px;font-size:12px}
.total{border-top:2px solid #222}
.footer-row{display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px}
</style></head><body>${pages.join('')}
<script>window.onload=function(){window.print()}</script></body></html>`;
    const win = window.open('', '_blank', 'width=600,height=800');
    win.document.write(html); win.document.close();
  };

  // ---- Bulk VTP: validate + push ----
  const handleBulkVtpOpen = async () => {
    if (!vtpToken) return alert('Vui lòng kết nối Viettel Post trong Cài đặt > Vận chuyển');
    const sender = getSettingValue ? getSettingValue('shipping', 'vtp_sender_address', null) : null;
    if (!sender?.province_id) return alert('Chưa cấu hình địa chỉ lấy hàng VTP trong Cài đặt > Vận chuyển');
    setBulkVtpProgress(null);
    setBulkVtpService('');
    setBulkVtpPayer('receiver');
    setBulkVtpCod('cod');
    setVtpServicesList([]);
    setLoadingVtpServices(true);
    setShowBulkVtpModal(true);

    // Lấy đơn đầu tiên có đủ thông tin để tính phí mẫu
    const sampleOrder = checkedOrders.find(o => {
      const meta = o.shipping_metadata || {};
      return meta.province_id && meta.district_id;
    });
    const receiverProvince = sampleOrder?.shipping_metadata?.province_id || sender.province_id;
    const receiverDistrict = sampleOrder?.shipping_metadata?.district_id || sender.district_id;

    try {
      const result = await vtpApi.getPriceAll(vtpToken, {
        senderProvince: sender.province_id,
        senderDistrict: sender.district_id,
        receiverProvince,
        receiverDistrict,
        productWeight: 500,
        productPrice: sampleOrder?.total_amount || 500000,
        codAmount: sampleOrder?.total_amount || 500000,
      });
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        setVtpServicesList(result.data);
        // Auto-select first service
        const first = result.data[0];
        setBulkVtpService(first.MA_DV_CHINH || 'VCN');
      } else {
        // Fallback: dùng danh sách hardcode
        setVtpServicesList([]);
        setBulkVtpService('VCN');
      }
    } catch (err) {
      console.error('[VTP] getPriceAll error:', err);
      setVtpServicesList([]);
      setBulkVtpService('VCN');
    }
    setLoadingVtpServices(false);
  };

  const getBulkValidation = () => {
    const valid = [];
    const invalid = [];
    for (const o of checkedOrders) {
      const meta = o.shipping_metadata || {};
      const errors = [];
      if (!meta.province_id || !meta.district_id) errors.push('Thiếu tỉnh/quận/phường');
      if (!o.customer_phone?.trim()) errors.push('Thiếu SĐT');
      if (o.tracking_number) errors.push('Đã đẩy đơn');
      if (errors.length > 0) {
        invalid.push({ order: o, errors });
      } else {
        valid.push(o);
      }
    }
    return { valid, invalid };
  };

  const handleBulkVtpPush = async () => {
    const { valid } = getBulkValidation();
    if (valid.length === 0) return alert('Không có đơn hợp lệ để đẩy');
    const sender = getSettingValue('shipping', 'vtp_sender_address', null);
    const results = [];
    setBulkVtpProgress({ current: 0, total: valid.length, results: [] });

    for (let i = 0; i < valid.length; i++) {
      const o = valid[i];
      const meta = o.shipping_metadata || {};
      try {
        // Load items for this order
        const { data: items } = await supabase.from('order_items').select('*').eq('order_id', o.id);
        const oItems = items || [];
        const totalW = oItems.reduce((sum, it) => sum + (it.quantity || 1) * 500, 0);
        const isCod = bulkVtpCod === 'cod';
        const codAmt = isCod ? (o.total_amount - (o.paid_amount || 0)) : 0;

        const result = await vtpApi.createOrder(vtpToken, {
          partnerOrderNumber: o.order_number,
          senderName: sender.name, senderPhone: sender.phone, senderAddress: sender.address,
          senderProvince: Number(sender.province_id), senderDistrict: Number(sender.district_id), senderWard: Number(sender.ward_id || 0),
          receiverName: o.customer_name || 'Khách hàng',
          receiverPhone: o.customer_phone || '',
          receiverAddress: o.shipping_address || '',
          receiverProvince: Number(meta.province_id), receiverDistrict: Number(meta.district_id), receiverWard: Number(meta.ward_id || 0),
          productName: oItems.map(it => it.product_name).join(', ').slice(0, 200) || 'Hàng hóa',
          productDescription: oItems.map(it => `${it.product_name} x${it.quantity}`).join(', ').slice(0, 200),
          productQuantity: oItems.reduce((s, it) => s + it.quantity, 0),
          productWeight: totalW, productPrice: o.total_amount,
          codAmount: codAmt, orderService: bulkVtpService,
          orderPayment: isCod ? 3 : 1,
          orderNote: o.note || '',
          items: oItems
        });

        if (result.success && result.data) {
          const vtpCode = result.data.ORDER_NUMBER || result.data.order_code || result.data.ORDER_STATUSTEXT || '';
          if (!vtpCode) {
            results.push({ order: o, success: false, error: 'VTP không trả về mã vận đơn' });
          } else {
            const newMeta = { ...meta, vtp_order_code: vtpCode, vtp_service: bulkVtpService };
            await supabase.from('orders').update({
              tracking_number: vtpCode,
              shipping_metadata: newMeta,
              status: 'shipping',
              order_status: 'confirmed',
              shipping_status: 'shipped',
              shipping_provider: 'Viettel Post',
              shipping_service: bulkVtpService,
              updated_at: getNowISOVN()
            }).eq('id', o.id);
            results.push({ order: o, success: true, vtpCode });
          }
        } else {
          results.push({ order: o, success: false, error: result.error || 'Lỗi không xác định' });
        }
      } catch (err) {
        results.push({ order: o, success: false, error: err.message });
      }
      setBulkVtpProgress({ current: i + 1, total: valid.length, results: [...results] });
    }

    // Log bulk VTP push
    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'shipping', entityType: 'order', entityId: 'bulk', entityName: `${successCount} đơn`, description: `Đẩy hàng loạt VTP: ${successCount}/${results.length} đơn thành công` });
    }
    // Refresh data after bulk push
    setCheckedOrderIds(new Set());
    await Promise.all([loadSalesData(), loadPagedOrders()]);
  };

  // ---- Barcode/QR scan handler ----
  const handleBarcodeScan = async (scannedText) => {
    if (!scannedText || !tenant?.id) return;
    const text = scannedText.trim();
    setShowScanner(false);

    // 1. Check by product barcode
    const barcodeMatch = (products || []).find(p => p.barcode && p.barcode === text);
    if (barcodeMatch) {
      addToCart(barcodeMatch);
      showToast(`Da quet: ${barcodeMatch.name}`);
      return;
    }

    // 2. Check by product SKU
    const skuMatch = (products || []).find(p => p.sku && p.sku.toLowerCase() === text.toLowerCase());
    if (skuMatch) {
      addToCart(skuMatch);
      showToast(`Da quet: ${skuMatch.name}`);
      return;
    }

    showToast('Không tìm thấy sản phẩm với mã: ' + text, 'error');
  };

  // ---- USB barcode scanner support ----
  React.useEffect(() => {
    if (!showCreateModal) return;
    let buffer = '';
    let timer = null;

    const handleKeydown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Enter' && buffer.length >= 4) {
        handleBarcodeScan(buffer);
        buffer = '';
        return;
      }
      if (e.key.length === 1) {
        buffer += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => { buffer = ''; }, 150);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      clearTimeout(timer);
    };
  }, [showCreateModal, products, tenant]);

  // ---- Multi-payment helpers ----
  const _addPaymentSplit = () => {
    setPaymentSplits(prev => [...prev, { method: 'transfer', amount: '' }]);
  };
  const _removePaymentSplit = (idx) => {
    if (paymentSplits.length <= 1) return;
    setPaymentSplits(prev => prev.filter((_, i) => i !== idx));
  };
  const _updatePaymentSplit = (idx, field, value) => {
    setPaymentSplits(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };
  const totalPaid = paymentSplits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const _paymentRemaining = totalAmount - totalPaid;

  // ---- Export CSV (server-side fetch all matching) ----
  const exportOrdersCSV = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    let query = supabase.from('orders').select('*').eq('tenant_id', tenant.id);
    if (filterStatus !== 'all') query = query.eq('status', filterStatus);
    if (filterType !== 'all') query = query.eq('order_type', filterType);
    if (filterPayment !== 'all') query = query.eq('payment_status', filterPayment);
    if (filterCreatedBy !== 'all') query = query.eq('created_by', filterCreatedBy);
    if (filterSource !== 'all') query = query.eq('order_source', filterSource);
    if (filterShipping === 'not_shipped') { query = query.in('status', ['confirmed', 'packing']).is('tracking_number', null); }
    else if (filterShipping === 'shipped') { query = query.not('tracking_number', 'is', null); }
    else if (filterShipping === 'shipping') { query = query.eq('status', 'shipping'); }
    else if (filterShipping === 'delivered') { query = query.eq('status', 'delivered'); }
    else if (filterShipping === 'returning') { query = query.eq('status', 'returned'); }
    if (filterStartDate) query = query.gte('created_at', filterStartDate);
    if (filterEndDate) query = query.lte('created_at', filterEndDate + 'T23:59:59');
    if (search.trim()) {
      const q = search.trim().replace(/[,%]/g, '');
      if (q) query = query.or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`);
    }
    query = query.order('created_at', { ascending: false });
    const { data: allOrders } = await query;
    const list = allOrders || [];
    const headers = ['Mã đơn', 'Loại', 'Trạng thái', 'Khách hàng', 'SĐT', 'Tổng tiền', 'Thanh toán', 'Ngày tạo'];
    const rows = list.map(o => [
      o.order_number, orderTypes[o.order_type]?.label || o.order_type,
      orderStatuses[o.status]?.label || o.status, o.customer_name || 'Khách lẻ',
      o.customer_phone || '', o.total_amount || 0,
      paymentStatuses[o.payment_status]?.label || o.payment_status,
      new Date(o.created_at).toLocaleDateString('vi-VN')
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `don-hang-${getDateStrVN()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Pagination (server-side) ----
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ---- Status badge (3-way) ----
  const StatusBadge = ({ status, order }) => {
    if (order) {
      const os = orderStatusValues[order.order_status] || orderStatusValues.open;
      const ss = shippingStatusValues[order.shipping_status] || shippingStatusValues.pending;
      const ps = paymentStatusValues[order.payment_status] || paymentStatusValues[order.payment_status === 'partial' ? 'partial_paid' : 'unpaid'] || paymentStatusValues.unpaid;
      return (
        <div className="flex flex-wrap gap-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${os.color}`}>{os.icon} {os.label}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ss.color}`}>{ss.icon} {ss.label}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ps.color}`}>{ps.icon} {ps.label}</span>
        </div>
      );
    }
    const s = orderStatuses[status] || orderStatuses.new;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.icon} {s.label}</span>;
  };

  return (
    <div className={`p-4 md:p-6 space-y-4 ${checkedOrderIds.size > 0 ? 'pb-28 md:pb-20' : 'pb-20 md:pb-6'}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-bold">🛒 Đơn Hàng</h2>
        <div className="flex gap-2">
          {hasPermission('sales', 2) && (
            <button onClick={() => setShowHaravanImport(true)}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm">
              Import Haravan
            </button>
          )}
          {hasPermission('sales', 2) && (
            <button onClick={() => { resetForm(); setShowCreateModal(true); }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm">
              + Tạo đơn hàng
            </button>
          )}
        </div>
      </div>

      {/* ===== Stats (5 clickable cards) ===== */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { key: 'total', label: 'Tổng', value: statusCounts.total, color: 'bg-gray-50 text-gray-700 border-gray-200', active: filterOrderStatus === 'all' && filterShippingStatus === 'all' && filterStatus === 'all' && filterShipping === 'all' },
          { key: 'waiting_confirm', label: 'Chờ XN', value: statusCounts.waiting_confirm, color: 'bg-yellow-50 text-yellow-700 border-yellow-200', active: filterOrderStatus === 'open' },
          { key: 'not_shipped', label: 'Chưa đẩy đơn', value: statusCounts.not_shipped, color: 'bg-amber-50 text-amber-700 border-amber-200', active: filterShipping === 'not_shipped' },
          { key: 'shipping', label: 'Đang giao', value: statusCounts.shipping, color: 'bg-purple-50 text-purple-700 border-purple-200', active: filterShippingStatus === 'shipped' },
          { key: 'completed', label: 'Hoàn thành', value: statusCounts.completed, color: 'bg-green-50 text-green-700 border-green-200', active: filterOrderStatus === 'completed' },
        ].map(s => (
          <button key={s.key} onClick={() => {
            setFilterStatus('all'); setFilterShipping('all'); setFilterOrderStatus('all'); setFilterShippingStatus('all');
            if (s.key === 'waiting_confirm') setFilterOrderStatus('open');
            else if (s.key === 'not_shipped') setFilterShipping('not_shipped');
            else if (s.key === 'shipping') setFilterShippingStatus('shipped');
            else if (s.key === 'completed') setFilterOrderStatus('completed');
            setPage(1);
          }}
            className={`flex-shrink-0 min-w-[80px] p-2 rounded-lg text-center border transition ${s.active ? s.color + ' ring-2 ring-offset-1 ring-green-500' : s.color + ' opacity-70 hover:opacity-100'}`}>
            <div className="text-lg font-bold">{s.value.toLocaleString('vi-VN')}</div>
            <div className="text-[10px] sm:text-xs whitespace-nowrap">{s.label}</div>
          </button>
        ))}
      </div>

      {/* ===== Filters ===== */}
      <div className="space-y-2 bg-gray-50 rounded-xl p-3">
        {/* Row 1: Trạng thái, Vận chuyển, Thanh toán, NV tạo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={filterOrderStatus} onChange={e => { setFilterOrderStatus(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
            <option value="all">Đơn hàng: Tất cả</option>
            {Object.entries(orderStatusValues).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={filterShippingStatus} onChange={e => { setFilterShippingStatus(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
            <option value="all">Vận chuyển: Tất cả</option>
            {Object.entries(shippingStatusValues).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={filterPayment} onChange={e => { setFilterPayment(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
            <option value="all">Thanh toán: Tất cả</option>
            {Object.entries(paymentStatusValues).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={filterCreatedBy} onChange={e => { setFilterCreatedBy(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
            <option value="all">NV tạo: Tất cả</option>
            {(allUsers || []).filter(u => u.is_active !== false).map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </div>
        {/* Row 2: Loại đơn, Nguồn đơn, Tìm kiếm */}
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_2fr] gap-2">
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
            <option value="all">Loại: Tất cả</option>
            {Object.entries(orderTypes).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
            <option value="all">Nguồn: Tất cả</option>
            {Object.entries(orderSources).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="🔍 Tìm mã đơn, tên KH, SĐT..."
            className="border rounded-lg px-3 py-1.5 text-xs sm:text-sm bg-white col-span-2 sm:col-span-1" />
        </div>
        {/* Row 3: Ngày, Sắp xếp, CSV */}
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" value={filterStartDate} onChange={e => { setFilterStartDate(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white" />
          <span className="text-gray-400 text-xs">→</span>
          <input type="date" value={filterEndDate} onChange={e => { setFilterEndDate(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white" />
          <select value={`${sortBy}-${sortOrder}`} onChange={e => { const [by, ord] = e.target.value.split('-'); setSortBy(by); setSortOrder(ord); setPage(1); }}
            className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
            <option value="created_at-desc">Mới nhất</option>
            <option value="created_at-asc">Cũ nhất</option>
            <option value="total_amount-desc">Giá trị cao</option>
            <option value="total_amount-asc">Giá trị thấp</option>
          </select>
          {hasPermission('sales', 2) && <button onClick={exportOrdersCSV} className="px-3 py-1.5 bg-white hover:bg-gray-100 border rounded-lg text-xs sm:text-sm text-gray-600" title="Xuất CSV">📥 CSV</button>}
          {(filterStatus !== 'all' || filterType !== 'all' || filterPayment !== 'all' || filterCreatedBy !== 'all' || filterSource !== 'all' || filterShipping !== 'all' || filterStartDate || filterEndDate) && (
            <button onClick={() => { setFilterStatus('all'); setFilterType('all'); setFilterPayment('all'); setFilterCreatedBy('all'); setFilterSource('all'); setFilterShipping('all'); setFilterStartDate(''); setFilterEndDate(''); setPage(1); }}
              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-xs sm:text-sm text-red-600">Xoá lọc</button>
          )}
        </div>
      </div>

      {/* ===== Select All + Count ===== */}
      {!loadingOrders && serverOrders.length > 0 && selectableOnPage.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 border rounded-lg px-3 py-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={allPageSelected} onChange={toggleAllPage}
              className="w-4 h-4 rounded border-gray-300 text-green-600" />
            <span className="text-gray-700">
              {allPageSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${selectableOnPage.length} đơn có thể đẩy)`}
            </span>
          </label>
          <span className="text-xs text-gray-500">Hiện {serverOrders.length} / {totalCount.toLocaleString('vi-VN')}</span>
        </div>
      )}

      {/* ===== Order List ===== */}
      <div className="space-y-2">
        {loadingOrders ? (
          <div className="text-center py-12 text-gray-400"><div className="text-2xl mb-2 animate-spin inline-block">⏳</div><p>Đang tải đơn hàng...</p></div>
        ) : serverOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">🛒</div><p>Chưa có đơn hàng</p></div>
        ) : serverOrders.map(o => {
          const shipLabel = getShippingLabel(o);
          const itemsText = getItemsPreview(o.id);
          const selectable = canBulkSelect(o);
          const isChecked = checkedOrderIds.has(o.id);
          return (
            <div key={o.id} className={`bg-white rounded-xl border p-3 md:p-4 hover:shadow-md cursor-pointer transition-shadow space-y-1 ${isChecked ? 'ring-2 ring-green-500 border-green-300' : ''}`}>
              <div className="flex gap-2">
                {/* Checkbox or tracking badge */}
                <div className="flex-shrink-0 pt-0.5" onClick={e => e.stopPropagation()}>
                  {selectable ? (
                    <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(o.id)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 cursor-pointer" />
                  ) : o.tracking_number ? (
                    <span className="text-[10px] text-purple-600" title={o.tracking_number}>🚚</span>
                  ) : (
                    <span className="w-4 inline-block" />
                  )}
                </div>
                {/* Card content */}
                <div className="flex-1 min-w-0" onClick={() => { setSelectedOrder(o); setEditTracking(o.tracking_number || ''); loadOrderItems(o.id); loadOrderReturns(o.id); loadOrderTimeline(o.id, o.order_number); setEditMode(false); setShowPaymentInput(false); setShowReturnModal(false); setShowDetailModal(true); }}>
                  {/* Line 1: Mã đơn, loại, trạng thái, tổng tiền */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="font-semibold text-sm">{o.order_number}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${o.order_type === 'pos' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                        {orderTypes[o.order_type]?.icon} {orderTypes[o.order_type]?.label || o.order_type}
                      </span>
                      <StatusBadge order={o} />
                    </div>
                    <div className="font-bold text-green-700 text-sm whitespace-nowrap">{formatMoney(o.total_amount)}</div>
                  </div>
                  {/* Line 2: KH, SĐT, ngày, thanh toán */}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="truncate">
                      {o.customer_name && <span>👤 {o.customer_name}</span>}
                      {o.customer_phone && <span className="hidden sm:inline"> · 📞 {o.customer_phone}</span>}
                      <span className="ml-1.5">· 📅 {new Date(o.created_at).toLocaleDateString('vi-VN')}</span>
                    </div>
                    <span className={`whitespace-nowrap ml-2 font-medium ${o.payment_status === 'paid' ? 'text-green-600' : o.payment_status === 'partial' ? 'text-amber-600' : 'text-red-500'}`}>
                      {paymentStatuses[o.payment_status]?.label || o.payment_status}
                    </span>
                  </div>
                  {/* Line 3 (desktop): Địa chỉ */}
                  {o.shipping_address && (
                    <div className="text-xs text-gray-400 truncate hidden sm:block">📍 {o.shipping_address}</div>
                  )}
                  {/* Line 4 (desktop): VC status + NV tạo */}
                  <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
                    {shipLabel && <span className={shipLabel.color}>{shipLabel.icon} {shipLabel.text}</span>}
                    {o.created_by && <span>👨‍💼 NV: {o.created_by}</span>}
                    {itemsText && <span className="text-gray-400 truncate">📦 {itemsText}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">{totalCount.toLocaleString('vi-VN')} đơn · Trang {page}/{totalPages}</div>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className={`px-3 py-1.5 rounded-lg text-sm ${page <= 1 ? 'text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>←</button>
            {(() => {
              const pages = [];
              const maxVisible = 7;
              if (totalPages <= maxVisible) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                let start = Math.max(2, page - 2);
                let end = Math.min(totalPages - 1, page + 2);
                if (page <= 3) { start = 2; end = 5; }
                if (page >= totalPages - 2) { start = totalPages - 4; end = totalPages - 1; }
                if (start > 2) pages.push('...');
                for (let i = start; i <= end; i++) pages.push(i);
                if (end < totalPages - 1) pages.push('...');
                pages.push(totalPages);
              }
              return pages.map((p, idx) =>
                p === '...' ? <span key={`dot-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">...</span> :
                <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium ${page === p ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>{p}</button>
              );
            })()}
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className={`px-3 py-1.5 rounded-lg text-sm ${page >= totalPages ? 'text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>→</button>
          </div>
        </div>
      )}

      {/* ============ CREATE ORDER MODAL ============ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full my-4">
            <div className="p-4 border-b bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-xl flex justify-between items-center">
              <h3 className="font-bold text-lg">Tạo đơn hàng mới</h3>
              <button onClick={() => { if (cartItems.length > 0 && !window.confirm('Giỏ hàng có sản phẩm. Đóng sẽ mất dữ liệu. Tiếp tục?')) return; setShowCreateModal(false); }} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Order type — Online first */}
              <div className="flex gap-2">
                {['online', 'pos'].map(k => {
                  const v = orderTypes[k];
                  return (
                    <button key={k} onClick={() => setOrderType(k)}
                      className={`flex-1 p-3 rounded-lg text-center font-medium text-sm border-2 transition ${orderType === k ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'}`}>
                      {v.icon} {v.label}
                    </button>
                  );
                })}
              </div>

              {/* A. Kho bán */}
              {(warehouses || []).length > 0 && (
                <div className="bg-amber-50 rounded-lg p-3 space-y-1">
                  <label className="text-sm font-medium text-amber-700">Kho xuất hàng</label>
                  <select value={selectedWarehouseId} onChange={e => { setSelectedWarehouseId(e.target.value); setCartItems([]); }}
                    className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white">
                    {warehouses.filter(w => w.is_active).map(w => (
                      <option key={w.id} value={w.id}>{w.name}{w.is_default ? ' (Mặc định)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* B. Khách hàng */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <label className="text-sm font-medium text-gray-700">Khách hàng</label>
                <div className="grid grid-cols-2 gap-2">
                  <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                    onBlur={() => {
                      if (customerPhone.trim() && !customerId) {
                        const found = (customers || []).find(c => c.phone === customerPhone.trim());
                        if (found) {
                          setCustomerId(found.id); setCustomerName(found.name);
                          setShippingAddress(found.address || '');
                          if (found.address_data) { setShippingAddressData(found.address_data); }
                        }
                      }
                    }}
                    placeholder="SĐT" className="border rounded-lg px-3 py-2 text-sm" />
                  <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Tên KH" className="border rounded-lg px-3 py-2 text-sm" />
                </div>
                {/* Customer search dropdown */}
                <div className="relative">
                  <input value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                    onFocus={() => setShowCustomerDropdown(true)} placeholder="Tìm khách hàng (tên, SĐT)..."
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                  {showCustomerDropdown && searchedCustomers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 z-10 max-h-40 overflow-y-auto">
                      {searchedCustomers.map(c => (
                        <button key={c.id} onClick={() => {
                          setCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone || '');
                          setCustomerSearch(c.name);
                          if (c.address_data) { setShippingAddressData(c.address_data); }
                          // Auto-select default address if available
                          const defAddr = (customerAddresses || []).find(a => a.customer_id === c.id && a.is_default);
                          if (defAddr) {
                            setSelectedAddressId(defAddr.id);
                            setShippingAddress([defAddr.address, defAddr.ward, defAddr.district, defAddr.province].filter(Boolean).join(', '));
                          } else {
                            setSelectedAddressId('');
                            setShippingAddress(c.address || '');
                          }
                          setShowCustomerDropdown(false);
                        }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                          <div className="font-medium">{c.name}</div>
                          {c.phone && <div className="text-xs text-gray-500">{c.phone}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Saved addresses dropdown */}
                {customerId && (() => {
                  const custAddrs = (customerAddresses || []).filter(a => a.customer_id === customerId);
                  if (custAddrs.length === 0) return null;
                  return (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Địa chỉ đã lưu</label>
                      <select value={selectedAddressId} onChange={e => {
                        const addrId = e.target.value;
                        setSelectedAddressId(addrId);
                        if (addrId) {
                          const addr = custAddrs.find(a => a.id === addrId);
                          if (addr) setShippingAddress([addr.address, addr.ward, addr.district, addr.province].filter(Boolean).join(', '));
                        } else {
                          setShippingAddress('');
                        }
                      }} className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="">-- Nhập địa chỉ mới --</option>
                        {custAddrs.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.label}{a.is_default ? ' ★' : ''}: {[a.address, a.ward, a.district, a.province].filter(Boolean).join(', ')}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
                {/* Address: AddressPicker if VTP token available, else plain input */}
                {!selectedAddressId && (vtpToken ? (
                  <div className="space-y-2">
                    <AddressPicker token={vtpToken} value={shippingAddressData} onChange={setShippingAddressData} />
                    <input value={shippingAddressDetail} onChange={e => setShippingAddressDetail(e.target.value)}
                      placeholder="Số nhà, tên đường..." className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input value={shippingAddress} onChange={e => setShippingAddress(e.target.value)}
                      placeholder="Địa chỉ giao hàng (nhập tay)" className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                ))}
              </div>

              {/* B2. Vận chuyển (online) */}
              {orderType === 'online' && (
                <div className="bg-purple-50 rounded-lg p-3 space-y-2">
                  <label className="text-sm font-medium text-purple-700">Vận chuyển</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={shippingProvider} onChange={e => setShippingProvider(e.target.value)}
                      className="border border-purple-300 rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="">-- Chọn đơn vị VC --</option>
                      {(dynamicShippingProviders || shippingProviders).map(sp => (
                        <option key={sp} value={sp}>{sp}</option>
                      ))}
                    </select>
                    <input type="number" min="0" value={shippingFee} onChange={e => setShippingFee(e.target.value)}
                      placeholder="Phí ship (VNĐ)" className="border border-purple-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  {shipFee > 0 && (
                    <div className="flex gap-2">
                      {Object.entries(shippingPayers).map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setShippingPayer(key)}
                          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition ${shippingPayer === key ? 'border-purple-500 bg-purple-100 text-purple-700' : 'border-gray-200 bg-white text-gray-600'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* C. Sản phẩm — Dropdown search */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Sản phẩm</label>
                <div className="relative">
                  <div className="flex gap-2">
                    <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
                      placeholder="Tìm sản phẩm (tên, mã, barcode)..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                    <button type="button" onClick={() => setShowScanner(true)}
                      className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200"
                      title="Quét mã barcode/QR">📷</button>
                  </div>
                  {/* Product dropdown (max 10 results) */}
                  {productSearch.trim() && (
                    <div className="absolute top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 z-10 max-h-64 overflow-y-auto">
                      {displayProducts.slice(0, 10).map(p => {
                        const stock = getProductStock(p);
                        const outOfStock = stock <= 0;
                        return (
                          <button key={p.id} type="button" disabled={outOfStock}
                            onClick={() => { addToCart(p); setProductSearch(''); }}
                            className={`w-full text-left px-3 py-2 flex items-center gap-3 ${outOfStock ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-green-50'}`}>
                            {p.image_url ? (
                              <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400 text-xs">SP</div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {p.name}
                                {p.is_combo && <span className="ml-1 px-1 py-0.5 bg-orange-100 text-orange-700 text-[9px] rounded font-medium">Combo</span>}
                              </div>
                              <div className="text-xs text-gray-500">{p.sku || ''} {p.category ? `- ${p.category}` : ''}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-bold text-green-700">{formatMoney(p.sell_price)}</div>
                              <div className={`text-xs ${outOfStock ? 'text-red-500' : 'text-gray-400'}`}>Tồn: {stock}</div>
                            </div>
                          </button>
                        );
                      })}
                      {displayProducts.length === 0 && <div className="px-3 py-4 text-center text-gray-400 text-sm">Không tìm thấy sản phẩm</div>}
                    </div>
                  )}
                </div>

                {/* Cart table */}
                {cartItems.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="text-sm font-medium text-gray-700">Giỏ hàng ({cartItems.length} SP)</div>
                    {cartItems.map((item, idx) => (
                      <div key={idx} className="bg-white border rounded-lg p-2 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {item.product_name}
                            {item.is_combo && <span className="ml-1 px-1 py-0.5 bg-orange-100 text-orange-700 text-[9px] rounded font-medium">Combo</span>}
                          </div>
                          {item.product_sku && <div className="text-[10px] text-gray-400">{item.product_sku}</div>}
                          {item.is_combo && <div className="text-[10px] text-orange-600 truncate">Gồm: {getComboChildrenLabel(item.product_id)}</div>}
                          {parseInt(item.quantity) > item.stock && <div className="text-xs text-red-500 font-medium">Vượt tồn kho! (tồn: {item.stock})</div>}
                        </div>
                        <input type="number" min="1" value={item.quantity} onChange={e => updateCartItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-14 border rounded px-2 py-1 text-sm text-center" />
                        <span className="text-xs text-gray-400">x</span>
                        <input type="number" value={item.unit_price} onChange={e => updateCartItem(idx, 'unit_price', e.target.value)}
                          className="w-24 border rounded px-2 py-1 text-sm text-right" />
                        <span className="text-sm font-medium text-green-600 w-24 text-right">
                          {formatMoney((parseFloat(item.unit_price) - parseFloat(item.discount || 0)) * parseInt(item.quantity || 0))}
                        </span>
                        <button onClick={() => removeCartItem(idx)} className="text-red-400 hover:text-red-600">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* D. Thanh toán */}
              <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                <label className="text-sm font-medium text-blue-700">Phương thức thanh toán</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(paymentMethods).map(([key, pm]) => (
                    <button key={key} type="button" onClick={() => setPaymentMethod(key)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition ${paymentMethod === key ? 'border-blue-500 bg-blue-100 text-blue-700' : 'border-gray-200 bg-white text-gray-600'}`}>
                      {pm.icon} {pm.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* E. Mã giảm giá */}
              <div>
                <label className="text-sm font-medium text-blue-700">Mã giảm giá</label>
                {appliedCoupon ? (
                  <div className="flex items-center gap-2 mt-1 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-green-700 font-medium text-sm">
                      {appliedCoupon.code} — Giảm {formatMoney(couponDiscount)}
                    </span>
                    <button type="button" onClick={removeCoupon} className="ml-auto text-red-500 text-xs hover:text-red-700">Bỏ</button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-1">
                    <input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                      placeholder="Nhập mã..." className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
                    <button type="button" onClick={validateAndApplyCoupon}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Áp dụng</button>
                  </div>
                )}
                {couponError && <p className="text-red-500 text-xs mt-1">{couponError}</p>}
              </div>

              {/* F. Ghi chú */}
              <textarea value={internalNote} onChange={e => setInternalNote(e.target.value)} rows={2} placeholder="Ghi chú nội bộ..."
                className="w-full border rounded-lg px-3 py-2 text-sm" />

              {/* G. Footer: Tổng SP + Tổng tiền + Tạo đơn */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{cartItems.reduce((s, i) => s + parseInt(i.quantity || 0), 0)} sản phẩm</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Mã giảm giá ({appliedCoupon?.code})</span>
                    <span>-{formatMoney(couponDiscount)}</span>
                  </div>
                )}
                {shipFee > 0 && (
                  <div className="flex justify-between text-sm text-purple-600">
                    <span>Phí vận chuyển ({shippingPayers[shippingPayer]})</span>
                    <span>{shippingPayer === 'customer' ? `+${formatMoney(shipFee)}` : formatMoney(shipFee)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-green-700 pt-1 border-t border-green-200">
                  <span>Tổng cộng</span>
                  <span>{formatMoney(totalAmount)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => { if (cartItems.length > 0 && !window.confirm('Giỏ hàng có sản phẩm. Hủy sẽ mất dữ liệu. Tiếp tục?')) return; setShowCreateModal(false); }} className="flex-1 px-4 py-2.5 bg-gray-200 rounded-lg font-medium text-sm">Hủy</button>
                <button onClick={handleCreateOrder} disabled={submitting}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm text-white ${submitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}>
                  {submitting ? 'Đang xử lý...' : 'Tạo đơn'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR/Barcode Scanner */}
      <QRScanner isOpen={showScanner} onScanSuccess={handleBarcodeScan} onClose={() => setShowScanner(false)} />

      {/* ============ DETAIL MODAL ============ */}
      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full my-4">
            <div className="p-4 border-b bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-xl flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">{selectedOrder.order_number}</h3>
                <div className="text-sm text-green-100 flex items-center gap-2">
                  <span>{orderTypes[selectedOrder.order_type]?.label}</span>
                  {selectedOrder.order_source && selectedOrder.order_source !== 'manual' && (
                    <><span>•</span><span>{orderSources[selectedOrder.order_source]?.icon} {orderSources[selectedOrder.order_source]?.label}</span></>
                  )}
                  <span>•</span>
                  <span>{new Date(selectedOrder.created_at).toLocaleString('vi-VN')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={printPackingSlip} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-medium">📦 Phiếu đóng gói</button>
                <button onClick={printInvoice} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-medium">🖨️ In</button>
                <button onClick={() => { setShowDetailModal(false); setSelectedOrder(null); setEditMode(false); setShowPaymentInput(false); }} className="text-white/80 hover:text-white text-xl">✕</button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Status + Actions */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <StatusBadge order={selectedOrder} />
                <div className="flex gap-2 flex-wrap">
                  {hasPermission('sales', 2) && (orderStatusFlow[selectedOrder.order_type]?.[selectedOrder.status] || []).map(nextStatus => (
                    <button key={nextStatus} onClick={() => changeOrderStatus(selectedOrder.id, nextStatus, selectedOrder)}
                      disabled={submitting}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${submitting ? 'opacity-50 cursor-not-allowed' : ''} ${nextStatus === 'cancelled' ? 'bg-red-100 text-red-700' : nextStatus === 'returned' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      {submitting ? '...' : '→'} {orderStatuses[nextStatus]?.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons: Edit + Payment + Reorder */}
              {(() => {
                const effectiveOrderStatus = selectedOrder.order_status || selectedOrder.status;
                const effectiveShippingStatus = selectedOrder.shipping_status || 'pending';
                const canEditOrder = ['open', 'confirmed'].includes(effectiveOrderStatus) && ['pending', 'packing'].includes(effectiveShippingStatus);
                const canPay = selectedOrder.payment_status !== 'paid' && !['cancelled', 'returned'].includes(effectiveOrderStatus);
                const canReorder = ['completed', 'cancelled', 'returned'].includes(effectiveOrderStatus);
                const canReturn = (['delivered'].includes(effectiveShippingStatus) || ['completed'].includes(effectiveOrderStatus)) && orderItems.length > 0;
                return (
                  <div className="flex gap-2 flex-wrap">
                    {hasPermission('sales', 2) && canEditOrder && !editMode && <button onClick={enterEditMode} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">✏️ Sửa đơn</button>}
                    {hasPermission('sales', 2) && canPay && !showPaymentInput && <button onClick={() => setShowPaymentInput(true)} className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium">💰 Thanh toán</button>}
                    {hasPermission('sales', 2) && canReturn && <button onClick={openReturnModal} className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium">↩️ Trả hàng</button>}
                    {hasPermission('sales', 2) && canReturn && <button onClick={openExchangeModal} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium">🔄 Đổi hàng</button>}
                    {hasPermission('sales', 2) && canReorder && orderItems.length > 0 && <button onClick={handleReorder} className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">📋 Đặt lại</button>}
                  </div>
                );
              })()}

              {/* Customer info / Edit mode */}
              {editMode ? (
                <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium text-blue-700 mb-1">Sửa thông tin đơn hàng</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={editData.customer_name} onChange={e => setEditData(d => ({ ...d, customer_name: e.target.value }))} placeholder="Tên KH" className="border rounded-lg px-3 py-1.5 text-sm" />
                    <input value={editData.customer_phone} onChange={e => setEditData(d => ({ ...d, customer_phone: e.target.value }))} placeholder="SĐT" className="border rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  {selectedOrder.order_type === 'online' && (
                    <>
                      <input value={editData.shipping_address} onChange={e => setEditData(d => ({ ...d, shipping_address: e.target.value }))} placeholder="Địa chỉ giao hàng" className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                      <div className="grid grid-cols-3 gap-2">
                        <select value={editData.shipping_provider} onChange={e => setEditData(d => ({ ...d, shipping_provider: e.target.value }))}
                          className="border rounded-lg px-3 py-1.5 text-sm">
                          <option value="">-- ĐV vận chuyển --</option>
                          {(dynamicShippingProviders || shippingProviders).map(sp => (
                            <option key={sp} value={sp}>{sp}</option>
                          ))}
                        </select>
                        <input type="number" min="0" value={editData.shipping_fee} onChange={e => setEditData(d => ({ ...d, shipping_fee: e.target.value }))} placeholder="Phí ship" className="border rounded-lg px-3 py-1.5 text-sm" />
                        <select value={editData.shipping_payer} onChange={e => setEditData(d => ({ ...d, shipping_payer: e.target.value }))}
                          className="border rounded-lg px-3 py-1.5 text-sm">
                          {Object.entries(shippingPayers).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={editData.discount_amount} onChange={e => setEditData(d => ({ ...d, discount_amount: e.target.value }))} placeholder="Chiết khấu" className="border rounded-lg px-3 py-1.5 text-sm" />
                    <input value={editData.discount_note} onChange={e => setEditData(d => ({ ...d, discount_note: e.target.value }))} placeholder="Lý do CK" className="border rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <textarea value={editData.note} onChange={e => setEditData(d => ({ ...d, note: e.target.value }))} rows={2} placeholder="Ghi chú..." className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                  <div>
                    <label className="text-xs text-blue-600 mb-1 block">Phương thức thanh toán</label>
                    <select value={editData.payment_method} onChange={e => setEditData(d => ({ ...d, payment_method: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm">
                      {Object.entries(paymentMethods).map(([key, pm]) => (
                        <option key={key} value={key}>{pm.icon} {pm.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditMode(false)} className="flex-1 px-3 py-1.5 bg-gray-200 rounded-lg text-xs font-medium">Hủy</button>
                    <button onClick={handleSaveEdit} disabled={submitting} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white ${submitting ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                      {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm font-medium mb-1">Khách hàng</div>
                  <div className="text-sm">{selectedOrder.customer_name || 'Khách lẻ'} {selectedOrder.customer_phone && `• ${selectedOrder.customer_phone}`}</div>
                  {selectedOrder.shipping_address && <div className="text-xs text-gray-500 mt-1">📍 {selectedOrder.shipping_address}</div>}
                </div>
              )}

              {/* Shipping (online) */}
              {selectedOrder.order_type === 'online' && (
                <div className="bg-purple-50 rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium text-purple-700 flex items-center gap-1.5">
                    🚚 Vận chuyển
                    {selectedOrder.shipping_provider && <span className="text-xs font-normal text-purple-500">- {selectedOrder.shipping_provider}</span>}
                  </div>

                  {/* Thông tin cơ bản */}
                  {(selectedOrder.shipping_service || selectedOrder.shipping_fee > 0 || selectedOrder.total_weight > 0) && (
                    <div className="text-sm flex items-center gap-1 flex-wrap text-gray-600">
                      {selectedOrder.shipping_service && (
                        <span className="px-1.5 py-0.5 bg-purple-200 text-purple-800 rounded text-xs">{shippingServices[selectedOrder.shipping_service]?.label || selectedOrder.shipping_service}</span>
                      )}
                      {selectedOrder.shipping_fee > 0 && <span>Ship: {formatMoney(selectedOrder.shipping_fee)} ({shippingPayers[selectedOrder.shipping_payer] || ''})</span>}
                      {selectedOrder.total_weight > 0 && <span>{selectedOrder.total_weight}g</span>}
                    </div>
                  )}

                  {/* Đã có mã vận đơn VTP */}
                  {selectedOrder.shipping_metadata?.vtp_order_code ? (
                    <div className="space-y-2">
                      <div className="bg-white rounded-lg p-2.5 border border-purple-200 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Mã vận đơn:</span>
                          <span className="text-sm font-bold text-purple-700">{selectedOrder.shipping_metadata.vtp_order_code}</span>
                        </div>
                        {selectedOrder.shipping_metadata.vtp_status && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Trạng thái:</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                              {selectedOrder.shipping_metadata.vtp_status}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => window.open(`https://viettelpost.vn/tra-cuu-buu-pham?code=${selectedOrder.shipping_metadata.vtp_order_code}`, '_blank')}
                          className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1">
                          📍 Xem hành trình
                        </button>
                        <button onClick={handleRefreshVtpTracking}
                          className="flex-1 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1">
                          🔄 Cập nhật TT
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Chưa có mã vận đơn */
                    <div className="space-y-2">
                      {/* VTP send button */}
                      {hasPermission('sales', 2) && vtpToken &&
                       ['confirmed', 'packing'].includes(selectedOrder.status) &&
                       selectedOrder.shipping_metadata?.province_id && (
                        <button onClick={handleSendVtp} disabled={sendingVtp}
                          className={`w-full py-2 rounded-lg text-sm font-medium text-white ${sendingVtp ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}>
                          {sendingVtp ? 'Đang gửi...' : '📦 Gửi Viettel Post'}
                        </button>
                      )}
                      <div className="flex items-center gap-2">
                        <input value={editTracking} onChange={e => setEditTracking(e.target.value)} placeholder="Mã vận đơn..."
                          className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
                        <button onClick={saveTracking} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium">Lưu</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Items */}
              <div>
                <div className="text-sm font-medium mb-2">Sản phẩm</div>
                {loadingItems ? <div className="text-center py-4 text-gray-400">Đang tải...</div> : (
                  <div className="space-y-1.5">
                    {orderItems.map(item => (
                      <div key={item.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{item.product_name}</div>
                          <div className="text-xs text-gray-500">{item.product_sku} • SL: {item.quantity} x {formatMoney(item.unit_price)}</div>
                        </div>
                        <span className="font-medium ml-2">{formatMoney(item.total_price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="bg-green-50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Tạm tính</span><span>{formatMoney(selectedOrder.subtotal)}</span></div>
                {selectedOrder.discount_amount > 0 && <div className="flex justify-between text-red-600"><span>{selectedOrder.coupon_code ? `Mã: ${selectedOrder.coupon_code}` : 'Chiết khấu'}</span><span>-{formatMoney(selectedOrder.discount_amount)}</span></div>}
                {selectedOrder.shipping_fee > 0 && selectedOrder.shipping_payer === 'shop' && <div className="flex justify-between"><span>Phí ship (shop)</span><span>{formatMoney(selectedOrder.shipping_fee)}</span></div>}
                <div className="flex justify-between text-lg font-bold text-green-700 pt-1 border-t"><span>TỔNG</span><span>{formatMoney(selectedOrder.total_amount)}</span></div>
                <div className="text-xs pt-1 space-y-0.5">
                  {selectedOrder.payment_splits?.length > 0 ? (
                    selectedOrder.payment_splits.map((sp, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{paymentMethods[sp.method]?.label || sp.method}</span>
                        <span>{formatMoney(sp.amount)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between">
                      <span>{paymentMethods[selectedOrder.payment_method]?.label || selectedOrder.payment_method}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium">
                    <span>Trạng thái:</span>
                    <span className={selectedOrder.payment_status === 'paid' ? 'text-green-600' : 'text-red-600'}>
                      {paymentStatuses[selectedOrder.payment_status]?.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Partial payment */}
              {showPaymentInput && selectedOrder.payment_status !== 'paid' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium text-yellow-700">Thanh toán</div>
                  <div className="flex justify-between text-sm">
                    <span>Đã thanh toán:</span>
                    <span className="font-medium">{formatMoney(selectedOrder.paid_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Còn lại:</span>
                    <span className="font-bold text-red-600">{formatMoney((selectedOrder.total_amount || 0) - (selectedOrder.paid_amount || 0))}</span>
                  </div>
                  <div className="flex gap-2">
                    <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                      placeholder="Nhập số tiền..." className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
                    <button onClick={handlePartialPayment} disabled={submitting}
                      className={`px-4 py-1.5 rounded-lg text-xs font-medium text-white ${submitting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
                      {submitting ? '...' : 'Xác nhận'}
                    </button>
                    <button onClick={() => { setShowPaymentInput(false); setPaymentAmount(''); }}
                      className="px-3 py-1.5 bg-gray-200 rounded-lg text-xs font-medium">Hủy</button>
                  </div>
                </div>
              )}

              {/* COD */}
              {selectedOrder.order_type === 'online' && selectedOrder.payment_status !== 'paid' && (selectedOrder.total_amount - (selectedOrder.paid_amount || 0)) > 0 && (
                <div className="flex justify-between items-center bg-purple-50 rounded-lg p-2 text-sm">
                  <span className="text-purple-700 font-medium">Thu hộ COD</span>
                  <span className="font-bold text-purple-800">{formatMoney(selectedOrder.total_amount - (selectedOrder.paid_amount || 0))}</span>
                </div>
              )}

              {/* Note */}
              {selectedOrder.note && <div className="text-sm text-gray-600"><span className="font-medium">Ghi chú:</span> {selectedOrder.note}</div>}
              {selectedOrder.internal_note && <div className="text-sm text-orange-600 bg-orange-50 rounded p-2"><span className="font-medium">Nội bộ:</span> {selectedOrder.internal_note}</div>}
              {selectedOrder.needs_installation && <div className="text-sm text-orange-600 font-medium">🔧 Cần lắp đặt</div>}
              {selectedOrder.warehouse_id && getWarehouseName(selectedOrder.warehouse_id) && (
                <div className="text-sm text-amber-600">🏭 Kho: {getWarehouseName(selectedOrder.warehouse_id)}</div>
              )}
              {/* Return history */}
              {orderReturns.length > 0 && (
                <div className="bg-orange-50 rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium text-orange-700">Lịch sử trả hàng ({orderReturns.length})</div>
                  {orderReturns.map(ret => (
                    <div key={ret.id} className="bg-white rounded-lg p-2 border border-orange-200 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-orange-800">{ret.return_code}</span>
                        <span className="text-red-600 font-medium">-{formatMoney(ret.total_refund)}</span>
                      </div>
                      {ret.reason && <div className="text-xs text-gray-500 mt-0.5">Lý do: {ret.reason}</div>}
                      <div className="text-xs text-gray-400">{new Date(ret.created_at).toLocaleString('vi-VN')} - {paymentMethods[ret.refund_method]?.label || ret.refund_method}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Order timeline */}
              {statusLogs.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium text-gray-700">Lịch sử đơn hàng ({statusLogs.length})</div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {statusLogs.map((log, idx) => {
                      if (log._type === 'activity') {
                        const actionConfig = {
                          create: { icon: '+', color: 'bg-green-100 text-green-700' },
                          update: { icon: '~', color: 'bg-blue-100 text-blue-700' },
                          cancel: { icon: '✕', color: 'bg-gray-100 text-gray-600' },
                          payment: { icon: '$', color: 'bg-yellow-100 text-yellow-700' },
                          shipping: { icon: '→', color: 'bg-indigo-100 text-indigo-700' },
                          print: { icon: 'P', color: 'bg-teal-100 text-teal-700' },
                          return: { icon: '←', color: 'bg-pink-100 text-pink-700' },
                        }[log.action] || { icon: '?', color: 'bg-gray-100 text-gray-600' };
                        return (
                          <div key={`a-${log.id || idx}`} className="flex items-start gap-2 text-xs bg-white rounded px-2 py-1.5 border">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${actionConfig.color}`}>{actionConfig.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-gray-700">{log.description || log.action}</div>
                              <div className="text-gray-400 mt-0.5">{new Date(log.created_at).toLocaleString('vi-VN')} • {log.user_name || ''}</div>
                            </div>
                          </div>
                        );
                      }
                      // Status log
                      const sourceBadge = {
                        webhook: { label: 'Auto', color: 'bg-green-100 text-green-700' },
                        polling: { label: 'Polling', color: 'bg-blue-100 text-blue-700' },
                        manual: { label: 'Thủ công', color: 'bg-gray-100 text-gray-600' },
                      }[log.source] || { label: log.source, color: 'bg-gray-100 text-gray-600' };
                      const statusLabel = (field) => {
                        if (log.field_name === 'shipping_status') return shippingStatusValues[field]?.label || field;
                        if (log.field_name === 'order_status') return orderStatusValues[field]?.label || field;
                        return paymentStatusValues[field]?.label || field;
                      };
                      return (
                        <div key={`s-${log.id || idx}`} className="flex items-center gap-2 text-xs bg-white rounded px-2 py-1.5 border">
                          <span className="text-gray-400 shrink-0">{new Date(log.created_at).toLocaleString('vi-VN')}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceBadge.color}`}>{sourceBadge.label}</span>
                          <span className="text-gray-500">{statusLabel(log.old_status)}</span>
                          <span className="text-gray-400">&rarr;</span>
                          <span className="font-medium text-gray-800">{statusLabel(log.new_status)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-400">Tạo bởi: {selectedOrder.created_by}</div>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showReturnModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[70] p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full my-4">
            <div className="p-4 border-b bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-xl flex justify-between items-center">
              <h3 className="font-bold text-lg">Trả hàng - {selectedOrder.order_number}</h3>
              <button onClick={() => setShowReturnModal(false)} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="text-sm text-gray-600">Chọn sản phẩm và số lượng muốn trả:</div>
              <div className="space-y-2">
                {returnItems.map((item, idx) => (
                  <div key={item.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-sm">{item.product_name}</div>
                        <div className="text-xs text-gray-500">Đã mua: {item.quantity} x {formatMoney(item.unit_price)}</div>
                      </div>
                      <span className="text-sm font-medium">{formatMoney(item.return_qty * parseFloat(item.unit_price))}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-500 whitespace-nowrap">SL trả:</label>
                      <input type="number" min="0" max={item.quantity} value={item.return_qty}
                        onChange={e => {
                          const qty = Math.min(Math.max(0, parseInt(e.target.value) || 0), item.quantity);
                          setReturnItems(prev => prev.map((ri, i) => i === idx ? { ...ri, return_qty: qty } : ri));
                        }}
                        className="w-20 border rounded px-2 py-1 text-sm text-center" />
                      <select value={item.condition}
                        onChange={e => setReturnItems(prev => prev.map((ri, i) => i === idx ? { ...ri, condition: e.target.value } : ri))}
                        className="border rounded px-2 py-1 text-xs">
                        <option value="good">Nguyên vẹn</option>
                        <option value="damaged">Hư hỏng</option>
                        <option value="defective">Lỗi nhà SX</option>
                      </select>
                      <input value={item.note} placeholder="Ghi chú"
                        onChange={e => setReturnItems(prev => prev.map((ri, i) => i === idx ? { ...ri, note: e.target.value } : ri))}
                        className="flex-1 border rounded px-2 py-1 text-xs" />
                    </div>
                  </div>
                ))}
              </div>

              <textarea value={returnReason} onChange={e => setReturnReason(e.target.value)} rows={2}
                placeholder="Lý do trả hàng..." className="w-full border rounded-lg px-3 py-2 text-sm" />

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Hoàn tiền qua</label>
                <div className="flex gap-2">
                  {Object.entries(paymentMethods).filter(([k]) => k !== 'cod' && k !== 'debt').map(([key, pm]) => (
                    <button key={key} type="button" onClick={() => setRefundMethod(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 ${refundMethod === key ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-600'}`}>
                      {pm.icon} {pm.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span>Sản phẩm trả: {returnItems.filter(i => i.return_qty > 0).length}</span>
                  <span>SL: {returnItems.reduce((s, i) => s + i.return_qty, 0)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-orange-700 mt-1">
                  <span>Hoàn tiền</span>
                  <span>{formatMoney(returnItems.reduce((s, i) => s + i.return_qty * parseFloat(i.unit_price), 0))}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowReturnModal(false)} className="flex-1 px-4 py-2.5 bg-gray-200 rounded-lg font-medium text-sm">Hủy</button>
                <button onClick={handleSubmitReturn} disabled={submitting}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm text-white ${submitting ? 'bg-gray-400' : 'bg-orange-600 hover:bg-orange-700'}`}>
                  {submitting ? 'Đang xử lý...' : 'Xác nhận trả hàng'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Exchange Modal */}
      {showExchangeModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[70] p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-4xl w-full my-4">
            <div className="p-4 border-b bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-t-xl flex justify-between items-center">
              <h3 className="font-bold text-lg">Đổi hàng - {selectedOrder.order_number}</h3>
              <button onClick={() => setShowExchangeModal(false)} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Panel trái: Items trả */}
                <div className="space-y-3">
                  <div className="text-sm font-bold text-orange-700">↩️ Trả lại</div>
                  {exchangeReturnItems.map((item, idx) => (
                    <div key={item.id} className="border rounded-lg p-2 space-y-1">
                      <div className="text-sm font-medium truncate">{item.product_name}</div>
                      <div className="text-xs text-gray-500">Đã mua: {item.quantity} x {formatMoney(item.unit_price)}</div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">SL trả:</label>
                        <input type="number" min="0" max={item.quantity} value={item.return_qty}
                          onChange={e => {
                            const qty = Math.min(Math.max(0, parseInt(e.target.value) || 0), item.quantity);
                            setExchangeReturnItems(prev => prev.map((ri, i) => i === idx ? { ...ri, return_qty: qty } : ri));
                          }}
                          className="w-16 border rounded px-2 py-1 text-sm text-center" />
                        {item.return_qty > 0 && <span className="text-xs text-orange-600 font-medium">{formatMoney(item.return_qty * parseFloat(item.unit_price))}</span>}
                      </div>
                    </div>
                  ))}
                  <div className="bg-orange-50 rounded-lg p-2 text-sm font-medium text-orange-700 text-right">
                    Trả: {formatMoney(exchangeReturnItems.reduce((s, i) => s + i.return_qty * parseFloat(i.unit_price), 0))}
                  </div>
                </div>

                {/* Panel phải: Items mới */}
                <div className="space-y-3">
                  <div className="text-sm font-bold text-green-700">🛒 Mua mới</div>
                  <div className="relative">
                    <input value={exchangeProductSearch} onChange={e => setExchangeProductSearch(e.target.value)}
                      placeholder="Tìm SP mới..." className="w-full border rounded-lg px-3 py-2 text-sm" />
                    {exchangeProductSearch.trim() && (
                      <div className="absolute top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 z-10 max-h-48 overflow-y-auto">
                        {displayProducts.slice(0, 8).map(p => {
                          const stock = getProductStock(p);
                          return (
                            <button key={p.id} type="button" disabled={stock <= 0}
                              onClick={() => addExchangeProduct(p)}
                              className={`w-full text-left px-3 py-2 text-sm ${stock <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-50'}`}>
                              <div className="font-medium truncate">{p.name}</div>
                              <div className="text-xs text-gray-500 flex justify-between">
                                <span>{p.sku}</span>
                                <span>{formatMoney(p.sell_price)} | Tồn: {stock}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {exchangeNewItems.map((item, idx) => (
                    <div key={idx} className="border rounded-lg p-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.product_name}</div>
                        <div className="text-xs text-gray-500">{item.product_sku}</div>
                      </div>
                      <input type="number" min="1" value={item.quantity}
                        onChange={e => setExchangeNewItems(prev => prev.map((ni, i) => i === idx ? { ...ni, quantity: Math.max(1, parseInt(e.target.value) || 1) } : ni))}
                        className="w-14 border rounded px-2 py-1 text-sm text-center" />
                      <span className="text-xs text-gray-400">x</span>
                      <span className="text-sm font-medium text-green-600 w-24 text-right">{formatMoney(item.unit_price * item.quantity)}</span>
                      <button onClick={() => setExchangeNewItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">✕</button>
                    </div>
                  ))}
                  <div className="bg-green-50 rounded-lg p-2 text-sm font-medium text-green-700 text-right">
                    Mới: {formatMoney(exchangeNewItems.reduce((s, i) => s + i.quantity * parseFloat(i.unit_price), 0))}
                  </div>
                </div>
              </div>

              <textarea value={exchangeReason} onChange={e => setExchangeReason(e.target.value)} rows={2}
                placeholder="Lý do đổi hàng..." className="w-full border rounded-lg px-3 py-2 text-sm" />

              {/* Summary */}
              {(() => {
                const returnVal = exchangeReturnItems.reduce((s, i) => s + i.return_qty * parseFloat(i.unit_price), 0);
                const newVal = exchangeNewItems.reduce((s, i) => s + i.quantity * parseFloat(i.unit_price), 0);
                const diff = newVal - returnVal;
                return (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-sm"><span>Giá trị trả lại</span><span className="text-orange-600">-{formatMoney(returnVal)}</span></div>
                    <div className="flex justify-between text-sm"><span>Giá trị hàng mới</span><span className="text-green-600">+{formatMoney(newVal)}</span></div>
                    <div className="flex justify-between text-lg font-bold pt-1 border-t border-indigo-200">
                      <span>{diff > 0 ? 'Khách trả thêm' : diff < 0 ? 'Hoàn lại khách' : 'Không chênh lệch'}</span>
                      <span className={diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-gray-600'}>{diff !== 0 ? formatMoney(Math.abs(diff)) : '0đ'}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-2">
                <button onClick={() => setShowExchangeModal(false)} className="flex-1 px-4 py-2.5 bg-gray-200 rounded-lg font-medium text-sm">Hủy</button>
                <button onClick={handleSubmitExchange} disabled={submitting}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm text-white ${submitting ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                  {submitting ? 'Đang xử lý...' : 'Xác nhận đổi hàng'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Haravan Import Modal */}
      <HaravanImportModal
        isOpen={showHaravanImport} onClose={() => setShowHaravanImport(false)}
        tenant={tenant} currentUser={currentUser}
        customers={customers} products={products} orders={orders}
        loadSalesData={loadSalesData} warehouses={warehouses}
      />

      {/* Variant Picker Modal */}
      {showVariantPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-bold">Chọn biến thể - {showVariantPicker.name}</h3>
              <button onClick={() => setShowVariantPicker(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-4 space-y-2">
              {(productVariants || []).filter(v => v.product_id === showVariantPicker.id).map(v => (
                <button key={v.id} onClick={() => addToCart(showVariantPicker, v)}
                  className="w-full flex items-center justify-between px-3 py-2 border rounded-lg hover:bg-indigo-50 transition text-sm">
                  <span className="font-medium">{v.variant_name}</span>
                  <span className="text-green-600 font-medium">{formatMoney(v.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== Sticky Bulk Action Bar ===== */}
      {checkedOrderIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[55] bg-white border-t shadow-[0_-4px_12px_rgba(0,0,0,0.1)] px-3 py-2.5 md:px-6 md:py-3">
          <div className="max-w-4xl mx-auto flex items-center gap-2 md:gap-4 overflow-x-auto">
            <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0 text-xs sm:text-sm">
              <input type="checkbox" checked={allPageSelected} onChange={toggleAllPage}
                className="w-4 h-4 rounded border-gray-300 text-green-600" />
              <span className="hidden sm:inline">Chọn tất cả</span> ({selectableOnPage.length})
            </label>
            <div className="h-5 w-px bg-gray-200 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-medium text-gray-700 flex-shrink-0">
              Đã chọn: <b className="text-green-700">{checkedOrderIds.size}</b> đơn
            </span>
            <span className="text-xs sm:text-sm font-bold text-green-700 flex-shrink-0">
              {formatMoney(checkedTotal)}
            </span>
            <div className="flex-1" />
            <button onClick={handleBulkPrint}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs sm:text-sm font-medium flex-shrink-0">
              🖨️ In ({checkedOrderIds.size})
            </button>
            {vtpToken && hasPermission('sales', 2) && (
              <button onClick={handleBulkVtpOpen}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs sm:text-sm font-medium flex-shrink-0">
                🚚 Đẩy đơn VTP
              </button>
            )}
            <button onClick={() => setCheckedOrderIds(new Set())}
              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-xs sm:text-sm font-medium flex-shrink-0">
              Hủy chọn
            </button>
          </div>
        </div>
      )}

      {/* ===== Bulk VTP Modal ===== */}
      {showBulkVtpModal && (() => {
        const { valid, invalid } = getBulkValidation();
        const isDone = bulkVtpProgress && bulkVtpProgress.current >= bulkVtpProgress.total;
        const isPushing = bulkVtpProgress && !isDone;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[70] p-4 overflow-y-auto">
            <div className="bg-white rounded-xl max-w-lg w-full my-4">
              <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl flex justify-between items-center">
                <h3 className="font-bold text-lg">🚚 Đẩy đơn sang Viettel Post</h3>
                <button onClick={() => { if (isPushing) return; setShowBulkVtpModal(false); }} className="text-white/80 hover:text-white text-xl" disabled={isPushing}>✕</button>
              </div>
              <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Show results if done */}
                {isDone ? (
                  <div className="space-y-3">
                    <div className="text-center text-lg font-bold text-gray-700">Kết quả đẩy đơn</div>
                    <div className="space-y-2">
                      {bulkVtpProgress.results.map((r, i) => (
                        <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${r.success ? 'bg-green-50' : 'bg-red-50'}`}>
                          <span>{r.success ? '✅' : '❌'}</span>
                          <span className="font-medium">{r.order.order_number}</span>
                          <span className="text-gray-500 truncate flex-1">
                            {r.success ? `→ ${r.vtpCode}` : r.error}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="text-center text-sm font-medium text-gray-600">
                      Thành công: {bulkVtpProgress.results.filter(r => r.success).length}/{bulkVtpProgress.total} đơn
                    </div>
                    <button onClick={() => { setShowBulkVtpModal(false); setBulkVtpProgress(null); }}
                      className="w-full py-2.5 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm">Đóng</button>
                  </div>
                ) : isPushing ? (
                  /* Progress */
                  <div className="space-y-3">
                    <div className="text-center text-sm font-medium text-gray-600">
                      Đang đẩy {bulkVtpProgress.current}/{bulkVtpProgress.total}...
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className="bg-blue-600 h-3 rounded-full transition-all" style={{ width: `${(bulkVtpProgress.current / bulkVtpProgress.total) * 100}%` }} />
                    </div>
                    {bulkVtpProgress.results.length > 0 && (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {bulkVtpProgress.results.map((r, i) => (
                          <div key={i} className="text-xs flex items-center gap-1.5">
                            <span>{r.success ? '✅' : '❌'}</span>
                            <span>{r.order.order_number}</span>
                            <span className="text-gray-400 truncate">{r.success ? r.vtpCode : r.error}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Config form */
                  <>
                    {/* Dịch vụ vận chuyển - radio list */}
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-2 block">Dịch vụ vận chuyển</label>
                      {loadingVtpServices ? (
                        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                          <svg className="animate-spin h-4 w-4 text-blue-600" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          <span className="text-sm text-gray-500">Đang tải dịch vụ...</span>
                        </div>
                      ) : vtpServicesList.length > 0 ? (
                        <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">
                          {vtpServicesList.map(svc => (
                            <label key={svc.MA_DV_CHINH} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-blue-50 transition-colors ${bulkVtpService === svc.MA_DV_CHINH ? 'bg-blue-50' : ''}`}>
                              <input type="radio" name="bulkService" value={svc.MA_DV_CHINH}
                                checked={bulkVtpService === svc.MA_DV_CHINH}
                                onChange={e => setBulkVtpService(e.target.value)}
                                className="w-4 h-4 text-blue-600" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-800">{svc.MA_DV_CHINH}</span>
                                  <span className="text-sm text-gray-600">- {svc.TEN_DICHVU}</span>
                                </div>
                                {svc.THOI_GIAN && <div className="text-xs text-gray-400">{svc.THOI_GIAN}</div>}
                              </div>
                              <span className="text-sm font-semibold text-green-700 whitespace-nowrap">{formatMoney(svc.GIA_CUOC)}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        /* Fallback: dropdown hardcode */
                        <select value={bulkVtpService} onChange={e => setBulkVtpService(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm">
                          {Object.entries(shippingServices).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.desc})</option>)}
                        </select>
                      )}
                      {vtpServicesList.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1.5 italic">* Phí ship mẫu tính cho đơn đầu tiên. Phí thực tế mỗi đơn có thể khác nhau.</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Người trả ship</label>
                        <select value={bulkVtpPayer} onChange={e => setBulkVtpPayer(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm">
                          <option value="receiver">Người nhận trả</option>
                          <option value="shop">Shop trả</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Hình thức thanh toán</label>
                        <div className="flex gap-4 mt-1.5">
                          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input type="radio" name="bulkCod" value="cod" checked={bulkVtpCod === 'cod'} onChange={e => setBulkVtpCod(e.target.value)} />
                            COD (thu hộ)
                          </label>
                          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input type="radio" name="bulkCod" value="paid" checked={bulkVtpCod === 'paid'} onChange={e => setBulkVtpCod(e.target.value)} />
                            Đã thanh toán
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Valid orders table */}
                    {valid.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-gray-600 mb-1">{valid.length} đơn hợp lệ</div>
                        <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr><th className="px-2 py-1.5 text-left">Mã đơn</th><th className="px-2 py-1.5 text-left">KH</th><th className="px-2 py-1.5 text-right">Tổng tiền</th></tr>
                            </thead>
                            <tbody>
                              {valid.map(o => (
                                <tr key={o.id} className="border-t"><td className="px-2 py-1.5 font-medium">{o.order_number}</td><td className="px-2 py-1.5 truncate max-w-[120px]">{o.customer_name || 'Khách lẻ'}</td><td className="px-2 py-1.5 text-right text-green-700">{formatMoney(o.total_amount)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Invalid orders warning */}
                    {invalid.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                        <div className="text-xs font-medium text-amber-700">{invalid.length} đơn không đủ thông tin:</div>
                        {invalid.map((item, i) => (
                          <div key={i} className="text-xs text-amber-600">- {item.order.order_number}: {item.errors.join(', ')}</div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setShowBulkVtpModal(false)} className="flex-1 py-2.5 bg-gray-200 rounded-lg font-medium text-sm">Hủy</button>
                      <button onClick={handleBulkVtpPush} disabled={valid.length === 0 || !bulkVtpService || loadingVtpServices}
                        className={`flex-1 py-2.5 rounded-lg font-medium text-sm text-white ${valid.length === 0 || !bulkVtpService || loadingVtpServices ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
                        🚚 Đẩy {valid.length} đơn hợp lệ
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {toast.type === 'error' ? '❌' : '✅'} {toast.msg}
        </div>
      )}
    </div>
  );
}

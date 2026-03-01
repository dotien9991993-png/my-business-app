import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import { formatMoney } from '../../utils/formatUtils';
import { getDateStrVN, getNowISOVN, getTodayVN } from '../../utils/dateUtils';
import { orderStatuses, orderStatusFlow, orderTypes, paymentMethods, shippingProviders, shippingPayers, paymentStatuses, orderSources, shippingServices } from '../../constants/salesConstants';
import QRCode from 'qrcode';
import AddressPicker from '../../components/shared/AddressPicker';
import QRScanner from '../../components/shared/QRScanner';
import * as vtpApi from '../../utils/viettelpostApi';
import HaravanImportModal from './HaravanImportModal';
import { logActivity } from '../../lib/activityLog';
import { sendOrderConfirmation, sendShippingNotification } from '../../utils/zaloAutomation';

export default function SalesOrdersView({ tenant, currentUser, orders, customers, products, loadSalesData, loadWarehouseData, loadFinanceData, createTechnicalJob: _createTechnicalJob, warehouses, warehouseStock, dynamicShippingProviders, shippingConfigs, getSettingValue, comboItems, hasPermission, canEdit: _canEditSales, getPermissionLevel, filterByPermission: _filterByPermission }) {
  const { pendingOpenRecord, setPendingOpenRecord, allUsers } = useApp();
  const permLevel = getPermissionLevel('sales');
  const _effectiveShippingProviders = dynamicShippingProviders || shippingProviders;
  const vtpConfig = (shippingConfigs || []).find(c => c.provider === 'viettel_post' && c.is_active && c.api_token);
  const vtpToken = vtpConfig?.api_token;
  // ---- View state ----
  const [filterStatus, setFilterStatus] = useState('all');
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
        if (filterType !== 'all') query = query.eq('order_type', filterType);
        if (filterPayment !== 'all') query = query.eq('payment_status', filterPayment);
        if (filterCreatedBy !== 'all') query = query.eq('created_by', filterCreatedBy);
        if (filterSource !== 'all') query = query.eq('order_source', filterSource);
        if (filterShipping === 'not_shipped') {
          query = query.in('status', ['confirmed', 'packing']).is('tracking_number', null);
        } else if (filterShipping === 'shipped') {
          query = query.not('tracking_number', 'is', null);
        } else if (filterShipping === 'shipping') {
          query = query.eq('status', 'shipping');
        } else if (filterShipping === 'delivered') {
          query = query.eq('status', 'delivered');
        } else if (filterShipping === 'returning') {
          query = query.eq('status', 'returned');
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
          .eq('tenant_id', tenant.id).eq('status', 'new')),
        addUserFilter(supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).in('status', ['confirmed', 'packing']).is('tracking_number', null)),
        addUserFilter(supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('status', 'shipping')),
        addUserFilter(supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('status', 'completed')),
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
  }, [tenant?.id, page, filterStatus, filterType, filterPayment, filterCreatedBy, filterSource, filterShipping, filterStartDate, filterEndDate, search, sortBy, sortOrder, permLevel, currentUser.name]);

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
    if (['new', 'completed', 'cancelled'].includes(o.status)) return null;
    if (o.status === 'returned') return { icon: '↩️', text: 'Đang hoàn', color: 'text-orange-600' };
    if (o.status === 'delivered') return { icon: '✅', text: 'Đã giao', color: 'text-cyan-600' };
    if (o.status === 'shipping') return { icon: '🚚', text: 'Đang vận chuyển', color: 'text-purple-600' };
    if (o.tracking_number) return { icon: '📤', text: 'Đã đẩy đơn', color: 'text-blue-600' };
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
  const [shippingPayer, _setShippingPayer] = useState('customer');
  const [_paymentMethod, _setPaymentMethod] = useState('cash');
  const [discountAmount, _setDiscountAmount] = useState('');
  const [_discountNote, _setDiscountNote] = useState('');
  const [_note, _setNote] = useState('');
  const [_needsInstallation, _setNeedsInstallation] = useState(false);
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
    const defaultWh = (warehouses || []).find(w => w.is_default) || (warehouses || [])[0];
    if (defaultWh) setSelectedWarehouseId(defaultWh.id);
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
          status: 'shipping', updated_at: getNowISOVN()
        }).eq('id', selectedOrder.id);
        setSelectedOrder(prev => ({ ...prev, tracking_number: vtpCode, shipping_metadata: newMeta, shipping_provider: 'Viettel Post', shipping_service: svcCode, status: 'shipping' }));
        setEditTracking(vtpCode);
        showToast('Đã gửi đơn Viettel Post: ' + vtpCode);
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
  const addToCart = (product) => {
    const stock = getProductStock(product);
    const existing = cartItems.find(i => i.product_id === product.id);
    if (existing) {
      setCartItems(prev => prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCartItems(prev => [...prev, {
        product_id: product.id, product_name: product.name, product_sku: product.sku || '',
        unit_price: parseFloat(product.sell_price || 0), quantity: 1, discount: 0,
        warranty_months: product.warranty_months || 0, stock,
        is_combo: product.is_combo || false
      }]);
    }
    setProductSearch('');
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
  const shipForShop = shippingPayer === 'shop' ? shipFee : 0;
  const totalAmount = subtotal - discount + shipForShop;

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
        status: 'confirmed', customer_id: resolvedCustomerId,
        customer_name: customerName, customer_phone: customerPhone,
        shipping_address: finalShippingAddress,
        shipping_provider: null,
        shipping_fee: 0, shipping_payer: 'customer',
        shipping_metadata: finalShippingMetadata,
        discount_amount: 0, discount_note: '',
        subtotal, total_amount: totalAmount,
        payment_method: 'cod', payment_status: 'unpaid',
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
        order_id: order.id, product_id: item.product_id, product_name: item.product_name,
        product_sku: item.product_sku, quantity: parseInt(item.quantity),
        unit_price: parseFloat(item.unit_price), discount: parseFloat(item.discount || 0),
        total_price: (parseFloat(item.unit_price) - parseFloat(item.discount || 0)) * parseInt(item.quantity),
        warranty_months: item.warranty_months || null
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

  // Open order detail from chat attachment
  useEffect(() => {
    if (pendingOpenRecord?.type === 'order' && pendingOpenRecord.id) {
      const order = orders.find(o => o.id === pendingOpenRecord.id);
      if (order) {
        setSelectedOrder(order);
        loadOrderItems(order.id);
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
      const updates = { status: newStatus, updated_at: getNowISOVN() };

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
      setSelectedOrder(prev => ({ ...prev, tracking_number: editTracking }));
      await Promise.all([loadSalesData(), loadPagedOrders()]);
    } catch (err) { alert('❌ Lỗi: ' + err.message); }
  };

  // ---- Print invoice ----
  const printInvoice = async () => {
    if (!selectedOrder) return;
    const items = orderItems;
    let qrHtml = '';
    try {
      const qrDataUrl = await QRCode.toDataURL(selectedOrder.order_number, { width: 120, margin: 1 });
      qrHtml = `<div class="center" style="margin:8px 0"><img src="${qrDataUrl}" style="width:80px;height:80px"></div>`;
    } catch (_e) { /* ignore QR error */ }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hóa đơn ${selectedOrder.order_number}</title>
<style>body{font-family:Arial,sans-serif;max-width:80mm;margin:0 auto;padding:10px;font-size:12px}.center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:8px 0}table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}.right{text-align:right}@media print{body{margin:0}}</style></head><body>
<div class="center"><h2 style="margin:0">${tenant.name || ''}</h2>
${tenant.address ? `<p style="margin:4px 0">${tenant.address}</p>` : ''}${tenant.phone ? `<p style="margin:4px 0">${tenant.phone}</p>` : ''}</div>
<div class="line"></div><div class="center bold">HÓA ĐƠN BÁN HÀNG</div>
<p>Số: ${selectedOrder.order_number}</p><p>Ngày: ${new Date(selectedOrder.created_at).toLocaleString('vi-VN')}</p>
<p>Khách: ${selectedOrder.customer_name || 'Khách lẻ'}${selectedOrder.customer_phone ? ' - ' + selectedOrder.customer_phone : ''}</p>
${selectedOrder.shipping_address ? `<p>Địa chỉ: ${selectedOrder.shipping_address}</p>` : ''}
<div class="line"></div>
<table><tr><td class="bold">Sản phẩm</td><td class="right bold">SL</td><td class="right bold">Đ.Giá</td><td class="right bold">T.Tiền</td></tr>
${items.map(i => `<tr><td>${i.product_name}${i.warranty_months ? ` <small>(BH: ${i.warranty_months}th)</small>` : ''}</td><td class="right">${i.quantity}</td><td class="right">${formatMoney(i.unit_price)}</td><td class="right">${formatMoney(i.total_price)}</td></tr>`).join('')}</table>
<div class="line"></div>
<table><tr><td>Tạm tính</td><td class="right">${formatMoney(selectedOrder.subtotal)}</td></tr>
${selectedOrder.discount_amount > 0 ? `<tr><td>Chiết khấu</td><td class="right">-${formatMoney(selectedOrder.discount_amount)}</td></tr>` : ''}
${selectedOrder.shipping_fee > 0 && selectedOrder.shipping_payer === 'shop' ? `<tr><td>Phí ship (shop)</td><td class="right">${formatMoney(selectedOrder.shipping_fee)}</td></tr>` : ''}
<tr class="bold"><td>TỔNG CỘNG</td><td class="right">${formatMoney(selectedOrder.total_amount)}</td></tr></table>
<div class="line"></div>
<p>Thanh toán: ${paymentMethods[selectedOrder.payment_method]?.label || selectedOrder.payment_method}</p>
${selectedOrder.paid_amount > 0 && selectedOrder.paid_amount < selectedOrder.total_amount ? `<p>Đã TT: ${formatMoney(selectedOrder.paid_amount)}</p><p>Còn lại: ${formatMoney(selectedOrder.total_amount - selectedOrder.paid_amount)}</p>` : ''}
${selectedOrder.note ? `<p>Ghi chú: ${selectedOrder.note}</p>` : ''}
<div class="line"></div>${qrHtml}<div class="center"><p>${tenant.invoice_footer || 'Cảm ơn quý khách!'}</p><p style="font-size:10px">NV: ${selectedOrder.created_by}</p></div>
<script>window.onload=function(){window.print()}</script></body></html>`;
    const win = window.open('', '_blank', 'width=400,height=600');
    win.document.write(html);
    win.document.close();
  };

  // ---- Print delivery note (online orders) ----
  const printDeliveryNote = async () => {
    if (!selectedOrder) return;
    const items = orderItems;
    let qrHtml = '';
    try {
      const qrDataUrl = await QRCode.toDataURL(selectedOrder.order_number, { width: 200, margin: 1 });
      qrHtml = `<div class="center" style="margin:15px 0"><img src="${qrDataUrl}" style="width:120px;height:120px"><p style="font-size:11px;color:#666;margin:4px 0">Quét mã để đối soát</p></div>`;
    } catch (_e) { /* ignore QR error */ }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Phiếu giao hàng ${selectedOrder.order_number}</title>
<style>body{font-family:Arial,sans-serif;max-width:210mm;margin:0 auto;padding:20px;font-size:13px}
.center{text-align:center}.bold{font-weight:bold}table{width:100%;border-collapse:collapse;margin:10px 0}
th,td{border:1px solid #000;padding:6px 8px;text-align:left}th{background:#f5f5f5}.right{text-align:right}
.ship-box{border:2px dashed #666;padding:15px;margin:15px 0;border-radius:8px}
.sig{display:flex;justify-content:space-between;margin-top:40px}
.sig div{text-align:center;width:45%}@media print{body{margin:0}}</style></head><body>
<div class="center"><h2 style="margin:0">${tenant.name || 'HOANG NAM AUDIO'}</h2>
${tenant.address ? `<p style="margin:2px 0;font-size:12px">${tenant.address}</p>` : ''}
<h3 style="margin:8px 0">PHIẾU GIAO HÀNG</h3></div>
<p><b>Mã đơn:</b> ${selectedOrder.order_number} &nbsp;|&nbsp; <b>Ngày:</b> ${new Date(selectedOrder.created_at).toLocaleDateString('vi-VN')}</p>
<div class="ship-box"><p class="bold">THÔNG TIN GIAO HÀNG</p>
<p>Người nhận: <b>${selectedOrder.customer_name || 'Khách lẻ'}</b></p>
${selectedOrder.customer_phone ? `<p>SĐT: <b>${selectedOrder.customer_phone}</b></p>` : ''}
<p>Địa chỉ: <b>${selectedOrder.shipping_address || ''}</b></p>
<p>Đơn vị VC: <b>${selectedOrder.shipping_provider || ''}</b>${selectedOrder.tracking_number ? ` &nbsp;|&nbsp; Mã vận đơn: <b>${selectedOrder.tracking_number}</b>` : ''}</p></div>
${qrHtml}
<table><tr><th>STT</th><th>Sản phẩm</th><th>Mã SP</th><th class="right">SL</th><th>Bảo hành</th></tr>
${items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.product_name}</td><td>${i.product_sku || ''}</td><td class="right">${i.quantity}</td><td>${i.warranty_months ? i.warranty_months + ' tháng' : '—'}</td></tr>`).join('')}</table>
<p><b>Tổng tiền:</b> ${formatMoney(selectedOrder.total_amount)} &nbsp;|&nbsp; <b>Phí ship:</b> ${formatMoney(selectedOrder.shipping_fee || 0)} (${selectedOrder.shipping_payer === 'shop' ? 'Shop trả' : 'KH trả'})</p>
${selectedOrder.note ? `<p><b>Ghi chú:</b> ${selectedOrder.note}</p>` : ''}
<div class="sig"><div><p>Người gửi</p><br><br><p>___________</p></div><div><p>Người nhận</p><br><br><p>___________</p></div></div>
<script>window.onload=function(){window.print()}</script></body></html>`;
    const win = window.open('', '_blank', 'width=800,height=600');
    win.document.write(html); win.document.close();
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
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    if (!selectedOrder || submitting) return;
    setSubmitting(true);
    try {
      const newDiscount = parseFloat(editData.discount_amount || 0);
      const shipForShop = selectedOrder.shipping_payer === 'shop' ? parseFloat(selectedOrder.shipping_fee || 0) : 0;
      const newTotal = parseFloat(selectedOrder.subtotal || 0) - newDiscount + shipForShop;
      const updates = {
        customer_name: editData.customer_name, customer_phone: editData.customer_phone,
        shipping_address: editData.shipping_address, discount_amount: newDiscount,
        discount_note: editData.discount_note, note: editData.note,
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
      setSelectedOrder(prev => ({ ...prev, paid_amount: newPaid, payment_status: newStatus }));
      setPaymentAmount(''); setShowPaymentInput(false);
      await Promise.all([loadSalesData(), loadFinanceData(), loadPagedOrders()]);
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
  const canBulkSelect = (o) => ['confirmed', 'packing'].includes(o.status) && !o.tracking_number;
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

  // ---- Status badge ----
  const StatusBadge = ({ status }) => {
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
          { key: 'total', label: 'Tổng', value: statusCounts.total, color: 'bg-gray-50 text-gray-700 border-gray-200', active: filterStatus === 'all' && filterShipping === 'all' },
          { key: 'waiting_confirm', label: 'Chờ XN', value: statusCounts.waiting_confirm, color: 'bg-yellow-50 text-yellow-700 border-yellow-200', active: filterStatus === 'new' },
          { key: 'not_shipped', label: 'Chưa đẩy đơn', value: statusCounts.not_shipped, color: 'bg-amber-50 text-amber-700 border-amber-200', active: filterShipping === 'not_shipped' },
          { key: 'shipping', label: 'Đang giao', value: statusCounts.shipping, color: 'bg-purple-50 text-purple-700 border-purple-200', active: filterStatus === 'shipping' },
          { key: 'completed', label: 'Hoàn thành', value: statusCounts.completed, color: 'bg-green-50 text-green-700 border-green-200', active: filterStatus === 'completed' },
        ].map(s => (
          <button key={s.key} onClick={() => {
            setFilterStatus('all'); setFilterShipping('all');
            if (s.key === 'waiting_confirm') setFilterStatus('new');
            else if (s.key === 'not_shipped') setFilterShipping('not_shipped');
            else if (s.key === 'shipping') setFilterStatus('shipping');
            else if (s.key === 'completed') setFilterStatus('completed');
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
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
            <option value="all">Trạng thái: Tất cả</option>
            {Object.entries(orderStatuses).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={filterShipping} onChange={e => { setFilterShipping(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
            <option value="all">Vận chuyển: Tất cả</option>
            <option value="not_shipped">⏳ Chưa đẩy đơn</option>
            <option value="shipped">📤 Đã đẩy đơn</option>
            <option value="shipping">🚚 Đang vận chuyển</option>
            <option value="delivered">✅ Đã giao</option>
            <option value="returning">↩️ Đang hoàn</option>
          </select>
          <select value={filterPayment} onChange={e => { setFilterPayment(e.target.value); setPage(1); }} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
            <option value="all">Thanh toán: Tất cả</option>
            <option value="unpaid">💰 Chưa thanh toán</option>
            <option value="partial">💳 TT 1 phần</option>
            <option value="paid">✅ Đã thanh toán</option>
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
                <div className="flex-1 min-w-0" onClick={() => { setSelectedOrder(o); setEditTracking(o.tracking_number || ''); loadOrderItems(o.id); setEditMode(false); setShowPaymentInput(false); setShowDetailModal(true); }}>
                  {/* Line 1: Mã đơn, loại, trạng thái, tổng tiền */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="font-semibold text-sm">{o.order_number}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${o.order_type === 'pos' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                        {orderTypes[o.order_type]?.icon} {orderTypes[o.order_type]?.label || o.order_type}
                      </span>
                      <StatusBadge status={o.status} />
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
                          setShippingAddress(c.address || ''); setCustomerSearch(c.name);
                          if (c.address_data) { setShippingAddressData(c.address_data); }
                          setShowCustomerDropdown(false);
                        }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                          <div className="font-medium">{c.name}</div>
                          {c.phone && <div className="text-xs text-gray-500">{c.phone}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Address: AddressPicker if VTP token available, else plain input */}
                {vtpToken ? (
                  <div className="space-y-2">
                    <AddressPicker token={vtpToken} value={shippingAddressData} onChange={setShippingAddressData} />
                    <input value={shippingAddressDetail} onChange={e => setShippingAddressDetail(e.target.value)}
                      placeholder="Số nhà, tên đường..." className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Vui lòng kết nối Viettel Post trong Cài đặt &gt; Vận chuyển để chọn Tỉnh/Quận/Phường
                    </div>
                    <input value={shippingAddress} onChange={e => setShippingAddress(e.target.value)}
                      placeholder="Địa chỉ giao hàng (nhập tay)" className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}
              </div>

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

              {/* D. Ghi chú */}
              <textarea value={internalNote} onChange={e => setInternalNote(e.target.value)} rows={2} placeholder="Ghi chú nội bộ..."
                className="w-full border rounded-lg px-3 py-2 text-sm" />

              {/* E. Footer: Tổng SP + Tổng tiền + Tạo đơn */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex justify-between text-lg font-bold text-green-700">
                  <span>{cartItems.reduce((s, i) => s + parseInt(i.quantity || 0), 0)} SP</span>
                  <span>{formatMoney(subtotal)}</span>
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
                {selectedOrder.order_type === 'online' && <button onClick={printDeliveryNote} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-medium">📦 Phiếu giao</button>}
                <button onClick={printInvoice} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-medium">🖨️ In</button>
                <button onClick={() => { setShowDetailModal(false); setSelectedOrder(null); setEditMode(false); setShowPaymentInput(false); }} className="text-white/80 hover:text-white text-xl">✕</button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Status + Actions */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <StatusBadge status={selectedOrder.status} />
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
                const canEditOrder = ['new', 'confirmed', 'packing'].includes(selectedOrder.status);
                const canPay = selectedOrder.payment_status !== 'paid' && !['cancelled', 'returned'].includes(selectedOrder.status);
                const canReorder = ['completed', 'cancelled', 'returned'].includes(selectedOrder.status);
                return (
                  <div className="flex gap-2 flex-wrap">
                    {hasPermission('sales', 2) && canEditOrder && !editMode && <button onClick={enterEditMode} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">✏️ Sửa đơn</button>}
                    {hasPermission('sales', 2) && canPay && !showPaymentInput && <button onClick={() => setShowPaymentInput(true)} className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium">💰 Thanh toán</button>}
                    {hasPermission('sales', 2) && canReorder && orderItems.length > 0 && <button onClick={handleReorder} className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">🔄 Đặt lại</button>}
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
                    <input value={editData.shipping_address} onChange={e => setEditData(d => ({ ...d, shipping_address: e.target.value }))} placeholder="Địa chỉ giao hàng" className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={editData.discount_amount} onChange={e => setEditData(d => ({ ...d, discount_amount: e.target.value }))} placeholder="Chiết khấu" className="border rounded-lg px-3 py-1.5 text-sm" />
                    <input value={editData.discount_note} onChange={e => setEditData(d => ({ ...d, discount_note: e.target.value }))} placeholder="Lý do CK" className="border rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <textarea value={editData.note} onChange={e => setEditData(d => ({ ...d, note: e.target.value }))} rows={2} placeholder="Ghi chú..." className="w-full border rounded-lg px-3 py-1.5 text-sm" />
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
                {selectedOrder.discount_amount > 0 && <div className="flex justify-between text-red-600"><span>Chiết khấu</span><span>-{formatMoney(selectedOrder.discount_amount)}</span></div>}
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
              <div className="text-xs text-gray-400">Tạo bởi: {selectedOrder.created_by}</div>
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

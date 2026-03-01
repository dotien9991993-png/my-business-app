import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import { formatMoney } from '../../utils/formatUtils';
import { getNowISOVN, getDateStrVN } from '../../utils/dateUtils';
import * as XLSX from 'xlsx';
import { logActivity } from '../../lib/activityLog';

const CUSTOMER_TYPES = {
  retail: { label: 'Khách lẻ', color: 'bg-gray-100 text-gray-700' },
  regular: { label: 'Khách quen', color: 'bg-blue-100 text-blue-700' },
  wholesale: { label: 'Đại lý/Sỉ', color: 'bg-purple-100 text-purple-700' },
  vip: { label: 'VIP', color: 'bg-yellow-100 text-yellow-700' },
};

const SOURCES = {
  walk_in: 'Đến cửa hàng',
  online: 'Online',
  referral: 'Giới thiệu',
  facebook: 'Facebook',
  zalo: 'Zalo',
};

const INTERACTION_TYPES = {
  call: { label: 'Gọi điện', icon: '📞' },
  zalo: { label: 'Nhắn Zalo', icon: '💬' },
  visit: { label: 'Đến cửa hàng', icon: '🏪' },
  complaint: { label: 'Khiếu nại', icon: '⚠️' },
  feedback: { label: 'Phản hồi', icon: '💡' },
  warranty: { label: 'Bảo hành', icon: '🔧' },
};

const TAG_SUGGESTIONS = ['Đại lý miền Bắc', 'Đại lý miền Nam', 'Karaoke', 'Hội trường', 'Nhà thờ', 'Sự kiện', 'Quán cafe', 'Trường học'];

export default function SalesCustomersView({ tenant, currentUser, customers, orders, customerAddresses, loadSalesData, warrantyCards, warrantyRepairs, hasPermission, canEdit: canEditSales, getSettingValue }) {
  const { pendingOpenRecord, setPendingOpenRecord } = useApp();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // list | churn | birthday
  const [detailTab, setDetailTab] = useState('orders'); // orders | interactions | warranty | addresses | debt
  const [debtPaymentOrderId, setDebtPaymentOrderId] = useState(null);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [debtPaymentMethod, setDebtPaymentMethod] = useState('cash');
  const [debtPaymentNote, setDebtPaymentNote] = useState('');
  const [debtPaymentHistory, setDebtPaymentHistory] = useState([]);
  // Address form state
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [addrLabel, setAddrLabel] = useState('Nhà');
  const [addrRecipientName, setAddrRecipientName] = useState('');
  const [addrRecipientPhone, setAddrRecipientPhone] = useState('');
  const [addrAddress, setAddrAddress] = useState('');
  const [addrWard, setAddrWard] = useState('');
  const [addrDistrict, setAddrDistrict] = useState('');
  const [addrProvince, setAddrProvince] = useState('');
  const [totalCustomerCount, setTotalCustomerCount] = useState(0);

  // Loyalty
  const [allCustomerPoints, setAllCustomerPoints] = useState([]);
  const [customerPointHistory, setCustomerPointHistory] = useState([]);
  const loyaltyConfig = getSettingValue ? getSettingValue('loyalty', 'config', null) : null;
  const loyaltyEnabled = loyaltyConfig?.enabled === true;

  const LOYALTY_TIERS = [
    { name: 'Thành viên', min: 0, max: 99, color: 'bg-gray-100 text-gray-600' },
    { name: 'Bạc', min: 100, max: 499, color: 'bg-gray-200 text-gray-700' },
    { name: 'Vàng', min: 500, max: 999, color: 'bg-yellow-100 text-yellow-700' },
    { name: 'Kim cương', min: 1000, max: Infinity, color: 'bg-blue-100 text-blue-700' },
  ];

  const getCustomerTier = useCallback((customerId) => {
    const cp = allCustomerPoints.find(p => p.customer_id === customerId);
    const pts = cp ? (cp.total_points - cp.used_points) : 0;
    return LOYALTY_TIERS.find(t => pts >= t.min && pts <= t.max) || LOYALTY_TIERS[0];
  }, [allCustomerPoints]);

  const getCustomerPointsData = useCallback((customerId) => {
    return allCustomerPoints.find(p => p.customer_id === customerId);
  }, [allCustomerPoints]);

  // Load all customer points on mount
  useEffect(() => {
    if (!tenant || !loyaltyEnabled) return;
    supabase.from('customer_points').select('*').eq('tenant_id', tenant.id)
      .then(({ data }) => { if (data) setAllCustomerPoints(data); })
      .catch(() => {});
  }, [tenant, loyaltyEnabled]);

  const loadPointHistory = useCallback(async (customerId) => {
    try {
      const { data } = await supabase.from('point_transactions').select('*')
        .eq('tenant_id', tenant.id).eq('customer_id', customerId)
        .order('created_at', { ascending: false }).limit(20);
      setCustomerPointHistory(data || []);
    } catch { setCustomerPointHistory([]); }
  }, [tenant]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Server-side total count
  useEffect(() => {
    if (!tenant?.id) return;
    supabase.from('customers').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .then(({ count }) => setTotalCustomerCount(count || 0));
  }, [tenant?.id, customers]);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formBirthday, setFormBirthday] = useState('');
  const [formType, setFormType] = useState('retail');
  const [formSource, setFormSource] = useState('');
  const [formTags, setFormTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [sortCustBy, setSortCustBy] = useState('name');
  const [sortCustOrder, setSortCustOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Interactions state
  const [interactions, setInteractions] = useState([]);
  const [loadingInteractions, setLoadingInteractions] = useState(false);
  const [interactionType, setInteractionType] = useState('call');
  const [interactionContent, setInteractionContent] = useState('');

  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState(1); // 1=upload, 2=map, 3=preview, 4=importing
  const [importRawData, setImportRawData] = useState([]); // raw rows from file
  const [importHeaders, setImportHeaders] = useState([]); // file column headers
  const [importMapping, setImportMapping] = useState({}); // header→field mapping
  const [importParsed, setImportParsed] = useState([]); // parsed+validated rows
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState(null); // {inserted, updated, skipped}
  const [importFileName, setImportFileName] = useState('');
  const fileInputRef = useRef(null);

  const resetForm = () => {
    setFormName(''); setFormPhone(''); setFormEmail(''); setFormAddress('');
    setFormNote(''); setFormBirthday(''); setFormType('retail'); setFormSource('');
    setFormTags([]); setTagInput('');
  };

  const fillForm = (c) => {
    setFormName(c.name || ''); setFormPhone(c.phone || ''); setFormEmail(c.email || '');
    setFormAddress(c.address || ''); setFormNote(c.note || ''); setFormBirthday(c.birthday || '');
    setFormType(c.customer_type || 'retail'); setFormSource(c.source || '');
    setFormTags(c.tags || []);
  };

  // Customer stats
  const getCustomerStats = useCallback((customerId) => {
    const custOrders = (orders || []).filter(o => o.customer_id === customerId);
    const completed = custOrders.filter(o => o.status === 'completed');
    const totalSpent = completed.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const unpaid = custOrders.filter(o => o.payment_status === 'unpaid' || o.payment_status === 'partial');
    const debtAmount = unpaid.reduce((s, o) => s + (parseFloat(o.total_amount || 0) - parseFloat(o.paid_amount || 0)), 0);
    const lastOrder = custOrders.length > 0 ? custOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] : null;
    return { orderCount: custOrders.length, completedCount: completed.length, totalSpent, debtAmount, unpaidCount: unpaid.length, lastOrder };
  }, [orders]);

  // Debt tab helpers
  const getUnpaidOrders = useCallback((customerId) => {
    return (orders || []).filter(o => o.customer_id === customerId && (o.payment_status === 'unpaid' || o.payment_status === 'partial') && o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders]);

  const loadDebtPaymentHistory = useCallback(async (orderId) => {
    try {
      const { data } = await supabase.from('payment_transactions').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
      setDebtPaymentHistory(data || []);
    } catch (err) { console.error(err); }
  }, []);

  const handleDebtPayment = async (order) => {
    if (!hasPermission('sales', 2)) return alert('Bạn không có quyền thực hiện thao tác này');
    const amount = parseFloat(debtPaymentAmount);
    if (!amount || amount <= 0) return alert('Vui lòng nhập số tiền hợp lệ');
    const currentPaid = parseFloat(order.paid_amount || 0);
    const total = parseFloat(order.total_amount || 0);
    const remaining = total - currentPaid;
    if (amount > remaining) return alert(`Số tiền vượt quá còn lại: ${formatMoney(remaining)}`);
    const newPaid = currentPaid + amount;
    const newStatus = newPaid >= total ? 'paid' : 'partial';
    setSubmitting(true);
    try {
      await supabase.from('orders').update({
        paid_amount: newPaid, payment_status: newStatus, updated_at: getNowISOVN()
      }).eq('id', order.id);
      await supabase.from('payment_transactions').insert([{
        tenant_id: tenant.id, order_id: order.id,
        amount, payment_method: debtPaymentMethod || 'cash',
        note: debtPaymentNote || null, created_by: currentUser.name, created_at: getNowISOVN()
      }]);
      // Auto cash_book entry
      await supabase.from('cash_book_entries').insert([{
        tenant_id: tenant.id, type: 'receipt', category: 'sales',
        amount, description: `Thu nợ KH - ${order.order_number}${order.customer_name ? ' - ' + order.customer_name : ''}`,
        reference_type: 'order', reference_id: order.id,
        payment_method: debtPaymentMethod || 'cash',
        created_by: currentUser.name, created_at: getNowISOVN()
      }]).then(() => {}).catch(() => {});
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'payment', entityType: 'order', entityId: order.order_number, entityName: order.order_number, description: `Thu nợ ${formatMoney(amount)} cho đơn ${order.order_number}` });
      setDebtPaymentOrderId(null); setDebtPaymentAmount(''); setDebtPaymentMethod('cash'); setDebtPaymentNote('');
      await loadSalesData();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); }
    finally { setSubmitting(false); }
  };

  // Dashboard stats
  const dashboardStats = useMemo(() => {
    const all = customers || [];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const sixMonthsAgo = new Date(thisYear, thisMonth - 6, 1);

    const newThisMonth = all.filter(c => {
      const d = new Date(c.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const birthdayThisMonth = all.filter(c => {
      if (!c.birthday) return false;
      const bm = new Date(c.birthday).getMonth();
      return bm === thisMonth;
    });

    // Returning customers: bought >= 2 times this month
    const returningThisMonth = all.filter(c => {
      const custOrders = (orders || []).filter(o => o.customer_id === c.id);
      const thisMonthOrders = custOrders.filter(o => {
        const d = new Date(o.created_at);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      });
      return thisMonthOrders.length >= 2;
    });

    // Churn risk: last purchase > 6 months ago
    const churnRisk = all.filter(c => {
      const stats = getCustomerStats(c.id);
      if (!stats.lastOrder) return false;
      return new Date(stats.lastOrder.created_at) < sixMonthsAgo;
    });

    // Top 5 by total spent
    const top5 = [...all].map(c => ({ ...c, stats: getCustomerStats(c.id) }))
      .filter(c => c.stats.totalSpent > 0)
      .sort((a, b) => b.stats.totalSpent - a.stats.totalSpent)
      .slice(0, 5);

    return { total: all.length, newThisMonth: newThisMonth.length, returningThisMonth: returningThisMonth.length, birthdayThisMonth: birthdayThisMonth.length, churnRisk: churnRisk.length, top5 };
  }, [customers, orders, getCustomerStats]);

  // Filtered customers
  const filtered = useMemo(() => {
    let list = customers || [];

    // Filter by type
    if (filterType !== 'all') list = list.filter(c => (c.customer_type || 'retail') === filterType);

    // View mode filters
    if (viewMode === 'birthday') {
      const thisMonth = new Date().getMonth();
      list = list.filter(c => c.birthday && new Date(c.birthday).getMonth() === thisMonth);
    } else if (viewMode === 'churn') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      list = list.filter(c => {
        const stats = getCustomerStats(c.id);
        if (!stats.lastOrder) return false;
        return new Date(stats.lastOrder.created_at) < sixMonthsAgo;
      });
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    list = [...list].sort((a, b) => {
      if (sortCustBy === 'totalSpent') {
        const sa = getCustomerStats(a.id), sb = getCustomerStats(b.id);
        return sortCustOrder === 'desc' ? sb.totalSpent - sa.totalSpent : sa.totalSpent - sb.totalSpent;
      }
      if (sortCustBy === 'lastPurchase') {
        const sa = getCustomerStats(a.id), sb = getCustomerStats(b.id);
        const aDate = sa.lastOrder ? new Date(sa.lastOrder.created_at) : new Date(0);
        const bDate = sb.lastOrder ? new Date(sb.lastOrder.created_at) : new Date(0);
        return sortCustOrder === 'desc' ? bDate - aDate : aDate - bDate;
      }
      const cmp = (a[sortCustBy] || '').localeCompare(b[sortCustBy] || '');
      return sortCustOrder === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [customers, search, sortCustBy, sortCustOrder, filterType, viewMode, getCustomerStats]);

  // Customer orders for detail
  const customerOrders = useMemo(() => {
    if (!selectedCustomer) return [];
    return (orders || []).filter(o => o.customer_id === selectedCustomer.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [selectedCustomer, orders]);

  // Warranty data for selected customer
  const customerWarranty = useMemo(() => {
    if (!selectedCustomer) return { cards: [], repairs: [] };
    const phone = selectedCustomer.phone;
    const cards = (warrantyCards || []).filter(c => c.customer_phone === phone);
    const repairs = (warrantyRepairs || []).filter(r => r.customer_phone === phone);
    return { cards, repairs };
  }, [selectedCustomer, warrantyCards, warrantyRepairs]);

  // Load interactions
  const loadInteractions = async (customerId) => {
    if (!tenant?.id || !customerId) return;
    setLoadingInteractions(true);
    try {
      const { data } = await supabase.from('customer_interactions')
        .select('*').eq('tenant_id', tenant.id).eq('customer_id', customerId)
        .order('created_at', { ascending: false }).limit(50);
      setInteractions(data || []);
    } catch (err) { console.error(err); }
    finally { setLoadingInteractions(false); }
  };

  // Open customer detail from chat attachment
  useEffect(() => {
    if (pendingOpenRecord?.type === 'customer' && pendingOpenRecord.id) {
      const customer = customers.find(c => c.id === pendingOpenRecord.id);
      if (customer) {
        setSelectedCustomer(customer);
        fillForm(customer);
        setEditMode(false);
        setDetailTab('orders');
        setShowDetailModal(true);
        loadInteractions(customer.id);
      }
      setPendingOpenRecord(null);
    }
  }, [pendingOpenRecord]);

  // Add interaction
  const handleAddInteraction = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    if (!interactionContent.trim() || !selectedCustomer || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('customer_interactions').insert([{
        tenant_id: tenant.id, customer_id: selectedCustomer.id,
        type: interactionType, content: interactionContent.trim(),
        created_by: currentUser.name
      }]);
      if (error) throw error;
      setInteractionContent('');
      showToast('Đã ghi nhận!');
      await loadInteractions(selectedCustomer.id);
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); }
    finally { setSubmitting(false); }
  };

  const statusBadge = (status) => {
    const m = {
      new: 'bg-gray-100 text-gray-700', confirmed: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700',
      returned: 'bg-orange-100 text-orange-700'
    };
    const l = { new: 'Mới', confirmed: 'Xác nhận', packing: 'Đóng gói', shipping: 'Đã giao VC', delivered: 'Đã giao', completed: 'Hoàn thành', cancelled: 'Đã hủy', returned: 'Trả hàng' };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[status] || m.new}`}>{l[status] || status}</span>;
  };

  // CRUD
  const handleCreate = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    if (!formName.trim()) return alert('Vui lòng nhập tên khách hàng');
    if (formPhone.trim()) {
      const existing = (customers || []).find(c => c.phone === formPhone.trim());
      if (existing && !window.confirm(`SĐT "${formPhone}" đã tồn tại (${existing.name}). Vẫn tạo mới?`)) return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('customers').insert([{
        tenant_id: tenant.id, name: formName.trim(), phone: formPhone.trim(),
        email: formEmail.trim(), address: formAddress.trim(), note: formNote.trim(),
        birthday: formBirthday || null, customer_type: formType, source: formSource || null,
        tags: formTags.length > 0 ? formTags : null,
        created_by: currentUser.name
      }]);
      if (error) throw error;
      showToast('Đã thêm khách hàng!');
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'create', entityType: 'customer', entityId: formPhone.trim() || formName.trim(), entityName: formName.trim(), description: 'Tạo khách hàng: ' + formName.trim() + (formPhone.trim() ? ' (' + formPhone.trim() + ')' : '') });
      setShowCreateModal(false); resetForm();
      await loadSalesData();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền thực hiện thao tác này'); return; }
    if (!formName.trim() || !selectedCustomer || submitting) return;
    setSubmitting(true);
    try {
      const updates = {
        name: formName.trim(), phone: formPhone.trim(), email: formEmail.trim(),
        address: formAddress.trim(), note: formNote.trim(), birthday: formBirthday || null,
        customer_type: formType, source: formSource || null,
        tags: formTags.length > 0 ? formTags : null,
        updated_at: getNowISOVN()
      };
      const { error } = await supabase.from('customers').update(updates).eq('id', selectedCustomer.id);
      if (error) throw error;
      showToast('Đã cập nhật!');
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'update', entityType: 'customer', entityId: selectedCustomer.id, entityName: formName.trim(), oldData: { name: selectedCustomer.name, phone: selectedCustomer.phone, customer_type: selectedCustomer.customer_type }, newData: updates, description: 'Cập nhật khách hàng: ' + formName.trim() });
      setEditMode(false);
      setSelectedCustomer(prev => ({ ...prev, ...updates }));
      await loadSalesData();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); }
    finally { setSubmitting(false); }
  };

  // ---- Address CRUD ----
  const getCustomerAddresses = useCallback((custId) => {
    return (customerAddresses || []).filter(a => a.customer_id === custId);
  }, [customerAddresses]);

  const resetAddressForm = () => {
    setAddrLabel('Nhà'); setAddrRecipientName(''); setAddrRecipientPhone('');
    setAddrAddress(''); setAddrWard(''); setAddrDistrict(''); setAddrProvince('');
    setEditingAddress(null); setShowAddressForm(false);
  };

  const openAddressForm = (addr = null) => {
    if (addr) {
      setEditingAddress(addr);
      setAddrLabel(addr.label || 'Nhà');
      setAddrRecipientName(addr.recipient_name || '');
      setAddrRecipientPhone(addr.recipient_phone || '');
      setAddrAddress(addr.address || '');
      setAddrWard(addr.ward || '');
      setAddrDistrict(addr.district || '');
      setAddrProvince(addr.province || '');
    } else {
      resetAddressForm();
      setAddrRecipientName(selectedCustomer?.name || '');
      setAddrRecipientPhone(selectedCustomer?.phone || '');
    }
    setShowAddressForm(true);
  };

  const handleSaveAddress = async () => {
    if (!addrAddress.trim()) return alert('Vui lòng nhập địa chỉ');
    if (!selectedCustomer) return;
    setSubmitting(true);
    try {
      const data = {
        tenant_id: tenant.id, customer_id: selectedCustomer.id,
        label: addrLabel, recipient_name: addrRecipientName,
        recipient_phone: addrRecipientPhone, address: addrAddress.trim(),
        ward: addrWard, district: addrDistrict, province: addrProvince,
        updated_at: getNowISOVN()
      };
      if (editingAddress) {
        const { error } = await supabase.from('customer_addresses').update(data).eq('id', editingAddress.id);
        if (error) throw error;
      } else {
        const existing = getCustomerAddresses(selectedCustomer.id);
        data.is_default = existing.length === 0;
        const { error } = await supabase.from('customer_addresses').insert([data]);
        if (error) throw error;
      }
      resetAddressForm();
      await loadSalesData();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); }
    finally { setSubmitting(false); }
  };

  const handleDeleteAddress = async (addrId) => {
    if (!window.confirm('Xóa địa chỉ này?')) return;
    try {
      const { error } = await supabase.from('customer_addresses').delete().eq('id', addrId);
      if (error) throw error;
      await loadSalesData();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); }
  };

  const handleSetDefaultAddress = async (addrId, custId) => {
    try {
      await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', custId);
      await supabase.from('customer_addresses').update({ is_default: true }).eq('id', addrId);
      await loadSalesData();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); }
  };

  const handleDelete = async (id) => {
    if (!canEditSales('sales')) { alert('Bạn không có quyền xóa khách hàng'); return; }
    if (!window.confirm('Xóa khách hàng này? Các đơn hàng liên quan sẽ không bị xóa.')) return;
    try {
      const deletedCustomer = selectedCustomer || (customers || []).find(c => c.id === id);
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      showToast('Đã xóa!');
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'delete', entityType: 'customer', entityId: id, entityName: deletedCustomer?.name || '', oldData: deletedCustomer ? { name: deletedCustomer.name, phone: deletedCustomer.phone } : null, description: 'Xóa khách hàng: ' + (deletedCustomer?.name || id) });
      setShowDetailModal(false); setSelectedCustomer(null);
      await loadSalesData();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); }
  };

  // Tags helper
  const addTag = (tag) => {
    const t = tag.trim();
    if (t && !formTags.includes(t)) setFormTags(prev => [...prev, t]);
    setTagInput('');
  };
  const removeTag = (tag) => setFormTags(prev => prev.filter(t => t !== tag));

  // Toast
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Pagination
  const PAGE_SIZE = 50;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const effectivePage = page > totalPages && totalPages > 0 ? 1 : page;
  const paginatedCustomers = filtered.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE);

  // Export
  const exportCustomersCSV = () => {
    if (!hasPermission('sales', 2)) { alert('Bạn không có quyền xuất dữ liệu'); return; }
    const headers = ['Tên', 'SĐT', 'Email', 'Địa chỉ', 'Nhóm KH', 'Nguồn', 'Ngày sinh', 'Số đơn', 'Tổng mua', 'Công nợ'];
    const rows = filtered.map(c => {
      const s = getCustomerStats(c.id);
      return [c.name, c.phone || '', c.email || '', c.address || '',
        CUSTOMER_TYPES[c.customer_type]?.label || 'Khách lẻ', SOURCES[c.source] || '',
        c.birthday || '', s.completedCount, s.totalSpent, s.debtAmount];
    });
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `khach-hang-${getDateStrVN()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ---- IMPORT LOGIC ----
  const FIELD_OPTIONS = [
    { value: '', label: 'Bỏ qua cột này' },
    { value: 'name', label: 'Họ tên' },
    { value: 'first_name', label: 'Tên (Haravan)' },
    { value: 'last_name', label: 'Họ (Haravan)' },
    { value: 'phone', label: 'SĐT' },
    { value: 'email', label: 'Email' },
    { value: 'address', label: 'Địa chỉ' },
    { value: 'birthday', label: 'Ngày sinh' },
    { value: 'tags', label: 'Tags' },
    { value: 'note', label: 'Ghi chú' },
    { value: 'total_orders', label: 'Tổng đơn hàng' },
    { value: 'total_spent', label: 'Tổng chi tiêu' },
    { value: 'source', label: 'Nguồn' },
    { value: 'created_at', label: 'Ngày tạo' },
  ];

  const normalizePhone = (raw) => {
    if (!raw) return '';
    let p = String(raw).replace(/[\s.\-()]/g, '');
    if (p.startsWith('+84')) p = '0' + p.slice(3);
    else if (p.startsWith('84') && p.length >= 11) p = '0' + p.slice(2);
    return p;
  };

  const autoMapHeaders = (headers) => {
    const mapping = {};
    const matchers = {
      name: /^(họ tên|tên khách hàng|name|họ và tên|customer name|full.?name)$/i,
      first_name: /^(tên|first.?name|given.?name)$/i,
      last_name: /^(họ|last.?name|family.?name|surname)$/i,
      phone: /^(sđt|số điện thoại|phone|điện thoại|mobile|tel)$/i,
      email: /^(email|e-mail|mail)$/i,
      address: /^(địa chỉ|address|diachi)$/i,
      birthday: /^(ngày sinh|birthday|sinh nhật|dob|date of birth)$/i,
      tags: /^(tags|nhãn|phân loại)$/i,
      note: /^(ghi chú|note|notes|mô tả)$/i,
      total_orders: /^(tổng đơn hàng|số đơn|total.?orders|order.?count)$/i,
      total_spent: /^(tổng tiền|tổng chi tiêu|total.?spent|revenue)$/i,
      source: /^(nguồn|source|kênh)$/i,
      created_at: /^(ngày tạo|created|created.?at|ngày đăng ký)$/i,
    };
    headers.forEach(h => {
      const trimmed = h.trim();
      for (const [field, regex] of Object.entries(matchers)) {
        if (regex.test(trimmed)) { mapping[h] = field; break; }
      }
    });
    return mapping;
  };

  const handleImportFile = (file) => {
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (json.length < 2) return alert('File trống hoặc chỉ có header');
        const headers = json[0].map(h => String(h).trim());
        const rows = json.slice(1).filter(r => r.some(c => c !== ''));
        setImportHeaders(headers);
        setImportRawData(rows);
        setImportMapping(autoMapHeaders(headers));
        setImportStep(2);
      } catch (err) { alert('Không thể đọc file: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImportFile(file);
  };

  const validateAndParse = () => {
    const existingPhones = new Set((customers || []).map(c => normalizePhone(c.phone)).filter(Boolean));
    const parsed = importRawData.map((row, idx) => {
      const mapped = {};
      importHeaders.forEach((h, i) => {
        const field = importMapping[h];
        if (field) mapped[field] = row[i] != null ? String(row[i]).trim() : '';
      });
      // Haravan: merge first_name + last_name
      let name = mapped.name || '';
      if (!name && (mapped.last_name || mapped.first_name)) {
        name = [mapped.last_name, mapped.first_name].filter(Boolean).join(' ');
      }
      const phone = normalizePhone(mapped.phone);
      const email = mapped.email || '';
      const address = mapped.address || '';
      const note = mapped.note || '';
      const tags = mapped.tags ? mapped.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const birthday = mapped.birthday || '';
      const source = mapped.source || '';
      // Validate
      const errors = [];
      if (!name) errors.push('Thiếu tên');
      if (!phone) errors.push('Thiếu SĐT');
      else if (!/^0\d{8,10}$/.test(phone)) errors.push('SĐT không hợp lệ');
      const isDuplicate = phone && existingPhones.has(phone);
      return { idx: idx + 2, name, phone, email, address, note, tags, birthday, source, errors, isDuplicate, raw: row };
    });
    setImportParsed(parsed);
    setImportStep(3);
  };

  const importSummary = useMemo(() => {
    const newCount = importParsed.filter(r => r.errors.length === 0 && !r.isDuplicate).length;
    const updateCount = importParsed.filter(r => r.errors.length === 0 && r.isDuplicate).length;
    const errorCount = importParsed.filter(r => r.errors.length > 0).length;
    return { newCount, updateCount, errorCount };
  }, [importParsed]);

  const doImport = async () => {
    if (!canEditSales('sales')) { alert('Bạn không có quyền import khách hàng'); return; }
    setImportStep(4);
    setImportProgress(0);
    setImportResult(null);
    const validRows = importParsed.filter(r => r.errors.length === 0);
    let inserted = 0, updated = 0, skipped = 0;
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      try {
        if (r.isDuplicate) {
          // Update existing customer
          const existing = (customers || []).find(c => normalizePhone(c.phone) === r.phone);
          if (existing) {
            const updates = {};
            if (r.name) updates.name = r.name;
            if (r.email) updates.email = r.email;
            if (r.address) updates.address = r.address;
            if (r.birthday) updates.birthday = r.birthday;
            if (r.source) updates.source = r.source;
            if (r.tags.length > 0) {
              const merged = [...new Set([...(existing.tags || []), ...r.tags])];
              updates.tags = merged;
            }
            // Don't overwrite notes, append
            if (r.note && r.note !== existing.note) {
              updates.note = existing.note ? `${existing.note}\n${r.note}` : r.note;
            }
            updates.updated_at = getNowISOVN();
            await supabase.from('customers').update(updates).eq('id', existing.id);
            updated++;
          }
        } else {
          // Insert new
          await supabase.from('customers').insert([{
            tenant_id: tenant.id, name: r.name, phone: r.phone,
            email: r.email || null, address: r.address || null, note: r.note || null,
            birthday: r.birthday || null, source: r.source || null,
            tags: r.tags.length > 0 ? r.tags : null,
            customer_type: 'retail', created_by: currentUser.name
          }]);
          inserted++;
        }
      } catch (err) { console.error('Import row error:', err); skipped++; }
      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
    }
    setImportResult({ inserted, updated, skipped });
    if (inserted > 0 || updated > 0) {
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'import', entityType: 'customer', entityId: 'customer-import', entityName: 'Import khách hàng', description: 'Import khách hàng: ' + inserted + ' mới, ' + updated + ' cập nhật' + (skipped > 0 ? ', ' + skipped + ' bỏ qua' : '') });
    }
    await loadSalesData();
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const data = [
      ['Họ tên', 'SĐT', 'Email', 'Địa chỉ', 'Ngày sinh', 'Ghi chú', 'Tags'],
      ['Nguyễn Văn A', '0912345678', 'vana@email.com', '123 Nguyễn Huệ, Q.1, TP.HCM', '1990-05-15', 'Khách quen cửa hàng', 'Karaoke, Đại lý miền Nam'],
      ['Trần Thị B', '0987654321', 'thib@email.com', '456 Lê Lợi, Q.3, TP.HCM', '', 'Mua sỉ loa', 'Hội trường'],
      ['Lê Văn C', '0909123456', '', '789 Trần Hưng Đạo, TP.HCM', '1985-12-01', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 35 }, { wch: 12 }, { wch: 25 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Khách hàng');
    XLSX.writeFile(wb, 'mau-import-khach-hang.xlsx');
  };

  const resetImport = () => {
    setShowImportModal(false); setImportStep(1); setImportRawData([]); setImportHeaders([]);
    setImportMapping({}); setImportParsed([]); setImportProgress(0); setImportResult(null);
    setImportFileName('');
  };

  // Birthday display
  const formatBirthday = (bd) => {
    if (!bd) return '';
    const d = new Date(bd);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  // Days since last purchase
  const daysSinceLastPurchase = (lastOrder) => {
    if (!lastOrder) return null;
    const diff = Date.now() - new Date(lastOrder.created_at).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  // Form fields (rendered inline to prevent input focus loss)
  const formFieldsJsx = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên *</label>
          <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nguyễn Văn A"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">SĐT *</label>
          <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="0901234567"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@example.com"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ngày sinh</label>
          <input type="date" value={formBirthday} onChange={e => setFormBirthday(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
        <input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="123 Nguyễn Huệ, Q.1, TP.HCM"
          className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nhóm khách hàng</label>
          <select value={formType} onChange={e => setFormType(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            {Object.entries(CUSTOMER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nguồn</label>
          <select value={formSource} onChange={e => setFormSource(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Chưa xác định</option>
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
        <div className="flex flex-wrap gap-1 mb-1">
          {formTags.map(t => (
            <span key={t} className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs flex items-center gap-1">
              {t} <button type="button" onClick={() => removeTag(t)} className="text-green-500 hover:text-red-500">x</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
            placeholder="Nhập tag rồi Enter..." className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {TAG_SUGGESTIONS.filter(s => !formTags.includes(s)).slice(0, 6).map(s => (
            <button key={s} type="button" onClick={() => addTag(s)}
              className="px-2 py-0.5 bg-gray-100 hover:bg-green-100 rounded text-xs text-gray-600">{s}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
        <textarea value={formNote} onChange={e => setFormNote(e.target.value)} rows={2} placeholder="Ghi chú về khách hàng..."
          className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Dashboard Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[
          { label: 'Tổng KH', value: totalCustomerCount || dashboardStats.total, color: 'bg-gray-50 text-gray-700', onClick: () => setViewMode('list') },
          { label: 'Mới tháng này', value: dashboardStats.newThisMonth, color: 'bg-green-50 text-green-700', onClick: () => setViewMode('list') },
          { label: 'Quay lại', value: dashboardStats.returningThisMonth, color: 'bg-blue-50 text-blue-700', onClick: () => setViewMode('list') },
          { label: 'Sinh nhật', value: dashboardStats.birthdayThisMonth, color: 'bg-pink-50 text-pink-700', icon: '🎂', onClick: () => setViewMode('birthday') },
          { label: 'Sắp mất', value: dashboardStats.churnRisk, color: 'bg-red-50 text-red-700', onClick: () => setViewMode('churn') },
          { label: 'Top KH', value: dashboardStats.top5.length, color: 'bg-yellow-50 text-yellow-700', onClick: () => { setSortCustBy('totalSpent'); setSortCustOrder('desc'); setViewMode('list'); } },
        ].map(s => (
          <button key={s.label} onClick={s.onClick}
            className={`${s.color} p-2.5 rounded-lg text-center hover:shadow-md transition cursor-pointer`}>
            <div className="text-lg font-bold">{s.icon || ''}{s.value}</div>
            <div className="text-[10px] md:text-xs">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">
            {viewMode === 'birthday' ? '🎂 Sinh nhật tháng này' : viewMode === 'churn' ? '⚠️ Khách sắp mất' : '👥 Khách Hàng'}
          </h2>
          <p className="text-sm text-gray-500">
            {filtered.length} khách hàng
            {viewMode !== 'list' && <button onClick={() => setViewMode('list')} className="ml-2 text-blue-600 hover:underline text-xs">Xem tất cả</button>}
          </p>
        </div>
        <div className="flex gap-2">
          {hasPermission('sales', 2) && (
            <button onClick={exportCustomersCSV} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600">📤 CSV</button>
          )}
          {canEditSales('sales') && (
            <button onClick={() => { resetImport(); setShowImportModal(true); }}
              className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium">📥 Import</button>
          )}
          {hasPermission('sales', 2) && (
            <button onClick={() => { resetForm(); setShowCreateModal(true); }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm">
              + Thêm khách
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Tìm tên, SĐT, email, tag..."
            className="w-full border rounded-lg px-4 py-2.5 text-sm pl-10" />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        </div>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="all">Tất cả nhóm</option>
          {Object.entries(CUSTOMER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={`${sortCustBy}-${sortCustOrder}`} onChange={e => { const [by, ord] = e.target.value.split('-'); setSortCustBy(by); setSortCustOrder(ord); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm">
          <option value="name-asc">Tên A→Z</option>
          <option value="name-desc">Tên Z→A</option>
          <option value="totalSpent-desc">Mua nhiều nhất</option>
          <option value="lastPurchase-desc">Mua gần nhất</option>
          <option value="created_at-desc">Mới thêm</option>
        </select>
      </div>

      {/* Churn warning */}
      {viewMode === 'churn' && filtered.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {filtered.length} khách hàng chưa quay lại hơn 6 tháng. Nên liên hệ lại để giữ chân khách.
        </div>
      )}

      {/* Customer List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-2">{viewMode === 'birthday' ? '🎂' : viewMode === 'churn' ? '⚠️' : '👥'}</div>
            <p>{search ? 'Không tìm thấy khách hàng' : viewMode === 'birthday' ? 'Không có sinh nhật tháng này' : viewMode === 'churn' ? 'Không có khách sắp mất' : 'Chưa có khách hàng nào'}</p>
          </div>
        ) : paginatedCustomers.map(c => {
          const stats = getCustomerStats(c.id);
          const days = daysSinceLastPurchase(stats.lastOrder);
          const custType = CUSTOMER_TYPES[c.customer_type || 'retail'];
          return (
            <div key={c.id}
              onClick={() => { setSelectedCustomer(c); fillForm(c); setEditMode(false); setDetailTab('orders'); setShowDetailModal(true); loadInteractions(c.id); }}
              className="bg-white rounded-xl border p-3 md:p-4 hover:shadow-md cursor-pointer transition-shadow">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-gray-900">{c.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${custType.color}`}>{custType.label}</span>
                    {loyaltyEnabled && (() => { const t = getCustomerTier(c.id); const cp = getCustomerPointsData(c.id); return cp ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.color}`}>{t.name} ({cp.total_points - cp.used_points}P)</span> : null; })()}
                    {c.birthday && new Date(c.birthday).getMonth() === new Date().getMonth() && (
                      <span className="text-xs" title={`Sinh nhật: ${formatBirthday(c.birthday)}`}>🎂</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {c.phone && <span>📱 {c.phone}</span>}
                    {c.email && <span>✉️ {c.email}</span>}
                    {c.source && <span className="text-xs text-gray-400">{SOURCES[c.source] || c.source}</span>}
                  </div>
                  {(c.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.tags.map(t => <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{t}</span>)}
                    </div>
                  )}
                </div>
                <div className="text-right ml-3 flex-shrink-0">
                  <div className="text-sm font-medium text-green-600">{formatMoney(stats.totalSpent)}</div>
                  <div className="text-xs text-gray-500">{stats.completedCount} đơn</div>
                  {stats.debtAmount > 0 && <div className="text-xs text-red-500 font-medium">Nợ: {formatMoney(stats.debtAmount)}</div>}
                  {days !== null && days > 180 && <div className="text-[10px] text-red-400 mt-0.5">{days} ngày chưa mua</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">{filtered.length} khách • Trang {effectivePage}/{totalPages}</div>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(1, effectivePage - 1))} disabled={effectivePage <= 1}
              className={`px-3 py-1.5 rounded-lg text-sm ${effectivePage <= 1 ? 'text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>←</button>
            {(() => {
              const pages = [];
              const maxVisible = 7;
              if (totalPages <= maxVisible) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                let start = Math.max(2, effectivePage - 2);
                let end = Math.min(totalPages - 1, effectivePage + 2);
                if (effectivePage <= 3) { start = 2; end = 5; }
                if (effectivePage >= totalPages - 2) { start = totalPages - 4; end = totalPages - 1; }
                if (start > 2) pages.push('...');
                for (let i = start; i <= end; i++) pages.push(i);
                if (end < totalPages - 1) pages.push('...');
                pages.push(totalPages);
              }
              return pages.map((p, idx) =>
                p === '...' ? <span key={`dot-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">...</span> :
                <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium ${effectivePage === p ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>{p}</button>
              );
            })()}
            <button onClick={() => setPage(Math.min(totalPages, effectivePage + 1))} disabled={effectivePage >= totalPages}
              className={`px-3 py-1.5 rounded-lg text-sm ${effectivePage >= totalPages ? 'text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>→</button>
          </div>
        </div>
      )}

      {/* ====== CREATE MODAL ====== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 my-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Thêm khách hàng mới</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {formFieldsJsx}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Hủy</button>
              <button onClick={handleCreate} disabled={submitting}
                className={`flex-1 px-4 py-2 text-white rounded-lg text-sm font-medium ${submitting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
                {submitting ? 'Đang lưu...' : 'Thêm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== DETAIL MODAL ====== */}
      {showDetailModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full my-4">
            {/* Header */}
            <div className="p-4 border-b bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-xl flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{selectedCustomer.name}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/20 text-white">
                    {CUSTOMER_TYPES[selectedCustomer.customer_type || 'retail']?.label}
                  </span>
                </div>
                <div className="text-sm text-green-100 flex flex-wrap gap-x-3">
                  {selectedCustomer.phone && <span>📱 {selectedCustomer.phone}</span>}
                  {selectedCustomer.email && <span>✉️ {selectedCustomer.email}</span>}
                  {selectedCustomer.birthday && <span>🎂 {formatBirthday(selectedCustomer.birthday)}</span>}
                </div>
              </div>
              <button onClick={() => { setShowDetailModal(false); setSelectedCustomer(null); }} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            <div className="p-4 space-y-4">
              {/* Stats */}
              {(() => {
                const stats = getCustomerStats(selectedCustomer.id);
                const days = daysSinceLastPurchase(stats.lastOrder);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-green-50 p-2.5 rounded-lg text-center">
                      <div className="text-lg font-bold text-green-700">{stats.completedCount}</div>
                      <div className="text-[10px] text-gray-600">Đơn hoàn thành</div>
                    </div>
                    <div className="bg-blue-50 p-2.5 rounded-lg text-center">
                      <div className="text-sm font-bold text-blue-700">{formatMoney(stats.totalSpent)}</div>
                      <div className="text-[10px] text-gray-600">Tổng mua</div>
                    </div>
                    <div className={`p-2.5 rounded-lg text-center ${stats.debtAmount > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <div className={`text-sm font-bold ${stats.debtAmount > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                        {stats.debtAmount > 0 ? formatMoney(stats.debtAmount) : '0đ'}
                      </div>
                      <div className="text-[10px] text-gray-600">Công nợ</div>
                    </div>
                    <div className="bg-gray-50 p-2.5 rounded-lg text-center">
                      <div className="text-sm font-bold text-gray-700">{days !== null ? `${days} ngày` : '—'}</div>
                      <div className="text-[10px] text-gray-600">Lần mua cuối</div>
                    </div>
                  </div>
                );
              })()}

              {/* Edit form or info */}
              {editMode ? (
                <>
                  {formFieldsJsx}
                  <div className="flex gap-2">
                    <button onClick={() => { setEditMode(false); fillForm(selectedCustomer); }} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Hủy</button>
                    <button onClick={handleUpdate} disabled={submitting}
                      className={`flex-1 px-4 py-2 text-white rounded-lg text-sm font-medium ${submitting ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                      {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
                    {selectedCustomer.address && <div><span className="text-gray-500">Địa chỉ:</span> {selectedCustomer.address}</div>}
                    {selectedCustomer.source && <div><span className="text-gray-500">Nguồn:</span> {SOURCES[selectedCustomer.source] || selectedCustomer.source}</div>}
                    {(selectedCustomer.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedCustomer.tags.map(t => <span key={t} className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">{t}</span>)}
                      </div>
                    )}
                    {selectedCustomer.note && <div><span className="text-gray-500">Ghi chú:</span> {selectedCustomer.note}</div>}
                  </div>
                  <div className="flex gap-2">
                    {hasPermission('sales', 2) && (
                      <button onClick={() => setEditMode(true)} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">Sửa</button>
                    )}
                    {canEditSales('sales') && (
                      <button onClick={() => handleDelete(selectedCustomer.id)} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium">Xóa</button>
                    )}
                  </div>
                </>
              )}

              {/* Tabs: Orders | Addresses | Interactions | Warranty */}
              <div className="flex border-b overflow-x-auto">
                {[
                  { key: 'orders', label: `Đơn hàng (${customerOrders.length})` },
                  { key: 'debt', label: `Công nợ (${getUnpaidOrders(selectedCustomer.id).length})` },
                  { key: 'addresses', label: `Địa chỉ (${getCustomerAddresses(selectedCustomer.id).length})` },
                  { key: 'interactions', label: 'Tương tác' },
                  { key: 'warranty', label: `Bảo hành (${customerWarranty.cards.length})` },
                  ...(loyaltyEnabled ? [{ key: 'loyalty', label: 'Tích điểm' }] : []),
                ].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition ${detailTab === tab.key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab: Orders */}
              {detailTab === 'orders' && (
                <div>
                  {customerOrders.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Chưa có đơn hàng</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {customerOrders.map(o => (
                        <div key={o.id} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-lg text-sm">
                          <div>
                            <span className="font-medium">{o.order_number}</span>
                            <span className="text-gray-400 ml-2">{new Date(o.created_at).toLocaleDateString('vi-VN')}</span>
                            <span className="ml-2">{statusBadge(o.status)}</span>
                          </div>
                          <span className="font-medium">{formatMoney(o.total_amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Debt */}
              {detailTab === 'debt' && (
                <div className="space-y-3">
                  {/* Summary */}
                  {(() => {
                    const stats = getCustomerStats(selectedCustomer.id);
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                          <div className="text-xs text-blue-600">Tổng mua</div>
                          <div className="text-sm font-bold text-blue-700">{formatMoney(stats.totalSpent)}</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-2.5 text-center">
                          <div className="text-xs text-green-600">Đã TT</div>
                          <div className="text-sm font-bold text-green-700">{formatMoney(stats.totalSpent - stats.debtAmount)}</div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-2.5 text-center">
                          <div className="text-xs text-red-600">Còn nợ</div>
                          <div className="text-sm font-bold text-red-700">{formatMoney(stats.debtAmount)}</div>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Unpaid orders list */}
                  {(() => {
                    const unpaidOrders = getUnpaidOrders(selectedCustomer.id);
                    if (unpaidOrders.length === 0) return <p className="text-sm text-gray-400 text-center py-4">Không có công nợ</p>;
                    return (
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {unpaidOrders.map(o => {
                          const remaining = parseFloat(o.total_amount || 0) - parseFloat(o.paid_amount || 0);
                          const isExpanded = debtPaymentOrderId === o.id;
                          return (
                            <div key={o.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="font-medium text-sm">{o.order_number}</span>
                                  <span className="text-xs text-gray-400 ml-2">{new Date(o.created_at).toLocaleDateString('vi-VN')}</span>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-gray-500">Tổng: {formatMoney(o.total_amount)}</div>
                                  <div className="text-xs text-red-600 font-medium">Nợ: {formatMoney(remaining)}</div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="text-xs text-gray-500">
                                  Đã trả: {formatMoney(o.paid_amount || 0)}
                                  <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${o.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                    {o.payment_status === 'partial' ? 'TT 1 phần' : 'Chưa TT'}
                                  </span>
                                </div>
                                {canEditSales('sales') && (
                                  <button onClick={() => {
                                    if (isExpanded) { setDebtPaymentOrderId(null); } else {
                                      setDebtPaymentOrderId(o.id); setDebtPaymentAmount(''); setDebtPaymentMethod('cash'); setDebtPaymentNote('');
                                      loadDebtPaymentHistory(o.id);
                                    }
                                  }} className="px-2.5 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200">
                                    {isExpanded ? 'Đóng' : 'Thu tiền'}
                                  </button>
                                )}
                              </div>
                              {/* Inline payment form */}
                              {isExpanded && (
                                <div className="bg-white border border-green-200 rounded-lg p-2.5 space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <input type="number" min="0" max={remaining} value={debtPaymentAmount}
                                      onChange={e => setDebtPaymentAmount(e.target.value)}
                                      placeholder={`Tối đa ${formatMoney(remaining)}`}
                                      className="border rounded-lg px-2.5 py-1.5 text-sm" />
                                    <select value={debtPaymentMethod} onChange={e => setDebtPaymentMethod(e.target.value)}
                                      className="border rounded-lg px-2.5 py-1.5 text-sm">
                                      <option value="cash">Tiền mặt</option>
                                      <option value="bank_transfer">Chuyển khoản</option>
                                      <option value="momo">MoMo</option>
                                    </select>
                                  </div>
                                  <input value={debtPaymentNote} onChange={e => setDebtPaymentNote(e.target.value)}
                                    placeholder="Ghi chú..." className="w-full border rounded-lg px-2.5 py-1.5 text-sm" />
                                  <button onClick={() => handleDebtPayment(o)} disabled={submitting}
                                    className={`w-full py-1.5 rounded-lg text-sm font-medium text-white ${submitting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
                                    {submitting ? 'Đang xử lý...' : 'Xác nhận thu'}
                                  </button>
                                  {/* Payment history */}
                                  {debtPaymentHistory.length > 0 && (
                                    <div className="border-t pt-2 mt-2">
                                      <div className="text-xs font-medium text-gray-500 mb-1">Lịch sử thanh toán</div>
                                      {debtPaymentHistory.map(ph => (
                                        <div key={ph.id} className="flex justify-between text-xs text-gray-500 py-0.5">
                                          <span>{new Date(ph.created_at).toLocaleDateString('vi-VN')} - {ph.payment_method}</span>
                                          <span className="text-green-600 font-medium">{formatMoney(ph.amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Tab: Interactions */}
              {/* Tab: Addresses */}
              {detailTab === 'addresses' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium text-gray-700">Địa chỉ giao hàng</div>
                    {canEditSales('sales') && (
                      <button onClick={() => openAddressForm()} className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium">+ Thêm địa chỉ</button>
                    )}
                  </div>

                  {showAddressForm && (
                    <div className="bg-blue-50 rounded-lg p-3 space-y-2 border border-blue-200">
                      <div className="text-sm font-medium text-blue-700">{editingAddress ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'}</div>
                      <div className="grid grid-cols-3 gap-2">
                        <select value={addrLabel} onChange={e => setAddrLabel(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
                          {['Nhà', 'Công ty', 'Cửa hàng', 'Kho', 'Khác'].map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <input value={addrRecipientName} onChange={e => setAddrRecipientName(e.target.value)} placeholder="Người nhận" className="border rounded-lg px-3 py-1.5 text-sm" />
                        <input value={addrRecipientPhone} onChange={e => setAddrRecipientPhone(e.target.value)} placeholder="SĐT nhận" className="border rounded-lg px-3 py-1.5 text-sm" />
                      </div>
                      <input value={addrAddress} onChange={e => setAddrAddress(e.target.value)} placeholder="Địa chỉ (số nhà, đường) *" className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                      <div className="grid grid-cols-3 gap-2">
                        <input value={addrWard} onChange={e => setAddrWard(e.target.value)} placeholder="Phường/Xã" className="border rounded-lg px-3 py-1.5 text-sm" />
                        <input value={addrDistrict} onChange={e => setAddrDistrict(e.target.value)} placeholder="Quận/Huyện" className="border rounded-lg px-3 py-1.5 text-sm" />
                        <input value={addrProvince} onChange={e => setAddrProvince(e.target.value)} placeholder="Tỉnh/TP" className="border rounded-lg px-3 py-1.5 text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={resetAddressForm} className="flex-1 px-3 py-1.5 bg-gray-200 rounded-lg text-xs font-medium">Hủy</button>
                        <button onClick={handleSaveAddress} disabled={submitting}
                          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white ${submitting ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                          {submitting ? 'Đang lưu...' : editingAddress ? 'Cập nhật' : 'Lưu'}
                        </button>
                      </div>
                    </div>
                  )}

                  {getCustomerAddresses(selectedCustomer.id).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Chưa có địa chỉ nào</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {getCustomerAddresses(selectedCustomer.id).map(addr => (
                        <div key={addr.id} className={`p-3 rounded-lg border text-sm ${addr.is_default ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-medium">{addr.label}</span>
                              {addr.is_default && <span className="ml-2 px-1.5 py-0.5 bg-green-200 text-green-800 rounded text-[10px]">Mặc định</span>}
                            </div>
                            {canEditSales('sales') && (
                              <div className="flex gap-1">
                                {!addr.is_default && (
                                  <button onClick={() => handleSetDefaultAddress(addr.id, addr.customer_id)} className="text-xs text-blue-600 hover:underline">Đặt MĐ</button>
                                )}
                                <button onClick={() => openAddressForm(addr)} className="text-xs text-amber-600 hover:underline">Sửa</button>
                                <button onClick={() => handleDeleteAddress(addr.id)} className="text-xs text-red-600 hover:underline">Xóa</button>
                              </div>
                            )}
                          </div>
                          {addr.recipient_name && <div className="text-gray-600">{addr.recipient_name} {addr.recipient_phone && `- ${addr.recipient_phone}`}</div>}
                          <div className="text-gray-700">{[addr.address, addr.ward, addr.district, addr.province].filter(Boolean).join(', ')}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'interactions' && (
                <div className="space-y-3">
                  {/* Add interaction */}
                  <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                    <div className="flex gap-2">
                      <select value={interactionType} onChange={e => setInteractionType(e.target.value)}
                        className="border rounded-lg px-3 py-1.5 text-sm">
                        {Object.entries(INTERACTION_TYPES).map(([k, v]) => (
                          <option key={k} value={k}>{v.icon} {v.label}</option>
                        ))}
                      </select>
                      <input value={interactionContent} onChange={e => setInteractionContent(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddInteraction(); }}
                        placeholder="Nội dung tương tác..." className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
                      <button onClick={handleAddInteraction} disabled={submitting || !interactionContent.trim()}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium text-white ${submitting || !interactionContent.trim() ? 'bg-gray-300' : 'bg-blue-600 hover:bg-blue-700'}`}>
                        Ghi
                      </button>
                    </div>
                  </div>
                  {/* Interaction list */}
                  {loadingInteractions ? (
                    <div className="text-center py-4 text-gray-400 text-sm">Đang tải...</div>
                  ) : interactions.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Chưa có lịch sử tương tác</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {interactions.map(i => {
                        const iType = INTERACTION_TYPES[i.type] || { icon: '📝', label: i.type };
                        return (
                          <div key={i.id} className="p-2.5 bg-gray-50 rounded-lg text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              <span>{iType.icon}</span>
                              <span className="font-medium text-gray-700">{iType.label}</span>
                              <span className="text-xs text-gray-400 ml-auto">{new Date(i.created_at).toLocaleString('vi-VN')}</span>
                            </div>
                            <div className="text-gray-600">{i.content}</div>
                            <div className="text-xs text-gray-400 mt-1">NV: {i.created_by}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Warranty */}
              {detailTab === 'warranty' && (
                <div className="space-y-3">
                  {/* Warranty Cards */}
                  {customerWarranty.cards.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1.5">Sản phẩm đang bảo hành</div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {customerWarranty.cards.map(card => {
                          const isExpired = card.warranty_end && new Date(card.warranty_end) < new Date();
                          return (
                            <div key={card.id} className={`p-2.5 rounded-lg text-sm ${isExpired ? 'bg-red-50' : 'bg-green-50'}`}>
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="font-medium">{card.product_name}</div>
                                  <div className="text-xs text-gray-500">
                                    Serial: {card.serial_number || '—'} | Mã BH: {card.card_number}
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isExpired ? 'bg-red-200 text-red-700' : card.status === 'active' ? 'bg-green-200 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                  {isExpired ? 'Hết hạn' : card.status === 'active' ? 'Còn hiệu lực' : card.status}
                                </span>
                              </div>
                              {card.warranty_end && (
                                <div className="text-xs text-gray-400 mt-1">
                                  Hạn BH: {new Date(card.warranty_start).toLocaleDateString('vi-VN')} → {new Date(card.warranty_end).toLocaleDateString('vi-VN')}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Warranty Repairs */}
                  {customerWarranty.repairs.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1.5">Lịch sử sửa chữa</div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {customerWarranty.repairs.map(r => (
                          <div key={r.id} className="p-2.5 bg-orange-50 rounded-lg text-sm">
                            <div className="flex justify-between">
                              <div className="font-medium">{r.product_name || 'Sản phẩm'}</div>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${r.status === 'completed' ? 'bg-green-200 text-green-700' : 'bg-yellow-200 text-yellow-700'}`}>
                                {r.status === 'completed' ? 'Đã xong' : r.status === 'in_progress' ? 'Đang sửa' : r.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Mã: {r.repair_number || '—'} | {new Date(r.created_at).toLocaleDateString('vi-VN')}
                              {r.repair_cost > 0 && ` | Chi phí: ${formatMoney(r.repair_cost)}`}
                            </div>
                            {r.issue_description && <div className="text-xs text-gray-600 mt-0.5">{r.issue_description}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {customerWarranty.cards.length === 0 && customerWarranty.repairs.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Chưa có thông tin bảo hành</p>
                  )}
                </div>
              )}

              {/* Tab: Loyalty */}
              {detailTab === 'loyalty' && loyaltyEnabled && (
                <div className="space-y-3">
                  {(() => {
                    const cp = getCustomerPointsData(selectedCustomer.id);
                    const tier = getCustomerTier(selectedCustomer.id);
                    const availPts = cp ? (cp.total_points - cp.used_points) : 0;
                    // Load history on first render
                    if (customerPointHistory.length === 0 && cp) loadPointHistory(selectedCustomer.id);
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-green-50 rounded-lg p-2.5 text-center">
                            <div className="text-xs text-green-600">Tổng tích</div>
                            <div className="text-sm font-bold text-green-700">{cp?.total_points || 0}</div>
                          </div>
                          <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                            <div className="text-xs text-amber-600">Đã dùng</div>
                            <div className="text-sm font-bold text-amber-700">{cp?.used_points || 0}</div>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                            <div className="text-xs text-blue-600">Khả dụng</div>
                            <div className="text-sm font-bold text-blue-700">{availPts}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">Hạng:</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${tier.color}`}>{tier.name}</span>
                          {availPts > 0 && (
                            <span className="text-xs text-gray-400 ml-auto">= {formatMoney(availPts * (loyaltyConfig.point_value || 1000))}</span>
                          )}
                        </div>
                        {/* Point history */}
                        {customerPointHistory.length > 0 ? (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            <div className="text-sm font-medium text-gray-700">Lịch sử điểm</div>
                            {customerPointHistory.map(pt => (
                              <div key={pt.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg text-sm">
                                <div>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${pt.type === 'earn' ? 'bg-green-100 text-green-700' : pt.type === 'redeem' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {pt.type === 'earn' ? 'Tích' : pt.type === 'redeem' ? 'Dùng' : pt.type === 'adjust' ? 'Điều chỉnh' : pt.type}
                                  </span>
                                  <span className="text-gray-500 text-xs ml-2">{new Date(pt.created_at).toLocaleDateString('vi-VN')}</span>
                                </div>
                                <span className={`font-medium ${pt.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {pt.points > 0 ? '+' : ''}{pt.points}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 text-center py-2">Chưa có lịch sử tích điểm</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== IMPORT MODAL ====== */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full my-4">
            <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">Import khách hàng</h3>
                <div className="text-sm text-blue-100">
                  {importStep === 1 && 'Bước 1: Tải file lên'}
                  {importStep === 2 && 'Bước 2: Map cột dữ liệu'}
                  {importStep === 3 && 'Bước 3: Xem trước & kiểm tra'}
                  {importStep === 4 && (importResult ? 'Hoàn thành' : 'Đang import...')}
                </div>
              </div>
              <button onClick={resetImport} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            <div className="p-4 space-y-4">
              {/* Step indicator */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4].map(s => (
                  <div key={s} className="flex items-center gap-1 flex-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${importStep >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
                    {s < 4 && <div className={`flex-1 h-0.5 ${importStep > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                  </div>
                ))}
              </div>

              {/* Step 1: Upload */}
              {importStep === 1 && (
                <div className="space-y-3">
                  <div
                    onDrop={handleFileDrop}
                    onDragOver={e => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
                  >
                    <div className="text-4xl mb-2">📄</div>
                    <p className="text-sm text-gray-600 font-medium">Kéo thả file vào đây hoặc click để chọn</p>
                    <p className="text-xs text-gray-400 mt-1">Hỗ trợ: .xlsx, .xls, .csv</p>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) handleImportFile(e.target.files[0]); }} />
                  </div>
                  <button onClick={downloadTemplate} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-600">
                    📥 Tải file mẫu (.xlsx)
                  </button>
                </div>
              )}

              {/* Step 2: Map columns */}
              {importStep === 2 && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-600">File: <span className="font-medium">{importFileName}</span> ({importRawData.length} dòng)</div>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {importHeaders.map((h, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{h}</div>
                          <div className="text-xs text-gray-400 truncate">VD: {importRawData[0]?.[i] ?? '—'}</div>
                        </div>
                        <span className="text-gray-400">→</span>
                        <select value={importMapping[h] || ''} onChange={e => setImportMapping(prev => ({ ...prev, [h]: e.target.value }))}
                          className={`w-40 border rounded-lg px-2 py-1.5 text-sm ${importMapping[h] ? 'border-blue-300 bg-blue-50' : ''}`}>
                          {FIELD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  {/* Preview 3 rows */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">Xem trước (3 dòng đầu):</div>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead><tr>{importHeaders.filter(h => importMapping[h]).map(h => <th key={h} className="text-left px-2 py-1 text-gray-500">{importMapping[h]}</th>)}</tr></thead>
                        <tbody>
                          {importRawData.slice(0, 3).map((row, ri) => (
                            <tr key={ri} className="border-t">
                              {importHeaders.map((h, ci) => importMapping[h] ? <td key={ci} className="px-2 py-1 truncate max-w-[120px]">{row[ci]}</td> : null)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setImportStep(1)} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Quay lại</button>
                    <button onClick={validateAndParse}
                      disabled={!importMapping[importHeaders.find(h => importMapping[h] === 'phone') || ''] && !importMapping[importHeaders.find(h => importMapping[h] === 'name') || '']}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:bg-gray-300">
                      Tiếp theo
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Preview & Validate */}
              {importStep === 3 && (
                <div className="space-y-3">
                  {/* Summary */}
                  <div className="flex gap-3">
                    <div className="flex-1 bg-green-50 rounded-lg p-2.5 text-center">
                      <div className="text-lg font-bold text-green-700">{importSummary.newCount}</div>
                      <div className="text-xs text-gray-600">Khách mới</div>
                    </div>
                    <div className="flex-1 bg-yellow-50 rounded-lg p-2.5 text-center">
                      <div className="text-lg font-bold text-yellow-700">{importSummary.updateCount}</div>
                      <div className="text-xs text-gray-600">Cập nhật</div>
                    </div>
                    <div className="flex-1 bg-red-50 rounded-lg p-2.5 text-center">
                      <div className="text-lg font-bold text-red-700">{importSummary.errorCount}</div>
                      <div className="text-xs text-gray-600">Lỗi (bỏ qua)</div>
                    </div>
                  </div>
                  {/* Preview table */}
                  <div className="max-h-64 overflow-auto border rounded-lg">
                    <table className="w-full text-xs min-w-[400px]">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5 text-gray-500">Dòng</th>
                          <th className="text-left px-2 py-1.5 text-gray-500">Họ tên</th>
                          <th className="text-left px-2 py-1.5 text-gray-500">SĐT</th>
                          <th className="text-left px-2 py-1.5 text-gray-500">Email</th>
                          <th className="text-left px-2 py-1.5 text-gray-500">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importParsed.map((r, i) => (
                          <tr key={i} className={`border-t ${r.errors.length > 0 ? 'bg-red-50' : r.isDuplicate ? 'bg-yellow-50' : ''}`}>
                            <td className="px-2 py-1.5 text-gray-400">{r.idx}</td>
                            <td className="px-2 py-1.5">{r.name || <span className="text-red-400">—</span>}</td>
                            <td className="px-2 py-1.5 font-mono">{r.phone || <span className="text-red-400">—</span>}</td>
                            <td className="px-2 py-1.5 truncate max-w-[120px]">{r.email || '—'}</td>
                            <td className="px-2 py-1.5">
                              {r.errors.length > 0 ? (
                                <span className="text-red-600 font-medium">❌ {r.errors.join(', ')}</span>
                              ) : r.isDuplicate ? (
                                <span className="text-yellow-600 font-medium">⚠️ Đã tồn tại - cập nhật</span>
                              ) : (
                                <span className="text-green-600 font-medium">✅ Mới</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setImportStep(2)} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Quay lại</button>
                    <button onClick={doImport}
                      disabled={importSummary.newCount + importSummary.updateCount === 0}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:bg-gray-300">
                      Import ({importSummary.newCount + importSummary.updateCount} khách)
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Importing / Result */}
              {importStep === 4 && (
                <div className="space-y-4 py-4">
                  {!importResult ? (
                    <>
                      <div className="text-center text-sm text-gray-600">Đang import khách hàng...</div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div className="bg-blue-600 h-3 rounded-full transition-all" style={{ width: `${importProgress}%` }} />
                      </div>
                      <div className="text-center text-sm font-medium text-blue-600">{importProgress}%</div>
                    </>
                  ) : (
                    <>
                      <div className="text-center">
                        <div className="text-5xl mb-3">✅</div>
                        <h4 className="text-lg font-bold text-gray-800 mb-2">Import hoàn tất!</h4>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-green-700">{importResult.inserted}</div>
                          <div className="text-xs text-gray-600">Thêm mới</div>
                        </div>
                        <div className="flex-1 bg-yellow-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-yellow-700">{importResult.updated}</div>
                          <div className="text-xs text-gray-600">Cập nhật</div>
                        </div>
                        <div className="flex-1 bg-red-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-red-700">{importResult.skipped}</div>
                          <div className="text-xs text-gray-600">Bỏ qua</div>
                        </div>
                      </div>
                      <button onClick={resetImport} className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Đóng</button>
                    </>
                  )}
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

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { getNowISOVN, getTodayVN } from '../../utils/dateUtils';

const couponTypes = {
  percentage: { label: 'Giảm %', icon: '%' },
  fixed: { label: 'Giảm cố định', icon: '₫' },
  free_shipping: { label: 'Miễn phí ship', icon: '🚚' },
};

const generateCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

export default function SalesCouponsView({ tenant, currentUser, hasPermission, getPermissionLevel }) {
  const permLevel = getPermissionLevel('sales');
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editCoupon, setEditCoupon] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [toast, setToast] = useState(null);

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState('percentage');
  const [formValue, setFormValue] = useState('');
  const [formMinOrder, setFormMinOrder] = useState('');
  const [formMaxDiscount, setFormMaxDiscount] = useState('');
  const [formUsageLimit, setFormUsageLimit] = useState('');
  const [formPerCustomer, setFormPerCustomer] = useState('1');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadCoupons = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('coupons').select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCoupons(data || []);
    } catch (err) {
      console.error('Load coupons error:', err);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => { loadCoupons(); }, [loadCoupons]);

  const resetForm = () => {
    setFormCode(''); setFormType('percentage'); setFormValue('');
    setFormMinOrder(''); setFormMaxDiscount(''); setFormUsageLimit('');
    setFormPerCustomer('1'); setFormStartDate(''); setFormEndDate('');
    setFormDescription(''); setFormIsActive(true);
  };

  const openCreate = () => {
    resetForm();
    setEditCoupon(null);
    setShowModal(true);
  };

  const openEdit = (coupon) => {
    setEditCoupon(coupon);
    setFormCode(coupon.code);
    setFormType(coupon.type);
    setFormValue(coupon.value?.toString() || '');
    setFormMinOrder(coupon.min_order_value?.toString() || '');
    setFormMaxDiscount(coupon.max_discount?.toString() || '');
    setFormUsageLimit(coupon.usage_limit?.toString() || '');
    setFormPerCustomer(coupon.per_customer_limit?.toString() || '1');
    setFormStartDate(coupon.start_date || '');
    setFormEndDate(coupon.end_date || '');
    setFormDescription(coupon.description || '');
    setFormIsActive(coupon.is_active !== false);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formCode.trim()) { alert('Vui lòng nhập mã giảm giá!'); return; }
    if (!formValue || parseFloat(formValue) <= 0) { alert('Vui lòng nhập giá trị giảm!'); return; }
    if (formType === 'percentage' && parseFloat(formValue) > 100) { alert('Giảm % không thể > 100%'); return; }
    setSubmitting(true);
    try {
      const data = {
        code: formCode.trim().toUpperCase(),
        type: formType,
        value: parseFloat(formValue) || 0,
        min_order_value: parseFloat(formMinOrder) || 0,
        max_discount: parseFloat(formMaxDiscount) || 0,
        usage_limit: parseInt(formUsageLimit) || 0,
        per_customer_limit: parseInt(formPerCustomer) || 1,
        start_date: formStartDate || null,
        end_date: formEndDate || null,
        description: formDescription,
        is_active: formIsActive,
        updated_at: getNowISOVN(),
      };
      if (editCoupon) {
        const { error } = await supabase.from('coupons').update(data).eq('id', editCoupon.id);
        if (error) throw error;
        showToast('Cập nhật mã giảm giá thành công!');
      } else {
        const { error } = await supabase.from('coupons').insert([{
          ...data, tenant_id: tenant.id, usage_count: 0, created_by: currentUser.name
        }]);
        if (error) {
          if (error.code === '23505') { alert('Mã giảm giá đã tồn tại!'); return; }
          throw error;
        }
        showToast('Tạo mã giảm giá thành công!');
      }
      setShowModal(false);
      resetForm();
      loadCoupons();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (coupon) => {
    if (!window.confirm(`Xóa mã "${coupon.code}"?`)) return;
    try {
      await supabase.from('coupons').delete().eq('id', coupon.id);
      showToast('Đã xóa mã giảm giá');
      loadCoupons();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleToggleActive = async (coupon) => {
    try {
      await supabase.from('coupons').update({ is_active: !coupon.is_active, updated_at: getNowISOVN() }).eq('id', coupon.id);
      loadCoupons();
    } catch (err) { console.error(err); }
  };

  // Stats
  const stats = useMemo(() => {
    const today = getTodayVN();
    const active = coupons.filter(c => c.is_active && (!c.end_date || c.end_date >= today));
    const expired = coupons.filter(c => c.end_date && c.end_date < today);
    const depleted = coupons.filter(c => c.usage_limit > 0 && c.usage_count >= c.usage_limit);
    const totalUsage = coupons.reduce((s, c) => s + (c.usage_count || 0), 0);
    return { active: active.length, expired: expired.length, depleted: depleted.length, totalUsage };
  }, [coupons]);

  // Filtered coupons
  const filteredCoupons = useMemo(() => {
    let result = coupons;
    const today = getTodayVN();
    if (filterStatus === 'active') result = result.filter(c => c.is_active && (!c.end_date || c.end_date >= today));
    else if (filterStatus === 'expired') result = result.filter(c => c.end_date && c.end_date < today);
    else if (filterStatus === 'depleted') result = result.filter(c => c.usage_limit > 0 && c.usage_count >= c.usage_limit);
    else if (filterStatus === 'inactive') result = result.filter(c => !c.is_active);
    if (filterType !== 'all') result = result.filter(c => c.type === filterType);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(c => c.code.toLowerCase().includes(s) || (c.description || '').toLowerCase().includes(s));
    }
    return result;
  }, [coupons, filterStatus, filterType, search]);

  const getCouponStatusBadge = (coupon) => {
    const today = getTodayVN();
    if (!coupon.is_active) return { label: 'Tắt', color: 'bg-gray-100 text-gray-600' };
    if (coupon.end_date && coupon.end_date < today) return { label: 'Hết hạn', color: 'bg-red-100 text-red-700' };
    if (coupon.usage_limit > 0 && coupon.usage_count >= coupon.usage_limit) return { label: 'Hết lượt', color: 'bg-orange-100 text-orange-700' };
    if (coupon.start_date && coupon.start_date > today) return { label: 'Chưa bắt đầu', color: 'bg-blue-100 text-blue-700' };
    return { label: 'Hoạt động', color: 'bg-green-100 text-green-700' };
  };

  const formatDiscount = (coupon) => {
    if (coupon.type === 'percentage') return `${coupon.value}%`;
    if (coupon.type === 'free_shipping') return 'Miễn phí ship';
    return formatMoney(coupon.value);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-bold">🎟️ Mã Giảm Giá</h2>
        {permLevel >= 3 && (
          <button onClick={openCreate} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm">
            + Tạo mã
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-700">{stats.active}</div>
          <div className="text-xs text-green-600">Đang hoạt động</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-red-700">{stats.expired}</div>
          <div className="text-xs text-red-600">Hết hạn</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-orange-700">{stats.depleted}</div>
          <div className="text-xs text-orange-600">Hết lượt</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-blue-700">{stats.totalUsage}</div>
          <div className="text-xs text-blue-600">Tổng lượt dùng</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm mã giảm giá..."
          className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="all">Tất cả TT</option>
          <option value="active">Hoạt động</option>
          <option value="expired">Hết hạn</option>
          <option value="depleted">Hết lượt</option>
          <option value="inactive">Đã tắt</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="all">Tất cả loại</option>
          {Object.entries(couponTypes).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
      </div>

      {/* Coupons list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Đang tải...</div>
      ) : filteredCoupons.length === 0 ? (
        <div className="text-center py-8 text-gray-400">Chưa có mã giảm giá nào</div>
      ) : (
        <div className="space-y-2">
          {filteredCoupons.map(coupon => {
            const status = getCouponStatusBadge(coupon);
            return (
              <div key={coupon.id} className="bg-white border rounded-xl p-4 hover:shadow-sm transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 text-green-700 font-mono font-bold text-lg px-3 py-1 rounded-lg">{coupon.code}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>{status.label}</span>
                        <span className="text-xs text-gray-500">{couponTypes[coupon.type]?.label}</span>
                      </div>
                      <div className="text-lg font-bold text-green-700 mt-0.5">{formatDiscount(coupon)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">
                      {coupon.usage_count}/{coupon.usage_limit || '∞'} lượt
                    </div>
                    {coupon.min_order_value > 0 && (
                      <div className="text-xs text-gray-400">Tối thiểu: {formatMoney(coupon.min_order_value)}</div>
                    )}
                    {coupon.end_date && (
                      <div className="text-xs text-gray-400">HSD: {coupon.end_date}</div>
                    )}
                  </div>
                </div>
                {coupon.description && <div className="text-sm text-gray-500 mt-2">{coupon.description}</div>}
                {permLevel >= 3 && (
                  <div className="flex gap-2 mt-3 pt-2 border-t">
                    <button onClick={() => openEdit(coupon)} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs hover:bg-blue-100">Sửa</button>
                    <button onClick={() => handleToggleActive(coupon)} className={`px-3 py-1 rounded-lg text-xs ${coupon.is_active ? 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                      {coupon.is_active ? 'Tắt' : 'Bật'}
                    </button>
                    <button onClick={() => handleDelete(coupon)} className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100">Xóa</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-lg">{editCoupon ? 'Sửa mã giảm giá' : 'Tạo mã giảm giá'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              {/* Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã giảm giá</label>
                <div className="flex gap-2">
                  <input type="text" value={formCode} onChange={e => setFormCode(e.target.value.toUpperCase())}
                    placeholder="VD: SALE10" className="flex-1 px-3 py-2 border rounded-lg font-mono uppercase" />
                  <button type="button" onClick={() => setFormCode(generateCode())}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm whitespace-nowrap">Tạo ngẫu nhiên</button>
                </div>
              </div>

              {/* Type + Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Loại giảm</label>
                  <select value={formType} onChange={e => setFormType(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                    {Object.entries(couponTypes).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {formType === 'percentage' ? 'Phần trăm (%)' : formType === 'free_shipping' ? 'Giảm tối đa ship' : 'Số tiền giảm (₫)'}
                  </label>
                  <input type="number" value={formValue} onChange={e => setFormValue(e.target.value)}
                    placeholder={formType === 'percentage' ? '10' : '50000'}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>

              {/* Min order + Max discount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị đơn tối thiểu</label>
                  <input type="number" value={formMinOrder} onChange={e => setFormMinOrder(e.target.value)}
                    placeholder="0 (không giới hạn)" className="w-full px-3 py-2 border rounded-lg" />
                </div>
                {formType === 'percentage' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giảm tối đa (₫)</label>
                    <input type="number" value={formMaxDiscount} onChange={e => setFormMaxDiscount(e.target.value)}
                      placeholder="0 (không giới hạn)" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                )}
              </div>

              {/* Usage limits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tổng lượt sử dụng</label>
                  <input type="number" value={formUsageLimit} onChange={e => setFormUsageLimit(e.target.value)}
                    placeholder="0 (không giới hạn)" className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lượt/khách hàng</label>
                  <input type="number" value={formPerCustomer} onChange={e => setFormPerCustomer(e.target.value)}
                    placeholder="1" className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
                  <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
                  <input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)}
                  rows={2} placeholder="Mô tả chương trình..." className="w-full px-3 py-2 border rounded-lg" />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="couponActive" checked={formIsActive} onChange={e => setFormIsActive(e.target.checked)} className="w-4 h-4 text-green-600 rounded" />
                <label htmlFor="couponActive" className="text-sm font-medium text-gray-700">Kích hoạt mã giảm giá</label>
              </div>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Hủy</button>
              <button onClick={handleSave} disabled={submitting}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {submitting ? 'Đang lưu...' : (editCoupon ? 'Cập nhật' : 'Tạo mã')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

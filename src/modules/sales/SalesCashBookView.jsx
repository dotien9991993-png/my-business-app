import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { getNowISOVN, getTodayVN } from '../../utils/dateUtils';

const CATEGORIES = {
  sales: 'Bán hàng',
  purchase: 'Mua hàng',
  refund: 'Hoàn tiền',
  shipping: 'Vận chuyển',
  salary: 'Lương',
  rent: 'Thuê mặt bằng',
  other: 'Khác',
};

const PAYMENT_METHODS = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  momo: 'MoMo',
  vnpay: 'VNPay',
  card: 'Quẹt thẻ',
};

export default function SalesCashBookView({ tenant, currentUser, hasPermission, getPermissionLevel }) {
  const permLevel = getPermissionLevel('sales');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Create form
  const [formType, setFormType] = useState('receipt');
  const [formCategory, setFormCategory] = useState('other');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMethod, setFormMethod] = useState('cash');

  const loadEntries = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('cash_book_entries')
        .select('*').eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false }).limit(500);
      if (error) { console.warn('cash_book_entries not ready:', error.message); }
      else setEntries(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const filtered = useMemo(() => {
    let result = entries;
    if (filterType !== 'all') result = result.filter(e => e.type === filterType);
    if (filterCategory !== 'all') result = result.filter(e => e.category === filterCategory);
    if (filterMethod !== 'all') result = result.filter(e => e.payment_method === filterMethod);
    if (filterDateFrom) result = result.filter(e => e.created_at >= filterDateFrom);
    if (filterDateTo) result = result.filter(e => e.created_at <= filterDateTo + 'T23:59:59');
    return result;
  }, [entries, filterType, filterCategory, filterMethod, filterDateFrom, filterDateTo]);

  const totals = useMemo(() => {
    const totalReceipt = filtered.filter(e => e.type === 'receipt').reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const totalPayment = filtered.filter(e => e.type === 'payment').reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    return { totalReceipt, totalPayment, balance: totalReceipt - totalPayment };
  }, [filtered]);

  // Running balance (cumulative from oldest to newest)
  const entriesWithBalance = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let running = 0;
    const mapped = sorted.map(e => {
      const amt = parseFloat(e.amount || 0);
      running += e.type === 'receipt' ? amt : -amt;
      return { ...e, runningBalance: running };
    });
    return mapped.reverse(); // newest first for display
  }, [filtered]);

  const handleCreate = async () => {
    if (permLevel < 2) return alert('Bạn không có quyền thực hiện thao tác này');
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) return alert('Vui lòng nhập số tiền hợp lệ');
    if (!formDescription.trim()) return alert('Vui lòng nhập mô tả');
    if (submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('cash_book_entries').insert([{
        tenant_id: tenant.id,
        type: formType,
        category: formCategory,
        amount,
        description: formDescription.trim(),
        payment_method: formMethod,
        created_by: currentUser.name,
        created_at: getNowISOVN()
      }]);
      if (error) throw error;
      setShowCreateModal(false);
      setFormType('receipt'); setFormCategory('other'); setFormAmount(''); setFormDescription(''); setFormMethod('cash');
      await loadEntries();
    } catch (err) { console.error(err); alert('Lỗi: ' + err.message); }
    finally { setSubmitting(false); }
  };

  if (permLevel < 2) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="text-lg font-bold text-red-800">Không có quyền truy cập</h3>
          <p className="text-red-600 text-sm mt-1">Bạn cần quyền cấp 2 trở lên để xem sổ quỹ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-800">Sổ quỹ thu chi</h2>
        <button onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
          + Tạo phiếu thu/chi
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-sm text-green-600 font-medium">Tổng thu</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{formatMoney(totals.totalReceipt)}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-sm text-red-600 font-medium">Tổng chi</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{formatMoney(totals.totalPayment)}</div>
        </div>
        <div className={`border rounded-xl p-4 ${totals.balance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className={`text-sm font-medium ${totals.balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Số dư</div>
          <div className={`text-2xl font-bold mt-1 ${totals.balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatMoney(totals.balance)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="all">Tất cả loại</option>
          <option value="receipt">Thu</option>
          <option value="payment">Chi</option>
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="all">Tất cả danh mục</option>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="all">Tất cả PTTT</option>
          {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm" />
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm" />
        {(filterType !== 'all' || filterCategory !== 'all' || filterMethod !== 'all' || filterDateFrom || filterDateTo) && (
          <button onClick={() => { setFilterType('all'); setFilterCategory('all'); setFilterMethod('all'); setFilterDateFrom(''); setFilterDateTo(''); }}
            className="px-3 py-1.5 bg-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-300">Xoá lọc</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Đang tải...</div>
      ) : entriesWithBalance.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📒</div>
          <p>Chưa có bút toán nào</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="text-left px-4 py-3 font-medium">Ngày</th>
                  <th className="text-left px-4 py-3 font-medium">Loại</th>
                  <th className="text-left px-4 py-3 font-medium">Danh mục</th>
                  <th className="text-left px-4 py-3 font-medium">Mô tả</th>
                  <th className="text-left px-4 py-3 font-medium">PTTT</th>
                  <th className="text-right px-4 py-3 font-medium">Thu</th>
                  <th className="text-right px-4 py-3 font-medium">Chi</th>
                  <th className="text-right px-4 py-3 font-medium">Số dư</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entriesWithBalance.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.type === 'receipt' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {e.type === 'receipt' ? 'Thu' : 'Chi'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{CATEGORIES[e.category] || e.category}</td>
                    <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">{e.description}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{PAYMENT_METHODS[e.payment_method] || e.payment_method}</td>
                    <td className="px-4 py-2.5 text-right text-green-700 font-medium">
                      {e.type === 'receipt' ? formatMoney(e.amount) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-red-700 font-medium">
                      {e.type === 'payment' ? formatMoney(e.amount) : ''}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium ${e.runningBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                      {formatMoney(e.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 text-right">
            Hiển thị {entriesWithBalance.length} bút toán
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-4 border-b bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-xl flex justify-between items-center">
              <h3 className="font-bold text-lg">Tạo phiếu thu/chi</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-4 space-y-4">
              {/* Type */}
              <div className="flex gap-2">
                {[{ key: 'receipt', label: 'Thu', color: 'green' }, { key: 'payment', label: 'Chi', color: 'red' }].map(t => (
                  <button key={t.key} onClick={() => setFormType(t.key)}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-sm border-2 transition ${formType === t.key ? `border-${t.color}-500 bg-${t.color}-50 text-${t.color}-700` : 'border-gray-200 text-gray-500'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Category */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Danh mục</label>
                <select value={formCategory} onChange={e => setFormCategory(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Số tiền (VNĐ)</label>
                <input type="number" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)}
                  placeholder="Nhập số tiền..."
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Mô tả</label>
                <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)}
                  placeholder="Nội dung phiếu thu/chi..."
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>

              {/* Payment method */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Phương thức</label>
                <select value={formMethod} onChange={e => setFormMethod(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-200 rounded-lg text-sm font-medium">Hủy</button>
                <button onClick={handleCreate} disabled={submitting}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white ${submitting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
                  {submitting ? 'Đang lưu...' : 'Tạo phiếu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

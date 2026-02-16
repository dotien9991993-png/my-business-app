import React, { useState, useMemo } from 'react';
import { formatMoney } from '../../utils/formatUtils';
import { getTodayVN, getNowISOVN, getDateStrVN, getVietnamDate } from '../../utils/dateUtils';
import { supabase } from '../../supabaseClient';
import { isAdmin } from '../../utils/permissionUtils';
import { receiptCategories as defaultReceiptCategories } from '../../constants/financeConstants';
import { logActivity } from '../../lib/activityLog';

// Helper tính date range cho preset
const getDateRange = (preset) => {
  const vn = getVietnamDate();
  const y = vn.getFullYear();
  const m = vn.getMonth();
  const d = vn.getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (yr, mo, da) => `${yr}-${pad(mo + 1)}-${pad(da)}`;

  switch (preset) {
    case 'today':
      return { from: fmt(y, m, d), to: fmt(y, m, d) };
    case 'week': {
      const dow = vn.getDay() || 7; // Monday=1
      const mon = new Date(y, m, d - dow + 1);
      return { from: fmt(mon.getFullYear(), mon.getMonth(), mon.getDate()), to: fmt(y, m, d) };
    }
    case 'month':
      return { from: fmt(y, m, 1), to: fmt(y, m, d) };
    case 'lastMonth': {
      const lm = new Date(y, m, 0); // last day of prev month
      return { from: fmt(lm.getFullYear(), lm.getMonth(), 1), to: fmt(lm.getFullYear(), lm.getMonth(), lm.getDate()) };
    }
    case 'quarter': {
      const qStart = Math.floor(m / 3) * 3;
      return { from: fmt(y, qStart, 1), to: fmt(y, m, d) };
    }
    case 'all':
      return { from: '', to: '' };
    default:
      return { from: '', to: '' };
  }
};

export default function ReceiptsView({
  currentUser,
  tenant,
  allUsers,
  receiptsPayments,
  getPermissionLevel,
  canCreateFinance,
  canEditOwnFinance,
  createNotification,
  loadFinanceData,
  receiptCategories: receiptCategoriesProp
}) {
  const receiptCategories = receiptCategoriesProp || defaultReceiptCategories;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCreator, setFilterCreator] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [formType, setFormType] = useState('thu');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDate, setFormDate] = useState(getTodayVN());
  const [formNote, setFormNote] = useState('');

  // Date range filter - mặc định tháng này
  const defaultRange = getDateRange('month');
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [datePreset, setDatePreset] = useState('month');

  const handleDatePreset = (preset) => {
    setDatePreset(preset);
    const range = getDateRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  // Permission check
  const financeLevel = getPermissionLevel('finance');
  const canViewAllReceipts = financeLevel >= 2;

  const creatorsList = canViewAllReceipts
    ? [...new Set(receiptsPayments.map(r => r.created_by).filter(Boolean))].sort()
    : [];

  // Tất cả danh mục (thu + chi) cho filter dropdown
  const allCategories = useMemo(() => {
    return [...new Set([...receiptCategories.thu, ...receiptCategories.chi])].sort();
  }, [receiptCategories]);

  // Pending count
  const pendingCount = useMemo(() => {
    return receiptsPayments.filter(r => r.status === 'pending').length;
  }, [receiptsPayments]);

  const filteredReceipts = useMemo(() => {
    return receiptsPayments.filter(r => {
      if (!canViewAllReceipts && r.created_by !== currentUser.name) return false;
      if (filterType !== 'all' && r.type !== filterType) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterCreator !== 'all' && r.created_by !== filterCreator) return false;
      if (filterCategory !== 'all' && r.category !== filterCategory) return false;
      // Date range filter
      if (dateFrom) {
        const rDate = (r.receipt_date || '').split('T')[0];
        if (rDate < dateFrom) return false;
      }
      if (dateTo) {
        const rDate = (r.receipt_date || '').split('T')[0];
        if (rDate > dateTo) return false;
      }
      if (searchText && !r.description?.toLowerCase().includes(searchText.toLowerCase()) && !r.receipt_number?.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [receiptsPayments, canViewAllReceipts, currentUser.name, filterType, filterStatus, filterCreator, filterCategory, dateFrom, dateTo, searchText]);

  const generateReceiptNumber = (type) => {
    const prefix = type === 'thu' ? 'PT' : 'PC';
    const dateStr = getDateStrVN();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return prefix + '-' + dateStr + '-' + random;
  };

  const resetForm = () => {
    setFormAmount('');
    setFormDescription('');
    setFormCategory('');
    setFormDate(getTodayVN());
    setFormNote('');
  };

  const openDetailModal = (receipt) => {
    setSelectedReceipt(receipt);
    setFormType(receipt.type);
    setFormAmount(receipt.amount.toString());
    setFormDescription(receipt.description || '');
    setFormCategory(receipt.category || '');
    setFormDate(receipt.receipt_date ? receipt.receipt_date.split('T')[0] : getTodayVN());
    setFormNote(receipt.note || '');
    setIsEditing(false);
    setShowDetailModal(true);
  };

  const handleCreateReceipt = async () => {
    if (!formAmount || !formDescription || !formCategory) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
      return;
    }
    const newReceipt = {
      tenant_id: tenant.id,
      receipt_number: generateReceiptNumber(formType),
      type: formType,
      amount: parseFloat(formAmount),
      description: formDescription,
      category: formCategory,
      receipt_date: formDate,
      note: formNote,
      status: 'pending',
      created_by: currentUser.name,
      created_at: getNowISOVN()
    };
    try {
      const { data, error } = await supabase.from('receipts_payments').insert([newReceipt]).select().single();
      if (error) throw error;

      const admins = (allUsers || []).filter(u =>
        isAdmin(u) || u.role === 'Manager'
      );
      for (const admin of admins) {
        if (admin.id !== currentUser.id) {
          await createNotification({
            userId: admin.id,
            type: 'finance_pending',
            title: formType === 'thu' ? '💵 Phiếu thu chờ duyệt' : '💸 Phiếu chi chờ duyệt',
            message: `${currentUser.name} tạo phiếu ${formType}: ${formatMoney(parseFloat(formAmount))} - ${formDescription}`,
            icon: formType === 'thu' ? '💵' : '💸',
            referenceType: 'receipt',
            referenceId: data?.id || null,
            data: { amount: parseFloat(formAmount), type: formType }
          });
        }
      }

      alert('Tạo phiếu thành công!');
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'finance', action: 'create', entityType: 'receipt', entityId: data?.receipt_number || newReceipt.receipt_number, entityName: newReceipt.receipt_number, description: (formType === 'thu' ? 'Tạo phiếu thu ' : 'Tạo phiếu chi ') + newReceipt.receipt_number + ': ' + formatMoney(parseFloat(formAmount)) + ' - ' + formDescription });
      setShowCreateModal(false);
      resetForm();
      loadFinanceData();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const handleUpdateReceipt = async () => {
    if (!formAmount || !formDescription || !formCategory) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
      return;
    }
    try {
      const updatedFields = {
        amount: parseFloat(formAmount),
        description: formDescription,
        category: formCategory,
        receipt_date: formDate,
        note: formNote
      };
      const { error } = await supabase.from('receipts_payments').update(updatedFields).eq('id', selectedReceipt.id);
      if (error) throw error;
      alert('Cập nhật thành công!');
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'finance', action: 'update', entityType: 'receipt', entityId: selectedReceipt.receipt_number, entityName: selectedReceipt.receipt_number, oldData: { amount: selectedReceipt.amount, description: selectedReceipt.description, category: selectedReceipt.category }, newData: updatedFields, description: 'Cập nhật phiếu ' + selectedReceipt.receipt_number + ': ' + formatMoney(parseFloat(formAmount)) });
      setIsEditing(false);
      setShowDetailModal(false);
      loadFinanceData();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const handleApprove = async (id) => {
    try {
      const receipt = selectedReceipt || receiptsPayments.find(r => r.id === id);

      const { error } = await supabase.from('receipts_payments').update({
        status: 'approved',
        approved_by: currentUser.name,
        approved_at: getNowISOVN()
      }).eq('id', id);
      if (error) throw error;

      if (receipt) {
        const creator = allUsers.find(u => u.name === receipt.created_by);
        if (creator && creator.id !== currentUser.id) {
          await createNotification({
            userId: creator.id,
            type: 'finance_approved',
            title: '✅ Phiếu đã được duyệt',
            message: `Phiếu ${receipt.type} ${receipt.receipt_number}: ${formatMoney(receipt.amount)} đã được ${currentUser.name} duyệt`,
            icon: '✅',
            referenceType: 'receipt',
            referenceId: id
          });
        }
      }

      alert('Đã duyệt!');
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'finance', action: 'update', entityType: 'receipt', entityId: receipt?.receipt_number || id, entityName: receipt?.receipt_number || '', description: 'Duyệt phiếu ' + (receipt?.receipt_number || id) + (receipt ? ': ' + formatMoney(receipt.amount) : '') });
      setShowDetailModal(false);
      loadFinanceData();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const handleReject = async (id) => {
    try {
      const receipt = selectedReceipt || receiptsPayments.find(r => r.id === id);

      const { error } = await supabase.from('receipts_payments').update({
        status: 'rejected',
        approved_by: currentUser.name,
        approved_at: getNowISOVN()
      }).eq('id', id);
      if (error) throw error;

      if (receipt) {
        const creator = allUsers.find(u => u.name === receipt.created_by);
        if (creator && creator.id !== currentUser.id) {
          await createNotification({
            userId: creator.id,
            type: 'finance_rejected',
            title: '❌ Phiếu bị từ chối',
            message: `Phiếu ${receipt.type} ${receipt.receipt_number}: ${formatMoney(receipt.amount)} đã bị ${currentUser.name} từ chối`,
            icon: '❌',
            referenceType: 'receipt',
            referenceId: id
          });
        }
      }

      alert('Đã từ chối!');
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'finance', action: 'update', entityType: 'receipt', entityId: receipt?.receipt_number || id, entityName: receipt?.receipt_number || '', description: 'Từ chối phiếu ' + (receipt?.receipt_number || id) + (receipt ? ': ' + formatMoney(receipt.amount) : '') });
      setShowDetailModal(false);
      loadFinanceData();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa phiếu này?')) return;
    try {
      const deletedReceipt = selectedReceipt || receiptsPayments.find(r => r.id === id);
      const { error } = await supabase.from('receipts_payments').delete().eq('id', id);
      if (error) throw error;
      alert('Đã xóa!');
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'finance', action: 'delete', entityType: 'receipt', entityId: deletedReceipt?.receipt_number || id, entityName: deletedReceipt?.receipt_number || '', oldData: deletedReceipt ? { receipt_number: deletedReceipt.receipt_number, type: deletedReceipt.type, amount: deletedReceipt.amount, description: deletedReceipt.description } : null, description: 'Xóa phiếu ' + (deletedReceipt?.receipt_number || id) + (deletedReceipt ? ': ' + formatMoney(deletedReceipt.amount) : '') });
      setShowDetailModal(false);
      loadFinanceData();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const canApprove = isAdmin(currentUser) || (currentUser.permissions?.finance || 0) >= 3;
  const totalThu = filteredReceipts.filter(r => r.type === 'thu' && r.status === 'approved').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
  const totalChi = filteredReceipts.filter(r => r.type === 'chi' && r.status === 'approved').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

  const datePresets = [
    { id: 'today', label: 'Hôm nay' },
    { id: 'week', label: 'Tuần này' },
    { id: 'month', label: 'Tháng này' },
    { id: 'lastMonth', label: 'Tháng trước' },
    { id: 'quarter', label: 'Quý này' },
    { id: 'all', label: 'Tất cả' },
  ];

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl md:text-2xl font-bold">🧾 Phiếu Thu/Chi</h2>
          {pendingCount > 0 && canApprove && (
            <button
              onClick={() => { setFilterStatus('pending'); setDatePreset('all'); setDateFrom(''); setDateTo(''); }}
              className="px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse"
            >
              {pendingCount} chờ duyệt
            </button>
          )}
        </div>
        {canCreateFinance() && (
          <div className="flex gap-2">
            <button onClick={() => { setFormType('thu'); resetForm(); setShowCreateModal(true); }} className="px-3 md:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm">
              + Thu
            </button>
            <button onClick={() => { setFormType('chi'); resetForm(); setShowCreateModal(true); }} className="px-3 md:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm">
              + Chi
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 md:p-4">
          <div className="text-xs md:text-sm text-green-600 font-medium">Tổng Thu</div>
          <div className="text-lg md:text-2xl font-bold text-green-700">+{formatMoney(totalThu)}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 md:p-4">
          <div className="text-xs md:text-sm text-red-600 font-medium">Tổng Chi</div>
          <div className="text-lg md:text-2xl font-bold text-red-700">-{formatMoney(totalChi)}</div>
        </div>
        <div className={(totalThu - totalChi >= 0) ? "bg-blue-50 border border-blue-200 rounded-xl p-3 md:p-4" : "bg-orange-50 border border-orange-200 rounded-xl p-3 md:p-4"}>
          <div className={(totalThu - totalChi >= 0) ? "text-xs md:text-sm text-blue-600 font-medium" : "text-xs md:text-sm text-orange-600 font-medium"}>Chênh lệch</div>
          <div className={(totalThu - totalChi >= 0) ? "text-lg md:text-2xl font-bold text-blue-700" : "text-lg md:text-2xl font-bold text-orange-700"}>{formatMoney(totalThu - totalChi)}</div>
        </div>
      </div>

      {/* Date range presets */}
      <div className="flex flex-wrap gap-1.5 md:gap-2">
        {datePresets.map(p => (
          <button
            key={p.id}
            onClick={() => handleDatePreset(p.id)}
            className={`px-2.5 md:px-3 py-1 md:py-1.5 rounded-full text-xs md:text-sm font-medium transition-colors ${
              datePreset === p.id
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-3 md:p-4">
        <div className="flex flex-wrap gap-2 md:gap-3">
          {/* Date range */}
          <div className="flex items-end gap-1.5">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset('custom'); }} className="px-2 py-1.5 border rounded-lg text-sm w-[130px]" />
            </div>
            <span className="pb-2 text-gray-400 text-sm">-</span>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset('custom'); }} className="px-2 py-1.5 border rounded-lg text-sm w-[130px]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Loại</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm">
              <option value="all">Tất cả</option>
              <option value="thu">Thu</option>
              <option value="chi">Chi</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Trạng thái</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm">
              <option value="all">Tất cả</option>
              <option value="pending">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Từ chối</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Danh mục</label>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm">
              <option value="all">Tất cả</option>
              {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          {canViewAllReceipts && creatorsList.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Người tạo</label>
              <select value={filterCreator} onChange={(e) => setFilterCreator(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm">
                <option value="all">Tất cả ({creatorsList.length})</option>
                {creatorsList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Tìm kiếm</label>
            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Mô tả, mã phiếu..." className="w-full px-2 py-1.5 border rounded-lg text-sm" />
          </div>
        </div>
        {/* Result count */}
        <div className="mt-2 text-xs text-gray-500">
          {filteredReceipts.length} phiếu {datePreset !== 'all' && dateFrom && `(${new Date(dateFrom).toLocaleDateString('vi-VN')} - ${dateTo ? new Date(dateTo).toLocaleDateString('vi-VN') : 'nay'})`}
        </div>
      </div>

      {/* Receipt lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b bg-green-50">
            <h3 className="font-bold text-green-700">💵 Phiếu Thu ({filteredReceipts.filter(r => r.type === 'thu').length})</h3>
          </div>
          {filteredReceipts.filter(r => r.type === 'thu').length === 0 ? (
            <div className="p-6 text-center text-gray-500">Chưa có phiếu thu</div>
          ) : (
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {filteredReceipts.filter(r => r.type === 'thu').sort((a, b) => new Date(b.created_at || b.receipt_date) - new Date(a.created_at || a.receipt_date)).map(receipt => (
                <div key={receipt.id} onClick={() => openDetailModal(receipt)} className="p-4 hover:bg-gray-50 cursor-pointer">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-sm">{receipt.receipt_number}</span>
                        <span className={receipt.status === 'approved' ? "px-2 py-0.5 rounded text-xs bg-green-100 text-green-700" : receipt.status === 'rejected' ? "px-2 py-0.5 rounded text-xs bg-red-100 text-red-700" : "px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700"}>
                          {receipt.status === 'approved' ? '✓ Duyệt' : receipt.status === 'rejected' ? '✗ Từ chối' : '⏳ Chờ'}
                        </span>
                      </div>
                      <div className="text-gray-700 text-sm truncate">{receipt.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(receipt.receipt_date).toLocaleDateString('vi-VN')}
                        {receipt.category && <span> • {receipt.category}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600">+{parseFloat(receipt.amount).toLocaleString('vi-VN')}đ</div>
                      <div className="text-xs text-gray-500">{receipt.created_by}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b bg-red-50">
            <h3 className="font-bold text-red-700">💸 Phiếu Chi ({filteredReceipts.filter(r => r.type === 'chi').length})</h3>
          </div>
          {filteredReceipts.filter(r => r.type === 'chi').length === 0 ? (
            <div className="p-6 text-center text-gray-500">Chưa có phiếu chi</div>
          ) : (
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {filteredReceipts.filter(r => r.type === 'chi').sort((a, b) => new Date(b.created_at || b.receipt_date) - new Date(a.created_at || a.receipt_date)).map(receipt => (
                <div key={receipt.id} onClick={() => openDetailModal(receipt)} className="p-4 hover:bg-gray-50 cursor-pointer">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-sm">{receipt.receipt_number}</span>
                        <span className={receipt.status === 'approved' ? "px-2 py-0.5 rounded text-xs bg-green-100 text-green-700" : receipt.status === 'rejected' ? "px-2 py-0.5 rounded text-xs bg-red-100 text-red-700" : "px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700"}>
                          {receipt.status === 'approved' ? '✓ Duyệt' : receipt.status === 'rejected' ? '✗ Từ chối' : '⏳ Chờ'}
                        </span>
                      </div>
                      <div className="text-gray-700 text-sm truncate">{receipt.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(receipt.receipt_date).toLocaleDateString('vi-VN')}
                        {receipt.category && <span> • {receipt.category}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-red-600">-{parseFloat(receipt.amount).toLocaleString('vi-VN')}đ</div>
                      <div className="text-xs text-gray-500">{receipt.created_by}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className={formType === 'thu' ? "p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "p-6 border-b bg-gradient-to-r from-red-500 to-rose-600 text-white"}>
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">{formType === 'thu' ? '💵 Tạo Phiếu Thu' : '💸 Tạo Phiếu Chi'}</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Loại phiếu</label>
                <div className="flex gap-2">
                  <button onClick={() => { setFormType('thu'); setFormCategory(''); }} className={formType === 'thu' ? "flex-1 py-3 rounded-lg font-medium bg-green-600 text-white" : "flex-1 py-3 rounded-lg font-medium bg-gray-100"}>💵 Phiếu Thu</button>
                  <button onClick={() => { setFormType('chi'); setFormCategory(''); }} className={formType === 'chi' ? "flex-1 py-3 rounded-lg font-medium bg-red-600 text-white" : "flex-1 py-3 rounded-lg font-medium bg-gray-100"}>💸 Phiếu Chi</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Số tiền (VNĐ) *</label>
                <input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="Nhập số tiền..." className="w-full px-4 py-3 border-2 rounded-lg text-lg" />
                {formAmount && <div className="text-sm text-gray-500 mt-1">= {parseFloat(formAmount).toLocaleString('vi-VN')} VNĐ</div>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Danh mục *</label>
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg">
                  <option value="">-- Chọn danh mục --</option>
                  {receiptCategories[formType].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mô tả *</label>
                <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="VD: Thu tiền lắp đặt dàn karaoke" className="w-full px-4 py-3 border-2 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Ngày</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Ghi chú</label>
                <textarea value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Ghi chú thêm..." rows={2} className="w-full px-4 py-3 border-2 rounded-lg"></textarea>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
              <button onClick={handleCreateReceipt} className={formType === 'thu' ? "flex-1 px-6 py-3 text-white rounded-lg font-medium bg-green-600 hover:bg-green-700" : "flex-1 px-6 py-3 text-white rounded-lg font-medium bg-red-600 hover:bg-red-700"}>Tạo Phiếu</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className={selectedReceipt.type === 'thu' ? "p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "p-6 border-b bg-gradient-to-r from-red-500 to-rose-600 text-white"}>
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">{selectedReceipt.type === 'thu' ? '💵 Phiếu Thu' : '💸 Phiếu Chi'}</h2>
                  <p className="text-white/80 mt-1">{selectedReceipt.receipt_number}</p>
                </div>
                <button onClick={() => { setShowDetailModal(false); setIsEditing(false); }} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
              </div>
            </div>

            {isEditing ? (
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Số tiền (VNĐ) *</label>
                  <input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg text-lg" />
                  {formAmount && <div className="text-sm text-gray-500 mt-1">= {parseFloat(formAmount).toLocaleString('vi-VN')} VNĐ</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Danh mục *</label>
                  <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg">
                    <option value="">-- Chọn danh mục --</option>
                    {receiptCategories[selectedReceipt.type].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Mô tả *</label>
                  <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Ngày</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Ghi chú</label>
                  <textarea value={formNote} onChange={(e) => setFormNote(e.target.value)} rows={2} className="w-full px-4 py-3 border-2 rounded-lg"></textarea>
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setIsEditing(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
                  <button onClick={handleUpdateReceipt} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Lưu</button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Số tiền</span>
                  <span className={selectedReceipt.type === 'thu' ? "text-2xl font-bold text-green-600" : "text-2xl font-bold text-red-600"}>
                    {selectedReceipt.type === 'thu' ? '+' : '-'}{parseFloat(selectedReceipt.amount).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Danh mục</div>
                    <div className="font-medium">{selectedReceipt.category || 'Chưa phân loại'}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Ngày</div>
                    <div className="font-medium">{new Date(selectedReceipt.receipt_date).toLocaleDateString('vi-VN')}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Trạng thái</div>
                    <div className={selectedReceipt.status === 'approved' ? "font-medium text-green-600" : selectedReceipt.status === 'rejected' ? "font-medium text-red-600" : "font-medium text-yellow-600"}>
                      {selectedReceipt.status === 'approved' ? '✓ Đã duyệt' : selectedReceipt.status === 'rejected' ? '✗ Từ chối' : '⏳ Chờ duyệt'}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Người tạo</div>
                    <div className="font-medium">{selectedReceipt.created_by || 'N/A'}</div>
                    {selectedReceipt.created_at && <div className="text-xs text-gray-500 mt-1">Lúc: {new Date(selectedReceipt.created_at).toLocaleString('vi-VN')}</div>}
                  </div>
                </div>
                {selectedReceipt.approved_by && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-xs text-blue-600 mb-1">{selectedReceipt.status === 'approved' ? '✓ Người duyệt' : '✗ Người từ chối'}</div>
                    <div className="font-medium text-blue-800">{selectedReceipt.approved_by}</div>
                    {selectedReceipt.approved_at && <div className="text-xs text-blue-600 mt-1">Lúc: {new Date(selectedReceipt.approved_at).toLocaleString('vi-VN')}</div>}
                  </div>
                )}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Mô tả</div>
                  <div className="font-medium">{selectedReceipt.description}</div>
                </div>
                {selectedReceipt.note && (
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="text-xs text-yellow-600 mb-1">Ghi chú</div>
                    <div className="text-yellow-800">{selectedReceipt.note}</div>
                  </div>
                )}
                {selectedReceipt.status === 'approved' && !isAdmin(currentUser) && (
                  <div className="p-3 bg-gray-100 rounded-lg text-center">
                    <span className="text-gray-500 text-sm">Phiếu đã duyệt - Không thể chỉnh sửa</span>
                  </div>
                )}
                <div className="space-y-3 pt-4">
                  {selectedReceipt.status === 'pending' && canApprove && (
                    <div className="flex gap-3">
                      <button onClick={() => handleApprove(selectedReceipt.id)} className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">✓ Duyệt</button>
                      <button onClick={() => handleReject(selectedReceipt.id)} className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium">✗ Từ chối</button>
                    </div>
                  )}
                  <div className="flex gap-3">
                    {selectedReceipt.status === 'pending' && canEditOwnFinance(selectedReceipt.created_by) && (
                      <button onClick={() => setIsEditing(true)} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Sửa</button>
                    )}
                    <button onClick={() => setShowDetailModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
                    {(isAdmin(currentUser) || (selectedReceipt.status === 'pending' && canEditOwnFinance(selectedReceipt.created_by))) && (
                      <div className="relative">
                        <button
                          onClick={() => setShowMoreMenu(!showMoreMenu)}
                          className="px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                        >
                          ⋮
                        </button>
                        {showMoreMenu && (
                          <div className="absolute bottom-full right-0 mb-2 bg-white border rounded-lg shadow-lg py-1 min-w-[120px] z-10">
                            <button
                              onClick={() => {
                                if (window.confirm('Bạn có chắc muốn xóa phiếu này?')) {
                                  handleDelete(selectedReceipt.id);
                                  setShowMoreMenu(false);
                                }
                              }}
                              className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              Xóa phiếu
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { formatMoney } from '../../utils/formatUtils';
import { getTodayVN, getNowISOVN, getDateStrVN } from '../../utils/dateUtils';
import { supabase } from '../../supabaseClient';

export default function DebtsView({
  currentUser,
  tenant,
  debts,
  getPermissionLevel,
  canCreateFinance,
  canEditOwnFinance,
  loadFinanceData
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchText, setSearchText] = useState('');

  const [formType, setFormType] = useState('receivable');
  const [formPartnerName, setFormPartnerName] = useState('');
  const [formPartnerPhone, setFormPartnerPhone] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formNote, setFormNote] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  // Permission check for debts
  const financeLevel = getPermissionLevel('finance');
  const canViewAllDebts = financeLevel >= 2; // Level 2+ xem tất cả

  const filteredDebts = debts.filter(d => {
    // Level 1: chỉ xem công nợ mình tạo
    if (!canViewAllDebts && d.created_by !== currentUser.name) return false;
    if (filterType !== 'all' && d.type !== filterType) return false;
    if (filterStatus === 'pending' && d.status === 'paid') return false;
    if (filterStatus === 'paid' && d.status !== 'paid') return false;
    if (filterStatus === 'overdue') {
      const isOverdue = d.due_date && new Date(d.due_date) < new Date() && d.status !== 'paid';
      if (!isOverdue) return false;
    }
    if (searchText && !d.partner_name?.toLowerCase().includes(searchText.toLowerCase()) && !d.debt_number?.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const receivables = filteredDebts.filter(d => d.type === 'receivable');
  const payables = filteredDebts.filter(d => d.type === 'payable');

  const totalReceivable = receivables.reduce((sum, d) => sum + parseFloat(d.remaining_amount || 0), 0);
  const totalPayable = payables.reduce((sum, d) => sum + parseFloat(d.remaining_amount || 0), 0);

  const generateDebtNumber = (type) => {
    const prefix = type === 'receivable' ? 'PT' : 'PTR';
    const dateStr = getDateStrVN();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return prefix + '-' + dateStr + '-' + random;
  };

  const resetForm = () => {
    setFormPartnerName('');
    setFormPartnerPhone('');
    setFormAmount('');
    setFormDescription('');
    setFormDueDate('');
    setFormNote('');
  };

  const isOverdue = (debt) => {
    return debt.due_date && new Date(debt.due_date) < new Date() && debt.status !== 'paid';
  };

  const handleCreateDebt = async () => {
    if (!formPartnerName || !formAmount || !formDescription) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
      return;
    }
    const newDebt = {
      tenant_id: tenant.id,
      debt_number: generateDebtNumber(formType),
      type: formType,
      partner_name: formPartnerName,
      partner_phone: formPartnerPhone,
      total_amount: parseFloat(formAmount),
      remaining_amount: parseFloat(formAmount),
      paid_amount: 0,
      description: formDescription,
      due_date: formDueDate || null,
      note: formNote,
      status: 'pending',
      created_by: currentUser.name,
      created_at: getNowISOVN(),
      payments: []
    };
    try {
      const { error } = await supabase.from('debts').insert([newDebt]);
      if (error) throw error;
      alert('Tạo công nợ thành công!');
      setShowCreateModal(false);
      resetForm();
      loadFinanceData();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const handleAddPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      alert('Vui lòng nhập số tiền thanh toán!');
      return;
    }
    const amount = parseFloat(paymentAmount);
    if (amount > parseFloat(selectedDebt.remaining_amount)) {
      alert('Số tiền thanh toán không được lớn hơn số tiền còn nợ!');
      return;
    }

    const newPaidAmount = parseFloat(selectedDebt.paid_amount || 0) + amount;
    const newRemainingAmount = parseFloat(selectedDebt.total_amount) - newPaidAmount;
    const newStatus = newRemainingAmount <= 0 ? 'paid' : 'pending';

    const newPayment = {
      amount: amount,
      date: getNowISOVN(),
      note: paymentNote,
      recorded_by: currentUser.name
    };
    const updatedPayments = [...(selectedDebt.payments || []), newPayment];

    try {
      // Cập nhật công nợ
      const { error } = await supabase.from('debts').update({
        paid_amount: newPaidAmount,
        remaining_amount: newRemainingAmount,
        status: newStatus,
        payments: updatedPayments
      }).eq('id', selectedDebt.id);
      if (error) throw error;

      // Tự động tạo phiếu thu/chi
      const receiptType = selectedDebt.type === 'receivable' ? 'thu' : 'chi';
      const receiptPrefix = receiptType === 'thu' ? 'PT' : 'PC';
      const dateStr = getNowISOVN().slice(0,10).replace(/-/g, '');
      const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const receiptNumber = receiptPrefix + '-' + dateStr + '-' + randomNum;

      const newReceipt = {
        tenant_id: tenant.id,
        receipt_number: receiptNumber,
        type: receiptType,
        amount: amount,
        description: (receiptType === 'thu' ? 'Thu nợ từ ' : 'Trả nợ cho ') + selectedDebt.partner_name,
        category: receiptType === 'thu' ? 'Thu nợ khách' : 'Trả nợ NCC',
        receipt_date: getTodayVN(),
        note: 'Thanh toán công nợ ' + selectedDebt.debt_number + (paymentNote ? ' - ' + paymentNote : ''),
        status: 'approved',
        created_by: currentUser.name,
        approved_by: currentUser.name,
        approved_at: getNowISOVN()
      };

      await supabase.from('receipts_payments').insert([newReceipt]);

      alert('Ghi nhận thanh toán thành công! Đã tạo phiếu ' + (receiptType === 'thu' ? 'thu' : 'chi') + ' tự động.');
      setShowPaymentModal(false);
      setShowDetailModal(false);
      setPaymentAmount('');
      setPaymentNote('');
      loadFinanceData();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const handleDeleteDebt = async (id) => {
    if (!window.confirm('Xóa công nợ này?')) return;
    try {
      const { error } = await supabase.from('debts').delete().eq('id', id);
      if (error) throw error;
      alert('Đã xóa!');
      setShowDetailModal(false);
      loadFinanceData();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const openDetailModal = (debt) => {
    setSelectedDebt(debt);
    setShowDetailModal(true);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold">📋 Quản Lý Công Nợ</h2>
        {canCreateFinance() && (
          <div className="flex gap-2">
            <button onClick={() => { setFormType('receivable'); resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
              ➕ Phải Thu
            </button>
            <button onClick={() => { setFormType('payable'); resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
              ➕ Phải Trả
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-sm text-green-600 font-medium">Tổng Phải Thu</div>
          <div className="text-2xl font-bold text-green-700">+{formatMoney(totalReceivable)}</div>
          <div className="text-xs text-green-600 mt-1">{receivables.length} khoản</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-sm text-red-600 font-medium">Tổng Phải Trả</div>
          <div className="text-2xl font-bold text-red-700">-{formatMoney(totalPayable)}</div>
          <div className="text-xs text-red-600 mt-1">{payables.length} khoản</div>
        </div>
        <div className={(totalReceivable - totalPayable >= 0) ? "bg-blue-50 border border-blue-200 rounded-xl p-4" : "bg-orange-50 border border-orange-200 rounded-xl p-4"}>
          <div className={(totalReceivable - totalPayable >= 0) ? "text-sm text-blue-600 font-medium" : "text-sm text-orange-600 font-medium"}>Chênh lệch</div>
          <div className={(totalReceivable - totalPayable >= 0) ? "text-2xl font-bold text-blue-700" : "text-2xl font-bold text-orange-700"}>{formatMoney(totalReceivable - totalPayable)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Loại</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 border rounded-lg">
              <option value="all">Tất cả</option>
              <option value="receivable">Phải Thu</option>
              <option value="payable">Phải Trả</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Trạng thái</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg">
              <option value="all">Tất cả</option>
              <option value="pending">Còn nợ</option>
              <option value="paid">Đã thanh toán</option>
              <option value="overdue">Quá hạn</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium mb-1">Tìm kiếm</label>
            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Tìm theo tên, mã..." className="w-full px-3 py-2 border rounded-lg" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b bg-green-50">
            <h3 className="font-bold text-green-700">💵 Phải Thu ({receivables.length})</h3>
          </div>
          {receivables.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Không có công nợ phải thu</div>
          ) : (
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {receivables.map(debt => (
                <div key={debt.id} onClick={() => openDetailModal(debt)} className="p-4 hover:bg-gray-50 cursor-pointer">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{debt.partner_name}</div>
                      <div className="text-sm text-gray-500">{debt.debt_number}</div>
                      {debt.due_date && (
                        <div className={isOverdue(debt) ? "text-xs text-red-600 mt-1" : "text-xs text-gray-500 mt-1"}>
                          {isOverdue(debt) ? '⚠️ Quá hạn: ' : '📅 Hạn: '}{new Date(debt.due_date).toLocaleDateString('vi-VN')}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600">{parseFloat(debt.remaining_amount).toLocaleString('vi-VN')}đ</div>
                      {debt.status === 'paid' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Đã TT</span>}
                      {isOverdue(debt) && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Quá hạn</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b bg-red-50">
            <h3 className="font-bold text-red-700">💳 Phải Trả ({payables.length})</h3>
          </div>
          {payables.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Không có công nợ phải trả</div>
          ) : (
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {payables.map(debt => (
                <div key={debt.id} onClick={() => openDetailModal(debt)} className="p-4 hover:bg-gray-50 cursor-pointer">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{debt.partner_name}</div>
                      <div className="text-sm text-gray-500">{debt.debt_number}</div>
                      {debt.due_date && (
                        <div className={isOverdue(debt) ? "text-xs text-red-600 mt-1" : "text-xs text-gray-500 mt-1"}>
                          {isOverdue(debt) ? '⚠️ Quá hạn: ' : '📅 Hạn: '}{new Date(debt.due_date).toLocaleDateString('vi-VN')}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-red-600">{parseFloat(debt.remaining_amount).toLocaleString('vi-VN')}đ</div>
                      {debt.status === 'paid' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Đã TT</span>}
                      {isOverdue(debt) && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Quá hạn</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className={formType === 'receivable' ? "p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "p-6 border-b bg-gradient-to-r from-red-500 to-rose-600 text-white"}>
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">{formType === 'receivable' ? '💵 Tạo Công Nợ Phải Thu' : '💳 Tạo Công Nợ Phải Trả'}</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Loại công nợ</label>
                <div className="flex gap-2">
                  <button onClick={() => setFormType('receivable')} className={formType === 'receivable' ? "flex-1 py-3 rounded-lg font-medium bg-green-600 text-white" : "flex-1 py-3 rounded-lg font-medium bg-gray-100"}>💵 Phải Thu</button>
                  <button onClick={() => setFormType('payable')} className={formType === 'payable' ? "flex-1 py-3 rounded-lg font-medium bg-red-600 text-white" : "flex-1 py-3 rounded-lg font-medium bg-gray-100"}>💳 Phải Trả</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{formType === 'receivable' ? 'Tên khách hàng *' : 'Tên nhà cung cấp *'}</label>
                <input type="text" value={formPartnerName} onChange={(e) => setFormPartnerName(e.target.value)} placeholder="Nhập tên..." className="w-full px-4 py-3 border-2 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Số điện thoại</label>
                <input type="text" value={formPartnerPhone} onChange={(e) => setFormPartnerPhone(e.target.value)} placeholder="Nhập SĐT..." className="w-full px-4 py-3 border-2 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Số tiền nợ (VNĐ) *</label>
                <input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="Nhập số tiền..." className="w-full px-4 py-3 border-2 rounded-lg text-lg" />
                {formAmount && <div className="text-sm text-gray-500 mt-1">= {parseFloat(formAmount).toLocaleString('vi-VN')} VNĐ</div>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mô tả *</label>
                <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="VD: Nợ tiền mua hàng đợt 1" className="w-full px-4 py-3 border-2 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Hạn thanh toán</label>
                <input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Ghi chú</label>
                <textarea value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Ghi chú thêm..." rows={2} className="w-full px-4 py-3 border-2 rounded-lg"></textarea>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
              <button onClick={handleCreateDebt} className={formType === 'receivable' ? "flex-1 px-6 py-3 text-white rounded-lg font-medium bg-green-600 hover:bg-green-700" : "flex-1 px-6 py-3 text-white rounded-lg font-medium bg-red-600 hover:bg-red-700"}>✅ Tạo Công Nợ</button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && selectedDebt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className={selectedDebt.type === 'receivable' ? "p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "p-6 border-b bg-gradient-to-r from-red-500 to-rose-600 text-white"}>
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">{selectedDebt.type === 'receivable' ? '💵 Phải Thu' : '💳 Phải Trả'}</h2>
                  <p className="text-white/80 mt-1">{selectedDebt.debt_number}</p>
                </div>
                <button onClick={() => setShowDetailModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Còn nợ</span>
                <span className={selectedDebt.type === 'receivable' ? "text-2xl font-bold text-green-600" : "text-2xl font-bold text-red-600"}>
                  {parseFloat(selectedDebt.remaining_amount).toLocaleString('vi-VN')}đ
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">{selectedDebt.type === 'receivable' ? 'Khách hàng' : 'Nhà cung cấp'}</div>
                  <div className="font-medium">{selectedDebt.partner_name}</div>
                  {selectedDebt.partner_phone && <div className="text-sm text-gray-500">{selectedDebt.partner_phone}</div>}
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Tổng nợ ban đầu</div>
                  <div className="font-medium">{parseFloat(selectedDebt.total_amount).toLocaleString('vi-VN')}đ</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Đã thanh toán</div>
                  <div className="font-medium text-blue-600">{parseFloat(selectedDebt.paid_amount || 0).toLocaleString('vi-VN')}đ</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Trạng thái</div>
                  <div className={selectedDebt.status === 'paid' ? "font-medium text-green-600" : isOverdue(selectedDebt) ? "font-medium text-red-600" : "font-medium text-yellow-600"}>
                    {selectedDebt.status === 'paid' ? '✅ Đã thanh toán' : isOverdue(selectedDebt) ? '⚠️ Quá hạn' : '⏳ Còn nợ'}
                  </div>
                </div>
              </div>
              {selectedDebt.due_date && (
                <div className={isOverdue(selectedDebt) ? "p-3 bg-red-50 rounded-lg border border-red-200" : "p-3 bg-gray-50 rounded-lg"}>
                  <div className={isOverdue(selectedDebt) ? "text-xs text-red-600 mb-1" : "text-xs text-gray-500 mb-1"}>Hạn thanh toán</div>
                  <div className={isOverdue(selectedDebt) ? "font-medium text-red-700" : "font-medium"}>{new Date(selectedDebt.due_date).toLocaleDateString('vi-VN')}</div>
                </div>
              )}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Mô tả</div>
                <div className="font-medium">{selectedDebt.description}</div>
              </div>
              {selectedDebt.note && (
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="text-xs text-yellow-600 mb-1">Ghi chú</div>
                  <div className="text-yellow-800">{selectedDebt.note}</div>
                </div>
              )}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Người tạo</div>
                <div className="font-medium">{selectedDebt.created_by || 'N/A'}</div>
                {selectedDebt.created_at && <div className="text-xs text-gray-500 mt-1">Lúc: {new Date(selectedDebt.created_at).toLocaleString('vi-VN')}</div>}
              </div>
              {selectedDebt.payments && selectedDebt.payments.length > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-xs text-blue-600 mb-2">Lịch sử thanh toán</div>
                  <div className="space-y-2">
                    {selectedDebt.payments.map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm border-b border-blue-100 pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="text-gray-600">{new Date(p.date).toLocaleDateString('vi-VN')}</div>
                          {p.recorded_by && <div className="text-xs text-gray-500">bởi {p.recorded_by}</div>}
                        </div>
                        <span className="font-medium text-blue-700">+{parseFloat(p.amount).toLocaleString('vi-VN')}đ</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-3 pt-4">
                {selectedDebt.status !== 'paid' && canCreateFinance() && (
                  <button onClick={() => setShowPaymentModal(true)} className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">💵 Ghi nhận thanh toán</button>
                )}
                <div className="flex gap-3">
                  {canEditOwnFinance(selectedDebt.created_by) && selectedDebt.status !== 'paid' && (
                    <button onClick={() => handleDeleteDebt(selectedDebt.id)} className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">🗑️ Xóa</button>
                  )}
                  <button onClick={() => setShowDetailModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && selectedDebt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">💵 Ghi nhận thanh toán</h2>
                <button onClick={() => setShowPaymentModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-500">Còn nợ</div>
                <div className="text-xl font-bold text-red-600">{parseFloat(selectedDebt.remaining_amount).toLocaleString('vi-VN')}đ</div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Số tiền thanh toán (VNĐ) *</label>
                <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Nhập số tiền..." className="w-full px-4 py-3 border-2 rounded-lg text-lg" max={selectedDebt.remaining_amount} />
                {paymentAmount && <div className="text-sm text-gray-500 mt-1">= {parseFloat(paymentAmount).toLocaleString('vi-VN')} VNĐ</div>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Ghi chú</label>
                <input type="text" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="VD: Thanh toán đợt 1" className="w-full px-4 py-3 border-2 rounded-lg" />
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3">
              <button onClick={() => setShowPaymentModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
              <button onClick={handleAddPayment} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">✅ Xác nhận</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

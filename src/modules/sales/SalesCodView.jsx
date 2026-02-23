import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { getNowISOVN, getTodayVN } from '../../utils/dateUtils';
import { codStatuses } from '../../constants/salesConstants';

export default function SalesCodView({ tenant, currentUser, loadSalesData, loadFinanceData, hasPermission }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [shippingFeeActual, setShippingFeeActual] = useState('');
  const [confirmNote, setConfirmNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load COD records
  const loadRecords = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      let query = supabase.from('cod_reconciliation').select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      if (filterStartDate) query = query.gte('created_at', filterStartDate + 'T00:00:00');
      if (filterEndDate) query = query.lte('created_at', filterEndDate + 'T23:59:59');

      const { data, error } = await query;
      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      console.error('Load COD records error:', err);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, filterStartDate, filterEndDate]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // Stats
  const stats = useMemo(() => {
    const all = records;
    const pending = all.filter(r => r.status === 'pending');
    const received = all.filter(r => r.status === 'received');
    const confirmed = all.filter(r => r.status === 'confirmed');
    const disputed = all.filter(r => r.status === 'disputed');
    const diff = received.reduce((s, r) => s + ((r.received_amount || 0) - (r.cod_amount || 0) + (r.shipping_fee_actual || 0)), 0);
    return {
      pendingAmount: pending.reduce((s, r) => s + (r.cod_amount || 0), 0),
      pendingCount: pending.length,
      receivedAmount: received.reduce((s, r) => s + (r.received_amount || 0), 0),
      receivedCount: received.length,
      confirmedAmount: confirmed.reduce((s, r) => s + (r.received_amount || 0), 0),
      confirmedCount: confirmed.length,
      disputedCount: disputed.length,
      difference: diff,
    };
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    let result = records;
    if (filterStatus !== 'all') result = result.filter(r => r.status === filterStatus);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        (r.order_number || '').toLowerCase().includes(s) ||
        (r.tracking_number || '').toLowerCase().includes(s)
      );
    }
    return result;
  }, [records, filterStatus, search]);

  // Open confirm received modal
  const openConfirmReceived = (record) => {
    setSelectedRecord(record);
    setReceivedAmount(String(record.cod_amount || ''));
    setShippingFeeActual('');
    setConfirmNote('');
    setShowConfirmModal(true);
  };

  // Confirm received money
  const handleConfirmReceived = async () => {
    if (!selectedRecord || submitting) return;
    const amount = parseFloat(receivedAmount) || 0;
    if (amount <= 0) return alert('Vui lòng nhập số tiền');
    setSubmitting(true);
    try {
      await supabase.from('cod_reconciliation').update({
        received_amount: amount,
        shipping_fee_actual: parseFloat(shippingFeeActual) || 0,
        status: 'received',
        received_date: getNowISOVN(),
        note: confirmNote || null,
        updated_at: getNowISOVN()
      }).eq('id', selectedRecord.id);

      showToast('Đã xác nhận nhận tiền COD');
      setShowConfirmModal(false);
      loadRecords();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm reconciliation (admin) — create finance receipt
  const handleConfirmReconciliation = async (record) => {
    if (!window.confirm(`Xác nhận đối soát COD đơn ${record.order_number}?\nSố tiền: ${formatMoney(record.received_amount)}`)) return;
    try {
      // Update COD record
      await supabase.from('cod_reconciliation').update({
        status: 'confirmed',
        confirmed_by: currentUser.name,
        updated_at: getNowISOVN()
      }).eq('id', record.id);

      // Create finance receipt
      const dateStr = getTodayVN().replace(/-/g, '');
      const { data: lastReceipt } = await supabase.from('receipts_payments').select('receipt_number')
        .like('receipt_number', `PT-${dateStr}-%`).order('receipt_number', { ascending: false }).limit(1);
      const lastNum = lastReceipt?.[0] ? parseInt(lastReceipt[0].receipt_number.slice(-3)) || 0 : 0;
      const receiptNumber = `PT-${dateStr}-${String(lastNum + 1).padStart(3, '0')}`;

      await supabase.from('receipts_payments').insert([{
        tenant_id: tenant.id, receipt_number: receiptNumber, type: 'thu',
        amount: record.received_amount,
        description: `COD đơn ${record.order_number} - ${record.shipping_provider || 'VC'}`,
        category: 'Thu hộ COD', receipt_date: getTodayVN(),
        note: `Mã vận đơn: ${record.tracking_number || ''}`,
        status: 'approved', created_by: currentUser.name, created_at: getNowISOVN()
      }]);

      // Update order paid_amount
      if (record.order_id) {
        const { data: order } = await supabase.from('orders').select('paid_amount, total_amount').eq('id', record.order_id).single();
        if (order) {
          const newPaid = (order.paid_amount || 0) + record.received_amount;
          const pStatus = newPaid >= order.total_amount ? 'paid' : 'partial';
          await supabase.from('orders').update({ paid_amount: newPaid, payment_status: pStatus, updated_at: getNowISOVN() }).eq('id', record.order_id);
        }
      }

      showToast('Đã xác nhận đối soát + tạo phiếu thu');
      loadRecords();
      if (loadSalesData) loadSalesData();
      if (loadFinanceData) loadFinanceData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  // Mark as disputed
  const handleDispute = async (record) => {
    const reason = window.prompt('Lý do khiếu nại:');
    if (!reason) return;
    try {
      await supabase.from('cod_reconciliation').update({
        status: 'disputed',
        note: (record.note ? record.note + '\n' : '') + `Khiếu nại: ${reason}`,
        updated_at: getNowISOVN()
      }).eq('id', record.id);
      showToast('Đã đánh dấu khiếu nại');
      loadRecords();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-yellow-700">{formatMoney(stats.pendingAmount)}</div>
          <div className="text-xs text-yellow-600">Chưa nhận ({stats.pendingCount})</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-blue-700">{formatMoney(stats.receivedAmount)}</div>
          <div className="text-xs text-blue-600">Đã nhận chưa XN ({stats.receivedCount})</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-700">{formatMoney(stats.confirmedAmount)}</div>
          <div className="text-xs text-green-600">Đã xác nhận ({stats.confirmedCount})</div>
        </div>
        <div className={`border rounded-xl p-3 text-center ${stats.disputedCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className={`text-2xl font-bold ${stats.disputedCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>{stats.disputedCount}</div>
          <div className={`text-xs ${stats.disputedCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>Khiếu nại</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm mã đơn, mã vận đơn..."
          className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="all">Tất cả</option>
          {Object.entries(codStatuses).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
      </div>

      {/* Records list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Đang tải...</div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-8 text-gray-400">Chưa có bản ghi COD nào</div>
      ) : (
        <div className="space-y-2">
          {filteredRecords.map(record => {
            const statusInfo = codStatuses[record.status] || codStatuses.pending;
            const diff = record.status !== 'pending' ? (record.received_amount || 0) - (record.cod_amount || 0) + (record.shipping_fee_actual || 0) : null;

            return (
              <div key={record.id} className="bg-white border rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{record.order_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(record.created_at).toLocaleDateString('vi-VN')}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">COD</div>
                    <div className="font-medium">{formatMoney(record.cod_amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Đã nhận</div>
                    <div className="font-medium">{record.received_amount ? formatMoney(record.received_amount) : '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Phí ship TT</div>
                    <div className="font-medium">{record.shipping_fee_actual ? formatMoney(record.shipping_fee_actual) : '—'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {record.shipping_provider && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">{record.shipping_provider}</span>
                  )}
                  {record.tracking_number && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">MVĐ: {record.tracking_number}</span>
                  )}
                  {diff !== null && diff !== 0 && (
                    <span className={`px-2 py-0.5 rounded-full ${diff > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      Chênh lệch: {diff > 0 ? '+' : ''}{formatMoney(diff)}
                    </span>
                  )}
                </div>

                {record.note && <div className="text-xs text-gray-500">{record.note}</div>}

                {/* Actions */}
                {hasPermission('sales', 2) && (
                  <div className="flex gap-2 flex-wrap">
                    {record.status === 'pending' && (
                      <button onClick={() => openConfirmReceived(record)}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200">
                        💰 Xác nhận nhận tiền
                      </button>
                    )}
                    {record.status === 'received' && (
                      <button onClick={() => handleConfirmReconciliation(record)}
                        className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200">
                        ✅ Xác nhận đối soát
                      </button>
                    )}
                    {['pending', 'received'].includes(record.status) && (
                      <button onClick={() => handleDispute(record)}
                        className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">
                        ⚠️ Khiếu nại
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm received modal */}
      {showConfirmModal && selectedRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl">
              <h3 className="font-bold">Xác nhận nhận tiền COD</h3>
              <div className="text-sm text-blue-200">{selectedRecord.order_number}</div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm bg-gray-50 rounded-lg p-2">
                <span>COD gốc:</span>
                <span className="font-bold">{formatMoney(selectedRecord.cod_amount)}</span>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Số tiền thực nhận</label>
                <input type="number" value={receivedAmount} onChange={e => setReceivedAmount(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Phí ship thực tế</label>
                <input type="number" value={shippingFeeActual} onChange={e => setShippingFeeActual(e.target.value)}
                  placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
                <textarea value={confirmNote} onChange={e => setConfirmNote(e.target.value)} rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowConfirmModal(false)} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Hủy</button>
                <button onClick={handleConfirmReceived} disabled={submitting}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white ${submitting ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {submitting ? 'Đang xử lý...' : 'Xác nhận'}
                </button>
              </div>
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

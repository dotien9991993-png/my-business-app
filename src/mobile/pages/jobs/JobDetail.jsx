import React, { useState, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import { formatMoney } from '../../utils/formatters';

const STATUS_CONFIG = {
  'Chờ XN': { label: 'Chờ xác nhận', icon: '⏳', gradient: 'linear-gradient(135deg, #f97316, #ea580c)' },
  'Đang làm': { label: 'Đang làm', icon: '🔨', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
  'Hoàn thành': { label: 'Hoàn thành', icon: '✅', gradient: 'linear-gradient(135deg, #16a34a, #15803d)' },
  'Hủy': { label: 'Đã hủy', icon: '❌', gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)' },
};

const STATUS_FLOW = {
  'Chờ XN': [{ status: 'Đang làm', label: 'Bắt đầu làm', icon: '🔨', cls: 'mjob-btn-blue' }],
  'Đang làm': [{ status: 'Hoàn thành', label: 'Hoàn thành công việc', icon: '✅', cls: 'mjob-btn-green' }],
};

const EXPENSE_CATEGORIES = ['Tiền xe', 'Vật tư', 'Chi phí ăn uống', 'Chi phí khác'];

const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh'
  });
};

const getMapUrl = (address) => {
  if (!address) return null;
  if (address.includes('google.com/maps') || address.includes('goo.gl/maps')) return address;
  const gpsMatch = address.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (gpsMatch) return `https://www.google.com/maps?q=${gpsMatch[1]},${gpsMatch[2]}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

export default function JobDetail({ job: initialJob, onBack, user, tenantId }) {
  const [job, setJob] = useState(initialJob);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [expandExpenses, setExpandExpenses] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState('Tiền xe');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);

  const status = STATUS_CONFIG[job.status] || STATUS_CONFIG['Chờ XN'];
  const nextActions = STATUS_FLOW[job.status] || [];
  const isLocked = job.status === 'Hoàn thành' || job.status === 'Hủy';
  const canCancel = job.status === 'Chờ XN' || job.status === 'Đang làm';
  const expenses = job.expenses || [];
  const expenseTotal = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const profit = (job.customer_payment || 0) - expenseTotal;
  const mapUrl = getMapUrl(job.address);

  const refreshJob = useCallback(async () => {
    const { data } = await supabase
      .from('technical_jobs').select('*').eq('id', job.id).single();
    if (data) setJob(data);
  }, [job.id]);

  const handleStatusUpdate = async (newStatus) => {
    setStatusUpdating(true);
    try {
      const { error } = await supabase
        .from('technical_jobs')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', job.id);
      if (error) throw error;
      setJob(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAddExpense = async () => {
    if (!expenseAmount || parseFloat(expenseAmount) <= 0) return;
    setExpenseSubmitting(true);
    try {
      const newExpense = {
        id: Date.now(),
        category: expenseCategory,
        description: expenseCategory === 'Chi phí khác' ? expenseDesc : expenseCategory,
        amount: parseFloat(expenseAmount),
        addedBy: user?.name,
        addedAt: new Date().toISOString(),
      };
      const updated = [...expenses, newExpense];
      const { error } = await supabase
        .from('technical_jobs').update({ expenses: updated }).eq('id', job.id);
      if (error) throw error;
      setJob(prev => ({ ...prev, expenses: updated }));
      setExpenseAmount('');
      setExpenseDesc('');
      setShowAddExpense(false);
    } catch (err) {
      console.error('Error adding expense:', err);
    } finally {
      setExpenseSubmitting(false);
    }
  };

  const handleDeleteExpense = async (index) => {
    const updated = expenses.filter((_, i) => i !== index);
    try {
      const { error } = await supabase
        .from('technical_jobs').update({ expenses: updated }).eq('id', job.id);
      if (error) throw error;
      setJob(prev => ({ ...prev, expenses: updated }));
    } catch (err) {
      console.error('Error deleting expense:', err);
    }
  };

  return (
    <div className="mobile-page mjob-d2-page">
      {/* Gradient Header */}
      <div className="mjob-d2-header" style={{ background: status.gradient }}>
        <button className="mjob-d2-back" onClick={onBack}>← Quay lại</button>
        <div className="mjob-d2-header-info">
          <h2 className="mjob-d2-job-title">{job.title}</h2>
          <div className="mjob-d2-header-badges">
            <span className="mjob-d2-header-badge">{status.icon} {status.label}</span>
            {job.type && <span className="mjob-d2-header-badge">{job.type}</span>}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="mjob-d2-body">
        {/* Customer Section */}
        <div className="mjob-d2-section">
          <h3 className="mjob-d2-section-title">👤 Khách hàng</h3>
          <div className="mjob-d2-section-card">
            <div className="mjob-d2-customer-name">{job.customer_name}</div>

            {job.customer_phone && (
              <a className="mjob-d2-call-btn" href={`tel:${job.customer_phone}`}>
                📞 Gọi {job.customer_phone}
              </a>
            )}

            {job.address && (
              <div className="mjob-d2-address">
                <span className="mjob-d2-address-text">📍 {job.address}</span>
              </div>
            )}

            {mapUrl && (
              <a className="mjob-d2-maps-btn" href={mapUrl} target="_blank" rel="noopener noreferrer">
                🗺️ Mở Google Maps dẫn đường
              </a>
            )}
          </div>
        </div>

        {/* Schedule Section */}
        <div className="mjob-d2-section">
          <h3 className="mjob-d2-section-title">📅 Lịch hẹn</h3>
          <div className="mjob-d2-schedule">
            <div className="mjob-d2-schedule-date">
              {formatDate(job.scheduled_date)}
            </div>
            {job.scheduled_time && (
              <div className="mjob-d2-schedule-time">
                🕐 {job.scheduled_time.slice(0, 5)}
              </div>
            )}
          </div>
        </div>

        {/* Technicians */}
        {(job.technicians || []).length > 0 && (
          <div className="mjob-d2-section">
            <h3 className="mjob-d2-section-title">👷 Kỹ thuật viên</h3>
            <div className="mjob-d2-tech-tags">
              {job.technicians.map((t, i) => (
                <span key={i} className={`mjob-d2-tech-tag ${t === user?.name ? 'mjob-d2-tech-me' : ''}`}>
                  {t} {t === user?.name ? '(Bạn)' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Equipment — chips */}
        {job.equipment && (
          <div className="mjob-d2-section">
            <h3 className="mjob-d2-section-title">📦 Thiết bị</h3>
            <div className="mjob-d2-equip-list">
              {(Array.isArray(job.equipment) ? job.equipment : job.equipment.split('\n').filter(Boolean))
                .map((item, i) => (
                  <span key={i} className="mjob-d2-equip-chip">{item}</span>
                ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {job.notes && (
          <div className="mjob-d2-section">
            <h3 className="mjob-d2-section-title">📝 Ghi chú</h3>
            <div className="mjob-d2-section-card">
              <div className="mjob-d2-notes">{job.notes}</div>
            </div>
          </div>
        )}

        {/* Finance Section */}
        <div className="mjob-d2-section">
          <button className="mjob-d2-section-title mjob-d2-section-toggle" onClick={() => setExpandExpenses(!expandExpenses)}>
            💰 Tài chính
            <span>{expandExpenses ? '▼' : '▶'}</span>
          </button>
          {expandExpenses && (
            <div className="mjob-d2-finance">
              {/* Revenue card */}
              <div className="mjob-d2-fin-revenue">
                <span className="mjob-d2-fin-icon">💰</span>
                <div>
                  <div className="mjob-d2-fin-label">Thu khách</div>
                  <div className="mjob-d2-fin-amount-green">{formatMoney(job.customer_payment || 0)}</div>
                </div>
              </div>

              {/* Expenses card */}
              {expenseTotal > 0 && (
                <div className="mjob-d2-fin-expense">
                  <span className="mjob-d2-fin-icon">📦</span>
                  <div>
                    <div className="mjob-d2-fin-label">Tổng chi phí</div>
                    <div className="mjob-d2-fin-amount-red">{formatMoney(expenseTotal)}</div>
                  </div>
                </div>
              )}

              {/* Profit card */}
              <div className={`mjob-d2-fin-profit ${profit >= 0 ? 'mjob-d2-fin-profit-pos' : 'mjob-d2-fin-profit-neg'}`}>
                <span className="mjob-d2-fin-icon">{profit >= 0 ? '📈' : '📉'}</span>
                <div>
                  <div className="mjob-d2-fin-label">Lợi nhuận</div>
                  <div className="mjob-d2-fin-amount-profit">{formatMoney(profit)}</div>
                </div>
              </div>

              {/* Expense list */}
              {expenses.length > 0 && (
                <div className="mjob-d2-expense-list">
                  <div className="mjob-d2-expense-header">Chi tiết chi phí</div>
                  {expenses.map((e, i) => (
                    <div key={i} className="mjob-d2-expense-row">
                      <div className="mjob-d2-expense-info">
                        <span className="mjob-d2-expense-cat">{e.category || e.description}</span>
                        <span className="mjob-d2-expense-by">{e.addedBy}</span>
                      </div>
                      <div className="mjob-d2-expense-right">
                        <span className="mjob-d2-expense-amt">{formatMoney(e.amount)}</span>
                        {!isLocked && (
                          <button className="mjob-d2-expense-del" onClick={() => handleDeleteExpense(i)}>×</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add expense */}
              {!isLocked && !showAddExpense && (
                <button className="mjob-d2-add-expense" onClick={() => setShowAddExpense(true)}>
                  + Thêm chi phí
                </button>
              )}

              {showAddExpense && (
                <div className="mjob-d2-expense-form">
                  <select
                    value={expenseCategory}
                    onChange={e => setExpenseCategory(e.target.value)}
                    className="mjob-d2-expense-select"
                  >
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {expenseCategory === 'Chi phí khác' && (
                    <input
                      type="text" placeholder="Mô tả chi phí"
                      value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)}
                      className="mjob-d2-expense-input"
                    />
                  )}
                  <input
                    type="number" placeholder="Số tiền (VNĐ)"
                    value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)}
                    className="mjob-d2-expense-input" inputMode="numeric"
                  />
                  <div className="mjob-d2-expense-btns">
                    <button className="mjob-d2-exp-cancel" onClick={() => setShowAddExpense(false)}>Huỷ</button>
                    <button
                      className="mjob-d2-exp-submit"
                      onClick={handleAddExpense}
                      disabled={!expenseAmount || expenseSubmitting}
                    >
                      {expenseSubmitting ? '...' : 'Thêm'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="mjob-d2-meta">
          <span>Tạo bởi: {job.created_by || '—'}</span>
          <span>{formatDateTime(job.created_at)}</span>
        </div>
      </div>

      {/* Sticky bottom actions */}
      {(nextActions.length > 0 || canCancel) && (
        <div className="mjob-d2-sticky-actions">
          {canCancel && (
            <button
              className="mjob-d2-act-btn mjob-btn-cancel"
              onClick={() => handleStatusUpdate('Hủy')}
              disabled={statusUpdating}
            >
              {statusUpdating ? '...' : '❌ Hủy'}
            </button>
          )}
          {nextActions.map(act => (
            <button
              key={act.status}
              className={`mjob-d2-act-btn mjob-d2-act-primary ${act.cls}`}
              onClick={() => handleStatusUpdate(act.status)}
              disabled={statusUpdating}
            >
              {statusUpdating ? '...' : `${act.icon} ${act.label}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

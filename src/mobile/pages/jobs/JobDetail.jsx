import React, { useState, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import { formatMoney } from '../../utils/formatters';

const STATUS_CONFIG = {
  'Chờ XN': { label: 'Chờ XN', icon: '⏳' },
  'Đang làm': { label: 'Đang làm', icon: '🔨' },
  'Hoàn thành': { label: 'Hoàn thành', icon: '✅' },
  'Hủy': { label: 'Hủy', icon: '❌' },
};

const STATUS_FLOW = {
  'Chờ XN': ['Đang làm', 'Hủy'],
  'Đang làm': ['Hoàn thành', 'Hủy'],
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
  const [expandExpenses, setExpandExpenses] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState('Tiền xe');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);

  const status = STATUS_CONFIG[job.status] || STATUS_CONFIG['Chờ XN'];
  const nextStatuses = STATUS_FLOW[job.status] || [];
  const isLocked = job.status === 'Hoàn thành' || job.status === 'Hủy';
  const expenses = job.expenses || [];
  const expenseTotal = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const profit = (job.customer_payment || 0) - expenseTotal;
  const mapUrl = getMapUrl(job.address);

  // Refresh job from DB
  const refreshJob = useCallback(async () => {
    const { data } = await supabase
      .from('technical_jobs')
      .select('*')
      .eq('id', job.id)
      .single();
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
        .from('technical_jobs')
        .update({ expenses: updated })
        .eq('id', job.id);
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
        .from('technical_jobs')
        .update({ expenses: updated })
        .eq('id', job.id);
      if (error) throw error;
      setJob(prev => ({ ...prev, expenses: updated }));
    } catch (err) {
      console.error('Error deleting expense:', err);
    }
  };

  return (
    <div className="mobile-page mjob-detail-page">
      {/* Header */}
      <div className="mjob-detail-header">
        <button className="mjob-detail-back" onClick={onBack}>← Quay lại</button>
        <span className="mjob-detail-status">{status.icon} {status.label}</span>
      </div>

      {/* Title + Type */}
      <div className="mjob-detail-title">
        <h2>{job.title}</h2>
        {job.type && <span className="mjob-type-badge">{job.type}</span>}
      </div>

      {/* Customer info */}
      <div className="mjob-section">
        <h3 className="mjob-section-title">👤 Khách hàng</h3>
        <div className="mjob-section-body">
          <div className="mjob-info-row">
            <span>Tên</span>
            <span className="mjob-info-val">{job.customer_name}</span>
          </div>
          {job.customer_phone && (
            <div className="mjob-info-row">
              <span>SĐT</span>
              <a className="mjob-info-val mjob-link" href={`tel:${job.customer_phone}`}>
                📞 {job.customer_phone}
              </a>
            </div>
          )}
          {job.address && (
            <div className="mjob-info-row">
              <span>Địa chỉ</span>
              <div className="mjob-address-group">
                <span className="mjob-info-val mjob-address-text">{job.address}</span>
                {mapUrl && (
                  <a className="mjob-map-btn" href={mapUrl} target="_blank" rel="noopener noreferrer">
                    📍 Mở bản đồ
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Schedule info */}
      <div className="mjob-section">
        <h3 className="mjob-section-title">📅 Lịch hẹn</h3>
        <div className="mjob-section-body">
          <div className="mjob-info-row">
            <span>Ngày</span>
            <span className="mjob-info-val">{formatDate(job.scheduled_date)}</span>
          </div>
          {job.scheduled_time && (
            <div className="mjob-info-row">
              <span>Giờ</span>
              <span className="mjob-info-val">🕐 {job.scheduled_time.slice(0, 5)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Technicians */}
      {(job.technicians || []).length > 0 && (
        <div className="mjob-section">
          <h3 className="mjob-section-title">👷 Kỹ thuật viên</h3>
          <div className="mjob-tech-tags">
            {job.technicians.map((t, i) => (
              <span key={i} className={`mjob-tech-tag ${t === user?.name ? 'mjob-tech-me' : ''}`}>
                {t} {t === user?.name ? '(Bạn)' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Equipment */}
      {job.equipment && (
        <div className="mjob-section">
          <h3 className="mjob-section-title">📦 Thiết bị</h3>
          <div className="mjob-equipment">
            {(Array.isArray(job.equipment) ? job.equipment : job.equipment.split('\n').filter(Boolean))
              .map((item, i) => (
                <div key={i} className="mjob-equipment-item">• {item}</div>
              ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {job.notes && (
        <div className="mjob-section">
          <h3 className="mjob-section-title">📝 Ghi chú</h3>
          <div className="mjob-section-body">
            <div className="mjob-notes">{job.notes}</div>
          </div>
        </div>
      )}

      {/* Payment & Expenses */}
      <div className="mjob-section">
        <button className="mjob-section-title mjob-section-toggle" onClick={() => setExpandExpenses(!expandExpenses)}>
          💰 Tài chính
          <span>{expandExpenses ? '▼' : '▶'}</span>
        </button>
        {expandExpenses && (
          <div className="mjob-section-body">
            <div className="mjob-info-row">
              <span>Thu khách</span>
              <span className="mjob-info-val mjob-text-green">{formatMoney(job.customer_payment || 0)}</span>
            </div>
            <div className="mjob-info-row">
              <span>Chi phí</span>
              <span className="mjob-info-val mjob-text-red">{formatMoney(expenseTotal)}</span>
            </div>
            <div className="mjob-info-row mjob-profit-row">
              <span>Lợi nhuận</span>
              <span className={`mjob-info-val ${profit >= 0 ? 'mjob-text-green' : 'mjob-text-red'}`}>
                {formatMoney(profit)}
              </span>
            </div>

            {/* Expense list */}
            {expenses.length > 0 && (
              <div className="mjob-expense-list">
                {expenses.map((e, i) => (
                  <div key={i} className="mjob-expense-row">
                    <div className="mjob-expense-info">
                      <span className="mjob-expense-cat">{e.category || e.description}</span>
                      <span className="mjob-expense-by">{e.addedBy}</span>
                    </div>
                    <div className="mjob-expense-right">
                      <span className="mjob-expense-amount">{formatMoney(e.amount)}</span>
                      {!isLocked && (
                        <button className="mjob-expense-del" onClick={() => handleDeleteExpense(i)}>×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add expense button */}
            {!isLocked && !showAddExpense && (
              <button className="mjob-add-expense-btn" onClick={() => setShowAddExpense(true)}>
                + Thêm chi phí
              </button>
            )}

            {/* Add expense form */}
            {showAddExpense && (
              <div className="mjob-expense-form">
                <select
                  value={expenseCategory}
                  onChange={e => setExpenseCategory(e.target.value)}
                  className="mjob-expense-select"
                >
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {expenseCategory === 'Chi phí khác' && (
                  <input
                    type="text"
                    placeholder="Mô tả chi phí"
                    value={expenseDesc}
                    onChange={e => setExpenseDesc(e.target.value)}
                    className="mjob-expense-input"
                  />
                )}
                <input
                  type="number"
                  placeholder="Số tiền (VNĐ)"
                  value={expenseAmount}
                  onChange={e => setExpenseAmount(e.target.value)}
                  className="mjob-expense-input"
                  inputMode="numeric"
                />
                <div className="mjob-expense-form-actions">
                  <button className="mjob-expense-cancel" onClick={() => setShowAddExpense(false)}>Huỷ</button>
                  <button
                    className="mjob-expense-submit"
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
      <div className="mjob-meta">
        <span>Tạo bởi: {job.created_by || '—'}</span>
        <span>{formatDateTime(job.created_at)}</span>
      </div>

      {/* Status action buttons */}
      {nextStatuses.length > 0 && (
        <div className="mjob-floating-actions">
          {nextStatuses.map(ns => (
            <button
              key={ns}
              className={`mjob-action-btn ${ns === 'Hủy' ? 'mjob-action-cancel' : 'mjob-action-primary'}`}
              onClick={() => handleStatusUpdate(ns)}
              disabled={statusUpdating}
            >
              {statusUpdating ? '...' : `${STATUS_CONFIG[ns]?.icon} ${ns}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

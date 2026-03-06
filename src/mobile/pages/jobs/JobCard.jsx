import React from 'react';
import { formatMoney } from '../../utils/formatters';

const STATUS_CONFIG = {
  'Chờ XN': { label: 'Chờ XN', cls: 'mjob-badge-amber' },
  'Đang làm': { label: 'Đang làm', cls: 'mjob-badge-blue' },
  'Hoàn thành': { label: 'Hoàn thành', cls: 'mjob-badge-green' },
  'Hủy': { label: 'Hủy', cls: 'mjob-badge-gray' },
};

const TYPE_ICONS = {
  'Lắp đặt': '🔌',
  'Bảo trì': '🔧',
  'Sửa chữa': '🛠️',
  'Nâng cấp': '⬆️',
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });
};

const isToday = (dateStr) => {
  if (!dateStr) return false;
  const now = new Date();
  const todayStr = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })).toLocaleDateString('en-CA');
  return dateStr === todayStr;
};

export default function JobCard({ job, onClick }) {
  const status = STATUS_CONFIG[job.status] || STATUS_CONFIG['Chờ XN'];
  const typeIcon = TYPE_ICONS[job.type] || '🔧';
  const today = isToday(job.scheduled_date);
  const techCount = (job.technicians || []).length;
  const expenseTotal = (job.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);

  return (
    <button className={`mjob-card ${today ? 'mjob-card-today' : ''}`} onClick={onClick}>
      <div className="mjob-card-top">
        <span className="mjob-card-title">{typeIcon} {job.title}</span>
        <span className={`mjob-badge ${status.cls}`}>{status.label}</span>
      </div>

      <div className="mjob-card-customer">
        <span className="mjob-card-name">👤 {job.customer_name}</span>
        {job.customer_phone && (
          <a
            className="mjob-card-phone"
            href={`tel:${job.customer_phone}`}
            onClick={e => e.stopPropagation()}
          >
            📞 {job.customer_phone}
          </a>
        )}
      </div>

      <div className="mjob-card-bottom">
        <div className="mjob-card-left">
          <span className={`mjob-card-date ${today ? 'mjob-today-text' : ''}`}>
            📅 {formatDate(job.scheduled_date)}
            {job.scheduled_time && ` ${job.scheduled_time.slice(0, 5)}`}
          </span>
        </div>
        <div className="mjob-card-right">
          {techCount > 0 && <span className="mjob-card-tech">👷 {techCount}</span>}
          {job.customer_payment > 0 && (
            <span className="mjob-card-payment">{formatMoney(job.customer_payment)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

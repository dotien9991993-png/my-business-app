import React from 'react';
import { formatMoney } from '../../utils/formatters';

const STATUS_BORDER = {
  'Chờ XN': '#f97316',
  'Đang làm': '#3b82f6',
  'Hoàn thành': '#16a34a',
  'Hủy': '#dc2626',
};

const STATUS_BADGE = {
  'Chờ XN': 'mjob-badge-pending',
  'Đang làm': 'mjob-badge-active',
  'Hoàn thành': 'mjob-badge-done',
  'Hủy': 'mjob-badge-cancel',
};

const TYPE_BADGE = {
  'Lắp đặt': 'mjob-tbadge-install',
  'Bảo trì': 'mjob-tbadge-maintain',
  'Sửa chữa': 'mjob-tbadge-repair',
  'Nâng cấp': 'mjob-tbadge-upgrade',
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

const getMapUrl = (address) => {
  if (!address) return null;
  if (address.includes('google.com/maps') || address.includes('goo.gl/maps')) return address;
  const gpsMatch = address.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (gpsMatch) return `https://www.google.com/maps?q=${gpsMatch[1]},${gpsMatch[2]}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

export default function JobCard({ job, onClick }) {
  const borderColor = STATUS_BORDER[job.status] || '#e5e7eb';
  const badgeCls = STATUS_BADGE[job.status] || 'mjob-badge-pending';
  const typeBadgeCls = TYPE_BADGE[job.type] || '';
  const typeIcon = TYPE_ICONS[job.type] || '🔧';
  const today = isToday(job.scheduled_date);
  const techList = job.technicians || [];
  const mapUrl = getMapUrl(job.address);

  return (
    <div
      className={`mjob-card2 ${today ? 'mjob-card2-today' : ''}`}
      style={{ borderLeftColor: borderColor }}
      onClick={onClick}
    >
      {/* Row 1: Date/time + badges */}
      <div className="mjob-c2-row1">
        <span className={`mjob-c2-datetime ${today ? 'mjob-c2-today-text' : ''}`}>
          📅 {formatDate(job.scheduled_date)}
          {job.scheduled_time && ` • ${job.scheduled_time.slice(0, 5)}`}
        </span>
        <div className="mjob-c2-badges">
          <span className={`mjob-badge2 ${badgeCls}`}>{job.status}</span>
          {job.type && (
            <span className={`mjob-badge2 ${typeBadgeCls}`}>{typeIcon} {job.type}</span>
          )}
        </div>
      </div>

      {/* Row 2: Title */}
      <div className="mjob-c2-title">{job.title}</div>

      {/* Customer info */}
      <div className="mjob-c2-customer">
        <span className="mjob-c2-name">👤 {job.customer_name}</span>
        {job.customer_phone && (
          <a
            className="mjob-c2-phone"
            href={`tel:${job.customer_phone}`}
            onClick={e => e.stopPropagation()}
          >
            📞 {job.customer_phone}
          </a>
        )}
      </div>

      {/* Address */}
      {job.address && (
        <div className="mjob-c2-address">📍 {job.address}</div>
      )}

      {/* Technicians */}
      {techList.length > 0 && (
        <div className="mjob-c2-techs">
          🔧 {techList.join(', ')}
        </div>
      )}

      {/* Payment highlight */}
      {job.customer_payment > 0 && (
        <div className="mjob-c2-payment">
          <span className="mjob-c2-payment-icon">💰</span>
          <div className="mjob-c2-payment-info">
            <span className="mjob-c2-payment-label">Thu khách</span>
            <span className="mjob-c2-payment-amount">{formatMoney(job.customer_payment)}</span>
          </div>
        </div>
      )}

      {/* Google Maps button */}
      {mapUrl && (
        <a
          className="mjob-c2-maps"
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
        >
          🗺️ Mở Google Maps dẫn đường
        </a>
      )}
    </div>
  );
}

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

const getMapUrl = (address) => {
  if (!address) return null;
  if (address.includes('google.com/maps') || address.includes('goo.gl/maps')) return address;
  const gpsMatch = address.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (gpsMatch) return `https://www.google.com/maps?q=${gpsMatch[1]},${gpsMatch[2]}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

export default function JobCard({ job, onClick }) {
  const status = STATUS_CONFIG[job.status] || STATUS_CONFIG['Chờ XN'];
  const typeIcon = TYPE_ICONS[job.type] || '🔧';
  const today = isToday(job.scheduled_date);
  const techList = job.technicians || [];
  const mapUrl = getMapUrl(job.address);

  return (
    <div className={`mjob-card ${today ? 'mjob-card-today' : ''}`} onClick={onClick}>
      {/* Header: date/time + badges */}
      <div className="mjob-card-top">
        <span className={`mjob-card-date ${today ? 'mjob-today-text' : ''}`}>
          📅 {formatDate(job.scheduled_date)}
          {job.scheduled_time && ` • ${job.scheduled_time.slice(0, 5)}`}
        </span>
        <div className="mjob-card-badges">
          {job.type && <span className="mjob-type-badge">{typeIcon} {job.type}</span>}
          <span className={`mjob-badge ${status.cls}`}>{status.label}</span>
        </div>
      </div>

      {/* Title */}
      <div className="mjob-card-title">{job.title}</div>

      {/* Customer */}
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

      {/* Address */}
      {job.address && (
        <div className="mjob-card-address">
          <span className="mjob-card-address-text">📍 {job.address}</span>
          {mapUrl && (
            <a
              className="mjob-card-map"
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >
              🗺️
            </a>
          )}
        </div>
      )}

      {/* Bottom: techs + payment */}
      <div className="mjob-card-bottom">
        <div className="mjob-card-left">
          {techList.length > 0 && (
            <span className="mjob-card-tech">🔧 {techList.join(', ')}</span>
          )}
        </div>
        <div className="mjob-card-right">
          {job.customer_payment > 0 && (
            <span className="mjob-card-payment">{formatMoney(job.customer_payment)}</span>
          )}
        </div>
      </div>

      {/* Creator */}
      {job.created_by && (
        <div className="mjob-card-creator">📝 {job.created_by}</div>
      )}
    </div>
  );
}

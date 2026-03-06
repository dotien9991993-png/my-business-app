import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { formatMoney, getTodayVN } from '../../utils/formatters';

const getMapUrl = (address) => {
  if (!address) return null;
  if (address.includes('google.com/maps') || address.includes('goo.gl/maps')) return address;
  const gpsMatch = address.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (gpsMatch) return `https://www.google.com/maps?q=${gpsMatch[1]},${gpsMatch[2]}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

const STATUS_BORDER = {
  'Chờ XN': '#f97316',
  'Đang làm': '#3b82f6',
  'Hoàn thành': '#16a34a',
};

const STATUS_BADGE = {
  'Chờ XN': 'mjob-badge-pending',
  'Đang làm': 'mjob-badge-active',
  'Hoàn thành': 'mjob-badge-done',
};

const CATEGORY_CONFIG = {
  overdue: { title: 'Quá giờ', icon: '🔴', cls: 'mjob-cat-overdue' },
  urgent: { title: 'Sắp tới (< 30 phút)', icon: '🟠', cls: 'mjob-cat-urgent' },
  soon: { title: 'Trong 2 giờ', icon: '🟡', cls: 'mjob-cat-soon' },
  upcoming: { title: 'Sắp tới', icon: '🟢', cls: 'mjob-cat-upcoming' },
  completed: { title: 'Hoàn thành', icon: '✅', cls: 'mjob-cat-completed' },
};

const CATEGORY_ORDER = ['overdue', 'urgent', 'soon', 'upcoming', 'completed'];

export default function TodayJobs({ user, tenantId, onOpenJob }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      setLoading(true);
      const todayStr = getTodayVN();
      const { data, error } = await supabase
        .from('technical_jobs').select('*')
        .eq('tenant_id', tenantId).eq('scheduled_date', todayStr)
        .order('scheduled_time', { ascending: true });
      if (!error && data) setJobs(data);
      setLoading(false);
    };
    load();
    const channel = supabase.channel(`mobile-today-jobs-${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'technical_jobs',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => load())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantId]);

  const categorized = useMemo(() => {
    const vnNow = new Date(currentTime.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const currentTotalMinutes = vnNow.getHours() * 60 + vnNow.getMinutes();

    return jobs.map(job => {
      const [jobHour, jobMinute] = (job.scheduled_time || '09:00').split(':').map(Number);
      const jobTotalMinutes = jobHour * 60 + jobMinute;
      const diffMinutes = jobTotalMinutes - currentTotalMinutes;

      let category = 'upcoming';
      let countdown = null;

      if (job.status === 'Hoàn thành') {
        category = 'completed';
      } else if (job.status === 'Hủy') {
        return null;
      } else if (diffMinutes < 0) {
        category = 'overdue';
        countdown = Math.abs(diffMinutes);
      } else if (diffMinutes <= 30) {
        category = 'urgent';
        countdown = diffMinutes;
      } else if (diffMinutes <= 120) {
        category = 'soon';
        countdown = diffMinutes;
      } else {
        category = 'upcoming';
        countdown = diffMinutes;
      }

      return { ...job, category, countdown, diffMinutes };
    }).filter(Boolean);
  }, [jobs, currentTime]);

  const groups = useMemo(() => {
    const map = {};
    CATEGORY_ORDER.forEach(cat => { map[cat] = []; });
    categorized.forEach(job => {
      if (map[job.category]) map[job.category].push(job);
    });
    return map;
  }, [categorized]);

  const completedCount = groups.completed.length;
  const totalActive = categorized.length - completedCount;

  if (loading) return <div className="mjob-empty">Đang tải...</div>;

  return (
    <div className="mjob-today">
      {/* Stats */}
      <div className="mjob-today-stats">
        <div className="mjob-today-stat">
          <span className="mjob-stat-num">{jobs.filter(j => j.status !== 'Hủy').length}</span>
          <span className="mjob-stat-label">Tổng việc</span>
        </div>
        <div className="mjob-today-stat mjob-stat-active">
          <span className="mjob-stat-num">{totalActive}</span>
          <span className="mjob-stat-label">Đang xử lý</span>
        </div>
        <div className="mjob-today-stat mjob-stat-done">
          <span className="mjob-stat-num">{completedCount}</span>
          <span className="mjob-stat-label">Hoàn thành</span>
        </div>
      </div>

      {categorized.length === 0 ? (
        <div className="mjob-empty">Hôm nay không có việc nào</div>
      ) : (
        CATEGORY_ORDER.map(cat => {
          const jobsInCat = groups[cat];
          if (jobsInCat.length === 0) return null;
          const config = CATEGORY_CONFIG[cat];
          return (
            <div key={cat} className="mjob-cat-group">
              <div className={`mjob-cat-header ${config.cls}`}>
                {config.icon} {config.title} ({jobsInCat.length})
              </div>
              {jobsInCat.map(job => (
                <TodayJobCard key={job.id} job={job} onOpen={() => onOpenJob(job)} />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

function TodayJobCard({ job, onOpen }) {
  const mapUrl = getMapUrl(job.address);
  const borderColor = STATUS_BORDER[job.status] || '#e5e7eb';
  const badgeCls = STATUS_BADGE[job.status] || 'mjob-badge-pending';

  return (
    <div
      className={`mjob-today-card2 ${job.category === 'overdue' ? 'mjob-today-overdue' : ''}`}
      style={{ borderLeftColor: borderColor }}
    >
      {/* Time + countdown + badge */}
      <div className="mjob-tc2-row1">
        <span className="mjob-tc2-time">🕐 {(job.scheduled_time || '').slice(0, 5)}</span>
        {job.countdown != null && job.category !== 'completed' && (
          <span className={`mjob-tc2-countdown ${job.category === 'overdue' ? 'mjob-tc2-cd-over' : ''}`}>
            {job.category === 'overdue' ? `Quá ${fmtCD(job.countdown)}` : `Còn ${fmtCD(job.countdown)}`}
          </span>
        )}
        <span className={`mjob-badge2 ${badgeCls}`}>{job.status}</span>
      </div>

      {/* Title */}
      <div className="mjob-tc2-title" onClick={onOpen}>{job.title}</div>

      {/* Customer */}
      <div className="mjob-tc2-customer">
        <span className="mjob-tc2-name">👤 {job.customer_name}</span>
        {job.customer_phone && (
          <a href={`tel:${job.customer_phone}`} onClick={e => e.stopPropagation()} className="mjob-tc2-phone">
            📞 {job.customer_phone}
          </a>
        )}
      </div>

      {/* Address */}
      {job.address && <div className="mjob-tc2-address">📍 {job.address}</div>}

      {/* Techs */}
      {(job.technicians || []).length > 0 && (
        <div className="mjob-tc2-techs">🔧 {(job.technicians || []).join(', ')}</div>
      )}

      {/* Payment */}
      {job.customer_payment > 0 && (
        <div className="mjob-c2-payment">
          <span className="mjob-c2-payment-icon">💰</span>
          <div className="mjob-c2-payment-info">
            <span className="mjob-c2-payment-label">Thu khách</span>
            <span className="mjob-c2-payment-amount">{formatMoney(job.customer_payment)}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mjob-tc2-actions">
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="mjob-tc2-maps"
             onClick={e => e.stopPropagation()}>
            🗺️ Chỉ đường
          </a>
        )}
        <button className="mjob-tc2-detail" onClick={onOpen}>Chi tiết →</button>
      </div>
    </div>
  );
}

function fmtCD(minutes) {
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? String(minutes % 60).padStart(2, '0') + 'p' : ''}`;
  return `${minutes}p`;
}

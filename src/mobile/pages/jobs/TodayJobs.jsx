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

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Load today's jobs
  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      setLoading(true);
      const todayStr = getTodayVN();
      const { data, error } = await supabase
        .from('technical_jobs')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('scheduled_date', todayStr)
        .order('scheduled_time', { ascending: true });

      if (!error && data) setJobs(data);
      setLoading(false);
    };
    load();

    // Realtime
    const channel = supabase.channel(`mobile-today-jobs-${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'technical_jobs',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => load())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantId]);

  // Categorize jobs by urgency
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
        return null; // skip cancelled
      } else if (diffMinutes < -60) {
        category = 'overdue';
        countdown = Math.abs(diffMinutes);
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

  // Group by category
  const groups = useMemo(() => {
    const map = {};
    CATEGORY_ORDER.forEach(cat => { map[cat] = []; });
    categorized.forEach(job => {
      if (map[job.category]) map[job.category].push(job);
    });
    return map;
  }, [categorized]);

  const formatCountdown = (minutes) => {
    if (minutes >= 60) return `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? String(minutes % 60).padStart(2, '0') + 'p' : ''}`;
    return `${minutes}p`;
  };

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

      {/* Job groups */}
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
                <TodayJobCard
                  key={job.id}
                  job={job}
                  onOpen={() => onOpenJob(job)}
                />
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
  const techCount = (job.technicians || []).length;

  return (
    <div className={`mjob-today-card ${job.category === 'overdue' ? 'mjob-today-overdue' : ''}`}>
      {/* Time + Status */}
      <div className="mjob-today-card-header">
        <span className="mjob-today-time">
          🕐 {(job.scheduled_time || '').slice(0, 5)}
        </span>
        {job.countdown != null && job.category !== 'completed' && (
          <span className={`mjob-countdown ${job.category === 'overdue' ? 'mjob-countdown-over' : ''}`}>
            {job.category === 'overdue' ? `Quá ${formatCountdownStatic(job.countdown)}` : `Còn ${formatCountdownStatic(job.countdown)}`}
          </span>
        )}
        <span className={`mjob-badge mjob-badge-${job.status === 'Hoàn thành' ? 'green' : job.status === 'Đang làm' ? 'blue' : 'amber'}`}>
          {job.status}
        </span>
      </div>

      {/* Title */}
      <div className="mjob-today-title" onClick={onOpen}>{job.title}</div>

      {/* Customer */}
      <div className="mjob-today-customer">
        <span>👤 {job.customer_name}</span>
        {job.customer_phone && (
          <a href={`tel:${job.customer_phone}`} onClick={e => e.stopPropagation()} className="mjob-today-phone">
            📞 {job.customer_phone}
          </a>
        )}
      </div>

      {/* Address */}
      {job.address && (
        <div className="mjob-today-address">📍 {job.address}</div>
      )}

      {/* Bottom: techs + payment + map */}
      <div className="mjob-today-bottom">
        <div className="mjob-today-info">
          {techCount > 0 && <span>🔧 {(job.technicians || []).join(', ')}</span>}
          {job.customer_payment > 0 && (
            <span className="mjob-text-green">💰 {formatMoney(job.customer_payment)}</span>
          )}
        </div>
        <div className="mjob-today-actions">
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="mjob-map-link"
               onClick={e => e.stopPropagation()}>
              🗺️ Chỉ đường
            </a>
          )}
          <button className="mjob-detail-link" onClick={onOpen}>Chi tiết →</button>
        </div>
      </div>
    </div>
  );
}

function formatCountdownStatic(minutes) {
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? String(minutes % 60).padStart(2, '0') + 'p' : ''}`;
  return `${minutes}p`;
}

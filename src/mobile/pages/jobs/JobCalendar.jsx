import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { formatMoney } from '../../utils/formatters';
import JobCard from './JobCard';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export default function JobCalendar({ user, tenantId, onOpenJob }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  // Load jobs for current month
  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      setLoading(true);
      const { year, month } = currentMonth;
      const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0);
      const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('technical_jobs')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (!error) setJobs(data || []);
      setLoading(false);
    };
    load();
  }, [tenantId, currentMonth]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const { year, month } = currentMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days = [];
    for (let i = 0; i < startPadding; i++) {
      days.push({ day: null, date: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ day: d, date: dateStr });
    }
    return days;
  }, [currentMonth]);

  // Job count by date
  const jobCountByDate = useMemo(() => {
    const map = {};
    jobs.forEach(j => {
      if (j.status !== 'Hủy') {
        map[j.scheduled_date] = (map[j.scheduled_date] || 0) + 1;
      }
    });
    return map;
  }, [jobs]);

  // Stats
  const stats = useMemo(() => {
    const active = jobs.filter(j => j.status !== 'Hủy');
    return {
      pending: active.filter(j => j.status !== 'Hoàn thành').length,
      completed: active.filter(j => j.status === 'Hoàn thành').length,
      revenue: active.reduce((sum, j) => sum + (j.customer_payment || 0), 0),
    };
  }, [jobs]);

  // Jobs for selected date
  const selectedJobs = useMemo(() => {
    if (!selectedDate) return [];
    return jobs.filter(j => j.scheduled_date === selectedDate && j.status !== 'Hủy');
  }, [jobs, selectedDate]);

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const monthLabel = new Date(currentMonth.year, currentMonth.month).toLocaleDateString('vi-VN', {
    month: 'long', year: 'numeric',
  });

  const prevMonth = () => {
    setCurrentMonth(prev => {
      const m = prev.month - 1;
      return m < 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: m };
    });
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setCurrentMonth(prev => {
      const m = prev.month + 1;
      return m > 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: m };
    });
    setSelectedDate(null);
  };

  return (
    <div className="mjob-calendar">
      {/* Month navigation */}
      <div className="mjob-cal-nav">
        <button className="mjob-cal-nav-btn" onClick={prevMonth}>◀</button>
        <span className="mjob-cal-month">{monthLabel}</span>
        <button className="mjob-cal-nav-btn" onClick={nextMonth}>▶</button>
      </div>

      {/* Stats cards */}
      <div className="mjob-cal-stats">
        <div className="mjob-cal-stat mjob-cal-stat-pending">
          <span className="mjob-cal-stat-num">{stats.pending}</span>
          <span className="mjob-cal-stat-label">Chờ xử lý</span>
        </div>
        <div className="mjob-cal-stat mjob-cal-stat-done">
          <span className="mjob-cal-stat-num">{stats.completed}</span>
          <span className="mjob-cal-stat-label">Hoàn thành</span>
        </div>
        <div className="mjob-cal-stat mjob-cal-stat-revenue">
          <span className="mjob-cal-stat-num">{formatMoney(stats.revenue)}</span>
          <span className="mjob-cal-stat-label">Thu khách</span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="mjob-cal-grid">
        {/* Weekday headers */}
        {WEEKDAYS.map(w => (
          <div key={w} className="mjob-cal-weekday">{w}</div>
        ))}

        {/* Day cells */}
        {calendarDays.map((item, i) => {
          if (!item.day) return <div key={i} className="mjob-cal-day mjob-cal-empty" />;
          const count = jobCountByDate[item.date] || 0;
          const isToday = item.date === todayStr;
          const isSelected = item.date === selectedDate;

          return (
            <button
              key={i}
              className={`mjob-cal-day ${isToday ? 'mjob-cal-today' : ''} ${isSelected ? 'mjob-cal-selected' : ''} ${count > 0 ? 'mjob-cal-has-jobs' : ''}`}
              onClick={() => setSelectedDate(item.date === selectedDate ? null : item.date)}
            >
              <span className="mjob-cal-day-num">{item.day}</span>
              {count > 0 && <span className="mjob-cal-dot">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Selected date jobs */}
      {selectedDate && (
        <div className="mjob-cal-jobs">
          <h3 className="mjob-cal-jobs-title">
            📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('vi-VN', {
              weekday: 'long', day: '2-digit', month: '2-digit',
              timeZone: 'Asia/Ho_Chi_Minh'
            })}
            <span className="mjob-cal-jobs-count">{selectedJobs.length} việc</span>
          </h3>
          {selectedJobs.length === 0 ? (
            <div className="mjob-empty">Không có việc ngày này</div>
          ) : (
            selectedJobs.map(job => (
              <JobCard key={job.id} job={job} onClick={() => onOpenJob(job)} />
            ))
          )}
        </div>
      )}

      {loading && <div className="mjob-empty">Đang tải...</div>}
    </div>
  );
}

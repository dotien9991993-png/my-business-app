import React, { useMemo } from 'react';

const MONTH_NAMES = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

const STATUS_ICONS = {
  present: '✅',
  late: '⏰',
  early_leave: '⚡',
  absent: '🔴',
  annual_leave: '🏖️',
  sick: '🏥',
  half_day: '½',
  holiday: '🎉',
};

const formatDateVN = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });
};

export default function AttendanceHistory({
  monthRecords, monthSummary, viewMonth, onChangeMonth,
  extractTime, calculateHours
}) {
  const { year, month } = viewMonth;

  const avgHoursPerDay = monthSummary.workDays > 0
    ? (monthSummary.totalHours / monthSummary.workDays).toFixed(1)
    : 0;

  // Sort records newest first, then by shift_number
  const sortedRecords = useMemo(() => {
    return [...monthRecords].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (a.shift_number || 1) - (b.shift_number || 1);
    });
  }, [monthRecords]);

  const prevMonth = () => {
    if (month === 1) onChangeMonth(year - 1, 12);
    else onChangeMonth(year, month - 1);
  };

  const nextMonth = () => {
    if (month === 12) onChangeMonth(year + 1, 1);
    else onChangeMonth(year, month + 1);
  };

  return (
    <div className="matt-history">
      {/* Month nav */}
      <div className="matt-cal-nav">
        <button onClick={prevMonth}>◀</button>
        <span className="matt-cal-month">{MONTH_NAMES[month]} {year}</span>
        <button onClick={nextMonth}>▶</button>
      </div>

      {/* Stats cards — 6 cards */}
      <div className="matt-stats-grid matt-stats-6">
        <div className="matt-stat-card">
          <span className="matt-stat-icon">📅</span>
          <span className="matt-stat-num">{monthSummary.workDays}</span>
          <span className="matt-stat-label">Ngày công</span>
        </div>
        <div className="matt-stat-card">
          <span className="matt-stat-icon">⏰</span>
          <span className="matt-stat-num matt-stat-warn">{monthSummary.lateDays}</span>
          <span className="matt-stat-label">Đi trễ</span>
        </div>
        <div className="matt-stat-card">
          <span className="matt-stat-icon">⚡</span>
          <span className="matt-stat-num matt-stat-warn">{monthSummary.earlyDays}</span>
          <span className="matt-stat-label">Về sớm</span>
        </div>
        <div className="matt-stat-card">
          <span className="matt-stat-icon">⏱️</span>
          <span className="matt-stat-num">{monthSummary.totalHours}</span>
          <span className="matt-stat-label">Tổng giờ</span>
        </div>
        <div className="matt-stat-card">
          <span className="matt-stat-icon">🌙</span>
          <span className="matt-stat-num">{monthSummary.overtimeHours}</span>
          <span className="matt-stat-label">OT</span>
        </div>
        <div className="matt-stat-card">
          <span className="matt-stat-icon">📊</span>
          <span className="matt-stat-num">{avgHoursPerDay}</span>
          <span className="matt-stat-label">TB/ngày</span>
        </div>
      </div>

      {/* Detail list */}
      <div className="matt-history-list">
        {sortedRecords.length === 0 ? (
          <div className="matt-history-empty">Chưa có dữ liệu chấm công tháng này</div>
        ) : (
          sortedRecords.map(a => {
            const hours = calculateHours(a.check_in, a.check_out);
            const statusIcon = STATUS_ICONS[a.status] || (a.check_out ? '✅' : a.check_in ? '🟢' : '—');
            return (
              <div key={a.id} className="matt-history-row">
                <div className="matt-history-date">{formatDateVN(a.date)}</div>
                <div className="matt-history-times">
                  <span className="matt-history-in">{extractTime(a.check_in)}</span>
                  <span className="matt-history-sep">→</span>
                  <span className="matt-history-out">{a.check_out ? extractTime(a.check_out) : '—'}</span>
                </div>
                <div className="matt-history-hours">
                  {hours > 0 ? `${hours}h` : '—'}
                </div>
                <div className="matt-history-status">
                  <span className={`matt-hstatus ${a.status || ''}`}>{statusIcon}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

import React, { useMemo } from 'react';

const MONTH_NAMES = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

const formatDateVN = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });
};

export default function AttendanceHistory({ monthRecords, monthSummary, viewMonth, onChangeMonth }) {
  const { year, month } = viewMonth;

  // Stats
  const totalShifts = monthRecords.filter(r => r.check_in).length;
  const avgHoursPerDay = monthSummary.totalDays > 0
    ? (monthSummary.totalHours / monthSummary.totalDays).toFixed(1)
    : 0;

  // Group records by date for display
  const sortedRecords = useMemo(() => {
    return [...monthRecords].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date); // newest first
      return (a.check_in || '').localeCompare(b.check_in || '');
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

      {/* Stats cards */}
      <div className="matt-stats-grid">
        <div className="matt-stat-card">
          <span className="matt-stat-icon">📅</span>
          <span className="matt-stat-num">{monthSummary.totalDays}</span>
          <span className="matt-stat-label">Ngày công</span>
        </div>
        <div className="matt-stat-card">
          <span className="matt-stat-icon">🔄</span>
          <span className="matt-stat-num">{totalShifts}</span>
          <span className="matt-stat-label">Số ca</span>
        </div>
        <div className="matt-stat-card">
          <span className="matt-stat-icon">⏱️</span>
          <span className="matt-stat-num">{monthSummary.totalHours}</span>
          <span className="matt-stat-label">Tổng giờ</span>
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
          sortedRecords.map(a => (
            <div key={a.id} className="matt-history-row">
              <div className="matt-history-date">{formatDateVN(a.date)}</div>
              <div className="matt-history-times">
                <span className="matt-history-in">{a.check_in?.slice(0, 5) || '—'}</span>
                <span className="matt-history-sep">→</span>
                <span className="matt-history-out">{a.check_out?.slice(0, 5) || '—'}</span>
              </div>
              <div className="matt-history-hours">
                {a.work_hours ? `${a.work_hours}h` : '—'}
              </div>
              <div className="matt-history-status">
                {a.check_out ? (
                  <span className="matt-hstatus done">✓</span>
                ) : a.check_in ? (
                  <span className="matt-hstatus working">●</span>
                ) : (
                  <span className="matt-hstatus">—</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import React, { useMemo } from 'react';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTH_NAMES = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

export default function AttendanceCalendar({ monthRecords, monthSummary, viewMonth, onChangeMonth }) {
  const { year, month } = viewMonth;

  // Group records by date
  const dateMap = useMemo(() => {
    const map = {};
    (monthRecords || []).forEach(r => {
      if (!map[r.date]) map[r.date] = { shifts: 0, hours: 0, hasCheckOut: true };
      map[r.date].shifts++;
      map[r.date].hours += parseFloat(r.work_hours || 0);
      if (!r.check_out) map[r.date].hasCheckOut = false;
    });
    return map;
  }, [monthRecords]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];

    // Padding
    for (let i = 0; i < firstDay; i++) days.push(null);
    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ day: d, date: dateStr, record: dateMap[dateStr] || null });
    }
    return days;
  }, [year, month, dateMap]);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

  const prevMonth = () => {
    if (month === 1) onChangeMonth(year - 1, 12);
    else onChangeMonth(year, month - 1);
  };

  const nextMonth = () => {
    if (month === 12) onChangeMonth(year + 1, 1);
    else onChangeMonth(year, month + 1);
  };

  const getDayClass = (item) => {
    if (!item) return '';
    let cls = 'matt-cal-day';
    if (item.date === today) cls += ' today';
    if (item.record) {
      if (item.record.hasCheckOut) cls += ' worked';
      else cls += ' working';
    }
    return cls;
  };

  return (
    <div className="matt-calendar">
      {/* Month nav */}
      <div className="matt-cal-nav">
        <button onClick={prevMonth}>◀</button>
        <span className="matt-cal-month">{MONTH_NAMES[month]} {year}</span>
        <button onClick={nextMonth}>▶</button>
      </div>

      {/* Summary */}
      <div className="matt-cal-summary">
        <div className="matt-cal-stat">
          <span className="matt-cal-stat-num">{monthSummary.totalDays}</span>
          <span className="matt-cal-stat-label">Ngày công</span>
        </div>
        <div className="matt-cal-stat">
          <span className="matt-cal-stat-num">{monthSummary.totalHours}</span>
          <span className="matt-cal-stat-label">Tổng giờ</span>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="matt-cal-grid">
        {WEEKDAYS.map(w => (
          <div key={w} className="matt-cal-weekday">{w}</div>
        ))}

        {/* Day cells */}
        {calendarDays.map((item, i) => (
          <div key={i} className={getDayClass(item)}>
            {item && (
              <>
                <span className="matt-cal-daynum">{item.day}</span>
                {item.record && (
                  <span className="matt-cal-hours">
                    {item.record.hours > 0 ? `${item.record.hours.toFixed(1)}h` : '•'}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="matt-cal-legend">
        <span><i className="matt-dot worked" /> Đủ công</span>
        <span><i className="matt-dot working" /> Đang làm</span>
        <span><i className="matt-dot today-dot" /> Hôm nay</span>
      </div>
    </div>
  );
}

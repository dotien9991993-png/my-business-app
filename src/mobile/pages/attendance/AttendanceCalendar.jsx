import React, { useMemo } from 'react';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTH_NAMES = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

// Status priority: late > early_leave > present > absent > annual_leave > sick > half_day > holiday
const STATUS_PRIORITY = { late: 8, early_leave: 7, present: 6, absent: 5, annual_leave: 4, sick: 3, half_day: 2, holiday: 1 };

// Tính giờ giữa 2 ISO timestamps
const calcHours = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 0;
  return Math.round((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60) * 10) / 10;
};

export default function AttendanceCalendar({ monthRecords, monthSummary, viewMonth, onChangeMonth }) {
  const { year, month } = viewMonth;

  // Group records by date, pick highest priority status
  const dateMap = useMemo(() => {
    const map = {};
    (monthRecords || []).forEach(r => {
      if (!map[r.date]) map[r.date] = { status: null, hours: 0, hasOpen: false, statusPriority: 0 };
      const hours = calcHours(r.check_in, r.check_out);
      map[r.date].hours += hours;
      if (!r.check_out && r.check_in) map[r.date].hasOpen = true;

      const prio = STATUS_PRIORITY[r.status] || 0;
      if (prio > map[r.date].statusPriority) {
        map[r.date].status = r.status;
        map[r.date].statusPriority = prio;
      }
    });
    return map;
  }, [monthRecords]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];

    for (let i = 0; i < firstDay; i++) days.push(null);
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
      const st = item.record.status;
      if (st === 'late') cls += ' late';
      else if (st === 'early_leave') cls += ' early';
      else if (st === 'absent') cls += ' absent';
      else if (st === 'annual_leave') cls += ' leave';
      else if (st === 'sick') cls += ' sick';
      else if (st === 'half_day' || st === 'holiday') cls += ' halfday';
      else if (st === 'present') cls += ' worked';
      else if (item.record.hasOpen) cls += ' working';
      else cls += ' worked';
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
          <span className="matt-cal-stat-num">{monthSummary.workDays}</span>
          <span className="matt-cal-stat-label">Ngày công</span>
        </div>
        <div className="matt-cal-stat">
          <span className="matt-cal-stat-num">{monthSummary.totalHours}</span>
          <span className="matt-cal-stat-label">Tổng giờ</span>
        </div>
        <div className="matt-cal-stat">
          <span className="matt-cal-stat-num">{monthSummary.lateDays}</span>
          <span className="matt-cal-stat-label">Đi trễ</span>
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
                    {item.record.hours > 0 ? `${item.record.hours.toFixed(1)}h` : item.record.hasOpen ? '•' : ''}
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
        <span><i className="matt-dot late-dot" /> Trễ</span>
        <span><i className="matt-dot early-dot" /> Sớm</span>
        <span><i className="matt-dot absent-dot" /> Vắng</span>
        <span><i className="matt-dot leave-dot" /> Phép</span>
        <span><i className="matt-dot today-dot" /> Nay</span>
      </div>
    </div>
  );
}

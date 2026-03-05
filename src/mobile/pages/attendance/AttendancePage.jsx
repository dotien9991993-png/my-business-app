import React, { useState, useEffect } from 'react';
import { useMobileAttendance } from '../../hooks/useMobileAttendance';
import CheckInButton from './CheckInButton';
import AttendanceCalendar from './AttendanceCalendar';

export default function AttendancePage({ user, tenantId }) {
  const {
    todayRecords, currentShift, totalHoursToday,
    monthRecords, monthSummary, viewMonth,
    loading, checkIn, checkOut, changeMonth, refresh
  } = useMobileAttendance(user?.id, user?.name, tenantId);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [tab, setTab] = useState('today'); // 'today' | 'calendar'

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const vnTime = currentTime.toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });
  const vnDate = currentTime.toLocaleDateString('vi-VN', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Asia/Ho_Chi_Minh'
  });

  if (loading) {
    return (
      <div className="mobile-page">
        <div className="matt-loading">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="mobile-page matt-page">
      {/* Tab switcher */}
      <div className="matt-tabs">
        <button
          className={`matt-tab ${tab === 'today' ? 'active' : ''}`}
          onClick={() => setTab('today')}
        >
          Hôm nay
        </button>
        <button
          className={`matt-tab ${tab === 'calendar' ? 'active' : ''}`}
          onClick={() => setTab('calendar')}
        >
          Lịch tháng
        </button>
      </div>

      {tab === 'today' ? (
        <>
          {/* Clock */}
          <div className="matt-clock">
            <div className="matt-clock-time">{vnTime}</div>
            <div className="matt-clock-date">{vnDate}</div>
            <div className="matt-clock-name">{user?.name}</div>
          </div>

          {/* Check-in/out button */}
          <CheckInButton
            currentShift={currentShift}
            todayRecords={todayRecords}
            totalHoursToday={totalHoursToday}
            onCheckIn={checkIn}
            onCheckOut={checkOut}
          />

          {/* Today's shifts */}
          {todayRecords.length > 0 && (
            <div className="matt-shifts">
              <h3 className="matt-shifts-title">Chi tiết các ca</h3>
              {todayRecords.map((shift, idx) => (
                <div key={shift.id} className="matt-shift-row">
                  <span className="matt-shift-label">Ca {idx + 1}</span>
                  <span className="matt-shift-time">
                    {shift.check_in?.slice(0, 5)} - {shift.check_out?.slice(0, 5) || '...'}
                  </span>
                  <span className={`matt-shift-hours ${shift.check_out ? 'done' : 'active'}`}>
                    {shift.work_hours ? `${shift.work_hours}h` : 'Đang làm'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <AttendanceCalendar
          monthRecords={monthRecords}
          monthSummary={monthSummary}
          viewMonth={viewMonth}
          onChangeMonth={changeMonth}
        />
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useMobileAttendance } from '../../hooks/useMobileAttendance';
import CheckInButton from './CheckInButton';
import AttendanceCalendar from './AttendanceCalendar';
import AttendanceHistory from './AttendanceHistory';

export default function AttendancePage({ user, tenantId, onBack }) {
  const {
    todayRecords, currentShift, totalHoursToday,
    monthRecords, monthSummary, viewMonth,
    loading, checkIn, checkOut, changeMonth, refresh
  } = useMobileAttendance(user?.id, user?.name, tenantId);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [tab, setTab] = useState('today'); // 'today' | 'calendar' | 'history'

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
      {/* Back button when opened from MorePage */}
      {onBack && (
        <div className="mmore-sub-header">
          <button className="mmore-back-btn" onClick={onBack}>← Quay lại</button>
          <span className="mmore-sub-title">Chấm công</span>
        </div>
      )}
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
        <button
          className={`matt-tab ${tab === 'history' ? 'active' : ''}`}
          onClick={() => setTab('history')}
        >
          Lịch sử
        </button>
      </div>

      {tab === 'today' && (
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
            loading={loading}
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
      )}

      {tab === 'calendar' && (
        <AttendanceCalendar
          monthRecords={monthRecords}
          monthSummary={monthSummary}
          viewMonth={viewMonth}
          onChangeMonth={changeMonth}
        />
      )}

      {tab === 'history' && (
        <AttendanceHistory
          monthRecords={monthRecords}
          monthSummary={monthSummary}
          viewMonth={viewMonth}
          onChangeMonth={changeMonth}
        />
      )}
    </div>
  );
}

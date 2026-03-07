import React, { useState, useEffect } from 'react';
import { useMobileAttendance } from '../../hooks/useMobileAttendance';
import CheckInButton from './CheckInButton';
import AttendanceCalendar from './AttendanceCalendar';
import AttendanceHistory from './AttendanceHistory';

export default function AttendancePage({ user, tenantId, onBack }) {
  const {
    todayRecords, currentShift, totalHoursToday,
    monthRecords, monthSummary, viewMonth,
    loading, employeeId, employeeLoaded, workShift,
    checkIn, checkOut, changeMonth, extractTime, calculateHours, refresh
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

  // Chưa có hồ sơ nhân viên
  if (employeeLoaded && !employeeId) {
    return (
      <div className="mobile-page matt-page">
        {onBack && (
          <div className="mmore-sub-header">
            <button className="mmore-back-btn" onClick={onBack}>← Quay lại</button>
            <span className="mmore-sub-title">Chấm công</span>
          </div>
        )}
        <div className="matt-no-employee">
          <span style={{ fontSize: 48 }}>👤</span>
          <h3 style={{ margin: '12px 0 8px', fontSize: 16, fontWeight: 600 }}>Chưa có hồ sơ nhân viên</h3>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0, textAlign: 'center' }}>
            Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên. Vui lòng liên hệ quản trị viên.
          </p>
        </div>
      </div>
    );
  }

  // Format shift display
  const shiftLabel = workShift
    ? `${workShift.name || 'Ca làm việc'} ${workShift.start_time?.slice(0, 5)} - ${workShift.end_time?.slice(0, 5)}`
    : null;

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
            {shiftLabel && (
              <div className="matt-shift-info">{shiftLabel}</div>
            )}
          </div>

          {/* Check-in/out button */}
          <CheckInButton
            currentShift={currentShift}
            todayRecords={todayRecords}
            totalHoursToday={totalHoursToday}
            onCheckIn={checkIn}
            onCheckOut={checkOut}
            loading={loading}
            workShift={workShift}
            extractTime={extractTime}
            calculateHours={calculateHours}
          />

          {/* Today's shifts */}
          {todayRecords.length > 0 && (
            <div className="matt-shifts">
              <h3 className="matt-shifts-title">Chi tiết các ca</h3>
              {todayRecords.map((shift) => {
                const hours = calculateHours(shift.check_in, shift.check_out);
                const statusIcon = shift.status === 'late' ? '⏰' : shift.status === 'early_leave' ? '⚡' : '';
                return (
                  <div key={shift.id} className="matt-shift-row">
                    <span className="matt-shift-label">Ca {shift.shift_number || 1}</span>
                    <span className="matt-shift-time">
                      {extractTime(shift.check_in)} - {shift.check_out ? extractTime(shift.check_out) : '...'}
                    </span>
                    <span className={`matt-shift-hours ${shift.check_out ? 'done' : 'active'}`}>
                      {shift.check_out ? `${hours}h` : 'Đang làm'}
                      {statusIcon && ` ${statusIcon}`}
                    </span>
                  </div>
                );
              })}
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
          extractTime={extractTime}
          calculateHours={calculateHours}
        />
      )}
    </div>
  );
}

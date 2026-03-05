import React, { useState } from 'react';

export default function CheckInButton({ currentShift, todayRecords, totalHoursToday, onCheckIn, onCheckOut, loading }) {
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(null);

  const canCheckIn = !currentShift && !loading;
  const canCheckOut = !!currentShift && !loading;

  const handleAction = async (action) => {
    setProcessing(true);
    setMessage(null);
    try {
      if (action === 'in') {
        const data = await onCheckIn();
        setMessage({ type: 'success', text: `Check-in Ca ${todayRecords.length + 1} lúc ${data.check_in?.slice(0, 5)}!` });
      } else {
        const data = await onCheckOut();
        setMessage({ type: 'success', text: `Check-out thành công! ${data.work_hours}h` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="matt-checkin-area">
      {/* Status */}
      <div className={`matt-status ${currentShift ? 'working' : todayRecords.length > 0 ? 'done' : 'idle'}`}>
        {todayRecords.length === 0 && (
          <>
            <span className="matt-status-icon">⏳</span>
            <span>Chưa chấm công hôm nay</span>
          </>
        )}
        {currentShift && (
          <>
            <span className="matt-status-icon">🟢</span>
            <span>Đang làm việc - Ca {todayRecords.length}</span>
            <span className="matt-status-sub">Vào lúc {currentShift.check_in?.slice(0, 5)}</span>
          </>
        )}
        {todayRecords.length > 0 && !currentShift && (
          <>
            <span className="matt-status-icon">✅</span>
            <span>Hoàn thành {todayRecords.length} ca</span>
            <span className="matt-status-sub">Tổng: {totalHoursToday.toFixed(1)} giờ</span>
          </>
        )}
      </div>

      {/* Buttons */}
      <div className="matt-btn-group">
        <button
          className={`matt-btn matt-btn-in ${!canCheckIn ? 'disabled' : ''}`}
          onClick={() => handleAction('in')}
          disabled={!canCheckIn || processing}
        >
          {processing && canCheckIn ? '...' : '📥 CHECK-IN'}
        </button>
        <button
          className={`matt-btn matt-btn-out ${!canCheckOut ? 'disabled' : ''}`}
          onClick={() => handleAction('out')}
          disabled={!canCheckOut || processing}
        >
          {processing && canCheckOut ? '...' : '📤 CHECK-OUT'}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`matt-message ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

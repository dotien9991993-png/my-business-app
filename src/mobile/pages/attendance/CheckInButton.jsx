import React, { useState } from 'react';
import { haptic } from '../../utils/haptics';

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

export default function CheckInButton({
  currentShift, todayRecords, totalHoursToday,
  onCheckIn, onCheckOut, loading,
  workShift, extractTime, calculateHours
}) {
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
        haptic('heavy');
        const lateText = data._isLate ? ' (Đi trễ)' : '';
        setMessage({ type: 'success', text: `Check-in Ca ${data.shift_number || todayRecords.length} lúc ${data._extractedTime}!${lateText}` });
      } else {
        const data = await onCheckOut();
        haptic('heavy');
        const earlyText = data._isEarly ? ' (Về sớm)' : '';
        const hours = data._hours || calculateHours(data.check_in, data.check_out);
        setMessage({ type: 'success', text: `Check-out thành công! ${hours}h${earlyText}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Determine status display
  const getStatusDisplay = () => {
    if (todayRecords.length === 0) {
      return { cls: 'idle', icon: '⏳', text: 'Chưa chấm công hôm nay', sub: null };
    }
    if (currentShift) {
      const statusIcon = currentShift.status === 'late' ? '⏰' : '🟢';
      const lateText = currentShift.status === 'late' ? ' (Đi trễ)' : '';
      return {
        cls: currentShift.status === 'late' ? 'late' : 'working',
        icon: statusIcon,
        text: `Đang làm việc - Ca ${currentShift.shift_number || todayRecords.length}${lateText}`,
        sub: `Vào lúc ${extractTime(currentShift.check_in)}`
      };
    }
    // Đã hoàn thành
    const lastRec = todayRecords[todayRecords.length - 1];
    const statusIcon = STATUS_ICONS[lastRec?.status] || '✅';
    return {
      cls: 'done',
      icon: statusIcon,
      text: `Hoàn thành ${todayRecords.length} ca`,
      sub: `Tổng: ${totalHoursToday.toFixed(1)} giờ`
    };
  };

  const status = getStatusDisplay();

  return (
    <div className="matt-checkin-area">
      {/* Shift info */}
      {workShift && (
        <div className="matt-work-shift-info">
          📋 {workShift.name || 'Ca làm việc'} {workShift.start_time?.slice(0, 5)} - {workShift.end_time?.slice(0, 5)}
        </div>
      )}

      {/* Late badge */}
      {currentShift?.status === 'late' && (
        <div className="matt-late-badge">⏰ Đi trễ</div>
      )}

      {/* Status */}
      <div className={`matt-status ${status.cls}`}>
        <span className="matt-status-icon">{status.icon}</span>
        <span>{status.text}</span>
        {status.sub && <span className="matt-status-sub">{status.sub}</span>}
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

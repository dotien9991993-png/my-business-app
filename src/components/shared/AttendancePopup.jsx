import React from 'react';
import { supabase } from '../../supabaseClient';
import { getVietnamDate, getTodayVN } from '../../utils/dateUtils';

export default function AttendancePopup({ currentUser, tenant, todayAttendances, setTodayAttendances, onClose }) {
  const currentShift = todayAttendances.find(a => a.check_in && !a.check_out);
  const totalHours = todayAttendances.reduce((sum, a) => sum + parseFloat(a.work_hours || 0), 0);
  const canCheckIn = !currentShift;
  const canCheckOut = !!currentShift;

  const handleCheckIn = async () => {
    if (!canCheckIn) {
      alert('⚠️ Bạn đang có ca chưa check-out!');
      return;
    }
    try {
      const now = getVietnamDate();
      const checkInTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const { data, error } = await supabase.from('attendances').insert({
        tenant_id: tenant.id, user_id: currentUser.id, user_name: currentUser.name,
        date: getTodayVN(), check_in: checkInTime,
        status: 'checked_in', created_at: new Date().toISOString()
      }).select().single();
      if (error) throw error;
      setTodayAttendances([...todayAttendances, data]);
      alert(`✅ Check-in Ca ${todayAttendances.length + 1} lúc ${checkInTime}!`);
    } catch (err) {
      alert('❌ Lỗi: ' + err.message);
    }
  };

  const handleCheckOut = async () => {
    if (!canCheckOut) {
      alert('⚠️ Bạn chưa check-in!');
      return;
    }
    try {
      const now = getVietnamDate();
      const checkOutTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const [inH, inM] = currentShift.check_in.split(':').map(Number);
      const [outH, outM] = checkOutTime.split(':').map(Number);
      const workHours = ((outH * 60 + outM) - (inH * 60 + inM)) / 60;
      const { data, error } = await supabase.from('attendances').update({
        check_out: checkOutTime, work_hours: parseFloat(workHours.toFixed(2)), status: 'checked_out'
      }).eq('id', currentShift.id).select().single();
      if (error) throw error;
      setTodayAttendances(todayAttendances.map(a => a.id === currentShift.id ? data : a));
      alert(`✅ Check-out Ca ${todayAttendances.length} thành công!\nGiờ ca này: ${workHours.toFixed(2)} giờ`);
    } catch (err) {
      alert('❌ Lỗi: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white text-center">
          <div className="text-5xl mb-2">
            {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-blue-200">
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div className="mt-3 font-medium">{currentUser?.name}</div>
        </div>

        {/* Status & History */}
        <div className="p-6">
          <div className={`rounded-xl p-4 mb-4 text-center ${
            currentShift ? 'bg-blue-50 border border-blue-200' :
            todayAttendances.length > 0 ? 'bg-green-50 border border-green-200' :
            'bg-yellow-50 border border-yellow-200'
          }`}>
            {todayAttendances.length === 0 && (
              <div className="text-yellow-700">
                <span className="text-2xl">⏳</span>
                <div className="font-medium mt-1">Chưa chấm công hôm nay</div>
              </div>
            )}
            {currentShift && (
              <div className="text-blue-700">
                <span className="text-2xl">🟢</span>
                <div className="font-medium mt-1">Đang làm việc - Ca {todayAttendances.length}</div>
                <div className="text-sm">Vào lúc {currentShift.check_in?.slice(0,5)}</div>
              </div>
            )}
            {todayAttendances.length > 0 && !currentShift && (
              <div className="text-green-700">
                <span className="text-2xl">✅</span>
                <div className="font-medium mt-1">Đã hoàn thành {todayAttendances.length} ca</div>
                <div className="text-lg font-bold mt-1">Tổng: {totalHours.toFixed(2)} giờ</div>
              </div>
            )}
          </div>

          {todayAttendances.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="text-sm font-medium text-gray-600">📋 Chi tiết các ca:</div>
              {todayAttendances.map((shift, idx) => (
                <div key={shift.id} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium">Ca {idx + 1}</span>
                  <span>{shift.check_in?.slice(0,5)} - {shift.check_out?.slice(0,5) || '...'}</span>
                  <span className={shift.check_out ? 'text-green-600 font-medium' : 'text-blue-600'}>
                    {shift.work_hours ? `${shift.work_hours}h` : 'Đang làm'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={handleCheckIn}
              disabled={!canCheckIn}
              className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all ${
                !canCheckIn ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 text-white shadow-lg'
              }`}
            >
              📥 CHECK-IN
            </button>
            <button
              onClick={handleCheckOut}
              disabled={!canCheckOut}
              className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all ${
                !canCheckOut ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600 text-white shadow-lg'
              }`}
            >
              📤 CHECK-OUT
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-medium"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

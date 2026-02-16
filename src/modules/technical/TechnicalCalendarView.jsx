import React, { useState } from 'react';
import { formatMoney } from '../../utils/formatUtils';
import { getTodayVN } from '../../utils/dateUtils';
import { isAdmin } from '../../utils/permissionUtils';

const TechnicalCalendarView = ({
  technicalJobs,
  currentUser,
  setSelectedJob,
  setShowJobModal,
  setShowCreateJobModal,
  setPrefillJobData
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  // Lấy jobs của tháng hiện tại
  const getJobsInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return technicalJobs.filter(job => {
      if (!job.scheduledDate) return false;
      const jobDate = new Date(job.scheduledDate);
      return jobDate.getFullYear() === year && jobDate.getMonth() === month;
    });
  };

  // Đếm jobs theo ngày
  const getJobCountByDate = (dateStr) => {
    return technicalJobs.filter(j => j.scheduledDate === dateStr && j.status !== 'Hủy').length;
  };

  // Lấy jobs của ngày được chọn
  const getJobsForDate = (dateStr) => {
    return technicalJobs.filter(j => j.scheduledDate === dateStr && j.status !== 'Hủy')
      .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
  };

  // Tạo calendar grid
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay(); // 0 = Sunday
    const daysInMonth = lastDay.getDate();

    const days = [];

    // Padding đầu tháng
    for (let i = 0; i < startPadding; i++) {
      days.push({ day: null, date: null });
    }

    // Các ngày trong tháng
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ day: d, date: dateStr });
    }

    return days;
  };

  const todayStr = getTodayVN();
  const days = generateCalendarDays();
  const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
                      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(todayStr);
  };

  // Thống kê tháng
  const monthJobs = getJobsInMonth();
  const pendingJobs = monthJobs.filter(j => j.status !== 'Hoàn thành' && j.status !== 'Hủy').length;
  const completedJobs = monthJobs.filter(j => j.status === 'Hoàn thành').length;
  const totalRevenue = monthJobs.filter(j => j.status !== 'Hủy').reduce((sum, j) => sum + (j.customerPayment || 0), 0);

  return (
    <div className="p-3 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-2 hover:bg-white/20 rounded-lg">◀</button>
          <div className="text-center">
            <div className="text-xl font-bold">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</div>
          </div>
          <button onClick={nextMonth} className="p-2 hover:bg-white/20 rounded-lg">▶</button>
        </div>
        <button onClick={goToToday} className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium">
          📅 Về hôm nay
        </button>
      </div>

      {/* Thống kê tháng */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-blue-600">{pendingJobs}</div>
          <div className="text-xs text-blue-600">Chờ làm</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-green-600">{completedJobs}</div>
          <div className="text-xs text-green-600">Hoàn thành</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-amber-600">{formatMoney(totalRevenue)}</div>
          <div className="text-xs text-amber-600">Doanh thu</div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-gray-100">
          {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-600">{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {days.map((item, idx) => {
            if (!item.day) return <div key={idx} className="h-12 bg-gray-50" />;

            const jobCount = getJobCountByDate(item.date);
            const isToday = item.date === todayStr;
            const isSelected = item.date === selectedDate;
            const hasJobs = jobCount > 0;

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(item.date === selectedDate ? null : item.date)}
                className={`h-12 md:h-14 flex flex-col items-center justify-center relative border-b border-r transition-all ${
                  isSelected ? 'bg-blue-100 ring-2 ring-blue-500' :
                  isToday ? 'bg-orange-50' :
                  hasJobs ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`text-sm font-medium ${
                  isToday ? 'text-orange-600 font-bold' :
                  isSelected ? 'text-blue-700' : 'text-gray-700'
                }`}>
                  {item.day}
                </span>
                {hasJobs && (
                  <span className={`text-[10px] px-1.5 rounded-full mt-0.5 ${
                    isSelected ? 'bg-blue-500 text-white' : 'bg-green-500 text-white'
                  }`}>
                    {jobCount}
                  </span>
                )}
                {isToday && (
                  <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-orange-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Jobs */}
      {selectedDate && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800">
              📅 {new Date(selectedDate).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <button
              onClick={() => setSelectedDate(null)}
              className="text-gray-400 hover:text-gray-600"
            >✕</button>
          </div>

          {getJobsForDate(selectedDate).length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <div className="text-3xl mb-2">📭</div>
              <div>Không có công việc</div>
            </div>
          ) : (
            <div className="space-y-2">
              {getJobsForDate(selectedDate).map(job => {
                // Kiểm tra quyền xem chi tiết: admin, người tạo, hoặc KTV được phân công
                const isCreator = job.createdBy === currentUser.name;
                const isTechnician = job.technicians?.includes(currentUser.name);
                const canViewDetail = isAdmin(currentUser) || isCreator || isTechnician;

                return (
                  <div
                    key={job.id}
                    onClick={() => {
                      if (canViewDetail) {
                        setSelectedJob(job);
                        setShowJobModal(true);
                      }
                    }}
                    className={`p-3 rounded-lg border-l-4 transition-all ${
                      job.status === 'Hoàn thành' ? 'bg-green-50 border-green-500' :
                      job.status === 'Đang làm' ? 'bg-blue-50 border-blue-500' :
                      'bg-amber-50 border-amber-500'
                    } ${canViewDetail ? 'cursor-pointer hover:shadow' : 'cursor-default opacity-80'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-gray-800">{job.scheduledTime || '—'}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        job.status === 'Hoàn thành' ? 'bg-green-100 text-green-700' :
                        job.status === 'Đang làm' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {job.status || 'Chờ XN'}
                      </span>
                    </div>
                    <div className="font-medium text-gray-700 text-sm">{job.title}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      🔧 {job.technicians?.join(', ') || 'Chưa phân công'}
                    </div>
                    {/* Chỉ hiện thông tin chi tiết nếu có quyền */}
                    {canViewDetail ? (
                      <>
                        <div className="text-xs text-gray-500">👤 {job.customerName}</div>
                        {job.customerPayment > 0 && (
                          <div className="text-xs font-medium text-green-600 mt-1">💰 {formatMoney(job.customerPayment)}</div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-gray-400 mt-1 italic">🔒 Xem chi tiết: liên hệ người tạo/KTV</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {selectedDate >= todayStr && (
            <button
              onClick={() => {
                setPrefillJobData({ scheduledDate: selectedDate });
                setShowCreateJobModal(true);
              }}
              className="w-full mt-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
            >
              ➕ Thêm công việc ngày này
            </button>
          )}
        </div>
      )}

      {/* Upcoming Jobs Preview */}
      {!selectedDate && (
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-bold text-gray-800 mb-3">📋 Công việc sắp tới</h3>
          {technicalJobs
            .filter(j => j.scheduledDate >= todayStr && j.status !== 'Hủy' && j.status !== 'Hoàn thành')
            .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || (a.scheduledTime || '').localeCompare(b.scheduledTime || ''))
            .slice(0, 5)
            .map(job => {
              // Kiểm tra quyền xem chi tiết
              const isCreator = job.createdBy === currentUser.name;
              const isTechnician = job.technicians?.includes(currentUser.name);
              const canViewDetail = isAdmin(currentUser) || isCreator || isTechnician;

              return (
                <div
                  key={job.id}
                  onClick={() => {
                    if (canViewDetail) {
                      setSelectedJob(job);
                      setShowJobModal(true);
                    }
                  }}
                  className={`flex items-center gap-3 py-2 border-b last:border-0 rounded ${
                    canViewDetail ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${
                    job.scheduledDate === todayStr ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {new Date(job.scheduledDate).getDate()}/{new Date(job.scheduledDate).getMonth() + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 text-sm truncate">{job.title}</div>
                    <div className="text-xs text-gray-500">
                      {job.scheduledTime} • {canViewDetail ? job.customerName : '🔒'}
                    </div>
                  </div>
                  {canViewDetail ? (
                    <span className="text-gray-400">→</span>
                  ) : (
                    <span className="text-gray-300 text-xs">🔒</span>
                  )}
                </div>
              );
            })
          }
          {technicalJobs.filter(j => j.scheduledDate >= todayStr && j.status !== 'Hủy' && j.status !== 'Hoàn thành').length === 0 && (
            <div className="text-center py-4 text-gray-500">
              Không có công việc sắp tới
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TechnicalCalendarView;

import React, { useState, useEffect, useMemo } from 'react';
import { formatMoney } from '../../utils/formatUtils';
import { getVietnamDate, getTodayVN } from '../../utils/dateUtils';

const TodayJobsDashboard = ({
  technicalJobs,
  currentUser,
  setSelectedJob,
  setShowJobModal
}) => {
  const [currentTime, setCurrentTime] = useState(getVietnamDate());
  const [audioEnabled, setAudioEnabled] = useState(true);


  // Update time mỗi phút
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getVietnamDate());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Lọc công việc hôm nay
  const todayJobs = useMemo(() => {
    const today = getTodayVN();
    return technicalJobs
      .filter(job => {
        if (job.scheduledDate !== today) return false;
        if (job.status === 'Hủy') return false;
        if (currentUser.role !== 'Admin' && currentUser.role !== 'admin' && currentUser.role !== 'Manager') {
          if (job.createdBy !== currentUser.name &&
              (!job.technicians || !job.technicians.includes(currentUser.name))) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const timeA = a.scheduledTime || '00:00';
        const timeB = b.scheduledTime || '00:00';
        return timeA.localeCompare(timeB);
      });
  }, [technicalJobs, currentUser]);

  // Phân loại công việc theo độ ưu tiên
  const categorizedJobs = useMemo(() => {
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    return todayJobs.map(job => {
      const [jobHour, jobMinute] = (job.scheduledTime || '09:00').split(':').map(Number);
      const jobTotalMinutes = jobHour * 60 + jobMinute;
      const diffMinutes = jobTotalMinutes - currentTotalMinutes;

      let category = 'upcoming';
      let urgency = 'normal';
      let countdown = null;

      if (job.status === 'Hoàn thành') {
        category = 'completed';
        urgency = 'done';
      } else if (diffMinutes < -60) {
        category = 'overdue';
        urgency = 'critical';
        countdown = Math.abs(diffMinutes);
      } else if (diffMinutes < 0) {
        category = 'overdue';
        urgency = 'warning';
        countdown = Math.abs(diffMinutes);
      } else if (diffMinutes <= 30) {
        category = 'urgent';
        urgency = 'critical';
        countdown = diffMinutes;
      } else if (diffMinutes <= 120) {
        category = 'soon';
        urgency = 'warning';
        countdown = diffMinutes;
      } else {
        category = 'upcoming';
        urgency = 'normal';
        countdown = diffMinutes;
      }

      return { ...job, category, urgency, countdown, diffMinutes };
    });
  }, [todayJobs, currentTime]);

  // Thống kê
  const stats = useMemo(() => {
    const overdue = categorizedJobs.filter(j => j.category === 'overdue').length;
    const urgent = categorizedJobs.filter(j => j.category === 'urgent').length;
    const soon = categorizedJobs.filter(j => j.category === 'soon').length;
    const upcoming = categorizedJobs.filter(j => j.category === 'upcoming').length;
    const completed = categorizedJobs.filter(j => j.category === 'completed').length;
    const total = categorizedJobs.length;
    const totalRevenue = categorizedJobs.reduce((sum, j) => sum + (j.customerPayment || 0), 0);
    return { overdue, urgent, soon, upcoming, completed, total, totalRevenue };
  }, [categorizedJobs]);

  // Mở Google Maps điều hướng - Hỗ trợ link Google Maps, tọa độ GPS và địa chỉ thường
  const openNavigation = (job) => {
    const address = job.address || '';

    // Kiểm tra nếu là link Google Maps
    if (address.includes('google.com/maps') || address.includes('goo.gl/maps') || address.includes('maps.app.goo.gl')) {
      window.open(address, '_blank');
    }
    // Kiểm tra nếu là tọa độ GPS (vd: 21.0285,105.8542 hoặc 21.0285, 105.8542)
    else if (/^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(address.trim())) {
      const coords = address.replace(/\s/g, '');
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${coords}`, '_blank');
    }
    // Nếu là địa chỉ thường, tìm kiếm trên Google Maps
    else {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
      window.open(url, '_blank');
    }
  };

  // Format countdown
  const formatCountdown = (minutes) => {
    if (minutes < 60) return `${minutes} phút`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}p` : `${hours} giờ`;
  };

  // Styles theo mức độ ưu tiên
  const getUrgencyStyles = (urgency) => {
    const styles = {
      critical: {
        card: 'bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-red-500 shadow-lg shadow-red-100',
        badge: 'bg-red-500 text-white animate-pulse',
        text: 'text-red-700',
        icon: '🚨'
      },
      warning: {
        card: 'bg-gradient-to-r from-amber-50 to-yellow-50 border-l-4 border-amber-500 shadow-md shadow-amber-100',
        badge: 'bg-amber-500 text-white',
        text: 'text-amber-700',
        icon: '⚠️'
      },
      normal: {
        card: 'bg-white border-l-4 border-blue-400 shadow hover:shadow-md',
        badge: 'bg-blue-100 text-blue-700',
        text: 'text-blue-700',
        icon: '📋'
      },
      done: {
        card: 'bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-500 opacity-75',
        badge: 'bg-green-500 text-white',
        text: 'text-green-700',
        icon: '✅'
      }
    };
    return styles[urgency] || styles.normal;
  };

  // Job Card Component - Compact version
  const TodayJobCard = ({ job }) => {
    const style = getUrgencyStyles(job.urgency);
    const isOverdue = job.category === 'overdue';

    return (
      <div className={`${style.card} rounded-lg p-3 transition-all`}>
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{style.icon}</span>
            <span className="font-bold">{job.scheduledTime || '09:00'}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${style.badge}`}>
              {job.type || 'Lắp đặt'}
            </span>
            {job.countdown !== null && job.category !== 'completed' && (
              <span className={`text-xs font-medium ${style.text}`}>
                {isOverdue ? `(-${formatCountdown(job.countdown)})` : `(${formatCountdown(job.countdown)})`}
              </span>
            )}
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
            job.status === 'Hoàn thành' ? 'bg-green-100 text-green-700' :
            job.status === 'Đang làm' ? 'bg-blue-100 text-blue-700' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {job.status || 'Chờ XN'}
          </span>
        </div>

        {/* Title & Customer */}
        <div
          className="font-semibold text-gray-800 text-sm cursor-pointer hover:text-blue-600 mb-1"
          onClick={() => {
            setSelectedJob(job);
            setShowJobModal(true);
          }}
        >
          {job.title}
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
          <span>👤 {job.customerName}</span>
          <a href={`tel:${job.customerPhone}`} className="text-green-600 font-medium">📞 {job.customerPhone}</a>
        </div>

        <div className="text-xs text-gray-500 mb-2 line-clamp-1">📍 {job.address}</div>

        {/* KTV & Payment */}
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-purple-600">🔧 {job.technicians?.join(', ') || 'Chưa phân công'}</span>
          {job.customerPayment > 0 && (
            <span className="font-bold text-green-600">💰 {formatMoney(job.customerPayment)}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => openNavigation(job)}
            className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1"
          >
            🗺️ Chỉ đường
          </button>
          <button
            onClick={() => {
              setSelectedJob(job);
              setShowJobModal(true);
            }}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
          >
            Chi tiết
          </button>
        </div>
      </div>
    );
  };

  // Empty state
  if (todayJobs.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">Hôm nay không có lịch!</h3>
          <p className="text-gray-500">Không có công việc kỹ thuật nào được lên lịch cho hôm nay.</p>
          <div className="mt-4 text-sm text-gray-400">
            {currentTime.toLocaleDateString('vi-VN', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            })}
          </div>
        </div>
      </div>
    );
  }

  // Main render
  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4">
      {/* Header - Thu gọn */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-xl p-3 md:p-4 text-white shadow-lg">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-2xl md:text-3xl font-mono font-bold">
              {currentTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="hidden md:block">
              <div className="text-sm opacity-80">
                {currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'short' })}
              </div>
              <div className="font-semibold">Lịch Hôm Nay</div>
            </div>
          </div>

          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-2 rounded-lg text-sm transition-all ${
              audioEnabled ? 'bg-white/20' : 'bg-red-500/50'
            }`}
          >
            {audioEnabled ? '🔔' : '🔕'}
          </button>
        </div>
      </div>

      {/* Stats - Thu gọn thành 1 dòng */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="flex-shrink-0 bg-white rounded-lg px-3 py-2 shadow border-l-3 border-indigo-500 flex items-center gap-2">
          <span className="text-lg md:text-xl font-bold text-indigo-600">{stats.total}</span>
          <span className="text-xs text-gray-500">Tổng</span>
        </div>

        {stats.overdue > 0 && (
          <div className="flex-shrink-0 bg-red-50 rounded-lg px-3 py-2 shadow border-l-3 border-red-500 flex items-center gap-2 animate-pulse">
            <span className="text-lg md:text-xl font-bold text-red-600">{stats.overdue}</span>
            <span className="text-xs text-red-600">🚨 Trễ</span>
          </div>
        )}

        {stats.urgent > 0 && (
          <div className="flex-shrink-0 bg-orange-50 rounded-lg px-3 py-2 shadow border-l-3 border-orange-500 flex items-center gap-2">
            <span className="text-lg md:text-xl font-bold text-orange-600">{stats.urgent}</span>
            <span className="text-xs text-orange-600">⚡ Gấp</span>
          </div>
        )}

        {stats.soon > 0 && (
          <div className="flex-shrink-0 bg-amber-50 rounded-lg px-3 py-2 shadow border-l-3 border-amber-500 flex items-center gap-2">
            <span className="text-lg md:text-xl font-bold text-amber-600">{stats.soon}</span>
            <span className="text-xs text-amber-600">⏰ 2h</span>
          </div>
        )}

        <div className="flex-shrink-0 bg-blue-50 rounded-lg px-3 py-2 shadow border-l-3 border-blue-500 flex items-center gap-2">
          <span className="text-lg md:text-xl font-bold text-blue-600">{stats.upcoming}</span>
          <span className="text-xs text-blue-600">📋 Chờ</span>
        </div>

        <div className="flex-shrink-0 bg-green-50 rounded-lg px-3 py-2 shadow border-l-3 border-green-500 flex items-center gap-2">
          <span className="text-lg md:text-xl font-bold text-green-600">{stats.completed}</span>
          <span className="text-xs text-green-600">✅ Xong</span>
        </div>
      </div>

      {/* Doanh thu - Thu gọn */}
      {stats.totalRevenue > 0 && (
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg px-3 py-2 text-white shadow flex items-center justify-between">
          <span className="text-sm">💰 Doanh thu dự kiến:</span>
          <span className="font-bold">{formatMoney(stats.totalRevenue)}</span>
        </div>
      )}

      {/* Công việc quá hạn */}
      {stats.overdue > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3">
          <h3 className="text-sm font-bold text-red-700 mb-2">🚨 QUÁ HẠN ({stats.overdue})</h3>
          <div className="space-y-2">
            {categorizedJobs.filter(j => j.category === 'overdue').map(job => (
              <TodayJobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Công việc sắp đến giờ */}
      {stats.urgent > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-3">
          <h3 className="text-sm font-bold text-orange-700 mb-2">⚡ SẮP ĐẾN ({stats.urgent})</h3>
          <div className="space-y-2">
            {categorizedJobs.filter(j => j.category === 'urgent').map(job => (
              <TodayJobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Trong 2 giờ tới */}
      {stats.soon > 0 && (
        <div>
          <h3 className="text-sm font-bold text-amber-700 mb-2">⏰ Trong 2h ({stats.soon})</h3>
          <div className="space-y-2">
            {categorizedJobs.filter(j => j.category === 'soon').map(job => (
              <TodayJobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Còn lại */}
      {stats.upcoming > 0 && (
        <div>
          <h3 className="text-sm font-bold text-blue-700 mb-2">📋 Còn lại ({stats.upcoming})</h3>
          <div className="space-y-2">
            {categorizedJobs.filter(j => j.category === 'upcoming').map(job => (
              <TodayJobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Đã hoàn thành */}
      {stats.completed > 0 && (
        <div className="opacity-60">
          <h3 className="text-sm font-bold text-green-700 mb-2">✅ Xong ({stats.completed})</h3>
          <div className="space-y-2">
            {categorizedJobs.filter(j => j.category === 'completed').map(job => (
              <TodayJobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Lộ trình */}
      <div className="bg-white rounded-xl p-3 shadow">
        <h3 className="text-sm font-bold text-gray-700 mb-2">🗺️ Lộ Trình</h3>
        <div className="space-y-2">
          {categorizedJobs.filter(j => j.category !== 'completed').map((job, index) => (
            <div
              key={job.id}
              className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
              onClick={() => openNavigation(job)}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-white text-xs ${
                job.urgency === 'critical' ? 'bg-red-500' :
                job.urgency === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
              }`}>
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 truncate text-sm">{job.title}</div>
                <div className="text-xs text-gray-500 truncate">{job.address}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-gray-700 text-sm">{job.scheduledTime}</div>
                <div className="text-blue-600 text-xs">Chỉ đường →</div>
              </div>
            </div>
          ))}
        </div>

        {categorizedJobs.filter(j => j.category !== 'completed').length > 1 && (
          <button
            onClick={() => {
              const jobs = categorizedJobs.filter(j => j.category !== 'completed');
              // Lọc các job có địa chỉ thường (không phải link)
              const normalAddresses = jobs
                .filter(j => !j.address?.includes('google.com/maps') && !j.address?.includes('goo.gl') && !j.address?.includes('maps.app.goo.gl'))
                .map(j => encodeURIComponent(j.address));

              if (normalAddresses.length > 1) {
                window.open(`https://www.google.com/maps/dir/${normalAddresses.join('/')}`, '_blank');
              } else if (normalAddresses.length === 1) {
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${normalAddresses[0]}`, '_blank');
              } else {
                alert('Các công việc đều có link Google Maps riêng. Vui lòng mở từng công việc.');
              }
            }}
            className="w-full mt-2 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
          >
            🗺️ Mở lộ trình Google Maps
          </button>
        )}
      </div>
    </div>
  );
};

export default TodayJobsDashboard;

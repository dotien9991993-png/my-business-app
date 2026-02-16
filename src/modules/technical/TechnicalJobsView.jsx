import React, { useState } from 'react';
import { isAdmin } from '../../utils/permissionUtils';

const TechnicalJobsView = ({
  technicalJobs,
  currentUser,
  jobFilterCreator,
  setJobFilterCreator,
  jobFilterTechnician,
  setJobFilterTechnician,
  jobFilterStatus,
  setJobFilterStatus,
  jobFilterDateMode,
  setJobFilterDateMode,
  jobFilterMonth,
  setJobFilterMonth,
  jobFilterYear,
  setJobFilterYear,
  jobCustomStartDate,
  setJobCustomStartDate,
  jobCustomEndDate,
  setJobCustomEndDate,
  setSelectedJob,
  setShowJobModal,
  setShowCreateJobModal
}) => {
  // Lấy danh sách người tạo và kỹ thuật viên unique
  const creators = [...new Set(technicalJobs.map(j => j.createdBy).filter(Boolean))];
  const technicians = [...new Set(technicalJobs.flatMap(j => j.technicians || []))];

  const visibleJobs = technicalJobs.filter(job => {
    // Admin và Manager thấy tất cả
    if (isAdmin(currentUser) || currentUser.role === 'Manager') return true;

    // Người tạo luôn thấy job của mình
    if (job.createdBy === currentUser.name) return true;

    // Technical members thấy jobs được assign
    if (currentUser.departments && currentUser.departments.includes('technical')) {
      if (job.technicians && job.technicians.includes(currentUser.name)) return true;
    }

    return false;
  });

  // Áp dụng filter
  const filteredJobs = visibleJobs.filter(job => {
    // Filter theo người tạo
    if (jobFilterCreator !== 'all' && job.createdBy !== jobFilterCreator) return false;

    // Filter theo kỹ thuật viên
    if (jobFilterTechnician !== 'all') {
      if (!job.technicians || !job.technicians.includes(jobFilterTechnician)) return false;
    }

    // Filter theo trạng thái
    if (jobFilterStatus !== 'all' && job.status !== jobFilterStatus) return false;

    // Filter theo ngày
    if (jobFilterDateMode === 'month') {
      const jobDate = new Date(job.scheduledDate);
      if (jobDate.getMonth() + 1 !== jobFilterMonth || jobDate.getFullYear() !== jobFilterYear) return false;
    } else if (jobFilterDateMode === 'custom' && jobCustomStartDate && jobCustomEndDate) {
      const jobDate = new Date(job.scheduledDate);
      const start = new Date(jobCustomStartDate);
      const end = new Date(jobCustomEndDate);
      end.setDate(end.getDate() + 1);
      if (jobDate < start || jobDate >= end) return false;
    }

    return true;
  });

  const getStatusColor = (status) => {
    const colors = {
      'Chờ XN': 'bg-yellow-100 text-yellow-800',
      'Đang làm': 'bg-blue-100 text-blue-800',
      'Hoàn thành': 'bg-green-100 text-green-800',
      'Hủy': 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100';
  };

  // Reset tất cả filter
  const resetFilters = () => {
    setJobFilterCreator('all');
    setJobFilterTechnician('all');
    setJobFilterStatus('all');
    setJobFilterDateMode('all');
  };

  const hasActiveFilter = jobFilterCreator !== 'all' || jobFilterTechnician !== 'all' ||
                         jobFilterStatus !== 'all' || jobFilterDateMode !== 'all';

  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="p-3 md:p-6">
      <div className="flex justify-between items-center gap-2 mb-3">
        <h2 className="text-lg md:text-xl font-bold">🔧 Công Việc</h2>
        <button
          onClick={() => setShowCreateJobModal(true)}
          className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium text-sm"
        >
          ➕ Tạo mới
        </button>
      </div>

      {/* Filter Section - Compact */}
      <div className="bg-white rounded-lg shadow mb-3">
        {/* Filter Header - Always visible */}
        <div
          className="flex items-center justify-between p-2 cursor-pointer"
          onClick={() => setShowFilters(!showFilters)}
        >
          <div className="flex items-center gap-2 text-sm">
            <span>🔍</span>
            <span className="font-medium">Lọc</span>
            <span className="text-gray-500">({filteredJobs.length}/{visibleJobs.length})</span>
            {hasActiveFilter && (
              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-xs">Đang lọc</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilter && (
              <button
                onClick={(e) => { e.stopPropagation(); resetFilters(); }}
                className="text-xs text-red-600 hover:text-red-700"
              >
                ✕ Xóa
              </button>
            )}
            <span className="text-gray-400">{showFilters ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Filter Content - Collapsible */}
        {showFilters && (
          <div className="p-2 pt-0 border-t space-y-2">
            {/* Row 1: 4 filters inline on desktop, 2x2 on mobile */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select
                value={jobFilterCreator}
                onChange={(e) => setJobFilterCreator(e.target.value)}
                className="px-2 py-1.5 border rounded text-xs"
              >
                <option value="all">👤 Người tạo</option>
                {creators.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={jobFilterTechnician}
                onChange={(e) => setJobFilterTechnician(e.target.value)}
                className="px-2 py-1.5 border rounded text-xs"
              >
                <option value="all">🔧 KTV</option>
                {technicians.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={jobFilterStatus}
                onChange={(e) => setJobFilterStatus(e.target.value)}
                className="px-2 py-1.5 border rounded text-xs"
              >
                <option value="all">📊 Trạng thái</option>
                <option value="Chờ XN">Chờ XN</option>
                <option value="Đang làm">Đang làm</option>
                <option value="Hoàn thành">Hoàn thành</option>
                <option value="Hủy">Hủy</option>
              </select>

              <select
                value={jobFilterDateMode}
                onChange={(e) => setJobFilterDateMode(e.target.value)}
                className="px-2 py-1.5 border rounded text-xs"
              >
                <option value="all">📅 Thời gian</option>
                <option value="month">Theo tháng</option>
                <option value="custom">Tùy chỉnh</option>
              </select>
            </div>

            {/* Row 2: Date filters if needed */}
            {jobFilterDateMode === 'month' && (
              <div className="flex gap-2">
                <select
                  value={jobFilterMonth}
                  onChange={(e) => setJobFilterMonth(parseInt(e.target.value))}
                  className="flex-1 px-2 py-1.5 border rounded text-xs"
                >
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                    <option key={m} value={m}>Tháng {m}</option>
                  ))}
                </select>
                <select
                  value={jobFilterYear}
                  onChange={(e) => setJobFilterYear(parseInt(e.target.value))}
                  className="flex-1 px-2 py-1.5 border rounded text-xs"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {jobFilterDateMode === 'custom' && (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={jobCustomStartDate}
                  onChange={(e) => setJobCustomStartDate(e.target.value)}
                  className="flex-1 px-2 py-1.5 border rounded text-xs"
                  placeholder="Từ"
                />
                <input
                  type="date"
                  value={jobCustomEndDate}
                  onChange={(e) => setJobCustomEndDate(e.target.value)}
                  className="flex-1 px-2 py-1.5 border rounded text-xs"
                  placeholder="Đến"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3">
        {filteredJobs.length === 0 ? (
          <div className="bg-white p-12 rounded-xl text-center text-gray-500">
            <div className="text-6xl mb-4">🔧</div>
            <div className="text-xl">Không có công việc nào phù hợp</div>
            {hasActiveFilter && (
              <button
                onClick={resetFilters}
                className="mt-4 text-orange-600 hover:text-orange-700"
              >
                Xóa bộ lọc để xem tất cả
              </button>
            )}
          </div>
        ) : (
          filteredJobs.map(job => (
            <div
              key={job.id}
              onClick={() => {
                setSelectedJob(job);
                setShowJobModal(true);
              }}
              className="bg-white rounded-xl shadow hover:shadow-lg transition-all cursor-pointer border-l-4 border-orange-500 overflow-hidden"
            >
              {/* Header với ngày và trạng thái */}
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-2 border-b flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📅</span>
                  <span className="font-bold text-orange-700">
                    {job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'Chưa xếp lịch'}
                  </span>
                  {job.scheduledTime && (
                    <span className="text-orange-600 font-medium">• {job.scheduledTime}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                    {job.status}
                  </span>
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                    {job.type}
                  </span>
                </div>
              </div>

              {/* Body - Thông tin chính */}
              <div className="p-4">
                {/* Tiêu đề công việc */}
                <h3 className="text-lg font-bold text-gray-800 mb-3">{job.title}</h3>

                {/* Grid thông tin quan trọng */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Cột trái - Khách hàng */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-2">
                      <span className="text-blue-500">👤</span>
                      <div>
                        <div className="font-semibold text-blue-800">{job.customerName}</div>
                        <div className="text-blue-600 text-sm">{job.customerPhone}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-gray-600 text-sm">
                      <span>📍</span>
                      <span className="line-clamp-2">{job.address}</span>
                    </div>
                  </div>

                  {/* Cột phải - KTV & Tiền */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 bg-purple-50 rounded-lg p-2">
                      <span className="text-purple-500">🔧</span>
                      <div className="text-sm">
                        <div className="text-purple-600 font-medium">Kỹ thuật viên:</div>
                        <div className="text-purple-800 font-semibold">
                          {job.technicians && job.technicians.length > 0 ? job.technicians.join(', ') : 'Chưa phân công'}
                        </div>
                      </div>
                    </div>

                    {/* Tiền thu - Nổi bật */}
                    {job.customerPayment > 0 ? (
                      <div className="flex items-center gap-2 bg-green-100 rounded-lg p-2 border border-green-300">
                        <span className="text-xl">💰</span>
                        <div>
                          <div className="text-xs text-green-600">Thu khách</div>
                          <div className="font-bold text-green-700 text-lg">
                            {job.customerPayment.toLocaleString('vi-VN')}đ
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-2 text-gray-500 text-sm">
                        <span>💰</span>
                        <span>Chưa nhập tiền thu</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Nút Google Maps */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const address = job.address || '';
                    if (address.includes('google.com/maps') || address.includes('goo.gl/maps') || address.includes('maps.app.goo.gl')) {
                      window.open(address, '_blank');
                    } else if (/^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(address.trim())) {
                      const coords = address.replace(/\s/g, '');
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${coords}`, '_blank');
                    } else {
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, '_blank');
                    }
                  }}
                  className="w-full mt-3 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <span className="text-lg">🗺️</span>
                  <span>Mở Google Maps</span>
                </button>

                {/* Footer - Người tạo */}
                {job.createdBy && (
                  <div className="mt-3 pt-2 border-t text-xs text-gray-500 flex items-center gap-1">
                    <span>📝</span>
                    <span>Người tạo: {job.createdBy}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TechnicalJobsView;

import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { isAdmin as checkIsAdmin } from '../../utils/permissionUtils';

export default function AttendanceView({ currentUser, tenant, setShowAttendancePopup }) {
  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [viewMode, setViewMode] = useState('my'); // 'my' or 'all'
  const [allAttendances, setAllAttendances] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = checkIsAdmin(currentUser);

  // Load attendance data
  useEffect(() => {
    const loadData = async () => {
      if (!tenant || !currentUser) return;
      setLoading(true);
      try {
        let query = supabase
          .from('attendances')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('date', { ascending: false })
          .order('check_in', { ascending: true });

        if (!isAdmin) {
          query = query.eq('user_id', currentUser.id);
        }

        const { data, error } = await query.limit(500);
        if (error) throw error;
        setAllAttendances(data || []);
      } catch (err) {
        console.error('Error loading attendances:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [tenant, currentUser, isAdmin]);

  // Filter attendances theo tháng
  const filteredAttendances = allAttendances.filter(a => {
    if (filterMonth && a.date) {
      if (!a.date.startsWith(filterMonth)) return false;
    }
    if (viewMode === 'my') {
      return a.user_id === currentUser?.id;
    }
    return true;
  });

  // Tính tổng giờ làm trong tháng (của user hiện tại)
  const myAttendances = filteredAttendances.filter(a => a.user_id === currentUser?.id);
  const totalHours = myAttendances.reduce((sum, a) => sum + parseFloat(a.work_hours || 0), 0);
  const totalShifts = myAttendances.filter(a => a.check_in).length;

  // Đếm số ngày (unique dates)
  const uniqueDates = [...new Set(myAttendances.map(a => a.date))];
  const totalDays = uniqueDates.length;

  // Nhóm theo user (cho Admin)
  const groupedByUser = {};
  if (isAdmin && viewMode === 'all') {
    filteredAttendances.forEach(a => {
      if (!groupedByUser[a.user_name]) {
        groupedByUser[a.user_name] = { shifts: 0, hours: 0, dates: new Set() };
      }
      groupedByUser[a.user_name].shifts++;
      groupedByUser[a.user_name].hours += parseFloat(a.work_hours || 0);
      groupedByUser[a.user_name].dates.add(a.date);
    });
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">⏳</div>
          <div>Đang tải dữ liệu...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">⏰ Chấm Công</h2>
          <p className="text-gray-600 text-sm">Lịch sử và thống kê chấm công</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button
                onClick={() => setViewMode('my')}
                className={`px-4 py-2 rounded-lg font-medium ${viewMode === 'my' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                📋 Của tôi
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`px-4 py-2 rounded-lg font-medium ${viewMode === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                👥 Tất cả
              </button>
            </>
          )}
          <button
            onClick={() => setShowAttendancePopup(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
          >
            ⏰ Chấm công ngay
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <div className="text-gray-500 text-sm">📅 Số ngày công</div>
          <div className="text-2xl font-bold text-blue-600">{totalDays} ngày</div>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <div className="text-gray-500 text-sm">🔄 Số ca làm</div>
          <div className="text-2xl font-bold text-purple-600">{totalShifts} ca</div>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <div className="text-gray-500 text-sm">⏱️ Tổng giờ làm</div>
          <div className="text-2xl font-bold text-green-600">{totalHours.toFixed(1)} giờ</div>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <div className="text-gray-500 text-sm">📊 TB giờ/ngày</div>
          <div className="text-2xl font-bold text-orange-600">
            {totalDays > 0 ? (totalHours / totalDays).toFixed(1) : 0} giờ
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl p-4 border shadow-sm">
        <div className="flex items-center gap-4">
          <label className="font-medium">📅 Tháng:</label>
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          />
        </div>
      </div>

      {/* Admin View - Summary by User */}
      {isAdmin && viewMode === 'all' && Object.keys(groupedByUser).length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-bold">👥 Tổng hợp theo nhân viên - Tháng {filterMonth}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Nhân viên</th>
                  <th className="px-4 py-3 text-center">Số ngày</th>
                  <th className="px-4 py-3 text-center">Số ca</th>
                  <th className="px-4 py-3 text-center">Tổng giờ</th>
                  <th className="px-4 py-3 text-center">TB/ngày</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(groupedByUser)
                  .sort((a, b) => b[1].hours - a[1].hours)
                  .map(([userName, data]) => (
                  <tr key={userName} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{userName}</td>
                    <td className="px-4 py-3 text-center">{data.dates.size}</td>
                    <td className="px-4 py-3 text-center">{data.shifts}</td>
                    <td className="px-4 py-3 text-center font-medium text-green-600">{data.hours.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-center">
                      {data.dates.size > 0 ? (data.hours / data.dates.size).toFixed(1) : 0}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-bold">📋 Chi tiết chấm công {viewMode === 'my' ? 'của tôi' : ''}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {viewMode === 'all' && <th className="px-4 py-3 text-left">Nhân viên</th>}
                <th className="px-4 py-3 text-left">Ngày</th>
                <th className="px-4 py-3 text-center">Check-in</th>
                <th className="px-4 py-3 text-center">Check-out</th>
                <th className="px-4 py-3 text-center">Số giờ</th>
                <th className="px-4 py-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredAttendances.length === 0 ? (
                <tr>
                  <td colSpan={viewMode === 'all' ? 6 : 5} className="px-6 py-12 text-center text-gray-500">
                    <div className="text-4xl mb-2">📭</div>
                    <div>Chưa có dữ liệu chấm công trong tháng này</div>
                  </td>
                </tr>
              ) : (
                filteredAttendances.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    {viewMode === 'all' && <td className="px-4 py-3 font-medium">{a.user_name}</td>}
                    <td className="px-4 py-3">
                      {new Date(a.date).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-green-600 font-medium">{a.check_in?.slice(0,5) || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-red-600 font-medium">{a.check_out?.slice(0,5) || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold">
                      {a.work_hours ? `${a.work_hours}h` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.check_out ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Hoàn thành</span>
                      ) : a.check_in ? (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">Đang làm</span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

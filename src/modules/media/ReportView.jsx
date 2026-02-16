import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ReportView = ({ visibleTasks, allUsers }) => {
  // State cho filter thời gian
  const [dateRange, setDateRange] = useState('30days'); // '7days', '30days', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Hàm tính toán khoảng thời gian
  const getDateRange = () => {
    const today = new Date();
    let startDate, endDate;

    if (dateRange === 'today') {
      startDate = new Date(today.setHours(0, 0, 0, 0));
      endDate = new Date(today.setHours(23, 59, 59, 999));
    } else if (dateRange === '7days') {
      endDate = new Date();
      startDate = new Date(today.setDate(today.getDate() - 7));
    } else if (dateRange === '30days') {
      endDate = new Date();
      startDate = new Date(today.setDate(today.getDate() - 30));
    } else if (dateRange === 'custom' && customStartDate && customEndDate) {
      startDate = new Date(customStartDate);
      endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Mặc định 30 ngày
      endDate = new Date();
      startDate = new Date(today.setDate(today.getDate() - 30));
    }

    return { startDate, endDate };
  };

  // Lọc tasks theo khoảng thời gian
  const filteredTasks = useMemo(() => {
    const { startDate, endDate } = getDateRange();

    return visibleTasks.filter(task => {
      // Dùng created_at nếu có, fallback về dueDate
      const taskDate = task.created_at ? new Date(task.created_at) : new Date(task.dueDate);
      return taskDate >= startDate && taskDate <= endDate;
    });
  }, [visibleTasks, dateRange, customStartDate, customEndDate]);

  // Tính toán stats từ filtered tasks
  const filteredReportData = useMemo(() => {
    const statusStats = [
      { name: 'Nháp', value: filteredTasks.filter(t => t.status === 'Nháp').length, color: '#9ca3af' },
      { name: 'Chờ Duyệt', value: filteredTasks.filter(t => t.status === 'Chờ Duyệt').length, color: '#f59e0b' },
      { name: 'Đã Duyệt', value: filteredTasks.filter(t => t.status === 'Đã Duyệt').length, color: '#10b981' },
      { name: 'Đang Làm', value: filteredTasks.filter(t => t.status === 'Đang Làm').length, color: '#3b82f6' },
      { name: 'Hoàn Thành', value: filteredTasks.filter(t => t.status === 'Hoàn Thành').length, color: '#6b7280' }
    ].filter(s => s.value > 0);

    const teamStats = ['Content', 'Edit Video', 'Livestream', 'Kho'].map(t => ({
      name: t,
      completed: filteredTasks.filter(x => x.team === t && x.status === 'Hoàn Thành').length,
      inProgress: filteredTasks.filter(x => x.team === t && x.status === 'Đang Làm').length
    }));

    return { statusStats, teamStats };
  }, [filteredTasks]);

  // Tính toán % so với kỳ trước
  const compareWithPrevious = useMemo(() => {
    const { startDate, endDate } = getDateRange();
    const duration = endDate - startDate;
    const prevStartDate = new Date(startDate.getTime() - duration);
    const prevEndDate = new Date(startDate.getTime() - 1);

    const currentCompleted = filteredTasks.filter(t => t.status === 'Hoàn Thành').length;
    const prevCompleted = visibleTasks.filter(t => {
      const taskDate = t.created_at ? new Date(t.created_at) : new Date(t.dueDate);
      return taskDate >= prevStartDate && taskDate <= prevEndDate && t.status === 'Hoàn Thành';
    }).length;

    const change = prevCompleted === 0 ? 100 : ((currentCompleted - prevCompleted) / prevCompleted) * 100;

    return {
      current: currentCompleted,
      previous: prevCompleted,
      change: Math.round(change)
    };
  }, [filteredTasks, visibleTasks, dateRange, customStartDate, customEndDate]);

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-6">
      {/* Header với Date Range Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">📈 Báo Cáo & Phân Tích</h2>
          <p className="text-xs md:text-sm text-gray-600 mt-1">
            Dữ liệu từ {filteredTasks.length} tasks trong khoảng thời gian đã chọn
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setDateRange('today')}
            className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-medium transition-all text-sm ${
              dateRange === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            📅 Hôm nay
          </button>
          <button
            onClick={() => setDateRange('7days')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              dateRange === '7days'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            📅 7 ngày
          </button>
          <button
            onClick={() => setDateRange('30days')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              dateRange === '30days'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            📅 30 ngày
          </button>
          <button
            onClick={() => setDateRange('custom')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              dateRange === 'custom'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            🔧 Tùy chỉnh
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {dateRange === 'custom' && (
        <div className="bg-white p-4 rounded-xl shadow">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Từ ngày:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Đến ngày:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards với So sánh */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="text-3xl">✅</div>
            {compareWithPrevious.change !== 0 && (
              <div className={`flex items-center gap-1 text-sm font-medium ${
                compareWithPrevious.change > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {compareWithPrevious.change > 0 ? '↑' : '↓'} {Math.abs(compareWithPrevious.change)}%
              </div>
            )}
          </div>
          <div className="text-3xl font-bold mb-1">
            {filteredTasks.filter(t => t.status === 'Hoàn Thành').length}
          </div>
          <div className="text-sm text-gray-600">Video Hoàn Thành</div>
          <div className="text-xs text-gray-400 mt-1">
            Kỳ trước: {compareWithPrevious.previous}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <div className="text-3xl mb-2">📊</div>
          <div className="text-3xl font-bold mb-1">
            {filteredTasks.length > 0
              ? Math.round((filteredTasks.filter(t => t.status === 'Hoàn Thành').length / filteredTasks.length) * 100)
              : 0}%
          </div>
          <div className="text-sm text-gray-600">Tỷ Lệ Hoàn Thành</div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <div className="text-3xl mb-2">⚠️</div>
          <div className="text-3xl font-bold mb-1">
            {filteredTasks.filter(t => t.isOverdue).length}
          </div>
          <div className="text-sm text-gray-600">Video Quá Hạn</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-bold mb-4">📊 Phân Bố Trạng Thái</h3>
          {filteredReportData.statusStats.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={filteredReportData.statusStats}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label
                  >
                    {filteredReportData.statusStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-gray-400">
              Không có dữ liệu trong khoảng thời gian này
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-bold mb-4">👥 Hiệu Suất Theo Team</h3>
          {filteredTasks.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredReportData.teamStats}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed" fill="#10b981" name="Hoàn thành" />
                  <Bar dataKey="inProgress" fill="#3b82f6" name="Đang làm" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-gray-400">
              Không có dữ liệu trong khoảng thời gian này
            </div>
          )}
        </div>
      </div>

      {/* Top Performers trong khoảng thời gian */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="text-lg font-bold mb-4">🏆 Top Performers (Trong Kỳ)</h3>
        <div className="space-y-3">
          {Object.entries(
            filteredTasks
              .filter(t => t.status === 'Hoàn Thành')
              .reduce((acc, t) => {
                acc[t.assignee] = (acc[t.assignee] || 0) + 1;
                return acc;
              }, {})
          )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count], i) => (
              <div key={name} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</div>
                  <div>
                    <div className="font-medium">{name}</div>
                    <div className="text-sm text-gray-600">
                      {allUsers.find(u => u.name === name)?.team}
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold">{count}</div>
              </div>
            ))}
          {filteredTasks.filter(t => t.status === 'Hoàn Thành').length === 0 && (
            <div className="text-center py-8 text-gray-400">
              Chưa có task nào hoàn thành trong khoảng thời gian này
            </div>
          )}
        </div>
      </div>

      {/* Employee Breakdown Table */}
      <div className="bg-white p-6 rounded-xl shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">👥 Breakdown theo Nhân Viên</h3>
          <button
            onClick={() => {
              const userStats = {};
              filteredTasks.forEach(t => {
                if (t.assignee) {
                  if (!userStats[t.assignee]) userStats[t.assignee] = { assign: 0, crew: 0, actor: 0 };
                  userStats[t.assignee].assign++;
                }
                (t.crew || [...new Set([...(t.cameramen || []), ...(t.editors || [])])]).forEach(name => {
                  if (!userStats[name]) userStats[name] = { assign: 0, crew: 0, actor: 0 };
                  userStats[name].crew++;
                });
                (t.actors || []).forEach(name => {
                  if (!userStats[name]) userStats[name] = { assign: 0, crew: 0, actor: 0 };
                  userStats[name].actor++;
                });
              });
              const headers = ['Tên', 'Được Gán', 'Q&D', 'Diễn', 'Tổng'];
              const rows = Object.entries(userStats).sort((a, b) => (b[1].assign + b[1].crew + b[1].actor) - (a[1].assign + a[1].crew + a[1].actor))
                .map(([name, s]) => [name, s.assign, s.crew, s.actor, s.assign + s.crew + s.actor]);
              const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
              const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = `breakdown-nv-${new Date().toISOString().slice(0, 10)}.csv`;
              link.click();
              URL.revokeObjectURL(link.href);
            }}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
          >
            📥 Xuất CSV
          </button>
        </div>
        {(() => {
          const userStats = {};
          filteredTasks.forEach(t => {
            if (t.assignee) {
              if (!userStats[t.assignee]) userStats[t.assignee] = { assign: 0, crew: 0, actor: 0 };
              userStats[t.assignee].assign++;
            }
            (t.crew || [...new Set([...(t.cameramen || []), ...(t.editors || [])])]).forEach(name => {
              if (!userStats[name]) userStats[name] = { assign: 0, crew: 0, actor: 0 };
              userStats[name].crew++;
            });
            (t.actors || []).forEach(name => {
              if (!userStats[name]) userStats[name] = { assign: 0, crew: 0, actor: 0 };
              userStats[name].actor++;
            });
          });
          const sortedUsers = Object.entries(userStats).sort((a, b) => (b[1].assign + b[1].crew + b[1].actor) - (a[1].assign + a[1].crew + a[1].actor));
          if (sortedUsers.length === 0) return <div className="text-center py-6 text-gray-400">Không có dữ liệu</div>;
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Tên</th>
                    <th className="px-4 py-3 text-center font-semibold">👤 Được Gán</th>
                    <th className="px-4 py-3 text-center font-semibold">🎬 Q&D</th>
                    <th className="px-4 py-3 text-center font-semibold">🎭 Diễn</th>
                    <th className="px-4 py-3 text-center font-semibold">Tổng</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedUsers.map(([name, s]) => (
                    <tr key={name} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{name}</td>
                      <td className="px-4 py-3 text-center">{s.assign || '-'}</td>
                      <td className="px-4 py-3 text-center text-blue-600 font-medium">{s.crew || '-'}</td>
                      <td className="px-4 py-3 text-center text-pink-600 font-medium">{s.actor || '-'}</td>
                      <td className="px-4 py-3 text-center font-bold">{s.assign + s.crew + s.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* Summary Statistics */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border border-blue-200">
        <h3 className="text-lg font-bold mb-4">📋 Tổng Quan Theo Thời Gian</h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-600">Tổng Video</div>
            <div className="text-2xl font-bold">{filteredTasks.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Hoàn Thành</div>
            <div className="text-2xl font-bold text-green-600">
              {filteredTasks.filter(t => t.status === 'Hoàn Thành').length}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Đang Làm</div>
            <div className="text-2xl font-bold text-blue-600">
              {filteredTasks.filter(t => t.status === 'Đang Làm').length}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Tỷ Lệ Thành Công</div>
            <div className="text-2xl font-bold text-purple-600">
              {filteredTasks.length > 0
                ? Math.round((filteredTasks.filter(t => t.status === 'Hoàn Thành').length / filteredTasks.length) * 100)
                : 0}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportView;

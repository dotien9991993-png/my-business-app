import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getVietnamDate } from '../../utils/dateUtils';

const PerformanceView = ({ tasks, visibleTasks, currentUser, allUsers }) => {
  const calculateMetrics = () => {
    if (!currentUser) return null;
    const userTasks = visibleTasks.filter(t => t.assignee === currentUser.name);
    const completed = userTasks.filter(t => t.status === 'Hoàn Thành');
    const onTime = completed.filter(t => !t.isOverdue);
    const late = completed.filter(t => t.isOverdue);
    const inProgress = userTasks.filter(t => ['Nháp', 'Chưa Quay', 'Đã Quay', 'Đang Edit'].includes(t.status));
    return {
      total: userTasks.length,
      completed: completed.length,
      onTime: onTime.length,
      late: late.length,
      inProgress: inProgress.length,
      completionRate: userTasks.length > 0 ? Math.round((completed.length / userTasks.length) * 100) : 0,
      onTimeRate: completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 0
    };
  };

  const calculateLeaderboard = () => {
    return allUsers.map(user => {
      const userTasks = tasks.filter(t => t.assignee === user.name);
      const completed = userTasks.filter(t => t.status === 'Hoàn Thành');
      const onTime = completed.filter(t => !t.isOverdue);
      return {
        name: user.name,
        team: user.team,
        totalTasks: userTasks.length,
        completed: completed.length,
        onTime: onTime.length,
        completionRate: userTasks.length > 0 ? Math.round((completed.length / userTasks.length) * 100) : 0,
        onTimeRate: completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 0
      };
    }).sort((a, b) => b.completed - a.completed);
  };

  const calculateWeeklyTrend = () => {
    const days = [];
    const now = getVietnamDate();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      const completedCount = tasks.filter(t => {
        if (currentUser.role !== 'Admin' && currentUser.role !== 'Manager' && t.assignee !== currentUser.name) return false;
        if (t.status !== 'Hoàn Thành') return false;
        const taskDate = (t.completed_at || t.updated_at || '').substring(0, 10);
        return taskDate === dateStr;
      }).length;
      const createdCount = tasks.filter(t => {
        if (currentUser.role !== 'Admin' && currentUser.role !== 'Manager' && t.assignee !== currentUser.name) return false;
        return (t.created_at || '').substring(0, 10) === dateStr;
      }).length;
      days.push({
        date: date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        completed: completedCount,
        created: createdCount
      });
    }
    return days;
  };

  const myMetrics = calculateMetrics();
  const leaderboard = calculateLeaderboard();
  const weeklyTrend = calculateWeeklyTrend();

  const exportCSV = () => {
    const headers = ['Tên', 'Team', 'Tổng Tasks', 'Hoàn Thành', 'Tỷ Lệ HT', 'Tỷ Lệ Đúng Hạn'];
    const rows = leaderboard.map(u => [u.name, u.team, u.totalTasks, u.completed, u.completionRate + '%', u.onTimeRate + '%']);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `hieu-suat-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">📊 Hiệu Suất Làm Việc</h2>
          <p className="text-gray-600 mt-1">Thống kê và phân tích hiệu suất</p>
        </div>
        <button onClick={exportCSV} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
          📥 Xuất Báo Cáo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
          <div className="text-sm opacity-90 mb-2">Tổng Video</div>
          <div className="text-4xl font-bold mb-2">{myMetrics?.total || 0}</div>
          <div className="text-sm opacity-75">Video được giao</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg">
          <div className="text-sm opacity-90 mb-2">Hoàn Thành</div>
          <div className="text-4xl font-bold mb-2">{myMetrics?.completed || 0}</div>
          <div className="text-sm opacity-75">{myMetrics?.completionRate || 0}% tỷ lệ</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg">
          <div className="text-sm opacity-90 mb-2">Đúng Hạn</div>
          <div className="text-4xl font-bold mb-2">{myMetrics?.onTime || 0}</div>
          <div className="text-sm opacity-75">{myMetrics?.onTimeRate || 0}% đúng deadline</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg">
          <div className="text-sm opacity-90 mb-2">Đang Làm</div>
          <div className="text-4xl font-bold mb-2">{myMetrics?.inProgress || 0}</div>
          <div className="text-sm opacity-75">Video đang xử lý</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-xl font-bold mb-4">📈 Xu Hướng 7 Ngày</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weeklyTrend}>
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="created" fill="#3b82f6" name="Video mới" />
            <Bar dataKey="completed" fill="#10b981" name="Hoàn thành" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="p-6 border-b bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
          <h3 className="text-xl font-bold">🏆 Bảng Xếp Hạng</h3>
          <p className="text-sm opacity-90 mt-1">Top performers của team</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold">Hạng</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Họ Tên</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Team</th>
                <th className="px-6 py-4 text-center text-sm font-semibold">Tasks</th>
                <th className="px-6 py-4 text-center text-sm font-semibold">Hoàn Thành</th>
                <th className="px-6 py-4 text-center text-sm font-semibold">Tỷ Lệ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leaderboard.map((user, index) => (
                <tr key={user.name} className={`${index === 0 ? 'bg-yellow-50' : ''} ${index === 1 ? 'bg-gray-50' : ''} ${index === 2 ? 'bg-orange-50' : ''} ${user.name === currentUser?.name ? 'bg-blue-50 font-semibold' : ''} hover:bg-gray-100`}>
                  <td className="px-6 py-4 text-center">
                    {index === 0 && <span className="text-2xl">🥇</span>}
                    {index === 1 && <span className="text-2xl">🥈</span>}
                    {index === 2 && <span className="text-2xl">🥉</span>}
                    {index > 2 && <span className="text-gray-500">{index + 1}</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span>{user.name}</span>
                      {user.name === currentUser?.name && <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Bạn</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm ${user.team === 'Content' ? 'bg-blue-100 text-blue-700' : user.team === 'Edit Video' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                      {user.team}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-semibold">{user.totalTasks}</td>
                  <td className="px-6 py-4 text-center"><span className="text-green-600 font-semibold">{user.completed}</span></td>
                  <td className="px-6 py-4 text-center">
                    <div className="text-sm font-medium text-green-600">{user.completionRate}% hoàn thành</div>
                    <div className="text-xs text-purple-600">{user.onTimeRate}% đúng hạn</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PerformanceView;

import React from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getStatusColor } from '../../utils/formatUtils';
import SalaryCard from '../../components/shared/SalaryCard';

const DashboardView = ({ currentUser, visibleTasks, reportData, setSelectedTask, setShowModal }) => {
  // Crew (Quay & Dựng) stats - merge cameramen + editors for old data
  const crewStats = {};
  visibleTasks.forEach(t => {
    const crew = t.crew || [...new Set([...(t.cameramen || []), ...(t.editors || [])])];
    crew.forEach(name => { crewStats[name] = (crewStats[name] || 0) + 1; });
  });
  const crewData = Object.entries(crewStats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  // Actor stats
  const actorStats = {};
  visibleTasks.forEach(t => {
    (t.actors || []).forEach(name => { actorStats[name] = (actorStats[name] || 0) + 1; });
  });
  const actorData = Object.entries(actorStats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  return (
  <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-6">
    <div>
      <h2 className="text-lg md:text-2xl font-bold mb-1">Xin chào, {currentUser.name}! 👋</h2>
      <p className="text-sm text-gray-600">{currentUser.role} • {currentUser.team} Team</p>
    </div>

    <SalaryCard />

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
      {[
        { l: 'Tổng Video', v: visibleTasks.length, i: '📊', c: 'blue' },
        { l: 'Hoàn Thành', v: visibleTasks.filter(t => t.status === 'Hoàn Thành').length, i: '✅', c: 'green' },
        { l: 'Đang Làm', v: visibleTasks.filter(t => t.status === 'Đang Làm').length, i: '⏳', c: 'yellow' },
        { l: 'Quá Hạn', v: visibleTasks.filter(t => t.isOverdue).length, i: '⚠️', c: 'red' }
      ].map((s, i) => (
        <div key={i} className={`bg-${s.c}-50 p-3 md:p-6 rounded-xl border-2 border-${s.c}-200`}>
          <div className="text-xl md:text-3xl mb-1 md:mb-2">{s.i}</div>
          <div className="text-xl md:text-3xl font-bold">{s.v}</div>
          <div className="text-xs md:text-sm text-gray-600">{s.l}</div>
        </div>
      ))}
    </div>

    {/* Chi tiết các trạng thái */}
    <div className="bg-white p-4 md:p-6 rounded-xl shadow">
      <h3 className="text-base md:text-lg font-bold mb-3 md:mb-4">📋 Chi Tiết Trạng Thái</h3>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-4">
        {[
          { status: 'Nháp', icon: '📝', color: 'bg-gray-100 text-gray-700' },
          { status: 'Chờ Duyệt', icon: '⏳', color: 'bg-yellow-100 text-yellow-700' },
          { status: 'Đã Duyệt', icon: '👍', color: 'bg-green-100 text-green-700' },
          { status: 'Đang Làm', icon: '🔨', color: 'bg-blue-100 text-blue-700' },
          { status: 'Hoàn Thành', icon: '✅', color: 'bg-purple-100 text-purple-700' }
        ].map(item => {
          const count = visibleTasks.filter(t => t.status === item.status).length;
          const percentage = visibleTasks.length > 0 ? Math.round((count / visibleTasks.length) * 100) : 0;

          return (
            <div key={item.status} className={`${item.color} p-2 md:p-4 rounded-lg`}>
              <div className="text-lg md:text-2xl mb-1">{item.icon}</div>
              <div className="text-lg md:text-2xl font-bold">{count}</div>
              <div className="text-xs font-medium mb-0.5">{item.status}</div>
              <div className="text-xs opacity-75">{percentage}%</div>
            </div>
          );
        })}
      </div>
    </div>

    <div className="grid md:grid-cols-2 gap-4 md:gap-6">
      <div className="bg-white p-4 md:p-6 rounded-xl shadow">
        <h3 className="text-base md:text-lg font-bold mb-3 md:mb-4">📊 Trạng thái Video</h3>
        <div className="h-48 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={reportData.statusStats} cx="50%" cy="50%" outerRadius={60} dataKey="value" label>
                {reportData.statusStats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="text-lg font-bold mb-4">👥 Hiệu suất Team</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reportData.teamStats}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="completed" fill="#10b981" name="Hoàn thành" />
              <Bar dataKey="inProgress" fill="#3b82f6" name="Đang làm" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>

    {/* Crew & Actor Stats */}
    {(crewData.length > 0 || actorData.length > 0) && (
      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        {crewData.length > 0 && (
          <div className="bg-white p-4 md:p-6 rounded-xl shadow">
            <h3 className="text-base md:text-lg font-bold mb-3 md:mb-4">🎬 Video theo Quay / Dựng</h3>
            <div className="h-48 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={crewData} layout="vertical">
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" name="Video" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {actorData.length > 0 && (
          <div className="bg-white p-4 md:p-6 rounded-xl shadow">
            <h3 className="text-base md:text-lg font-bold mb-3 md:mb-4">🎭 Video theo Diễn viên</h3>
            <div className="h-48 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={actorData} layout="vertical">
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#ec4899" name="Video" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    )}

    <div className="bg-white p-6 rounded-xl shadow">
      <h3 className="text-lg font-bold mb-4">🎯 Video Gần Nhất</h3>
      <div className="space-y-3">
        {visibleTasks.slice(0, 5).map(task => (
          <div
            key={task.id}
            onClick={() => {
              setSelectedTask(task);
              setShowModal(true);
            }}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
          >
            <div className="flex-1">
              <div className="font-medium">{task.title}</div>
              <div className="text-sm text-gray-600">{task.assignee} • {task.team}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(task.status)}`}>
                {task.status}
              </span>
              <span className="text-sm text-gray-500">{task.dueDate}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
  );
};

export default DashboardView;

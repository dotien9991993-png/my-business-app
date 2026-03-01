import React, { useState, useMemo } from 'react';
import { getVietnamDate } from '../../utils/dateUtils';

// Format số gọn: 1000→1K, 15000→15K, 1500000→1.5M
function formatCompactNumber(num) {
  if (num == null) return '—';
  if (num === 0) return '0';
  if (num >= 1000000) return (Math.round(num / 100000) / 10) + 'M';
  if (num >= 1000) return (Math.round(num / 100) / 10) + 'K';
  return num.toString();
}

// Lấy ngày YYYY-MM-DD từ task
function getTaskDate(task) {
  return (task.completed_at || task.updated_at || task.created_at || '').substring(0, 10);
}

const MediaDashboard = ({ tasks, allUsers, setSelectedTask, setShowModal }) => {
  const [timeFilter, setTimeFilter] = useState('30d');

  // Lọc tasks theo thời gian
  const filteredTasks = useMemo(() => {
    if (timeFilter === 'all') return tasks;

    const now = getVietnamDate();
    let startDate;

    if (timeFilter === '7d') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeFilter === '30d') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
    } else if (timeFilter === 'this_month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeFilter === 'last_month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      const startStr = startDate.toISOString().substring(0, 10);
      const endStr = endDate.toISOString().substring(0, 10);
      return tasks.filter(t => {
        const d = getTaskDate(t);
        return d >= startStr && d <= endStr;
      });
    }

    const startStr = startDate.toISOString().substring(0, 10);
    return tasks.filter(t => getTaskDate(t) >= startStr);
  }, [tasks, timeFilter]);

  // Aggregate stats từ tất cả tasks
  const summaryStats = useMemo(() => {
    let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
    let completedCount = 0;

    for (const task of filteredTasks) {
      if (task.status === 'Hoàn Thành') completedCount++;
      const links = task.postLinks || [];
      for (const link of links) {
        if (!link.stats) continue;
        totalViews += link.stats.views || 0;
        totalLikes += link.stats.likes || 0;
        totalComments += link.stats.comments || 0;
        totalShares += link.stats.shares || 0;
      }
    }

    return { completedCount, totalViews, totalLikes, totalComments, totalShares };
  }, [filteredTasks]);

  // Thống kê theo nhân viên (assignee)
  const employeeStats = useMemo(() => {
    const map = {};

    for (const task of filteredTasks) {
      const assignee = task.assignee || 'Chưa gán';
      if (!map[assignee]) map[assignee] = { name: assignee, videos: 0, views: 0, likes: 0, comments: 0, shares: 0 };
      if (task.status === 'Hoàn Thành') map[assignee].videos++;

      const links = task.postLinks || [];
      for (const link of links) {
        if (!link.stats) continue;
        map[assignee].views += link.stats.views || 0;
        map[assignee].likes += link.stats.likes || 0;
        map[assignee].comments += link.stats.comments || 0;
        map[assignee].shares += link.stats.shares || 0;
      }
    }

    return Object.values(map)
      .filter(e => e.views > 0 || e.videos > 0)
      .sort((a, b) => b.views - a.views);
  }, [filteredTasks]);

  // Thống kê theo Page (từ post_links type)
  const pageStats = useMemo(() => {
    const map = {};

    for (const task of filteredTasks) {
      const links = task.postLinks || [];
      for (const link of links) {
        if (!link.stats) continue;
        const platform = link.type || 'unknown';
        // Dùng label từ URL để phân biệt page
        const pageName = link.pageName || platform;
        const key = pageName;
        if (!map[key]) map[key] = { name: pageName, platform, videos: 0, views: 0, likes: 0, comments: 0 };
        map[key].videos++;
        map[key].views += link.stats.views || 0;
        map[key].likes += link.stats.likes || 0;
        map[key].comments += link.stats.comments || 0;
      }
    }

    return Object.values(map).sort((a, b) => b.views - a.views);
  }, [filteredTasks]);

  // Top 10 video hot nhất (theo views)
  const topVideos = useMemo(() => {
    const videos = [];

    for (const task of filteredTasks) {
      const links = task.postLinks || [];
      for (const link of links) {
        if (!link.stats || !link.stats.views) continue;
        videos.push({
          task,
          url: link.url || '',
          platform: link.type || 'unknown',
          views: link.stats.views || 0,
          likes: link.stats.likes || 0,
          comments: link.stats.comments || 0,
          title: link.stats.title || task.title || '',
        });
      }
    }

    return videos.sort((a, b) => b.views - a.views).slice(0, 10);
  }, [filteredTasks]);

  const medals = ['🥇', '🥈', '🥉'];

  const timeFilterOptions = [
    { id: '7d', label: '7 ngày' },
    { id: '30d', label: '30 ngày' },
    { id: 'this_month', label: 'Tháng này' },
    { id: 'last_month', label: 'Tháng trước' },
    { id: 'all', label: 'Tất cả' },
  ];

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-6">
      {/* Header + Time Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg md:text-2xl font-bold">📊 Tổng Quan Media</h2>
        <div className="flex gap-1.5 flex-wrap">
          {timeFilterOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => setTimeFilter(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all ${
                timeFilter === opt.id
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Video HT', value: summaryStats.completedCount, icon: '🎬', color: 'green', desc: 'Hoàn thành' },
          { label: 'Tổng Views', value: formatCompactNumber(summaryStats.totalViews), icon: '👁️', color: 'blue', desc: summaryStats.totalViews.toLocaleString('vi-VN') },
          { label: 'Tổng Likes', value: formatCompactNumber(summaryStats.totalLikes), icon: '👍', color: 'purple', desc: summaryStats.totalLikes.toLocaleString('vi-VN') },
          { label: 'Tổng Comments', value: formatCompactNumber(summaryStats.totalComments), icon: '💬', color: 'orange', desc: summaryStats.totalComments.toLocaleString('vi-VN') },
        ].map((card, i) => (
          <div key={i} className={`bg-${card.color}-50 border border-${card.color}-200 rounded-xl p-3 md:p-5`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl md:text-2xl">{card.icon}</span>
              <span className="text-xs md:text-sm text-gray-500">{card.label}</span>
            </div>
            <div className="text-2xl md:text-3xl font-bold">{card.value}</div>
            <div className="text-[10px] md:text-xs text-gray-400 mt-0.5">{card.desc}</div>
          </div>
        ))}
      </div>

      {/* Employee Stats Table */}
      {employeeStats.length > 0 && (
        <div className="bg-white rounded-xl shadow border overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b bg-gray-50">
            <h3 className="text-sm md:text-lg font-bold">👤 Thống Kê Nhân Viên</h3>
            <p className="text-xs text-gray-500 mt-0.5">Xếp hạng theo tổng lượt xem</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-3 md:px-4 py-2 font-medium">#</th>
                  <th className="text-left px-3 md:px-4 py-2 font-medium">Nhân viên</th>
                  <th className="text-right px-3 md:px-4 py-2 font-medium">Videos</th>
                  <th className="text-right px-3 md:px-4 py-2 font-medium">Views</th>
                  <th className="text-right px-3 md:px-4 py-2 font-medium hidden md:table-cell">Likes</th>
                  <th className="text-right px-3 md:px-4 py-2 font-medium hidden md:table-cell">Comments</th>
                </tr>
              </thead>
              <tbody>
                {employeeStats.map((emp, i) => (
                  <tr key={emp.name} className={`border-t hover:bg-gray-50 ${i < 3 ? 'bg-yellow-50/50' : ''}`}>
                    <td className="px-3 md:px-4 py-2.5 font-medium">
                      {i < 3 ? <span className="text-base">{medals[i]}</span> : <span className="text-gray-400">{i + 1}</span>}
                    </td>
                    <td className="px-3 md:px-4 py-2.5 font-medium">{emp.name}</td>
                    <td className="px-3 md:px-4 py-2.5 text-right">{emp.videos}</td>
                    <td className="px-3 md:px-4 py-2.5 text-right font-semibold text-blue-600">{formatCompactNumber(emp.views)}</td>
                    <td className="px-3 md:px-4 py-2.5 text-right hidden md:table-cell">{formatCompactNumber(emp.likes)}</td>
                    <td className="px-3 md:px-4 py-2.5 text-right hidden md:table-cell">{formatCompactNumber(emp.comments)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Page Stats */}
      {pageStats.length > 0 && (
        <div className="bg-white rounded-xl shadow border overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b bg-gray-50">
            <h3 className="text-sm md:text-lg font-bold">📄 Thống Kê Theo Nền Tảng</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-3 md:px-4 py-2 font-medium">Nền tảng</th>
                  <th className="text-right px-3 md:px-4 py-2 font-medium">Videos</th>
                  <th className="text-right px-3 md:px-4 py-2 font-medium">Views</th>
                  <th className="text-right px-3 md:px-4 py-2 font-medium">Likes</th>
                  <th className="text-right px-3 md:px-4 py-2 font-medium">Comments</th>
                </tr>
              </thead>
              <tbody>
                {pageStats.map((page, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50">
                    <td className="px-3 md:px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {page.platform === 'facebook' ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        ) : page.platform === 'tiktok' ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.28 8.28 0 005.58 2.17V11.7a4.85 4.85 0 01-3.77-1.77V6.69h3.77z"/></svg>
                        ) : page.platform === 'youtube' ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        ) : (
                          <span className="text-gray-400">🌐</span>
                        )}
                        <span className="font-medium capitalize">{page.name}</span>
                      </div>
                    </td>
                    <td className="px-3 md:px-4 py-2.5 text-right">{page.videos}</td>
                    <td className="px-3 md:px-4 py-2.5 text-right font-semibold text-blue-600">{formatCompactNumber(page.views)}</td>
                    <td className="px-3 md:px-4 py-2.5 text-right">{formatCompactNumber(page.likes)}</td>
                    <td className="px-3 md:px-4 py-2.5 text-right">{formatCompactNumber(page.comments)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top 10 Videos */}
      {topVideos.length > 0 && (
        <div className="bg-white rounded-xl shadow border overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b bg-gray-50">
            <h3 className="text-sm md:text-lg font-bold">🔥 Top 10 Video Hot Nhất</h3>
          </div>
          <div className="divide-y">
            {topVideos.map((video, i) => (
              <div
                key={i}
                className="px-4 md:px-6 py-3 hover:bg-gray-50 cursor-pointer flex items-center gap-3"
                onClick={() => {
                  setSelectedTask(video.task);
                  setShowModal(true);
                }}
              >
                <div className="flex-shrink-0 w-8 text-center">
                  {i < 3 ? (
                    <span className="text-lg">{medals[i]}</span>
                  ) : (
                    <span className="text-sm text-gray-400 font-medium">{i + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {video.task.title || 'Không có tiêu đề'}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                    <span className="font-medium">{video.task.assignee || '—'}</span>
                    {video.platform === 'facebook' && (
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        Facebook
                      </span>
                    )}
                    {video.platform === 'tiktok' && (
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.28 8.28 0 005.58 2.17V11.7a4.85 4.85 0 01-3.77-1.77V6.69h3.77z"/></svg>
                        TikTok
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-sm md:text-base font-bold text-blue-600">{formatCompactNumber(video.views)}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 justify-end mt-0.5">
                    <span>👍 {formatCompactNumber(video.likes)}</span>
                    <span>💬 {formatCompactNumber(video.comments)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredTasks.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm">Không có dữ liệu trong khoảng thời gian này</p>
        </div>
      )}

      {summaryStats.totalViews === 0 && filteredTasks.length > 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">Chưa có stats nào. Hãy cập nhật stats cho các link Facebook/TikTok trong task.</p>
        </div>
      )}
    </div>
  );
};

export default MediaDashboard;

import React, { useState, useMemo } from 'react';

const TIME_FILTERS = [
  { id: '30d', label: '30 ngày' },
  { id: '7d', label: '7 ngày' },
  { id: 'this_month', label: 'Tháng này' },
  { id: 'last_month', label: 'Tháng trước' },
  { id: 'all', label: 'Tất cả' },
];

const getTaskDate = (t) => (t.completed_at || t.updated_at || t.created_at || '').substring(0, 10);

const getVietnamDate = () => {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
};

const toDateStr = (d) => d.toLocaleDateString('en-CA');

const formatNumber = (n) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString('vi-VN');
};

const PLATFORM_COLORS = {
  Facebook: '#1877F2',
  TikTok: '#000',
  YouTube: '#FF0000',
  Instagram: '#E4405F',
};

export default function MediaSummary({ allTasks }) {
  const [timeFilter, setTimeFilter] = useState('30d');

  // Filter tasks by time
  const filteredTasks = useMemo(() => {
    if (timeFilter === 'all') return allTasks;

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
      const startStr = toDateStr(startDate);
      const endStr = toDateStr(endDate);
      return allTasks.filter(t => {
        const d = getTaskDate(t);
        return d >= startStr && d <= endStr;
      });
    }

    const startStr = toDateStr(startDate);
    return allTasks.filter(t => getTaskDate(t) >= startStr);
  }, [allTasks, timeFilter]);

  // Summary stats
  const summaryStats = useMemo(() => {
    let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
    let completedCount = 0;

    for (const task of filteredTasks) {
      if (task.status === 'Hoàn Thành') completedCount++;
      const links = task.postLinks || task.post_links || [];
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

  // Employee stats
  const employeeStats = useMemo(() => {
    const map = {};

    for (const task of filteredTasks) {
      const assignee = task.assignee || 'Chưa gán';
      if (!map[assignee]) map[assignee] = { name: assignee, videos: 0, views: 0, likes: 0, comments: 0, shares: 0 };
      if (task.status === 'Hoàn Thành') map[assignee].videos++;

      const links = task.postLinks || task.post_links || [];
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

  // Top videos
  const topVideos = useMemo(() => {
    const videos = [];

    for (const task of filteredTasks) {
      const links = task.postLinks || task.post_links || [];
      for (const link of links) {
        if (!link.stats || !link.stats.views) continue;
        videos.push({
          taskTitle: task.title || '',
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

  return (
    <div className="mobile-page mms-page">
      {/* Time filter */}
      <div className="mms-time-filter">
        {TIME_FILTERS.map(f => (
          <button
            key={f.id}
            className={`mms-time-btn ${timeFilter === f.id ? 'active' : ''}`}
            onClick={() => setTimeFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="mms-kpi-grid">
        <div className="mms-kpi-card">
          <div className="mms-kpi-value">{formatNumber(summaryStats.totalViews)}</div>
          <div className="mms-kpi-label">Lượt xem</div>
        </div>
        <div className="mms-kpi-card">
          <div className="mms-kpi-value">{formatNumber(summaryStats.totalLikes)}</div>
          <div className="mms-kpi-label">Lượt thích</div>
        </div>
        <div className="mms-kpi-card">
          <div className="mms-kpi-value">{formatNumber(summaryStats.totalComments)}</div>
          <div className="mms-kpi-label">Bình luận</div>
        </div>
        <div className="mms-kpi-card">
          <div className="mms-kpi-value">{summaryStats.completedCount}</div>
          <div className="mms-kpi-label">Video hoàn thành</div>
        </div>
      </div>

      {/* Employee ranking */}
      {employeeStats.length > 0 && (
        <div className="mms-section">
          <h3 className="mms-section-title">Xếp hạng nhân viên</h3>
          <div className="mms-emp-list">
            {employeeStats.map((emp, i) => (
              <div key={emp.name} className="mms-emp-row">
                <div className="mms-emp-rank">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </div>
                <div className="mms-emp-info">
                  <div className="mms-emp-name">{emp.name}</div>
                  <div className="mms-emp-stats">
                    {emp.videos} video · {formatNumber(emp.views)} views · {formatNumber(emp.likes)} likes
                  </div>
                </div>
                <div className="mms-emp-views">{formatNumber(emp.views)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top videos */}
      {topVideos.length > 0 && (
        <div className="mms-section">
          <h3 className="mms-section-title">Top video</h3>
          <div className="mms-video-list">
            {topVideos.map((v, i) => (
              <div key={i} className="mms-video-row">
                <div className="mms-video-rank">#{i + 1}</div>
                <div className="mms-video-info">
                  <div className="mms-video-title">{v.title || v.taskTitle}</div>
                  <div className="mms-video-meta">
                    <span className="mms-video-platform" style={{ color: PLATFORM_COLORS[v.platform] || '#6b7280' }}>
                      {v.platform}
                    </span>
                    <span>{formatNumber(v.views)} views</span>
                    <span>{formatNumber(v.likes)} likes</span>
                    <span>{formatNumber(v.comments)} comments</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {summaryStats.totalViews === 0 && summaryStats.completedCount === 0 && (
        <div className="mms-empty">
          <p>Chưa có dữ liệu thống kê</p>
          <p className="mms-empty-sub">Hoàn thành video và cập nhật stats để xem tổng quan</p>
        </div>
      )}
    </div>
  );
}

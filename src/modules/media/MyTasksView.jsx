import React, { useMemo } from 'react';
import { getStatusColor, getTeamColor, formatMoney } from '../../utils/formatUtils';

// Format số gọn: 1000→1K, 15000→15K, 1500000→1.5M
function formatCompactNumber(num) {
  if (num == null) return '—';
  if (num === 0) return '0';
  if (num >= 1000000) return (Math.round(num / 100000) / 10) + 'M';
  if (num >= 1000) return (Math.round(num / 100) / 10) + 'K';
  return num.toString();
}

function getTaskStatsByPlatform(task) {
  const links = task.postLinks || [];
  const byPlatform = {};
  for (const link of links) {
    if (!link.stats || !link.type || link.stats.views == null) continue;
    if (!byPlatform[link.type]) byPlatform[link.type] = { views: 0, likes: 0, comments: 0, shares: 0 };
    const p = byPlatform[link.type];
    p.views += link.stats.views || 0;
    p.likes += link.stats.likes || 0;
    p.comments += link.stats.comments || 0;
    p.shares += link.stats.shares || 0;
  }
  return Object.keys(byPlatform).length > 0 ? byPlatform : null;
}

const MyTasksView = ({ tasks, currentUser, setSelectedTask, setShowModal, products }) => {
  // Hiển thị task khi user tham gia ở BẤT KỲ vai trò nào
  const userName = currentUser.name;
  const myTasks = tasks.filter(t =>
    t.assignee === userName ||
    t.created_by === userName ||
    (t.cameramen || []).includes(userName) ||
    (t.editors || []).includes(userName) ||
    (t.actors || []).includes(userName)
  );

  const productMap = useMemo(() => {
    const map = {};
    (products || []).forEach(p => { map[p.id] = p; });
    return map;
  }, [products]);

  const activeCount = myTasks.filter(t => !['Hoàn Thành'].includes(t.status)).length;
  const completedCount = myTasks.filter(t => t.status === 'Hoàn Thành').length;
  const overdueCount = myTasks.filter(t => t.isOverdue).length;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      <div className="mb-4 md:mb-6">
        <h2 className="text-xl md:text-2xl font-bold">📝 Công việc của tôi</h2>
        <p className="text-gray-600 text-sm">
          {myTasks.length} task • {activeCount} đang làm • {completedCount} hoàn thành
          {overdueCount > 0 && <span className="text-red-600 font-medium"> • {overdueCount} quá hạn</span>}
        </p>
      </div>

      <div className="grid gap-1 md:gap-4">
        {myTasks.map(task => {
          const platformStats = getTaskStatsByPlatform(task);
          const totalPrice = (task.product_ids || []).reduce((sum, pid) => sum + (parseFloat(productMap[pid]?.sell_price) || 0), 0);

          return (
          <div
            key={task.id}
            onClick={() => {
              setSelectedTask(task);
              setShowModal(true);
            }}
            className={`bg-white p-2.5 md:p-6 rounded-xl shadow hover:shadow-lg transition-all cursor-pointer ${
              task.isOverdue ? 'border-l-4 border-red-500' : ''
            }`}
          >
            {/* Title + Stats */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-1 md:gap-4 mb-1 md:mb-2">
              <h3 className="text-[13px] md:text-xl font-bold flex-1 min-w-0 leading-snug">{task.title}</h3>
              {/* Mobile: inline compact stats */}
              {(platformStats || totalPrice > 0) && (
                <div className="flex items-center gap-1.5 flex-wrap md:hidden" style={{ fontSize: 11 }}>
                  {platformStats && Object.entries(platformStats)
                    .sort((a) => a[0] === 'Facebook' ? -1 : 1)
                    .map(([platform, s]) => (
                    <span key={platform} className="inline-flex items-center gap-1 text-gray-500">
                      {platform === 'Facebook' && <svg width="12" height="12" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
                      {platform === 'TikTok' && <svg width="12" height="12" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.49a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.13a8.16 8.16 0 0 0 4.77 1.52v-3.45a4.85 4.85 0 0 1-1.01-.51z"/></svg>}
                      <span className="font-extrabold text-gray-800">▶{formatCompactNumber(s.views)}</span>
                      <span>👍{formatCompactNumber(s.likes)}</span>
                      <span>💬{formatCompactNumber(s.comments)}</span>
                      {s.shares > 0 && <span>🔗{formatCompactNumber(s.shares)}</span>}
                    </span>
                  ))}
                  {totalPrice > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}>💰{formatMoney(totalPrice)}</span>}
                </div>
              )}
              {/* Desktop: styled stats box */}
              {(platformStats || totalPrice > 0) && (
                <div className="hidden md:block shrink-0 overflow-hidden" style={{ width: 200, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  {platformStats && Object.entries(platformStats)
                    .sort((a) => a[0] === 'Facebook' ? -1 : 1)
                    .map(([platform, s], idx, arr) => (
                    <div key={platform} className="flex items-center gap-1.5" style={{ padding: '6px 10px', borderBottom: (idx < arr.length - 1 || totalPrice > 0) ? '1px solid #e2e8f0' : 'none' }}>
                      {platform === 'Facebook' && (
                        <div className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, background: '#eff6ff', borderRadius: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </div>
                      )}
                      {platform === 'TikTok' && (
                        <div className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, background: '#f5f5f5', borderRadius: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.49a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.13a8.16 8.16 0 0 0 4.77 1.52v-3.45a4.85 4.85 0 0 1-1.01-.51z"/></svg>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="flex items-center gap-0.5" style={{ minWidth: 48, fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#64748b"><path d="M8 5v14l11-7z"/></svg>
                          {formatCompactNumber(s.views)}
                        </span>
                        <span className="flex items-center gap-0.5" style={{ minWidth: 32, fontSize: 12, color: '#64748b' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#2563eb"><path d="M2 20h2V8H2v12zm20-11a2 2 0 0 0-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 0 7.58 5.59C7.22 5.95 7 6.45 7 7v11a2 2 0 0 0 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                          {formatCompactNumber(s.likes)}
                        </span>
                        <span className="flex items-center gap-0.5" style={{ minWidth: 28, fontSize: 12, color: '#64748b' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#6b7280"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          {formatCompactNumber(s.comments)}
                        </span>
                        <span className="flex items-center gap-0.5" style={{ minWidth: 28, fontSize: 12, color: '#64748b' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#6b7280"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
                          {formatCompactNumber(s.shares)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {totalPrice > 0 && (
                    <div style={{ padding: '5px 10px', fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                      💰 {formatMoney(totalPrice)}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-1 md:gap-2 mb-1.5 md:mb-3 flex-wrap">
              <span className={`px-1.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-sm font-medium ${getStatusColor(task.status)}`}>
                {task.status}
              </span>
              <span className={`px-1.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-sm font-medium ${getTeamColor(task.team)}`}>
                {task.team}
              </span>
              {task.category && (
                <span className={`px-1.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-sm font-medium ${
                  task.category === 'video_dan' ? 'bg-purple-100 text-purple-700' :
                  task.category === 'video_hangngay' ? 'bg-blue-100 text-blue-700' :
                  task.category === 'video_huongdan' ? 'bg-green-100 text-green-700' :
                  task.category === 'video_quangcao' ? 'bg-orange-100 text-orange-700' :
                  task.category === 'video_review' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {task.category === 'video_dan' ? '🎬 Dàn' :
                   task.category === 'video_hangngay' ? '📅 H.ngày' :
                   task.category === 'video_huongdan' ? '📚 H.dẫn' :
                   task.category === 'video_quangcao' ? '📢 QC' :
                   task.category === 'video_review' ? '⭐ Review' : task.category}
                </span>
              )}
              <span className="px-1.5 md:px-3 py-0.5 md:py-1 bg-gray-100 rounded-full text-[10px] md:text-sm">
                👤 {task.assignee}
              </span>
              {(task.crew || []).length > 0 && (
                <span className="px-1.5 md:px-3 py-0.5 md:py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] md:text-sm">
                  🎬 {task.crew.join(', ')}
                </span>
              )}
              {(task.actors || []).length > 0 && (
                <span className="px-1.5 md:px-3 py-0.5 md:py-1 bg-pink-50 text-pink-700 rounded-full text-[10px] md:text-sm">
                  🎭 {task.actors.join(', ')}
                </span>
              )}
              <span className="px-1.5 md:px-3 py-0.5 md:py-1 bg-gray-100 rounded-full text-[10px] md:text-sm text-gray-500 md:text-gray-700">
                📅 {task.dueDate}
              </span>
            </div>
            {/* Product chips */}
            {(task.product_ids || []).length > 0 && (
              <div className="flex gap-1 md:gap-1.5 flex-wrap">
                {task.product_ids.map(pid => (
                  <span key={pid} className="px-1.5 md:px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-[10px] md:text-xs">
                    📦 {productMap[pid]?.sku || (productMap[pid]?.name ? (productMap[pid].name.length > 15 ? productMap[pid].name.slice(0, 15) + '...' : productMap[pid].name) : 'SP')}
                  </span>
                ))}
              </div>
            )}
            {(task.postLinks || []).some(l => l.link_valid === false) && (
              <div className="mt-0.5 md:mt-1">
                <span className="px-1.5 md:px-2 py-0.5 bg-red-50 border border-red-200 text-red-600 rounded-full text-[10px] md:text-xs">⚠️ Link sai</span>
              </div>
            )}
            {task.isOverdue && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 md:p-3 mt-1.5 md:mt-3">
                <span className="text-red-700 font-medium text-xs md:text-base">⚠️ Quá hạn!</span>
              </div>
            )}
          </div>
          );
        })}

        {myTasks.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl">
            <div className="text-4xl mb-3">🎉</div>
            <div className="text-gray-600">Bạn chưa có task nào được giao!</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyTasksView;

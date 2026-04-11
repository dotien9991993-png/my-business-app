import React from 'react';

const STATUS_BADGE = {
  'Nháp': { label: 'Nháp', cls: 'mmed-badge-draft' },
  'Chờ Duyệt': { label: 'Chờ Duyệt', cls: 'mmed-badge-review' },
  'Đã Duyệt': { label: 'Đã Duyệt', cls: 'mmed-badge-content' },
  'Đang Làm': { label: 'Đang Làm', cls: 'mmed-badge-content' },
  'Hoàn Thành': { label: 'Hoàn Thành', cls: 'mmed-badge-done' },
  'Cần Sửa': { label: 'Cần Sửa', cls: 'mmed-badge-review' },
};

const PRODUCTION_STEPS = [
  { key: 'created', icon: '📝', field: 'created_at' },
  { key: 'filmed', icon: '🎥', field: 'filmed_at' },
  { key: 'edited', icon: '✂️', field: 'edited_at' },
  { key: 'completed', icon: '✅', field: 'completed_at' },
];

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
};

const isOverdue = (dueDate, status) => {
  if (!dueDate || status === 'Hoàn Thành') return false;
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const deadline = new Date(dueDate);
  // Cùng ngày deadline = CHƯA quá hạn (set cuối ngày 23:59:59)
  deadline.setHours(23, 59, 59, 999);
  return vnNow > deadline;
};

const formatNum = (n) => {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString('vi-VN');
};

export default function TaskCard({ task, onClick, onToggleStep, onCopyLink }) {
  // DEBUG — xóa sau
  if (task.title === '123123' || task.title === 'TIEN 123') {
    console.warn('TASKCARD DEBUG:', task.title, '| status:', task.status, '| filmed_at:', task.filmed_at, '| edited_at:', task.edited_at, '| completed_at:', task.completed_at, '| ALL KEYS:', Object.keys(task).join(','));
  }
  // Badge status: ưu tiên timeline fields → fallback status field
  const displayStatus = task.completed_at ? 'Hoàn Thành'
    : task.edited_at ? 'Đang Edit'
    : task.filmed_at ? 'Đã Quay'
    : (task.status || 'Nháp');
  const statusBadge = STATUS_BADGE[displayStatus] || STATUS_BADGE['Nháp'];
  const overdue = isOverdue(task.due_date, displayStatus);
  const postLinks = task.post_links || [];
  const firstLink = postLinks.find(l => l.url);

  // Aggregate stats
  const totalStats = postLinks.reduce((acc, link) => {
    if (link.stats) {
      acc.views += link.stats.views || 0;
      acc.likes += link.stats.likes || 0;
      acc.comments += link.stats.comments || 0;
    }
    return acc;
  }, { views: 0, likes: 0, comments: 0 });
  const hasStats = totalStats.views > 0 || totalStats.likes > 0;

  // Production steps — check cả status để tránh inconsistency
  const steps = PRODUCTION_STEPS.map(step => ({
    ...step,
    done: step.key === 'created' ? true
      : step.key === 'completed' ? (task.status === 'Hoàn Thành')
      : !!task[step.field],
  }));

  const handleCopy = (e) => {
    e.stopPropagation();
    if (firstLink?.url) {
      if (navigator.clipboard) navigator.clipboard.writeText(firstLink.url);
      onCopyLink?.(firstLink.url);
    }
  };

  return (
    <div className="mmed-card" onClick={onClick}>
      {/* Row 1: Title + Status badge */}
      <div className="mmed-c-row1">
        <div className="mmed-c-title">{task.title}</div>
        <span className={`mmed-badge ${statusBadge.cls}`}>{statusBadge.label}</span>
      </div>

      {/* Row 2: Meta line — assignee · deadline · overdue */}
      <div className="mmed-c-meta">
        <span>👤 {task.assignee || '—'}</span>
        {task.due_date && (
          <>
            <span className="mmed-c-dot">·</span>
            <span className={overdue ? 'mmed-text-red' : ''}>📅 {formatDate(task.due_date)}</span>
          </>
        )}
        {overdue && (
          <>
            <span className="mmed-c-dot">·</span>
            <span className="mmed-text-red">⚠️ Quá hạn</span>
          </>
        )}
      </div>

      {/* Row 3: Progress dots inline + stats + copy */}
      <div className="mmed-c-bottom">
        <div className="mmed-c-steps">
          {steps.map((step) => (
            <span key={step.key} className={`mmed-c-step ${step.done ? 'done' : ''}`} title={step.key}>
              {step.icon}
            </span>
          ))}
        </div>
        {hasStats && (
          <div className="mmed-c-stats">
            <span>👁{formatNum(totalStats.views)}</span>
            <span>❤️{formatNum(totalStats.likes)}</span>
          </div>
        )}
        {firstLink && (
          <button className="mmed-c-copy" onClick={handleCopy}>📋</button>
        )}
      </div>
    </div>
  );
}

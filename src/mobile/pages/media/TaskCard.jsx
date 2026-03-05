import React from 'react';

const STATUS_CONFIG = {
  'Nháp': { label: 'Nháp', cls: 'mmed-badge-gray' },
  'Chờ Duyệt': { label: 'Chờ Duyệt', cls: 'mmed-badge-amber' },
  'Đã Duyệt': { label: 'Đã Duyệt', cls: 'mmed-badge-green' },
  'Đang Làm': { label: 'Đang Làm', cls: 'mmed-badge-blue' },
  'Hoàn Thành': { label: 'Hoàn Thành', cls: 'mmed-badge-purple' },
};

const CATEGORY_LABELS = {
  video_dan: '🎬 Video dàn',
  video_hangngay: '📅 Hàng ngày',
  video_huongdan: '📚 Hướng dẫn',
  video_quangcao: '📢 Quảng cáo',
  video_review: '⭐ Review',
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });
};

const isOverdue = (dueDate, status) => {
  if (!dueDate || status === 'Hoàn Thành') return false;
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const due = new Date(dueDate);
  return due < vnNow;
};

export default function TaskCard({ task, onClick }) {
  const status = STATUS_CONFIG[task.status] || STATUS_CONFIG['Nháp'];
  const overdue = isOverdue(task.due_date, task.status);
  const category = CATEGORY_LABELS[task.category] || '';
  const crew = [...new Set([...(task.cameramen || []), ...(task.editors || [])])];
  const commentCount = (task.comments || []).length;
  const linkCount = (task.post_links || []).length;

  // Progress indicators
  const hasFilmed = !!task.filmed_at;
  const hasEdited = !!task.edited_at;
  const isCompleted = task.status === 'Hoàn Thành';

  return (
    <button className="mmed-card" onClick={onClick}>
      <div className="mmed-card-top">
        <span className="mmed-card-title">{task.title}</span>
        <span className={`mmed-badge ${status.cls}`}>{status.label}</span>
      </div>

      {category && <span className="mmed-card-category">{category}</span>}

      <div className="mmed-card-meta">
        <span className="mmed-card-assignee">👤 {task.assignee || '—'}</span>
        {task.due_date && (
          <span className={`mmed-card-deadline ${overdue ? 'mmed-overdue' : ''}`}>
            {overdue ? '⚠️' : '📅'} {formatDate(task.due_date)}
          </span>
        )}
      </div>

      {/* Progress dots */}
      <div className="mmed-card-progress">
        <span className={`mmed-progress-dot ${hasFilmed ? 'done' : ''}`} title="Quay">🎥</span>
        <span className="mmed-progress-line" />
        <span className={`mmed-progress-dot ${hasEdited ? 'done' : ''}`} title="Edit">✂️</span>
        <span className="mmed-progress-line" />
        <span className={`mmed-progress-dot ${isCompleted ? 'done' : ''}`} title="Xong">✅</span>
      </div>

      <div className="mmed-card-bottom">
        <div className="mmed-card-left">
          {task.platform && (
            <span className="mmed-card-platforms">
              {task.platform.split(',').map(p => p.trim()).slice(0, 3).join(' · ')}
            </span>
          )}
        </div>
        <div className="mmed-card-right">
          {crew.length > 0 && <span className="mmed-card-crew">🎬 {crew.length}</span>}
          {commentCount > 0 && <span className="mmed-card-comments">💬 {commentCount}</span>}
          {linkCount > 0 && <span className="mmed-card-links">🔗 {linkCount}</span>}
        </div>
      </div>
    </button>
  );
}

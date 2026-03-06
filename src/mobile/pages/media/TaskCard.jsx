import React from 'react';
import { formatMoney } from '../../utils/formatters';

const STATUS_BADGE = {
  'Nháp': { label: 'Nháp', cls: 'mmed-badge-draft' },
  'Chờ Duyệt': { label: 'Chờ Duyệt', cls: 'mmed-badge-review' },
  'Đã Duyệt': { label: 'Đã Duyệt', cls: 'mmed-badge-content' },
  'Đang Làm': { label: 'Đang Làm', cls: 'mmed-badge-content' },
  'Hoàn Thành': { label: 'Hoàn Thành', cls: 'mmed-badge-done' },
  'Cần Sửa': { label: 'Cần Sửa', cls: 'mmed-badge-review' },
};

const CATEGORY_BADGE = {
  video_dan: { label: '🎬 Video dàn', cls: '' },
  video_hangngay: { label: '📅 Hàng ngày', cls: '' },
  video_huongdan: { label: '📚 Hướng dẫn', cls: 'mmed-badge-guide' },
  video_quangcao: { label: '📢 Quảng cáo', cls: '' },
  video_review: { label: '⭐ Review', cls: '' },
};

const PRODUCTION_STEPS = [
  { key: 'created', label: 'Tạo', icon: '📝', field: 'created_at' },
  { key: 'filmed', label: 'Quay', icon: '🎥', field: 'filmed_at' },
  { key: 'edited', label: 'Dựng', icon: '✂️', field: 'edited_at' },
  { key: 'completed', label: 'Hoàn thành', icon: '✅', field: 'completed_at' },
];

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
  return new Date(dueDate) < vnNow;
};

const formatNum = (n) => {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString('vi-VN');
};

export default function TaskCard({ task, onClick, onToggleStep, onCopyLink }) {
  const statusBadge = STATUS_BADGE[task.status] || STATUS_BADGE['Nháp'];
  const overdue = isOverdue(task.due_date, task.status);
  const categoryBadge = CATEGORY_BADGE[task.category];
  const postLinks = task.post_links || [];

  // Aggregate stats from post_links
  const totalStats = postLinks.reduce((acc, link) => {
    if (link.stats) {
      acc.views += link.stats.views || 0;
      acc.likes += link.stats.likes || 0;
      acc.comments += link.stats.comments || 0;
    }
    return acc;
  }, { views: 0, likes: 0, comments: 0 });

  const hasStats = totalStats.views > 0 || totalStats.likes > 0 || totalStats.comments > 0;
  const firstLink = postLinks.find(l => l.url);

  // Production step states
  const steps = PRODUCTION_STEPS.map(step => ({
    ...step,
    done: step.key === 'created' ? true : !!task[step.field],
  }));

  // Determine which step is active (first not-done step)
  const activeIdx = steps.findIndex(s => !s.done);

  const handleStepTap = (e, idx) => {
    e.stopPropagation();
    if (idx === 0) return; // Can't toggle "Tạo"
    const step = steps[idx];
    if (step.done) return; // Already done
    if (idx > 0 && !steps[idx - 1].done) return; // Previous not done
    onToggleStep?.(task.id, step.key);
  };

  const handleCopy = (e) => {
    e.stopPropagation();
    if (firstLink?.url) {
      onCopyLink?.(firstLink.url);
    }
  };

  const handleViewVideo = (e) => {
    e.stopPropagation();
    if (firstLink?.url) {
      window.open(firstLink.url, '_blank');
    }
  };

  return (
    <div className="mmed-card" onClick={onClick}>
      {/* Title */}
      <div className="mmed-card-title">{task.title}</div>

      {/* Stats row */}
      {hasStats && (
        <div className="mmed-stats-row">
          <span className="mmed-stat-item">👁 {formatNum(totalStats.views)}</span>
          <span className="mmed-stat-item">❤️ {formatNum(totalStats.likes)}</span>
          <span className="mmed-stat-item">💬 {formatNum(totalStats.comments)}</span>
        </div>
      )}

      {/* Revenue */}
      {task.media_salary > 0 && (
        <div className="mmed-revenue">💰 {formatMoney(task.media_salary)}</div>
      )}

      {/* Badges */}
      <div className="mmed-badges">
        <span className={`mmed-badge ${statusBadge.cls}`}>{statusBadge.label}</span>
        {categoryBadge && (
          <span className={`mmed-badge ${categoryBadge.cls || 'mmed-badge-performance'}`}>{categoryBadge.label}</span>
        )}
        {overdue && <span className="mmed-badge mmed-badge-review">⚠️ Quá hạn</span>}
      </div>

      {/* Info: assignee + date */}
      <div className="mmed-card-info">
        <span>👤 {task.assignee || '—'}</span>
        {task.due_date && (
          <>
            <span className="mmed-card-info-dot">·</span>
            <span>📅 {formatDate(task.due_date)}</span>
          </>
        )}
      </div>

      {/* Production progress steps */}
      <div className="mmed-progress">
        <div className="mmed-progress-title">Tiến trình</div>
        <div className="mmed-progress-steps">
          {steps.map((step, i) => (
            <button
              key={step.key}
              className={`mmed-step ${step.done ? 'mmed-step-done' : i === activeIdx ? 'mmed-step-active' : 'mmed-step-pending'}`}
              onClick={(e) => handleStepTap(e, i)}
              disabled={step.key === 'created'}
            >
              {step.icon} {step.label}
            </button>
          ))}
        </div>
      </div>

      {/* Platform chips */}
      {task.platform && (
        <div className="mmed-products">
          {task.platform.split(',').map((p, i) => (
            <span key={i} className="mmed-product-chip">
              {p.trim() === 'Facebook' ? '📘' : p.trim() === 'TikTok' ? '🎵' : p.trim() === 'YouTube' ? '📺' : p.trim() === 'Instagram' ? '📸' : '📱'} {p.trim()}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {firstLink && (
        <div className="mmed-actions">
          <button className="mmed-action-btn mmed-btn-copy" onClick={handleCopy}>
            📋 Copy link
          </button>
          <button className="mmed-action-btn mmed-btn-view" onClick={handleViewVideo}>
            ▶️ Xem video
          </button>
        </div>
      )}
    </div>
  );
}

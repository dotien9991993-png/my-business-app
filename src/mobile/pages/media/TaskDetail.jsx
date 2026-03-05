import React, { useState } from 'react';
import { formatMoney } from '../../utils/formatters';

const STATUS_CONFIG = {
  'Nháp': { label: 'Nháp', icon: '📝' },
  'Chờ Duyệt': { label: 'Chờ Duyệt', icon: '⏳' },
  'Đã Duyệt': { label: 'Đã Duyệt', icon: '👍' },
  'Đang Làm': { label: 'Đang Làm', icon: '🔨' },
  'Hoàn Thành': { label: 'Hoàn Thành', icon: '✅' },
};

const STATUS_FLOW = ['Nháp', 'Chờ Duyệt', 'Đã Duyệt', 'Đang Làm', 'Hoàn Thành'];

const CATEGORY_LABELS = {
  video_dan: '🎬 Video dàn',
  video_hangngay: '📅 Video hàng ngày',
  video_huongdan: '📚 Video hướng dẫn',
  video_quangcao: '📢 Video quảng cáo',
  video_review: '⭐ Video review',
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const isOverdue = (dueDate, status) => {
  if (!dueDate || status === 'Hoàn Thành') return false;
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  return new Date(dueDate) < vnNow;
};

export default function TaskDetail({ task, onBack, onUpdateStatus, onAddComment, userName }) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandSection, setExpandSection] = useState({ timeline: true, links: false, comments: true });
  const [statusUpdating, setStatusUpdating] = useState(false);

  const status = STATUS_CONFIG[task.status] || STATUS_CONFIG['Nháp'];
  const overdue = isOverdue(task.due_date, task.status);
  const crew = [...new Set([...(task.cameramen || []), ...(task.editors || [])])];
  const comments = task.comments || [];
  const postLinks = task.post_links || [];

  const toggleSection = (key) => {
    setExpandSection(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Determine next status action
  const getNextStatusAction = () => {
    const currentIdx = STATUS_FLOW.indexOf(task.status);
    if (currentIdx < 0 || currentIdx >= STATUS_FLOW.length - 1) return null;
    const nextStatus = STATUS_FLOW[currentIdx + 1];
    return { status: nextStatus, label: `→ ${STATUS_CONFIG[nextStatus]?.label || nextStatus}` };
  };

  const handleStatusUpdate = async (newStatus) => {
    setStatusUpdating(true);
    try {
      await onUpdateStatus(task.id, newStatus);
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(task.id, commentText.trim(), comments);
      setCommentText('');
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const nextAction = getNextStatusAction();

  // Timeline steps
  const timelineSteps = [
    { label: 'Tạo', icon: '📝', done: true, time: task.created_at },
    { label: 'Quay xong', icon: '🎥', done: !!task.filmed_at, time: task.filmed_at },
    { label: 'Edit xong', icon: '✂️', done: !!task.edited_at, time: task.edited_at },
    { label: 'Hoàn thành', icon: '✅', done: task.status === 'Hoàn Thành', time: task.completed_at },
  ];

  // Quick status buttons for production timeline
  const handleTimelineAction = (step) => {
    if (step === 1 && !task.filmed_at) handleStatusUpdate('Đã Quay');
    if (step === 2 && !task.edited_at && task.filmed_at) handleStatusUpdate('Đang Edit');
    if (step === 3 && task.filmed_at) handleStatusUpdate('Hoàn Thành');
  };

  return (
    <div className="mobile-page mmed-detail-page">
      {/* Header */}
      <div className="mmed-detail-header">
        <button className="mmed-detail-back" onClick={onBack}>← Quay lại</button>
        <span className="mmed-detail-status">{status.icon} {status.label}</span>
      </div>

      {/* Title */}
      <div className="mmed-detail-title">
        <h2>{task.title}</h2>
        {overdue && <span className="mmed-overdue-badge">⚠️ Quá hạn</span>}
      </div>

      {/* Info grid */}
      <div className="mmed-section">
        <div className="mmed-info-grid">
          <div className="mmed-info-item">
            <span className="mmed-info-label">Người phụ trách</span>
            <span className="mmed-info-val">👤 {task.assignee || '—'}</span>
          </div>
          <div className="mmed-info-item">
            <span className="mmed-info-label">Team</span>
            <span className="mmed-info-val">🏢 {task.team || '—'}</span>
          </div>
          {task.due_date && (
            <div className="mmed-info-item">
              <span className="mmed-info-label">Deadline</span>
              <span className={`mmed-info-val ${overdue ? 'mmed-text-red' : ''}`}>
                📅 {formatDate(task.due_date)}
              </span>
            </div>
          )}
          {task.category && (
            <div className="mmed-info-item">
              <span className="mmed-info-label">Loại</span>
              <span className="mmed-info-val">{CATEGORY_LABELS[task.category] || task.category}</span>
            </div>
          )}
          {task.platform && (
            <div className="mmed-info-item">
              <span className="mmed-info-label">Nền tảng</span>
              <span className="mmed-info-val">📱 {task.platform}</span>
            </div>
          )}
          {task.media_salary && (
            <div className="mmed-info-item">
              <span className="mmed-info-label">Thù lao</span>
              <span className="mmed-info-val">💰 {formatMoney(task.media_salary)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <div className="mmed-section">
          <h3 className="mmed-section-title">📋 Mô tả</h3>
          <div className="mmed-description">{task.description}</div>
        </div>
      )}

      {/* Crew */}
      {(crew.length > 0 || (task.actors || []).length > 0) && (
        <div className="mmed-section">
          <h3 className="mmed-section-title">👥 Ekip</h3>
          <div className="mmed-section-body">
            {crew.length > 0 && (
              <div className="mmed-crew-row">
                <span className="mmed-crew-label">🎬 Quay/Dựng:</span>
                <div className="mmed-crew-tags">
                  {crew.map((c, i) => <span key={i} className="mmed-crew-tag">{c}</span>)}
                </div>
              </div>
            )}
            {(task.actors || []).length > 0 && (
              <div className="mmed-crew-row">
                <span className="mmed-crew-label">🎭 Diễn viên:</span>
                <div className="mmed-crew-tags">
                  {task.actors.map((a, i) => <span key={i} className="mmed-crew-tag">{a}</span>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Production timeline - expandable */}
      <div className="mmed-section">
        <button className="mmed-section-title mmed-section-toggle" onClick={() => toggleSection('timeline')}>
          📊 Tiến trình sản xuất
          <span>{expandSection.timeline ? '▼' : '▶'}</span>
        </button>
        {expandSection.timeline && (
          <div className="mmed-timeline">
            {timelineSteps.map((step, i) => (
              <div key={i} className={`mmed-timeline-step ${step.done ? 'done' : ''}`}>
                <div className="mmed-timeline-dot">
                  <span>{step.icon}</span>
                </div>
                {i < timelineSteps.length - 1 && <div className="mmed-timeline-line" />}
                <div className="mmed-timeline-info">
                  <span className="mmed-timeline-label">{step.label}</span>
                  {step.time && <span className="mmed-timeline-time">{formatDateTime(step.time)}</span>}
                  {!step.done && i > 0 && (
                    <button
                      className="mmed-timeline-btn"
                      onClick={() => handleTimelineAction(i)}
                      disabled={statusUpdating}
                    >
                      Đánh dấu hoàn thành
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post links - expandable */}
      {postLinks.length > 0 && (
        <div className="mmed-section">
          <button className="mmed-section-title mmed-section-toggle" onClick={() => toggleSection('links')}>
            🔗 Links đã đăng ({postLinks.length})
            <span>{expandSection.links ? '▼' : '▶'}</span>
          </button>
          {expandSection.links && (
            <div className="mmed-section-body">
              {postLinks.map((link, i) => (
                <div key={i} className="mmed-link-row">
                  <div className="mmed-link-info">
                    <span className="mmed-link-type">{link.type || 'Link'}</span>
                    <a className="mmed-link-url" href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.url?.length > 50 ? link.url.slice(0, 50) + '...' : link.url}
                    </a>
                    {link.addedBy && (
                      <span className="mmed-link-meta">{link.addedBy} · {link.addedAt}</span>
                    )}
                    {link.stats && (
                      <div className="mmed-link-stats">
                        <span>👁 {(link.stats.views || 0).toLocaleString('vi-VN')}</span>
                        <span>❤️ {(link.stats.likes || 0).toLocaleString('vi-VN')}</span>
                        <span>💬 {(link.stats.comments || 0).toLocaleString('vi-VN')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comments - expandable */}
      <div className="mmed-section">
        <button className="mmed-section-title mmed-section-toggle" onClick={() => toggleSection('comments')}>
          💬 Nhận xét ({comments.length})
          <span>{expandSection.comments ? '▼' : '▶'}</span>
        </button>
        {expandSection.comments && (
          <div className="mmed-section-body">
            {comments.length === 0 ? (
              <div className="mmed-empty-text">Chưa có nhận xét</div>
            ) : (
              <div className="mmed-comments-list">
                {comments.map((c, i) => (
                  <div key={i} className={`mmed-comment ${c.user === userName ? 'mmed-comment-mine' : ''}`}>
                    <div className="mmed-comment-header">
                      <span className="mmed-comment-user">
                        {c.user === userName ? '👤' : '👨‍💼'} {c.user}
                        {c.user === userName && ' (Bạn)'}
                      </span>
                      <span className="mmed-comment-time">{c.time}</span>
                    </div>
                    <div className="mmed-comment-text">{c.text}</div>
                  </div>
                ))}
              </div>
            )}
            {/* Add comment */}
            <div className="mmed-comment-form">
              <textarea
                className="mmed-comment-input"
                placeholder="Viết nhận xét..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                rows={2}
              />
              <button
                className="mmed-comment-send"
                onClick={handleAddComment}
                disabled={!commentText.trim() || submitting}
              >
                {submitting ? '...' : '💬 Gửi'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="mmed-meta">
        <span>Tạo bởi: {task.created_by || '—'}</span>
        <span>{formatDateTime(task.created_at)}</span>
      </div>

      {/* Floating status update button */}
      {nextAction && (
        <div className="mmed-floating-action">
          <button
            className="mmed-status-btn"
            onClick={() => handleStatusUpdate(nextAction.status)}
            disabled={statusUpdating}
          >
            {statusUpdating ? 'Đang cập nhật...' : `Chuyển ${nextAction.label}`}
          </button>
        </div>
      )}
    </div>
  );
}

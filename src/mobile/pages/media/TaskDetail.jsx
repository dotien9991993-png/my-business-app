import React, { useState } from 'react';
import { formatMoney } from '../../utils/formatters';

const STATUS_CONFIG = {
  'Nháp': { label: 'Nháp', icon: '📝', gradient: 'linear-gradient(135deg, #9ca3af, #6b7280)' },
  'Chờ Duyệt': { label: 'Chờ Duyệt', icon: '⏳', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  'Đã Duyệt': { label: 'Đã Duyệt', icon: '👍', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
  'Đang Làm': { label: 'Đang Làm', icon: '🔨', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
  'Hoàn Thành': { label: 'Hoàn Thành', icon: '✅', gradient: 'linear-gradient(135deg, #16a34a, #15803d)' },
  'Cần Sửa': { label: 'Cần Sửa', icon: '🔄', gradient: 'linear-gradient(135deg, #f97316, #ea580c)' },
};

const STATUS_FLOW = ['Nháp', 'Chờ Duyệt', 'Đã Duyệt', 'Đang Làm', 'Hoàn Thành'];

const CATEGORY_LABELS = {
  video_dan: '🎬 Video dàn',
  video_hangngay: '📅 Video hàng ngày',
  video_huongdan: '📚 Video hướng dẫn',
  video_quangcao: '📢 Video quảng cáo',
  video_review: '⭐ Video review',
};

const PLATFORM_ICONS = {
  'Facebook': '📘', 'TikTok': '🎵', 'YouTube': '📺',
  'Instagram': '📸', 'Blog': '📝', 'Ads': '📢', 'Email': '📧',
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

const formatNum = (n) => {
  if (!n) return '0';
  return n.toLocaleString('vi-VN');
};

export default function TaskDetail({ task, onBack, onUpdateStatus, onAddComment, userName, onCopyLink }) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandSection, setExpandSection] = useState({ timeline: true, links: true, comments: true });
  const [statusUpdating, setStatusUpdating] = useState(false);

  const status = STATUS_CONFIG[task.status] || STATUS_CONFIG['Nháp'];
  const overdue = isOverdue(task.due_date, task.status);
  const cameramen = task.cameramen || [];
  const editors = task.editors || [];
  const actors = task.actors || [];
  const comments = task.comments || [];
  const postLinks = task.post_links || [];

  const toggleSection = (key) => {
    setExpandSection(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getNextStatusAction = () => {
    const currentIdx = STATUS_FLOW.indexOf(task.status);
    if (currentIdx < 0 || currentIdx >= STATUS_FLOW.length - 1) return null;
    const nextStatus = STATUS_FLOW[currentIdx + 1];
    const next = STATUS_CONFIG[nextStatus];
    return { status: nextStatus, label: next?.label || nextStatus, icon: next?.icon || '' };
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

  const handleCopy = (url) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      onCopyLink?.(url);
    }
  };

  const nextAction = getNextStatusAction();

  // Timeline steps
  const timelineSteps = [
    { label: 'Tạo', icon: '📝', done: true, time: task.created_at },
    { label: 'Quay xong', icon: '🎥', done: !!task.filmed_at, time: task.filmed_at, action: 'Đã Quay' },
    { label: 'Dựng xong', icon: '✂️', done: !!task.edited_at, time: task.edited_at, action: 'Đang Edit' },
    { label: 'Hoàn thành', icon: '✅', done: task.status === 'Hoàn Thành', time: task.completed_at, action: 'Hoàn Thành' },
  ];

  const handleTimelineAction = async (step) => {
    if (step === 1 && !task.filmed_at) await handleStatusUpdate('Đã Quay');
    if (step === 2 && !task.edited_at && task.filmed_at) await handleStatusUpdate('Đang Edit');
    if (step === 3 && task.filmed_at) await handleStatusUpdate('Hoàn Thành');
  };

  // Aggregate stats
  const totalStats = postLinks.reduce((acc, link) => {
    if (link.stats) {
      acc.views += link.stats.views || 0;
      acc.likes += link.stats.likes || 0;
      acc.comments += link.stats.comments || 0;
      acc.shares += link.stats.shares || 0;
    }
    return acc;
  }, { views: 0, likes: 0, comments: 0, shares: 0 });

  const hasStats = totalStats.views > 0 || totalStats.likes > 0;

  return (
    <div className="mobile-page mmed-detail-page">
      {/* Gradient Header */}
      <div className="mmed-d2-header" style={{ background: status.gradient }}>
        <button className="mmed-d2-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Quay lại
        </button>
        <div className="mmed-d2-header-info">
          <h2 className="mmed-d2-title">{task.title}</h2>
          <div className="mmed-d2-header-badges">
            <span className="mmed-d2-header-badge">{status.icon} {status.label}</span>
            {task.category && <span className="mmed-d2-header-badge">{CATEGORY_LABELS[task.category] || task.category}</span>}
            {overdue && <span className="mmed-d2-header-badge mmed-d2-badge-overdue">⚠️ Quá hạn</span>}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="mmed-d2-body">
        {/* Stats summary */}
        {hasStats && (
          <div className="mmed-d2-stats">
            <div className="mmed-d2-stat">
              <span className="mmed-d2-stat-num">{formatNum(totalStats.views)}</span>
              <span className="mmed-d2-stat-label">Lượt xem</span>
            </div>
            <div className="mmed-d2-stat">
              <span className="mmed-d2-stat-num">{formatNum(totalStats.likes)}</span>
              <span className="mmed-d2-stat-label">Thích</span>
            </div>
            <div className="mmed-d2-stat">
              <span className="mmed-d2-stat-num">{formatNum(totalStats.comments)}</span>
              <span className="mmed-d2-stat-label">Bình luận</span>
            </div>
            <div className="mmed-d2-stat">
              <span className="mmed-d2-stat-num">{formatNum(totalStats.shares)}</span>
              <span className="mmed-d2-stat-label">Chia sẻ</span>
            </div>
          </div>
        )}

        {/* Info section */}
        <div className="mmed-d2-section">
          <h3 className="mmed-d2-section-title">📋 Thông tin</h3>
          <div className="mmed-d2-info-card">
            <div className="mmed-d2-info-row">
              <span className="mmed-d2-info-label">Người phụ trách</span>
              <span className="mmed-d2-info-val">👤 {task.assignee || '—'}</span>
            </div>
            <div className="mmed-d2-info-row">
              <span className="mmed-d2-info-label">Team</span>
              <span className="mmed-d2-info-val">🏢 {task.team || '—'}</span>
            </div>
            {task.due_date && (
              <div className="mmed-d2-info-row">
                <span className="mmed-d2-info-label">Deadline</span>
                <span className={`mmed-d2-info-val ${overdue ? 'mmed-text-red' : ''}`}>
                  📅 {formatDate(task.due_date)}
                </span>
              </div>
            )}
            {task.platform && (
              <div className="mmed-d2-info-row">
                <span className="mmed-d2-info-label">Nền tảng</span>
                <span className="mmed-d2-info-val">📱 {task.platform}</span>
              </div>
            )}
            {task.media_salary > 0 && (
              <div className="mmed-d2-info-row">
                <span className="mmed-d2-info-label">Thù lao</span>
                <span className="mmed-d2-info-val mmed-text-green">💰 {formatMoney(task.media_salary)}</span>
              </div>
            )}
            {task.priority && task.priority !== 'Trung bình' && (
              <div className="mmed-d2-info-row">
                <span className="mmed-d2-info-label">Ưu tiên</span>
                <span className={`mmed-d2-info-val ${task.priority === 'Cao' ? 'mmed-text-red' : ''}`}>
                  {task.priority === 'Cao' ? '🔴' : '🟢'} {task.priority}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <div className="mmed-d2-section">
            <h3 className="mmed-d2-section-title">📝 Ghi chú / Mô tả</h3>
            <div className="mmed-d2-desc">{task.description}</div>
          </div>
        )}

        {/* Team (Ekip) - full details */}
        {(cameramen.length > 0 || editors.length > 0 || actors.length > 0) && (
          <div className="mmed-d2-section">
            <h3 className="mmed-d2-section-title">👥 Ekip</h3>
            <div className="mmed-d2-info-card">
              {cameramen.length > 0 && (
                <div className="mmed-d2-crew-row">
                  <span className="mmed-d2-crew-label">🎬 Quay phim</span>
                  <div className="mmed-d2-crew-tags">
                    {cameramen.map((c, i) => (
                      <span key={i} className={`mmed-d2-crew-tag ${c === userName ? 'mmed-d2-crew-me' : ''}`}>
                        {c} {c === userName ? '(Bạn)' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {editors.length > 0 && (
                <div className="mmed-d2-crew-row">
                  <span className="mmed-d2-crew-label">✂️ Dựng phim</span>
                  <div className="mmed-d2-crew-tags">
                    {editors.map((e, i) => (
                      <span key={i} className={`mmed-d2-crew-tag ${e === userName ? 'mmed-d2-crew-me' : ''}`}>
                        {e} {e === userName ? '(Bạn)' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {actors.length > 0 && (
                <div className="mmed-d2-crew-row">
                  <span className="mmed-d2-crew-label">🎭 Diễn viên</span>
                  <div className="mmed-d2-crew-tags">
                    {actors.map((a, i) => (
                      <span key={i} className="mmed-d2-crew-tag">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Production timeline */}
        <div className="mmed-d2-section">
          <button className="mmed-d2-section-title mmed-d2-section-toggle" onClick={() => toggleSection('timeline')}>
            📊 Tiến trình sản xuất
            <span>{expandSection.timeline ? '▼' : '▶'}</span>
          </button>
          {expandSection.timeline && (
            <div className="mmed-d2-timeline">
              {timelineSteps.map((step, i) => (
                <div key={i} className={`mmed-d2-tl-step ${step.done ? 'done' : ''}`}>
                  <div className="mmed-d2-tl-left">
                    <div className={`mmed-d2-tl-dot ${step.done ? 'done' : ''}`}>
                      {step.icon}
                    </div>
                    {i < timelineSteps.length - 1 && (
                      <div className={`mmed-d2-tl-line ${step.done ? 'done' : ''}`} />
                    )}
                  </div>
                  <div className="mmed-d2-tl-info">
                    <span className="mmed-d2-tl-label">{step.label}</span>
                    {step.time && <span className="mmed-d2-tl-time">{formatDateTime(step.time)}</span>}
                    {!step.done && i > 0 && (
                      <button
                        className="mmed-d2-tl-btn"
                        onClick={() => handleTimelineAction(i)}
                        disabled={statusUpdating || (i > 1 && !timelineSteps[i - 1].done)}
                      >
                        {statusUpdating ? '...' : 'Đánh dấu hoàn thành'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Post links */}
        {postLinks.length > 0 && (
          <div className="mmed-d2-section">
            <button className="mmed-d2-section-title mmed-d2-section-toggle" onClick={() => toggleSection('links')}>
              🔗 Links đã đăng ({postLinks.length})
              <span>{expandSection.links ? '▼' : '▶'}</span>
            </button>
            {expandSection.links && (
              <div className="mmed-d2-links">
                {postLinks.map((link, i) => (
                  <div key={i} className="mmed-d2-link-card">
                    <div className="mmed-d2-link-top">
                      <span className="mmed-d2-link-type">
                        {PLATFORM_ICONS[link.type] || '🔗'} {link.type || 'Link'}
                      </span>
                      <button className="mmed-d2-link-copy" onClick={() => handleCopy(link.url)}>
                        📋 Copy
                      </button>
                    </div>
                    <a className="mmed-d2-link-url" href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.url?.length > 60 ? link.url.slice(0, 60) + '...' : link.url}
                    </a>
                    {link.stats && (
                      <div className="mmed-d2-link-stats">
                        <span>👁 {formatNum(link.stats.views || 0)}</span>
                        <span>❤️ {formatNum(link.stats.likes || 0)}</span>
                        <span>💬 {formatNum(link.stats.comments || 0)}</span>
                        <span>🔄 {formatNum(link.stats.shares || 0)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Comments */}
        <div className="mmed-d2-section">
          <button className="mmed-d2-section-title mmed-d2-section-toggle" onClick={() => toggleSection('comments')}>
            💬 Nhận xét ({comments.length})
            <span>{expandSection.comments ? '▼' : '▶'}</span>
          </button>
          {expandSection.comments && (
            <div className="mmed-d2-comments">
              {comments.length === 0 ? (
                <div className="mmed-d2-empty">Chưa có nhận xét</div>
              ) : (
                comments.map((c, i) => (
                  <div key={i} className={`mmed-d2-comment ${c.user === userName ? 'mine' : ''}`}>
                    <div className="mmed-d2-comment-header">
                      <span className="mmed-d2-comment-user">
                        {c.user === userName ? '👤' : '👨‍💼'} {c.user}
                        {c.user === userName && ' (Bạn)'}
                      </span>
                      <span className="mmed-d2-comment-time">{c.time}</span>
                    </div>
                    <div className="mmed-d2-comment-text">{c.text}</div>
                  </div>
                ))
              )}
              {/* Add comment */}
              <div className="mmed-d2-comment-form">
                <textarea
                  className="mmed-d2-comment-input"
                  placeholder="Viết nhận xét..."
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  rows={2}
                />
                <button
                  className="mmed-d2-comment-send"
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
        <div className="mmed-d2-meta">
          <span>Tạo bởi: {task.created_by || '—'}</span>
          <span>{formatDateTime(task.created_at)}</span>
        </div>
      </div>

      {/* Sticky bottom actions */}
      {nextAction && (
        <div className="mmed-d2-sticky">
          <button
            className="mmed-d2-status-btn"
            onClick={() => handleStatusUpdate(nextAction.status)}
            disabled={statusUpdating}
            style={{ background: STATUS_CONFIG[nextAction.status]?.gradient || '#15803d' }}
          >
            {statusUpdating ? 'Đang cập nhật...' : `${nextAction.icon} Chuyển → ${nextAction.label}`}
          </button>
        </div>
      )}
    </div>
  );
}

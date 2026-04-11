import React, { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { formatMoney } from '../../utils/formatters';
import { haptic } from '../../utils/haptics';

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
  const deadline = new Date(dueDate);
  deadline.setHours(23, 59, 59, 999);
  return vnNow > deadline;
};

const formatNum = (n) => {
  if (!n) return '0';
  return n.toLocaleString('vi-VN');
};

export default function TaskDetail({ task, onBack, onUpdateStatus, onAddComment, userName, onCopyLink, onTaskChanged }) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkType, setNewLinkType] = useState('Facebook');
  const [savingLink, setSavingLink] = useState(false);
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

  // Thêm link — giống desktop DataContext.addPostLink
  const handleAddLink = async () => {
    if (!newLinkUrl.trim()) return;
    setSavingLink(true);
    try {
      const now = new Date();
      const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const newLink = { url: newLinkUrl.trim(), type: newLinkType, addedBy: userName, addedAt: timeStr };
      const updatedLinks = [...postLinks, newLink];
      const { error } = await supabase.from('tasks').update({ post_links: updatedLinks }).eq('id', task.id);
      if (error) throw error;
      task.post_links = updatedLinks;
      setNewLinkUrl('');
    } catch (err) {
      alert('Lỗi lưu link: ' + (err.message || ''));
    } finally {
      setSavingLink(false);
    }
  };

  const nextAction = getNextStatusAction();

  // Timeline steps — giống hệt desktop TaskModal.jsx (lines 664-735)
  // Mỗi step khi bấm sẽ cascading fill tất cả field trước nó
  const TIMELINE_STEPS = [
    { label: 'Tạo', icon: '📝', fills: [], status: null },
    { label: 'Quay xong', icon: '🎥', fills: ['filmed_at'], status: 'Đã Quay' },
    { label: 'Dựng xong', icon: '✂️', fills: ['filmed_at', 'edited_at'], status: 'Đang Edit' },
    { label: 'Hoàn thành', icon: '✅', fills: ['filmed_at', 'edited_at', 'completed_at'], status: 'Hoàn Thành' },
  ];

  const timelineSteps = TIMELINE_STEPS.map((step, i) => {
    if (i === 0) return { ...step, done: true, time: task.created_at };
    const lastFill = step.fills[step.fills.length - 1];
    const done = i === 3 ? task.status === 'Hoàn Thành' : !!task[lastFill];
    return { ...step, done, time: task[lastFill] || (done && i === 3 ? task.completed_at : null) };
  });

  // Bước tiếp theo cần làm = bước đầu tiên chưa done (bỏ qua step 0 "Tạo")
  const nextStepIndex = timelineSteps.findIndex((s, i) => i > 0 && !s.done);

  const [timelineUpdating, setTimelineUpdating] = useState(false);

  // Link validation — giống hệt desktop TaskModal.jsx + socialStatsService.js
  const validateFacebookUrl = (url) => url && /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.com|m\.facebook\.com)\//i.test(url);
  const validateTikTokUrl = (url) => url && /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/.test(url);
  const validateLinkForPlatform = (url, plat) => {
    if (plat === 'Facebook') return validateFacebookUrl(url);
    if (plat === 'TikTok') return validateTikTokUrl(url);
    return true; // Các platform khác chỉ cần có link
  };

  const [showLinkWarning, setShowLinkWarning] = useState(false);
  const [missingLinks, setMissingLinks] = useState([]);

  const handleTimelineAction = async (stepIndex) => {
    const step = TIMELINE_STEPS[stepIndex];
    if (!step || !step.status) return;

    // Kiểm tra link khi bấm Hoàn thành — giống hệt desktop TaskModal.jsx lines 676-696
    if (step.status === 'Hoàn Thành') {
      const taskPlatforms = (task.platform || '').split(', ').filter(Boolean);
      const existingLinks = postLinks;
      if (taskPlatforms.length > 0) {
        const missing = taskPlatforms.filter(plat => !existingLinks.find(l => l.type === plat));
        const invalid = taskPlatforms.filter(plat => {
          const link = existingLinks.find(l => l.type === plat);
          return link && !validateLinkForPlatform(link.url, plat);
        });
        if (missing.length > 0 || invalid.length > 0) {
          setMissingLinks(taskPlatforms.map(plat => {
            const link = existingLinks.find(l => l.type === plat);
            const isValid = link ? validateLinkForPlatform(link.url, plat) : false;
            return { platform: plat, hasLink: !!link, isValid };
          }));
          setShowLinkWarning(true);
          return;
        }
      }
    }

    if (!window.confirm(`Xác nhận đánh dấu "${step.label}"?`)) return;

    setTimelineUpdating(true);
    try {
      const now = new Date().toISOString();
      const updateData = { status: step.status };

      // Cascading fill — chỉ set field chưa có (giống desktop)
      step.fills.forEach(field => {
        if (!task[field]) updateData[field] = now;
      });

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', task.id);
      if (error) throw error;

      await haptic();

      // Cập nhật parent state + trigger refresh danh sách
      onTaskChanged?.(updateData);
    } catch (err) {
      console.error('Error updating timeline:', err, err?.message, err?.details, err?.code);
      alert('Lỗi cập nhật tiến trình: ' + (err?.message || ''));
    } finally {
      setTimelineUpdating(false);
    }
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
    <div className="mobile-page mmed-detail-page mpage-slide-in">
      {/* Gradient Header */}
      <div className="mmed-d2-header">
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

        {/* 1. Links đã đăng — ưu tiên cao nhất */}
        {postLinks.length > 0 && (
          <div className="mmed-links-section">
            <div className="mmed-d2-section-title">🔗 Links đã đăng ({postLinks.length})</div>
            {postLinks.map((link, i) => (
              <div key={i} className="mmed-link-item">
                <div className="mmed-link-header">
                  <span className="mmed-link-platform">
                    {PLATFORM_ICONS[link.type] || '🔗'} {link.type || 'Link'}
                  </span>
                  <button className="mmed-copy-btn" onClick={() => handleCopy(link.url)}>
                    📋 Copy
                  </button>
                </div>
                <a className="mmed-link-url" href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.url}
                </a>
                {link.stats && (
                  <div className="mmed-link-stats">
                    <span>👁 {formatNum(link.stats.views || 0)}</span>
                    <span> · ❤️ {formatNum(link.stats.likes || 0)}</span>
                    <span> · 💬 {formatNum(link.stats.comments || 0)}</span>
                    <span> · 🔄 {formatNum(link.stats.shares || 0)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 1b. Thêm link — chỉ hiện khi chưa hoàn thành */}
        {task.status !== 'Hoàn Thành' && (
          <div className="mmed-d2-section">
            <h3 className="mmed-d2-section-title">🔗 Thêm link đã đăng</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select
                value={newLinkType}
                onChange={e => setNewLinkType(e.target.value)}
                style={{ padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#f9fafb', flex: '0 0 auto' }}
              >
                {Object.entries(PLATFORM_ICONS).map(([plat, icon]) => (
                  <option key={plat} value={plat}>{icon} {plat}</option>
                ))}
              </select>
              <input
                type="url"
                value={newLinkUrl}
                onChange={e => setNewLinkUrl(e.target.value)}
                placeholder="Dán link vào đây..."
                style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#f9fafb', minWidth: 0 }}
              />
            </div>
            <button
              onClick={handleAddLink}
              disabled={!newLinkUrl.trim() || savingLink}
              style={{
                width: '100%', padding: 10, background: newLinkUrl.trim() ? '#15803d' : '#d1d5db',
                color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                opacity: savingLink ? 0.5 : 1, cursor: newLinkUrl.trim() ? 'pointer' : 'default',
              }}
            >
              {savingLink ? 'Đang lưu...' : '💾 Lưu link'}
            </button>
          </div>
        )}

        {/* 2. Tiến trình sản xuất — grid 2 cột */}
        <div className="mmed-d2-section">
          <h3 className="mmed-d2-section-title">📊 Tiến trình sản xuất</h3>
          <div className="mmed-progress-grid">
            {timelineSteps.map((step, i) => {
              const isNext = i === nextStepIndex;
              const isFuture = i > 0 && !step.done && !isNext;
              const canTap = isNext && !timelineUpdating;

              return (
                <button
                  key={i}
                  className={[
                    'mmed-progress-item',
                    step.done ? 'mmed-step-done' : '',
                    isNext ? 'mmed-step-next' : '',
                    isFuture ? 'mmed-step-future' : '',
                    !step.done && i === 0 ? 'mmed-step-done' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => canTap && handleTimelineAction(i)}
                  disabled={!canTap}
                >
                  <span className="mmed-step-icon">{step.icon}</span>
                  <span className="mmed-step-label">{step.label}</span>
                  {step.time && <span className="mmed-step-time">{formatDateTime(step.time)}</span>}
                  {isNext && !timelineUpdating && <span className="mmed-step-tap">Bấm để cập nhật</span>}
                  {isNext && timelineUpdating && <span className="mmed-step-tap">Đang cập nhật...</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Thông tin — compact grid 2×2 */}
        <div className="mmed-info-compact">
          <div className="mmed-info-item">
            <span>👤</span>
            <div>
              <div className="mmed-info-label">Phụ trách</div>
              <div className="mmed-info-value">{task.assignee || '—'}</div>
            </div>
          </div>
          <div className="mmed-info-item">
            <span>🏢</span>
            <div>
              <div className="mmed-info-label">Team</div>
              <div className="mmed-info-value">{task.team || '—'}</div>
            </div>
          </div>
          {task.due_date && (
            <div className="mmed-info-item">
              <span>📅</span>
              <div>
                <div className="mmed-info-label">Deadline</div>
                <div className={`mmed-info-value ${overdue ? 'mmed-text-red' : ''}`}>{formatDate(task.due_date)}</div>
              </div>
            </div>
          )}
          {task.platform && (
            <div className="mmed-info-item">
              <span>📱</span>
              <div>
                <div className="mmed-info-label">Nền tảng</div>
                <div className="mmed-info-value">{task.platform}</div>
              </div>
            </div>
          )}
          {task.media_salary > 0 && (
            <div className="mmed-info-item">
              <span>💰</span>
              <div>
                <div className="mmed-info-label">Thù lao</div>
                <div className="mmed-info-value mmed-text-green">{formatMoney(task.media_salary)}</div>
              </div>
            </div>
          )}
          {task.priority && task.priority !== 'Trung bình' && (
            <div className="mmed-info-item">
              <span>{task.priority === 'Cao' ? '🔴' : '🟢'}</span>
              <div>
                <div className="mmed-info-label">Ưu tiên</div>
                <div className={`mmed-info-value ${task.priority === 'Cao' ? 'mmed-text-red' : ''}`}>{task.priority}</div>
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <div className="mmed-d2-section">
            <h3 className="mmed-d2-section-title">📝 Ghi chú / Mô tả</h3>
            <div className="mmed-d2-desc">{task.description}</div>
          </div>
        )}

        {/* 4. Ekip — inline chips */}
        {(cameramen.length > 0 || editors.length > 0 || actors.length > 0) && (
          <div className="mmed-d2-section">
            <h3 className="mmed-d2-section-title">👥 Ekip</h3>
            <div className="mmed-ekip">
              {cameramen.map((c, i) => (
                <span key={`cam-${i}`} className={`mmed-ekip-chip ${c === userName ? 'mmed-ekip-me' : ''}`}>
                  🎬 {c} {c === userName ? '(Bạn)' : ''} <span className="mmed-ekip-role">(Quay)</span>
                </span>
              ))}
              {editors.map((e, i) => (
                <span key={`edit-${i}`} className={`mmed-ekip-chip ${e === userName ? 'mmed-ekip-me' : ''}`}>
                  ✂️ {e} {e === userName ? '(Bạn)' : ''} <span className="mmed-ekip-role">(Dựng)</span>
                </span>
              ))}
              {actors.map((a, i) => (
                <span key={`act-${i}`} className="mmed-ekip-chip">
                  🎭 {a} <span className="mmed-ekip-role">(Diễn)</span>
                </span>
              ))}
            </div>
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

      {/* Link warning modal — giống desktop TaskModal.jsx */}
      {showLinkWarning && (
        <div className="mmed-link-warning-overlay">
          <div className="mmed-link-warning-modal">
            <div className="mmed-link-warning-header">
              <h3>Chưa thể hoàn thành!</h3>
              <p>
                {missingLinks.some(i => !i.hasLink) && missingLinks.some(i => i.hasLink && !i.isValid)
                  ? 'Có platform chưa điền link và link sai định dạng:'
                  : missingLinks.some(i => !i.hasLink)
                    ? 'Vui lòng điền đủ link cho các platform đã chọn:'
                    : 'Link không đúng định dạng. Vui lòng sửa lại:'}
              </p>
            </div>
            <div className="mmed-link-warning-list">
              {missingLinks.map(item => (
                <div key={item.platform} className={`mmed-link-warning-item ${
                  item.hasLink && item.isValid ? 'ok' : item.hasLink ? 'warn' : 'miss'
                }`}>
                  <span>{item.hasLink && item.isValid ? '✅' : item.hasLink ? '⚠️' : '❌'}</span>
                  <span className="mmed-link-warning-plat">{item.platform}</span>
                  <span className="mmed-link-warning-status">
                    {item.hasLink && item.isValid ? 'Đã có link' : item.hasLink ? 'Link sai định dạng' : 'Chưa có link'}
                  </span>
                </div>
              ))}
            </div>
            <div className="mmed-link-warning-actions">
              <button className="mmed-link-warning-close" onClick={() => setShowLinkWarning(false)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

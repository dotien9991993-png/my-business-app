import React, { useState, useCallback } from 'react';
import { useMobileMedia } from '../../hooks/useMobileMedia';
import TaskCard from './TaskCard';
import TaskDetail from './TaskDetail';

const STATUS_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'Đang Làm', label: 'Đang làm' },
  { id: 'Chờ Duyệt', label: 'Chờ duyệt' },
  { id: 'Đã Duyệt', label: 'Đã duyệt' },
  { id: 'Hoàn Thành', label: 'Hoàn thành' },
];

const DATE_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: '7 ngày' },
  { id: 'overdue', label: '⚠️ Quá hạn' },
];

export default function MediaPage({ user, tenantId }) {
  const {
    tasks, totalCount, loading, loadingMore, filters, permLevel,
    updateFilter, updateTaskStatus, addComment,
    hasMore, loadMore, refresh,
  } = useMobileMedia(user?.id, user?.name, tenantId);

  const [selectedTask, setSelectedTask] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const handleOpenDetail = (task) => {
    setSelectedTask(task);
  };

  const handleCloseDetail = () => {
    setSelectedTask(null);
    refresh();
  };

  const handleStatusUpdate = async (taskId, newStatus) => {
    await updateTaskStatus(taskId, newStatus);
    setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null);
    refresh();
  };

  const handleToggleStep = useCallback(async (taskId, stepKey) => {
    let newStatus;
    if (stepKey === 'filmed') newStatus = 'Đã Quay';
    else if (stepKey === 'edited') newStatus = 'Đang Edit';
    else if (stepKey === 'completed') newStatus = 'Hoàn Thành';
    if (!newStatus) return;

    try {
      await updateTaskStatus(taskId, newStatus);
      showToast('Đã cập nhật tiến trình!');
      refresh();
    } catch (err) {
      console.error('Error toggling step:', err);
    }
  }, [updateTaskStatus, refresh, showToast]);

  const handleCopyLink = useCallback((url) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      showToast('Đã copy link! 📋');
    }
  }, [showToast]);

  // Show detail view
  if (selectedTask) {
    return (
      <>
        <TaskDetail
          task={selectedTask}
          onBack={handleCloseDetail}
          onUpdateStatus={handleStatusUpdate}
          onAddComment={addComment}
          userName={user?.name}
          onCopyLink={() => showToast('Đã copy link! 📋')}
        />
        {toast && <div className="mmed-toast">{toast}</div>}
      </>
    );
  }

  return (
    <div className="mobile-page mmed-page">
      {/* Tab: My tasks / All tasks */}
      {permLevel >= 2 && (
        <div className="mmed-view-tabs">
          <button
            className={`mmed-view-tab ${filters.tab === 'my' ? 'active' : ''}`}
            onClick={() => updateFilter('tab', 'my')}
          >
            Của tôi
          </button>
          <button
            className={`mmed-view-tab ${filters.tab === 'all' ? 'active' : ''}`}
            onClick={() => updateFilter('tab', 'all')}
          >
            Tất cả
          </button>
        </div>
      )}

      {/* Status tabs */}
      <div className="mmed-status-tabs">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.id}
            className={`mmed-status-tab ${filters.status === tab.id ? 'active' : ''}`}
            onClick={() => updateFilter('status', tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date filter */}
      <div className="mmed-date-filter">
        {DATE_FILTERS.map(f => (
          <button
            key={f.id}
            className={`mmed-date-btn ${filters.dateRange === f.id ? 'active' : ''}`}
            onClick={() => updateFilter('dateRange', f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Count */}
      <div className="mmed-count">
        {totalCount} video{tasks.length < totalCount ? ` (${tasks.length} đã tải)` : ''}
      </div>

      {/* Task list */}
      <div className="mmed-list">
        {loading ? (
          <div className="mmed-empty">
            <div className="mmed-spinner" />
            <p>Đang tải...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="mmed-empty">
            <p>{filters.tab === 'my' ? 'Bạn chưa có task nào' : 'Không có task nào'}</p>
          </div>
        ) : (
          <>
            {tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => handleOpenDetail(task)}
                onToggleStep={handleToggleStep}
                onCopyLink={handleCopyLink}
              />
            ))}
            {hasMore && (
              <button
                className="mmed-load-more"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && <div className="mmed-toast">{toast}</div>}
    </div>
  );
}

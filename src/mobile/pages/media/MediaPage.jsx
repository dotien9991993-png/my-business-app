import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useMobileMedia } from '../../hooks/useMobileMedia';
import TaskCard from './TaskCard';
import TaskDetail from './TaskDetail';
import CreateTaskPage from './CreateTaskPage';
import MediaSummary from './MediaSummary';
import MobileSkeleton from '../../components/MobileSkeleton';
import MobilePullRefresh from '../../components/MobilePullRefresh';
import { haptic } from '../../utils/haptics';

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

export default function MediaPage({ user, tenantId, openEntityId, onEntityOpened }) {
  const {
    tasks, allTasks, loading, filters, permLevel,
    updateFilter, updateTaskStatus, addComment, createTask, refresh,
  } = useMobileMedia(user?.id, user?.name, tenantId);

  const isAdmin = permLevel >= 3;

  const [selectedTask, setSelectedTask] = useState(null);
  const [toast, setToast] = useState(null);
  const [pageTab, setPageTab] = useState('tasks');
  const [showCreate, setShowCreate] = useState(false);

  // Open entity from chat attachment
  useEffect(() => {
    if (!openEntityId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('tasks').select('*').eq('id', openEntityId).single();
        if (data) setSelectedTask(data);
      } catch (err) {
        console.error('Error loading task:', err);
      }
      onEntityOpened?.();
    })();
  }, [openEntityId, onEntityOpened]);

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
      haptic();
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

  // Show create page
  if (showCreate) {
    return (
      <CreateTaskPage
        user={user}
        tenantId={tenantId}
        onBack={() => setShowCreate(false)}
        onSubmit={createTask}
      />
    );
  }

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
    <MobilePullRefresh onRefresh={refresh}>
    <div className="mobile-page mmed-page">
      {/* Page-level tabs: Tasks / Tổng (admin only) */}
      {isAdmin && (
        <div className="mmed-view-tabs">
          <button
            className={`mmed-view-tab ${pageTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setPageTab('tasks')}
          >
            Danh sách
          </button>
          <button
            className={`mmed-view-tab ${pageTab === 'summary' ? 'active' : ''}`}
            onClick={() => setPageTab('summary')}
          >
            Tổng quan
          </button>
        </div>
      )}

      {pageTab === 'summary' && isAdmin ? (
        <MediaSummary allTasks={allTasks} />
      ) : (
        <>
          {/* Tab: My tasks / All tasks */}
          {permLevel >= 2 && (
            <div className="mmed-subtabs">
              <button
                className={`mmed-subtab ${filters.tab === 'my' ? 'active' : ''}`}
                onClick={() => updateFilter('tab', 'my')}
              >
                Của tôi
              </button>
              <button
                className={`mmed-subtab ${filters.tab === 'all' ? 'active' : ''}`}
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
            {tasks.length} video
          </div>

          {/* Task list */}
          <div className="mmed-list">
            {loading ? (
              <MobileSkeleton type="card" count={3} />
            ) : tasks.length === 0 ? (
              <div className="mmed-empty">
                <p>{filters.tab === 'my' ? 'Bạn chưa có task nào' : 'Không có task nào'}</p>
              </div>
            ) : (
              tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => handleOpenDetail(task)}
                  onToggleStep={handleToggleStep}
                  onCopyLink={handleCopyLink}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Toast */}
      {toast && <div className="mmed-toast">{toast}</div>}

      {/* FAB — create new task */}
      <button className="mmed-fab" onClick={() => setShowCreate(true)}>
        +
      </button>
    </div>
    </MobilePullRefresh>
  );
}

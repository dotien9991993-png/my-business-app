import React, { useState } from 'react';
import { useMobileJobs } from '../../hooks/useMobileJobs';
import JobCard from './JobCard';
import JobDetail from './JobDetail';

const STATUS_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'Chờ XN', label: 'Chờ XN' },
  { id: 'Đang làm', label: 'Đang làm' },
  { id: 'Hoàn thành', label: 'Hoàn thành' },
];

const DATE_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: '7 ngày' },
  { id: 'month', label: 'Tháng này' },
];

export default function JobsPage({ user, tenantId }) {
  const {
    jobs, loading, filters, permLevel,
    updateFilter, updateJobStatus, addExpense, refresh,
  } = useMobileJobs(user?.id, user?.name, tenantId);

  const [selectedJob, setSelectedJob] = useState(null);

  const handleOpenDetail = (job) => {
    setSelectedJob(job);
  };

  const handleCloseDetail = () => {
    setSelectedJob(null);
    refresh();
  };

  const handleStatusUpdate = async (jobId, newStatus) => {
    await updateJobStatus(jobId, newStatus);
    setSelectedJob(prev => prev ? { ...prev, status: newStatus } : null);
    refresh();
  };

  const handleAddExpense = async (jobId, expense, currentExpenses) => {
    const updated = await addExpense(jobId, expense, currentExpenses);
    setSelectedJob(prev => prev ? { ...prev, expenses: updated } : null);
    return updated;
  };

  // Detail view
  if (selectedJob) {
    return (
      <JobDetail
        job={selectedJob}
        onBack={handleCloseDetail}
        onUpdateStatus={handleStatusUpdate}
        onAddExpense={handleAddExpense}
        userName={user?.name}
      />
    );
  }

  return (
    <div className="mobile-page mjob-page">
      {/* Tab: My / All */}
      {permLevel >= 2 && (
        <div className="mjob-view-tabs">
          <button
            className={`mjob-view-tab ${filters.tab === 'my' ? 'active' : ''}`}
            onClick={() => updateFilter('tab', 'my')}
          >
            Của tôi
          </button>
          <button
            className={`mjob-view-tab ${filters.tab === 'all' ? 'active' : ''}`}
            onClick={() => updateFilter('tab', 'all')}
          >
            Tất cả
          </button>
        </div>
      )}

      {/* Status tabs */}
      <div className="mjob-status-tabs">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.id}
            className={`mjob-status-tab ${filters.status === tab.id ? 'active' : ''}`}
            onClick={() => updateFilter('status', tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date filter */}
      <div className="mjob-date-filter">
        {DATE_FILTERS.map(f => (
          <button
            key={f.id}
            className={`mjob-date-btn ${filters.dateRange === f.id ? 'active' : ''}`}
            onClick={() => updateFilter('dateRange', f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Count */}
      <div className="mjob-count">
        {jobs.length} công việc
      </div>

      {/* Job list */}
      <div className="mjob-list">
        {loading ? (
          <div className="mjob-empty">Đang tải...</div>
        ) : jobs.length === 0 ? (
          <div className="mjob-empty">
            {filters.tab === 'my' ? 'Bạn chưa có công việc nào' : 'Không có công việc nào'}
          </div>
        ) : (
          jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onClick={() => handleOpenDetail(job)}
            />
          ))
        )}
      </div>
    </div>
  );
}

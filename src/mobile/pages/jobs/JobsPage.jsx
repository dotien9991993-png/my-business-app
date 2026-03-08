import React, { useState } from 'react';
import TodayJobs from './TodayJobs';
import JobCalendar from './JobCalendar';
import JobList from './JobList';
import JobWages from './JobWages';
import JobSummary from './JobSummary';
import JobDetail from './JobDetail';

const SUB_TABS = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'calendar', label: 'Lịch' },
  { id: 'jobs', label: 'Việc' },
  { id: 'wages', label: 'Công' },
  { id: 'summary', label: 'Tổng' },
];

export default function JobsPage({ user, tenantId }) {
  const [activeTab, setActiveTab] = useState('today');
  const [selectedJob, setSelectedJob] = useState(null);

  const handleOpenDetail = (job) => setSelectedJob(job);
  const handleCloseDetail = () => setSelectedJob(null);

  if (selectedJob) {
    return (
      <JobDetail
        job={selectedJob}
        onBack={handleCloseDetail}
        user={user}
        tenantId={tenantId}
      />
    );
  }

  return (
    <div className="mobile-page mjob-page">
      {/* Sub-tab navigation */}
      <div className="mjob-sub-tabs">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            className={`mjob-sub-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mjob-tab-content">
        {activeTab === 'today' && (
          <TodayJobs user={user} tenantId={tenantId} onOpenJob={handleOpenDetail} />
        )}
        {activeTab === 'calendar' && (
          <JobCalendar user={user} tenantId={tenantId} onOpenJob={handleOpenDetail} />
        )}
        {activeTab === 'jobs' && (
          <JobList user={user} tenantId={tenantId} onOpenJob={handleOpenDetail} />
        )}
        {activeTab === 'wages' && (
          <JobWages user={user} tenantId={tenantId} />
        )}
        {activeTab === 'summary' && (
          <JobSummary user={user} tenantId={tenantId} />
        )}
      </div>
    </div>
  );
}

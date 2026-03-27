import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import TodayJobs from './TodayJobs';
import JobCalendar from './JobCalendar';
import JobList from './JobList';
import JobWages from './JobWages';
import JobSummary from './JobSummary';
import JobDetail from './JobDetail';
import CreateJobPage from './CreateJobPage';
import { useMobileJobs } from '../../hooks/useMobileJobs';

const SUB_TABS = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'calendar', label: 'Lịch' },
  { id: 'jobs', label: 'Việc' },
  { id: 'wages', label: 'Công' },
  { id: 'summary', label: 'Tổng' },
];

export default function JobsPage({ user, tenantId, openEntityId, onEntityOpened }) {
  const [activeTab, setActiveTab] = useState('today');
  const [selectedJob, setSelectedJob] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const { permLevel, createJob } = useMobileJobs(user?.id, user?.name, tenantId);

  // Open entity from chat attachment
  useEffect(() => {
    if (!openEntityId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('technical_jobs').select('*').eq('id', openEntityId).single();
        if (data) setSelectedJob(data);
      } catch (err) {
        console.error('Error loading job:', err);
      }
      onEntityOpened?.();
    })();
  }, [openEntityId, onEntityOpened]);

  const handleOpenDetail = (job) => setSelectedJob(job);
  const handleCloseDetail = () => setSelectedJob(null);

  // CreateJobPage — fullscreen overlay
  if (showCreate) {
    return (
      <CreateJobPage
        user={user}
        tenantId={tenantId}
        onBack={() => setShowCreate(false)}
        onSubmit={createJob}
      />
    );
  }

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

  // Desktop cho phép tất cả user tạo job (không check permLevel trong CreateJobModal)
  const canCreate = permLevel >= 1;

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

      {/* FAB — create new job */}
      {canCreate && (
        <button className="mjob-fab" onClick={() => setShowCreate(true)}>
          +
        </button>
      )}
    </div>
  );
}

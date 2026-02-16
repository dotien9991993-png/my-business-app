import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';

import TodayJobsDashboard from './TodayJobsDashboard';
import TechnicalCalendarView from './TechnicalCalendarView';
import TechnicalJobsView from './TechnicalJobsView';
import TechnicianWagesView from './TechnicianWagesView';
import TechnicalSummaryView from './TechnicalSummaryView';
import IntegrationsView from '../../components/shared/IntegrationsView';

export default function TechnicalModule() {
  const { activeTab, currentUser, tenant, hasPermission, canEdit, getPermissionLevel } = useApp();
  const {
    technicalJobs,
    setSelectedJob, setShowJobModal, setShowCreateJobModal, setPrefillJobData,
    jobFilterCreator, setJobFilterCreator, jobFilterTechnician, setJobFilterTechnician,
    jobFilterStatus, setJobFilterStatus, jobFilterDateMode, setJobFilterDateMode,
    jobFilterMonth, setJobFilterMonth, jobFilterYear, setJobFilterYear,
    jobCustomStartDate, setJobCustomStartDate, jobCustomEndDate, setJobCustomEndDate,
    integrations, setIntegrations
  } = useData();

  return (
    <>
      {activeTab === 'today' && <TodayJobsDashboard technicalJobs={technicalJobs} currentUser={currentUser} setSelectedJob={setSelectedJob} setShowJobModal={setShowJobModal} />}
      {activeTab === 'calendar' && <TechnicalCalendarView technicalJobs={technicalJobs} currentUser={currentUser} setSelectedJob={setSelectedJob} setShowJobModal={setShowJobModal} setShowCreateJobModal={setShowCreateJobModal} setPrefillJobData={setPrefillJobData} />}
      {activeTab === 'jobs' && <TechnicalJobsView technicalJobs={technicalJobs} currentUser={currentUser} jobFilterCreator={jobFilterCreator} setJobFilterCreator={setJobFilterCreator} jobFilterTechnician={jobFilterTechnician} setJobFilterTechnician={setJobFilterTechnician} jobFilterStatus={jobFilterStatus} setJobFilterStatus={setJobFilterStatus} jobFilterDateMode={jobFilterDateMode} setJobFilterDateMode={setJobFilterDateMode} jobFilterMonth={jobFilterMonth} setJobFilterMonth={setJobFilterMonth} jobFilterYear={jobFilterYear} setJobFilterYear={setJobFilterYear} jobCustomStartDate={jobCustomStartDate} setJobCustomStartDate={setJobCustomStartDate} jobCustomEndDate={jobCustomEndDate} setJobCustomEndDate={setJobCustomEndDate} setSelectedJob={setSelectedJob} setShowJobModal={setShowJobModal} setShowCreateJobModal={setShowCreateJobModal} />}
      {activeTab === 'wages' && <TechnicianWagesView technicalJobs={technicalJobs} tenant={tenant} currentUser={currentUser} hasPermission={hasPermission} canEdit={canEdit} getPermissionLevel={getPermissionLevel} />}
      {activeTab === 'summary' && <TechnicalSummaryView technicalJobs={technicalJobs} tenant={tenant} />}
      {activeTab === 'integrations' && <IntegrationsView currentUser={currentUser} integrations={integrations} setIntegrations={setIntegrations} />}
    </>
  );
}

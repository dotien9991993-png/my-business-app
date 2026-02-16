import React from 'react';
import SalaryManagement from './SalaryManagement';

export default function SalariesView({ tenant, currentUser, allUsers, tasks, technicalJobs, attendances, loadFinanceData }) {
  return (
    <SalaryManagement
      tenant={tenant}
      currentUser={currentUser}
      allUsers={allUsers}
      tasks={tasks}
      technicalJobs={technicalJobs}
      attendances={attendances}
      loadFinanceData={loadFinanceData}
    />
  );
}

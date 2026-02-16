import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';

import HrmEmployeesView from './HrmEmployeesView';
import HrmAttendanceView from './HrmAttendanceView';
import HrmScheduleView from './HrmScheduleView';
import HrmKpiView from './HrmKpiView';
import HrmPayrollView from './HrmPayrollView';
import HrmLeaveRequestsView from './HrmLeaveRequestsView';
import HrmReportView from './HrmReportView';
import HrmSettingsView from './HrmSettingsView';

const NoAccess = () => (
  <div className="p-6">
    <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
      <p className="text-red-600">Bạn không được phép xem mục này.</p>
    </div>
  </div>
);

export default function HrmModule() {
  const { activeTab, currentUser, tenant, canAccessTab, allUsers, hasPermission, canEdit, getPermissionLevel, filterByPermission } = useApp();
  const {
    hrmEmployees, hrmDepartments, hrmPositions, hrmWorkShifts,
    hrmAttendances, hrmLeaveRequests, hrmLeaveBalances,
    hrmKpiTemplates, hrmKpiCriteria, hrmKpiEvaluations, hrmKpiEvalDetails,
    loadHrmData, getSettingValue
  } = useData();

  return (
    <>
      {activeTab === 'employees' && canAccessTab('hrm', 'employees') && (
        <HrmEmployeesView
          employees={hrmEmployees} departments={hrmDepartments} positions={hrmPositions}
          attendances={hrmAttendances} leaveRequests={hrmLeaveRequests} kpiEvaluations={hrmKpiEvaluations}
          loadHrmData={loadHrmData} tenant={tenant} currentUser={currentUser} allUsers={allUsers}
          hasPermission={hasPermission} canEdit={canEdit} getPermissionLevel={getPermissionLevel}
        />
      )}
      {activeTab === 'attendance' && canAccessTab('hrm', 'attendance') && (
        <HrmAttendanceView
          employees={hrmEmployees} attendances={hrmAttendances} workShifts={hrmWorkShifts}
          departments={hrmDepartments} loadHrmData={loadHrmData} tenant={tenant} currentUser={currentUser}
          hasPermission={hasPermission} canEdit={canEdit} getPermissionLevel={getPermissionLevel} filterByPermission={filterByPermission}
        />
      )}
      {activeTab === 'schedule' && canAccessTab('hrm', 'schedule') && (
        <HrmScheduleView
          employees={hrmEmployees} workShifts={hrmWorkShifts} attendances={hrmAttendances}
          departments={hrmDepartments} loadHrmData={loadHrmData} tenant={tenant} currentUser={currentUser}
          hasPermission={hasPermission} canEdit={canEdit}
        />
      )}
      {activeTab === 'kpi' && canAccessTab('hrm', 'kpi') && (
        <HrmKpiView
          employees={hrmEmployees} departments={hrmDepartments}
          kpiTemplates={hrmKpiTemplates} kpiCriteria={hrmKpiCriteria}
          kpiEvaluations={hrmKpiEvaluations} kpiEvalDetails={hrmKpiEvalDetails}
          loadHrmData={loadHrmData} tenant={tenant} currentUser={currentUser}
          hasPermission={hasPermission} canEdit={canEdit} getPermissionLevel={getPermissionLevel}
        />
      )}
      {activeTab === 'payroll' && canAccessTab('hrm', 'payroll') && (
        <HrmPayrollView
          employees={hrmEmployees} departments={hrmDepartments} positions={hrmPositions}
          attendances={hrmAttendances} kpiEvaluations={hrmKpiEvaluations}
          loadHrmData={loadHrmData} tenant={tenant} currentUser={currentUser}
          hasPermission={hasPermission} canEdit={canEdit}
        />
      )}
      {activeTab === 'leaves' && canAccessTab('hrm', 'leaves') && (
        <HrmLeaveRequestsView
          employees={hrmEmployees} leaveRequests={hrmLeaveRequests} leaveBalances={hrmLeaveBalances}
          attendances={hrmAttendances} loadHrmData={loadHrmData} tenant={tenant} currentUser={currentUser}
          hasPermission={hasPermission} canEdit={canEdit} getPermissionLevel={getPermissionLevel} filterByPermission={filterByPermission}
        />
      )}
      {activeTab === 'report' && canAccessTab('hrm', 'report') && (
        <HrmReportView
          employees={hrmEmployees} departments={hrmDepartments} positions={hrmPositions}
          attendances={hrmAttendances} leaveRequests={hrmLeaveRequests} leaveBalances={hrmLeaveBalances}
          kpiEvaluations={hrmKpiEvaluations} loadHrmData={loadHrmData} tenant={tenant}
          hasPermission={hasPermission}
        />
      )}
      {activeTab === 'settings' && canAccessTab('hrm', 'settings') && (
        <HrmSettingsView
          departments={hrmDepartments} positions={hrmPositions} workShifts={hrmWorkShifts}
          employees={hrmEmployees} loadHrmData={loadHrmData} tenant={tenant} currentUser={currentUser}
          getSettingValue={getSettingValue} canEdit={canEdit}
        />
      )}
      {!canAccessTab('hrm', activeTab) && <NoAccess />}
    </>
  );
}

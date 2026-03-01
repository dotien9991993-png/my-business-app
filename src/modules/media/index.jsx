import React, { useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';

import MyTasksView from './MyTasksView';
import DashboardView from './DashboardView';
import TasksView from './TasksView';
import CalendarView from './CalendarView';
import ReportView from './ReportView';
import PerformanceView from './PerformanceView';
import UserManagementView from './UserManagementView';
import IntegrationsView from '../../components/shared/IntegrationsView';
import AutomationView from '../../components/shared/AutomationView';
import EkipManagementView from './EkipManagementView';
import MediaDashboard from './MediaDashboard';

const NoAccess = () => (
  <div className="p-6">
    <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
      <p className="text-red-600">Bạn không được phép xem mục này.</p>
    </div>
  </div>
);

export default function MediaModule() {
  const { activeTab, currentUser, allUsers, canAccessTab, changeUserRole, deleteUser, loadUsers, pendingOpenRecord, setPendingOpenRecord, tenant } = useApp();
  const {
    tasks, visibleTasks, reportData,
    setSelectedTask, setShowModal, setShowCreateTaskModal,
    taskFilterTeam, setTaskFilterTeam, taskFilterStatus, setTaskFilterStatus,
    taskFilterAssignee, setTaskFilterAssignee, taskFilterCategory, setTaskFilterCategory,
    taskDateFilter, setTaskDateFilter, taskCustomStartDate, setTaskCustomStartDate,
    taskCustomEndDate, setTaskCustomEndDate,
    taskFilterCrew, setTaskFilterCrew, taskFilterActor, setTaskFilterActor,
    taskFilterProduct, setTaskFilterProduct,
    integrations, setIntegrations, automations, setAutomations, templates, createFromTemplate
  } = useData();

  // Open task detail from chat attachment
  useEffect(() => {
    if (pendingOpenRecord?.type === 'task' && pendingOpenRecord.id) {
      const task = tasks.find(t => t.id === pendingOpenRecord.id);
      if (task) {
        setSelectedTask(task);
        setShowModal(true);
      }
      setPendingOpenRecord(null);
    }
  }, [pendingOpenRecord, tasks, setSelectedTask, setShowModal, setPendingOpenRecord]);

  return (
    <>
      {activeTab === 'mytasks' && <MyTasksView tasks={tasks} currentUser={currentUser} setSelectedTask={setSelectedTask} setShowModal={setShowModal} />}
      {activeTab === 'dashboard' && <DashboardView currentUser={currentUser} visibleTasks={visibleTasks} reportData={reportData} setSelectedTask={setSelectedTask} setShowModal={setShowModal} allUsers={allUsers} />}
      {activeTab === 'tasks' && canAccessTab('media', 'videos') && <TasksView visibleTasks={visibleTasks} setSelectedTask={setSelectedTask} setShowModal={setShowModal} setShowCreateTaskModal={setShowCreateTaskModal} taskFilterTeam={taskFilterTeam} setTaskFilterTeam={setTaskFilterTeam} taskFilterStatus={taskFilterStatus} setTaskFilterStatus={setTaskFilterStatus} taskFilterAssignee={taskFilterAssignee} setTaskFilterAssignee={setTaskFilterAssignee} taskFilterCategory={taskFilterCategory} setTaskFilterCategory={setTaskFilterCategory} taskDateFilter={taskDateFilter} setTaskDateFilter={setTaskDateFilter} taskCustomStartDate={taskCustomStartDate} setTaskCustomStartDate={setTaskCustomStartDate} taskCustomEndDate={taskCustomEndDate} setTaskCustomEndDate={setTaskCustomEndDate} taskFilterCrew={taskFilterCrew} setTaskFilterCrew={setTaskFilterCrew} taskFilterActor={taskFilterActor} setTaskFilterActor={setTaskFilterActor} taskFilterProduct={taskFilterProduct} setTaskFilterProduct={setTaskFilterProduct} tenant={tenant} />}
      {activeTab === 'calendar' && canAccessTab('media', 'calendar') && <CalendarView visibleTasks={visibleTasks} setSelectedTask={setSelectedTask} setShowModal={setShowModal} />}
      {activeTab === 'report' && canAccessTab('media', 'report') && <ReportView visibleTasks={visibleTasks} allUsers={allUsers} />}
      {activeTab === 'integrations' && <IntegrationsView currentUser={currentUser} integrations={integrations} setIntegrations={setIntegrations} />}
      {activeTab === 'automation' && <AutomationView currentUser={currentUser} automations={automations} setAutomations={setAutomations} templates={templates} createFromTemplate={createFromTemplate} />}
      {activeTab === 'users' && <UserManagementView currentUser={currentUser} allUsers={allUsers} changeUserRole={changeUserRole} deleteUser={deleteUser} loadUsers={loadUsers} />}
      {activeTab === 'performance' && <PerformanceView tasks={tasks} visibleTasks={visibleTasks} currentUser={currentUser} allUsers={allUsers} />}
      {activeTab === 'ekips' && <EkipManagementView />}
      {activeTab === 'overview' && currentUser?.role === 'Admin' && <MediaDashboard tasks={tasks} allUsers={allUsers} setSelectedTask={setSelectedTask} setShowModal={setShowModal} />}
      {((activeTab === 'tasks' && !canAccessTab('media', 'videos')) ||
        (activeTab === 'calendar' && !canAccessTab('media', 'calendar')) ||
        (activeTab === 'report' && !canAccessTab('media', 'report'))) && <NoAccess />}
    </>
  );
}

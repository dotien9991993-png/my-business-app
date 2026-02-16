import React from 'react';
import { getStatusColor, getTeamColor } from '../../utils/formatUtils';

const MyTasksView = ({ tasks, currentUser, setSelectedTask, setShowModal }) => {
  const myTasks = tasks.filter(t => t.assignee === currentUser.name);

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      <div className="mb-4 md:mb-6">
        <h2 className="text-xl md:text-2xl font-bold">📝 Công việc của tôi</h2>
        <p className="text-gray-600 text-sm">
          {myTasks.length} task • {myTasks.filter(t => t.status === 'Hoàn Thành').length} hoàn thành
        </p>
      </div>

      <div className="grid gap-3 md:gap-4">
        {myTasks.map(task => (
          <div
            key={task.id}
            onClick={() => {
              setSelectedTask(task);
              setShowModal(true);
            }}
            className={`bg-white p-4 md:p-6 rounded-xl shadow hover:shadow-lg transition-all cursor-pointer border-l-4 ${
              task.isOverdue ? 'border-red-500' : 'border-blue-500'
            }`}
          >
            <div className="flex justify-between items-start mb-2 md:mb-3">
              <div className="flex-1">
                <h3 className="text-lg md:text-xl font-bold mb-2">{task.title}</h3>
                <div className="flex gap-2 flex-wrap">
                  <span className={`px-2 md:px-3 py-1 rounded-full text-xs md:text-sm font-medium ${getStatusColor(task.status)}`}>
                    {task.status}
                  </span>
                  <span className={`px-2 md:px-3 py-1 rounded-full text-xs md:text-sm font-medium ${getTeamColor(task.team)}`}>
                    {task.team}
                  </span>
                  <span className="px-2 md:px-3 py-1 bg-gray-100 rounded-full text-xs md:text-sm">
                    📅 {task.dueDate}
                  </span>
                </div>
              </div>
            </div>

            {task.isOverdue && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                <span className="text-red-700 font-medium">⚠️ Quá hạn!</span>
              </div>
            )}
          </div>
        ))}

        {myTasks.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl">
            <div className="text-4xl mb-3">🎉</div>
            <div className="text-gray-600">Bạn chưa có task nào được giao!</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyTasksView;

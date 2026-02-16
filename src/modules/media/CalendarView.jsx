import React, { useState } from 'react';
import { getStatusColor } from '../../utils/formatUtils';
import { getVietnamDate } from '../../utils/dateUtils';

const CalendarView = ({ visibleTasks, setSelectedTask, setShowModal }) => {
  const now = getVietnamDate();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());

  const todayDate = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  const daysOfWeek = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else { setCurrentMonth(currentMonth - 1); }
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else { setCurrentMonth(currentMonth + 1); }
  };

  // Calculate first day of month and total days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">📅 Lịch Video</h2>

      <div className="bg-white p-4 md:p-6 rounded-xl shadow">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <h3 className="text-lg md:text-xl font-bold">{monthNames[currentMonth]} {currentYear}</h3>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="px-3 md:px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm">◀</button>
            <button
              onClick={() => { setCurrentMonth(todayMonth); setCurrentYear(todayYear); }}
              className="px-3 md:px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
            >
              Hôm nay
            </button>
            <button onClick={nextMonth} className="px-3 md:px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm">▶</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
          {daysOfWeek.map(day => (
            <div key={day} className="text-center font-bold py-1 md:py-2 text-xs md:text-sm">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {Array.from({ length: 42 }, (_, i) => {
            const dayNum = i - firstDayOfMonth + 1;
            const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;

            if (!isCurrentMonth) {
              return <div key={i} className="min-h-24 p-2 border rounded-lg bg-gray-50" />;
            }

            const month = String(currentMonth + 1).padStart(2, '0');
            const dayStr = String(dayNum).padStart(2, '0');
            const dateStr = `${currentYear}-${month}-${dayStr}`;

            const dayTasks = visibleTasks.filter(t => t.dueDate === dateStr);
            const isToday = dayNum === todayDate && currentMonth === todayMonth && currentYear === todayYear;

            return (
              <div
                key={i}
                className={`min-h-24 p-2 border rounded-lg ${
                  isToday ? 'bg-blue-50 border-blue-500' : 'bg-white'
                }`}
              >
                <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-700 font-bold' : ''}`}>{dayNum}</div>
                {dayTasks.slice(0, 2).map(task => (
                  <div
                    key={task.id}
                    onClick={() => {
                      setSelectedTask(task);
                      setShowModal(true);
                    }}
                    className={`text-xs p-1 rounded mb-1 cursor-pointer ${getStatusColor(task.status)}`}
                  >
                    {task.title.substring(0, 15)}...
                  </div>
                ))}
                {dayTasks.length > 2 && (
                  <div className="text-xs text-gray-500">+{dayTasks.length - 2} nữa</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 bg-white p-6 rounded-xl shadow">
        <h3 className="text-lg font-bold mb-4">📌 Video Sắp Tới</h3>
        <div className="space-y-3">
          {visibleTasks
            .filter(t => new Date(t.dueDate) >= new Date())
            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
            .slice(0, 5)
            .map(task => (
              <div
                key={task.id}
                onClick={() => {
                  setSelectedTask(task);
                  setShowModal(true);
                }}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <div>
                  <div className="font-medium">{task.title}</div>
                  <div className="text-sm text-gray-600">{task.assignee}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(task.status)}`}>
                    {task.status}
                  </span>
                  <span className="text-sm">{task.dueDate}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarView;

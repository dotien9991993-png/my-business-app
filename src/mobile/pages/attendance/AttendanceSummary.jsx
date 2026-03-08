import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import { ATTENDANCE_STATUSES } from '../../../constants/hrmConstants';

export default function AttendanceSummary({ tenantId }) {
  const [employees, setEmployees] = useState([]);
  const [attendances, setAttendances] = useState([]);
  const [loading, setLoading] = useState(true);

  // Month state — default current month
  const [filterMonth, setFilterMonth] = useState(() => {
    const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}`;
  });

  const [year, month] = filterMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayColumns = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Load data
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      const startDate = `${filterMonth}-01`;
      const endDate = `${filterMonth}-${String(daysInMonth).padStart(2, '0')}`;

      const [empRes, attRes] = await Promise.all([
        supabase.from('employees').select('*').eq('tenant_id', tenantId).eq('status', 'active'),
        supabase.from('hrm_attendances').select('*').eq('tenant_id', tenantId)
          .gte('date', startDate).lte('date', endDate)
      ]);

      if (!cancelled) {
        setEmployees((empRes.data || []).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')));
        setAttendances(attRes.data || []);
        setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [tenantId, filterMonth, daysInMonth]);

  // attendanceMap: ${employee_id}_${date} → array records
  const attendanceMap = useMemo(() => {
    const map = {};
    attendances.forEach(a => {
      if (a.date && a.date.startsWith(filterMonth)) {
        const key = `${a.employee_id}_${a.date}`;
        if (!map[key]) map[key] = [];
        map[key].push(a);
      }
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => (a.shift_number || 1) - (b.shift_number || 1)));
    return map;
  }, [attendances, filterMonth]);

  const getAttendanceForCell = useCallback((employeeId, day) => {
    const dateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
    return attendanceMap[`${employeeId}_${dateStr}`] || [];
  }, [attendanceMap, filterMonth]);

  const calculateHours = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 0;
    const diff = new Date(checkOut) - new Date(checkIn);
    return Math.max(0, diff / (1000 * 60 * 60));
  };

  const getEmployeeSummary = useCallback((employeeId) => {
    let workDays = 0, leaveDays = 0, absentDays = 0, overtimeHours = 0, lateDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const records = getAttendanceForCell(employeeId, d);
      if (records.length === 0) continue;

      const primary = records[0];
      switch (primary.status) {
        case 'present': workDays++; break;
        case 'late': workDays++; lateDays++; break;
        case 'early_leave': workDays++; break;
        case 'half_day': workDays += 0.5; break;
        case 'absent': absentDays++; break;
        case 'annual_leave':
        case 'sick': leaveDays++; break;
        default: break;
      }
      records.forEach(r => {
        overtimeHours += parseFloat(r.overtime_hours || 0);
      });
    }

    return { workDays, leaveDays, absentDays, overtimeHours: Math.round(overtimeHours * 10) / 10, lateDays };
  }, [daysInMonth, getAttendanceForCell]);

  const totalSummary = useMemo(() => {
    let totalWork = 0, totalLeave = 0, totalAbsent = 0, totalOT = 0;
    employees.forEach(emp => {
      const s = getEmployeeSummary(emp.id);
      totalWork += s.workDays;
      totalLeave += s.leaveDays;
      totalAbsent += s.absentDays;
      totalOT += s.overtimeHours;
    });
    return {
      totalWork: Math.round(totalWork * 10) / 10,
      totalLeave,
      totalAbsent,
      totalOT: Math.round(totalOT * 10) / 10
    };
  }, [employees, getEmployeeSummary]);

  // Day of week helpers
  const getDayOfWeek = (day) => {
    const dateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
    const d = new Date(dateStr + 'T00:00:00+07:00');
    const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return names[d.getDay()];
  };

  const isSunday = (day) => {
    const dateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
    const d = new Date(dateStr + 'T00:00:00+07:00');
    return d.getDay() === 0;
  };

  // Month nav
  const changeMonth = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    setFilterMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthLabel = new Date(year, month - 1).toLocaleDateString('vi-VN', {
    month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'
  });

  if (loading) {
    return <div className="matt-loading">Đang tải bảng chấm công...</div>;
  }

  return (
    <div className="matt-summary">
      {/* Month navigation */}
      <div className="matt-cal-nav">
        <button onClick={() => changeMonth(-1)}>◀</button>
        <span className="matt-cal-month">{monthLabel}</span>
        <button onClick={() => changeMonth(1)}>▶</button>
      </div>

      {/* Summary cards */}
      <div className="matt-stats-grid">
        <div className="matt-stat-card">
          <span className="matt-stat-icon">📊</span>
          <span className="matt-stat-num">{totalSummary.totalWork}</span>
          <span className="matt-stat-label">Tổng ngày công</span>
        </div>
        <div className="matt-stat-card">
          <span className="matt-stat-icon">🏖️</span>
          <span className="matt-stat-num" style={{ color: '#3b82f6' }}>{totalSummary.totalLeave}</span>
          <span className="matt-stat-label">Tổng phép</span>
        </div>
        <div className="matt-stat-card">
          <span className="matt-stat-icon">🔴</span>
          <span className="matt-stat-num" style={{ color: '#ef4444' }}>{totalSummary.totalAbsent}</span>
          <span className="matt-stat-label">Tổng vắng</span>
        </div>
        <div className="matt-stat-card">
          <span className="matt-stat-icon">⏰</span>
          <span className="matt-stat-num" style={{ color: '#7c3aed' }}>{totalSummary.totalOT}h</span>
          <span className="matt-stat-label">Tổng OT</span>
        </div>
      </div>

      {/* Scrollable table */}
      <div className="matt-summary-table-wrap">
        <table className="matt-summary-table">
          <thead>
            <tr>
              <th className="matt-summary-emp-header">Nhân viên</th>
              {dayColumns.map(day => (
                <th
                  key={day}
                  className={`matt-summary-day-header ${isSunday(day) ? 'sunday' : ''}`}
                >
                  <div>{day}</div>
                  <div className="matt-summary-dow">{getDayOfWeek(day)}</div>
                </th>
              ))}
              <th className="matt-summary-stat-col green">Công</th>
              <th className="matt-summary-stat-col blue">Phép</th>
              <th className="matt-summary-stat-col red">Vắng</th>
              <th className="matt-summary-stat-col purple">TC</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const summary = getEmployeeSummary(emp.id);
              return (
                <tr key={emp.id}>
                  <td className="matt-summary-emp">{emp.full_name}</td>
                  {dayColumns.map(day => {
                    const records = getAttendanceForCell(emp.id, day);
                    const primary = records[0];
                    const statusInfo = primary?.status ? ATTENDANCE_STATUSES[primary.status] : null;
                    const shiftCount = records.length;
                    const sunday = isSunday(day);

                    return (
                      <td
                        key={day}
                        className={`matt-summary-cell ${sunday && shiftCount === 0 ? 'sunday-empty' : ''}`}
                      >
                        {shiftCount > 0 ? (
                          <div className="matt-summary-cell-inner">
                            <span>{statusInfo?.icon || '✅'}</span>
                            {shiftCount > 1 && (
                              <span className="matt-summary-badge">{shiftCount}</span>
                            )}
                          </div>
                        ) : (
                          <span className="matt-summary-empty">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="matt-summary-stat-val green">{summary.workDays}</td>
                  <td className="matt-summary-stat-val blue">{summary.leaveDays || '-'}</td>
                  <td className="matt-summary-stat-val red">{summary.absentDays || '-'}</td>
                  <td className="matt-summary-stat-val purple">
                    {summary.overtimeHours > 0 ? `${summary.overtimeHours}h` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="matt-summary-legend">
        {Object.entries(ATTENDANCE_STATUSES).map(([key, val]) => (
          <span key={key} className="matt-summary-legend-item">
            <span>{val.icon}</span>
            <span>{val.label}</span>
          </span>
        ))}
        <span className="matt-summary-legend-item">
          <span style={{ color: '#d1d5db' }}>-</span>
          <span>Chưa có</span>
        </span>
        <span className="matt-summary-legend-item">
          <span className="matt-summary-badge-demo">2</span>
          <span>Nhiều ca</span>
        </span>
      </div>
    </div>
  );
}

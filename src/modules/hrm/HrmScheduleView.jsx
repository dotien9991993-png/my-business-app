import React, { useState, useMemo, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { getVietnamDate, getTodayVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';

// ============ HELPERS ============

const WEEKDAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEKDAY_FULL = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

const SHIFT_COLORS = [
  { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-400', dot: 'bg-green-500' },
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-400', dot: 'bg-blue-500' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-400', dot: 'bg-amber-500' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-400', dot: 'bg-purple-500' },
  { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-400', dot: 'bg-pink-500' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-400', dot: 'bg-cyan-500' },
];

const pad2 = (n) => String(n).padStart(2, '0');

const formatDate = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

const formatTime = (timeStr) => {
  if (!timeStr) return '';
  return timeStr.slice(0, 5); // HH:MM
};

const getShiftColor = (shiftId, shiftIds) => {
  const idx = shiftIds.indexOf(shiftId);
  return SHIFT_COLORS[idx % SHIFT_COLORS.length];
};

// Lấy ngày đầu tuần (Thứ 2)
const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay() || 7; // CN = 7
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Tạo mảng 7 ngày trong tuần từ thứ 2
const getWeekDays = (monday) => {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
};

// Tạo mảng ngày trong tháng (bao gồm padding đầu/cuối)
const getMonthCalendar = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() || 7) - 1; // offset từ thứ 2
  const days = [];

  // Ngày padding trước
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, isCurrentMonth: false });
  }
  // Ngày trong tháng
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }
  // Ngày padding sau (đủ 42 ô hoặc ít nhất 35)
  const totalNeeded = days.length <= 35 ? 35 : 42;
  while (days.length < totalNeeded) {
    const nextDate = new Date(year, month + 1, days.length - startOffset - lastDay.getDate() + 1);
    days.push({ date: nextDate, isCurrentMonth: false });
  }
  return days;
};

// ============ COMPONENT ============

export default function HrmScheduleView({
  employees,
  workShifts,
  attendances,
  departments,
  loadHrmData,
  tenant,
  currentUser,
  hasPermission,
}) {
  // === PERMISSION: Level 2+ mới được phân ca / chỉnh sửa ===
  const canManageSchedule = hasPermission ? hasPermission('hrm', 2) : true;
  const today = getTodayVN();
  const vnNow = getVietnamDate();

  // === State ===
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [currentDate, setCurrentDate] = useState(vnNow);
  const [filterDept, setFilterDept] = useState('all');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Assign form
  const [assignEmployeeId, setAssignEmployeeId] = useState('');
  const [assignShiftId, setAssignShiftId] = useState('');
  const [assignDate, setAssignDate] = useState(today);

  // Batch form
  const [batchEmployeeIds, setBatchEmployeeIds] = useState([]);
  const [batchShiftId, setBatchShiftId] = useState('');
  const [batchDateFrom, setBatchDateFrom] = useState(today);
  const [batchDateTo, setBatchDateTo] = useState(today);

  // === Derived data ===
  const activeEmployees = useMemo(() =>
    (employees || []).filter(e => e.status === 'active'),
    [employees]
  );

  const activeShifts = useMemo(() =>
    (workShifts || []).filter(s => s.is_active !== false),
    [workShifts]
  );

  const shiftIds = useMemo(() => activeShifts.map(s => s.id), [activeShifts]);

  const shiftMap = useMemo(() => {
    const map = {};
    (workShifts || []).forEach(s => { map[s.id] = s; });
    return map;
  }, [workShifts]);

  const employeeMap = useMemo(() => {
    const map = {};
    (employees || []).forEach(e => { map[e.id] = e; });
    return map;
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    if (filterDept === 'all') return activeEmployees;
    return activeEmployees.filter(e => e.department_id === filterDept);
  }, [activeEmployees, filterDept]);

  // Lịch phân ca: map "YYYY-MM-DD" → [{ employee_id, shift_id, id, ... }]
  const scheduleByDate = useMemo(() => {
    const map = {};
    (attendances || []).forEach(a => {
      if (!a.date || !a.shift_id) return;
      const key = a.date;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [attendances]);

  // Week navigation
  const monday = useMemo(() => getMonday(currentDate), [currentDate]);
  const weekDays = useMemo(() => getWeekDays(monday), [monday]);

  // Month navigation
  const monthYear = useMemo(() => ({
    year: currentDate.getFullYear(),
    month: currentDate.getMonth()
  }), [currentDate]);

  const monthCalendar = useMemo(() =>
    getMonthCalendar(monthYear.year, monthYear.month),
    [monthYear]
  );

  // === Stats ===
  const stats = useMemo(() => {
    // NV chưa phân ca cho 7 ngày tới
    const upcoming7 = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(vnNow);
      d.setDate(d.getDate() + i);
      upcoming7.push(formatDate(d.getFullYear(), d.getMonth(), d.getDate()));
    }

    const scheduledEmpIds = new Set();
    upcoming7.forEach(dateStr => {
      (scheduleByDate[dateStr] || []).forEach(a => scheduledEmpIds.add(a.employee_id));
    });
    const unscheduledCount = filteredEmployees.filter(e => !scheduledEmpIds.has(e.id)).length;

    // Ca phổ biến nhất
    const shiftCount = {};
    (attendances || []).forEach(a => {
      if (a.shift_id) {
        shiftCount[a.shift_id] = (shiftCount[a.shift_id] || 0) + 1;
      }
    });
    let popularShiftId = null;
    let maxCount = 0;
    Object.entries(shiftCount).forEach(([sid, cnt]) => {
      if (cnt > maxCount) { maxCount = cnt; popularShiftId = sid; }
    });
    const popularShift = popularShiftId ? shiftMap[popularShiftId] : null;

    // Tổng giờ làm việc dự kiến (tuần hiện tại)
    let totalExpectedHours = 0;
    weekDays.forEach(d => {
      const dateStr = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
      (scheduleByDate[dateStr] || []).forEach(a => {
        const shift = shiftMap[a.shift_id];
        if (shift) {
          totalExpectedHours += parseFloat(shift.working_hours || 0);
        }
      });
    });

    return { unscheduledCount, popularShift, maxCount, totalExpectedHours };
  }, [filteredEmployees, scheduleByDate, attendances, shiftMap, weekDays, vnNow]);

  // === Navigation ===
  const navigate = useCallback((direction) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'week') {
        d.setDate(d.getDate() + direction * 7);
      } else {
        d.setMonth(d.getMonth() + direction);
      }
      return d;
    });
  }, [viewMode]);

  const goToday = useCallback(() => {
    setCurrentDate(getVietnamDate());
  }, []);

  // === Header label ===
  const headerLabel = useMemo(() => {
    if (viewMode === 'week') {
      const sun = new Date(monday);
      sun.setDate(sun.getDate() + 6);
      return `${pad2(monday.getDate())}/${pad2(monday.getMonth() + 1)} - ${pad2(sun.getDate())}/${pad2(sun.getMonth() + 1)}/${sun.getFullYear()}`;
    }
    return `Tháng ${monthYear.month + 1}/${monthYear.year}`;
  }, [viewMode, monday, monthYear]);

  // === CRUD ===
  const handleAssignShift = async () => {
    if (!assignEmployeeId || !assignShiftId || !assignDate || !tenant) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('hrm_attendances').upsert({
        tenant_id: tenant.id,
        employee_id: assignEmployeeId,
        shift_id: assignShiftId,
        date: assignDate,
        status: 'scheduled',
        check_in: null,
        check_out: null
      }, { onConflict: 'employee_id,date' });
      if (error) throw error;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'create', entityType: 'schedule',
        description: `Phân ca ngày ${assignDate} cho NV ${assignEmployeeId}`
      });
      setShowAssignModal(false);
      setAssignEmployeeId('');
      setAssignShiftId('');
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Lỗi phân ca:', err);
      alert('Lỗi phân ca: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBatchAssign = async () => {
    if (!batchEmployeeIds.length || !batchShiftId || !batchDateFrom || !batchDateTo || !tenant) return;
    setSaving(true);
    try {
      const records = [];
      const start = new Date(batchDateFrom + 'T00:00:00+07:00');
      const end = new Date(batchDateTo + 'T00:00:00+07:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        batchEmployeeIds.forEach(empId => {
          records.push({
            tenant_id: tenant.id,
            employee_id: empId,
            shift_id: batchShiftId,
            date: formatDate(d.getFullYear(), d.getMonth(), d.getDate()),
            status: 'scheduled',
            check_in: null,
            check_out: null
          });
        });
      }
      if (records.length === 0) return;
      const { error } = await supabase.from('hrm_attendances')
        .upsert(records, { onConflict: 'employee_id,date' });
      if (error) throw error;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'create', entityType: 'schedule',
        description: `Phân ca hàng loạt: ${records.length} ca cho ${batchEmployeeIds.length} NV từ ${batchDateFrom} đến ${batchDateTo}`
      });
      setShowBatchModal(false);
      setBatchEmployeeIds([]);
      setBatchShiftId('');
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Lỗi phân ca hàng loạt:', err);
      alert('Lỗi phân ca hàng loạt: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Sao chép lịch tuần trước → tuần này
  const handleCopyLastWeek = async () => {
    if (!tenant) return;
    const lastMonday = new Date(monday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastWeekDays = getWeekDays(lastMonday);
    const lastWeekDates = lastWeekDays.map(d => formatDate(d.getFullYear(), d.getMonth(), d.getDate()));
    const thisWeekDates = weekDays.map(d => formatDate(d.getFullYear(), d.getMonth(), d.getDate()));

    // Thu thập lịch tuần trước
    const records = [];
    lastWeekDates.forEach((dateStr, idx) => {
      (scheduleByDate[dateStr] || []).forEach(a => {
        // Kiểm tra nhân viên có trong filter
        if (filterDept !== 'all' && employeeMap[a.employee_id]?.department_id !== filterDept) return;
        records.push({
          tenant_id: tenant.id,
          employee_id: a.employee_id,
          shift_id: a.shift_id,
          date: thisWeekDates[idx],
          status: 'scheduled',
          check_in: null,
          check_out: null
        });
      });
    });

    if (records.length === 0) {
      alert('Tuần trước không có lịch phân ca nào để sao chép.');
      return;
    }

    if (!confirm(`Sao chép ${records.length} ca từ tuần trước sang tuần này? Ca trùng sẽ bị ghi đè.`)) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('hrm_attendances')
        .upsert(records, { onConflict: 'employee_id,date' });
      if (error) throw error;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'import', entityType: 'schedule',
        description: `Sao chép ${records.length} ca từ tuần trước`
      });
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Lỗi sao chép lịch:', err);
      alert('Lỗi sao chép lịch: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Xoá lịch tuần hiện tại
  const handleClearWeek = async () => {
    if (!tenant) return;
    const dates = weekDays.map(d => formatDate(d.getFullYear(), d.getMonth(), d.getDate()));
    const empIds = filteredEmployees.map(e => e.id);
    if (empIds.length === 0) return;

    if (!confirm(`Xoá toàn bộ lịch phân ca tuần này (${dates[0]} → ${dates[6]}) cho ${empIds.length} nhân viên đang lọc?`)) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('hrm_attendances')
        .delete()
        .eq('tenant_id', tenant.id)
        .in('employee_id', empIds)
        .in('date', dates)
        .is('check_in', null); // Chỉ xoá ca chưa chấm công
      if (error) throw error;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'delete', entityType: 'schedule',
        description: `Xoá lịch phân ca tuần ${dates[0]} → ${dates[6]} cho ${empIds.length} NV`
      });
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Lỗi xoá lịch:', err);
      alert('Lỗi xoá lịch: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Xoá 1 bản ghi
  const handleDeleteSchedule = async (recordId) => {
    if (!confirm('Xoá ca phân công này?')) return;
    try {
      const { error } = await supabase.from('hrm_attendances')
        .delete()
        .eq('id', recordId)
        .is('check_in', null);
      if (error) throw error;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'delete', entityType: 'schedule',
        entityId: recordId,
        description: `Xoá 1 ca phân công`
      });
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Lỗi xoá:', err);
    }
  };

  // Toggle batch employee
  const toggleBatchEmployee = (empId) => {
    setBatchEmployeeIds(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  // Lấy danh sách ca trong 1 ngày cho hiển thị cell
  const getCellData = (dateStr) => {
    const records = scheduleByDate[dateStr] || [];
    // Lọc theo phòng ban
    return records.filter(a => {
      if (filterDept === 'all') return true;
      const emp = employeeMap[a.employee_id];
      return emp && emp.department_id === filterDept;
    });
  };

  // === RENDER ===
  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-800">Lịch phân ca</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter phòng ban */}
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="all">Tất cả phòng ban</option>
            {(departments || []).filter(d => d.is_active !== false).map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          {/* Toggle view */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'week' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
            >
              Tuần
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'month' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
            >
              Tháng
            </button>
          </div>

          {/* Actions - chỉ level 2+ */}
          {canManageSchedule && (
            <>
              <button
                onClick={() => { setAssignDate(today); setShowAssignModal(true); }}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                + Phân ca
              </button>
              <button
                onClick={() => { setBatchDateFrom(today); setBatchDateTo(today); setShowBatchModal(true); }}
                className="bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                Phân ca hàng loạt
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-500">NV chưa phân ca (7 ngày tới)</p>
            <p className="text-lg font-bold text-red-600">{stats.unscheduledCount}</p>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-500">Ca phổ biến nhất</p>
            <p className="text-lg font-bold text-green-700">
              {stats.popularShift ? `${stats.popularShift.name} (${stats.maxCount})` : '—'}
            </p>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-500">Tổng giờ dự kiến (tuần này)</p>
            <p className="text-lg font-bold text-blue-700">{stats.totalExpectedHours.toFixed(1)}h</p>
          </div>
        </div>
      </div>

      {/* Calendar navigation */}
      <div className="bg-white border rounded-xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={goToday} className="px-3 py-1 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-medium">
            Hôm nay
          </button>
          <button onClick={() => navigate(1)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-700 ml-2">{headerLabel}</span>
        </div>

        {/* Quick actions - chỉ level 2+ */}
        {viewMode === 'week' && canManageSchedule && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLastWeek}
              disabled={saving}
              className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium disabled:opacity-50"
            >
              Sao chép tuần trước
            </button>
            <button
              onClick={handleClearWeek}
              disabled={saving}
              className="text-xs px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-medium disabled:opacity-50"
            >
              Xoá lịch tuần
            </button>
          </div>
        )}
      </div>

      {/* Shift legend */}
      <div className="flex flex-wrap gap-2">
        {activeShifts.map(shift => {
          const color = getShiftColor(shift.id, shiftIds);
          return (
            <div key={shift.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${color.bg} ${color.text}`}>
              <span className={`w-2 h-2 rounded-full ${color.dot}`} />
              <span className="font-medium">{shift.name}</span>
              <span className="opacity-70">{formatTime(shift.start_time)}-{formatTime(shift.end_time)}</span>
            </div>
          );
        })}
      </div>

      {/* === WEEK VIEW === */}
      {viewMode === 'week' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {weekDays.map((d, i) => {
                    const dateStr = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
                    const isToday = dateStr === today;
                    return (
                      <th key={i} className={`px-2 py-2 text-center text-xs font-medium border-r last:border-r-0 ${isToday ? 'bg-green-50' : ''}`}>
                        <div className={`${isToday ? 'text-green-700 font-bold' : 'text-gray-500'}`}>{WEEKDAY_FULL[i]}</div>
                        <div className={`text-sm mt-0.5 ${isToday ? 'text-green-800 font-bold' : 'text-gray-700'}`}>
                          {pad2(d.getDate())}/{pad2(d.getMonth() + 1)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Mỗi row là 1 ca */}
                {activeShifts.map(shift => {
                  const color = getShiftColor(shift.id, shiftIds);
                  return (
                    <tr key={shift.id} className="border-b last:border-b-0">
                      {weekDays.map((d, colIdx) => {
                        const dateStr = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
                        const cellRecords = getCellData(dateStr).filter(a => a.shift_id === shift.id);
                        const isToday = dateStr === today;
                        return (
                          <td
                            key={colIdx}
                            className={`px-1.5 py-2 border-r last:border-r-0 align-top min-h-[60px] ${isToday ? 'bg-green-50/50' : ''}`}
                            onClick={() => {
                              if (!canManageSchedule) return;
                              setAssignShiftId(shift.id);
                              setAssignDate(dateStr);
                              setAssignEmployeeId('');
                              setShowAssignModal(true);
                            }}
                            style={{ cursor: canManageSchedule ? 'pointer' : 'default' }}
                          >
                            {cellRecords.length === 0 && (
                              <div className="text-center text-gray-300 text-xs py-1">+</div>
                            )}
                            <div className="space-y-1">
                              {cellRecords.map(rec => {
                                const emp = employeeMap[rec.employee_id];
                                return (
                                  <div
                                    key={rec.id}
                                    className={`group relative px-1.5 py-1 rounded text-xs ${color.bg} ${color.text} border ${color.border}`}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <div className="font-medium truncate" title={emp?.full_name}>
                                      {emp?.full_name || 'NV'}
                                    </div>
                                    <div className="text-[10px] opacity-70">
                                      {formatTime(shift.start_time)}-{formatTime(shift.end_time)}
                                    </div>
                                    {rec.check_in && (
                                      <div className="text-[10px] text-green-700 font-medium mt-0.5">
                                        Đã chấm công
                                      </div>
                                    )}
                                    {!rec.check_in && canManageSchedule && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(rec.id); }}
                                        className="absolute top-0.5 right-0.5 hidden group-hover:flex w-4 h-4 items-center justify-center bg-red-500 text-white rounded-full text-[10px] leading-none"
                                        title="Xoá"
                                      >
                                        x
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Row NV chưa phân ca */}
                <tr className="bg-amber-50/50 border-t-2 border-amber-200">
                  {weekDays.map((d, i) => {
                    const dateStr = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
                    const scheduledIds = new Set(getCellData(dateStr).map(a => a.employee_id));
                    const unscheduled = filteredEmployees.filter(e => !scheduledIds.has(e.id));
                    return (
                      <td key={i} className="px-1.5 py-2 border-r last:border-r-0 align-top">
                        {unscheduled.length > 0 && (
                          <div className="text-xs">
                            <div className="text-amber-700 font-medium mb-1">Chưa phân ca:</div>
                            {unscheduled.slice(0, 3).map(e => (
                              <div key={e.id} className="text-amber-600 truncate text-[11px]" title={e.full_name}>
                                {e.full_name}
                              </div>
                            ))}
                            {unscheduled.length > 3 && (
                              <div className="text-amber-500 text-[10px]">+{unscheduled.length - 3} khác</div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === MONTH VIEW === */}
      {viewMode === 'month' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          {/* Weekday header */}
          <div className="grid grid-cols-7 bg-gray-50 border-b">
            {WEEKDAY_NAMES.map((name, i) => (
              <div key={i} className="px-2 py-2 text-center text-xs font-medium text-gray-500 border-r last:border-r-0">
                {name}
              </div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {monthCalendar.map((cell, idx) => {
              const d = cell.date;
              const dateStr = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
              const isToday = dateStr === today;
              const cellData = getCellData(dateStr);
              // Group by shift
              const shiftGroups = {};
              cellData.forEach(a => {
                if (!shiftGroups[a.shift_id]) shiftGroups[a.shift_id] = [];
                shiftGroups[a.shift_id].push(a);
              });

              return (
                <div
                  key={idx}
                  className={`min-h-[80px] border-b border-r p-1 cursor-pointer hover:bg-gray-50 transition-colors ${
                    !cell.isCurrentMonth ? 'bg-gray-50/50' : ''
                  } ${isToday ? 'bg-green-50' : ''}`}
                  onClick={() => {
                    if (!canManageSchedule) return;
                    setAssignDate(dateStr);
                    setAssignShiftId(activeShifts[0]?.id || '');
                    setAssignEmployeeId('');
                    setShowAssignModal(true);
                  }}
                >
                  <div className={`text-xs font-medium mb-1 ${
                    !cell.isCurrentMonth ? 'text-gray-300' :
                    isToday ? 'text-green-700 font-bold' : 'text-gray-700'
                  }`}>
                    {d.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {Object.entries(shiftGroups).map(([sid, records]) => {
                      const shift = shiftMap[sid];
                      const color = getShiftColor(sid, shiftIds);
                      return (
                        <div
                          key={sid}
                          className={`px-1 py-0.5 rounded text-[10px] ${color.bg} ${color.text} truncate`}
                          title={`${shift?.name || 'Ca'}: ${records.map(r => employeeMap[r.employee_id]?.full_name || '').join(', ')}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <span className="font-medium">{shift?.name || 'Ca'}</span>
                          <span className="opacity-70 ml-1">({records.length})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === ASSIGN MODAL === */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Phân ca làm việc</h3>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Ngày */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày</label>
                <input
                  type="date"
                  value={assignDate}
                  onChange={e => setAssignDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              {/* Nhân viên */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên</label>
                <select
                  value={assignEmployeeId}
                  onChange={e => setAssignEmployeeId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {filteredEmployees.map(e => (
                    <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
                  ))}
                </select>
              </div>
              {/* Ca */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ca làm việc</label>
                <select
                  value={assignShiftId}
                  onChange={e => setAssignShiftId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">-- Chọn ca --</option>
                  {activeShifts.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatTime(s.start_time)} - {formatTime(s.end_time)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-2">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Huỷ
              </button>
              <button
                onClick={handleAssignShift}
                disabled={saving || !assignEmployeeId || !assignShiftId}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Phân ca'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === BATCH ASSIGN MODAL === */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-gray-800">Phân ca hàng loạt</h3>
              <button onClick={() => setShowBatchModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Ca */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ca làm việc</label>
                <select
                  value={batchShiftId}
                  onChange={e => setBatchShiftId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">-- Chọn ca --</option>
                  {activeShifts.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatTime(s.start_time)} - {formatTime(s.end_time)})
                    </option>
                  ))}
                </select>
              </div>
              {/* Khoảng ngày */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Từ ngày</label>
                  <input
                    type="date"
                    value={batchDateFrom}
                    onChange={e => setBatchDateFrom(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đến ngày</label>
                  <input
                    type="date"
                    value={batchDateTo}
                    onChange={e => setBatchDateTo(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {/* Chọn NV */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Chọn nhân viên</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBatchEmployeeIds(filteredEmployees.map(e => e.id))}
                      className="text-xs text-green-600 hover:text-green-700 font-medium"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      onClick={() => setBatchEmployeeIds([])}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>
                <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                  {filteredEmployees.map(e => (
                    <label
                      key={e.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={batchEmployeeIds.includes(e.id)}
                        onChange={() => toggleBatchEmployee(e.id)}
                        className="rounded text-green-600"
                      />
                      <span className="text-sm text-gray-700">{e.full_name}</span>
                      <span className="text-xs text-gray-400">({e.employee_code})</span>
                    </label>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <div className="px-3 py-4 text-center text-sm text-gray-400">Không có nhân viên</div>
                  )}
                </div>
                {batchEmployeeIds.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">Đã chọn {batchEmployeeIds.length} nhân viên</p>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-2 flex-shrink-0">
              <button
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Huỷ
              </button>
              <button
                onClick={handleBatchAssign}
                disabled={saving || !batchShiftId || batchEmployeeIds.length === 0}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : `Phân ca (${batchEmployeeIds.length} NV)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { ATTENDANCE_STATUSES } from '../../constants/hrmConstants';
import { getTodayVN, getVietnamDate, getNowISOVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';

// ============ HRM ATTENDANCE VIEW ============
// Quản lý chấm công nhân sự - Hoang Nam Audio ERP
// Hỗ trợ nhiều ca trong 1 ngày

export default function HrmAttendanceView({
  employees,
  attendances,
  workShifts,
  departments,
  loadHrmData,
  tenant,
  currentUser,
  canEdit,
  getPermissionLevel,
}) {
  // === PERMISSION: Lấy level và xác định admin ===
  const permLevel = getPermissionLevel ? getPermissionLevel('hrm') : 3;
  const userCanEdit = canEdit ? canEdit('hrm') : true;
  // ---- State ----
  const [currentTime, setCurrentTime] = useState(getVietnamDate());
  const [checkingIn, setCheckingIn] = useState(false);
  const [filterMonth, setFilterMonth] = useState(() => {
    const vn = getVietnamDate();
    return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [editModal, setEditModal] = useState(null); // { employeeId, employeeName, date, day, records }
  const [editShifts, setEditShifts] = useState([]); // [{ id, check_in: 'HH:MM', check_out: 'HH:MM' }]
  const [editStatus, setEditStatus] = useState('present');
  const [editOvertime, setEditOvertime] = useState(0);
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // ---- Đồng hồ realtime ----
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getVietnamDate());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ---- Toast helper ----
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ---- Tìm nhân viên hiện tại ----
  const currentEmployee = useMemo(() => {
    if (!employees || !currentUser) return null;
    return employees.find(e =>
      e.full_name === currentUser.name && e.status === 'active'
    ) || null;
  }, [employees, currentUser]);

  // ---- Ca làm việc của nhân viên hiện tại ----
  const currentShift = useMemo(() => {
    if (!currentEmployee || !workShifts || workShifts.length === 0) return null;
    if (currentEmployee.shift_id) {
      return workShifts.find(s => s.id === currentEmployee.shift_id) || workShifts[0];
    }
    return workShifts[0] || null;
  }, [currentEmployee, workShifts]);

  // ---- Tất cả bản ghi chấm công hôm nay của nhân viên hiện tại (multi-shift) ----
  const todayStr = getTodayVN();
  const todayRecords = useMemo(() => {
    if (!currentEmployee || !attendances) return [];
    return attendances
      .filter(a => a.employee_id === currentEmployee.id && a.date === todayStr)
      .sort((a, b) => (a.shift_number || 1) - (b.shift_number || 1));
  }, [attendances, currentEmployee, todayStr]);

  // Ca đang mở (có check_in nhưng chưa check_out)
  const openShift = useMemo(() => {
    return todayRecords.find(r => r.check_in && !r.check_out) || null;
  }, [todayRecords]);

  // ---- Format giờ từ ISO/datetime ----
  const formatTime = (dateTimeStr) => {
    if (!dateTimeStr) return '--:--';
    const d = new Date(dateTimeStr);
    return d.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ---- Format giờ ngắn (HH:MM) ----
  const formatTimeShort = (timeStr) => {
    if (!timeStr) return '--:--';
    if (timeStr.length <= 8 && timeStr.includes(':')) {
      return timeStr.substring(0, 5);
    }
    return formatTime(timeStr);
  };

  // ---- Tính số giờ giữa 2 thời điểm ----
  const calculateHours = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 0;
    const diff = new Date(checkOut) - new Date(checkIn);
    return Math.round((diff / (1000 * 60 * 60)) * 10) / 10;
  };

  // ---- Tổng giờ làm hôm nay ----
  const totalTodayHours = useMemo(() => {
    return todayRecords.reduce((sum, rec) => {
      return sum + calculateHours(rec.check_in, rec.check_out);
    }, 0);
  }, [todayRecords]);

  // ---- Kiểm tra đi trễ ----
  const checkIfLate = (checkInTime) => {
    if (!currentShift?.start_time) return false;
    const now = new Date(checkInTime);
    const [sh, sm] = currentShift.start_time.split(':').map(Number);
    const shiftStart = new Date(now);
    shiftStart.setHours(sh, sm, 0, 0);
    return now > shiftStart;
  };

  // ---- Kiểm tra về sớm ----
  const checkIfEarlyLeave = (checkOutTime) => {
    if (!currentShift?.end_time) return false;
    const now = new Date(checkOutTime);
    const [eh, em] = currentShift.end_time.split(':').map(Number);
    const shiftEnd = new Date(now);
    shiftEnd.setHours(eh, em, 0, 0);
    return now < shiftEnd;
  };

  // ---- CHECK-IN (tạo ca mới) ----
  const handleCheckIn = async () => {
    if (!currentEmployee || !tenant) {
      showToast('Không tìm thấy hồ sơ nhân viên', 'error');
      return;
    }
    if (openShift) {
      showToast('Bạn đang có ca chưa check-out!', 'error');
      return;
    }

    setCheckingIn(true);
    try {
      const nowISO = getNowISOVN();
      const shiftNum = todayRecords.length + 1;
      const isLate = shiftNum === 1 ? checkIfLate(nowISO) : false; // Chỉ check late ở ca 1

      const { error } = await supabase
        .from('hrm_attendances')
        .insert({
          tenant_id: tenant.id,
          employee_id: currentEmployee.id,
          date: todayStr,
          shift_number: shiftNum,
          check_in: nowISO,
          check_in_method: 'manual',
          status: isLate ? 'late' : 'present'
        });

      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'create', entityType: 'attendance',
        entityName: currentEmployee?.full_name,
        description: `Chấm công vào Ca ${shiftNum}: ${currentEmployee?.full_name}${isLate ? ' (Đi trễ)' : ''}`
      });

      showToast(`Check-in Ca ${shiftNum} thành công!${isLate ? ' (Đi trễ)' : ''}`);
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Check-in error:', err);
      showToast('Lỗi chấm công vào: ' + err.message, 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  // ---- CHECK-OUT (cập nhật ca đang mở) ----
  const handleCheckOut = async () => {
    if (!openShift) return;

    setCheckingIn(true);
    try {
      const nowISO = getNowISOVN();
      const isEarly = openShift.shift_number === 1 ? checkIfEarlyLeave(nowISO) : false;

      const updateData = {
        check_out: nowISO,
        check_out_method: 'manual'
      };

      if (isEarly && openShift.status !== 'late') {
        updateData.status = 'early_leave';
      }

      const { error } = await supabase
        .from('hrm_attendances')
        .update(updateData)
        .eq('id', openShift.id);

      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'update', entityType: 'attendance',
        entityId: openShift.id,
        description: `Chấm công ra Ca ${openShift.shift_number || 1}${isEarly ? ' (Về sớm)' : ''}`
      });

      showToast(`Check-out Ca ${openShift.shift_number || 1} thành công!${isEarly ? ' (Về sớm)' : ''}`);
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Check-out error:', err);
      showToast('Lỗi chấm công ra: ' + err.message, 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  // ---- Dữ liệu bảng chấm công tháng ----
  const [year, month] = filterMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayColumns = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Lọc nhân viên theo phòng ban + permission
  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    let list = employees.filter(e => e.status === 'active');
    if (filterDepartment !== 'all') {
      list = list.filter(e => e.department_id === filterDepartment);
    }
    // Mọi nhân viên đều xem được bảng chấm công tổng quan
    // (edit chỉ cho admin/manager — đã guard bởi userCanEdit)
    return list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [employees, filterDepartment, permLevel, currentEmployee]);

  // Map chấm công theo employee_id + date → ARRAY (multi-shift)
  const attendanceMap = useMemo(() => {
    if (!attendances) return {};
    const map = {};
    attendances.forEach(a => {
      if (a.date && a.date.startsWith(filterMonth)) {
        const key = `${a.employee_id}_${a.date}`;
        if (!map[key]) map[key] = [];
        map[key].push(a);
      }
    });
    // Sort mỗi array theo shift_number
    Object.values(map).forEach(arr => arr.sort((a, b) => (a.shift_number || 1) - (b.shift_number || 1)));
    return map;
  }, [attendances, filterMonth]);

  // Lấy tất cả bản ghi chấm công cho 1 ô (array)
  const getAttendanceForCell = (employeeId, day) => {
    const dateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
    return attendanceMap[`${employeeId}_${dateStr}`] || [];
  };

  // ---- Tính tổng hợp cho từng nhân viên ----
  const getEmployeeSummary = useCallback((employeeId) => {
    let workDays = 0;
    let leaveDays = 0;
    let absentDays = 0;
    let overtimeHours = 0;
    let lateDays = 0;
    let totalWorkHours = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const records = getAttendanceForCell(employeeId, d);
      if (records.length === 0) continue;

      // Dùng record đầu tiên (ca 1) để xác định trạng thái ngày
      const primary = records[0];
      switch (primary.status) {
        case 'present':
          workDays++;
          break;
        case 'late':
          workDays++;
          lateDays++;
          break;
        case 'early_leave':
          workDays++;
          break;
        case 'half_day':
          workDays += 0.5;
          break;
        case 'absent':
          absentDays++;
          break;
        case 'annual_leave':
        case 'sick':
          leaveDays++;
          break;
        case 'holiday':
          break;
        default:
          break;
      }
      // Cộng overtime + work hours từ tất cả ca
      records.forEach(r => {
        overtimeHours += parseFloat(r.overtime_hours || 0);
        totalWorkHours += calculateHours(r.check_in, r.check_out);
      });
    }

    return { workDays, leaveDays, absentDays, overtimeHours, lateDays, totalWorkHours: Math.round(totalWorkHours * 10) / 10 };
  }, [daysInMonth, attendanceMap, filterMonth]);

  // ---- Thống kê tổng hợp ----
  const stats = useMemo(() => {
    const activeEmployees = employees?.filter(e => e.status === 'active') || [];
    const totalEmployees = activeEmployees.length;

    // Đếm NV chấm công hôm nay (unique employees)
    const todayAttendances = (attendances || []).filter(a => a.date === todayStr);
    const checkedInToday = new Set(todayAttendances.map(a => a.employee_id)).size;

    // Tỷ lệ đúng giờ (chỉ xét ca 1)
    const primaryToday = todayAttendances.filter(a => !a.shift_number || a.shift_number === 1);
    const presentToday = primaryToday.filter(a => a.status === 'present').length;
    const lateToday = primaryToday.filter(a => a.status === 'late').length;
    const onTimeRate = (presentToday + lateToday) > 0
      ? Math.round((presentToday / (presentToday + lateToday)) * 100)
      : 100;

    // NV đi trễ nhiều nhất tháng (chỉ xét ca 1)
    const lateCountMap = {};
    (attendances || []).forEach(a => {
      if (a.date?.startsWith(filterMonth) && a.status === 'late' && (!a.shift_number || a.shift_number === 1)) {
        lateCountMap[a.employee_id] = (lateCountMap[a.employee_id] || 0) + 1;
      }
    });
    let topLateEmployee = null;
    let topLateCount = 0;
    Object.entries(lateCountMap).forEach(([empId, count]) => {
      if (count > topLateCount) {
        topLateCount = count;
        topLateEmployee = activeEmployees.find(e => e.id === empId) || null;
      }
    });

    // Tổng giờ tăng ca tháng
    const totalOvertime = (attendances || [])
      .filter(a => a.date?.startsWith(filterMonth))
      .reduce((sum, a) => sum + parseFloat(a.overtime_hours || 0), 0);

    return {
      totalEmployees,
      checkedInToday,
      onTimeRate,
      topLateEmployee,
      topLateCount,
      totalOvertime: Math.round(totalOvertime * 10) / 10
    };
  }, [employees, attendances, todayStr, filterMonth]);

  // ---- Mở modal chỉnh sửa ô chấm công (multi-shift) ----
  const openEditModal = (employeeId, day) => {
    const dateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
    const records = getAttendanceForCell(employeeId, day);
    const emp = employees?.find(e => e.id === employeeId);

    const shifts = records.length > 0
      ? records.map(r => ({
          id: r.id,
          check_in: formatTimeFromISO(r.check_in) || '',
          check_out: formatTimeFromISO(r.check_out) || '',
        }))
      : [{ id: null, check_in: '', check_out: '' }];

    setEditShifts(shifts);

    const primary = records[0];
    setEditStatus(primary?.status || 'present');
    setEditOvertime(primary?.overtime_hours || 0);
    setEditNote(primary?.note || '');

    setEditModal({
      employeeId,
      employeeName: emp?.full_name || '',
      date: dateStr,
      day,
      records
    });
  };

  // Lấy HH:MM từ ISO datetime
  const formatTimeFromISO = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  // Tính tổng giờ trong edit modal
  const editTotalHours = useMemo(() => {
    return editShifts.reduce((sum, s) => {
      if (s.check_in && s.check_out && s.check_out > s.check_in) {
        const [h1, m1] = s.check_in.split(':').map(Number);
        const [h2, m2] = s.check_out.split(':').map(Number);
        return sum + (h2 - h1) + (m2 - m1) / 60;
      }
      return sum;
    }, 0);
  }, [editShifts]);

  // ---- Lưu chỉnh sửa chấm công (multi-shift) ----
  const handleSaveEdit = async () => {
    if (!editModal || !tenant) return;

    // Validate
    const validShifts = editShifts.filter(s => s.check_in || s.check_out);
    for (let i = 0; i < validShifts.length; i++) {
      const s = validShifts[i];
      if (s.check_in && s.check_out && s.check_out <= s.check_in) {
        showToast(`Ca ${i + 1}: Giờ ra phải sau giờ vào!`, 'error');
        return;
      }
    }
    // Check overlap
    for (let i = 0; i < validShifts.length; i++) {
      for (let j = i + 1; j < validShifts.length; j++) {
        const a = validShifts[i];
        const b = validShifts[j];
        if (a.check_in && a.check_out && b.check_in && b.check_out) {
          if (a.check_in < b.check_out && b.check_in < a.check_out) {
            showToast(`Ca ${i + 1} và Ca ${j + 1} bị trùng giờ!`, 'error');
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      const { employeeId, date } = editModal;
      const buildDateTime = (timeStr) => {
        if (!timeStr) return null;
        return `${date}T${timeStr}:00+07:00`;
      };

      // Xóa tất cả bản ghi cũ cho ngày này
      const existingIds = editModal.records.map(r => r.id).filter(Boolean);
      if (existingIds.length > 0) {
        const { error } = await supabase
          .from('hrm_attendances')
          .delete()
          .in('id', existingIds);
        if (error) throw error;
      }

      // Insert lại tất cả ca hợp lệ
      if (validShifts.length > 0) {
        // Sort theo check_in
        validShifts.sort((a, b) => (a.check_in || '').localeCompare(b.check_in || ''));

        const inserts = validShifts.map((s, i) => ({
          tenant_id: tenant.id,
          employee_id: employeeId,
          date: date,
          shift_number: i + 1,
          check_in: buildDateTime(s.check_in),
          check_out: buildDateTime(s.check_out),
          check_in_method: 'manual',
          check_out_method: s.check_out ? 'manual' : null,
          status: i === 0 ? editStatus : 'present',
          overtime_hours: i === 0 ? (parseFloat(editOvertime) || 0) : 0,
          note: i === 0 ? (editNote || null) : null,
        }));

        const { error } = await supabase.from('hrm_attendances').insert(inserts);
        if (error) throw error;
      } else if (['absent', 'annual_leave', 'sick', 'holiday', 'half_day'].includes(editStatus)) {
        // Không có ca nhưng có trạng thái nghỉ → tạo 1 record không có giờ
        const { error } = await supabase.from('hrm_attendances').insert({
          tenant_id: tenant.id,
          employee_id: employeeId,
          date: date,
          shift_number: 1,
          status: editStatus,
          overtime_hours: parseFloat(editOvertime) || 0,
          note: editNote || null,
        });
        if (error) throw error;
      }

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'update', entityType: 'attendance',
        description: `Chỉnh sửa chấm công ngày ${date} cho NV ${editModal.employeeName} (${validShifts.length} ca)`
      });

      showToast('Đã lưu chấm công thành công!');
      setEditModal(null);
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Save attendance error:', err);
      showToast('Lỗi lưu chấm công: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---- Xóa tất cả bản ghi chấm công cho ngày ----
  const handleDeleteAttendance = async () => {
    const existingIds = editModal?.records?.map(r => r.id).filter(Boolean) || [];
    if (existingIds.length === 0) return;
    if (!confirm('Bạn có chắc muốn xóa tất cả bản ghi chấm công ngày này?')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('hrm_attendances')
        .delete()
        .in('id', existingIds);
      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'delete', entityType: 'attendance',
        description: `Xóa chấm công ngày ${editModal.date} cho NV ${editModal.employeeName}`
      });

      showToast('Đã xóa bản ghi chấm công');
      setEditModal(null);
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Delete attendance error:', err);
      showToast('Lỗi xóa: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---- Lấy tên ngày trong tuần ----
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

  // ---- Tổng hợp toàn bộ nhân viên trong tháng ----
  const totalSummary = useMemo(() => {
    let totalWork = 0;
    let totalLeave = 0;
    let totalAbsent = 0;
    let totalOT = 0;

    filteredEmployees.forEach(emp => {
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
  }, [filteredEmployees, getEmployeeSummary]);

  // ============ RENDER ============
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm
          ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.message}
        </div>
      )}

      {/* ===== A. CHẤM CÔNG HÔM NAY (MULTI-SHIFT) ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          Chấm công hôm nay - {new Date(todayStr + 'T00:00:00+07:00').toLocaleDateString('vi-VN', {
            weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
          })}
        </h2>

        <div className="flex flex-col md:flex-row items-start gap-6">
          {/* Đồng hồ */}
          <div className="text-center">
            <div className="text-4xl md:text-5xl font-mono font-bold text-green-700">
              {currentTime.toLocaleTimeString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </div>
            {currentShift && (
              <div className="text-sm text-gray-500 mt-1">
                Ca: {currentShift.name || 'Mặc định'} ({formatTimeShort(currentShift.start_time)} - {formatTimeShort(currentShift.end_time)})
              </div>
            )}
          </div>

          {/* Nút chấm công */}
          {permLevel >= 1 && (
            <div className="flex flex-col items-center gap-2">
              {openShift ? (
                <button
                  onClick={handleCheckOut}
                  disabled={checkingIn}
                  className="px-8 py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400
                    text-white text-lg font-bold rounded-xl shadow-lg
                    transform hover:scale-105 transition-all duration-200
                    disabled:transform-none disabled:cursor-not-allowed"
                >
                  {checkingIn ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Đang xử lý...
                    </span>
                  ) : (
                    `CHECK-OUT Ca ${openShift.shift_number || 1}`
                  )}
                </button>
              ) : (
                <button
                  onClick={handleCheckIn}
                  disabled={checkingIn || !currentEmployee}
                  className="px-8 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400
                    text-white text-lg font-bold rounded-xl shadow-lg
                    transform hover:scale-105 transition-all duration-200
                    disabled:transform-none disabled:cursor-not-allowed"
                >
                  {checkingIn ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Đang xử lý...
                    </span>
                  ) : todayRecords.length === 0 ? (
                    'CHECK-IN'
                  ) : (
                    `+ Thêm Ca ${todayRecords.length + 1}`
                  )}
                </button>
              )}

              {/* Trạng thái */}
              <div className={`text-sm font-medium ${
                !currentEmployee ? 'text-red-500' :
                openShift ? 'text-blue-600' :
                todayRecords.length === 0 ? 'text-gray-500' : 'text-green-600'
              }`}>
                {!currentEmployee ? 'Không tìm thấy hồ sơ nhân viên' :
                 openShift ? `Đang làm Ca ${openShift.shift_number || 1}...` :
                 todayRecords.length === 0 ? 'Chưa chấm công' :
                 `Đã hoàn thành ${todayRecords.length} ca`}
              </div>
            </div>
          )}

          {/* Danh sách các ca hôm nay */}
          {todayRecords.length > 0 && (
            <div className="flex-1 w-full md:w-auto">
              <div className="space-y-2">
                {todayRecords.map((rec, i) => {
                  const hours = calculateHours(rec.check_in, rec.check_out);
                  return (
                    <div key={rec.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2 text-sm">
                      <span className="font-bold text-gray-600 w-10">Ca {i + 1}:</span>
                      <div className="bg-green-50 rounded px-2 py-1 border border-green-200">
                        <span className="text-green-700 font-bold">{formatTime(rec.check_in)}</span>
                      </div>
                      <span className="text-gray-400">→</span>
                      {rec.check_out ? (
                        <>
                          <div className="bg-orange-50 rounded px-2 py-1 border border-orange-200">
                            <span className="text-orange-600 font-bold">{formatTime(rec.check_out)}</span>
                          </div>
                          <span className="text-blue-700 font-bold ml-auto">= {hours}h</span>
                        </>
                      ) : (
                        <span className="text-blue-500 font-medium animate-pulse ml-auto">Đang làm...</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Tổng giờ */}
              {todayRecords.some(r => r.check_out) && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Tổng giờ làm:</span>
                  <span className="font-bold text-blue-700 text-base">{Math.round(totalTodayHours * 10) / 10}h</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== C. THỐNG KÊ ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Chấm công hôm nay</div>
          <div className="text-2xl font-bold text-green-700 mt-1">
            {stats.checkedInToday}
            <span className="text-base font-normal text-gray-400">/{stats.totalEmployees}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">nhân viên</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Tỷ lệ đúng giờ</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {stats.onTimeRate}%
          </div>
          <div className="text-xs text-gray-400 mt-1">hôm nay</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Đi trễ nhiều nhất</div>
          <div className="text-lg font-bold text-orange-600 mt-1 truncate">
            {stats.topLateEmployee ? stats.topLateEmployee.full_name : '--'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {stats.topLateCount > 0 ? `${stats.topLateCount} lần trong tháng` : 'tháng này'}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Tổng giờ tăng ca</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">
            {stats.totalOvertime}h
          </div>
          <div className="text-xs text-gray-400 mt-1">trong tháng</div>
        </div>
      </div>

      {/* ===== B. BẢNG CHẤM CÔNG THÁNG ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Header + Bộ lọc */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-800">
              Bảng chấm công tháng
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Tháng:</label>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={e => setFilterMonth(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Phòng ban:</label>
                <select
                  value={filterDepartment}
                  onChange={e => setFilterDepartment(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="all">Tất cả</option>
                  {(departments || []).map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tổng hợp tháng */}
          <div className="flex flex-wrap gap-4 mt-3 text-sm">
            <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium">
              Tổng ngày công: {totalSummary.totalWork}
            </span>
            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
              Tổng ngày phép: {totalSummary.totalLeave}
            </span>
            <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full font-medium">
              Tổng ngày vắng: {totalSummary.totalAbsent}
            </span>
            <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full font-medium">
              Tổng tăng ca: {totalSummary.totalOT}h
            </span>
          </div>
        </div>

        {/* Bảng */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 border-b border-r border-gray-200 min-w-[140px]">
                  Nhân viên
                </th>
                {dayColumns.map(day => (
                  <th
                    key={day}
                    className={`px-1 py-2 text-center font-medium border-b border-gray-200 min-w-[32px]
                      ${isSunday(day) ? 'bg-red-50 text-red-500' : 'text-gray-600'}`}
                  >
                    <div>{day}</div>
                    <div className="text-[10px] font-normal">{getDayOfWeek(day)}</div>
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-semibold text-gray-700 border-b border-l border-gray-200 min-w-[60px] bg-green-50">
                  Công
                </th>
                <th className="px-2 py-2 text-center font-semibold text-gray-700 border-b border-gray-200 min-w-[50px] bg-blue-50">
                  Phép
                </th>
                <th className="px-2 py-2 text-center font-semibold text-gray-700 border-b border-gray-200 min-w-[50px] bg-red-50">
                  Vắng
                </th>
                <th className="px-2 py-2 text-center font-semibold text-gray-700 border-b border-gray-200 min-w-[50px] bg-purple-50">
                  TC
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 5} className="text-center py-8 text-gray-400">
                    Không có nhân viên nào
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, idx) => {
                  const summary = getEmployeeSummary(emp.id);
                  return (
                    <tr key={emp.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="sticky left-0 z-10 px-3 py-1.5 border-b border-r border-gray-200 font-medium text-gray-800 truncate max-w-[140px]"
                        style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}
                        title={emp.full_name}
                      >
                        <div className="truncate">{emp.full_name}</div>
                        {emp.position && (
                          <div className="text-[10px] text-gray-400 truncate">{emp.position}</div>
                        )}
                      </td>

                      {dayColumns.map(day => {
                        const records = getAttendanceForCell(emp.id, day);
                        const primary = records[0];
                        const statusInfo = primary?.status ? ATTENDANCE_STATUSES[primary.status] : null;
                        const sunday = isSunday(day);
                        const shiftCount = records.length;

                        return (
                          <td
                            key={day}
                            onClick={() => { if (userCanEdit) openEditModal(emp.id, day); }}
                            className={`px-0.5 py-1 text-center border-b border-gray-100 transition-colors
                              ${userCanEdit ? 'cursor-pointer hover:bg-green-50' : ''}
                              ${sunday && shiftCount === 0 ? 'bg-red-50/50' : ''}`}
                            title={statusInfo
                              ? `${emp.full_name} - Ngày ${day}: ${statusInfo.label}${shiftCount > 1 ? ` (${shiftCount} ca)` : ''}${primary?.note ? ' - ' + primary.note : ''}`
                              : `${emp.full_name} - Ngày ${day}: Chưa có dữ liệu`
                            }
                          >
                            {shiftCount > 0 ? (
                              <div className="relative inline-block">
                                <span className="text-sm leading-none">{statusInfo?.icon || '✅'}</span>
                                {shiftCount > 1 && (
                                  <span className="absolute -top-1.5 -right-2.5 bg-blue-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                                    {shiftCount}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="px-2 py-1.5 text-center border-b border-l border-gray-200 font-bold text-green-700 bg-green-50/50">
                        {summary.workDays}
                      </td>
                      <td className="px-2 py-1.5 text-center border-b border-gray-200 font-medium text-blue-600 bg-blue-50/50">
                        {summary.leaveDays || '-'}
                      </td>
                      <td className="px-2 py-1.5 text-center border-b border-gray-200 font-medium text-red-600 bg-red-50/50">
                        {summary.absentDays || '-'}
                      </td>
                      <td className="px-2 py-1.5 text-center border-b border-gray-200 font-medium text-purple-600 bg-purple-50/50">
                        {summary.overtimeHours > 0 ? `${summary.overtimeHours}h` : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Chú thích */}
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-wrap gap-3 text-xs text-gray-600">
            {Object.entries(ATTENDANCE_STATUSES).map(([key, val]) => (
              <span key={key} className="flex items-center gap-1">
                <span>{val.icon}</span>
                <span>{val.label}</span>
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="text-gray-300">-</span>
              <span>Chưa có dữ liệu</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-blue-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 inline-flex items-center justify-center">2</span>
              <span>Nhiều ca</span>
            </span>
          </div>
        </div>
      </div>

      {/* ===== MODAL CHỈNH SỬA CHẤM CÔNG (MULTI-SHIFT) ===== */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setEditModal(null)}
        >
          <div className="absolute inset-0 bg-black/40" />

          <div
            className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h3 className="font-bold text-gray-800">Chỉnh sửa chấm công</h3>
                <p className="text-sm text-gray-500">
                  {editModal.employeeName} - Ngày {editModal.day}/{month}/{year}
                </p>
              </div>
              <button
                onClick={() => setEditModal(null)}
                className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Danh sách ca */}
            <div className="p-4 space-y-4">
              <div className="space-y-3">
                {editShifts.map((shift, i) => {
                  // Tính giờ ca
                  let shiftHours = 0;
                  if (shift.check_in && shift.check_out && shift.check_out > shift.check_in) {
                    const [h1, m1] = shift.check_in.split(':').map(Number);
                    const [h2, m2] = shift.check_out.split(':').map(Number);
                    shiftHours = Math.round(((h2 - h1) + (m2 - m1) / 60) * 10) / 10;
                  }
                  return (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-200">
                      <span className="font-bold text-gray-600 text-sm w-10 shrink-0">Ca {i + 1}:</span>
                      <input
                        type="time"
                        value={shift.check_in}
                        onChange={e => {
                          const updated = [...editShifts];
                          updated[i] = { ...updated[i], check_in: e.target.value };
                          setEditShifts(updated);
                        }}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-[100px]
                          focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                      <span className="text-gray-400">→</span>
                      <input
                        type="time"
                        value={shift.check_out}
                        onChange={e => {
                          const updated = [...editShifts];
                          updated[i] = { ...updated[i], check_out: e.target.value };
                          setEditShifts(updated);
                        }}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-[100px]
                          focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                      {shiftHours > 0 && (
                        <span className="text-blue-700 font-bold text-sm ml-auto">= {shiftHours}h</span>
                      )}
                      {editShifts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEditShifts(editShifts.filter((_, j) => j !== i))}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded shrink-0"
                          title="Xóa ca"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Nút thêm ca */}
              <button
                type="button"
                onClick={() => setEditShifts([...editShifts, { id: null, check_in: '', check_out: '' }])}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500
                  hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-colors"
              >
                + Thêm ca
              </button>

              {/* Tổng giờ */}
              {editTotalHours > 0 && (
                <div className="flex items-center justify-between bg-blue-50 rounded-lg px-4 py-2.5 border border-blue-200">
                  <span className="text-sm text-blue-700 font-medium">Tổng giờ làm:</span>
                  <span className="text-lg font-bold text-blue-700">{Math.round(editTotalHours * 10) / 10}h</span>
                </div>
              )}

              <div className="border-t pt-4 space-y-4">
                {/* Trạng thái */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                      focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    {Object.entries(ATTENDANCE_STATUSES).map(([key, val]) => (
                      <option key={key} value={key}>{val.icon} {val.label}</option>
                    ))}
                  </select>
                </div>

                {/* Giờ tăng ca */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giờ tăng ca</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editOvertime}
                    onChange={e => setEditOvertime(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                      focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="0"
                  />
                </div>

                {/* Ghi chú */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                  <textarea
                    value={editNote}
                    onChange={e => setEditNote(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                      focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                    placeholder="Lý do đi trễ, về sớm, vắng..."
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <div>
                {userCanEdit && editModal.records?.length > 0 && (
                  <button
                    onClick={handleDeleteAttendance}
                    disabled={saving}
                    className="px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Xóa tất cả
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditModal(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg
                    disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  Lưu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

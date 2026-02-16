import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { ATTENDANCE_STATUSES } from '../../constants/hrmConstants';
import { getTodayVN, getVietnamDate, getNowISOVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';

// ============ HRM ATTENDANCE VIEW ============
// Quản lý chấm công nhân sự - Hoang Nam Audio ERP

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
  const [editModal, setEditModal] = useState(null); // { employeeId, date, record }
  const [editForm, setEditForm] = useState({
    check_in: '',
    check_out: '',
    status: 'present',
    note: '',
    overtime_hours: 0
  });
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
    // Tìm ca theo shift_id của nhân viên, hoặc lấy ca mặc định
    if (currentEmployee.shift_id) {
      return workShifts.find(s => s.id === currentEmployee.shift_id) || workShifts[0];
    }
    return workShifts[0] || null;
  }, [currentEmployee, workShifts]);

  // ---- Bản ghi chấm công hôm nay của nhân viên hiện tại ----
  const todayStr = getTodayVN();
  const todayRecord = useMemo(() => {
    if (!currentEmployee || !attendances) return null;
    return attendances.find(a =>
      a.employee_id === currentEmployee.id && a.date === todayStr
    ) || null;
  }, [attendances, currentEmployee, todayStr]);

  // ---- Trạng thái check-in/out ----
  const hasCheckedIn = !!todayRecord?.check_in;
  const hasCheckedOut = !!todayRecord?.check_out;

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
    // Nếu là time string thuần (HH:MM:SS hoặc HH:MM)
    if (timeStr.length <= 8 && timeStr.includes(':')) {
      return timeStr.substring(0, 5);
    }
    return formatTime(timeStr);
  };

  // ---- Xác định trạng thái hiển thị ----
  const getCheckStatusText = () => {
    if (!currentEmployee) return 'Không tìm thấy hồ sơ nhân viên';
    if (!hasCheckedIn) return 'Chưa chấm công';
    if (hasCheckedIn && !hasCheckedOut) {
      const isLate = todayRecord?.status === 'late';
      const timeIn = formatTime(todayRecord.check_in);
      return isLate
        ? `Đi trễ - Vào lúc ${timeIn}`
        : `Đã vào lúc ${timeIn}`;
    }
    if (hasCheckedOut) {
      const isEarly = todayRecord?.status === 'early_leave';
      const timeOut = formatTime(todayRecord.check_out);
      return isEarly
        ? `Về sớm - Ra lúc ${timeOut}`
        : `Đã ra lúc ${timeOut}`;
    }
    return '';
  };

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

  // ---- CHECK-IN ----
  const handleCheckIn = async () => {
    if (!currentEmployee || !tenant) {
      showToast('Không tìm thấy hồ sơ nhân viên', 'error');
      return;
    }
    if (hasCheckedIn) return;

    setCheckingIn(true);
    try {
      const nowISO = getNowISOVN();
      const isLate = checkIfLate(nowISO);

      const { error } = await supabase
        .from('hrm_attendances')
        .insert({
          tenant_id: tenant.id,
          employee_id: currentEmployee.id,
          date: todayStr,
          check_in: nowISO,
          check_in_method: 'manual',
          status: isLate ? 'late' : 'present'
        });

      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'create', entityType: 'attendance',
        entityName: currentEmployee?.full_name,
        description: `Chấm công vào: ${currentEmployee?.full_name}${isLate ? ' (Đi trễ)' : ''}`
      });

      showToast(isLate ? 'Đã chấm công vào - Đi trễ!' : 'Đã chấm công vào thành công!');
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Check-in error:', err);
      showToast('Lỗi chấm công vào: ' + err.message, 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  // ---- CHECK-OUT ----
  const handleCheckOut = async () => {
    if (!todayRecord || hasCheckedOut) return;

    setCheckingIn(true);
    try {
      const nowISO = getNowISOVN();
      const isEarly = checkIfEarlyLeave(nowISO);

      const updateData = {
        check_out: nowISO,
        check_out_method: 'manual'
      };

      // Nếu về sớm, cập nhật status (trừ khi đã late)
      if (isEarly && todayRecord.status !== 'late') {
        updateData.status = 'early_leave';
      }

      const { error } = await supabase
        .from('hrm_attendances')
        .update(updateData)
        .eq('id', todayRecord.id);

      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'update', entityType: 'attendance',
        entityId: todayRecord.id,
        description: `Chấm công ra${isEarly ? ' (Về sớm)' : ''}`
      });

      showToast(isEarly ? 'Đã chấm công ra - Về sớm!' : 'Đã chấm công ra thành công!');
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
    // Permission: level 1 chỉ xem hàng của mình trong bảng chấm công
    if (permLevel <= 1 && currentEmployee) {
      list = list.filter(e => e.id === currentEmployee.id);
    }
    return list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [employees, filterDepartment, permLevel, currentEmployee]);

  // Map chấm công theo employee_id + date
  const attendanceMap = useMemo(() => {
    if (!attendances) return {};
    const map = {};
    attendances.forEach(a => {
      if (a.date && a.date.startsWith(filterMonth)) {
        const key = `${a.employee_id}_${a.date}`;
        map[key] = a;
      }
    });
    return map;
  }, [attendances, filterMonth]);

  // Lấy bản ghi chấm công cho 1 ô
  const getAttendanceForCell = (employeeId, day) => {
    const dateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
    return attendanceMap[`${employeeId}_${dateStr}`] || null;
  };

  // ---- Tính tổng hợp cho từng nhân viên ----
  const getEmployeeSummary = useCallback((employeeId) => {
    let workDays = 0;
    let leaveDays = 0;
    let absentDays = 0;
    let overtimeHours = 0;
    let lateDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const record = getAttendanceForCell(employeeId, d);
      if (!record) continue;

      switch (record.status) {
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
          // Nghỉ lễ không tính vắng
          break;
        default:
          break;
      }
      overtimeHours += parseFloat(record.overtime_hours || 0);
    }

    return { workDays, leaveDays, absentDays, overtimeHours, lateDays };
  }, [daysInMonth, attendanceMap, filterMonth]);

  // ---- Thống kê tổng hợp ----
  const stats = useMemo(() => {
    const activeEmployees = employees?.filter(e => e.status === 'active') || [];
    const totalEmployees = activeEmployees.length;

    // Đếm NV chấm công hôm nay
    const todayAttendances = (attendances || []).filter(a => a.date === todayStr);
    const checkedInToday = todayAttendances.length;

    // Tỷ lệ đúng giờ
    const presentToday = todayAttendances.filter(a => a.status === 'present').length;
    const lateToday = todayAttendances.filter(a => a.status === 'late').length;
    const onTimeRate = (presentToday + lateToday) > 0
      ? Math.round((presentToday / (presentToday + lateToday)) * 100)
      : 100;

    // NV đi trễ nhiều nhất tháng
    const lateCountMap = {};
    (attendances || []).forEach(a => {
      if (a.date?.startsWith(filterMonth) && a.status === 'late') {
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

  // ---- Mở modal chỉnh sửa ô chấm công ----
  const openEditModal = (employeeId, day) => {
    const dateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
    const record = getAttendanceForCell(employeeId, day);
    const emp = employees?.find(e => e.id === employeeId);

    setEditForm({
      check_in: record?.check_in ? formatTimeFromISO(record.check_in) : '',
      check_out: record?.check_out ? formatTimeFromISO(record.check_out) : '',
      status: record?.status || 'present',
      note: record?.note || '',
      overtime_hours: record?.overtime_hours || 0
    });

    setEditModal({
      employeeId,
      employeeName: emp?.full_name || '',
      date: dateStr,
      day,
      record
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

  // ---- Lưu chỉnh sửa chấm công ----
  const handleSaveEdit = async () => {
    if (!editModal || !tenant) return;
    setSaving(true);

    try {
      const { employeeId, date, record } = editModal;

      // Chuyển HH:MM thành ISO datetime
      const buildDateTime = (timeStr) => {
        if (!timeStr) return null;
        return `${date}T${timeStr}:00+07:00`;
      };

      const checkInISO = buildDateTime(editForm.check_in);
      const checkOutISO = buildDateTime(editForm.check_out);

      // Tính giờ làm
      let workHours = 0;
      if (checkInISO && checkOutISO) {
        const diff = new Date(checkOutISO) - new Date(checkInISO);
        workHours = Math.round((diff / (1000 * 60 * 60)) * 100) / 100;
        if (workHours < 0) workHours = 0;
      }

      const payload = {
        tenant_id: tenant.id,
        employee_id: employeeId,
        date: date,
        check_in: checkInISO,
        check_out: checkOutISO,
        status: editForm.status,
        note: editForm.note || null,
        overtime_hours: parseFloat(editForm.overtime_hours) || 0
      };

      if (record?.id) {
        // Cập nhật bản ghi
        const { error } = await supabase
          .from('hrm_attendances')
          .update(payload)
          .eq('id', record.id);
        if (error) throw error;
        logActivity({
          tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
          module: 'hrm', action: 'update', entityType: 'attendance',
          entityId: record.id,
          description: `Chỉnh sửa chấm công ngày ${date} cho NV ${employeeId}`
        });
      } else {
        // Tạo mới
        payload.check_in_method = 'manual';
        payload.check_out_method = 'manual';
        const { error } = await supabase
          .from('hrm_attendances')
          .insert(payload);
        if (error) throw error;
        logActivity({
          tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
          module: 'hrm', action: 'create', entityType: 'attendance',
          description: `Tạo chấm công thủ công ngày ${date} cho NV ${employeeId}`
        });
      }

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

  // ---- Xóa bản ghi chấm công ----
  const handleDeleteAttendance = async () => {
    if (!editModal?.record?.id) return;
    if (!confirm('Bạn có chắc muốn xóa bản ghi chấm công này?')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('hrm_attendances')
        .delete()
        .eq('id', editModal.record.id);
      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'delete', entityType: 'attendance',
        entityId: editModal.record.id,
        description: `Xóa bản ghi chấm công ngày ${editModal.date}`
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

  // Kiểm tra ngày chủ nhật
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

      {/* ===== A. CHẤM CÔNG HÔM NAY ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          Chấm công hôm nay - {new Date(todayStr + 'T00:00:00+07:00').toLocaleDateString('vi-VN', {
            weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
          })}
        </h2>

        <div className="flex flex-col md:flex-row items-center gap-6">
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

          {/* Nút chấm công - level 1+ cho self check-in */}
          <div className="flex flex-col items-center gap-2">
            {permLevel >= 1 && !hasCheckedIn ? (
              <button
                onClick={handleCheckIn}
                disabled={checkingIn || !currentEmployee}
                className="px-8 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400
                  text-white text-xl font-bold rounded-xl shadow-lg
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
                  'CHECK-IN'
                )}
              </button>
            ) : permLevel >= 1 && !hasCheckedOut ? (
              <button
                onClick={handleCheckOut}
                disabled={checkingIn}
                className="px-8 py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400
                  text-white text-xl font-bold rounded-xl shadow-lg
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
                  'CHECK-OUT'
                )}
              </button>
            ) : (
              <div className="px-8 py-4 bg-gray-100 text-gray-600 text-xl font-bold rounded-xl border-2 border-dashed border-gray-300">
                Hoàn thành
              </div>
            )}

            {/* Trạng thái */}
            <div className={`text-sm font-medium ${
              !currentEmployee ? 'text-red-500' :
              !hasCheckedIn ? 'text-gray-500' :
              todayRecord?.status === 'late' ? 'text-orange-600' :
              todayRecord?.status === 'early_leave' ? 'text-yellow-600' :
              hasCheckedOut ? 'text-green-600' : 'text-blue-600'
            }`}>
              {getCheckStatusText()}
            </div>
          </div>

          {/* Thông tin check-in/out */}
          {hasCheckedIn && (
            <div className="flex gap-4 text-sm">
              <div className="bg-green-50 rounded-lg px-4 py-2 text-center">
                <div className="text-gray-500">Giờ vào</div>
                <div className="font-bold text-green-700">{formatTime(todayRecord.check_in)}</div>
              </div>
              {hasCheckedOut && (
                <>
                  <div className="bg-orange-50 rounded-lg px-4 py-2 text-center">
                    <div className="text-gray-500">Giờ ra</div>
                    <div className="font-bold text-orange-600">{formatTime(todayRecord.check_out)}</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg px-4 py-2 text-center">
                    <div className="text-gray-500">Tổng giờ</div>
                    <div className="font-bold text-blue-700">
                      {todayRecord.work_hours ? `${Math.round(todayRecord.work_hours * 10) / 10}h` : '--'}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== C. THỐNG KÊ ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Tổng NV chấm công hôm nay */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Chấm công hôm nay</div>
          <div className="text-2xl font-bold text-green-700 mt-1">
            {stats.checkedInToday}
            <span className="text-base font-normal text-gray-400">/{stats.totalEmployees}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">nhân viên</div>
        </div>

        {/* Tỷ lệ đúng giờ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Tỷ lệ đúng giờ</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {stats.onTimeRate}%
          </div>
          <div className="text-xs text-gray-400 mt-1">hôm nay</div>
        </div>

        {/* NV đi trễ nhiều nhất */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Đi trễ nhiều nhất</div>
          <div className="text-lg font-bold text-orange-600 mt-1 truncate">
            {stats.topLateEmployee ? stats.topLateEmployee.full_name : '--'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {stats.topLateCount > 0 ? `${stats.topLateCount} lần trong tháng` : 'tháng này'}
          </div>
        </div>

        {/* Tổng giờ tăng ca */}
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
              {/* Chọn tháng */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Tháng:</label>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={e => setFilterMonth(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              {/* Chọn phòng ban */}
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
                      {/* Tên nhân viên */}
                      <td className="sticky left-0 z-10 px-3 py-1.5 border-b border-r border-gray-200 font-medium text-gray-800 truncate max-w-[140px]"
                        style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}
                        title={emp.full_name}
                      >
                        <div className="truncate">{emp.full_name}</div>
                        {emp.position && (
                          <div className="text-[10px] text-gray-400 truncate">{emp.position}</div>
                        )}
                      </td>

                      {/* Các ô ngày */}
                      {dayColumns.map(day => {
                        const record = getAttendanceForCell(emp.id, day);
                        const status = record?.status;
                        const statusInfo = status ? ATTENDANCE_STATUSES[status] : null;
                        const sunday = isSunday(day);

                        return (
                          <td
                            key={day}
                            onClick={() => { if (userCanEdit) openEditModal(emp.id, day); }}
                            className={`px-0.5 py-1 text-center border-b border-gray-100 transition-colors
                              ${userCanEdit ? 'cursor-pointer hover:bg-green-50' : ''}
                              ${sunday && !record ? 'bg-red-50/50' : ''}`}
                            title={statusInfo
                              ? `${emp.full_name} - Ngày ${day}: ${statusInfo.label}${record?.note ? ' - ' + record.note : ''}`
                              : `${emp.full_name} - Ngày ${day}: Chưa có dữ liệu`
                            }
                          >
                            {statusInfo ? (
                              <span className="text-sm leading-none">{statusInfo.icon}</span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Cột tổng hợp */}
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
          </div>
        </div>
      </div>

      {/* ===== MODAL CHỈNH SỬA CHẤM CÔNG ===== */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setEditModal(null)}
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Modal content */}
          <div
            className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
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

            {/* Form */}
            <div className="p-4 space-y-4">
              {/* Giờ vào */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giờ vào</label>
                <input
                  type="time"
                  value={editForm.check_in}
                  onChange={e => setEditForm(prev => ({ ...prev, check_in: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                    focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              {/* Giờ ra */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giờ ra</label>
                <input
                  type="time"
                  value={editForm.check_out}
                  onChange={e => setEditForm(prev => ({ ...prev, check_out: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                    focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              {/* Trạng thái */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
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
                  value={editForm.overtime_hours}
                  onChange={e => setEditForm(prev => ({ ...prev, overtime_hours: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                    focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="0"
                />
              </div>

              {/* Ghi chú */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea
                  value={editForm.note}
                  onChange={e => setEditForm(prev => ({ ...prev, note: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                    focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                  placeholder="Lý do đi trễ, về sớm, vắng..."
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <div>
                {userCanEdit && editModal.record?.id && (
                  <button
                    onClick={handleDeleteAttendance}
                    disabled={saving}
                    className="px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Xóa
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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { getNowISOVN, getTodayVN, getVietnamDate } from '../../utils/dateUtils';

// Lấy ngày string YYYY-MM-DD theo VN timezone
const getTodayStr = getTodayVN;

// Extract HH:MM từ ISO datetime string
const extractTime = (isoStr) => {
  if (!isoStr) return '--:--';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Tính giờ giữa 2 ISO timestamps
const calculateHours = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 0;
  const diff = new Date(checkOut) - new Date(checkIn);
  return Math.round((diff / (1000 * 60 * 60)) * 10) / 10;
};

// Kiểm tra đi trễ (copy logic desktop)
const checkIfLate = (checkInISO, shift) => {
  if (!shift?.start_time) return false;
  const now = new Date(checkInISO);
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const shiftStart = new Date(now);
  shiftStart.setHours(sh, sm, 0, 0);
  return now > shiftStart;
};

// Kiểm tra về sớm (copy logic desktop)
const checkIfEarlyLeave = (checkOutISO, shift) => {
  if (!shift?.end_time) return false;
  const now = new Date(checkOutISO);
  const [eh, em] = shift.end_time.split(':').map(Number);
  const shiftEnd = new Date(now);
  shiftEnd.setHours(eh, em, 0, 0);
  return now < shiftEnd;
};

export function useMobileAttendance(userId, userName, tenantId) {
  const [todayRecords, setTodayRecords] = useState([]);
  const [monthRecords, setMonthRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState(null);
  const [employeeLoaded, setEmployeeLoaded] = useState(false);
  const [workShift, setWorkShift] = useState(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const vn = getVietnamDate();
    return { year: vn.getFullYear(), month: vn.getMonth() + 1 };
  });

  // Load employee + work shift
  useEffect(() => {
    if (!userName || !tenantId) {
      setEmployeeLoaded(true);
      setLoading(false);
      return;
    }

    const loadEmployeeAndShift = async () => {
      try {
        // Copy ĐÚNG logic desktop: select('*') rồi filter client-side
        // Desktop DataContext: supabase.from('employees').select('*').eq('tenant_id', tenant.id)
        // Desktop HrmAttendanceView: employees.find(e => e.full_name === currentUser.name && e.status === 'active')
        const { data: allEmployees } = await supabase
          .from('employees')
          .select('*')
          .eq('tenant_id', tenantId);

        // Filter client-side giống desktop
        const emp = (allEmployees || []).find(e =>
          e.full_name === userName && e.status === 'active'
        );

        if (emp) {
          setEmployeeId(emp.id);

          // Load work_shifts
          const { data: shifts } = await supabase
            .from('work_shifts')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('start_time');

          if (shifts && shifts.length > 0) {
            const matched = emp.shift_id
              ? shifts.find(s => s.id === emp.shift_id) || shifts[0]
              : shifts[0];
            setWorkShift(matched);
          }
        } else {
          // Không tìm thấy employee → dừng loading
          setLoading(false);
        }
      } catch (err) {
        console.error('Load employee/shift error:', err);
        setLoading(false);
      } finally {
        setEmployeeLoaded(true);
      }
    };

    loadEmployeeAndShift();
  }, [userName, tenantId]);

  // Load today's records từ hrm_attendances
  const loadToday = useCallback(async () => {
    if (!employeeId || !tenantId) return;
    try {
      const { data } = await supabase
        .from('hrm_attendances')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('tenant_id', tenantId)
        .eq('date', getTodayStr())
        .order('shift_number', { ascending: true });
      setTodayRecords(data || []);
    } catch (err) {
      console.error('Load today attendance error:', err);
    }
  }, [employeeId, tenantId]);

  // Load month records từ hrm_attendances
  const loadMonth = useCallback(async (year, month) => {
    if (!employeeId || !tenantId) return;
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

      const { data } = await supabase
        .from('hrm_attendances')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('tenant_id', tenantId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('shift_number', { ascending: true });
      setMonthRecords(data || []);
    } catch (err) {
      console.error('Load month attendance error:', err);
    }
  }, [employeeId, tenantId]);

  // Initial load khi có employeeId
  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    Promise.all([
      loadToday(),
      loadMonth(viewMonth.year, viewMonth.month)
    ]).finally(() => setLoading(false));
  }, [employeeId, loadToday, loadMonth, viewMonth.year, viewMonth.month]);

  // Current shift (open, chưa check-out)
  const currentShift = useMemo(() => {
    return todayRecords.find(r => r.check_in && !r.check_out) || null;
  }, [todayRecords]);

  // Total hours today
  const totalHoursToday = useMemo(() => {
    return todayRecords.reduce((sum, r) => sum + calculateHours(r.check_in, r.check_out), 0);
  }, [todayRecords]);

  // Check-in: ĐÚNG logic desktop
  const checkIn = useCallback(async () => {
    if (!employeeId || !tenantId) throw new Error('Chưa có hồ sơ nhân viên');

    // Server-side check: có ca mở chưa check-out không?
    const { data: openShifts } = await supabase
      .from('hrm_attendances')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('tenant_id', tenantId)
      .eq('date', getTodayStr())
      .is('check_out', null)
      .not('check_in', 'is', null)
      .limit(1);

    if (openShifts && openShifts.length > 0) {
      await loadToday();
      throw new Error('Bạn đang có ca chưa check-out!');
    }

    const nowISO = getNowISOVN();
    const shiftNum = todayRecords.length + 1;
    const isLate = shiftNum === 1 ? checkIfLate(nowISO, workShift) : false;

    const { data, error } = await supabase
      .from('hrm_attendances')
      .insert({
        tenant_id: tenantId,
        employee_id: employeeId,
        date: getTodayStr(),
        shift_number: shiftNum,
        check_in: nowISO,
        check_in_method: 'manual',
        status: isLate ? 'late' : 'present'
      })
      .select()
      .single();

    if (error) throw error;
    setTodayRecords(prev => [...prev, data]);
    return { ...data, _isLate: isLate, _extractedTime: extractTime(data.check_in) };
  }, [employeeId, tenantId, todayRecords.length, workShift, loadToday]);

  // Check-out: ĐÚNG logic desktop
  const checkOut = useCallback(async () => {
    // Tìm ca mở từ DB
    const { data: openShifts } = await supabase
      .from('hrm_attendances')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('tenant_id', tenantId)
      .eq('date', getTodayStr())
      .is('check_out', null)
      .not('check_in', 'is', null)
      .order('shift_number', { ascending: false })
      .limit(1);

    const shift = openShifts?.[0] || currentShift;
    if (!shift) {
      await loadToday();
      throw new Error('Bạn chưa check-in!');
    }

    const nowISO = getNowISOVN();
    const isEarly = shift.shift_number === 1 ? checkIfEarlyLeave(nowISO, workShift) : false;

    const updateData = {
      check_out: nowISO,
      check_out_method: 'manual'
    };

    // KHÔNG override 'late' bằng 'early_leave'
    if (isEarly && shift.status !== 'late') {
      updateData.status = 'early_leave';
    }

    const { data, error } = await supabase
      .from('hrm_attendances')
      .update(updateData)
      .eq('id', shift.id)
      .select()
      .single();

    if (error) {
      await loadToday();
      throw new Error('Lỗi check-out: ' + error.message);
    }

    setTodayRecords(prev => prev.map(r => r.id === shift.id ? data : r));
    const hours = calculateHours(data.check_in, data.check_out);
    return { ...data, _hours: hours, _isEarly: isEarly };
  }, [employeeId, tenantId, currentShift, workShift, loadToday]);

  // Month summary: đếm theo status
  const monthSummary = useMemo(() => {
    const stats = {
      workDays: 0,
      lateDays: 0,
      earlyDays: 0,
      absentDays: 0,
      leaveDays: 0,
      totalHours: 0,
      overtimeHours: 0,
    };

    // Gom theo ngày để đếm workDays
    const dayMap = {};
    monthRecords.forEach(r => {
      if (!dayMap[r.date]) dayMap[r.date] = [];
      dayMap[r.date].push(r);

      // Tính giờ
      const hours = calculateHours(r.check_in, r.check_out);
      stats.totalHours += hours;
      stats.overtimeHours += parseFloat(r.overtime_hours || 0);

      // Đếm status (chỉ shift_number 1 hoặc ca đầu)
      if (r.shift_number === 1 || !r.shift_number) {
        if (r.status === 'late') stats.lateDays++;
        if (r.status === 'early_leave') stats.earlyDays++;
        if (r.status === 'absent') stats.absentDays++;
        if (r.status === 'annual_leave' || r.status === 'sick') stats.leaveDays++;
      }
    });

    // workDays = số ngày có present/late/early_leave
    Object.values(dayMap).forEach(records => {
      const primary = records.find(r => r.shift_number === 1 || !r.shift_number);
      if (primary) {
        const s = primary.status;
        if (s === 'half_day') {
          stats.workDays += 0.5;
        } else if (['present', 'late', 'early_leave'].includes(s)) {
          stats.workDays += 1;
        }
      }
    });

    stats.totalHours = parseFloat(stats.totalHours.toFixed(1));
    stats.overtimeHours = parseFloat(stats.overtimeHours.toFixed(1));

    return stats;
  }, [monthRecords]);

  // Change month
  const changeMonth = useCallback((year, month) => {
    setViewMonth({ year, month });
  }, []);

  return {
    todayRecords,
    currentShift,
    totalHoursToday,
    monthRecords,
    monthSummary,
    viewMonth,
    loading: loading || !employeeLoaded,
    employeeId,
    employeeLoaded,
    workShift,
    checkIn,
    checkOut,
    changeMonth,
    extractTime,
    calculateHours,
    refresh: () => { loadToday(); loadMonth(viewMonth.year, viewMonth.month); }
  };
}

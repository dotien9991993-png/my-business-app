import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';

// VN timezone helpers
const getVNDate = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));

const getTodayStr = () => {
  const vn = getVNDate();
  return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}-${String(vn.getDate()).padStart(2, '0')}`;
};

const getVNTimeStr = () => {
  const vn = getVNDate();
  return `${String(vn.getHours()).padStart(2, '0')}:${String(vn.getMinutes()).padStart(2, '0')}:${String(vn.getSeconds()).padStart(2, '0')}`;
};

export function useMobileAttendance(userId, userName, tenantId) {
  const [todayRecords, setTodayRecords] = useState([]);
  const [monthRecords, setMonthRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => {
    const vn = getVNDate();
    return { year: vn.getFullYear(), month: vn.getMonth() + 1 };
  });

  // Load today's records
  const loadToday = useCallback(async () => {
    if (!userId || !tenantId) return;
    try {
      const { data } = await supabase
        .from('attendances')
        .select('*')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .eq('date', getTodayStr())
        .order('created_at', { ascending: true });
      setTodayRecords(data || []);
    } catch (err) {
      console.error('Load today attendance error:', err);
    }
  }, [userId, tenantId]);

  // Load month records
  const loadMonth = useCallback(async (year, month) => {
    if (!userId || !tenantId) return;
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

      const { data } = await supabase
        .from('attendances')
        .select('*')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });
      setMonthRecords(data || []);
    } catch (err) {
      console.error('Load month attendance error:', err);
    }
  }, [userId, tenantId]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadToday(),
      loadMonth(viewMonth.year, viewMonth.month)
    ]).finally(() => setLoading(false));
  }, [loadToday, loadMonth, viewMonth.year, viewMonth.month]);

  // Current shift (open, not yet checked out)
  const currentShift = useMemo(() => {
    return todayRecords.find(r => r.check_in && !r.check_out) || null;
  }, [todayRecords]);

  // Total hours today
  const totalHoursToday = useMemo(() => {
    return todayRecords.reduce((sum, r) => sum + parseFloat(r.work_hours || 0), 0);
  }, [todayRecords]);

  // Check-in — query DB trước để tránh trùng khi data chưa load
  const checkIn = useCallback(async () => {
    if (!userId || !tenantId) throw new Error('Chưa đăng nhập');

    // Server-side check: có ca mở chưa check-out không?
    const { data: openShifts } = await supabase
      .from('attendances')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('date', getTodayStr())
      .eq('status', 'checked_in')
      .limit(1);

    if (openShifts && openShifts.length > 0) {
      // Reload local state cho đúng
      await loadToday();
      throw new Error('Bạn đang có ca chưa check-out!');
    }

    const checkInTime = getVNTimeStr();
    const { data, error } = await supabase
      .from('attendances')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        user_name: userName,
        date: getTodayStr(),
        check_in: checkInTime,
        status: 'checked_in',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    setTodayRecords(prev => [...prev, data]);
    return data;
  }, [userId, userName, tenantId, loadToday]);

  // Check-out — verify ca mở từ DB trước
  const checkOut = useCallback(async () => {
    // Tìm ca mở từ DB, không dựa vào local state
    const { data: openShifts } = await supabase
      .from('attendances')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('date', getTodayStr())
      .eq('status', 'checked_in')
      .order('created_at', { ascending: false })
      .limit(1);

    const shift = openShifts?.[0] || currentShift;
    if (!shift) {
      await loadToday();
      throw new Error('Bạn chưa check-in!');
    }

    const checkOutTime = getVNTimeStr();
    const [inH, inM] = shift.check_in.split(':').map(Number);
    const [outH, outM] = checkOutTime.split(':').map(Number);
    const workHours = ((outH * 60 + outM) - (inH * 60 + inM)) / 60;

    const { data, error } = await supabase
      .from('attendances')
      .update({
        check_out: checkOutTime,
        work_hours: parseFloat(Math.max(0, workHours).toFixed(2)),
        status: 'checked_out'
      })
      .eq('id', shift.id)
      .eq('status', 'checked_in') // guard: chỉ update nếu vẫn đang checked_in
      .select()
      .single();

    if (error) {
      await loadToday();
      throw new Error('Ca này đã được check-out rồi!');
    }
    setTodayRecords(prev => prev.map(r => r.id === shift.id ? data : r));
    return data;
  }, [userId, tenantId, currentShift, loadToday]);

  // Month summary
  const monthSummary = useMemo(() => {
    const days = {};
    monthRecords.forEach(r => {
      if (!days[r.date]) days[r.date] = { hours: 0, shifts: 0 };
      days[r.date].hours += parseFloat(r.work_hours || 0);
      days[r.date].shifts++;
    });

    const totalDays = Object.keys(days).length;
    const totalHours = Object.values(days).reduce((sum, d) => sum + d.hours, 0);
    return { totalDays, totalHours: parseFloat(totalHours.toFixed(1)), records: monthRecords };
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
    loading,
    checkIn,
    checkOut,
    changeMonth,
    refresh: () => { loadToday(); loadMonth(viewMonth.year, viewMonth.month); }
  };
}

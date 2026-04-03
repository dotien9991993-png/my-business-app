import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';

// Giống desktop HrmLeaveRequestsView helpers
const generateLeaveCode = () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `DP-${y}${m}${d}-${rand}`;
};

const calcDays = (startDate, endDate, isHalfDay = false) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + 'T00:00:00+07:00');
  const end = new Date(endDate + 'T00:00:00+07:00');
  if (end < start) return 0;
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return isHalfDay ? diffDays - 0.5 : diffDays;
};

export { calcDays };

export function useMobileLeave(userId, userName, tenantId, userEmail) {
  const [allRequests, setAllRequests] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [permLevel, setPermLevel] = useState(1);

  // Load permission — giống desktop
  useEffect(() => {
    if (!userId || !tenantId) return;
    (async () => {
      const { data: user } = await supabase.from('users').select('role').eq('id', userId).single();
      if (user?.role === 'Admin' || user?.role === 'admin' || user?.role === 'Manager') {
        setPermLevel(3);
        return;
      }
      const { data: perm } = await supabase.from('user_permissions').select('permission_level')
        .eq('user_id', userId).eq('module', 'hrm').single();
      setPermLevel(perm?.permission_level || 1);
    })();
  }, [userId, tenantId]);

  // Load data — giống desktop DataContext
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [reqRes, balRes, empRes] = await Promise.all([
        supabase.from('leave_requests').select('*').eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }).limit(500),
        supabase.from('leave_balances').select('*').eq('tenant_id', tenantId),
        supabase.from('employees').select('id, user_id, full_name, email, position, department, employee_code, status')
          .eq('tenant_id', tenantId).eq('status', 'active'),
      ]);
      setAllRequests(reqRes.data || []);
      setLeaveBalances(balRes.data || []);
      setEmployees(empRes.data || []);
    } catch (err) {
      console.error('Error loading leave data:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime
  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase.channel(`mobile-leave-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests', filter: `tenant_id=eq.${tenantId}` },
        () => loadData())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantId, loadData]);

  // Find current employee — giống desktop: match by user_id OR email
  const currentEmployee = useMemo(() => {
    if (!userId || employees.length === 0) return null;
    return employees.find(e => e.user_id === userId) ||
           (userEmail ? employees.find(e => e.email === userEmail) : null);
  }, [employees, userId, userEmail]);

  // Filtered requests — giống desktop
  const getFilteredRequests = useCallback((filters = {}) => {
    let list = allRequests;
    if (permLevel <= 1 && currentEmployee) {
      list = list.filter(r => r.employee_id === currentEmployee.id);
    }
    if (filters.type && filters.type !== 'all') list = list.filter(r => r.type === filters.type);
    if (filters.status && filters.status !== 'all') list = list.filter(r => r.status === filters.status);
    if (filters.month) list = list.filter(r => r.created_at?.substring(0, 7) === filters.month);
    return list;
  }, [allRequests, permLevel, currentEmployee]);

  // Create — giống desktop handleCreateRequest
  const createRequest = useCallback(async (data) => {
    const code = generateLeaveCode();
    const days = calcDays(data.startDate, data.endDate, data.isHalfDay);
    if (days <= 0) throw new Error('Số ngày nghỉ không hợp lệ');

    const { data: insertedLeave, error } = await supabase.from('leave_requests').insert({
      tenant_id: tenantId,
      code,
      employee_id: data.employeeId,
      type: data.type,
      start_date: data.startDate,
      end_date: data.endDate,
      days,
      reason: data.reason.trim(),
      status: 'pending',
      created_at: new Date().toISOString(),
    }).select('id').single();
    if (error) throw error;

    // Notify admins — giống desktop
    try {
      const emp = employees.find(e => e.id === data.employeeId);
      const { data: admins } = await supabase.from('users').select('id').eq('tenant_id', tenantId)
        .in('role', ['Admin', 'admin', 'Manager']).neq('id', userId);
      if (admins?.length > 0) {
        await supabase.from('notifications').insert(admins.map(u => ({
          tenant_id: tenantId, user_id: u.id, type: 'leave_request_new',
          title: '📝 Đơn nghỉ phép mới',
          message: `${emp?.full_name || userName} xin nghỉ ${data.typeName} từ ${data.startDate} đến ${data.endDate} (${days} ngày)`,
          icon: '📝', reference_type: 'leave_request', reference_id: insertedLeave?.id || null,
          created_by: userId, is_read: false,
        })));
      }
    } catch (_e) { /* non-critical */ }

    await loadData();
  }, [tenantId, userId, userName, employees, loadData]);

  // Approve — giống desktop handleApprove
  const approveRequest = useCallback(async (request) => {
    const { error } = await supabase.from('leave_requests').update({
      status: 'approved', approved_by: userId, approved_at: new Date().toISOString(),
    }).eq('id', request.id).eq('tenant_id', tenantId);
    if (error) throw error;

    // Upsert attendance — giống desktop
    const attStatus = request.type === 'sick_leave' ? 'sick' : 'annual_leave';
    const startD = new Date(request.start_date + 'T00:00:00+07:00');
    const endD = new Date(request.end_date + 'T00:00:00+07:00');
    const inserts = [];
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      inserts.push({
        tenant_id: tenantId, employee_id: request.employee_id,
        date: d.toISOString().slice(0, 10), status: attStatus,
        note: `Đơn ${request.code}`, created_at: new Date().toISOString(),
      });
    }
    if (inserts.length > 0) {
      await supabase.from('hrm_attendances').upsert(inserts, { onConflict: 'employee_id,date' });
    }

    // Notify employee
    try {
      const emp = employees.find(e => e.id === request.employee_id);
      if (emp?.user_id && emp.user_id !== userId) {
        await supabase.from('notifications').insert([{
          tenant_id: tenantId, user_id: emp.user_id, type: 'leave_request_approved',
          title: '✅ Đơn nghỉ phép đã duyệt',
          message: `Đơn nghỉ từ ${request.start_date} đến ${request.end_date} đã được duyệt`,
          icon: '✅', reference_type: 'leave_request', reference_id: request.id,
          created_by: userId, is_read: false,
        }]);
      }
    } catch (_e) { /* non-critical */ }

    await loadData();
  }, [tenantId, userId, employees, loadData]);

  // Reject — giống desktop handleConfirmReject
  const rejectRequest = useCallback(async (request, reason) => {
    const { error } = await supabase.from('leave_requests').update({
      status: 'rejected', reject_reason: reason.trim(),
      approved_by: userId, approved_at: new Date().toISOString(),
    }).eq('id', request.id).eq('tenant_id', tenantId);
    if (error) throw error;

    try {
      const emp = employees.find(e => e.id === request.employee_id);
      if (emp?.user_id && emp.user_id !== userId) {
        await supabase.from('notifications').insert([{
          tenant_id: tenantId, user_id: emp.user_id, type: 'leave_request_rejected',
          title: '❌ Đơn nghỉ phép bị từ chối',
          message: `Đơn nghỉ từ ${request.start_date} đến ${request.end_date} bị từ chối. Lý do: ${reason.trim()}`,
          icon: '❌', reference_type: 'leave_request', reference_id: request.id,
          created_by: userId, is_read: false,
        }]);
      }
    } catch (_e2) { /* non-critical */ }

    await loadData();
  }, [tenantId, userId, employees, loadData]);

  // Cancel — giống desktop handleCancel
  const cancelRequest = useCallback(async (request) => {
    const { error } = await supabase.from('leave_requests').update({ status: 'cancelled' })
      .eq('id', request.id).eq('tenant_id', tenantId);
    if (error) throw error;
    await loadData();
  }, [tenantId, loadData]);

  return {
    allRequests, leaveBalances, employees, currentEmployee,
    loading, permLevel, getFilteredRequests,
    createRequest, approveRequest, rejectRequest, cancelRequest,
    refresh: loadData,
  };
}

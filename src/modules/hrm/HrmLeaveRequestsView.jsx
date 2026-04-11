import React, { useState, useMemo, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { LEAVE_TYPES, LEAVE_REQUEST_STATUSES } from '../../constants/hrmConstants';
import { getTodayVN, getVietnamDate, getNowISOVN } from '../../utils/dateUtils';
import { isAdmin } from '../../utils/permissionUtils';
import { logActivity } from '../../lib/activityLog';

// ============ HELPERS ============

// Tạo mã đơn: DP-YYYYMMDD-XXX
const generateLeaveCode = () => {
  const vn = getVietnamDate();
  const dateStr = vn.getFullYear().toString() +
    String(vn.getMonth() + 1).padStart(2, '0') +
    String(vn.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `DP-${dateStr}-${rand}`;
};

// Tính số ngày nghỉ (hỗ trợ 0.5 cho nửa ngày)
const calcDays = (startDate, endDate, isHalfDay = false) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + 'T00:00:00+07:00');
  const end = new Date(endDate + 'T00:00:00+07:00');
  if (end < start) return 0;
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return isHalfDay ? diffDays - 0.5 : diffDays;
};

// Format ngày cho hiển thị
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

// Lấy tháng hiện tại dạng YYYY-MM
const getCurrentMonth = () => {
  const vn = getVietnamDate();
  return vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0');
};

// Màu badge trạng thái
const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'pending': return 'bg-yellow-100 text-yellow-800 border border-yellow-300';
    case 'approved': return 'bg-green-100 text-green-800 border border-green-300';
    case 'rejected': return 'bg-red-100 text-red-800 border border-red-300';
    case 'cancelled': return 'bg-gray-100 text-gray-600 border border-gray-300';
    default: return 'bg-gray-100 text-gray-600';
  }
};

// Màu loại đơn
const getTypeBadgeClass = (type) => {
  const colorMap = {
    annual_leave: 'bg-blue-100 text-blue-700',
    sick_leave: 'bg-red-100 text-red-700',
    unpaid_leave: 'bg-gray-100 text-gray-700',
    overtime: 'bg-orange-100 text-orange-700',
    business_trip: 'bg-purple-100 text-purple-700',
    work_from_home: 'bg-green-100 text-green-700'
  };
  return colorMap[type] || 'bg-gray-100 text-gray-600';
};

// ============ COMPONENT ============

export default function HrmLeaveRequestsView({
  employees,
  leaveRequests,
  leaveBalances,
  loadHrmData,
  tenant,
  currentUser,
  hasPermission,
  getPermissionLevel,
}) {
  // === PERMISSION ===
  const permLevel = getPermissionLevel ? getPermissionLevel('hrm') : 3;
  const canCreateLeave = hasPermission ? hasPermission('hrm', 1) : true; // level 1+ tạo đơn
  // ---- State ----
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());
  const [saving, setSaving] = useState(false);

  // Form state cho tạo đơn
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formType, setFormType] = useState('annual_leave');
  const [formStartDate, setFormStartDate] = useState(getTodayVN());
  const [formEndDate, setFormEndDate] = useState(getTodayVN());
  const [formIsHalfDay, setFormIsHalfDay] = useState(false);
  const [formReason, setFormReason] = useState('');

  // Chi tiết đơn
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Xác nhận từ chối
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const userIsAdmin = isAdmin(currentUser);

  // ---- Danh sách nhân viên active ----
  const activeEmployees = useMemo(() => {
    return (employees || []).filter(e => e.status === 'active');
  }, [employees]);

  // ---- Tìm employee của user hiện tại ----
  const currentEmployee = useMemo(() => {
    if (!currentUser || !employees) return null;
    return employees.find(e =>
      e.user_id === currentUser.id || e.email === currentUser.email
    );
  }, [currentUser, employees]);

  // ---- Stats tháng hiện tại ----
  const stats = useMemo(() => {
    const requests = leaveRequests || [];
    const monthRequests = requests.filter(r => {
      if (!r.created_at) return false;
      const created = r.created_at.substring(0, 7); // YYYY-MM
      return created === filterMonth;
    });
    return {
      total: monthRequests.length,
      pending: monthRequests.filter(r => r.status === 'pending').length,
      approved: monthRequests.filter(r => r.status === 'approved').length,
      rejected: monthRequests.filter(r => r.status === 'rejected').length
    };
  }, [leaveRequests, filterMonth]);

  // ---- Lọc danh sách đơn ----
  const filteredRequests = useMemo(() => {
    let list = leaveRequests || [];

    // Permission: level 1 chỉ xem đơn của mình, level 2+ xem tất cả
    if (permLevel <= 1 && currentEmployee) {
      list = list.filter(r => r.employee_id === currentEmployee.id);
    }

    // Lọc theo tháng
    if (filterMonth) {
      list = list.filter(r => {
        if (!r.created_at) return false;
        return r.created_at.substring(0, 7) === filterMonth;
      });
    }

    // Lọc theo loại
    if (filterType !== 'all') {
      list = list.filter(r => r.type === filterType);
    }

    // Lọc theo trạng thái
    if (filterStatus !== 'all') {
      list = list.filter(r => r.status === filterStatus);
    }

    // Tìm kiếm theo tên nhân viên
    if (searchText.trim()) {
      const search = searchText.trim().toLowerCase();
      list = list.filter(r => {
        const emp = (employees || []).find(e => e.id === r.employee_id);
        const empName = emp?.full_name || '';
        return empName.toLowerCase().includes(search) ||
          (r.code || '').toLowerCase().includes(search);
      });
    }

    // Sắp xếp: mới nhất trước
    list = [...list].sort((a, b) => {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    return list;
  }, [leaveRequests, filterMonth, filterType, filterStatus, searchText, employees, permLevel, currentEmployee]);

  // ---- Tìm tên nhân viên theo ID ----
  const getEmployeeName = useCallback((employeeId) => {
    const emp = (employees || []).find(e => e.id === employeeId);
    return emp?.full_name || 'Không rõ';
  }, [employees]);

  // ---- Số ngày dự kiến trong form ----
  const formDays = useMemo(() => {
    return calcDays(formStartDate, formEndDate, formIsHalfDay);
  }, [formStartDate, formEndDate, formIsHalfDay]);

  // ---- Mở modal tạo đơn ----
  const handleOpenCreate = () => {
    // Tự động chọn employee của user hiện tại nếu có
    setFormEmployeeId(currentEmployee?.id || '');
    setFormType('annual_leave');
    setFormStartDate(getTodayVN());
    setFormEndDate(getTodayVN());
    setFormIsHalfDay(false);
    setFormReason('');
    setShowCreateModal(true);
  };

  // ---- Tạo đơn nghỉ phép ----
  const handleCreateRequest = async () => {
    if (!formEmployeeId) {
      alert('Vui lòng chọn nhân viên');
      return;
    }
    if (!formStartDate || !formEndDate) {
      alert('Vui lòng chọn ngày bắt đầu và kết thúc');
      return;
    }
    if (new Date(formEndDate) < new Date(formStartDate)) {
      alert('Ngày kết thúc phải sau ngày bắt đầu');
      return;
    }
    if (!formReason.trim()) {
      alert('Vui lòng nhập lý do');
      return;
    }

    const days = calcDays(formStartDate, formEndDate, formIsHalfDay);
    if (days <= 0) {
      alert('Số ngày nghỉ không hợp lệ');
      return;
    }

    setSaving(true);
    try {
      const code = generateLeaveCode();
      const { data: insertedLeave, error } = await supabase.from('leave_requests').insert({
        tenant_id: tenant.id,
        code,
        employee_id: formEmployeeId,
        type: formType,
        start_date: formStartDate,
        end_date: formEndDate,
        days,
        reason: formReason.trim(),
        status: 'pending',
        created_at: getNowISOVN()
      }).select('id').single();

      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'create', entityType: 'leave_request',
        entityName: code,
        description: `Tạo đơn nghỉ phép ${code}: ${LEAVE_TYPES[formType]?.label || formType}, ${days} ngày`
      });

      // Notification: leave_request_new → admin/manager
      try {
        const empName = employees.find(e => e.id === formEmployeeId)?.full_name || currentUser?.name;
        const typeName = LEAVE_TYPES[formType]?.label || formType;
        const { data: admins } = await supabase.from('users').select('id').eq('tenant_id', tenant.id)
          .in('role', ['Admin', 'admin', 'Manager']).neq('id', currentUser?.id);
        if (admins?.length > 0) {
          await supabase.from('notifications').insert(admins.map(u => ({
            tenant_id: tenant.id, user_id: u.id, type: 'leave_request_new',
            title: '📝 Đơn nghỉ phép mới',
            message: `${empName} xin nghỉ ${typeName} từ ${formStartDate} đến ${formEndDate} (${days} ngày)`,
            icon: '📝', reference_type: 'leave_request', reference_id: insertedLeave?.id || null,
            created_by: currentUser?.id, is_read: false,
          })));
        }
      } catch (_e) { /* non-critical */ }

      setShowCreateModal(false);
      if (loadHrmData) await loadHrmData();
      alert('Tạo đơn nghỉ phép thành công!');
    } catch (err) {
      console.error('Lỗi tạo đơn nghỉ phép:', err);
      alert('Lỗi tạo đơn: ' + (err.message || 'Không xác định'));
    } finally {
      setSaving(false);
    }
  };

  // ---- Duyệt đơn ----
  const handleApprove = async (request) => {
    if (!userIsAdmin && permLevel < 2) {
      alert('Bạn không có quyền duyệt đơn');
      return;
    }

    const empName = getEmployeeName(request.employee_id);
    const typeName = LEAVE_TYPES[request.type]?.label || request.type;

    // Check leave balance cho nghỉ phép năm
    if (request.type === 'annual_leave') {
      const balance = (leaveBalances || []).find(b =>
        b.employee_id === request.employee_id && b.year === new Date().getFullYear()
      );
      if (balance) {
        const remaining = (balance.total_days || 0) - (balance.used_days || 0);
        const requestDays = parseFloat(request.days || 0);
        if (remaining < requestDays) {
          if (!confirm(`⚠️ ${empName} chỉ còn ${remaining} ngày phép nhưng xin ${requestDays} ngày.\nBạn vẫn muốn duyệt?`)) {
            return;
          }
        }
      }
    }

    if (!confirm(`Duyệt đơn ${typeName} của ${empName}?\nTừ ${formatDate(request.start_date)} đến ${formatDate(request.end_date)} (${request.days} ngày)`)) {
      return;
    }

    setSaving(true);
    try {
      // Cập nhật trạng thái đơn
      const { error: updateError } = await supabase
        .from('leave_requests')
        .update({
          status: 'approved',
          approved_by: currentUser?.id,
          approved_at: getNowISOVN()
        })
        .eq('id', request.id)
        .eq('tenant_id', tenant.id);

      if (updateError) throw updateError;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'approve', entityType: 'leave_request',
        entityId: request.id, entityName: request.code,
        description: `Duyệt đơn nghỉ phép ${request.code} của ${empName}`
      });

      // Notification: leave_request_approved → employee
      try {
        if (request.employee_id && request.employee_id !== currentUser?.id) {
          // Find user_id for this employee
          const emp = employees.find(e => e.id === request.employee_id);
          const targetUserId = emp?.user_id || request.employee_id;
          await supabase.from('notifications').insert([{
            tenant_id: tenant.id, user_id: targetUserId, type: 'leave_request_approved',
            title: '✅ Đơn nghỉ phép đã duyệt',
            message: `Đơn nghỉ ${typeName} từ ${formatDate(request.start_date)} đến ${formatDate(request.end_date)} đã được duyệt`,
            icon: '✅', reference_type: 'leave_request', reference_id: request.id,
            created_by: currentUser?.id, is_read: false,
          }]);
        }
      } catch (_) { /* non-critical */ }

      // Cập nhật chấm công cho những ngày nghỉ
      const attendanceStatus = request.type === 'sick_leave' ? 'sick' : 'annual_leave';
      const startD = new Date(request.start_date + 'T00:00:00+07:00');
      const endD = new Date(request.end_date + 'T00:00:00+07:00');
      const attendanceInserts = [];

      for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        const dateStr = d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0');
        attendanceInserts.push({
          tenant_id: tenant.id,
          employee_id: request.employee_id,
          date: dateStr,
          status: attendanceStatus,
          note: `Đơn ${request.code}: ${LEAVE_TYPES[request.type]?.label || request.type}`,
          created_at: getNowISOVN()
        });
      }

      if (attendanceInserts.length > 0) {
        const { error: attError } = await supabase
          .from('hrm_attendances')
          .upsert(attendanceInserts, {
            onConflict: 'employee_id,date'
          });
        if (attError) console.error('Lỗi cập nhật chấm công:', attError);
      }

      // Auto-update leave balance cho nghỉ phép năm
      if (request.type === 'annual_leave') {
        try {
          const currentYear = new Date().getFullYear();
          const { data: bal } = await supabase.from('leave_balances')
            .select('id, used_days').eq('employee_id', request.employee_id).eq('year', currentYear)
            .eq('tenant_id', tenant.id).single();
          if (bal) {
            await supabase.from('leave_balances').update({
              used_days: (bal.used_days || 0) + parseFloat(request.days || 0),
            }).eq('id', bal.id);
          }
        } catch (_) { /* non-critical */ }
      }

      if (loadHrmData) await loadHrmData();
      alert('Đã duyệt đơn thành công!');
    } catch (err) {
      console.error('Lỗi duyệt đơn:', err);
      alert('Lỗi duyệt đơn: ' + (err.message || 'Không xác định'));
    } finally {
      setSaving(false);
    }
  };

  // ---- Mở modal từ chối ----
  const handleOpenReject = (request) => {
    if (!userIsAdmin && permLevel < 2) {
      alert('Bạn không có quyền từ chối đơn');
      return;
    }
    setRejectingRequest(request);
    setRejectReason('');
    setShowRejectModal(true);
  };

  // ---- Xác nhận từ chối ----
  const handleConfirmReject = async () => {
    if (!rejectingRequest) return;
    if (!rejectReason.trim()) {
      alert('Vui lòng nhập lý do từ chối');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'rejected',
          reject_reason: rejectReason.trim(),
          approved_by: currentUser?.id,
          approved_at: getNowISOVN()
        })
        .eq('id', rejectingRequest.id)
        .eq('tenant_id', tenant.id);

      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'reject', entityType: 'leave_request',
        entityId: rejectingRequest.id, entityName: rejectingRequest.code,
        description: `Từ chối đơn nghỉ phép ${rejectingRequest.code}: ${rejectReason.trim()}`
      });

      // Notification: leave_request_rejected → employee
      try {
        if (rejectingRequest.employee_id && rejectingRequest.employee_id !== currentUser?.id) {
          const emp = employees.find(e => e.id === rejectingRequest.employee_id);
          const targetUserId = emp?.user_id || rejectingRequest.employee_id;
          const typeName = LEAVE_TYPES[rejectingRequest.type]?.label || rejectingRequest.type;
          await supabase.from('notifications').insert([{
            tenant_id: tenant.id, user_id: targetUserId, type: 'leave_request_rejected',
            title: '❌ Đơn nghỉ phép bị từ chối',
            message: `Đơn nghỉ ${typeName} từ ${formatDate(rejectingRequest.start_date)} đến ${formatDate(rejectingRequest.end_date)} bị từ chối. Lý do: ${rejectReason.trim()}`,
            icon: '❌', reference_type: 'leave_request', reference_id: rejectingRequest.id,
            created_by: currentUser?.id, is_read: false,
          }]);
        }
      } catch (_) { /* non-critical */ }

      setShowRejectModal(false);
      setRejectingRequest(null);
      setRejectReason('');
      if (loadHrmData) await loadHrmData();
      alert('Đã từ chối đơn!');
    } catch (err) {
      console.error('Lỗi từ chối đơn:', err);
      alert('Lỗi từ chối đơn: ' + (err.message || 'Không xác định'));
    } finally {
      setSaving(false);
    }
  };

  // ---- Hủy đơn (chủ đơn) ----
  const handleCancel = async (request) => {
    const empName = getEmployeeName(request.employee_id);
    if (!confirm(`Hủy đơn ${request.code} của ${empName}?`)) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'cancelled' })
        .eq('id', request.id)
        .eq('tenant_id', tenant.id);

      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'cancel', entityType: 'leave_request',
        entityId: request.id, entityName: request.code,
        description: `Hủy đơn nghỉ phép ${request.code}`
      });

      // Notification: leave_request_cancelled → admin/manager
      try {
        const typeName = LEAVE_TYPES[request.type]?.label || request.type;
        const { data: admins } = await supabase.from('users').select('id').eq('tenant_id', tenant.id)
          .in('role', ['Admin', 'admin', 'Manager']).neq('id', currentUser?.id);
        if (admins?.length > 0) {
          await supabase.from('notifications').insert(admins.map(u => ({
            tenant_id: tenant.id, user_id: u.id, type: 'leave_request_cancelled',
            title: '🗑️ Đơn nghỉ đã bị hủy',
            message: `${empName} đã hủy đơn ${typeName} từ ${formatDate(request.start_date)} đến ${formatDate(request.end_date)}`,
            icon: '🗑️', reference_type: 'leave_request', reference_id: request.id,
            created_by: currentUser?.id, is_read: false,
          })));
        }
      } catch (_e) { /* non-critical */ }

      if (loadHrmData) await loadHrmData();
      alert('Đã hủy đơn!');
    } catch (err) {
      console.error('Lỗi hủy đơn:', err);
      alert('Lỗi: ' + (err.message || 'Không xác định'));
    } finally {
      setSaving(false);
    }
  };

  // ============ RENDER ============
  return (
    <div className="space-y-4">
      {/* ---- Header ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Quản lý đơn từ</h2>
          <p className="text-sm text-gray-500 mt-0.5">Nghỉ phép, tăng ca, công tác, WFH</p>
        </div>
        <div className="flex gap-2">
          {canCreateLeave && (
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
            >
              + Tạo đơn mới
            </button>
          )}
        </div>
      </div>

      {/* ---- Stats cards ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Tổng đơn tháng này</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 shadow-sm">
          <p className="text-xs text-yellow-700 font-medium">Chờ duyệt</p>
          <p className="text-2xl font-bold text-yellow-700 mt-1">{stats.pending}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4 shadow-sm">
          <p className="text-xs text-green-700 font-medium">Đã duyệt</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{stats.approved}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 shadow-sm">
          <p className="text-xs text-red-700 font-medium">Từ chối</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{stats.rejected}</p>
        </div>
      </div>

      {/* ---- Bộ lọc ---- */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Tìm kiếm */}
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Tìm kiếm</label>
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Tên nhân viên, mã đơn..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
          </div>

          {/* Loại đơn */}
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Loại đơn</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white"
            >
              <option value="all">Tất cả loại</option>
              {Object.entries(LEAVE_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.icon} {val.label}</option>
              ))}
            </select>
          </div>

          {/* Trạng thái */}
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Trạng thái</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white"
            >
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(LEAVE_REQUEST_STATUSES).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          {/* Tháng */}
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Tháng</label>
            <input
              type="month"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* ---- Bảng danh sách đơn ---- */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 text-sm">
            Danh sách đơn ({filteredRequests.length})
          </h3>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="text-left px-4 py-3 font-medium">Mã đơn</th>
                <th className="text-left px-4 py-3 font-medium">Nhân viên</th>
                <th className="text-left px-4 py-3 font-medium">Loại</th>
                <th className="text-center px-4 py-3 font-medium">Từ ngày</th>
                <th className="text-center px-4 py-3 font-medium">Đến ngày</th>
                <th className="text-center px-4 py-3 font-medium">Số ngày</th>
                <th className="text-left px-4 py-3 font-medium">Lý do</th>
                <th className="text-center px-4 py-3 font-medium">Trạng thái</th>
                <th className="text-center px-4 py-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(req => {
                const typeInfo = LEAVE_TYPES[req.type] || { label: req.type, icon: '' };
                const statusInfo = LEAVE_REQUEST_STATUSES[req.status] || { label: req.status };
                const isOwner = currentEmployee && req.employee_id === currentEmployee.id;
                const canApprove = (userIsAdmin || permLevel >= 2) && req.status === 'pending';
                const canCancel = (isOwner || userIsAdmin) && req.status === 'pending';

                return (
                  <tr key={req.id} className={`border-t hover:bg-gray-50 transition cursor-pointer ${req.status === 'pending' ? 'bg-yellow-50/60' : ''}`} onClick={() => setSelectedRequest(req)}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {req.code || '-'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {getEmployeeName(req.employee_id)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getTypeBadgeClass(req.type)}`}>
                        {typeInfo.icon} {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {formatDate(req.start_date)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {formatDate(req.end_date)}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-700">
                      {req.days || 0}
                      {req.days % 1 !== 0 && <span className="text-xs text-gray-400 ml-0.5">(nửa ngày)</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={req.reason}>
                      {req.reason || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(req.status)}`}>
                        {statusInfo.label}
                      </span>
                      {req.status === 'rejected' && req.reject_reason && (
                        <p className="text-xs text-red-500 mt-1 max-w-[150px] truncate" title={req.reject_reason}>
                          Lý do: {req.reject_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {canApprove && (
                          <>
                            <button
                              onClick={() => handleApprove(req)}
                              disabled={saving}
                              className="px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition font-medium"
                            >
                              Duyệt
                            </button>
                            <button
                              onClick={() => handleOpenReject(req)}
                              disabled={saving}
                              className="px-2.5 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition font-medium"
                            >
                              Từ chối
                            </button>
                          </>
                        )}
                        {canCancel && (
                          <button
                            onClick={() => handleCancel(req)}
                            disabled={saving}
                            className="px-2.5 py-1 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition"
                          >
                            Hủy
                          </button>
                        )}
                        {!canApprove && !canCancel && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedRequest(req); }}
                            className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
                          >
                            Xem
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm">Không có đơn từ nào</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y">
          {filteredRequests.map(req => {
            const typeInfo = LEAVE_TYPES[req.type] || { label: req.type, icon: '' };
            const statusInfo = LEAVE_REQUEST_STATUSES[req.status] || { label: req.status };
            const isOwner = currentEmployee && req.employee_id === currentEmployee.id;
            const canApprove = (userIsAdmin || permLevel >= 2) && req.status === 'pending';
            const canCancel = (isOwner || userIsAdmin) && req.status === 'pending';

            return (
              <div key={req.id} className="p-4 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedRequest(req)}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">
                      {getEmployeeName(req.employee_id)}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">{req.code || '-'}</p>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(req.status)}`}>
                    {statusInfo.label}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getTypeBadgeClass(req.type)}`}>
                    {typeInfo.icon} {typeInfo.label}
                  </span>
                  <span className="text-xs text-gray-500">
                    {req.days || 0} ngày
                    {req.days % 1 !== 0 && ' (nửa ngày)'}
                  </span>
                </div>

                <div className="text-xs text-gray-500 mb-1">
                  {formatDate(req.start_date)} - {formatDate(req.end_date)}
                </div>

                {req.reason && (
                  <p className="text-xs text-gray-600 mb-2 line-clamp-2">{req.reason}</p>
                )}

                {req.status === 'rejected' && req.reject_reason && (
                  <p className="text-xs text-red-500 mb-2">Lý do từ chối: {req.reject_reason}</p>
                )}

                {(canApprove || canCancel) && (
                  <div className="flex gap-2 mt-2 pt-2 border-t">
                    {canApprove && (
                      <>
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={saving}
                          className="flex-1 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                        >
                          Duyệt
                        </button>
                        <button
                          onClick={() => handleOpenReject(req)}
                          disabled={saving}
                          className="flex-1 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 font-medium"
                        >
                          Từ chối
                        </button>
                      </>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => handleCancel(req)}
                        disabled={saving}
                        className="flex-1 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                      >
                        Hủy đơn
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredRequests.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <p className="text-sm">Không có đơn từ nào</p>
            </div>
          )}
        </div>
      </div>

      {/* ============ MODAL TẠO ĐƠN ============ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
              <h3 className="text-lg font-bold text-gray-800">Tạo đơn nghỉ phép</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Nhân viên */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nhân viên <span className="text-red-500">*</span>
                </label>
                {permLevel >= 2 || userIsAdmin ? (
                  <select
                    value={formEmployeeId}
                    onChange={e => setFormEmployeeId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white"
                  >
                    <option value="">-- Chọn nhân viên --</option>
                    {activeEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} {emp.employee_code ? `(${emp.employee_code})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full border rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-700">
                    {currentEmployee?.full_name || 'Không tìm thấy hồ sơ'}
                  </div>
                )}
              </div>

              {/* Loại đơn */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Loại đơn <span className="text-red-500">*</span>
                </label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white"
                >
                  {Object.entries(LEAVE_TYPES).map(([key, val]) => (
                    <option key={key} value={key}>{val.icon} {val.label}</option>
                  ))}
                </select>
              </div>

              {/* Ngày bắt đầu & kết thúc */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Từ ngày <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Đến ngày <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={e => setFormEndDate(e.target.value)}
                    min={formStartDate}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  />
                </div>
              </div>

              {/* Nửa ngày & Số ngày */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsHalfDay}
                    onChange={e => setFormIsHalfDay(e.target.checked)}
                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-600">Nghỉ nửa ngày</span>
                </label>
                <div className="text-right">
                  <span className="text-xs text-gray-500">Số ngày: </span>
                  <span className="text-lg font-bold text-green-700">{formDays}</span>
                </div>
              </div>

              {/* Lý do */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lý do <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  rows={3}
                  placeholder="Nhập lý do nghỉ phép..."
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex justify-end gap-2 sticky bottom-0 bg-white rounded-b-2xl">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateRequest}
                disabled={saving}
                className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition font-medium"
              >
                {saving ? 'Đang lưu...' : 'Tạo đơn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MODAL CHI TIẾT ĐƠN ============ */}
      {selectedRequest && (() => {
        const req = selectedRequest;
        const emp = (employees || []).find(e => e.id === req.employee_id);
        const typeInfo = LEAVE_TYPES[req.type] || { label: req.type, icon: '📋' };
        const statusInfo = LEAVE_REQUEST_STATUSES[req.status] || { label: req.status };
        const balance = (leaveBalances || []).find(b => b.employee_id === req.employee_id && b.year === new Date().getFullYear());
        const approver = req.approved_by ? (employees || []).find(e => e.user_id === req.approved_by) : null;
        const _isOwner = currentEmployee && req.employee_id === currentEmployee.id;
        const canAct = (userIsAdmin || permLevel >= 2) && req.status === 'pending';
        const canCancelIt = (_isOwner || userIsAdmin) && req.status === 'pending';

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedRequest(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className={`px-6 py-4 border-b sticky top-0 z-10 rounded-t-2xl ${
                req.status === 'approved' ? 'bg-green-50' : req.status === 'rejected' ? 'bg-red-50' : req.status === 'cancelled' ? 'bg-gray-50' : 'bg-yellow-50'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs text-gray-500">{req.code}</p>
                    <h3 className="text-lg font-bold text-gray-800 mt-0.5">{typeInfo.icon} {typeInfo.label}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getStatusBadgeClass(req.status)}`}>
                      {statusInfo.label}
                    </span>
                    <button onClick={() => setSelectedRequest(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Nhân viên */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Nhân viên</h4>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-sm">
                      {emp?.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{emp?.full_name || 'Không rõ'}</p>
                      <p className="text-xs text-gray-500">{emp?.position || emp?.department || ''} {emp?.department ? `· ${emp.department}` : ''}</p>
                    </div>
                  </div>
                </div>

                {/* Chi tiết đơn */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Chi tiết đơn nghỉ</h4>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Loại đơn</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getTypeBadgeClass(req.type)}`}>
                        {typeInfo.icon} {typeInfo.label}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Từ ngày</span>
                      <span className="font-medium text-gray-800">📅 {formatDate(req.start_date)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Đến ngày</span>
                      <span className="font-medium text-gray-800">📅 {formatDate(req.end_date)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Số ngày</span>
                      <span className="font-bold text-green-700 text-base">
                        {req.days || 0} ngày
                        {req.days % 1 !== 0 && <span className="text-xs text-gray-400 ml-1">(nửa ngày)</span>}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Ngày tạo</span>
                      <span className="text-gray-600">{req.created_at ? new Date(req.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Lý do */}
                {req.reason && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Lý do</h4>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.reason}</p>
                    </div>
                  </div>
                )}

                {/* Thông tin phép năm */}
                {balance && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Phép năm {new Date().getFullYear()}</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                        <p className="text-xs text-blue-600 font-medium">Tổng phép</p>
                        <p className="text-xl font-bold text-blue-700 mt-0.5">{balance.total_days || 0}</p>
                      </div>
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                        <p className="text-xs text-orange-600 font-medium">Đã dùng</p>
                        <p className="text-xl font-bold text-orange-700 mt-0.5">{balance.used_days || 0}</p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                        <p className="text-xs text-green-600 font-medium">Còn lại</p>
                        <p className="text-xl font-bold text-green-700 mt-0.5">{(balance.total_days || 0) - (balance.used_days || 0)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lịch sử duyệt */}
                {(req.status === 'approved' || req.status === 'rejected') && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Lịch sử duyệt</h4>
                    <div className={`rounded-xl p-4 ${req.status === 'approved' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{req.status === 'approved' ? '✅' : '❌'}</span>
                        <span className="font-medium text-sm text-gray-800">
                          {approver?.full_name || 'Admin'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {req.approved_at ? new Date(req.approved_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''}
                      </p>
                      {req.reject_reason && (
                        <div className="mt-2 pt-2 border-t border-red-200">
                          <p className="text-xs font-medium text-red-700">Lý do từ chối:</p>
                          <p className="text-sm text-red-600 mt-0.5">{req.reject_reason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions — duyệt/từ chối */}
              {(canAct || canCancelIt) && (
                <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl sticky bottom-0 flex gap-2">
                  {canCancelIt && (
                    <button onClick={() => { setSelectedRequest(null); handleCancel(req); }} disabled={saving}
                      className="flex-1 py-2.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition font-medium">
                      Hủy đơn
                    </button>
                  )}
                  {canAct && (
                    <>
                      <button onClick={() => { setSelectedRequest(null); handleOpenReject(req); }} disabled={saving}
                        className="flex-1 py-2.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition font-medium">
                        Từ chối
                      </button>
                      <button onClick={() => { setSelectedRequest(null); handleApprove(req); }} disabled={saving}
                        className="flex-1 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition font-medium">
                        Duyệt
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ============ MODAL TỪ CHỐI ============ */}
      {showRejectModal && rejectingRequest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Từ chối đơn</h3>
              <button
                onClick={() => { setShowRejectModal(false); setRejectingRequest(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">
                  <strong>Đơn:</strong> {rejectingRequest.code}
                </p>
                <p className="text-sm text-red-700 mt-1">
                  <strong>Nhân viên:</strong> {getEmployeeName(rejectingRequest.employee_id)}
                </p>
                <p className="text-sm text-red-700 mt-1">
                  <strong>Loại:</strong> {LEAVE_TYPES[rejectingRequest.type]?.label || rejectingRequest.type}
                </p>
                <p className="text-sm text-red-700 mt-1">
                  <strong>Thời gian:</strong> {formatDate(rejectingRequest.start_date)} - {formatDate(rejectingRequest.end_date)} ({rejectingRequest.days} ngày)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lý do từ chối <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Nhập lý do từ chối đơn..."
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
                  autoFocus
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button
                onClick={() => { setShowRejectModal(false); setRejectingRequest(null); }}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Đóng
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={saving || !rejectReason.trim()}
                className="px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition font-medium"
              >
                {saving ? 'Đang lưu...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, GENDERS } from '../../constants/hrmConstants';
import { getNowISOVN, getTodayVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';
import { uploadImage, getThumbnailUrl } from '../../utils/cloudinaryUpload';

const formatMoney = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
};

const formatDateVN = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const formatDateTimeVN = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const STATUS_BADGE_COLORS = {
  active: 'bg-green-100 text-green-700 border-green-200',
  on_leave: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  resigned: 'bg-gray-100 text-gray-600 border-gray-200',
  terminated: 'bg-red-100 text-red-700 border-red-200',
};

const INITIAL_FORM = {
  full_name: '',
  phone: '',
  email: '',
  id_number: '',
  birth_date: '',
  gender: 'male',
  address: '',
  employee_code: '',
  department_id: '',
  position_id: '',
  employment_type: 'full_time',
  start_date: '',
  base_salary: '',
  bank_account: '',
  bank_name: '',
  emergency_contact: '',
  emergency_phone: '',
  note: '',
  avatar_url: '',
};

export default function HrmEmployeesView({
  employees,
  departments,
  positions,
  attendances,
  leaveRequests,
  kpiEvaluations,
  loadHrmData,
  tenant,
  currentUser,
  allUsers,
  canEdit,
  getPermissionLevel,
}) {
  // === PERMISSION ===
  const permLevel = getPermissionLevel ? getPermissionLevel('hrm') : 3;
  const userCanEdit = canEdit ? canEdit('hrm') : true; // level 3
  // --- Tìm kiếm & bộ lọc ---
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterPos, setFilterPos] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // --- Modal state ---
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  // --- Detail modal state ---
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [detailTab, setDetailTab] = useState('info');

  // --- Toast ---
  const [toast, setToast] = useState(null);

  // ========== Debounced search (300ms) ==========
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ========== Toast tự ẩn ==========
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // --- Sync state ---
  const [syncing, setSyncing] = useState(false);
  const autoSyncDone = useRef(false);

  // ========== User map (user_id → user) ==========
  const userMap = useMemo(() => {
    const m = {};
    (allUsers || []).forEach(u => { m[u.id] = u; });
    return m;
  }, [allUsers]);

  // ========== Đồng bộ Users → Employees ==========
  const syncUsersToEmployees = useCallback(async () => {
    if (!tenant || !allUsers?.length) return 0;
    setSyncing(true);
    try {
      const approvedUsers = allUsers.filter(u => u.status === 'approved' || u.is_active);
      const existingUserIds = new Set((employees || []).filter(e => e.user_id).map(e => e.user_id));
      const existingEmails = new Set((employees || []).filter(e => e.email).map(e => e.email?.toLowerCase()));
      const unsyncedUsers = approvedUsers.filter(u =>
        !existingUserIds.has(u.id) && !existingEmails.has(u.email?.toLowerCase())
      );

      if (unsyncedUsers.length === 0) {
        setToast({ type: 'success', msg: 'Tất cả đã đồng bộ - không có user mới' });
        setSyncing(false);
        return 0;
      }

      // Get next employee code number
      const { data: lastEmp } = await supabase
        .from('employees')
        .select('employee_code')
        .eq('tenant_id', tenant.id)
        .like('employee_code', 'NV-%')
        .order('employee_code', { ascending: false })
        .limit(1);

      let nextNum = 1;
      if (lastEmp && lastEmp.length > 0) {
        const match = lastEmp[0].employee_code.match(/NV-(\d+)/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }

      const now = getNowISOVN();
      const inserts = unsyncedUsers.map((u, i) => ({
        user_id: u.id,
        full_name: u.name || u.email,
        email: u.email || null,
        phone: u.phone || null,
        employee_code: 'NV-' + String(nextNum + i).padStart(3, '0'),
        status: 'active',
        start_date: u.created_at ? u.created_at.slice(0, 10) : getTodayVN(),
        tenant_id: tenant.id,
        created_at: now,
      }));

      const { error } = await supabase.from('employees').insert(inserts);
      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'import', entityType: 'employee',
        description: `Đồng bộ ${inserts.length} nhân viên từ Users`
      });

      if (loadHrmData) loadHrmData();
      setToast({ type: 'success', msg: `Đã đồng bộ ${inserts.length} nhân viên từ hệ thống` });
      return inserts.length;
    } catch (err) {
      console.error('Lỗi đồng bộ users:', err);
      setToast({ type: 'error', msg: 'Lỗi đồng bộ: ' + (err.message || 'Không thể đồng bộ') });
      return 0;
    } finally {
      setSyncing(false);
    }
  }, [tenant, allUsers, employees, loadHrmData]);

  // ========== Auto-sync khi danh sách NV rỗng ==========
  useEffect(() => {
    if (autoSyncDone.current) return;
    if ((employees || []).length === 0 && (allUsers || []).length > 0 && tenant) {
      autoSyncDone.current = true;
      syncUsersToEmployees();
    }
  }, [employees, allUsers, tenant, syncUsersToEmployees]);

  // ========== Thống kê ==========
  const stats = useMemo(() => {
    const list = employees || [];
    const active = list.filter(e => e.status === 'active').length;
    const onLeave = list.filter(e => e.status === 'on_leave').length;
    const resigned = list.filter(e => e.status === 'resigned').length;
    const terminated = list.filter(e => e.status === 'terminated').length;
    return {
      total: active + onLeave,
      active,
      onLeave,
      left: resigned + terminated,
    };
  }, [employees]);

  // ========== Lookup maps ==========
  const deptMap = useMemo(() => {
    const m = {};
    (departments || []).forEach(d => { m[d.id] = d.name; });
    return m;
  }, [departments]);

  const posMap = useMemo(() => {
    const m = {};
    (positions || []).forEach(p => { m[p.id] = p.name; });
    return m;
  }, [positions]);

  // ========== Danh sách đã lọc ==========
  const filteredEmployees = useMemo(() => {
    let list = employees || [];
    // Lọc trạng thái
    if (filterStatus !== 'all') {
      list = list.filter(e => e.status === filterStatus);
    }
    // Lọc phòng ban
    if (filterDept !== 'all') {
      list = list.filter(e => String(e.department_id) === String(filterDept));
    }
    // Lọc chức vụ
    if (filterPos !== 'all') {
      list = list.filter(e => String(e.position_id) === String(filterPos));
    }
    // Tìm kiếm
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      list = list.filter(e =>
        (e.full_name || '').toLowerCase().includes(s) ||
        (e.employee_code || '').toLowerCase().includes(s) ||
        (e.phone || '').includes(s)
      );
    }
    // Sắp xếp theo tên
    list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'vi'));
    return list;
  }, [employees, filterStatus, filterDept, filterPos, search]);

  // ========== Tự sinh mã nhân viên ==========
  const generateEmployeeCode = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('employees')
        .select('employee_code')
        .eq('tenant_id', tenant.id)
        .like('employee_code', 'NV-%')
        .order('employee_code', { ascending: false })
        .limit(1);

      let nextNum = 1;
      if (data && data.length > 0) {
        const lastCode = data[0].employee_code; // VD: NV-012
        const match = lastCode.match(/NV-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      return 'NV-' + String(nextNum).padStart(3, '0');
    } catch {
      return 'NV-001';
    }
  }, [tenant]);

  // ========== Mở modal tạo mới ==========
  const handleCreate = useCallback(async () => {
    const code = await generateEmployeeCode();
    setForm({ ...INITIAL_FORM, employee_code: code, start_date: getTodayVN() });
    setEditingEmployee(null);
    setShowFormModal(true);
  }, [generateEmployeeCode]);

  // ========== Mở modal chỉnh sửa ==========
  const handleEdit = useCallback((emp) => {
    setForm({
      full_name: emp.full_name || '',
      phone: emp.phone || '',
      email: emp.email || '',
      id_number: emp.id_number || '',
      birth_date: emp.birth_date || '',
      gender: emp.gender || 'male',
      address: emp.address || '',
      employee_code: emp.employee_code || '',
      department_id: emp.department_id || '',
      position_id: emp.position_id || '',
      employment_type: emp.employment_type || 'full_time',
      start_date: emp.start_date || '',
      base_salary: emp.base_salary || '',
      bank_account: emp.bank_account || '',
      bank_name: emp.bank_name || '',
      emergency_contact: emp.emergency_contact || '',
      emergency_phone: emp.emergency_phone || '',
      note: emp.note || '',
      avatar_url: emp.avatar_url || '',
    });
    setEditingEmployee(emp);
    setShowFormModal(true);
  }, []);

  // ========== Lưu nhân viên ==========
  const handleSave = useCallback(async () => {
    if (!form.full_name.trim()) {
      setToast({ type: 'error', msg: 'Vui lòng nhập họ tên nhân viên' });
      return;
    }
    if (!form.start_date) {
      setToast({ type: 'error', msg: 'Vui lòng chọn ngày vào làm' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        id_number: form.id_number.trim() || null,
        birth_date: form.birth_date || null,
        gender: form.gender || 'male',
        address: form.address.trim() || null,
        employee_code: form.employee_code.trim(),
        department_id: form.department_id || null,
        position_id: form.position_id || null,
        employment_type: form.employment_type || 'full_time',
        start_date: form.start_date,
        base_salary: form.base_salary ? parseFloat(form.base_salary) : null,
        bank_account: form.bank_account.trim() || null,
        bank_name: form.bank_name.trim() || null,
        emergency_contact: form.emergency_contact.trim() || null,
        emergency_phone: form.emergency_phone.trim() || null,
        note: form.note.trim() || null,
        avatar_url: form.avatar_url || null,
        tenant_id: tenant.id,
      };

      // Auto-link user_id by email match
      if (payload.email && allUsers?.length) {
        const matchedUser = allUsers.find(u => u.email?.toLowerCase() === payload.email.toLowerCase());
        if (matchedUser) payload.user_id = matchedUser.id;
      }

      if (editingEmployee) {
        payload.updated_at = getNowISOVN();
        if (!payload.user_id && editingEmployee.user_id) payload.user_id = editingEmployee.user_id;
        const { error } = await supabase
          .from('employees')
          .update(payload)
          .eq('id', editingEmployee.id);
        if (error) throw error;
        logActivity({
          tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
          module: 'hrm', action: 'update', entityType: 'employee',
          entityId: editingEmployee.id, entityName: payload.full_name,
          description: `Cập nhật nhân viên: ${payload.full_name}`
        });
        setToast({ type: 'success', msg: 'Cập nhật nhân viên thành công' });
      } else {
        payload.status = 'active';
        payload.created_at = getNowISOVN();
        const { error } = await supabase
          .from('employees')
          .insert(payload);
        if (error) throw error;
        logActivity({
          tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
          module: 'hrm', action: 'create', entityType: 'employee',
          entityName: payload.full_name,
          description: `Thêm nhân viên mới: ${payload.full_name}`
        });
        setToast({ type: 'success', msg: 'Thêm nhân viên thành công' });
      }

      setShowFormModal(false);
      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Lỗi lưu nhân viên:', err);
      setToast({ type: 'error', msg: 'Lỗi: ' + (err.message || 'Không thể lưu') });
    } finally {
      setSubmitting(false);
    }
  }, [form, editingEmployee, tenant, loadHrmData, allUsers]);

  // ========== Mở modal chi tiết ==========
  const handleViewDetail = useCallback((emp) => {
    setSelectedEmployee(emp);
    setDetailTab('info');
    setShowDetailModal(true);
  }, []);

  // ========== Chuyển trạng thái ==========
  const handleToggleStatus = useCallback(async (emp, newStatus) => {
    try {
      const updates = { status: newStatus, updated_at: getNowISOVN() };
      if (newStatus === 'resigned' || newStatus === 'terminated') {
        updates.end_date = getTodayVN();
      }
      const { error } = await supabase
        .from('employees')
        .update(updates)
        .eq('id', emp.id);
      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'update', entityType: 'employee',
        entityId: emp.id, entityName: emp.full_name,
        description: `Chuyển trạng thái nhân viên ${emp.full_name} sang ${EMPLOYEE_STATUSES[newStatus]?.label || newStatus}`
      });

      setToast({ type: 'success', msg: `Cập nhật trạng thái thành: ${EMPLOYEE_STATUSES[newStatus]?.label || newStatus}` });
      if (loadHrmData) loadHrmData();
      // Cập nhật employee đang xem trong detail modal
      if (selectedEmployee?.id === emp.id) {
        setSelectedEmployee(prev => ({ ...prev, status: newStatus, ...updates }));
      }
    } catch (err) {
      setToast({ type: 'error', msg: 'Lỗi cập nhật trạng thái: ' + err.message });
    }
  }, [loadHrmData, selectedEmployee]);

  // ========== Dữ liệu chấm công cho NV đang chọn ==========
  const empAttendances = useMemo(() => {
    if (!selectedEmployee || !attendances) return [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);
    return (attendances || [])
      .filter(a => String(a.employee_id) === String(selectedEmployee.id) && a.date >= cutoff)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedEmployee, attendances]);

  // ========== Đơn từ cho NV đang chọn ==========
  const empLeaveRequests = useMemo(() => {
    if (!selectedEmployee || !leaveRequests) return [];
    return (leaveRequests || [])
      .filter(lr => String(lr.employee_id) === String(selectedEmployee.id))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [selectedEmployee, leaveRequests]);

  // ========== KPI cho NV đang chọn ==========
  const empKpi = useMemo(() => {
    if (!selectedEmployee || !kpiEvaluations) return [];
    return (kpiEvaluations || [])
      .filter(k => String(k.employee_id) === String(selectedEmployee.id))
      .sort((a, b) => (b.period || '').localeCompare(a.period || ''));
  }, [selectedEmployee, kpiEvaluations]);

  // ========== Avatar upload ==========
  const handleAvatarUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const result = await uploadImage(file, 'avatars');
      setForm(prev => ({ ...prev, avatar_url: result.url }));
    } catch (err) {
      setToast({ type: 'error', msg: 'Lỗi upload ảnh: ' + err.message });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }, []);

  // ========== Cập nhật field form ==========
  const setField = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  // ====================================================================
  // RENDER
  // ====================================================================
  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ===== THẺ THỐNG KÊ ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">Tổng NV</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</div>
          <div className="text-xs text-gray-400 mt-1">Đang hoạt động</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
          <div className="text-sm text-green-600">Đang làm</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{stats.active}</div>
          <div className="text-xs text-green-500 mt-1">Nhân viên chính thức</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-yellow-100">
          <div className="text-sm text-yellow-600">Nghỉ phép</div>
          <div className="text-2xl font-bold text-yellow-700 mt-1">{stats.onLeave}</div>
          <div className="text-xs text-yellow-500 mt-1">Tạm nghỉ</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">Đã nghỉ việc</div>
          <div className="text-2xl font-bold text-gray-600 mt-1">{stats.left}</div>
          <div className="text-xs text-gray-400 mt-1">Nghỉ / Sa thải</div>
        </div>
      </div>

      {/* ===== BỘ LỌC & TÌM KIẾM ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Tìm kiếm */}
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Tìm theo tên, mã NV, SĐT..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
          </div>

          {/* Lọc phòng ban */}
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
          >
            <option value="all">Tất cả phòng ban</option>
            {(departments || []).map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          {/* Lọc chức vụ */}
          <select
            value={filterPos}
            onChange={e => setFilterPos(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
          >
            <option value="all">Tất cả chức vụ</option>
            {(positions || []).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Lọc trạng thái */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
          >
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(EMPLOYEE_STATUSES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Nút đồng bộ - chỉ level 3 / canEdit */}
          {userCanEdit && (
            <button
              onClick={syncUsersToEmployees}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              title="Đồng bộ tài khoản hệ thống thành nhân viên"
            >
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? 'Đang đồng bộ...' : 'Đồng bộ Users'}
            </button>
          )}

          {/* Nút thêm - chỉ level 3 / canEdit */}
          {userCanEdit && (
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Thêm NV
            </button>
          )}
        </div>

        <div className="mt-2 text-xs text-gray-400">
          Hiển thị {filteredEmployees.length} / {(employees || []).length} nhân viên
        </div>
      </div>

      {/* ===== BẢNG NHÂN VIÊN (Desktop) ===== */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-medium">Mã NV</th>
                <th className="px-4 py-3 font-medium">Họ tên</th>
                <th className="px-4 py-3 font-medium">Phòng ban</th>
                <th className="px-4 py-3 font-medium">Chức vụ</th>
                <th className="px-4 py-3 font-medium">SĐT</th>
                <th className="px-4 py-3 font-medium">Ngày vào</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium text-center">Tài khoản</th>
                <th className="px-4 py-3 font-medium text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    Không tìm thấy nhân viên nào
                  </td>
                </tr>
              ) : filteredEmployees.map(emp => (
                <tr
                  key={emp.id}
                  className="hover:bg-green-50/50 cursor-pointer transition-colors"
                  onClick={() => handleViewDetail(emp)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-green-700 font-medium">
                    {emp.employee_code}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {emp.full_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {deptMap[emp.department_id] || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {posMap[emp.position_id] || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {permLevel >= 2 ? (emp.phone || '-') : '***'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {formatDateVN(emp.start_date)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE_COLORS[emp.status] || 'bg-gray-100 text-gray-600'}`}>
                      {EMPLOYEE_STATUSES[emp.status]?.label || emp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {emp.user_id ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700" title={userMap[emp.user_id]?.name || ''}>
                        <span className="text-green-500">&#10003;</span>
                        {userMap[emp.user_id]?.role || 'User'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    {userCanEdit && (
                      <button
                        onClick={() => handleEdit(emp)}
                        className="text-green-600 hover:text-green-800 p-1"
                        title="Chỉnh sửa"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== THẺ NHÂN VIÊN (Mobile) ===== */}
      <div className="md:hidden space-y-2">
        {filteredEmployees.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm">
            Không tìm thấy nhân viên nào
          </div>
        ) : filteredEmployees.map(emp => (
          <div
            key={emp.id}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:bg-green-50 cursor-pointer"
            onClick={() => handleViewDetail(emp)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-green-700 font-medium">{emp.employee_code}</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE_COLORS[emp.status] || 'bg-gray-100 text-gray-600'}`}>
                    {EMPLOYEE_STATUSES[emp.status]?.label || emp.status}
                  </span>
                  {emp.user_id && (
                    <span className="inline-block px-1.5 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600 border border-blue-200">
                      {userMap[emp.user_id]?.role || 'User'}
                    </span>
                  )}
                </div>
                <div className="font-medium text-gray-800 mt-1 truncate">{emp.full_name}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {deptMap[emp.department_id] || '-'} {posMap[emp.position_id] ? `· ${posMap[emp.position_id]}` : ''}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  {emp.phone && <span>{permLevel >= 2 ? emp.phone : '***'}</span>}
                  <span>Vào: {formatDateVN(emp.start_date)}</span>
                </div>
              </div>
              {userCanEdit && (
                <button
                  onClick={e => { e.stopPropagation(); handleEdit(emp); }}
                  className="text-green-600 p-1 ml-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ===== MODAL TẠO/CHỈNH SỬA ===== */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">
                {editingEmployee ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'}
              </h2>
              <button onClick={() => setShowFormModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* --- Avatar --- */}
              <div className="flex items-center gap-4">
                <input type="file" ref={avatarInputRef} accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                {form.avatar_url ? (
                  <img src={getThumbnailUrl(form.avatar_url)} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-green-200" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-2xl font-bold border-2 border-green-200">
                    {(form.full_name || '?')[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => avatarInputRef.current?.click()} className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium" disabled={uploadingAvatar}>
                    {uploadingAvatar ? 'Đang tải...' : form.avatar_url ? 'Đổi ảnh' : 'Thêm ảnh đại diện'}
                  </button>
                  {form.avatar_url && (
                    <button type="button" onClick={() => setField('avatar_url', '')} className="px-3 py-1.5 text-red-500 hover:text-red-700 text-xs">Xóa ảnh</button>
                  )}
                </div>
              </div>

              {/* --- Thông tin cá nhân --- */}
              <div>
                <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Thông tin cá nhân
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Họ tên <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={e => setField('full_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="Nguyễn Văn A"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Số điện thoại</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={e => setField('phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="0901 234 567"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setField('email', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">CCCD / CMND</label>
                    <input
                      type="text"
                      value={form.id_number}
                      onChange={e => setField('id_number', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="0123456789XX"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Ngày sinh</label>
                    <input
                      type="date"
                      value={form.birth_date}
                      onChange={e => setField('birth_date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Giới tính</label>
                    <select
                      value={form.gender}
                      onChange={e => setField('gender', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      {Object.entries(GENDERS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Địa chỉ</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={e => setField('address', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="Số nhà, đường, quận/huyện, tỉnh/TP"
                    />
                  </div>
                </div>
              </div>

              {/* --- Công việc --- */}
              <div>
                <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Công việc
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Mã nhân viên</label>
                    <input
                      type="text"
                      value={form.employee_code}
                      onChange={e => setField('employee_code', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-green-500 outline-none"
                      readOnly={!editingEmployee}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Phòng ban</label>
                    <select
                      value={form.department_id}
                      onChange={e => setField('department_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      <option value="">-- Chọn phòng ban --</option>
                      {(departments || []).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Chức vụ</label>
                    <select
                      value={form.position_id}
                      onChange={e => setField('position_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      <option value="">-- Chọn chức vụ --</option>
                      {(positions || []).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Loại hợp đồng</label>
                    <select
                      value={form.employment_type}
                      onChange={e => setField('employment_type', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      {Object.entries(EMPLOYMENT_TYPES).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Ngày vào làm <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={form.start_date}
                      onChange={e => setField('start_date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Lương cơ bản</label>
                    <input
                      type="number"
                      value={form.base_salary}
                      onChange={e => setField('base_salary', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* --- Ngân hàng --- */}
              <div>
                <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Ngân hàng
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Số tài khoản</label>
                    <input
                      type="text"
                      value={form.bank_account}
                      onChange={e => setField('bank_account', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="1234567890"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tên ngân hàng</label>
                    <input
                      type="text"
                      value={form.bank_name}
                      onChange={e => setField('bank_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="Vietcombank, MB Bank..."
                    />
                  </div>
                </div>
              </div>

              {/* --- Liên hệ khẩn cấp --- */}
              <div>
                <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
                  </svg>
                  Liên hệ khẩn cấp
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Người liên hệ</label>
                    <input
                      type="text"
                      value={form.emergency_contact}
                      onChange={e => setField('emergency_contact', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="Tên người liên hệ"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">SĐT khẩn cấp</label>
                    <input
                      type="text"
                      value={form.emergency_phone}
                      onChange={e => setField('emergency_phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="0901 234 567"
                    />
                  </div>
                </div>
              </div>

              {/* --- Ghi chú --- */}
              <div>
                <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Ghi chú
                </h3>
                <textarea
                  value={form.note}
                  onChange={e => setField('note', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  rows={3}
                  placeholder="Ghi chú thêm về nhân viên..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowFormModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Huỷ
              </button>
              <button
                onClick={handleSave}
                disabled={submitting}
                className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Đang lưu...' : (editingEmployee ? 'Cập nhật' : 'Thêm nhân viên')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL CHI TIẾT ===== */}
      {showDetailModal && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{selectedEmployee.full_name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs text-green-700">{selectedEmployee.employee_code}</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE_COLORS[selectedEmployee.status] || 'bg-gray-100 text-gray-600'}`}>
                    {EMPLOYEE_STATUSES[selectedEmployee.status]?.label || selectedEmployee.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {userCanEdit && (
                  <button
                    onClick={() => { setShowDetailModal(false); handleEdit(selectedEmployee); }}
                    className="px-3 py-1.5 text-sm text-green-700 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
                  >
                    Chỉnh sửa
                  </button>
                )}
                <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6">
              {[
                { key: 'info', label: 'Thông tin' },
                { key: 'attendance', label: 'Chấm công' },
                { key: 'leave', label: 'Đơn từ' },
                { key: 'kpi', label: 'KPI' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setDetailTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    detailTab === tab.key
                      ? 'border-green-600 text-green-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Nội dung tab */}
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              {/* --- Tab: Thông tin --- */}
              {detailTab === 'info' && (
                <div className="space-y-4">
                  {/* Thông tin cá nhân */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <InfoRow label="Họ tên" value={selectedEmployee.full_name} />
                    <InfoRow label="Giới tính" value={GENDERS[selectedEmployee.gender] || '-'} />
                    <InfoRow label="Số điện thoại" value={permLevel >= 2 ? selectedEmployee.phone : '***'} />
                    <InfoRow label="Email" value={permLevel >= 2 ? selectedEmployee.email : '***'} />
                    <InfoRow label="CCCD" value={permLevel >= 3 ? selectedEmployee.id_number : '***'} />
                    <InfoRow label="Ngày sinh" value={formatDateVN(selectedEmployee.birth_date)} />
                    <InfoRow label="Địa chỉ" value={selectedEmployee.address} full />
                  </div>

                  <hr className="border-gray-100" />

                  {/* Thông tin công việc */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <InfoRow label="Mã NV" value={selectedEmployee.employee_code} />
                    <InfoRow label="Phòng ban" value={deptMap[selectedEmployee.department_id]} />
                    <InfoRow label="Chức vụ" value={posMap[selectedEmployee.position_id]} />
                    <InfoRow label="Loại HĐ" value={EMPLOYMENT_TYPES[selectedEmployee.employment_type]?.label} />
                    <InfoRow label="Ngày vào làm" value={formatDateVN(selectedEmployee.start_date)} />
                    <InfoRow label="Lương cơ bản" value={permLevel >= 3 ? (selectedEmployee.base_salary ? formatMoney(selectedEmployee.base_salary) : '-') : '***'} />
                    {selectedEmployee.end_date && <InfoRow label="Ngày nghỉ" value={formatDateVN(selectedEmployee.end_date)} />}
                  </div>

                  <hr className="border-gray-100" />

                  {/* Ngân hàng - chỉ hiện cho level 3 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <InfoRow label="Số tài khoản" value={permLevel >= 3 ? selectedEmployee.bank_account : '***'} />
                    <InfoRow label="Ngân hàng" value={permLevel >= 3 ? selectedEmployee.bank_name : '***'} />
                  </div>

                  <hr className="border-gray-100" />

                  {/* Liên hệ khẩn cấp */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <InfoRow label="Liên hệ khẩn cấp" value={selectedEmployee.emergency_contact} />
                    <InfoRow label="SĐT khẩn cấp" value={selectedEmployee.emergency_phone} />
                  </div>

                  {selectedEmployee.note && (
                    <>
                      <hr className="border-gray-100" />
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Ghi chú</div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">{selectedEmployee.note}</div>
                      </div>
                    </>
                  )}

                  {/* Tài khoản liên kết */}
                  <hr className="border-gray-100" />
                  <div>
                    <h4 className="text-xs text-gray-400 mb-2">Tài khoản hệ thống</h4>
                    {selectedEmployee.user_id && userMap[selectedEmployee.user_id] ? (() => {
                      const linkedUser = userMap[selectedEmployee.user_id];
                      return (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <div>
                              <div className="text-xs text-blue-500">Tên tài khoản</div>
                              <div className="text-blue-800 font-medium">{linkedUser.name}</div>
                            </div>
                            <div>
                              <div className="text-xs text-blue-500">Vai trò</div>
                              <div className="text-blue-800">{linkedUser.role || '-'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-blue-500">Team</div>
                              <div className="text-blue-800">{linkedUser.team || '-'}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="text-sm text-gray-400">Chưa liên kết tài khoản</div>
                    )}
                  </div>

                  {/* Thay đổi trạng thái - chỉ level 3 / canEdit */}
                  {userCanEdit && (
                    <>
                      <hr className="border-gray-100" />
                      <div>
                        <div className="text-xs text-gray-400 mb-2">Thay đổi trạng thái</div>
                        <div className="flex flex-wrap gap-2">
                          {selectedEmployee.status === 'active' && (
                            <>
                              <button
                                onClick={() => handleToggleStatus(selectedEmployee, 'on_leave')}
                                className="px-3 py-1.5 text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200 rounded-lg hover:bg-yellow-200 transition-colors"
                              >
                                Cho nghỉ phép
                              </button>
                              <button
                                onClick={() => handleToggleStatus(selectedEmployee, 'resigned')}
                                className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                Nghỉ việc
                              </button>
                              <button
                                onClick={() => handleToggleStatus(selectedEmployee, 'terminated')}
                                className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-600 border border-red-200 rounded-lg hover:bg-red-200 transition-colors"
                              >
                                Sa thải
                              </button>
                            </>
                          )}
                          {selectedEmployee.status === 'on_leave' && (
                            <button
                              onClick={() => handleToggleStatus(selectedEmployee, 'active')}
                              className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200 transition-colors"
                            >
                              Quay lại làm việc
                            </button>
                          )}
                          {(selectedEmployee.status === 'resigned' || selectedEmployee.status === 'terminated') && (
                            <button
                              onClick={() => handleToggleStatus(selectedEmployee, 'active')}
                              className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200 transition-colors"
                            >
                              Tiếp nhận lại
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* --- Tab: Chấm công --- */}
              {detailTab === 'attendance' && (
                <div>
                  <div className="text-xs text-gray-400 mb-3">30 ngày gần nhất</div>
                  {empAttendances.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Chưa có dữ liệu chấm công
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-600 text-left">
                            <th className="px-3 py-2 font-medium">Ngày</th>
                            <th className="px-3 py-2 font-medium">Vào</th>
                            <th className="px-3 py-2 font-medium">Ra</th>
                            <th className="px-3 py-2 font-medium">Trạng thái</th>
                            <th className="px-3 py-2 font-medium">Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {empAttendances.map((att, idx) => (
                            <tr key={att.id || idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-700">{formatDateVN(att.date)}</td>
                              <td className="px-3 py-2 text-gray-600">{att.check_in ? new Date(att.check_in).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                              <td className="px-3 py-2 text-gray-600">{att.check_out ? new Date(att.check_out).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                              <td className="px-3 py-2">
                                <AttendanceStatusBadge status={att.status} />
                              </td>
                              <td className="px-3 py-2 text-gray-500 text-xs">{att.note || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* --- Tab: Đơn từ --- */}
              {detailTab === 'leave' && (
                <div>
                  {empLeaveRequests.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Chưa có đơn từ nào
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {empLeaveRequests.map((lr, idx) => (
                        <div key={lr.id || idx} className="border border-gray-100 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-800">
                                {getLeaveTypeLabel(lr.type)}
                              </span>
                              <LeaveStatusBadge status={lr.status} />
                            </div>
                            <span className="text-xs text-gray-400">{formatDateTimeVN(lr.created_at)}</span>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {formatDateVN(lr.start_date)} - {formatDateVN(lr.end_date)}
                            {lr.days ? ` (${lr.days} ngày)` : ''}
                          </div>
                          {lr.reason && (
                            <div className="mt-1 text-xs text-gray-600">{lr.reason}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* --- Tab: KPI --- */}
              {detailTab === 'kpi' && (
                <div>
                  {empKpi.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Chưa có đánh giá KPI
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {empKpi.map((kpi, idx) => (
                        <div key={kpi.id || idx} className="border border-gray-100 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-800">
                              Kỳ: {kpi.period || '-'}
                            </span>
                            <KpiStatusBadge status={kpi.status} />
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-center">
                            <div>
                              <div className="text-xs text-gray-400">Tổng điểm</div>
                              <div className={`text-lg font-bold ${getKpiScoreColor(kpi.total_score)}`}>{kpi.total_score ?? '-'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Xếp hạng</div>
                              <div className="text-lg font-bold text-gray-700">{kpi.rating || (kpi.total_score != null ? getKpiRating(kpi.total_score) : '-')}</div>
                            </div>
                          </div>
                          {kpi.total_score != null && (
                            <div className="mt-2">
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${getKpiBarColor(kpi.total_score)}`}
                                  style={{ width: `${Math.min(kpi.total_score, 100)}%` }}
                                />
                              </div>
                              <div className="text-right text-xs text-gray-400 mt-0.5">
                                Xếp hạng: {getKpiRating(kpi.total_score)}
                              </div>
                            </div>
                          )}
                          {kpi.manager_comment && (
                            <div className="mt-2 text-xs text-gray-500">{kpi.manager_comment}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ COMPONENT PHỤ TRỢ ============

function InfoRow({ label, value, full }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-sm text-gray-700 mt-0.5">{value || '-'}</div>
    </div>
  );
}

function AttendanceStatusBadge({ status }) {
  const map = {
    present: 'bg-green-100 text-green-700',
    absent: 'bg-red-100 text-red-700',
    late: 'bg-orange-100 text-orange-700',
    early_leave: 'bg-yellow-100 text-yellow-700',
    half_day: 'bg-yellow-100 text-yellow-700',
    holiday: 'bg-blue-100 text-blue-700',
    sick: 'bg-purple-100 text-purple-700',
    annual_leave: 'bg-cyan-100 text-cyan-700',
  };
  const labels = {
    present: 'Có mặt',
    absent: 'Vắng',
    late: 'Đi trễ',
    early_leave: 'Về sớm',
    half_day: 'Nửa ngày',
    holiday: 'Nghỉ lễ',
    sick: 'Nghỉ ốm',
    annual_leave: 'Phép năm',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status || '-'}
    </span>
  );
}

function LeaveStatusBadge({ status }) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
  };
  const labels = {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
    cancelled: 'Đã huỷ',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status || '-'}
    </span>
  );
}

function KpiStatusBadge({ status }) {
  const map = {
    draft: 'bg-gray-100 text-gray-600',
    self_evaluated: 'bg-blue-100 text-blue-700',
    manager_reviewed: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
  };
  const labels = {
    draft: 'Nháp',
    self_evaluated: 'Tự đánh giá',
    manager_reviewed: 'QL đã duyệt',
    completed: 'Hoàn thành',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status || '-'}
    </span>
  );
}

function getLeaveTypeLabel(type) {
  const map = {
    annual_leave: 'Nghỉ phép năm',
    sick_leave: 'Nghỉ ốm',
    unpaid_leave: 'Nghỉ không lương',
    overtime: 'Tăng ca',
    business_trip: 'Công tác',
    work_from_home: 'Làm việc tại nhà',
  };
  return map[type] || type || '-';
}

function getKpiScoreColor(score) {
  if (score == null) return 'text-gray-700';
  if (score >= 90) return 'text-green-600';
  if (score >= 75) return 'text-blue-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getKpiBarColor(score) {
  if (score == null) return 'bg-gray-300';
  if (score >= 90) return 'bg-green-500';
  if (score >= 75) return 'bg-blue-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getKpiRating(score) {
  if (score == null) return '-';
  if (score >= 90) return 'A - Xuất sắc';
  if (score >= 75) return 'B - Tốt';
  if (score >= 60) return 'C - Trung bình';
  return 'D - Yếu';
}

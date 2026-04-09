import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { POSITION_LEVELS, DEFAULT_PAYROLL_CONFIG } from '../../constants/hrmConstants';
import { logActivity } from '../../lib/activityLog';

const LEVEL_COLORS = {
  0: { bg: 'bg-gray-100', text: 'text-gray-700' },
  1: { bg: 'bg-blue-100', text: 'text-blue-700' },
  2: { bg: 'bg-orange-100', text: 'text-orange-700' },
  3: { bg: 'bg-red-100', text: 'text-red-700' }
};

const SUB_TABS = [
  { key: 'departments', label: 'Phòng ban', icon: '🏢' },
  { key: 'positions', label: 'Chức vụ', icon: '🎖️' },
  { key: 'shifts', label: 'Ca làm việc', icon: '🕐' },
  { key: 'config', label: 'Cấu hình', icon: '⚙️' }
];

const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500';
const Toggle = ({ checked, onChange }) => (
  <label className="relative inline-flex items-center cursor-pointer">
    <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600" />
  </label>
);

export default function HrmSettingsView({ departments, positions, workShifts, employees, loadHrmData, tenant, currentUser, canEdit }) {
  const [activeSubTab, setActiveSubTab] = useState('departments');
  const [toast, setToast] = useState(null);

  // Phòng ban state
  const [deptForm, setDeptForm] = useState({ name: '', description: '', manager_id: '', is_active: true });
  const [editingDept, setEditingDept] = useState(null);
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [savingDept, setSavingDept] = useState(false);

  // Chức vụ state
  const [posForm, setPosForm] = useState({ name: '', level: 0 });
  const [editingPos, setEditingPos] = useState(null);
  const [showPosForm, setShowPosForm] = useState(false);
  const [savingPos, setSavingPos] = useState(false);

  // Ca làm việc state
  const [shiftForm, setShiftForm] = useState({ name: '', start_time: '08:00', end_time: '17:00', break_minutes: 60, is_active: true });
  const [editingShift, setEditingShift] = useState(null);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [savingShift, setSavingShift] = useState(false);

  // Cấu hình state
  const [config, setConfig] = useState({
    workingDaysPerMonth: DEFAULT_PAYROLL_CONFIG.workingDaysPerMonth,
    hoursPerDay: DEFAULT_PAYROLL_CONFIG.hoursPerDay,
    overtimeRate: DEFAULT_PAYROLL_CONFIG.overtimeRate,
    socialInsuranceRate: DEFAULT_PAYROLL_CONFIG.socialInsuranceRate * 100,
    personalDeduction: DEFAULT_PAYROLL_CONFIG.personalDeduction,
    dependentDeduction: DEFAULT_PAYROLL_CONFIG.dependentDeduction,
    annualLeaveDefault: 12, sickLeaveDefault: 30,
    bonusA: 2000000, bonusB: 1000000, bonusC: 500000, bonusD: 0,
    lateThresholdMinutes: 15
  });
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => { loadConfig(); }, [tenant?.id]);

  const loadConfig = async () => {
    if (!tenant?.id) return;
    try {
      const { data } = await supabase.from('system_settings').select('key, value')
        .eq('tenant_id', tenant.id).eq('category', 'hrm');
      if (data?.length > 0) {
        const m = {};
        data.forEach(r => { m[r.key] = r.value; });
        setConfig(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(k => { if (m[k] !== undefined) next[k] = m[k]; });
          return next;
        });
      }
    } catch (err) { console.error('Lỗi tải cấu hình HRM:', err); }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const formatMoney = (v) => new Intl.NumberFormat('vi-VN').format(v) + 'đ';

  const employeeCountByDept = useMemo(() => {
    const c = {};
    (employees || []).forEach(e => {
      if (e.department_id && e.status !== 'resigned' && e.status !== 'terminated')
        c[e.department_id] = (c[e.department_id] || 0) + 1;
    });
    return c;
  }, [employees]);

  const employeeCountByPos = useMemo(() => {
    const c = {};
    (employees || []).forEach(e => {
      if (e.position_id && e.status !== 'resigned' && e.status !== 'terminated')
        c[e.position_id] = (c[e.position_id] || 0) + 1;
    });
    return c;
  }, [employees]);

  // === PERMISSION GUARD: Chỉ canEdit (level 3) mới truy cập được cài đặt ===
  if (canEdit && !canEdit('hrm')) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
          <p className="text-red-600">Bạn không có quyền quản lý cài đặt nhân sự. Vui lòng liên hệ Admin.</p>
        </div>
      </div>
    );
  }

  const calcWorkingHours = (start, end, breakMin) => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm) - (breakMin || 0)) / 60);
  };

  // === PHÒNG BAN ===
  const resetDeptForm = () => { setDeptForm({ name: '', description: '', manager_id: '', is_active: true }); setEditingDept(null); setShowDeptForm(false); };
  const openEditDept = (d) => { setDeptForm({ name: d.name || '', description: d.description || '', manager_id: d.manager_id || '', is_active: d.is_active !== false }); setEditingDept(d.id); setShowDeptForm(true); };

  const saveDept = async () => {
    if (!deptForm.name.trim()) return alert('Vui lòng nhập tên phòng ban');
    setSavingDept(true);
    try {
      const payload = { tenant_id: tenant.id, name: deptForm.name.trim(), description: deptForm.description.trim() || null, manager_id: deptForm.manager_id || null, is_active: deptForm.is_active, updated_at: new Date().toISOString() };
      if (editingDept) {
        const { error } = await supabase.from('departments').update(payload).eq('id', editingDept);
        if (error) throw error;
        logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'hrm', action: 'update', entityType: 'department', entityId: editingDept, entityName: payload.name, description: `Cập nhật phòng ban: ${payload.name}` });
        showToast('Cập nhật phòng ban thành công!');
      } else {
        payload.created_at = new Date().toISOString();
        const { error } = await supabase.from('departments').insert(payload);
        if (error) throw error;
        logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'hrm', action: 'create', entityType: 'department', entityName: payload.name, description: `Thêm phòng ban: ${payload.name}` });
        showToast('Thêm phòng ban thành công!');
      }
      await loadHrmData(); resetDeptForm();
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setSavingDept(false); }
  };

  const toggleDeptActive = async (d) => {
    try {
      const { error } = await supabase.from('departments').update({ is_active: !d.is_active, updated_at: new Date().toISOString() }).eq('id', d.id);
      if (error) throw error;
      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'hrm', action: 'update', entityType: 'department', entityId: d.id, entityName: d.name, description: `${d.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'} phòng ban: ${d.name}` });
      await loadHrmData();
      showToast(d.is_active ? 'Đã vô hiệu hóa phòng ban' : 'Đã kích hoạt phòng ban');
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  // === CHỨC VỤ ===
  const resetPosForm = () => { setPosForm({ name: '', level: 0 }); setEditingPos(null); setShowPosForm(false); };
  const openEditPos = (p) => { setPosForm({ name: p.name || '', level: p.level ?? 0 }); setEditingPos(p.id); setShowPosForm(true); };

  const savePos = async () => {
    if (!posForm.name.trim()) return alert('Vui lòng nhập tên chức vụ');
    setSavingPos(true);
    try {
      const payload = { tenant_id: tenant.id, name: posForm.name.trim(), level: Number(posForm.level), updated_at: new Date().toISOString() };
      if (editingPos) {
        const { error } = await supabase.from('positions').update(payload).eq('id', editingPos);
        if (error) throw error;
        logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'hrm', action: 'update', entityType: 'position', entityId: editingPos, entityName: payload.name, description: `Cập nhật chức vụ: ${payload.name}` });
        showToast('Cập nhật chức vụ thành công!');
      } else {
        payload.created_at = new Date().toISOString();
        const { error } = await supabase.from('positions').insert(payload);
        if (error) throw error;
        logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'hrm', action: 'create', entityType: 'position', entityName: payload.name, description: `Thêm chức vụ: ${payload.name}` });
        showToast('Thêm chức vụ thành công!');
      }
      await loadHrmData(); resetPosForm();
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setSavingPos(false); }
  };

  const deletePos = async (p) => {
    const cnt = employeeCountByPos[p.id] || 0;
    if (cnt > 0) return alert(`Không thể xóa chức vụ đang có ${cnt} nhân viên!`);
    if (!window.confirm(`Xóa chức vụ "${p.name}"?`)) return;
    try {
      // Soft delete: ẩn chức vụ thay vì xóa cứng (tránh orphan data)
      const { error } = await supabase.from('positions').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', p.id);
      if (error) {
        // Fallback hard delete nếu bảng chưa có column is_active
        const { error: delErr } = await supabase.from('positions').delete().eq('id', p.id);
        if (delErr) throw delErr;
      }
      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'hrm', action: 'delete', entityType: 'position', entityId: p.id, entityName: p.name, description: `Xóa chức vụ: ${p.name}` });
      await loadHrmData(); showToast('Đã xóa chức vụ');
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  // === CA LÀM VIỆC ===
  const resetShiftForm = () => { setShiftForm({ name: '', start_time: '08:00', end_time: '17:00', break_minutes: 60, is_active: true }); setEditingShift(null); setShowShiftForm(false); };
  const openEditShift = (s) => { setShiftForm({ name: s.name || '', start_time: s.start_time?.slice(0, 5) || '08:00', end_time: s.end_time?.slice(0, 5) || '17:00', break_minutes: s.break_minutes ?? 0, is_active: s.is_active !== false }); setEditingShift(s.id); setShowShiftForm(true); };

  const saveShift = async () => {
    if (!shiftForm.name.trim()) return alert('Vui lòng nhập tên ca');
    if (!shiftForm.start_time || !shiftForm.end_time) return alert('Vui lòng nhập giờ bắt đầu và kết thúc');
    setSavingShift(true);
    try {
      const hours = calcWorkingHours(shiftForm.start_time, shiftForm.end_time, shiftForm.break_minutes);
      const payload = { tenant_id: tenant.id, name: shiftForm.name.trim(), start_time: shiftForm.start_time, end_time: shiftForm.end_time, break_minutes: Number(shiftForm.break_minutes) || 0, working_hours: Math.round(hours * 100) / 100, is_active: shiftForm.is_active, updated_at: new Date().toISOString() };
      if (editingShift) {
        const { error } = await supabase.from('work_shifts').update(payload).eq('id', editingShift);
        if (error) throw error;
        logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'hrm', action: 'update', entityType: 'work_shift', entityId: editingShift, entityName: payload.name, description: `Cập nhật ca làm việc: ${payload.name}` });
        showToast('Cập nhật ca làm việc thành công!');
      } else {
        payload.created_at = new Date().toISOString();
        const { error } = await supabase.from('work_shifts').insert(payload);
        if (error) throw error;
        logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'hrm', action: 'create', entityType: 'work_shift', entityName: payload.name, description: `Thêm ca làm việc: ${payload.name}` });
        showToast('Thêm ca làm việc thành công!');
      }
      await loadHrmData(); resetShiftForm();
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setSavingShift(false); }
  };

  const toggleShiftActive = async (s) => {
    try {
      const { error } = await supabase.from('work_shifts').update({ is_active: !s.is_active, updated_at: new Date().toISOString() }).eq('id', s.id);
      if (error) throw error;
      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'hrm', action: 'update', entityType: 'work_shift', entityId: s.id, entityName: s.name, description: `${s.is_active ? 'Tắt' : 'Bật'} ca làm việc: ${s.name}` });
      await loadHrmData();
      showToast(s.is_active ? 'Đã tắt ca làm việc' : 'Đã bật ca làm việc');
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  // === CẤU HÌNH ===
  const saveAllConfig = async () => {
    setSavingConfig(true);
    try {
      const keys = ['workingDaysPerMonth', 'hoursPerDay', 'overtimeRate', 'socialInsuranceRate', 'personalDeduction', 'dependentDeduction', 'annualLeaveDefault', 'sickLeaveDefault', 'bonusA', 'bonusB', 'bonusC', 'bonusD', 'lateThresholdMinutes'];
      for (const key of keys) {
        const { error } = await supabase.from('system_settings').upsert({
          tenant_id: tenant.id, category: 'hrm', key, value: Number(config[key]),
          updated_by: currentUser?.name || 'system', updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id,category,key' });
        if (error) throw error;
      }
      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'hrm', action: 'update', entityType: 'hrm_config', description: 'Cập nhật cấu hình HRM' });
      showToast('Lưu cấu hình thành công!');
    } catch (err) { alert('Lỗi lưu cấu hình: ' + err.message); }
    finally { setSavingConfig(false); }
  };

  const resetConfig = () => {
    if (!window.confirm('Khôi phục cấu hình mặc định? Tất cả thay đổi sẽ bị mất.')) return;
    setConfig({
      workingDaysPerMonth: DEFAULT_PAYROLL_CONFIG.workingDaysPerMonth, hoursPerDay: DEFAULT_PAYROLL_CONFIG.hoursPerDay,
      overtimeRate: DEFAULT_PAYROLL_CONFIG.overtimeRate, socialInsuranceRate: DEFAULT_PAYROLL_CONFIG.socialInsuranceRate * 100,
      personalDeduction: DEFAULT_PAYROLL_CONFIG.personalDeduction, dependentDeduction: DEFAULT_PAYROLL_CONFIG.dependentDeduction,
      annualLeaveDefault: 12, sickLeaveDefault: 30, bonusA: 2000000, bonusB: 1000000, bonusC: 500000, bonusD: 0, lateThresholdMinutes: 15
    });
  };

  // === RENDER: Phòng ban ===
  const renderDepartments = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Danh sách phòng ban</h3>
          <p className="text-sm text-gray-500">{(departments || []).length} phòng ban</p>
        </div>
        <button onClick={() => { resetDeptForm(); setShowDeptForm(true); }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">+ Thêm phòng ban</button>
      </div>

      {showDeptForm && (
        <div className="bg-white rounded-xl border-2 border-green-200 p-4 space-y-3">
          <h4 className="font-bold text-green-700">{editingDept ? 'Sửa phòng ban' : 'Thêm phòng ban mới'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">Tên phòng ban *</label>
              <input value={deptForm.name} onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} placeholder="VD: Phòng Kỹ thuật" className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">Trưởng phòng</label>
              <select value={deptForm.manager_id} onChange={e => setDeptForm(p => ({ ...p, manager_id: e.target.value }))} className={inputCls}>
                <option value="">-- Chưa chọn --</option>
                {(employees || []).filter(e => e.status !== 'resigned' && e.status !== 'terminated').map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.full_name || emp.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Mô tả</label>
            <textarea value={deptForm.description} onChange={e => setDeptForm(p => ({ ...p, description: e.target.value }))} placeholder="Mô tả chức năng phòng ban..." rows={2} className={inputCls} />
          </div>
          <div className="flex items-center gap-2">
            <Toggle checked={deptForm.is_active} onChange={e => setDeptForm(p => ({ ...p, is_active: e.target.checked }))} />
            <span className="text-sm text-gray-600">Đang hoạt động</span>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={saveDept} disabled={savingDept} className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${savingDept ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
              {savingDept ? 'Đang lưu...' : (editingDept ? 'Cập nhật' : 'Thêm mới')}
            </button>
            <button onClick={resetDeptForm} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">Hủy</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(departments || []).length === 0 ? (
          <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">🏢</div><p>Chưa có phòng ban nào</p></div>
        ) : (departments || []).map(dept => {
          const empCount = employeeCountByDept[dept.id] || 0;
          const manager = (employees || []).find(e => e.id === dept.manager_id);
          return (
            <div key={dept.id} className={`bg-white rounded-xl border p-4 ${!dept.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-gray-800">{dept.name}</h4>
                    {!dept.is_active && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Ngừng hoạt động</span>}
                  </div>
                  {dept.description && <p className="text-sm text-gray-500 mt-0.5">{dept.description}</p>}
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                    <span>👥 {empCount} nhân viên</span>
                    {manager && <span>👤 TP: {manager.full_name || manager.name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditDept(dept)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100">Sửa</button>
                  <button onClick={() => toggleDeptActive(dept)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${dept.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                    {dept.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // === RENDER: Chức vụ ===
  const renderPositions = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Danh sách chức vụ</h3>
          <p className="text-sm text-gray-500">{(positions || []).length} chức vụ</p>
        </div>
        <button onClick={() => { resetPosForm(); setShowPosForm(true); }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">+ Thêm chức vụ</button>
      </div>

      {showPosForm && (
        <div className="bg-white rounded-xl border-2 border-green-200 p-4 space-y-3">
          <h4 className="font-bold text-green-700">{editingPos ? 'Sửa chức vụ' : 'Thêm chức vụ mới'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">Tên chức vụ *</label>
              <input value={posForm.name} onChange={e => setPosForm(p => ({ ...p, name: e.target.value }))} placeholder="VD: Kỹ thuật viên" className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">Cấp bậc</label>
              <select value={posForm.level} onChange={e => setPosForm(p => ({ ...p, level: Number(e.target.value) }))} className={inputCls}>
                {Object.entries(POSITION_LEVELS).map(([lvl, label]) => (
                  <option key={lvl} value={lvl}>{lvl} - {label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={savePos} disabled={savingPos} className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${savingPos ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
              {savingPos ? 'Đang lưu...' : (editingPos ? 'Cập nhật' : 'Thêm mới')}
            </button>
            <button onClick={resetPosForm} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">Hủy</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(positions || []).length === 0 ? (
          <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">🎖️</div><p>Chưa có chức vụ nào</p></div>
        ) : (positions || []).map(pos => {
          const empCount = employeeCountByPos[pos.id] || 0;
          const lvl = pos.level ?? 0;
          const colors = LEVEL_COLORS[lvl] || LEVEL_COLORS[0];
          return (
            <div key={pos.id} className="bg-white rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${colors.bg} ${colors.text}`}>{POSITION_LEVELS[lvl] || 'Nhân viên'}</span>
                  <div>
                    <h4 className="font-bold text-gray-800">{pos.name}</h4>
                    <span className="text-xs text-gray-500">{empCount} nhân viên</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditPos(pos)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100">Sửa</button>
                  <button onClick={() => deletePos(pos)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100">Xóa</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // === RENDER: Ca làm việc ===
  const renderShifts = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Danh sách ca làm việc</h3>
          <p className="text-sm text-gray-500">{(workShifts || []).length} ca</p>
        </div>
        <button onClick={() => { resetShiftForm(); setShowShiftForm(true); }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">+ Thêm ca</button>
      </div>

      {showShiftForm && (
        <div className="bg-white rounded-xl border-2 border-green-200 p-4 space-y-3">
          <h4 className="font-bold text-green-700">{editingShift ? 'Sửa ca làm việc' : 'Thêm ca làm việc mới'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">Tên ca *</label>
              <input value={shiftForm.name} onChange={e => setShiftForm(p => ({ ...p, name: e.target.value }))} placeholder="VD: Ca sáng, Hành chính" className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">Nghỉ giữa ca (phút)</label>
              <input type="number" value={shiftForm.break_minutes} onChange={e => setShiftForm(p => ({ ...p, break_minutes: e.target.value }))} min={0} className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">Giờ bắt đầu *</label>
              <input type="time" value={shiftForm.start_time} onChange={e => setShiftForm(p => ({ ...p, start_time: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">Giờ kết thúc *</label>
              <input type="time" value={shiftForm.end_time} onChange={e => setShiftForm(p => ({ ...p, end_time: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <span className="text-sm text-green-700 font-medium">
                Giờ làm việc: {calcWorkingHours(shiftForm.start_time, shiftForm.end_time, shiftForm.break_minutes).toFixed(1)}h
              </span>
              {Number(shiftForm.break_minutes) > 0 && <span className="text-xs text-green-600 ml-2">(nghỉ {shiftForm.break_minutes} phút)</span>}
            </div>
            <div className="flex items-center gap-2">
              <Toggle checked={shiftForm.is_active} onChange={e => setShiftForm(p => ({ ...p, is_active: e.target.checked }))} />
              <span className="text-sm text-gray-600">Đang hoạt động</span>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={saveShift} disabled={savingShift} className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${savingShift ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
              {savingShift ? 'Đang lưu...' : (editingShift ? 'Cập nhật' : 'Thêm mới')}
            </button>
            <button onClick={resetShiftForm} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">Hủy</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(workShifts || []).length === 0 ? (
          <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">🕐</div><p>Chưa có ca làm việc nào</p></div>
        ) : (workShifts || []).map(shift => {
          const hours = calcWorkingHours(shift.start_time?.slice(0, 5), shift.end_time?.slice(0, 5), shift.break_minutes);
          return (
            <div key={shift.id} className={`bg-white rounded-xl border p-4 ${!shift.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-green-50 rounded-lg px-3 py-2 text-center min-w-[120px]">
                    <div className="text-lg font-bold text-green-700">{shift.start_time?.slice(0, 5)}-{shift.end_time?.slice(0, 5)}</div>
                    <div className="text-xs text-green-600">{hours.toFixed(1)}h{shift.break_minutes > 0 && `, nghỉ ${shift.break_minutes}p`}</div>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800">{shift.name}</h4>
                    {!shift.is_active && <span className="text-xs text-gray-400">Đã tắt</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditShift(shift)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100">Sửa</button>
                  <button onClick={() => toggleShiftActive(shift)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${shift.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                    {shift.is_active ? 'Tắt' : 'Bật'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // === RENDER: Cấu hình ===
  const ConfigInput = ({ label, configKey, hint, step, min, max }) => (
    <div>
      <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
      <input type="number" value={config[configKey]} onChange={e => setConfig(p => ({ ...p, [configKey]: e.target.value }))}
        step={step} min={min} max={max} className={inputCls} />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );

  const renderConfig = () => (
    <div className="space-y-6">
      {/* Cấu hình lương */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">💰 Cấu hình lương</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ConfigInput label="Số ngày công/tháng" configKey="workingDaysPerMonth" hint="Mặc định: 26 ngày" min={1} max={31} />
          <ConfigInput label="Số giờ/ngày" configKey="hoursPerDay" hint="Mặc định: 8 giờ" min={1} max={24} />
          <ConfigInput label="Hệ số tăng ca" configKey="overtimeRate" hint="Mặc định: 1.5x" step={0.1} min={1} />
          <ConfigInput label="Tỷ lệ BHXH (%)" configKey="socialInsuranceRate" hint="Mặc định: 10.5% (8% BHXH + 1.5% BHYT + 1% BHTN)" step={0.1} min={0} max={100} />
          <ConfigInput label="Giảm trừ cá nhân" configKey="personalDeduction" hint={`Mặc định: ${formatMoney(11000000)}`} step={100000} min={0} />
          <ConfigInput label="Giảm trừ người phụ thuộc" configKey="dependentDeduction" hint={`Mặc định: ${formatMoney(4400000)}/người`} step={100000} min={0} />
        </div>
      </div>

      {/* Cấu hình nghỉ phép */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">📅 Cấu hình nghỉ phép</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConfigInput label="Phép năm mặc định (ngày/năm)" configKey="annualLeaveDefault" hint="Mặc định: 12 ngày/năm" min={0} max={365} />
          <ConfigInput label="Nghỉ ốm mặc định (ngày/năm)" configKey="sickLeaveDefault" hint="Mặc định: 30 ngày/năm" min={0} max={365} />
        </div>
      </div>

      {/* Thưởng KPI */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">🏆 Thưởng KPI theo hạng</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <label className="text-sm font-bold text-green-700 mb-1 block">Hạng A - Xuất sắc</label>
            <input type="number" value={config.bonusA} onChange={e => setConfig(p => ({ ...p, bonusA: e.target.value }))}
              step={100000} min={0} className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            <p className="text-xs text-green-600 mt-1">{formatMoney(config.bonusA || 0)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <label className="text-sm font-bold text-blue-700 mb-1 block">Hạng B - Tốt</label>
            <input type="number" value={config.bonusB} onChange={e => setConfig(p => ({ ...p, bonusB: e.target.value }))}
              step={100000} min={0} className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            <p className="text-xs text-blue-600 mt-1">{formatMoney(config.bonusB || 0)}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <label className="text-sm font-bold text-yellow-700 mb-1 block">Hạng C - Trung bình</label>
            <input type="number" value={config.bonusC} onChange={e => setConfig(p => ({ ...p, bonusC: e.target.value }))}
              step={100000} min={0} className="w-full border border-yellow-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            <p className="text-xs text-yellow-600 mt-1">{formatMoney(config.bonusC || 0)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <label className="text-sm font-bold text-red-700 mb-1 block">Hạng D - Yếu</label>
            <input type="number" value={config.bonusD} onChange={e => setConfig(p => ({ ...p, bonusD: e.target.value }))}
              step={100000} min={0} className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            <p className="text-xs text-red-600 mt-1">{formatMoney(config.bonusD || 0)}</p>
          </div>
        </div>
      </div>

      {/* Cấu hình chấm công */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">⏰ Cấu hình chấm công</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConfigInput label="Giờ tính đi trễ (phút sau giờ vào ca)" configKey="lateThresholdMinutes"
            hint="Mặc định: 15 phút. Ví dụ: Ca 08:00, nếu check-in sau 08:15 sẽ tính đi trễ." min={0} max={120} />
        </div>
      </div>

      {/* Nút lưu */}
      <div className="flex items-center gap-3">
        <button onClick={saveAllConfig} disabled={savingConfig}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium text-white ${savingConfig ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
          {savingConfig ? 'Đang lưu...' : 'Lưu tất cả cấu hình'}
        </button>
        <button onClick={resetConfig} className="px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">
          Khôi phục mặc định
        </button>
      </div>
    </div>
  );

  // === MAIN RENDER ===
  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">Cài đặt nhân sự</h2>
        <p className="text-sm text-gray-500 mt-1">Quản lý phòng ban, chức vụ, ca làm việc và cấu hình lương.</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {SUB_TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveSubTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeSubTab === tab.key ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeSubTab === 'departments' && renderDepartments()}
      {activeSubTab === 'positions' && renderPositions()}
      {activeSubTab === 'shifts' && renderShifts()}
      {activeSubTab === 'config' && renderConfig()}

      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-green-600 text-white">
          {toast}
        </div>
      )}
    </div>
  );
}

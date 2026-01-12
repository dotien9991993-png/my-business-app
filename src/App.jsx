import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from './supabaseClient';
// SalaryManagement component integrated below

// ============ VIETNAM TIMEZONE HELPERS (UTC+7) ============
// Lấy ngày giờ hiện tại theo múi giờ Việt Nam
const getVietnamDate = () => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
};

// Lấy ngày hôm nay theo định dạng YYYY-MM-DD (múi giờ VN)
const getTodayVN = () => {
  const vn = getVietnamDate();
  return vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-' + String(vn.getDate()).padStart(2, '0');
};

// Lấy datetime hiện tại theo ISO format với múi giờ VN (để lưu DB)
const getNowISOVN = () => {
  // Tạo ISO string với timezone +07:00
  const vn = getVietnamDate();
  const year = vn.getFullYear();
  const month = String(vn.getMonth() + 1).padStart(2, '0');
  const day = String(vn.getDate()).padStart(2, '0');
  const hours = String(vn.getHours()).padStart(2, '0');
  const minutes = String(vn.getMinutes()).padStart(2, '0');
  const seconds = String(vn.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
};

// Lấy datetime string ngắn gọn (cho hiển thị)
const getNowStringVN = () => {
  const vn = getVietnamDate();
  return vn.toLocaleString('vi-VN');
};

// Lấy date string YYYYMMDD cho generate số phiếu
const getDateStrVN = () => {
  const vn = getVietnamDate();
  return vn.getFullYear().toString() + String(vn.getMonth() + 1).padStart(2, '0') + String(vn.getDate()).padStart(2, '0');
};

// Format datetime cho hiển thị (từ DB)
const formatDateTimeVN = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

// Format date cho hiển thị
const formatDateVN = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};
// ============ END TIMEZONE HELPERS ============

// Simple hash-based router
const useHashRouter = () => {
  const [hash, setHash] = useState(window.location.hash.slice(1) || '');

  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash.slice(1) || '');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((path) => {
    window.location.hash = path;
  }, []);

  return { path: hash, navigate };
};

// Get tenant slug from subdomain
const getTenantSlug = () => {
  const hostname = window.location.hostname;
  
  // localhost hoặc IP -> dùng default tenant
  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return 'hoangnamaudio'; // Default cho development
  }
  
  // Vercel default domain (xxx.vercel.app) -> dùng default tenant
  if (hostname.endsWith('.vercel.app')) {
    return 'hoangnamaudio';
  }
  
  // Custom domain với subdomain
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const subdomain = parts[0];
    
    // Bỏ qua www
    if (subdomain === 'www') {
      return 'hoangnamaudio';
    }
    
    // Map các subdomain về tenant tương ứng
    // Thêm subdomain mới vào đây
    const subdomainMap = {
      'in': 'hoangnamaudio',      // in.hoangnamaudio.vn -> hoangnamaudio
      'app': 'hoangnamaudio',     // app.hoangnamaudio.vn -> hoangnamaudio
      'manage': 'hoangnamaudio',  // manage.hoangnamaudio.vn -> hoangnamaudio
      'erp': 'hoangnamaudio',     // erp.hoangnamaudio.vn -> hoangnamaudio
    };
    
    return subdomainMap[subdomain] || subdomain;
  }
  
  // domain.com without subdomain -> default
  return 'hoangnamaudio';
};

// Helper function format tiền VND
const formatMoney = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
};

function SalaryManagement({ 
  tenant, 
  currentUser, 
  allUsers, 
  tasks, 
  technicalJobs, 
  formatMoney,
  getTodayVN,
  getVietnamDate,
  supabase 
}) {
  const [salaries, setSalaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSalary, setSelectedSalary] = useState(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Create modal states
  const [createStep, setCreateStep] = useState(1);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});
  
  // *** FIX: Cache tasks và jobs khi modal mở để tránh bị reset khi realtime update ***
  const [cachedTasks, setCachedTasks] = useState([]);
  const [cachedJobs, setCachedJobs] = useState([]);

  // Phân quyền: Chỉ Admin mới thấy tất cả và tạo bảng lương
  const isAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'admin';

  const getCurrentMonth = () => {
    const vn = getVietnamDate();
    return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}`;
  };

  const resetForm = () => {
    setFormData({
      month: getCurrentMonth(),
      basic_salary: '',
      work_days: '26',
      livestream_revenue: '',
      livestream_commission: '6',
      livestream_note: '',
      media_videos: '',
      media_per_video: '',
      media_note: '',
      kho_orders: '',
      kho_per_order: '',
      kho_note: '',
      kythuat_jobs: '',
      kythuat_per_job: '200000',
      kythuat_note: '',
      sale_revenue: '',
      sale_commission: '',
      sale_note: '',
      bonus: '',
      deduction: '',
      note: ''
    });
    setCreateStep(1);
    setSelectedEmployee(null);
  };

  useEffect(() => {
    loadSalaries();
  }, [tenant]);

  const loadSalaries = async () => {
    if (!tenant) return;
    try {
      let query = supabase
        .from('salaries')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      
      // Nếu không phải admin, chỉ load bảng lương của mình
      if (!isAdmin) {
        query = query.eq('user_id', currentUser.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setSalaries(data || []);
    } catch (err) {
      console.error('Error loading salaries:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSalaries = (salaries || []).filter(s => {
    if (filterMonth && s.month !== filterMonth) return false;
    if (filterUser && s.user_id !== filterUser) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    return true;
  });

  const getStatusBadge = (status) => {
    const badges = {
      draft: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '📝 Nháp' },
      approved: { bg: 'bg-green-100', text: 'text-green-700', label: '✅ Đã duyệt' },
      paid: { bg: 'bg-blue-100', text: 'text-blue-700', label: '💰 Đã trả' }
    };
    const badge = badges[status] || badges.draft;
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>{badge.label}</span>;
  };

  const stats = {
    totalThisMonth: (salaries || []).filter(s => s.month === getCurrentMonth()).reduce((sum, s) => sum + parseFloat(s.total_salary || 0), 0),
    totalPending: (salaries || []).filter(s => s.status === 'draft').reduce((sum, s) => sum + parseFloat(s.total_salary || 0), 0),
    totalApproved: (salaries || []).filter(s => s.status === 'approved').reduce((sum, s) => sum + parseFloat(s.total_salary || 0), 0),
    totalPaid: (salaries || []).filter(s => s.status === 'paid').reduce((sum, s) => sum + parseFloat(s.total_salary || 0), 0)
  };

  // Calculate totals for create form
  const calculateTotals = () => {
    const basicSalary = parseFloat(formData.basic_salary) || 0;
    const workDays = parseFloat(formData.work_days) || 0;
    const actualBasic = workDays > 0 ? (basicSalary / 26) * workDays : 0;

    const livestreamRevenue = parseFloat(formData.livestream_revenue) || 0;
    const livestreamCommission = parseFloat(formData.livestream_commission) || 0;
    const livestreamTotal = livestreamRevenue >= 100000000 ? (livestreamRevenue * livestreamCommission / 100) : 0;

    const mediaVideos = parseFloat(formData.media_videos) || 0;
    const mediaPerVideo = parseFloat(formData.media_per_video) || 0;
    const mediaTotal = mediaVideos * mediaPerVideo;

    const khoOrders = parseFloat(formData.kho_orders) || 0;
    const khoPerOrder = parseFloat(formData.kho_per_order) || 0;
    const khoTotal = khoOrders * khoPerOrder;

    const kythuatJobs = parseFloat(formData.kythuat_jobs) || 0;
    const kythuatPerJob = parseFloat(formData.kythuat_per_job) || 0;
    const kythuatTotal = kythuatJobs * kythuatPerJob;

    const saleRevenue = parseFloat(formData.sale_revenue) || 0;
    const saleCommission = parseFloat(formData.sale_commission) || 0;
    const saleTotal = saleRevenue * saleCommission / 100;

    const bonus = parseFloat(formData.bonus) || 0;
    const deduction = parseFloat(formData.deduction) || 0;

    return {
      actualBasic,
      livestreamTotal,
      mediaTotal,
      khoTotal,
      kythuatTotal,
      saleTotal,
      bonus,
      deduction,
      grandTotal: actualBasic + livestreamTotal + mediaTotal + khoTotal + kythuatTotal + saleTotal + bonus - deduction
    };
  };

  const handleOpenCreate = () => {
    resetForm();
    // *** FIX: Cache tasks và jobs khi mở modal để tránh bị reset ***
    setCachedTasks([...(tasks || [])]);
    setCachedJobs([...(technicalJobs || [])]);
    setShowCreateModal(true);
  };

  // *** Sử dụng cachedTasks/cachedJobs khi modal đang mở ***
  const tasksToUse = showCreateModal ? cachedTasks : (tasks || []);
  const jobsToUse = showCreateModal ? cachedJobs : (technicalJobs || []);

  const handleSelectEmployee = (user) => {
    setSelectedEmployee(user);
    // Auto count tasks
    const month = formData.month || getCurrentMonth();
    const [year, monthNum] = month.split('-');
    const startDate = `${year}-${monthNum}-01`;
    const endDate = `${year}-${monthNum}-31`;

    // Count Media tasks - ĐỒNG BỘ logic với nút "Lấy từ hệ thống"
    const empName = (user.name || '').toLowerCase().trim();
    const empId = user.id;
    
    const mediaCount = tasksToUse.filter(t => {
      const taskAssignee = (t.assignee || '').toLowerCase().trim();
      const isAssigned = taskAssignee === empName || 
                         t.assignee === empId || 
                         t.assigned_to === empId ||
                         (t.assignee && t.assignee.toLowerCase && t.assignee.toLowerCase().includes(empName));
      const isDone = t.status === 'done' || t.status === 'completed' || t.status === 'Hoàn thành' || t.status === 'Hoàn Thành';
      const taskDate = t.completed_at || t.updated_at || t.createdAt || t.created_at;
      const inMonth = taskDate && taskDate >= startDate && taskDate <= endDate + 'T23:59:59';
      return isAssigned && isDone && inMonth;
    }).length;

    // Count Technical jobs
    const kythuatCount = jobsToUse.filter(j => {
      const techs = j.technicians || [];
      const isAssigned = techs.includes(user.id) || techs.includes(user.name) || 
                         j.assigned_to === user.id || j.technician === user.name || j.technician === user.id;
      const isDone = j.status === 'completed' || j.status === 'done' || j.status === 'Hoàn thành';
      const jobDate = j.completed_at || j.completedAt || j.updated_at || j.scheduledDate || j.createdAt;
      const inMonth = jobDate && jobDate >= startDate && jobDate <= endDate + 'T23:59:59';
      return isAssigned && isDone && inMonth;
    }).length;

    setFormData(prev => ({
      ...prev,
      media_videos: mediaCount.toString(),
      kythuat_jobs: kythuatCount.toString()
    }));
    setCreateStep(2);
  };

  const handleSaveSalary = async () => {
    if (!selectedEmployee) return;
    setSaving(true);
    const totals = calculateTotals();

    try {
      const dataToSave = {
        tenant_id: tenant.id,
        user_id: selectedEmployee.id,
        employee_name: selectedEmployee.name,
        month: formData.month,
        basic_salary: parseFloat(formData.basic_salary) || 0,
        work_days: parseFloat(formData.work_days) || 0,
        actual_basic: totals.actualBasic,
        livestream_revenue: parseFloat(formData.livestream_revenue) || 0,
        livestream_commission: parseFloat(formData.livestream_commission) || 0,
        livestream_total: totals.livestreamTotal,
        livestream_note: formData.livestream_note || '',
        media_videos: parseFloat(formData.media_videos) || 0,
        media_per_video: parseFloat(formData.media_per_video) || 0,
        media_total: totals.mediaTotal,
        media_note: formData.media_note || '',
        kho_orders: parseFloat(formData.kho_orders) || 0,
        kho_per_order: parseFloat(formData.kho_per_order) || 0,
        kho_total: totals.khoTotal,
        kho_note: formData.kho_note || '',
        kythuat_jobs: parseFloat(formData.kythuat_jobs) || 0,
        kythuat_per_job: parseFloat(formData.kythuat_per_job) || 0,
        kythuat_total: totals.kythuatTotal,
        kythuat_note: formData.kythuat_note || '',
        sale_revenue: parseFloat(formData.sale_revenue) || 0,
        sale_commission: parseFloat(formData.sale_commission) || 0,
        sale_total: totals.saleTotal,
        sale_note: formData.sale_note || '',
        bonus: totals.bonus,
        deduction: totals.deduction,
        total_salary: totals.grandTotal,
        note: formData.note || '',
        status: 'draft',
        created_by: currentUser?.name || '',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('salaries').insert(dataToSave);
      if (error) throw error;

      alert('✅ Đã tạo bảng lương thành công!');
      setShowCreateModal(false);
      loadSalaries();
    } catch (err) {
      console.error('Error:', err);
      alert('❌ Lỗi: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (salary, newStatus) => {
    if (!confirm(`Xác nhận chuyển sang "${newStatus === 'approved' ? 'Đã duyệt' : 'Đã trả'}"?`)) return;
    try {
      const updateData = { status: newStatus };
      if (newStatus === 'approved') {
        updateData.approved_at = new Date().toISOString();
        updateData.approved_by = currentUser?.name;
      } else if (newStatus === 'paid') {
        updateData.paid_at = new Date().toISOString();
        updateData.paid_by = currentUser?.name;
      }
      const { error } = await supabase.from('salaries').update(updateData).eq('id', salary.id);
      if (error) throw error;
      alert('✅ Đã cập nhật!');
      setSelectedSalary(null);
      loadSalaries();
    } catch (err) {
      alert('❌ Lỗi: ' + err.message);
    }
  };

  const handleDeleteSalary = async (id) => {
    if (!confirm('Xác nhận xóa bảng lương này?')) return;
    try {
      const { error } = await supabase.from('salaries').delete().eq('id', id);
      if (error) throw error;
      alert('✅ Đã xóa!');
      setSelectedSalary(null);
      loadSalaries();
    } catch (err) {
      alert('❌ Lỗi: ' + err.message);
    }
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">💰 {isAdmin ? 'Quản Lý Lương Đa Phòng Ban' : 'Bảng Lương Của Tôi'}</h2>
            <p className="text-gray-600 text-sm mt-1">{isAdmin ? 'Tính lương theo từng phòng ban, hỗ trợ nhân viên làm nhiều bộ phận' : 'Xem chi tiết lương hàng tháng'}</p>
          </div>
          {isAdmin && (
            <button onClick={handleOpenCreate} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-lg">
              ➕ Tạo bảng lương
            </button>
          )}
        </div>
      </div>

      {/* Stats - Chỉ Admin thấy */}
      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white">
            <div className="text-blue-100 text-sm mb-1">💰 Tổng tháng này</div>
            <div className="text-2xl font-bold">{formatMoney(stats.totalThisMonth)}</div>
          </div>
          <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-5 text-white">
            <div className="text-yellow-100 text-sm mb-1">📝 Chờ duyệt</div>
            <div className="text-2xl font-bold">{formatMoney(stats.totalPending)}</div>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-5 text-white">
            <div className="text-green-100 text-sm mb-1">✅ Đã duyệt</div>
            <div className="text-2xl font-bold">{formatMoney(stats.totalApproved)}</div>
          </div>
          <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl p-5 text-white">
            <div className="text-gray-100 text-sm mb-1">💸 Đã trả</div>
            <div className="text-2xl font-bold">{formatMoney(stats.totalPaid)}</div>
          </div>
        </div>
      )}

      {/* Filters & Table */}
      <div className="bg-white rounded-xl shadow-sm border">
        {/* Filters - Chỉ Admin thấy đầy đủ */}
        {isAdmin && (
          <div className="p-4 border-b bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">📅 Tháng</label>
                <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">👤 Nhân viên</label>
                <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  <option value="">Tất cả</option>
                  {(allUsers || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">📊 Trạng thái</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  <option value="all">Tất cả</option>
                  <option value="draft">Nháp</option>
                  <option value="approved">Đã duyệt</option>
                  <option value="paid">Đã trả</option>
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={() => { setFilterMonth(''); setFilterUser(''); setFilterStatus('all'); }} className="w-full px-4 py-2 border rounded-lg hover:bg-gray-100">🔄 Reset</button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {isAdmin && <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nhân viên</th>}
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Tháng</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Lương CB</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Ngày công</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Tổng lương</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Trạng thái</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredSalaries.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-6 py-12 text-center text-gray-500">
                    <div className="text-5xl mb-4">📭</div>
                    <div className="text-lg font-medium">{isAdmin ? 'Chưa có bảng lương nào' : 'Chưa có bảng lương nào cho bạn'}</div>
                  </td>
                </tr>
              ) : (
                filteredSalaries.map(salary => (
                  <tr key={salary.id} className="hover:bg-gray-50">
                    {isAdmin && <td className="px-4 py-3 font-medium">{salary.employee_name}</td>}
                    <td className="px-4 py-3">{salary.month}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(salary.basic_salary)}</td>
                    <td className="px-4 py-3 text-center">{salary.work_days || 0}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{formatMoney(salary.total_salary)}</td>
                    <td className="px-4 py-3 text-center">{getStatusBadge(salary.status)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setSelectedSalary(salary)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">👁️ Xem</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========== CREATE MODAL - INLINE ========== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">➕ Tạo Bảng Lương</h2>
                <p className="text-white/80 text-sm">{createStep === 1 ? 'Bước 1: Chọn nhân viên' : `Bước 2: ${selectedEmployee?.name}`}</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-2xl hover:bg-white/20 w-10 h-10 rounded-lg">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {createStep === 1 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {(allUsers || []).map(user => (
                    <button key={user.id} onClick={() => handleSelectEmployee(user)} className="p-4 border-2 rounded-xl hover:border-blue-500 hover:bg-blue-50 text-left">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                          {user.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="font-bold">{user.name}</div>
                          <div className="text-xs text-gray-500">{user.team || user.role}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {createStep === 2 && selectedEmployee && (
                <div className="space-y-5">
                  {/* Basic */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="font-bold text-blue-900 mb-3">📋 Thông tin cơ bản</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Tháng</label>
                        <input 
                          type="month" 
                          value={formData.month} 
                          onChange={(e) => {
                            const newMonth = e.target.value;
                            // Tự động cập nhật số video và job khi đổi tháng
                            if (newMonth && selectedEmployee) {
                              const [year, monthNum] = newMonth.split('-');
                              const startDate = `${year}-${monthNum}-01`;
                              const endDate = `${year}-${monthNum}-31`;
                              
                              // ĐỒNG BỘ logic với nút "Lấy từ hệ thống"
                              const empName = (selectedEmployee.name || '').toLowerCase().trim();
                              const empId = selectedEmployee.id;
                              
                              const mediaCount = tasksToUse.filter(t => {
                                const taskAssignee = (t.assignee || '').toLowerCase().trim();
                                const isAssigned = taskAssignee === empName || 
                                                   t.assignee === empId || 
                                                   t.assigned_to === empId ||
                                                   (t.assignee && t.assignee.toLowerCase && t.assignee.toLowerCase().includes(empName));
                                const isDone = t.status === 'done' || t.status === 'completed' || t.status === 'Hoàn thành' || t.status === 'Hoàn Thành';
                                const taskDate = t.completed_at || t.updated_at || t.createdAt || t.created_at;
                                const inMonth = taskDate && taskDate >= startDate && taskDate <= endDate + 'T23:59:59';
                                return isAssigned && isDone && inMonth;
                              }).length;
                              
                              const kythuatCount = jobsToUse.filter(j => {
                                const techs = j.technicians || [];
                                const isAssigned = techs.includes(selectedEmployee.id) || techs.includes(selectedEmployee.name) || 
                                                   j.assigned_to === selectedEmployee.id || j.technician === selectedEmployee.name || j.technician === selectedEmployee.id;
                                const isDone = j.status === 'completed' || j.status === 'done' || j.status === 'Hoàn thành';
                                const jobDate = j.completed_at || j.completedAt || j.updated_at || j.scheduledDate || j.createdAt;
                                const inMonth = jobDate && jobDate >= startDate && jobDate <= endDate + 'T23:59:59';
                                return isAssigned && isDone && inMonth;
                              }).length;
                              
                              setFormData(prev => ({
                                ...prev, 
                                month: newMonth,
                                media_videos: mediaCount.toString(),
                                kythuat_jobs: kythuatCount.toString()
                              }));
                            } else {
                              setFormData(prev => ({...prev, month: newMonth}));
                            }
                          }} 
                          className="w-full px-3 py-2 border rounded-lg" 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Lương cơ bản</label>
                        <input type="number" value={formData.basic_salary} onChange={(e) => setFormData({...formData, basic_salary: e.target.value})} placeholder="5000000" className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Số ngày công</label>
                        <input type="number" value={formData.work_days} onChange={(e) => setFormData({...formData, work_days: e.target.value})} placeholder="26" className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                    </div>
                    {formData.basic_salary && <div className="mt-2 text-sm">Lương thực tế: <strong className="text-blue-600">{formatMoney(totals.actualBasic)}</strong></div>}
                  </div>

                  {/* Livestream */}
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h3 className="font-bold text-purple-900 mb-3">🎥 Livestream (6% khi ≥ 100 triệu)</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Doanh thu</label>
                        <input type="number" value={formData.livestream_revenue} onChange={(e) => setFormData({...formData, livestream_revenue: e.target.value})} placeholder="100000000" className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">% Hoa hồng</label>
                        <input type="number" value={formData.livestream_commission} onChange={(e) => setFormData({...formData, livestream_commission: e.target.value})} placeholder="6" className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Ghi chú</label>
                        <input type="text" value={formData.livestream_note} onChange={(e) => setFormData({...formData, livestream_note: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                    </div>
                    {totals.livestreamTotal > 0 && <div className="mt-2 text-sm">Thưởng: <strong className="text-purple-600">+{formatMoney(totals.livestreamTotal)}</strong></div>}
                  </div>

                  {/* Media */}
                  <div className="bg-pink-50 border border-pink-200 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-bold text-pink-900">🎬 Media (Video)</h3>
                      <button 
                        type="button"
                        onClick={() => {
                          const month = formData.month;
                          if (!month || !selectedEmployee) return;
                          const [year, monthNum] = month.split('-');
                          const startDate = `${year}-${monthNum}-01`;
                          const endDate = `${year}-${monthNum}-31`;
                          
                          // Debug log
                          console.log('=== DEBUG MEDIA ===');
                          console.log('Selected Employee:', selectedEmployee.name, 'ID:', selectedEmployee.id);
                          console.log('Month range:', startDate, 'to', endDate);
                          console.log('Total tasks:', tasksToUse.length);
                          
                          // Log ALL tasks with status 'Hoàn Thành'
                          const allDoneTasks = tasksToUse.filter(t => 
                            t.status === 'Hoàn Thành' || t.status === 'Hoàn thành' || t.status === 'done' || t.status === 'completed'
                          );
                          console.log('All completed tasks:', allDoneTasks.length);
                          allDoneTasks.forEach((t, i) => {
                            console.log(`Done Task ${i}:`, {
                              title: t.title,
                              assignee: t.assignee,
                              assigned_to: t.assigned_to,
                              status: t.status,
                              updated_at: t.updated_at
                            });
                          });
                          
                          const completedTasks = tasksToUse.filter(t => {
                            // Kiểm tra assignee - LINH HOẠT hơn (so sánh không phân biệt hoa thường)
                            const empName = (selectedEmployee.name || '').toLowerCase().trim();
                            const empId = selectedEmployee.id;
                            const taskAssignee = (t.assignee || '').toLowerCase().trim();
                            const taskAssignedTo = t.assigned_to;
                            
                            const isAssigned = taskAssignee === empName || 
                                               t.assignee === empId || 
                                               taskAssignedTo === empId ||
                                               taskAssignedTo === empName ||
                                               (t.assignee && t.assignee.includes && t.assignee.toLowerCase().includes(empName));
                            
                            // Kiểm tra status done
                            const isDone = t.status === 'done' || t.status === 'completed' || t.status === 'Hoàn thành' || t.status === 'Hoàn Thành';
                            
                            // Kiểm tra thời gian
                            const taskDate = t.completed_at || t.updated_at || t.created_at;
                            const inMonth = taskDate && taskDate >= startDate && taskDate <= endDate + 'T23:59:59';
                            
                            // Debug từng task done
                            if (isDone) {
                              console.log('Checking task:', t.title, {
                                assignee: t.assignee,
                                empName: empName,
                                isAssigned: isAssigned,
                                taskDate: taskDate,
                                inMonth: inMonth
                              });
                            }
                            
                            return isAssigned && isDone && inMonth;
                          });
                          
                          console.log('Completed tasks found:', completedTasks.length);
                          
                          setFormData(prev => ({...prev, media_videos: completedTasks.length.toString()}));
                          if (completedTasks.length > 0) {
                            alert(`✅ Tìm thấy ${completedTasks.length} video hoàn thành!`);
                          } else {
                            alert('⚠️ Không tìm thấy video hoàn thành trong tháng này. Kiểm tra Console (F12) để xem chi tiết.');
                          }
                        }}
                        className="px-3 py-1 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-xs font-medium"
                      >
                        🔄 Lấy từ hệ thống
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Số video</label>
                        <input type="number" value={formData.media_videos} onChange={(e) => setFormData({...formData, media_videos: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Tiền/video</label>
                        <input type="number" value={formData.media_per_video} onChange={(e) => setFormData({...formData, media_per_video: e.target.value})} placeholder="200000" className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Ghi chú</label>
                        <input type="text" value={formData.media_note} onChange={(e) => setFormData({...formData, media_note: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                    </div>
                    {/* Danh sách video hoàn thành */}
                    {selectedEmployee && formData.month && (() => {
                      const [year, monthNum] = formData.month.split('-');
                      const startDate = `${year}-${monthNum}-01`;
                      const endDate = `${year}-${monthNum}-31`;
                      const completedTasks = tasksToUse.filter(t => {
                        // So sánh linh hoạt
                        const empName = (selectedEmployee.name || '').toLowerCase().trim();
                        const empId = selectedEmployee.id;
                        const taskAssignee = (t.assignee || '').toLowerCase().trim();
                        
                        const isAssigned = taskAssignee === empName || 
                                           t.assignee === empId || 
                                           t.assigned_to === empId ||
                                           (t.assignee && t.assignee.toLowerCase && t.assignee.toLowerCase().includes(empName));
                        
                        const isDone = t.status === 'done' || t.status === 'completed' || t.status === 'Hoàn thành' || t.status === 'Hoàn Thành';
                        const taskDate = t.completed_at || t.updated_at || t.createdAt || t.created_at;
                        const inMonth = taskDate && taskDate >= startDate && taskDate <= endDate + 'T23:59:59';
                        return isAssigned && isDone && inMonth;
                      });
                      if (completedTasks.length > 0) {
                        return (
                          <div className="mt-3 p-3 bg-white rounded-lg border border-pink-200">
                            <div className="text-xs font-medium text-pink-800 mb-2">📋 Video hoàn thành trong tháng ({completedTasks.length}):</div>
                            <div className="max-h-32 overflow-y-auto space-y-1">
                              {completedTasks.map((t, idx) => (
                                <div key={t.id || idx} className="text-xs text-gray-600 flex justify-between">
                                  <span>• {t.title || t.name || 'Video #' + (idx+1)}</span>
                                  <span className="text-gray-400">{(t.completed_at || t.updated_at || t.createdAt) ? new Date(t.completed_at || t.updated_at || t.createdAt).toLocaleDateString('vi-VN') : ''}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return <div className="mt-2 text-xs text-gray-500">Chưa có video hoàn thành trong tháng này</div>;
                    })()}
                    {totals.mediaTotal > 0 && <div className="mt-2 text-sm">Thưởng: <strong className="text-pink-600">+{formatMoney(totals.mediaTotal)}</strong></div>}
                  </div>

                  {/* Kho */}
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <h3 className="font-bold text-orange-900 mb-3">📦 Kho</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Số đơn</label>
                        <input type="number" value={formData.kho_orders} onChange={(e) => setFormData({...formData, kho_orders: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Tiền/đơn</label>
                        <input type="number" value={formData.kho_per_order} onChange={(e) => setFormData({...formData, kho_per_order: e.target.value})} placeholder="50000" className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Ghi chú</label>
                        <input type="text" value={formData.kho_note} onChange={(e) => setFormData({...formData, kho_note: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                    </div>
                    {totals.khoTotal > 0 && <div className="mt-2 text-sm">Thưởng: <strong className="text-orange-600">+{formatMoney(totals.khoTotal)}</strong></div>}
                  </div>

                  {/* Kỹ thuật */}
                  <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-bold text-cyan-900">🔧 Kỹ thuật (200k/job)</h3>
                      <button 
                        type="button"
                        onClick={() => {
                          const month = formData.month;
                          if (!month || !selectedEmployee) return;
                          const [year, monthNum] = month.split('-');
                          const startDate = `${year}-${monthNum}-01`;
                          const endDate = `${year}-${monthNum}-31`;
                          const completedJobs = jobsToUse.filter(j => {
                            // Kiểm tra technicians (array) hoặc assigned_to
                            const techs = j.technicians || [];
                            const isAssigned = techs.includes(selectedEmployee.id) || 
                                               techs.includes(selectedEmployee.name) ||
                                               j.assigned_to === selectedEmployee.id ||
                                               j.technician === selectedEmployee.name ||
                                               j.technician === selectedEmployee.id;
                            // Kiểm tra status
                            const isDone = j.status === 'completed' || j.status === 'done' || j.status === 'Hoàn thành';
                            // Kiểm tra thời gian
                            const jobDate = j.completed_at || j.completedAt || j.updated_at || j.scheduledDate || j.createdAt;
                            const inMonth = jobDate && jobDate >= startDate && jobDate <= endDate + 'T23:59:59';
                            return isAssigned && isDone && inMonth;
                          });
                          setFormData(prev => ({...prev, kythuat_jobs: completedJobs.length.toString()}));
                          if (completedJobs.length > 0) {
                            alert(`✅ Tìm thấy ${completedJobs.length} job hoàn thành!`);
                          } else {
                            alert('⚠️ Không tìm thấy job hoàn thành trong tháng này');
                          }
                        }}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-medium"
                      >
                        🔄 Lấy từ hệ thống
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Số job</label>
                        <input type="number" value={formData.kythuat_jobs} onChange={(e) => setFormData({...formData, kythuat_jobs: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Tiền/job</label>
                        <input type="number" value={formData.kythuat_per_job} onChange={(e) => setFormData({...formData, kythuat_per_job: e.target.value})} placeholder="200000" className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Ghi chú</label>
                        <input type="text" value={formData.kythuat_note} onChange={(e) => setFormData({...formData, kythuat_note: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                    </div>
                    {/* Danh sách job hoàn thành */}
                    {selectedEmployee && formData.month && (() => {
                      const [year, monthNum] = formData.month.split('-');
                      const startDate = `${year}-${monthNum}-01`;
                      const endDate = `${year}-${monthNum}-31`;
                      const completedJobs = jobsToUse.filter(j => {
                        const techs = j.technicians || [];
                        const isAssigned = techs.includes(selectedEmployee.id) || 
                                           techs.includes(selectedEmployee.name) ||
                                           j.assigned_to === selectedEmployee.id ||
                                           j.technician === selectedEmployee.name ||
                                           j.technician === selectedEmployee.id;
                        const isDone = j.status === 'completed' || j.status === 'done' || j.status === 'Hoàn thành';
                        const jobDate = j.completed_at || j.completedAt || j.updated_at || j.scheduledDate || j.createdAt;
                        const inMonth = jobDate && jobDate >= startDate && jobDate <= endDate + 'T23:59:59';
                        return isAssigned && isDone && inMonth;
                      });
                      if (completedJobs.length > 0) {
                        return (
                          <div className="mt-3 p-3 bg-white rounded-lg border border-cyan-200">
                            <div className="text-xs font-medium text-cyan-800 mb-2">📋 Job hoàn thành trong tháng ({completedJobs.length}):</div>
                            <div className="max-h-32 overflow-y-auto space-y-1">
                              {completedJobs.map((j, idx) => (
                                <div key={j.id || idx} className="text-xs text-gray-600 flex justify-between">
                                  <span>• {j.title || j.customerName || 'Job #' + (idx+1)} {j.type ? `(${j.type})` : ''}</span>
                                  <span className="text-gray-400">{(j.completed_at || j.completedAt || j.scheduledDate) ? new Date(j.completed_at || j.completedAt || j.scheduledDate).toLocaleDateString('vi-VN') : ''}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return <div className="mt-2 text-xs text-gray-500">Chưa có job hoàn thành trong tháng này</div>;
                    })()}
                    {totals.kythuatTotal > 0 && <div className="mt-2 text-sm">Thưởng: <strong className="text-cyan-600">+{formatMoney(totals.kythuatTotal)}</strong></div>}
                  </div>

                  {/* Sale */}
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <h3 className="font-bold text-green-900 mb-3">🛒 Sale</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Doanh thu</label>
                        <input type="number" value={formData.sale_revenue} onChange={(e) => setFormData({...formData, sale_revenue: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">% Hoa hồng</label>
                        <input type="number" value={formData.sale_commission} onChange={(e) => setFormData({...formData, sale_commission: e.target.value})} placeholder="5" className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Ghi chú</label>
                        <input type="text" value={formData.sale_note} onChange={(e) => setFormData({...formData, sale_note: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                    </div>
                    {totals.saleTotal > 0 && <div className="mt-2 text-sm">Thưởng: <strong className="text-green-600">+{formatMoney(totals.saleTotal)}</strong></div>}
                  </div>

                  {/* Bonus/Deduction */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <h3 className="font-bold text-gray-900 mb-3">± Thưởng / Khấu trừ</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">🎁 Thưởng</label>
                        <input type="number" value={formData.bonus} onChange={(e) => setFormData({...formData, bonus: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">➖ Khấu trừ</label>
                        <input type="number" value={formData.deduction} onChange={(e) => setFormData({...formData, deduction: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">📝 Ghi chú</label>
                        <input type="text" value={formData.note} onChange={(e) => setFormData({...formData, note: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-white">
                    <div className="flex justify-between items-center">
                      <span className="text-xl">💵 TỔNG LƯƠNG</span>
                      <span className="text-3xl font-bold">{formatMoney(totals.grandTotal)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-between">
              {createStep === 2 && <button onClick={() => setCreateStep(1)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">← Quay lại</button>}
              <div className="flex gap-3 ml-auto">
                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">Hủy</button>
                {createStep === 2 && (
                  <button onClick={handleSaveSalary} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                    {saving ? 'Đang lưu...' : '💾 Lưu'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== DETAIL MODAL - INLINE ========== */}
      {selectedSalary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">{selectedSalary.employee_name}</h2>
                <p className="text-white/80 text-sm">Tháng {selectedSalary.month}</p>
              </div>
              <button onClick={() => setSelectedSalary(null)} className="text-2xl hover:bg-white/20 w-10 h-10 rounded-lg">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span>Trạng thái:</span>
                {getStatusBadge(selectedSalary.status)}
              </div>

              <div className="bg-blue-50 rounded-xl p-4">
                <div className="flex justify-between">
                  <span>Lương cơ bản ({selectedSalary.work_days}/26 ngày)</span>
                  <span className="font-bold">{formatMoney(selectedSalary.actual_basic || 0)}</span>
                </div>
              </div>

              {selectedSalary.livestream_total > 0 && (
                <div className="bg-purple-50 rounded-xl p-4">
                  <div className="flex justify-between">
                    <span>🎥 Livestream ({formatMoney(selectedSalary.livestream_revenue)} × {selectedSalary.livestream_commission}%)</span>
                    <span className="font-bold text-purple-600">+{formatMoney(selectedSalary.livestream_total)}</span>
                  </div>
                </div>
              )}

              {selectedSalary.media_total > 0 && (
                <div className="bg-pink-50 rounded-xl p-4">
                  <div className="flex justify-between">
                    <span>🎬 Media ({selectedSalary.media_videos} video × {formatMoney(selectedSalary.media_per_video)})</span>
                    <span className="font-bold text-pink-600">+{formatMoney(selectedSalary.media_total)}</span>
                  </div>
                </div>
              )}

              {selectedSalary.kho_total > 0 && (
                <div className="bg-orange-50 rounded-xl p-4">
                  <div className="flex justify-between">
                    <span>📦 Kho ({selectedSalary.kho_orders} đơn × {formatMoney(selectedSalary.kho_per_order)})</span>
                    <span className="font-bold text-orange-600">+{formatMoney(selectedSalary.kho_total)}</span>
                  </div>
                </div>
              )}

              {selectedSalary.kythuat_total > 0 && (
                <div className="bg-cyan-50 rounded-xl p-4">
                  <div className="flex justify-between">
                    <span>🔧 Kỹ thuật ({selectedSalary.kythuat_jobs} job × {formatMoney(selectedSalary.kythuat_per_job)})</span>
                    <span className="font-bold text-cyan-600">+{formatMoney(selectedSalary.kythuat_total)}</span>
                  </div>
                </div>
              )}

              {selectedSalary.sale_total > 0 && (
                <div className="bg-green-50 rounded-xl p-4">
                  <div className="flex justify-between">
                    <span>🛒 Sale ({formatMoney(selectedSalary.sale_revenue)} × {selectedSalary.sale_commission}%)</span>
                    <span className="font-bold text-green-600">+{formatMoney(selectedSalary.sale_total)}</span>
                  </div>
                </div>
              )}

              {(selectedSalary.bonus > 0 || selectedSalary.deduction > 0) && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  {selectedSalary.bonus > 0 && <div className="flex justify-between text-green-600"><span>🎁 Thưởng</span><span>+{formatMoney(selectedSalary.bonus)}</span></div>}
                  {selectedSalary.deduction > 0 && <div className="flex justify-between text-red-600"><span>➖ Khấu trừ</span><span>-{formatMoney(selectedSalary.deduction)}</span></div>}
                </div>
              )}

              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-white">
                <div className="flex justify-between items-center">
                  <span className="text-xl">💵 TỔNG</span>
                  <span className="text-3xl font-bold">{formatMoney(selectedSalary.total_salary)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-between">
              <div>
                {selectedSalary.status === 'draft' && (
                  <button onClick={() => handleDeleteSalary(selectedSalary.id)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">🗑️ Xóa</button>
                )}
              </div>
              <div className="flex gap-3">
                {selectedSalary.status === 'draft' && (
                  <button onClick={() => handleStatusChange(selectedSalary, 'approved')} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">✅ Duyệt</button>
                )}
                {selectedSalary.status === 'approved' && (
                  <button onClick={() => handleStatusChange(selectedSalary, 'paid')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">💰 Đã trả</button>
                )}
                <button onClick={() => setSelectedSalary(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ END SALARY MANAGEMENT (MOVED OUTSIDE) ============

export default function SimpleMarketingSystem() {
  const { path, navigate } = useHashRouter();
  
  // Tenant state
  const [tenant, setTenant] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantError, setTenantError] = useState(null);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [activeModule, setActiveModule] = useState('media');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showCreateJobModal, setShowCreateJobModal] = useState(false);
  const [prefillJobData, setPrefillJobData] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [userPermissions, setUserPermissions] = useState({});

  const [allUsers, setAllUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [technicalJobs, setTechnicalJobs] = useState([]);

  // Finance Module States
  const [receiptsPayments, setReceiptsPayments] = useState([]);
  const [debts, setDebts] = useState([]);
  const [salaries, setSalaries] = useState([]);

  // Attendance Module States (Chấm công)
  const [attendances, setAttendances] = useState([]);
  const [todayAttendances, setTodayAttendances] = useState([]); // Nhiều ca trong ngày

  // Warehouse Module States
  const [products, setProducts] = useState([]);
  const [stockTransactions, setStockTransactions] = useState([]);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Attendance popup state (Chấm công nổi)
  const [showAttendancePopup, setShowAttendancePopup] = useState(false);

  // TasksView filter state (giữ khi đóng/mở modal)
  const [taskFilterTeam, setTaskFilterTeam] = useState('all');
  const [taskFilterStatus, setTaskFilterStatus] = useState('all');
  const [taskFilterAssignee, setTaskFilterAssignee] = useState('all');
  const [taskFilterCategory, setTaskFilterCategory] = useState('all');
  const [taskDateFilter, setTaskDateFilter] = useState('all');
  const [taskCustomStartDate, setTaskCustomStartDate] = useState('');
  const [taskCustomEndDate, setTaskCustomEndDate] = useState('');

  // TechnicalJobsView filter state
  const [jobFilterCreator, setJobFilterCreator] = useState('all');
  const [jobFilterTechnician, setJobFilterTechnician] = useState('all');
  const [jobFilterStatus, setJobFilterStatus] = useState('all');
  const [jobFilterMonth, setJobFilterMonth] = useState(new Date().getMonth() + 1);
  const [jobFilterYear, setJobFilterYear] = useState(new Date().getFullYear());
  const [jobFilterDateMode, setJobFilterDateMode] = useState('all'); // all, month, custom
  const [jobCustomStartDate, setJobCustomStartDate] = useState('');
  const [jobCustomEndDate, setJobCustomEndDate] = useState('');

  // Job Edit Draft - Chỉ lưu/load từ localStorage, không dùng state
  const saveJobEditDraft = (data) => {
    try {
      localStorage.setItem('jobEditDraft', JSON.stringify(data));
    } catch (e) { console.error('Error saving draft:', e); }
  };
  
  const loadJobEditDraft = (jobId) => {
    try {
      const saved = localStorage.getItem('jobEditDraft');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.jobId === jobId) return data;
      }
    } catch (e) { console.error('Error loading draft:', e); }
    return null;
  };
  
  const clearJobEditDraft = () => {
    localStorage.removeItem('jobEditDraft');
  };

  // Load tenant info on mount
  useEffect(() => {
    const loadTenant = async () => {
      try {
        const slug = getTenantSlug();
        const { data, error } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();
        
        if (error || !data) {
          setTenantError('Không tìm thấy công ty hoặc tài khoản đã bị khóa');
          setTenantLoading(false);
          return;
        }
        
        // Check plan expiry
        if (data.plan_expires_at && new Date(data.plan_expires_at) < new Date()) {
          setTenantError('Gói dịch vụ đã hết hạn. Vui lòng liên hệ để gia hạn.');
          setTenantLoading(false);
          return;
        }
        
        setTenant(data);
        setTenantLoading(false);
      } catch (err) {
        setTenantError('Lỗi kết nối. Vui lòng thử lại.');
        setTenantLoading(false);
      }
    };
    loadTenant();
  }, []);

  // Sync URL with activeModule and activeTab
  useEffect(() => {
    if (path && isLoggedIn) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length >= 1) {
        const module = parts[0];
        const tab = parts[1] || 'dashboard';
        
        if (['media', 'warehouse', 'sales', 'technical', 'finance'].includes(module)) {
          setActiveModule(module);
          setActiveTab(tab);
        }
      }
    }
  }, [path, isLoggedIn]);

  // Update URL when module/tab changes
  const navigateTo = useCallback((module, tab) => {
    setActiveModule(module);
    setActiveTab(tab);
    navigate(`${module}/${tab}`);
  }, [navigate]);

  // Permission helper: Check if user has full access to finance
  const hasFinanceFullAccess = () => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin' || currentUser.role === 'admin') return true;
    // Level 2+ can view all, Level 3 = full access
    return (currentUser.permissions?.finance || 0) >= 2;
  };

  // Check if user can create finance data (level 1 or 3)
  // Level 1: Tạo mới (chỉ xem/sửa/xóa cái mình tạo)
  // Level 2: Chỉ xem, không tạo
  // Level 3: Full quyền
  const canCreateFinance = () => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin' || currentUser.role === 'admin') return true;
    const level = currentUser.permissions?.finance || 0;
    return level >= 1; // Level 1, 2, 3 đều được tạo
  };

  // Check if user can edit/delete finance data (level 3 hoặc level 1,2 với data của mình)
  const canEditFinance = () => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin' || currentUser.role === 'admin') return true;
    return (currentUser.permissions?.finance || 0) >= 3;
  };
  
  // Check if user can edit their own finance data (level 1, 2)
  const canEditOwnFinance = (createdBy) => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin' || currentUser.role === 'admin') return true;
    const level = currentUser.permissions?.finance || 0;
    if (level >= 3) return true;
    // Level 1 và 2 được sửa/xóa của mình
    if ((level === 1 || level === 2) && createdBy === currentUser.name) return true;
    return false;
  };

  // Check if user can access a module
  const canAccessModule = (module) => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin' || currentUser.role === 'admin') return true;
    return (currentUser.permissions?.[module] || 0) > 0;
  };

  // Check if user can access a specific tab in a module
  const canAccessTab = (module, tabId) => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin' || currentUser.role === 'admin') return true;
    
    // Kiểm tra có quyền module không
    const moduleLevel = currentUser.permissions?.[module] || 0;
    if (moduleLevel === 0) return false;
    
    // Nếu không có allowed_tabs hoặc allowed_tabs rỗng cho module này -> cho xem tất cả
    const allowedTabs = currentUser.allowed_tabs?.[module];
    if (!allowedTabs || allowedTabs.length === 0) return true;
    
    // Kiểm tra tab có trong danh sách cho phép không
    return allowedTabs.includes(tabId);
  };

  const [templates] = useState([
    { id: 1, name: 'Facebook Ads Campaign', tasks: ['Thiết kế creative', 'Viết copy', 'Setup ads', 'Launch'], team: 'Content' },
    { id: 2, name: 'Blog Weekly', tasks: ['Research', 'Viết bài', 'Thiết kế ảnh', 'SEO', 'Đăng bài'], team: 'Content' },
    { id: 3, name: 'Social Daily', tasks: ['Tạo content', 'Thiết kế', 'Lên lịch'], team: 'Content' }
  ]);

  const [automations, setAutomations] = useState([
    { id: 1, name: 'Auto-approve', trigger: 'Video hoàn thành', action: 'Chuyển Chờ Duyệt', active: true },
    { id: 2, name: 'Nhắc deadline', trigger: 'Trước 24h', action: 'Gửi Slack', active: true },
    { id: 3, name: 'Video quá hạn', trigger: 'Quá deadline', action: 'Email Manager', active: false }
  ]);

  const [integrations, setIntegrations] = useState({
    calendar: { on: false, email: '' },
    facebook: { on: false, page: '' },
    slack: { on: false, channel: '' }
  });

  // ===================
  // SUPABASE FUNCTIONS
  // ===================

  // Load data from Supabase on mount
  // Restore session từ localStorage khi load trang - LUÔN FETCH USER MỚI TỪ SUPABASE
  useEffect(() => {
    if (!tenant) return; // Chờ tenant load xong
    
    const savedUser = localStorage.getItem(`${tenant.slug}_user`);
    const savedLoggedIn = localStorage.getItem(`${tenant.slug}_loggedIn`);
    
    if (savedUser && savedLoggedIn === 'true') {
      try {
        const user = JSON.parse(savedUser);
        // Verify user belongs to this tenant
        if (user.tenant_id === tenant.id) {
          // QUAN TRỌNG: Fetch user mới nhất từ Supabase để cập nhật quyền
          const fetchLatestUser = async () => {
            try {
              const { data: latestUser, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .eq('tenant_id', tenant.id)
                .single();
              
              if (error || !latestUser) {
                // User không tồn tại hoặc bị xóa -> logout
                console.log('User not found, clearing session');
                localStorage.removeItem(`${tenant.slug}_user`);
                localStorage.removeItem(`${tenant.slug}_loggedIn`);
                return;
              }
              
              // Cập nhật với dữ liệu mới nhất
              setCurrentUser(latestUser);
              setIsLoggedIn(true);
              // Cập nhật localStorage với dữ liệu mới
              localStorage.setItem(`${tenant.slug}_user`, JSON.stringify(latestUser));
              
              // Set default route if no hash
              if (!window.location.hash) {
                navigate('media/dashboard');
              }
            } catch (err) {
              console.error('Error fetching latest user:', err);
              // Fallback to saved user nếu không fetch được
              setCurrentUser(user);
              setIsLoggedIn(true);
            }
          };
          
          fetchLatestUser();
        } else {
          // Wrong tenant, clear session
          localStorage.removeItem(`${tenant.slug}_user`);
          localStorage.removeItem(`${tenant.slug}_loggedIn`);
        }
      } catch (error) {
        console.error('Error restoring session:', error);
        localStorage.removeItem(`${tenant.slug}_user`);
        localStorage.removeItem(`${tenant.slug}_loggedIn`);
      }
    }
  }, [tenant, navigate]);

  useEffect(() => {
    // Chờ tenant load xong mới load data
    if (!tenant) return;
    
    loadUsers();
    loadTasks();
    loadTechnicalJobs();
    loadFinanceData();
    loadWarehouseData();
    loadPermissions();

    // Subscribe to realtime task changes
    const tasksChannel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'tasks' }, 
        () => loadTasks()
      )
      .subscribe();

    // Subscribe to realtime technical jobs changes
    const jobsChannel = supabase
      .channel('jobs-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'technical_jobs' }, 
        () => loadTechnicalJobs()
      )
      .subscribe();

    // Subscribe to realtime finance changes
    const financeChannel = supabase
      .channel('finance-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts_payments' }, () => loadFinanceData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, () => loadFinanceData())
      .subscribe();

    // Subscribe to realtime warehouse changes
    const warehouseChannel = supabase
      .channel('warehouse-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadWarehouseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transactions' }, () => loadWarehouseData())
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(jobsChannel);
      supabase.removeChannel(financeChannel);
      supabase.removeChannel(warehouseChannel);
    };
  }, [tenant]);

  // Load today attendance when user logs in
  useEffect(() => {
    const loadTodayAttendances = async () => {
      if (!tenant || !currentUser) return;
      try {
        const today = getTodayVN();
        const { data } = await supabase
          .from('attendances')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('user_id', currentUser.id)
          .eq('date', today)
          .order('check_in', { ascending: true });
        
        setTodayAttendances(data || []);
      } catch (err) {
        setTodayAttendances([]);
      }
    };
    
    loadTodayAttendances();
  }, [tenant, currentUser]);

  // Hàm refresh tất cả data
  const refreshAllData = async () => {
    if (!tenant) return;
    console.log('🔄 Refreshing all data...');
    await Promise.all([
      loadUsers(),
      loadTasks(),
      loadTechnicalJobs(),
      loadFinanceData(),
      loadWarehouseData(),
      loadPermissions()
    ]);
    console.log('✅ Data refreshed!');
  };

  // Auto refresh khi app được focus lại (quan trọng cho PWA trên iOS)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && tenant && isLoggedIn) {
        console.log('📱 App visible - refreshing data...');
        refreshAllData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cũng refresh khi window được focus
    const handleFocus = () => {
      if (tenant && isLoggedIn) {
        refreshAllData();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [tenant, isLoggedIn]);

  const loadUsers = async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadPermissions = async () => {
    try {
      const { data } = await supabase.from('user_permissions').select('*');
      const permsObj = {};
      (data || []).forEach(p => {
        if (!permsObj[p.user_id]) permsObj[p.user_id] = {};
        permsObj[p.user_id][p.module] = p.permission_level;
      });
      setUserPermissions(permsObj);
    } catch (e) { /* ignore */ }
  };

  const loadTasks = async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const formattedTasks = (data || []).map(task => ({
        id: task.id,
        title: task.title,
        assignee: task.assignee,
        team: task.team,
        status: task.status,
        dueDate: task.due_date,
        platform: task.platform,
        isOverdue: task.is_overdue,
        comments: task.comments || [],
        postLinks: task.post_links || [],
        priority: task.priority,
        description: task.description,
        category: task.category || '',
        created_at: task.created_at,
        updated_at: task.updated_at,
        completed_at: task.completed_at
      }));
      
      setTasks(formattedTasks);
      setLoading(false);
    } catch (error) {
      console.error('Error loading tasks:', error);
      setLoading(false);
    }
  };

  const loadTechnicalJobs = async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('technical_jobs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const formattedJobs = (data || []).map(job => ({
        id: job.id,
        title: job.title,
        type: job.type,
        customerName: job.customer_name,
        customerPhone: job.customer_phone,
        address: job.address,
        equipment: job.equipment || [],
        technicians: job.technicians || [job.technician],
        scheduledDate: job.scheduled_date,
        scheduledTime: job.scheduled_time,
        customerPayment: job.customer_payment,
        createdBy: job.created_by,
        status: job.status,
        createdAt: job.created_at,
        expenses: job.expenses || []
      }));
      
      setTechnicalJobs(formattedJobs);
    } catch (error) {
      console.error('Error loading technical jobs:', error);
    }
  };

  // Finance Data Loading
  const loadFinanceData = async () => {
    if (!tenant) return;
    try {
      const [receiptsRes, debtsRes, salariesRes] = await Promise.all([
        supabase.from('receipts_payments').select('*').eq('tenant_id', tenant.id).order('receipt_date', { ascending: false }).limit(50),
        supabase.from('debts').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('salaries').select('*').eq('tenant_id', tenant.id).order('year', { ascending: false }).order('month', { ascending: false }).limit(50)
      ]);
      
      if (receiptsRes.data) setReceiptsPayments(receiptsRes.data);
      if (debtsRes.data) setDebts(debtsRes.data);
      if (salariesRes.data) setSalaries(salariesRes.data);
    } catch (error) {
      console.error('Error loading finance data:', error);
    }
  };

  // Attendance Data Loading (Chấm công)
  const loadAttendanceData = async () => {
    if (!tenant || !currentUser) return;
    try {
      const today = getTodayVN();
      
      // Load tất cả chấm công (Admin) hoặc của mình (User)
      const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'admin';
      
      let query = supabase
        .from('attendances')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('date', { ascending: false })
        .order('check_in', { ascending: false });
      
      if (!isAdmin) {
        query = query.eq('user_id', currentUser.id);
      }
      
      const { data, error } = await query.limit(100);
      
      if (error) throw error;
      setAttendances(data || []);
      
      // Load chấm công hôm nay của user hiện tại
      const { data: todayData } = await supabase
        .from('attendances')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('user_id', currentUser.id)
        .eq('date', today)
        .single();
      
      setTodayAttendance(todayData || null);
    } catch (error) {
      console.error('Error loading attendance data:', error);
    }
  };

  // Warehouse Data Loading
  const loadWarehouseData = async () => {
    if (!tenant) return;
    try {
      const [productsRes, transactionsRes] = await Promise.all([
        supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name', { ascending: true }),
        supabase.from('stock_transactions').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(100)
      ]);
      
      if (productsRes.data) setProducts(productsRes.data);
      if (transactionsRes.data) setStockTransactions(transactionsRes.data);
    } catch (error) {
      console.error('Error loading warehouse data:', error);
    }
  };

  const changeStatus = async (taskId, newStatus) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId);
      
      if (error) throw error;
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      if (selectedTask?.id === taskId) {
        setSelectedTask({ ...selectedTask, status: newStatus });
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('❌ Lỗi khi cập nhật trạng thái!');
    }
  };

  const createNewTask = async (title, platform, priority, dueDate, description, assignee, category = '') => {
    try {
      setLoading(true);
      
      // Get team of assignee
      const assignedUser = allUsers.find(u => u.name === assignee);
      const taskTeam = assignedUser ? assignedUser.team : currentUser.team;
      
      // Build task data - chỉ thêm category nếu có giá trị
      const taskData = {
        tenant_id: tenant.id,
        title,
        assignee: assignee,
        team: taskTeam,
        status: 'Nháp',
        due_date: dueDate,
        platform,
        priority,
        description,
        is_overdue: false,
        comments: [],
        post_links: []
      };
      
      // Chỉ thêm category nếu có giá trị (tránh lỗi nếu cột chưa tồn tại)
      if (category) {
        taskData.category = category;
      }
      
      const { error } = await supabase
        .from('tasks')
        .insert([taskData]);
      
      if (error) throw error;
      
      // Notify assignee if different from creator
      if (assignee !== currentUser.name) {
        const assigneeUser = allUsers.find(u => u.name === assignee);
        if (assigneeUser) {
          await createNotification({
            userId: assigneeUser.id,
            type: 'task_assigned',
            title: '📋 Video mới được giao',
            message: `${currentUser.name} đã giao task cho bạn: "${title}"`,
            icon: '📋',
            referenceType: 'task',
            referenceId: null // Task vừa tạo chưa có ID
          });
        }
      }
      
      alert('✅ Đã tạo task mới!');
      setShowCreateTaskModal(false);
      await loadTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      alert('❌ Lỗi khi tạo task: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const createTechnicalJob = async (jobData) => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('technical_jobs')
        .insert([{
          tenant_id: tenant.id,
          title: jobData.title,
          type: jobData.type,
          customer_name: jobData.customerName,
          customer_phone: jobData.customerPhone,
          address: jobData.address,
          equipment: jobData.equipment,
          technicians: jobData.technicians,
          scheduled_date: jobData.scheduledDate,
          scheduled_time: jobData.scheduledTime,
          customer_payment: jobData.customerPayment,
          created_by: jobData.createdBy || currentUser.name,
          status: 'Chờ XN'
        }]);
      
      if (error) throw error;
      
      // Notify all technicians
      for (const techName of jobData.technicians) {
        if (techName !== currentUser.name) {
          const techUser = allUsers.find(u => u.name === techName);
          if (techUser) {
            await createNotification({
              userId: techUser.id,
              type: 'job_assigned',
              title: '🔧 Công việc kỹ thuật mới',
              message: `${currentUser.name} đã giao: "${jobData.title}" tại ${jobData.address || 'N/A'}`,
              icon: '🔧',
              referenceType: 'job',
              referenceId: null
            });
          }
        }
      }
      
      alert('✅ Đã tạo công việc kỹ thuật!');
      setShowCreateJobModal(false);
      await loadTechnicalJobs();
    } catch (error) {
      console.error('Error creating technical job:', error);
      alert('❌ Lỗi khi tạo công việc!');
    } finally {
      setLoading(false);
    }
  };

  const deleteTechnicalJob = async (jobId) => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('technical_jobs')
        .delete()
        .eq('id', jobId);
      
      if (error) throw error;
      
      alert('✅ Đã xóa công việc!');
      setShowJobModal(false);
      setSelectedJob(null);
      await loadTechnicalJobs();
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('❌ Lỗi khi xóa công việc!');
    } finally {
      setLoading(false);
    }
  };

  const addComment = async (taskId, commentText) => {
    if (!commentText.trim()) return;
    
    try {
      const task = tasks.find(t => t.id === taskId);
      const timeStr = getNowStringVN();
      
      const newComments = [...(task.comments || []), { 
        user: currentUser.name, 
        text: commentText, 
        time: timeStr 
      }];
      
      const { error } = await supabase
        .from('tasks')
        .update({ comments: newComments })
        .eq('id', taskId);
      
      if (error) throw error;
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, comments: newComments } : t));
      
      if (selectedTask?.id === taskId) {
        setSelectedTask({ ...selectedTask, comments: newComments });
      }
      
      // Notify task assignee if not self
      if (task.assignee !== currentUser.name) {
        addNotification({
          type: 'comment',
          taskId: task.id,
          title: '💬 Comment mới',
          message: `${currentUser.name} đã comment vào task "${task.title}"`,
          read: false,
          createdAt: getNowISOVN()
        });
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('❌ Lỗi khi thêm comment!');
    }
  };

  const addPostLink = async (taskId, url, type) => {
    if (!url.trim()) return;
    
    try {
      const task = tasks.find(t => t.id === taskId);
      const timeStr = getNowStringVN();
      
      const newLink = {
        url,
        type: type || 'Other',
        addedBy: currentUser.name,
        addedAt: timeStr
      };
      
      const newPostLinks = [...(task.postLinks || []), newLink];
      
      const { error } = await supabase
        .from('tasks')
        .update({ post_links: newPostLinks })
        .eq('id', taskId);
      
      if (error) throw error;
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, postLinks: newPostLinks } : t));
      
      if (selectedTask?.id === taskId) {
        setSelectedTask({ ...selectedTask, postLinks: newPostLinks });
      }
    } catch (error) {
      console.error('Error adding post link:', error);
      alert('❌ Lỗi khi thêm link!');
    }
  };

  const removePostLink = async (taskId, linkIndex) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      const newPostLinks = (task.postLinks || []).filter((_, i) => i !== linkIndex);
      
      const { error } = await supabase
        .from('tasks')
        .update({ post_links: newPostLinks })
        .eq('id', taskId);
      
      if (error) throw error;
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, postLinks: newPostLinks } : t));
      
      if (selectedTask?.id === taskId) {
        setSelectedTask({ ...selectedTask, postLinks: newPostLinks });
      }
    } catch (error) {
      console.error('Error removing post link:', error);
      alert('❌ Lỗi khi xóa link!');
    }
  };

  const createFromTemplate = async (template) => {
    try {
      setLoading(true);
      const assignee = allUsers.find(u => u.team === template.team)?.name || currentUser.name;
      
      const newTasks = template.tasks.map((title, i) => {
        // Tính ngày theo VN timezone
        const vn = getVietnamDate();
        vn.setDate(vn.getDate() + i + 1);
        const dueDate = vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-' + String(vn.getDate()).padStart(2, '0');
        return {
          title,
          assignee,
          team: template.team,
          status: 'Nháp',
          due_date: dueDate,
          platform: 'Campaign',
          is_overdue: false,
          comments: [],
          post_links: []
        };
      });
      
      const { error } = await supabase
        .from('tasks')
        .insert(newTasks);
      
      if (error) throw error;
      
      alert(`✅ Tạo ${newTasks.length} tasks từ "${template.name}"`);
      await loadTasks();
    } catch (error) {
      console.error('Error creating from template:', error);
      alert('❌ Lỗi khi tạo từ template!');
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (taskId) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      
      if (error) throw error;
      
      setTasks(tasks.filter(t => t.id !== taskId));
      setShowModal(false);
      alert('✅ Đã xóa task!');
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('❌ Lỗi khi xóa task!');
    }
  };

  const changeUserRole = async (userId, newRole) => {
    if (currentUser.role !== 'Admin') {
      alert('❌ Chỉ Admin mới có quyền thay đổi vai trò!');
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);
      
      if (error) throw error;
      
      await loadUsers();
      alert('✅ Đã thay đổi vai trò!');
    } catch (error) {
      console.error('Error changing role:', error);
      alert('❌ Lỗi khi thay đổi vai trò!');
    }
  };

  const deleteUser = async (userId) => {
    if (currentUser.role !== 'Admin') {
      alert('❌ Chỉ Admin mới có quyền xóa user!');
      return;
    }

    if (userId === currentUser.id) {
      alert('❌ Không thể xóa chính mình!');
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);
      
      if (error) throw error;
      
      await loadUsers();
      alert('✅ Đã xóa user!');
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('❌ Lỗi khi xóa user!');
    }
  };

  // ============ NOTIFICATION SYSTEM (Supabase-based) ============
  
  // Load notifications từ Supabase
  const loadNotifications = async () => {
    if (!tenant || !currentUser) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  };

  // Tạo thông báo mới (lưu vào Supabase)
  const createNotification = async ({
    userId,
    type,
    title,
    message,
    icon = '🔔',
    referenceType = null,
    referenceId = null,
    data = {}
  }) => {
    if (!tenant) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          tenant_id: tenant.id,
          user_id: userId,
          type,
          title,
          message,
          icon,
          reference_type: referenceType,
          reference_id: referenceId,
          data,
          created_by: currentUser?.id
        });
      
      if (error) throw error;
    } catch (err) {
      console.error('Error creating notification:', err);
    }
  };

  // Gửi thông báo cho nhiều người
  const notifyUsers = async (userIds, notifData) => {
    if (!tenant || !userIds.length) return;
    try {
      const notifications = userIds.map(userId => ({
        tenant_id: tenant.id,
        user_id: userId,
        type: notifData.type,
        title: notifData.title,
        message: notifData.message,
        icon: notifData.icon || '🔔',
        reference_type: notifData.referenceType || null,
        reference_id: notifData.referenceId || null,
        data: notifData.data || {},
        created_by: currentUser?.id
      }));
      
      const { error } = await supabase
        .from('notifications')
        .insert(notifications);
      
      if (error) throw error;
    } catch (err) {
      console.error('Error notifying users:', err);
    }
  };

  // Thông báo cho Admin/Manager
  const notifyAdmins = async (notifData) => {
    const adminIds = (allUsers || [])
      .filter(u => u.role === 'Admin' || u.role === 'admin' || u.role === 'Manager')
      .map(u => u.id);
    await notifyUsers(adminIds, notifData);
  };

  // Đánh dấu đã đọc 1 thông báo
  const markAsRead = async (notifId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notifId);
      
      if (error) throw error;
      
      setNotifications(prev => 
        prev.map(n => n.id === notifId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  // Đánh dấu tất cả đã đọc
  const markAllAsRead = async () => {
    if (!currentUser) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', currentUser.id)
        .eq('is_read', false);
      
      if (error) throw error;
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  // Xóa thông báo
  const deleteNotification = async (notifId) => {
    try {
      const notif = notifications.find(n => n.id === notifId);
      
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notifId);
      
      if (error) {
        console.error('Delete error:', error);
        throw error;
      }
      
      setNotifications(prev => prev.filter(n => n.id !== notifId));
      if (notif && !notif.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      console.log('✅ Đã xóa thông báo:', notifId);
    } catch (err) {
      console.error('Error deleting notification:', err);
      alert('❌ Lỗi khi xóa: ' + err.message);
    }
  };

  // Xóa tất cả thông báo đã đọc
  const clearReadNotifications = async () => {
    if (!currentUser) return;
    try {
      // Lấy IDs của các thông báo đã đọc
      const readNotifIds = notifications.filter(n => n.is_read).map(n => n.id);
      
      if (readNotifIds.length === 0) return;
      
      const { error } = await supabase
        .from('notifications')
        .delete()
        .in('id', readNotifIds);
      
      if (error) {
        console.error('Delete error:', error);
        throw error;
      }
      
      // Cập nhật local state
      setNotifications(prev => prev.filter(n => !n.is_read));
      console.log('✅ Đã xóa', readNotifIds.length, 'thông báo');
    } catch (err) {
      console.error('Error clearing notifications:', err);
      alert('❌ Lỗi khi xóa: ' + err.message);
    }
  };

  // ============ NOTIFICATION HELPERS (Gọi khi có sự kiện) ============

  // Khi giao task mới
  const notifyTaskAssigned = async (task, assigneeId) => {
    await createNotification({
      userId: assigneeId,
      type: 'task_assigned',
      title: '📝 Task mới được giao',
      message: `Bạn được giao task: "${task.title}"`,
      icon: '📝',
      referenceType: 'task',
      referenceId: task.id,
      data: { taskTitle: task.title, dueDate: task.dueDate }
    });
  };

  // Khi task hoàn thành
  const notifyTaskCompleted = async (task) => {
    // Thông báo cho Manager/Admin
    await notifyAdmins({
      type: 'task_completed',
      title: '✅ Task hoàn thành',
      message: `${currentUser.name} đã hoàn thành: "${task.title}"`,
      icon: '✅',
      referenceType: 'task',
      referenceId: task.id
    });
  };

  // Khi task bị từ chối
  const notifyTaskRejected = async (task, assigneeId, reason) => {
    await createNotification({
      userId: assigneeId,
      type: 'task_rejected',
      title: '❌ Task bị từ chối',
      message: `Task "${task.title}" bị từ chối: ${reason || 'Không đạt yêu cầu'}`,
      icon: '❌',
      referenceType: 'task',
      referenceId: task.id,
      data: { reason }
    });
  };

  // Khi có job kỹ thuật mới
  const notifyNewJob = async (job, technicianIds) => {
    await notifyUsers(technicianIds, {
      type: 'job_assigned',
      title: '🔧 Công việc kỹ thuật mới',
      message: `Công việc mới: "${job.title}" tại ${job.address}`,
      icon: '🔧',
      referenceType: 'job',
      referenceId: job.id,
      data: { address: job.address, scheduledDate: job.scheduled_date }
    });
  };

  // Khi job thay đổi trạng thái
  const notifyJobStatusChanged = async (job, creatorId) => {
    await createNotification({
      userId: creatorId,
      type: 'job_status_changed',
      title: `📍 Cập nhật công việc`,
      message: `"${job.title}" → ${job.status}`,
      icon: job.status === 'Hoàn thành' ? '✅' : '📍',
      referenceType: 'job',
      referenceId: job.id
    });
  };

  // Khi có phiếu thu/chi chờ duyệt
  const notifyFinancePending = async (receipt) => {
    await notifyAdmins({
      type: 'finance_pending',
      title: receipt.type === 'thu' ? '💵 Phiếu thu chờ duyệt' : '💸 Phiếu chi chờ duyệt',
      message: `${currentUser.name} tạo phiếu ${receipt.type}: ${formatMoney(receipt.amount)}`,
      icon: receipt.type === 'thu' ? '💵' : '💸',
      referenceType: 'receipt',
      referenceId: receipt.id,
      data: { amount: receipt.amount, type: receipt.type }
    });
  };

  // Khi phiếu được duyệt/từ chối
  const notifyFinanceApproved = async (receipt, creatorId, approved) => {
    await createNotification({
      userId: creatorId,
      type: approved ? 'finance_approved' : 'finance_rejected',
      title: approved ? '✅ Phiếu đã được duyệt' : '❌ Phiếu bị từ chối',
      message: `Phiếu ${receipt.type} ${receipt.receipt_number}: ${formatMoney(receipt.amount)}`,
      icon: approved ? '✅' : '❌',
      referenceType: 'receipt',
      referenceId: receipt.id
    });
  };

  // Khi có bảng lương mới
  const notifySalaryCreated = async (salary, employeeId) => {
    await createNotification({
      userId: employeeId,
      type: 'salary_created',
      title: '💰 Bảng lương mới',
      message: `Bảng lương tháng ${salary.month} đã sẵn sàng: ${formatMoney(salary.total_salary)}`,
      icon: '💰',
      referenceType: 'salary',
      referenceId: salary.id,
      data: { month: salary.month, amount: salary.total_salary }
    });
  };

  // Khi lương được duyệt/thanh toán
  const notifySalaryPaid = async (salary, employeeId) => {
    await createNotification({
      userId: employeeId,
      type: 'salary_paid',
      title: '💵 Lương đã thanh toán',
      message: `Lương tháng ${salary.month}: ${formatMoney(salary.total_salary)} đã được thanh toán`,
      icon: '💵',
      referenceType: 'salary',
      referenceId: salary.id
    });
  };

  // Khi có comment mới
  const notifyNewComment = async (task, commenterId, commentText) => {
    // Thông báo cho người được giao task (nếu không phải người comment)
    if (task.assignee_id && task.assignee_id !== commenterId) {
      const assigneeUser = allUsers.find(u => u.name === task.assignee);
      if (assigneeUser) {
        await createNotification({
          userId: assigneeUser.id,
          type: 'comment_new',
          title: '💬 Bình luận mới',
          message: `${currentUser.name}: "${commentText.substring(0, 50)}${commentText.length > 50 ? '...' : ''}"`,
          icon: '💬',
          referenceType: 'task',
          referenceId: task.id
        });
      }
    }
  };

  // Kiểm tra deadline và gửi thông báo (check trong DB để tránh trùng)
  const checkDeadlineNotifications = async () => {
    if (!currentUser || !tasks.length || !tenant) return;
    
    const now = new Date();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    for (const task of tasks) {
      if (task.assignee !== currentUser.name) continue;
      if (task.status === 'Hoàn Thành') continue;
      if (!task.dueDate) continue;
      
      const dueDate = new Date(task.dueDate);
      const diffHours = (dueDate - now) / (1000 * 60 * 60);
      
      // Sắp hết hạn (trong 24h)
      if (diffHours > 0 && diffHours <= 24) {
        // Check trong DB xem đã có thông báo chưa (trong 24h qua)
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', currentUser.id)
          .eq('type', 'deadline_warning')
          .eq('reference_id', task.id)
          .gte('created_at', oneDayAgo)
          .limit(1);
        
        if (!existing || existing.length === 0) {
          await createNotification({
            userId: currentUser.id,
            type: 'deadline_warning',
            title: '⏰ Sắp đến deadline',
            message: `Task "${task.title}" sẽ đến hạn trong ${Math.floor(diffHours)} giờ`,
            icon: '⏰',
            referenceType: 'task',
            referenceId: task.id
          });
        }
      }
      
      // Đã quá hạn
      if (diffHours < 0 && diffHours > -24) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', currentUser.id)
          .eq('type', 'deadline_overdue')
          .eq('reference_id', task.id)
          .gte('created_at', oneDayAgo)
          .limit(1);
        
        if (!existing || existing.length === 0) {
          await createNotification({
            userId: currentUser.id,
            type: 'deadline_overdue',
            title: '🚨 Task quá hạn!',
            message: `Task "${task.title}" đã quá hạn ${Math.abs(Math.floor(diffHours))} giờ`,
            icon: '🚨',
            referenceType: 'task',
            referenceId: task.id
          });
        }
      }
    }
  };

  // Subscribe realtime notifications
  useEffect(() => {
    if (!tenant || !currentUser) return;
    
    // Load notifications ban đầu
    loadNotifications();
    
    // Subscribe to realtime
    const notifChannel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`
        }, 
        (payload) => {
          console.log('🔔 New notification:', payload.new);
          setNotifications(prev => [payload.new, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(notifChannel);
    };
  }, [tenant, currentUser]);

  // Check deadline mỗi giờ (chỉ khi tasks thay đổi, KHÔNG dependency notifications)
  useEffect(() => {
    if (!currentUser || !tasks.length) return;
    
    // Delay để tránh chạy ngay khi mount
    const timeout = setTimeout(() => {
      checkDeadlineNotifications();
    }, 5000);
    
    const interval = setInterval(checkDeadlineNotifications, 60 * 60 * 1000); // Mỗi giờ
    
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [tasks, currentUser]); // Bỏ notifications khỏi dependency

  // Legacy addNotification for backward compatibility
  const addNotification = (notif) => {
    // Chuyển sang dùng createNotification mới
    if (currentUser) {
      createNotification({
        userId: currentUser.id,
        type: notif.type || 'general',
        title: notif.title,
        message: notif.message,
        icon: notif.title?.charAt(0) || '🔔',
        referenceType: notif.taskId ? 'task' : null,
        referenceId: notif.taskId || null
      });
    }
  };

  // ============ END NOTIFICATION SYSTEM ============

  const handleLogin = async (email, password) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('email', email)
        .eq('password', password)
        .single();
      
      if (error || !data) {
        alert('❌ Sai email hoặc mật khẩu!');
        return;
      }
      
      setCurrentUser(data);
      setIsLoggedIn(true);
      setShowLoginModal(false);
      
      // Lưu session vào localStorage (thêm tenant slug)
      localStorage.setItem(`${tenant.slug}_user`, JSON.stringify(data));
      localStorage.setItem(`${tenant.slug}_loggedIn`, 'true');
      
      // Navigate to default page
      navigate('media/dashboard');
    } catch (error) {
      console.error('Error logging in:', error);
      alert('❌ Lỗi khi đăng nhập!');
    }
  };

  const handleRegister = async (name, email, password, team, role) => {
    if (!name || !email || !password || !team || !role) {
      alert('❌ Vui lòng điền đầy đủ thông tin!');
      return;
    }
    
    try {
      // Check max users limit
      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);
      
      if (count >= tenant.max_users) {
        alert(`❌ Đã đạt giới hạn ${tenant.max_users} người dùng. Vui lòng nâng cấp gói!`);
        return;
      }
      
      const { data: existing } = await supabase
        .from('users')
        .select('email')
        .eq('tenant_id', tenant.id)
        .eq('email', email)
        .single();
      
      if (existing) {
        alert('❌ Email đã tồn tại!');
        return;
      }
      
      const { error } = await supabase
        .from('users')
        .insert([{ tenant_id: tenant.id, name, email, password, team, role }]);
      
      if (error) throw error;
      
      alert('✅ Đăng ký thành công! Vui lòng đăng nhập.');
      setShowRegisterModal(false);
      setShowLoginModal(true);
      await loadUsers();
    } catch (error) {
      console.error('Error registering:', error);
      alert('❌ Lỗi khi đăng ký!');
    }
  };

  // PHÂN QUYỀN: Lọc tasks theo role
  const visibleTasks = useMemo(() => {
    if (!currentUser) return tasks;
    
    if (currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager') {
      return tasks; // Admin & Manager thấy TẤT CẢ
    } else if (currentUser.role === 'Team Lead') {
      const userTeams = currentUser.teams || [currentUser.team].filter(Boolean);
      return tasks.filter(t => userTeams.includes(t.team));
    } else {
      return tasks.filter(t => t.assignee === currentUser.name);
    }
  }, [currentUser, tasks]);

  const reportData = useMemo(() => {
    const tasksToUse = visibleTasks;
    const statusStats = [
      { name: 'Nháp', value: tasksToUse.filter(t => t.status === 'Nháp').length, color: '#9ca3af' },
      { name: 'Chờ Duyệt', value: tasksToUse.filter(t => t.status === 'Chờ Duyệt').length, color: '#f59e0b' },
      { name: 'Đã Duyệt', value: tasksToUse.filter(t => t.status === 'Đã Duyệt').length, color: '#10b981' },
      { name: 'Đang Làm', value: tasksToUse.filter(t => t.status === 'Đang Làm').length, color: '#3b82f6' },
      { name: 'Hoàn Thành', value: tasksToUse.filter(t => t.status === 'Hoàn Thành').length, color: '#6b7280' }
    ].filter(s => s.value > 0);

    const teamStats = ['Content', 'Edit Video', 'Livestream', 'Kho'].map(t => ({
      name: t,
      completed: tasksToUse.filter(x => x.team === t && x.status === 'Hoàn Thành').length,
      inProgress: tasksToUse.filter(x => x.team === t && x.status === 'Đang Làm').length
    }));

    return { statusStats, teamStats };
  }, [visibleTasks]);

  // ============ PERMISSION HELPER FUNCTIONS ============
  // Check if user has permission for a module
  const hasPermission = (module, minLevel = 1) => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin' || currentUser.role === 'admin') return true;
    const userLevel = currentUser.permissions?.[module] || 0;
    return userLevel >= minLevel;
  };

  // Get user's permission level for a module
  const getPermissionLevel = (module) => {
    if (!currentUser) return 0;
    if (currentUser.role === 'Admin' || currentUser.role === 'admin') return 3;
    return currentUser.permissions?.[module] || 0;
  };

  // Check if user can view data (level >= 1)
  const canView = (module) => hasPermission(module, 1);

  // Check if user can view all data (level >= 2)
  const canViewAll = (module) => hasPermission(module, 2);

  // Check if user can edit/delete (level >= 3)
  const canEdit = (module) => hasPermission(module, 3);

  // Filter data based on permission level
  const filterByPermission = (data, module, userField = 'created_by') => {
    if (!currentUser) return [];
    const level = getPermissionLevel(module);
    if (level >= 2) return data; // Level 2+ can see all
    // Level 1: Only see own data (created by user OR assigned to user)
    return data.filter(item => 
      item[userField] === currentUser.name || 
      item.assignee === currentUser.name ||
      item.created_by === currentUser.name
    );
  };
  // ============ END PERMISSION HELPERS ============

  const getStatusColor = (s) => {
    const c = { 'Nháp': 'bg-gray-200 text-gray-700', 'Chưa Quay': 'bg-yellow-200 text-yellow-800', 'Đã Quay': 'bg-blue-200 text-blue-800', 'Đang Edit': 'bg-orange-200 text-orange-800', 'Hoàn Thành': 'bg-green-500 text-white' };
    return c[s] || 'bg-gray-200';
  };

  const getTeamColor = (t) => {
    const c = { 
      'Content': 'bg-blue-100 text-blue-700', 
      'Edit Video': 'bg-purple-100 text-purple-700', 
      'Livestream': 'bg-pink-100 text-pink-700',
      'Kho': 'bg-orange-100 text-orange-700'
    };
    return c[t] || 'bg-gray-100';
  };

  const NotificationsDropdown = () => {
    if (!showNotifications) return null;
    
    return (
      <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-2xl border z-50 max-h-[500px] overflow-hidden flex flex-col">
        <div className="p-4 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">🔔 Thông Báo</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full"
                >
                  ✓ Đọc tất cả
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <div className="text-6xl mb-4">🔕</div>
              <p>Không có thông báo</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${!notif.is_read ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                  onClick={() => {
                    markAsRead(notif.id);
                    // Navigate to reference if exists
                    if (notif.reference_type === 'task') {
                      const task = tasks.find(t => t.id === notif.reference_id);
                      if (task) {
                        setSelectedTask(task);
                        setShowModal(true);
                        setActiveModule('media');
                      }
                    } else if (notif.reference_type === 'job') {
                      const job = technicalJobs.find(j => j.id === notif.reference_id);
                      if (job) {
                        setSelectedJob(job);
                        setShowJobModal(true);
                        setActiveModule('technical');
                      }
                    } else if (notif.reference_type === 'receipt') {
                      // Mở module tài chính và tab thu/chi
                      setActiveModule('finance');
                      setActiveTab('receipts');
                      // Tìm và highlight phiếu nếu có
                      const receipt = receiptsPayments.find(r => r.id === notif.reference_id);
                      if (receipt) {
                        // Có thể set state để mở modal chi tiết phiếu
                        console.log('Opening receipt:', receipt);
                      }
                    } else if (notif.reference_type === 'salary') {
                      setActiveModule('finance');
                      setActiveTab('salaries');
                    } else if (notif.type?.includes('finance')) {
                      // Fallback cho các thông báo tài chính không có reference_id
                      setActiveModule('finance');
                      setActiveTab('receipts');
                    }
                    setShowNotifications(false);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <span className="text-2xl">{notif.icon || '🔔'}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{notif.title}</span>
                          {!notif.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{notif.message}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(notif.created_at).toLocaleString('vi-VN')}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notif.id);
                      }}
                      className="text-gray-400 hover:text-red-500 text-xl p-1"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {notifications.length > 0 && (
          <div className="p-3 border-t bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-500">{notifications.length} thông báo</span>
            <button
              onClick={clearReadNotifications}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              🗑️ Xóa đã đọc
            </button>
          </div>
        )}
      </div>
    );
  };

  const CreateJobModal = () => {
    const [title, setTitle] = useState('');
    const [type, setType] = useState('Lắp đặt');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [address, setAddress] = useState('');
    const [equipment, setEquipment] = useState('');
    const [technicians, setTechnicians] = useState([currentUser.name]);
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');
    const [customerPayment, setCustomerPayment] = useState('');

    // Prefill from task if available
    useEffect(() => {
      if (prefillJobData) {
        setTitle(prefillJobData.title || '');
        setCustomerName(prefillJobData.customerName || '');
        setCustomerPhone(prefillJobData.customerPhone || '');
        setAddress(prefillJobData.address || '');
        setEquipment(prefillJobData.equipment || '');
        setScheduledDate(prefillJobData.scheduledDate || '');
      }
    }, []);

    const getTechnicalUsers = () => {
      // Trả về tất cả users có thể được giao công việc kỹ thuật
      return allUsers.filter(u => u.is_active !== false);
    };

    const technicalUsers = getTechnicalUsers();

    const toggleTechnician = (techName) => {
      if (technicians.includes(techName)) {
        setTechnicians(technicians.filter(t => t !== techName));
      } else {
        setTechnicians([...technicians, techName]);
      }
    };

    if (!showCreateJobModal) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b bg-gradient-to-r from-orange-500 to-red-600 text-white sticky top-0">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">🔧 Tạo Công Việc Kỹ Thuật</h2>
              <button onClick={() => setShowCreateJobModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Tiêu đề *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Lắp dàn karaoke - Quán ABC"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Loại công việc *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="Lắp đặt">Lắp đặt mới</option>
                <option value="Bảo trì">Bảo trì/Bảo dưỡng</option>
                <option value="Sửa chữa">Sửa chữa</option>
                <option value="Nâng cấp">Nâng cấp</option>
              </select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Tên khách hàng *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Anh/Chị..."
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Số điện thoại *</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0909..."
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Địa chỉ *</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Đường ABC, Quận XYZ..."
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Thiết bị</label>
              <textarea
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                placeholder="VD: Dàn karaoke Paramax, Loa sub 18 inch x2, Micro..."
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                rows="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">👥 Kỹ thuật viên * (Chọn nhiều)</label>
              <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                {technicalUsers.map(user => (
                  <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={technicians.includes(user.name)}
                      onChange={() => toggleTechnician(user.name)}
                      className="w-4 h-4 text-orange-600"
                    />
                    <span className="text-sm">{user.name} - {user.team}</span>
                  </label>
                ))}
              </div>
              {technicians.length === 0 && (
                <p className="text-xs text-red-600 mt-1">⚠️ Chọn ít nhất 1 kỹ thuật viên</p>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">Ngày hẹn *</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Giờ</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">💰 Thu của khách (VNĐ)</label>
              <input
                type="number"
                value={customerPayment}
                onChange={(e) => setCustomerPayment(e.target.value)}
                placeholder="39300000"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="p-6 border-t bg-gray-50 flex gap-3">
            <button
              onClick={() => setShowCreateJobModal(false)}
              className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                if (!title || !customerName || !customerPhone || !address || !scheduledDate) {
                  alert('⚠️ Vui lòng điền đầy đủ thông tin bắt buộc!');
                  return;
                }
                if (technicians.length === 0) {
                  alert('⚠️ Vui lòng chọn ít nhất 1 kỹ thuật viên!');
                  return;
                }
                createTechnicalJob({
                  title,
                  type,
                  customerName,
                  customerPhone,
                  address,
                  equipment: equipment ? equipment.split(',').map(e => e.trim()) : [],
                  technicians,
                  scheduledDate,
                  scheduledTime: scheduledTime || '09:00',
                  customerPayment: customerPayment ? parseFloat(customerPayment) : 0,
                  createdBy: currentUser.name
                });
              }}
              className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
            >
              ✅ Tạo Công Việc
            </button>
          </div>
        </div>
      </div>
    );
  };

  const JobDetailModal = () => {
    const [showReassignModal, setShowReassignModal] = useState(false);
    const [newTechnicians, setNewTechnicians] = useState([]);
    
    // Edit state - local trong modal
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editCustomerName, setEditCustomerName] = useState('');
    const [editCustomerPhone, setEditCustomerPhone] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editEquipment, setEditEquipment] = useState('');
    const [editScheduledDate, setEditScheduledDate] = useState('');
    const [editScheduledTime, setEditScheduledTime] = useState('');
    const [editPayment, setEditPayment] = useState('');
    const [editTechnicians, setEditTechnicians] = useState([]);
    
    // Chi phí công việc
    const [showAddExpense, setShowAddExpense] = useState(false);
    const [expenseDesc, setExpenseDesc] = useState('');
    const [expenseAmount, setExpenseAmount] = useState('');
    const [expenseCategory, setExpenseCategory] = useState('Tiền xe');
    
    const expenseCategories = ['Tiền xe', 'Chi phí ăn uống', 'Chi phí khác'];
    
    // Lấy danh sách KTV từ users
    const technicianUsers = allUsers.filter(u => 
      u.departments?.includes('technical') || u.role === 'Admin' || u.role === 'admin'
    );

    // Kiểm tra và load draft khi modal mở (chỉ 1 lần)
    useEffect(() => {
      if (selectedJob && !isEditing) {
        const draft = loadJobEditDraft(selectedJob.id);
        if (draft) {
          // Có draft cũ - hỏi user có muốn tiếp tục không
          if (window.confirm('Có bản nháp chưa lưu. Tiếp tục chỉnh sửa?')) {
            setIsEditing(true);
            setEditTitle(draft.title || selectedJob.title || '');
            setEditCustomerName(draft.customerName || selectedJob.customerName || '');
            setEditCustomerPhone(draft.customerPhone || selectedJob.customerPhone || '');
            setEditAddress(draft.address || selectedJob.address || '');
            setEditEquipment(draft.equipment || (selectedJob.equipment ? selectedJob.equipment.join('\n') : ''));
            setEditScheduledDate(draft.scheduledDate || selectedJob.scheduledDate || '');
            setEditScheduledTime(draft.scheduledTime || selectedJob.scheduledTime || '');
            setEditPayment(draft.payment || selectedJob.customerPayment || '');
            setEditTechnicians(draft.technicians || selectedJob.technicians || []);
          } else {
            clearJobEditDraft();
          }
        }
      }
    }, [selectedJob?.id]);

    // Auto-save draft khi đang edit (debounced)
    useEffect(() => {
      if (!isEditing || !selectedJob) return;
      
      const timer = setTimeout(() => {
        saveJobEditDraft({
          jobId: selectedJob.id,
          title: editTitle,
          customerName: editCustomerName,
          customerPhone: editCustomerPhone,
          address: editAddress,
          equipment: editEquipment,
          scheduledDate: editScheduledDate,
          scheduledTime: editScheduledTime,
          payment: editPayment,
          technicians: editTechnicians
        });
      }, 1000);
      
      return () => clearTimeout(timer);
    }, [isEditing, editTitle, editCustomerName, editCustomerPhone, editAddress, editEquipment, editScheduledDate, editScheduledTime, editPayment, editTechnicians]);

    if (!selectedJob) return null;
    
    // Chi phí từ job
    const jobExpenses = selectedJob.expenses || [];
    const totalExpenses = jobExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    const netProfit = (selectedJob.customerPayment || 0) - totalExpenses;

    // Kiểm tra quyền sửa/xóa
    const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'admin';
    const isCreator = selectedJob.createdBy === currentUser.name;
    const isLocked = selectedJob.status === 'Hoàn thành' || selectedJob.status === 'Hủy';
    const canEdit = !isLocked && (isAdmin || isCreator);
    const canDelete = !isLocked && (isAdmin || isCreator);
    
    // Thêm chi phí
    const addExpense = async () => {
      if (!expenseAmount) {
        alert('⚠️ Vui lòng nhập số tiền!');
        return;
      }
      
      // Chỉ yêu cầu mô tả khi chọn "Chi phí khác"
      if (expenseCategory === 'Chi phí khác' && !expenseDesc) {
        alert('⚠️ Vui lòng nhập mô tả cho chi phí khác!');
        return;
      }
      
      const newExpense = {
        id: Date.now(),
        description: expenseCategory === 'Chi phí khác' ? expenseDesc : '',
        amount: parseFloat(expenseAmount),
        category: expenseCategory,
        addedBy: currentUser.name,
        addedAt: getNowISOVN()
      };
      
      const updatedExpenses = [...jobExpenses, newExpense];
      
      console.log('Saving expenses:', updatedExpenses);
      console.log('Job ID:', selectedJob.id);
      
      try {
        const { data, error } = await supabase
          .from('technical_jobs')
          .update({ expenses: updatedExpenses })
          .eq('id', selectedJob.id)
          .select();
        
        console.log('Response:', data, error);
        
        if (error) throw error;
        
        alert('✅ Đã thêm chi phí: ' + formatMoney(newExpense.amount));
        setSelectedJob({ ...selectedJob, expenses: updatedExpenses });
        setExpenseDesc('');
        setExpenseAmount('');
        setShowAddExpense(false);
        await loadTechnicalJobs();
      } catch (error) {
        console.error('Error adding expense:', error);
        alert('❌ Lỗi khi thêm chi phí: ' + error.message);
      }
    };
    
    // Xóa chi phí
    const removeExpense = async (expenseId) => {
      if (!window.confirm('Xóa chi phí này?')) return;
      
      const updatedExpenses = jobExpenses.filter(e => e.id !== expenseId);
      
      try {
        const { error } = await supabase
          .from('technical_jobs')
          .update({ expenses: updatedExpenses })
          .eq('id', selectedJob.id);
        
        if (error) throw error;
        
        setSelectedJob({ ...selectedJob, expenses: updatedExpenses });
        await loadTechnicalJobs();
      } catch (error) {
        console.error('Error removing expense:', error);
        alert('❌ Lỗi khi xóa chi phí!');
      }
    };

    const openEditMode = () => {
      setEditTitle(selectedJob.title || '');
      setEditCustomerName(selectedJob.customerName || '');
      setEditCustomerPhone(selectedJob.customerPhone || '');
      setEditAddress(selectedJob.address || '');
      setEditEquipment(selectedJob.equipment ? selectedJob.equipment.join('\n') : '');
      setEditScheduledDate(selectedJob.scheduledDate || '');
      setEditScheduledTime(selectedJob.scheduledTime || '');
      setEditPayment(selectedJob.customerPayment || '');
      setEditTechnicians(selectedJob.technicians || []);
      setIsEditing(true);
    };

    const cancelEdit = () => {
      setIsEditing(false);
      clearJobEditDraft();
    };

    const saveEditJob = async () => {
      if (!editTitle || !editCustomerName) {
        alert('⚠️ Vui lòng nhập tiêu đề và tên khách hàng!');
        return;
      }
      try {
        const equipmentArray = editEquipment.split('\n').filter(e => e.trim());
        const { error } = await supabase
          .from('technical_jobs')
          .update({
            title: editTitle,
            customer_name: editCustomerName,
            customer_phone: editCustomerPhone,
            address: editAddress,
            equipment: equipmentArray,
            scheduled_date: editScheduledDate,
            scheduled_time: editScheduledTime,
            customer_payment: parseFloat(editPayment) || 0,
            technicians: editTechnicians
          })
          .eq('id', selectedJob.id);

        if (error) throw error;
        alert('✅ Cập nhật thành công!');
        setIsEditing(false);
        clearJobEditDraft();
        await loadTechnicalJobs();
        setSelectedJob({
          ...selectedJob,
          title: editTitle,
          customerName: editCustomerName,
          customerPhone: editCustomerPhone,
          address: editAddress,
          equipment: equipmentArray,
          scheduledDate: editScheduledDate,
          scheduledTime: editScheduledTime,
          customerPayment: parseFloat(editPayment) || 0,
          technicians: editTechnicians
        });
      } catch (error) {
        console.error('Error updating job:', error);
        alert('❌ Lỗi khi cập nhật: ' + error.message);
      }
    };

    // Tạo phiếu thu từ công việc kỹ thuật
    const createReceiptFromJob = async (job) => {
      try {
        // Tạo mã phiếu thu
        const today = new Date();
        const dateStr = today.toISOString().slice(0,10).replace(/-/g, '');
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const receiptNumber = `PT-${dateStr}-${randomNum}`;
        
        // Handle cả snake_case và camelCase
        const paymentAmount = job.customerPayment || job.customer_payment || 0;
        const custName = job.customerName || job.customer_name || '';
        const custPhone = job.customerPhone || job.customer_phone || '';
        const custAddress = job.address || '';
        const techNames = job.technicians?.join(', ') || 'N/A';

        const { error } = await supabase
          .from('receipts_payments')
          .insert([{
            tenant_id: tenant.id,
            receipt_number: receiptNumber,
            type: 'thu',
            amount: paymentAmount,
            description: `Thu tiền lắp đặt: ${job.title}`,
            category: 'Lắp đặt tại nhà khách',
            status: 'pending',
            receipt_date: getTodayVN(),
            note: `Khách hàng: ${custName}\nSĐT: ${custPhone}\nĐịa chỉ: ${custAddress}\nKỹ thuật viên: ${techNames}\n\n[Tự động tạo từ công việc kỹ thuật - Chờ duyệt]`,
            created_by: currentUser.name,
            created_at: getNowISOVN()
          }]);

        if (error) throw error;
        
        // Reload receipts data
        await loadFinanceData();
        
        return true;
      } catch (error) {
        console.error('Error creating receipt:', error);
        alert('❌ Lỗi khi tạo phiếu thu: ' + error.message);
        return false;
      }
    };

    // Tạo phiếu chi từ chi phí công việc
    const createExpenseReceiptsFromJob = async (job) => {
      const expenses = job.expenses || [];
      if (expenses.length === 0) return true;
      
      try {
        const today = new Date();
        const dateStr = today.toISOString().slice(0,10).replace(/-/g, '');
        
        // Handle cả snake_case và camelCase
        const custName = job.customerName || job.customer_name || '';
        const techNames = job.technicians?.join(', ') || 'N/A';
        
        // Tạo 1 phiếu chi tổng hợp
        const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const expenseDetails = expenses.map(e => `- ${e.category}${e.description ? ': ' + e.description : ''}: ${formatMoney(e.amount)}`).join('\n');
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const receiptNumber = `PC-${dateStr}-${randomNum}`;

        const { error } = await supabase
          .from('receipts_payments')
          .insert([{
            tenant_id: tenant.id,
            receipt_number: receiptNumber,
            type: 'chi',
            amount: totalExpense,
            description: `Chi phí lắp đặt: ${job.title}`,
            category: 'Vận chuyển',
            status: 'pending',
            receipt_date: getTodayVN(),
            note: `Chi tiết chi phí:\n${expenseDetails}\n\nKhách hàng: ${custName}\nKỹ thuật viên: ${techNames}\n\n[Tự động tạo từ công việc kỹ thuật - Chờ duyệt]`,
            created_by: currentUser.name,
            created_at: getNowISOVN()
          }]);

        if (error) throw error;
        
        await loadFinanceData();
        return true;
      } catch (error) {
        console.error('Error creating expense receipts:', error);
        alert('❌ Lỗi khi tạo phiếu chi: ' + error.message);
        return false;
      }
    };

    const updateJobStatus = async (newStatus) => {
      // Block nếu status hiện tại đã lock
      if (selectedJob.status === 'Hoàn thành' || selectedJob.status === 'Hủy') {
        alert('⚠️ Không thể thay đổi trạng thái!\n\nCông việc đã ' + 
              (selectedJob.status === 'Hoàn thành' ? 'hoàn thành' : 'bị hủy') + 
              ' và đã bị khóa.');
        return;
      }

      // Confirm khi chuyển sang status cuối
      if (newStatus === 'Hoàn thành') {
        // *** FIX: Load lại job mới nhất từ database để có dữ liệu chính xác ***
        let latestJob = selectedJob;
        try {
          const { data: freshJob, error: fetchError } = await supabase
            .from('technical_jobs')
            .select('*')
            .eq('id', selectedJob.id)
            .single();
          
          if (fetchError) {
            console.error('Error fetching latest job:', fetchError);
          } else if (freshJob) {
            // Map snake_case sang camelCase
            latestJob = {
              ...freshJob,
              customerPayment: freshJob.customer_payment || freshJob.customerPayment || 0,
              customerName: freshJob.customer_name || freshJob.customerName || '',
              customerPhone: freshJob.customer_phone || freshJob.customerPhone || '',
              technicians: freshJob.technicians || [],
              expenses: freshJob.expenses || []
            };
            console.log('Loaded latest job data:', latestJob);
          }
        } catch (err) {
          console.error('Error loading latest job:', err);
        }

        const hasPayment = (latestJob.customerPayment || latestJob.customer_payment || 0) > 0;
        const hasExpenses = (latestJob.expenses || []).length > 0;
        const totalExp = (latestJob.expenses || []).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const paymentAmount = latestJob.customerPayment || latestJob.customer_payment || 0;
        
        // Xây dựng thông báo
        let confirmMsg = `✅ Xác nhận hoàn thành công việc?\n\n`;
        
        if (hasPayment) {
          confirmMsg += `💰 Thu của khách: ${formatMoney(paymentAmount)}\n`;
        }
        if (hasExpenses) {
          confirmMsg += `💸 Chi phí: ${formatMoney(totalExp)}\n`;
        }
        if (hasPayment && hasExpenses) {
          confirmMsg += `📊 Còn lại: ${formatMoney(paymentAmount - totalExp)}\n`;
        }
        
        if (hasPayment || hasExpenses) {
          confirmMsg += `\n📝 Bạn có muốn TẠO PHIẾU TỰ ĐỘNG không?\n`;
          if (hasPayment) confirmMsg += `• Phiếu thu: ${formatMoney(paymentAmount)}\n`;
          if (hasExpenses) confirmMsg += `• Phiếu chi: ${formatMoney(totalExp)}\n`;
          confirmMsg += `\n• Nhấn OK → Tạo phiếu tự động\n• Nhấn Cancel → Không tạo phiếu`;
          
          const createReceipts = window.confirm(confirmMsg);
          
          try {
            // Update status
            const { error } = await supabase
              .from('technical_jobs')
              .update({ status: newStatus })
              .eq('id', selectedJob.id);
            
            if (error) throw error;
            
            let resultMsg = '✅ Hoàn thành công việc!\n\n';
            
            // Tạo phiếu nếu user đồng ý
            if (createReceipts) {
              if (hasPayment) {
                const successThu = await createReceiptFromJob(latestJob);
                resultMsg += successThu ? '✓ Đã tạo phiếu thu\n' : '⚠️ Lỗi tạo phiếu thu\n';
              }
              if (hasExpenses) {
                const successChi = await createExpenseReceiptsFromJob(latestJob);
                resultMsg += successChi ? '✓ Đã tạo phiếu chi\n' : '⚠️ Lỗi tạo phiếu chi\n';
              }
            }
            
            resultMsg += '\n🔒 Trạng thái đã bị khóa.';
            alert(resultMsg);
            
            await loadTechnicalJobs();
            setSelectedJob({ ...selectedJob, status: newStatus });
            return;
          } catch (error) {
            console.error('Error updating job status:', error);
            alert('❌ Lỗi khi cập nhật trạng thái!');
            return;
          }
        } else {
          // Không có tiền thu và chi phí
          if (!window.confirm('✅ Xác nhận hoàn thành công việc?\n\n⚠️ Sau khi hoàn thành, bạn KHÔNG THỂ thay đổi trạng thái nữa!')) {
            return;
          }
        }
      } else if (newStatus === 'Hủy') {
        if (!window.confirm('❌ Xác nhận hủy công việc?\n\n⚠️ Sau khi hủy, bạn KHÔNG THỂ thay đổi trạng thái nữa!')) {
          return;
        }
      }

      try {
        const { error } = await supabase
          .from('technical_jobs')
          .update({ status: newStatus })
          .eq('id', selectedJob.id);
        
        if (error) throw error;
        
        await loadTechnicalJobs();
        setSelectedJob({ ...selectedJob, status: newStatus });
        
        // Thông báo thành công
        if (newStatus === 'Hoàn thành' || newStatus === 'Hủy') {
          alert('✅ Đã ' + (newStatus === 'Hoàn thành' ? 'hoàn thành' : 'hủy') + 
                ' công việc!\n\n🔒 Trạng thái đã bị khóa và không thể thay đổi.');
        }
      } catch (error) {
        console.error('Error updating job status:', error);
        alert('❌ Lỗi khi cập nhật trạng thái!');
      }
    };

    const updateJobTechnicians = async (technicians) => {
      try {
        const { error } = await supabase
          .from('technical_jobs')
          .update({ technicians })
          .eq('id', selectedJob.id);
        
        if (error) throw error;
        
        // Notify new technicians
        technicians.forEach(techName => {
          if (!selectedJob.technicians.includes(techName) && techName !== currentUser.name) {
            addNotification({
              type: 'assigned',
              taskId: null,
              title: '🔧 Công việc mới',
              message: `Bạn được gán vào công việc: "${selectedJob.title}"`,
              read: false,
              createdAt: getNowISOVN()
            });
          }
        });
        
        alert('✅ Đã cập nhật kỹ thuật viên!');
        await loadTechnicalJobs();
        setSelectedJob({ ...selectedJob, technicians });
        setShowReassignModal(false);
      } catch (error) {
        console.error('Error updating technicians:', error);
        alert('❌ Lỗi khi cập nhật kỹ thuật viên!');
      }
    };

    const getTechnicalUsers = () => {
      // Trả về tất cả users có thể được giao công việc kỹ thuật
      return allUsers.filter(u => u.is_active !== false);
    };

    const toggleTechnician = (techName) => {
      if (newTechnicians.includes(techName)) {
        setNewTechnicians(newTechnicians.filter(t => t !== techName));
      } else {
        setNewTechnicians([...newTechnicians, techName]);
      }
    };

    const getStatusColor = (status) => {
      const colors = {
        'Chờ XN': 'bg-yellow-100 text-yellow-800',
        'Đang làm': 'bg-blue-100 text-blue-800',
        'Hoàn thành': 'bg-green-100 text-green-800',
        'Hủy': 'bg-gray-100 text-gray-800'
      };
      return colors[status] || 'bg-gray-100';
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-20 md:pb-4">
        <div className="bg-white rounded-xl max-w-3xl w-full max-h-[85vh] md:max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-4 md:p-6 border-b bg-gradient-to-r from-orange-500 to-red-600 text-white flex-shrink-0">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h2 className="text-xl md:text-2xl font-bold mb-2">{selectedJob.title}</h2>
                <div className="flex gap-2 flex-wrap">
                  <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(selectedJob.status)}`}>
                    {selectedJob.status}
                  </span>
                  <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                    {selectedJob.type}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowJobModal(false)} 
                className="text-2xl hover:bg-white/20 w-10 h-10 rounded flex items-center justify-center"
              >
                ×
              </button>
            </div>
          </div>

          <div className="p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto flex-1">
            {/* Form chỉnh sửa */}
            {isEditing ? (
              <div className="space-y-4">
                {/* Nút Lưu ở đầu form - dễ thấy trên mobile */}
                <div className="flex gap-2 sticky top-0 bg-white py-2 z-10 border-b pb-3">
                  <button
                    onClick={cancelEdit}
                    className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                  >
                    ❌ Hủy sửa
                  </button>
                  <button
                    onClick={saveEditJob}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-lg"
                  >
                    💾 LƯU
                  </button>
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                  ✏️ Đang chỉnh sửa - Dữ liệu tự động lưu nháp
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Tiêu đề *</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Tiêu đề công việc"
                  />
                </div>

                <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                  <h3 className="font-bold text-blue-800">👤 Thông tin khách hàng</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Tên khách *</label>
                      <input
                        type="text"
                        value={editCustomerName}
                        onChange={(e) => setEditCustomerName(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Số điện thoại</label>
                      <input
                        type="text"
                        value={editCustomerPhone}
                        onChange={(e) => setEditCustomerPhone(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Địa chỉ</label>
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="block text-sm font-medium mb-1">🎤 Thiết bị (mỗi dòng 1 thiết bị)</label>
                  <textarea
                    value={editEquipment}
                    onChange={(e) => setEditEquipment(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Micro Shure SM58&#10;Loa JBL 12&#10;Amply 1000W"
                  />
                </div>

                <div className="bg-orange-50 p-4 rounded-lg space-y-3">
                  <h3 className="font-bold text-orange-800">📅 Lịch hẹn</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Ngày</label>
                      <input
                        type="date"
                        value={editScheduledDate}
                        onChange={(e) => setEditScheduledDate(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Giờ</label>
                      <input
                        type="time"
                        value={editScheduledTime}
                        onChange={(e) => setEditScheduledTime(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Kỹ thuật viên */}
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-bold text-purple-800 mb-2">🔧 Kỹ thuật viên</h3>
                  
                  {/* Hiển thị KTV đã chọn - có thể bỏ chọn */}
                  {editTechnicians.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-purple-600 mb-1">Đã chọn (bấm để bỏ):</p>
                      <div className="flex flex-wrap gap-2">
                        {editTechnicians.map(name => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setEditTechnicians(editTechnicians.filter(t => t !== name))}
                            className="px-3 py-1.5 rounded-full text-sm font-medium bg-purple-600 text-white hover:bg-purple-700"
                          >
                            ✓ {name} ✕
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Danh sách KTV có thể thêm */}
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Thêm kỹ thuật viên:</p>
                    <div className="flex flex-wrap gap-2">
                      {technicianUsers
                        .filter(user => !editTechnicians.includes(user.name))
                        .map(user => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => setEditTechnicians([...editTechnicians, user.name])}
                            className="px-3 py-1.5 rounded-full text-sm font-medium bg-white border border-purple-300 text-purple-700 hover:bg-purple-100"
                          >
                            + {user.name}
                          </button>
                        ))}
                      {technicianUsers.filter(user => !editTechnicians.includes(user.name)).length === 0 && (
                        <span className="text-sm text-gray-500 italic">Đã chọn hết</span>
                      )}
                    </div>
                  </div>
                  
                  {editTechnicians.length === 0 && (
                    <p className="text-sm text-orange-600 mt-2">⚠️ Chưa chọn kỹ thuật viên</p>
                  )}
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <label className="block text-sm font-medium mb-1">💰 Thu của khách (VNĐ)</label>
                  <input
                    type="number"
                    value={editPayment}
                    onChange={(e) => setEditPayment(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="0"
                  />
                </div>
              </div>
            ) : (
              <>
                {/* Customer Info */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-bold mb-3 text-lg">👤 Thông tin khách hàng</h3>
                  <div className="space-y-2 text-sm">
                    <div><strong>Tên:</strong> {selectedJob.customerName}</div>
                    <div><strong>Số điện thoại:</strong> {selectedJob.customerPhone}</div>
                    <div><strong>Địa chỉ:</strong> {selectedJob.address}</div>
                  </div>
                </div>

                {/* Equipment */}
                {selectedJob.equipment && selectedJob.equipment.length > 0 && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-bold mb-3 text-lg">🎤 Thiết bị</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {selectedJob.equipment.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Schedule */}
                <div className="bg-orange-50 p-4 rounded-lg">
                  <h3 className="font-bold mb-3 text-lg">📅 Lịch hẹn</h3>
                  <div className="space-y-2 text-sm">
                    {selectedJob.createdBy && (
                      <div>
                        <strong>📝 Người tạo:</strong> {selectedJob.createdBy}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <strong>🔧 Kỹ thuật viên:</strong> {selectedJob.technicians ? selectedJob.technicians.join(', ') : selectedJob.technician}
                      </div>
                      {!isLocked && (isAdmin || (currentUser.departments && currentUser.departments.includes('sales'))) && (
                        <button
                          onClick={() => {
                            setNewTechnicians(selectedJob.technicians || []);
                            setShowReassignModal(true);
                          }}
                          className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-medium"
                        >
                          ✏️ Thay Đổi
                        </button>
                      )}
                    </div>
                    <div><strong>Ngày:</strong> {selectedJob.scheduledDate}</div>
                    <div><strong>Giờ:</strong> {selectedJob.scheduledTime || 'Chưa xác định'}</div>
                  </div>
                </div>

                {/* Customer Payment */}
                {selectedJob.customerPayment > 0 && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="font-bold mb-3 text-lg">💰 Thu của khách</h3>
                    <div className="text-2xl font-bold text-green-700">
                      {formatMoney(selectedJob.customerPayment)}
                    </div>
                  </div>
                )}

                {/* Job Expenses */}
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-lg">💸 Chi phí công việc</h3>
                    {!isLocked && (
                      <button
                        onClick={() => setShowAddExpense(!showAddExpense)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium"
                      >
                        {showAddExpense ? '✕ Đóng' : '+ Thêm'}
                      </button>
                    )}
                  </div>
                  
                  {/* Form thêm chi phí */}
                  {showAddExpense && (
                    <div className="bg-white p-3 rounded-lg border mb-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={expenseCategory}
                          onChange={(e) => setExpenseCategory(e.target.value)}
                          className="px-3 py-2 border rounded-lg text-sm"
                        >
                          {expenseCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={expenseAmount}
                          onChange={(e) => setExpenseAmount(e.target.value)}
                          placeholder="Số tiền"
                          className="px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      {expenseCategory === 'Chi phí khác' && (
                        <input
                          type="text"
                          value={expenseDesc}
                          onChange={(e) => setExpenseDesc(e.target.value)}
                          placeholder="Mô tả chi phí..."
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      )}
                      <button
                        onClick={addExpense}
                        className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
                      >
                        ✓ Thêm chi phí
                      </button>
                    </div>
                  )}
                  
                  {/* Danh sách chi phí */}
                  {jobExpenses.length > 0 ? (
                    <div className="space-y-2">
                      {jobExpenses.map(expense => (
                        <div key={expense.id} className="flex justify-between items-center bg-white p-2 rounded border">
                          <div className="flex-1">
                            <div className="text-sm font-medium">{expense.category}{expense.description ? `: ${expense.description}` : ''}</div>
                            <div className="text-xs text-gray-500">{expense.addedBy}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-red-600">{formatMoney(expense.amount)}</span>
                            {!isLocked && (
                              <button
                                onClick={() => removeExpense(expense.id)}
                                className="text-gray-400 hover:text-red-600 p-1"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Tổng chi phí:</span>
                        <span className="font-bold text-red-700">{formatMoney(totalExpenses)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-2">Chưa có chi phí nào</p>
                  )}
                </div>

                {/* Profit Summary */}
                {(selectedJob.customerPayment > 0 || totalExpenses > 0) && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-bold mb-3 text-lg">📊 Tổng kết</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Thu của khách:</span>
                        <span className="font-medium text-green-600">+{formatMoney(selectedJob.customerPayment || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Chi phí:</span>
                        <span className="font-medium text-red-600">-{formatMoney(totalExpenses)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="font-bold">Còn lại:</span>
                        <span className={`font-bold text-lg ${netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                          {formatMoney(netProfit)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Change Status - chỉ hiện khi không đang edit */}
            {!isEditing && (
              <div className="border-t pt-4">
                <h3 className="font-bold mb-3">🔄 Thay đổi trạng thái</h3>
                
                {isLocked ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="text-xl">🔒</span>
                      <span className="font-medium">Trạng thái đã khóa - Không thể thay đổi</span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Công việc đã {selectedJob.status === 'Hoàn thành' ? 'hoàn thành' : 'bị hủy'} và không thể thay đổi trạng thái.
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => updateJobStatus('Chờ XN')}
                      className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 font-medium"
                    >
                      Chờ XN
                    </button>
                    <button
                      onClick={() => updateJobStatus('Đang làm')}
                      className="px-4 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 font-medium"
                    >
                      Đang làm
                    </button>
                    <button
                      onClick={() => updateJobStatus('Hoàn thành')}
                      className="px-4 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 font-medium"
                    >
                      Hoàn thành
                    </button>
                    <button
                      onClick={() => updateJobStatus('Hủy')}
                      className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 font-medium"
                    >
                      Hủy
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer - Sticky ở dưới cho mobile */}
          <div className="p-4 md:p-6 border-t bg-gray-50 flex-shrink-0 sticky bottom-0">
            <div className="flex gap-2 md:gap-3 justify-between">
              <div className="flex gap-2">
                {/* Nút Xóa - chỉ hiện khi chưa hoàn thành/hủy và là admin hoặc người tạo */}
                {canDelete && !isEditing && (
                  <button
                    onClick={() => {
                      if (window.confirm('⚠️ Xóa công việc này?\n\nHành động không thể hoàn tác!')) {
                        deleteTechnicalJob(selectedJob.id);
                      }
                    }}
                    className="px-3 md:px-4 py-2 md:py-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium text-sm md:text-base"
                  >
                    🗑️
                  </button>
                )}
              </div>
              <div className="flex gap-2 md:gap-3">
                <button
                  onClick={() => {
                    if (isEditing) cancelEdit();
                    setShowJobModal(false);
                  }}
                  className="px-4 md:px-6 py-2 md:py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm md:text-base"
                >
                  Đóng
                </button>
                {/* Nút Sửa - chỉ hiện khi chưa hoàn thành/hủy và là admin hoặc người tạo */}
                {canEdit && !isEditing && (
                  <button
                    onClick={openEditMode}
                    className="px-4 md:px-6 py-2 md:py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium text-sm md:text-base"
                  >
                    ✏️ Sửa
                  </button>
                )}
                {isEditing && (
                  <button
                    onClick={saveEditJob}
                    className="px-6 md:px-8 py-2 md:py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-base md:text-lg"
                  >
                    💾 LƯU
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Thông báo khóa */}
          {isLocked && (
            <div className="px-4 md:px-6 pb-4">
              <div className="bg-gray-100 border border-gray-300 rounded-lg p-3 text-center text-sm text-gray-600">
                🔒 Công việc đã {selectedJob.status === 'Hoàn thành' ? 'hoàn thành' : 'hủy'} - Không thể sửa hoặc xóa
              </div>
            </div>
          )}
        </div>

        {/* Reassign Technicians Modal */}
        {showReassignModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full">
              <div className="p-6 border-b bg-gradient-to-r from-orange-500 to-red-600 text-white">
                <h2 className="text-2xl font-bold">👥 Thay Đổi Kỹ Thuật Viên</h2>
                <p className="text-sm mt-1 opacity-90">{selectedJob.title}</p>
              </div>

              <div className="p-6 space-y-3">
                <p className="text-sm text-gray-600 mb-3">
                  Chọn kỹ thuật viên mới cho công việc này:
                </p>

                <div className="border rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                  {getTechnicalUsers().map(user => (
                    <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={newTechnicians.includes(user.name)}
                        onChange={() => toggleTechnician(user.name)}
                        className="w-4 h-4 text-orange-600"
                      />
                      <span className="text-sm">{user.name} - {user.team}</span>
                    </label>
                  ))}
                </div>

                {newTechnicians.length === 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                    ⚠️ Vui lòng chọn ít nhất 1 kỹ thuật viên
                  </div>
                )}
              </div>

              <div className="p-6 border-t bg-gray-50 flex gap-3">
                <button
                  onClick={() => setShowReassignModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                >
                  Hủy
                </button>
                <button
                  onClick={() => {
                    if (newTechnicians.length === 0) {
                      alert('⚠️ Vui lòng chọn ít nhất 1 kỹ thuật viên!');
                      return;
                    }
                    updateJobTechnicians(newTechnicians);
                  }}
                  className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
                >
                  ✅ Lưu
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // =====================================
  // TECHNICIAN WAGES VIEW
  // =====================================
  const TechnicianWagesView = () => {
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [bonusAmounts, setBonusAmounts] = useState({});
    const [showBonusModal, setShowBonusModal] = useState(false);
    const [selectedTechnician, setSelectedTechnician] = useState(null);
    const [bonusInput, setBonusInput] = useState('');
    const [bonusNote, setBonusNote] = useState('');
    const [loadingBonuses, setLoadingBonuses] = useState(false);
    
    const BASE_WAGE = 200000; // 200,000đ/công việc
    
    // Load bonus data từ database
    const loadBonuses = async () => {
      if (!tenant) return;
      setLoadingBonuses(true);
      try {
        const { data, error } = await supabase
          .from('technician_bonuses')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('month', selectedMonth)
          .eq('year', selectedYear);
        
        if (error) throw error;
        
        const bonusMap = {};
        (data || []).forEach(b => {
          bonusMap[b.technician_name] = b.bonus_amount || 0;
          bonusMap[b.technician_name + '_note'] = b.note || '';
          bonusMap[b.technician_name + '_id'] = b.id;
        });
        setBonusAmounts(bonusMap);
      } catch (error) {
        console.error('Error loading bonuses:', error);
      }
      setLoadingBonuses(false);
    };
    
    // Load bonuses khi đổi tháng/năm
    useEffect(() => {
      loadBonuses();
    }, [selectedMonth, selectedYear, tenant]);
    
    // Lọc công việc hoàn thành trong tháng
    const completedJobsInMonth = technicalJobs.filter(job => {
      if (job.status !== 'Hoàn thành') return false;
      const jobDate = new Date(job.scheduledDate);
      return jobDate.getMonth() + 1 === selectedMonth && jobDate.getFullYear() === selectedYear;
    });
    
    // Tính tiền công cho từng kỹ thuật viên
    const getTechnicianWages = () => {
      const wagesMap = {};
      
      completedJobsInMonth.forEach(job => {
        const technicians = job.technicians || [];
        technicians.forEach(tech => {
          if (!wagesMap[tech]) {
            wagesMap[tech] = {
              name: tech,
              jobs: [],
              jobCount: 0,
              baseWage: 0,
              bonus: bonusAmounts[tech] || 0,
              bonusNote: bonusAmounts[tech + '_note'] || ''
            };
          }
          wagesMap[tech].jobs.push(job);
          wagesMap[tech].jobCount += 1;
          wagesMap[tech].baseWage = wagesMap[tech].jobCount * BASE_WAGE;
        });
      });
      
      return Object.values(wagesMap);
    };
    
    const technicianWages = getTechnicianWages();
    const totalBaseWage = technicianWages.reduce((sum, t) => sum + t.baseWage, 0);
    const totalBonus = technicianWages.reduce((sum, t) => sum + (bonusAmounts[t.name] || 0), 0);
    const totalWage = totalBaseWage + totalBonus;
    
    // Mở modal thêm công phát sinh
    const openBonusModal = (tech) => {
      setSelectedTechnician(tech);
      setBonusInput(bonusAmounts[tech.name] || '');
      setBonusNote(bonusAmounts[tech.name + '_note'] || '');
      setShowBonusModal(true);
    };
    
    // Lưu công phát sinh vào database
    const saveBonus = async () => {
      if (!selectedTechnician) return;
      
      const bonusData = {
        tenant_id: tenant.id,
        technician_name: selectedTechnician.name,
        month: selectedMonth,
        year: selectedYear,
        bonus_amount: parseFloat(bonusInput) || 0,
        note: bonusNote,
        created_by: currentUser.name,
        updated_at: getNowISOVN()
      };
      
      try {
        // Check if record exists
        const existingId = bonusAmounts[selectedTechnician.name + '_id'];
        
        if (existingId) {
          // Update existing
          const { error } = await supabase
            .from('technician_bonuses')
            .update({
              bonus_amount: bonusData.bonus_amount,
              note: bonusData.note,
              updated_at: bonusData.updated_at
            })
            .eq('id', existingId);
          
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from('technician_bonuses')
            .insert([bonusData]);
          
          if (error) throw error;
        }
        
        alert('✅ Đã lưu công phát sinh!');
        setShowBonusModal(false);
        await loadBonuses();
      } catch (error) {
        console.error('Error saving bonus:', error);
        alert('❌ Lỗi khi lưu: ' + error.message);
      }
    };
    
    return (
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl md:text-2xl font-bold">💰 Tiền Công Lắp Đặt</h2>
          <div className="flex gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg"
            >
              {[2024,2025,2026,2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="text-sm text-blue-600">Công việc hoàn thành</div>
            <div className="text-2xl font-bold text-blue-700">{completedJobsInMonth.length}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-sm text-green-600">Tiền công cơ bản</div>
            <div className="text-xl font-bold text-green-700">{formatMoney(totalBaseWage)}</div>
            <div className="text-xs text-green-500">{formatMoney(BASE_WAGE)}/công việc</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="text-sm text-orange-600">Công phát sinh</div>
            <div className="text-xl font-bold text-orange-700">{formatMoney(totalBonus)}</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="text-sm text-purple-600">Tổng tiền công</div>
            <div className="text-xl font-bold text-purple-700">{formatMoney(totalWage)}</div>
          </div>
        </div>
        
        {/* Technician List */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="p-4 border-b">
            <h3 className="font-bold text-lg">👷 Chi tiết theo kỹ thuật viên</h3>
          </div>
          
          {technicianWages.length > 0 ? (
            <div className="divide-y">
              {technicianWages.map(tech => (
                <div key={tech.name} className="p-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div className="flex-1">
                      <div className="font-bold text-lg">{tech.name}</div>
                      <div className="text-sm text-gray-500">
                        {tech.jobCount} công việc hoàn thành
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Tiền công cơ bản ({tech.jobCount} × {formatMoney(BASE_WAGE)}):</span>
                          <span className="font-medium text-green-600">{formatMoney(tech.baseWage)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Công phát sinh:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-orange-600">{formatMoney(bonusAmounts[tech.name] || 0)}</span>
                            <button
                              onClick={() => openBonusModal(tech)}
                              className="px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded text-xs font-medium"
                            >
                              ✏️ Sửa
                            </button>
                          </div>
                        </div>
                        {bonusAmounts[tech.name + '_note'] && (
                          <div className="text-xs text-gray-500 italic">
                            Ghi chú: {bonusAmounts[tech.name + '_note']}
                          </div>
                        )}
                        <div className="flex justify-between pt-2 border-t">
                          <span className="font-bold">Tổng:</span>
                          <span className="font-bold text-purple-700">
                            {formatMoney(tech.baseWage + (bonusAmounts[tech.name] || 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Danh sách công việc */}
                  <div className="mt-3 bg-gray-50 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-700 mb-2">📋 Công việc:</div>
                    <div className="space-y-1">
                      {tech.jobs.map(job => (
                        <div key={job.id} className="text-sm flex justify-between">
                          <span className="text-gray-600">{job.title}</span>
                          <span className="text-gray-500">{job.scheduledDate}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <div className="text-4xl mb-2">📭</div>
              <p>Chưa có công việc hoàn thành trong tháng {selectedMonth}/{selectedYear}</p>
            </div>
          )}
        </div>
        
        {/* Bonus Modal */}
        {showBonusModal && selectedTechnician && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full">
              <div className="p-6 border-b">
                <h3 className="text-xl font-bold">💰 Công Phát Sinh - {selectedTechnician.name}</h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Số tiền (VNĐ)</label>
                  <input
                    type="number"
                    value={bonusInput}
                    onChange={(e) => setBonusInput(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="VD: 500000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Ghi chú</label>
                  <textarea
                    value={bonusNote}
                    onChange={(e) => setBonusNote(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                    rows={2}
                    placeholder="VD: Công việc khó, đi xa, OT..."
                  />
                </div>
              </div>
              <div className="p-6 border-t bg-gray-50 flex gap-3">
                <button
                  onClick={() => setShowBonusModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                >
                  Hủy
                </button>
                <button
                  onClick={saveBonus}
                  className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
                >
                  💾 Lưu
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // =====================================
  // TECHNICAL SUMMARY VIEW
  // =====================================
  const TechnicalSummaryView = () => {
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [bonusAmounts, setBonusAmounts] = useState({});
    
    const BASE_WAGE = 200000; // 200,000đ/công việc
    
    // Load bonus data từ database
    const loadBonuses = async () => {
      if (!tenant) return;
      try {
        const { data, error } = await supabase
          .from('technician_bonuses')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('month', selectedMonth)
          .eq('year', selectedYear);
        
        if (error) throw error;
        
        const bonusMap = {};
        (data || []).forEach(b => {
          bonusMap[b.technician_name] = b.bonus_amount || 0;
        });
        setBonusAmounts(bonusMap);
      } catch (error) {
        console.error('Error loading bonuses:', error);
      }
    };
    
    useEffect(() => {
      loadBonuses();
    }, [selectedMonth, selectedYear, tenant]);
    
    // Lọc công việc hoàn thành trong tháng
    const completedJobsInMonth = technicalJobs.filter(job => {
      if (job.status !== 'Hoàn thành') return false;
      const jobDate = new Date(job.scheduledDate);
      return jobDate.getMonth() + 1 === selectedMonth && jobDate.getFullYear() === selectedYear;
    });
    
    // Tính toán tổng hợp
    const calculateSummary = () => {
      let totalRevenue = 0;
      let totalExpenses = 0;
      let totalWages = 0;
      
      // Lấy danh sách kỹ thuật viên có công việc trong tháng
      const techniciansInMonth = new Set();
      
      const jobDetails = completedJobsInMonth.map(job => {
        const revenue = job.customerPayment || 0;
        const expenseItems = job.expenses || [];
        const expenseTotal = expenseItems.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const techCount = (job.technicians || []).length;
        const wages = techCount * BASE_WAGE;
        
        // Lưu danh sách kỹ thuật viên
        (job.technicians || []).forEach(tech => techniciansInMonth.add(tech));
        
        totalRevenue += revenue;
        totalExpenses += expenseTotal;
        totalWages += wages;
        
        return {
          ...job,
          revenue,
          expenseItems,
          expenseTotal,
          wages,
          profit: revenue - expenseTotal - wages
        };
      });
      
      // Chỉ tính công phát sinh của những kỹ thuật viên CÓ công việc trong tháng
      const totalBonus = Array.from(techniciansInMonth)
        .reduce((sum, techName) => sum + (bonusAmounts[techName] || 0), 0);
      
      totalWages += totalBonus;
      
      return {
        jobDetails,
        totalRevenue,
        totalExpenses,
        totalWages,
        totalBonus,
        netProfit: totalRevenue - totalExpenses - totalWages
      };
    };
    
    const summary = calculateSummary();
    
    return (
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl md:text-2xl font-bold">📊 Tổng Hợp Kỹ Thuật</h2>
          <div className="flex gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg"
            >
              {[2024,2025,2026,2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Doanh Thu */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-sm text-green-600 font-medium">💰 Doanh Thu</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{formatMoney(summary.totalRevenue)}</div>
            <div className="text-xs text-green-500 mt-1">{completedJobsInMonth.length} công việc hoàn thành</div>
          </div>
          
          {/* Tổng Chi Phí */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-sm text-red-600 font-medium">💸 Tổng Chi Phí</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{formatMoney(summary.totalExpenses + summary.totalWages)}</div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>• Chi phí lắp đặt:</span>
                <span className="font-medium">{formatMoney(summary.totalExpenses)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>• Tiền công cơ bản:</span>
                <span className="font-medium">{formatMoney(summary.totalWages - summary.totalBonus)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>• Công phát sinh:</span>
                <span className="font-medium">{formatMoney(summary.totalBonus)}</span>
              </div>
            </div>
          </div>
          
          {/* Còn Lại */}
          <div className={`border rounded-xl p-4 ${summary.netProfit >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <div className={`text-sm font-medium ${summary.netProfit >= 0 ? 'text-blue-600' : 'text-yellow-600'}`}>📈 Còn Lại</div>
            <div className={`text-2xl font-bold mt-1 ${summary.netProfit >= 0 ? 'text-blue-700' : 'text-yellow-700'}`}>{formatMoney(summary.netProfit)}</div>
            <div className="text-xs text-gray-500 mt-1">Doanh thu - Tổng chi phí</div>
          </div>
        </div>
        
        {/* Formula */}
        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
          <strong>Công thức:</strong> Còn Lại = Doanh Thu - Tổng Chi Phí
          <div className="mt-1">
            {formatMoney(summary.netProfit)} = {formatMoney(summary.totalRevenue)} - {formatMoney(summary.totalExpenses + summary.totalWages)}
          </div>
          <div className="mt-1 text-xs">
            (Tổng chi phí = {formatMoney(summary.totalExpenses)} chi phí lắp đặt + {formatMoney(summary.totalWages - summary.totalBonus)} tiền công CB + {formatMoney(summary.totalBonus)} phát sinh)
          </div>
        </div>
        
        {/* Job Details */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="p-4 border-b">
            <h3 className="font-bold text-lg">📋 Chi tiết theo công việc</h3>
          </div>
          
          {summary.jobDetails.length > 0 ? (
            <div className="divide-y">
              {summary.jobDetails.map(job => (
                <div key={job.id} className="p-4">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="font-bold">{job.title}</div>
                      <div className="text-sm text-gray-500">
                        {job.customerName} • {job.scheduledDate}
                      </div>
                      <div className="text-xs text-gray-400">
                        KTV: {(job.technicians || []).join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                        Hoàn thành
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div className="bg-green-50 p-2 rounded">
                      <div className="text-xs text-green-600">Thu</div>
                      <div className="font-bold text-green-700">{formatMoney(job.revenue)}</div>
                    </div>
                    <div className="bg-red-50 p-2 rounded">
                      <div className="text-xs text-red-600">Chi phí</div>
                      <div className="font-bold text-red-700">{formatMoney(job.expenseTotal)}</div>
                    </div>
                    <div className="bg-orange-50 p-2 rounded">
                      <div className="text-xs text-orange-600">Tiền công</div>
                      <div className="font-bold text-orange-700">{formatMoney(job.wages)}</div>
                      <div className="text-xs text-orange-500">{(job.technicians || []).length} người</div>
                    </div>
                    <div className={`p-2 rounded ${job.profit >= 0 ? 'bg-blue-50' : 'bg-yellow-50'}`}>
                      <div className={`text-xs ${job.profit >= 0 ? 'text-blue-600' : 'text-yellow-600'}`}>Còn lại</div>
                      <div className={`font-bold ${job.profit >= 0 ? 'text-blue-700' : 'text-yellow-700'}`}>{formatMoney(job.profit)}</div>
                    </div>
                  </div>
                  
                  {/* Chi tiết chi phí */}
                  {job.expenseItems && job.expenseItems.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      Chi tiết: {job.expenseItems.map(e => `${e.category}${e.description ? ': ' + e.description : ''} (${formatMoney(e.amount)})`).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <div className="text-4xl mb-2">📭</div>
              <p>Chưa có công việc hoàn thành trong tháng {selectedMonth}/{selectedYear}</p>
            </div>
          )}
        </div>
        
        {/* Bonus Note */}
        {summary.totalBonus > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="font-medium text-purple-800">💡 Lưu ý về công phát sinh</div>
            <div className="text-sm text-purple-600 mt-1">
              Công phát sinh ({formatMoney(summary.totalBonus)}) được tính riêng cho từng kỹ thuật viên trong tab "Tiền Công".
            </div>
          </div>
        )}
      </div>
    );
  };

  const LoginModal = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
          <h2 className="text-2xl font-bold mb-6">🔐 Đăng Nhập</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="email@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="******"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLoginModal(false)}
                className="flex-1 px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
              >
                Hủy
              </button>
              <button
                onClick={() => handleLogin(email, password)}
                className="flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Đăng Nhập
              </button>
            </div>
            <div className="text-center text-sm">
              Chưa có tài khoản?{' '}
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  setShowRegisterModal(true);
                }}
                className="text-blue-600 hover:underline font-medium"
              >
                Đăng ký ngay
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const RegisterModal = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [team, setTeam] = useState('');

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
          <h2 className="text-2xl font-bold mb-6">📝 Đăng Ký Tài Khoản</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Họ tên</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nguyễn Văn A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="email@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="******"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Team</label>
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Chọn team</option>
                <option value="Content">Content</option>
                <option value="Edit Video">Edit Video</option>
                <option value="Livestream">Livestream</option>
                <option value="Kho">Kho</option>
              </select>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm text-blue-800">
                ℹ️ Tài khoản mới sẽ được tạo với vai trò <strong>Member</strong>.<br/>
                Manager có thể thăng cấp vai trò sau.
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRegisterModal(false)}
                className="flex-1 px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
              >
                Hủy
              </button>
              <button
                onClick={() => handleRegister(name, email, password, team, 'Member')}
                className="flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Đăng Ký
              </button>
            </div>
            <div className="text-center text-sm">
              Đã có tài khoản?{' '}
              <button
                onClick={() => {
                  setShowRegisterModal(false);
                  setShowLoginModal(true);
                }}
                className="text-blue-600 hover:underline font-medium"
              >
                Đăng nhập
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const MyTasksView = () => {
    const myTasks = tasks.filter(t => t.assignee === currentUser.name);
    
    return (
      <div className="p-4 md:p-6 pb-20 md:pb-6">
        <div className="mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-bold">📝 Công việc của tôi</h2>
          <p className="text-gray-600 text-sm">
            {myTasks.length} task • {myTasks.filter(t => t.status === 'Hoàn Thành').length} hoàn thành
          </p>
        </div>

        <div className="grid gap-3 md:gap-4">
          {myTasks.map(task => (
            <div
              key={task.id}
              onClick={() => {
                setSelectedTask(task);
                setShowModal(true);
              }}
              className={`bg-white p-4 md:p-6 rounded-xl shadow hover:shadow-lg transition-all cursor-pointer border-l-4 ${
                task.isOverdue ? 'border-red-500' : 'border-blue-500'
              }`}
            >
              <div className="flex justify-between items-start mb-2 md:mb-3">
                <div className="flex-1">
                  <h3 className="text-lg md:text-xl font-bold mb-2">{task.title}</h3>
                  <div className="flex gap-2 flex-wrap">
                    <span className={`px-2 md:px-3 py-1 rounded-full text-xs md:text-sm font-medium ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                    <span className={`px-2 md:px-3 py-1 rounded-full text-xs md:text-sm font-medium ${getTeamColor(task.team)}`}>
                      {task.team}
                    </span>
                    <span className="px-2 md:px-3 py-1 bg-gray-100 rounded-full text-xs md:text-sm">
                      📅 {task.dueDate}
                    </span>
                  </div>
                </div>
              </div>
              
              {task.isOverdue && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                  <span className="text-red-700 font-medium">⚠️ Quá hạn!</span>
                </div>
              )}
            </div>
          ))}

          {myTasks.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl">
              <div className="text-4xl mb-3">🎉</div>
              <div className="text-gray-600">Bạn chưa có task nào được giao!</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const DashboardView = () => (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-6">
      <div>
        <h2 className="text-lg md:text-2xl font-bold mb-1">Xin chào, {currentUser.name}! 👋</h2>
        <p className="text-sm text-gray-600">{currentUser.role} • {currentUser.team} Team</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        {[
          { l: 'Tổng Video', v: visibleTasks.length, i: '📊', c: 'blue' },
          { l: 'Hoàn Thành', v: visibleTasks.filter(t => t.status === 'Hoàn Thành').length, i: '✅', c: 'green' },
          { l: 'Đang Làm', v: visibleTasks.filter(t => t.status === 'Đang Làm').length, i: '⏳', c: 'yellow' },
          { l: 'Quá Hạn', v: visibleTasks.filter(t => t.isOverdue).length, i: '⚠️', c: 'red' }
        ].map((s, i) => (
          <div key={i} className={`bg-${s.c}-50 p-3 md:p-6 rounded-xl border-2 border-${s.c}-200`}>
            <div className="text-xl md:text-3xl mb-1 md:mb-2">{s.i}</div>
            <div className="text-xl md:text-3xl font-bold">{s.v}</div>
            <div className="text-xs md:text-sm text-gray-600">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Chi tiết các trạng thái */}
      <div className="bg-white p-4 md:p-6 rounded-xl shadow">
        <h3 className="text-base md:text-lg font-bold mb-3 md:mb-4">📋 Chi Tiết Trạng Thái</h3>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-4">
          {[
            { status: 'Nháp', icon: '📝', color: 'bg-gray-100 text-gray-700' },
            { status: 'Chờ Duyệt', icon: '⏳', color: 'bg-yellow-100 text-yellow-700' },
            { status: 'Đã Duyệt', icon: '👍', color: 'bg-green-100 text-green-700' },
            { status: 'Đang Làm', icon: '🔨', color: 'bg-blue-100 text-blue-700' },
            { status: 'Hoàn Thành', icon: '✅', color: 'bg-purple-100 text-purple-700' }
          ].map(item => {
            const count = visibleTasks.filter(t => t.status === item.status).length;
            const percentage = visibleTasks.length > 0 ? Math.round((count / visibleTasks.length) * 100) : 0;
            
            return (
              <div key={item.status} className={`${item.color} p-2 md:p-4 rounded-lg`}>
                <div className="text-lg md:text-2xl mb-1">{item.icon}</div>
                <div className="text-lg md:text-2xl font-bold">{count}</div>
                <div className="text-xs font-medium mb-0.5">{item.status}</div>
                <div className="text-xs opacity-75">{percentage}%</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white p-4 md:p-6 rounded-xl shadow">
          <h3 className="text-base md:text-lg font-bold mb-3 md:mb-4">📊 Trạng thái Video</h3>
          <div className="h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={reportData.statusStats} cx="50%" cy="50%" outerRadius={60} dataKey="value" label>
                  {reportData.statusStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-bold mb-4">👥 Hiệu suất Team</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reportData.teamStats}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" fill="#10b981" name="Hoàn thành" />
                <Bar dataKey="inProgress" fill="#3b82f6" name="Đang làm" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="text-lg font-bold mb-4">🎯 Video Gần Nhất</h3>
        <div className="space-y-3">
          {visibleTasks.slice(0, 5).map(task => (
            <div 
              key={task.id} 
              onClick={() => {
                setSelectedTask(task);
                setShowModal(true);
              }}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
            >
              <div className="flex-1">
                <div className="font-medium">{task.title}</div>
                <div className="text-sm text-gray-600">{task.assignee} • {task.team}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(task.status)}`}>
                  {task.status}
                </span>
                <span className="text-sm text-gray-500">{task.dueDate}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const TasksView = () => {
    // Dùng filter state từ App (không bị reset khi đóng modal)
    const filterTeam = taskFilterTeam;
    const setFilterTeam = setTaskFilterTeam;
    const filterStatus = taskFilterStatus;
    const setFilterStatus = setTaskFilterStatus;
    const filterAssignee = taskFilterAssignee;
    const setFilterAssignee = setTaskFilterAssignee;
    const filterCategory = taskFilterCategory;
    const setFilterCategory = setTaskFilterCategory;
    const dateFilter = taskDateFilter;
    const setDateFilter = setTaskDateFilter;
    const customStartDate = taskCustomStartDate;
    const setCustomStartDate = setTaskCustomStartDate;
    const customEndDate = taskCustomEndDate;
    const setCustomEndDate = setTaskCustomEndDate;
    const [showCustomDate, setShowCustomDate] = useState(false);

    const videoCategories = [
      { id: 'video_dan', name: '🎬 Video dàn', color: 'purple' },
      { id: 'video_hangngay', name: '📅 Video hàng ngày', color: 'blue' },
      { id: 'video_huongdan', name: '📚 Video hướng dẫn', color: 'green' },
      { id: 'video_quangcao', name: '📢 Video quảng cáo', color: 'orange' },
      { id: 'video_review', name: '⭐ Video review', color: 'yellow' }
    ];

    // Helper: Get date range based on filter (Vietnam timezone UTC+7)
    const getDateRange = () => {
      // Get current date in Vietnam timezone (UTC+7)
      const vietnamTime = getVietnamDate();
      const today = new Date(vietnamTime.getFullYear(), vietnamTime.getMonth(), vietnamTime.getDate());
      
      switch(dateFilter) {
        case 'today': {
          // Hôm nay: deadline đúng ngày hôm nay
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return { start: today, end: tomorrow };
        }
        case 'week': {
          // Tuần này: từ đầu tuần (Thứ 2) đến cuối tuần (Chủ nhật)
          const dayOfWeek = today.getDay(); // 0 = CN, 1 = T2, ...
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() + mondayOffset);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 7); // Đến hết Chủ nhật
          return { start: weekStart, end: weekEnd };
        }
        case 'month': {
          // Tháng này: từ ngày 1 đến cuối tháng
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1); // Ngày đầu tháng sau
          return { start: monthStart, end: monthEnd };
        }
        case 'overdue': {
          // Quá hạn: deadline trước hôm nay
          return { start: new Date(2000, 0, 1), end: today };
        }
        case 'custom': {
          if (!customStartDate || !customEndDate) return null;
          const endDate = new Date(customEndDate);
          endDate.setDate(endDate.getDate() + 1); // Bao gồm ngày cuối
          return { 
            start: new Date(customStartDate), 
            end: endDate 
          };
        }
        default:
          return null;
      }
    };

    const filteredTasks = visibleTasks.filter(t => {
      if (filterTeam !== 'all' && t.team !== filterTeam) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterAssignee !== 'all' && t.assignee !== filterAssignee) return false;
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      
      // Date filter (Vietnam timezone)
      if (dateFilter !== 'all') {
        const range = getDateRange();
        if (!range) return false;
        
        // Parse task date - chuyển về ngày thuần túy để so sánh
        if (!t.dueDate) return false;
        const taskDateParts = t.dueDate.split('-');
        const taskDate = new Date(parseInt(taskDateParts[0]), parseInt(taskDateParts[1]) - 1, parseInt(taskDateParts[2]));
        
        if (dateFilter === 'overdue') {
          // Overdue: deadline < today AND not completed
          if (!(taskDate < range.end && t.status !== 'Hoàn Thành')) return false;
        } else {
          // Other filters: start <= taskDate < end
          if (!(taskDate >= range.start && taskDate < range.end)) return false;
        }
      }
      
      return true;
    });

    const handleDateFilterChange = (value) => {
      setDateFilter(value);
      setShowCustomDate(value === 'custom');
      if (value !== 'custom') {
        setCustomStartDate('');
        setCustomEndDate('');
      }
    };

    const clearFilters = () => {
      setFilterTeam('all');
      setFilterStatus('all');
      setDateFilter('all');
      setCustomStartDate('');
      setCustomEndDate('');
      setShowCustomDate(false);
    };

    return (
      <div className="p-4 md:p-6 pb-20 md:pb-6">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-bold">📋 Quản Lý Video</h2>
          <button
            onClick={() => setShowCreateTaskModal(true)}
            className="px-4 md:px-6 py-2 md:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm md:text-base"
          >
            ➕ Tạo Mới
          </button>
        </div>

        <div className="bg-white p-3 md:p-4 rounded-xl shadow mb-4 md:mb-6">
          <div className="flex gap-2 md:gap-4 flex-wrap">
            <div>
              <label className="text-xs md:text-sm font-medium mb-1 md:mb-2 block">Team</label>
              <select
                value={filterTeam}
                onChange={(e) => setFilterTeam(e.target.value)}
                className="px-2 md:px-4 py-1.5 md:py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="all">Tất cả</option>
                <option value="Content">Content</option>
                <option value="Edit Video">Edit Video</option>
                <option value="Livestream">Livestream</option>
                <option value="Kho">Kho</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Trạng thái</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tất cả</option>
                <option value="Nháp">Nháp</option>
                <option value="Chưa Quay">Chưa Quay</option>
                <option value="Đã Quay">Đã Quay</option>
                <option value="Đang Edit">Đang Edit</option>
                <option value="Hoàn Thành">Hoàn Thành</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Nhân viên</label>
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tất cả</option>
                {Array.from(new Set(visibleTasks.map(t => t.assignee))).sort().map(assignee => (
                  <option key={assignee} value={assignee}>{assignee}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">🏷️ Danh mục</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tất cả</option>
                {videoCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Filter Section */}
          <div className="mt-4 pt-4 border-t">
            <label className="text-sm font-medium mb-3 block">📅 Lọc theo Deadline:</label>
            <div className="flex gap-2 flex-wrap mb-3">
              <button
                onClick={() => handleDateFilterChange('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  dateFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => handleDateFilterChange('today')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  dateFilter === 'today'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Hôm nay
              </button>
              <button
                onClick={() => handleDateFilterChange('week')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  dateFilter === 'week'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tuần này
              </button>
              <button
                onClick={() => handleDateFilterChange('month')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  dateFilter === 'month'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tháng này
              </button>
              <button
                onClick={() => handleDateFilterChange('overdue')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  dateFilter === 'overdue'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ⚠️ Quá hạn
              </button>
              <button
                onClick={() => handleDateFilterChange('custom')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  dateFilter === 'custom'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tùy chỉnh
              </button>
            </div>

            {showCustomDate && (
              <div className="flex gap-3 items-center bg-purple-50 p-3 rounded-lg">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Từ ngày:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="mt-5">→</div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Đến ngày:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Hiển thị <span className="font-bold text-blue-600">{filteredTasks.length}</span> / {visibleTasks.length} tasks
            </div>
            {(filterTeam !== 'all' || filterStatus !== 'all' || dateFilter !== 'all') && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium"
              >
                × Clear all filters
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          {filteredTasks.map(task => (
            <div
              key={task.id}
              onClick={() => {
                setSelectedTask(task);
                setShowModal(true);
              }}
              className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition-all cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">{task.title}</h3>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTeamColor(task.team)}`}>
                      {task.team}
                    </span>
                    {task.category && (
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        task.category === 'video_dan' ? 'bg-purple-100 text-purple-700' :
                        task.category === 'video_hangngay' ? 'bg-blue-100 text-blue-700' :
                        task.category === 'video_huongdan' ? 'bg-green-100 text-green-700' :
                        task.category === 'video_quangcao' ? 'bg-orange-100 text-orange-700' :
                        task.category === 'video_review' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {task.category === 'video_dan' ? '🎬 Video dàn' :
                         task.category === 'video_hangngay' ? '📅 Hàng ngày' :
                         task.category === 'video_huongdan' ? '📚 Hướng dẫn' :
                         task.category === 'video_quangcao' ? '📢 Quảng cáo' :
                         task.category === 'video_review' ? '⭐ Review' : task.category}
                      </span>
                    )}
                    <span className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                      👤 {task.assignee}
                    </span>
                    <span className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                      📅 {task.dueDate}
                    </span>
                  </div>
                </div>
              </div>
              {task.isOverdue && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                  <span className="text-red-700 font-medium">⚠️ Quá hạn!</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const CalendarView = () => {
    const today = new Date();
    const daysOfWeek = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

    return (
      <div className="p-4 md:p-6 pb-20 md:pb-6">
        <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">📅 Lịch Video</h2>
        
        <div className="bg-white p-4 md:p-6 rounded-xl shadow">
          <div className="flex justify-between items-center mb-4 md:mb-6">
            <h3 className="text-lg md:text-xl font-bold">{monthNames[today.getMonth()]} {today.getFullYear()}</h3>
            <div className="flex gap-2">
              <button className="px-3 md:px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm">◀</button>
              <button className="px-3 md:px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm">▶</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
            {daysOfWeek.map(day => (
              <div key={day} className="text-center font-bold py-1 md:py-2 text-xs md:text-sm">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {Array.from({ length: 35 }, (_, i) => {
              const day = i - 2;
              const date = new Date(today.getFullYear(), today.getMonth(), day);
              
              // Fix: Dùng local date string thay vì UTC
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const dayNum = String(date.getDate()).padStart(2, '0');
              const dateStr = `${year}-${month}-${dayNum}`;
              
              const dayTasks = visibleTasks.filter(t => t.dueDate === dateStr);
              
              return (
                <div
                  key={i}
                  className={`min-h-24 p-2 border rounded-lg ${
                    day === today.getDate() ? 'bg-blue-50 border-blue-500' : 'bg-white'
                  }`}
                >
                  <div className="text-sm font-medium mb-1">{day > 0 && day <= 31 ? day : ''}</div>
                  {dayTasks.slice(0, 2).map(task => (
                    <div
                      key={task.id}
                      onClick={() => {
                        setSelectedTask(task);
                        setShowModal(true);
                      }}
                      className={`text-xs p-1 rounded mb-1 cursor-pointer ${getStatusColor(task.status)}`}
                    >
                      {task.title.substring(0, 15)}...
                    </div>
                  ))}
                  {dayTasks.length > 2 && (
                    <div className="text-xs text-gray-500">+{dayTasks.length - 2} nữa</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-bold mb-4">📌 Video Sắp Tới</h3>
          <div className="space-y-3">
            {visibleTasks
              .filter(t => new Date(t.dueDate) >= today)
              .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
              .slice(0, 5)
              .map(task => (
                <div
                  key={task.id}
                  onClick={() => {
                    setSelectedTask(task);
                    setShowModal(true);
                  }}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                >
                  <div>
                    <div className="font-medium">{task.title}</div>
                    <div className="text-sm text-gray-600">{task.assignee}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                    <span className="text-sm">{task.dueDate}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };


  const ReportView = () => {
    // State cho filter thời gian
    const [dateRange, setDateRange] = useState('30days'); // '7days', '30days', 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    // Hàm tính toán khoảng thời gian
    const getDateRange = () => {
      const today = new Date();
      let startDate, endDate;

      if (dateRange === 'today') {
        startDate = new Date(today.setHours(0, 0, 0, 0));
        endDate = new Date(today.setHours(23, 59, 59, 999));
      } else if (dateRange === '7days') {
        endDate = new Date();
        startDate = new Date(today.setDate(today.getDate() - 7));
      } else if (dateRange === '30days') {
        endDate = new Date();
        startDate = new Date(today.setDate(today.getDate() - 30));
      } else if (dateRange === 'custom' && customStartDate && customEndDate) {
        startDate = new Date(customStartDate);
        endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // Mặc định 30 ngày
        endDate = new Date();
        startDate = new Date(today.setDate(today.getDate() - 30));
      }

      return { startDate, endDate };
    };

    // Lọc tasks theo khoảng thời gian
    const filteredTasks = useMemo(() => {
      const { startDate, endDate } = getDateRange();
      
      return visibleTasks.filter(task => {
        // Dùng created_at nếu có, fallback về dueDate
        const taskDate = task.created_at ? new Date(task.created_at) : new Date(task.dueDate);
        return taskDate >= startDate && taskDate <= endDate;
      });
    }, [visibleTasks, dateRange, customStartDate, customEndDate]);

    // Tính toán stats từ filtered tasks
    const filteredReportData = useMemo(() => {
      const statusStats = [
        { name: 'Nháp', value: filteredTasks.filter(t => t.status === 'Nháp').length, color: '#9ca3af' },
        { name: 'Chờ Duyệt', value: filteredTasks.filter(t => t.status === 'Chờ Duyệt').length, color: '#f59e0b' },
        { name: 'Đã Duyệt', value: filteredTasks.filter(t => t.status === 'Đã Duyệt').length, color: '#10b981' },
        { name: 'Đang Làm', value: filteredTasks.filter(t => t.status === 'Đang Làm').length, color: '#3b82f6' },
        { name: 'Hoàn Thành', value: filteredTasks.filter(t => t.status === 'Hoàn Thành').length, color: '#6b7280' }
      ].filter(s => s.value > 0);

      const teamStats = ['Content', 'Edit Video', 'Livestream', 'Kho'].map(t => ({
        name: t,
        completed: filteredTasks.filter(x => x.team === t && x.status === 'Hoàn Thành').length,
        inProgress: filteredTasks.filter(x => x.team === t && x.status === 'Đang Làm').length
      }));

      return { statusStats, teamStats };
    }, [filteredTasks]);

    // Tính toán % so với kỳ trước
    const compareWithPrevious = useMemo(() => {
      const { startDate, endDate } = getDateRange();
      const duration = endDate - startDate;
      const prevStartDate = new Date(startDate.getTime() - duration);
      const prevEndDate = new Date(startDate.getTime() - 1);

      const currentCompleted = filteredTasks.filter(t => t.status === 'Hoàn Thành').length;
      const prevCompleted = visibleTasks.filter(t => {
        const taskDate = t.created_at ? new Date(t.created_at) : new Date(t.dueDate);
        return taskDate >= prevStartDate && taskDate <= prevEndDate && t.status === 'Hoàn Thành';
      }).length;

      const change = prevCompleted === 0 ? 100 : ((currentCompleted - prevCompleted) / prevCompleted) * 100;
      
      return {
        current: currentCompleted,
        previous: prevCompleted,
        change: Math.round(change)
      };
    }, [filteredTasks, visibleTasks, dateRange, customStartDate, customEndDate]);

    return (
      <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-6">
        {/* Header với Date Range Filter */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">📈 Báo Cáo & Phân Tích</h2>
            <p className="text-xs md:text-sm text-gray-600 mt-1">
              Dữ liệu từ {filteredTasks.length} tasks trong khoảng thời gian đã chọn
            </p>
          </div>

          {/* Date Range Selector */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDateRange('today')}
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-medium transition-all text-sm ${
                dateRange === 'today'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              📅 Hôm nay
            </button>
            <button
              onClick={() => setDateRange('7days')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                dateRange === '7days'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              📅 7 ngày
            </button>
            <button
              onClick={() => setDateRange('30days')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                dateRange === '30days'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              📅 30 ngày
            </button>
            <button
              onClick={() => setDateRange('custom')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                dateRange === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              🔧 Tùy chỉnh
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {dateRange === 'custom' && (
          <div className="bg-white p-4 rounded-xl shadow">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Từ ngày:</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Đến ngày:</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards với So sánh */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl">✅</div>
              {compareWithPrevious.change !== 0 && (
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  compareWithPrevious.change > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {compareWithPrevious.change > 0 ? '↑' : '↓'} {Math.abs(compareWithPrevious.change)}%
                </div>
              )}
            </div>
            <div className="text-3xl font-bold mb-1">
              {filteredTasks.filter(t => t.status === 'Hoàn Thành').length}
            </div>
            <div className="text-sm text-gray-600">Video Hoàn Thành</div>
            <div className="text-xs text-gray-400 mt-1">
              Kỳ trước: {compareWithPrevious.previous}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-3xl font-bold mb-1">
              {filteredTasks.length > 0 
                ? Math.round((filteredTasks.filter(t => t.status === 'Hoàn Thành').length / filteredTasks.length) * 100)
                : 0}%
            </div>
            <div className="text-sm text-gray-600">Tỷ Lệ Hoàn Thành</div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow">
            <div className="text-3xl mb-2">⚠️</div>
            <div className="text-3xl font-bold mb-1">
              {filteredTasks.filter(t => t.isOverdue).length}
            </div>
            <div className="text-sm text-gray-600">Video Quá Hạn</div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-lg font-bold mb-4">📊 Phân Bố Trạng Thái</h3>
            {filteredReportData.statusStats.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={filteredReportData.statusStats} 
                      cx="50%" 
                      cy="50%" 
                      outerRadius={100} 
                      dataKey="value" 
                      label
                    >
                      {filteredReportData.statusStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-400">
                Không có dữ liệu trong khoảng thời gian này
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-lg font-bold mb-4">👥 Hiệu Suất Theo Team</h3>
            {filteredTasks.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredReportData.teamStats}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="completed" fill="#10b981" name="Hoàn thành" />
                    <Bar dataKey="inProgress" fill="#3b82f6" name="Đang làm" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-400">
                Không có dữ liệu trong khoảng thời gian này
              </div>
            )}
          </div>
        </div>

        {/* Top Performers trong khoảng thời gian */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-bold mb-4">🏆 Top Performers (Trong Kỳ)</h3>
          <div className="space-y-3">
            {Object.entries(
              filteredTasks
                .filter(t => t.status === 'Hoàn Thành')
                .reduce((acc, t) => {
                  acc[t.assignee] = (acc[t.assignee] || 0) + 1;
                  return acc;
                }, {})
            )
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([name, count], i) => (
                <div key={name} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</div>
                    <div>
                      <div className="font-medium">{name}</div>
                      <div className="text-sm text-gray-600">
                        {allUsers.find(u => u.name === name)?.team}
                      </div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold">{count}</div>
                </div>
              ))}
            {filteredTasks.filter(t => t.status === 'Hoàn Thành').length === 0 && (
              <div className="text-center py-8 text-gray-400">
                Chưa có task nào hoàn thành trong khoảng thời gian này
              </div>
            )}
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border border-blue-200">
          <h3 className="text-lg font-bold mb-4">📋 Tổng Quan Theo Thời Gian</h3>
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">Tổng Video</div>
              <div className="text-2xl font-bold">{filteredTasks.length}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Hoàn Thành</div>
              <div className="text-2xl font-bold text-green-600">
                {filteredTasks.filter(t => t.status === 'Hoàn Thành').length}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Đang Làm</div>
              <div className="text-2xl font-bold text-blue-600">
                {filteredTasks.filter(t => t.status === 'Đang Làm').length}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Tỷ Lệ Thành Công</div>
              <div className="text-2xl font-bold text-purple-600">
                {filteredTasks.length > 0 
                  ? Math.round((filteredTasks.filter(t => t.status === 'Hoàn Thành').length / filteredTasks.length) * 100)
                  : 0}%
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // COMPONENT: TodayJobsDashboard - Nhắc nhở công việc + Bản đồ
  // ============================================================
  const TodayJobsDashboard = () => {
    const [currentTime, setCurrentTime] = useState(getVietnamDate());
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [dismissedAlerts, setDismissedAlerts] = useState([]);

    // Update time mỗi phút
    useEffect(() => {
      const timer = setInterval(() => {
        setCurrentTime(getVietnamDate());
      }, 60000);
      return () => clearInterval(timer);
    }, []);

    // Lọc công việc hôm nay
    const todayJobs = useMemo(() => {
      const today = getTodayVN();
      return technicalJobs
        .filter(job => {
          if (job.scheduledDate !== today) return false;
          if (job.status === 'Hủy') return false;
          if (currentUser.role !== 'Admin' && currentUser.role !== 'admin' && currentUser.role !== 'Manager') {
            if (job.createdBy !== currentUser.name && 
                (!job.technicians || !job.technicians.includes(currentUser.name))) {
              return false;
            }
          }
          return true;
        })
        .sort((a, b) => {
          const timeA = a.scheduledTime || '00:00';
          const timeB = b.scheduledTime || '00:00';
          return timeA.localeCompare(timeB);
        });
    }, [technicalJobs, currentUser]);

    // Phân loại công việc theo độ ưu tiên
    const categorizedJobs = useMemo(() => {
      const now = currentTime;
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTotalMinutes = currentHour * 60 + currentMinute;

      return todayJobs.map(job => {
        const [jobHour, jobMinute] = (job.scheduledTime || '09:00').split(':').map(Number);
        const jobTotalMinutes = jobHour * 60 + jobMinute;
        const diffMinutes = jobTotalMinutes - currentTotalMinutes;

        let category = 'upcoming';
        let urgency = 'normal';
        let countdown = null;

        if (job.status === 'Hoàn thành') {
          category = 'completed';
          urgency = 'done';
        } else if (diffMinutes < -60) {
          category = 'overdue';
          urgency = 'critical';
          countdown = Math.abs(diffMinutes);
        } else if (diffMinutes < 0) {
          category = 'overdue';
          urgency = 'warning';
          countdown = Math.abs(diffMinutes);
        } else if (diffMinutes <= 30) {
          category = 'urgent';
          urgency = 'critical';
          countdown = diffMinutes;
        } else if (diffMinutes <= 120) {
          category = 'soon';
          urgency = 'warning';
          countdown = diffMinutes;
        } else {
          category = 'upcoming';
          urgency = 'normal';
          countdown = diffMinutes;
        }

        return { ...job, category, urgency, countdown, diffMinutes };
      });
    }, [todayJobs, currentTime]);

    // Thống kê
    const stats = useMemo(() => {
      const overdue = categorizedJobs.filter(j => j.category === 'overdue').length;
      const urgent = categorizedJobs.filter(j => j.category === 'urgent').length;
      const soon = categorizedJobs.filter(j => j.category === 'soon').length;
      const upcoming = categorizedJobs.filter(j => j.category === 'upcoming').length;
      const completed = categorizedJobs.filter(j => j.category === 'completed').length;
      const total = categorizedJobs.length;
      const totalRevenue = categorizedJobs.reduce((sum, j) => sum + (j.customerPayment || 0), 0);
      return { overdue, urgent, soon, upcoming, completed, total, totalRevenue };
    }, [categorizedJobs]);

    // Mở Google Maps điều hướng - Hỗ trợ link Google Maps, tọa độ GPS và địa chỉ thường
    const openNavigation = (job) => {
      const address = job.address || '';
      
      // Kiểm tra nếu là link Google Maps
      if (address.includes('google.com/maps') || address.includes('goo.gl/maps') || address.includes('maps.app.goo.gl')) {
        window.open(address, '_blank');
      } 
      // Kiểm tra nếu là tọa độ GPS (vd: 21.0285,105.8542 hoặc 21.0285, 105.8542)
      else if (/^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(address.trim())) {
        const coords = address.replace(/\s/g, '');
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${coords}`, '_blank');
      }
      // Nếu là địa chỉ thường, tìm kiếm trên Google Maps
      else {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
        window.open(url, '_blank');
      }
    };

    // Gọi điện
    const callCustomer = (phone) => {
      window.open(`tel:${phone}`, '_self');
    };

    // Tắt thông báo cho 1 job
    const dismissAlert = (jobId) => {
      setDismissedAlerts(prev => [...prev, jobId]);
    };

    // Format countdown
    const formatCountdown = (minutes) => {
      if (minutes < 60) return `${minutes} phút`;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}p` : `${hours} giờ`;
    };

    // Styles theo mức độ ưu tiên
    const getUrgencyStyles = (urgency) => {
      const styles = {
        critical: {
          card: 'bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-red-500 shadow-lg shadow-red-100',
          badge: 'bg-red-500 text-white animate-pulse',
          text: 'text-red-700',
          icon: '🚨'
        },
        warning: {
          card: 'bg-gradient-to-r from-amber-50 to-yellow-50 border-l-4 border-amber-500 shadow-md shadow-amber-100',
          badge: 'bg-amber-500 text-white',
          text: 'text-amber-700',
          icon: '⚠️'
        },
        normal: {
          card: 'bg-white border-l-4 border-blue-400 shadow hover:shadow-md',
          badge: 'bg-blue-100 text-blue-700',
          text: 'text-blue-700',
          icon: '📋'
        },
        done: {
          card: 'bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-500 opacity-75',
          badge: 'bg-green-500 text-white',
          text: 'text-green-700',
          icon: '✅'
        }
      };
      return styles[urgency] || styles.normal;
    };

    // Job Card Component - Compact version
    const TodayJobCard = ({ job }) => {
      const style = getUrgencyStyles(job.urgency);
      const isOverdue = job.category === 'overdue';

      return (
        <div className={`${style.card} rounded-lg p-3 transition-all`}>
          {/* Header row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{style.icon}</span>
              <span className="font-bold">{job.scheduledTime || '09:00'}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${style.badge}`}>
                {job.type || 'Lắp đặt'}
              </span>
              {job.countdown !== null && job.category !== 'completed' && (
                <span className={`text-xs font-medium ${style.text}`}>
                  {isOverdue ? `(-${formatCountdown(job.countdown)})` : `(${formatCountdown(job.countdown)})`}
                </span>
              )}
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
              job.status === 'Hoàn thành' ? 'bg-green-100 text-green-700' :
              job.status === 'Đang làm' ? 'bg-blue-100 text-blue-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {job.status || 'Chờ XN'}
            </span>
          </div>

          {/* Title & Customer */}
          <div 
            className="font-semibold text-gray-800 text-sm cursor-pointer hover:text-blue-600 mb-1"
            onClick={() => {
              setSelectedJob(job);
              setShowJobModal(true);
            }}
          >
            {job.title}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
            <span>👤 {job.customerName}</span>
            <a href={`tel:${job.customerPhone}`} className="text-green-600 font-medium">📞 {job.customerPhone}</a>
          </div>
          
          <div className="text-xs text-gray-500 mb-2 line-clamp-1">📍 {job.address}</div>

          {/* KTV & Payment */}
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-purple-600">🔧 {job.technicians?.join(', ') || 'Chưa phân công'}</span>
            {job.customerPayment > 0 && (
              <span className="font-bold text-green-600">💰 {formatMoney(job.customerPayment)}</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => openNavigation(job)}
              className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1"
            >
              🗺️ Chỉ đường
            </button>
            <button
              onClick={() => {
                setSelectedJob(job);
                setShowJobModal(true);
              }}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
            >
              Chi tiết
            </button>
          </div>
        </div>
      );
    };

    // Empty state
    if (todayJobs.length === 0) {
      return (
        <div className="p-4 md:p-6">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">Hôm nay không có lịch!</h3>
            <p className="text-gray-500">Không có công việc kỹ thuật nào được lên lịch cho hôm nay.</p>
            <div className="mt-4 text-sm text-gray-400">
              {currentTime.toLocaleDateString('vi-VN', { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
              })}
            </div>
          </div>
        </div>
      );
    }

    // Main render
    return (
      <div className="p-3 md:p-6 space-y-3 md:space-y-4">
        {/* Header - Thu gọn */}
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-xl p-3 md:p-4 text-white shadow-lg">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="text-2xl md:text-3xl font-mono font-bold">
                {currentTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="hidden md:block">
                <div className="text-sm opacity-80">
                  {currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'short' })}
                </div>
                <div className="font-semibold">Lịch Hôm Nay</div>
              </div>
            </div>
            
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-2 rounded-lg text-sm transition-all ${
                audioEnabled ? 'bg-white/20' : 'bg-red-500/50'
              }`}
            >
              {audioEnabled ? '🔔' : '🔕'}
            </button>
          </div>
        </div>

        {/* Stats - Thu gọn thành 1 dòng */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <div className="flex-shrink-0 bg-white rounded-lg px-3 py-2 shadow border-l-3 border-indigo-500 flex items-center gap-2">
            <span className="text-lg md:text-xl font-bold text-indigo-600">{stats.total}</span>
            <span className="text-xs text-gray-500">Tổng</span>
          </div>
          
          {stats.overdue > 0 && (
            <div className="flex-shrink-0 bg-red-50 rounded-lg px-3 py-2 shadow border-l-3 border-red-500 flex items-center gap-2 animate-pulse">
              <span className="text-lg md:text-xl font-bold text-red-600">{stats.overdue}</span>
              <span className="text-xs text-red-600">🚨 Trễ</span>
            </div>
          )}
          
          {stats.urgent > 0 && (
            <div className="flex-shrink-0 bg-orange-50 rounded-lg px-3 py-2 shadow border-l-3 border-orange-500 flex items-center gap-2">
              <span className="text-lg md:text-xl font-bold text-orange-600">{stats.urgent}</span>
              <span className="text-xs text-orange-600">⚡ Gấp</span>
            </div>
          )}
          
          {stats.soon > 0 && (
            <div className="flex-shrink-0 bg-amber-50 rounded-lg px-3 py-2 shadow border-l-3 border-amber-500 flex items-center gap-2">
              <span className="text-lg md:text-xl font-bold text-amber-600">{stats.soon}</span>
              <span className="text-xs text-amber-600">⏰ 2h</span>
            </div>
          )}
          
          <div className="flex-shrink-0 bg-blue-50 rounded-lg px-3 py-2 shadow border-l-3 border-blue-500 flex items-center gap-2">
            <span className="text-lg md:text-xl font-bold text-blue-600">{stats.upcoming}</span>
            <span className="text-xs text-blue-600">📋 Chờ</span>
          </div>
          
          <div className="flex-shrink-0 bg-green-50 rounded-lg px-3 py-2 shadow border-l-3 border-green-500 flex items-center gap-2">
            <span className="text-lg md:text-xl font-bold text-green-600">{stats.completed}</span>
            <span className="text-xs text-green-600">✅ Xong</span>
          </div>
        </div>

        {/* Doanh thu - Thu gọn */}
        {stats.totalRevenue > 0 && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg px-3 py-2 text-white shadow flex items-center justify-between">
            <span className="text-sm">💰 Doanh thu dự kiến:</span>
            <span className="font-bold">{formatMoney(stats.totalRevenue)}</span>
          </div>
        )}

        {/* Công việc quá hạn */}
        {stats.overdue > 0 && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-3">
            <h3 className="text-sm font-bold text-red-700 mb-2">🚨 QUÁ HẠN ({stats.overdue})</h3>
            <div className="space-y-2">
              {categorizedJobs.filter(j => j.category === 'overdue').map(job => (
                <TodayJobCard key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}

        {/* Công việc sắp đến giờ */}
        {stats.urgent > 0 && (
          <div className="bg-orange-50 border border-orange-300 rounded-xl p-3">
            <h3 className="text-sm font-bold text-orange-700 mb-2">⚡ SẮP ĐẾN ({stats.urgent})</h3>
            <div className="space-y-2">
              {categorizedJobs.filter(j => j.category === 'urgent').map(job => (
                <TodayJobCard key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}

        {/* Trong 2 giờ tới */}
        {stats.soon > 0 && (
          <div>
            <h3 className="text-sm font-bold text-amber-700 mb-2">⏰ Trong 2h ({stats.soon})</h3>
            <div className="space-y-2">
              {categorizedJobs.filter(j => j.category === 'soon').map(job => (
                <TodayJobCard key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}

        {/* Còn lại */}
        {stats.upcoming > 0 && (
          <div>
            <h3 className="text-sm font-bold text-blue-700 mb-2">📋 Còn lại ({stats.upcoming})</h3>
            <div className="space-y-2">
              {categorizedJobs.filter(j => j.category === 'upcoming').map(job => (
                <TodayJobCard key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}

        {/* Đã hoàn thành */}
        {stats.completed > 0 && (
          <div className="opacity-60">
            <h3 className="text-sm font-bold text-green-700 mb-2">✅ Xong ({stats.completed})</h3>
            <div className="space-y-2">
              {categorizedJobs.filter(j => j.category === 'completed').map(job => (
                <TodayJobCard key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}

        {/* Lộ trình */}
        <div className="bg-white rounded-xl p-3 shadow">
          <h3 className="text-sm font-bold text-gray-700 mb-2">🗺️ Lộ Trình</h3>
          <div className="space-y-2">
            {categorizedJobs.filter(j => j.category !== 'completed').map((job, index) => (
              <div 
                key={job.id}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                onClick={() => openNavigation(job)}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-white text-xs ${
                  job.urgency === 'critical' ? 'bg-red-500' :
                  job.urgency === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 truncate text-sm">{job.title}</div>
                  <div className="text-xs text-gray-500 truncate">{job.address}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-700 text-sm">{job.scheduledTime}</div>
                  <div className="text-blue-600 text-xs">Chỉ đường →</div>
                </div>
              </div>
            ))}
          </div>
          
          {categorizedJobs.filter(j => j.category !== 'completed').length > 1 && (
            <button
              onClick={() => {
                const jobs = categorizedJobs.filter(j => j.category !== 'completed');
                // Lọc các job có địa chỉ thường (không phải link)
                const normalAddresses = jobs
                  .filter(j => !j.address?.includes('google.com/maps') && !j.address?.includes('goo.gl') && !j.address?.includes('maps.app.goo.gl'))
                  .map(j => encodeURIComponent(j.address));
                
                if (normalAddresses.length > 1) {
                  window.open(`https://www.google.com/maps/dir/${normalAddresses.join('/')}`, '_blank');
                } else if (normalAddresses.length === 1) {
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${normalAddresses[0]}`, '_blank');
                } else {
                  alert('Các công việc đều có link Google Maps riêng. Vui lòng mở từng công việc.');
                }
              }}
              className="w-full mt-2 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
            >
              🗺️ Mở lộ trình Google Maps
            </button>
          )}
        </div>
      </div>
    );
  };
  // ============ END TodayJobsDashboard ============

  // ============ TechnicalCalendarView - Lịch tổng quan ============
  const TechnicalCalendarView = () => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);

    // Lấy jobs của tháng hiện tại
    const getJobsInMonth = () => {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      return technicalJobs.filter(job => {
        if (!job.scheduledDate) return false;
        const jobDate = new Date(job.scheduledDate);
        return jobDate.getFullYear() === year && jobDate.getMonth() === month;
      });
    };

    // Đếm jobs theo ngày
    const getJobCountByDate = (dateStr) => {
      return technicalJobs.filter(j => j.scheduledDate === dateStr && j.status !== 'Hủy').length;
    };

    // Lấy jobs của ngày được chọn
    const getJobsForDate = (dateStr) => {
      return technicalJobs.filter(j => j.scheduledDate === dateStr && j.status !== 'Hủy')
        .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
    };

    // Tạo calendar grid
    const generateCalendarDays = () => {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startPadding = firstDay.getDay(); // 0 = Sunday
      const daysInMonth = lastDay.getDate();

      const days = [];
      
      // Padding đầu tháng
      for (let i = 0; i < startPadding; i++) {
        days.push({ day: null, date: null });
      }
      
      // Các ngày trong tháng
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({ day: d, date: dateStr });
      }

      return days;
    };

    const todayStr = getTodayVN();
    const days = generateCalendarDays();
    const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 
                        'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
    const goToToday = () => {
      setCurrentMonth(new Date());
      setSelectedDate(todayStr);
    };

    // Thống kê tháng
    const monthJobs = getJobsInMonth();
    const pendingJobs = monthJobs.filter(j => j.status !== 'Hoàn thành' && j.status !== 'Hủy').length;
    const completedJobs = monthJobs.filter(j => j.status === 'Hoàn thành').length;
    const totalRevenue = monthJobs.filter(j => j.status !== 'Hủy').reduce((sum, j) => sum + (j.customerPayment || 0), 0);

    return (
      <div className="p-3 md:p-6 pb-20 md:pb-6 space-y-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="p-2 hover:bg-white/20 rounded-lg">◀</button>
            <div className="text-center">
              <div className="text-xl font-bold">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</div>
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-white/20 rounded-lg">▶</button>
          </div>
          <button onClick={goToToday} className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium">
            📅 Về hôm nay
          </button>
        </div>

        {/* Thống kê tháng */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-blue-600">{pendingJobs}</div>
            <div className="text-xs text-blue-600">Chờ làm</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-green-600">{completedJobs}</div>
            <div className="text-xs text-green-600">Hoàn thành</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-amber-600">{formatMoney(totalRevenue)}</div>
            <div className="text-xs text-amber-600">Doanh thu</div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 bg-gray-100">
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => (
              <div key={d} className="py-2 text-center text-xs font-medium text-gray-600">{d}</div>
            ))}
          </div>
          
          {/* Days grid */}
          <div className="grid grid-cols-7">
            {days.map((item, idx) => {
              if (!item.day) return <div key={idx} className="h-12 bg-gray-50" />;
              
              const jobCount = getJobCountByDate(item.date);
              const isToday = item.date === todayStr;
              const isSelected = item.date === selectedDate;
              const hasJobs = jobCount > 0;
              
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(item.date === selectedDate ? null : item.date)}
                  className={`h-12 md:h-14 flex flex-col items-center justify-center relative border-b border-r transition-all ${
                    isSelected ? 'bg-blue-100 ring-2 ring-blue-500' :
                    isToday ? 'bg-orange-50' : 
                    hasJobs ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-sm font-medium ${
                    isToday ? 'text-orange-600 font-bold' : 
                    isSelected ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    {item.day}
                  </span>
                  {hasJobs && (
                    <span className={`text-[10px] px-1.5 rounded-full mt-0.5 ${
                      isSelected ? 'bg-blue-500 text-white' : 'bg-green-500 text-white'
                    }`}>
                      {jobCount}
                    </span>
                  )}
                  {isToday && (
                    <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-orange-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Date Jobs */}
        {selectedDate && (
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800">
                📅 {new Date(selectedDate).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <button 
                onClick={() => setSelectedDate(null)}
                className="text-gray-400 hover:text-gray-600"
              >✕</button>
            </div>
            
            {getJobsForDate(selectedDate).length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <div className="text-3xl mb-2">📭</div>
                <div>Không có công việc</div>
              </div>
            ) : (
              <div className="space-y-2">
                {getJobsForDate(selectedDate).map(job => {
                  // Kiểm tra quyền xem chi tiết: admin, người tạo, hoặc KTV được phân công
                  const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'admin';
                  const isCreator = job.createdBy === currentUser.name;
                  const isTechnician = job.technicians?.includes(currentUser.name);
                  const canViewDetail = isAdmin || isCreator || isTechnician;
                  
                  return (
                    <div 
                      key={job.id}
                      onClick={() => {
                        if (canViewDetail) {
                          setSelectedJob(job);
                          setShowJobModal(true);
                        }
                      }}
                      className={`p-3 rounded-lg border-l-4 transition-all ${
                        job.status === 'Hoàn thành' ? 'bg-green-50 border-green-500' :
                        job.status === 'Đang làm' ? 'bg-blue-50 border-blue-500' :
                        'bg-amber-50 border-amber-500'
                      } ${canViewDetail ? 'cursor-pointer hover:shadow' : 'cursor-default opacity-80'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-gray-800">{job.scheduledTime || '—'}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          job.status === 'Hoàn thành' ? 'bg-green-100 text-green-700' :
                          job.status === 'Đang làm' ? 'bg-blue-100 text-blue-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {job.status || 'Chờ XN'}
                        </span>
                      </div>
                      <div className="font-medium text-gray-700 text-sm">{job.title}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        🔧 {job.technicians?.join(', ') || 'Chưa phân công'}
                      </div>
                      {/* Chỉ hiện thông tin chi tiết nếu có quyền */}
                      {canViewDetail ? (
                        <>
                          <div className="text-xs text-gray-500">👤 {job.customerName}</div>
                          {job.customerPayment > 0 && (
                            <div className="text-xs font-medium text-green-600 mt-1">💰 {formatMoney(job.customerPayment)}</div>
                          )}
                        </>
                      ) : (
                        <div className="text-xs text-gray-400 mt-1 italic">🔒 Xem chi tiết: liên hệ người tạo/KTV</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {selectedDate >= todayStr && (
              <button
                onClick={() => {
                  setPrefillJobData({ scheduledDate: selectedDate });
                  setShowCreateJobModal(true);
                }}
                className="w-full mt-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
              >
                ➕ Thêm công việc ngày này
              </button>
            )}
          </div>
        )}

        {/* Upcoming Jobs Preview */}
        {!selectedDate && (
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-bold text-gray-800 mb-3">📋 Công việc sắp tới</h3>
            {technicalJobs
              .filter(j => j.scheduledDate >= todayStr && j.status !== 'Hủy' && j.status !== 'Hoàn thành')
              .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || (a.scheduledTime || '').localeCompare(b.scheduledTime || ''))
              .slice(0, 5)
              .map(job => {
                // Kiểm tra quyền xem chi tiết
                const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'admin';
                const isCreator = job.createdBy === currentUser.name;
                const isTechnician = job.technicians?.includes(currentUser.name);
                const canViewDetail = isAdmin || isCreator || isTechnician;
                
                return (
                  <div 
                    key={job.id}
                    onClick={() => {
                      if (canViewDetail) {
                        setSelectedJob(job);
                        setShowJobModal(true);
                      }
                    }}
                    className={`flex items-center gap-3 py-2 border-b last:border-0 rounded ${
                      canViewDetail ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${
                      job.scheduledDate === todayStr ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {new Date(job.scheduledDate).getDate()}/{new Date(job.scheduledDate).getMonth() + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 text-sm truncate">{job.title}</div>
                      <div className="text-xs text-gray-500">
                        {job.scheduledTime} • {canViewDetail ? job.customerName : '🔒'}
                      </div>
                    </div>
                    {canViewDetail ? (
                      <span className="text-gray-400">→</span>
                    ) : (
                      <span className="text-gray-300 text-xs">🔒</span>
                    )}
                  </div>
                );
              })
            }
            {technicalJobs.filter(j => j.scheduledDate >= todayStr && j.status !== 'Hủy' && j.status !== 'Hoàn thành').length === 0 && (
              <div className="text-center py-4 text-gray-500">
                Không có công việc sắp tới
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  // ============ END TechnicalCalendarView ============

  const TechnicalJobsView = () => {
    // Lấy danh sách người tạo và kỹ thuật viên unique
    const creators = [...new Set(technicalJobs.map(j => j.createdBy).filter(Boolean))];
    const technicians = [...new Set(technicalJobs.flatMap(j => j.technicians || []))];
    
    const visibleJobs = technicalJobs.filter(job => {
      // Admin và Manager thấy tất cả
      if (currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager') return true;
      
      // Người tạo luôn thấy job của mình
      if (job.createdBy === currentUser.name) return true;
      
      // Technical members thấy jobs được assign
      if (currentUser.departments && currentUser.departments.includes('technical')) {
        if (job.technicians && job.technicians.includes(currentUser.name)) return true;
      }
      
      // Sales thấy jobs mình tạo (đã check ở trên)
      
      return false;
    });

    // Áp dụng filter
    const filteredJobs = visibleJobs.filter(job => {
      // Filter theo người tạo
      if (jobFilterCreator !== 'all' && job.createdBy !== jobFilterCreator) return false;
      
      // Filter theo kỹ thuật viên
      if (jobFilterTechnician !== 'all') {
        if (!job.technicians || !job.technicians.includes(jobFilterTechnician)) return false;
      }
      
      // Filter theo trạng thái
      if (jobFilterStatus !== 'all' && job.status !== jobFilterStatus) return false;
      
      // Filter theo ngày
      if (jobFilterDateMode === 'month') {
        const jobDate = new Date(job.scheduledDate);
        if (jobDate.getMonth() + 1 !== jobFilterMonth || jobDate.getFullYear() !== jobFilterYear) return false;
      } else if (jobFilterDateMode === 'custom' && jobCustomStartDate && jobCustomEndDate) {
        const jobDate = new Date(job.scheduledDate);
        const start = new Date(jobCustomStartDate);
        const end = new Date(jobCustomEndDate);
        end.setDate(end.getDate() + 1);
        if (jobDate < start || jobDate >= end) return false;
      }
      
      return true;
    });

    const getStatusColor = (status) => {
      const colors = {
        'Chờ XN': 'bg-yellow-100 text-yellow-800',
        'Đang làm': 'bg-blue-100 text-blue-800',
        'Hoàn thành': 'bg-green-100 text-green-800',
        'Hủy': 'bg-gray-100 text-gray-800'
      };
      return colors[status] || 'bg-gray-100';
    };

    // Reset tất cả filter
    const resetFilters = () => {
      setJobFilterCreator('all');
      setJobFilterTechnician('all');
      setJobFilterStatus('all');
      setJobFilterDateMode('all');
    };

    const hasActiveFilter = jobFilterCreator !== 'all' || jobFilterTechnician !== 'all' || 
                           jobFilterStatus !== 'all' || jobFilterDateMode !== 'all';

    const [showFilters, setShowFilters] = useState(false);
    
    return (
      <div className="p-3 md:p-6">
        <div className="flex justify-between items-center gap-2 mb-3">
          <h2 className="text-lg md:text-xl font-bold">🔧 Công Việc</h2>
          <button
            onClick={() => setShowCreateJobModal(true)}
            className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium text-sm"
          >
            ➕ Tạo mới
          </button>
        </div>

        {/* Filter Section - Compact */}
        <div className="bg-white rounded-lg shadow mb-3">
          {/* Filter Header - Always visible */}
          <div 
            className="flex items-center justify-between p-2 cursor-pointer"
            onClick={() => setShowFilters(!showFilters)}
          >
            <div className="flex items-center gap-2 text-sm">
              <span>🔍</span>
              <span className="font-medium">Lọc</span>
              <span className="text-gray-500">({filteredJobs.length}/{visibleJobs.length})</span>
              {hasActiveFilter && (
                <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-xs">Đang lọc</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilter && (
                <button
                  onClick={(e) => { e.stopPropagation(); resetFilters(); }}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  ✕ Xóa
                </button>
              )}
              <span className="text-gray-400">{showFilters ? '▲' : '▼'}</span>
            </div>
          </div>
          
          {/* Filter Content - Collapsible */}
          {showFilters && (
            <div className="p-2 pt-0 border-t space-y-2">
              {/* Row 1: 4 filters inline on desktop, 2x2 on mobile */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <select
                  value={jobFilterCreator}
                  onChange={(e) => setJobFilterCreator(e.target.value)}
                  className="px-2 py-1.5 border rounded text-xs"
                >
                  <option value="all">👤 Người tạo</option>
                  {creators.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  value={jobFilterTechnician}
                  onChange={(e) => setJobFilterTechnician(e.target.value)}
                  className="px-2 py-1.5 border rounded text-xs"
                >
                  <option value="all">🔧 KTV</option>
                  {technicians.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                <select
                  value={jobFilterStatus}
                  onChange={(e) => setJobFilterStatus(e.target.value)}
                  className="px-2 py-1.5 border rounded text-xs"
                >
                  <option value="all">📊 Trạng thái</option>
                  <option value="Chờ XN">Chờ XN</option>
                  <option value="Đang làm">Đang làm</option>
                  <option value="Hoàn thành">Hoàn thành</option>
                  <option value="Hủy">Hủy</option>
                </select>

                <select
                  value={jobFilterDateMode}
                  onChange={(e) => setJobFilterDateMode(e.target.value)}
                  className="px-2 py-1.5 border rounded text-xs"
                >
                  <option value="all">📅 Thời gian</option>
                  <option value="month">Theo tháng</option>
                  <option value="custom">Tùy chỉnh</option>
                </select>
              </div>

              {/* Row 2: Date filters if needed */}
              {jobFilterDateMode === 'month' && (
                <div className="flex gap-2">
                  <select
                    value={jobFilterMonth}
                    onChange={(e) => setJobFilterMonth(parseInt(e.target.value))}
                    className="flex-1 px-2 py-1.5 border rounded text-xs"
                  >
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                  <select
                    value={jobFilterYear}
                    onChange={(e) => setJobFilterYear(parseInt(e.target.value))}
                    className="flex-1 px-2 py-1.5 border rounded text-xs"
                  >
                    {[2024, 2025, 2026, 2027].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              )}

              {jobFilterDateMode === 'custom' && (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={jobCustomStartDate}
                    onChange={(e) => setJobCustomStartDate(e.target.value)}
                    className="flex-1 px-2 py-1.5 border rounded text-xs"
                    placeholder="Từ"
                  />
                  <input
                    type="date"
                    value={jobCustomEndDate}
                    onChange={(e) => setJobCustomEndDate(e.target.value)}
                    className="flex-1 px-2 py-1.5 border rounded text-xs"
                    placeholder="Đến"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3">
          {filteredJobs.length === 0 ? (
            <div className="bg-white p-12 rounded-xl text-center text-gray-500">
              <div className="text-6xl mb-4">🔧</div>
              <div className="text-xl">Không có công việc nào phù hợp</div>
              {hasActiveFilter && (
                <button
                  onClick={resetFilters}
                  className="mt-4 text-orange-600 hover:text-orange-700"
                >
                  Xóa bộ lọc để xem tất cả
                </button>
              )}
            </div>
          ) : (
            filteredJobs.map(job => (
              <div
                key={job.id}
                onClick={() => {
                  setSelectedJob(job);
                  setShowJobModal(true);
                }}
                className="bg-white rounded-xl shadow hover:shadow-lg transition-all cursor-pointer border-l-4 border-orange-500 overflow-hidden"
              >
                {/* Header với ngày và trạng thái */}
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-2 border-b flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📅</span>
                    <span className="font-bold text-orange-700">
                      {job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'Chưa xếp lịch'}
                    </span>
                    {job.scheduledTime && (
                      <span className="text-orange-600 font-medium">• {job.scheduledTime}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                      {job.type}
                    </span>
                  </div>
                </div>

                {/* Body - Thông tin chính */}
                <div className="p-4">
                  {/* Tiêu đề công việc */}
                  <h3 className="text-lg font-bold text-gray-800 mb-3">{job.title}</h3>
                  
                  {/* Grid thông tin quan trọng */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Cột trái - Khách hàng */}
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-2">
                        <span className="text-blue-500">👤</span>
                        <div>
                          <div className="font-semibold text-blue-800">{job.customerName}</div>
                          <div className="text-blue-600 text-sm">{job.customerPhone}</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-gray-600 text-sm">
                        <span>📍</span>
                        <span className="line-clamp-2">{job.address}</span>
                      </div>
                    </div>
                    
                    {/* Cột phải - KTV & Tiền */}
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 bg-purple-50 rounded-lg p-2">
                        <span className="text-purple-500">🔧</span>
                        <div className="text-sm">
                          <div className="text-purple-600 font-medium">Kỹ thuật viên:</div>
                          <div className="text-purple-800 font-semibold">
                            {job.technicians && job.technicians.length > 0 ? job.technicians.join(', ') : 'Chưa phân công'}
                          </div>
                        </div>
                      </div>
                      
                      {/* Tiền thu - Nổi bật */}
                      {job.customerPayment > 0 ? (
                        <div className="flex items-center gap-2 bg-green-100 rounded-lg p-2 border border-green-300">
                          <span className="text-xl">💰</span>
                          <div>
                            <div className="text-xs text-green-600">Thu khách</div>
                            <div className="font-bold text-green-700 text-lg">
                              {job.customerPayment.toLocaleString('vi-VN')}đ
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-2 text-gray-500 text-sm">
                          <span>💰</span>
                          <span>Chưa nhập tiền thu</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Nút Google Maps */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const address = job.address || '';
                      if (address.includes('google.com/maps') || address.includes('goo.gl/maps') || address.includes('maps.app.goo.gl')) {
                        window.open(address, '_blank');
                      } else if (/^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(address.trim())) {
                        const coords = address.replace(/\s/g, '');
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${coords}`, '_blank');
                      } else {
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, '_blank');
                      }
                    }}
                    className="w-full mt-3 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2 shadow-md"
                  >
                    <span className="text-lg">🗺️</span>
                    <span>Mở Google Maps</span>
                  </button>

                  {/* Footer - Người tạo */}
                  {job.createdBy && (
                    <div className="mt-3 pt-2 border-t text-xs text-gray-500 flex items-center gap-1">
                      <span>📝</span>
                      <span>Người tạo: {job.createdBy}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };


  const IntegrationsView = () => (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">🔗 Tích Hợp</h2>
        <p className="text-gray-600 mt-1">Kết nối các công cụ cá nhân của bạn</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl">ℹ️</span>
          <div className="text-sm text-blue-800">
            <div className="font-semibold mb-1">Tích hợp cá nhân</div>
            <div>Các tích hợp này chỉ áp dụng cho tài khoản của <strong>{currentUser.name}</strong>. Mỗi thành viên có thể kết nối công cụ riêng của mình.</div>
          </div>
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        {[
          { name: 'Google Calendar', key: 'calendar', icon: '📅', desc: 'Đồng bộ deadline lên Calendar' },
          { name: 'Facebook Pages', key: 'facebook', icon: '📘', desc: 'Quản lý đăng bài Facebook' },
          { name: 'Slack', key: 'slack', icon: '💬', desc: 'Nhận thông báo qua Slack' }
        ].map(int => (
          <div key={int.key} className="bg-white p-6 rounded-xl shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl">{int.icon}</div>
                <div>
                  <h3 className="font-bold">{int.name}</h3>
                  <p className="text-sm text-gray-600">{int.desc}</p>
                </div>
              </div>
              <label className="relative inline-block w-12 h-6">
                <input
                  type="checkbox"
                  checked={integrations[int.key].on}
                  onChange={(e) =>
                    setIntegrations({
                      ...integrations,
                      [int.key]: { ...integrations[int.key], on: e.target.checked }
                    })
                  }
                  className="sr-only peer"
                />
                <span className="absolute cursor-pointer inset-0 bg-gray-300 rounded-full peer-checked:bg-blue-600 transition-colors" />
                <span className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-6" />
              </label>
            </div>
            {integrations[int.key].on && (
              <input
                type="text"
                placeholder={`Nhập ${int.key === 'calendar' ? 'email' : int.key === 'facebook' ? 'Page ID' : 'Slack channel'}`}
                value={integrations[int.key][int.key === 'calendar' ? 'email' : int.key === 'facebook' ? 'page' : 'channel']}
                onChange={(e) =>
                  setIntegrations({
                    ...integrations,
                    [int.key]: { ...integrations[int.key], [int.key === 'calendar' ? 'email' : int.key === 'facebook' ? 'page' : 'channel']: e.target.value }
                  })
                }
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const AutomationView = () => (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">⚙️ Automation</h2>
      
      <div className="space-y-4">
        {automations.map(auto => (
          <div key={auto.id} className="bg-white p-6 rounded-xl shadow">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-bold text-lg">{auto.name}</h3>
                <div className="text-sm text-gray-600 mt-1">
                  Khi: <span className="font-medium">{auto.trigger}</span> → 
                  Thực hiện: <span className="font-medium">{auto.action}</span>
                </div>
              </div>
              <label className="relative inline-block w-12 h-6">
                <input
                  type="checkbox"
                  checked={auto.active}
                  onChange={(e) =>
                    setAutomations(
                      automations.map(a =>
                        a.id === auto.id ? { ...a, active: e.target.checked } : a
                      )
                    )
                  }
                  className="sr-only peer"
                />
                <span className="absolute cursor-pointer inset-0 bg-gray-300 rounded-full peer-checked:bg-green-600 transition-colors" />
                <span className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-6" />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-4">📋 Templates</h3>
        <div className="space-y-3">
          {templates.map(template => (
            <div key={template.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium">{template.name}</div>
                <div className="text-sm text-gray-600">{template.tasks.length} tasks • {template.team}</div>
              </div>
              <button
                onClick={() => createFromTemplate(template)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Sử dụng
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Reset Data - Chỉ Manager mới thấy */}
      {currentUser && currentUser.role === 'Manager' && (
        <div className="mt-6 bg-red-50 border-2 border-red-200 p-6 rounded-xl">
          <h3 className="font-bold text-lg mb-2 text-red-700">⚠️ Khu Vực Nguy Hiểm</h3>
          <p className="text-sm text-gray-700 mb-4">
            Xóa toàn bộ dữ liệu và khôi phục về mặc định. Hành động này KHÔNG THỂ hoàn tác!
          </p>
          <button
            onClick={() => {
              // eslint-disable-next-line no-restricted-globals
              if (confirm('⚠️ BẠN CÓ CHẮC CHẮN?\n\nĐiều này sẽ:\n- Xóa TẤT CẢ tasks trong database\n- Xóa TẤT CẢ users đã tạo\n\nHành động này KHÔNG THỂ hoàn tác!')) {
                // eslint-disable-next-line no-restricted-globals
                if (confirm('⚠️ XÁC NHẬN LẦN CUỐI!\n\nBạn THỰC SỰ muốn xóa toàn bộ dữ liệu?')) {
                  // Delete all tasks and custom users from Supabase
                  alert('⚠️ Tính năng Reset đã tạm thời vô hiệu hóa để bảo vệ dữ liệu Supabase.\n\nNếu cần xóa dữ liệu, vui lòng vào Supabase Dashboard.');
                }
              }
            }}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
          >
            🗑️ Reset Toàn Bộ Dữ Liệu
          </button>
        </div>
      )}
    </div>
  );

  const UserManagementView = () => {
    const [showEditUserModal, setShowEditUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [showEditTeamsModal, setShowEditTeamsModal] = useState(false);
    const [editingTeamsUser, setEditingTeamsUser] = useState(null);

    if (currentUser?.role !== 'Admin') {
      return (
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-2xl font-bold text-red-700 mb-2">Không Có Quyền Truy Cập</h2>
            <p className="text-gray-600">Chỉ Admin mới có thể quản lý users.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">👥 Quản Lý Users</h2>
            <p className="text-gray-600 mt-1">Quản lý tài khoản và phân quyền</p>
          </div>
          <div className="bg-blue-50 px-4 py-2 rounded-lg">
            <span className="text-sm font-medium text-blue-700">
              Tổng: {allUsers.length} users
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Họ Tên</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Email</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Team</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Bộ Phận</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Vai Trò</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {allUsers.map(user => (
                <tr key={user.id} className={user.id === currentUser.id ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.name}</span>
                      {user.id === currentUser.id && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                          Bạn
                        </span>
                      )}
                      {user.email === 'dotien.work@gmail.com' && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                          👑 Admin Chính
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1 flex-wrap">
                      {(user.teams || [user.team].filter(Boolean)).map((team, idx) => (
                        <span key={idx} className={`px-2 py-1 rounded-full text-xs ${
                          team === 'Content' ? 'bg-blue-100 text-blue-700' :
                          team === 'Kỹ Thuật' ? 'bg-orange-100 text-orange-700' :
                          team === 'Sale' ? 'bg-green-100 text-green-700' :
                          team === 'Edit Video' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {team}
                        </span>
                      ))}
                      {(!user.teams && !user.team) && (
                        <span className="text-xs text-gray-400">Chưa có team</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1 flex-wrap">
                      {user.departments && user.departments.includes('media') && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                          🎬 Media
                        </span>
                      )}
                      {user.departments && user.departments.includes('technical') && (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">
                          🔧 Kỹ Thuật
                        </span>
                      )}
                      {user.departments && user.departments.includes('sales') && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          💼 Sales
                        </span>
                      )}
                      {(!user.departments || user.departments.length === 0) && (
                        <span className="text-xs text-gray-400">Chưa chọn</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={user.role}
                      onChange={(e) => {
                        if (window.confirm(`Thay đổi vai trò của ${user.name} thành ${e.target.value}?`)) {
                          changeUserRole(user.id, e.target.value);
                        }
                      }}
                      disabled={user.email === 'dotien.work@gmail.com'}
                      className={`px-3 py-1 rounded-lg text-sm font-medium border-2 ${
                        user.role === 'Admin' ? 'border-red-200 bg-red-50 text-red-700' :
                        user.role === 'Manager' ? 'border-purple-200 bg-purple-50 text-purple-700' :
                        user.role === 'Team Lead' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                        'border-gray-200 bg-gray-50 text-gray-700'
                      } ${user.email === 'dotien.work@gmail.com' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <option value="Admin">Admin</option>
                      <option value="Manager">Manager</option>
                      <option value="Team Lead">Team Lead</option>
                      <option value="Member">Member</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingUser(user);
                          setShowEditUserModal(true);
                        }}
                        className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium"
                      >
                        ✏️ Bộ Phận
                      </button>
                      <button
                        onClick={() => {
                          setEditingTeamsUser(user);
                          setShowEditTeamsModal(true);
                        }}
                        className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium"
                      >
                        👥 Teams
                      </button>
                      {user.id !== currentUser.id && user.email !== 'dotien.work@gmail.com' && (
                        <button
                          onClick={() => {
                            if (window.confirm(`⚠️ Xóa user "${user.name}"?\n\nHành động này không thể hoàn tác!`)) {
                              deleteUser(user.id);
                            }
                          }}
                          className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium"
                        >
                          🗑️ Xóa
                        </button>
                      )}
                    </div>
                    {user.id === currentUser.id && (
                      <span className="text-xs text-gray-400 mt-1 block">Bạn không thể xóa chính mình</span>
                    )}
                    {user.email === 'dotien.work@gmail.com' && user.id !== currentUser.id && (
                      <span className="text-xs text-gray-400 mt-1 block">🔒 Tài khoản được bảo vệ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <h3 className="font-bold text-yellow-800 mb-2">ℹ️ Hướng Dẫn</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• <strong>Admin:</strong> Toàn quyền quản lý hệ thống, users, và dữ liệu</li>
            <li>• <strong>Manager:</strong> Quản lý tất cả tasks, phê duyệt, báo cáo</li>
            <li>• <strong>Team Lead:</strong> Quản lý tasks của team, phê duyệt team</li>
            <li>• <strong>Member:</strong> Chỉ quản lý tasks của bản thân</li>
          </ul>
        </div>

        {/* Edit Departments Modal */}
        {showEditUserModal && editingUser && (
          <EditUserDepartmentsModal 
            user={editingUser}
            onClose={() => {
              setShowEditUserModal(false);
              setEditingUser(null);
            }}
            onSave={async (departments) => {
              try {
                const { error } = await supabase
                  .from('users')
                  .update({ departments })
                  .eq('id', editingUser.id);
                
                if (error) throw error;
                
                alert('✅ Đã cập nhật bộ phận!');
                await loadUsers();
                setShowEditUserModal(false);
                setEditingUser(null);
              } catch (error) {
                console.error('Error updating departments:', error);
                alert('❌ Lỗi khi cập nhật bộ phận!');
              }
            }}
          />
        )}

        {showEditTeamsModal && editingTeamsUser && (
          <EditUserTeamsModal 
            user={editingTeamsUser}
            onClose={() => {
              setShowEditTeamsModal(false);
              setEditingTeamsUser(null);
            }}
            onSave={async (teams) => {
              try {
                const { error } = await supabase
                  .from('users')
                  .update({ teams })
                  .eq('id', editingTeamsUser.id);
                
                if (error) throw error;
                
                alert('✅ Đã cập nhật teams!');
                await loadUsers();
                setShowEditTeamsModal(false);
                setEditingTeamsUser(null);
              } catch (error) {
                console.error('Error updating teams:', error);
                alert('❌ Lỗi khi cập nhật teams!');
              }
            }}
          />
        )}
      </div>
    );
  };

  const EditUserDepartmentsModal = ({ user, onClose, onSave }) => {
    const [departments, setDepartments] = useState(user.departments || []);

    const toggleDepartment = (dept) => {
      if (departments.includes(dept)) {
        setDepartments(departments.filter(d => d !== dept));
      } else {
        setDepartments([...departments, dept]);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-md w-full">
          <div className="p-6 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white">
            <h2 className="text-2xl font-bold">✏️ Chỉnh Sửa Bộ Phận</h2>
            <p className="text-sm mt-1 opacity-90">{user.name}</p>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              Chọn bộ phận mà user này có thể làm việc:
            </p>

            <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors">
              <input
                type="checkbox"
                checked={departments.includes('media')}
                onChange={() => toggleDepartment('media')}
                className="w-5 h-5 text-blue-600"
              />
              <div className="flex-1">
                <div className="font-medium">🎬 Media</div>
                <div className="text-sm text-gray-500">Quản lý tasks marketing, content, ads</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-orange-50 transition-colors">
              <input
                type="checkbox"
                checked={departments.includes('technical')}
                onChange={() => toggleDepartment('technical')}
                className="w-5 h-5 text-orange-600"
              />
              <div className="flex-1">
                <div className="font-medium">🔧 Kỹ Thuật</div>
                <div className="text-sm text-gray-500">Lắp đặt, bảo trì, sửa chữa thiết bị</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-green-50 transition-colors">
              <input
                type="checkbox"
                checked={departments.includes('sales')}
                onChange={() => toggleDepartment('sales')}
                className="w-5 h-5 text-green-600"
              />
              <div className="flex-1">
                <div className="font-medium">💼 Sales</div>
                <div className="text-sm text-gray-500">Bán hàng, lên đơn, gán việc kỹ thuật</div>
              </div>
            </label>

            {departments.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                ⚠️ Vui lòng chọn ít nhất 1 bộ phận
              </div>
            )}
          </div>

          <div className="p-6 border-t bg-gray-50 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                if (departments.length === 0) {
                  alert('⚠️ Vui lòng chọn ít nhất 1 bộ phận!');
                  return;
                }
                onSave(departments);
              }}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              ✅ Lưu
            </button>
          </div>
        </div>
      </div>
    );
  };

  const EditUserTeamsModal = ({ user, onClose, onSave }) => {
    const [teams, setTeams] = useState(user.teams || [user.team].filter(Boolean));

    const toggleTeam = (team) => {
      if (teams.includes(team)) {
        setTeams(teams.filter(t => t !== team));
      } else {
        setTeams([...teams, team]);
      }
    };

    const AVAILABLE_TEAMS = [
      { id: 'Content', name: 'Content', color: 'blue', emoji: '✍️' },
      { id: 'Edit Video', name: 'Edit Video', color: 'purple', emoji: '🎬' },
      { id: 'Kỹ Thuật', name: 'Kỹ Thuật', color: 'orange', emoji: '🔧' },
      { id: 'Sale', name: 'Sale', color: 'green', emoji: '💼' },
      { id: 'Kho', name: 'Kho', color: 'yellow', emoji: '📦' },
      { id: 'Livestream', name: 'Livestream', color: 'red', emoji: '🎥' }
    ];

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-md w-full">
          <div className="p-6 border-b bg-gradient-to-r from-purple-500 to-pink-600 text-white">
            <h2 className="text-2xl font-bold">👥 Chỉnh Sửa Teams</h2>
            <p className="text-sm mt-1 opacity-90">{user.name}</p>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              Chọn các team mà user này thuộc về:
            </p>

            {AVAILABLE_TEAMS.map(team => (
              <label 
                key={team.id}
                className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-${team.color}-50 transition-colors`}
              >
                <input
                  type="checkbox"
                  checked={teams.includes(team.id)}
                  onChange={() => toggleTeam(team.id)}
                  className={`w-5 h-5 text-${team.color}-600`}
                />
                <div className="flex-1">
                  <div className="font-medium">{team.emoji} {team.name}</div>
                  <div className="text-sm text-gray-500">Team {team.name}</div>
                </div>
              </label>
            ))}

            {teams.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                ⚠️ Vui lòng chọn ít nhất 1 team
              </div>
            )}
          </div>

          <div className="p-6 border-t bg-gray-50 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                if (teams.length === 0) {
                  alert('⚠️ Vui lòng chọn ít nhất 1 team!');
                  return;
                }
                onSave(teams);
              }}
              className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
            >
              ✅ Lưu
            </button>
          </div>
        </div>
      </div>
    );
  };

  const PerformanceView = () => {
    const calculateMetrics = () => {
      if (!currentUser) return null;
      const userTasks = visibleTasks.filter(t => t.assignee === currentUser.name);
      const completed = userTasks.filter(t => t.status === 'Hoàn Thành');
      const onTime = completed.filter(t => !t.isOverdue);
      const late = completed.filter(t => t.isOverdue);
      const inProgress = userTasks.filter(t => ['Nháp', 'Chưa Quay', 'Đã Quay', 'Đang Edit'].includes(t.status));
      return {
        total: userTasks.length,
        completed: completed.length,
        onTime: onTime.length,
        late: late.length,
        inProgress: inProgress.length,
        completionRate: userTasks.length > 0 ? Math.round((completed.length / userTasks.length) * 100) : 0,
        onTimeRate: completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 0
      };
    };

    const calculateLeaderboard = () => {
      return allUsers.map(user => {
        const userTasks = tasks.filter(t => t.assignee === user.name);
        const completed = userTasks.filter(t => t.status === 'Hoàn Thành');
        const onTime = completed.filter(t => !t.isOverdue);
        return {
          name: user.name,
          team: user.team,
          totalTasks: userTasks.length,
          completed: completed.length,
          onTime: onTime.length,
          completionRate: userTasks.length > 0 ? Math.round((completed.length / userTasks.length) * 100) : 0,
          onTimeRate: completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 0
        };
      }).sort((a, b) => b.completed - a.completed);
    };

    const calculateWeeklyTrend = () => {
      const days = [];
      const now = getVietnamDate();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        const completedCount = tasks.filter(t => {
          if (currentUser.role !== 'Admin' && currentUser.role !== 'Manager' && t.assignee !== currentUser.name) return false;
          return t.status === 'Hoàn Thành';
        }).length;
        const createdCount = tasks.filter(t => {
          if (currentUser.role !== 'Admin' && currentUser.role !== 'Manager' && t.assignee !== currentUser.name) return false;
          return true;
        }).length;
        days.push({
          date: date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }),
          completed: completedCount,
          created: createdCount
        });
      }
      return days;
    };

    const myMetrics = calculateMetrics();
    const leaderboard = calculateLeaderboard();
    const weeklyTrend = calculateWeeklyTrend();

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">📊 Hiệu Suất Làm Việc</h2>
            <p className="text-gray-600 mt-1">Thống kê và phân tích hiệu suất</p>
          </div>
          <button onClick={() => alert('📊 Xuất báo cáo thành công!')} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
            📥 Xuất Báo Cáo
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
            <div className="text-sm opacity-90 mb-2">Tổng Video</div>
            <div className="text-4xl font-bold mb-2">{myMetrics?.total || 0}</div>
            <div className="text-sm opacity-75">Video được giao</div>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg">
            <div className="text-sm opacity-90 mb-2">Hoàn Thành</div>
            <div className="text-4xl font-bold mb-2">{myMetrics?.completed || 0}</div>
            <div className="text-sm opacity-75">{myMetrics?.completionRate || 0}% tỷ lệ</div>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg">
            <div className="text-sm opacity-90 mb-2">Đúng Hạn</div>
            <div className="text-4xl font-bold mb-2">{myMetrics?.onTime || 0}</div>
            <div className="text-sm opacity-75">{myMetrics?.onTimeRate || 0}% đúng deadline</div>
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg">
            <div className="text-sm opacity-90 mb-2">Đang Làm</div>
            <div className="text-4xl font-bold mb-2">{myMetrics?.inProgress || 0}</div>
            <div className="text-sm opacity-75">Video đang xử lý</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-xl font-bold mb-4">📈 Xu Hướng 7 Ngày</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyTrend}>
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="created" fill="#3b82f6" name="Video mới" />
              <Bar dataKey="completed" fill="#10b981" name="Hoàn thành" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
            <h3 className="text-xl font-bold">🏆 Bảng Xếp Hạng</h3>
            <p className="text-sm opacity-90 mt-1">Top performers của team</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Hạng</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Họ Tên</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Team</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold">Tasks</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold">Hoàn Thành</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold">Tỷ Lệ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leaderboard.map((user, index) => (
                  <tr key={user.name} className={`${index === 0 ? 'bg-yellow-50' : ''} ${index === 1 ? 'bg-gray-50' : ''} ${index === 2 ? 'bg-orange-50' : ''} ${user.name === currentUser?.name ? 'bg-blue-50 font-semibold' : ''} hover:bg-gray-100`}>
                    <td className="px-6 py-4 text-center">
                      {index === 0 && <span className="text-2xl">🥇</span>}
                      {index === 1 && <span className="text-2xl">🥈</span>}
                      {index === 2 && <span className="text-2xl">🥉</span>}
                      {index > 2 && <span className="text-gray-500">{index + 1}</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span>{user.name}</span>
                        {user.name === currentUser?.name && <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Bạn</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm ${user.team === 'Content' ? 'bg-blue-100 text-blue-700' : user.team === 'Edit Video' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                        {user.team}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-semibold">{user.totalTasks}</td>
                    <td className="px-6 py-4 text-center"><span className="text-green-600 font-semibold">{user.completed}</span></td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-sm font-medium text-green-600">{user.completionRate}% hoàn thành</div>
                      <div className="text-xs text-purple-600">{user.onTimeRate}% đúng hạn</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const CreateTaskModal = () => {
    const [title, setTitle] = useState('');
    const [platform, setPlatform] = useState([]);
    const [priority, setPriority] = useState('');
    const [dueDate, setDueDate] = useState(getTodayVN());
    const [description, setDescription] = useState('');
    const [assignee, setAssignee] = useState(currentUser.name);
    const [videoCategory, setVideoCategory] = useState('');

    const videoCategories = [
      { id: 'video_dan', name: '🎬 Video dàn', color: 'purple' },
      { id: 'video_hangngay', name: '📅 Video hàng ngày', color: 'blue' },
      { id: 'video_huongdan', name: '📚 Video hướng dẫn', color: 'green' },
      { id: 'video_quangcao', name: '📢 Video quảng cáo', color: 'orange' },
      { id: 'video_review', name: '⭐ Video review', color: 'yellow' }
    ];

    const togglePlatform = (plat) => {
      if (platform.includes(plat)) {
        setPlatform(platform.filter(p => p !== plat));
      } else {
        setPlatform([...platform, plat]);
      }
    };

    // Filter assignable users based on role
    const getAssignableUsers = () => {
      if (currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager') {
        return allUsers;
      } else if (currentUser.role === 'Team Lead') {
        const userTeams = currentUser.teams || [currentUser.team].filter(Boolean);
        return allUsers.filter(u => {
          const targetTeams = u.teams || [u.team].filter(Boolean);
          return targetTeams.some(t => userTeams.includes(t));
        });
      } else {
        return allUsers.filter(u => u.name === currentUser.name);
      }
    };

    const assignableUsers = getAssignableUsers();

    const platforms = ['Facebook', 'Instagram', 'TikTok', 'Blog', 'Ads', 'Email'];

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white p-6 border-b">
            <h2 className="text-2xl font-bold">➕ Tạo Video Mới</h2>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Tiêu đề *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Viết bài blog về sản phẩm mới"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Platform * (Chọn nhiều)</label>
                <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                  {platforms.map(plat => (
                    <label key={plat} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={platform.includes(plat)}
                        onChange={() => togglePlatform(plat)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span>{plat}</span>
                    </label>
                  ))}
                </div>
                {platform.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {platform.map(plat => (
                      <span key={plat} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-1">
                        {plat}
                        <button onClick={() => togglePlatform(plat)} className="text-blue-900 hover:text-red-600">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">🏷️ Danh mục Video</label>
              <div className="flex flex-wrap gap-2">
                {videoCategories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setVideoCategory(videoCategory === cat.id ? '' : cat.id)}
                    className={`px-3 py-2 rounded-lg border-2 font-medium transition-all ${
                      videoCategory === cat.id
                        ? (cat.color === 'purple' ? 'bg-purple-100 border-purple-500 text-purple-700'
                          : cat.color === 'blue' ? 'bg-blue-100 border-blue-500 text-blue-700'
                          : cat.color === 'green' ? 'bg-green-100 border-green-500 text-green-700'
                          : cat.color === 'orange' ? 'bg-orange-100 border-orange-500 text-orange-700'
                          : 'bg-yellow-100 border-yellow-500 text-yellow-700')
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                👤 Gán cho *
                {currentUser.role === 'Member' && <span className="text-xs text-gray-500 ml-2">(Chỉ gán cho bản thân)</span>}
              </label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={currentUser.role === 'Member'}
              >
                {assignableUsers.map(user => (
                  <option key={user.id} value={user.name}>
                    {user.name} - {user.team} ({user.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Độ ưu tiên *</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Chọn độ ưu tiên</option>
                  <option value="Thấp">Thấp</option>
                  <option value="Trung bình">Trung bình</option>
                  <option value="Cao">Cao</option>
                  <option value="Khẩn cấp">Khẩn cấp</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Deadline *</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Mô tả</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả chi tiết công việc..."
                rows="4"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="p-6 border-t bg-gray-50 sticky bottom-0">
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateTaskModal(false)}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (!title || platform.length === 0 || !priority || !dueDate) {
                    alert('⚠️ Vui lòng điền đầy đủ thông tin bắt buộc!');
                    return;
                  }
                  createNewTask(title, platform.join(', '), priority, dueDate, description, assignee, videoCategory);
                }}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                ✅ Tạo Video
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TaskModal = () => {
    const [newComment, setNewComment] = useState('');
    const [newPostLink, setNewPostLink] = useState('');
    const [linkType, setLinkType] = useState('');
    const [showAddLink, setShowAddLink] = useState(false);
    const [showReassign, setShowReassign] = useState(false);
    const [newAssignee, setNewAssignee] = useState('');
    const [showEditTask, setShowEditTask] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editPlatform, setEditPlatform] = useState([]);
    const [editPriority, setEditPriority] = useState('');
    const [editDueDate, setEditDueDate] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editCategory, setEditCategory] = useState('');

    const videoCategories = [
      { id: 'video_dan', name: '🎬 Video dàn', color: 'purple' },
      { id: 'video_hangngay', name: '📅 Video hàng ngày', color: 'blue' },
      { id: 'video_huongdan', name: '📚 Video hướng dẫn', color: 'green' },
      { id: 'video_quangcao', name: '📢 Video quảng cáo', color: 'orange' },
      { id: 'video_review', name: '⭐ Video review', color: 'yellow' }
    ];

    if (!selectedTask) return null;

    const platforms = ['Facebook', 'Instagram', 'TikTok', 'Blog', 'Ads', 'Email'];

    const openEditMode = () => {
      setEditTitle(selectedTask.title || '');
      setEditPlatform(selectedTask.platform ? selectedTask.platform.split(', ') : []);
      setEditPriority(selectedTask.priority || '');
      setEditDueDate(selectedTask.dueDate || '');
      setEditDescription(selectedTask.description || '');
      setEditCategory(selectedTask.category || '');
      setShowEditTask(true);
    };

    const toggleEditPlatform = (plat) => {
      if (editPlatform.includes(plat)) {
        setEditPlatform(editPlatform.filter(p => p !== plat));
      } else {
        setEditPlatform([...editPlatform, plat]);
      }
    };

    const saveEditTask = async () => {
      if (!editTitle || editPlatform.length === 0 || !editPriority || !editDueDate) {
        alert('⚠️ Vui lòng điền đầy đủ thông tin!');
        return;
      }
      try {
        const { error } = await supabase
          .from('tasks')
          .update({
            title: editTitle,
            platform: editPlatform.join(', '),
            priority: editPriority,
            due_date: editDueDate,
            description: editDescription,
            category: editCategory
          })
          .eq('id', selectedTask.id);

        if (error) throw error;
        alert('✅ Cập nhật task thành công!');
        setShowEditTask(false);
        await loadTasks();
        setSelectedTask({
          ...selectedTask,
          title: editTitle,
          platform: editPlatform.join(', '),
          priority: editPriority,
          dueDate: editDueDate,
          description: editDescription,
          category: editCategory
        });
      } catch (error) {
        console.error('Error updating task:', error);
        alert('❌ Lỗi khi cập nhật video!');
      }
    };

    const getPlatformIcon = (type) => {
      const icons = {
        'Facebook': '📘',
        'Instagram': '📸',
        'TikTok': '🎵',
        'YouTube': '📺',
        'Blog': '📝',
        'Other': '🔗'
      };
      return icons[type] || '🔗';
    };

    const reassignTask = async () => {
      if (!newAssignee) {
        alert('⚠️ Vui lòng chọn người được gán!');
        return;
      }

      try {
        const assignedUser = allUsers.find(u => u.name === newAssignee);
        const { error } = await supabase
          .from('tasks')
          .update({ 
            assignee: newAssignee,
            team: assignedUser.team
          })
          .eq('id', selectedTask.id);

        if (error) throw error;

        // Notify new assignee
        if (newAssignee !== currentUser.name) {
          addNotification({
            type: 'assigned',
            taskId: selectedTask.id,
            title: '📋 Video được chuyển giao',
            message: `${currentUser.name} đã chuyển video "${selectedTask.title}" cho bạn`,
            read: false,
            createdAt: getNowISOVN()
          });
        }

        setShowReassign(false);
        alert('✅ Đã chuyển giao video!');
        await loadTasks();
        setShowModal(false);
      } catch (error) {
        console.error('Error reassigning task:', error);
        alert('❌ Lỗi khi chuyển giao video!');
      }
    };

    const canReassign = currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager' || 
      (currentUser.role === 'Team Lead' && (currentUser.teams || [currentUser.team]).filter(Boolean).includes(selectedTask.team));


    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-6 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white sticky top-0 z-10">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">{selectedTask.title}</h2>
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm flex items-center gap-2">
                    👤 {selectedTask.assignee}
                    {canReassign && (
                      <button
                        onClick={() => {
                          setNewAssignee(selectedTask.assignee);
                          setShowReassign(true);
                        }}
                        className="ml-1 px-2 py-0.5 bg-white/30 hover:bg-white/40 rounded text-xs"
                      >
                        🔄
                      </button>
                    )}
                  </span>
                  <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                    🏢 {selectedTask.team}
                  </span>
                  <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                    📅 {selectedTask.dueDate}
                  </span>
                  <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                    📱 {selectedTask.platform}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openEditMode}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium"
                >
                  ✏️ Sửa
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-white/80 hover:text-white text-2xl ml-2"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Edit Task Form */}
            {showEditTask && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-bold text-lg mb-3 text-blue-900">✏️ Chỉnh Sửa Video</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Tiêu đề *</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Platform *</label>
                    <div className="flex flex-wrap gap-2">
                      {platforms.map(plat => (
                        <button
                          key={plat}
                          onClick={() => toggleEditPlatform(plat)}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${editPlatform.includes(plat) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                        >
                          {plat}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Danh mục Video */}
                  <div>
                    <label className="block text-sm font-medium mb-2">🏷️ Danh mục Video</label>
                    <div className="flex flex-wrap gap-2">
                      {videoCategories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setEditCategory(editCategory === cat.id ? '' : cat.id)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            editCategory === cat.id
                              ? `bg-${cat.color}-500 text-white`
                              : `bg-${cat.color}-100 text-${cat.color}-700 hover:bg-${cat.color}-200`
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                    {editCategory && (
                      <button
                        type="button"
                        onClick={() => setEditCategory('')}
                        className="mt-2 text-xs text-red-500 hover:text-red-700"
                      >
                        ✕ Xóa danh mục
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Độ ưu tiên *</label>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Thấp">Thấp</option>
                        <option value="Trung bình">Trung bình</option>
                        <option value="Cao">Cao</option>
                        <option value="Khẩn cấp">Khẩn cấp</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Deadline *</label>
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Mô tả</label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {showReassign && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <h4 className="font-bold text-lg mb-3 text-yellow-900">🔄 Chuyển Giao Video</h4>
                <div className="space-y-3">
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  >
                    {allUsers
                      .filter(u => {
                        if (currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager') return true;
                        if (currentUser.role === 'Team Lead') {
                          const userTeams = currentUser.teams || [currentUser.team].filter(Boolean);
                          const targetTeams = u.teams || [u.team].filter(Boolean);
                          return targetTeams.some(t => userTeams.includes(t));
                        }
                        return false;
                      })
                      .map(user => (
                        <option key={user.id} value={user.name}>
                          {user.name} - {(user.teams || [user.team]).filter(Boolean).join(', ')} ({user.role})
                        </option>
                      ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowReassign(false)}
                      className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={reassignTask}
                      className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium"
                    >
                      ✅ Chuyển Giao
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-lg font-bold mb-3 flex items-center gap-2">
                🔗 Links Đã Đăng
                {selectedTask.postLinks && selectedTask.postLinks.length > 0 && (
                  <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                    {selectedTask.postLinks.length}
                  </span>
                )}
              </h4>

              {selectedTask.postLinks && selectedTask.postLinks.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {selectedTask.postLinks.map((link, index) => (
                    <div key={index} className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">{getPlatformIcon(link.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-bold text-sm">{link.type}</span>
                            <span className="text-xs text-gray-500">
                              • Thêm bởi {link.addedBy} • {link.addedAt}
                            </span>
                          </div>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm break-all block mb-2"
                          >
                            {link.url}
                          </a>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(link.url);
                                alert('✅ Đã copy link!');
                              }}
                              className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs font-medium hover:bg-gray-300"
                            >
                              📋 Copy Link
                            </button>
                            {(currentUser.name === link.addedBy || currentUser.role === 'Manager') && (
                              <button
                                onClick={() => {
                                  // eslint-disable-next-line no-restricted-globals
                                  if (confirm('Xóa link này?')) {
                                    removePostLink(selectedTask.id, index);
                                  }
                                }}
                                className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200"
                              >
                                🗑️ Xóa
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg mb-4">
                  <div className="text-gray-400 text-sm">Chưa có link nào được thêm</div>
                </div>
              )}

              <button
                onClick={() => setShowAddLink(!showAddLink)}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
              >
                {showAddLink ? '❌ Hủy' : '➕ Thêm Link Mới'}
              </button>

              {showAddLink && (
                <div className="mt-4 bg-white border-2 border-green-200 rounded-lg p-4">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-2">Loại Platform:</label>
                      <select
                        value={linkType}
                        onChange={(e) => setLinkType(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">Chọn platform</option>
                        <option value="Facebook">Facebook</option>
                        <option value="Instagram">Instagram</option>
                        <option value="TikTok">TikTok</option>
                        <option value="YouTube">YouTube</option>
                        <option value="Blog">Blog</option>
                        <option value="Other">Khác</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">URL:</label>
                      <input
                        type="url"
                        value={newPostLink}
                        onChange={(e) => setNewPostLink(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (newPostLink.trim() && linkType) {
                          addPostLink(selectedTask.id, newPostLink, linkType);
                          setNewPostLink('');
                          setLinkType('');
                          setShowAddLink(false);
                        } else {
                          alert('⚠️ Vui lòng chọn platform và nhập URL!');
                        }
                      }}
                      className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                    >
                      ✅ Thêm Link
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-6">
              <h4 className="text-lg font-bold mb-3">🔄 Thay Đổi Trạng Thái</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {['Nháp', 'Chưa Quay', 'Đã Quay', 'Đang Edit', 'Hoàn Thành'].map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      changeStatus(selectedTask.id, s);
                      setSelectedTask({ ...selectedTask, status: s });
                    }}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      selectedTask.status === s
                        ? `${getStatusColor(s)} ring-2 ring-offset-2 ring-blue-500 scale-105`
                        : `${getStatusColor(s)} opacity-50 hover:opacity-100`
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t pt-6">
              <div className="flex items-center justify-between mb-4">
                <h5 className="text-lg font-bold">💬 Nhận Xét & Feedback</h5>
                <span className="text-sm text-gray-500">
                  {selectedTask.comments?.length || 0} nhận xét
                </span>
              </div>

              {selectedTask.comments && selectedTask.comments.length > 0 ? (
                <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                  {selectedTask.comments.map((comment, index) => (
                    <div key={index} className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">
                          {comment.user === currentUser.name ? '👤' : '👨‍💼'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-bold text-sm">
                              {comment.user}
                              {comment.user === currentUser.name && ' (Bạn)'}
                            </span>
                            <span className="text-xs text-gray-500">• {comment.time}</span>
                          </div>
                          <div className="text-sm text-gray-700 bg-white p-3 rounded-lg">
                            {comment.text}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg mb-4">
                  <div className="text-gray-400 text-sm">Chưa có nhận xét nào</div>
                </div>
              )}

              <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                <div className="font-medium text-sm mb-2">✍️ Thêm nhận xét:</div>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={`${currentUser.role === 'Manager' ? 'Nhận xét của bạn về task này...' : 'Cập nhật tiến độ, ghi chú...'}`}
                  rows="3"
                  className="w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex justify-between items-center mt-3">
                  <div className="text-xs text-gray-500">
                    💡 {currentUser.role === 'Manager' ? 'Admin/Manager có thể để lại feedback chi tiết' : 'Cập nhật tiến độ công việc của bạn'}
                  </div>
                  <button
                    onClick={() => {
                      if (newComment.trim()) {
                        addComment(selectedTask.id, newComment);
                        setNewComment('');
                      }
                    }}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                  >
                    💬 Gửi
                  </button>
                </div>
              </div>

              {currentUser.role === 'Manager' && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-yellow-800 mb-2">⚡ Phê duyệt nhanh:</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        changeStatus(selectedTask.id, 'Đã Duyệt');
                        setSelectedTask({ ...selectedTask, status: 'Đã Duyệt' });
                        addComment(selectedTask.id, '✅ Đã duyệt! Công việc làm tốt.');
                      }}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                    >
                      ✅ Phê Duyệt
                    </button>
                    <button
                      onClick={() => {
                        changeStatus(selectedTask.id, 'Cần Sửa');
                        setSelectedTask({ ...selectedTask, status: 'Cần Sửa' });
                        if (newComment.trim()) {
                          addComment(selectedTask.id, newComment);
                          setNewComment('');
                        }
                      }}
                      className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"
                    >
                      🔄 Yêu Cầu Sửa
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 border-t bg-gray-50 sticky bottom-0">
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEditTask(false);
                  setShowModal(false);
                }}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
              >
                Đóng
              </button>
              {currentUser && (currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager' || selectedTask.assignee === currentUser.name) && (
                <button
                  onClick={() => {
                    if (window.confirm('⚠️ Bạn có chắc chắn muốn xóa task này?\n\nHành động này không thể hoàn tác!')) {
                      deleteTask(selectedTask.id);
                    }
                  }}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
                >
                  🗑️ Xóa
                </button>
              )}
              {showEditTask && (
                <button
                  onClick={saveEditTask}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  💾 Lưu
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // =====================================
  // WAREHOUSE MODULE COMPONENTS
  // =====================================


  const warehouseCategories = [
    '🎤 Micro',
    '🔊 Loa', 
    '🎚️ Mixer/Ampli',
    '🎧 Tai nghe',
    '📺 Màn hình/TV',
    '🔌 Dây cáp/Phụ kiện',
    '🛠️ Linh kiện sửa chữa',
    '📦 Khác'
  ];

  const warehouseUnits = ['Cái', 'Bộ', 'Chiếc', 'Cuộn', 'Mét', 'Hộp', 'Thùng', 'Cặp'];

  function WarehouseInventoryView() {
    const [viewMode, setViewMode] = useState('table');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStock, setFilterStock] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('asc');

    // Form states
    const [formSku, setFormSku] = useState('');
    const [formBarcode, setFormBarcode] = useState('');
    const [formName, setFormName] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [formUnit, setFormUnit] = useState('Cái');
    const [formImportPrice, setFormImportPrice] = useState('');
    const [formSellPrice, setFormSellPrice] = useState('');
    const [formMinStock, setFormMinStock] = useState('5');
    const [formMaxStock, setFormMaxStock] = useState('');
    const [formLocation, setFormLocation] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formBrand, setFormBrand] = useState('');
    const [formWarranty, setFormWarranty] = useState('');

    // Adjust stock states
    const [adjustType, setAdjustType] = useState('add');
    const [adjustQuantity, setAdjustQuantity] = useState('');
    const [adjustReason, setAdjustReason] = useState('');

    const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    const formatNumber = (num) => new Intl.NumberFormat('vi-VN').format(num || 0);

    const resetForm = () => {
      setFormSku(''); setFormBarcode(''); setFormName(''); setFormCategory('');
      setFormUnit('Cái'); setFormImportPrice(''); setFormSellPrice('');
      setFormMinStock('5'); setFormMaxStock(''); setFormLocation('');
      setFormDescription(''); setFormBrand(''); setFormWarranty('');
    };

    const generateSku = () => 'SP' + Date.now().toString().slice(-6);

    // Stats
    const stats = useMemo(() => {
      const totalProducts = products.length;
      const totalValue = products.reduce((sum, p) => sum + (p.stock_quantity * (p.import_price || 0)), 0);
      const totalSellValue = products.reduce((sum, p) => sum + (p.stock_quantity * (p.sell_price || 0)), 0);
      const lowStock = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= (p.min_stock || 5)).length;
      const outOfStock = products.filter(p => p.stock_quantity === 0).length;
      const totalUnits = products.reduce((sum, p) => sum + (p.stock_quantity || 0), 0);
      return { totalProducts, totalValue, totalSellValue, lowStock, outOfStock, totalUnits, potentialProfit: totalSellValue - totalValue };
    }, [products]);

    // Filter and sort
    const filteredProducts = useMemo(() => {
      let result = products.filter(p => {
        const matchSearch = !searchTerm || 
          p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.barcode?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCategory = !filterCategory || p.category === filterCategory;
        const matchStock = !filterStock ||
          (filterStock === 'low' && p.stock_quantity <= (p.min_stock || 5) && p.stock_quantity > 0) ||
          (filterStock === 'out' && p.stock_quantity === 0) ||
          (filterStock === 'normal' && p.stock_quantity > (p.min_stock || 5));
        return matchSearch && matchCategory && matchStock;
      });
      result.sort((a, b) => {
        let aVal = a[sortBy] || '';
        let bVal = b[sortBy] || '';
        if (['stock_quantity', 'import_price', 'sell_price'].includes(sortBy)) {
          aVal = Number(aVal) || 0;
          bVal = Number(bVal) || 0;
        }
        return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
      });
      return result;
    }, [products, searchTerm, filterCategory, filterStock, sortBy, sortOrder]);

    const handleCreateProduct = async () => {
      if (!formName) { alert('Vui lòng nhập tên sản phẩm!'); return; }
      try {
        const { error } = await supabase.from('products').insert([{
          tenant_id: tenant.id, sku: formSku || generateSku(), barcode: formBarcode,
          name: formName, category: formCategory, unit: formUnit,
          import_price: parseFloat(formImportPrice) || 0, sell_price: parseFloat(formSellPrice) || 0,
          stock_quantity: 0, min_stock: parseInt(formMinStock) || 5,
          max_stock: formMaxStock ? parseInt(formMaxStock) : null,
          location: formLocation, description: formDescription,
          brand: formBrand, warranty_months: formWarranty ? parseInt(formWarranty) : null,
          created_by: currentUser.name
        }]);
        if (error) throw error;
        alert('✅ Thêm sản phẩm thành công!');
        setShowCreateModal(false); resetForm(); loadWarehouseData();
      } catch (error) { alert('❌ Lỗi: ' + error.message); }
    };

    const handleUpdateProduct = async () => {
      if (!formName) { alert('Vui lòng nhập tên sản phẩm!'); return; }
      try {
        const { error } = await supabase.from('products').update({
          sku: formSku, barcode: formBarcode, name: formName, category: formCategory,
          unit: formUnit, import_price: parseFloat(formImportPrice) || 0,
          sell_price: parseFloat(formSellPrice) || 0, min_stock: parseInt(formMinStock) || 5,
          max_stock: formMaxStock ? parseInt(formMaxStock) : null,
          location: formLocation, description: formDescription,
          brand: formBrand, warranty_months: formWarranty ? parseInt(formWarranty) : null,
          updated_at: getNowISOVN()
        }).eq('id', selectedProduct.id);
        if (error) throw error;
        alert('✅ Cập nhật thành công!');
        setShowDetailModal(false); loadWarehouseData();
      } catch (error) { alert('❌ Lỗi: ' + error.message); }
    };

    const handleAdjustStock = async () => {
      if (!adjustQuantity || parseInt(adjustQuantity) <= 0) { alert('Vui lòng nhập số lượng hợp lệ!'); return; }
      try {
        let newQuantity = selectedProduct.stock_quantity;
        const qty = parseInt(adjustQuantity);
        if (adjustType === 'add') newQuantity += qty;
        else if (adjustType === 'subtract') newQuantity = Math.max(0, newQuantity - qty);
        else if (adjustType === 'set') newQuantity = qty;

        await supabase.from('products').update({
          stock_quantity: newQuantity, updated_at: getNowISOVN()
        }).eq('id', selectedProduct.id);

        await supabase.from('stock_transactions').insert([{
          tenant_id: tenant.id, transaction_number: `ADJ-${Date.now()}`,
          type: adjustType === 'subtract' ? 'export' : 'import',
          transaction_date: getTodayVN(),
          partner_name: 'Điều chỉnh tồn kho', total_amount: 0,
          note: `${adjustReason || 'Điều chỉnh'} - ${selectedProduct.name}: ${selectedProduct.stock_quantity} → ${newQuantity}`,
          status: 'completed', created_by: currentUser.name
        }]);

        alert('✅ Điều chỉnh tồn kho thành công!');
        setShowAdjustModal(false); setAdjustQuantity(''); setAdjustReason(''); loadWarehouseData();
      } catch (error) { alert('❌ Lỗi: ' + error.message); }
    };

    const handleDeleteProduct = async (id) => {
      if (!window.confirm('Xóa sản phẩm này?')) return;
      try {
        await supabase.from('products').update({ is_active: false }).eq('id', id);
        alert('✅ Đã xóa!'); setShowDetailModal(false); loadWarehouseData();
      } catch (error) { alert('❌ Lỗi: ' + error.message); }
    };

    const openDetail = (product) => {
      setSelectedProduct(product);
      setFormSku(product.sku || ''); setFormBarcode(product.barcode || '');
      setFormName(product.name || ''); setFormCategory(product.category || '');
      setFormUnit(product.unit || 'Cái'); setFormImportPrice(product.import_price?.toString() || '');
      setFormSellPrice(product.sell_price?.toString() || ''); setFormMinStock(product.min_stock?.toString() || '5');
      setFormMaxStock(product.max_stock?.toString() || ''); setFormLocation(product.location || '');
      setFormDescription(product.description || ''); setFormBrand(product.brand || '');
      setFormWarranty(product.warranty_months?.toString() || '');
      setShowDetailModal(true);
    };

    const openAdjust = (product, e) => {
      e?.stopPropagation();
      setSelectedProduct(product);
      setAdjustType('add'); setAdjustQuantity(''); setAdjustReason('');
      setShowAdjustModal(true);
    };

    const getStockStatus = (p) => {
      if (p.stock_quantity === 0) return { label: 'Hết hàng', color: 'bg-red-100 text-red-700', icon: '❌' };
      if (p.stock_quantity <= (p.min_stock || 5)) return { label: 'Sắp hết', color: 'bg-yellow-100 text-yellow-700', icon: '⚠️' };
      if (p.max_stock && p.stock_quantity > p.max_stock) return { label: 'Vượt mức', color: 'bg-purple-100 text-purple-700', icon: '📈' };
      return { label: 'Còn hàng', color: 'bg-green-100 text-green-700', icon: '✅' };
    };

    const toggleSort = (field) => {
      if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      else { setSortBy(field); setSortOrder('asc'); }
    };

    return (
      <div className="p-4 md:p-6 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
            <div className="text-2xl font-bold text-blue-600">{formatNumber(stats.totalProducts)}</div>
            <div className="text-gray-500 text-xs">Sản phẩm</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-indigo-500">
            <div className="text-2xl font-bold text-indigo-600">{formatNumber(stats.totalUnits)}</div>
            <div className="text-gray-500 text-xs">Tổng SL tồn</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
            <div className="text-sm font-bold text-green-600">{formatCurrency(stats.totalValue)}</div>
            <div className="text-gray-500 text-xs">Giá trị (giá nhập)</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-emerald-500">
            <div className="text-sm font-bold text-emerald-600">{formatCurrency(stats.potentialProfit)}</div>
            <div className="text-gray-500 text-xs">Lợi nhuận dự kiến</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-yellow-500">
            <div className="text-2xl font-bold text-yellow-600">{stats.lowStock}</div>
            <div className="text-gray-500 text-xs">Sắp hết hàng</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-500">
            <div className="text-2xl font-bold text-red-600">{stats.outOfStock}</div>
            <div className="text-gray-500 text-xs">Hết hàng</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input
                type="text" placeholder="Tìm theo tên, mã SP, barcode..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-4 py-2 border rounded-lg bg-white min-w-[150px]">
              <option value="">📁 Tất cả danh mục</option>
              {warehouseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <select value={filterStock} onChange={(e) => setFilterStock(e.target.value)} className="px-4 py-2 border rounded-lg bg-white min-w-[130px]">
              <option value="">📊 Tất cả tồn kho</option>
              <option value="normal">✅ Còn hàng</option>
              <option value="low">⚠️ Sắp hết</option>
              <option value="out">❌ Hết hàng</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex gap-2">
              <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-lg text-sm ${viewMode === 'table' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>📋 Bảng</button>
              <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 rounded-lg text-sm ${viewMode === 'grid' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>📦 Lưới</button>
            </div>
            <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium flex items-center gap-2">
              <span>➕</span> Thêm sản phẩm
            </button>
          </div>
        </div>

        {/* Table View */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th onClick={() => toggleSort('sku')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100">
                      Mã SP {sortBy === 'sku' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => toggleSort('name')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100">
                      Sản phẩm {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Danh mục</th>
                    <th onClick={() => toggleSort('stock_quantity')} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100">
                      Tồn kho {sortBy === 'stock_quantity' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => toggleSort('import_price')} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase hidden md:table-cell cursor-pointer hover:bg-gray-100">
                      Giá nhập {sortBy === 'import_price' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => toggleSort('sell_price')} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell cursor-pointer hover:bg-gray-100">
                      Giá bán {sortBy === 'sell_price' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Trạng thái</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.length === 0 ? (
                    <tr><td colSpan="8" className="px-4 py-12 text-center">
                      <div className="text-gray-400 text-5xl mb-3">📦</div>
                      <div className="text-gray-500">{products.length === 0 ? 'Chưa có sản phẩm nào' : 'Không tìm thấy'}</div>
                      {products.length === 0 && <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm">➕ Thêm sản phẩm đầu tiên</button>}
                    </td></tr>
                  ) : filteredProducts.map(product => {
                    const status = getStockStatus(product);
                    return (
                      <tr key={product.id} onClick={() => openDetail(product)} className="hover:bg-amber-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-amber-600 font-medium">{product.sku}</span>
                          {product.barcode && <div className="text-xs text-gray-400">{product.barcode}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{product.name}</div>
                          {product.brand && <div className="text-xs text-gray-500">{product.brand}</div>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden md:table-cell text-sm">{product.category || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-lg font-bold ${product.stock_quantity === 0 ? 'text-red-600' : product.stock_quantity <= (product.min_stock || 5) ? 'text-yellow-600' : 'text-gray-900'}`}>
                            {formatNumber(product.stock_quantity)}
                          </span>
                          <span className="text-gray-400 text-sm ml-1">{product.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 hidden md:table-cell">{formatCurrency(product.import_price)}</td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <span className="text-gray-700">{formatCurrency(product.sell_price)}</span>
                          {product.import_price > 0 && product.sell_price > product.import_price && (
                            <div className="text-xs text-green-600">+{Math.round((product.sell_price - product.import_price) / product.import_price * 100)}%</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                            {status.icon} <span className="hidden sm:inline">{status.label}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            <button onClick={(e) => openAdjust(product, e)} className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600" title="Điều chỉnh SL">🔄</button>
                            <button onClick={(e) => { e.stopPropagation(); openDetail(product); }} className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-600" title="Chi tiết">✏️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-600">
              Hiển thị {filteredProducts.length} / {products.length} sản phẩm
            </div>
          </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full bg-white rounded-xl p-12 text-center">
                <div className="text-gray-400 text-5xl mb-3">📦</div>
                <div className="text-gray-500">{products.length === 0 ? 'Chưa có sản phẩm' : 'Không tìm thấy'}</div>
              </div>
            ) : filteredProducts.map(product => {
              const status = getStockStatus(product);
              return (
                <div key={product.id} onClick={() => openDetail(product)} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow border cursor-pointer">
                  <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-5xl">
                    {product.category?.includes('Micro') ? '🎤' : product.category?.includes('Loa') ? '🔊' : product.category?.includes('Mixer') ? '🎚️' : product.category?.includes('Tai nghe') ? '🎧' : product.category?.includes('Màn hình') ? '📺' : product.category?.includes('Dây') ? '🔌' : '📦'}
                  </div>
                  <div className="p-3">
                    <div className="font-mono text-xs text-amber-600">{product.sku}</div>
                    <div className="font-medium text-gray-900 truncate" title={product.name}>{product.name}</div>
                    <div className="flex justify-between items-center mt-2">
                      <span className={`font-bold ${product.stock_quantity === 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatNumber(product.stock_quantity)} {product.unit}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${status.color}`}>{status.icon}</span>
                    </div>
                    <div className="text-sm text-green-600 font-medium mt-1">{formatCurrency(product.sell_price)}</div>
                    <div className="flex gap-1 mt-2">
                      <button onClick={(e) => openAdjust(product, e)} className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded text-xs font-medium">🔄 Điều chỉnh</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                <h2 className="text-xl font-bold">➕ Thêm Sản Phẩm Mới</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                  <h3 className="font-medium text-gray-700">📝 Thông tin cơ bản</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mã SP (SKU)</label>
                      <input type="text" value={formSku} onChange={(e) => setFormSku(e.target.value)} placeholder="Tự động nếu để trống" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
                      <input type="text" value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} placeholder="Mã vạch" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên sản phẩm <span className="text-red-500">*</span></label>
                    <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="VD: Micro Shure SM58" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Danh mục</label>
                      <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                        <option value="">Chọn danh mục</option>
                        {warehouseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Thương hiệu</label>
                      <input type="text" value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder="VD: Shure, JBL..." className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-4 space-y-4">
                  <h3 className="font-medium text-blue-700">💰 Giá & Tồn kho</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị</label>
                      <select value={formUnit} onChange={(e) => setFormUnit(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                        {warehouseUnits.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Giá nhập</label>
                      <input type="number" value={formImportPrice} onChange={(e) => setFormImportPrice(e.target.value)} placeholder="0" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Giá bán</label>
                      <input type="number" value={formSellPrice} onChange={(e) => setFormSellPrice(e.target.value)} placeholder="0" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tồn tối thiểu</label>
                      <input type="number" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} placeholder="5" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tồn tối đa</label>
                      <input type="number" value={formMaxStock} onChange={(e) => setFormMaxStock(e.target.value)} placeholder="Không giới hạn" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4 space-y-4">
                  <h3 className="font-medium text-green-700">📋 Thông tin bổ sung</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vị trí kho</label>
                      <input type="text" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="VD: Kệ A1" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bảo hành (tháng)</label>
                      <input type="number" value={formWarranty} onChange={(e) => setFormWarranty(e.target.value)} placeholder="0" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                    <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} placeholder="Mô tả chi tiết..." className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                </div>
              </div>
              <div className="p-6 border-t bg-gray-50 flex gap-3 justify-end sticky bottom-0">
                <button onClick={() => setShowCreateModal(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Hủy</button>
                <button onClick={handleCreateProduct} className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium">➕ Thêm sản phẩm</button>
              </div>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedProduct && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                <h2 className="text-xl font-bold">📦 Chi Tiết Sản Phẩm</h2>
                <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-6 text-white text-center">
                  <div className="text-4xl font-bold">{formatNumber(selectedProduct.stock_quantity)}</div>
                  <div className="text-amber-100">{selectedProduct.unit} trong kho</div>
                  <button onClick={() => { setShowDetailModal(false); openAdjust(selectedProduct); }} className="mt-3 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium">🔄 Điều chỉnh số lượng</button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                  <h3 className="font-medium text-gray-700">📝 Thông tin cơ bản</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Mã SP</label><input type="text" value={formSku} onChange={(e) => setFormSku(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label><input type="text" value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Tên sản phẩm</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Danh mục</label><select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option value="">Chọn</option>{warehouseCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Thương hiệu</label><input type="text" value={formBrand} onChange={(e) => setFormBrand(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-4 space-y-4">
                  <h3 className="font-medium text-blue-700">💰 Giá & Định mức</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị</label><select value={formUnit} onChange={(e) => setFormUnit(e.target.value)} className="w-full px-3 py-2 border rounded-lg">{warehouseUnits.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Giá nhập</label><input type="number" value={formImportPrice} onChange={(e) => setFormImportPrice(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Giá bán</label><input type="number" value={formSellPrice} onChange={(e) => setFormSellPrice(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Tồn tối thiểu</label><input type="number" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Tồn tối đa</label><input type="number" value={formMaxStock} onChange={(e) => setFormMaxStock(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4 space-y-4">
                  <h3 className="font-medium text-green-700">📋 Thông tin bổ sung</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Vị trí kho</label><input type="text" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Bảo hành (tháng)</label><input type="number" value={formWarranty} onChange={(e) => setFormWarranty(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label><textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>

                {/* Thông tin hệ thống */}
                <div className="bg-purple-50 rounded-lg p-4">
                  <h3 className="font-medium text-purple-700 mb-3">🕐 Thông tin hệ thống</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Người tạo:</span>
                      <span className="ml-2 font-medium text-gray-800">{selectedProduct.created_by || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Ngày tạo:</span>
                      <span className="ml-2 font-medium text-gray-800">
                        {selectedProduct.created_at ? formatDateTimeVN(selectedProduct.created_at) : 'N/A'}
                      </span>
                    </div>
                    {selectedProduct.updated_at && (
                      <>
                        <div>
                          <span className="text-gray-500">Cập nhật lần cuối:</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-800">
                            {formatDateTimeVN(selectedProduct.updated_at)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-6 border-t bg-gray-50 flex gap-3 justify-between sticky bottom-0">
                <button onClick={() => handleDeleteProduct(selectedProduct.id)} className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg">🗑️ Xóa</button>
                <div className="flex gap-3">
                  <button onClick={() => setShowDetailModal(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Đóng</button>
                  <button onClick={handleUpdateProduct} className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium">💾 Lưu</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Adjust Stock Modal */}
        {showAdjustModal && selectedProduct && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md">
              <div className="p-6 border-b">
                <h2 className="text-xl font-bold">🔄 Điều Chỉnh Tồn Kho</h2>
                <p className="text-gray-500 text-sm mt-1">{selectedProduct.name}</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-amber-50 rounded-xl p-4 text-center">
                  <div className="text-sm text-amber-600">Tồn kho hiện tại</div>
                  <div className="text-3xl font-bold text-amber-700">{formatNumber(selectedProduct.stock_quantity)} {selectedProduct.unit}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Loại điều chỉnh</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setAdjustType('add')} className={`py-2 rounded-lg font-medium text-sm ${adjustType === 'add' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>➕ Thêm</button>
                    <button onClick={() => setAdjustType('subtract')} className={`py-2 rounded-lg font-medium text-sm ${adjustType === 'subtract' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>➖ Giảm</button>
                    <button onClick={() => setAdjustType('set')} className={`py-2 rounded-lg font-medium text-sm ${adjustType === 'set' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>🎯 Đặt SL</button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{adjustType === 'add' ? 'Số lượng thêm' : adjustType === 'subtract' ? 'Số lượng giảm' : 'Số lượng mới'}</label>
                  <input type="number" value={adjustQuantity} onChange={(e) => setAdjustQuantity(e.target.value)} min="0" className="w-full px-4 py-3 border rounded-lg text-xl font-bold text-center" placeholder="0" />
                </div>

                {adjustQuantity && (
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <span className="text-gray-500">Sau điều chỉnh: </span>
                    <span className="font-bold text-lg">
                      {adjustType === 'add' ? formatNumber(selectedProduct.stock_quantity + parseInt(adjustQuantity || 0))
                        : adjustType === 'subtract' ? formatNumber(Math.max(0, selectedProduct.stock_quantity - parseInt(adjustQuantity || 0)))
                        : formatNumber(parseInt(adjustQuantity || 0))} {selectedProduct.unit}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lý do</label>
                  <select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">Chọn lý do</option>
                    <option value="Kiểm kê">Kiểm kê định kỳ</option>
                    <option value="Hàng hư hỏng">Hàng hư hỏng</option>
                    <option value="Thất thoát">Thất thoát</option>
                    <option value="Chuyển kho">Chuyển kho</option>
                    <option value="Sửa lỗi nhập">Sửa lỗi nhập liệu</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
              </div>
              <div className="p-6 border-t bg-gray-50 flex gap-3 justify-end">
                <button onClick={() => setShowAdjustModal(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Hủy</button>
                <button onClick={handleAdjustStock} className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium">✅ Xác nhận</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function WarehouseImportView() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [transactionItems, setTransactionItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Load transaction items
    const loadTransactionItems = async (transactionId) => {
      setLoadingItems(true);
      try {
        const { data, error } = await supabase
          .from('stock_transaction_items')
          .select('*')
          .eq('transaction_id', transactionId);
        if (error) throw error;
        setTransactionItems(data || []);
      } catch (error) {
        console.error('Error loading items:', error);
        setTransactionItems([]);
      }
      setLoadingItems(false);
    };

    const openDetail = async (trans) => {
      setSelectedTransaction(trans);
      await loadTransactionItems(trans.id);
      setShowDetailModal(true);
    };

    // Form states
    const [formPartnerName, setFormPartnerName] = useState('');
    const [formPartnerPhone, setFormPartnerPhone] = useState('');
    const [formDate, setFormDate] = useState(getTodayVN());
    const [formNote, setFormNote] = useState('');
    const [formItems, setFormItems] = useState([{ product_id: '', quantity: 1, unit_price: 0 }]);

    const importTransactions = stockTransactions.filter(t => t.type === 'import');

    const resetForm = () => {
      setFormPartnerName('');
      setFormPartnerPhone('');
      setFormDate(getTodayVN());
      setFormNote('');
      setFormItems([{ product_id: '', quantity: 1, unit_price: 0 }]);
    };

    const generateTransactionNumber = () => {
      const dateStr = getDateStrVN();
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `PN-${dateStr}-${random}`;
    };

    const addItem = () => {
      setFormItems([...formItems, { product_id: '', quantity: 1, unit_price: 0 }]);
    };

    const removeItem = (index) => {
      if (formItems.length > 1) {
        setFormItems(formItems.filter((_, i) => i !== index));
      }
    };

    const updateItem = (index, field, value) => {
      const newItems = [...formItems];
      newItems[index][field] = value;
      if (field === 'product_id' && value) {
        const product = products.find(p => p.id === value);
        if (product) {
          newItems[index].unit_price = product.import_price || 0;
        }
      }
      setFormItems(newItems);
    };

    const calculateTotal = () => {
      return formItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    };

    const handleCreateImport = async () => {
      const validItems = formItems.filter(item => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
        alert('Vui lòng chọn ít nhất 1 sản phẩm!');
        return;
      }

      try {
        const transactionNumber = generateTransactionNumber();
        
        // Create transaction
        const { data: transaction, error: transError } = await supabase.from('stock_transactions').insert([{
          tenant_id: tenant.id,
          transaction_number: transactionNumber,
          type: 'import',
          transaction_date: formDate,
          partner_name: formPartnerName,
          partner_phone: formPartnerPhone,
          total_amount: calculateTotal(),
          note: formNote,
          status: 'completed',
          created_by: currentUser.name
        }]).select().single();

        if (transError) throw transError;

        // Create transaction items
        const itemsToInsert = validItems.map(item => {
          const product = products.find(p => p.id === item.product_id);
          return {
            transaction_id: transaction.id,
            product_id: item.product_id,
            product_sku: product?.sku || '',
            product_name: product?.name || '',
            quantity: parseInt(item.quantity),
            unit_price: parseFloat(item.unit_price),
            total_price: item.quantity * item.unit_price
          };
        });

        const { error: itemsError } = await supabase.from('stock_transaction_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;

        // Update product stock quantities
        for (const item of validItems) {
          const product = products.find(p => p.id === item.product_id);
          if (product) {
            await supabase.from('products').update({
              stock_quantity: product.stock_quantity + parseInt(item.quantity),
              updated_at: getNowISOVN()
            }).eq('id', item.product_id);
          }
        }

        alert('✅ Nhập kho thành công!');
        
        // Hỏi tạo phiếu chi
        const totalAmount = calculateTotal();
        if (totalAmount > 0 && window.confirm(`Bạn có muốn tạo phiếu chi ${totalAmount.toLocaleString('vi-VN')}đ cho giao dịch nhập kho này không?`)) {
          try {
            const receiptNumber = 'PC-' + getDateStrVN() + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            await supabase.from('receipts_payments').insert([{
              tenant_id: tenant.id,
              receipt_number: receiptNumber,
              type: 'chi',
              amount: totalAmount,
              description: `Nhập kho - ${transactionNumber}` + (formPartnerName ? ` - ${formPartnerName}` : ''),
              category: 'Nhập hàng',
              receipt_date: formDate,
              note: formNote || `Liên kết phiếu nhập kho: ${transactionNumber}`,
              status: 'pending',
              created_by: currentUser.name,
              created_at: getNowISOVN()
            }]);
            alert('✅ Đã tạo phiếu chi chờ duyệt!');
          } catch (err) {
            console.error('Error creating receipt:', err);
            alert('⚠️ Không thể tạo phiếu chi tự động. Vui lòng tạo thủ công.');
          }
        }
        
        setShowCreateModal(false);
        resetForm();
        loadWarehouseData();
      } catch (error) {
        alert('❌ Lỗi: ' + error.message);
      }
    };

    const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

    const filteredTransactions = importTransactions.filter(t => 
      !searchTerm || 
      t.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.partner_name && t.partner_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
      <div className="p-4 md:p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
            <div className="text-2xl font-bold text-green-600">{importTransactions.length}</div>
            <div className="text-gray-600 text-sm">Phiếu nhập</div>
          </div>
          <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
            <div className="text-lg font-bold text-blue-600">
              {formatCurrency(importTransactions.reduce((sum, t) => sum + (t.total_amount || 0), 0))}
            </div>
            <div className="text-gray-600 text-sm">Tổng giá trị nhập</div>
          </div>
          <div className="bg-white rounded-xl p-4 border-l-4 border-purple-500 col-span-2 md:col-span-1">
            <div className="text-2xl font-bold text-purple-600">
              {importTransactions.filter(t => {
                const today = getTodayVN();
                return t.transaction_date === today;
              }).length}
            </div>
            <div className="text-gray-600 text-sm">Nhập hôm nay</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder="🔍 Tìm phiếu nhập..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <button
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium whitespace-nowrap"
          >
            📥 Tạo Phiếu Nhập
          </button>
        </div>

        {/* Transactions List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mã phiếu</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Ngày</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">Nhà cung cấp</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Tổng tiền</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">Người tạo</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                      Chưa có phiếu nhập nào
                    </td>
                  </tr>
                ) : filteredTransactions.map(trans => (
                  <tr key={trans.id} onClick={() => openDetail(trans)} className="hover:bg-green-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-green-600 font-medium">{trans.transaction_number}</td>
                    <td className="px-4 py-3">{new Date(trans.transaction_date).toLocaleDateString('vi-VN')}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{trans.partner_name || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(trans.total_amount)}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{trans.created_by}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Hoàn thành</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white">
                <h2 className="text-xl font-bold">📥 Tạo Phiếu Nhập Kho</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp</label>
                    <input
                      type="text"
                      value={formPartnerName}
                      onChange={(e) => setFormPartnerName(e.target.value)}
                      placeholder="Tên NCC"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SĐT</label>
                    <input
                      type="text"
                      value={formPartnerPhone}
                      onChange={(e) => setFormPartnerPhone(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày nhập</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                {/* Items */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">Sản phẩm nhập</label>
                    <button onClick={addItem} className="text-sm text-green-600 hover:text-green-700">+ Thêm dòng</button>
                  </div>
                  <div className="space-y-2">
                    {formItems.map((item, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <select
                          value={item.product_id}
                          onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg"
                        >
                          <option value="">Chọn sản phẩm</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                          placeholder="SL"
                          className="w-20 px-3 py-2 border rounded-lg"
                          min="1"
                        />
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                          placeholder="Đơn giá"
                          className="w-32 px-3 py-2 border rounded-lg"
                        />
                        {formItems.length > 1 && (
                          <button onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 px-2">✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4 text-right">
                  <span className="text-gray-600">Tổng tiền: </span>
                  <span className="text-2xl font-bold text-green-600">{formatCurrency(calculateTotal())}</span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                  <textarea
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="p-6 border-t flex gap-3 justify-end">
                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded-lg">Hủy</button>
                <button onClick={handleCreateImport} className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">📥 Nhập Kho</button>
              </div>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedTransaction && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-green-700">📥 Chi Tiết Phiếu Nhập</h2>
                    <p className="text-gray-500 font-mono text-sm mt-1">{selectedTransaction.transaction_number}</p>
                  </div>
                  <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                {/* Info */}
                <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
                  <div>
                    <div className="text-xs text-gray-500">Ngày nhập</div>
                    <div className="font-medium">{new Date(selectedTransaction.transaction_date).toLocaleDateString('vi-VN')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Người tạo</div>
                    <div className="font-medium">{selectedTransaction.created_by}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Nhà cung cấp</div>
                    <div className="font-medium">{selectedTransaction.partner_name || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">SĐT</div>
                    <div className="font-medium">{selectedTransaction.partner_phone || '-'}</div>
                  </div>
                </div>

                {/* Items Table */}
                <div>
                  <h3 className="font-medium text-gray-700 mb-2">📦 Danh sách sản phẩm</h3>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Sản phẩm</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">SL</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Đơn giá</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {loadingItems ? (
                          <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">Đang tải...</td></tr>
                        ) : transactionItems.length === 0 ? (
                          <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">Không có dữ liệu</td></tr>
                        ) : transactionItems.map(item => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="font-medium">{item.product_name}</div>
                              <div className="text-xs text-gray-500">{item.product_sku}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">{item.quantity}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(item.unit_price)}</td>
                            <td className="px-4 py-3 text-right font-medium text-green-600">{formatCurrency(item.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-green-50">
                        <tr>
                          <td colSpan="3" className="px-4 py-3 text-right font-bold">Tổng cộng:</td>
                          <td className="px-4 py-3 text-right font-bold text-green-600 text-lg">{formatCurrency(selectedTransaction.total_amount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Note */}
                {selectedTransaction.note && (
                  <div className="bg-yellow-50 rounded-xl p-4">
                    <div className="text-xs text-yellow-600 mb-1">📝 Ghi chú</div>
                    <div className="text-gray-700">{selectedTransaction.note}</div>
                  </div>
                )}
              </div>
              <div className="p-6 border-t bg-gray-50 flex justify-end">
                <button onClick={() => setShowDetailModal(false)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function WarehouseExportView() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [transactionItems, setTransactionItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Load transaction items
    const loadTransactionItems = async (transactionId) => {
      setLoadingItems(true);
      try {
        const { data, error } = await supabase
          .from('stock_transaction_items')
          .select('*')
          .eq('transaction_id', transactionId);
        if (error) throw error;
        setTransactionItems(data || []);
      } catch (error) {
        console.error('Error loading items:', error);
        setTransactionItems([]);
      }
      setLoadingItems(false);
    };

    const openDetail = async (trans) => {
      setSelectedTransaction(trans);
      await loadTransactionItems(trans.id);
      setShowDetailModal(true);
    };

    // Form states
    const [formPartnerName, setFormPartnerName] = useState('');
    const [formPartnerPhone, setFormPartnerPhone] = useState('');
    const [formDate, setFormDate] = useState(getTodayVN());
    const [formNote, setFormNote] = useState('');
    const [formItems, setFormItems] = useState([{ product_id: '', quantity: 1, unit_price: 0 }]);

    const exportTransactions = stockTransactions.filter(t => t.type === 'export');

    const resetForm = () => {
      setFormPartnerName('');
      setFormPartnerPhone('');
      setFormDate(getTodayVN());
      setFormNote('');
      setFormItems([{ product_id: '', quantity: 1, unit_price: 0 }]);
    };

    const generateTransactionNumber = () => {
      const dateStr = getDateStrVN();
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `PX-${dateStr}-${random}`;
    };

    const addItem = () => {
      setFormItems([...formItems, { product_id: '', quantity: 1, unit_price: 0 }]);
    };

    const removeItem = (index) => {
      if (formItems.length > 1) {
        setFormItems(formItems.filter((_, i) => i !== index));
      }
    };

    const updateItem = (index, field, value) => {
      const newItems = [...formItems];
      newItems[index][field] = value;
      if (field === 'product_id' && value) {
        const product = products.find(p => p.id === value);
        if (product) {
          newItems[index].unit_price = product.sell_price || 0;
        }
      }
      setFormItems(newItems);
    };

    const calculateTotal = () => {
      return formItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    };

    const handleCreateExport = async () => {
      const validItems = formItems.filter(item => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
        alert('Vui lòng chọn ít nhất 1 sản phẩm!');
        return;
      }

      // Check stock
      for (const item of validItems) {
        const product = products.find(p => p.id === item.product_id);
        if (product && product.stock_quantity < item.quantity) {
          alert(`❌ Sản phẩm "${product.name}" chỉ còn ${product.stock_quantity} ${product.unit}!`);
          return;
        }
      }

      try {
        const transactionNumber = generateTransactionNumber();
        
        // Create transaction
        const { data: transaction, error: transError } = await supabase.from('stock_transactions').insert([{
          tenant_id: tenant.id,
          transaction_number: transactionNumber,
          type: 'export',
          transaction_date: formDate,
          partner_name: formPartnerName,
          partner_phone: formPartnerPhone,
          total_amount: calculateTotal(),
          note: formNote,
          status: 'completed',
          created_by: currentUser.name
        }]).select().single();

        if (transError) throw transError;

        // Create transaction items
        const itemsToInsert = validItems.map(item => {
          const product = products.find(p => p.id === item.product_id);
          return {
            transaction_id: transaction.id,
            product_id: item.product_id,
            product_sku: product?.sku || '',
            product_name: product?.name || '',
            quantity: parseInt(item.quantity),
            unit_price: parseFloat(item.unit_price),
            total_price: item.quantity * item.unit_price
          };
        });

        const { error: itemsError } = await supabase.from('stock_transaction_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;

        // Update product stock quantities
        for (const item of validItems) {
          const product = products.find(p => p.id === item.product_id);
          if (product) {
            await supabase.from('products').update({
              stock_quantity: product.stock_quantity - parseInt(item.quantity),
              updated_at: getNowISOVN()
            }).eq('id', item.product_id);
          }
        }

        alert('✅ Xuất kho thành công!');
        
        // Hỏi tạo phiếu thu
        const totalAmount = calculateTotal();
        if (totalAmount > 0 && window.confirm(`Bạn có muốn tạo phiếu thu ${totalAmount.toLocaleString('vi-VN')}đ cho giao dịch xuất kho này không?`)) {
          try {
            const receiptNumber = 'PT-' + getDateStrVN() + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            await supabase.from('receipts_payments').insert([{
              tenant_id: tenant.id,
              receipt_number: receiptNumber,
              type: 'thu',
              amount: totalAmount,
              description: `Xuất kho - ${transactionNumber}` + (formPartnerName ? ` - ${formPartnerName}` : ''),
              category: 'Bán tại cửa hàng',
              receipt_date: formDate,
              note: formNote || `Liên kết phiếu xuất kho: ${transactionNumber}`,
              status: 'pending',
              created_by: currentUser.name,
              created_at: getNowISOVN()
            }]);
            alert('✅ Đã tạo phiếu thu chờ duyệt!');
          } catch (err) {
            console.error('Error creating receipt:', err);
            alert('⚠️ Không thể tạo phiếu thu tự động. Vui lòng tạo thủ công.');
          }
        }
        
        setShowCreateModal(false);
        resetForm();
        loadWarehouseData();
      } catch (error) {
        alert('❌ Lỗi: ' + error.message);
      }
    };

    const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

    const filteredTransactions = exportTransactions.filter(t => 
      !searchTerm || 
      t.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.partner_name && t.partner_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
      <div className="p-4 md:p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
            <div className="text-2xl font-bold text-blue-600">{exportTransactions.length}</div>
            <div className="text-gray-600 text-sm">Phiếu xuất</div>
          </div>
          <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
            <div className="text-lg font-bold text-green-600">
              {formatCurrency(exportTransactions.reduce((sum, t) => sum + (t.total_amount || 0), 0))}
            </div>
            <div className="text-gray-600 text-sm">Tổng giá trị xuất</div>
          </div>
          <div className="bg-white rounded-xl p-4 border-l-4 border-purple-500 col-span-2 md:col-span-1">
            <div className="text-2xl font-bold text-purple-600">
              {exportTransactions.filter(t => {
                const today = getTodayVN();
                return t.transaction_date === today;
              }).length}
            </div>
            <div className="text-gray-600 text-sm">Xuất hôm nay</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder="🔍 Tìm phiếu xuất..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <button
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium whitespace-nowrap"
          >
            📤 Tạo Phiếu Xuất
          </button>
        </div>

        {/* Transactions List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mã phiếu</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Ngày</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">Khách hàng</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Tổng tiền</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">Người tạo</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                      Chưa có phiếu xuất nào
                    </td>
                  </tr>
                ) : filteredTransactions.map(trans => (
                  <tr key={trans.id} onClick={() => openDetail(trans)} className="hover:bg-blue-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-blue-600 font-medium">{trans.transaction_number}</td>
                    <td className="px-4 py-3">{new Date(trans.transaction_date).toLocaleDateString('vi-VN')}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{trans.partner_name || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(trans.total_amount)}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{trans.created_by}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">Hoàn thành</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white">
                <h2 className="text-xl font-bold">📤 Tạo Phiếu Xuất Kho</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng</label>
                    <input
                      type="text"
                      value={formPartnerName}
                      onChange={(e) => setFormPartnerName(e.target.value)}
                      placeholder="Tên KH"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SĐT</label>
                    <input
                      type="text"
                      value={formPartnerPhone}
                      onChange={(e) => setFormPartnerPhone(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày xuất</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                {/* Items */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">Sản phẩm xuất</label>
                    <button onClick={addItem} className="text-sm text-blue-600 hover:text-blue-700">+ Thêm dòng</button>
                  </div>
                  <div className="space-y-2">
                    {formItems.map((item, index) => {
                      const product = products.find(p => p.id === item.product_id);
                      return (
                        <div key={index} className="flex gap-2 items-center">
                          <select
                            value={item.product_id}
                            onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                            className="flex-1 px-3 py-2 border rounded-lg"
                          >
                            <option value="">Chọn sản phẩm</option>
                            {products.filter(p => p.stock_quantity > 0).map(p => (
                              <option key={p.id} value={p.id}>{p.sku} - {p.name} (Tồn: {p.stock_quantity})</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                            placeholder="SL"
                            className="w-20 px-3 py-2 border rounded-lg"
                            min="1"
                            max={product?.stock_quantity || 999}
                          />
                          <input
                            type="number"
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                            placeholder="Đơn giá"
                            className="w-32 px-3 py-2 border rounded-lg"
                          />
                          {formItems.length > 1 && (
                            <button onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 px-2">✕</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-4 text-right">
                  <span className="text-gray-600">Tổng tiền: </span>
                  <span className="text-2xl font-bold text-blue-600">{formatCurrency(calculateTotal())}</span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                  <textarea
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="p-6 border-t flex gap-3 justify-end">
                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded-lg">Hủy</button>
                <button onClick={handleCreateExport} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">📤 Xuất Kho</button>
              </div>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedTransaction && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-blue-700">📤 Chi Tiết Phiếu Xuất</h2>
                    <p className="text-gray-500 font-mono text-sm mt-1">{selectedTransaction.transaction_number}</p>
                  </div>
                  <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                {/* Info */}
                <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
                  <div>
                    <div className="text-xs text-gray-500">Ngày xuất</div>
                    <div className="font-medium">{new Date(selectedTransaction.transaction_date).toLocaleDateString('vi-VN')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Người tạo</div>
                    <div className="font-medium">{selectedTransaction.created_by}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Khách hàng</div>
                    <div className="font-medium">{selectedTransaction.partner_name || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">SĐT</div>
                    <div className="font-medium">{selectedTransaction.partner_phone || '-'}</div>
                  </div>
                </div>

                {/* Items Table */}
                <div>
                  <h3 className="font-medium text-gray-700 mb-2">📦 Danh sách sản phẩm</h3>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Sản phẩm</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">SL</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Đơn giá</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {loadingItems ? (
                          <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">Đang tải...</td></tr>
                        ) : transactionItems.length === 0 ? (
                          <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">Không có dữ liệu</td></tr>
                        ) : transactionItems.map(item => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="font-medium">{item.product_name}</div>
                              <div className="text-xs text-gray-500">{item.product_sku}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">{item.quantity}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(item.unit_price)}</td>
                            <td className="px-4 py-3 text-right font-medium text-blue-600">{formatCurrency(item.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-50">
                        <tr>
                          <td colSpan="3" className="px-4 py-3 text-right font-bold">Tổng cộng:</td>
                          <td className="px-4 py-3 text-right font-bold text-blue-600 text-lg">{formatCurrency(selectedTransaction.total_amount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Note */}
                {selectedTransaction.note && (
                  <div className="bg-yellow-50 rounded-xl p-4">
                    <div className="text-xs text-yellow-600 mb-1">📝 Ghi chú</div>
                    <div className="text-gray-700">{selectedTransaction.note}</div>
                  </div>
                )}
              </div>
              <div className="p-6 border-t bg-gray-50 flex justify-end">
                <button onClick={() => setShowDetailModal(false)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function WarehouseHistoryView() {
    const [filterType, setFilterType] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

    const filteredTransactions = stockTransactions.filter(t => {
      const matchType = !filterType || t.type === filterType;
      const matchSearch = !searchTerm || 
        t.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.partner_name && t.partner_name.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchType && matchSearch;
    });

    const totalImport = stockTransactions.filter(t => t.type === 'import').reduce((sum, t) => sum + (t.total_amount || 0), 0);
    const totalExport = stockTransactions.filter(t => t.type === 'export').reduce((sum, t) => sum + (t.total_amount || 0), 0);

    return (
      <div className="p-4 md:p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-4 border-l-4 border-gray-500">
            <div className="text-2xl font-bold text-gray-600">{stockTransactions.length}</div>
            <div className="text-gray-600 text-sm">Tổng giao dịch</div>
          </div>
          <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
            <div className="text-2xl font-bold text-green-600">{stockTransactions.filter(t => t.type === 'import').length}</div>
            <div className="text-gray-600 text-sm">Phiếu nhập</div>
          </div>
          <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
            <div className="text-2xl font-bold text-blue-600">{stockTransactions.filter(t => t.type === 'export').length}</div>
            <div className="text-gray-600 text-sm">Phiếu xuất</div>
          </div>
          <div className="bg-white rounded-xl p-4 border-l-4 border-purple-500">
            <div className={`text-lg font-bold ${totalExport > totalImport ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalExport - totalImport)}
            </div>
            <div className="text-gray-600 text-sm">Chênh lệch</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder="🔍 Tìm kiếm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="">Tất cả loại</option>
            <option value="import">📥 Nhập kho</option>
            <option value="export">📤 Xuất kho</option>
          </select>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-bold text-lg mb-4">📋 Lịch sử giao dịch</h3>
          <div className="space-y-3">
            {filteredTransactions.length === 0 ? (
              <div className="text-center text-gray-500 py-8">Chưa có giao dịch nào</div>
            ) : filteredTransactions.map(trans => (
              <div key={trans.id} className={`flex items-start gap-4 p-4 rounded-lg ${trans.type === 'import' ? 'bg-green-50' : 'bg-blue-50'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${trans.type === 'import' ? 'bg-green-500' : 'bg-blue-500'} text-white text-lg`}>
                  {trans.type === 'import' ? '📥' : '📤'}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`font-mono text-sm ${trans.type === 'import' ? 'text-green-600' : 'text-blue-600'}`}>
                        {trans.transaction_number}
                      </span>
                      <div className="font-medium">{trans.partner_name || (trans.type === 'import' ? 'Nhập kho' : 'Xuất kho')}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${trans.type === 'import' ? 'text-green-600' : 'text-blue-600'}`}>
                        {trans.type === 'import' ? '+' : '-'}{formatCurrency(trans.total_amount)}
                      </div>
                      <div className="text-sm text-gray-500">{new Date(trans.transaction_date).toLocaleDateString('vi-VN')}</div>
                    </div>
                  </div>
                  {trans.note && <div className="text-sm text-gray-600 mt-1">{trans.note}</div>}
                  <div className="text-xs text-gray-400 mt-1">Bởi: {trans.created_by}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  // Loading tenant
  if (tenantLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin text-6xl mb-4">⚙️</div>
          <h2 className="text-xl font-bold text-gray-800">Đang tải...</h2>
          <p className="text-gray-500 mt-2">Vui lòng chờ trong giây lát</p>
        </div>
      </div>
    );
  }

  // Tenant error (không tìm thấy hoặc hết hạn)
  if (tenantError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-600 mb-2">Không thể truy cập</h2>
          <p className="text-gray-600 mb-6">{tenantError}</p>
          <div className="text-sm text-gray-500">
            <p>Liên hệ hỗ trợ:</p>
            <p className="font-medium">support@yourdomain.com</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img 
                src={tenant.logo_url || "/logo.png?v=2"} 
                alt={tenant.name} 
                className="h-32 w-auto"
              />
            </div>
            <h1 className="text-3xl font-bold mb-2">{tenant.name}</h1>
            <p className="text-gray-600">{tenant.slogan || 'Làm việc hăng say, tiền ngay về túi'}</p>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={() => setShowLoginModal(true)}
              className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-lg"
            >
              🔐 Đăng Nhập
            </button>
            <button
              onClick={() => setShowRegisterModal(true)}
              className="w-full px-6 py-4 bg-white hover:bg-gray-50 text-blue-600 border-2 border-blue-600 rounded-xl font-medium text-lg"
            >
              📝 Đăng Ký
            </button>
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <div className="text-sm font-medium mb-2">✨ Tính năng:</div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>✅ Quản lý tasks & deadline</li>
              <li>✅ Theo dõi tiến độ team</li>
              <li>✅ Báo cáo & phân tích</li>
              <li>✅ Automation & templates</li>
            </ul>
          </div>
        </div>

        {showLoginModal && <LoginModal />}
        {showRegisterModal && <RegisterModal />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
          {/* Mobile Header */}
          <div className="flex md:hidden justify-between items-center">
            <button
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center">
              <img src="/logo.png" alt="Logo" className="h-10 w-10 rounded-lg object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
            <div className="flex items-center gap-2">
              {/* Refresh Button Mobile */}
              <button
                onClick={() => {
                  refreshAllData();
                  // Hiệu ứng xoay
                  const btn = document.getElementById('refresh-btn-mobile');
                  if (btn) {
                    btn.classList.add('animate-spin');
                    setTimeout(() => btn.classList.remove('animate-spin'), 1000);
                  }
                }}
                className="p-2 hover:bg-gray-100 rounded-full"
                title="Làm mới dữ liệu"
              >
                <span id="refresh-btn-mobile" className="text-xl inline-block">🔄</span>
              </button>
              {/* Attendance Button Mobile */}
              {(() => {
                const currentShift = todayAttendances.find(a => a.check_in && !a.check_out);
                const totalHours = todayAttendances.reduce((sum, a) => sum + parseFloat(a.work_hours || 0), 0);
                const allDone = todayAttendances.length > 0 && todayAttendances.every(a => a.check_out);
                
                return (
                  <button
                    onClick={() => setShowAttendancePopup(true)}
                    className={`relative p-2 rounded-full ${
                      currentShift ? 'bg-blue-100' : allDone ? 'bg-green-100' : 'bg-yellow-100 animate-pulse'
                    }`}
                  >
                    <span className="text-xl">{currentShift ? '🟢' : allDone ? '✅' : '⏰'}</span>
                  </button>
                );
              })()}
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 hover:bg-gray-100 rounded-full"
                >
                  <span className="text-xl">🔔</span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <NotificationsDropdown />
              </div>
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt={tenant.name} className="h-14 w-14 rounded-lg object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
              <div>
                <h1 className="text-2xl font-bold text-green-800">{tenant.name}</h1>
                <p className="text-gray-600 text-sm">{tenant.slogan || 'Làm việc hăng say, tiền ngay về túi'}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Attendance Button on Header */}
              {(() => {
                const currentShift = todayAttendances.find(a => a.check_in && !a.check_out);
                const totalHours = todayAttendances.reduce((sum, a) => sum + parseFloat(a.work_hours || 0), 0);
                const allDone = todayAttendances.length > 0 && todayAttendances.every(a => a.check_out);
                
                return (
                  <button
                    onClick={() => setShowAttendancePopup(true)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                      currentShift ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : allDone ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 animate-pulse'
                    }`}
                  >
                    {currentShift ? (
                      <>🟢 Ca {todayAttendances.length}: {currentShift.check_in?.slice(0,5)}</>
                    ) : allDone ? (
                      <>✅ {todayAttendances.length} ca - {totalHours.toFixed(1)}h</>
                    ) : (
                      <>⏰ Chấm công</>
                    )}
                  </button>
                );
              })()}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <span className="text-2xl">🔔</span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <NotificationsDropdown />
              </div>
              <div className="text-right">
                <div className="font-medium">{currentUser.name}</div>
                <div className="text-sm text-gray-600">{currentUser.role} • {currentUser.team}</div>
              </div>
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'admin') && (
                <button
                  onClick={() => setShowPermissionsModal(true)}
                  className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg font-medium text-sm"
                >
                  🔐 Phân Quyền
                </button>
              )}
              <button
                onClick={() => {
                  setIsLoggedIn(false);
                  setCurrentUser(null);
                  setActiveTab('dashboard');
                  localStorage.removeItem(`${tenant.slug}_user`);
                  localStorage.removeItem(`${tenant.slug}_loggedIn`);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm"
              >
                🚪 Đăng xuất
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar */}
      {showMobileSidebar && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setShowMobileSidebar(false)}
          />
          <div className="fixed left-0 top-0 bottom-0 w-72 bg-white z-50 shadow-xl md:hidden overflow-y-auto">
            <div className="p-3 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-bold">Menu</h2>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-1 hover:bg-white/20 rounded"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="text-sm opacity-90">{currentUser.name}</div>
              <div className="text-xs opacity-75">{currentUser.role} • {currentUser.team}</div>
            </div>

            {/* Module Selection */}
            <div className="p-3 border-b">
              <div className="text-xs font-semibold text-gray-500 mb-2">BỘ PHẬN</div>
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions.media > 0)) && (
                <button
                  onClick={() => {
                    navigateTo('media', 'dashboard');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                    activeModule === 'media'
                      ? 'bg-green-100 text-green-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  🎬 Media
                </button>
              )}
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions.warehouse > 0)) && (
                <button
                  onClick={() => {
                    navigateTo('warehouse', 'inventory');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                    activeModule === 'warehouse'
                      ? 'bg-green-100 text-green-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  📦 Kho
                </button>
              )}
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions.sales > 0)) && (
                <button
                  onClick={() => {
                    navigateTo('sales', 'orders');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                    activeModule === 'sales'
                      ? 'bg-green-100 text-green-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  🛒 Sale
                </button>
              )}
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions.technical > 0)) && (
                <button
                  onClick={() => {
                    navigateTo('technical', 'jobs');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                    activeModule === 'technical'
                      ? 'bg-green-100 text-green-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  🔧 Kỹ Thuật
                </button>
              )}
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions.finance > 0)) && (
                <button
                  onClick={() => {
                    navigateTo('finance', 'dashboard');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg font-medium text-left text-sm ${
                    activeModule === 'finance'
                      ? 'bg-green-100 text-green-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  💰 Tài Chính
                </button>
              )}
            </div>

            {/* Admin Functions */}
            {currentUser.role === 'Admin' || currentUser.role === 'admin' && (
              <div className="p-3 border-b bg-purple-50">
                <div className="text-xs font-semibold text-purple-700 mb-2">ADMIN</div>
                <button
                  onClick={() => {
                    navigateTo('media', 'automation');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg mb-1.5 font-medium text-left text-sm ${
                    activeTab === 'automation'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white hover:bg-purple-100'
                  }`}
                >
                  ⚙️ Automation
                </button>
                <button
                  onClick={() => {
                    navigateTo('media', 'users');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg font-medium text-left text-sm ${
                    activeTab === 'users'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white hover:bg-purple-100'
                  }`}
                >
                  👥 Users
                </button>
              </div>
            )}

            {/* Tabs Navigation */}
            <div className="p-3">
              <div className="text-xs font-semibold text-gray-500 mb-2">CHỨC NĂNG</div>
              {(activeModule === 'media' ? [
                { id: 'mytasks', l: '📝 Của Tôi' },
                { id: 'dashboard', l: '📊 Dashboard' },
                { id: 'tasks', l: '🎬 Video', tabKey: 'videos' },
                { id: 'calendar', l: '📅 Lịch', tabKey: 'calendar' },
                { id: 'report', l: '📈 Báo Cáo', tabKey: 'report' },
                { id: 'performance', l: '📊 Hiệu Suất' }
              ] : activeModule === 'warehouse' ? [
                { id: 'inventory', l: '📦 Tồn Kho', tabKey: 'inventory' },
                { id: 'import', l: '📥 Nhập Kho', tabKey: 'import' },
                { id: 'export', l: '📤 Xuất Kho', tabKey: 'export' },
                { id: 'history', l: '📋 Lịch Sử', tabKey: 'products' }
              ] : activeModule === 'sales' ? [
                { id: 'orders', l: '🛒 Đơn Hàng', tabKey: 'orders' },
                { id: 'customers', l: '👥 Khách Hàng' },
                { id: 'products', l: '📱 Sản Phẩm' },
                { id: 'report', l: '📈 Báo Cáo' }
              ] : activeModule === 'technical' ? [
                { id: 'today', l: '📅 Hôm Nay', highlight: true },
                { id: 'calendar', l: '🗓️ Lịch' },
                { id: 'jobs', l: '📋 Công Việc' },
                { id: 'wages', l: '💰 Tính Công' },
                { id: 'summary', l: '📊 Tổng Quan' }
              ] : activeModule === 'finance' ? [
                { id: 'dashboard', l: '📊 Tổng Quan', tabKey: 'overview' },
                { id: 'receipts', l: '🧾 Thu/Chi', tabKey: 'receipts' },
                { id: 'debts', l: '📋 Công Nợ', tabKey: 'debts' },
                { id: 'attendance', l: '⏰ Chấm Công', tabKey: 'attendance' },
                { id: 'salaries', l: '💰 Lương', tabKey: 'salaries' },
                { id: 'reports', l: '📈 Báo Cáo', tabKey: 'reports' }
              ] : []).filter(t => !t.tabKey || canAccessTab(activeModule, t.tabKey)).map(t => {
                const todayJobsCount = t.id === 'today' ? technicalJobs.filter(j => j.scheduledDate === getTodayVN() && j.status !== 'Hủy' && j.status !== 'Hoàn thành').length : 0;
                return (
                <button
                  key={t.id}
                  onClick={() => {
                    navigateTo(activeModule, t.id);
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg mb-1 text-left font-medium text-sm flex items-center justify-between ${
                    activeTab === t.id
                      ? t.highlight ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'
                      : t.highlight ? 'bg-orange-50 text-orange-700 hover:bg-orange-100' : 'hover:bg-gray-100'
                  }`}
                >
                  <span>{t.l}</span>
                  {t.id === 'today' && todayJobsCount > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      activeTab === t.id ? 'bg-white text-orange-600' : 'bg-orange-500 text-white'
                    }`}>
                      {todayJobsCount}
                    </span>
                  )}
                </button>
              );
              })}
            </div>

            {/* Admin Buttons */}
            <div className="p-3 border-t space-y-1.5">
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'admin') && (
                <button
                  onClick={() => {
                    setShowPermissionsModal(true);
                    setShowMobileSidebar(false);
                  }}
                  className="w-full px-3 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm"
                >
                  🔐 Phân Quyền
                </button>
              )}
              <button
                onClick={() => {
                  setIsLoggedIn(false);
                  setCurrentUser(null);
                  setActiveTab('dashboard');
                  localStorage.removeItem(`${tenant.slug}_user`);
                  localStorage.removeItem(`${tenant.slug}_loggedIn`);
                  setShowMobileSidebar(false);
                }}
                className="w-full px-3 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm"
              >
                🚪 Đăng xuất
              </button>
            </div>
          </div>
        </>
      )}

      {/* Module Selector - Desktop Only */}
      <div className="hidden md:block bg-gradient-to-r from-green-700 to-green-800">
        <div className="max-w-7xl mx-auto px-6 flex gap-2">
          {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions.media > 0)) && (
            <button
              onClick={() => navigateTo('media', 'dashboard')}
              className={`px-6 py-4 font-bold text-lg transition-all rounded-t-lg ${
                activeModule === 'media'
                  ? 'bg-white text-green-700'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🎬 Media
            </button>
          )}
          {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions.warehouse > 0)) && (
            <button
              onClick={() => navigateTo('warehouse', 'inventory')}
              className={`px-6 py-4 font-bold text-lg transition-all rounded-t-lg ${
                activeModule === 'warehouse'
                  ? 'bg-white text-green-700'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              📦 Kho
            </button>
          )}
          {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions.sales > 0)) && (
            <button
              onClick={() => navigateTo('sales', 'orders')}
              className={`px-6 py-4 font-bold text-lg transition-all rounded-t-lg ${
                activeModule === 'sales'
                  ? 'bg-white text-green-700'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🛒 Sale
            </button>
          )}
          {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions.technical > 0)) && (
            <button
              onClick={() => navigateTo('technical', 'today')}
              className={`px-6 py-4 font-bold text-lg transition-all rounded-t-lg ${
                activeModule === 'technical'
                  ? 'bg-white text-green-700'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🔧 Kỹ Thuật
            </button>
          )}
          {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions.finance > 0)) && (
            <button
              onClick={() => navigateTo('finance', 'dashboard')}
              className={`px-6 py-4 font-bold text-lg transition-all rounded-t-lg ${
                activeModule === 'finance'
                  ? 'bg-white text-green-700'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              💰 Tài Chính
            </button>
          )}
        </div>
      </div>

      <div className="hidden md:block bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 flex gap-2 overflow-x-auto">
          {(activeModule === 'media' ? [
            { id: 'mytasks', l: '📝 Của Tôi' },
            { id: 'dashboard', l: '📊 Dashboard' },
            { id: 'tasks', l: '🎬 Video', tabKey: 'videos' },
            { id: 'calendar', l: '📅 Lịch', tabKey: 'calendar' },
            { id: 'report', l: '📈 Báo Cáo', tabKey: 'report' },
            { id: 'performance', l: '📊 Hiệu Suất' }
          ] : activeModule === 'warehouse' ? [
            { id: 'inventory', l: '📦 Tồn Kho', tabKey: 'inventory' },
            { id: 'import', l: '📥 Nhập Kho', tabKey: 'import' },
            { id: 'export', l: '📤 Xuất Kho', tabKey: 'export' },
            { id: 'history', l: '📋 Lịch Sử', tabKey: 'products' }
          ] : activeModule === 'sales' ? [
            { id: 'orders', l: '🛒 Đơn Hàng', tabKey: 'orders' },
            { id: 'customers', l: '👥 Khách Hàng' },
            { id: 'products', l: '📱 Sản Phẩm' },
            { id: 'report', l: '📈 Báo Cáo' }
          ] : activeModule === 'technical' ? [
            { id: 'today', l: '📅 Hôm Nay' },
            { id: 'calendar', l: '🗓️ Lịch' },
            { id: 'jobs', l: '📋 Công Việc' },
            { id: 'wages', l: '💰 Tiền Công' },
            { id: 'summary', l: '📊 Tổng Hợp' }
          ] : activeModule === 'finance' ? [
            { id: 'dashboard', l: '📊 Tổng Quan', tabKey: 'overview' },
            { id: 'receipts', l: '🧾 Thu/Chi', tabKey: 'receipts' },
            { id: 'debts', l: '📋 Công Nợ', tabKey: 'debts' },
            { id: 'attendance', l: '⏰ Chấm Công', tabKey: 'attendance' },
            { id: 'salaries', l: '💰 Lương', tabKey: 'salaries' },
            { id: 'reports', l: '📈 Báo Cáo', tabKey: 'reports' }
          ] : []).filter(t => !t.tabKey || canAccessTab(activeModule, t.tabKey)).map(t => (
            <button key={t.id} onClick={() => navigateTo(activeModule, t.id)} className={`px-6 py-3 font-medium border-b-4 whitespace-nowrap ${activeTab === t.id ? 'border-green-700 text-green-700' : 'border-transparent text-gray-600 hover:text-green-600'}`}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Title Bar */}
      <div className="md:hidden bg-white border-b px-4 py-3 sticky top-[52px] z-30">
        <h2 className="font-bold text-lg">
          {(activeModule === 'media' ? [
            { id: 'mytasks', l: '📝 Của Tôi' },
            { id: 'dashboard', l: '📊 Dashboard' },
            { id: 'tasks', l: '🎬 Video' },
            { id: 'calendar', l: '📅 Lịch' },
            { id: 'report', l: '📈 Báo Cáo' },
            { id: 'performance', l: '📊 Hiệu Suất' },
            { id: 'automation', l: '⚙️ Automation' },
            { id: 'users', l: '👥 Users' }
          ] : activeModule === 'warehouse' ? [
            { id: 'inventory', l: '📦 Tồn Kho' },
            { id: 'import', l: '📥 Nhập Kho' },
            { id: 'export', l: '📤 Xuất Kho' },
            { id: 'history', l: '📋 Lịch Sử' }
          ] : activeModule === 'sales' ? [
            { id: 'orders', l: '🛒 Đơn Hàng' },
            { id: 'customers', l: '👥 Khách Hàng' },
            { id: 'products', l: '📱 Sản Phẩm' },
            { id: 'report', l: '📈 Báo Cáo' }
          ] : activeModule === 'technical' ? [
            { id: 'today', l: '📅 Hôm Nay' },
            { id: 'calendar', l: '🗓️ Lịch' },
            { id: 'jobs', l: '📋 Công Việc' },
            { id: 'wages', l: '💰 Tiền Công' },
            { id: 'summary', l: '📊 Tổng Hợp' }
          ] : activeModule === 'finance' ? [
            { id: 'dashboard', l: '📊 Tổng Quan' },
            { id: 'receipts', l: '🧾 Thu/Chi' },
            { id: 'debts', l: '📋 Công Nợ' },
            { id: 'attendance', l: '⏰ Chấm Công' },
            { id: 'salaries', l: '💰 Lương' },
            { id: 'reports', l: '📈 Báo Cáo' }
          ] : []).find(t => t.id === activeTab)?.l || ''}
        </h2>
      </div>

      <div className="max-w-7xl mx-auto pb-20 md:pb-0">
        {/* Media Module */}
        {activeModule === 'media' && !canAccessModule('media') && (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
              <p className="text-red-600">Bạn không có quyền truy cập module Media.</p>
            </div>
          </div>
        )}
        {activeModule === 'media' && canAccessModule('media') && (
          <>
            {activeTab === 'mytasks' && <MyTasksView />}
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'tasks' && canAccessTab('media', 'videos') && <TasksView />}
            {activeTab === 'calendar' && canAccessTab('media', 'calendar') && <CalendarView />}
            {activeTab === 'report' && canAccessTab('media', 'report') && <ReportView />}
            {activeTab === 'integrations' && <IntegrationsView />}
            {activeTab === 'automation' && <AutomationView />}
            {activeTab === 'users' && <UserManagementView />}
            {activeTab === 'performance' && <PerformanceView />}
            {/* Thông báo không có quyền tab */}
            {((activeTab === 'tasks' && !canAccessTab('media', 'videos')) ||
              (activeTab === 'calendar' && !canAccessTab('media', 'calendar')) ||
              (activeTab === 'report' && !canAccessTab('media', 'report'))) && (
              <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
                  <div className="text-6xl mb-4">🔒</div>
                  <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
                  <p className="text-red-600">Bạn không được phép xem mục này.</p>
                </div>
              </div>
            )}
          </>
        )}
        {activeModule === 'warehouse' && !canAccessModule('warehouse') && (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
              <p className="text-red-600">Bạn không có quyền truy cập module Kho.</p>
            </div>
          </div>
        )}
        {activeModule === 'warehouse' && canAccessModule('warehouse') && (
          <>
            {activeTab === 'inventory' && canAccessTab('warehouse', 'inventory') && <WarehouseInventoryView />}
            {activeTab === 'import' && canAccessTab('warehouse', 'import') && <WarehouseImportView />}
            {activeTab === 'export' && canAccessTab('warehouse', 'export') && <WarehouseExportView />}
            {activeTab === 'history' && canAccessTab('warehouse', 'products') && <WarehouseHistoryView />}
            {!canAccessTab('warehouse', activeTab === 'history' ? 'products' : activeTab) && (
              <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
                  <div className="text-6xl mb-4">🔒</div>
                  <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
                  <p className="text-red-600">Bạn không được phép xem mục này.</p>
                </div>
              </div>
            )}
          </>
        )}
        {activeModule === 'sales' && !canAccessModule('sales') && (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
              <p className="text-red-600">Bạn không có quyền truy cập module Sale.</p>
            </div>
          </div>
        )}
        {activeModule === 'sales' && canAccessModule('sales') && (
          <>
            {activeTab === 'orders' && <SalesOrdersView />}
            {activeTab === 'customers' && <SalesCustomersView />}
            {activeTab === 'products' && <SalesProductsView />}
            {activeTab === 'report' && <SalesReportView />}
          </>
        )}
        {activeModule === 'technical' && !canAccessModule('technical') && (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
              <p className="text-red-600">Bạn không có quyền truy cập module Kỹ thuật.</p>
            </div>
          </div>
        )}
        {activeModule === 'technical' && canAccessModule('technical') && (
          <>
            {activeTab === 'today' && <TodayJobsDashboard />}
            {activeTab === 'calendar' && <TechnicalCalendarView />}
            {activeTab === 'jobs' && <TechnicalJobsView />}
            {activeTab === 'wages' && <TechnicianWagesView />}
            {activeTab === 'summary' && <TechnicalSummaryView />}
            {activeTab === 'integrations' && <IntegrationsView />}
          </>
        )}
        {activeModule === 'finance' && !canAccessModule('finance') && (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
              <p className="text-red-600">Bạn không có quyền truy cập module Tài chính.</p>
            </div>
          </div>
        )}
        {activeModule === 'finance' && canAccessModule('finance') && (
          <>
            {activeTab === 'dashboard' && canAccessTab('finance', 'overview') && <FinanceDashboard />}
            {activeTab === 'receipts' && canAccessTab('finance', 'receipts') && <ReceiptsView />}
            {activeTab === 'debts' && canAccessTab('finance', 'debts') && <DebtsView />}
            {activeTab === 'attendance' && canAccessTab('finance', 'attendance') && <AttendanceView />}
            {activeTab === 'salaries' && canAccessTab('finance', 'salaries') && <SalariesView />}
            {activeTab === 'reports' && canAccessTab('finance', 'reports') && <ReportsView />}
            {/* Hiển thị thông báo nếu không có quyền */}
            {!canAccessTab('finance', activeTab === 'dashboard' ? 'overview' : activeTab) && (
              <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
                  <div className="text-6xl mb-4">🔒</div>
                  <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
                  <p className="text-red-600">Bạn không được phép xem mục này. Vui lòng liên hệ Admin.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && <TaskModal />}
      {showCreateTaskModal && <CreateTaskModal />}
      {showCreateJobModal && <CreateJobModal />}
      {showJobModal && <JobDetailModal />}
      {showPermissionsModal && <PermissionsModal />}

      {/* Mobile Bottom Tab Bar - Chỉ hiện khi ở module Technical */}
      {activeModule === 'technical' && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
          <div className="flex">
            {[
              { id: 'today', icon: '📅', label: 'Hôm Nay', highlight: true },
              { id: 'calendar', icon: '🗓️', label: 'Lịch' },
              { id: 'jobs', icon: '📋', label: 'Việc' },
              { id: 'wages', icon: '💰', label: 'Công' },
              { id: 'summary', icon: '📊', label: 'Tổng' }
            ].map(tab => {
              const todayCount = tab.id === 'today' ? technicalJobs.filter(j => j.scheduledDate === getTodayVN() && j.status !== 'Hủy' && j.status !== 'Hoàn thành').length : 0;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigateTo('technical', tab.id)}
                  className={`flex-1 py-2 flex flex-col items-center relative ${
                    isActive 
                      ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                      : 'text-green-300'
                  }`}
                >
                  <span className="text-lg relative">
                    {tab.icon}
                    {tab.id === 'today' && todayCount > 0 && (
                      <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                        {todayCount}
                      </span>
                    )}
                  </span>
                  <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                    {tab.label}
                  </span>
                  {isActive && (
                    <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                      tab.highlight ? 'bg-orange-400' : 'bg-white'
                    }`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar - Module Media */}
      {activeModule === 'media' && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
          <div className="flex">
            {[
              { id: 'mytasks', icon: '📝', label: 'Của Tôi', highlight: true },
              { id: 'dashboard', icon: '📊', label: 'Tổng' },
              { id: 'tasks', icon: '🎬', label: 'Video' },
              { id: 'calendar', icon: '📅', label: 'Lịch' },
              { id: 'report', icon: '📈', label: 'B.Cáo' }
            ].map(tab => {
              const myTasksCount = tab.id === 'mytasks' 
                ? tasks.filter(t => 
                    t.assignee === currentUser.name && 
                    t.status !== 'done' && 
                    t.status !== 'completed' && 
                    t.status !== 'Hoàn thành'
                  ).length 
                : 0;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigateTo('media', tab.id)}
                  className={`flex-1 py-2 flex flex-col items-center relative ${
                    isActive 
                      ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                      : 'text-green-300'
                  }`}
                >
                  <span className="text-lg relative">
                    {tab.icon}
                    {tab.id === 'mytasks' && myTasksCount > 0 && (
                      <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                        {myTasksCount > 9 ? '9+' : myTasksCount}
                      </span>
                    )}
                  </span>
                  <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                    {tab.label}
                  </span>
                  {isActive && (
                    <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                      tab.highlight ? 'bg-orange-400' : 'bg-white'
                    }`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar - Module Finance */}
      {activeModule === 'finance' && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 shadow-lg z-50">
          <div className="flex">
            {[
              { id: 'dashboard', icon: '📊', label: 'Tổng', highlight: true },
              { id: 'receipts', icon: '📥', label: 'Thu' },
              { id: 'payments', icon: '📤', label: 'Chi' },
              { id: 'report', icon: '📈', label: 'B.Cáo' }
            ].map(tab => {
              // Đếm phiếu chờ duyệt
              const pendingCount = tab.id === 'receipts' 
                ? receipts.filter(r => r.type === 'thu' && r.status === 'pending').length
                : tab.id === 'payments'
                ? receipts.filter(r => r.type === 'chi' && r.status === 'pending').length
                : 0;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigateTo('finance', tab.id)}
                  className={`flex-1 py-2 flex flex-col items-center relative ${
                    isActive 
                      ? tab.highlight ? 'text-orange-400 bg-green-900' : 'text-white bg-green-900'
                      : 'text-green-300'
                  }`}
                >
                  <span className="text-lg relative">
                    {tab.icon}
                    {pendingCount > 0 && (
                      <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                  </span>
                  <span className={`text-[9px] mt-0.5 font-medium ${isActive && tab.highlight ? 'text-orange-400' : ''}`}>
                    {tab.label}
                  </span>
                  {isActive && (
                    <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full ${
                      tab.highlight ? 'bg-orange-400' : 'bg-white'
                    }`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Attendance Button - Chỉ hiện trên Desktop */}
      {(() => {
        const currentShift = todayAttendances.find(a => a.check_in && !a.check_out);
        const totalHours = todayAttendances.reduce((sum, a) => sum + parseFloat(a.work_hours || 0), 0);
        const hasCheckedIn = todayAttendances.length > 0;
        const allCheckedOut = todayAttendances.length > 0 && todayAttendances.every(a => a.check_out);
        
        return (
          <button
            onClick={() => setShowAttendancePopup(true)}
            className={`hidden md:flex fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-lg items-center justify-center text-2xl transition-all hover:scale-110 ${
              currentShift ? 'bg-blue-500 text-white' : allCheckedOut ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white animate-bounce'
            }`}
            title={currentShift ? 'Đang làm việc' : allCheckedOut ? `Đã làm ${totalHours.toFixed(1)}h` : 'Chấm công'}
          >
            {currentShift ? '🟢' : allCheckedOut ? '✅' : '⏰'}
          </button>
        );
      })()}

      {/* Attendance Popup - Hỗ trợ nhiều ca */}
      {showAttendancePopup && (() => {
        const currentShift = todayAttendances.find(a => a.check_in && !a.check_out);
        const totalHours = todayAttendances.reduce((sum, a) => sum + parseFloat(a.work_hours || 0), 0);
        const canCheckIn = !currentShift; // Chỉ check-in khi không có ca đang mở
        const canCheckOut = !!currentShift; // Chỉ check-out khi có ca đang mở
        
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white text-center">
                <div className="text-5xl mb-2">
                  {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="text-blue-200">
                  {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                <div className="mt-3 font-medium">{currentUser?.name}</div>
              </div>

              {/* Status & History */}
              <div className="p-6">
                {/* Trạng thái hiện tại */}
                <div className={`rounded-xl p-4 mb-4 text-center ${
                  currentShift ? 'bg-blue-50 border border-blue-200' : 
                  todayAttendances.length > 0 ? 'bg-green-50 border border-green-200' : 
                  'bg-yellow-50 border border-yellow-200'
                }`}>
                  {todayAttendances.length === 0 && (
                    <div className="text-yellow-700">
                      <span className="text-2xl">⏳</span>
                      <div className="font-medium mt-1">Chưa chấm công hôm nay</div>
                    </div>
                  )}
                  {currentShift && (
                    <div className="text-blue-700">
                      <span className="text-2xl">🟢</span>
                      <div className="font-medium mt-1">Đang làm việc - Ca {todayAttendances.length}</div>
                      <div className="text-sm">Vào lúc {currentShift.check_in?.slice(0,5)}</div>
                    </div>
                  )}
                  {todayAttendances.length > 0 && !currentShift && (
                    <div className="text-green-700">
                      <span className="text-2xl">✅</span>
                      <div className="font-medium mt-1">Đã hoàn thành {todayAttendances.length} ca</div>
                      <div className="text-lg font-bold mt-1">Tổng: {totalHours.toFixed(2)} giờ</div>
                    </div>
                  )}
                </div>

                {/* Danh sách các ca đã chấm */}
                {todayAttendances.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <div className="text-sm font-medium text-gray-600">📋 Chi tiết các ca:</div>
                    {todayAttendances.map((shift, idx) => (
                      <div key={shift.id} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 text-sm">
                        <span className="font-medium">Ca {idx + 1}</span>
                        <span>{shift.check_in?.slice(0,5)} - {shift.check_out?.slice(0,5) || '...'}</span>
                        <span className={shift.check_out ? 'text-green-600 font-medium' : 'text-blue-600'}>
                          {shift.work_hours ? `${shift.work_hours}h` : 'Đang làm'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-4">
                  <button
                    onClick={async () => {
                      if (!canCheckIn) {
                        alert('⚠️ Bạn đang có ca chưa check-out!');
                        return;
                      }
                      try {
                        const now = getVietnamDate();
                        const checkInTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
                        const { data, error } = await supabase.from('attendances').insert({
                          tenant_id: tenant.id, user_id: currentUser.id, user_name: currentUser.name,
                          date: getTodayVN(), check_in: checkInTime,
                          status: 'checked_in', created_at: new Date().toISOString()
                        }).select().single();
                        if (error) throw error;
                        setTodayAttendances([...todayAttendances, data]);
                        alert(`✅ Check-in Ca ${todayAttendances.length + 1} lúc ${checkInTime}!`);
                      } catch (err) {
                        alert('❌ Lỗi: ' + err.message);
                      }
                    }}
                    disabled={!canCheckIn}
                    className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all ${
                      !canCheckIn ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 text-white shadow-lg'
                    }`}
                  >
                    📥 CHECK-IN
                  </button>
                  <button
                    onClick={async () => {
                      if (!canCheckOut) {
                        alert('⚠️ Bạn chưa check-in!');
                        return;
                      }
                      try {
                        const now = getVietnamDate();
                        const checkOutTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
                        const [inH, inM] = currentShift.check_in.split(':').map(Number);
                        const [outH, outM] = checkOutTime.split(':').map(Number);
                        const workHours = ((outH * 60 + outM) - (inH * 60 + inM)) / 60;
                        const { data, error } = await supabase.from('attendances').update({
                          check_out: checkOutTime, work_hours: parseFloat(workHours.toFixed(2)), status: 'checked_out'
                        }).eq('id', currentShift.id).select().single();
                        if (error) throw error;
                        setTodayAttendances(todayAttendances.map(a => a.id === currentShift.id ? data : a));
                        alert(`✅ Check-out Ca ${todayAttendances.length} thành công!\nGiờ ca này: ${workHours.toFixed(2)} giờ`);
                      } catch (err) {
                        alert('❌ Lỗi: ' + err.message);
                      }
                    }}
                    disabled={!canCheckOut}
                    className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all ${
                      !canCheckOut ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600 text-white shadow-lg'
                    }`}
                  >
                    📤 CHECK-OUT
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t bg-gray-50">
                <button
                  onClick={() => setShowAttendancePopup(false)}
                  className="w-full py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-medium"
                >
                Đóng
              </button>
            </div>
          </div>
        </div>
      );
      })()}
    </div>
  );


  // =====================================
  // SALES MODULE COMPONENTS
  // =====================================

  function SalesOrdersView() {
    return (
      <div className="p-6">
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-2xl font-bold text-pink-800 mb-2">Quản Lý Đơn Hàng</h2>
          <p className="text-pink-600">Module Sale đang được phát triển...</p>
          <p className="text-sm text-pink-500 mt-2">Sẽ bao gồm: Danh sách đơn hàng, trạng thái, xử lý đơn</p>
        </div>
      </div>
    );
  }

  function SalesCustomersView() {
    return (
      <div className="p-6">
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">👥</div>
          <h2 className="text-2xl font-bold text-purple-800 mb-2">Quản Lý Khách Hàng</h2>
          <p className="text-purple-600">Module đang được phát triển...</p>
          <p className="text-sm text-purple-500 mt-2">Sẽ bao gồm: Danh sách khách hàng, lịch sử mua hàng, chăm sóc</p>
        </div>
      </div>
    );
  }

  function SalesProductsView() {
    return (
      <div className="p-6">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">📱</div>
          <h2 className="text-2xl font-bold text-indigo-800 mb-2">Danh Mục Sản Phẩm</h2>
          <p className="text-indigo-600">Module đang được phát triển...</p>
          <p className="text-sm text-indigo-500 mt-2">Sẽ bao gồm: Danh sách sản phẩm, giá bán, khuyến mãi</p>
        </div>
      </div>
    );
  }

  function SalesReportView() {
    return (
      <div className="p-6">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">📈</div>
          <h2 className="text-2xl font-bold text-orange-800 mb-2">Báo Cáo Bán Hàng</h2>
          <p className="text-orange-600">Module đang được phát triển...</p>
          <p className="text-sm text-orange-500 mt-2">Sẽ bao gồm: Doanh thu, top sản phẩm, phân tích khách hàng</p>
        </div>
      </div>
    );
  }

  // =====================================
  // FINANCE MODULE COMPONENTS
  // =====================================

  function FinanceDashboard() {
    // Check permission level
    const financeLevel = getPermissionLevel('finance');
    const canViewAll = financeLevel >= 2 || currentUser.role === 'Admin' || currentUser.role === 'admin';
    
    // Lọc dữ liệu theo quyền: Level 1 chỉ xem của mình, Level 2+ xem tất cả
    const visibleReceipts = canViewAll 
      ? receiptsPayments 
      : receiptsPayments.filter(r => r.created_by === currentUser.name);
    
    const totalReceipts = visibleReceipts
      .filter(r => r.type === 'thu' && r.status === 'approved')
      .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    
    const totalPayments = visibleReceipts
      .filter(r => r.type === 'chi' && r.status === 'approved')
      .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    
    const netCashFlow = totalReceipts - totalPayments;

    return (
      <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl md:text-2xl font-bold">💰 Tổng Quan Tài Chính</h2>
          {!canViewAll && (
            <span className="text-xs md:text-sm text-gray-500 bg-gray-100 px-2 md:px-3 py-1 rounded-full">
              📋 Dữ liệu của bạn
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <div className="bg-green-50 p-4 md:p-6 rounded-xl border border-green-200">
            <div className="text-sm text-green-600 font-medium mb-1">Tổng Thu</div>
            <div className="text-2xl font-bold text-green-700">
              {formatMoney(totalReceipts)}
            </div>
          </div>
          
          <div className="bg-red-50 p-6 rounded-xl border border-red-200">
            <div className="text-sm text-red-600 font-medium mb-1">Tổng Chi</div>
            <div className="text-2xl font-bold text-red-700">
              {formatMoney(totalPayments)}
            </div>
          </div>
          
          <div className={`p-6 rounded-xl border ${netCashFlow >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className={`text-sm font-medium mb-1 ${netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              Dòng Tiền
            </div>
            <div className={`text-2xl font-bold ${netCashFlow >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
              {formatMoney(netCashFlow)}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-bold text-lg mb-4">📊 Chi Tiết Gần Đây</h3>
          <div className="space-y-2">
            {visibleReceipts.slice(0, 5).map(r => (
              <div key={r.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium">{r.receipt_number}</div>
                  <div className="text-sm text-gray-500">{r.description || 'Không có mô tả'}</div>
                </div>
                <div className={`font-bold ${r.type === 'thu' ? 'text-green-600' : 'text-red-600'}`}>
                  {r.type === 'thu' ? '+' : '-'}{formatMoney(r.amount)}
                </div>
              </div>
            ))}
            {visibleReceipts.length === 0 && (
              <p className="text-gray-500 text-center py-4">Chưa có giao dịch nào</p>
            )}
          </div>
        </div>
      </div>
    );
  }


  function ReceiptsView() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [filterType, setFilterType] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterCreator, setFilterCreator] = useState('all'); // *** NEW: Filter theo người tạo ***
    const [searchText, setSearchText] = useState('');
    const [formType, setFormType] = useState('thu');
    const [formAmount, setFormAmount] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [formDate, setFormDate] = useState(getTodayVN());
    const [formNote, setFormNote] = useState('');

    const categories = {
      thu: ['Bán tại cửa hàng', 'Lắp đặt tại nhà khách', 'Thu nợ của khách', 'Khác'],
      chi: ['Nhập hàng', 'Lương nhân viên', 'Tiền thuê mặt bằng', 'Điện nước', 'Marketing', 'Vận chuyển', 'Khác']
    };

    // Permission check for receipts
    const financeLevel = getPermissionLevel('finance');
    const canViewAllReceipts = financeLevel >= 2; // Level 2+ xem tất cả
    
    // *** NEW: Lấy danh sách người tạo unique ***
    const creatorsList = canViewAllReceipts 
      ? [...new Set(receiptsPayments.map(r => r.created_by).filter(Boolean))].sort()
      : [];
    
    const filteredReceipts = receiptsPayments.filter(r => {
      // Level 1: chỉ xem phiếu mình tạo
      if (!canViewAllReceipts && r.created_by !== currentUser.name) return false;
      if (filterType !== 'all' && r.type !== filterType) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      // *** NEW: Filter theo người tạo ***
      if (filterCreator !== 'all' && r.created_by !== filterCreator) return false;
      if (searchText && !r.description?.toLowerCase().includes(searchText.toLowerCase()) && !r.receipt_number?.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });

    const generateReceiptNumber = (type) => {
      const prefix = type === 'thu' ? 'PT' : 'PC';
      const dateStr = getDateStrVN();
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return prefix + '-' + dateStr + '-' + random;
    };

    const resetForm = () => {
      setFormAmount('');
      setFormDescription('');
      setFormCategory('');
      setFormDate(getTodayVN());
      setFormNote('');
    };

    const openDetailModal = (receipt) => {
      setSelectedReceipt(receipt);
      setFormType(receipt.type);
      setFormAmount(receipt.amount.toString());
      setFormDescription(receipt.description || '');
      setFormCategory(receipt.category || '');
      setFormDate(receipt.receipt_date ? receipt.receipt_date.split('T')[0] : getTodayVN());
      setFormNote(receipt.note || '');
      setIsEditing(false);
      setShowDetailModal(true);
    };

    const handleCreateReceipt = async () => {
      if (!formAmount || !formDescription || !formCategory) {
        alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
        return;
      }
      const newReceipt = {
        tenant_id: tenant.id,
        receipt_number: generateReceiptNumber(formType),
        type: formType,
        amount: parseFloat(formAmount),
        description: formDescription,
        category: formCategory,
        receipt_date: formDate,
        note: formNote,
        status: 'pending',
        created_by: currentUser.name,
        created_at: getNowISOVN()
      };
      try {
        const { data, error } = await supabase.from('receipts_payments').insert([newReceipt]).select().single();
        if (error) throw error;
        
        // Thông báo cho Admin/Manager
        const admins = (allUsers || []).filter(u => 
          u.role === 'Admin' || u.role === 'admin' || u.role === 'Manager'
        );
        for (const admin of admins) {
          if (admin.id !== currentUser.id) {
            await createNotification({
              userId: admin.id,
              type: 'finance_pending',
              title: formType === 'thu' ? '💵 Phiếu thu chờ duyệt' : '💸 Phiếu chi chờ duyệt',
              message: `${currentUser.name} tạo phiếu ${formType}: ${formatMoney(parseFloat(formAmount))} - ${formDescription}`,
              icon: formType === 'thu' ? '💵' : '💸',
              referenceType: 'receipt',
              referenceId: data?.id || null,
              data: { amount: parseFloat(formAmount), type: formType }
            });
          }
        }
        
        alert('Tạo phiếu thành công!');
        setShowCreateModal(false);
        resetForm();
        loadFinanceData();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handleUpdateReceipt = async () => {
      if (!formAmount || !formDescription || !formCategory) {
        alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
        return;
      }
      try {
        const { error } = await supabase.from('receipts_payments').update({
          amount: parseFloat(formAmount),
          description: formDescription,
          category: formCategory,
          receipt_date: formDate,
          note: formNote
        }).eq('id', selectedReceipt.id);
        if (error) throw error;
        alert('Cập nhật thành công!');
        setIsEditing(false);
        setShowDetailModal(false);
        loadFinanceData();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handleApprove = async (id) => {
      try {
        const receipt = selectedReceipt || receiptsPayments.find(r => r.id === id);
        
        const { error } = await supabase.from('receipts_payments').update({ 
          status: 'approved',
          approved_by: currentUser.name,
          approved_at: getNowISOVN()
        }).eq('id', id);
        if (error) throw error;
        
        // Thông báo cho người tạo phiếu
        if (receipt) {
          const creator = allUsers.find(u => u.name === receipt.created_by);
          if (creator && creator.id !== currentUser.id) {
            await createNotification({
              userId: creator.id,
              type: 'finance_approved',
              title: '✅ Phiếu đã được duyệt',
              message: `Phiếu ${receipt.type} ${receipt.receipt_number}: ${formatMoney(receipt.amount)} đã được ${currentUser.name} duyệt`,
              icon: '✅',
              referenceType: 'receipt',
              referenceId: id
            });
          }
        }
        
        alert('Đã duyệt!');
        setShowDetailModal(false);
        loadFinanceData();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handleReject = async (id) => {
      try {
        const receipt = selectedReceipt || receiptsPayments.find(r => r.id === id);
        
        const { error } = await supabase.from('receipts_payments').update({ 
          status: 'rejected',
          approved_by: currentUser.name,
          approved_at: getNowISOVN()
        }).eq('id', id);
        if (error) throw error;
        
        // Thông báo cho người tạo phiếu
        if (receipt) {
          const creator = allUsers.find(u => u.name === receipt.created_by);
          if (creator && creator.id !== currentUser.id) {
            await createNotification({
              userId: creator.id,
              type: 'finance_rejected',
              title: '❌ Phiếu bị từ chối',
              message: `Phiếu ${receipt.type} ${receipt.receipt_number}: ${formatMoney(receipt.amount)} đã bị ${currentUser.name} từ chối`,
              icon: '❌',
              referenceType: 'receipt',
              referenceId: id
            });
          }
        }
        
        alert('Đã từ chối!');
        setShowDetailModal(false);
        loadFinanceData();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handleDelete = async (id) => {
      if (!window.confirm('Xóa phiếu này?')) return;
      try {
        const { error } = await supabase.from('receipts_payments').delete().eq('id', id);
        if (error) throw error;
        alert('Đã xóa!');
        setShowDetailModal(false);
        loadFinanceData();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    // Chỉ Admin hoặc Level 3 mới được duyệt
    const canApprove = currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.permissions?.finance || 0) >= 3;
    // Chỉ tính tổng những phiếu đã duyệt (approved)
    const totalThu = filteredReceipts.filter(r => r.type === 'thu' && r.status === 'approved').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    const totalChi = filteredReceipts.filter(r => r.type === 'chi' && r.status === 'approved').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    return (
      <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
          <h2 className="text-xl md:text-2xl font-bold">🧾 Phiếu Thu/Chi</h2>
          {canCreateFinance() && (
            <div className="flex gap-2">
              <button onClick={() => { setFormType('thu'); resetForm(); setShowCreateModal(true); }} className="px-3 md:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm">
                ➕ Thu
              </button>
              <button onClick={() => { setFormType('chi'); resetForm(); setShowCreateModal(true); }} className="px-3 md:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm">
                ➕ Chi
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 md:p-4">
            <div className="text-xs md:text-sm text-green-600 font-medium">Tổng Thu</div>
            <div className="text-lg md:text-2xl font-bold text-green-700">+{formatMoney(totalThu)}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 md:p-4">
            <div className="text-xs md:text-sm text-red-600 font-medium">Tổng Chi</div>
            <div className="text-lg md:text-2xl font-bold text-red-700">-{formatMoney(totalChi)}</div>
          </div>
          <div className={(totalThu - totalChi >= 0) ? "bg-blue-50 border border-blue-200 rounded-xl p-3 md:p-4" : "bg-orange-50 border border-orange-200 rounded-xl p-3 md:p-4"}>
            <div className={(totalThu - totalChi >= 0) ? "text-xs md:text-sm text-blue-600 font-medium" : "text-xs md:text-sm text-orange-600 font-medium"}>Chênh lệch</div>
            <div className={(totalThu - totalChi >= 0) ? "text-lg md:text-2xl font-bold text-blue-700" : "text-lg md:text-2xl font-bold text-orange-700"}>{formatMoney(totalThu - totalChi)}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-3 md:p-4">
          <div className="flex flex-wrap gap-2 md:gap-4">
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1">Loại</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-sm">
                <option value="all">Tất cả</option>
                <option value="thu">Phiếu Thu</option>
                <option value="chi">Phiếu Chi</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Trạng thái</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg">
                <option value="all">Tất cả</option>
                <option value="pending">Chờ duyệt</option>
                <option value="approved">Đã duyệt</option>
                <option value="rejected">Từ chối</option>
              </select>
            </div>
            {/* *** NEW: Filter theo người tạo - chỉ hiện khi có quyền xem tất cả *** */}
            {canViewAllReceipts && creatorsList.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">👤 Người tạo</label>
                <select value={filterCreator} onChange={(e) => setFilterCreator(e.target.value)} className="px-3 py-2 border rounded-lg">
                  <option value="all">Tất cả ({creatorsList.length} người)</option>
                  {creatorsList.map(creator => (
                    <option key={creator} value={creator}>{creator}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium mb-1">Tìm kiếm</label>
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Tìm theo mô tả..." className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b bg-green-50">
              <h3 className="font-bold text-green-700">💵 Phiếu Thu ({filteredReceipts.filter(r => r.type === 'thu').length})</h3>
            </div>
            {filteredReceipts.filter(r => r.type === 'thu').length === 0 ? (
              <div className="p-6 text-center text-gray-500">Chưa có phiếu thu</div>
            ) : (
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {filteredReceipts.filter(r => r.type === 'thu').sort((a, b) => new Date(b.created_at || b.receipt_date) - new Date(a.created_at || a.receipt_date)).map(receipt => (
                  <div key={receipt.id} onClick={() => openDetailModal(receipt)} className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-sm">{receipt.receipt_number}</span>
                          <span className={receipt.status === 'approved' ? "px-2 py-0.5 rounded text-xs bg-green-100 text-green-700" : receipt.status === 'rejected' ? "px-2 py-0.5 rounded text-xs bg-red-100 text-red-700" : "px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700"}>
                            {receipt.status === 'approved' ? '🔒 Đã duyệt' : receipt.status === 'rejected' ? '✗ Từ chối' : '⏳ Chờ duyệt'}
                          </span>
                        </div>
                        <div className="text-gray-700 text-sm truncate">{receipt.description}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          📅 {new Date(receipt.receipt_date).toLocaleDateString('vi-VN')}
                          {receipt.category && <span> • {receipt.category}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">+{parseFloat(receipt.amount).toLocaleString('vi-VN')}đ</div>
                        <div className="text-xs text-gray-500">{receipt.created_by}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b bg-red-50">
              <h3 className="font-bold text-red-700">💸 Phiếu Chi ({filteredReceipts.filter(r => r.type === 'chi').length})</h3>
            </div>
            {filteredReceipts.filter(r => r.type === 'chi').length === 0 ? (
              <div className="p-6 text-center text-gray-500">Chưa có phiếu chi</div>
            ) : (
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {filteredReceipts.filter(r => r.type === 'chi').sort((a, b) => new Date(b.created_at || b.receipt_date) - new Date(a.created_at || a.receipt_date)).map(receipt => (
                  <div key={receipt.id} onClick={() => openDetailModal(receipt)} className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-sm">{receipt.receipt_number}</span>
                          <span className={receipt.status === 'approved' ? "px-2 py-0.5 rounded text-xs bg-green-100 text-green-700" : receipt.status === 'rejected' ? "px-2 py-0.5 rounded text-xs bg-red-100 text-red-700" : "px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700"}>
                            {receipt.status === 'approved' ? '🔒 Đã duyệt' : receipt.status === 'rejected' ? '✗ Từ chối' : '⏳ Chờ duyệt'}
                          </span>
                        </div>
                        <div className="text-gray-700 text-sm truncate">{receipt.description}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          📅 {new Date(receipt.receipt_date).toLocaleDateString('vi-VN')}
                          {receipt.category && <span> • {receipt.category}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-red-600">-{parseFloat(receipt.amount).toLocaleString('vi-VN')}đ</div>
                        <div className="text-xs text-gray-500">{receipt.created_by}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className={formType === 'thu' ? "p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "p-6 border-b bg-gradient-to-r from-red-500 to-rose-600 text-white"}>
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">{formType === 'thu' ? '💵 Tạo Phiếu Thu' : '💸 Tạo Phiếu Chi'}</h2>
                  <button onClick={() => setShowCreateModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Loại phiếu</label>
                  <div className="flex gap-2">
                    <button onClick={() => { setFormType('thu'); setFormCategory(''); }} className={formType === 'thu' ? "flex-1 py-3 rounded-lg font-medium bg-green-600 text-white" : "flex-1 py-3 rounded-lg font-medium bg-gray-100"}>💵 Phiếu Thu</button>
                    <button onClick={() => { setFormType('chi'); setFormCategory(''); }} className={formType === 'chi' ? "flex-1 py-3 rounded-lg font-medium bg-red-600 text-white" : "flex-1 py-3 rounded-lg font-medium bg-gray-100"}>💸 Phiếu Chi</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Số tiền (VNĐ) *</label>
                  <input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="Nhập số tiền..." className="w-full px-4 py-3 border-2 rounded-lg text-lg" />
                  {formAmount && <div className="text-sm text-gray-500 mt-1">= {parseFloat(formAmount).toLocaleString('vi-VN')} VNĐ</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Danh mục *</label>
                  <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg">
                    <option value="">-- Chọn danh mục --</option>
                    {categories[formType].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Mô tả *</label>
                  <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="VD: Thu tiền lắp đặt dàn karaoke" className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Ngày</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Ghi chú</label>
                  <textarea value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Ghi chú thêm..." rows={2} className="w-full px-4 py-3 border-2 rounded-lg"></textarea>
                </div>
              </div>
              <div className="p-6 border-t bg-gray-50 flex gap-3">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
                <button onClick={handleCreateReceipt} className={formType === 'thu' ? "flex-1 px-6 py-3 text-white rounded-lg font-medium bg-green-600 hover:bg-green-700" : "flex-1 px-6 py-3 text-white rounded-lg font-medium bg-red-600 hover:bg-red-700"}>✅ Tạo Phiếu</button>
              </div>
            </div>
          </div>
        )}

        {showDetailModal && selectedReceipt && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className={selectedReceipt.type === 'thu' ? "p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "p-6 border-b bg-gradient-to-r from-red-500 to-rose-600 text-white"}>
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold">{selectedReceipt.type === 'thu' ? '💵 Phiếu Thu' : '💸 Phiếu Chi'}</h2>
                    <p className="text-white/80 mt-1">{selectedReceipt.receipt_number}</p>
                  </div>
                  <button onClick={() => { setShowDetailModal(false); setIsEditing(false); }} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
                </div>
              </div>
              
              {isEditing ? (
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Số tiền (VNĐ) *</label>
                    <input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg text-lg" />
                    {formAmount && <div className="text-sm text-gray-500 mt-1">= {parseFloat(formAmount).toLocaleString('vi-VN')} VNĐ</div>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Danh mục *</label>
                    <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg">
                      <option value="">-- Chọn danh mục --</option>
                      {categories[selectedReceipt.type].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Mô tả *</label>
                    <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Ngày</label>
                    <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Ghi chú</label>
                    <textarea value={formNote} onChange={(e) => setFormNote(e.target.value)} rows={2} className="w-full px-4 py-3 border-2 rounded-lg"></textarea>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button onClick={() => setIsEditing(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
                    <button onClick={handleUpdateReceipt} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">💾 Lưu</button>
                  </div>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Số tiền</span>
                    <span className={selectedReceipt.type === 'thu' ? "text-2xl font-bold text-green-600" : "text-2xl font-bold text-red-600"}>
                      {selectedReceipt.type === 'thu' ? '+' : '-'}{parseFloat(selectedReceipt.amount).toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Danh mục</div>
                      <div className="font-medium">{selectedReceipt.category || 'Chưa phân loại'}</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Ngày</div>
                      <div className="font-medium">{new Date(selectedReceipt.receipt_date).toLocaleDateString('vi-VN')}</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Trạng thái</div>
                      <div className={selectedReceipt.status === 'approved' ? "font-medium text-green-600" : selectedReceipt.status === 'rejected' ? "font-medium text-red-600" : "font-medium text-yellow-600"}>
                        {selectedReceipt.status === 'approved' ? '🔒 Đã duyệt' : selectedReceipt.status === 'rejected' ? '✗ Từ chối' : '⏳ Chờ duyệt'}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Người tạo</div>
                      <div className="font-medium">{selectedReceipt.created_by || 'N/A'}</div>
                      {selectedReceipt.created_at && <div className="text-xs text-gray-500 mt-1">Lúc: {new Date(selectedReceipt.created_at).toLocaleString('vi-VN')}</div>}
                    </div>
                  </div>
                  {selectedReceipt.approved_by && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="text-xs text-blue-600 mb-1">{selectedReceipt.status === 'approved' ? '✓ Người duyệt' : '✗ Người từ chối'}</div>
                      <div className="font-medium text-blue-800">{selectedReceipt.approved_by}</div>
                      {selectedReceipt.approved_at && <div className="text-xs text-blue-600 mt-1">Lúc: {new Date(selectedReceipt.approved_at).toLocaleString('vi-VN')}</div>}
                    </div>
                  )}
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Mô tả</div>
                    <div className="font-medium">{selectedReceipt.description}</div>
                  </div>
                  {selectedReceipt.note && (
                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="text-xs text-yellow-600 mb-1">Ghi chú</div>
                      <div className="text-yellow-800">{selectedReceipt.note}</div>
                    </div>
                  )}
                  {selectedReceipt.status === 'approved' && !(currentUser.role === 'Admin' || currentUser.role === 'admin') && (
                    <div className="p-3 bg-gray-100 rounded-lg text-center">
                      <span className="text-gray-500 text-sm">🔒 Phiếu đã duyệt - Không thể chỉnh sửa</span>
                    </div>
                  )}
                  <div className="space-y-3 pt-4">
                    {selectedReceipt.status === 'pending' && canApprove && (
                      <div className="flex gap-3">
                        <button onClick={() => handleApprove(selectedReceipt.id)} className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">✓ Duyệt</button>
                        <button onClick={() => handleReject(selectedReceipt.id)} className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium">✗ Từ chối</button>
                      </div>
                    )}
                    <div className="flex gap-3">
                      {selectedReceipt.status === 'pending' && canEditOwnFinance(selectedReceipt.created_by) && (
                        <button onClick={() => setIsEditing(true)} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">✏️ Sửa</button>
                      )}
                      <button onClick={() => setShowDetailModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
                      {/* Menu 3 chấm chứa nút Xóa */}
                      {((currentUser.role === 'Admin' || currentUser.role === 'admin') || (selectedReceipt.status === 'pending' && canEditOwnFinance(selectedReceipt.created_by))) && (
                        <div className="relative">
                          <button 
                            onClick={() => setShowMoreMenu(!showMoreMenu)} 
                            className="px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                          >
                            ⋮
                          </button>
                          {showMoreMenu && (
                            <div className="absolute bottom-full right-0 mb-2 bg-white border rounded-lg shadow-lg py-1 min-w-[120px] z-10">
                              <button 
                                onClick={() => {
                                  if (window.confirm('Bạn có chắc muốn xóa phiếu này?')) {
                                    handleDelete(selectedReceipt.id);
                                    setShowMoreMenu(false);
                                  }
                                }} 
                                className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2"
                              >
                                🗑️ Xóa phiếu
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  function DebtsView() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState(null);
    const [filterType, setFilterType] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchText, setSearchText] = useState('');
    
    const [formType, setFormType] = useState('receivable');
    const [formPartnerName, setFormPartnerName] = useState('');
    const [formPartnerPhone, setFormPartnerPhone] = useState('');
    const [formAmount, setFormAmount] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formDueDate, setFormDueDate] = useState('');
    const [formNote, setFormNote] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentNote, setPaymentNote] = useState('');

    // Permission check for debts
    const financeLevel = getPermissionLevel('finance');
    const canViewAllDebts = financeLevel >= 2; // Level 2+ xem tất cả
    
    const filteredDebts = debts.filter(d => {
      // Level 1: chỉ xem công nợ mình tạo
      if (!canViewAllDebts && d.created_by !== currentUser.name) return false;
      if (filterType !== 'all' && d.type !== filterType) return false;
      if (filterStatus === 'pending' && d.status === 'paid') return false;
      if (filterStatus === 'paid' && d.status !== 'paid') return false;
      if (filterStatus === 'overdue') {
        const isOverdue = d.due_date && new Date(d.due_date) < new Date() && d.status !== 'paid';
        if (!isOverdue) return false;
      }
      if (searchText && !d.partner_name?.toLowerCase().includes(searchText.toLowerCase()) && !d.debt_number?.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });

    const receivables = filteredDebts.filter(d => d.type === 'receivable');
    const payables = filteredDebts.filter(d => d.type === 'payable');
    
    const totalReceivable = receivables.reduce((sum, d) => sum + parseFloat(d.remaining_amount || 0), 0);
    const totalPayable = payables.reduce((sum, d) => sum + parseFloat(d.remaining_amount || 0), 0);

    const generateDebtNumber = (type) => {
      const prefix = type === 'receivable' ? 'PT' : 'PTR';
      const dateStr = getDateStrVN();
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return prefix + '-' + dateStr + '-' + random;
    };

    const resetForm = () => {
      setFormPartnerName('');
      setFormPartnerPhone('');
      setFormAmount('');
      setFormDescription('');
      setFormDueDate('');
      setFormNote('');
    };

    const isOverdue = (debt) => {
      return debt.due_date && new Date(debt.due_date) < new Date() && debt.status !== 'paid';
    };

    const handleCreateDebt = async () => {
      if (!formPartnerName || !formAmount || !formDescription) {
        alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
        return;
      }
      const newDebt = {
        tenant_id: tenant.id,
        debt_number: generateDebtNumber(formType),
        type: formType,
        partner_name: formPartnerName,
        partner_phone: formPartnerPhone,
        total_amount: parseFloat(formAmount),
        remaining_amount: parseFloat(formAmount),
        paid_amount: 0,
        description: formDescription,
        due_date: formDueDate || null,
        note: formNote,
        status: 'pending',
        created_by: currentUser.name,
        created_at: getNowISOVN(),
        payments: []
      };
      try {
        const { error } = await supabase.from('debts').insert([newDebt]);
        if (error) throw error;
        alert('Tạo công nợ thành công!');
        setShowCreateModal(false);
        resetForm();
        loadFinanceData();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handleAddPayment = async () => {
      if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
        alert('Vui lòng nhập số tiền thanh toán!');
        return;
      }
      const amount = parseFloat(paymentAmount);
      if (amount > parseFloat(selectedDebt.remaining_amount)) {
        alert('Số tiền thanh toán không được lớn hơn số tiền còn nợ!');
        return;
      }
      
      const newPaidAmount = parseFloat(selectedDebt.paid_amount || 0) + amount;
      const newRemainingAmount = parseFloat(selectedDebt.total_amount) - newPaidAmount;
      const newStatus = newRemainingAmount <= 0 ? 'paid' : 'pending';
      
      const newPayment = {
        amount: amount,
        date: getNowISOVN(),
        note: paymentNote,
        recorded_by: currentUser.name
      };
      const updatedPayments = [...(selectedDebt.payments || []), newPayment];

      try {
        // Cập nhật công nợ
        const { error } = await supabase.from('debts').update({
          paid_amount: newPaidAmount,
          remaining_amount: newRemainingAmount,
          status: newStatus,
          payments: updatedPayments
        }).eq('id', selectedDebt.id);
        if (error) throw error;

        // Tự động tạo phiếu thu/chi
        const receiptType = selectedDebt.type === 'receivable' ? 'thu' : 'chi';
        const receiptPrefix = receiptType === 'thu' ? 'PT' : 'PC';
        const dateStr = getNowISOVN().slice(0,10).replace(/-/g, '');
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const receiptNumber = receiptPrefix + '-' + dateStr + '-' + randomNum;

        const newReceipt = {
          tenant_id: tenant.id,
          receipt_number: receiptNumber,
          type: receiptType,
          amount: amount,
          description: (receiptType === 'thu' ? 'Thu nợ từ ' : 'Trả nợ cho ') + selectedDebt.partner_name,
          category: receiptType === 'thu' ? 'Thu nợ khách' : 'Trả nợ NCC',
          receipt_date: getTodayVN(),
          note: 'Thanh toán công nợ ' + selectedDebt.debt_number + (paymentNote ? ' - ' + paymentNote : ''),
          status: 'approved',
          created_by: currentUser.name,
          approved_by: currentUser.name,
          approved_at: getNowISOVN()
        };

        await supabase.from('receipts_payments').insert([newReceipt]);

        alert('Ghi nhận thanh toán thành công! Đã tạo phiếu ' + (receiptType === 'thu' ? 'thu' : 'chi') + ' tự động.');
        setShowPaymentModal(false);
        setShowDetailModal(false);
        setPaymentAmount('');
        setPaymentNote('');
        loadFinanceData();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handleDeleteDebt = async (id) => {
      if (!window.confirm('Xóa công nợ này?')) return;
      try {
        const { error } = await supabase.from('debts').delete().eq('id', id);
        if (error) throw error;
        alert('Đã xóa!');
        setShowDetailModal(false);
        loadFinanceData();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const openDetailModal = (debt) => {
      setSelectedDebt(debt);
      setShowDetailModal(true);
    };

    const canManage = currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'admin' || currentUser.role === 'Manager';

    return (
      <div className="p-6 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold">📋 Quản Lý Công Nợ</h2>
          {canCreateFinance() && (
            <div className="flex gap-2">
              <button onClick={() => { setFormType('receivable'); resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
                ➕ Phải Thu
              </button>
              <button onClick={() => { setFormType('payable'); resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
                ➕ Phải Trả
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-sm text-green-600 font-medium">Tổng Phải Thu</div>
            <div className="text-2xl font-bold text-green-700">+{formatMoney(totalReceivable)}</div>
            <div className="text-xs text-green-600 mt-1">{receivables.length} khoản</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-sm text-red-600 font-medium">Tổng Phải Trả</div>
            <div className="text-2xl font-bold text-red-700">-{formatMoney(totalPayable)}</div>
            <div className="text-xs text-red-600 mt-1">{payables.length} khoản</div>
          </div>
          <div className={(totalReceivable - totalPayable >= 0) ? "bg-blue-50 border border-blue-200 rounded-xl p-4" : "bg-orange-50 border border-orange-200 rounded-xl p-4"}>
            <div className={(totalReceivable - totalPayable >= 0) ? "text-sm text-blue-600 font-medium" : "text-sm text-orange-600 font-medium"}>Chênh lệch</div>
            <div className={(totalReceivable - totalPayable >= 0) ? "text-2xl font-bold text-blue-700" : "text-2xl font-bold text-orange-700"}>{formatMoney(totalReceivable - totalPayable)}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Loại</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 border rounded-lg">
                <option value="all">Tất cả</option>
                <option value="receivable">Phải Thu</option>
                <option value="payable">Phải Trả</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Trạng thái</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg">
                <option value="all">Tất cả</option>
                <option value="pending">Còn nợ</option>
                <option value="paid">Đã thanh toán</option>
                <option value="overdue">Quá hạn</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium mb-1">Tìm kiếm</label>
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Tìm theo tên, mã..." className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b bg-green-50">
              <h3 className="font-bold text-green-700">💵 Phải Thu ({receivables.length})</h3>
            </div>
            {receivables.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Không có công nợ phải thu</div>
            ) : (
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {receivables.map(debt => (
                  <div key={debt.id} onClick={() => openDetailModal(debt)} className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{debt.partner_name}</div>
                        <div className="text-sm text-gray-500">{debt.debt_number}</div>
                        {debt.due_date && (
                          <div className={isOverdue(debt) ? "text-xs text-red-600 mt-1" : "text-xs text-gray-500 mt-1"}>
                            {isOverdue(debt) ? '⚠️ Quá hạn: ' : '📅 Hạn: '}{new Date(debt.due_date).toLocaleDateString('vi-VN')}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">{parseFloat(debt.remaining_amount).toLocaleString('vi-VN')}đ</div>
                        {debt.status === 'paid' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Đã TT</span>}
                        {isOverdue(debt) && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Quá hạn</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b bg-red-50">
              <h3 className="font-bold text-red-700">💳 Phải Trả ({payables.length})</h3>
            </div>
            {payables.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Không có công nợ phải trả</div>
            ) : (
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {payables.map(debt => (
                  <div key={debt.id} onClick={() => openDetailModal(debt)} className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{debt.partner_name}</div>
                        <div className="text-sm text-gray-500">{debt.debt_number}</div>
                        {debt.due_date && (
                          <div className={isOverdue(debt) ? "text-xs text-red-600 mt-1" : "text-xs text-gray-500 mt-1"}>
                            {isOverdue(debt) ? '⚠️ Quá hạn: ' : '📅 Hạn: '}{new Date(debt.due_date).toLocaleDateString('vi-VN')}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-red-600">{parseFloat(debt.remaining_amount).toLocaleString('vi-VN')}đ</div>
                        {debt.status === 'paid' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Đã TT</span>}
                        {isOverdue(debt) && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Quá hạn</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className={formType === 'receivable' ? "p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "p-6 border-b bg-gradient-to-r from-red-500 to-rose-600 text-white"}>
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">{formType === 'receivable' ? '💵 Tạo Công Nợ Phải Thu' : '💳 Tạo Công Nợ Phải Trả'}</h2>
                  <button onClick={() => setShowCreateModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Loại công nợ</label>
                  <div className="flex gap-2">
                    <button onClick={() => setFormType('receivable')} className={formType === 'receivable' ? "flex-1 py-3 rounded-lg font-medium bg-green-600 text-white" : "flex-1 py-3 rounded-lg font-medium bg-gray-100"}>💵 Phải Thu</button>
                    <button onClick={() => setFormType('payable')} className={formType === 'payable' ? "flex-1 py-3 rounded-lg font-medium bg-red-600 text-white" : "flex-1 py-3 rounded-lg font-medium bg-gray-100"}>💳 Phải Trả</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{formType === 'receivable' ? 'Tên khách hàng *' : 'Tên nhà cung cấp *'}</label>
                  <input type="text" value={formPartnerName} onChange={(e) => setFormPartnerName(e.target.value)} placeholder="Nhập tên..." className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Số điện thoại</label>
                  <input type="text" value={formPartnerPhone} onChange={(e) => setFormPartnerPhone(e.target.value)} placeholder="Nhập SĐT..." className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Số tiền nợ (VNĐ) *</label>
                  <input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="Nhập số tiền..." className="w-full px-4 py-3 border-2 rounded-lg text-lg" />
                  {formAmount && <div className="text-sm text-gray-500 mt-1">= {parseFloat(formAmount).toLocaleString('vi-VN')} VNĐ</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Mô tả *</label>
                  <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="VD: Nợ tiền mua hàng đợt 1" className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Hạn thanh toán</label>
                  <input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Ghi chú</label>
                  <textarea value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Ghi chú thêm..." rows={2} className="w-full px-4 py-3 border-2 rounded-lg"></textarea>
                </div>
              </div>
              <div className="p-6 border-t bg-gray-50 flex gap-3">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
                <button onClick={handleCreateDebt} className={formType === 'receivable' ? "flex-1 px-6 py-3 text-white rounded-lg font-medium bg-green-600 hover:bg-green-700" : "flex-1 px-6 py-3 text-white rounded-lg font-medium bg-red-600 hover:bg-red-700"}>✅ Tạo Công Nợ</button>
              </div>
            </div>
          </div>
        )}

        {showDetailModal && selectedDebt && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className={selectedDebt.type === 'receivable' ? "p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "p-6 border-b bg-gradient-to-r from-red-500 to-rose-600 text-white"}>
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold">{selectedDebt.type === 'receivable' ? '💵 Phải Thu' : '💳 Phải Trả'}</h2>
                    <p className="text-white/80 mt-1">{selectedDebt.debt_number}</p>
                  </div>
                  <button onClick={() => setShowDetailModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Còn nợ</span>
                  <span className={selectedDebt.type === 'receivable' ? "text-2xl font-bold text-green-600" : "text-2xl font-bold text-red-600"}>
                    {parseFloat(selectedDebt.remaining_amount).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">{selectedDebt.type === 'receivable' ? 'Khách hàng' : 'Nhà cung cấp'}</div>
                    <div className="font-medium">{selectedDebt.partner_name}</div>
                    {selectedDebt.partner_phone && <div className="text-sm text-gray-500">{selectedDebt.partner_phone}</div>}
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Tổng nợ ban đầu</div>
                    <div className="font-medium">{parseFloat(selectedDebt.total_amount).toLocaleString('vi-VN')}đ</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Đã thanh toán</div>
                    <div className="font-medium text-blue-600">{parseFloat(selectedDebt.paid_amount || 0).toLocaleString('vi-VN')}đ</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Trạng thái</div>
                    <div className={selectedDebt.status === 'paid' ? "font-medium text-green-600" : isOverdue(selectedDebt) ? "font-medium text-red-600" : "font-medium text-yellow-600"}>
                      {selectedDebt.status === 'paid' ? '✅ Đã thanh toán' : isOverdue(selectedDebt) ? '⚠️ Quá hạn' : '⏳ Còn nợ'}
                    </div>
                  </div>
                </div>
                {selectedDebt.due_date && (
                  <div className={isOverdue(selectedDebt) ? "p-3 bg-red-50 rounded-lg border border-red-200" : "p-3 bg-gray-50 rounded-lg"}>
                    <div className={isOverdue(selectedDebt) ? "text-xs text-red-600 mb-1" : "text-xs text-gray-500 mb-1"}>Hạn thanh toán</div>
                    <div className={isOverdue(selectedDebt) ? "font-medium text-red-700" : "font-medium"}>{new Date(selectedDebt.due_date).toLocaleDateString('vi-VN')}</div>
                  </div>
                )}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Mô tả</div>
                  <div className="font-medium">{selectedDebt.description}</div>
                </div>
                {selectedDebt.note && (
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="text-xs text-yellow-600 mb-1">Ghi chú</div>
                    <div className="text-yellow-800">{selectedDebt.note}</div>
                  </div>
                )}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Người tạo</div>
                  <div className="font-medium">{selectedDebt.created_by || 'N/A'}</div>
                  {selectedDebt.created_at && <div className="text-xs text-gray-500 mt-1">Lúc: {new Date(selectedDebt.created_at).toLocaleString('vi-VN')}</div>}
                </div>
                {selectedDebt.payments && selectedDebt.payments.length > 0 && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-xs text-blue-600 mb-2">Lịch sử thanh toán</div>
                    <div className="space-y-2">
                      {selectedDebt.payments.map((p, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm border-b border-blue-100 pb-2 last:border-0 last:pb-0">
                          <div>
                            <div className="text-gray-600">{new Date(p.date).toLocaleDateString('vi-VN')}</div>
                            {p.recorded_by && <div className="text-xs text-gray-500">bởi {p.recorded_by}</div>}
                          </div>
                          <span className="font-medium text-blue-700">+{parseFloat(p.amount).toLocaleString('vi-VN')}đ</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-3 pt-4">
                  {selectedDebt.status !== 'paid' && canCreateFinance() && (
                    <button onClick={() => setShowPaymentModal(true)} className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">💵 Ghi nhận thanh toán</button>
                  )}
                  <div className="flex gap-3">
                    {canEditOwnFinance(selectedDebt.created_by) && selectedDebt.status !== 'paid' && (
                      <button onClick={() => handleDeleteDebt(selectedDebt.id)} className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">🗑️ Xóa</button>
                    )}
                    <button onClick={() => setShowDetailModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showPaymentModal && selectedDebt && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full">
              <div className="p-6 border-b bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">💵 Ghi nhận thanh toán</h2>
                  <button onClick={() => setShowPaymentModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Còn nợ</div>
                  <div className="text-xl font-bold text-red-600">{parseFloat(selectedDebt.remaining_amount).toLocaleString('vi-VN')}đ</div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Số tiền thanh toán (VNĐ) *</label>
                  <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Nhập số tiền..." className="w-full px-4 py-3 border-2 rounded-lg text-lg" max={selectedDebt.remaining_amount} />
                  {paymentAmount && <div className="text-sm text-gray-500 mt-1">= {parseFloat(paymentAmount).toLocaleString('vi-VN')} VNĐ</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Ghi chú</label>
                  <input type="text" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="VD: Thanh toán đợt 1" className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
              </div>
              <div className="p-6 border-t bg-gray-50 flex gap-3">
                <button onClick={() => setShowPaymentModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
                <button onClick={handleAddPayment} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">✅ Xác nhận</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // 💰 SALARY MANAGEMENT COMPONENT
  // Tích hợp trực tiếp - không cần import
  // ============================================

  // ============ SALARY MANAGEMENT - MULTI DEPARTMENT v85 ============

  // ============ END SALARY MANAGEMENT ============

  // ============ ATTENDANCE MODULE (CHẤM CÔNG) ============
  function AttendanceView() {
    const [filterMonth, setFilterMonth] = useState(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [viewMode, setViewMode] = useState('my'); // 'my' or 'all'
    const [allAttendances, setAllAttendances] = useState([]);
    const [loading, setLoading] = useState(true);

    const isAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'admin';

    // Load attendance data
    useEffect(() => {
      const loadData = async () => {
        if (!tenant || !currentUser) return;
        setLoading(true);
        try {
          let query = supabase
            .from('attendances')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('date', { ascending: false })
            .order('check_in', { ascending: true });
          
          if (!isAdmin) {
            query = query.eq('user_id', currentUser.id);
          }
          
          const { data, error } = await query.limit(500);
          if (error) throw error;
          setAllAttendances(data || []);
        } catch (err) {
          console.error('Error loading attendances:', err);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }, [tenant, currentUser, isAdmin]);

    // Filter attendances theo tháng
    const filteredAttendances = allAttendances.filter(a => {
      if (filterMonth && a.date) {
        if (!a.date.startsWith(filterMonth)) return false;
      }
      if (viewMode === 'my') {
        return a.user_id === currentUser?.id;
      }
      return true;
    });

    // Tính tổng giờ làm trong tháng (của user hiện tại)
    const myAttendances = filteredAttendances.filter(a => a.user_id === currentUser?.id);
    const totalHours = myAttendances.reduce((sum, a) => sum + parseFloat(a.work_hours || 0), 0);
    const totalShifts = myAttendances.filter(a => a.check_in).length;
    
    // Đếm số ngày (unique dates)
    const uniqueDates = [...new Set(myAttendances.map(a => a.date))];
    const totalDays = uniqueDates.length;

    // Nhóm theo user (cho Admin)
    const groupedByUser = {};
    if (isAdmin && viewMode === 'all') {
      filteredAttendances.forEach(a => {
        if (!groupedByUser[a.user_name]) {
          groupedByUser[a.user_name] = { shifts: 0, hours: 0, dates: new Set() };
        }
        groupedByUser[a.user_name].shifts++;
        groupedByUser[a.user_name].hours += parseFloat(a.work_hours || 0);
        groupedByUser[a.user_name].dates.add(a.date);
      });
    }

    if (loading) {
      return (
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-2">⏳</div>
            <div>Đang tải dữ liệu...</div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">⏰ Chấm Công</h2>
            <p className="text-gray-600 text-sm">Lịch sử và thống kê chấm công</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <button
                  onClick={() => setViewMode('my')}
                  className={`px-4 py-2 rounded-lg font-medium ${viewMode === 'my' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                >
                  📋 Của tôi
                </button>
                <button
                  onClick={() => setViewMode('all')}
                  className={`px-4 py-2 rounded-lg font-medium ${viewMode === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                >
                  👥 Tất cả
                </button>
              </>
            )}
            <button
              onClick={() => setShowAttendancePopup(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              ⏰ Chấm công ngay
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <div className="text-gray-500 text-sm">📅 Số ngày công</div>
            <div className="text-2xl font-bold text-blue-600">{totalDays} ngày</div>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <div className="text-gray-500 text-sm">🔄 Số ca làm</div>
            <div className="text-2xl font-bold text-purple-600">{totalShifts} ca</div>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <div className="text-gray-500 text-sm">⏱️ Tổng giờ làm</div>
            <div className="text-2xl font-bold text-green-600">{totalHours.toFixed(1)} giờ</div>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <div className="text-gray-500 text-sm">📊 TB giờ/ngày</div>
            <div className="text-2xl font-bold text-orange-600">
              {totalDays > 0 ? (totalHours / totalDays).toFixed(1) : 0} giờ
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <div className="flex items-center gap-4">
            <label className="font-medium">📅 Tháng:</label>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="px-4 py-2 border rounded-lg"
            />
          </div>
        </div>

        {/* Admin View - Summary by User */}
        {isAdmin && viewMode === 'all' && Object.keys(groupedByUser).length > 0 && (
          <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-bold">👥 Tổng hợp theo nhân viên - Tháng {filterMonth}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">Nhân viên</th>
                    <th className="px-4 py-3 text-center">Số ngày</th>
                    <th className="px-4 py-3 text-center">Số ca</th>
                    <th className="px-4 py-3 text-center">Tổng giờ</th>
                    <th className="px-4 py-3 text-center">TB/ngày</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(groupedByUser)
                    .sort((a, b) => b[1].hours - a[1].hours)
                    .map(([userName, data]) => (
                    <tr key={userName} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{userName}</td>
                      <td className="px-4 py-3 text-center">{data.dates.size}</td>
                      <td className="px-4 py-3 text-center">{data.shifts}</td>
                      <td className="px-4 py-3 text-center font-medium text-green-600">{data.hours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-center">
                        {data.dates.size > 0 ? (data.hours / data.dates.size).toFixed(1) : 0}h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* History Table */}
        <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-bold">📋 Chi tiết chấm công {viewMode === 'my' ? 'của tôi' : ''}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {viewMode === 'all' && <th className="px-4 py-3 text-left">Nhân viên</th>}
                  <th className="px-4 py-3 text-left">Ngày</th>
                  <th className="px-4 py-3 text-center">Check-in</th>
                  <th className="px-4 py-3 text-center">Check-out</th>
                  <th className="px-4 py-3 text-center">Số giờ</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAttendances.length === 0 ? (
                  <tr>
                    <td colSpan={viewMode === 'all' ? 6 : 5} className="px-6 py-12 text-center text-gray-500">
                      <div className="text-4xl mb-2">📭</div>
                      <div>Chưa có dữ liệu chấm công trong tháng này</div>
                    </td>
                  </tr>
                ) : (
                  filteredAttendances.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      {viewMode === 'all' && <td className="px-4 py-3 font-medium">{a.user_name}</td>}
                      <td className="px-4 py-3">
                        {new Date(a.date).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-green-600 font-medium">{a.check_in?.slice(0,5) || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-red-600 font-medium">{a.check_out?.slice(0,5) || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        {a.work_hours ? `${a.work_hours}h` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {a.check_out ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Hoàn thành</span>
                        ) : a.check_in ? (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">Đang làm</span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
  // ============ END ATTENDANCE MODULE ============

  function SalariesView() {
    return (
      <SalaryManagement
        tenant={tenant}
        currentUser={currentUser}
        allUsers={allUsers}
        tasks={tasks}
        technicalJobs={technicalJobs}
        formatMoney={formatMoney}
        getTodayVN={getTodayVN}
        getVietnamDate={getVietnamDate}
        supabase={supabase}
      />
    );
  }

  function ReportsView() {
    const totalRevenue = receiptsPayments
      .filter(r => r.type === 'thu' && r.status === 'approved')
      .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    
    const totalExpenses = receiptsPayments
      .filter(r => r.type === 'chi' && r.status === 'approved')
      .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    
    const profit = totalRevenue - totalExpenses;

    return (
      <div className="p-6 space-y-4">
        <h2 className="text-2xl font-bold">📈 Báo Cáo Tài Chính</h2>
        
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-bold text-lg mb-4">Báo Cáo Lãi/Lỗ (P&L)</h3>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
              <span className="font-medium">Doanh Thu</span>
              <span className="font-bold text-green-600 text-xl">
                {(totalRevenue / 1000000).toFixed(1)}M
              </span>
            </div>
            
            <div className="flex justify-between items-center p-4 bg-red-50 rounded-lg">
              <span className="font-medium">Chi Phí</span>
              <span className="font-bold text-red-600 text-xl">
                {(totalExpenses / 1000000).toFixed(1)}M
              </span>
            </div>
            
            <div className={`flex justify-between items-center p-4 rounded-lg ${profit >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
              <span className="font-medium">Lợi Nhuận</span>
              <span className={`font-bold text-xl ${profit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                {(profit / 1000000).toFixed(1)}M
              </span>
            </div>
            
            <div className="flex justify-between items-center p-4 bg-purple-50 rounded-lg">
              <span className="font-medium">Tỷ Suất Lợi Nhuận</span>
              <span className="font-bold text-purple-600 text-xl">
                {totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function PermissionsModal() {
    const [selectedUser, setSelectedUser] = useState(null);
    const [saving, setSaving] = useState(false);

    const departments = [
      { id: 'media', name: '🎬 Media', desc: 'Sản xuất video, hình ảnh, nội dung' },
      { id: 'warehouse', name: '📦 Kho', desc: 'Quản lý hàng hóa, xuất nhập kho' },
      { id: 'sales', name: '🛒 Sale', desc: 'Bán hàng, chăm sóc khách hàng' },
      { id: 'technical', name: '🔧 Kỹ thuật', desc: 'Lắp đặt, sửa chữa, bảo trì' },
      { id: 'finance', name: '💰 Tài chính', desc: 'Thu chi, công nợ, lương' }
    ];

    // Định nghĩa các tabs trong từng module
    const moduleTabs = {
      media: [
        { id: 'videos', name: '📹 Quản lý Video', desc: 'Danh sách video, task' },
        { id: 'calendar', name: '📅 Lịch', desc: 'Lịch deadline' },
        { id: 'report', name: '📊 Báo cáo', desc: 'Thống kê, báo cáo' }
      ],
      warehouse: [
        { id: 'products', name: '📦 Sản phẩm', desc: 'Danh sách sản phẩm' },
        { id: 'import', name: '📥 Nhập kho', desc: 'Phiếu nhập hàng' },
        { id: 'export', name: '📤 Xuất kho', desc: 'Phiếu xuất hàng' },
        { id: 'inventory', name: '📋 Tồn kho', desc: 'Báo cáo tồn kho' }
      ],
      finance: [
        { id: 'overview', name: '📊 Tổng quan', desc: 'Dashboard tài chính' },
        { id: 'receipts', name: '🧾 Thu/Chi', desc: 'Phiếu thu, phiếu chi' },
        { id: 'debts', name: '📋 Công nợ', desc: 'Quản lý công nợ' },
        { id: 'attendance', name: '⏰ Chấm công', desc: 'Check-in/out GPS' },
        { id: 'salaries', name: '💰 Lương', desc: 'Tính lương nhân viên' },
        { id: 'reports', name: '📈 Báo cáo', desc: 'Báo cáo tài chính' }
      ],
      technical: [
        { id: 'jobs', name: '🔧 Công việc', desc: 'Danh sách lắp đặt/sửa chữa' }
      ],
      sale: [
        { id: 'orders', name: '🛒 Đơn hàng', desc: 'Quản lý đơn hàng' }
      ]
    };

    const permissionLevels = [
      { value: 0, label: 'Không có quyền', desc: 'Ẩn hoàn toàn module', color: 'gray' },
      { value: 1, label: 'Xem của mình', desc: 'Xem dữ liệu mình tạo/được gán', color: 'yellow' },
      { value: 2, label: 'Xem tất cả', desc: 'Tạo + Sửa của mình + Xem tất cả', color: 'blue' },
      { value: 3, label: 'Toàn quyền', desc: 'Xem + Tạo + Sửa + Xóa (như Admin)', color: 'green' }
    ];

    const getRoleBadge = (role) => {
      if (role === 'Admin' || role === 'admin') return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">Admin</span>;
      if (role === 'Manager') return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Manager</span>;
      return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">Member</span>;
    };

    const getUserDepartments = (user) => {
      if (user.role === 'Admin' || user.role === 'admin') return 'Tất cả (Toàn quyền)';
      const perms = user.permissions || {};
      const depts = departments.filter(d => perms[d.id] && perms[d.id] > 0);
      if (depts.length === 0) return <span className="text-gray-400">Chưa phân quyền</span>;
      return depts.map(d => {
        const level = perms[d.id];
        const icon = d.name.split(' ')[0];
        const levelLabel = level === 1 ? '①' : level === 2 ? '②' : '③';
        return `${icon}${levelLabel}`;
      }).join(' ');
    };

    // User Detail Modal - CHỈ LƯU KHI NHẤN NÚT LƯU
    const UserPermissionDetail = ({ user, onClose }) => {
      const [localPerms, setLocalPerms] = useState(user.permissions || {});
      const [localTabs, setLocalTabs] = useState(user.allowed_tabs || {});
      const [hasChanges, setHasChanges] = useState(false);
      const [expandedDept, setExpandedDept] = useState(null);
      const isAdmin = user.role === 'Admin' || user.role === 'admin';

      const handleToggleDept = (deptId) => {
        if (isAdmin) return;
        const current = localPerms[deptId] || 0;
        if (current > 0) {
          // Tắt department -> xóa tabs
          setLocalPerms(prev => ({ ...prev, [deptId]: 0 }));
          setLocalTabs(prev => ({ ...prev, [deptId]: [] }));
        } else {
          // Bật department -> cho tất cả tabs
          setLocalPerms(prev => ({ ...prev, [deptId]: 1 }));
          const allTabs = (moduleTabs[deptId] || []).map(t => t.id);
          setLocalTabs(prev => ({ ...prev, [deptId]: allTabs }));
        }
        setHasChanges(true);
      };

      const handleLevelChange = (deptId, level) => {
        if (isAdmin) return;
        setLocalPerms(prev => ({ ...prev, [deptId]: level }));
        setHasChanges(true);
      };

      const handleToggleTab = (deptId, tabId) => {
        if (isAdmin) return;
        const currentTabs = localTabs[deptId] || [];
        const allDeptTabs = (moduleTabs[deptId] || []).map(t => t.id);
        
        if (currentTabs.includes(tabId)) {
          // Bỏ tab này
          const newTabs = currentTabs.filter(t => t !== tabId);
          setLocalTabs(prev => ({ ...prev, [deptId]: newTabs }));
        } else {
          // Thêm tab này
          setLocalTabs(prev => ({ ...prev, [deptId]: [...currentTabs, tabId] }));
        }
        setHasChanges(true);
      };

      const handleSelectAllTabs = (deptId) => {
        if (isAdmin) return;
        const allTabs = (moduleTabs[deptId] || []).map(t => t.id);
        const currentTabs = localTabs[deptId] || [];
        const allSelected = allTabs.every(t => currentTabs.includes(t));
        
        if (allSelected) {
          setLocalTabs(prev => ({ ...prev, [deptId]: [] }));
        } else {
          setLocalTabs(prev => ({ ...prev, [deptId]: allTabs }));
        }
        setHasChanges(true);
      };

      const selectAllDepts = () => {
        if (isAdmin) return;
        const allEnabled = departments.every(d => localPerms[d.id] > 0);
        const newPerms = {};
        const newTabs = {};
        departments.forEach(d => { 
          newPerms[d.id] = allEnabled ? 0 : 1;
          newTabs[d.id] = allEnabled ? [] : (moduleTabs[d.id] || []).map(t => t.id);
        });
        setLocalPerms(newPerms);
        setLocalTabs(newTabs);
        setHasChanges(true);
      };

      const handleSave = async () => {
        try {
          setSaving(true);
          const { error } = await supabase
            .from('users')
            .update({ 
              permissions: localPerms,
              allowed_tabs: localTabs 
            })
            .eq('id', user.id);
          if (error) throw error;
          await loadUsers();
          setHasChanges(false);
          alert('✅ Đã lưu phân quyền thành công!');
          onClose();
        } catch (error) {
          alert('❌ Lỗi: ' + error.message);
        } finally {
          setSaving(false);
        }
      };

      const handleCancel = () => {
        if (hasChanges) {
          if (!window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn hủy?')) return;
        }
        onClose();
      };

      const getLevelColor = (level) => {
        if (level === 0) return 'bg-gray-100 text-gray-500 border-gray-200';
        if (level === 1) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
        if (level === 2) return 'bg-blue-100 text-blue-700 border-blue-300';
        return 'bg-green-100 text-green-700 border-green-300';
      };

      return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">🔐 Phân quyền: {user.name}</h2>
                  <p className="text-white/80 text-sm mt-1">{user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {getRoleBadge(user.role)}
                  <button onClick={handleCancel} className="text-2xl hover:bg-white/20 w-10 h-10 rounded-lg flex items-center justify-center ml-2">×</button>
                </div>
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {isAdmin ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                  <div className="text-5xl mb-3">👑</div>
                  <div className="font-bold text-red-800 text-lg">Admin có toàn quyền</div>
                  <div className="text-sm text-red-600 mt-1">Không thể thay đổi quyền Admin</div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center bg-gray-50 rounded-lg p-3">
                    <span className="text-sm font-medium text-gray-700">Chọn bộ phận và cấp quyền:</span>
                    <button onClick={selectAllDepts} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                      {departments.every(d => localPerms[d.id] > 0) ? '❌ Bỏ chọn tất cả' : '✅ Chọn tất cả'}
                    </button>
                  </div>

                  {departments.map(dept => {
                    const level = localPerms[dept.id] || 0;
                    const isEnabled = level > 0;
                    const deptTabs = moduleTabs[dept.id] || [];
                    const enabledTabs = localTabs[dept.id] || [];
                    const isExpanded = expandedDept === dept.id;

                    return (
                      <div key={dept.id} className={`border-2 rounded-xl overflow-hidden transition-all ${isEnabled ? 'border-blue-400 shadow-sm' : 'border-gray-200'}`}>
                        <div 
                          className={`p-4 flex items-center justify-between cursor-pointer ${isEnabled ? 'bg-blue-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                          onClick={() => handleToggleDept(dept.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${isEnabled ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                              {isEnabled && <span className="text-white text-sm">✓</span>}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-800">{dept.name}</div>
                              <div className="text-xs text-gray-500">{dept.desc}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isEnabled && (
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${getLevelColor(level)}`}>
                                {permissionLevels.find(p => p.value === level)?.label}
                              </span>
                            )}
                            {isEnabled && deptTabs.length > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedDept(isExpanded ? null : dept.id); }}
                                className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                              >
                                {isExpanded ? '▲' : '▼'} Chi tiết
                              </button>
                            )}
                          </div>
                        </div>

                        {isEnabled && (
                          <div className="px-4 pb-4 pt-3 bg-white border-t space-y-4">
                            {/* Chọn cấp quyền */}
                            <div>
                              <div className="text-xs text-gray-500 mb-2 font-medium">⚡ Chọn cấp quyền:</div>
                              <div className="grid grid-cols-3 gap-2">
                                {permissionLevels.filter(p => p.value > 0).map(p => (
                                  <button 
                                    key={p.value}
                                    onClick={(e) => { e.stopPropagation(); handleLevelChange(dept.id, p.value); }}
                                    className={`p-2 rounded-lg border-2 text-left transition-all ${
                                      level === p.value 
                                        ? getLevelColor(p.value) + ' border-2 shadow-sm' 
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${level === p.value ? 'border-current bg-current' : 'border-gray-300'}`}>
                                        {level === p.value && <span className="text-white text-xs">•</span>}
                                      </div>
                                      <span className="font-bold text-xs">{p.label}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 ml-5 mt-0.5">{p.desc}</div>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Chọn tabs chi tiết */}
                            {deptTabs.length > 0 && isExpanded && (
                              <div className="border-t pt-3">
                                <div className="flex justify-between items-center mb-2">
                                  <div className="text-xs text-gray-500 font-medium">📑 Chọn mục được xem:</div>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleSelectAllTabs(dept.id); }}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                  >
                                    {deptTabs.every(t => enabledTabs.includes(t.id)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {deptTabs.map(tab => {
                                    const isTabEnabled = enabledTabs.includes(tab.id);
                                    return (
                                      <button
                                        key={tab.id}
                                        onClick={(e) => { e.stopPropagation(); handleToggleTab(dept.id, tab.id); }}
                                        className={`p-2 rounded-lg border-2 text-left transition-all ${
                                          isTabEnabled 
                                            ? 'bg-green-50 border-green-400 text-green-700' 
                                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center text-xs ${
                                            isTabEnabled ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 bg-white'
                                          }`}>
                                            {isTabEnabled && '✓'}
                                          </div>
                                          <span className="font-medium text-sm">{tab.name}</span>
                                        </div>
                                        <div className="text-xs text-gray-400 ml-6">{tab.desc}</div>
                                      </button>
                                    );
                                  })}
                                </div>
                                {enabledTabs.length === 0 && (
                                  <div className="text-xs text-orange-500 mt-2">⚠️ Chưa chọn mục nào - User sẽ không thấy nội dung</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
              <div>
                {hasChanges && <span className="text-orange-600 text-sm font-medium">⚠️ Có thay đổi chưa lưu</span>}
              </div>
              <div className="flex gap-3">
                <button onClick={handleCancel} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100">
                  Hủy
                </button>
                {!isAdmin && (
                  <button 
                    onClick={handleSave} 
                    disabled={saving || !hasChanges}
                    className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 ${
                      hasChanges 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {saving ? '💾 Đang lưu...' : '💾 Lưu thay đổi'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-6 border-b bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">🔐 Quản Lý Phân Quyền</h2>
              <p className="text-white/80 text-sm">Nhấn "Phân quyền" để cài đặt chi tiết cho từng user</p>
            </div>
            <button onClick={() => setShowPermissionsModal(false)} className="text-2xl hover:bg-white/20 w-10 h-10 rounded-lg flex items-center justify-center">×</button>
          </div>
          
          <div className="p-6 overflow-y-auto flex-1">
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Người dùng</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Quyền hiện tại</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700 w-40">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allUsers.map(user => {
                    const isAdmin = user.role === 'Admin' || user.role === 'admin';
                    return (
                      <tr key={user.id} className={isAdmin ? 'bg-red-50/30' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-4">
                          <div className="font-medium">{user.name}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </td>
                        <td className="px-4 py-4">{getRoleBadge(user.role)}</td>
                        <td className="px-4 py-4">
                          <div className="text-sm">{getUserDepartments(user)}</div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button 
                            onClick={() => setSelectedUser(user)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium ${
                              isAdmin 
                                ? 'bg-gray-100 text-gray-500 cursor-default'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            {isAdmin ? '👑 Admin' : '⚙️ Phân quyền'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h3 className="font-medium text-blue-800 mb-3">📌 Chú thích cấp quyền:</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-bold">0</span>
                  <span>Không có quyền</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center text-white text-xs font-bold">①</span>
                  <span>Xem của mình</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs font-bold">②</span>
                  <span>Xem tất cả</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold">③</span>
                  <span>Toàn quyền</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t bg-gray-50 flex justify-end">
            <button onClick={() => setShowPermissionsModal(false)} className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium">
              Đóng
            </button>
          </div>
        </div>

        {selectedUser && (
          <UserPermissionDetail user={selectedUser} onClose={() => setSelectedUser(null)} />
        )}
      </div>
    );
  }
}

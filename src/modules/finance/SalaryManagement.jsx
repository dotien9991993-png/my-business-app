import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { getVietnamDate } from '../../utils/dateUtils';
import { isAdmin as checkIsAdmin } from '../../utils/permissionUtils';

function SalaryManagement({ tenant, currentUser, allUsers, tasks, technicalJobs, loadFinanceData }) {
  const isAdmin = checkIsAdmin(currentUser);
  const getCurrentMonth = () => {
    const vn = getVietnamDate();
    return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}`;
  };

  const [salaries, setSalaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [filterStatus, setFilterStatus] = useState('all');
  const [calculating, setCalculating] = useState(false);
  const [selectedSalary, setSelectedSalary] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [taskListModal, setTaskListModal] = useState(null);
  const [saving, setSaving] = useState(false);

  // New states for upgrades
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'history'
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ---- Load salaries for selected month ----
  const loadSalaries = useCallback(async () => {
    if (!tenant) return;
    try {
      let query = supabase.from('salaries').select('*')
        .eq('tenant_id', tenant.id).eq('month', selectedMonth)
        .order('employee_name', { ascending: true });
      if (!isAdmin) query = query.eq('user_id', currentUser.id);
      const { data, error } = await query;
      if (error) throw error;
      setSalaries(data || []);
    } catch (err) { console.error('Error loading salaries:', err); }
    finally { setLoading(false); }
  }, [tenant, selectedMonth, isAdmin, currentUser]);

  useEffect(() => { setLoading(true); loadSalaries(); }, [loadSalaries]);

  const filteredSalaries = salaries.filter(s => filterStatus === 'all' || s.status === filterStatus);

  // ---- Sorted salaries ----
  const sortedSalaries = [...filteredSalaries].sort((a, b) => {
    if (sortBy === 'name') {
      const cmp = (a.employee_name || '').localeCompare(b.employee_name || '', 'vi');
      return sortOrder === 'asc' ? cmp : -cmp;
    }
    if (sortBy === 'total') {
      const cmp = parseFloat(a.total_salary || 0) - parseFloat(b.total_salary || 0);
      return sortOrder === 'asc' ? cmp : -cmp;
    }
    return 0;
  });

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
  };

  const sortIcon = (col) => {
    if (sortBy !== col) return '';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

  // ---- Calculate salaries for ALL employees ----
  const calculateSalaries = async () => {
    if (!isAdmin) return;
    setCalculating(true);
    try {
      const [year, monthNum] = selectedMonth.split('-').map(Number);
      const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
      const nm = monthNum === 12 ? 1 : monthNum + 1;
      const ny = monthNum === 12 ? year + 1 : year;
      const endDate = `${ny}-${String(nm).padStart(2, '0')}-01`;

      const completedTasks = (tasks || []).filter(t => {
        if (t.status !== 'Hoàn Thành') return false;
        const d = t.completed_at || t.updated_at || '';
        return d >= startDate && d < endDate;
      });

      const completedJobs = (technicalJobs || []).filter(j => {
        const isDone = j.status === 'completed' || j.status === 'Hoàn thành';
        const d = j.completed_at || j.completedAt || j.updated_at || j.scheduledDate || '';
        return isDone && d >= startDate && d < endDate;
      });

      const userMap = {};
      (allUsers || []).forEach(u => {
        userMap[u.name] = { userId: u.id, userName: u.name, crewTasks: [], actorTasks: [], techJobs: [] };
      });

      completedTasks.forEach(t => {
        const crew = t.crew || [...new Set([...(t.cameramen || []), ...(t.editors || [])])];
        crew.forEach(name => { if (userMap[name]) userMap[name].crewTasks.push(t.id); });
        (t.actors || []).forEach(name => { if (userMap[name]) userMap[name].actorTasks.push(t.id); });
      });

      completedJobs.forEach(j => {
        (j.technicians || []).forEach(name => { if (userMap[name]) userMap[name].techJobs.push(j.id); });
      });

      let count = 0;
      let errors = [];
      for (const [, u] of Object.entries(userMap)) {
        try {
          const { data: existing } = await supabase.from('salaries')
            .select('*').eq('tenant_id', tenant.id).eq('user_id', u.userId)
            .eq('month', selectedMonth).maybeSingle();

          if (existing && existing.status !== 'draft') continue;

          const prev = existing || {};
          const basicPerDay = parseFloat(prev.basic_per_day) || (prev.basic_salary ? Math.round(parseFloat(prev.basic_salary) / 26) : 0);
          const workDays = parseFloat(prev.work_days || 26);
          const actualBasic = basicPerDay * workDays;
          const basicSalary = basicPerDay * 26;

          const mediaPerVideo = parseFloat(prev.media_per_video || 0);
          const mediaVideos = u.crewTasks.length;
          const mediaTotal = mediaVideos * mediaPerVideo;

          const mediaActorPerVideo = parseFloat(prev.media_actor_per_video || 0);
          const mediaActorCount = u.actorTasks.length;
          const mediaActorTotal = mediaActorCount * mediaActorPerVideo;

          const kythuatPerJob = parseFloat(prev.kythuat_per_job || 0);
          const kythuatJobs = u.techJobs.length;
          const kythuatTotal = kythuatJobs * kythuatPerJob;

          const khoOrders = parseFloat(prev.kho_orders || 0);
          const khoPerOrder = parseFloat(prev.kho_per_order || 0);
          const khoTotal = khoOrders * khoPerOrder;

          const livestreamRev = parseFloat(prev.livestream_revenue || 0);
          const livestreamComm = parseFloat(prev.livestream_commission || 0);
          const livestreamTotal = livestreamRev >= 100000000 ? (livestreamRev * livestreamComm / 100) : 0;

          const saleRev = parseFloat(prev.sale_revenue || 0);
          const saleComm = parseFloat(prev.sale_commission || 0);
          const saleTotal = saleRev * saleComm / 100;

          const data = {
            tenant_id: tenant.id, user_id: u.userId, employee_name: u.userName,
            month: selectedMonth, basic_salary: basicSalary, basic_per_day: basicPerDay,
            work_days: workDays, actual_basic: actualBasic,
            media_videos: mediaVideos, media_per_video: mediaPerVideo,
            media_total: mediaTotal, media_note: prev.media_note || '',
            kythuat_jobs: kythuatJobs, kythuat_per_job: kythuatPerJob,
            kythuat_total: kythuatTotal, kythuat_note: prev.kythuat_note || '',
            livestream_revenue: livestreamRev, livestream_commission: livestreamComm,
            livestream_total: livestreamTotal, livestream_note: prev.livestream_note || '',
            kho_orders: khoOrders, kho_per_order: khoPerOrder,
            kho_total: khoTotal, kho_note: prev.kho_note || '',
            sale_revenue: saleRev, sale_commission: saleComm,
            sale_total: saleTotal, sale_note: prev.sale_note || '',
            bonus: parseFloat(prev.bonus || 0), deduction: parseFloat(prev.deduction || 0),
            note: prev.note || '', status: 'draft',
            created_by: currentUser?.id || null
          };

          data.media_actor_count = mediaActorCount;
          data.media_actor_per_video = mediaActorPerVideo;
          data.media_actor_total = mediaActorTotal;
          data.detail = { crewTasks: u.crewTasks, actorTasks: u.actorTasks, techJobs: u.techJobs };
          data.custom_items = prev.custom_items || [];

          const prevCustomTotal = getCustomItemsTotal(data.custom_items);
          data.total_salary = actualBasic + livestreamTotal + mediaTotal +
            mediaActorTotal + khoTotal + kythuatTotal + saleTotal +
            data.bonus - data.deduction + prevCustomTotal;

          if (existing) {
            const { error } = await supabase.from('salaries').update(data).eq('id', existing.id);
            if (error) {
              delete data.media_actor_count;
              delete data.media_actor_total;
              delete data.detail;
              const { error: err2 } = await supabase.from('salaries').update(data).eq('id', existing.id);
              if (err2) { errors.push(`${u.userName}: ${err2.message}`); continue; }
            }
          } else {
            data.created_at = new Date().toISOString();
            const { error } = await supabase.from('salaries').insert(data);
            if (error) {
              delete data.media_actor_count;
              delete data.media_actor_total;
              delete data.detail;
              const { error: err2 } = await supabase.from('salaries').insert(data);
              if (err2) { errors.push(`${u.userName}: ${err2.message}`); continue; }
            }
          }
          count++;
        } catch (e) {
          errors.push(`${u.userName}: ${e.message}`);
        }
      }

      if (errors.length > 0) {
        console.error('Salary errors:', errors);
        alert(`Tinh luong cho ${count}/${Object.keys(userMap).length} nhan vien.\nLoi: ${errors.join(', ')}`);
      } else {
        alert(`Da tinh luong thang ${selectedMonth} cho ${count} nhan vien!`);
      }
      await loadSalaries();
    } catch (err) {
      console.error('Error calculating salaries:', err);
      alert('Loi khi tinh luong: ' + err.message);
    } finally { setCalculating(false); }
  };

  // ---- Custom items state ----
  const [customItems, setCustomItems] = useState([]);

  const addCustomItem = () => {
    setCustomItems(prev => [...prev, { name: '', quantity: 1, unit_price: 0 }]);
  };

  const updateCustomItem = (index, field, value) => {
    setCustomItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeCustomItem = (index) => {
    setCustomItems(prev => prev.filter((_, i) => i !== index));
  };

  const getCustomItemsTotal = (items) => {
    return (items || []).reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
    }, 0);
  };

  // ---- Open detail modal ----
  const openDetail = (salary) => {
    setSelectedSalary(salary);
    const basicPerDay = parseFloat(salary.basic_per_day) || (salary.basic_salary ? Math.round(parseFloat(salary.basic_salary) / 26) : 0);
    setEditValues({
      basic_per_day: basicPerDay, work_days: salary.work_days || 26,
      media_per_video: salary.media_per_video || 0,
      media_actor_per_video: salary.media_actor_per_video || 0,
      kythuat_per_job: salary.kythuat_per_job || 0,
      livestream_revenue: salary.livestream_revenue || 0, livestream_commission: salary.livestream_commission || 0,
      kho_orders: salary.kho_orders || 0, kho_per_order: salary.kho_per_order || 0,
      sale_revenue: salary.sale_revenue || 0, sale_commission: salary.sale_commission || 0,
      bonus: salary.bonus || 0, deduction: salary.deduction || 0, note: salary.note || ''
    });
    setCustomItems(salary.custom_items || []);
  };

  // ---- Save detail ----
  const saveDetail = async () => {
    if (!selectedSalary) return;
    setSaving(true);
    try {
      const basicPerDay = parseFloat(editValues.basic_per_day) || 0;
      const workDays = parseFloat(editValues.work_days) || 0;
      const actualBasic = basicPerDay * workDays;
      const basicSalary = basicPerDay * 26;
      const livestreamRev = parseFloat(editValues.livestream_revenue) || 0;
      const livestreamComm = parseFloat(editValues.livestream_commission) || 0;
      const livestreamTotal = livestreamRev >= 100000000 ? (livestreamRev * livestreamComm / 100) : 0;
      const mediaPerVideo = parseFloat(editValues.media_per_video) || 0;
      const mediaVideos = parseFloat(selectedSalary.media_videos) || 0;
      const mediaTotal = mediaVideos * mediaPerVideo;
      const mediaActorPerVideo = parseFloat(editValues.media_actor_per_video) || 0;
      const mediaActorCount = parseFloat(selectedSalary.media_actor_count) || 0;
      const mediaActorTotal = mediaActorCount * mediaActorPerVideo;
      const kythuatPerJob = parseFloat(editValues.kythuat_per_job) || 0;
      const kythuatJobs = parseFloat(selectedSalary.kythuat_jobs) || 0;
      const kythuatTotal = kythuatJobs * kythuatPerJob;
      const khoOrders = parseFloat(editValues.kho_orders) || 0;
      const khoPerOrder = parseFloat(editValues.kho_per_order) || 0;
      const khoTotal = khoOrders * khoPerOrder;
      const saleRev = parseFloat(editValues.sale_revenue) || 0;
      const saleComm = parseFloat(editValues.sale_commission) || 0;
      const saleTotal = saleRev * saleComm / 100;
      const bonus = parseFloat(editValues.bonus) || 0;
      const deduction = parseFloat(editValues.deduction) || 0;
      const savedCustomItems = customItems.filter(item => item.name && item.name.trim() !== '').map(item => ({
        name: item.name.trim(),
        quantity: parseFloat(item.quantity) || 0,
        unit_price: parseFloat(item.unit_price) || 0,
        amount: (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
      }));
      const customTotal = getCustomItemsTotal(savedCustomItems);
      const totalSalary = actualBasic + livestreamTotal + mediaTotal + mediaActorTotal + khoTotal + kythuatTotal + saleTotal + bonus - deduction + customTotal;

      const { error } = await supabase.from('salaries').update({
        basic_salary: basicSalary, basic_per_day: basicPerDay, work_days: workDays, actual_basic: actualBasic,
        media_per_video: mediaPerVideo, media_total: mediaTotal,
        media_actor_per_video: mediaActorPerVideo, media_actor_total: mediaActorTotal,
        kythuat_per_job: kythuatPerJob, kythuat_total: kythuatTotal,
        livestream_revenue: livestreamRev, livestream_commission: livestreamComm, livestream_total: livestreamTotal,
        kho_orders: khoOrders, kho_per_order: khoPerOrder, kho_total: khoTotal,
        sale_revenue: saleRev, sale_commission: saleComm, sale_total: saleTotal,
        bonus, deduction, total_salary: totalSalary, note: editValues.note || '',
        custom_items: savedCustomItems
      }).eq('id', selectedSalary.id);
      if (error) throw error;
      setSelectedSalary(null);
      await loadSalaries();
    } catch (err) {
      console.error('Error saving:', err);
      alert('Loi: ' + err.message);
    } finally { setSaving(false); }
  };

  // ---- Approve ----
  const approveSalaries = async (ids) => {
    if (!window.confirm(`Xác nhận duyệt ${ids.length} bảng lương?`)) return;
    try {
      const now = new Date().toISOString();
      for (const id of ids) {
        await supabase.from('salaries').update({
          status: 'approved', approved_at: now, approved_by: currentUser?.id
        }).eq('id', id);
      }
      setSelectedIds(new Set());
      setSelectedSalary(null);
      await loadSalaries();
    } catch (err) { alert('Loi: ' + err.message); }
  };

  // ---- Pay - creates receipt ----
  const paySalaries = async (ids) => {
    const toPay = salaries.filter(s => ids.includes(s.id));
    const total = toPay.reduce((sum, s) => sum + parseFloat(s.total_salary || 0), 0);
    if (!window.confirm(`Xác nhận trả ${formatMoney(total)} cho ${toPay.length} nhân viên?`)) return;
    try {
      const now = new Date().toISOString();
      for (const salary of toPay) {
        await supabase.from('receipts_payments').insert([{
          tenant_id: tenant.id, type: 'chi', category: 'Luong nhan vien',
          amount: salary.total_salary,
          description: `Luong thang ${salary.month} - ${salary.employee_name}`,
          recipient: salary.employee_name, receipt_date: now.slice(0, 10),
          status: 'approved', created_by: currentUser?.id
        }]);
        await supabase.from('salaries').update({
          status: 'paid', paid_at: now, paid_by: currentUser?.id
        }).eq('id', salary.id);
      }
      alert('Da tra luong va tao phieu chi!');
      setSelectedIds(new Set());
      setSelectedSalary(null);
      await loadSalaries();
      if (loadFinanceData) loadFinanceData();
    } catch (err) { alert('Loi: ' + err.message); }
  };

  // ---- Revert status ----
  const revertSalary = async (id, toStatus) => {
    const labels = { draft: 'Nháp', approved: 'Đã duyệt' };
    if (!window.confirm(`Xác nhận chuyển về "${labels[toStatus]}"?`)) return;
    if (toStatus === 'approved') {
      if (!window.confirm('Phiếu chi liên quan sẽ bị xóa. Bạn chắc chắn?')) return;
    }
    try {
      if (toStatus === 'draft') {
        await supabase.from('salaries').update({
          status: 'draft', approved_at: null, approved_by: null
        }).eq('id', id);
      } else if (toStatus === 'approved') {
        const sal = salaries.find(s => s.id === id);
        if (sal) {
          await supabase.from('receipts_payments').delete()
            .eq('tenant_id', tenant.id)
            .eq('category', 'Luong nhan vien')
            .ilike('description', `%${sal.month}%${sal.employee_name}%`);
        }
        await supabase.from('salaries').update({
          status: 'approved', paid_at: null, paid_by: null
        }).eq('id', id);
      }
      setSelectedSalary(null);
      await loadSalaries();
      if (loadFinanceData) loadFinanceData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  // ---- Delete ----
  const deleteSalary = async (id) => {
    if (!window.confirm('Xác nhận xóa bảng lương này?')) return;
    try {
      await supabase.from('salaries').delete().eq('id', id);
      setSelectedSalary(null);
      await loadSalaries();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  // ---- Selection ----
  const toggleSelect = (id) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    const selectable = filteredSalaries.filter(s => s.status !== 'paid').map(s => s.id);
    setSelectedIds(prev => prev.size === selectable.length ? new Set() : new Set(selectable));
  };

  // ---- Task/Job titles for popup ----
  const getTaskTitles = (ids) => (ids || []).map(id => {
    const t = (tasks || []).find(x => x.id === id);
    return t ? { id, title: t.title, sub: `${t.platform || ''} • ${t.dueDate || ''}` } : { id, title: '(Không tìm thấy)', sub: '' };
  });
  const getJobTitles = (ids) => (ids || []).map(id => {
    const j = (technicalJobs || []).find(x => x.id === id);
    return j ? { id, title: j.title, sub: `${j.customerName || ''} • ${j.scheduledDate || ''}` } : { id, title: '(Không tìm thấy)', sub: '' };
  });

  // ---- Get user name from UUID ----
  const getUserName = (uuid) => (allUsers || []).find(u => u.id === uuid)?.name || 'N/A';

  // ---- Stats ----
  const stats = {
    total: filteredSalaries.length,
    totalAmount: filteredSalaries.reduce((sum, s) => sum + parseFloat(s.total_salary || 0), 0),
    draft: filteredSalaries.filter(s => s.status === 'draft').length,
    approved: filteredSalaries.filter(s => s.status === 'approved').length,
    paid: filteredSalaries.filter(s => s.status === 'paid').length
  };

  const getStatusBadge = (status) => {
    const m = { draft: 'bg-yellow-100 text-yellow-700', approved: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700' };
    const l = { draft: 'Nháp', approved: 'Đã duyệt', paid: 'Đã trả' };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${m[status] || m.draft}`}>{l[status] || status}</span>;
  };

  const getRowColor = (status) => {
    const m = { draft: 'bg-yellow-50 hover:bg-yellow-100', approved: 'bg-blue-50 hover:bg-blue-100', paid: 'bg-green-50 hover:bg-green-100' };
    return m[status] || 'hover:bg-gray-50';
  };

  const selectedDraftIds = [...selectedIds].filter(id => salaries.find(s => s.id === id)?.status === 'draft');
  const selectedApprovedIds = [...selectedIds].filter(id => salaries.find(s => s.id === id)?.status === 'approved');

  // ---- Computed total for detail modal editing ----
  const computeTotal = () => {
    const bpd = parseFloat(editValues.basic_per_day) || 0;
    const w = parseFloat(editValues.work_days) || 0;
    const ab = bpd * w;
    const lr = parseFloat(editValues.livestream_revenue) || 0;
    const lc = parseFloat(editValues.livestream_commission) || 0;
    const lt = lr >= 100000000 ? (lr * lc / 100) : 0;
    const mpv = parseFloat(editValues.media_per_video) || 0;
    const mv = parseFloat(selectedSalary?.media_videos) || 0;
    const mt = mv * mpv;
    const mapv = parseFloat(editValues.media_actor_per_video) || 0;
    const mac = parseFloat(selectedSalary?.media_actor_count) || 0;
    const mat = mac * mapv;
    const kpj = parseFloat(editValues.kythuat_per_job) || 0;
    const kj = parseFloat(selectedSalary?.kythuat_jobs) || 0;
    const kt = kj * kpj;
    const ko = parseFloat(editValues.kho_orders) || 0;
    const kp = parseFloat(editValues.kho_per_order) || 0;
    const sr = parseFloat(editValues.sale_revenue) || 0;
    const sc = parseFloat(editValues.sale_commission) || 0;
    const bon = parseFloat(editValues.bonus) || 0;
    const ded = parseFloat(editValues.deduction) || 0;
    const customTotal = getCustomItemsTotal(customItems);
    return ab + lt + mt + mat + kt + (ko * kp) + (sr * sc / 100) + bon - ded + customTotal;
  };

  // ---- CSV Export ----
  const exportCSV = () => {
    const statusLabel = { draft: 'Nháp', approved: 'Đã duyệt', paid: 'Đã trả' };
    const headers = ['STT', 'Nhân viên', 'Ngày công', 'Lương CB', 'Media', 'Kỹ thuật', 'Kho', 'Livestream', 'Sale', 'Thưởng', 'Khấu trừ', 'Tổng', 'Trạng thái'];
    const rows = sortedSalaries.map((s, i) => [
      i + 1,
      s.employee_name,
      s.work_days || 0,
      Math.round(s.actual_basic || 0),
      Math.round((parseFloat(s.media_total || 0) + parseFloat(s.media_actor_total || 0))),
      Math.round(s.kythuat_total || 0),
      Math.round(s.kho_total || 0),
      Math.round(s.livestream_total || 0),
      Math.round(s.sale_total || 0),
      Math.round(s.bonus || 0),
      Math.round(s.deduction || 0),
      Math.round(s.total_salary || 0),
      statusLabel[s.status] || s.status
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `luong_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ---- Print ----
  const printSalaries = () => {
    const statusLabel = { draft: 'Nháp', approved: 'Đã duyệt', paid: 'Đã trả' };
    const monthLabel = selectedMonth;
    const rows = sortedSalaries.map((s, i) => `
      <tr>
        <td style="border:1px solid #ccc;padding:6px;text-align:center">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:6px">${s.employee_name}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:center">${s.work_days || 0}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:right">${formatMoney(s.actual_basic || 0)}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:right">${formatMoney((parseFloat(s.media_total || 0) + parseFloat(s.media_actor_total || 0)))}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:right">${formatMoney(s.kythuat_total || 0)}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:right">${formatMoney(s.kho_total || 0)}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:right">${formatMoney(s.livestream_total || 0)}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:right">${formatMoney(s.sale_total || 0)}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:right">${formatMoney(s.bonus || 0)}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:right">${formatMoney(s.deduction || 0)}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:bold">${formatMoney(s.total_salary || 0)}</td>
        <td style="border:1px solid #ccc;padding:6px;text-align:center">${statusLabel[s.status] || s.status}</td>
      </tr>
    `).join('');

    const totalRow = `<tr style="background:#e0f0ff;font-weight:bold">
      <td colspan="3" style="border:1px solid #ccc;padding:8px">TỔNG CỘNG (${sortedSalaries.length} nhân viên)</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:right">${formatMoney(sortedSalaries.reduce((s, x) => s + parseFloat(x.actual_basic || 0), 0))}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:right">${formatMoney(sortedSalaries.reduce((s, x) => s + parseFloat(x.media_total || 0) + parseFloat(x.media_actor_total || 0), 0))}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:right">${formatMoney(sortedSalaries.reduce((s, x) => s + parseFloat(x.kythuat_total || 0), 0))}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:right">${formatMoney(sortedSalaries.reduce((s, x) => s + parseFloat(x.kho_total || 0), 0))}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:right">${formatMoney(sortedSalaries.reduce((s, x) => s + parseFloat(x.livestream_total || 0), 0))}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:right">${formatMoney(sortedSalaries.reduce((s, x) => s + parseFloat(x.sale_total || 0), 0))}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:right">${formatMoney(sortedSalaries.reduce((s, x) => s + parseFloat(x.bonus || 0), 0))}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:right">${formatMoney(sortedSalaries.reduce((s, x) => s + parseFloat(x.deduction || 0), 0))}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:right;font-size:16px">${formatMoney(stats.totalAmount)}</td>
      <td style="border:1px solid #ccc;padding:8px"></td>
    </tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bang luong ${monthLabel}</title>
      <style>body{font-family:Arial,sans-serif;margin:20px}table{border-collapse:collapse;width:100%;font-size:12px}
      @media print{@page{size:A4 landscape;margin:10mm}}</style></head><body>
      <div style="text-align:center;margin-bottom:20px">
        <h2 style="margin:0">HOÀNG NAM AUDIO</h2>
        <h3 style="margin:5px 0 0">BẢNG LƯƠNG THÁNG ${monthLabel}</h3>
      </div>
      <table>
        <thead><tr style="background:#f0f0f0">
          <th style="border:1px solid #ccc;padding:6px">STT</th>
          <th style="border:1px solid #ccc;padding:6px">Nhân viên</th>
          <th style="border:1px solid #ccc;padding:6px">Ngày công</th>
          <th style="border:1px solid #ccc;padding:6px">Lương CB</th>
          <th style="border:1px solid #ccc;padding:6px">Media</th>
          <th style="border:1px solid #ccc;padding:6px">Kỹ thuật</th>
          <th style="border:1px solid #ccc;padding:6px">Kho</th>
          <th style="border:1px solid #ccc;padding:6px">Livestream</th>
          <th style="border:1px solid #ccc;padding:6px">Sale</th>
          <th style="border:1px solid #ccc;padding:6px">Thưởng</th>
          <th style="border:1px solid #ccc;padding:6px">Khấu trừ</th>
          <th style="border:1px solid #ccc;padding:6px">TỔNG</th>
          <th style="border:1px solid #ccc;padding:6px">Trạng thái</th>
        </tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>
      <div style="margin-top:40px;display:flex;justify-content:space-between">
        <div style="text-align:center;width:200px"><div style="border-top:1px solid #333;padding-top:5px;margin-top:60px">Người lập</div></div>
        <div style="text-align:center;width:200px"><div style="border-top:1px solid #333;padding-top:5px;margin-top:60px">Người duyệt</div></div>
      </div>
      <script>window.print();</script></body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  // ---- Salary History (6 months) ----
  const loadSalaryHistory = useCallback(async () => {
    if (!tenant) return;
    setLoadingHistory(true);
    try {
      const vn = getVietnamDate();
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(vn.getFullYear(), vn.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      const { data, error } = await supabase.from('salaries').select('month, total_salary, id')
        .eq('tenant_id', tenant.id).in('month', months);
      if (error) throw error;

      const grouped = {};
      months.forEach(m => { grouped[m] = { month: m, label: m.slice(5) + '/' + m.slice(0, 4), total: 0, count: 0 }; });
      (data || []).forEach(s => {
        if (grouped[s.month]) {
          grouped[s.month].total += parseFloat(s.total_salary || 0);
          grouped[s.month].count += 1;
        }
      });
      setSalaryHistory(months.map(m => grouped[m]));
    } catch (err) { console.error('Error loading salary history:', err); }
    finally { setLoadingHistory(false); }
  }, [tenant]);

  useEffect(() => {
    if (viewMode === 'history') loadSalaryHistory();
  }, [viewMode, loadSalaryHistory]);

  // ---- Detail modal helper: editable check ----
  const canEdit = isAdmin && selectedSalary?.status === 'draft';

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Header with view toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">{isAdmin ? 'Quản Lý Lương' : 'Bảng Lương Của Tôi'}</h2>
          <p className="text-sm text-gray-600">{isAdmin ? 'Tính lương tất cả phòng ban' : 'Xem chi tiết lương hàng tháng'}</p>
        </div>
        {isAdmin && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'table' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              Bảng lương
            </button>
            <button onClick={() => setViewMode('history')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'history' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              Lịch sử
            </button>
          </div>
        )}
      </div>

      {/* ==================== HISTORY VIEW ==================== */}
      {viewMode === 'history' && isAdmin && (
        <div className="space-y-4">
          {loadingHistory ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow p-4 md:p-6">
                <h3 className="text-lg font-bold mb-4">Quỹ lương 6 tháng gần nhất</h3>
                <div className="h-64 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salaryHistory} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(0)}tr` : v.toLocaleString()} />
                      <Tooltip formatter={(value) => formatMoney(value)} labelFormatter={(label) => `Tháng ${label}`} />
                      <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tổng quỹ lương" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">Tháng</th>
                      <th className="px-4 py-3 text-right">Tổng quỹ lương</th>
                      <th className="px-4 py-3 text-right">Số NV</th>
                      <th className="px-4 py-3 text-right">Trung bình/NV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {salaryHistory.map(h => (
                      <tr key={h.month} className={h.month === selectedMonth ? 'bg-blue-50 font-medium' : ''}>
                        <td className="px-4 py-3">{h.label}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700">{formatMoney(h.total)}</td>
                        <td className="px-4 py-3 text-right">{h.count}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{h.count > 0 ? formatMoney(Math.round(h.total / h.count)) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== TABLE VIEW ==================== */}
      {viewMode === 'table' && (
        <>
          {/* Controls */}
          {isAdmin && (
            <div className="bg-white p-4 rounded-xl shadow flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium mb-1">Tháng</label>
                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Trạng thái</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm">
                  <option value="all">Tất cả</option>
                  <option value="draft">Nháp</option>
                  <option value="approved">Đã duyệt</option>
                  <option value="paid">Đã trả</option>
                </select>
              </div>
              <button onClick={calculateSalaries} disabled={calculating}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {calculating ? 'Đang tính...' : 'Tính lương'}
              </button>
              {selectedDraftIds.length > 0 && (
                <button onClick={() => approveSalaries(selectedDraftIds)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                  Duyệt ({selectedDraftIds.length})
                </button>
              )}
              {selectedApprovedIds.length > 0 && (
                <button onClick={() => paySalaries(selectedApprovedIds)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
                  Trả ({selectedApprovedIds.length})
                </button>
              )}
              <div className="flex-1" />
              <button onClick={exportCSV} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium" title="Xuất CSV">
                CSV
              </button>
              <button onClick={printSalaries} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium" title="In bảng lương">
                In
              </button>
            </div>
          )}

          {/* Stats */}
          {filteredSalaries.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl shadow text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                <div className="text-xs text-gray-500">Nhân viên</div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow text-center">
                <div className="text-lg md:text-xl font-bold text-green-600">{formatMoney(stats.totalAmount)}</div>
                <div className="text-xs text-gray-500">Tổng quỹ lương</div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow text-center">
                <div className="text-2xl font-bold text-yellow-600">{stats.draft}</div>
                <div className="text-xs text-gray-500">Chờ duyệt</div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.paid}</div>
                <div className="text-xs text-gray-500">Đã trả</div>
              </div>
            </div>
          )}

          {/* Mobile Card Layout */}
          <div className="md:hidden space-y-3">
            {sortedSalaries.length === 0 && (
              <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
                <div className="text-4xl mb-3">📭</div>
                <div className="font-medium">Chưa có bảng lương tháng {selectedMonth}</div>
                {isAdmin && <div className="text-sm mt-1">Bấm "Tính lương" để bắt đầu</div>}
              </div>
            )}
            {sortedSalaries.map((s, idx) => {
              const mediaPay = parseFloat(s.media_total || 0) + parseFloat(s.media_actor_total || 0);
              return (
                <div key={s.id} onClick={() => openDetail(s)}
                  className={`rounded-xl shadow p-4 cursor-pointer ${getRowColor(s.status)}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 font-mono w-5">{idx + 1}</span>
                      <div>
                        <div className="font-bold">{s.employee_name}</div>
                        <div className="text-xs text-gray-500">{s.work_days || 0}/26 ngày</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && s.status !== 'paid' && (
                        <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)}
                          onClick={e => e.stopPropagation()} className="mr-1" />
                      )}
                      {getStatusBadge(s.status)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
                    {parseFloat(s.actual_basic || 0) > 0 && (
                      <div className="flex justify-between"><span className="text-gray-500">Cơ bản</span><span>{formatMoney(s.actual_basic)}</span></div>
                    )}
                    {mediaPay > 0 && (
                      <div className="flex justify-between"><span className="text-gray-500">Media</span><span className="text-blue-600">{formatMoney(mediaPay)}</span></div>
                    )}
                    {parseFloat(s.kythuat_total || 0) > 0 && (
                      <div className="flex justify-between"><span className="text-gray-500">KT</span><span className="text-cyan-600">{formatMoney(s.kythuat_total)}</span></div>
                    )}
                    {parseFloat(s.kho_total || 0) > 0 && (
                      <div className="flex justify-between"><span className="text-gray-500">Kho</span><span>{formatMoney(s.kho_total)}</span></div>
                    )}
                    {parseFloat(s.livestream_total || 0) > 0 && (
                      <div className="flex justify-between"><span className="text-gray-500">LS</span><span className="text-purple-600">{formatMoney(s.livestream_total)}</span></div>
                    )}
                    {parseFloat(s.sale_total || 0) > 0 && (
                      <div className="flex justify-between"><span className="text-gray-500">Sale</span><span className="text-green-600">{formatMoney(s.sale_total)}</span></div>
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-700">TỔNG</span>
                    <span className="text-lg font-bold text-blue-700">{formatMoney(s.total_salary)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="bg-white rounded-xl shadow overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {isAdmin && <th className="px-3 py-3 w-10"><input type="checkbox" onChange={toggleSelectAll}
                      checked={selectedIds.size > 0 && selectedIds.size === filteredSalaries.filter(s => s.status !== 'paid').length} /></th>}
                    <th className="px-2 py-3 text-center w-10">STT</th>
                    <th className="px-3 py-3 text-left cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('name')}>
                      Nhân viên{sortIcon('name')}
                    </th>
                    <th className="px-3 py-3 text-right">Cơ bản</th>
                    <th className="px-3 py-3 text-right">Media</th>
                    <th className="px-3 py-3 text-right">KT</th>
                    <th className="px-3 py-3 text-right hidden lg:table-cell">Kho</th>
                    <th className="px-3 py-3 text-right hidden lg:table-cell">Livestream</th>
                    <th className="px-3 py-3 text-right hidden lg:table-cell">Sale</th>
                    <th className="px-3 py-3 text-right hidden lg:table-cell">±</th>
                    <th className="px-3 py-3 text-right font-bold cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('total')}>
                      TỔNG{sortIcon('total')}
                    </th>
                    <th className="px-3 py-3 text-center">T.Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedSalaries.length === 0 && (
                    <tr><td colSpan={20} className="px-4 py-12 text-center text-gray-400">
                      <div className="text-4xl mb-3">📭</div>
                      <div className="font-medium">Chưa có bảng lương tháng {selectedMonth}</div>
                      {isAdmin && <div className="text-sm mt-1">Bấm "Tính lương" để bắt đầu</div>}
                    </td></tr>
                  )}
                  {sortedSalaries.map((s, idx) => {
                    const mediaPay = parseFloat(s.media_total || 0) + parseFloat(s.media_actor_total || 0);
                    const bonusDed = parseFloat(s.bonus || 0) - parseFloat(s.deduction || 0);
                    return (
                      <tr key={s.id} onClick={() => openDetail(s)} className={`cursor-pointer ${getRowColor(s.status)}`}>
                        {isAdmin && <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                          {s.status !== 'paid' && <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} />}
                        </td>}
                        <td className="px-2 py-3 text-center text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{s.employee_name}</div>
                          <div className="text-xs text-gray-400">{s.work_days || 0}/26 ngày</div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {parseFloat(s.actual_basic || 0) > 0 ? formatMoney(s.actual_basic) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {mediaPay > 0 ? (<div>
                            <div className="font-medium text-blue-600">{formatMoney(mediaPay)}</div>
                            <div className="text-xs text-gray-400">{s.media_videos || 0} Q&D{(s.media_actor_count || 0) > 0 && ` + ${s.media_actor_count} diễn`}</div>
                          </div>) : (s.media_videos || 0) > 0 ? (
                            <div className="text-xs text-gray-400">{s.media_videos} Q&D{(s.media_actor_count || 0) > 0 && ` + ${s.media_actor_count} diễn`}</div>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {parseFloat(s.kythuat_total || 0) > 0 ? (<div>
                            <div className="font-medium text-cyan-600">{formatMoney(s.kythuat_total)}</div>
                            <div className="text-xs text-gray-400">{s.kythuat_jobs || 0} job</div>
                          </div>) : (s.kythuat_jobs || 0) > 0 ? (
                            <div className="text-xs text-gray-400">{s.kythuat_jobs} job</div>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-right hidden lg:table-cell">
                          {parseFloat(s.kho_total || 0) > 0 ? formatMoney(s.kho_total) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-right hidden lg:table-cell">
                          {parseFloat(s.livestream_total || 0) > 0 ? (<div>
                            <div className="font-medium text-purple-600">{formatMoney(s.livestream_total)}</div>
                            <div className="text-xs text-gray-400">DT {formatMoney(s.livestream_revenue || 0)}</div>
                          </div>) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-right hidden lg:table-cell">
                          {parseFloat(s.sale_total || 0) > 0 ? (<div>
                            <div className="font-medium text-green-600">{formatMoney(s.sale_total)}</div>
                            <div className="text-xs text-gray-400">DT {formatMoney(s.sale_revenue || 0)}</div>
                          </div>) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-right hidden lg:table-cell">
                          {bonusDed !== 0 ? <span className={bonusDed > 0 ? 'text-green-600' : 'text-red-600'}>
                            {bonusDed > 0 ? '+' : ''}{formatMoney(bonusDed)}
                          </span> : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-blue-700">{formatMoney(s.total_salary)}</td>
                        <td className="px-3 py-3 text-center">{getStatusBadge(s.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {sortedSalaries.length > 0 && (
                  <tfoot>
                    <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold">
                      <td colSpan={20} className="px-4 py-3">
                        <div className="flex justify-between items-center">
                          <span>TỔNG CỘNG ({sortedSalaries.length} nhân viên)</span>
                          <span className="text-xl text-blue-700">{formatMoney(stats.totalAmount)}</span>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* Task/Job List Modal */}
      {taskListModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">{taskListModal.title}</h3>
              <button onClick={() => setTaskListModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-2">
              {taskListModal.items.map((item, i) => (
                <div key={item.id || i} className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-sm">{item.title}</div>
                  {item.sub && <div className="text-xs text-gray-500">{item.sub}</div>}
                </div>
              ))}
              {taskListModal.items.length === 0 && <div className="text-center py-4 text-gray-400 text-sm">Không có dữ liệu</div>}
            </div>
            <button onClick={() => setTaskListModal(null)} className="mt-4 w-full px-4 py-2 bg-gray-200 rounded-lg font-medium text-sm">Đóng</button>
          </div>
        </div>
      )}

      {/* ========== DETAIL MODAL (Table Format) ========== */}
      {selectedSalary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-5 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">{selectedSalary.employee_name}</h2>
                <p className="text-white/80 text-sm">Tháng {selectedSalary.month}</p>
              </div>
              <div className="flex items-center gap-3">
                {getStatusBadge(selectedSalary.status)}
                <button onClick={() => setSelectedSalary(null)} className="text-2xl hover:bg-white/20 w-10 h-10 rounded-lg flex items-center justify-center">×</button>
              </div>
            </div>

            {/* Body - Table Format */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Salary Detail Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-200 px-3 py-2 text-left w-[25%]">Hạng mục</th>
                      <th className="border border-gray-200 px-3 py-2 text-center w-[25%]">Số lượng</th>
                      <th className="border border-gray-200 px-3 py-2 text-center w-[25%]">Đơn giá / Chi tiết</th>
                      <th className="border border-gray-200 px-3 py-2 text-right w-[25%]">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Basic salary row */}
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-medium">Lương cơ bản</td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        {canEdit ? (
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" value={editValues.work_days || ''} onChange={e => setEditValues({...editValues, work_days: e.target.value})}
                              className="w-16 px-2 py-1 border rounded text-center text-sm" placeholder="26" />
                            <span className="text-xs text-gray-500">ngày</span>
                          </div>
                        ) : (
                          <span>{selectedSalary.work_days || 0} ngày</span>
                        )}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        {canEdit ? (
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" value={editValues.basic_per_day || ''} onChange={e => setEditValues({...editValues, basic_per_day: e.target.value})}
                              className="w-28 px-2 py-1 border rounded text-right text-sm" placeholder="Đ/ngày" />
                            <span className="text-xs text-gray-500">/ngày</span>
                          </div>
                        ) : (
                          <span>{formatMoney(selectedSalary.basic_per_day || (selectedSalary.basic_salary ? Math.round(parseFloat(selectedSalary.basic_salary) / 26) : 0))}/ngày</span>
                        )}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-right font-medium text-blue-700">
                        {formatMoney(canEdit ? ((parseFloat(editValues.basic_per_day) || 0) * (parseFloat(editValues.work_days) || 0)) : (selectedSalary.actual_basic || 0))}
                      </td>
                    </tr>

                    {/* Media - Quay & Dung */}
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-medium">Quay & Dựng</td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        <button onClick={() => { const d = selectedSalary.detail || {}; setTaskListModal({ title: `Quay & Dựng - ${selectedSalary.employee_name}`, items: getTaskTitles(d.crewTasks) }); }}
                          className="text-blue-600 hover:underline font-medium">{selectedSalary.media_videos || 0} video</button>
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        {canEdit ? (
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" value={editValues.media_per_video || ''} onChange={e => setEditValues({...editValues, media_per_video: e.target.value})}
                              className="w-28 px-2 py-1 border rounded text-right text-sm" placeholder="Đ/video" />
                            <span className="text-xs text-gray-500">/video</span>
                          </div>
                        ) : <span>{formatMoney(selectedSalary.media_per_video || 0)}/video</span>}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-right font-medium text-blue-600">
                        {formatMoney(canEdit ? ((selectedSalary.media_videos || 0) * (parseFloat(editValues.media_per_video) || 0)) : (selectedSalary.media_total || 0))}
                      </td>
                    </tr>

                    {/* Media - Dien vien */}
                    {((selectedSalary.media_actor_count || 0) > 0 || canEdit) && (
                      <tr>
                        <td className="border border-gray-200 px-3 py-2 font-medium">Diễn viên</td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          <button onClick={() => { const d = selectedSalary.detail || {}; setTaskListModal({ title: `Diễn viên - ${selectedSalary.employee_name}`, items: getTaskTitles(d.actorTasks) }); }}
                            className="text-pink-600 hover:underline font-medium">{selectedSalary.media_actor_count || 0} video</button>
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          {canEdit ? (
                            <div className="flex items-center justify-center gap-1">
                              <input type="number" value={editValues.media_actor_per_video || ''} onChange={e => setEditValues({...editValues, media_actor_per_video: e.target.value})}
                                className="w-28 px-2 py-1 border rounded text-right text-sm" placeholder="Đ/video" />
                              <span className="text-xs text-gray-500">/video</span>
                            </div>
                          ) : <span>{formatMoney(selectedSalary.media_actor_per_video || 0)}/video</span>}
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-right font-medium text-pink-600">
                          {formatMoney(canEdit ? ((selectedSalary.media_actor_count || 0) * (parseFloat(editValues.media_actor_per_video) || 0)) : (selectedSalary.media_actor_total || 0))}
                        </td>
                      </tr>
                    )}

                    {/* Ky thuat */}
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-medium">Kỹ thuật</td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        <button onClick={() => { const d = selectedSalary.detail || {}; setTaskListModal({ title: `Kỹ thuật - ${selectedSalary.employee_name}`, items: getJobTitles(d.techJobs) }); }}
                          className="text-cyan-600 hover:underline font-medium">{selectedSalary.kythuat_jobs || 0} job</button>
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        {canEdit ? (
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" value={editValues.kythuat_per_job || ''} onChange={e => setEditValues({...editValues, kythuat_per_job: e.target.value})}
                              className="w-28 px-2 py-1 border rounded text-right text-sm" placeholder="Đ/job" />
                            <span className="text-xs text-gray-500">/job</span>
                          </div>
                        ) : <span>{formatMoney(selectedSalary.kythuat_per_job || 0)}/job</span>}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-right font-medium text-cyan-600">
                        {formatMoney(canEdit ? ((selectedSalary.kythuat_jobs || 0) * (parseFloat(editValues.kythuat_per_job) || 0)) : (selectedSalary.kythuat_total || 0))}
                      </td>
                    </tr>

                    {/* Kho */}
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-medium">Kho</td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        {canEdit ? (
                          <input type="number" value={editValues.kho_orders || ''} onChange={e => setEditValues({...editValues, kho_orders: e.target.value})}
                            className="w-20 px-2 py-1 border rounded text-center text-sm" placeholder="đơn" />
                        ) : <span>{selectedSalary.kho_orders || 0} đơn</span>}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        {canEdit ? (
                          <input type="number" value={editValues.kho_per_order || ''} onChange={e => setEditValues({...editValues, kho_per_order: e.target.value})}
                            className="w-28 px-2 py-1 border rounded text-right text-sm" placeholder="/đơn" />
                        ) : <span>{formatMoney(selectedSalary.kho_per_order || 0)}/đơn</span>}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-right font-medium text-orange-600">
                        {formatMoney(canEdit ? ((parseFloat(editValues.kho_orders) || 0) * (parseFloat(editValues.kho_per_order) || 0)) : (selectedSalary.kho_total || 0))}
                      </td>
                    </tr>

                    {/* Livestream */}
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-medium">
                        Livestream
                        <div className="text-xs text-gray-400 font-normal">HH khi DT ≥ 100tr</div>
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        {canEdit ? (
                          <input type="number" value={editValues.livestream_revenue || ''} onChange={e => setEditValues({...editValues, livestream_revenue: e.target.value})}
                            className="w-28 px-2 py-1 border rounded text-right text-sm" placeholder="Doanh thu" />
                        ) : <span>DT: {formatMoney(selectedSalary.livestream_revenue || 0)}</span>}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        {canEdit ? (
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" value={editValues.livestream_commission || ''} onChange={e => setEditValues({...editValues, livestream_commission: e.target.value})}
                              className="w-16 px-2 py-1 border rounded text-right text-sm" placeholder="%" />
                            <span className="text-xs">%</span>
                          </div>
                        ) : <span>{selectedSalary.livestream_commission || 0}%</span>}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-right font-medium text-purple-600">
                        {(() => {
                          const rev = canEdit ? (parseFloat(editValues.livestream_revenue) || 0) : parseFloat(selectedSalary.livestream_revenue || 0);
                          const comm = canEdit ? (parseFloat(editValues.livestream_commission) || 0) : parseFloat(selectedSalary.livestream_commission || 0);
                          const total = rev >= 100000000 ? (rev * comm / 100) : 0;
                          return <>{formatMoney(total)}{rev > 0 && rev < 100000000 && <div className="text-xs text-red-400">(DT &lt; 100tr)</div>}</>;
                        })()}
                      </td>
                    </tr>

                    {/* Sale */}
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-medium">Sale</td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        {canEdit ? (
                          <input type="number" value={editValues.sale_revenue || ''} onChange={e => setEditValues({...editValues, sale_revenue: e.target.value})}
                            className="w-28 px-2 py-1 border rounded text-right text-sm" placeholder="Doanh thu" />
                        ) : <span>DT: {formatMoney(selectedSalary.sale_revenue || 0)}</span>}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        {canEdit ? (
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" value={editValues.sale_commission || ''} onChange={e => setEditValues({...editValues, sale_commission: e.target.value})}
                              className="w-16 px-2 py-1 border rounded text-right text-sm" placeholder="%" />
                            <span className="text-xs">%</span>
                          </div>
                        ) : <span>{selectedSalary.sale_commission || 0}%</span>}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-right font-medium text-green-600">
                        {formatMoney(canEdit ? ((parseFloat(editValues.sale_revenue) || 0) * (parseFloat(editValues.sale_commission) || 0) / 100) : (selectedSalary.sale_total || 0))}
                      </td>
                    </tr>

                    {/* Bonus */}
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-medium text-green-700">Thưởng</td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-400">-</td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-400">-</td>
                      <td className="border border-gray-200 px-3 py-2 text-right">
                        {canEdit ? (
                          <input type="number" value={editValues.bonus || ''} onChange={e => setEditValues({...editValues, bonus: e.target.value})}
                            className="w-28 px-2 py-1 border rounded text-right text-sm" />
                        ) : <span className="font-medium text-green-600">{parseFloat(selectedSalary.bonus || 0) > 0 ? `+${formatMoney(selectedSalary.bonus)}` : '-'}</span>}
                      </td>
                    </tr>

                    {/* Deduction */}
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-medium text-red-700">Khấu trừ</td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-400">-</td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-400">-</td>
                      <td className="border border-gray-200 px-3 py-2 text-right">
                        {canEdit ? (
                          <input type="number" value={editValues.deduction || ''} onChange={e => setEditValues({...editValues, deduction: e.target.value})}
                            className="w-28 px-2 py-1 border rounded text-right text-sm" />
                        ) : <span className="font-medium text-red-600">{parseFloat(selectedSalary.deduction || 0) > 0 ? `-${formatMoney(selectedSalary.deduction)}` : '-'}</span>}
                      </td>
                    </tr>

                    {/* Custom Items */}
                    {(canEdit ? customItems : (selectedSalary.custom_items || [])).map((item, idx) => {
                      const qty = parseFloat(item.quantity) || 0;
                      const price = parseFloat(item.unit_price) || 0;
                      const itemTotal = qty * price;
                      return (
                        <tr key={`custom-${idx}`} className="bg-amber-50/50">
                          <td className="border border-gray-200 px-3 py-2">
                            {canEdit ? (
                              <div className="flex items-center gap-1">
                                <input type="text" value={item.name || ''} onChange={e => updateCustomItem(idx, 'name', e.target.value)}
                                  className="w-full px-2 py-1 border rounded text-sm" placeholder="Tên mục..." />
                                <button onClick={() => removeCustomItem(idx)} className="text-red-400 hover:text-red-600 text-lg shrink-0" title="Xóa">🗑️</button>
                              </div>
                            ) : <span className="font-medium text-amber-800">{item.name}</span>}
                          </td>
                          <td className="border border-gray-200 px-3 py-2 text-center">
                            {canEdit ? (
                              <input type="number" value={item.quantity ?? ''} onChange={e => updateCustomItem(idx, 'quantity', e.target.value)}
                                className="w-20 px-2 py-1 border rounded text-center text-sm" placeholder="SL" />
                            ) : <span>{qty}</span>}
                          </td>
                          <td className="border border-gray-200 px-3 py-2 text-center">
                            {canEdit ? (
                              <input type="number" value={item.unit_price ?? ''} onChange={e => updateCustomItem(idx, 'unit_price', e.target.value)}
                                className="w-28 px-2 py-1 border rounded text-right text-sm" placeholder="Đơn giá" />
                            ) : <span>{formatMoney(price)}</span>}
                          </td>
                          <td className={`border border-gray-200 px-3 py-2 text-right font-medium ${itemTotal >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
                            {formatMoney(itemTotal)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Add custom item button */}
                    {canEdit && (
                      <tr>
                        <td colSpan={4} className="border border-gray-200 px-3 py-2">
                          <button onClick={addCustomItem}
                            className="w-full py-1.5 text-sm text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded font-medium transition">
                            + Thêm mục
                          </button>
                        </td>
                      </tr>
                    )}

                    {/* TOTAL */}
                    <tr className="bg-gradient-to-r from-blue-50 to-indigo-50">
                      <td colSpan={3} className="border border-gray-200 px-3 py-3 font-bold text-lg">TỔNG LƯƠNG</td>
                      <td className="border border-gray-200 px-3 py-3 text-right font-bold text-xl text-blue-700">
                        {canEdit ? formatMoney(computeTotal()) : formatMoney(selectedSalary.total_salary)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Note */}
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Ghi chú</label>
                {canEdit ? (
                  <input type="text" value={editValues.note || ''} onChange={e => setEditValues({...editValues, note: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ghi chú..." />
                ) : (
                  <div className="text-sm text-gray-600">{selectedSalary.note || '(Không có ghi chú)'}</div>
                )}
              </div>

              {/* Timeline */}
              <div className="mt-4 border-t pt-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Lịch sử</h4>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                  {selectedSalary.created_at && (
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-400 inline-block"></span>
                      <span>Tạo: {new Date(selectedSalary.created_at).toLocaleDateString('vi-VN')} bởi {getUserName(selectedSalary.created_by)}</span>
                    </div>
                  )}
                  {selectedSalary.approved_at && (
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
                      <span>Duyệt: {new Date(selectedSalary.approved_at).toLocaleDateString('vi-VN')} bởi {getUserName(selectedSalary.approved_by)}</span>
                    </div>
                  )}
                  {selectedSalary.paid_at && (
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
                      <span>Trả: {new Date(selectedSalary.paid_at).toLocaleDateString('vi-VN')} bởi {getUserName(selectedSalary.paid_by)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50 flex justify-between">
              <div className="flex gap-2">
                {isAdmin && selectedSalary.status === 'draft' && (
                  <button onClick={() => deleteSalary(selectedSalary.id)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">Xóa</button>
                )}
                {isAdmin && selectedSalary.status === 'approved' && (
                  <button onClick={() => revertSalary(selectedSalary.id, 'draft')} className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm">
                    Về nháp
                  </button>
                )}
                {isAdmin && selectedSalary.status === 'paid' && (
                  <button onClick={() => revertSalary(selectedSalary.id, 'approved')} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm">
                    Hoàn trả
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {isAdmin && selectedSalary.status === 'draft' && (<>
                  <button onClick={saveDetail} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                    {saving ? 'Đang lưu...' : 'Lưu'}
                  </button>
                  <button onClick={() => approveSalaries([selectedSalary.id])} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">Duyệt</button>
                </>)}
                {isAdmin && selectedSalary.status === 'approved' && (
                  <button onClick={() => paySalaries([selectedSalary.id])} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">Trả lương</button>
                )}
                <button onClick={() => setSelectedSalary(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-100 text-sm">Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SalaryManagement;

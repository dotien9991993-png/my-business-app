import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { getVietnamDate, getTodayVN, getNowStringVN } from '../utils/dateUtils';
import { isAdmin } from '../utils/permissionUtils';
import { useApp } from './AppContext';
import { useNotifications } from './NotificationContext';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { tenant, currentUser, allUsers, isLoggedIn, loadUsers, loadPermissions } = useApp();
  const { createNotification } = useNotifications();

  // ---- Loading ----
  const [loading, setLoading] = useState(true);

  // ---- Data collections ----
  const [tasks, setTasks] = useState([]);
  const [technicalJobs, setTechnicalJobs] = useState([]);
  const [receiptsPayments, setReceiptsPayments] = useState([]);
  const [debts, setDebts] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [attendances, setAttendances] = useState([]);
  const [todayAttendances, setTodayAttendances] = useState([]);
  const [products, setProducts] = useState([]);
  const [stockTransactions, setStockTransactions] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseStock, setWarehouseStock] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [stocktakes, setStocktakes] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [systemSettings, setSystemSettings] = useState([]);
  const [shippingConfigs, setShippingConfigs] = useState([]);
  const [serials, setSerials] = useState([]);
  const [warrantyCards, setWarrantyCards] = useState([]);
  const [warrantyRepairs, setWarrantyRepairs] = useState([]);
  const [warrantyRequests, setWarrantyRequests] = useState([]);

  // ---- HRM data ----
  const [hrmEmployees, setHrmEmployees] = useState([]);
  const [hrmDepartments, setHrmDepartments] = useState([]);
  const [hrmPositions, setHrmPositions] = useState([]);
  const [hrmWorkShifts, setHrmWorkShifts] = useState([]);
  const [hrmAttendances, setHrmAttendances] = useState([]);
  const [hrmLeaveRequests, setHrmLeaveRequests] = useState([]);
  const [hrmLeaveBalances, setHrmLeaveBalances] = useState([]);
  const [hrmKpiTemplates, setHrmKpiTemplates] = useState([]);
  const [hrmKpiCriteria, setHrmKpiCriteria] = useState([]);
  const [hrmKpiEvaluations, setHrmKpiEvaluations] = useState([]);
  const [hrmKpiEvalDetails, setHrmKpiEvalDetails] = useState([]);

  // ---- Modal states (cross-module) ----
  const [selectedTask, setSelectedTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showCreateJobModal, setShowCreateJobModal] = useState(false);
  const [prefillJobData, setPrefillJobData] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [showAttendancePopup, setShowAttendancePopup] = useState(false);

  // ---- Task filters ----
  const [taskFilterTeam, setTaskFilterTeam] = useState('all');
  const [taskFilterStatus, setTaskFilterStatus] = useState('all');
  const [taskFilterAssignee, setTaskFilterAssignee] = useState('all');
  const [taskFilterCategory, setTaskFilterCategory] = useState('all');
  const [taskDateFilter, setTaskDateFilter] = useState('all');
  const [taskCustomStartDate, setTaskCustomStartDate] = useState('');
  const [taskCustomEndDate, setTaskCustomEndDate] = useState('');
  const [taskFilterCrew, setTaskFilterCrew] = useState('all');
  const [taskFilterActor, setTaskFilterActor] = useState('all');

  // ---- Job filters ----
  const [jobFilterCreator, setJobFilterCreator] = useState('all');
  const [jobFilterTechnician, setJobFilterTechnician] = useState('all');
  const [jobFilterStatus, setJobFilterStatus] = useState('all');
  const [jobFilterMonth, setJobFilterMonth] = useState(new Date().getMonth() + 1);
  const [jobFilterYear, setJobFilterYear] = useState(new Date().getFullYear());
  const [jobFilterDateMode, setJobFilterDateMode] = useState('all');
  const [jobCustomStartDate, setJobCustomStartDate] = useState('');
  const [jobCustomEndDate, setJobCustomEndDate] = useState('');

  // ---- Static data ----
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

  // ---- Job Edit Draft helpers ----
  const saveJobEditDraft = useCallback((data) => {
    try { localStorage.setItem('jobEditDraft', JSON.stringify(data)); }
    catch (e) { console.error('Error saving draft:', e); }
  }, []);
  const loadJobEditDraft = useCallback((jobId) => {
    try {
      const saved = localStorage.getItem('jobEditDraft');
      if (saved) { const data = JSON.parse(saved); if (data.jobId === jobId) return data; }
    } catch (e) { console.error('Error loading draft:', e); }
    return null;
  }, []);
  const clearJobEditDraft = useCallback(() => { localStorage.removeItem('jobEditDraft'); }, []);

  // ---- Data loaders ----
  const loadTasks = useCallback(async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('tasks').select('*').eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const formattedTasks = (data || []).map(task => ({
        id: task.id, title: task.title, assignee: task.assignee, team: task.team,
        status: task.status, dueDate: task.due_date, platform: task.platform,
        isOverdue: task.is_overdue, comments: task.comments || [], postLinks: task.post_links || [],
        priority: task.priority, description: task.description, category: task.category || '',
        cameramen: task.cameramen || [], editors: task.editors || [], actors: task.actors || [],
        crew: [...new Set([...(task.cameramen || []), ...(task.editors || [])])],
        filmed_at: task.filmed_at || null, edited_at: task.edited_at || null, edit_started_at: task.edit_started_at || null,
        created_at: task.created_at, updated_at: task.updated_at, completed_at: task.completed_at || null
      }));
      setTasks(formattedTasks);
      setLoading(false);
    } catch (error) { console.error('Error loading tasks:', error); setLoading(false); }
  }, [tenant]);

  const loadTechnicalJobs = useCallback(async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('technical_jobs').select('*').eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const formattedJobs = (data || []).map(job => ({
        id: job.id, title: job.title, type: job.type,
        customerName: job.customer_name, customerPhone: job.customer_phone,
        address: job.address, equipment: job.equipment || [],
        technicians: job.technicians || [job.technician],
        scheduledDate: job.scheduled_date, scheduledTime: job.scheduled_time,
        customerPayment: job.customer_payment, createdBy: job.created_by,
        status: job.status, createdAt: job.created_at, expenses: job.expenses || []
      }));
      setTechnicalJobs(formattedJobs);
    } catch (error) { console.error('Error loading technical jobs:', error); }
  }, [tenant]);

  const loadFinanceData = useCallback(async () => {
    if (!tenant) return;
    try {
      const [receiptsRes, debtsRes, salariesRes] = await Promise.all([
        supabase.from('receipts_payments').select('*').eq('tenant_id', tenant.id).order('receipt_date', { ascending: false }).limit(1000),
        supabase.from('debts').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('salaries').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(500)
      ]);
      if (receiptsRes.data) setReceiptsPayments(receiptsRes.data);
      if (debtsRes.data) setDebts(debtsRes.data);
      if (salariesRes.data) setSalaries(salariesRes.data);
    } catch (error) { console.error('Error loading finance data:', error); }
  }, [tenant]);

  const loadAttendanceData = useCallback(async () => {
    if (!tenant || !currentUser) return;
    try {
      let query = supabase.from('attendances').select('*').eq('tenant_id', tenant.id)
        .order('date', { ascending: false }).order('check_in', { ascending: false });
      if (!isAdmin(currentUser)) query = query.eq('user_id', currentUser.id);
      const { data, error } = await query.limit(100);
      if (error) throw error;
      setAttendances(data || []);
    } catch (error) { console.error('Error loading attendance data:', error); }
  }, [tenant, currentUser]);

  const loadWarehouseData = useCallback(async () => {
    if (!tenant) return;
    try {
      const [productsRes, transactionsRes, warehousesRes, warehouseStockRes, comboItemsRes, suppliersRes, stocktakesRes, transfersRes] = await Promise.all([
        supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name', { ascending: true }),
        supabase.from('stock_transactions').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('warehouses').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('warehouse_stock').select('*'),
        supabase.from('product_combo_items').select('*').eq('tenant_id', tenant.id),
        supabase.from('suppliers').select('*').eq('tenant_id', tenant.id).order('name', { ascending: true }),
        supabase.from('stocktakes').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('warehouse_transfers').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(100)
      ]);
      if (productsRes.data) setProducts(productsRes.data);
      if (transactionsRes.data) setStockTransactions(transactionsRes.data);
      if (warehousesRes.data) setWarehouses(warehousesRes.data);
      if (warehouseStockRes.data && warehousesRes.data) {
        const whIds = new Set(warehousesRes.data.map(w => w.id));
        setWarehouseStock(warehouseStockRes.data.filter(ws => whIds.has(ws.warehouse_id)));
      }
      if (comboItemsRes.data) setComboItems(comboItemsRes.data);
      if (suppliersRes.data) setSuppliers(suppliersRes.data);
      if (stocktakesRes.data) setStocktakes(stocktakesRes.data);
      if (transfersRes.data) setTransfers(transfersRes.data);
    } catch (error) { console.error('Error loading warehouse data:', error); }
  }, [tenant]);

  const loadSalesData = useCallback(async () => {
    if (!tenant) return;
    try {
      const [ordersRes, customersRes] = await Promise.all([
        supabase.from('orders').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('customers').select('*').eq('tenant_id', tenant.id).order('name', { ascending: true })
      ]);
      if (ordersRes.error) { console.warn('Sales orders table not ready:', ordersRes.error.message); }
      else if (ordersRes.data) setOrders(ordersRes.data);
      if (customersRes.error) { console.warn('Customers table not ready:', customersRes.error.message); }
      else if (customersRes.data) setCustomers(customersRes.data);
    } catch (error) { console.error('Error loading sales data:', error); }
  }, [tenant]);

  const loadSettingsData = useCallback(async () => {
    if (!tenant) return;
    try {
      const [settingsRes, shippingRes] = await Promise.all([
        supabase.from('system_settings').select('*').eq('tenant_id', tenant.id),
        supabase.from('shipping_configs').select('*').eq('tenant_id', tenant.id)
      ]);
      if (settingsRes.data) setSystemSettings(settingsRes.data);
      if (shippingRes.data) setShippingConfigs(shippingRes.data);
    } catch (error) { console.error('Error loading settings:', error); }
  }, [tenant]);

  const loadWarrantyData = useCallback(async () => {
    if (!tenant) return;
    try {
      const [serialsRes, cardsRes, repairsRes, requestsRes] = await Promise.all([
        supabase.from('product_serials').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('warranty_cards').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('warranty_repairs').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('warranty_requests').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(500)
      ]);
      if (serialsRes.data) setSerials(serialsRes.data);
      if (cardsRes.data) setWarrantyCards(cardsRes.data);
      if (repairsRes.data) setWarrantyRepairs(repairsRes.data);
      if (requestsRes.data) setWarrantyRequests(requestsRes.data);
    } catch (error) { console.error('Error loading warranty data:', error); }
  }, [tenant]);

  const loadHrmData = useCallback(async () => {
    if (!tenant) return;
    try {
      const [empRes, deptRes, posRes, shiftRes, attRes, leaveRes, balRes, tplRes, critRes, evalRes, detailRes] = await Promise.all([
        supabase.from('employees').select('*').eq('tenant_id', tenant.id).order('full_name', { ascending: true }),
        supabase.from('departments').select('*').eq('tenant_id', tenant.id).order('name', { ascending: true }),
        supabase.from('positions').select('*').eq('tenant_id', tenant.id).order('level', { ascending: true }),
        supabase.from('work_shifts').select('*').eq('tenant_id', tenant.id).order('start_time', { ascending: true }),
        supabase.from('hrm_attendances').select('*').eq('tenant_id', tenant.id).order('date', { ascending: false }).limit(2000),
        supabase.from('leave_requests').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('leave_balances').select('*').eq('tenant_id', tenant.id),
        supabase.from('kpi_templates').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
        supabase.from('kpi_criteria').select('*'),
        supabase.from('kpi_evaluations').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('kpi_evaluation_details').select('*')
      ]);
      if (empRes.data) setHrmEmployees(empRes.data);
      if (deptRes.data) setHrmDepartments(deptRes.data);
      if (posRes.data) setHrmPositions(posRes.data);
      if (shiftRes.data) setHrmWorkShifts(shiftRes.data);
      if (attRes.data) setHrmAttendances(attRes.data);
      if (leaveRes.data) setHrmLeaveRequests(leaveRes.data);
      if (balRes.data) setHrmLeaveBalances(balRes.data);
      if (tplRes.data) setHrmKpiTemplates(tplRes.data);
      if (critRes.data) setHrmKpiCriteria(critRes.data);
      if (evalRes.data) setHrmKpiEvaluations(evalRes.data);
      if (detailRes.data) setHrmKpiEvalDetails(detailRes.data);
    } catch (error) { console.error('Error loading HRM data:', error); }
  }, [tenant]);

  const getSettingValue = useCallback((category, key, fallback = null) => {
    const setting = systemSettings.find(s => s.category === category && s.key === key);
    return setting ? setting.value : fallback;
  }, [systemSettings]);

  const refreshAllData = useCallback(async () => {
    if (!tenant) return;
    await Promise.all([loadUsers(), loadTasks(), loadTechnicalJobs(), loadFinanceData(), loadWarehouseData(), loadSalesData(), loadPermissions(), loadSettingsData(), loadWarrantyData(), loadHrmData()]);
  }, [tenant, loadUsers, loadTasks, loadTechnicalJobs, loadFinanceData, loadWarehouseData, loadSalesData, loadPermissions, loadSettingsData, loadWarrantyData, loadHrmData]);

  // ---- Load data + realtime subscriptions ----
  useEffect(() => {
    if (!tenant) return;
    loadUsers(); loadTasks(); loadTechnicalJobs(); loadFinanceData(); loadWarehouseData(); loadSalesData(); loadPermissions(); loadSettingsData(); loadWarrantyData(); loadHrmData();

    const tasksChannel = supabase.channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadTasks()).subscribe();
    const jobsChannel = supabase.channel('jobs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'technical_jobs' }, () => loadTechnicalJobs()).subscribe();
    const financeChannel = supabase.channel('finance-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts_payments' }, () => loadFinanceData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, () => loadFinanceData()).subscribe();
    const warehouseChannel = supabase.channel('warehouse-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadWarehouseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transactions' }, () => loadWarehouseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouses' }, () => loadWarehouseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => loadWarehouseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_combo_items' }, () => loadWarehouseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => loadWarehouseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stocktakes' }, () => loadWarehouseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_transfers' }, () => loadWarehouseData()).subscribe();
    const salesChannel = supabase.channel('sales-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadSalesData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => loadSalesData()).subscribe();
    const settingsChannel = supabase.channel('settings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, () => loadSettingsData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipping_configs' }, () => loadSettingsData()).subscribe();
    const warrantyChannel = supabase.channel('warranty-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_serials' }, () => loadWarrantyData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_cards' }, () => loadWarrantyData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_repairs' }, () => loadWarrantyData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_requests' }, () => loadWarrantyData()).subscribe();
    const hrmChannel = supabase.channel('hrm-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => loadHrmData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, () => loadHrmData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => loadHrmData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_shifts' }, () => loadHrmData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hrm_attendances' }, () => loadHrmData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => loadHrmData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpi_evaluations' }, () => loadHrmData()).subscribe();

    return () => {
      supabase.removeChannel(tasksChannel); supabase.removeChannel(jobsChannel);
      supabase.removeChannel(financeChannel); supabase.removeChannel(warehouseChannel);
      supabase.removeChannel(salesChannel); supabase.removeChannel(settingsChannel);
      supabase.removeChannel(warrantyChannel); supabase.removeChannel(hrmChannel);
    };
  }, [tenant, loadUsers, loadTasks, loadTechnicalJobs, loadFinanceData, loadWarehouseData, loadSalesData, loadPermissions, loadSettingsData, loadWarrantyData, loadHrmData]);

  // ---- Load today attendance ----
  useEffect(() => {
    const loadTodayAttendances = async () => {
      if (!tenant || !currentUser) return;
      try {
        const today = getTodayVN();
        const { data } = await supabase.from('attendances').select('*')
          .eq('tenant_id', tenant.id).eq('user_id', currentUser.id).eq('date', today)
          .order('check_in', { ascending: true });
        setTodayAttendances(data || []);
      } catch (_err) { setTodayAttendances([]); }
    };
    loadTodayAttendances();
  }, [tenant, currentUser]);

  // ---- Auto refresh on visibility/focus ----
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && tenant && isLoggedIn) refreshAllData();
    };
    const handleFocus = () => { if (tenant && isLoggedIn) refreshAllData(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [tenant, isLoggedIn, refreshAllData]);

  // ---- CRUD: Tasks ----
  const changeStatus = useCallback(async (taskId, newStatus) => {
    try {
      const updateData = { status: newStatus };
      const now = new Date().toISOString();
      if (newStatus === 'Đã Quay') updateData.filmed_at = now;
      if (newStatus === 'Đang Edit') updateData.edit_started_at = now;
      if (newStatus === 'Hoàn Thành') {
        updateData.edited_at = now;
        updateData.completed_at = now;
      }
      const { error } = await supabase.from('tasks').update(updateData).eq('id', taskId);
      if (error) throw error;
      const localUpdate = { status: newStatus };
      if (updateData.filmed_at) localUpdate.filmed_at = updateData.filmed_at;
      if (updateData.edit_started_at) localUpdate.edit_started_at = updateData.edit_started_at;
      if (updateData.edited_at) localUpdate.edited_at = updateData.edited_at;
      if (updateData.completed_at) localUpdate.completed_at = updateData.completed_at;
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...localUpdate } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => ({ ...prev, ...localUpdate }));
    } catch (error) { console.error('Error updating status:', error); alert('❌ Lỗi khi cập nhật trạng thái!'); }
  }, [selectedTask]);

  const createNewTask = useCallback(async (title, platform, priority, dueDate, description, assignee, category = '', crew = [], actors = []) => {
    try {
      setLoading(true);
      const assignedUser = (allUsers || []).find(u => u.name === assignee);
      const taskTeam = assignedUser ? assignedUser.team : currentUser?.team;
      const taskData = {
        tenant_id: tenant.id, title, assignee, team: taskTeam, status: 'Nháp',
        due_date: dueDate, platform, priority, description, is_overdue: false,
        comments: [], post_links: [], cameramen: crew, editors: [], actors
      };
      if (category) taskData.category = category;
      const { error } = await supabase.from('tasks').insert([taskData]);
      if (error) throw error;
      if (assignee !== currentUser?.name && createNotification) {
        const assigneeUser = (allUsers || []).find(u => u.name === assignee);
        if (assigneeUser) {
          await createNotification({
            userId: assigneeUser.id, type: 'task_assigned',
            title: '📋 Video mới được giao',
            message: `${currentUser.name} đã giao task cho bạn: "${title}"`,
            icon: '📋', referenceType: 'task', referenceId: null
          });
        }
      }
      alert('✅ Đã tạo task mới!');
      setShowCreateTaskModal(false);
      await loadTasks();
    } catch (error) { console.error('Error creating task:', error); alert('❌ Lỗi khi tạo task: ' + (error.message || 'Unknown error')); }
    finally { setLoading(false); }
  }, [tenant, currentUser, allUsers, loadTasks, createNotification]);

  const createTechnicalJob = useCallback(async (jobData) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('technical_jobs').insert([{
        tenant_id: tenant.id, title: jobData.title, type: jobData.type,
        customer_name: jobData.customerName, customer_phone: jobData.customerPhone,
        address: jobData.address, equipment: jobData.equipment,
        technicians: jobData.technicians, scheduled_date: jobData.scheduledDate,
        scheduled_time: jobData.scheduledTime, customer_payment: jobData.customerPayment,
        created_by: jobData.createdBy || currentUser?.name, status: 'Chờ XN'
      }]);
      if (error) throw error;
      if (createNotification) {
        for (const techName of jobData.technicians) {
          if (techName !== currentUser?.name) {
            const techUser = (allUsers || []).find(u => u.name === techName);
            if (techUser) {
              await createNotification({
                userId: techUser.id, type: 'job_assigned',
                title: '🔧 Công việc kỹ thuật mới',
                message: `${currentUser.name} đã giao: "${jobData.title}" tại ${jobData.address || 'N/A'}`,
                icon: '🔧', referenceType: 'job', referenceId: null
              });
            }
          }
        }
      }
      alert('✅ Đã tạo công việc kỹ thuật!');
      setShowCreateJobModal(false);
      await loadTechnicalJobs();
    } catch (error) { console.error('Error creating technical job:', error); alert('❌ Lỗi khi tạo công việc!'); }
    finally { setLoading(false); }
  }, [tenant, currentUser, allUsers, loadTechnicalJobs, createNotification]);

  const deleteTechnicalJob = useCallback(async (jobId) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('technical_jobs').delete().eq('id', jobId);
      if (error) throw error;
      alert('✅ Đã xóa công việc!');
      setShowJobModal(false); setSelectedJob(null);
      await loadTechnicalJobs();
    } catch (error) { console.error('Error deleting job:', error); alert('❌ Lỗi khi xóa công việc!'); }
    finally { setLoading(false); }
  }, [loadTechnicalJobs]);

  const addComment = useCallback(async (taskId, commentText) => {
    if (!commentText.trim()) return;
    try {
      const task = tasks.find(t => t.id === taskId);
      const timeStr = getNowStringVN();
      const newComments = [...(task.comments || []), { user: currentUser?.name, text: commentText, time: timeStr }];
      const { error } = await supabase.from('tasks').update({ comments: newComments }).eq('id', taskId);
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, comments: newComments } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => ({ ...prev, comments: newComments }));
    } catch (error) { console.error('Error adding comment:', error); alert('❌ Lỗi khi thêm comment!'); }
  }, [tasks, currentUser, selectedTask]);

  const addPostLink = useCallback(async (taskId, url, type) => {
    if (!url.trim()) return;
    try {
      const task = tasks.find(t => t.id === taskId);
      const timeStr = getNowStringVN();
      const newLink = { url, type: type || 'Other', addedBy: currentUser?.name, addedAt: timeStr };
      const newPostLinks = [...(task.postLinks || []), newLink];
      const { error } = await supabase.from('tasks').update({ post_links: newPostLinks }).eq('id', taskId);
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, postLinks: newPostLinks } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => ({ ...prev, postLinks: newPostLinks }));
    } catch (error) { console.error('Error adding post link:', error); alert('❌ Lỗi khi thêm link!'); }
  }, [tasks, currentUser, selectedTask]);

  const removePostLink = useCallback(async (taskId, linkIndex) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      const newPostLinks = (task.postLinks || []).filter((_, i) => i !== linkIndex);
      const { error } = await supabase.from('tasks').update({ post_links: newPostLinks }).eq('id', taskId);
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, postLinks: newPostLinks } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => ({ ...prev, postLinks: newPostLinks }));
    } catch (error) { console.error('Error removing post link:', error); alert('❌ Lỗi khi xóa link!'); }
  }, [tasks, selectedTask]);

  const createFromTemplate = useCallback(async (template) => {
    try {
      setLoading(true);
      const assignee = (allUsers || []).find(u => u.team === template.team)?.name || currentUser?.name;
      const newTasks = template.tasks.map((title, i) => {
        const vn = getVietnamDate();
        vn.setDate(vn.getDate() + i + 1);
        const dueDate = vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-' + String(vn.getDate()).padStart(2, '0');
        return { title, assignee, team: template.team, status: 'Nháp', due_date: dueDate, platform: 'Campaign', is_overdue: false, comments: [], post_links: [] };
      });
      const { error } = await supabase.from('tasks').insert(newTasks);
      if (error) throw error;
      alert(`✅ Tạo ${newTasks.length} tasks từ "${template.name}"`);
      await loadTasks();
    } catch (error) { console.error('Error creating from template:', error); alert('❌ Lỗi khi tạo từ template!'); }
    finally { setLoading(false); }
  }, [allUsers, currentUser, loadTasks]);

  const deleteTask = useCallback(async (taskId) => {
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setShowModal(false);
      alert('✅ Đã xóa task!');
    } catch (error) { console.error('Error deleting task:', error); alert('❌ Lỗi khi xóa task!'); }
  }, []);

  // ---- Computed data ----
  const visibleTasks = useMemo(() => {
    if (!currentUser) return tasks;
    if (isAdmin(currentUser) || currentUser.role === 'Manager') return tasks;
    if (currentUser.role === 'Team Lead') {
      const userTeams = currentUser.teams || [currentUser.team].filter(Boolean);
      return tasks.filter(t => userTeams.includes(t.team));
    }
    return tasks.filter(t => t.assignee === currentUser.name);
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

  const value = {
    // Loading
    loading, setLoading,
    // Data
    tasks, setTasks, technicalJobs, setTechnicalJobs,
    receiptsPayments, setReceiptsPayments, debts, setDebts, salaries, setSalaries,
    attendances, setAttendances, todayAttendances, setTodayAttendances,
    products, setProducts, stockTransactions, setStockTransactions,
    warehouses, setWarehouses, warehouseStock, setWarehouseStock, comboItems,
    suppliers, stocktakes, transfers,
    orders, setOrders, customers, setCustomers,
    systemSettings, shippingConfigs, getSettingValue,
    serials, setSerials, warrantyCards, setWarrantyCards, warrantyRepairs, setWarrantyRepairs, warrantyRequests, setWarrantyRequests, loadWarrantyData,
    // HRM data
    hrmEmployees, setHrmEmployees, hrmDepartments, setHrmDepartments, hrmPositions, setHrmPositions,
    hrmWorkShifts, setHrmWorkShifts, hrmAttendances, setHrmAttendances,
    hrmLeaveRequests, setHrmLeaveRequests, hrmLeaveBalances, setHrmLeaveBalances,
    hrmKpiTemplates, setHrmKpiTemplates, hrmKpiCriteria, setHrmKpiCriteria,
    hrmKpiEvaluations, setHrmKpiEvaluations, hrmKpiEvalDetails, setHrmKpiEvalDetails,
    // Modal states
    selectedTask, setSelectedTask, showModal, setShowModal,
    showCreateTaskModal, setShowCreateTaskModal,
    showCreateJobModal, setShowCreateJobModal,
    prefillJobData, setPrefillJobData,
    selectedJob, setSelectedJob, showJobModal, setShowJobModal,
    showAttendancePopup, setShowAttendancePopup,
    // Task filters
    taskFilterTeam, setTaskFilterTeam, taskFilterStatus, setTaskFilterStatus,
    taskFilterAssignee, setTaskFilterAssignee, taskFilterCategory, setTaskFilterCategory,
    taskDateFilter, setTaskDateFilter, taskCustomStartDate, setTaskCustomStartDate,
    taskCustomEndDate, setTaskCustomEndDate,
    taskFilterCrew, setTaskFilterCrew, taskFilterActor, setTaskFilterActor,
    // Job filters
    jobFilterCreator, setJobFilterCreator, jobFilterTechnician, setJobFilterTechnician,
    jobFilterStatus, setJobFilterStatus, jobFilterMonth, setJobFilterMonth,
    jobFilterYear, setJobFilterYear, jobFilterDateMode, setJobFilterDateMode,
    jobCustomStartDate, setJobCustomStartDate, jobCustomEndDate, setJobCustomEndDate,
    // Static
    templates, automations, setAutomations, integrations, setIntegrations,
    // Draft helpers
    saveJobEditDraft, loadJobEditDraft, clearJobEditDraft,
    // Loaders
    loadTasks, loadTechnicalJobs, loadFinanceData, loadAttendanceData, loadWarehouseData, loadSalesData, loadSettingsData, loadHrmData, refreshAllData,
    // CRUD
    changeStatus, createNewTask, createTechnicalJob, deleteTechnicalJob,
    addComment, addPostLink, removePostLink, createFromTemplate, deleteTask,
    // Computed
    visibleTasks, reportData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};

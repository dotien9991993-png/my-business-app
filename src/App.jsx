import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from './supabaseClient';

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
  
  // Custom domain với subdomain: hoangnamaudio.yourdomain.com
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    // Bỏ qua www
    if (parts[0] === 'www') {
      return 'hoangnamaudio'; // www.domain.com -> default
    }
    return parts[0]; // hoangnamaudio.domain.com -> hoangnamaudio
  }
  
  // domain.com without subdomain -> default
  return 'hoangnamaudio';
};

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

  // Warehouse Module States
  const [products, setProducts] = useState([]);
  const [stockTransactions, setStockTransactions] = useState([]);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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
    if (currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'admin' || currentUser.role === 'Manager') return true;
    const perms = userPermissions[currentUser.id];
    return perms && perms.finance === 2;
  };

  const [templates] = useState([
    { id: 1, name: 'Facebook Ads Campaign', tasks: ['Thiết kế creative', 'Viết copy', 'Setup ads', 'Launch'], team: 'Performance' },
    { id: 2, name: 'Blog Weekly', tasks: ['Research', 'Viết bài', 'Thiết kế ảnh', 'SEO', 'Đăng bài'], team: 'Content' },
    { id: 3, name: 'Social Daily', tasks: ['Tạo content', 'Thiết kế', 'Lên lịch'], team: 'Content' }
  ]);

  const [automations, setAutomations] = useState([
    { id: 1, name: 'Auto-approve', trigger: 'Task hoàn thành', action: 'Chuyển Chờ Duyệt', active: true },
    { id: 2, name: 'Nhắc deadline', trigger: 'Trước 24h', action: 'Gửi Slack', active: true },
    { id: 3, name: 'Task quá hạn', trigger: 'Quá deadline', action: 'Email Manager', active: false }
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
  // Restore session từ localStorage khi load trang
  useEffect(() => {
    if (!tenant) return; // Chờ tenant load xong
    
    const savedUser = localStorage.getItem(`${tenant.slug}_user`);
    const savedLoggedIn = localStorage.getItem(`${tenant.slug}_loggedIn`);
    
    if (savedUser && savedLoggedIn === 'true') {
      try {
        const user = JSON.parse(savedUser);
        // Verify user belongs to this tenant
        if (user.tenant_id === tenant.id) {
          setCurrentUser(user);
          setIsLoggedIn(true);
          // Set default route if no hash
          if (!window.location.hash) {
            navigate('media/dashboard');
          }
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

  // Check deadline notifications
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;
    
    checkDeadlineNotifications();
    const interval = setInterval(checkDeadlineNotifications, 30 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [tasks, currentUser, isLoggedIn]);

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
        description: task.description
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
        createdAt: job.created_at
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

  const createNewTask = async (title, platform, priority, dueDate, description, assignee) => {
    try {
      setLoading(true);
      
      // Get team of assignee
      const assignedUser = allUsers.find(u => u.name === assignee);
      const taskTeam = assignedUser ? assignedUser.team : currentUser.team;
      
      const { error } = await supabase
        .from('tasks')
        .insert([{
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
        }]);
      
      if (error) throw error;
      
      // Notify assignee if different from creator
      if (assignee !== currentUser.name) {
        addNotification({
          type: 'assigned',
          taskId: null,
          title: '📋 Task mới',
          message: `${currentUser.name} đã giao task cho bạn: "${title}"`,
          read: false,
          createdAt: new Date().toISOString()
        });
      }
      
      alert('✅ Đã tạo task mới!');
      setShowCreateTaskModal(false);
      await loadTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      alert('❌ Lỗi khi tạo task!');
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
      jobData.technicians.forEach(techName => {
        if (techName !== currentUser.name) {
          addNotification({
            type: 'assigned',
            taskId: null,
            title: '🔧 Công việc mới',
            message: `${currentUser.name} đã giao công việc: "${jobData.title}"`,
            read: false,
            createdAt: new Date().toISOString()
          });
        }
      });
      
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
      const now = new Date();
      const timeStr = now.toISOString().slice(0, 16).replace('T', ' ');
      
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
          createdAt: new Date().toISOString()
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
      const now = new Date();
      const timeStr = now.toISOString().slice(0, 16).replace('T', ' ');
      
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
      
      const newTasks = template.tasks.map((title, i) => ({
        title,
        assignee,
        team: template.team,
        status: 'Nháp',
        due_date: new Date(Date.now() + (i + 1) * 86400000).toISOString().split('T')[0],
        platform: 'Campaign',
        is_overdue: false,
        comments: [],
        post_links: []
      }));
      
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

  // Notification functions
  const addNotification = (notif) => {
    setNotifications(prev => [notif, ...prev]);
    setUnreadCount(prev => prev + 1);
  };

  const markAsRead = (index) => {
    setNotifications(prev => 
      prev.map((n, i) => i === index ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const deleteNotification = (index) => {
    const notif = notifications[index];
    setNotifications(prev => prev.filter((_, i) => i !== index));
    if (!notif.read) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const checkDeadlineNotifications = () => {
    if (!currentUser || !tasks.length) return;
    
    const now = new Date();
    tasks.forEach(task => {
      if (task.assignee !== currentUser.name) return;
      if (task.status === 'Hoàn Thành') return;
      
      const dueDate = new Date(task.dueDate);
      const diffHours = (dueDate - now) / (1000 * 60 * 60);
      
      if (diffHours > 0 && diffHours <= 24) {
        const existingNotif = notifications.find(n => 
          n.type === 'deadline' && n.taskId === task.id
        );
        
        if (!existingNotif) {
          addNotification({
            type: 'deadline',
            taskId: task.id,
            title: '⏰ Sắp đến deadline',
            message: `Task "${task.title}" sẽ đến hạn trong ${Math.floor(diffHours)} giờ`,
            read: false,
            createdAt: new Date().toISOString()
          });
        }
      }
    });
  };

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

    const teamStats = ['Content', 'Design', 'Performance'].map(t => ({
      name: t,
      completed: tasksToUse.filter(x => x.team === t && x.status === 'Hoàn Thành').length,
      inProgress: tasksToUse.filter(x => x.team === t && x.status === 'Đang Làm').length
    }));

    return { statusStats, teamStats };
  }, [visibleTasks]);

  const getStatusColor = (s) => {
    const c = { 'Nháp': 'bg-gray-200 text-gray-700', 'Chờ Duyệt': 'bg-yellow-200 text-yellow-800', 'Đã Duyệt': 'bg-green-200 text-green-800', 'Đang Làm': 'bg-orange-200 text-orange-800', 'Hoàn Thành': 'bg-green-500 text-white' };
    return c[s] || 'bg-gray-200';
  };

  const getTeamColor = (t) => {
    const c = { 'Content': 'bg-blue-100 text-blue-700', 'Design': 'bg-purple-100 text-purple-700', 'Performance': 'bg-green-100 text-green-700' };
    return c[t] || 'bg-gray-100';
  };

  const NotificationsDropdown = () => {
    if (!showNotifications) return null;
    
    return (
      <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-2xl border z-50 max-h-[500px] overflow-hidden flex flex-col">
        <div className="p-4 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">🔔 Thông Báo</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full"
              >
                Đánh dấu đã đọc
              </button>
            )}
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
              {notifications.map((notif, index) => (
                <div
                  key={index}
                  className={`p-4 hover:bg-gray-50 cursor-pointer ${!notif.read ? 'bg-blue-50' : ''}`}
                  onClick={() => markAsRead(index)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{notif.title}</span>
                        {!notif.read && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
                      </div>
                      <p className="text-sm text-gray-600">{notif.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(notif.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(index);
                      }}
                      className="text-gray-400 hover:text-red-500 text-xl"
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
          <div className="p-3 border-t bg-gray-50 text-center">
            <button
              onClick={() => {
                setNotifications([]);
                setUnreadCount(0);
              }}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              🗑️ Xóa tất cả
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
      return allUsers.filter(u => 
        u.departments && u.departments.includes('technical')
      );
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

    if (!selectedJob) return null;

    const updateJobStatus = async (newStatus) => {
      // Block nếu status hiện tại đã lock
      if (selectedJob.status === 'Hoàn thành' || selectedJob.status === 'Hủy') {
        alert('⚠️ Không thể thay đổi trạng thái!\n\nCông việc đã ' + 
              (selectedJob.status === 'Hoàn thành' ? 'hoàn thành' : 'bị hủy') + 
              ' và đã bị khóa.');
        return;
      }

      // Confirm khi chuyển sang status cuối
      if (newStatus === 'Hoàn thành' || newStatus === 'Hủy') {
        const message = newStatus === 'Hoàn thành' 
          ? '✅ Xác nhận hoàn thành công việc?\n\n⚠️ Sau khi hoàn thành, bạn KHÔNG THỂ thay đổi trạng thái nữa!'
          : '❌ Xác nhận hủy công việc?\n\n⚠️ Sau khi hủy, bạn KHÔNG THỂ thay đổi trạng thái nữa!';
        
        if (!window.confirm(message)) {
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
              createdAt: new Date().toISOString()
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
      return allUsers.filter(u => 
        u.departments && u.departments.includes('technical')
      );
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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b bg-gradient-to-r from-orange-500 to-red-600 text-white sticky top-0">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">{selectedJob.title}</h2>
                <div className="flex gap-2">
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
                className="text-2xl hover:bg-white/20 w-8 h-8 rounded"
              >
                ×
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
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
                  {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.departments && currentUser.departments.includes('sales'))) && (
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
                <div className="text-sm">
                  <div className="text-2xl font-bold text-green-700">
                    {selectedJob.customerPayment.toLocaleString('vi-VN')} VNĐ
                  </div>
                </div>
              </div>
            )}

            {/* Change Status */}
            <div className="border-t pt-4">
              <h3 className="font-bold mb-3">🔄 Thay đổi trạng thái</h3>
              
              {(selectedJob.status === 'Hoàn thành' || selectedJob.status === 'Hủy') ? (
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
          </div>

          <div className="p-6 border-t bg-gray-50 flex gap-3">
            {currentUser.role === 'Admin' || currentUser.role === 'admin' && (
              <button
                onClick={() => {
                  if (window.confirm('⚠️ Xóa công việc này?\n\nHành động không thể hoàn tác!')) {
                    deleteTechnicalJob(selectedJob.id);
                  }
                }}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
              >
                🗑️ Xóa
              </button>
            )}
            <button
              onClick={() => setShowJobModal(false)}
              className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
            >
              Đóng
            </button>
          </div>
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
                <option value="Design">Design</option>
                <option value="Performance">Performance</option>
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
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">📝 Công việc của tôi</h2>
          <p className="text-gray-600">
            {myTasks.length} task • {myTasks.filter(t => t.status === 'Hoàn Thành').length} hoàn thành
          </p>
        </div>

        <div className="grid gap-4">
          {myTasks.map(task => (
            <div
              key={task.id}
              onClick={() => {
                setSelectedTask(task);
                setShowModal(true);
              }}
              className={`bg-white p-6 rounded-xl shadow hover:shadow-lg transition-all cursor-pointer border-l-4 ${
                task.isOverdue ? 'border-red-500' : 'border-blue-500'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">{task.title}</h3>
                  <div className="flex gap-2 flex-wrap">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTeamColor(task.team)}`}>
                      {task.team}
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
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Xin chào, {currentUser.name}! 👋</h2>
        <p className="text-gray-600">{currentUser.role} • {currentUser.team} Team</p>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        {[
          { l: 'Tổng Tasks', v: visibleTasks.length, i: '📊', c: 'blue' },
          { l: 'Hoàn Thành', v: visibleTasks.filter(t => t.status === 'Hoàn Thành').length, i: '✅', c: 'green' },
          { l: 'Đang Làm', v: visibleTasks.filter(t => t.status === 'Đang Làm').length, i: '⏳', c: 'yellow' },
          { l: 'Quá Hạn', v: visibleTasks.filter(t => t.isOverdue).length, i: '⚠️', c: 'red' }
        ].map((s, i) => (
          <div key={i} className={`bg-${s.c}-50 p-6 rounded-xl border-2 border-${s.c}-200`}>
            <div className="text-3xl mb-2">{s.i}</div>
            <div className="text-3xl font-bold mb-1">{s.v}</div>
            <div className="text-sm text-gray-600">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Chi tiết các trạng thái */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="text-lg font-bold mb-4">📋 Chi Tiết Trạng Thái</h3>
        <div className="grid md:grid-cols-5 gap-4">
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
              <div key={item.status} className={`${item.color} p-4 rounded-lg`}>
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="text-2xl font-bold mb-1">{count}</div>
                <div className="text-xs font-medium mb-1">{item.status}</div>
                <div className="text-xs opacity-75">{percentage}%</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-bold mb-4">📊 Trạng thái Tasks</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={reportData.statusStats} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
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
        <h3 className="text-lg font-bold mb-4">🎯 Tasks Gần Nhất</h3>
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
    const [filterTeam, setFilterTeam] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterAssignee, setFilterAssignee] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [showCustomDate, setShowCustomDate] = useState(false);

    // Helper: Get date range based on filter (Vietnam timezone UTC+7)
    const getDateRange = () => {
      // Get current date in Vietnam timezone (UTC+7)
      const now = new Date();
      const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
      const today = new Date(vietnamTime.getFullYear(), vietnamTime.getMonth(), vietnamTime.getDate());
      
      switch(dateFilter) {
        case 'today': {
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return { start: today, end: tomorrow };
        }
        case 'week': {
          const weekEnd = new Date(today);
          weekEnd.setDate(weekEnd.getDate() + 7);
          return { start: today, end: weekEnd };
        }
        case 'month': {
          const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          return { start: today, end: monthEnd };
        }
        case 'overdue': {
          return { start: new Date(2000, 0, 1), end: today };
        }
        case 'custom': {
          if (!customStartDate || !customEndDate) return null;
          return { 
            start: new Date(customStartDate), 
            end: new Date(customEndDate) 
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
      
      // Date filter (Vietnam timezone)
      if (dateFilter !== 'all') {
        const range = getDateRange();
        if (!range) return false;
        
        // Parse task date in Vietnam timezone
        const taskDateStr = new Date(t.dueDate);
        const taskDate = new Date(taskDateStr.getFullYear(), taskDateStr.getMonth(), taskDateStr.getDate());
        
        if (dateFilter === 'overdue') {
          // Overdue: deadline < today AND not completed
          if (!(taskDate < range.end && t.status !== 'Hoàn Thành')) return false;
        } else {
          // Other filters: within range
          if (!(taskDate >= range.start && taskDate <= range.end)) return false;
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
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">📋 Quản Lý Tasks</h2>
          <button
            onClick={() => setShowCreateTaskModal(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            ➕ Tạo Task Mới
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl shadow mb-6">
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="text-sm font-medium mb-2 block">Team</label>
              <select
                value={filterTeam}
                onChange={(e) => setFilterTeam(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tất cả</option>
                <option value="Content">Content</option>
                <option value="Design">Design</option>
                <option value="Performance">Performance</option>
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
                <option value="Chờ Duyệt">Chờ Duyệt</option>
                <option value="Đã Duyệt">Đã Duyệt</option>
                <option value="Đang Làm">Đang Làm</option>
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
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-6">📅 Lịch Tasks</h2>
        
        <div className="bg-white p-6 rounded-xl shadow">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">{monthNames[today.getMonth()]} {today.getFullYear()}</h3>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">◀ Trước</button>
              <button className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Sau ▶</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {daysOfWeek.map(day => (
              <div key={day} className="text-center font-bold py-2">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
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
          <h3 className="text-lg font-bold mb-4">📌 Tasks Sắp Tới</h3>
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

      const teamStats = ['Content', 'Design', 'Performance'].map(t => ({
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
      <div className="p-6 space-y-6">
        {/* Header với Date Range Filter */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">📈 Báo Cáo & Phân Tích</h2>
            <p className="text-sm text-gray-600 mt-1">
              Dữ liệu từ {filteredTasks.length} tasks trong khoảng thời gian đã chọn
            </p>
          </div>

          {/* Date Range Selector */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDateRange('today')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
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
            <div className="text-sm text-gray-600">Tasks Hoàn Thành</div>
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
            <div className="text-sm text-gray-600">Tasks Quá Hạn</div>
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
              <div className="text-sm text-gray-600">Tổng Tasks</div>
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

  const TechnicalJobsView = () => {
    const visibleJobs = technicalJobs.filter(job => {
      // Admin và Manager thấy tất cả
      if (currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager') return true;
      
      // Technical members thấy jobs được assign
      if (currentUser.departments && currentUser.departments.includes('technical')) {
        if (job.technicians && job.technicians.includes(currentUser.name)) return true;
      }
      
      // Sales thấy jobs mình tạo
      if (currentUser.departments && currentUser.departments.includes('sales')) {
        if (job.createdBy === currentUser.name) return true;
      }
      
      return false;
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

    return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">🔧 Công Việc Kỹ Thuật</h2>
          <button
            onClick={() => setShowCreateJobModal(true)}
            className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"
          >
            ➕ Tạo Công Việc
          </button>
        </div>

        <div className="grid gap-4">
          {visibleJobs.length === 0 ? (
            <div className="bg-white p-12 rounded-xl text-center text-gray-500">
              <div className="text-6xl mb-4">🔧</div>
              <div className="text-xl">Chưa có công việc nào</div>
            </div>
          ) : (
            visibleJobs.map(job => (
              <div
                key={job.id}
                onClick={() => {
                  setSelectedJob(job);
                  setShowJobModal(true);
                }}
                className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition-all cursor-pointer border-l-4 border-orange-500"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold mb-2">{job.title}</h3>
                    <div className="flex gap-2 flex-wrap">
                      <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                      <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm">
                        {job.type}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <span>👤</span>
                    <span>{job.customerName} - {job.customerPhone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📍</span>
                    <span>{job.address}</span>
                  </div>
                  {job.createdBy && (
                    <div className="flex items-center gap-2">
                      <span>📝</span>
                      <span>Người tạo: {job.createdBy}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span>🔧</span>
                    <span>Kỹ thuật viên: {job.technicians ? job.technicians.join(', ') : job.technician}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📅</span>
                    <span>{job.scheduledDate} {job.scheduledTime && `- ${job.scheduledTime}`}</span>
                  </div>
                  {job.customerPayment > 0 && (
                    <div className="flex items-center gap-2">
                      <span>💰</span>
                      <span>Thu: {job.customerPayment.toLocaleString('vi-VN')} VNĐ</span>
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
                          team === 'Design' ? 'bg-purple-100 text-purple-700' :
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
      { id: 'Kỹ Thuật', name: 'Kỹ Thuật', color: 'orange', emoji: '🔧' },
      { id: 'Sale', name: 'Sale', color: 'green', emoji: '💼' }
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
      const inProgress = userTasks.filter(t => ['Nháp', 'Chờ Duyệt', 'Đã Duyệt', 'Đang Làm'].includes(t.status));
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
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
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
            <div className="text-sm opacity-90 mb-2">Tổng Tasks</div>
            <div className="text-4xl font-bold mb-2">{myMetrics?.total || 0}</div>
            <div className="text-sm opacity-75">Tasks được giao</div>
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
            <div className="text-sm opacity-75">Tasks đang xử lý</div>
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
              <Bar dataKey="created" fill="#3b82f6" name="Tasks mới" />
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
                      <span className={`px-3 py-1 rounded-full text-sm ${user.team === 'Content' ? 'bg-blue-100 text-blue-700' : user.team === 'Design' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
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
    const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    const [assignee, setAssignee] = useState(currentUser.name);

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
            <h2 className="text-2xl font-bold">➕ Tạo Task Mới</h2>
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
                  createNewTask(title, platform.join(', '), priority, dueDate, description, assignee);
                }}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                ✅ Tạo Task
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

    if (!selectedTask) return null;

    const platforms = ['Facebook', 'Instagram', 'TikTok', 'Blog', 'Ads', 'Email'];

    const openEditMode = () => {
      setEditTitle(selectedTask.title || '');
      setEditPlatform(selectedTask.platform ? selectedTask.platform.split(', ') : []);
      setEditPriority(selectedTask.priority || '');
      setEditDueDate(selectedTask.dueDate || '');
      setEditDescription(selectedTask.description || '');
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
            description: editDescription
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
          description: editDescription
        });
      } catch (error) {
        console.error('Error updating task:', error);
        alert('❌ Lỗi khi cập nhật task!');
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
            title: '📋 Task được chuyển giao',
            message: `${currentUser.name} đã chuyển task "${selectedTask.title}" cho bạn`,
            read: false,
            createdAt: new Date().toISOString()
          });
        }

        setShowReassign(false);
        alert('✅ Đã chuyển giao task!');
        await loadTasks();
        setShowModal(false);
      } catch (error) {
        console.error('Error reassigning task:', error);
        alert('❌ Lỗi khi chuyển giao task!');
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
                <h4 className="font-bold text-lg mb-3 text-blue-900">✏️ Chỉnh Sửa Task</h4>
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowEditTask(false)}
                      className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={saveEditTask}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                    >
                      💾 Lưu thay đổi
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showReassign && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <h4 className="font-bold text-lg mb-3 text-yellow-900">🔄 Chuyển Giao Task</h4>
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
                {['Nháp', 'Chờ Duyệt', 'Đã Duyệt', 'Đang Làm', 'Hoàn Thành'].map(s => (
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
                onClick={() => setShowModal(false)}
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
              <button
                onClick={() => {
                  alert('✅ Đã lưu thay đổi!');
                  setShowModal(false);
                }}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                💾 Lưu
              </button>
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
          updated_at: new Date().toISOString()
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
          stock_quantity: newQuantity, updated_at: new Date().toISOString()
        }).eq('id', selectedProduct.id);

        await supabase.from('stock_transactions').insert([{
          tenant_id: tenant.id, transaction_number: `ADJ-${Date.now()}`,
          type: adjustType === 'subtract' ? 'export' : 'import',
          transaction_date: new Date().toISOString().split('T')[0],
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
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formNote, setFormNote] = useState('');
    const [formItems, setFormItems] = useState([{ product_id: '', quantity: 1, unit_price: 0 }]);

    const importTransactions = stockTransactions.filter(t => t.type === 'import');

    const resetForm = () => {
      setFormPartnerName('');
      setFormPartnerPhone('');
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormNote('');
      setFormItems([{ product_id: '', quantity: 1, unit_price: 0 }]);
    };

    const generateTransactionNumber = () => {
      const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
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
              updated_at: new Date().toISOString()
            }).eq('id', item.product_id);
          }
        }

        alert('✅ Nhập kho thành công!');
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
                const today = new Date().toISOString().split('T')[0];
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
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formNote, setFormNote] = useState('');
    const [formItems, setFormItems] = useState([{ product_id: '', quantity: 1, unit_price: 0 }]);

    const exportTransactions = stockTransactions.filter(t => t.type === 'export');

    const resetForm = () => {
      setFormPartnerName('');
      setFormPartnerPhone('');
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormNote('');
      setFormItems([{ product_id: '', quantity: 1, unit_price: 0 }]);
    };

    const generateTransactionNumber = () => {
      const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
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
              updated_at: new Date().toISOString()
            }).eq('id', item.product_id);
          }
        }

        alert('✅ Xuất kho thành công!');
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
                const today = new Date().toISOString().split('T')[0];
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
              <img src="/logo.png?v=2" alt="Logo" className="h-10 w-auto" />
            </div>
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

          {/* Desktop Header */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center gap-4">
              <img src={tenant.logo_url || "/logo.png?v=2"} alt={tenant.name} className="h-12 w-auto" />
              <div>
                <h1 className="text-2xl font-bold">{tenant.name}</h1>
                <p className="text-gray-600 text-sm">{tenant.slogan || 'Làm việc hăng say, tiền ngay về túi'}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
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
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm"
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
          <div className="fixed left-0 top-0 bottom-0 w-80 bg-white z-50 shadow-xl md:hidden overflow-y-auto">
            <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-bold">Menu</h2>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-1 hover:bg-white/20 rounded"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="text-sm opacity-90">{currentUser.name}</div>
              <div className="text-xs opacity-75">{currentUser.role} • {currentUser.team}</div>
            </div>

            {/* Module Selection */}
            <div className="p-4 border-b">
              <div className="text-xs font-semibold text-gray-500 mb-2">BỘ PHẬN</div>
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.departments && currentUser.departments.includes('media'))) && (
                <button
                  onClick={() => {
                    navigateTo('media', 'dashboard');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg mb-2 font-medium text-left ${
                    activeModule === 'media'
                      ? 'bg-blue-100 text-blue-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  🎬 Media
                </button>
              )}
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.departments && currentUser.departments.includes('warehouse'))) && (
                <button
                  onClick={() => {
                    navigateTo('warehouse', 'inventory');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg mb-2 font-medium text-left ${
                    activeModule === 'warehouse'
                      ? 'bg-amber-100 text-amber-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  📦 Kho
                </button>
              )}
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.departments && currentUser.departments.includes('sales'))) && (
                <button
                  onClick={() => {
                    navigateTo('sales', 'orders');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg mb-2 font-medium text-left ${
                    activeModule === 'sales'
                      ? 'bg-pink-100 text-pink-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  🛒 Sale
                </button>
              )}
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.departments && currentUser.departments.includes('technical'))) && (
                <button
                  onClick={() => {
                    navigateTo('technical', 'jobs');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg mb-2 font-medium text-left ${
                    activeModule === 'technical'
                      ? 'bg-orange-100 text-orange-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  🔧 Kỹ Thuật
                </button>
              )}
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager' || (currentUser.departments && currentUser.departments.includes('finance'))) && (
                <button
                  onClick={() => {
                    navigateTo('finance', 'dashboard');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg font-medium text-left ${
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
              <div className="p-4 border-b bg-purple-50">
                <div className="text-xs font-semibold text-purple-700 mb-2">ADMIN</div>
                <button
                  onClick={() => {
                    navigateTo('media', 'automation');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg mb-2 font-medium text-left ${
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
                  className={`w-full px-4 py-3 rounded-lg font-medium text-left ${
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
            <div className="p-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">CHỨC NĂNG</div>
              {(activeModule === 'media' ? [
                { id: 'mytasks', l: '📝 Của Tôi', show: true },
                { id: 'dashboard', l: '📊 Dashboard', show: true },
                { id: 'tasks', l: '📋 Tasks', show: true },
                { id: 'calendar', l: '📅 Lịch', show: true },
                { id: 'report', l: '📈 Báo Cáo', show: true },
                { id: 'performance', l: '📊 Hiệu Suất', show: true },
                { id: 'integrations', l: '🔗 Tích Hợp', show: true }
              ] : activeModule === 'warehouse' ? [
                { id: 'inventory', l: '📦 Tồn Kho', show: true },
                { id: 'import', l: '📥 Nhập Kho', show: true },
                { id: 'export', l: '📤 Xuất Kho', show: true },
                { id: 'history', l: '📋 Lịch Sử', show: true }
              ] : activeModule === 'sales' ? [
                { id: 'orders', l: '🛒 Đơn Hàng', show: true },
                { id: 'customers', l: '👥 Khách Hàng', show: true },
                { id: 'products', l: '📱 Sản Phẩm', show: true },
                { id: 'report', l: '📈 Báo Cáo', show: true }
              ] : activeModule === 'technical' ? [
                { id: 'jobs', l: '📋 Công Việc', show: true },
                { id: 'integrations', l: '🔗 Tích Hợp', show: true }
              ] : activeModule === 'finance' ? [
                { id: 'dashboard', l: '📊 Tổng Quan', show: true },
                { id: 'receipts', l: '🧾 Thu/Chi', show: true },
                { id: 'debts', l: '📋 Công Nợ', show: true },
                { id: 'salaries', l: '💰 Lương', show: true },
                { id: 'reports', l: '📈 Báo Cáo', show: true }
              ] : []).filter(t => t.show).map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    navigateTo(activeModule, t.id);
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg mb-1 text-left font-medium ${
                    activeTab === t.id
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>

            {/* Admin Buttons */}
            <div className="p-4 border-t space-y-2">
              {(currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'admin') && (
                <button
                  onClick={() => {
                    setShowPermissionsModal(true);
                    setShowMobileSidebar(false);
                  }}
                  className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
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
                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
              >
                🚪 Đăng xuất
              </button>
            </div>
          </div>
        </>
      )}

      {/* Module Selector - Desktop Only */}
      <div className="hidden md:block bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-6 flex gap-2">
          {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.departments && currentUser.departments.includes('media'))) && (
            <button
              onClick={() => navigateTo('media', 'dashboard')}
              className={`px-6 py-4 font-bold text-lg transition-all ${
                activeModule === 'media'
                  ? 'bg-white text-blue-600'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🎬 Media
            </button>
          )}
          {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.departments && currentUser.departments.includes('warehouse'))) && (
            <button
              onClick={() => navigateTo('warehouse', 'inventory')}
              className={`px-6 py-4 font-bold text-lg transition-all ${
                activeModule === 'warehouse'
                  ? 'bg-white text-amber-600'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              📦 Kho
            </button>
          )}
          {(currentUser.role === 'Admin' || currentUser.role === 'admin' || (currentUser.departments && currentUser.departments.includes('sales'))) && (
            <button
              onClick={() => navigateTo('sales', 'orders')}
              className={`px-6 py-4 font-bold text-lg transition-all ${
                activeModule === 'sales'
                  ? 'bg-white text-pink-600'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🛒 Sale
            </button>
          )}
          {(currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager' || (currentUser.departments && currentUser.departments.includes('technical'))) && (
            <button
              onClick={() => navigateTo('technical', 'jobs')}
              className={`px-6 py-4 font-bold text-lg transition-all ${
                activeModule === 'technical'
                  ? 'bg-white text-orange-600'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🔧 Kỹ Thuật
            </button>
          )}
          {(currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager' || (currentUser.departments && currentUser.departments.includes('finance'))) && (
            <button
              onClick={() => navigateTo('finance', 'dashboard')}
              className={`px-6 py-4 font-bold text-lg transition-all ${
                activeModule === 'finance'
                  ? 'bg-white text-green-600'
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
            { id: 'tasks', l: '📋 Tasks' },
            { id: 'calendar', l: '📅 Lịch' },
            { id: 'report', l: '📈 Báo Cáo' },
            { id: 'performance', l: '📊 Hiệu Suất' },
            { id: 'integrations', l: '🔗 Tích Hợp' }
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
            { id: 'jobs', l: '📋 Công Việc' },
            { id: 'integrations', l: '🔗 Tích Hợp' }
          ] : activeModule === 'finance' ? [
            { id: 'dashboard', l: '📊 Tổng Quan' },
            { id: 'receipts', l: '🧾 Thu/Chi' },
            { id: 'debts', l: '📋 Công Nợ' },
            { id: 'salaries', l: '💰 Lương' },
            { id: 'reports', l: '📈 Báo Cáo' }
          ] : []).map(t => (
            <button key={t.id} onClick={() => navigateTo(activeModule, t.id)} className={`px-6 py-3 font-medium border-b-4 whitespace-nowrap ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'}`}>
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
            { id: 'tasks', l: '📋 Tasks' },
            { id: 'calendar', l: '📅 Lịch' },
            { id: 'report', l: '📈 Báo Cáo' },
            { id: 'performance', l: '📊 Hiệu Suất' },
            { id: 'integrations', l: '🔗 Tích Hợp' },
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
            { id: 'jobs', l: '📋 Công Việc' },
            { id: 'integrations', l: '🔗 Tích Hợp' }
          ] : activeModule === 'finance' ? [
            { id: 'dashboard', l: '📊 Tổng Quan' },
            { id: 'receipts', l: '🧾 Thu/Chi' },
            { id: 'debts', l: '📋 Công Nợ' },
            { id: 'salaries', l: '💰 Lương' },
            { id: 'reports', l: '📈 Báo Cáo' }
          ] : []).find(t => t.id === activeTab)?.l || ''}
        </h2>
      </div>

      <div className="max-w-7xl mx-auto pb-20 md:pb-0">
        {activeModule === 'media' && (
          <>
            {activeTab === 'mytasks' && <MyTasksView />}
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'tasks' && <TasksView />}
            {activeTab === 'calendar' && <CalendarView />}
            {activeTab === 'report' && <ReportView />}
            {activeTab === 'integrations' && <IntegrationsView />}
            {activeTab === 'automation' && <AutomationView />}
            {activeTab === 'users' && <UserManagementView />}
            {activeTab === 'performance' && <PerformanceView />}
          </>
        )}
        {activeModule === 'warehouse' && (
          <>
            {activeTab === 'inventory' && <WarehouseInventoryView />}
            {activeTab === 'import' && <WarehouseImportView />}
            {activeTab === 'export' && <WarehouseExportView />}
            {activeTab === 'history' && <WarehouseHistoryView />}
          </>
        )}
        {activeModule === 'sales' && (
          <>
            {activeTab === 'orders' && <SalesOrdersView />}
            {activeTab === 'customers' && <SalesCustomersView />}
            {activeTab === 'products' && <SalesProductsView />}
            {activeTab === 'report' && <SalesReportView />}
          </>
        )}
        {activeModule === 'technical' && (
          <>
            {activeTab === 'jobs' && <TechnicalJobsView />}
            {activeTab === 'integrations' && <IntegrationsView />}
          </>
        )}
        {activeModule === 'finance' && (
          <>
            {activeTab === 'dashboard' && <FinanceDashboard />}
            {activeTab === 'receipts' && <ReceiptsView />}
            {activeTab === 'debts' && <DebtsView />}
            {activeTab === 'salaries' && <SalariesView />}
            {activeTab === 'reports' && <ReportsView />}
          </>
        )}
      </div>

      {showModal && <TaskModal />}
      {showCreateTaskModal && <CreateTaskModal />}
      {showCreateJobModal && <CreateJobModal />}
      {showJobModal && <JobDetailModal />}
      {showPermissionsModal && <PermissionsModal />}
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
    const totalReceipts = receiptsPayments
      .filter(r => r.type === 'thu' && r.status === 'approved')
      .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    
    const totalPayments = receiptsPayments
      .filter(r => r.type === 'chi' && r.status === 'approved')
      .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    
    const netCashFlow = totalReceipts - totalPayments;

    return (
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-bold">💰 Tổng Quan Tài Chính</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-6 rounded-xl border border-green-200">
            <div className="text-sm text-green-600 font-medium mb-1">Tổng Thu</div>
            <div className="text-2xl font-bold text-green-700">
              {(totalReceipts / 1000000).toFixed(1)}M
            </div>
          </div>
          
          <div className="bg-red-50 p-6 rounded-xl border border-red-200">
            <div className="text-sm text-red-600 font-medium mb-1">Tổng Chi</div>
            <div className="text-2xl font-bold text-red-700">
              {(totalPayments / 1000000).toFixed(1)}M
            </div>
          </div>
          
          <div className={`p-6 rounded-xl border ${netCashFlow >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className={`text-sm font-medium mb-1 ${netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              Dòng Tiền
            </div>
            <div className={`text-2xl font-bold ${netCashFlow >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
              {(netCashFlow / 1000000).toFixed(1)}M
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-bold text-lg mb-4">📊 Chi Tiết Gần Đây</h3>
          <div className="space-y-2">
            {receiptsPayments.slice(0, 5).map(r => (
              <div key={r.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium">{r.receipt_number}</div>
                  <div className="text-sm text-gray-500">{r.description || 'Không có mô tả'}</div>
                </div>
                <div className={`font-bold ${r.type === 'thu' ? 'text-green-600' : 'text-red-600'}`}>
                  {r.type === 'thu' ? '+' : '-'}{(parseFloat(r.amount) / 1000000).toFixed(1)}M
                </div>
              </div>
            ))}
            {receiptsPayments.length === 0 && (
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
    const [filterType, setFilterType] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchText, setSearchText] = useState('');
    const [formType, setFormType] = useState('thu');
    const [formAmount, setFormAmount] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formNote, setFormNote] = useState('');

    const categories = {
      thu: ['Bán tại cửa hàng', 'Lắp đặt tại nhà khách', 'Thu nợ của khách', 'Khác'],
      chi: ['Nhập hàng', 'Lương nhân viên', 'Tiền thuê mặt bằng', 'Điện nước', 'Marketing', 'Vận chuyển', 'Khác']
    };

    const canViewAll = hasFinanceFullAccess();
    const filteredReceipts = receiptsPayments.filter(r => {
      if (!canViewAll && r.created_by !== currentUser.name) return false;
      if (filterType !== 'all' && r.type !== filterType) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (searchText && !r.description?.toLowerCase().includes(searchText.toLowerCase()) && !r.receipt_number?.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });

    const generateReceiptNumber = (type) => {
      const prefix = type === 'thu' ? 'PT' : 'PC';
      const date = new Date();
      const dateStr = date.getFullYear().toString() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return prefix + '-' + dateStr + '-' + random;
    };

    const resetForm = () => {
      setFormAmount('');
      setFormDescription('');
      setFormCategory('');
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormNote('');
    };

    const openDetailModal = (receipt) => {
      setSelectedReceipt(receipt);
      setFormType(receipt.type);
      setFormAmount(receipt.amount.toString());
      setFormDescription(receipt.description || '');
      setFormCategory(receipt.category || '');
      setFormDate(receipt.receipt_date ? receipt.receipt_date.split('T')[0] : new Date().toISOString().split('T')[0]);
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
        created_at: new Date().toISOString()
      };
      try {
        const { error } = await supabase.from('receipts_payments').insert([newReceipt]);
        if (error) throw error;
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
        const { error } = await supabase.from('receipts_payments').update({ 
          status: 'approved',
          approved_by: currentUser.name,
          approved_at: new Date().toISOString()
        }).eq('id', id);
        if (error) throw error;
        alert('Đã duyệt!');
        setShowDetailModal(false);
        loadFinanceData();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handleReject = async (id) => {
      try {
        const { error } = await supabase.from('receipts_payments').update({ 
          status: 'rejected',
          approved_by: currentUser.name,
          approved_at: new Date().toISOString()
        }).eq('id', id);
        if (error) throw error;
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

    const canApprove = currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'admin' || currentUser.role === 'Manager';
    const totalThu = filteredReceipts.filter(r => r.type === 'thu').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    const totalChi = filteredReceipts.filter(r => r.type === 'chi').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    return (
      <div className="p-6 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold">🧾 Phiếu Thu/Chi</h2>
          <div className="flex gap-2">
            <button onClick={() => { setFormType('thu'); resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
              ➕ Tạo Phiếu Thu
            </button>
            <button onClick={() => { setFormType('chi'); resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
              ➕ Tạo Phiếu Chi
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-sm text-green-600 font-medium">Tổng Thu</div>
            <div className="text-2xl font-bold text-green-700">+{(totalThu / 1000000).toFixed(1)}M</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-sm text-red-600 font-medium">Tổng Chi</div>
            <div className="text-2xl font-bold text-red-700">-{(totalChi / 1000000).toFixed(1)}M</div>
          </div>
          <div className={(totalThu - totalChi >= 0) ? "bg-blue-50 border border-blue-200 rounded-xl p-4" : "bg-orange-50 border border-orange-200 rounded-xl p-4"}>
            <div className={(totalThu - totalChi >= 0) ? "text-sm text-blue-600 font-medium" : "text-sm text-orange-600 font-medium"}>Chênh lệch</div>
            <div className={(totalThu - totalChi >= 0) ? "text-2xl font-bold text-blue-700" : "text-2xl font-bold text-orange-700"}>{((totalThu - totalChi) / 1000000).toFixed(1)}M</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Loại</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 border rounded-lg">
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
                  {selectedReceipt.status === 'approved' && (
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
                      {selectedReceipt.status === 'pending' && (
                        <button onClick={() => setIsEditing(true)} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">✏️ Sửa</button>
                      )}
                      {selectedReceipt.status === 'pending' && canApprove && (
                        <button onClick={() => handleDelete(selectedReceipt.id)} className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">🗑️ Xóa</button>
                      )}
                      <button onClick={() => setShowDetailModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
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

    const canViewAll = hasFinanceFullAccess();
    const filteredDebts = debts.filter(d => {
      if (!canViewAll && d.created_by !== currentUser.name) return false;
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
      const date = new Date();
      const dateStr = date.getFullYear().toString() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
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
        created_at: new Date().toISOString(),
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
        date: new Date().toISOString(),
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
        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const receiptNumber = receiptPrefix + '-' + dateStr + '-' + randomNum;

        const newReceipt = {
          tenant_id: tenant.id,
          receipt_number: receiptNumber,
          type: receiptType,
          amount: amount,
          description: (receiptType === 'thu' ? 'Thu nợ từ ' : 'Trả nợ cho ') + selectedDebt.partner_name,
          category: receiptType === 'thu' ? 'Thu nợ khách' : 'Trả nợ NCC',
          receipt_date: new Date().toISOString().split('T')[0],
          note: 'Thanh toán công nợ ' + selectedDebt.debt_number + (paymentNote ? ' - ' + paymentNote : ''),
          status: 'approved',
          created_by: currentUser.name,
          approved_by: currentUser.name,
          approved_at: new Date().toISOString()
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
          <div className="flex gap-2">
            <button onClick={() => { setFormType('receivable'); resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
              ➕ Phải Thu
            </button>
            <button onClick={() => { setFormType('payable'); resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
              ➕ Phải Trả
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-sm text-green-600 font-medium">Tổng Phải Thu</div>
            <div className="text-2xl font-bold text-green-700">+{(totalReceivable / 1000000).toFixed(1)}M</div>
            <div className="text-xs text-green-600 mt-1">{receivables.length} khoản</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-sm text-red-600 font-medium">Tổng Phải Trả</div>
            <div className="text-2xl font-bold text-red-700">-{(totalPayable / 1000000).toFixed(1)}M</div>
            <div className="text-xs text-red-600 mt-1">{payables.length} khoản</div>
          </div>
          <div className={(totalReceivable - totalPayable >= 0) ? "bg-blue-50 border border-blue-200 rounded-xl p-4" : "bg-orange-50 border border-orange-200 rounded-xl p-4"}>
            <div className={(totalReceivable - totalPayable >= 0) ? "text-sm text-blue-600 font-medium" : "text-sm text-orange-600 font-medium"}>Chênh lệch</div>
            <div className={(totalReceivable - totalPayable >= 0) ? "text-2xl font-bold text-blue-700" : "text-2xl font-bold text-orange-700"}>{((totalReceivable - totalPayable) / 1000000).toFixed(1)}M</div>
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
                  {selectedDebt.status !== 'paid' && (
                    <button onClick={() => setShowPaymentModal(true)} className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">💵 Ghi nhận thanh toán</button>
                  )}
                  <div className="flex gap-3">
                    {canManage && selectedDebt.status !== 'paid' && (
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

  function SalariesView() {
    const [activeTab, setActiveTab] = useState('all');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
    const [showSalaryDetailModal, setShowSalaryDetailModal] = useState(false);
    const [showCreateSalaryModal, setShowCreateSalaryModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [selectedSalary, setSelectedSalary] = useState(null);
    
    const [employees, setEmployees] = useState([]);
    const [monthlySalaries, setMonthlySalaries] = useState([]);
    
    // Form states
    const [formName, setFormName] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formDepartment, setFormDepartment] = useState('livestream');
    const [formBaseSalary, setFormBaseSalary] = useState('');
    const [formCommissionRate, setFormCommissionRate] = useState('');
    const [formBonusPerUnit, setFormBonusPerUnit] = useState('');
    
    // Salary calculation form
    const [salaryRevenue, setSalaryRevenue] = useState('');
    const [salaryUnits, setSalaryUnits] = useState('');
    const [salaryBonus, setSalaryBonus] = useState('');
    const [salaryDeduction, setSalaryDeduction] = useState('');
    const [salaryNote, setSalaryNote] = useState('');

    const departments = {
      livestream: { name: '🎥 Livestream', color: 'purple', commissionLabel: '% Hoa hồng', unitLabel: 'Doanh số' },
      media: { name: '🎬 Media', color: 'blue', commissionLabel: 'đ/Video', unitLabel: 'Số video' },
      warehouse: { name: '📦 Kho', color: 'orange', commissionLabel: 'đ/Đơn', unitLabel: 'Số đơn' }
    };

    useEffect(() => {
      loadEmployees();
      loadMonthlySalaries();
    }, [selectedMonth, selectedYear]);

    const loadEmployees = async () => {
      try {
        const { data, error } = await supabase.from('employees').select('*').order('department');
        if (error) throw error;
        setEmployees(data || []);
      } catch (error) {
        console.log('Load employees:', error.message);
      }
    };

    const loadMonthlySalaries = async () => {
      try {
        const { data, error } = await supabase.from('salaries')
          .select('*')
          .eq('month', selectedMonth)
          .eq('year', selectedYear)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setMonthlySalaries(data || []);
      } catch (error) {
        console.log('Load salaries:', error.message);
      }
    };

    const handleAddEmployee = async () => {
      if (!formName || !formBaseSalary) {
        alert('Vui lòng nhập tên và lương cơ bản!');
        return;
      }
      try {
        const { error } = await supabase.from('employees').insert([{
          name: formName,
          phone: formPhone,
          department: formDepartment,
          base_salary: parseFloat(formBaseSalary),
          commission_rate: parseFloat(formCommissionRate) || 0,
          bonus_per_unit: parseFloat(formBonusPerUnit) || 0,
          status: 'active',
          created_by: currentUser.name,
          created_at: new Date().toISOString()
        }]);
        if (error) throw error;
        alert('Thêm nhân viên thành công!');
        setShowAddEmployeeModal(false);
        resetEmployeeForm();
        loadEmployees();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const resetEmployeeForm = () => {
      setFormName('');
      setFormPhone('');
      setFormDepartment('livestream');
      setFormBaseSalary('');
      setFormCommissionRate('');
      setFormBonusPerUnit('');
    };

    const openCreateSalary = (employee) => {
      setSelectedEmployee(employee);
      setSalaryRevenue('');
      setSalaryUnits('');
      setSalaryBonus('');
      setSalaryDeduction('');
      setSalaryNote('');
      setShowCreateSalaryModal(true);
    };

    const calculateSalary = () => {
      if (!selectedEmployee) return { commission: 0, unitBonus: 0, total: 0 };
      const base = parseFloat(selectedEmployee.base_salary) || 0;
      const revenue = parseFloat(salaryRevenue) || 0;
      const units = parseFloat(salaryUnits) || 0;
      const bonus = parseFloat(salaryBonus) || 0;
      const deduction = parseFloat(salaryDeduction) || 0;
      
      let commission = 0;
      let unitBonus = 0;
      
      if (selectedEmployee.department === 'livestream') {
        commission = revenue * (parseFloat(selectedEmployee.commission_rate) || 0) / 100;
      } else {
        unitBonus = units * (parseFloat(selectedEmployee.bonus_per_unit) || 0);
      }
      
      const total = base + commission + unitBonus + bonus - deduction;
      return { commission, unitBonus, total };
    };

    const handleCreateSalary = async () => {
      const calc = calculateSalary();
      try {
        const { error } = await supabase.from('salaries').insert([{
          tenant_id: tenant.id,
          employee_id: selectedEmployee.id,
          employee_name: selectedEmployee.name,
          department: selectedEmployee.department,
          month: selectedMonth,
          year: selectedYear,
          base_salary: parseFloat(selectedEmployee.base_salary),
          revenue: parseFloat(salaryRevenue) || 0,
          units: parseFloat(salaryUnits) || 0,
          commission: calc.commission,
          unit_bonus: calc.unitBonus,
          bonus: parseFloat(salaryBonus) || 0,
          deduction: parseFloat(salaryDeduction) || 0,
          total_salary: calc.total,
          note: salaryNote,
          status: 'pending',
          created_by: currentUser.name,
          created_at: new Date().toISOString()
        }]);
        if (error) throw error;
        alert('Tạo bảng lương thành công!');
        setShowCreateSalaryModal(false);
        loadMonthlySalaries();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handleApproveSalary = async (salary) => {
      try {
        const { error } = await supabase.from('salaries').update({
          status: 'approved',
          approved_by: currentUser.name,
          approved_at: new Date().toISOString()
        }).eq('id', salary.id);
        if (error) throw error;
        alert('Đã duyệt bảng lương!');
        loadMonthlySalaries();
        setShowSalaryDetailModal(false);
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handlePaySalary = async (salary) => {
      if (!window.confirm(`Xác nhận trả lương ${salary.employee_name}: ${parseFloat(salary.total_salary).toLocaleString('vi-VN')}đ?`)) return;
      try {
        // Cập nhật trạng thái lương
        const { error } = await supabase.from('salaries').update({
          status: 'paid',
          paid_by: currentUser.name,
          paid_at: new Date().toISOString()
        }).eq('id', salary.id);
        if (error) throw error;

        // Tạo phiếu chi
        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        await supabase.from('receipts_payments').insert([{
          tenant_id: tenant.id,
          receipt_number: 'PC-' + dateStr + '-' + randomNum,
          type: 'chi',
          amount: salary.total_salary,
          description: 'Trả lương T' + salary.month + '/' + salary.year + ' - ' + salary.employee_name,
          category: 'Lương nhân viên',
          receipt_date: new Date().toISOString().split('T')[0],
          note: 'Tự động từ bảng lương',
          status: 'approved',
          created_by: currentUser.name,
          approved_by: currentUser.name,
          approved_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        }]);

        alert('Đã trả lương và tạo phiếu chi!');
        loadMonthlySalaries();
        loadFinanceData();
        setShowSalaryDetailModal(false);
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handleDeleteSalary = async (id) => {
      if (!window.confirm('Xóa bảng lương này?')) return;
      try {
        const { error } = await supabase.from('salaries').delete().eq('id', id);
        if (error) throw error;
        alert('Đã xóa!');
        loadMonthlySalaries();
        setShowSalaryDetailModal(false);
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const handleDeleteEmployee = async (id) => {
      if (!window.confirm('Xóa nhân viên này?')) return;
      try {
        const { error } = await supabase.from('employees').delete().eq('id', id);
        if (error) throw error;
        alert('Đã xóa!');
        loadEmployees();
      } catch (error) {
        alert('Lỗi: ' + error.message);
      }
    };

    const openSalaryDetail = (salary) => {
      setSelectedSalary(salary);
      setShowSalaryDetailModal(true);
    };

    const canViewAll = hasFinanceFullAccess();
    const filteredEmployees = !canViewAll ? [] : (activeTab === 'all' ? employees : employees.filter(e => e.department === activeTab));
    const filteredSalaries = (() => {
      let sals = activeTab === 'all' ? monthlySalaries : monthlySalaries.filter(s => s.department === activeTab);
      if (!canViewAll) sals = sals.filter(s => s.employee_name === currentUser.name);
      return sals;
    })();
    
    const totalSalaryByDept = (dept) => {
      if (!canViewAll) return 0;
      return monthlySalaries.filter(s => dept === 'all' || s.department === dept).reduce((sum, s) => sum + parseFloat(s.total_salary || 0), 0);
    };

    const canApprove = canViewAll;

    return (
      <div className="p-6 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold">💰 Quản Lý Lương</h2>
          <div className="flex items-center gap-2">
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg">
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>Tháng {m}</option>)}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg">
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => setShowAddEmployeeModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
              ➕ Thêm NV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 border rounded-xl p-4 cursor-pointer hover:bg-gray-100" onClick={() => setActiveTab('all')}>
            <div className="text-sm text-gray-600">Tổng lương</div>
            <div className="text-xl font-bold text-gray-800">{(totalSalaryByDept('all') / 1000000).toFixed(1)}M</div>
            <div className="text-xs text-gray-500">{monthlySalaries.length} bảng lương</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 cursor-pointer hover:bg-purple-100" onClick={() => setActiveTab('livestream')}>
            <div className="text-sm text-purple-600">🎥 Livestream</div>
            <div className="text-xl font-bold text-purple-700">{(totalSalaryByDept('livestream') / 1000000).toFixed(1)}M</div>
            <div className="text-xs text-purple-500">{employees.filter(e => e.department === 'livestream').length} NV</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 cursor-pointer hover:bg-blue-100" onClick={() => setActiveTab('media')}>
            <div className="text-sm text-blue-600">🎬 Media</div>
            <div className="text-xl font-bold text-blue-700">{(totalSalaryByDept('media') / 1000000).toFixed(1)}M</div>
            <div className="text-xs text-blue-500">{employees.filter(e => e.department === 'media').length} NV</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 cursor-pointer hover:bg-orange-100" onClick={() => setActiveTab('warehouse')}>
            <div className="text-sm text-orange-600">📦 Kho</div>
            <div className="text-xl font-bold text-orange-700">{(totalSalaryByDept('warehouse') / 1000000).toFixed(1)}M</div>
            <div className="text-xs text-orange-500">{employees.filter(e => e.department === 'warehouse').length} NV</div>
          </div>
        </div>

        <div className="flex gap-2 border-b">
          <button onClick={() => setActiveTab('all')} className={activeTab === 'all' ? "px-4 py-2 border-b-2 border-blue-600 text-blue-600 font-medium" : "px-4 py-2 text-gray-500"}>Tất cả</button>
          <button onClick={() => setActiveTab('livestream')} className={activeTab === 'livestream' ? "px-4 py-2 border-b-2 border-purple-600 text-purple-600 font-medium" : "px-4 py-2 text-gray-500"}>🎥 Livestream</button>
          <button onClick={() => setActiveTab('media')} className={activeTab === 'media' ? "px-4 py-2 border-b-2 border-blue-600 text-blue-600 font-medium" : "px-4 py-2 text-gray-500"}>🎬 Media</button>
          <button onClick={() => setActiveTab('warehouse')} className={activeTab === 'warehouse' ? "px-4 py-2 border-b-2 border-orange-600 text-orange-600 font-medium" : "px-4 py-2 text-gray-500"}>📦 Kho</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold">👥 Danh sách nhân viên ({filteredEmployees.length})</h3>
            </div>
            {filteredEmployees.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Chưa có nhân viên</div>
            ) : (
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {filteredEmployees.map(emp => {
                  const hasSalary = monthlySalaries.some(s => s.employee_id === emp.id);
                  return (
                    <div key={emp.id} className="p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{emp.name}</div>
                          <div className="text-sm text-gray-500">{departments[emp.department]?.name}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            Lương CB: {parseFloat(emp.base_salary).toLocaleString('vi-VN')}đ
                            {emp.department === 'livestream' && emp.commission_rate > 0 && <span> • HH: {emp.commission_rate}%</span>}
                            {emp.department !== 'livestream' && emp.bonus_per_unit > 0 && <span> • Thưởng: {parseFloat(emp.bonus_per_unit).toLocaleString('vi-VN')}đ/{emp.department === 'media' ? 'video' : 'đơn'}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {!hasSalary ? (
                            <button onClick={() => openCreateSalary(emp)} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm">Tính lương</button>
                          ) : (
                            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-sm">Đã tính</span>
                          )}
                          {canApprove && (
                            <button onClick={() => handleDeleteEmployee(emp.id)} className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-600 rounded text-sm">🗑️</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-bold">📋 Bảng lương T{selectedMonth}/{selectedYear} ({filteredSalaries.length})</h3>
            </div>
            {filteredSalaries.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Chưa có bảng lương</div>
            ) : (
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {filteredSalaries.map(salary => (
                  <div key={salary.id} onClick={() => openSalaryDetail(salary)} className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{salary.employee_name}</div>
                        <div className="text-sm text-gray-500">{departments[salary.department]?.name}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          CB: {(parseFloat(salary.base_salary)/1000000).toFixed(1)}M
                          {salary.commission > 0 && <span> + HH: {(parseFloat(salary.commission)/1000000).toFixed(1)}M</span>}
                          {salary.unit_bonus > 0 && <span> + Thưởng: {(parseFloat(salary.unit_bonus)/1000000).toFixed(1)}M</span>}
                          {salary.bonus > 0 && <span> + Bonus: {(parseFloat(salary.bonus)/1000000).toFixed(1)}M</span>}
                          {salary.deduction > 0 && <span> - Trừ: {(parseFloat(salary.deduction)/1000000).toFixed(1)}M</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-blue-600">{(parseFloat(salary.total_salary)/1000000).toFixed(1)}M</div>
                        <span className={salary.status === 'paid' ? "text-xs px-2 py-0.5 rounded bg-green-100 text-green-700" : salary.status === 'approved' ? "text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700" : "text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700"}>
                          {salary.status === 'paid' ? '✅ Đã trả' : salary.status === 'approved' ? '✓ Đã duyệt' : '⏳ Chờ duyệt'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showAddEmployeeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full">
              <div className="p-6 border-b bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">➕ Thêm Nhân Viên</h2>
                  <button onClick={() => setShowAddEmployeeModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Họ tên *</label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nguyễn Văn A" className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Số điện thoại</label>
                  <input type="text" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="0912345678" className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Bộ phận *</label>
                  <select value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg">
                    <option value="livestream">🎥 Livestream</option>
                    <option value="media">🎬 Media</option>
                    <option value="warehouse">📦 Kho</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Lương cơ bản (VNĐ) *</label>
                  <input type="number" value={formBaseSalary} onChange={(e) => setFormBaseSalary(e.target.value)} placeholder="5000000" className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                {formDepartment === 'livestream' ? (
                  <div>
                    <label className="block text-sm font-medium mb-2">% Hoa hồng doanh số</label>
                    <input type="number" value={formCommissionRate} onChange={(e) => setFormCommissionRate(e.target.value)} placeholder="2" className="w-full px-4 py-3 border-2 rounded-lg" />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2">Thưởng mỗi {formDepartment === 'media' ? 'video' : 'đơn hàng'} (VNĐ)</label>
                    <input type="number" value={formBonusPerUnit} onChange={(e) => setFormBonusPerUnit(e.target.value)} placeholder="50000" className="w-full px-4 py-3 border-2 rounded-lg" />
                  </div>
                )}
              </div>
              <div className="p-6 border-t bg-gray-50 flex gap-3">
                <button onClick={() => setShowAddEmployeeModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
                <button onClick={handleAddEmployee} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">✅ Thêm</button>
              </div>
            </div>
          </div>
        )}

        {showCreateSalaryModal && selectedEmployee && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full">
              <div className="p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold">💰 Tính Lương T{selectedMonth}/{selectedYear}</h2>
                    <p className="text-white/80">{selectedEmployee.name} - {departments[selectedEmployee.department]?.name}</p>
                  </div>
                  <button onClick={() => setShowCreateSalaryModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Lương cơ bản</div>
                  <div className="font-bold">{parseFloat(selectedEmployee.base_salary).toLocaleString('vi-VN')}đ</div>
                </div>
                {selectedEmployee.department === 'livestream' ? (
                  <div>
                    <label className="block text-sm font-medium mb-2">Doanh số bán (VNĐ)</label>
                    <input type="number" value={salaryRevenue} onChange={(e) => setSalaryRevenue(e.target.value)} placeholder="0" className="w-full px-4 py-3 border-2 rounded-lg" />
                    {salaryRevenue && selectedEmployee.commission_rate > 0 && (
                      <div className="text-sm text-green-600 mt-1">Hoa hồng {selectedEmployee.commission_rate}%: +{(parseFloat(salaryRevenue) * selectedEmployee.commission_rate / 100).toLocaleString('vi-VN')}đ</div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2">Số {selectedEmployee.department === 'media' ? 'video' : 'đơn hàng'}</label>
                    <input type="number" value={salaryUnits} onChange={(e) => setSalaryUnits(e.target.value)} placeholder="0" className="w-full px-4 py-3 border-2 rounded-lg" />
                    {salaryUnits && selectedEmployee.bonus_per_unit > 0 && (
                      <div className="text-sm text-green-600 mt-1">Thưởng: +{(parseFloat(salaryUnits) * selectedEmployee.bonus_per_unit).toLocaleString('vi-VN')}đ</div>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-2">Thưởng thêm (VNĐ)</label>
                  <input type="number" value={salaryBonus} onChange={(e) => setSalaryBonus(e.target.value)} placeholder="0" className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Khấu trừ (VNĐ)</label>
                  <input type="number" value={salaryDeduction} onChange={(e) => setSalaryDeduction(e.target.value)} placeholder="0" className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Ghi chú</label>
                  <input type="text" value={salaryNote} onChange={(e) => setSalaryNote(e.target.value)} placeholder="Ghi chú..." className="w-full px-4 py-3 border-2 rounded-lg" />
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-sm text-blue-600">Tổng thực nhận</div>
                  <div className="text-2xl font-bold text-blue-700">{calculateSalary().total.toLocaleString('vi-VN')}đ</div>
                </div>
              </div>
              <div className="p-6 border-t bg-gray-50 flex gap-3">
                <button onClick={() => setShowCreateSalaryModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
                <button onClick={handleCreateSalary} className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">✅ Tạo bảng lương</button>
              </div>
            </div>
          </div>
        )}

        {showSalaryDetailModal && selectedSalary && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full">
              <div className="p-6 border-b bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold">📋 Chi Tiết Lương</h2>
                    <p className="text-white/80">{selectedSalary.employee_name} - T{selectedSalary.month}/{selectedSalary.year}</p>
                  </div>
                  <button onClick={() => setShowSalaryDetailModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
                </div>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                  <span>Lương cơ bản</span>
                  <span className="font-medium">{parseFloat(selectedSalary.base_salary).toLocaleString('vi-VN')}đ</span>
                </div>
                {selectedSalary.revenue > 0 && (
                  <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                    <span>Doanh số</span>
                    <span className="font-medium">{parseFloat(selectedSalary.revenue).toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
                {selectedSalary.commission > 0 && (
                  <div className="flex justify-between p-3 bg-green-50 rounded-lg">
                    <span>+ Hoa hồng</span>
                    <span className="font-medium text-green-600">+{parseFloat(selectedSalary.commission).toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
                {selectedSalary.units > 0 && (
                  <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                    <span>Số {selectedSalary.department === 'media' ? 'video' : 'đơn'}</span>
                    <span className="font-medium">{selectedSalary.units}</span>
                  </div>
                )}
                {selectedSalary.unit_bonus > 0 && (
                  <div className="flex justify-between p-3 bg-green-50 rounded-lg">
                    <span>+ Thưởng sản lượng</span>
                    <span className="font-medium text-green-600">+{parseFloat(selectedSalary.unit_bonus).toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
                {selectedSalary.bonus > 0 && (
                  <div className="flex justify-between p-3 bg-green-50 rounded-lg">
                    <span>+ Thưởng thêm</span>
                    <span className="font-medium text-green-600">+{parseFloat(selectedSalary.bonus).toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
                {selectedSalary.deduction > 0 && (
                  <div className="flex justify-between p-3 bg-red-50 rounded-lg">
                    <span>- Khấu trừ</span>
                    <span className="font-medium text-red-600">-{parseFloat(selectedSalary.deduction).toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
                <div className="flex justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="font-bold">THỰC NHẬN</span>
                  <span className="font-bold text-blue-700 text-xl">{parseFloat(selectedSalary.total_salary).toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-2 bg-gray-50 rounded">
                    <div className="text-xs text-gray-500">Người tạo</div>
                    <div>{selectedSalary.created_by || 'N/A'}</div>
                  </div>
                  <div className="p-2 bg-gray-50 rounded">
                    <div className="text-xs text-gray-500">Trạng thái</div>
                    <div className={selectedSalary.status === 'paid' ? "text-green-600" : selectedSalary.status === 'approved' ? "text-blue-600" : "text-yellow-600"}>
                      {selectedSalary.status === 'paid' ? '✅ Đã trả' : selectedSalary.status === 'approved' ? '✓ Đã duyệt' : '⏳ Chờ duyệt'}
                    </div>
                  </div>
                  {selectedSalary.approved_by && (
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Người duyệt</div>
                      <div>{selectedSalary.approved_by}</div>
                    </div>
                  )}
                  {selectedSalary.paid_by && (
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Người trả</div>
                      <div>{selectedSalary.paid_by}</div>
                    </div>
                  )}
                </div>
                {selectedSalary.note && (
                  <div className="p-3 bg-yellow-50 rounded-lg">
                    <div className="text-xs text-yellow-600">Ghi chú</div>
                    <div className="text-yellow-800">{selectedSalary.note}</div>
                  </div>
                )}
              </div>
              <div className="p-6 border-t bg-gray-50 space-y-3">
                {selectedSalary.status === 'pending' && canApprove && (
                  <button onClick={() => handleApproveSalary(selectedSalary)} className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">✓ Duyệt bảng lương</button>
                )}
                {selectedSalary.status === 'approved' && canApprove && (
                  <button onClick={() => handlePaySalary(selectedSalary)} className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">💵 Trả lương</button>
                )}
                <div className="flex gap-3">
                  {selectedSalary.status === 'pending' && canApprove && (
                    <button onClick={() => handleDeleteSalary(selectedSalary.id)} className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">🗑️ Xóa</button>
                  )}
                  <button onClick={() => setShowSalaryDetailModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
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

    const permissionLevels = [
      { value: 0, label: 'Không có quyền', desc: 'Ẩn hoàn toàn', color: 'gray' },
      { value: 1, label: 'Xem của mình', desc: 'Chỉ xem dữ liệu mình tạo', color: 'yellow' },
      { value: 2, label: 'Xem tất cả', desc: 'Xem toàn bộ dữ liệu', color: 'blue' },
      { value: 3, label: 'Toàn quyền', desc: 'Xem + Tạo/Sửa/Xóa + Duyệt', color: 'green' }
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
      const [hasChanges, setHasChanges] = useState(false);
      const isAdmin = user.role === 'Admin' || user.role === 'admin';

      const handleToggleDept = (deptId) => {
        if (isAdmin) return;
        const current = localPerms[deptId] || 0;
        setLocalPerms(prev => ({ ...prev, [deptId]: current > 0 ? 0 : 1 }));
        setHasChanges(true);
      };

      const handleLevelChange = (deptId, level) => {
        if (isAdmin) return;
        setLocalPerms(prev => ({ ...prev, [deptId]: level }));
        setHasChanges(true);
      };

      const selectAllDepts = () => {
        if (isAdmin) return;
        const allEnabled = departments.every(d => localPerms[d.id] > 0);
        const newPerms = {};
        departments.forEach(d => { newPerms[d.id] = allEnabled ? 0 : 1; });
        setLocalPerms(newPerms);
        setHasChanges(true);
      };

      const handleSave = async () => {
        try {
          setSaving(true);
          const { error } = await supabase
            .from('users')
            .update({ permissions: localPerms })
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
                          {isEnabled && (
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getLevelColor(level)}`}>
                              {permissionLevels.find(p => p.value === level)?.label}
                            </span>
                          )}
                        </div>

                        {isEnabled && (
                          <div className="px-4 pb-4 pt-3 bg-white border-t">
                            <div className="text-xs text-gray-500 mb-3 font-medium">⚡ Chọn cấp quyền:</div>
                            <div className="grid grid-cols-3 gap-2">
                              {permissionLevels.filter(p => p.value > 0).map(p => (
                                <button 
                                  key={p.value}
                                  onClick={(e) => { e.stopPropagation(); handleLevelChange(dept.id, p.value); }}
                                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                                    level === p.value 
                                      ? getLevelColor(p.value) + ' border-2 shadow-sm' 
                                      : 'border-gray-200 hover:border-gray-300 bg-white'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${level === p.value ? 'border-current bg-current' : 'border-gray-300'}`}>
                                      {level === p.value && <span className="text-white text-xs">•</span>}
                                    </div>
                                    <span className="font-bold text-sm">{p.label}</span>
                                  </div>
                                  <div className="text-xs text-gray-500 ml-6">{p.desc}</div>
                                </button>
                              ))}
                            </div>
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

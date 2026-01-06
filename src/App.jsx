import React, { useState, useMemo, useEffect } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from './supabaseClient';

export default function SimpleMarketingSystem() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [activeModule, setActiveModule] = useState('marketing');
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

  const [allUsers, setAllUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [technicalJobs, setTechnicalJobs] = useState([]);

  // Finance Module States
  const [receiptsPayments, setReceiptsPayments] = useState([]);
  const [debts, setDebts] = useState([]);
  const [salaries, setSalaries] = useState([]);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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
    const savedUser = localStorage.getItem('marketingSystemUser');
    const savedLoggedIn = localStorage.getItem('marketingSystemLoggedIn');
    
    if (savedUser && savedLoggedIn === 'true') {
      try {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
        setIsLoggedIn(true);
      } catch (error) {
        console.error('Error restoring session:', error);
        localStorage.removeItem('marketingSystemUser');
        localStorage.removeItem('marketingSystemLoggedIn');
      }
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadTasks();
    loadTechnicalJobs();
    loadFinanceData();
    
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

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(jobsChannel);
      supabase.removeChannel(financeChannel);
    };
  }, []);

  // Check deadline notifications
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;
    
    checkDeadlineNotifications();
    const interval = setInterval(checkDeadlineNotifications, 30 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [tasks, currentUser, isLoggedIn]);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
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
    try {
      const { data, error } = await supabase
        .from('technical_jobs')
        .select('*')
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
    try {
      const [receiptsRes, debtsRes, salariesRes] = await Promise.all([
        supabase.from('receipts_payments').select('*').order('receipt_date', { ascending: false }).limit(50),
        supabase.from('debts').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('salaries').select('*').order('year', { ascending: false }).order('month', { ascending: false }).limit(50)
      ]);
      
      if (receiptsRes.data) setReceiptsPayments(receiptsRes.data);
      if (debtsRes.data) setDebts(debtsRes.data);
      if (salariesRes.data) setSalaries(salariesRes.data);
    } catch (error) {
      console.error('Error loading finance data:', error);
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
      
      // Lưu session vào localStorage
      localStorage.setItem('marketingSystemUser', JSON.stringify(data));
      localStorage.setItem('marketingSystemLoggedIn', 'true');
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
      const { data: existing } = await supabase
        .from('users')
        .select('email')
        .eq('email', email)
        .single();
      
      if (existing) {
        alert('❌ Email đã tồn tại!');
        return;
      }
      
      const { error } = await supabase
        .from('users')
        .insert([{ name, email, password, team, role }]);
      
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
    
    if (currentUser.role === 'Admin' || currentUser.role === 'Manager') {
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
                  {(currentUser.role === 'Admin' || (currentUser.departments && currentUser.departments.includes('sales'))) && (
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
            {currentUser.role === 'Admin' && (
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
      if (currentUser.role === 'Admin' || currentUser.role === 'Manager') return true;
      
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
                      {user.departments && user.departments.includes('marketing') && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                          📱 Marketing
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
                checked={departments.includes('marketing')}
                onChange={() => toggleDepartment('marketing')}
                className="w-5 h-5 text-blue-600"
              />
              <div className="flex-1">
                <div className="font-medium">📱 Marketing</div>
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
    const [dueDate, setDueDate] = useState('');
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
      if (currentUser.role === 'Admin' || currentUser.role === 'Manager') {
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

    if (!selectedTask) return null;

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

    const canReassign = currentUser.role === 'Admin' || currentUser.role === 'Manager' || 
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
              <button
                onClick={() => setShowModal(false)}
                className="text-white/80 hover:text-white text-2xl ml-4"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                        if (currentUser.role === 'Admin' || currentUser.role === 'Manager') return true;
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
              {currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Manager' || selectedTask.assignee === currentUser.name) && (
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

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img 
                src="/logo.png?v=2" 
                alt="Hoàng Nam Audio" 
                className="h-32 w-auto"
              />
            </div>
            <h1 className="text-3xl font-bold mb-2">Marketing Hoàng Nam Audio</h1>
            <p className="text-gray-600">Làm việc hăng say, tiền ngay về túi</p>
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
              <img src="/logo.png?v=2" alt="Hoàng Nam Audio" className="h-12 w-auto" />
              <div>
                <h1 className="text-2xl font-bold">Marketing Hoàng Nam Audio</h1>
                <p className="text-gray-600 text-sm">Làm việc hăng say, tiền ngay về túi</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Admin Menu Dropdown */}
              {currentUser.role === 'Admin' && (
                <div className="relative">
                  <button
                    onClick={() => setShowAdminMenu(!showAdminMenu)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <span>⚙️ Admin</span>
                    <svg className={`w-4 h-4 transition-transform ${showAdminMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showAdminMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowAdminMenu(false)}
                      />
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border z-20 overflow-hidden">
                        <button
                          onClick={() => {
                            setActiveModule('marketing');
                            setActiveTab('automation');
                            setShowAdminMenu(false);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-purple-50 flex items-center gap-3 border-b"
                        >
                          <span className="text-xl">⚙️</span>
                          <div>
                            <div className="font-medium">Automation</div>
                            <div className="text-xs text-gray-500">Tự động hóa công việc</div>
                          </div>
                        </button>
                        <button
                          onClick={() => {
                            setActiveModule('marketing');
                            setActiveTab('users');
                            setShowAdminMenu(false);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-purple-50 flex items-center gap-3"
                        >
                          <span className="text-xl">👥</span>
                          <div>
                            <div className="font-medium">Users</div>
                            <div className="text-xs text-gray-500">Quản lý người dùng</div>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              
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
              <button
                onClick={() => {
                  setIsLoggedIn(false);
                  setCurrentUser(null);
                  setActiveTab('dashboard');
                  localStorage.removeItem('marketingSystemUser');
                  localStorage.removeItem('marketingSystemLoggedIn');
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
              {(currentUser.role === 'Admin' || (currentUser.departments && currentUser.departments.includes('marketing'))) && (
                <button
                  onClick={() => {
                    setActiveModule('marketing');
                    setActiveTab('dashboard');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg mb-2 font-medium text-left ${
                    activeModule === 'marketing'
                      ? 'bg-blue-100 text-blue-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  📱 Marketing
                </button>
              )}
              {(currentUser.role === 'Admin' || currentUser.role === 'Manager' || (currentUser.departments && (currentUser.departments.includes('technical') || currentUser.departments.includes('sales')))) && (
                <button
                  onClick={() => {
                    setActiveModule('technical');
                    setActiveTab('jobs');
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg font-medium text-left ${
                    activeModule === 'technical'
                      ? 'bg-orange-100 text-orange-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  🔧 Kỹ Thuật
                </button>
              )}
              {(currentUser.role === 'Admin' || currentUser.role === 'Manager' || (currentUser.departments && currentUser.departments.includes('finance'))) && (
                <button
                  onClick={() => {
                    setActiveModule('finance');
                    setActiveTab('dashboard');
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
            {currentUser.role === 'Admin' && (
              <div className="p-4 border-b bg-purple-50">
                <div className="text-xs font-semibold text-purple-700 mb-2">ADMIN</div>
                <button
                  onClick={() => {
                    setActiveModule('marketing');
                    setActiveTab('automation');
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
                    setActiveModule('marketing');
                    setActiveTab('users');
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
              {(activeModule === 'marketing' ? [
                { id: 'mytasks', l: '📝 Của Tôi', show: true },
                { id: 'dashboard', l: '📊 Dashboard', show: true },
                { id: 'tasks', l: '📋 Tasks', show: true },
                { id: 'calendar', l: '📅 Lịch', show: true },
                { id: 'report', l: '📈 Báo Cáo', show: true },
                { id: 'performance', l: '📊 Hiệu Suất', show: true },
                { id: 'integrations', l: '🔗 Tích Hợp', show: true }
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
                    setActiveTab(t.id);
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

            {/* Logout Button */}
            <div className="p-4 border-t">
              <button
                onClick={() => {
                  setIsLoggedIn(false);
                  setCurrentUser(null);
                  setActiveTab('dashboard');
                  localStorage.removeItem('marketingSystemUser');
                  localStorage.removeItem('marketingSystemLoggedIn');
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
          {(currentUser.role === 'Admin' || (currentUser.departments && currentUser.departments.includes('marketing'))) && (
            <button
              onClick={() => {
                setActiveModule('marketing');
                setActiveTab('dashboard');
              }}
              className={`px-8 py-4 font-bold text-lg transition-all ${
                activeModule === 'marketing'
                  ? 'bg-white text-blue-600'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              📱 Marketing
            </button>
          )}
          {(currentUser.role === 'Admin' || currentUser.role === 'Manager' || (currentUser.departments && (currentUser.departments.includes('technical') || currentUser.departments.includes('sales')))) && (
            <button
              onClick={() => {
                setActiveModule('technical');
                setActiveTab('jobs');
              }}
              className={`px-8 py-4 font-bold text-lg transition-all ${
                activeModule === 'technical'
                  ? 'bg-white text-orange-600'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🔧 Kỹ Thuật
            </button>
          )}
          {(currentUser.role === 'Admin' || currentUser.role === 'Manager' || (currentUser.departments && currentUser.departments.includes('finance'))) && (
            <button
              onClick={() => {
                setActiveModule('finance');
                setActiveTab('dashboard');
              }}
              className={`px-8 py-4 font-bold text-lg transition-all ${
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
          {(activeModule === 'marketing' ? [
            { id: 'mytasks', l: '📝 Của Tôi' },
            { id: 'dashboard', l: '📊 Dashboard' },
            { id: 'tasks', l: '📋 Tasks' },
            { id: 'calendar', l: '📅 Lịch' },
            { id: 'report', l: '📈 Báo Cáo' },
            { id: 'performance', l: '📊 Hiệu Suất' },
            { id: 'integrations', l: '🔗 Tích Hợp' }
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
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-6 py-3 font-medium border-b-4 whitespace-nowrap ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'}`}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Title Bar */}
      <div className="md:hidden bg-white border-b px-4 py-3 sticky top-[52px] z-30">
        <h2 className="font-bold text-lg">
          {(activeModule === 'marketing' ? [
            { id: 'mytasks', l: '📝 Của Tôi' },
            { id: 'dashboard', l: '📊 Dashboard' },
            { id: 'tasks', l: '📋 Tasks' },
            { id: 'calendar', l: '📅 Lịch' },
            { id: 'report', l: '📈 Báo Cáo' },
            { id: 'performance', l: '📊 Hiệu Suất' },
            { id: 'integrations', l: '🔗 Tích Hợp' },
            { id: 'automation', l: '⚙️ Automation' },
            { id: 'users', l: '👥 Users' }
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
        {activeModule === 'marketing' && (
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
    </div>
  );

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
      thu: ['Bán hàng', 'Dịch vụ lắp đặt', 'Dịch vụ bảo trì', 'Thu nợ khách', 'Khác'],
      chi: ['Nhập hàng', 'Lương nhân viên', 'Tiền thuê mặt bằng', 'Điện nước', 'Marketing', 'Vận chuyển', 'Khác']
    };

    const filteredReceipts = receiptsPayments.filter(r => {
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
        receipt_number: generateReceiptNumber(formType),
        type: formType,
        amount: parseFloat(formAmount),
        description: formDescription,
        category: formCategory,
        receipt_date: formDate,
        note: formNote,
        status: (currentUser.role === 'Admin' || currentUser.role === 'admin') ? 'approved' : 'pending',
        created_by: currentUser.name
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

    const totalThu = filteredReceipts.filter(r => r.type === 'thu').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    const totalChi = filteredReceipts.filter(r => r.type === 'chi').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    return (
      <div className="p-6 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold">🧾 Phiếu Thu/Chi</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { setFormType('thu'); resetForm(); setShowCreateModal(true); }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
            >
              ➕ Tạo Phiếu Thu
            </button>
            <button
              onClick={() => { setFormType('chi'); resetForm(); setShowCreateModal(true); }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
            >
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
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium mb-1">Tìm kiếm</label>
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Tìm theo mô tả..." className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border">
          {filteredReceipts.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-6xl mb-4">📝</div>
              <p className="text-gray-500">Chưa có phiếu thu/chi nào</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredReceipts.map(receipt => (
                <div key={receipt.id} onClick={() => openDetailModal(receipt)} className="p-4 hover:bg-gray-50 cursor-pointer transition-colors">
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={receipt.type === 'thu' ? "px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700" : "px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700"}>
                          {receipt.type === 'thu' ? 'THU' : 'CHI'}
                        </span>
                        <span className="font-bold">{receipt.receipt_number}</span>
                        <span className={receipt.status === 'approved' ? "px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700" : receipt.status === 'rejected' ? "px-2 py-0.5 rounded text-xs bg-red-100 text-red-700" : "px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700"}>
                          {receipt.status === 'approved' ? '✓ Đã duyệt' : receipt.status === 'rejected' ? '✗ Từ chối' : '⏳ Chờ duyệt'}
                        </span>
                      </div>
                      <div className="text-gray-700">{receipt.description}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        📅 {new Date(receipt.receipt_date).toLocaleDateString('vi-VN')}
                        {receipt.category && <span> • 📁 {receipt.category}</span>}
                        {receipt.created_by && <span> • 👤 {receipt.created_by}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={receipt.type === 'thu' ? "text-xl font-bold text-green-600" : "text-xl font-bold text-red-600"}>
                        {receipt.type === 'thu' ? '+' : '-'}{parseFloat(receipt.amount).toLocaleString('vi-VN')}đ
                      </div>
                      <div className="text-gray-400">→</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                    </div>
                  </div>
                  {(selectedReceipt.status === 'approved' || selectedReceipt.status === 'rejected') && selectedReceipt.approved_by && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="text-xs text-blue-600 mb-1">{selectedReceipt.status === 'approved' ? '✓ Người duyệt' : '✗ Người từ chối'}</div>
                      <div className="font-medium text-blue-800">{selectedReceipt.approved_by}</div>
                      {selectedReceipt.approved_at && (
                        <div className="text-xs text-blue-600 mt-1">Lúc: {new Date(selectedReceipt.approved_at).toLocaleString('vi-VN')}</div>
                      )}
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
                    <div className="p-3 bg-gray-100 rounded-lg border border-gray-300 text-center">
                      <span className="text-gray-600 text-sm">🔒 Phiếu đã duyệt - Không thể chỉnh sửa</span>
                    </div>
                  )}
                </div>
              )}
              
              <div className="p-6 border-t bg-gray-50">
                {isEditing ? (
                  <div className="flex gap-3">
                    <button onClick={() => setIsEditing(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Hủy</button>
                    <button onClick={handleUpdateReceipt} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">💾 Lưu thay đổi</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedReceipt.status === 'pending' && (currentUser.role === 'Admin' || currentUser.role === 'admin' || currentUser.role === 'Manager') && (
                      <div className="flex gap-3">
                        <button onClick={() => handleApprove(selectedReceipt.id)} className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">✓ Duyệt</button>
                        <button onClick={() => handleReject(selectedReceipt.id)} className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium">✗ Từ chối</button>
                      </div>
                    )}
                    <div className="flex gap-3">
                      {selectedReceipt.status === 'pending' && (currentUser.role === 'Admin' || currentUser.role === 'admin' || selectedReceipt.created_by === currentUser.name) && (
                        <button onClick={() => setIsEditing(true)} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">✏️ Sửa</button>
                      )}
                      {selectedReceipt.status === 'pending' && (currentUser.role === 'Admin' || currentUser.role === 'admin') && (
                        <button onClick={() => handleDelete(selectedReceipt.id)} className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">🗑️ Xóa</button>
                      )}
                      <button onClick={() => setShowDetailModal(false)} className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">Đóng</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function DebtsView() {
    const receivables = debts.filter(d => d.type === 'receivable');
    const payables = debts.filter(d => d.type === 'payable');

    return (
      <div className="p-6 space-y-4">
        <h2 className="text-2xl font-bold">📋 Quản Lý Công Nợ</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-bold mb-3">💵 Phải Thu</h3>
            {receivables.length === 0 ? (
              <p className="text-gray-500 text-sm">Không có công nợ phải thu</p>
            ) : (
              <div className="space-y-2">
                {receivables.map(debt => (
                  <div key={debt.id} className="p-3 bg-green-50 rounded-lg">
                    <div className="font-medium">{debt.partner_name}</div>
                    <div className="text-sm text-gray-600">{debt.debt_number}</div>
                    <div className="mt-2 flex justify-between">
                      <span className="text-xs text-gray-500">Còn lại:</span>
                      <span className="font-bold text-green-600">
                        {(parseFloat(debt.remaining_amount) / 1000000).toFixed(1)}M
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-bold mb-3">💳 Phải Trả</h3>
            {payables.length === 0 ? (
              <p className="text-gray-500 text-sm">Không có công nợ phải trả</p>
            ) : (
              <div className="space-y-2">
                {payables.map(debt => (
                  <div key={debt.id} className="p-3 bg-red-50 rounded-lg">
                    <div className="font-medium">{debt.partner_name}</div>
                    <div className="text-sm text-gray-600">{debt.debt_number}</div>
                    <div className="mt-2 flex justify-between">
                      <span className="text-xs text-gray-500">Còn lại:</span>
                      <span className="font-bold text-red-600">
                        {(parseFloat(debt.remaining_amount) / 1000000).toFixed(1)}M
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function SalariesView() {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-2xl font-bold">💰 Quản Lý Lương & Thưởng</h2>
        
        <div className="bg-white rounded-xl border p-4">
          {salaries.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Chưa có dữ liệu lương. Hãy chạy demo-data.sql để có dữ liệu mẫu.</p>
          ) : (
            <div className="space-y-3">
              {salaries.map(salary => (
                <div key={salary.id} className="p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold">{salary.employee_name}</div>
                      <div className="text-sm text-gray-600">Tháng {salary.month}/{salary.year}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Lương CB: {(parseFloat(salary.base_salary) / 1000000).toFixed(1)}M • 
                        Thưởng: {((parseFloat(salary.bonus || 0) + parseFloat(salary.commission || 0)) / 1000000).toFixed(1)}M
                      </div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-blue-600">
                        {(parseFloat(salary.total_salary) / 1000000).toFixed(1)}M
                      </div>
                      <div className={`text-xs px-2 py-1 rounded mt-1 ${
                        salary.status === 'paid' ? 'bg-green-100 text-green-700' : 
                        salary.status === 'approved' ? 'bg-blue-100 text-blue-700' : 
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {salary.status === 'paid' ? 'Đã trả' : salary.status === 'approved' ? 'Đã duyệt' : 'Nháp'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
}

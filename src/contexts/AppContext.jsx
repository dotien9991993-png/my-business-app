import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import bcrypt from 'bcryptjs';
import { supabase } from '../supabaseClient';
import { getTenantSlug } from '../utils/tenantUtils';
import { useHashRouter } from '../hooks/useHashRouter';
import { isAdmin } from '../utils/permissionUtils';
import { logActivity } from '../lib/activityLog';

// Helper: strip sensitive fields before saving to localStorage
const safeUserForStorage = (user) => {
  if (!user) return null;
  const { password: _, ...safe } = user;
  return safe;
};

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // ---- Routing ----
  const { path, navigate } = useHashRouter();

  // ---- Tenant state ----
  const [tenant, setTenant] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantError, setTenantError] = useState(null);

  // ---- Auth state ----
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // ---- Navigation state ----
  const [activeModule, setActiveModule] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('overview');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [pendingOpenRecord, setPendingOpenRecord] = useState(null); // { type, id }

  // ---- Users & Permissions ----
  const [allUsers, setAllUsers] = useState([]);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [userPermissions, setUserPermissions] = useState({});

  // ---- Load tenant on mount ----
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
        
        if (data.plan_expires_at && new Date(data.plan_expires_at) < new Date()) {
          setTenantError('Gói dịch vụ đã hết hạn. Vui lòng liên hệ để gia hạn.');
          setTenantLoading(false);
          return;
        }
        
        setTenant(data);
        setTenantLoading(false);
      } catch (_err) {
        setTenantError('Lỗi kết nối. Vui lòng thử lại.');
        setTenantLoading(false);
      }
    };
    loadTenant();
  }, []);

  const reloadTenant = useCallback(async () => {
    if (!tenant) return;
    try {
      const { data } = await supabase.from('tenants').select('*').eq('id', tenant.id).single();
      if (data) setTenant(data);
    } catch (err) { console.error('Error reloading tenant:', err); }
  }, [tenant]);

  // ---- Sync URL <-> navigation ----
  useEffect(() => {
    if (path && isLoggedIn) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length >= 1) {
        const module = parts[0];
        const tab = parts[1] || 'dashboard';
        if (['dashboard', 'media', 'warehouse', 'sales', 'technical', 'finance', 'warranty', 'hrm', 'settings', 'chat'].includes(module)) {
          setActiveModule(module);
          setActiveTab(tab);
        }
      }
    }
  }, [path, isLoggedIn]);

  // ---- Restore session from localStorage ----
  useEffect(() => {
    if (!tenant) return;
    
    const savedUser = localStorage.getItem(`${tenant.slug}_user`);
    const savedLoggedIn = localStorage.getItem(`${tenant.slug}_loggedIn`);
    
    if (savedUser && savedLoggedIn === 'true') {
      try {
        const user = JSON.parse(savedUser);
        if (user.tenant_id === tenant.id) {
          const fetchLatestUser = async () => {
            try {
              const { data: latestUser, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .eq('tenant_id', tenant.id)
                .single();
              
              if (error || !latestUser) {
                localStorage.removeItem(`${tenant.slug}_user`);
                localStorage.removeItem(`${tenant.slug}_loggedIn`);
                return;
              }

              // Check if account is still approved and active
              if (latestUser.status && latestUser.status !== 'approved') {
                localStorage.removeItem(`${tenant.slug}_user`);
                localStorage.removeItem(`${tenant.slug}_loggedIn`);
                return;
              }
              if (latestUser.is_active === false) {
                localStorage.removeItem(`${tenant.slug}_user`);
                localStorage.removeItem(`${tenant.slug}_loggedIn`);
                return;
              }

              setCurrentUser(latestUser);
              setIsLoggedIn(true);
              localStorage.setItem(`${tenant.slug}_user`, JSON.stringify(safeUserForStorage(latestUser)));
              
              if (!window.location.hash) {
                navigate('dashboard/overview');
              }
            } catch (err) {
              console.error('Error fetching latest user:', err);
              setCurrentUser(user);
              setIsLoggedIn(true);
            }
          };
          fetchLatestUser();
        } else {
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

  // ---- Navigation helper ----
  const navigateTo = useCallback((module, tab, openRecord) => {
    setActiveModule(module);
    setActiveTab(tab);
    navigate(`${module}/${tab}`);
    if (openRecord) {
      setPendingOpenRecord(openRecord);
    }
  }, [navigate]);

  // ---- Permission helpers ----
  const hasFinanceFullAccess = useCallback(() => {
    if (!currentUser) return false;
    if (isAdmin(currentUser)) return true;
    return (currentUser.permissions?.finance || 0) >= 2;
  }, [currentUser]);

  const canCreateFinance = useCallback(() => {
    if (!currentUser) return false;
    if (isAdmin(currentUser)) return true;
    const level = currentUser.permissions?.finance || 0;
    return level >= 1;
  }, [currentUser]);

  const canEditFinance = useCallback(() => {
    if (!currentUser) return false;
    if (isAdmin(currentUser)) return true;
    return (currentUser.permissions?.finance || 0) >= 3;
  }, [currentUser]);

  const canEditOwnFinance = useCallback((createdBy) => {
    if (!currentUser) return false;
    if (isAdmin(currentUser)) return true;
    const level = currentUser.permissions?.finance || 0;
    if (level >= 3) return true;
    if ((level === 1 || level === 2) && createdBy === currentUser.name) return true;
    return false;
  }, [currentUser]);

  const canAccessModule = useCallback((module) => {
    if (!currentUser) return false;
    if (isAdmin(currentUser)) return true;
    return (currentUser.permissions?.[module] || 0) > 0;
  }, [currentUser]);

  const canAccessTab = useCallback((module, tabId) => {
    if (!currentUser) return false;
    if (isAdmin(currentUser)) return true;
    const moduleLevel = currentUser.permissions?.[module] || 0;
    if (moduleLevel === 0) return false;
    const allowedTabs = currentUser.allowed_tabs?.[module];
    if (!allowedTabs || allowedTabs.length === 0) return true;
    return allowedTabs.includes(tabId);
  }, [currentUser]);

  const hasPermission = useCallback((module, minLevel = 1) => {
    if (!currentUser) return false;
    if (isAdmin(currentUser)) return true;
    const userLevel = currentUser.permissions?.[module] || 0;
    return userLevel >= minLevel;
  }, [currentUser]);

  const getPermissionLevel = useCallback((module) => {
    if (!currentUser) return 0;
    if (isAdmin(currentUser)) return 3;
    return currentUser.permissions?.[module] || 0;
  }, [currentUser]);

  const canView = useCallback((module) => hasPermission(module, 1), [hasPermission]);
  const canViewAll = useCallback((module) => hasPermission(module, 2), [hasPermission]);
  const canEdit = useCallback((module) => hasPermission(module, 3), [hasPermission]);

  const filterByPermission = useCallback((data, module, userField = 'created_by') => {
    if (!currentUser) return [];
    const level = getPermissionLevel(module);
    if (level >= 2) return data;
    return data.filter(item =>
      item[userField] === currentUser.name ||
      item.assignee === currentUser.name ||
      item.created_by === currentUser.name
    );
  }, [currentUser, getPermissionLevel]);

  // ---- Data loading: users & permissions ----
  const loadUsers = useCallback(async () => {
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
  }, [tenant]);

  const loadPermissions = useCallback(async () => {
    try {
      const { data } = await supabase.from('user_permissions').select('*');
      const permsObj = {};
      (data || []).forEach(p => {
        if (!permsObj[p.user_id]) permsObj[p.user_id] = {};
        permsObj[p.user_id][p.module] = p.permission_level;
      });
      setUserPermissions(permsObj);
    } catch (_e) { /* ignore */ }
  }, []);

  // ---- Auth handlers ----
  const handleLogin = useCallback(async (email, inputPassword) => {
    try {
      // Query by email only (not password) to support both hashed and plaintext
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('email', email)
        .single();

      if (error || !data) {
        alert('Sai email hoặc mật khẩu!');
        return;
      }

      // Verify password
      let passwordValid = false;
      if (data.password_hashed) {
        // Hashed password — use bcrypt compare
        passwordValid = await bcrypt.compare(inputPassword, data.password);
      } else {
        // Legacy plaintext — direct comparison
        passwordValid = (inputPassword === data.password);
        // Auto-migrate to hashed password on successful login
        if (passwordValid) {
          try {
            const hashed = await bcrypt.hash(inputPassword, 10);
            await supabase
              .from('users')
              .update({ password: hashed, password_hashed: true })
              .eq('id', data.id);
          } catch (hashErr) {
            console.error('Auto-hash migration failed:', hashErr);
          }
        }
      }

      if (!passwordValid) {
        alert('Sai email hoặc mật khẩu!');
        return;
      }

      // Check account status
      if (data.status === 'pending') {
        alert('Tài khoản đang chờ Admin duyệt. Vui lòng liên hệ quản lý.');
        return;
      }
      if (data.status === 'rejected') {
        alert('Tài khoản đã bị từ chối. Vui lòng liên hệ quản lý.');
        return;
      }
      if (data.status === 'suspended') {
        alert('Tài khoản đã bị khóa. Vui lòng liên hệ quản lý.');
        return;
      }
      if (data.is_active === false) {
        alert('Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản lý.');
        return;
      }

      setCurrentUser(data);
      setIsLoggedIn(true);
      setShowLoginModal(false);
      localStorage.setItem(`${tenant.slug}_user`, JSON.stringify(safeUserForStorage(data)));
      localStorage.setItem(`${tenant.slug}_loggedIn`, 'true');
      navigate('dashboard/overview');

      // Log login activity
      logActivity({
        tenantId: tenant.id, userId: data.id, userName: data.name,
        module: 'auth', action: 'login', description: `${data.name} đăng nhập`
      });
    } catch (error) {
      console.error('Error logging in:', error);
      alert('Lỗi khi đăng nhập!');
    }
  }, [tenant, navigate]);

  const handleRegister = useCallback(async (name, email, password, phone, team, role) => {
    if (!name || !email || !password || !team || !role) {
      alert('❌ Vui lòng điền đầy đủ thông tin bắt buộc!');
      return false;
    }
    if (password.length < 6) {
      alert('❌ Mật khẩu phải có ít nhất 6 ký tự!');
      return false;
    }
    try {
      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);

      if (count >= tenant.max_users) {
        alert(`❌ Đã đạt giới hạn ${tenant.max_users} người dùng. Vui lòng nâng cấp gói!`);
        return false;
      }

      const { data: existing } = await supabase
        .from('users')
        .select('email')
        .eq('tenant_id', tenant.id)
        .eq('email', email)
        .single();

      if (existing) {
        alert('❌ Email đã tồn tại!');
        return false;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const { error } = await supabase
        .from('users')
        .insert([{
          tenant_id: tenant.id, name, email, password: hashedPassword, phone,
          team, role, status: 'pending', is_active: true, password_hashed: true
        }]);

      if (error) throw error;

      // Notify all admins about new registration
      try {
        const admins = allUsers.filter(u => isAdmin(u));
        if (admins.length > 0) {
          const notifications = admins.map(admin => ({
            tenant_id: tenant.id,
            user_id: admin.id,
            type: 'new_registration',
            title: 'Tài khoản mới chờ duyệt',
            message: `${name} (${email}) vừa đăng ký tài khoản - Team ${team}`,
            icon: '👤',
            is_read: false
          }));
          await supabase.from('notifications').insert(notifications);
        }
      } catch (notifErr) {
        console.error('Error notifying admins:', notifErr);
      }

      await loadUsers();
      return true;
    } catch (error) {
      console.error('Error registering:', error);
      alert('❌ Lỗi khi đăng ký!');
      return false;
    }
  }, [tenant, loadUsers, allUsers]);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActiveTab('dashboard');
    if (tenant) {
      localStorage.removeItem(`${tenant.slug}_user`);
      localStorage.removeItem(`${tenant.slug}_loggedIn`);
    }
    setShowMobileSidebar(false);
  }, [tenant]);

  // ---- User CRUD (Admin) ----
  const changeUserRole = useCallback(async (userId, newRole) => {
    if (!isAdmin(currentUser)) {
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
  }, [currentUser, loadUsers]);

  const deleteUser = useCallback(async (userId) => {
    if (!isAdmin(currentUser)) {
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
  }, [currentUser, loadUsers]);

  // ---- Change password ----
  const changePassword = useCallback(async (userId, oldPassword, newPassword) => {
    if (!newPassword || newPassword.length < 6) {
      alert('Mật khẩu mới phải có ít nhất 6 ký tự!');
      return false;
    }
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('password, password_hashed')
        .eq('id', userId)
        .single();
      if (error || !user) {
        alert('Không tìm thấy tài khoản!');
        return false;
      }

      // Verify old password
      let oldValid = false;
      if (user.password_hashed) {
        oldValid = await bcrypt.compare(oldPassword, user.password);
      } else {
        oldValid = (oldPassword === user.password);
      }
      if (!oldValid) {
        alert('Mật khẩu cũ không đúng!');
        return false;
      }

      // Hash and save new password
      const hashed = await bcrypt.hash(newPassword, 10);
      const { error: updateErr } = await supabase
        .from('users')
        .update({ password: hashed, password_hashed: true })
        .eq('id', userId);
      if (updateErr) throw updateErr;

      alert('Đổi mật khẩu thành công!');
      return true;
    } catch (err) {
      console.error('Error changing password:', err);
      alert('Lỗi khi đổi mật khẩu!');
      return false;
    }
  }, []);

  const value = {
    // Tenant
    tenant, tenantLoading, tenantError, reloadTenant,
    // Auth
    isLoggedIn, currentUser, setCurrentUser,
    showLoginModal, setShowLoginModal,
    showRegisterModal, setShowRegisterModal,
    handleLogin, handleRegister, handleLogout, changePassword,
    // Navigation
    path, navigate,
    activeModule, setActiveModule, activeTab, setActiveTab, navigateTo,
    pendingOpenRecord, setPendingOpenRecord,
    showMobileSidebar, setShowMobileSidebar,
    showAdminMenu, setShowAdminMenu,
    // Users
    allUsers, setAllUsers, loadUsers, loadPermissions,
    showPermissionsModal, setShowPermissionsModal, userPermissions,
    // User CRUD
    changeUserRole, deleteUser,
    // Permissions
    canAccessModule, canAccessTab, hasPermission, getPermissionLevel,
    hasFinanceFullAccess, canCreateFinance, canEditFinance, canEditOwnFinance,
    canView, canViewAll, canEdit, filterByPermission,
    // Supabase (for components that need direct access)
    supabase,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { getTenantSlug } from '../../utils/tenantUtils';

export function useMobileAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load tenant
  useEffect(() => {
    const loadTenant = async () => {
      try {
        const slug = getTenantSlug();
        const { data, error } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', slug)
          .single();
        if (error || !data) {
          console.error('Tenant not found:', slug);
          setLoading(false);
          return;
        }
        setTenant(data);
      } catch (err) {
        console.error('Error loading tenant:', err);
        setLoading(false);
      }
    };
    loadTenant();
  }, []);

  // Restore session from localStorage
  useEffect(() => {
    if (!tenant) return;

    const restore = async () => {
      const savedUser = localStorage.getItem(`${tenant.slug}_user`);
      const savedLoggedIn = localStorage.getItem(`${tenant.slug}_loggedIn`);

      if (savedUser && savedLoggedIn === 'true') {
        try {
          const parsed = JSON.parse(savedUser);
          // Verify user still active
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', parsed.id)
            .eq('tenant_id', tenant.id)
            .single();

          if (!error && data && data.status === 'approved' && data.is_active !== false) {
            setCurrentUser(data);
          } else {
            localStorage.removeItem(`${tenant.slug}_user`);
            localStorage.removeItem(`${tenant.slug}_loggedIn`);
          }
        } catch {
          localStorage.removeItem(`${tenant.slug}_user`);
          localStorage.removeItem(`${tenant.slug}_loggedIn`);
        }
      }
      setLoading(false);
    };
    restore();
  }, [tenant]);

  // Login
  const login = useCallback(async (username, password) => {
    if (!tenant) throw new Error('Tenant chưa tải');

    // Desktop dùng email để đăng nhập
    const cleanInput = username.trim().toLowerCase();
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('email', cleanInput)
      .single();

    if (error || !user) throw new Error('Tài khoản không tồn tại');
    if (user.status !== 'approved') throw new Error('Tài khoản chưa được duyệt');
    if (user.is_active === false) throw new Error('Tài khoản đã bị khoá');

    // Check password — support both bcrypt and plaintext
    let valid = false;
    if (user.password?.startsWith('$2')) {
      const bcrypt = await import('bcryptjs');
      valid = await bcrypt.compare(password, user.password);
    } else {
      valid = user.password === password;
    }
    if (!valid) throw new Error('Sai mật khẩu');

    setCurrentUser(user);
    localStorage.setItem(`${tenant.slug}_user`, JSON.stringify({
      id: user.id, name: user.name, username: user.username,
      role: user.role, avatar_url: user.avatar_url, tenant_id: user.tenant_id
    }));
    localStorage.setItem(`${tenant.slug}_loggedIn`, 'true');
    return user;
  }, [tenant]);

  // Logout
  const logout = useCallback(() => {
    setCurrentUser(null);
    if (tenant) {
      localStorage.removeItem(`${tenant.slug}_user`);
      localStorage.removeItem(`${tenant.slug}_loggedIn`);
    }
  }, [tenant]);

  return {
    currentUser,
    tenant,
    tenantId: tenant?.id || null,
    loading,
    login,
    logout
  };
}

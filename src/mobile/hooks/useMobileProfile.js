import { useState, useCallback } from 'react';
import { supabase } from '../../supabaseClient';

export function useMobileProfile(userId, tenantId) {
  const [loading, setLoading] = useState(false);

  // Fetch latest profile data
  const fetchProfile = useCallback(async () => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  }, [userId]);

  // Fetch salary records for user
  const fetchSalaries = useCallback(async (year) => {
    if (!userId || !tenantId) return [];
    setLoading(true);
    try {
      const monthPrefix = `${year}-`;
      const { data, error } = await supabase
        .from('salaries')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .like('month', `${monthPrefix}%`)
        .order('month', { ascending: false });
      if (error) throw error;
      return data || [];
    } finally {
      setLoading(false);
    }
  }, [userId, tenantId]);

  // Change password
  const changePassword = useCallback(async (oldPassword, newPassword) => {
    if (!userId) throw new Error('Chưa đăng nhập');
    if (newPassword.length < 6) throw new Error('Mật khẩu mới tối thiểu 6 ký tự');

    // Fetch current password
    const { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('password, password_hashed')
      .eq('id', userId)
      .single();
    if (fetchErr) throw new Error('Không thể xác minh mật khẩu');

    // Verify old password
    let valid = false;
    if (user.password_hashed || user.password?.startsWith('$2')) {
      const bcrypt = await import('bcryptjs');
      valid = await bcrypt.compare(oldPassword, user.password);
    } else {
      valid = user.password === oldPassword;
    }
    if (!valid) throw new Error('Mật khẩu cũ không đúng');

    // Hash new password
    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash(newPassword, 10);

    const { error: updateErr } = await supabase
      .from('users')
      .update({ password: hashed, password_hashed: true })
      .eq('id', userId);
    if (updateErr) throw new Error('Không thể cập nhật mật khẩu');
  }, [userId]);

  // Update profile fields
  const updateProfile = useCallback(async (fields) => {
    if (!userId) throw new Error('Chưa đăng nhập');
    const { error } = await supabase
      .from('users')
      .update(fields)
      .eq('id', userId);
    if (error) throw new Error('Không thể cập nhật thông tin');
  }, [userId]);

  return {
    loading,
    fetchProfile,
    fetchSalaries,
    changePassword,
    updateProfile,
  };
}

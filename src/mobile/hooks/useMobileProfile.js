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
    updateProfile,
  };
}

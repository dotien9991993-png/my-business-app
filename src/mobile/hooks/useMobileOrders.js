import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';

const PAGE_SIZE = 30;

export function useMobileOrders(userId, userName, tenantId, permLevel = 3) {
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: 'all',       // order_status filter
    search: '',
    dateRange: 'all',    // all | today | week | month
  });

  // Load orders with server-side pagination
  const loadOrders = useCallback(async (pg = 1) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const from = (pg - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(from, to);

      // Permission: level 1 = only own orders
      if (permLevel === 1) {
        query = query.eq('created_by', userName);
      }

      // Status filter
      if (filters.status !== 'all') {
        query = query.eq('order_status', filters.status);
      }

      // Search
      if (filters.search) {
        const q = filters.search.trim();
        query = query.or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`);
      }

      // Date range
      if (filters.dateRange !== 'all') {
        const now = new Date();
        const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const todayStr = vnNow.toLocaleDateString('en-CA');

        if (filters.dateRange === 'today') {
          query = query.gte('created_at', todayStr + 'T00:00:00');
        } else if (filters.dateRange === 'week') {
          const weekAgo = new Date(vnNow);
          weekAgo.setDate(weekAgo.getDate() - 7);
          query = query.gte('created_at', weekAgo.toLocaleDateString('en-CA') + 'T00:00:00');
        } else if (filters.dateRange === 'month') {
          const monthStart = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, '0')}-01`;
          query = query.gte('created_at', monthStart + 'T00:00:00');
        }
      }

      const { data, count, error } = await query;
      if (error) throw error;

      setOrders(data || []);
      setTotalCount(count || 0);
      setPage(pg);
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, userName, permLevel, filters]);

  useEffect(() => { loadOrders(1); }, [loadOrders]);

  // Load order detail (items + payments)
  const loadOrderDetail = useCallback(async (orderId) => {
    const [itemsRes, paymentsRes] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', orderId),
      supabase.from('payment_transactions').select('*')
        .eq('tenant_id', tenantId)
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
    ]);
    return {
      items: itemsRes.data || [],
      payments: paymentsRes.data || [],
    };
  }, [tenantId]);

  // Update filters
  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Pagination
  const hasMore = page * PAGE_SIZE < totalCount;
  const loadMore = useCallback(() => {
    if (hasMore) loadOrders(page + 1);
  }, [hasMore, page, loadOrders]);

  return {
    orders,
    totalCount,
    loading,
    filters,
    updateFilter,
    loadOrders,
    loadOrderDetail,
    hasMore,
    loadMore,
    refresh: () => loadOrders(1),
  };
}

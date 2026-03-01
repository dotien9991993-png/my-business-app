import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { getVietnamDate } from '../../utils/dateUtils';
import { orderStatuses, paymentMethods } from '../../constants/salesConstants';

export default function SalesReportView({ orders, products, tenant }) {
  // Period selector
  const [period, setPeriod] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Calculate date range
  const dateRange = useMemo(() => {
    const now = getVietnamDate();
    let start, end;

    switch (period) {
      case 'month': {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      }
      case 'lastMonth': {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      }
      case 'quarter': {
        const q = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), q * 3, 1);
        end = new Date(now.getFullYear(), q * 3 + 3, 0);
        break;
      }
      case 'year': {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      }
      case 'custom': {
        start = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1);
        end = customEnd ? new Date(customEnd) : now;
        break;
      }
      default: {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0] + 'T23:59:59',
      label: period === 'month' ? `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`
        : period === 'lastMonth' ? `Tháng ${now.getMonth() === 0 ? 12 : now.getMonth()}/${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}`
        : period === 'quarter' ? `Quý ${Math.floor(now.getMonth() / 3) + 1}/${now.getFullYear()}`
        : period === 'year' ? `Năm ${now.getFullYear()}`
        : 'Tùy chọn'
    };
  }, [period, customStart, customEnd]);

  // Filter orders in date range
  const periodOrders = useMemo(() => {
    return (orders || []).filter(o => {
      const d = o.created_at;
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [orders, dateRange]);

  // ---- Load refunds ----
  const [refundTotal, setRefundTotal] = useState(0);
  useEffect(() => {
    if (!tenant?.id) return;
    const loadRefunds = async () => {
      try {
        const { data } = await supabase.from('order_returns')
          .select('total_refund')
          .eq('tenant_id', tenant.id)
          .eq('status', 'completed')
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end);
        setRefundTotal((data || []).reduce((s, r) => s + parseFloat(r.total_refund || 0), 0));
      } catch (_e) { setRefundTotal(0); }
    };
    loadRefunds();
  }, [tenant, dateRange.start, dateRange.end]);

  // ---- Stats ----
  const isRevenueOrder = (o) => ['completed', 'delivered'].includes(o.order_status || o.status);
  const stats = useMemo(() => {
    const completed = periodOrders.filter(isRevenueOrder);
    const cancelled = periodOrders.filter(o => (o.order_status || o.status) === 'cancelled');
    const grossRevenue = completed.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const revenue = grossRevenue - refundTotal;
    const avgOrder = completed.length > 0 ? revenue / completed.length : 0;
    const cancelRate = periodOrders.length > 0 ? (cancelled.length / periodOrders.length * 100) : 0;
    const posOrders = periodOrders.filter(o => o.order_type === 'pos');
    const onlineOrders = periodOrders.filter(o => o.order_type === 'online');
    const posRevenue = posOrders.filter(isRevenueOrder).reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const onlineRevenue = onlineOrders.filter(isRevenueOrder).reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const unpaid = periodOrders.filter(o => o.payment_status === 'unpaid' || o.payment_status === 'partial' || o.payment_status === 'partial_paid');
    const debtTotal = unpaid.reduce((s, o) => s + (parseFloat(o.total_amount || 0) - parseFloat(o.paid_amount || 0)), 0);

    return {
      totalOrders: periodOrders.length,
      completedOrders: completed.length,
      cancelledOrders: cancelled.length,
      revenue, grossRevenue, avgOrder, cancelRate, refundTotal,
      posCount: posOrders.length, onlineCount: onlineOrders.length,
      posRevenue, onlineRevenue, debtTotal,
    };
  }, [periodOrders, refundTotal]);

  // ---- Revenue by day/month chart ----
  const revenueChartData = useMemo(() => {
    const completed = periodOrders.filter(isRevenueOrder);
    const map = {};
    const isDaysView = period === 'month' || period === 'lastMonth' || period === 'custom';

    completed.forEach(o => {
      const d = new Date(o.created_at);
      const key = isDaysView
        ? `${d.getDate()}/${d.getMonth() + 1}`
        : `T${d.getMonth() + 1}`;
      map[key] = (map[key] || 0) + parseFloat(o.total_amount || 0);
    });

    return Object.entries(map)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => {
        const numA = parseInt(a.name.replace(/[^\d]/g, ''));
        const numB = parseInt(b.name.replace(/[^\d]/g, ''));
        return numA - numB;
      });
  }, [periodOrders, period]);

  // ---- Orders by status (PieChart) ----
  const statusChartData = useMemo(() => {
    const map = {};
    periodOrders.forEach(o => {
      const effectiveStatus = o.order_status || o.status;
      const label = orderStatuses[effectiveStatus]?.label || effectiveStatus;
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [periodOrders]);

  const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#f97316', '#6b7280'];

  // ---- Top employees ----
  const topEmployees = useMemo(() => {
    const completed = periodOrders.filter(isRevenueOrder);
    const map = {};
    completed.forEach(o => {
      const name = o.created_by || 'Không rõ';
      if (!map[name]) map[name] = { name, revenue: 0, count: 0 };
      map[name].revenue += parseFloat(o.total_amount || 0);
      map[name].count += 1;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [periodOrders]);

  // ---- Top customers ----
  const topCustomers = useMemo(() => {
    const completed = periodOrders.filter(isRevenueOrder);
    const map = {};
    completed.forEach(o => {
      const name = o.customer_name || 'Khách lẻ';
      if (!map[name]) map[name] = { name, revenue: 0, count: 0 };
      map[name].revenue += parseFloat(o.total_amount || 0);
      map[name].count += 1;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [periodOrders]);

  // ---- POS vs Online chart ----
  const channelData = useMemo(() => [
    { name: 'Tại quầy (POS)', value: stats.posRevenue },
    { name: 'Online', value: stats.onlineRevenue },
  ].filter(d => d.value > 0), [stats]);

  // ---- Top products (query order_items) ----
  const [topProducts, setTopProducts] = useState([]);
  const [loadingTopProducts, setLoadingTopProducts] = useState(false);

  useEffect(() => {
    const loadTopProducts = async () => {
      setLoadingTopProducts(true);
      try {
        const { data } = await supabase
          .from('order_items')
          .select('product_id, product_name, quantity, total_price, orders!inner(status, order_status, created_at)')
          .gte('orders.created_at', dateRange.start)
          .lte('orders.created_at', dateRange.end)
          .in('orders.order_status', ['completed']);
        const map = {};
        (data || []).forEach(item => {
          const key = item.product_id || item.product_name;
          if (!map[key]) map[key] = { product_id: item.product_id, name: item.product_name, quantity: 0, revenue: 0 };
          map[key].quantity += item.quantity;
          map[key].revenue += parseFloat(item.total_price || 0);
        });
        setTopProducts(Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
      } catch (err) {
        console.error(err);
        setTopProducts([]);
      }
      setLoadingTopProducts(false);
    };
    loadTopProducts();
  }, [dateRange.start, dateRange.end]);

  // ---- Profit calculation ----
  const profitStats = useMemo(() => {
    let totalCost = 0;
    topProducts.forEach(p => {
      const product = (products || []).find(pr => pr.id === p.product_id);
      if (product) totalCost += parseFloat(product.import_price || 0) * p.quantity;
    });
    return {
      revenue: stats.revenue, cost: totalCost,
      profit: stats.revenue - totalCost,
      margin: stats.revenue > 0 ? ((stats.revenue - totalCost) / stats.revenue * 100) : 0
    };
  }, [topProducts, products, stats.revenue]);

  // ---- Previous period comparison ----
  const prevStats = useMemo(() => {
    if (period === 'custom') return null;
    const now = getVietnamDate();
    let prevStart, prevEnd;
    switch (period) {
      case 'month': prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); prevEnd = new Date(now.getFullYear(), now.getMonth(), 0); break;
      case 'lastMonth': prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1); prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0); break;
      case 'quarter': { const q = Math.floor(now.getMonth() / 3); prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1); prevEnd = new Date(now.getFullYear(), q * 3, 0); break; }
      case 'year': prevStart = new Date(now.getFullYear() - 1, 0, 1); prevEnd = new Date(now.getFullYear() - 1, 11, 31); break;
      default: return null;
    }
    const ps = prevStart.toISOString().split('T')[0];
    const pe = prevEnd.toISOString().split('T')[0] + 'T23:59:59';
    const prev = (orders || []).filter(o => o.created_at >= ps && o.created_at <= pe);
    const completed = prev.filter(isRevenueOrder);
    const revenue = completed.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    return { revenue, orders: prev.length, completed: completed.length };
  }, [orders, period]);

  // ---- Export report ----
  const exportReportCSV = () => {
    const rows = [
      ['Doanh thu', stats.revenue], ['Tổng đơn', stats.totalOrders],
      ['Đơn hoàn thành', stats.completedOrders], ['Đơn hủy', stats.cancelledOrders],
      ['Tỷ lệ hủy (%)', stats.cancelRate.toFixed(1)],
      ['POS - Doanh thu', stats.posRevenue], ['POS - Số đơn', stats.posCount],
      ['Online - Doanh thu', stats.onlineRevenue], ['Online - Số đơn', stats.onlineCount],
      ['Công nợ', stats.debtTotal],
      ['Lợi nhuận gộp', profitStats.profit], ['Biên lợi nhuận (%)', profitStats.margin.toFixed(1)],
    ];
    const csv = ['Chỉ số,Giá trị', ...rows.map(r => `"${r[0]}","${r[1]}"`)].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `bao-cao-ban-hang.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Daily revenue table ----
  const dailyRevenueData = useMemo(() => {
    const completed = periodOrders.filter(isRevenueOrder);
    const map = {};
    completed.forEach(o => {
      const date = o.created_at?.split('T')[0] || '';
      if (!map[date]) map[date] = { date, orders: 0, revenue: 0 };
      map[date].orders += 1;
      map[date].revenue += parseFloat(o.total_amount || 0);
    });
    const sorted = Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
    return sorted.map((d, idx) => {
      const prev = sorted[idx + 1];
      const change = prev && prev.revenue > 0 ? ((d.revenue - prev.revenue) / prev.revenue * 100) : null;
      return { ...d, change };
    });
  }, [periodOrders]);

  // ---- Payment method breakdown ----
  const paymentMethodData = useMemo(() => {
    const completed = periodOrders.filter(isRevenueOrder);
    const map = {};
    completed.forEach(o => {
      const method = o.payment_method || 'cash';
      if (!map[method]) map[method] = { method, label: paymentMethods[method]?.label || method, count: 0, revenue: 0 };
      map[method].count += 1;
      map[method].revenue += parseFloat(o.total_amount || 0);
    });
    const result = Object.values(map).sort((a, b) => b.revenue - a.revenue);
    const total = result.reduce((s, d) => s + d.revenue, 0);
    return result.map(d => ({ ...d, percent: total > 0 ? (d.revenue / total * 100) : 0 }));
  }, [periodOrders]);

  const formatTooltipValue = (value) => formatMoney(value);

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">📈 Báo Cáo Bán Hàng</h2>
          <p className="text-sm text-gray-500">{dateRange.label}</p>
        </div>
        <button onClick={exportReportCSV} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 flex items-center gap-1">
          📥 Xuất CSV
        </button>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'month', label: 'Tháng này' },
          { id: 'lastMonth', label: 'Tháng trước' },
          { id: 'quarter', label: 'Quý này' },
          { id: 'year', label: 'Năm nay' },
          { id: 'custom', label: 'Tùy chọn' },
        ].map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${period === p.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="flex gap-2 items-center">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
          <span className="text-gray-400">→</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-4 border-l-4 border-l-green-500">
          <div className="text-sm text-gray-500">Doanh thu {refundTotal > 0 ? '(đã trừ hoàn)' : ''}</div>
          <div className="text-xl font-bold text-green-700">{formatMoney(stats.revenue)}</div>
          <div className="text-xs text-gray-400 mt-1">{stats.completedOrders} đơn hoàn thành</div>
          {refundTotal > 0 && <div className="text-xs text-red-500 mt-0.5">Hoàn trả: -{formatMoney(refundTotal)}</div>}
          {prevStats && prevStats.revenue > 0 && (
            <div className={`text-xs mt-1 font-medium ${stats.revenue >= prevStats.revenue ? 'text-green-600' : 'text-red-500'}`}>
              {stats.revenue >= prevStats.revenue ? '↑' : '↓'} {Math.abs(((stats.revenue - prevStats.revenue) / prevStats.revenue) * 100).toFixed(1)}% vs kỳ trước
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4 border-l-4 border-l-blue-500">
          <div className="text-sm text-gray-500">Tổng đơn hàng</div>
          <div className="text-xl font-bold text-blue-700">{stats.totalOrders}</div>
          <div className="text-xs text-gray-400 mt-1">POS: {stats.posCount} • Online: {stats.onlineCount}</div>
          {prevStats && prevStats.orders > 0 && (
            <div className={`text-xs mt-1 font-medium ${stats.totalOrders >= prevStats.orders ? 'text-green-600' : 'text-red-500'}`}>
              {stats.totalOrders >= prevStats.orders ? '↑' : '↓'} {Math.abs(((stats.totalOrders - prevStats.orders) / prevStats.orders) * 100).toFixed(1)}% vs kỳ trước
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4 border-l-4 border-l-purple-500">
          <div className="text-sm text-gray-500">Đơn trung bình</div>
          <div className="text-xl font-bold text-purple-700">{formatMoney(stats.avgOrder)}</div>
        </div>
        <div className="bg-white rounded-xl border p-4 border-l-4 border-l-red-500">
          <div className="text-sm text-gray-500">Tỷ lệ hủy</div>
          <div className="text-xl font-bold text-red-700">{stats.cancelRate.toFixed(1)}%</div>
          <div className="text-xs text-gray-400 mt-1">{stats.cancelledOrders} đơn hủy</div>
        </div>
      </div>

      {/* Revenue breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-xl p-4">
          <div className="text-sm text-gray-600">POS (Tại quầy)</div>
          <div className="text-lg font-bold text-green-700">{formatMoney(stats.posRevenue)}</div>
          <div className="text-xs text-gray-500">{stats.posCount} đơn</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <div className="text-sm text-gray-600">Online</div>
          <div className="text-lg font-bold text-purple-700">{formatMoney(stats.onlineRevenue)}</div>
          <div className="text-xs text-gray-500">{stats.onlineCount} đơn</div>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <div className="text-sm text-gray-600">Công nợ chưa thu</div>
          <div className="text-lg font-bold text-red-700">{formatMoney(stats.debtTotal)}</div>
        </div>
      </div>

      {/* Profit stats */}
      {profitStats.cost > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
            <div className="text-sm text-gray-600">Lợi nhuận gộp</div>
            <div className="text-lg font-bold text-emerald-700">{formatMoney(profitStats.profit)}</div>
            <div className="text-xs text-gray-500">Biên LN: {profitStats.margin.toFixed(1)}%</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="text-sm text-gray-600">Doanh thu</div>
            <div className="text-lg font-bold text-blue-700">{formatMoney(profitStats.revenue)}</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <div className="text-sm text-gray-600">Giá vốn hàng bán</div>
            <div className="text-lg font-bold text-orange-700">{formatMoney(profitStats.cost)}</div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue trend */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-bold text-sm mb-3">Doanh thu theo thời gian</h3>
          {revenueChartData.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Chưa có dữ liệu</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(0)}tr` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip formatter={formatTooltipValue} />
                <Bar dataKey="revenue" name="Doanh thu" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Orders by status */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-bold text-sm mb-3">Đơn hàng theo trạng thái</h3>
          {statusChartData.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Chưa có dữ liệu</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusChartData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                  {statusChartData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top products */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-bold text-sm mb-3">Top sản phẩm bán chạy</h3>
        {loadingTopProducts ? (
          <div className="text-center py-8 text-gray-400 text-sm">Đang tải...</div>
        ) : topProducts.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">Chưa có dữ liệu</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {topProducts.map((prod, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-600' : 'bg-gray-300'}`}>
                    {idx + 1}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{prod.name}</div>
                    <div className="text-xs text-gray-500">SL: {prod.quantity}</div>
                  </div>
                </div>
                <span className="text-sm font-bold text-green-700">{formatMoney(prod.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tables: Top employees + Top customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top employees */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-bold text-sm mb-3">Top nhân viên bán hàng</h3>
          {topEmployees.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Chưa có dữ liệu</div>
          ) : (
            <div className="space-y-2">
              {topEmployees.map((emp, idx) => (
                <div key={emp.name} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-600' : 'bg-gray-300'}`}>
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{emp.name}</div>
                      <div className="text-xs text-gray-500">{emp.count} đơn</div>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-green-700">{formatMoney(emp.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top customers */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-bold text-sm mb-3">Top khách hàng</h3>
          {topCustomers.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Chưa có dữ liệu</div>
          ) : (
            <div className="space-y-2">
              {topCustomers.map((cust, idx) => (
                <div key={cust.name} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-600' : 'bg-gray-300'}`}>
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{cust.name}</div>
                      <div className="text-xs text-gray-500">{cust.count} đơn</div>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-green-700">{formatMoney(cust.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Channel comparison */}
      {channelData.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-bold text-sm mb-3">Doanh thu theo kênh bán</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={channelData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(0)}tr` : `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
              <Tooltip formatter={formatTooltipValue} />
              <Bar dataKey="value" name="Doanh thu" fill="#16a34a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payment method breakdown */}
      {paymentMethodData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-bold text-sm mb-3">Phương thức thanh toán</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={paymentMethodData} cx="50%" cy="50%" outerRadius={80} dataKey="revenue" nameKey="label" label={({ label, percent }) => `${label}: ${percent.toFixed(1)}%`}>
                  {paymentMethodData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={formatTooltipValue} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-bold text-sm mb-3">Chi tiết PTTT</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 text-gray-600 font-medium">PTTT</th>
                    <th className="text-right py-2 px-2 text-gray-600 font-medium">Số đơn</th>
                    <th className="text-right py-2 px-2 text-gray-600 font-medium">Doanh thu</th>
                    <th className="text-right py-2 px-2 text-gray-600 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentMethodData.map((d, idx) => (
                    <tr key={d.method} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="py-2 px-2 font-medium">{d.label}</td>
                      <td className="py-2 px-2 text-right">{d.count}</td>
                      <td className="py-2 px-2 text-right text-green-700 font-medium">{formatMoney(d.revenue)}</td>
                      <td className="py-2 px-2 text-right text-gray-500">{d.percent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Daily revenue table */}
      {dailyRevenueData.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-bold text-sm mb-3">Doanh thu theo ngày</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">Ngày</th>
                  <th className="text-right py-2 px-3 text-gray-600 font-medium">Số đơn</th>
                  <th className="text-right py-2 px-3 text-gray-600 font-medium">Doanh thu</th>
                  <th className="text-right py-2 px-3 text-gray-600 font-medium">% thay đổi</th>
                </tr>
              </thead>
              <tbody>
                {dailyRevenueData.map((d, idx) => (
                  <tr key={d.date} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-2 px-3">{new Date(d.date).toLocaleDateString('vi-VN')}</td>
                    <td className="py-2 px-3 text-right">{d.orders}</td>
                    <td className="py-2 px-3 text-right font-medium text-green-700">{formatMoney(d.revenue)}</td>
                    <td className="py-2 px-3 text-right">
                      {d.change !== null ? (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${d.change >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {d.change >= 0 ? '↑' : '↓'} {Math.abs(d.change).toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold bg-gray-100">
                  <td className="py-2 px-3">Tổng</td>
                  <td className="py-2 px-3 text-right">{dailyRevenueData.reduce((s, d) => s + d.orders, 0)}</td>
                  <td className="py-2 px-3 text-right text-green-700">{formatMoney(dailyRevenueData.reduce((s, d) => s + d.revenue, 0))}</td>
                  <td className="py-2 px-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useMemo, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from 'recharts';
import { formatMoney } from '../../utils/formatUtils';
import { getTodayVN, formatDateVN, formatDateTimeVN } from '../../utils/dateUtils';
import { isAdmin } from '../../utils/permissionUtils';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';
import {
  TimeFilter, useTimeFilter, StatCard, Section, EmptyState,
  PIE_COLORS, pctChange, filterByDateRange, formatPercent
} from './reportUtils';

// ===== Static helper components =====
const MoneyTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {formatMoney(p.value)}
        </div>
      ))}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const colors = {
    'new': 'bg-blue-100 text-blue-700',
    'confirmed': 'bg-green-100 text-green-700',
    'shipping': 'bg-yellow-100 text-yellow-700',
    'delivered': 'bg-emerald-100 text-emerald-700',
    'completed': 'bg-green-500 text-white',
    'cancelled': 'bg-red-100 text-red-700',
    'returned': 'bg-orange-100 text-orange-700',
    'refunded': 'bg-red-100 text-red-700',
  };
  const labels = {
    'new': 'Mới',
    'confirmed': 'Xác nhận',
    'shipping': 'Giao hàng',
    'delivered': 'Đã giao',
    'completed': 'Hoàn thành',
    'cancelled': 'Đã hủy',
    'returned': 'Trả hàng',
    'refunded': 'Hoàn tiền',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
};

const ProgressBar = ({ value, total, color = 'green' }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const bgMap = { green: 'bg-green-500', red: 'bg-red-500', blue: 'bg-blue-500', orange: 'bg-orange-500' };
  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5">
      <div className={`h-2.5 rounded-full ${bgMap[color] || bgMap.green}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
};

const PctSub = ({ curr, prev, suffix = 'vs kỳ trước' }) => {
  const p = pctChange(curr, prev);
  if (p === 0) return `→ 0% ${suffix}`;
  return `${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% ${suffix}`;
};

// Parse order items (can be JSON string or array)
const parseOrderItems = (order) => {
  if (!order.items) return [];
  if (Array.isArray(order.items)) return order.items;
  try { return JSON.parse(order.items); } catch { return []; }
};

export default function DashboardView() {
  const { currentUser, canAccessModule, navigateTo, allUsers, getPermissionLevel } = useApp();
  const {
    orders, products, receiptsPayments,
    hrmEmployees, hrmAttendances, hrmLeaveRequests, hrmKpiEvaluations,
    warrantyCards, warrantyRepairs, warrantyRequests,
    stockTransactions,
    refreshAllData
  } = useData();

  const tf = useTimeFilter('month');
  const admin = isAdmin(currentUser);
  const canViewProfit = admin || (currentUser?.permissions?.dashboard || 0) >= 3;

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => refreshAllData(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshAllData]);

  const canSee = (mod) => admin || canAccessModule(mod);
  const canSeeFinance = admin || getPermissionLevel('finance') >= 2;

  // ═══════════════════════════════════════
  // PHẦN 1: DOANH THU
  // ═══════════════════════════════════════
  const revenueData = useMemo(() => {
    const validStatuses = o => o.status !== 'cancelled' && o.status !== 'returned' && o.status !== 'refunded';
    const curr = filterByDateRange(orders, 'created_at', tf.range.start, tf.range.end).filter(validStatuses);
    const prev = filterByDateRange(orders, 'created_at', tf.prevRange.start, tf.prevRange.end).filter(validStatuses);

    const revenue = curr.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const prevRevenue = prev.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);

    // COGS: sum(items.quantity * items.cost_price)
    let cogs = 0;
    curr.forEach(o => {
      parseOrderItems(o).forEach(item => {
        const qty = parseFloat(item.quantity || 0);
        const cost = parseFloat(item.cost_price || item.price || 0);
        cogs += qty * cost;
      });
    });
    // Fallback if no item-level cost, use products cost_price
    if (cogs === 0 && curr.length > 0) {
      const productMap = {};
      (products || []).forEach(p => { productMap[p.id] = parseFloat(p.cost_price || 0); });
      curr.forEach(o => {
        parseOrderItems(o).forEach(item => {
          const qty = parseFloat(item.quantity || 0);
          const cost = productMap[item.product_id] || parseFloat(item.price || 0) * 0.7;
          cogs += qty * cost;
        });
      });
    }

    const profit = revenue - cogs;
    let prevCogs = 0;
    prev.forEach(o => {
      parseOrderItems(o).forEach(item => {
        const qty = parseFloat(item.quantity || 0);
        const cost = parseFloat(item.cost_price || item.price || 0);
        prevCogs += qty * cost;
      });
    });
    const prevProfit = prevRevenue - prevCogs;
    const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
    const prevMarginPct = prevRevenue > 0 ? Math.round((prevProfit / prevRevenue) * 100) : 0;
    const avgOrderValue = curr.length > 0 ? revenue / curr.length : 0;
    const prevAvgOrder = prev.length > 0 ? prevRevenue / prev.length : 0;

    return { revenue, prevRevenue, profit, prevProfit, marginPct, prevMarginPct, avgOrderValue, prevAvgOrder };
  }, [orders, products, tf.range.start, tf.range.end, tf.prevRange.start, tf.prevRange.end]);

  // Revenue line chart: current vs previous period, daily
  const revenueChartData = useMemo(() => {
    const validStatuses = o => o.status !== 'cancelled' && o.status !== 'returned' && o.status !== 'refunded';
    const curr = filterByDateRange(orders, 'created_at', tf.range.start, tf.range.end).filter(validStatuses);
    const prev = filterByDateRange(orders, 'created_at', tf.prevRange.start, tf.prevRange.end).filter(validStatuses);

    // Build daily map for current period
    const s = new Date(tf.range.start + 'T00:00:00+07:00');
    const e = new Date(tf.range.end + 'T00:00:00+07:00');
    const ps = new Date(tf.prevRange.start + 'T00:00:00+07:00');

    const data = [];
    const dayMs = 86400000;
    const totalDays = Math.round((e - s) / dayMs) + 1;

    for (let i = 0; i < totalDays; i++) {
      const currDate = new Date(s.getTime() + i * dayMs);
      const prevDate = new Date(ps.getTime() + i * dayMs);
      const currKey = currDate.getFullYear() + '-' + String(currDate.getMonth() + 1).padStart(2, '0') + '-' + String(currDate.getDate()).padStart(2, '0');
      const prevKey = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0') + '-' + String(prevDate.getDate()).padStart(2, '0');

      const currRev = curr.filter(o => (o.created_at || '').slice(0, 10) === currKey).reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
      const prevRev = prev.filter(o => (o.created_at || '').slice(0, 10) === prevKey).reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);

      data.push({
        name: `${String(currDate.getDate()).padStart(2, '0')}/${String(currDate.getMonth() + 1).padStart(2, '0')}`,
        current: currRev,
        previous: prevRev,
      });
    }
    // If too many points, aggregate by week
    if (data.length > 60) {
      const weekly = [];
      for (let i = 0; i < data.length; i += 7) {
        const chunk = data.slice(i, i + 7);
        weekly.push({
          name: chunk[0].name,
          current: chunk.reduce((s, d) => s + d.current, 0),
          previous: chunk.reduce((s, d) => s + d.previous, 0),
        });
      }
      return weekly;
    }
    return data;
  }, [orders, tf.range.start, tf.range.end, tf.prevRange.start, tf.prevRange.end]);

  // ═══════════════════════════════════════
  // PHẦN 2: ĐƠN HÀNG
  // ═══════════════════════════════════════
  const orderData = useMemo(() => {
    const all = filterByDateRange(orders, 'created_at', tf.range.start, tf.range.end);
    const prevAll = filterByDateRange(orders, 'created_at', tf.prevRange.start, tf.prevRange.end);
    const total = all.length;
    const prevTotal = prevAll.length;

    const completed = all.filter(o => o.status === 'completed' || o.status === 'delivered').length;
    const processing = all.filter(o => ['new', 'confirmed', 'shipping'].includes(o.status)).length;
    const cancelled = all.filter(o => ['cancelled', 'returned', 'refunded'].includes(o.status)).length;

    // Cancel reasons
    const reasons = {};
    all.filter(o => ['cancelled', 'returned', 'refunded'].includes(o.status)).forEach(o => {
      const reason = o.cancel_reason || o.notes || 'Khác';
      reasons[reason] = (reasons[reason] || 0) + 1;
    });
    const cancelReasons = Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    return { total, prevTotal, completed, processing, cancelled, cancelReasons };
  }, [orders, tf.range.start, tf.range.end, tf.prevRange.start, tf.prevRange.end]);

  // Order bar chart: daily completed vs cancelled
  const orderChartData = useMemo(() => {
    const all = filterByDateRange(orders, 'created_at', tf.range.start, tf.range.end);
    const s = new Date(tf.range.start + 'T00:00:00+07:00');
    const e = new Date(tf.range.end + 'T00:00:00+07:00');
    const dayMs = 86400000;
    const totalDays = Math.round((e - s) / dayMs) + 1;
    const data = [];

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(s.getTime() + i * dayMs);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const dayOrders = all.filter(o => (o.created_at || '').slice(0, 10) === key);
      data.push({
        name: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        completed: dayOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length,
        cancelled: dayOrders.filter(o => ['cancelled', 'returned', 'refunded'].includes(o.status)).length,
      });
    }
    if (data.length > 60) {
      const weekly = [];
      for (let i = 0; i < data.length; i += 7) {
        const chunk = data.slice(i, i + 7);
        weekly.push({
          name: chunk[0].name,
          completed: chunk.reduce((s, d) => s + d.completed, 0),
          cancelled: chunk.reduce((s, d) => s + d.cancelled, 0),
        });
      }
      return weekly;
    }
    return data;
  }, [orders, tf.range.start, tf.range.end]);

  // ═══════════════════════════════════════
  // PHẦN 3: TÀI CHÍNH
  // ═══════════════════════════════════════
  const financeData = useMemo(() => {
    const curr = filterByDateRange(receiptsPayments, 'receipt_date', tf.range.start, tf.range.end).filter(r => r.status === 'approved');
    const prev = filterByDateRange(receiptsPayments, 'receipt_date', tf.prevRange.start, tf.prevRange.end).filter(r => r.status === 'approved');

    const thu = curr.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const chi = curr.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const prevThu = prev.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const prevChi = prev.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);

    // Fund balance: all time thu - chi
    const allApproved = (receiptsPayments || []).filter(r => r.status === 'approved');
    const totalThu = allApproved.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const totalChi = allApproved.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const fundBalance = totalThu - totalChi;

    return { thu, chi, profit: thu - chi, prevThu, prevChi, prevProfit: prevThu - prevChi, fundBalance };
  }, [receiptsPayments, tf.range.start, tf.range.end, tf.prevRange.start, tf.prevRange.end]);

  // Finance bar chart: Thu/Chi by month (last 6 months)
  const financeChartData = useMemo(() => {
    const curr = filterByDateRange(receiptsPayments, 'receipt_date', tf.range.start, tf.range.end).filter(r => r.status === 'approved');
    const s = new Date(tf.range.start + 'T00:00:00+07:00');
    const e = new Date(tf.range.end + 'T00:00:00+07:00');
    const dayMs = 86400000;
    const totalDays = Math.round((e - s) / dayMs) + 1;

    // Group by day if short range, by month if long
    if (totalDays <= 31) {
      const data = [];
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(s.getTime() + i * dayMs);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const dayR = curr.filter(r => (r.receipt_date || '').slice(0, 10) === key);
        data.push({
          name: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
          thu: dayR.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0),
          chi: dayR.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0),
        });
      }
      return data;
    }
    // Group by month for longer ranges
    const months = {};
    curr.forEach(r => {
      const m = (r.receipt_date || '').slice(0, 7);
      if (!months[m]) months[m] = { thu: 0, chi: 0 };
      if (r.type === 'thu') months[m].thu += parseFloat(r.amount || 0);
      else months[m].chi += parseFloat(r.amount || 0);
    });
    return Object.entries(months).sort().map(([m, v]) => ({
      name: `T${parseInt(m.slice(5))}`,
      ...v,
    }));
  }, [receiptsPayments, tf.range.start, tf.range.end]);

  // Expense structure pie
  const expensePieData = useMemo(() => {
    const curr = filterByDateRange(receiptsPayments, 'receipt_date', tf.range.start, tf.range.end)
      .filter(r => r.status === 'approved' && r.type === 'chi');
    const cats = {};
    curr.forEach(r => {
      const cat = r.category || 'Khác';
      cats[cat] = (cats[cat] || 0) + parseFloat(r.amount || 0);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [receiptsPayments, tf.range.start, tf.range.end]);

  // ═══════════════════════════════════════
  // PHẦN 4: KHO HÀNG
  // ═══════════════════════════════════════
  const warehouseData = useMemo(() => {
    const allP = products || [];
    const totalSKU = allP.length;
    const totalQty = allP.reduce((s, p) => s + parseFloat(p.stock_quantity || 0), 0);
    const totalValue = allP.reduce((s, p) => s + parseFloat(p.stock_quantity || 0) * parseFloat(p.cost_price || p.price || 0), 0);
    const outOfStock = allP.filter(p => parseFloat(p.stock_quantity || 0) <= 0).length;
    const lowStock = allP.filter(p => {
      const qty = parseFloat(p.stock_quantity || 0);
      const min = parseFloat(p.min_stock || 0);
      return min > 0 && qty > 0 && qty <= min;
    });

    return { totalSKU, totalQty, totalValue, outOfStock, lowStockCount: lowStock.length, lowStockItems: lowStock };
  }, [products]);

  // Top 5 best sellers
  const topSellers = useMemo(() => {
    const validOrders = filterByDateRange(orders, 'created_at', tf.range.start, tf.range.end)
      .filter(o => o.status !== 'cancelled' && o.status !== 'returned' && o.status !== 'refunded');
    const salesMap = {};
    validOrders.forEach(o => {
      parseOrderItems(o).forEach(item => {
        const id = item.product_id || item.name;
        if (!salesMap[id]) salesMap[id] = { name: item.name || item.product_name || id, qty: 0, revenue: 0 };
        salesMap[id].qty += parseFloat(item.quantity || 0);
        salesMap[id].revenue += parseFloat(item.quantity || 0) * parseFloat(item.price || 0);
      });
    });
    // Enrich with stock
    const productMap = {};
    (products || []).forEach(p => { productMap[p.id] = p; });
    return Object.values(salesMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map(item => ({
        ...item,
        stock: productMap[item.name]?.stock_quantity ?? '—',
      }));
  }, [orders, products, tf.range.start, tf.range.end]);

  // Low stock items for table
  const lowStockTable = useMemo(() => {
    return (products || [])
      .filter(p => {
        const qty = parseFloat(p.stock_quantity || 0);
        const min = parseFloat(p.min_stock || 0);
        return min > 0 && qty <= min;
      })
      .sort((a, b) => parseFloat(a.stock_quantity || 0) - parseFloat(b.stock_quantity || 0))
      .slice(0, 5);
  }, [products]);

  // ═══════════════════════════════════════
  // PHẦN 5: NHÂN SỰ + BẢO HÀNH
  // ═══════════════════════════════════════
  const hrData = useMemo(() => {
    const today = getTodayVN();
    const active = (hrmEmployees || []).filter(e => e.status === 'active');
    const total = active.length;
    const todayAtt = (hrmAttendances || []).filter(a => a.date === today);
    const present = todayAtt.filter(a => a.check_in).length;
    const onLeave = (hrmLeaveRequests || []).filter(l =>
      l.status === 'approved' && l.start_date <= today && l.end_date >= today
    ).length;
    const absent = Math.max(0, total - present - onLeave);

    // Average KPI
    const evals = hrmKpiEvaluations || [];
    const currEvals = filterByDateRange(evals, 'created_at', tf.range.start, tf.range.end);
    const avgKpi = currEvals.length > 0
      ? Math.round(currEvals.reduce((s, e) => s + parseFloat(e.total_score || 0), 0) / currEvals.length)
      : null;

    // Top employee by KPI
    let topEmployee = null;
    if (currEvals.length > 0) {
      const best = [...currEvals].sort((a, b) => parseFloat(b.total_score || 0) - parseFloat(a.total_score || 0))[0];
      const emp = active.find(e => e.id === best.employee_id);
      topEmployee = emp ? { name: emp.full_name || emp.name, score: Math.round(parseFloat(best.total_score || 0)) } : null;
    }

    return { total, present, onLeave, absent, avgKpi, topEmployee };
  }, [hrmEmployees, hrmAttendances, hrmLeaveRequests, hrmKpiEvaluations, tf.range.start, tf.range.end]);

  const warrantyData = useMemo(() => {
    const today = getTodayVN();
    const activeCards = (warrantyCards || []).filter(c => c.status === 'active').length;
    const newRequests = filterByDateRange(warrantyRequests, 'created_at', tf.range.start, tf.range.end).length;
    const repairing = (warrantyRepairs || []).filter(r => r.status !== 'completed' && r.status !== 'cancelled').length;

    // Expiring within 30 days
    const in30 = new Date(today + 'T00:00:00+07:00');
    in30.setDate(in30.getDate() + 30);
    const expiryDate = in30.getFullYear() + '-' + String(in30.getMonth() + 1).padStart(2, '0') + '-' + String(in30.getDate()).padStart(2, '0');
    const expiringSoon = (warrantyCards || []).filter(c =>
      c.status === 'active' && c.end_date && c.end_date >= today && c.end_date <= expiryDate
    ).length;

    // Defect rate: repairs / active cards
    const totalRepairs = (warrantyRepairs || []).length;
    const defectRate = activeCards > 0 ? ((totalRepairs / activeCards) * 100).toFixed(1) : '0';

    return { activeCards, newRequests, repairing, expiringSoon, defectRate };
  }, [warrantyCards, warrantyRepairs, warrantyRequests, tf.range.start, tf.range.end]);

  // ═══════════════════════════════════════
  // PHẦN 6: HOẠT ĐỘNG GẦN ĐÂY
  // ═══════════════════════════════════════
  const recentActivity = useMemo(() => {
    const activities = [];
    const userMap = {};
    (allUsers || []).forEach(u => { userMap[u.id] = u.name || u.email; });

    (orders || []).forEach(o => {
      activities.push({
        icon: '🛒',
        user: userMap[o.created_by] || o.created_by || '—',
        text: `Tạo đơn hàng ${o.order_number || '#' + String(o.id).slice(-6)} - ${formatMoney(o.total_amount)}`,
        date: o.created_at,
      });
    });
    (receiptsPayments || []).forEach(r => {
      activities.push({
        icon: r.type === 'thu' ? '📥' : '📤',
        user: userMap[r.created_by] || r.created_by || '—',
        text: `${r.type === 'thu' ? 'Phiếu thu' : 'Phiếu chi'}: ${r.description || ''} - ${formatMoney(r.amount)}`,
        date: r.created_at || r.receipt_date,
      });
    });
    (stockTransactions || []).forEach(t => {
      if (t.type === 'import' || t.type === 'export') {
        activities.push({
          icon: t.type === 'import' ? '📥' : '📤',
          user: userMap[t.created_by] || t.created_by || '—',
          text: `${t.type === 'import' ? 'Nhập kho' : 'Xuất kho'}: ${t.product_name || ''} (SL: ${t.quantity || 0})`,
          date: t.created_at,
        });
      }
    });

    return activities
      .filter(a => a.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
  }, [orders, receiptsPayments, stockTransactions, allUsers]);

  // ═══════════════════════════════════════
  // PHẦN 7: ĐƠN HÀNG GẦN NHẤT
  // ═══════════════════════════════════════
  const recentOrders = useMemo(() => {
    return [...(orders || [])]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 5);
  }, [orders]);

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-5 md:space-y-6">
      {/* Header + Time Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <h2 className="text-xl md:text-2xl font-bold">📊 Tổng Quan Doanh Nghiệp</h2>
        <TimeFilter
          timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
          customStart={tf.customStart} setCustomStart={tf.setCustomStart}
          customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd}
        />
      </div>

      {/* ─── PHẦN 1: DOANH THU ─── */}
      {canSee('sales') && (
        <>
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">💰 Doanh Thu</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Doanh Thu" value={formatMoney(revenueData.revenue)} color="green"
                sub={PctSub({ curr: revenueData.revenue, prev: revenueData.prevRevenue })} />
              {canViewProfit && (
                <StatCard label="Lợi Nhuận" value={formatMoney(revenueData.profit)} color="blue"
                  sub={PctSub({ curr: revenueData.profit, prev: revenueData.prevProfit })} />
              )}
              {canViewProfit && (
                <StatCard label="Tỷ Suất LN" value={`${revenueData.marginPct}%`} color="purple"
                  sub={PctSub({ curr: revenueData.marginPct, prev: revenueData.prevMarginPct })} />
              )}
              <StatCard label="Giá Trị TB/Đơn" value={formatMoney(revenueData.avgOrderValue)} color="orange"
                sub={PctSub({ curr: revenueData.avgOrderValue, prev: revenueData.prevAvgOrder })} />
            </div>
          </div>

          {/* Revenue line chart */}
          <Section title="Doanh thu theo thời gian (Kỳ này vs Kỳ trước)">
            {revenueChartData.some(d => d.current > 0 || d.previous > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(0)}tr` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip content={<MoneyTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="current" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3 }} name="Kỳ này" />
                  <Line type="monotone" dataKey="previous" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Kỳ trước" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Chưa có dữ liệu doanh thu" />
            )}
          </Section>
        </>
      )}

      {/* ─── PHẦN 2: ĐƠN HÀNG ─── */}
      {canSee('sales') && (
        <>
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">📦 Đơn Hàng</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Tổng Đơn" value={orderData.total} color="blue"
                sub={PctSub({ curr: orderData.total, prev: orderData.prevTotal })} />
              <StatCard label="Hoàn Thành" value={orderData.completed} color="green"
                sub={orderData.total > 0 ? `${formatPercent(orderData.completed, orderData.total)} tổng đơn` : '0%'} />
              <StatCard label="Đang Xử Lý" value={orderData.processing} color="orange"
                sub={orderData.total > 0 ? `${formatPercent(orderData.processing, orderData.total)} tổng đơn` : '0%'} />
              <StatCard label="Đơn Hoàn/Hủy" value={orderData.cancelled} color="red"
                sub={orderData.total > 0 ? `${formatPercent(orderData.cancelled, orderData.total)} tổng đơn` : '0%'} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Order status detail */}
            <Section title="Trạng thái đơn hàng">
              {orderData.total > 0 ? (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>✅ Hoàn thành: {orderData.completed} đơn ({formatPercent(orderData.completed, orderData.total)})</span>
                      </div>
                      <ProgressBar value={orderData.completed} total={orderData.total} color="green" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>🔄 Đang xử lý: {orderData.processing} đơn ({formatPercent(orderData.processing, orderData.total)})</span>
                      </div>
                      <ProgressBar value={orderData.processing} total={orderData.total} color="blue" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>❌ Đã hủy/hoàn: {orderData.cancelled} đơn ({formatPercent(orderData.cancelled, orderData.total)})</span>
                      </div>
                      <ProgressBar value={orderData.cancelled} total={orderData.total} color="red" />
                    </div>
                  </div>

                  {orderData.cancelled > 0 && (
                    <div className="pt-3 border-t">
                      <div className={`text-sm font-medium mb-2 ${parseFloat(formatPercent(orderData.cancelled, orderData.total)) <= 5 ? 'text-green-600' : 'text-red-600'}`}>
                        Tỷ lệ hoàn đơn: {formatPercent(orderData.cancelled, orderData.total)}
                        {parseFloat(formatPercent(orderData.cancelled, orderData.total)) <= 5 ? ' (tốt < 5%)' : ' (cao > 5%)'}
                      </div>
                      {orderData.cancelReasons.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500 font-medium">Lý do hoàn phổ biến:</div>
                          {orderData.cancelReasons.map((r, i) => (
                            <div key={i} className="text-xs text-gray-600 flex justify-between">
                              <span className="truncate flex-1">- {r.reason}</span>
                              <span className="font-medium ml-2">{r.count} đơn</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState />
              )}
            </Section>

            {/* Order bar chart */}
            <Section title="Đơn hàng theo ngày">
              {orderChartData.some(d => d.completed > 0 || d.cancelled > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={orderChartData} barGap={1}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="completed" fill="#22c55e" radius={[3, 3, 0, 0]} name="Hoàn thành" />
                    <Bar dataKey="cancelled" fill="#ef4444" radius={[3, 3, 0, 0]} name="Hủy/Hoàn" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState text="Chưa có dữ liệu đơn hàng" />
              )}
            </Section>
          </div>
        </>
      )}

      {/* ─── PHẦN 3: TÀI CHÍNH ─── */}
      {canSeeFinance && (
        <>
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">💰 Tài Chính</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Tổng Thu" value={formatMoney(financeData.thu)} color="green"
                sub={PctSub({ curr: financeData.thu, prev: financeData.prevThu })} />
              <StatCard label="Tổng Chi" value={formatMoney(financeData.chi)} color="red"
                sub={PctSub({ curr: financeData.chi, prev: financeData.prevChi })} />
              <StatCard label={financeData.profit >= 0 ? 'Lãi Ròng' : 'Lỗ Ròng'}
                value={formatMoney(Math.abs(financeData.profit))}
                color={financeData.profit >= 0 ? 'blue' : 'red'}
                sub={PctSub({ curr: financeData.profit, prev: financeData.prevProfit })} />
              {canViewProfit && (
                <StatCard label="Số Dư Quỹ" value={formatMoney(financeData.fundBalance)} color="purple" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Finance bar chart */}
            <Section title="Thu/Chi theo thời gian">
              {financeChartData.some(d => d.thu > 0 || d.chi > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={financeChartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} width={45} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(0)}tr` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <Tooltip content={<MoneyTooltip />} />
                    <Legend />
                    <Bar dataKey="thu" fill="#22c55e" radius={[4, 4, 0, 0]} name="Thu" />
                    <Bar dataKey="chi" fill="#ef4444" radius={[4, 4, 0, 0]} name="Chi" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState text="Chưa có dữ liệu tài chính" />
              )}
            </Section>

            {/* Expense pie */}
            {canViewProfit && (
              <Section title="Cơ cấu chi phí">
                {expensePieData.length > 0 ? (
                  <div className="flex flex-col md:flex-row items-center gap-3">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={expensePieData} cx="50%" cy="50%" outerRadius={75} innerRadius={40} dataKey="value" paddingAngle={2}>
                          {expensePieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatMoney(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 text-xs w-full md:w-auto min-w-[140px]">
                      {expensePieData.map((d, i) => {
                        const total = expensePieData.reduce((s, x) => s + x.value, 0);
                        return (
                          <div key={d.name} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-gray-600 truncate flex-1">{d.name}</span>
                            <span className="font-medium">{total > 0 ? Math.round(d.value / total * 100) : 0}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <EmptyState text="Chưa có dữ liệu chi phí" />
                )}
              </Section>
            )}
          </div>
        </>
      )}

      {/* ─── PHẦN 4: KHO HÀNG ─── */}
      {canSee('warehouse') && (
        <>
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">📦 Kho Hàng</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Tổng SP" value={`${warehouseData.totalSKU} SKU`} color="blue" />
              <StatCard label="Tổng Tồn Kho" value={`${warehouseData.totalQty.toLocaleString('vi-VN')} cái`} color="green" />
              {canViewProfit && (
                <StatCard label="Giá Trị Tồn" value={formatMoney(warehouseData.totalValue)} color="orange"
                  sub="(theo giá nhập)" />
              )}
              <StatCard label="Cảnh Báo" value={`${warehouseData.outOfStock} hết`} color="red"
                sub={`${warehouseData.lowStockCount} sắp hết`} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top sellers */}
            <Section title="Top 5 SP bán chạy">
              {topSellers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b">
                        <th className="pb-2 pr-2">#</th>
                        <th className="pb-2 pr-2">Sản phẩm</th>
                        <th className="pb-2 pr-2 text-right">SL bán</th>
                        <th className="pb-2 pr-2 text-right hidden sm:table-cell">Doanh thu</th>
                        <th className="pb-2 text-right">Tồn kho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSellers.map((p, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 pr-2 text-xs font-bold text-gray-400">{i + 1}</td>
                          <td className="py-2 pr-2 text-xs font-medium truncate max-w-[150px]">{p.name}</td>
                          <td className="py-2 pr-2 text-right text-xs font-bold text-green-600">{p.qty}</td>
                          <td className="py-2 pr-2 text-right text-xs hidden sm:table-cell">{formatMoney(p.revenue)}</td>
                          <td className="py-2 text-right text-xs">{p.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState text="Chưa có dữ liệu bán hàng" />
              )}
            </Section>

            {/* Low stock */}
            <Section title="Top 5 SP sắp hết hàng">
              {lowStockTable.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b">
                        <th className="pb-2 pr-2">#</th>
                        <th className="pb-2 pr-2">Sản phẩm</th>
                        <th className="pb-2 pr-2 text-right">Tồn kho</th>
                        <th className="pb-2 pr-2 text-right hidden sm:table-cell">Tối thiểu</th>
                        <th className="pb-2 text-right">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockTable.map((p, i) => {
                        const qty = parseFloat(p.stock_quantity || 0);
                        const isOut = qty <= 0;
                        return (
                          <tr key={i} className={`border-b border-gray-50 ${isOut ? 'bg-red-50' : 'bg-orange-50'}`}>
                            <td className="py-2 pr-2 text-xs font-bold text-gray-400">{i + 1}</td>
                            <td className="py-2 pr-2 text-xs font-medium truncate max-w-[150px]">{p.name}</td>
                            <td className="py-2 pr-2 text-right text-xs font-bold text-red-600">{qty}</td>
                            <td className="py-2 pr-2 text-right text-xs hidden sm:table-cell">{p.min_stock || 0}</td>
                            <td className="py-2 text-right">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isOut ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                {isOut ? 'Hết hàng' : 'Sắp hết'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-green-600 text-sm text-center py-8">✅ Tất cả sản phẩm đều đủ hàng</div>
              )}
            </Section>
          </div>
        </>
      )}

      {/* ─── PHẦN 5: NHÂN SỰ + BẢO HÀNH ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nhân sự */}
        {canSee('hrm') && (
          <Section title="👥 Nhân Sự">
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Tổng NV</span>
                <span className="font-bold text-gray-800">{hrData.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Đi làm hôm nay</span>
                <span className="font-bold text-green-600">
                  {hrData.present}/{hrData.total} ({hrData.total > 0 ? Math.round(hrData.present / hrData.total * 100) : 0}%)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Nghỉ phép</span>
                <span className="font-medium text-blue-600">{hrData.onLeave}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Vắng</span>
                <span className={`font-medium ${hrData.absent > 0 ? 'text-red-600' : 'text-gray-600'}`}>{hrData.absent}</span>
              </div>
              {hrData.avgKpi !== null && (
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-gray-600">KPI trung bình</span>
                  <span className="font-bold text-purple-600">{hrData.avgKpi}/100</span>
                </div>
              )}
              {hrData.topEmployee && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Top NV</span>
                  <span className="font-medium text-green-600">{hrData.topEmployee.name} ({hrData.topEmployee.score}đ)</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Bảo hành */}
        {canSee('warranty') && (
          <Section title="🛡️ Bảo Hành">
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Thẻ BH hiệu lực</span>
                <span className="font-bold text-green-600">{warrantyData.activeCards}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Yêu cầu BH mới</span>
                <span className="font-bold text-blue-600">{warrantyData.newRequests}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Đang sửa chữa</span>
                <span className="font-bold text-orange-600">{warrantyData.repairing}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Sắp hết hạn (30 ngày)</span>
                <span className={`font-medium ${warrantyData.expiringSoon > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                  {warrantyData.expiringSoon}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm text-gray-600">Tỷ lệ lỗi SP</span>
                <span className="font-medium text-gray-700">{warrantyData.defectRate}%</span>
              </div>
            </div>
          </Section>
        )}
      </div>

      {/* ─── PHẦN 6: HOẠT ĐỘNG GẦN ĐÂY ─── */}
      <Section title="🕐 Hoạt Động Gần Đây">
        {recentActivity.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2 pr-2">Thời gian</th>
                  <th className="pb-2 pr-2">Người</th>
                  <th className="pb-2">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((a, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 pr-2 text-xs text-gray-500 whitespace-nowrap">
                      {a.date ? formatDateTimeVN(a.date).split(' ')[1] || formatDateVN(a.date) : '—'}
                    </td>
                    <td className="py-2 pr-2 text-xs font-medium whitespace-nowrap">{a.user}</td>
                    <td className="py-2 text-xs">
                      <span className="mr-1">{a.icon}</span>
                      {a.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có hoạt động" />
        )}
      </Section>

      {/* ─── PHẦN 7: 5 ĐƠN HÀNG GẦN NHẤT ─── */}
      {canSee('sales') && (
        <Section title="🛒 Đơn Hàng Gần Nhất" actions={
          <button onClick={() => navigateTo('sales', 'orders')} className="text-xs text-green-600 hover:text-green-700 font-medium">
            Xem tất cả →
          </button>
        }>
          {recentOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="pb-2 pr-2">Mã đơn</th>
                    <th className="pb-2 pr-2">Khách hàng</th>
                    <th className="pb-2 pr-2 text-right">Tổng tiền</th>
                    <th className="pb-2 pr-2 text-center">Trạng thái</th>
                    <th className="pb-2 text-right">Ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-2 text-xs font-medium text-blue-600">
                        {o.order_number || '#' + String(o.id).slice(-6)}
                      </td>
                      <td className="py-2 pr-2 text-xs truncate max-w-[120px]">{o.customer_name || 'Khách lẻ'}</td>
                      <td className="py-2 pr-2 text-right text-xs font-bold">{formatMoney(o.total_amount)}</td>
                      <td className="py-2 pr-2 text-center"><StatusBadge status={o.status} /></td>
                      <td className="py-2 text-right text-xs text-gray-500">{o.created_at ? formatDateVN(o.created_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="Chưa có đơn hàng" />
          )}
        </Section>
      )}
    </div>
  );
}

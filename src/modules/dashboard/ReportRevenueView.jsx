import React, { useState, useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend, AreaChart, Area } from 'recharts';
import { formatMoney } from '../../utils/formatUtils';
import { formatDateVN } from '../../utils/dateUtils';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';
import {
  TimeFilter, useTimeFilter, StatCard, Section, ExportButton, PrintButton,
  EmptyState, PIE_COLORS, ChartTooltip, exportToCSV, pctChange, filterByDateRange,
} from './reportUtils';
import ReportGrid from './ReportGrid';
import ReportDetailWrapper, { ComingSoon } from './ReportDetailWrapper';

// Status labels map
const STATUS_LABELS = {
  'new': 'Mới',
  'confirmed': 'Xác nhận',
  'shipping': 'Giao hàng',
  'delivered': 'Đã giao',
  'completed': 'Hoàn thành',
  'cancelled': 'Hủy',
  'returned': 'Trả hàng',
};

const STATUS_COLORS = {
  'new': 'bg-blue-100 text-blue-700',
  'confirmed': 'bg-green-100 text-green-700',
  'shipping': 'bg-yellow-100 text-yellow-700',
  'delivered': 'bg-emerald-100 text-emerald-700',
  'completed': 'bg-green-500 text-white',
  'cancelled': 'bg-red-100 text-red-700',
  'returned': 'bg-orange-100 text-orange-700',
};

function parseOrderItems(order) {
  if (!order.items) return [];
  if (typeof order.items === 'string') {
    try { return JSON.parse(order.items); } catch (_e) { return []; }
  }
  return Array.isArray(order.items) ? order.items : [];
}

// ===== REVENUE CONTENT (original summary view) =====
function RevenueContent() {
  useApp();
  const { orders, allUsers } = useData();
  const tf = useTimeFilter('month');

  // Filter valid orders (not cancelled/returned) in current period
  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  // All current period orders (including cancelled/returned, for completion rate)
  const allCurrentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at');
  }, [orders, tf.filterCurrent]);

  // Previous period valid orders
  const prevOrders = useMemo(() => {
    return tf.filterPrev(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterPrev]);

  // All previous period orders
  const allPrevOrders = useMemo(() => {
    return tf.filterPrev(orders, 'created_at');
  }, [orders, tf.filterPrev]);

  // ===== KPI calculations =====
  const kpi = useMemo(() => {
    const revenue = currentOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const prevRevenue = prevOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);

    const orderCount = currentOrders.length;
    const prevOrderCount = prevOrders.length;

    const avgValue = orderCount > 0 ? revenue / orderCount : 0;
    const prevAvgValue = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0;

    const completedCount = allCurrentOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length;
    const completionRate = allCurrentOrders.length > 0 ? Math.round((completedCount / allCurrentOrders.length) * 100) : 0;
    const prevCompletedCount = allPrevOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length;
    const prevCompletionRate = allPrevOrders.length > 0 ? Math.round((prevCompletedCount / allPrevOrders.length) * 100) : 0;

    return {
      revenue, prevRevenue,
      orderCount, prevOrderCount,
      avgValue, prevAvgValue,
      completionRate, prevCompletionRate,
    };
  }, [currentOrders, prevOrders, allCurrentOrders, allPrevOrders]);

  // ===== Revenue Line Chart - daily data =====
  const dailyRevenueData = useMemo(() => {
    const byDate = {};
    currentOrders.forEach(o => {
      const date = (o.created_at || '').slice(0, 10);
      if (!date) return;
      byDate[date] = (byDate[date] || 0) + parseFloat(o.total_amount || 0);
    });

    // Generate all dates in range
    const startDate = new Date(tf.range.start + 'T00:00:00+07:00');
    const endDate = new Date(tf.range.end + 'T00:00:00+07:00');
    const result = [];
    const d = new Date(startDate);
    while (d <= endDate) {
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const shortLabel = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
      result.push({
        date: key,
        label: shortLabel,
        revenue: Math.round((byDate[key] || 0) / 1000000 * 10) / 10,
        rawRevenue: byDate[key] || 0,
      });
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [currentOrders, tf.range.start, tf.range.end]);

  // ===== Revenue by Channel Pie Chart =====
  const channelData = useMemo(() => {
    const byChannel = {};
    currentOrders.forEach(o => {
      const channel = o.payment_method || o.channel || 'Khác';
      byChannel[channel] = (byChannel[channel] || 0) + parseFloat(o.total_amount || 0);
    });
    return Object.entries(byChannel)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [currentOrders]);

  const channelTotal = useMemo(() => {
    return channelData.reduce((s, d) => s + d.value, 0);
  }, [channelData]);

  // ===== Revenue by Employee Bar Chart (top 10) =====
  const employeeData = useMemo(() => {
    const byUser = {};
    currentOrders.forEach(o => {
      const uid = o.created_by;
      if (!uid) return;
      byUser[uid] = (byUser[uid] || 0) + parseFloat(o.total_amount || 0);
    });

    const userMap = {};
    (allUsers || []).forEach(u => { userMap[u.id] = u.name || u.id; });

    return Object.entries(byUser)
      .map(([uid, value]) => ({
        name: userMap[uid] || uid,
        revenue: Math.round(value / 1000000 * 10) / 10,
        rawRevenue: value,
      }))
      .sort((a, b) => b.rawRevenue - a.rawRevenue)
      .slice(0, 10);
  }, [currentOrders, allUsers]);

  // ===== Top 10 Orders by value =====
  const topOrders = useMemo(() => {
    return [...currentOrders]
      .sort((a, b) => parseFloat(b.total_amount || 0) - parseFloat(a.total_amount || 0))
      .slice(0, 10);
  }, [currentOrders]);

  // ===== Export handler =====
  const handleExport = () => {
    const columns = [
      { label: 'STT', accessor: (_row, i) => i + 1 },
      { label: 'Mã đơn', accessor: o => o.order_number || o.id },
      { label: 'Khách hàng', accessor: 'customer_name' },
      { label: 'Giá trị', accessor: o => parseFloat(o.total_amount || 0) },
      { label: 'Phí ship', accessor: o => parseFloat(o.shipping_fee || 0) },
      { label: 'Giảm giá', accessor: o => parseFloat(o.discount || 0) },
      { label: 'Kênh', accessor: o => o.payment_method || o.channel || 'Khác' },
      { label: 'Trạng thái', accessor: o => STATUS_LABELS[o.status] || o.status },
      { label: 'Ngày tạo', accessor: o => o.created_at ? o.created_at.slice(0, 10) : '' },
    ];
    exportToCSV(currentOrders, columns, `bao-cao-doanh-thu-${tf.range.start}-${tf.range.end}`);
  };

  // ===== Pct change helper for sub text =====
  const pctText = (curr, prev) => {
    const pct = pctChange(curr, prev);
    if (pct === 0) return 'Không đổi so với kỳ trước';
    return `${pct > 0 ? '+' : ''}${pct}% so với kỳ trước`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter
          timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
          customStart={tf.customStart} setCustomStart={tf.setCustomStart}
          customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd}
        />
        <div className="flex gap-2">
          <ExportButton onClick={handleExport} />
          <PrintButton />
        </div>
      </div>

      {/* 1. KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Tổng doanh thu"
          value={formatMoney(kpi.revenue)}
          sub={pctText(kpi.revenue, kpi.prevRevenue)}
          color="green"
        />
        <StatCard
          label="Số đơn hàng"
          value={kpi.orderCount}
          sub={pctText(kpi.orderCount, kpi.prevOrderCount)}
          color="blue"
        />
        <StatCard
          label="Giá trị trung bình/đơn"
          value={formatMoney(kpi.avgValue)}
          sub={pctText(kpi.avgValue, kpi.prevAvgValue)}
          color="orange"
        />
        <StatCard
          label="Tỷ lệ hoàn thành"
          value={`${kpi.completionRate}%`}
          sub={pctText(kpi.completionRate, kpi.prevCompletionRate)}
          color="purple"
        />
      </div>

      {/* 2. Revenue Line Chart */}
      <Section title="Biểu đồ doanh thu theo ngày">
        {dailyRevenueData.length > 0 && dailyRevenueData.some(d => d.rawRevenue > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyRevenueData}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval={dailyRevenueData.length > 14 ? Math.floor(dailyRevenueData.length / 7) - 1 : 0}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                width={50}
                tickFormatter={v => `${v}tr`}
              />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#16a34a"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#16a34a' }}
                activeDot={{ r: 5 }}
                name="Doanh thu (triệu VNĐ)"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu doanh thu trong kỳ này" />
        )}
      </Section>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 3. Revenue by Channel Pie Chart */}
        <Section title="Doanh thu theo kênh bán hàng">
          {channelData.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={channelData}
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    innerRadius={45}
                    dataKey="value"
                    paddingAngle={2}
                    label={({ name, value }) =>
                      `${name}: ${channelTotal > 0 ? Math.round(value / channelTotal * 100) : 0}%`
                    }
                  >
                    {channelData.map((_entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={value => formatMoney(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
                {channelData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="text-gray-600">{d.name}</span>
                    <span className="font-medium">
                      {channelTotal > 0 ? Math.round(d.value / channelTotal * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState text="Chưa có dữ liệu kênh bán hàng" />
          )}
        </Section>

        {/* 4. Revenue by Employee Bar Chart (horizontal) */}
        <Section title="Doanh thu theo nhân viên">
          {employeeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(250, employeeData.length * 36)}>
              <BarChart data={employeeData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => `${v}tr`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={100}
                />
                <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
                <Bar
                  dataKey="revenue"
                  fill="#16a34a"
                  radius={[0, 4, 4, 0]}
                  name="Doanh thu (triệu VNĐ)"
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Chưa có dữ liệu nhân viên" />
          )}
        </Section>
      </div>

      {/* 5. Top Orders Table */}
      <Section title="Đơn hàng có giá trị cao nhất">
        {topOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Mã đơn</th>
                  <th className="pb-2 pr-2 font-medium">Khách hàng</th>
                  <th className="pb-2 pr-2 font-medium text-right">Giá trị</th>
                  <th className="pb-2 pr-2 font-medium text-center">Trạng thái</th>
                  <th className="pb-2 font-medium">Ngày</th>
                </tr>
              </thead>
              <tbody>
                {topOrders.map((o, i) => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700">
                      {o.order_number || String(o.id).slice(-6)}
                    </td>
                    <td className="py-2 pr-2 text-gray-700 max-w-[150px] truncate">
                      {o.customer_name || 'Khách lẻ'}
                    </td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">
                      {formatMoney(o.total_amount)}
                    </td>
                    <td className="py-2 pr-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs whitespace-nowrap">
                      {formatDateVN(o.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có đơn hàng trong kỳ này" />
        )}
      </Section>
    </div>
  );
}

// ===== REVENUE BY MONTH =====
function RevenueByMonth() {
  const { orders } = useData();
  const tf = useTimeFilter('year');

  // Filter valid orders in current period
  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  // Aggregate by month
  const monthlyData = useMemo(() => {
    const byMonth = {};
    currentOrders.forEach(o => {
      const month = (o.created_at || '').slice(0, 7); // YYYY-MM
      if (!month) return;
      if (!byMonth[month]) byMonth[month] = { revenue: 0, count: 0 };
      byMonth[month].revenue += parseFloat(o.total_amount || 0);
      byMonth[month].count += 1;
    });

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        label: month.slice(5, 7) + '/' + month.slice(0, 4),
        revenue: Math.round(data.revenue / 1000000 * 10) / 10,
        rawRevenue: data.revenue,
        count: data.count,
        avgOrder: data.count > 0 ? data.revenue / data.count : 0,
      }));
  }, [currentOrders]);

  // KPI stats
  const stats = useMemo(() => {
    const totalRevenue = monthlyData.reduce((s, m) => s + m.rawRevenue, 0);
    const avgMonthly = monthlyData.length > 0 ? totalRevenue / monthlyData.length : 0;
    const bestMonth = monthlyData.length > 0
      ? monthlyData.reduce((best, m) => m.rawRevenue > best.rawRevenue ? m : best, monthlyData[0])
      : null;
    const worstMonth = monthlyData.length > 0
      ? monthlyData.reduce((worst, m) => m.rawRevenue < worst.rawRevenue ? m : worst, monthlyData[0])
      : null;
    return { totalRevenue, avgMonthly, bestMonth, worstMonth };
  }, [monthlyData]);

  return (
    <div className="space-y-4">
      <TimeFilter
        timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd}
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng doanh thu" value={formatMoney(stats.totalRevenue)} color="green" />
        <StatCard label="Trung bình/tháng" value={formatMoney(stats.avgMonthly)} color="blue" />
        <StatCard
          label="Tháng cao nhất"
          value={stats.bestMonth ? formatMoney(stats.bestMonth.rawRevenue) : '—'}
          sub={stats.bestMonth ? stats.bestMonth.label : ''}
          color="orange"
        />
        <StatCard
          label="Tháng thấp nhất"
          value={stats.worstMonth ? formatMoney(stats.worstMonth.rawRevenue) : '—'}
          sub={stats.worstMonth ? stats.worstMonth.label : ''}
          color="purple"
        />
      </div>

      {/* Bar Chart */}
      <Section title="Doanh thu theo tháng">
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} name="Doanh thu (triệu VNĐ)" barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu doanh thu trong kỳ này" />
        )}
      </Section>

      {/* Table */}
      <Section title="Chi tiết theo tháng">
        {monthlyData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Tháng</th>
                  <th className="pb-2 pr-2 font-medium text-right">Doanh thu</th>
                  <th className="pb-2 pr-2 font-medium text-right">Số đơn</th>
                  <th className="pb-2 font-medium text-right">TB/đơn</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map(m => (
                  <tr key={m.month} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 font-medium text-gray-700">{m.label}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(m.rawRevenue)}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{m.count}</td>
                    <td className="py-2 text-right text-gray-600">{formatMoney(m.avgOrder)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="py-2 pr-2">Tổng</td>
                  <td className="py-2 pr-2 text-right text-green-700">{formatMoney(stats.totalRevenue)}</td>
                  <td className="py-2 pr-2 text-right">{currentOrders.length}</td>
                  <td className="py-2 text-right">
                    {formatMoney(currentOrders.length > 0 ? stats.totalRevenue / currentOrders.length : 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu" />
        )}
      </Section>
    </div>
  );
}

// ===== REVENUE BY STAFF =====
function RevenueByStaff() {
  const { orders, allUsers } = useData();
  useApp();
  const tf = useTimeFilter('month');

  // Filter valid orders in current period
  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  // User map
  const userMap = useMemo(() => {
    const map = {};
    (allUsers || []).forEach(u => { map[u.id] = u.name || u.id; });
    return map;
  }, [allUsers]);

  // Group by staff
  const staffData = useMemo(() => {
    const byUser = {};
    currentOrders.forEach(o => {
      const uid = o.created_by;
      if (!uid) return;
      if (!byUser[uid]) byUser[uid] = { revenue: 0, count: 0 };
      byUser[uid].revenue += parseFloat(o.total_amount || 0);
      byUser[uid].count += 1;
    });

    return Object.entries(byUser)
      .map(([uid, data]) => ({
        id: uid,
        name: userMap[uid] || uid,
        revenue: Math.round(data.revenue / 1000000 * 10) / 10,
        rawRevenue: data.revenue,
        count: data.count,
        avgOrder: data.count > 0 ? data.revenue / data.count : 0,
      }))
      .sort((a, b) => b.rawRevenue - a.rawRevenue);
  }, [currentOrders, userMap]);

  const top15 = useMemo(() => staffData.slice(0, 15), [staffData]);

  // KPI stats
  const stats = useMemo(() => {
    const totalRevenue = staffData.reduce((s, st) => s + st.rawRevenue, 0);
    const staffCount = staffData.length;
    const topPerformer = staffData.length > 0 ? staffData[0] : null;
    const avgPerStaff = staffCount > 0 ? totalRevenue / staffCount : 0;
    return { totalRevenue, staffCount, topPerformer, avgPerStaff };
  }, [staffData]);

  return (
    <div className="space-y-4">
      <TimeFilter
        timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd}
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng doanh thu" value={formatMoney(stats.totalRevenue)} color="green" />
        <StatCard label="Nhân viên bán hàng" value={stats.staffCount} color="blue" />
        <StatCard
          label="Top performer"
          value={stats.topPerformer ? formatMoney(stats.topPerformer.rawRevenue) : '—'}
          sub={stats.topPerformer ? stats.topPerformer.name : ''}
          color="orange"
        />
        <StatCard label="TB doanh thu/NV" value={formatMoney(stats.avgPerStaff)} color="purple" />
      </div>

      {/* Horizontal Bar Chart */}
      <Section title="Doanh thu theo nhân viên (Top 15)">
        {top15.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(300, top15.length * 36)}>
            <BarChart data={top15} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}tr`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Bar dataKey="revenue" fill="#16a34a" radius={[0, 4, 4, 0]} name="Doanh thu (triệu VNĐ)" barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu nhân viên" />
        )}
      </Section>

      {/* Staff table */}
      <Section title="Chi tiết theo nhân viên">
        {staffData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Nhân viên</th>
                  <th className="pb-2 pr-2 font-medium text-right">Số đơn</th>
                  <th className="pb-2 pr-2 font-medium text-right">Doanh thu</th>
                  <th className="pb-2 font-medium text-right">TB/đơn</th>
                </tr>
              </thead>
              <tbody>
                {staffData.map((st, i) => (
                  <tr key={st.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700">{st.name}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{st.count}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(st.rawRevenue)}</td>
                    <td className="py-2 text-right text-gray-600">{formatMoney(st.avgOrder)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="py-2 pr-2" colSpan={2}>Tổng</td>
                  <td className="py-2 pr-2 text-right">{currentOrders.length}</td>
                  <td className="py-2 pr-2 text-right text-green-700">{formatMoney(stats.totalRevenue)}</td>
                  <td className="py-2 text-right">
                    {formatMoney(currentOrders.length > 0 ? stats.totalRevenue / currentOrders.length : 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu" />
        )}
      </Section>
    </div>
  );
}

// ===== REVENUE BY CHANNEL =====
function RevenueByChannel() {
  const { orders } = useData();
  const tf = useTimeFilter('month');

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  const channelData = useMemo(() => {
    const byChannel = {};
    currentOrders.forEach(o => {
      const ch = o.payment_method || o.channel || 'Khác';
      if (!byChannel[ch]) byChannel[ch] = { revenue: 0, count: 0 };
      byChannel[ch].revenue += parseFloat(o.total_amount || 0);
      byChannel[ch].count += 1;
    });
    return Object.entries(byChannel)
      .map(([name, d]) => ({ name, revenue: d.revenue, count: d.count }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [currentOrders]);

  const total = useMemo(() => channelData.reduce((s, d) => s + d.revenue, 0), [channelData]);
  const best = channelData.length > 0 ? channelData[0] : null;
  const worst = channelData.length > 0 ? channelData[channelData.length - 1] : null;

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng doanh thu" value={formatMoney(total)} color="green" />
        <StatCard label="Số kênh" value={channelData.length} color="blue" />
        <StatCard label="Kênh cao nhất" value={best ? formatMoney(best.revenue) : '—'} sub={best?.name} color="orange" />
        <StatCard label="Kênh thấp nhất" value={worst ? formatMoney(worst.revenue) : '—'} sub={worst?.name} color="purple" />
      </div>

      <Section title="Phân bố doanh thu theo kênh">
        {channelData.length > 0 ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={channelData} cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                  dataKey="revenue" paddingAngle={2}
                  label={({ name, revenue }) => `${name}: ${total > 0 ? Math.round(revenue / total * 100) : 0}%`}>
                  {channelData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
              {channelData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-600">{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu kênh" />}
      </Section>

      <Section title="Chi tiết theo kênh">
        {channelData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Kênh</th>
                  <th className="pb-2 pr-2 font-medium text-right">Số đơn</th>
                  <th className="pb-2 pr-2 font-medium text-right">Doanh thu</th>
                  <th className="pb-2 font-medium text-right">% tổng DT</th>
                </tr>
              </thead>
              <tbody>
                {channelData.map(d => (
                  <tr key={d.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 font-medium text-gray-700">{d.name}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{d.count}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(d.revenue)}</td>
                    <td className="py-2 text-right text-gray-600">{total > 0 ? Math.round(d.revenue / total * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
    </div>
  );
}

// ===== REVENUE BY PRODUCT =====
function RevenueByProduct() {
  const { orders } = useData();
  const tf = useTimeFilter('month');

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  const productData = useMemo(() => {
    const byProduct = {};
    currentOrders.forEach(o => {
      const items = parseOrderItems(o);
      items.forEach(item => {
        const name = item.product_name || item.name || 'Không rõ';
        if (!byProduct[name]) byProduct[name] = { revenue: 0, qty: 0 };
        byProduct[name].revenue += parseFloat(item.total || item.price || 0) * (item.quantity || 1);
        byProduct[name].qty += parseInt(item.quantity || 1);
      });
    });
    return Object.entries(byProduct)
      .map(([name, d]) => ({ name, revenue: d.revenue, qty: d.qty }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [currentOrders]);

  const total = useMemo(() => productData.reduce((s, d) => s + d.revenue, 0), [productData]);
  const totalQty = useMemo(() => productData.reduce((s, d) => s + d.qty, 0), [productData]);
  const top20 = useMemo(() => productData.slice(0, 20).map(d => ({
    ...d, revenueM: Math.round(d.revenue / 1000000 * 10) / 10,
    shortName: d.name.length > 25 ? d.name.slice(0, 25) + '...' : d.name,
  })), [productData]);
  const bestProduct = productData.length > 0 ? productData[0] : null;

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng SP bán" value={totalQty} color="green" />
        <StatCard label="Tổng doanh thu" value={formatMoney(total)} color="blue" />
        <StatCard label="SP bán nhiều nhất" value={bestProduct ? bestProduct.name.slice(0, 20) : '—'} sub={bestProduct ? formatMoney(bestProduct.revenue) : ''} color="orange" />
        <StatCard label="TB doanh thu/SP" value={formatMoney(productData.length > 0 ? total / productData.length : 0)} color="purple" />
      </div>

      <Section title="Top 20 sản phẩm theo doanh thu">
        {top20.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(300, top20.length * 32)}>
            <BarChart data={top20} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}tr`} />
              <YAxis type="category" dataKey="shortName" tick={{ fontSize: 10 }} width={140} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Bar dataKey="revenueM" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Doanh thu (triệu VNĐ)" barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu sản phẩm" />}
      </Section>

      <Section title="Chi tiết doanh thu sản phẩm">
        {productData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Sản phẩm</th>
                  <th className="pb-2 pr-2 font-medium text-right">SL bán</th>
                  <th className="pb-2 pr-2 font-medium text-right">Doanh thu</th>
                  <th className="pb-2 font-medium text-right">% tổng</th>
                </tr>
              </thead>
              <tbody>
                {productData.slice(0, 50).map((d, i) => (
                  <tr key={d.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700 max-w-[200px] truncate">{d.name}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{d.qty}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(d.revenue)}</td>
                    <td className="py-2 text-right text-gray-600">{total > 0 ? Math.round(d.revenue / total * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
    </div>
  );
}

// ===== REVENUE BY CATEGORY =====
function RevenueByCategory() {
  const { orders, products } = useData();
  const tf = useTimeFilter('month');

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  const productCategoryMap = useMemo(() => {
    const map = {};
    (products || []).forEach(p => { map[p.name] = p.category || 'Chưa phân loại'; if (p.id) map[p.id] = p.category || 'Chưa phân loại'; });
    return map;
  }, [products]);

  const categoryData = useMemo(() => {
    const byCat = {};
    currentOrders.forEach(o => {
      const items = parseOrderItems(o);
      items.forEach(item => {
        const cat = productCategoryMap[item.product_name] || productCategoryMap[item.product_id] || productCategoryMap[item.name] || 'Chưa phân loại';
        if (!byCat[cat]) byCat[cat] = { revenue: 0, count: 0 };
        byCat[cat].revenue += parseFloat(item.total || item.price || 0) * (item.quantity || 1);
        byCat[cat].count += 1;
      });
    });
    return Object.entries(byCat)
      .map(([name, d]) => ({ name, revenue: d.revenue, count: d.count }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [currentOrders, productCategoryMap]);

  const total = useMemo(() => categoryData.reduce((s, d) => s + d.revenue, 0), [categoryData]);

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng doanh thu" value={formatMoney(total)} color="green" />
        <StatCard label="Số danh mục" value={categoryData.length} color="blue" />
        <StatCard label="Danh mục cao nhất" value={categoryData[0] ? formatMoney(categoryData[0].revenue) : '—'} sub={categoryData[0]?.name} color="orange" />
        <StatCard label="TB/danh mục" value={formatMoney(categoryData.length > 0 ? total / categoryData.length : 0)} color="purple" />
      </div>

      <Section title="Phân bố doanh thu theo danh mục">
        {categoryData.length > 0 ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                  dataKey="revenue" paddingAngle={2}
                  label={({ name, revenue }) => `${name}: ${total > 0 ? Math.round(revenue / total * 100) : 0}%`}>
                  {categoryData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
              {categoryData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-600">{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu danh mục" />}
      </Section>

      <Section title="Chi tiết theo danh mục">
        {categoryData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Danh mục</th>
                  <th className="pb-2 pr-2 font-medium text-right">Số SP</th>
                  <th className="pb-2 pr-2 font-medium text-right">Doanh thu</th>
                  <th className="pb-2 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {categoryData.map(d => (
                  <tr key={d.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 font-medium text-gray-700">{d.name}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{d.count}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(d.revenue)}</td>
                    <td className="py-2 text-right text-gray-600">{total > 0 ? Math.round(d.revenue / total * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
    </div>
  );
}

// ===== REVENUE BY AREA =====
function RevenueByArea() {
  const { orders, customers } = useData();
  const tf = useTimeFilter('month');

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  const customerMap = useMemo(() => {
    const map = {};
    (customers || []).forEach(c => { map[c.id] = c; });
    return map;
  }, [customers]);

  const areaData = useMemo(() => {
    const byArea = {};
    currentOrders.forEach(o => {
      let area = o.shipping_city || o.city || '';
      if (!area && o.customer_id && customerMap[o.customer_id]) {
        area = customerMap[o.customer_id].city || customerMap[o.customer_id].address || '';
      }
      area = area || 'Chưa xác định';
      if (!byArea[area]) byArea[area] = { revenue: 0, count: 0 };
      byArea[area].revenue += parseFloat(o.total_amount || 0);
      byArea[area].count += 1;
    });
    return Object.entries(byArea)
      .map(([name, d]) => ({ name, revenue: d.revenue, count: d.count, revenueM: Math.round(d.revenue / 1000000 * 10) / 10 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [currentOrders, customerMap]);

  const total = useMemo(() => areaData.reduce((s, d) => s + d.revenue, 0), [areaData]);
  const top15 = useMemo(() => areaData.slice(0, 15), [areaData]);

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng doanh thu" value={formatMoney(total)} color="green" />
        <StatCard label="Số khu vực" value={areaData.length} color="blue" />
        <StatCard label="Khu vực cao nhất" value={areaData[0] ? formatMoney(areaData[0].revenue) : '—'} sub={areaData[0]?.name} color="orange" />
        <StatCard label="TB/khu vực" value={formatMoney(areaData.length > 0 ? total / areaData.length : 0)} color="purple" />
      </div>

      <Section title="Doanh thu theo khu vực (Top 15)">
        {top15.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(300, top15.length * 36)}>
            <BarChart data={top15} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}tr`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Bar dataKey="revenueM" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Doanh thu (triệu VNĐ)" barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu khu vực" />}
      </Section>

      <Section title="Chi tiết theo khu vực">
        {areaData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Khu vực</th>
                  <th className="pb-2 pr-2 font-medium text-right">Số đơn</th>
                  <th className="pb-2 pr-2 font-medium text-right">Doanh thu</th>
                  <th className="pb-2 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {areaData.map((d, i) => (
                  <tr key={d.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700">{d.name}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{d.count}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(d.revenue)}</td>
                    <td className="py-2 text-right text-gray-600">{total > 0 ? Math.round(d.revenue / total * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
    </div>
  );
}

// ===== REVENUE DAILY =====
function RevenueDaily() {
  const { orders } = useData();
  const tf = useTimeFilter('month');

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  // Revenue by day of week
  const byDayOfWeek = useMemo(() => {
    const days = Array(7).fill(null).map((_, i) => ({ name: DAY_NAMES[i], revenue: 0, count: 0 }));
    currentOrders.forEach(o => {
      const d = new Date(o.created_at);
      const dow = d.getDay();
      days[dow].revenue += parseFloat(o.total_amount || 0);
      days[dow].count += 1;
    });
    return days.map(d => ({ ...d, revenueM: Math.round(d.revenue / 1000000 * 10) / 10 }));
  }, [currentOrders]);

  // Daily trend
  const dailyTrend = useMemo(() => {
    const byDate = {};
    currentOrders.forEach(o => {
      const date = (o.created_at || '').slice(0, 10);
      if (!date) return;
      if (!byDate[date]) byDate[date] = 0;
      byDate[date] += parseFloat(o.total_amount || 0);
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rev]) => ({
        date,
        label: date.slice(8, 10) + '/' + date.slice(5, 7),
        revenue: Math.round(rev / 1000000 * 10) / 10,
        rawRevenue: rev,
      }));
  }, [currentOrders]);

  const stats = useMemo(() => {
    if (dailyTrend.length === 0) return { best: null, worst: null, avg: 0, daysWithOrders: 0 };
    const best = dailyTrend.reduce((b, d) => d.rawRevenue > b.rawRevenue ? d : b, dailyTrend[0]);
    const worst = dailyTrend.reduce((w, d) => d.rawRevenue < w.rawRevenue ? d : w, dailyTrend[0]);
    const totalRev = dailyTrend.reduce((s, d) => s + d.rawRevenue, 0);
    return { best, worst, avg: totalRev / dailyTrend.length, daysWithOrders: dailyTrend.length };
  }, [dailyTrend]);

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ngày cao nhất" value={stats.best ? formatMoney(stats.best.rawRevenue) : '—'} sub={stats.best?.label} color="green" />
        <StatCard label="Ngày thấp nhất" value={stats.worst ? formatMoney(stats.worst.rawRevenue) : '—'} sub={stats.worst?.label} color="red" />
        <StatCard label="TB/ngày" value={formatMoney(stats.avg)} color="blue" />
        <StatCard label="Tổng ngày có đơn" value={stats.daysWithOrders} color="orange" />
      </div>

      <Section title="Doanh thu theo thứ trong tuần">
        {byDayOfWeek.some(d => d.revenue > 0) ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byDayOfWeek}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Bar dataKey="revenueM" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Doanh thu (triệu VNĐ)" barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>

      <Section title="Biến động doanh thu hàng ngày">
        {dailyTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyTrend}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }}
                interval={dailyTrend.length > 14 ? Math.floor(dailyTrend.length / 7) - 1 : 0} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Area type="monotone" dataKey="revenue" stroke="#16a34a" fill="#bbf7d0" strokeWidth={2} name="Doanh thu (triệu VNĐ)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
    </div>
  );
}

// ===== REVENUE GROWTH =====
function RevenueGrowth() {
  const { orders } = useData();
  const tf = useTimeFilter('year');

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  const growthData = useMemo(() => {
    const byMonth = {};
    currentOrders.forEach(o => {
      const month = (o.created_at || '').slice(0, 7);
      if (!month) return;
      byMonth[month] = (byMonth[month] || 0) + parseFloat(o.total_amount || 0);
    });
    const sorted = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([month, revenue], i) => {
      const prevRevenue = i > 0 ? sorted[i - 1][1] : 0;
      const growth = i === 0 ? 0 : (prevRevenue > 0 ? Math.round((revenue - prevRevenue) / prevRevenue * 100) : 100);
      return {
        month,
        label: month.slice(5, 7) + '/' + month.slice(0, 4),
        revenue,
        revenueM: Math.round(revenue / 1000000 * 10) / 10,
        growth,
      };
    });
  }, [currentOrders]);

  const stats = useMemo(() => {
    if (growthData.length < 2) return { avgGrowth: 0, maxGrowth: null, minGrowth: null };
    const gData = growthData.slice(1); // skip first (no prev)
    const avgGrowth = Math.round(gData.reduce((s, d) => s + d.growth, 0) / gData.length);
    const maxGrowth = gData.reduce((m, d) => d.growth > m.growth ? d : m, gData[0]);
    const minGrowth = gData.reduce((m, d) => d.growth < m.growth ? d : m, gData[0]);
    return { avgGrowth, maxGrowth, minGrowth };
  }, [growthData]);

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng doanh thu" value={formatMoney(currentOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0))} color="green" />
        <StatCard label="TB tăng trưởng" value={`${stats.avgGrowth}%`} color="blue" />
        <StatCard label="Tăng trưởng cao nhất" value={stats.maxGrowth ? `${stats.maxGrowth.growth}%` : '—'} sub={stats.maxGrowth?.label} color="orange" />
        <StatCard label="Tăng trưởng thấp nhất" value={stats.minGrowth ? `${stats.minGrowth.growth}%` : '—'} sub={stats.minGrowth?.label} color="red" />
      </div>

      <Section title="Tốc độ tăng trưởng theo tháng">
        {growthData.length > 1 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={growthData}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}%`} />
              <Tooltip content={<ChartTooltip formatter={v => `${v}%`} />} />
              <Line type="monotone" dataKey="growth" stroke="#ef4444" strokeWidth={2.5}
                dot={{ r: 4, fill: '#ef4444' }} activeDot={{ r: 6 }} name="Tăng trưởng %" />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Cần ít nhất 2 tháng dữ liệu" />}
      </Section>

      <Section title="Chi tiết tăng trưởng">
        {growthData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Tháng</th>
                  <th className="pb-2 pr-2 font-medium text-right">Doanh thu</th>
                  <th className="pb-2 font-medium text-right">Tăng trưởng %</th>
                </tr>
              </thead>
              <tbody>
                {growthData.map(d => (
                  <tr key={d.month} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 font-medium text-gray-700">{d.label}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(d.revenue)}</td>
                    <td className={`py-2 text-right font-bold ${d.growth > 0 ? 'text-green-600' : d.growth < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {d.growth > 0 ? '+' : ''}{d.growth}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
    </div>
  );
}

// ===== ORDER SUMMARY =====
function OrderSummary() {
  const { orders } = useData();
  const tf = useTimeFilter('month');

  const allCurrentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at');
  }, [orders, tf.filterCurrent]);

  const statusData = useMemo(() => {
    const byStatus = {};
    allCurrentOrders.forEach(o => {
      const s = o.status || 'new';
      if (!byStatus[s]) byStatus[s] = { count: 0, value: 0 };
      byStatus[s].count += 1;
      byStatus[s].value += parseFloat(o.total_amount || 0);
    });
    return Object.entries(byStatus)
      .map(([status, d]) => ({ status, label: STATUS_LABELS[status] || status, count: d.count, value: d.value }))
      .sort((a, b) => b.count - a.count);
  }, [allCurrentOrders]);

  const totalOrders = allCurrentOrders.length;
  const completedCount = allCurrentOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length;
  const processingCount = allCurrentOrders.filter(o => !['completed', 'delivered', 'cancelled', 'returned'].includes(o.status)).length;
  const cancelledCount = allCurrentOrders.filter(o => o.status === 'cancelled').length;
  const completionRate = totalOrders > 0 ? Math.round(completedCount / totalOrders * 100) : 0;

  // Daily orders stacked chart
  const dailyOrders = useMemo(() => {
    const byDate = {};
    allCurrentOrders.forEach(o => {
      const date = (o.created_at || '').slice(0, 10);
      if (!date) return;
      if (!byDate[date]) byDate[date] = { completed: 0, cancelled: 0, other: 0 };
      if (o.status === 'completed' || o.status === 'delivered') byDate[date].completed += 1;
      else if (o.status === 'cancelled') byDate[date].cancelled += 1;
      else byDate[date].other += 1;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        label: date.slice(8, 10) + '/' + date.slice(5, 7),
        ...d,
      }));
  }, [allCurrentOrders]);

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng đơn" value={totalOrders} color="blue" />
        <StatCard label="Hoàn thành" value={completedCount} color="green" />
        <StatCard label="Đang xử lý" value={processingCount} color="orange" />
        <StatCard label="Hủy" value={cancelledCount} color="red" />
      </div>

      {/* Completion rate progress bar */}
      <Section title="Tỷ lệ hoàn thành đơn hàng">
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
            <div className="bg-green-500 h-4 rounded-full transition-all" style={{ width: `${completionRate}%` }} />
          </div>
          <span className="text-lg font-bold text-green-700">{completionRate}%</span>
        </div>
      </Section>

      <Section title="Đơn hàng theo ngày">
        {dailyOrders.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyOrders}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }}
                interval={dailyOrders.length > 14 ? Math.floor(dailyOrders.length / 7) - 1 : 0} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="completed" stackId="a" fill="#22c55e" name="Hoàn thành" />
              <Bar dataKey="cancelled" stackId="a" fill="#ef4444" name="Hủy" />
              <Bar dataKey="other" stackId="a" fill="#3b82f6" name="Đang xử lý" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>

      <Section title="Chi tiết theo trạng thái">
        {statusData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Trạng thái</th>
                  <th className="pb-2 pr-2 font-medium text-right">Số đơn</th>
                  <th className="pb-2 pr-2 font-medium text-right">%</th>
                  <th className="pb-2 font-medium text-right">Giá trị</th>
                </tr>
              </thead>
              <tbody>
                {statusData.map(d => (
                  <tr key={d.status} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-600'}`}>
                        {d.label}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right font-medium">{d.count}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{totalOrders > 0 ? Math.round(d.count / totalOrders * 100) : 0}%</td>
                    <td className="py-2 text-right font-bold text-green-700">{formatMoney(d.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
    </div>
  );
}

// ===== ORDER BY STATUS =====
function OrderByStatus() {
  const { orders } = useData();
  const tf = useTimeFilter('month');

  const allCurrentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at');
  }, [orders, tf.filterCurrent]);

  const statusData = useMemo(() => {
    const byStatus = {};
    allCurrentOrders.forEach(o => {
      const s = o.status || 'new';
      if (!byStatus[s]) byStatus[s] = { count: 0, value: 0 };
      byStatus[s].count += 1;
      byStatus[s].value += parseFloat(o.total_amount || 0);
    });
    return Object.entries(byStatus)
      .map(([status, d]) => ({ name: STATUS_LABELS[status] || status, status, count: d.count, value: d.value }))
      .sort((a, b) => b.count - a.count);
  }, [allCurrentOrders]);

  const totalOrders = allCurrentOrders.length;
  const completedCount = allCurrentOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length;
  const cancelledOrders = allCurrentOrders.filter(o => o.status === 'cancelled');
  const returnedOrders = allCurrentOrders.filter(o => o.status === 'returned');
  const cancelledValue = cancelledOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
  const completionRate = totalOrders > 0 ? Math.round(completedCount / totalOrders * 100) : 0;
  const cancelRate = totalOrders > 0 ? Math.round(cancelledOrders.length / totalOrders * 100) : 0;
  const returnRate = totalOrders > 0 ? Math.round(returnedOrders.length / totalOrders * 100) : 0;

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tỷ lệ hoàn thành" value={`${completionRate}%`} color="green" />
        <StatCard label="Tỷ lệ hủy" value={`${cancelRate}%`} color="red" />
        <StatCard label="Tỷ lệ trả" value={`${returnRate}%`} color="orange" />
        <StatCard label="Giá trị hủy" value={formatMoney(cancelledValue)} color="purple" />
      </div>

      <Section title="Phân bố đơn hàng theo trạng thái">
        {statusData.length > 0 ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                  dataKey="count" paddingAngle={2}
                  label={({ name, count }) => `${name}: ${totalOrders > 0 ? Math.round(count / totalOrders * 100) : 0}%`}>
                  {statusData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
              {statusData.map((d, i) => (
                <div key={d.status} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-600">{d.name}: {d.count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>

      {cancelledOrders.length > 0 && (
        <Section title="Đơn hàng đã hủy / trả hàng">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Mã đơn</th>
                  <th className="pb-2 pr-2 font-medium">Khách hàng</th>
                  <th className="pb-2 pr-2 font-medium text-right">Giá trị</th>
                  <th className="pb-2 pr-2 font-medium text-center">Trạng thái</th>
                  <th className="pb-2 font-medium">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {[...cancelledOrders, ...returnedOrders].slice(0, 20).map(o => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 font-medium text-gray-700">{o.order_number || String(o.id).slice(-6)}</td>
                    <td className="py-2 pr-2 text-gray-700">{o.customer_name || 'Khách lẻ'}</td>
                    <td className="py-2 pr-2 text-right font-bold text-red-600">{formatMoney(o.total_amount)}</td>
                    <td className="py-2 pr-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[o.status] || ''}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{o.cancel_reason || o.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

// ===== ORDER BY CUSTOMER =====
function OrderByCustomer() {
  const { orders } = useData();
  const tf = useTimeFilter('month');

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  const customerData = useMemo(() => {
    const byCustomer = {};
    currentOrders.forEach(o => {
      const cid = o.customer_id || o.customer_name || 'Khách lẻ';
      const name = o.customer_name || 'Khách lẻ';
      if (!byCustomer[cid]) byCustomer[cid] = { name, revenue: 0, count: 0 };
      byCustomer[cid].revenue += parseFloat(o.total_amount || 0);
      byCustomer[cid].count += 1;
    });
    return Object.values(byCustomer).sort((a, b) => b.revenue - a.revenue);
  }, [currentOrders]);

  const totalCustomers = customerData.length;
  const totalRevenue = customerData.reduce((s, d) => s + d.revenue, 0);
  const totalOrderCount = currentOrders.length;
  const best = customerData.length > 0 ? customerData[0] : null;
  const avgOrderPerCustomer = totalCustomers > 0 ? Math.round(totalOrderCount / totalCustomers * 10) / 10 : 0;
  const avgValuePerCustomer = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  const top10 = useMemo(() => customerData.slice(0, 10).map(d => ({
    ...d,
    revenueM: Math.round(d.revenue / 1000000 * 10) / 10,
    shortName: d.name.length > 20 ? d.name.slice(0, 20) + '...' : d.name,
  })), [customerData]);

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng KH mua" value={totalCustomers} color="blue" />
        <StatCard label="KH cao nhất" value={best ? formatMoney(best.revenue) : '—'} sub={best?.name} color="green" />
        <StatCard label="TB đơn/KH" value={avgOrderPerCustomer} color="orange" />
        <StatCard label="TB giá trị/KH" value={formatMoney(avgValuePerCustomer)} color="purple" />
      </div>

      <Section title="Top 10 khách hàng theo doanh thu">
        {top10.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(280, top10.length * 36)}>
            <BarChart data={top10} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}tr`} />
              <YAxis type="category" dataKey="shortName" tick={{ fontSize: 10 }} width={120} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Bar dataKey="revenueM" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Doanh thu (triệu VNĐ)" barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu khách hàng" />}
      </Section>

      <Section title="Chi tiết theo khách hàng (Top 20)">
        {customerData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Khách hàng</th>
                  <th className="pb-2 pr-2 font-medium text-right">Số đơn</th>
                  <th className="pb-2 pr-2 font-medium text-right">Doanh thu</th>
                  <th className="pb-2 font-medium text-right">TB/đơn</th>
                </tr>
              </thead>
              <tbody>
                {customerData.slice(0, 20).map((d, i) => (
                  <tr key={d.name + i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700 max-w-[180px] truncate">{d.name}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{d.count}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(d.revenue)}</td>
                    <td className="py-2 text-right text-gray-600">{formatMoney(d.count > 0 ? d.revenue / d.count : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
    </div>
  );
}

// ===== ORDER CONVERSION (Average Order Value) =====
function OrderConversion() {
  const { orders } = useData();
  const tf = useTimeFilter('year');

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at').filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  const monthlyData = useMemo(() => {
    const byMonth = {};
    currentOrders.forEach(o => {
      const month = (o.created_at || '').slice(0, 7);
      if (!month) return;
      if (!byMonth[month]) byMonth[month] = { revenue: 0, count: 0 };
      byMonth[month].revenue += parseFloat(o.total_amount || 0);
      byMonth[month].count += 1;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        label: month.slice(5, 7) + '/' + month.slice(0, 4),
        revenue: d.revenue,
        count: d.count,
        avg: d.count > 0 ? Math.round(d.revenue / d.count) : 0,
        avgM: d.count > 0 ? Math.round(d.revenue / d.count / 1000000 * 10) / 10 : 0,
      }));
  }, [currentOrders]);

  const totalRevenue = currentOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
  const avgOrderValue = currentOrders.length > 0 ? totalRevenue / currentOrders.length : 0;
  const maxOrder = currentOrders.length > 0
    ? currentOrders.reduce((m, o) => parseFloat(o.total_amount || 0) > parseFloat(m.total_amount || 0) ? o : m, currentOrders[0])
    : null;
  const minOrder = currentOrders.length > 0
    ? currentOrders.reduce((m, o) => parseFloat(o.total_amount || 0) < parseFloat(m.total_amount || 0) ? o : m, currentOrders[0])
    : null;

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Giá trị TB đơn" value={formatMoney(avgOrderValue)} color="green" />
        <StatCard label="Đơn max" value={maxOrder ? formatMoney(maxOrder.total_amount) : '—'} color="orange" />
        <StatCard label="Đơn min" value={minOrder ? formatMoney(minOrder.total_amount) : '—'} color="red" />
        <StatCard label="Tổng giá trị" value={formatMoney(totalRevenue)} color="blue" />
      </div>

      <Section title="Giá trị trung bình đơn hàng theo tháng">
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Line type="monotone" dataKey="avgM" stroke="#8b5cf6" strokeWidth={2.5}
                dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 6 }} name="TB/đơn (triệu VNĐ)" />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>

      <Section title="Chi tiết theo tháng">
        {monthlyData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Tháng</th>
                  <th className="pb-2 pr-2 font-medium text-right">Số đơn</th>
                  <th className="pb-2 pr-2 font-medium text-right">Tổng DT</th>
                  <th className="pb-2 font-medium text-right">TB/đơn</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map(d => (
                  <tr key={d.month} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 font-medium text-gray-700">{d.label}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{d.count}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(d.revenue)}</td>
                    <td className="py-2 text-right text-purple-700 font-medium">{formatMoney(d.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
    </div>
  );
}

// ===== PROMO EFFECTIVENESS =====
function PromoEffectiveness() {
  const { orders } = useData();
  const tf = useTimeFilter('month');

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at');
  }, [orders, tf.filterCurrent]);

  const promoData = useMemo(() => {
    const byPromo = {};
    currentOrders.forEach(o => {
      const code = o.promo_code || o.discount_code || o.coupon_code;
      if (!code) return;
      if (!byPromo[code]) byPromo[code] = { count: 0, revenue: 0, discount: 0 };
      byPromo[code].count += 1;
      byPromo[code].revenue += parseFloat(o.total_amount || 0);
      byPromo[code].discount += parseFloat(o.discount || o.discount_amount || 0);
    });
    return Object.entries(byPromo)
      .map(([code, d]) => ({
        code,
        count: d.count,
        revenue: d.revenue,
        discount: d.discount,
        avgDiscount: d.count > 0 ? d.discount / d.count : 0,
        effectiveness: d.discount > 0 ? Math.round(d.revenue / d.discount * 10) / 10 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [currentOrders]);

  const ordersWithPromo = currentOrders.filter(o => o.promo_code || o.discount_code || o.coupon_code).length;
  const totalDiscount = promoData.reduce((s, d) => s + d.discount, 0);
  const avgDiscountPerOrder = ordersWithPromo > 0 ? totalDiscount / ordersWithPromo : 0;

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng mã KM" value={promoData.length} color="blue" />
        <StatCard label="Đơn có KM" value={ordersWithPromo} color="green" />
        <StatCard label="Tổng giảm giá" value={formatMoney(totalDiscount)} color="red" />
        <StatCard label="TB giảm/đơn" value={formatMoney(avgDiscountPerOrder)} color="orange" />
      </div>

      <Section title="Chi tiết hiệu quả khuyến mãi">
        {promoData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Mã KM</th>
                  <th className="pb-2 pr-2 font-medium text-right">Số đơn</th>
                  <th className="pb-2 pr-2 font-medium text-right">Tổng DT</th>
                  <th className="pb-2 pr-2 font-medium text-right">TB giảm giá</th>
                  <th className="pb-2 font-medium text-right">Hiệu quả</th>
                </tr>
              </thead>
              <tbody>
                {promoData.map(d => (
                  <tr key={d.code} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 font-medium text-blue-700">{d.code}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{d.count}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(d.revenue)}</td>
                    <td className="py-2 pr-2 text-right text-red-600">{formatMoney(d.avgDiscount)}</td>
                    <td className="py-2 text-right font-medium text-purple-700">{d.effectiveness}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có đơn hàng sử dụng mã khuyến mãi trong kỳ này" />}
      </Section>
    </div>
  );
}

// ===== COMPARE PERIODS =====
function ComparePeriods() {
  const { orders } = useData();
  const [p1Start, setP1Start] = useState('');
  const [p1End, setP1End] = useState('');
  const [p2Start, setP2Start] = useState('');
  const [p2End, setP2End] = useState('');

  const p1Orders = useMemo(() => {
    if (!p1Start || !p1End) return [];
    return filterByDateRange(orders, 'created_at', p1Start, p1End);
  }, [orders, p1Start, p1End]);

  const p2Orders = useMemo(() => {
    if (!p2Start || !p2End) return [];
    return filterByDateRange(orders, 'created_at', p2Start, p2End);
  }, [orders, p2Start, p2End]);

  const calcMetrics = (orderList) => {
    const valid = orderList.filter(o => o.status !== 'cancelled' && o.status !== 'returned');
    const revenue = valid.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const count = valid.length;
    const avg = count > 0 ? revenue / count : 0;
    const completed = orderList.filter(o => o.status === 'completed' || o.status === 'delivered').length;
    const completionRate = orderList.length > 0 ? Math.round(completed / orderList.length * 100) : 0;
    return { revenue, count, avg, completionRate };
  };

  const m1 = useMemo(() => calcMetrics(p1Orders), [p1Orders]);
  const m2 = useMemo(() => calcMetrics(p2Orders), [p2Orders]);

  const comparisons = [
    { label: 'Doanh thu', v1: m1.revenue, v2: m2.revenue, format: formatMoney },
    { label: 'Số đơn', v1: m1.count, v2: m2.count, format: v => v },
    { label: 'TB/đơn', v1: m1.avg, v2: m2.avg, format: formatMoney },
    { label: 'Tỷ lệ hoàn thành', v1: m1.completionRate, v2: m2.completionRate, format: v => `${v}%` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <h4 className="font-bold text-blue-700 mb-2">Kỳ 1</h4>
          <div className="flex gap-2 items-center">
            <input type="date" value={p1Start} onChange={e => setP1Start(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm flex-1" />
            <span className="text-gray-400">→</span>
            <input type="date" value={p1End} onChange={e => setP1End(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm flex-1" />
          </div>
          <div className="text-xs text-gray-500 mt-1">{p1Orders.length} đơn hàng</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <h4 className="font-bold text-green-700 mb-2">Kỳ 2</h4>
          <div className="flex gap-2 items-center">
            <input type="date" value={p2Start} onChange={e => setP2Start(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm flex-1" />
            <span className="text-gray-400">→</span>
            <input type="date" value={p2End} onChange={e => setP2End(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm flex-1" />
          </div>
          <div className="text-xs text-gray-500 mt-1">{p2Orders.length} đơn hàng</div>
        </div>
      </div>

      <Section title="So sánh giữa hai kỳ">
        {(p1Start && p1End && p2Start && p2End) ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Chỉ số</th>
                  <th className="pb-2 pr-2 font-medium text-right text-blue-600">Kỳ 1</th>
                  <th className="pb-2 pr-2 font-medium text-right text-green-600">Kỳ 2</th>
                  <th className="pb-2 font-medium text-right">Chênh lệch %</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map(c => {
                  const diff = pctChange(c.v2, c.v1);
                  return (
                    <tr key={c.label} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 pr-2 font-medium text-gray-700">{c.label}</td>
                      <td className="py-3 pr-2 text-right font-bold text-blue-700">{c.format(c.v1)}</td>
                      <td className="py-3 pr-2 text-right font-bold text-green-700">{c.format(c.v2)}</td>
                      <td className={`py-3 text-right font-bold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                        {diff > 0 ? '+' : ''}{diff}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Vui lòng chọn ngày cho cả 2 kỳ để so sánh" />}
      </Section>
    </div>
  );
}

// ===== COMPARE CHANNELS =====
function CompareChannels() {
  const { orders } = useData();
  const tf = useTimeFilter('month');

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at');
  }, [orders, tf.filterCurrent]);

  const channelData = useMemo(() => {
    const byChannel = {};
    currentOrders.forEach(o => {
      const ch = o.payment_method || o.channel || 'Khác';
      if (!byChannel[ch]) byChannel[ch] = { revenue: 0, count: 0, completed: 0, total: 0 };
      const valid = o.status !== 'cancelled' && o.status !== 'returned';
      if (valid) {
        byChannel[ch].revenue += parseFloat(o.total_amount || 0);
        byChannel[ch].count += 1;
      }
      byChannel[ch].total += 1;
      if (o.status === 'completed' || o.status === 'delivered') byChannel[ch].completed += 1;
    });
    return Object.entries(byChannel)
      .map(([name, d]) => ({
        name,
        revenue: d.revenue,
        revenueM: Math.round(d.revenue / 1000000 * 10) / 10,
        count: d.count,
        avg: d.count > 0 ? Math.round(d.revenue / d.count) : 0,
        completionRate: d.total > 0 ? Math.round(d.completed / d.total * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [currentOrders]);

  const chartData = useMemo(() => channelData.slice(0, 10), [channelData]);

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
        customStart={tf.customStart} setCustomStart={tf.setCustomStart}
        customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng kênh" value={channelData.length} color="blue" />
        <StatCard label="Kênh tốt nhất" value={channelData[0]?.name || '—'} sub={channelData[0] ? formatMoney(channelData[0].revenue) : ''} color="green" />
        <StatCard label="Tổng doanh thu" value={formatMoney(channelData.reduce((s, d) => s + d.revenue, 0))} color="orange" />
        <StatCard label="Tổng đơn hàng" value={channelData.reduce((s, d) => s + d.count, 0)} color="purple" />
      </div>

      <Section title="So sánh doanh thu theo kênh">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenueM" fill="#22c55e" radius={[4, 4, 0, 0]} name="Doanh thu (triệu VNĐ)" barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>

      <Section title="Chi tiết so sánh các kênh">
        {channelData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Kênh</th>
                  <th className="pb-2 pr-2 font-medium text-right">Doanh thu</th>
                  <th className="pb-2 pr-2 font-medium text-right">Số đơn</th>
                  <th className="pb-2 pr-2 font-medium text-right">TB/đơn</th>
                  <th className="pb-2 font-medium text-right">TL hoàn thành</th>
                </tr>
              </thead>
              <tbody>
                {channelData.map(d => (
                  <tr key={d.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 font-medium text-gray-700">{d.name}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(d.revenue)}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{d.count}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{formatMoney(d.avg)}</td>
                    <td className="py-2 text-right">
                      <span className={`font-medium ${d.completionRate >= 80 ? 'text-green-600' : d.completionRate >= 50 ? 'text-orange-600' : 'text-red-600'}`}>
                        {d.completionRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
    </div>
  );
}

// ===== REPORT LIST =====
const REVENUE_REPORTS = [
  { id: 'revenue_summary', name: 'Tổng quan doanh thu', icon: '📊', description: 'Tổng hợp doanh thu, số đơn, giá trị trung bình và tỷ lệ hoàn thành', group: 'Bán hàng', popular: true },
  { id: 'revenue_by_month', name: 'Doanh thu theo tháng', icon: '📅', description: 'So sánh doanh thu giữa các tháng trong năm', group: 'Bán hàng', popular: true },
  { id: 'revenue_by_staff', name: 'Doanh thu theo nhân viên', icon: '👤', description: 'Xếp hạng và so sánh doanh thu từng nhân viên', group: 'Bán hàng', popular: true },
  { id: 'revenue_by_channel', name: 'Doanh thu theo kênh', icon: '📡', description: 'Phân tích doanh thu theo kênh bán hàng', group: 'Bán hàng' },
  { id: 'revenue_by_product', name: 'Doanh thu theo sản phẩm', icon: '📦', description: 'Doanh thu chi tiết từng sản phẩm', group: 'Bán hàng' },
  { id: 'revenue_by_category', name: 'Doanh thu theo danh mục', icon: '🏷️', description: 'Phân tích doanh thu theo nhóm hàng', group: 'Bán hàng' },
  { id: 'revenue_by_area', name: 'Doanh thu theo khu vực', icon: '📍', description: 'Phân bố doanh thu theo địa lý', group: 'Bán hàng' },
  { id: 'revenue_daily', name: 'Doanh thu theo ngày', icon: '📈', description: 'Biến động doanh thu hàng ngày', group: 'Bán hàng' },
  { id: 'revenue_growth', name: 'Tốc độ tăng trưởng', icon: '🚀', description: 'Phân tích xu hướng tăng trưởng doanh thu', group: 'Bán hàng' },
  { id: 'order_summary', name: 'Tổng quan đơn hàng', icon: '📋', description: 'Thống kê đơn hàng theo trạng thái', group: 'Đơn hàng' },
  { id: 'order_by_status', name: 'Đơn hàng theo trạng thái', icon: '🔄', description: 'Phân bố đơn hàng theo từng trạng thái', group: 'Đơn hàng' },
  { id: 'order_by_customer', name: 'Đơn hàng theo khách hàng', icon: '👥', description: 'Số đơn hàng và giá trị theo từng khách', group: 'Đơn hàng' },
  { id: 'order_conversion', name: 'Tỷ lệ chuyển đổi', icon: '🎯', description: 'Tỷ lệ đơn hàng thành công', group: 'Đơn hàng' },
  { id: 'promo_effectiveness', name: 'Hiệu quả khuyến mãi', icon: '🎁', description: 'Phân tích hiệu quả các chương trình khuyến mãi', group: 'Khuyến mãi' },
  { id: 'compare_periods', name: 'So sánh theo kỳ', icon: '⚖️', description: 'So sánh doanh thu giữa các kỳ', group: 'So sánh' },
  { id: 'compare_channels', name: 'So sánh kênh bán hàng', icon: '📊', description: 'So sánh hiệu quả giữa các kênh', group: 'So sánh' },
];

// ===== MAIN EXPORT: 2-LAYER UI =====
export default function ReportRevenueView() {
  const [selectedReport, setSelectedReport] = useState(null);

  if (!selectedReport) {
    return <ReportGrid reports={REVENUE_REPORTS} onSelect={setSelectedReport} title="📈 Báo Cáo Doanh Thu" />;
  }

  const report = REVENUE_REPORTS.find(r => r.id === selectedReport);

  const renderContent = () => {
    switch (selectedReport) {
      case 'revenue_summary': return <RevenueContent />;
      case 'revenue_by_month': return <RevenueByMonth />;
      case 'revenue_by_staff': return <RevenueByStaff />;
      case 'revenue_by_channel': return <RevenueByChannel />;
      case 'revenue_by_product': return <RevenueByProduct />;
      case 'revenue_by_category': return <RevenueByCategory />;
      case 'revenue_by_area': return <RevenueByArea />;
      case 'revenue_daily': return <RevenueDaily />;
      case 'revenue_growth': return <RevenueGrowth />;
      case 'order_summary': return <OrderSummary />;
      case 'order_by_status': return <OrderByStatus />;
      case 'order_by_customer': return <OrderByCustomer />;
      case 'order_conversion': return <OrderConversion />;
      case 'promo_effectiveness': return <PromoEffectiveness />;
      case 'compare_periods': return <ComparePeriods />;
      case 'compare_channels': return <CompareChannels />;
      default: return <ComingSoon />;
    }
  };

  return (
    <ReportDetailWrapper report={report} onBack={() => setSelectedReport(null)}>
      {renderContent()}
    </ReportDetailWrapper>
  );
}

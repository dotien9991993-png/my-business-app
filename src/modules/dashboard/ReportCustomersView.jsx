import React, { useState, useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useData } from '../../contexts/DataContext';
import { formatMoney } from '../../utils/formatUtils';
import { getTodayVN } from '../../utils/dateUtils';
import {
  TimeFilter, useTimeFilter, StatCard, Section, ExportButton, PrintButton,
  EmptyState, PIE_COLORS, ChartTooltip, exportToCSV, formatPercent, pctChange,
  filterByDateRange
} from './reportUtils';
import ReportGrid from './ReportGrid';
import ReportDetailWrapper, { ComingSoon } from './ReportDetailWrapper';

// Màu cố định cho RFM segments
const RFM_COLORS = {
  'VIP': '#22c55e',
  'Trung thành': '#3b82f6',
  'Mới': '#8b5cf6',
  'Ngủ đông': '#f59e0b',
  'Mất': '#ef4444',
};

function CustomersContent() {
  const { customers, orders } = useData();
  const tf = useTimeFilter('month');

  const safeCustomers = useMemo(() => customers || [], [customers]);
  const safeOrders = useMemo(() => orders || [], [orders]);

  // Đơn hàng trong kỳ hiện tại
  const currentOrders = useMemo(
    () => filterByDateRange(safeOrders, 'created_at', tf.range.start, tf.range.end),
    [safeOrders, tf.range.start, tf.range.end]
  );

  // Đơn hàng kỳ trước
  const prevOrders = useMemo(
    () => filterByDateRange(safeOrders, 'created_at', tf.prevRange.start, tf.prevRange.end),
    [safeOrders, tf.prevRange.start, tf.prevRange.end]
  );

  // Khách mới trong kỳ
  const newCustomers = useMemo(
    () => filterByDateRange(safeCustomers, 'created_at', tf.range.start, tf.range.end),
    [safeCustomers, tf.range.start, tf.range.end]
  );

  // Khách mới kỳ trước
  const prevNewCustomers = useMemo(
    () => filterByDateRange(safeCustomers, 'created_at', tf.prevRange.start, tf.prevRange.end),
    [safeCustomers, tf.prevRange.start, tf.prevRange.end]
  );

  // ===== 1. KPI Cards =====
  const kpiData = useMemo(() => {
    const totalCustomers = safeCustomers.length;

    const newCount = newCustomers.length;
    const prevNewCount = prevNewCustomers.length;

    // Khách mua hàng trong kỳ (distinct customer_id hoặc customer_name)
    const activeCustomerIds = new Set();
    currentOrders.forEach(o => {
      if (o.customer_id) activeCustomerIds.add(o.customer_id);
      else if (o.customer_name) activeCustomerIds.add(o.customer_name);
    });
    const activeCount = activeCustomerIds.size;

    const prevActiveIds = new Set();
    prevOrders.forEach(o => {
      if (o.customer_id) prevActiveIds.add(o.customer_id);
      else if (o.customer_name) prevActiveIds.add(o.customer_name);
    });
    const prevActiveCount = prevActiveIds.size;

    // Doanh thu / khách hàng mua hàng
    const totalRevenue = currentOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const avgRevenue = activeCount > 0 ? totalRevenue / activeCount : 0;

    const prevRevenue = prevOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const prevAvgRevenue = prevActiveCount > 0 ? prevRevenue / prevActiveCount : 0;

    return {
      totalCustomers,
      newCount, prevNewCount,
      activeCount, prevActiveCount,
      avgRevenue, prevAvgRevenue,
    };
  }, [safeCustomers, newCustomers, prevNewCustomers, currentOrders, prevOrders]);

  // ===== 2. Tăng trưởng khách hàng (LineChart) =====
  const growthData = useMemo(() => {
    // Lấy 12 tháng gần nhất
    const today = getTodayVN();
    const year = parseInt(today.slice(0, 4));
    const month = parseInt(today.slice(5, 7));
    const result = [];

    for (let i = 11; i >= 0; i--) {
      let m = month - i;
      let y = year;
      while (m <= 0) { m += 12; y--; }
      const prefix = `${y}-${String(m).padStart(2, '0')}`;
      const label = `T${m}/${String(y).slice(2)}`;

      const count = safeCustomers.filter(c => {
        const d = c.created_at;
        return d && d.slice(0, 7) === prefix;
      }).length;

      result.push({ name: label, value: count });
    }

    return result;
  }, [safeCustomers]);

  // ===== 3. Top khách hàng theo doanh thu =====
  const topCustomers = useMemo(() => {
    // Tính tổng chi tiêu trong kỳ cho mỗi khách
    const map = {};
    currentOrders.forEach(o => {
      const key = o.customer_id || o.customer_name || 'unknown';
      if (!map[key]) {
        map[key] = {
          id: o.customer_id,
          name: o.customer_name || 'Khách lẻ',
          phone: '',
          orderCount: 0,
          totalSpent: 0,
        };
      }
      map[key].orderCount += 1;
      map[key].totalSpent += parseFloat(o.total_amount || 0);
    });

    // Bổ sung SĐT từ bảng customers
    Object.values(map).forEach(entry => {
      if (entry.id) {
        const cust = safeCustomers.find(c => c.id === entry.id);
        if (cust) {
          entry.phone = cust.phone || '';
          entry.name = cust.name || entry.name;
        }
      }
    });

    return Object.values(map)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);
  }, [currentOrders, safeCustomers]);

  // ===== 4. Phân tích RFM =====
  const rfmData = useMemo(() => {
    const today = getTodayVN();
    const todayMs = new Date(today + 'T00:00:00+07:00').getTime();
    const DAY_MS = 86400000;

    // Tính tổng chi tiêu của mỗi khách (tất cả thời gian)
    const customerStats = {};
    safeOrders.forEach(o => {
      const key = o.customer_id || o.customer_name;
      if (!key) return;
      if (!customerStats[key]) {
        customerStats[key] = { totalSpent: 0, lastOrderDate: null, firstOrderDate: null, orderCount: 0 };
      }
      customerStats[key].totalSpent += parseFloat(o.total_amount || 0);
      customerStats[key].orderCount += 1;
      const d = (o.created_at || '').slice(0, 10);
      if (d) {
        if (!customerStats[key].lastOrderDate || d > customerStats[key].lastOrderDate) {
          customerStats[key].lastOrderDate = d;
        }
        if (!customerStats[key].firstOrderDate || d < customerStats[key].firstOrderDate) {
          customerStats[key].firstOrderDate = d;
        }
      }
    });

    // Tính ngưỡng top 20% giá trị
    const allSpent = Object.values(customerStats).map(s => s.totalSpent).sort((a, b) => b - a);
    const top20Idx = Math.max(1, Math.floor(allSpent.length * 0.2));
    const highValueThreshold = allSpent[top20Idx - 1] || 0;

    const rangeStart = tf.range.start;
    const rangeEnd = tf.range.end;
    const segments = { 'VIP': 0, 'Trung thành': 0, 'Mới': 0, 'Ngủ đông': 0, 'Mất': 0 };

    Object.values(customerStats).forEach(stat => {
      const lastDate = stat.lastOrderDate;
      if (!lastDate) { segments['Mất']++; return; }

      const lastMs = new Date(lastDate + 'T00:00:00+07:00').getTime();
      const daysSinceLast = Math.floor((todayMs - lastMs) / DAY_MS);

      const isRecent = daysSinceLast <= 30;
      const isHighValue = stat.totalSpent >= highValueThreshold;

      // Khách mới: đơn đầu tiên nằm trong kỳ hiện tại
      const firstInPeriod = stat.firstOrderDate >= rangeStart && stat.firstOrderDate <= rangeEnd;

      if (firstInPeriod && stat.orderCount <= 2) {
        segments['Mới']++;
      } else if (isRecent && isHighValue) {
        segments['VIP']++;
      } else if (isRecent) {
        segments['Trung thành']++;
      } else if (daysSinceLast <= 180) {
        segments['Ngủ đông']++;
      } else {
        segments['Mất']++;
      }
    });

    return Object.entries(segments)
      .filter(([_name, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [safeOrders, tf.range.start, tf.range.end]);

  // ===== 5. Khách hàng theo nguồn =====
  const sourceData = useMemo(() => {
    const map = {};
    safeCustomers.forEach(c => {
      const source = c.source || 'Không rõ';
      map[source] = (map[source] || 0) + 1;
    });

    // Nếu không có dữ liệu source từ customers, thử dùng channel từ orders
    if (Object.keys(map).length <= 1 && map['Không rõ']) {
      const channelMap = {};
      safeOrders.forEach(o => {
        const ch = o.channel || 'Không rõ';
        channelMap[ch] = (channelMap[ch] || 0) + 1;
      });
      if (Object.keys(channelMap).length > 1 || !channelMap['Không rõ']) {
        return Object.entries(channelMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);
      }
    }

    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [safeCustomers, safeOrders]);

  // ===== 6. Khách hàng theo khu vực =====
  const cityData = useMemo(() => {
    const map = {};
    safeCustomers.forEach(c => {
      const city = c.city || 'Không rõ';
      map[city] = (map[city] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [safeCustomers]);

  // ===== Export CSV =====
  const handleExport = () => {
    const rows = topCustomers.map((c, i) => ({
      stt: i + 1,
      name: c.name,
      phone: c.phone,
      orderCount: c.orderCount,
      totalSpent: c.totalSpent,
      avgOrder: c.orderCount > 0 ? Math.round(c.totalSpent / c.orderCount) : 0,
    }));
    exportToCSV(rows, [
      { label: '#', accessor: 'stt' },
      { label: 'Tên KH', accessor: 'name' },
      { label: 'SĐT', accessor: 'phone' },
      { label: 'Số đơn', accessor: 'orderCount' },
      { label: 'Tổng chi tiêu', accessor: 'totalSpent' },
      { label: 'Đơn TB', accessor: 'avgOrder' },
    ], 'bao-cao-khach-hang');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter {...tf} />
        <div className="flex gap-2">
          <ExportButton onClick={handleExport} />
          <PrintButton />
        </div>
      </div>

      {/* 1. KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Tổng khách hàng"
          value={kpiData.totalCustomers.toLocaleString('vi-VN')}
          color="blue"
        />
        <StatCard
          label="Khách mới trong kỳ"
          value={kpiData.newCount.toLocaleString('vi-VN')}
          sub={kpiData.prevNewCount > 0
            ? `${pctChange(kpiData.newCount, kpiData.prevNewCount) >= 0 ? '+' : ''}${pctChange(kpiData.newCount, kpiData.prevNewCount)}% vs kỳ trước`
            : undefined}
          color="green"
        />
        <StatCard
          label="Khách mua hàng"
          value={kpiData.activeCount.toLocaleString('vi-VN')}
          sub={kpiData.prevActiveCount > 0
            ? `${pctChange(kpiData.activeCount, kpiData.prevActiveCount) >= 0 ? '+' : ''}${pctChange(kpiData.activeCount, kpiData.prevActiveCount)}% vs kỳ trước`
            : undefined}
          color="orange"
        />
        <StatCard
          label="Doanh thu/khách"
          value={formatMoney(kpiData.avgRevenue)}
          sub={kpiData.prevAvgRevenue > 0
            ? `${pctChange(kpiData.avgRevenue, kpiData.prevAvgRevenue) >= 0 ? '+' : ''}${pctChange(kpiData.avgRevenue, kpiData.prevAvgRevenue)}% vs kỳ trước`
            : undefined}
          color="purple"
        />
      </div>

      {/* 2. Tăng trưởng khách hàng */}
      <Section title="Tăng trưởng khách hàng">
        {growthData.some(d => d.value > 0) ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={growthData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={35} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={{ r: 4 }}
                name="Khách mới"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu khách hàng" />
        )}
      </Section>

      {/* 3. Top khách hàng */}
      <Section title="Top 10 khách hàng theo doanh thu">
        {topCustomers.length === 0 ? (
          <EmptyState text="Chưa có dữ liệu đơn hàng trong kỳ" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-2">Tên KH</th>
                  <th className="pb-2 pr-2 hidden sm:table-cell">SĐT</th>
                  <th className="pb-2 pr-2 text-right">Số đơn</th>
                  <th className="pb-2 pr-2 text-right">Tổng chi tiêu</th>
                  <th className="pb-2 text-right hidden sm:table-cell">Đơn TB</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c, i) => (
                  <tr key={c.id || c.name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-2">
                      <span className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-xs font-bold text-white ${
                        i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-300'
                      }`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-2 pr-2 font-medium truncate max-w-[120px] md:max-w-[200px]">{c.name}</td>
                    <td className="py-2 pr-2 text-gray-500 hidden sm:table-cell">{c.phone || '-'}</td>
                    <td className="py-2 pr-2 text-right">{c.orderCount}</td>
                    <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(c.totalSpent)}</td>
                    <td className="py-2 text-right text-gray-600 hidden sm:table-cell">
                      {c.orderCount > 0 ? formatMoney(Math.round(c.totalSpent / c.orderCount)) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Charts row: RFM + Nguồn */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 4. Phân loại khách hàng (RFM) */}
        <Section title="Phân loại khách hàng (RFM)">
          {rfmData.length === 0 ? (
            <EmptyState text="Chưa có dữ liệu để phân loại" />
          ) : (
            <div className="flex flex-col md:flex-row items-center gap-2">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={rfmData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {rfmData.map((entry, i) => (
                      <Cell key={i} fill={RFM_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 text-xs w-full md:w-auto min-w-[140px]">
                {rfmData.map((d, i) => {
                  const total = rfmData.reduce((s, x) => s + x.value, 0);
                  return (
                    <div key={d.name} className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: RFM_COLORS[d.name] || PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-gray-600 truncate flex-1">{d.name}</span>
                      <span className="font-medium text-gray-800 whitespace-nowrap">
                        {d.value} ({formatPercent(d.value, total)})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        {/* 5. Khách hàng theo nguồn */}
        <Section title="Khách hàng theo nguồn">
          {sourceData.length === 0 ? (
            <EmptyState text="Chưa có dữ liệu nguồn khách hàng" />
          ) : (
            <div className="flex flex-col md:flex-row items-center gap-2">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {sourceData.map((_entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 text-xs w-full md:w-auto min-w-[140px]">
                {sourceData.map((d, i) => {
                  const total = sourceData.reduce((s, x) => s + x.value, 0);
                  return (
                    <div key={d.name} className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-gray-600 truncate flex-1">{d.name}</span>
                      <span className="font-medium text-gray-800 whitespace-nowrap">
                        {d.value} ({formatPercent(d.value, total)})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* 6. Phân bố theo khu vực */}
      <Section title="Phân bố theo khu vực">
        {cityData.length === 0 ? (
          <EmptyState text="Chưa có dữ liệu khu vực" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(260, cityData.length * 36)}>
            <BarChart data={cityData} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 11 }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="value"
                fill="#22c55e"
                radius={[0, 4, 4, 0]}
                name="Số khách"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>
    </div>
  );
}

// ===== 2. TOP KHÁCH HÀNG =====
function CustomerTop() {
  const { customers, orders } = useData();
  const tf = useTimeFilter('month');
  const safeCustomers = useMemo(() => customers || [], [customers]);
  const safeOrders = useMemo(() => orders || [], [orders]);
  const currentOrders = useMemo(
    () => filterByDateRange(safeOrders, 'created_at', tf.range.start, tf.range.end),
    [safeOrders, tf.range.start, tf.range.end]
  );

  const ranked = useMemo(() => {
    const map = {};
    currentOrders.forEach(o => {
      const key = o.customer_id || o.customer_name || 'unknown';
      if (!map[key]) map[key] = { id: o.customer_id, name: o.customer_name || 'Khách lẻ', phone: '', orderCount: 0, totalSpent: 0, lastOrder: '' };
      map[key].orderCount += 1;
      map[key].totalSpent += parseFloat(o.total_amount || 0);
      const d = (o.created_at || '').slice(0, 10);
      if (d > map[key].lastOrder) map[key].lastOrder = d;
    });
    Object.values(map).forEach(entry => {
      if (entry.id) {
        const c = safeCustomers.find(x => x.id === entry.id);
        if (c) { entry.phone = c.phone || ''; entry.name = c.name || entry.name; }
      }
    });
    return Object.values(map).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [currentOrders, safeCustomers]);

  const totalRevenue = ranked.reduce((s, c) => s + c.totalSpent, 0);
  const top10Revenue = ranked.slice(0, 10).reduce((s, c) => s + c.totalSpent, 0);
  const top15Chart = ranked.slice(0, 15).map(c => ({ name: c.name.slice(0, 20), value: c.totalSpent })).reverse();
  const avgSpend = ranked.length > 0 ? totalRevenue / ranked.length : 0;

  const handleExport = () => {
    exportToCSV(ranked.slice(0, 50).map((c, i) => ({ stt: i + 1, name: c.name, phone: c.phone, orderCount: c.orderCount, totalSpent: c.totalSpent, avg: c.orderCount > 0 ? Math.round(c.totalSpent / c.orderCount) : 0, lastOrder: c.lastOrder })),
      [{ label: '#', accessor: 'stt' }, { label: 'Tên KH', accessor: 'name' }, { label: 'SĐT', accessor: 'phone' }, { label: 'Số đơn', accessor: 'orderCount' }, { label: 'Tổng chi tiêu', accessor: 'totalSpent' }, { label: 'TB/đơn', accessor: 'avg' }, { label: 'Đơn gần nhất', accessor: 'lastOrder' }], 'top-khach-hang');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter {...tf} />
        <div className="flex gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Top 1 KH" value={ranked[0]?.name || '-'} color="blue" />
        <StatCard label="Tổng DT từ Top 10" value={formatMoney(top10Revenue)} color="green" />
        <StatCard label="% tổng DT" value={totalRevenue > 0 ? formatPercent(top10Revenue, totalRevenue) : '0%'} sub="Top 10 khách hàng" color="orange" />
        <StatCard label="TB chi tiêu/KH" value={formatMoney(avgSpend)} color="purple" />
      </div>
      <Section title="Top 15 khách hàng theo doanh thu">
        {top15Chart.length === 0 ? <EmptyState text="Chưa có dữ liệu" /> : (
          <ResponsiveContainer width="100%" height={Math.max(300, top15Chart.length * 32)}>
            <BarChart data={top15Chart} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => formatMoney(v)} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v)} />} />
              <Bar dataKey="value" fill="#22c55e" radius={[0, 4, 4, 0]} name="Doanh thu" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>
      <Section title="Chi tiết khách hàng">
        {ranked.length === 0 ? <EmptyState text="Chưa có dữ liệu đơn hàng" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2 pr-2">#</th><th className="pb-2 pr-2">Tên KH</th><th className="pb-2 pr-2 hidden sm:table-cell">SĐT</th>
                <th className="pb-2 pr-2 text-right">Số đơn</th><th className="pb-2 pr-2 text-right">Tổng chi tiêu</th>
                <th className="pb-2 pr-2 text-right hidden sm:table-cell">TB/đơn</th><th className="pb-2 text-right hidden md:table-cell">Đơn gần nhất</th>
              </tr></thead>
              <tbody>{ranked.slice(0, 30).map((c, i) => (
                <tr key={c.id || c.name + i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-2"><span className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-xs font-bold text-white ${i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-300'}`}>{i + 1}</span></td>
                  <td className="py-2 pr-2 font-medium truncate max-w-[140px]">{c.name}</td>
                  <td className="py-2 pr-2 text-gray-500 hidden sm:table-cell">{c.phone || '-'}</td>
                  <td className="py-2 pr-2 text-right">{c.orderCount}</td>
                  <td className="py-2 pr-2 text-right font-bold text-green-700">{formatMoney(c.totalSpent)}</td>
                  <td className="py-2 pr-2 text-right text-gray-600 hidden sm:table-cell">{c.orderCount > 0 ? formatMoney(Math.round(c.totalSpent / c.orderCount)) : '-'}</td>
                  <td className="py-2 text-right text-gray-500 hidden md:table-cell">{c.lastOrder || '-'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ===== 3. PHÂN TÍCH RFM CHI TIẾT =====
function CustomerRFM() {
  const { customers, orders } = useData();
  const safeCustomers = useMemo(() => customers || [], [customers]);
  const safeOrders = useMemo(() => orders || [], [orders]);

  const rfmResult = useMemo(() => {
    const today = getTodayVN();
    const todayMs = new Date(today + 'T00:00:00+07:00').getTime();
    const DAY_MS = 86400000;
    const stats = {};
    safeOrders.forEach(o => {
      const key = o.customer_id || o.customer_name;
      if (!key) return;
      if (!stats[key]) stats[key] = { name: o.customer_name || 'Khách lẻ', totalSpent: 0, orderCount: 0, lastOrder: '', id: o.customer_id };
      stats[key].totalSpent += parseFloat(o.total_amount || 0);
      stats[key].orderCount += 1;
      const d = (o.created_at || '').slice(0, 10);
      if (d > (stats[key].lastOrder || '')) stats[key].lastOrder = d;
    });
    // Enrich names from customers
    Object.values(stats).forEach(s => {
      if (s.id) { const c = safeCustomers.find(x => x.id === s.id); if (c) s.name = c.name || s.name; }
    });
    // Calculate R/F/M scores
    const entries = Object.values(stats).filter(s => s.lastOrder);
    if (entries.length === 0) return { segments: [], details: [] };
    const recencies = entries.map(s => Math.floor((todayMs - new Date(s.lastOrder + 'T00:00:00+07:00').getTime()) / DAY_MS));
    const frequencies = entries.map(s => s.orderCount);
    const monetaries = entries.map(s => s.totalSpent);
    const quantile = (arr, q) => { const sorted = [...arr].sort((a, b) => a - b); const i = Math.floor(sorted.length * q); return sorted[Math.min(i, sorted.length - 1)]; };
    const rQ = [0.2, 0.4, 0.6, 0.8].map(q => quantile(recencies, q));
    const fQ = [0.2, 0.4, 0.6, 0.8].map(q => quantile(frequencies, q));
    const mQ = [0.2, 0.4, 0.6, 0.8].map(q => quantile(monetaries, q));
    const score = (val, qs, invert) => { for (let i = 0; i < 4; i++) { if (val <= qs[i]) return invert ? 5 - i : i + 1; } return invert ? 1 : 5; };

    const details = entries.map((s, idx) => {
      const r = score(recencies[idx], rQ, true);
      const f = score(frequencies[idx], fQ, false);
      const m = score(monetaries[idx], mQ, false);
      let segment = 'Tiềm năng';
      if (r >= 4 && f >= 4 && m >= 4) segment = 'VIP';
      else if (r >= 3 && f >= 3) segment = 'Trung thành';
      else if (r <= 2 && f <= 2) segment = 'Ngủ đông';
      else if (r <= 1) segment = 'Mất';
      return { ...s, rScore: r, fScore: f, mScore: m, segment };
    });

    const segMap = {};
    details.forEach(d => { segMap[d.segment] = (segMap[d.segment] || 0) + 1; });
    const segments = Object.entries(segMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return { segments, details: details.sort((a, b) => b.totalSpent - a.totalSpent) };
  }, [safeOrders, safeCustomers]);

  const segCount = (name) => rfmResult.segments.find(s => s.name === name)?.value || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="VIP" value={segCount('VIP')} color="green" />
        <StatCard label="Trung thành" value={segCount('Trung thành')} color="blue" />
        <StatCard label="Ngủ đông" value={segCount('Ngủ đông')} color="orange" />
        <StatCard label="Mất" value={segCount('Mất')} color="red" />
      </div>
      <Section title="Phân bố phân khúc RFM">
        {rfmResult.segments.length === 0 ? <EmptyState text="Chưa có dữ liệu" /> : (
          <div className="flex flex-col md:flex-row items-center gap-2">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart><Pie data={rfmResult.segments} cx="50%" cy="50%" outerRadius={90} innerRadius={45} dataKey="value" paddingAngle={2}>
                {rfmResult.segments.map((entry, i) => <Cell key={i} fill={RFM_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 text-xs w-full md:w-auto min-w-[140px]">
              {rfmResult.segments.map((d, i) => {
                const total = rfmResult.segments.reduce((s, x) => s + x.value, 0);
                return (<div key={d.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: RFM_COLORS[d.name] || PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-600 truncate flex-1">{d.name}</span>
                  <span className="font-medium text-gray-800 whitespace-nowrap">{d.value} ({formatPercent(d.value, total)})</span>
                </div>);
              })}
            </div>
          </div>
        )}
      </Section>
      <Section title="Chi tiết RFM khách hàng">
        {rfmResult.details.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2 pr-2">KH</th><th className="pb-2 pr-2 text-center">R</th><th className="pb-2 pr-2 text-center">F</th><th className="pb-2 pr-2 text-center">M</th>
              <th className="pb-2 pr-2">Phân khúc</th><th className="pb-2 pr-2 text-right hidden sm:table-cell">Tổng chi tiêu</th><th className="pb-2 text-right hidden sm:table-cell">Đơn cuối</th>
            </tr></thead><tbody>{rfmResult.details.slice(0, 30).map((d, i) => (
              <tr key={d.id || d.name + i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-2 font-medium truncate max-w-[120px]">{d.name}</td>
                <td className="py-2 pr-2 text-center">{d.rScore}</td><td className="py-2 pr-2 text-center">{d.fScore}</td><td className="py-2 pr-2 text-center">{d.mScore}</td>
                <td className="py-2 pr-2"><span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: RFM_COLORS[d.segment] || '#6b7280' }}>{d.segment}</span></td>
                <td className="py-2 pr-2 text-right font-bold text-green-700 hidden sm:table-cell">{formatMoney(d.totalSpent)}</td>
                <td className="py-2 text-right text-gray-500 hidden sm:table-cell">{d.lastOrder}</td>
              </tr>
            ))}</tbody></table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ===== 4. TỶ LỆ GIỮ CHÂN =====
function CustomerRetention() {
  const { orders } = useData();
  const safeOrders = useMemo(() => orders || [], [orders]);

  const retentionData = useMemo(() => {
    const today = getTodayVN();
    const year = parseInt(today.slice(0, 4));
    const month = parseInt(today.slice(5, 7));
    const result = [];

    for (let i = 12; i >= 0; i--) {
      let m = month - i; let y = year;
      while (m <= 0) { m += 12; y--; }
      const prefix = `${y}-${String(m).padStart(2, '0')}`;
      // Previous month
      let pm = m - 1; let py = y;
      if (pm <= 0) { pm += 12; py--; }
      const prevPrefix = `${py}-${String(pm).padStart(2, '0')}`;

      const curIds = new Set();
      const prevIds = new Set();
      safeOrders.forEach(o => {
        const d = (o.created_at || '').slice(0, 7);
        const cid = o.customer_id || o.customer_name;
        if (!cid) return;
        if (d === prefix) curIds.add(cid);
        if (d === prevPrefix) prevIds.add(cid);
      });

      const returning = [...curIds].filter(id => prevIds.has(id)).length;
      const newCust = [...curIds].filter(id => !prevIds.has(id)).length;
      const lost = [...prevIds].filter(id => !curIds.has(id)).length;
      const rate = prevIds.size > 0 ? Math.round((returning / prevIds.size) * 100) : 0;

      result.push({ name: `T${m}/${String(y).slice(2)}`, bought: curIds.size, returning, newCust, lost, rate, prevCount: prevIds.size });
    }
    return result;
  }, [safeOrders]);

  const latest = retentionData[retentionData.length - 1] || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tỷ lệ giữ chân" value={`${latest.rate || 0}%`} color="green" />
        <StatCard label="KH quay lại" value={latest.returning || 0} color="blue" />
        <StatCard label="KH mất" value={latest.lost || 0} color="red" />
        <StatCard label="KH mới" value={latest.newCust || 0} color="purple" />
      </div>
      <Section title="Tỷ lệ giữ chân theo tháng">
        {retentionData.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={retentionData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={35} unit="%" domain={[0, 100]} />
              <Tooltip content={<ChartTooltip formatter={v => v + '%'} />} />
              <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} name="Tỷ lệ giữ chân" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>
      <Section title="Chi tiết theo tháng">
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500">
            <th className="pb-2 pr-2">Tháng</th><th className="pb-2 pr-2 text-right">KH mua</th><th className="pb-2 pr-2 text-right">Quay lại</th>
            <th className="pb-2 pr-2 text-right">KH mới</th><th className="pb-2 text-right">Tỷ lệ giữ chân</th>
          </tr></thead><tbody>{retentionData.map(d => (
            <tr key={d.name} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pr-2 font-medium">{d.name}</td>
              <td className="py-2 pr-2 text-right">{d.bought}</td>
              <td className="py-2 pr-2 text-right text-blue-600">{d.returning}</td>
              <td className="py-2 pr-2 text-right text-green-600">{d.newCust}</td>
              <td className="py-2 text-right font-bold">{d.rate}%</td>
            </tr>
          ))}</tbody></table>
        </div>
      </Section>
    </div>
  );
}

// ===== 5. GIÁ TRỊ VÒNG ĐỜI (CLV) =====
function CustomerLifetime() {
  const { customers, orders } = useData();
  const safeCustomers = useMemo(() => customers || [], [customers]);
  const safeOrders = useMemo(() => orders || [], [orders]);

  const clvData = useMemo(() => {
    const stats = {};
    safeOrders.forEach(o => {
      const key = o.customer_id || o.customer_name;
      if (!key) return;
      if (!stats[key]) stats[key] = { name: o.customer_name || 'Khách lẻ', id: o.customer_id, totalSpent: 0, orderCount: 0, firstDate: '', lastDate: '' };
      stats[key].totalSpent += parseFloat(o.total_amount || 0);
      stats[key].orderCount += 1;
      const d = (o.created_at || '').slice(0, 10);
      if (!stats[key].firstDate || d < stats[key].firstDate) stats[key].firstDate = d;
      if (!stats[key].lastDate || d > stats[key].lastDate) stats[key].lastDate = d;
    });
    Object.values(stats).forEach(s => {
      if (s.id) { const c = safeCustomers.find(x => x.id === s.id); if (c) s.name = c.name || s.name; }
      const avgOrder = s.orderCount > 0 ? s.totalSpent / s.orderCount : 0;
      const lifespanDays = s.firstDate && s.lastDate ? Math.max(1, (new Date(s.lastDate) - new Date(s.firstDate)) / 86400000) : 1;
      const freqPerYear = s.orderCount / Math.max(lifespanDays / 365, 1/12);
      const lifespanYears = Math.max(lifespanDays / 365, 1/12);
      s.clv = avgOrder * freqPerYear * lifespanYears;
    });
    return Object.values(stats).sort((a, b) => b.clv - a.clv);
  }, [safeOrders, safeCustomers]);

  const avgCLV = clvData.length > 0 ? clvData.reduce((s, c) => s + c.clv, 0) / clvData.length : 0;
  const maxCLV = clvData[0]?.clv || 0;
  const totalValue = clvData.reduce((s, c) => s + c.clv, 0);
  const over10m = clvData.filter(c => c.clv > 10000000).length;

  const distData = useMemo(() => {
    const ranges = [{ label: '<1tr', max: 1000000 }, { label: '1-5tr', max: 5000000 }, { label: '5-10tr', max: 10000000 }, { label: '10-50tr', max: 50000000 }, { label: '>50tr', max: Infinity }];
    let prev = 0;
    return ranges.map(r => {
      const count = clvData.filter(c => c.clv >= prev && c.clv < r.max).length;
      prev = r.max;
      return { name: r.label, value: count };
    });
  }, [clvData]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="CLV trung bình" value={formatMoney(avgCLV)} color="blue" />
        <StatCard label="CLV cao nhất" value={formatMoney(maxCLV)} color="green" />
        <StatCard label="Tổng giá trị KH" value={formatMoney(totalValue)} color="orange" />
        <StatCard label="KH > 10tr" value={over10m} color="purple" />
      </div>
      <Section title="Phân bố CLV">
        {distData.every(d => d.value === 0) ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={distData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={35} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Số KH" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>
      <Section title="Chi tiết CLV khách hàng">
        {clvData.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2 pr-2">KH</th><th className="pb-2 pr-2 text-right">Số đơn</th><th className="pb-2 pr-2 text-right hidden sm:table-cell">Tổng chi tiêu</th>
              <th className="pb-2 pr-2 text-right hidden md:table-cell">Ngày đầu</th><th className="pb-2 pr-2 text-right hidden md:table-cell">Ngày cuối</th><th className="pb-2 text-right">CLV</th>
            </tr></thead><tbody>{clvData.slice(0, 30).map((c, i) => (
              <tr key={c.id || c.name + i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-2 font-medium truncate max-w-[140px]">{c.name}</td>
                <td className="py-2 pr-2 text-right">{c.orderCount}</td>
                <td className="py-2 pr-2 text-right hidden sm:table-cell">{formatMoney(c.totalSpent)}</td>
                <td className="py-2 pr-2 text-right text-gray-500 hidden md:table-cell">{c.firstDate}</td>
                <td className="py-2 pr-2 text-right text-gray-500 hidden md:table-cell">{c.lastDate}</td>
                <td className="py-2 text-right font-bold text-green-700">{formatMoney(c.clv)}</td>
              </tr>
            ))}</tbody></table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ===== 6. NGUỒN KHÁCH HÀNG =====
function CustomerSource() {
  const { customers, orders } = useData();
  const safeCustomers = useMemo(() => customers || [], [customers]);
  const safeOrders = useMemo(() => orders || [], [orders]);

  const sourceStats = useMemo(() => {
    // Group customers by source, fallback to orders channel
    const custBySource = {};
    safeCustomers.forEach(c => {
      const src = c.source || 'Không rõ';
      if (!custBySource[src]) custBySource[src] = { customers: [], ids: new Set() };
      custBySource[src].customers.push(c);
      custBySource[src].ids.add(c.id);
    });

    // If only 'Không rõ' source, try channel from orders
    const keys = Object.keys(custBySource);
    if (keys.length <= 1 && keys[0] === 'Không rõ') {
      const byChannel = {};
      safeOrders.forEach(o => {
        const ch = o.channel || 'Không rõ';
        const cid = o.customer_id || o.customer_name || 'unknown';
        if (!byChannel[ch]) byChannel[ch] = { custIds: new Set(), revenue: 0 };
        byChannel[ch].custIds.add(cid);
        byChannel[ch].revenue += parseFloat(o.total_amount || 0);
      });
      return Object.entries(byChannel).map(([name, d]) => ({
        name, count: d.custIds.size, revenue: d.revenue, avg: d.custIds.size > 0 ? d.revenue / d.custIds.size : 0,
      })).sort((a, b) => b.count - a.count);
    }

    // Calculate revenue per source
    const ordersByCustomer = {};
    safeOrders.forEach(o => {
      const cid = o.customer_id;
      if (!cid) return;
      if (!ordersByCustomer[cid]) ordersByCustomer[cid] = 0;
      ordersByCustomer[cid] += parseFloat(o.total_amount || 0);
    });

    return Object.entries(custBySource).map(([name, d]) => {
      const revenue = d.customers.reduce((s, c) => s + (ordersByCustomer[c.id] || 0), 0);
      return { name, count: d.customers.length, revenue, avg: d.customers.length > 0 ? revenue / d.customers.length : 0 };
    }).sort((a, b) => b.count - a.count);
  }, [safeCustomers, safeOrders]);

  const totalSources = sourceStats.length;
  const topSource = sourceStats[0];
  const totalCust = sourceStats.reduce((s, d) => s + d.count, 0);
  const pieData = sourceStats.map(d => ({ name: d.name, value: d.count }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng nguồn" value={totalSources} color="blue" />
        <StatCard label="Nguồn nhiều nhất" value={topSource?.name || '-'} color="green" />
        <StatCard label="KH từ nguồn top" value={topSource?.count || 0} color="orange" />
        <StatCard label="% top nguồn" value={totalCust > 0 ? formatPercent(topSource?.count || 0, totalCust) : '0%'} color="purple" />
      </div>
      <Section title="Phân bố theo nguồn">
        {pieData.length === 0 ? <EmptyState /> : (
          <div className="flex flex-col md:flex-row items-center gap-2">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart><Pie data={pieData} cx="50%" cy="50%" outerRadius={90} innerRadius={45} dataKey="value" paddingAngle={2}>
                {pieData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 text-xs w-full md:w-auto min-w-[140px]">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-600 truncate flex-1">{d.name}</span>
                  <span className="font-medium text-gray-800 whitespace-nowrap">{d.value} ({formatPercent(d.value, totalCust)})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
      <Section title="Chi tiết theo nguồn">
        {sourceStats.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2 pr-2">Nguồn</th><th className="pb-2 pr-2 text-right">Số KH</th><th className="pb-2 pr-2 text-right">Doanh thu</th>
              <th className="pb-2 pr-2 text-right hidden sm:table-cell">TB chi tiêu/KH</th><th className="pb-2 text-right">%</th>
            </tr></thead><tbody>{sourceStats.map(d => (
              <tr key={d.name} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-2 font-medium">{d.name}</td>
                <td className="py-2 pr-2 text-right">{d.count}</td>
                <td className="py-2 pr-2 text-right text-green-700 font-bold">{formatMoney(d.revenue)}</td>
                <td className="py-2 pr-2 text-right text-gray-600 hidden sm:table-cell">{formatMoney(d.avg)}</td>
                <td className="py-2 text-right">{formatPercent(d.count, totalCust)}</td>
              </tr>
            ))}</tbody></table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ===== 7. THEO KHU VỰC =====
function CustomerArea() {
  const { customers, orders } = useData();
  const safeCustomers = useMemo(() => customers || [], [customers]);
  const safeOrders = useMemo(() => orders || [], [orders]);

  const areaStats = useMemo(() => {
    const ordersByCustomer = {};
    safeOrders.forEach(o => {
      const cid = o.customer_id;
      if (!cid) return;
      if (!ordersByCustomer[cid]) ordersByCustomer[cid] = 0;
      ordersByCustomer[cid] += parseFloat(o.total_amount || 0);
    });
    const map = {};
    safeCustomers.forEach(c => {
      const city = c.city || c.address || 'Không rõ';
      if (!map[city]) map[city] = { count: 0, revenue: 0 };
      map[city].count += 1;
      map[city].revenue += ordersByCustomer[c.id] || 0;
    });
    return Object.entries(map).map(([name, d]) => ({
      name, count: d.count, revenue: d.revenue, avg: d.count > 0 ? d.revenue / d.count : 0,
    })).sort((a, b) => b.count - a.count);
  }, [safeCustomers, safeOrders]);

  const totalAreas = areaStats.length;
  const totalCust = areaStats.reduce((s, d) => s + d.count, 0);
  const topByCount = areaStats[0];
  const topByRevenue = [...areaStats].sort((a, b) => b.revenue - a.revenue)[0];
  const avgPerArea = totalAreas > 0 ? Math.round(totalCust / totalAreas) : 0;
  const chartData = areaStats.slice(0, 15).map(d => ({ name: d.name.slice(0, 20), value: d.count })).reverse();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng khu vực" value={totalAreas} color="blue" />
        <StatCard label="KV nhiều KH nhất" value={topByCount?.name || '-'} color="green" />
        <StatCard label="KV DT cao nhất" value={topByRevenue?.name || '-'} color="orange" />
        <StatCard label="TB KH/KV" value={avgPerArea} color="purple" />
      </div>
      <Section title="Top 15 khu vực theo số khách hàng">
        {chartData.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" fill="#22c55e" radius={[0, 4, 4, 0]} name="Số KH" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>
      <Section title="Chi tiết theo khu vực">
        {areaStats.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2 pr-2">Khu vực</th><th className="pb-2 pr-2 text-right">Số KH</th><th className="pb-2 pr-2 text-right">Doanh thu</th>
              <th className="pb-2 pr-2 text-right hidden sm:table-cell">TB chi tiêu</th><th className="pb-2 text-right">%</th>
            </tr></thead><tbody>{areaStats.slice(0, 30).map(d => (
              <tr key={d.name} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-2 font-medium truncate max-w-[140px]">{d.name}</td>
                <td className="py-2 pr-2 text-right">{d.count}</td>
                <td className="py-2 pr-2 text-right text-green-700 font-bold">{formatMoney(d.revenue)}</td>
                <td className="py-2 pr-2 text-right text-gray-600 hidden sm:table-cell">{formatMoney(d.avg)}</td>
                <td className="py-2 text-right">{formatPercent(d.count, totalCust)}</td>
              </tr>
            ))}</tbody></table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ===== 8. TẦN SUẤT MUA HÀNG =====
function CustomerFrequency() {
  const { orders } = useData();
  const safeOrders = useMemo(() => orders || [], [orders]);

  const freqStats = useMemo(() => {
    const custOrders = {};
    safeOrders.forEach(o => {
      const key = o.customer_id || o.customer_name;
      if (!key) return;
      if (!custOrders[key]) custOrders[key] = { count: 0, total: 0 };
      custOrders[key].count += 1;
      custOrders[key].total += parseFloat(o.total_amount || 0);
    });

    const groups = [
      { label: '1 lần', min: 1, max: 1 },
      { label: '2-3 lần', min: 2, max: 3 },
      { label: '4-5 lần', min: 4, max: 5 },
      { label: '6-10 lần', min: 6, max: 10 },
      { label: '>10 lần', min: 11, max: Infinity },
    ];

    const entries = Object.values(custOrders);
    const totalCust = entries.length;
    const totalOrders = entries.reduce((s, e) => s + e.count, 0);
    const avgOrders = totalCust > 0 ? (totalOrders / totalCust).toFixed(1) : 0;

    const result = groups.map(g => {
      const matched = entries.filter(e => e.count >= g.min && e.count <= g.max);
      return {
        name: g.label,
        count: matched.length,
        revenue: matched.reduce((s, e) => s + e.total, 0),
        avg: matched.length > 0 ? matched.reduce((s, e) => s + e.total, 0) / matched.length : 0,
      };
    });

    const one = result.find(r => r.name === '1 lần')?.count || 0;
    const two3 = result.find(r => r.name === '2-3 lần')?.count || 0;
    const over5 = entries.filter(e => e.count > 5).length;

    return { groups: result, totalCust, avgOrders, one, two3, over5 };
  }, [safeOrders]);

  const pieData = freqStats.groups.filter(g => g.count > 0).map(g => ({ name: g.name, value: g.count }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Mua 1 lần" value={freqStats.one} color="orange" />
        <StatCard label="Mua 2-3 lần" value={freqStats.two3} color="blue" />
        <StatCard label="Mua >5 lần" value={freqStats.over5} color="green" />
        <StatCard label="TB đơn/KH" value={freqStats.avgOrders} color="purple" />
      </div>
      <Section title="Phân bố tần suất mua hàng">
        {pieData.length === 0 ? <EmptyState /> : (
          <div className="flex flex-col md:flex-row items-center gap-2">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart><Pie data={pieData} cx="50%" cy="50%" outerRadius={90} innerRadius={45} dataKey="value" paddingAngle={2}>
                {pieData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 text-xs w-full md:w-auto min-w-[140px]">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-600 truncate flex-1">{d.name}</span>
                  <span className="font-medium text-gray-800 whitespace-nowrap">{d.value} ({formatPercent(d.value, freqStats.totalCust)})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
      <Section title="Chi tiết tần suất">
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500">
            <th className="pb-2 pr-2">Nhóm tần suất</th><th className="pb-2 pr-2 text-right">Số KH</th><th className="pb-2 pr-2 text-right">%</th>
            <th className="pb-2 pr-2 text-right hidden sm:table-cell">Tổng DT</th><th className="pb-2 text-right hidden sm:table-cell">TB chi tiêu</th>
          </tr></thead><tbody>{freqStats.groups.map(d => (
            <tr key={d.name} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pr-2 font-medium">{d.name}</td>
              <td className="py-2 pr-2 text-right">{d.count}</td>
              <td className="py-2 pr-2 text-right">{formatPercent(d.count, freqStats.totalCust)}</td>
              <td className="py-2 pr-2 text-right text-green-700 font-bold hidden sm:table-cell">{formatMoney(d.revenue)}</td>
              <td className="py-2 text-right text-gray-600 hidden sm:table-cell">{formatMoney(d.avg)}</td>
            </tr>
          ))}</tbody></table>
        </div>
      </Section>
    </div>
  );
}

// ===== 9. TĂNG TRƯỞNG KHÁCH HÀNG =====
function CustomerGrowth() {
  const { customers } = useData();
  const safeCustomers = useMemo(() => customers || [], [customers]);

  const growthData = useMemo(() => {
    const today = getTodayVN();
    const year = parseInt(today.slice(0, 4));
    const month = parseInt(today.slice(5, 7));
    const result = [];
    let cumulative = 0;

    // Count customers before 12-month window
    for (let i = 11; i >= 0; i--) {
      let m = month - i; let y = year;
      while (m <= 0) { m += 12; y--; }
      const prefix = `${y}-${String(m).padStart(2, '0')}`;
      if (i === 11) {
        // Count all customers before this month
        cumulative = safeCustomers.filter(c => {
          const d = (c.created_at || '').slice(0, 7);
          return d && d < prefix;
        }).length;
      }
      const newCount = safeCustomers.filter(c => {
        const d = (c.created_at || '').slice(0, 7);
        return d === prefix;
      }).length;
      cumulative += newCount;
      const prevNew = result.length > 0 ? result[result.length - 1].newCust : newCount;
      const growth = prevNew > 0 ? Math.round(((newCount - prevNew) / prevNew) * 100) : 0;
      result.push({ name: `T${m}/${String(y).slice(2)}`, newCust: newCount, cumulative, growth });
    }
    return result;
  }, [safeCustomers]);

  const totalCust = safeCustomers.length;
  const lastMonth = growthData[growthData.length - 1] || {};
  const prevMonth = growthData[growthData.length - 2] || {};
  const growthRate = prevMonth.newCust > 0 ? Math.round(((lastMonth.newCust - prevMonth.newCust) / prevMonth.newCust) * 100) : 0;
  const avgNew = growthData.length > 0 ? Math.round(growthData.reduce((s, d) => s + d.newCust, 0) / growthData.length) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng KH" value={totalCust.toLocaleString('vi-VN')} color="blue" />
        <StatCard label="KH mới tháng này" value={lastMonth.newCust || 0} color="green" />
        <StatCard label="Tốc độ tăng trưởng" value={`${growthRate >= 0 ? '+' : ''}${growthRate}%`} color={growthRate >= 0 ? 'green' : 'red'} />
        <StatCard label="TB KH mới/tháng" value={avgNew} color="purple" />
      </div>
      <Section title="Khách hàng mới và tích lũy theo tháng">
        {growthData.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={growthData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={35} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={45} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line yAxisId="left" type="monotone" dataKey="newCust" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} name="KH mới" />
              <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Tích lũy" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>
      <Section title="Chi tiết tăng trưởng">
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500">
            <th className="pb-2 pr-2">Tháng</th><th className="pb-2 pr-2 text-right">KH mới</th><th className="pb-2 pr-2 text-right">Tích lũy</th>
            <th className="pb-2 text-right">Tăng trưởng %</th>
          </tr></thead><tbody>{growthData.map(d => (
            <tr key={d.name} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pr-2 font-medium">{d.name}</td>
              <td className="py-2 pr-2 text-right text-green-600 font-bold">{d.newCust}</td>
              <td className="py-2 pr-2 text-right">{d.cumulative.toLocaleString('vi-VN')}</td>
              <td className="py-2 text-right"><span className={d.growth >= 0 ? 'text-green-600' : 'text-red-600'}>{d.growth >= 0 ? '+' : ''}{d.growth}%</span></td>
            </tr>
          ))}</tbody></table>
        </div>
      </Section>
    </div>
  );
}

// ===== REPORT LIST =====
const CUSTOMER_REPORTS = [
  { id: 'customer_summary', name: 'Tổng quan khách hàng', icon: '📊', description: 'KPI khách hàng, tăng trưởng, top KH theo doanh thu', group: 'Tổng quan', popular: true },
  { id: 'customer_top', name: 'Top khách hàng', icon: '🏆', description: 'Xếp hạng khách hàng theo doanh thu và số đơn', group: 'Tổng quan', popular: true },
  { id: 'customer_rfm', name: 'Phân tích RFM', icon: '🎯', description: 'Phân loại khách hàng VIP, Trung thành, Mới, Ngủ đông', group: 'Phân tích' },
  { id: 'customer_retention', name: 'Tỷ lệ giữ chân', icon: '🔒', description: 'Phân tích tỷ lệ khách quay lại mua hàng', group: 'Phân tích' },
  { id: 'customer_lifetime', name: 'Giá trị vòng đời', icon: '💎', description: 'Giá trị trung bình trọn đời khách hàng (CLV)', group: 'Phân tích' },
  { id: 'customer_source', name: 'Nguồn khách hàng', icon: '📡', description: 'Phân bố khách hàng theo nguồn tiếp cận', group: 'Chi tiết' },
  { id: 'customer_area', name: 'Theo khu vực', icon: '📍', description: 'Phân bố khách hàng theo khu vực địa lý', group: 'Chi tiết' },
  { id: 'customer_frequency', name: 'Tần suất mua hàng', icon: '🔄', description: 'Phân tích tần suất mua hàng của khách', group: 'Chi tiết' },
  { id: 'customer_growth', name: 'Tăng trưởng KH', icon: '📈', description: 'Theo dõi tốc độ tăng trưởng khách hàng mới', group: 'Chi tiết' },
];

// ===== MAIN EXPORT: 2-LAYER UI =====
export default function ReportCustomersView() {
  const [selectedReport, setSelectedReport] = useState(null);

  if (!selectedReport) {
    return <ReportGrid reports={CUSTOMER_REPORTS} onSelect={setSelectedReport} title="👥 Báo Cáo Khách Hàng" />;
  }

  const report = CUSTOMER_REPORTS.find(r => r.id === selectedReport);

  const renderReport = () => {
    switch (selectedReport) {
      case 'customer_summary': return <CustomersContent />;
      case 'customer_top': return <CustomerTop />;
      case 'customer_rfm': return <CustomerRFM />;
      case 'customer_retention': return <CustomerRetention />;
      case 'customer_lifetime': return <CustomerLifetime />;
      case 'customer_source': return <CustomerSource />;
      case 'customer_area': return <CustomerArea />;
      case 'customer_frequency': return <CustomerFrequency />;
      case 'customer_growth': return <CustomerGrowth />;
      default: return <ComingSoon />;
    }
  };

  return (
    <ReportDetailWrapper report={report} onBack={() => setSelectedReport(null)}>
      {renderReport()}
    </ReportDetailWrapper>
  );
}

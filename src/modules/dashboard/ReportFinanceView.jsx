import React, { useState, useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, LineChart, Line } from 'recharts';
import { formatMoney } from '../../utils/formatUtils';
import { formatDateVN } from '../../utils/dateUtils';
import { isAdmin } from '../../utils/permissionUtils';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';
import {
  TimeFilter, useTimeFilter, StatCard, Section, ExportButton, PrintButton,
  EmptyState, PIE_COLORS, ChartTooltip, exportToCSV, pctChange,
} from './reportUtils';
import ReportGrid from './ReportGrid';
import ReportDetailWrapper, { ComingSoon } from './ReportDetailWrapper';

// Category mappings for P&L grouping
const EXPENSE_GROUPS = {
  'Hàng hóa': ['Hàng hóa', 'Mua hàng', 'Nhập hàng', 'Chi phí hàng hóa'],
  'Vận hành': ['Vận hành', 'Điện nước', 'Thuê mặt bằng', 'Văn phòng phẩm', 'Vận chuyển', 'Ship', 'Giao hàng'],
  'Nhân sự': ['Nhân sự', 'Lương', 'Thưởng', 'Bảo hiểm', 'BHXH'],
};

function getExpenseGroup(category) {
  if (!category) return 'Khác';
  const cat = category.trim();
  for (const [group, keywords] of Object.entries(EXPENSE_GROUPS)) {
    if (keywords.some(k => cat.toLowerCase().includes(k.toLowerCase()))) {
      return group;
    }
  }
  return 'Khác';
}

// Debt status labels
const DEBT_STATUS_LABELS = {
  'pending': 'Chưa trả',
  'partial': 'Trả một phần',
  'paid': 'Đã trả',
  'overdue': 'Quá hạn',
};

const DEBT_STATUS_COLORS = {
  'pending': 'bg-yellow-100 text-yellow-700',
  'partial': 'bg-blue-100 text-blue-700',
  'paid': 'bg-green-100 text-green-700',
  'overdue': 'bg-red-100 text-red-700',
};

function FinanceContent() {
  const { currentUser, hasPermission } = useApp();
  const { receiptsPayments, debts, orders } = useData();
  const tf = useTimeFilter('month');
  const admin = isAdmin(currentUser);

  // Permission check
  const canView = admin || hasPermission('finance', 2);

  // ===== Filter current & previous period =====
  const currentReceipts = useMemo(() => {
    return tf.filterCurrent(receiptsPayments, 'receipt_date')
      .filter(r => r.status === 'approved');
  }, [receiptsPayments, tf.filterCurrent]);

  const prevReceipts = useMemo(() => {
    return tf.filterPrev(receiptsPayments, 'receipt_date')
      .filter(r => r.status === 'approved');
  }, [receiptsPayments, tf.filterPrev]);

  const currentOrders = useMemo(() => {
    return tf.filterCurrent(orders, 'created_at')
      .filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterCurrent]);

  const prevOrders = useMemo(() => {
    return tf.filterPrev(orders, 'created_at')
      .filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  }, [orders, tf.filterPrev]);

  // ===== 1. KPI Calculations =====
  const kpi = useMemo(() => {
    const thuCurr = currentReceipts.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const chiCurr = currentReceipts.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const profitCurr = thuCurr - chiCurr;

    const thuPrev = prevReceipts.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const chiPrev = prevReceipts.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const profitPrev = thuPrev - chiPrev;

    const totalDebt = (debts || []).reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0);

    return {
      thu: thuCurr, thuPrev,
      chi: chiCurr, chiPrev,
      profit: profitCurr, profitPrev,
      debt: totalDebt,
    };
  }, [currentReceipts, prevReceipts, debts]);

  // ===== 2. P&L Data =====
  const plData = useMemo(() => {
    // Current period
    const salesRevenue = currentOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const thuReceipts = currentReceipts.filter(r => r.type === 'thu');
    const otherRevenue = thuReceipts.reduce((s, r) => s + parseFloat(r.amount || 0), 0) - salesRevenue;
    const totalRevenue = salesRevenue + Math.max(0, otherRevenue);

    const chiReceipts = currentReceipts.filter(r => r.type === 'chi');
    const chiByGroup = { 'Hàng hóa': 0, 'Vận hành': 0, 'Nhân sự': 0, 'Khác': 0 };
    chiReceipts.forEach(r => {
      const group = getExpenseGroup(r.category);
      chiByGroup[group] = (chiByGroup[group] || 0) + parseFloat(r.amount || 0);
    });
    const totalExpense = Object.values(chiByGroup).reduce((s, v) => s + v, 0);
    const grossProfit = totalRevenue - chiByGroup['Hàng hóa'];
    const netProfit = totalRevenue - totalExpense;

    // Previous period
    const prevSalesRevenue = prevOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const prevThuReceipts = prevReceipts.filter(r => r.type === 'thu');
    const prevOtherRevenue = prevThuReceipts.reduce((s, r) => s + parseFloat(r.amount || 0), 0) - prevSalesRevenue;
    const prevTotalRevenue = prevSalesRevenue + Math.max(0, prevOtherRevenue);

    const prevChiReceipts = prevReceipts.filter(r => r.type === 'chi');
    const prevChiByGroup = { 'Hàng hóa': 0, 'Vận hành': 0, 'Nhân sự': 0, 'Khác': 0 };
    prevChiReceipts.forEach(r => {
      const group = getExpenseGroup(r.category);
      prevChiByGroup[group] = (prevChiByGroup[group] || 0) + parseFloat(r.amount || 0);
    });
    const prevTotalExpense = Object.values(prevChiByGroup).reduce((s, v) => s + v, 0);
    const prevGrossProfit = prevTotalRevenue - prevChiByGroup['Hàng hóa'];
    const prevNetProfit = prevTotalRevenue - prevTotalExpense;

    return [
      { label: 'Doanh thu bán hàng', curr: salesRevenue, prev: prevSalesRevenue, isBold: false, isRevenue: true },
      { label: 'Thu khác', curr: Math.max(0, otherRevenue), prev: Math.max(0, prevOtherRevenue), isBold: false, isRevenue: true },
      { label: 'Tổng thu', curr: totalRevenue, prev: prevTotalRevenue, isBold: true, isRevenue: true },
      { label: 'Chi phí hàng hóa', curr: chiByGroup['Hàng hóa'], prev: prevChiByGroup['Hàng hóa'], isBold: false, isExpense: true },
      { label: 'Chi phí vận hành', curr: chiByGroup['Vận hành'], prev: prevChiByGroup['Vận hành'], isBold: false, isExpense: true },
      { label: 'Chi phí nhân sự', curr: chiByGroup['Nhân sự'], prev: prevChiByGroup['Nhân sự'], isBold: false, isExpense: true },
      { label: 'Chi phí khác', curr: chiByGroup['Khác'], prev: prevChiByGroup['Khác'], isBold: false, isExpense: true },
      { label: 'Tổng chi', curr: totalExpense, prev: prevTotalExpense, isBold: true, isExpense: true },
      { label: 'Lợi nhuận gộp', curr: grossProfit, prev: prevGrossProfit, isBold: true, isProfit: true },
      { label: 'Lợi nhuận ròng', curr: netProfit, prev: prevNetProfit, isBold: true, isProfit: true },
    ];
  }, [currentReceipts, prevReceipts, currentOrders, prevOrders]);

  // ===== 3. Cash Flow Over Time =====
  const cashFlowData = useMemo(() => {
    const byDate = {};
    currentReceipts.forEach(r => {
      const date = (r.receipt_date || '').slice(0, 10);
      if (!date) return;
      if (!byDate[date]) byDate[date] = { thu: 0, chi: 0 };
      if (r.type === 'thu') {
        byDate[date].thu += parseFloat(r.amount || 0);
      } else {
        byDate[date].chi += parseFloat(r.amount || 0);
      }
    });

    // Generate all dates in range
    const startDate = new Date(tf.range.start + 'T00:00:00+07:00');
    const endDate = new Date(tf.range.end + 'T00:00:00+07:00');
    const result = [];
    const d = new Date(startDate);
    while (d <= endDate) {
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const shortLabel = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
      const dayData = byDate[key] || { thu: 0, chi: 0 };
      result.push({
        date: key,
        label: shortLabel,
        thu: Math.round(dayData.thu / 1000000 * 10) / 10,
        chi: Math.round(dayData.chi / 1000000 * 10) / 10,
        rawThu: dayData.thu,
        rawChi: dayData.chi,
      });
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [currentReceipts, tf.range.start, tf.range.end]);

  // ===== 4. Expense Structure (Pie) =====
  const expenseByCategory = useMemo(() => {
    const byCategory = {};
    currentReceipts.filter(r => r.type === 'chi').forEach(r => {
      const cat = r.category || 'Khác';
      byCategory[cat] = (byCategory[cat] || 0) + parseFloat(r.amount || 0);
    });
    return Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [currentReceipts]);

  const expenseTotal = useMemo(() => {
    return expenseByCategory.reduce((s, d) => s + d.value, 0);
  }, [expenseByCategory]);

  // ===== 5. Debt Summary =====
  const todayStr = useMemo(() => {
    const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    return vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-' + String(vn.getDate()).padStart(2, '0');
  }, []);

  const debtList = useMemo(() => {
    return (debts || [])
      .filter(d => parseFloat(d.remaining_amount || 0) > 0)
      .map(d => {
        const isOverdue = d.due_date && d.due_date.slice(0, 10) < todayStr && parseFloat(d.remaining_amount || 0) > 0;
        return { ...d, isOverdue };
      })
      .sort((a, b) => {
        // Overdue first, then by remaining_amount desc
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return parseFloat(b.remaining_amount || 0) - parseFloat(a.remaining_amount || 0);
      });
  }, [debts, todayStr]);

  // ===== 6. Monthly Bar Chart (6 months) =====
  const monthlyData = useMemo(() => {
    const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const result = [];
    const allApproved = (receiptsPayments || []).filter(r => r.status === 'approved');

    for (let i = 5; i >= 0; i--) {
      const mDate = new Date(vn);
      mDate.setMonth(mDate.getMonth() - i);
      const year = mDate.getFullYear();
      const month = mDate.getMonth() + 1;
      const monthKey = year + '-' + String(month).padStart(2, '0');
      const monthLabel = 'T' + month + '/' + year;

      let thu = 0;
      let chi = 0;
      allApproved.forEach(r => {
        const rd = (r.receipt_date || '').slice(0, 7);
        if (rd === monthKey) {
          if (r.type === 'thu') {
            thu += parseFloat(r.amount || 0);
          } else {
            chi += parseFloat(r.amount || 0);
          }
        }
      });

      result.push({
        month: monthLabel,
        thu: Math.round(thu / 1000000 * 10) / 10,
        chi: Math.round(chi / 1000000 * 10) / 10,
        rawThu: thu,
        rawChi: chi,
      });
    }
    return result;
  }, [receiptsPayments]);

  // ===== Export handler =====
  const handleExport = () => {
    const exportReceipts = currentReceipts.map((r, i) => ({
      stt: i + 1,
      ...r,
    }));
    const columns = [
      { label: 'STT', accessor: 'stt' },
      { label: 'Loại', accessor: r => r.type === 'thu' ? 'Thu' : 'Chi' },
      { label: 'Danh mục', accessor: r => r.category || 'Khác' },
      { label: 'Số tiền', accessor: r => parseFloat(r.amount || 0) },
      { label: 'Mô tả', accessor: r => r.description || '' },
      { label: 'Ngày', accessor: r => r.receipt_date ? r.receipt_date.slice(0, 10) : '' },
      { label: 'PTTT', accessor: r => r.payment_method || '' },
      { label: 'Trạng thái', accessor: r => r.status || '' },
    ];
    exportToCSV(exportReceipts, columns, `bao-cao-tai-chinh-${tf.range.start}-${tf.range.end}`);
  };

  // ===== Pct change helper =====
  const pctText = (curr, prev) => {
    const pct = pctChange(curr, prev);
    if (pct === 0) return 'Không đổi so với kỳ trước';
    return `${pct > 0 ? '+' : ''}${pct}% so với kỳ trước`;
  };

  // ===== Permission guard =====
  if (!canView) {
    return (
      <div className="p-8 text-center text-gray-500">
        <div className="text-4xl mb-3">🔒</div>
        <div className="font-medium">Bạn không có quyền xem báo cáo tài chính</div>
        <div className="text-sm mt-1">Vui lòng liên hệ Admin để được cấp quyền</div>
      </div>
    );
  }

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
          label="Tổng thu"
          value={formatMoney(kpi.thu)}
          sub={pctText(kpi.thu, kpi.thuPrev)}
          color="green"
        />
        <StatCard
          label="Tổng chi"
          value={formatMoney(kpi.chi)}
          sub={pctText(kpi.chi, kpi.chiPrev)}
          color="red"
        />
        <StatCard
          label={kpi.profit >= 0 ? 'Lợi nhuận (Lãi)' : 'Lợi nhuận (Lỗ)'}
          value={formatMoney(Math.abs(kpi.profit))}
          sub={pctText(kpi.profit, kpi.profitPrev)}
          color="blue"
        />
        <StatCard
          label="Công nợ"
          value={formatMoney(kpi.debt)}
          sub={`${debtList.filter(d => d.isOverdue).length} khoản quá hạn`}
          color="orange"
        />
      </div>

      {/* 2. P&L Table */}
      <Section title="Báo cáo Lãi/Lỗ">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-2 font-medium">Mục</th>
                <th className="pb-2 pr-2 font-medium text-right">Kỳ này</th>
                <th className="pb-2 pr-2 font-medium text-right">Kỳ trước</th>
                <th className="pb-2 font-medium text-right">% Thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {plData.map((row, i) => {
                const pct = pctChange(row.curr, row.prev);
                const isSeparator = row.label === 'Tổng thu' || row.label === 'Tổng chi';
                return (
                  <tr
                    key={i}
                    className={`border-b border-gray-50 ${row.isBold ? 'font-bold' : ''} ${isSeparator ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className={`py-2 pr-2 ${row.isExpense && !row.isBold ? 'pl-4 text-gray-600' : 'text-gray-800'}`}>
                      {row.label}
                    </td>
                    <td className={`py-2 pr-2 text-right ${row.isProfit ? (row.curr >= 0 ? 'text-green-700' : 'text-red-600') : ''}`}>
                      {row.isProfit && row.curr < 0 ? '-' : ''}{formatMoney(Math.abs(row.curr))}
                    </td>
                    <td className={`py-2 pr-2 text-right text-gray-500 ${row.isProfit ? (row.prev >= 0 ? 'text-green-600' : 'text-red-500') : ''}`}>
                      {row.isProfit && row.prev < 0 ? '-' : ''}{formatMoney(Math.abs(row.prev))}
                    </td>
                    <td className={`py-2 text-right ${pct > 0 ? 'text-green-600' : pct < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {pct === 0 ? '-' : `${pct > 0 ? '+' : ''}${pct}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. Cash Flow Area Chart */}
      <Section title="Biến động dòng tiền">
        {cashFlowData.length > 0 && cashFlowData.some(d => d.rawThu > 0 || d.rawChi > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={cashFlowData}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval={cashFlowData.length > 14 ? Math.floor(cashFlowData.length / 7) - 1 : 0}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                width={50}
                tickFormatter={v => `${v}tr`}
              />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="thu"
                stroke="#16a34a"
                fill="#bbf7d0"
                strokeWidth={2}
                name="Thu (triệu)"
              />
              <Area
                type="monotone"
                dataKey="chi"
                stroke="#dc2626"
                fill="#fecaca"
                strokeWidth={2}
                name="Chi (triệu)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu dòng tiền trong kỳ này" />
        )}
      </Section>

      {/* Row: Pie + Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 4. Expense Structure Pie Chart */}
        <Section title="Cơ cấu chi phí">
          {expenseByCategory.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    innerRadius={45}
                    dataKey="value"
                    paddingAngle={2}
                    label={({ name, value }) =>
                      `${name}: ${expenseTotal > 0 ? Math.round(value / expenseTotal * 100) : 0}%`
                    }
                  >
                    {expenseByCategory.map((_entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={value => formatMoney(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
                {expenseByCategory.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="text-gray-600">{d.name}</span>
                    <span className="font-medium">
                      {expenseTotal > 0 ? Math.round(d.value / expenseTotal * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState text="Chưa có dữ liệu chi phí" />
          )}
        </Section>

        {/* 6. Monthly Thu/Chi Bar Chart */}
        <Section title="Thu/Chi 6 tháng gần nhất">
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
                <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
                <Legend />
                <Bar dataKey="thu" fill="#16a34a" name="Thu (triệu)" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="chi" fill="#dc2626" name="Chi (triệu)" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Chưa có dữ liệu" />
          )}
        </Section>
      </div>

      {/* 5. Debt Table */}
      <Section title="Tình hình công nợ">
        {debtList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Đối tác</th>
                  <th className="pb-2 pr-2 font-medium">Loại</th>
                  <th className="pb-2 pr-2 font-medium text-right">Tổng nợ</th>
                  <th className="pb-2 pr-2 font-medium text-right">Đã trả</th>
                  <th className="pb-2 pr-2 font-medium text-right">Còn lại</th>
                  <th className="pb-2 pr-2 font-medium">Hạn trả</th>
                  <th className="pb-2 font-medium text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {debtList.map((d, i) => {
                  const statusLabel = d.isOverdue
                    ? 'Quá hạn'
                    : (DEBT_STATUS_LABELS[d.status] || d.status || 'Chưa trả');
                  const statusColor = d.isOverdue
                    ? DEBT_STATUS_COLORS['overdue']
                    : (DEBT_STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-600');
                  return (
                    <tr
                      key={d.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 ${d.isOverdue ? 'bg-red-50/50' : ''}`}
                    >
                      <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-2 font-medium text-gray-700 max-w-[150px] truncate">
                        {d.contact_name || 'N/A'}
                      </td>
                      <td className="py-2 pr-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          d.type === 'receivable'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {d.type === 'receivable' ? 'Phải thu' : 'Phải trả'}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right">{formatMoney(d.total_amount)}</td>
                      <td className="py-2 pr-2 text-right text-gray-500">{formatMoney(d.paid_amount)}</td>
                      <td className={`py-2 pr-2 text-right font-bold ${d.isOverdue ? 'text-red-600' : 'text-gray-800'}`}>
                        {formatMoney(d.remaining_amount)}
                      </td>
                      <td className={`py-2 pr-2 text-xs whitespace-nowrap ${d.isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        {d.due_date ? formatDateVN(d.due_date) : '-'}
                      </td>
                      <td className="py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Debt summary row */}
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t text-sm">
              <div>
                <span className="text-gray-500">Tổng phải thu: </span>
                <span className="font-bold text-green-700">
                  {formatMoney(
                    (debts || []).filter(d => d.type === 'receivable').reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0)
                  )}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Tổng phải trả: </span>
                <span className="font-bold text-orange-700">
                  {formatMoney(
                    (debts || []).filter(d => d.type === 'payable').reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0)
                  )}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Quá hạn: </span>
                <span className="font-bold text-red-600">
                  {debtList.filter(d => d.isOverdue).length} khoản ({formatMoney(
                    debtList.filter(d => d.isOverdue).reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0)
                  )})
                </span>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState text="Không có công nợ nào" />
        )}
      </Section>
    </div>
  );
}

// ===== CASHFLOW REPORT =====
function CashflowReport() {
  const { currentUser, hasPermission } = useApp();
  const { receiptsPayments } = useData();
  const tf = useTimeFilter('month');
  const canView = isAdmin(currentUser) || hasPermission('finance', 2);

  const data = useMemo(() => {
    const approved = (receiptsPayments || []).filter(r => r.status === 'approved');
    const filtered = tf.filterCurrent(approved, 'receipt_date');
    const byDate = {};
    filtered.forEach(r => {
      const date = (r.receipt_date || '').slice(0, 10);
      if (!date) return;
      if (!byDate[date]) byDate[date] = { thu: 0, chi: 0 };
      if (r.type === 'thu') byDate[date].thu += parseFloat(r.amount || 0);
      else byDate[date].chi += parseFloat(r.amount || 0);
    });

    const startDate = new Date(tf.range.start + 'T00:00:00+07:00');
    const endDate = new Date(tf.range.end + 'T00:00:00+07:00');
    const result = [];
    let cumulative = 0;
    const d = new Date(startDate);
    while (d <= endDate) {
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const label = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
      const day = byDate[key] || { thu: 0, chi: 0 };
      const net = day.thu - day.chi;
      cumulative += net;
      result.push({ date: key, label, thu: day.thu, chi: day.chi, net, cumulative });
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [receiptsPayments, tf.filterCurrent, tf.range.start, tf.range.end]);

  const totals = useMemo(() => {
    const thu = data.reduce((s, d) => s + d.thu, 0);
    const chi = data.reduce((s, d) => s + d.chi, 0);
    const days = data.filter(d => d.thu > 0 || d.chi > 0).length || 1;
    return { thu, chi, net: thu - chi, avgThu: thu / days };
  }, [data]);

  if (!canView) {
    return <div className="p-8 text-center text-gray-500"><div className="text-4xl mb-3">🔒</div><div className="font-medium">Bạn không có quyền xem báo cáo này</div></div>;
  }

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange} customStart={tf.customStart} setCustomStart={tf.setCustomStart} customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng thu" value={formatMoney(totals.thu)} color="green" />
        <StatCard label="Tổng chi" value={formatMoney(totals.chi)} color="red" />
        <StatCard label="Dòng tiền ròng" value={formatMoney(totals.net)} color={totals.net >= 0 ? 'blue' : 'red'} />
        <StatCard label="TB thu/ngày" value={formatMoney(totals.avgThu)} color="green" />
      </div>
      <Section title="Dòng tiền theo ngày">
        {data.some(d => d.thu > 0 || d.chi > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.map(d => ({ ...d, thuM: Math.round(d.thu / 1e6 * 10) / 10, chiM: Math.round(d.chi / 1e6 * 10) / 10 }))}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={data.length > 14 ? Math.floor(data.length / 7) - 1 : 0} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1e6)} />} />
              <Legend />
              <Area type="monotone" dataKey="thuM" stroke="#16a34a" fill="#bbf7d0" strokeWidth={2} name="Thu (triệu)" />
              <Area type="monotone" dataKey="chiM" stroke="#dc2626" fill="#fecaca" strokeWidth={2} name="Chi (triệu)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu dòng tiền" />}
      </Section>
      <Section title="Dòng tiền tích lũy">
        {data.some(d => d.cumulative !== 0) ? (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data.map(d => ({ ...d, cumulM: Math.round(d.cumulative / 1e6 * 10) / 10 }))}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={data.length > 14 ? Math.floor(data.length / 7) - 1 : 0} />
              <YAxis tick={{ fontSize: 11 }} width={55} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1e6)} />} />
              <Area type="monotone" dataKey="cumulM" stroke="#2563eb" fill="#bfdbfe" strokeWidth={2} name="Tích lũy (triệu)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu" />}
      </Section>
      <Section title="Chi tiết dòng tiền">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500">
              <th className="pb-2 pr-2 font-medium">Ngày</th>
              <th className="pb-2 pr-2 font-medium text-right">Thu</th>
              <th className="pb-2 pr-2 font-medium text-right">Chi</th>
              <th className="pb-2 pr-2 font-medium text-right">Ròng</th>
              <th className="pb-2 font-medium text-right">Tích lũy</th>
            </tr></thead>
            <tbody>
              {data.filter(d => d.thu > 0 || d.chi > 0).map(d => (
                <tr key={d.date} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 pr-2 text-gray-600">{d.label}</td>
                  <td className="py-1.5 pr-2 text-right text-green-700">{formatMoney(d.thu)}</td>
                  <td className="py-1.5 pr-2 text-right text-red-600">{formatMoney(d.chi)}</td>
                  <td className={`py-1.5 pr-2 text-right font-medium ${d.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMoney(d.net)}</td>
                  <td className={`py-1.5 text-right ${d.cumulative >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatMoney(d.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ===== EXPENSE STRUCTURE =====
function ExpenseStructure() {
  const { currentUser, hasPermission } = useApp();
  const { receiptsPayments } = useData();
  const tf = useTimeFilter('month');
  const canView = isAdmin(currentUser) || hasPermission('finance', 2);

  const chiReceipts = useMemo(() => {
    return tf.filterCurrent(receiptsPayments, 'receipt_date')
      .filter(r => r.status === 'approved' && r.type === 'chi');
  }, [receiptsPayments, tf.filterCurrent]);

  const { byCategory, byGroup, totalChi } = useMemo(() => {
    const catMap = {};
    const groupMap = {};
    chiReceipts.forEach(r => {
      const cat = r.category || 'Khác';
      const group = getExpenseGroup(cat);
      const amt = parseFloat(r.amount || 0);
      catMap[cat] = (catMap[cat] || { name: cat, group, count: 0, value: 0 });
      catMap[cat].count += 1;
      catMap[cat].value += amt;
      groupMap[group] = (groupMap[group] || 0) + amt;
    });
    const cats = Object.values(catMap).sort((a, b) => b.value - a.value);
    const groups = Object.entries(groupMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const total = cats.reduce((s, c) => s + c.value, 0);
    return { byCategory: cats, byGroup: groups, totalChi: total };
  }, [chiReceipts]);

  const stats = useMemo(() => {
    const topCat = byCategory[0]?.name || '-';
    const days = Math.max(1, Math.ceil((new Date(tf.range.end) - new Date(tf.range.start)) / 86400000) + 1);
    return { topCat, numCats: byCategory.length, avgPerDay: totalChi / days };
  }, [byCategory, totalChi, tf.range.start, tf.range.end]);

  if (!canView) {
    return <div className="p-8 text-center text-gray-500"><div className="text-4xl mb-3">🔒</div><div className="font-medium">Bạn không có quyền xem báo cáo này</div></div>;
  }

  return (
    <div className="space-y-4">
      <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange} customStart={tf.customStart} setCustomStart={tf.setCustomStart} customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng chi" value={formatMoney(totalChi)} color="red" />
        <StatCard label="Chi nhiều nhất" value={stats.topCat} color="orange" />
        <StatCard label="Số danh mục" value={stats.numCats} color="blue" />
        <StatCard label="TB chi/ngày" value={formatMoney(stats.avgPerDay)} color="purple" />
      </div>
      <Section title="Cơ cấu chi phí theo nhóm">
        {byGroup.length > 0 ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={byGroup} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" paddingAngle={2}
                  label={({ name, value }) => `${name}: ${totalChi > 0 ? Math.round(value / totalChi * 100) : 0}%`}>
                  {byGroup.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
              {byGroup.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-600">{d.name}</span>
                  <span className="font-medium">{totalChi > 0 ? Math.round(d.value / totalChi * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu chi phí" />}
      </Section>
      <Section title="Chi tiết theo danh mục">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500">
              <th className="pb-2 pr-2 font-medium">Danh mục</th>
              <th className="pb-2 pr-2 font-medium">Nhóm</th>
              <th className="pb-2 pr-2 font-medium text-right">Số phiếu</th>
              <th className="pb-2 pr-2 font-medium text-right">Tổng chi</th>
              <th className="pb-2 font-medium text-right">% tổng</th>
            </tr></thead>
            <tbody>
              {byCategory.map(c => (
                <tr key={c.name} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 pr-2 font-medium text-gray-700">{c.name}</td>
                  <td className="py-1.5 pr-2 text-gray-500">{c.group}</td>
                  <td className="py-1.5 pr-2 text-right">{c.count}</td>
                  <td className="py-1.5 pr-2 text-right text-red-600">{formatMoney(c.value)}</td>
                  <td className="py-1.5 text-right text-gray-600">{totalChi > 0 ? Math.round(c.value / totalChi * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ===== EXPENSE TREND =====
function ExpenseTrend() {
  const { currentUser, hasPermission } = useApp();
  const { receiptsPayments } = useData();
  const canView = isAdmin(currentUser) || hasPermission('finance', 2);

  const { monthlyData, stats } = useMemo(() => {
    const approved = (receiptsPayments || []).filter(r => r.status === 'approved' && r.type === 'chi');
    const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const result = [];

    for (let i = 11; i >= 0; i--) {
      const mDate = new Date(vn);
      mDate.setMonth(mDate.getMonth() - i);
      const year = mDate.getFullYear();
      const month = mDate.getMonth() + 1;
      const monthKey = year + '-' + String(month).padStart(2, '0');
      const label = 'T' + month + '/' + year;

      const groups = { 'Hàng hóa': 0, 'Vận hành': 0, 'Nhân sự': 0, 'Khác': 0 };
      approved.forEach(r => {
        const rd = (r.receipt_date || '').slice(0, 7);
        if (rd === monthKey) {
          const group = getExpenseGroup(r.category);
          groups[group] += parseFloat(r.amount || 0);
        }
      });
      const total = Object.values(groups).reduce((s, v) => s + v, 0);
      result.push({ month: label, monthKey, ...groups, total });
    }

    const thisMonth = result[result.length - 1]?.total || 0;
    const lastMonth = result[result.length - 2]?.total || 0;
    const pct = pctChange(thisMonth, lastMonth);
    const avg = result.reduce((s, m) => s + m.total, 0) / (result.length || 1);

    return {
      monthlyData: result,
      stats: { thisMonth, lastMonth, pct, avg },
    };
  }, [receiptsPayments]);

  if (!canView) {
    return <div className="p-8 text-center text-gray-500"><div className="text-4xl mb-3">🔒</div><div className="font-medium">Bạn không có quyền xem báo cáo này</div></div>;
  }

  const groupColors = { 'Hàng hóa': '#f59e0b', 'Vận hành': '#3b82f6', 'Nhân sự': '#10b981', 'Khác': '#8b5cf6' };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Chi tháng này" value={formatMoney(stats.thisMonth)} color="red" />
        <StatCard label="Tháng trước" value={formatMoney(stats.lastMonth)} color="orange" />
        <StatCard label="Tăng/giảm" value={`${stats.pct > 0 ? '+' : ''}${stats.pct}%`} color={stats.pct > 0 ? 'red' : 'green'} />
        <StatCard label="TB chi/tháng" value={formatMoney(stats.avg)} color="blue" />
      </div>
      <Section title="Xu hướng chi phí 12 tháng">
        {monthlyData.some(d => d.total > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData.map(d => ({
              ...d,
              'Hàng hóa_M': Math.round(d['Hàng hóa'] / 1e6 * 10) / 10,
              'Vận hành_M': Math.round(d['Vận hành'] / 1e6 * 10) / 10,
              'Nhân sự_M': Math.round(d['Nhân sự'] / 1e6 * 10) / 10,
              'Khác_M': Math.round(d['Khác'] / 1e6 * 10) / 10,
            }))}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1e6)} />} />
              <Legend />
              {Object.entries(groupColors).map(([name, color]) => (
                <Line key={name} type="monotone" dataKey={`${name}_M`} stroke={color} strokeWidth={2} dot={{ r: 3 }} name={name} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu chi phí" />}
      </Section>
      <Section title="Chi tiết theo tháng">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500">
              <th className="pb-2 pr-2 font-medium">Tháng</th>
              <th className="pb-2 pr-2 font-medium text-right">Hàng hóa</th>
              <th className="pb-2 pr-2 font-medium text-right">Vận hành</th>
              <th className="pb-2 pr-2 font-medium text-right">Nhân sự</th>
              <th className="pb-2 pr-2 font-medium text-right">Khác</th>
              <th className="pb-2 font-medium text-right">Tổng</th>
            </tr></thead>
            <tbody>
              {monthlyData.map(d => (
                <tr key={d.monthKey} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 pr-2 text-gray-600">{d.month}</td>
                  <td className="py-1.5 pr-2 text-right">{formatMoney(d['Hàng hóa'])}</td>
                  <td className="py-1.5 pr-2 text-right">{formatMoney(d['Vận hành'])}</td>
                  <td className="py-1.5 pr-2 text-right">{formatMoney(d['Nhân sự'])}</td>
                  <td className="py-1.5 pr-2 text-right">{formatMoney(d['Khác'])}</td>
                  <td className="py-1.5 text-right font-bold text-red-600">{formatMoney(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ===== DEBT SUMMARY =====
function DebtSummary() {
  const { currentUser, hasPermission } = useApp();
  const { debts } = useData();
  const canView = isAdmin(currentUser) || hasPermission('finance', 2);

  const todayStr = useMemo(() => {
    const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    return vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-' + String(vn.getDate()).padStart(2, '0');
  }, []);

  const { debtList, stats, pieData } = useMemo(() => {
    const list = (debts || [])
      .filter(d => parseFloat(d.remaining_amount || 0) > 0)
      .map(d => ({
        ...d,
        isOverdue: d.due_date && d.due_date.slice(0, 10) < todayStr && parseFloat(d.remaining_amount || 0) > 0,
      }))
      .sort((a, b) => parseFloat(b.remaining_amount || 0) - parseFloat(a.remaining_amount || 0));

    const receivable = list.filter(d => d.type === 'receivable').reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0);
    const payable = list.filter(d => d.type === 'payable').reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0);
    const overdue = list.filter(d => d.isOverdue).reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0);

    return {
      debtList: list,
      stats: { receivable, payable, overdue, net: receivable - payable },
      pieData: [
        { name: 'Phải thu', value: receivable },
        { name: 'Phải trả', value: payable },
      ].filter(d => d.value > 0),
    };
  }, [debts, todayStr]);

  if (!canView) {
    return <div className="p-8 text-center text-gray-500"><div className="text-4xl mb-3">🔒</div><div className="font-medium">Bạn không có quyền xem báo cáo này</div></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Phải thu" value={formatMoney(stats.receivable)} color="green" />
        <StatCard label="Phải trả" value={formatMoney(stats.payable)} color="orange" />
        <StatCard label="Quá hạn" value={formatMoney(stats.overdue)} sub={`${debtList.filter(d => d.isOverdue).length} khoản`} color="red" />
        <StatCard label="Ròng (thu-trả)" value={formatMoney(stats.net)} color={stats.net >= 0 ? 'blue' : 'red'} />
      </div>
      <Section title="Tỷ lệ phải thu / phải trả">
        {pieData.length > 0 ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" paddingAngle={3}
                  label={({ name, value }) => `${name}: ${formatMoney(value)}`}>
                  <Cell fill="#16a34a" />
                  <Cell fill="#ea580c" />
                </Pie>
                <Tooltip formatter={v => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState text="Không có công nợ" />}
      </Section>
      <Section title="Danh sách công nợ">
        {debtList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">Đối tác</th>
                <th className="pb-2 pr-2 font-medium">Loại</th>
                <th className="pb-2 pr-2 font-medium text-right">Tổng nợ</th>
                <th className="pb-2 pr-2 font-medium text-right">Đã trả</th>
                <th className="pb-2 pr-2 font-medium text-right">Còn lại</th>
                <th className="pb-2 pr-2 font-medium">Hạn trả</th>
                <th className="pb-2 font-medium text-center">Trạng thái</th>
              </tr></thead>
              <tbody>
                {debtList.map((d, i) => {
                  const statusLabel = d.isOverdue ? 'Quá hạn' : (DEBT_STATUS_LABELS[d.status] || d.status || 'Chưa trả');
                  const statusColor = d.isOverdue ? DEBT_STATUS_COLORS['overdue'] : (DEBT_STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-600');
                  return (
                    <tr key={d.id} className={`border-b border-gray-50 hover:bg-gray-50 ${d.isOverdue ? 'bg-red-50/50' : ''}`}>
                      <td className="py-1.5 pr-2 text-gray-400">{i + 1}</td>
                      <td className="py-1.5 pr-2 font-medium text-gray-700 max-w-[150px] truncate">{d.contact_name || 'N/A'}</td>
                      <td className="py-1.5 pr-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${d.type === 'receivable' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {d.type === 'receivable' ? 'Phải thu' : 'Phải trả'}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right">{formatMoney(d.total_amount)}</td>
                      <td className="py-1.5 pr-2 text-right text-gray-500">{formatMoney(d.paid_amount)}</td>
                      <td className={`py-1.5 pr-2 text-right font-bold ${d.isOverdue ? 'text-red-600' : 'text-gray-800'}`}>{formatMoney(d.remaining_amount)}</td>
                      <td className={`py-1.5 pr-2 text-xs whitespace-nowrap ${d.isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{d.due_date ? formatDateVN(d.due_date) : '-'}</td>
                      <td className="py-1.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}>{statusLabel}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Không có công nợ nào" />}
      </Section>
    </div>
  );
}

// ===== DEBT AGING =====
function DebtAging() {
  const { currentUser, hasPermission } = useApp();
  const { debts } = useData();
  const canView = isAdmin(currentUser) || hasPermission('finance', 2);

  const todayStr = useMemo(() => {
    const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    return vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-' + String(vn.getDate()).padStart(2, '0');
  }, []);

  const { agingData, stats } = useMemo(() => {
    const activeDebts = (debts || []).filter(d => parseFloat(d.remaining_amount || 0) > 0);
    const today = new Date(todayStr + 'T00:00:00+07:00');
    const buckets = [
      { label: '< 30 ngày', min: 0, max: 30, receivable: 0, payable: 0, count: 0 },
      { label: '30-60 ngày', min: 30, max: 60, receivable: 0, payable: 0, count: 0 },
      { label: '60-90 ngày', min: 60, max: 90, receivable: 0, payable: 0, count: 0 },
      { label: '90-180 ngày', min: 90, max: 180, receivable: 0, payable: 0, count: 0 },
      { label: '> 180 ngày', min: 180, max: Infinity, receivable: 0, payable: 0, count: 0 },
    ];

    activeDebts.forEach(d => {
      const created = new Date((d.created_at || d.due_date || todayStr).slice(0, 10) + 'T00:00:00+07:00');
      const days = Math.floor((today - created) / 86400000);
      const amt = parseFloat(d.remaining_amount || 0);
      const bucket = buckets.find(b => days >= b.min && days < b.max) || buckets[buckets.length - 1];
      bucket.count += 1;
      if (d.type === 'receivable') bucket.receivable += amt;
      else bucket.payable += amt;
    });

    const data = buckets.map(b => ({ ...b, total: b.receivable + b.payable }));
    const totalAll = data.reduce((s, b) => s + b.total, 0);
    const dataWithPct = data.map(b => ({ ...b, pct: totalAll > 0 ? Math.round(b.total / totalAll * 100) : 0 }));

    const under30 = data[0].total;
    const r30to90 = data[1].total + data[2].total;
    const over90 = data[3].total + data[4].total;
    const totalOverdue = activeDebts.filter(d => d.due_date && d.due_date.slice(0, 10) < todayStr).reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0);

    return {
      agingData: dataWithPct,
      stats: { under30, r30to90, over90, totalOverdue },
    };
  }, [debts, todayStr]);

  if (!canView) {
    return <div className="p-8 text-center text-gray-500"><div className="text-4xl mb-3">🔒</div><div className="font-medium">Bạn không có quyền xem báo cáo này</div></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="< 30 ngày" value={formatMoney(stats.under30)} color="green" />
        <StatCard label="30-90 ngày" value={formatMoney(stats.r30to90)} color="orange" />
        <StatCard label="> 90 ngày" value={formatMoney(stats.over90)} color="red" />
        <StatCard label="Tổng quá hạn" value={formatMoney(stats.totalOverdue)} color="red" />
      </div>
      <Section title="Phân tích tuổi nợ">
        {agingData.some(d => d.total > 0) ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={agingData.map(d => ({
              ...d,
              receivableM: Math.round(d.receivable / 1e6 * 10) / 10,
              payableM: Math.round(d.payable / 1e6 * 10) / 10,
            }))}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1e6)} />} />
              <Legend />
              <Bar dataKey="receivableM" fill="#16a34a" name="Phải thu (triệu)" radius={[4, 4, 0, 0]} barSize={25} />
              <Bar dataKey="payableM" fill="#ea580c" name="Phải trả (triệu)" radius={[4, 4, 0, 0]} barSize={25} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Không có dữ liệu công nợ" />}
      </Section>
      <Section title="Chi tiết tuổi nợ">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500">
              <th className="pb-2 pr-2 font-medium">Nhóm tuổi nợ</th>
              <th className="pb-2 pr-2 font-medium text-right">Số khoản</th>
              <th className="pb-2 pr-2 font-medium text-right">Phải thu</th>
              <th className="pb-2 pr-2 font-medium text-right">Phải trả</th>
              <th className="pb-2 pr-2 font-medium text-right">Tổng</th>
              <th className="pb-2 font-medium text-right">%</th>
            </tr></thead>
            <tbody>
              {agingData.map(d => (
                <tr key={d.label} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 pr-2 font-medium text-gray-700">{d.label}</td>
                  <td className="py-1.5 pr-2 text-right">{d.count}</td>
                  <td className="py-1.5 pr-2 text-right text-green-700">{formatMoney(d.receivable)}</td>
                  <td className="py-1.5 pr-2 text-right text-orange-600">{formatMoney(d.payable)}</td>
                  <td className="py-1.5 pr-2 text-right font-bold">{formatMoney(d.total)}</td>
                  <td className="py-1.5 text-right text-gray-600">{d.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ===== DEBT BY CUSTOMER =====
function DebtCustomer() {
  const { currentUser, hasPermission } = useApp();
  const { debts } = useData();
  const canView = isAdmin(currentUser) || hasPermission('finance', 2);

  const todayStr = useMemo(() => {
    const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    return vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-' + String(vn.getDate()).padStart(2, '0');
  }, []);

  const { byCustomer, stats } = useMemo(() => {
    const activeDebts = (debts || []).filter(d => parseFloat(d.remaining_amount || 0) > 0);
    const map = {};
    activeDebts.forEach(d => {
      const name = d.contact_name || 'Không rõ';
      if (!map[name]) map[name] = { name, type: d.type, total: 0, paid: 0, remaining: 0, overdue: 0 };
      map[name].total += parseFloat(d.total_amount || 0);
      map[name].paid += parseFloat(d.paid_amount || 0);
      map[name].remaining += parseFloat(d.remaining_amount || 0);
      if (d.due_date && d.due_date.slice(0, 10) < todayStr) {
        map[name].overdue += parseFloat(d.remaining_amount || 0);
      }
    });
    const list = Object.values(map).sort((a, b) => b.remaining - a.remaining);

    const totalPartners = list.length;
    const highest = list[0]?.remaining || 0;
    const avg = totalPartners > 0 ? list.reduce((s, c) => s + c.remaining, 0) / totalPartners : 0;
    const topOverdue = list.reduce((max, c) => c.overdue > max.overdue ? c : max, { overdue: 0, name: '-' });

    return {
      byCustomer: list,
      stats: { totalPartners, highest, avg, topOverdueName: topOverdue.name, topOverdueAmt: topOverdue.overdue },
    };
  }, [debts, todayStr]);

  if (!canView) {
    return <div className="p-8 text-center text-gray-500"><div className="text-4xl mb-3">🔒</div><div className="font-medium">Bạn không có quyền xem báo cáo này</div></div>;
  }

  const chartData = byCustomer.slice(0, 15).map(c => ({
    name: c.name.length > 20 ? c.name.slice(0, 18) + '...' : c.name,
    value: Math.round(c.remaining / 1e6 * 10) / 10,
    rawValue: c.remaining,
  })).reverse();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng đối tác" value={stats.totalPartners} color="blue" />
        <StatCard label="Nợ cao nhất" value={formatMoney(stats.highest)} color="red" />
        <StatCard label="TB nợ/đối tác" value={formatMoney(stats.avg)} color="orange" />
        <StatCard label="Quá hạn nhiều nhất" value={stats.topOverdueName} sub={formatMoney(stats.topOverdueAmt)} color="red" />
      </div>
      <Section title="Top 15 đối tác nợ nhiều nhất">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 30)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}tr`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1e6)} />} />
              <Bar dataKey="value" fill="#3b82f6" name="Còn nợ (triệu)" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Không có dữ liệu" />}
      </Section>
      <Section title="Chi tiết công nợ theo đối tác">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500">
              <th className="pb-2 pr-2 font-medium">#</th>
              <th className="pb-2 pr-2 font-medium">Đối tác</th>
              <th className="pb-2 pr-2 font-medium">Loại</th>
              <th className="pb-2 pr-2 font-medium text-right">Tổng nợ</th>
              <th className="pb-2 pr-2 font-medium text-right">Đã trả</th>
              <th className="pb-2 pr-2 font-medium text-right">Còn lại</th>
              <th className="pb-2 font-medium text-right">Quá hạn</th>
            </tr></thead>
            <tbody>
              {byCustomer.map((c, i) => (
                <tr key={c.name} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 pr-2 text-gray-400">{i + 1}</td>
                  <td className="py-1.5 pr-2 font-medium text-gray-700 max-w-[150px] truncate">{c.name}</td>
                  <td className="py-1.5 pr-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${c.type === 'receivable' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {c.type === 'receivable' ? 'Phải thu' : 'Phải trả'}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-right">{formatMoney(c.total)}</td>
                  <td className="py-1.5 pr-2 text-right text-gray-500">{formatMoney(c.paid)}</td>
                  <td className="py-1.5 pr-2 text-right font-bold text-gray-800">{formatMoney(c.remaining)}</td>
                  <td className={`py-1.5 text-right ${c.overdue > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{c.overdue > 0 ? formatMoney(c.overdue) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ===== REPORT LIST =====
const FINANCE_REPORTS = [
  { id: 'pnl', name: 'Báo cáo Lãi/Lỗ', icon: '📊', description: 'Tổng hợp thu chi, lợi nhuận gộp và ròng', group: 'Báo cáo chính', popular: true },
  { id: 'cashflow', name: 'Dòng tiền', icon: '💵', description: 'Biến động dòng tiền thu chi theo ngày', group: 'Báo cáo chính', popular: true },
  { id: 'expense_structure', name: 'Cơ cấu chi phí', icon: '🥧', description: 'Phân tích cơ cấu chi phí theo danh mục', group: 'Chi phí' },
  { id: 'expense_trend', name: 'Xu hướng chi phí', icon: '📉', description: 'Theo dõi xu hướng chi phí qua các kỳ', group: 'Chi phí' },
  { id: 'debt_summary', name: 'Tổng quan công nợ', icon: '📋', description: 'Tình hình công nợ phải thu và phải trả', group: 'Công nợ' },
  { id: 'debt_aging', name: 'Tuổi nợ', icon: '⏰', description: 'Phân tích công nợ theo thời gian', group: 'Công nợ' },
  { id: 'debt_customer', name: 'Công nợ theo KH', icon: '👤', description: 'Chi tiết công nợ từng khách hàng/đối tác', group: 'Công nợ' },
];

// ===== MAIN EXPORT: 2-LAYER UI =====
export default function ReportFinanceView() {
  const [selectedReport, setSelectedReport] = useState(null);

  if (!selectedReport) {
    return <ReportGrid reports={FINANCE_REPORTS} onSelect={setSelectedReport} title="💰 Báo Cáo Tài Chính" />;
  }

  const report = FINANCE_REPORTS.find(r => r.id === selectedReport);

  const renderReport = () => {
    switch (selectedReport) {
      case 'pnl': return <FinanceContent />;
      case 'cashflow': return <CashflowReport />;
      case 'expense_structure': return <ExpenseStructure />;
      case 'expense_trend': return <ExpenseTrend />;
      case 'debt_summary': return <DebtSummary />;
      case 'debt_aging': return <DebtAging />;
      case 'debt_customer': return <DebtCustomer />;
      default: return <ComingSoon />;
    }
  };

  return (
    <ReportDetailWrapper report={report} onBack={() => setSelectedReport(null)}>
      {renderReport()}
    </ReportDetailWrapper>
  );
}

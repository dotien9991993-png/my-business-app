import React, { useState, useMemo, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatMoney } from '../../utils/formatUtils';
import { getVietnamDate } from '../../utils/dateUtils';
import { isAdmin } from '../../utils/permissionUtils';

const PERIOD_PRESETS = [
  { id: 'month', label: 'Tháng này' },
  { id: 'lastMonth', label: 'Tháng trước' },
  { id: 'quarter', label: 'Quý này' },
  { id: 'lastQuarter', label: 'Quý trước' },
  { id: 'year', label: 'Năm nay' },
  { id: 'custom', label: 'Tùy chọn' },
];

function getDateRange(preset) {
  const vn = getVietnamDate();
  const y = vn.getFullYear();
  const m = vn.getMonth();
  const pad = (n) => String(n).padStart(2, '0');

  switch (preset) {
    case 'month': {
      const from = `${y}-${pad(m + 1)}-01`;
      const to = new Date(y, m + 1, 0);
      return { from, to: `${y}-${pad(m + 1)}-${pad(to.getDate())}` };
    }
    case 'lastMonth': {
      const d = new Date(y, m - 1, 1);
      const ly = d.getFullYear(), lm = d.getMonth();
      const last = new Date(ly, lm + 1, 0);
      return { from: `${ly}-${pad(lm + 1)}-01`, to: `${ly}-${pad(lm + 1)}-${pad(last.getDate())}` };
    }
    case 'quarter': {
      const qStart = Math.floor(m / 3) * 3;
      const from = `${y}-${pad(qStart + 1)}-01`;
      const qEnd = new Date(y, qStart + 3, 0);
      return { from, to: `${y}-${pad(qStart + 3)}-${pad(qEnd.getDate())}` };
    }
    case 'lastQuarter': {
      let qStart = Math.floor(m / 3) * 3 - 3;
      let qy = y;
      if (qStart < 0) { qStart += 12; qy--; }
      const from = `${qy}-${pad(qStart + 1)}-01`;
      const qEnd = new Date(qy, qStart + 3, 0);
      return { from, to: `${qy}-${pad(qStart + 3)}-${pad(qEnd.getDate())}` };
    }
    case 'year': {
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    default:
      return { from: '', to: '' };
  }
}

// Helper: lấy khoảng thời gian so sánh (kỳ trước)
function getPrevDateRange(preset, customFrom, customTo) {
  const vn = getVietnamDate();
  const y = vn.getFullYear();
  const m = vn.getMonth();
  const pad = (n) => String(n).padStart(2, '0');

  switch (preset) {
    case 'month': {
      // So với tháng trước
      const d = new Date(y, m - 1, 1);
      const ly = d.getFullYear(), lm = d.getMonth();
      const last = new Date(ly, lm + 1, 0);
      return { from: `${ly}-${pad(lm + 1)}-01`, to: `${ly}-${pad(lm + 1)}-${pad(last.getDate())}`, label: `T${lm + 1}/${ly}` };
    }
    case 'lastMonth': {
      const d = new Date(y, m - 2, 1);
      const ly = d.getFullYear(), lm = d.getMonth();
      const last = new Date(ly, lm + 1, 0);
      return { from: `${ly}-${pad(lm + 1)}-01`, to: `${ly}-${pad(lm + 1)}-${pad(last.getDate())}`, label: `T${lm + 1}/${ly}` };
    }
    case 'quarter': {
      let qStart = Math.floor(m / 3) * 3 - 3;
      let qy = y;
      if (qStart < 0) { qStart += 12; qy--; }
      const from = `${qy}-${pad(qStart + 1)}-01`;
      const qEnd = new Date(qy, qStart + 3, 0);
      return { from, to: `${qy}-${pad(qStart + 3)}-${pad(qEnd.getDate())}`, label: `Q${Math.floor(qStart / 3) + 1}/${qy}` };
    }
    case 'lastQuarter': {
      let qStart = Math.floor(m / 3) * 3 - 6;
      let qy = y;
      if (qStart < 0) { qStart += 12; qy--; }
      const from = `${qy}-${pad(qStart + 1)}-01`;
      const qEnd = new Date(qy, qStart + 3, 0);
      return { from, to: `${qy}-${pad(qStart + 3)}-${pad(qEnd.getDate())}`, label: `Q${Math.floor(qStart / 3) + 1}/${qy}` };
    }
    case 'year': {
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: `${y - 1}` };
    }
    case 'custom': {
      // Custom: tính khoảng cách ngày, lùi lại tương ứng
      if (!customFrom || !customTo) return null;
      const f = new Date(customFrom);
      const t = new Date(customTo);
      const diff = t - f;
      const prevTo = new Date(f.getTime() - 1); // 1 ngày trước from
      const prevFrom = new Date(prevTo.getTime() - diff);
      const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return { from: fmt(prevFrom), to: fmt(prevTo), label: `${fmt(prevFrom)} → ${fmt(prevTo)}` };
    }
    default:
      return null;
  }
}

const PctBadge = ({ value }) => {
  if (value === 0) return <span className="text-gray-400">—</span>;
  return (
    <span className={`text-xs font-medium ${value > 0 ? 'text-green-600' : 'text-red-500'}`}>
      {value > 0 ? '+' : ''}{value}%
    </span>
  );
};

const ChiPctBadge = ({ value }) => {
  if (value === 0) return <span className="text-gray-400">—</span>;
  return (
    <span className={`text-xs font-medium ${value < 0 ? 'text-green-600' : 'text-red-500'}`}>
      {value > 0 ? '+' : ''}{value}%
    </span>
  );
};

const ReportsCustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.dataKey === 'thu' ? 'Thu' : p.dataKey === 'chi' ? 'Chi' : 'Lãi'}: {p.value}M
        </div>
      ))}
    </div>
  );
};

export default function ReportsView({ currentUser, receiptsPayments, debts, salaries, getPermissionLevel }) {
  const financeLevel = getPermissionLevel('finance');
  const canViewAll = financeLevel >= 2 || isAdmin(currentUser);

  const visibleReceipts = canViewAll
    ? receiptsPayments
    : receiptsPayments.filter(r => r.created_by === currentUser.name);

  const [periodPreset, setPeriodPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const dateRange = useMemo(() => {
    if (periodPreset === 'custom') return { from: customFrom, to: customTo };
    return getDateRange(periodPreset);
  }, [periodPreset, customFrom, customTo]);

  const prevRange = useMemo(() => {
    return getPrevDateRange(periodPreset, customFrom, customTo);
  }, [periodPreset, customFrom, customTo]);

  // Filter receipts by date range (approved only)
  const filterByRange = useCallback((range) => {
    if (!range || !range.from || !range.to) return [];
    return visibleReceipts.filter(r => {
      if (r.status !== 'approved') return false;
      const d = r.receipt_date || '';
      return d >= range.from && d <= range.to;
    });
  }, [visibleReceipts]);

  const currentReceipts = useMemo(() => filterByRange(dateRange), [filterByRange, dateRange]);
  const prevReceipts = useMemo(() => prevRange ? filterByRange(prevRange) : [], [filterByRange, prevRange]);

  // P&L bảng chi tiết theo danh mục
  const plData = useMemo(() => {
    const calcCategory = (receipts) => {
      const thuMap = {};
      const chiMap = {};
      receipts.forEach(r => {
        const cat = r.category || 'Khác';
        const amt = parseFloat(r.amount || 0);
        if (r.type === 'thu') thuMap[cat] = (thuMap[cat] || 0) + amt;
        else chiMap[cat] = (chiMap[cat] || 0) + amt;
      });
      return { thuMap, chiMap };
    };

    const curr = calcCategory(currentReceipts);
    const prev = calcCategory(prevReceipts);

    // Merge all category names
    const allThuCats = [...new Set([...Object.keys(curr.thuMap), ...Object.keys(prev.thuMap)])];
    const allChiCats = [...new Set([...Object.keys(curr.chiMap), ...Object.keys(prev.chiMap)])];

    // Sort by current value descending
    allThuCats.sort((a, b) => (curr.thuMap[b] || 0) - (curr.thuMap[a] || 0));
    allChiCats.sort((a, b) => (curr.chiMap[b] || 0) - (curr.chiMap[a] || 0));

    const thuRows = allThuCats.map(cat => ({
      category: cat,
      current: curr.thuMap[cat] || 0,
      previous: prev.thuMap[cat] || 0,
    }));

    const chiRows = allChiCats.map(cat => ({
      category: cat,
      current: curr.chiMap[cat] || 0,
      previous: prev.chiMap[cat] || 0,
    }));

    const totalThuCurr = thuRows.reduce((s, r) => s + r.current, 0);
    const totalThuPrev = thuRows.reduce((s, r) => s + r.previous, 0);
    const totalChiCurr = chiRows.reduce((s, r) => s + r.current, 0);
    const totalChiPrev = chiRows.reduce((s, r) => s + r.previous, 0);

    return {
      thuRows, chiRows,
      totalThuCurr, totalThuPrev,
      totalChiCurr, totalChiPrev,
      profitCurr: totalThuCurr - totalChiCurr,
      profitPrev: totalThuPrev - totalChiPrev,
    };
  }, [currentReceipts, prevReceipts]);

  // Trend chart data: theo tháng trong khoảng thời gian
  const trendData = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return [];
    // Lấy tất cả approved receipts trong 12 tháng gần nhất (cho dạng year) hoặc kỳ hiện tại
    const startDate = new Date(dateRange.from);
    const endDate = new Date(dateRange.to);

    // Tạo list tháng
    const months = [];
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endM = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (d <= endM) {
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `T${d.getMonth() + 1}/${d.getFullYear() % 100}`,
      });
      d.setMonth(d.getMonth() + 1);
    }

    return months.map(m => {
      const monthReceipts = currentReceipts.filter(r => (r.receipt_date || '').startsWith(m.key));
      const thu = monthReceipts.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
      const chi = monthReceipts.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
      return {
        name: m.label,
        thu: Math.round(thu / 1000000 * 10) / 10,
        chi: Math.round(chi / 1000000 * 10) / 10,
        profit: Math.round((thu - chi) / 1000000 * 10) / 10,
      };
    });
  }, [dateRange, currentReceipts]);

  // Debt summary
  const debtSummary = useMemo(() => {
    if (!debts) return null;
    const now = new Date();
    const active = debts.filter(d => d.status !== 'paid');
    const receivable = active.filter(d => d.type === 'receivable');
    const payable = active.filter(d => d.type === 'payable');
    return {
      receivableTotal: receivable.reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0),
      receivableCount: receivable.length,
      payableTotal: payable.reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0),
      payableCount: payable.length,
      overdueCount: active.filter(d => d.due_date && new Date(d.due_date) < now).length,
    };
  }, [debts]);

  // Salary summary (admin only)
  const salarySummary = useMemo(() => {
    if (!salaries || !canViewAll) return null;
    const vn = getVietnamDate();
    const monthKey = `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthSalaries = salaries.filter(s => (s.month || '').startsWith(monthKey));
    return {
      total: thisMonthSalaries.reduce((s, r) => s + parseFloat(r.total_salary || 0), 0),
      paid: thisMonthSalaries.filter(s => s.status === 'paid').reduce((s, r) => s + parseFloat(r.total_salary || 0), 0),
      count: thisMonthSalaries.length,
      paidCount: thisMonthSalaries.filter(s => s.status === 'paid').length,
    };
  }, [salaries, canViewAll]);

  // Pct change helper
  const pctChange = (curr, prev) => {
    if (prev === 0) return curr > 0 ? 100 : (curr < 0 ? -100 : 0);
    return Math.round(((curr - prev) / Math.abs(prev)) * 100);
  };

  // Period label
  const periodLabel = useMemo(() => {
    if (periodPreset === 'custom') {
      return customFrom && customTo ? `${customFrom} → ${customTo}` : 'Chọn khoảng';
    }
    return PERIOD_PRESETS.find(p => p.id === periodPreset)?.label || '';
  }, [periodPreset, customFrom, customTo]);

  // Export CSV
  const exportCSV = useCallback(() => {
    const rows = [];
    rows.push(['BÁO CÁO TÀI CHÍNH', periodLabel]);
    rows.push([]);

    // P&L
    rows.push(['DOANH THU', 'Kỳ hiện tại', 'Kỳ trước', 'Thay đổi (%)']);
    plData.thuRows.forEach(r => {
      const pct = pctChange(r.current, r.previous);
      rows.push([r.category, r.current, r.previous, `${pct}%`]);
    });
    rows.push(['TỔNG DOANH THU', plData.totalThuCurr, plData.totalThuPrev, `${pctChange(plData.totalThuCurr, plData.totalThuPrev)}%`]);
    rows.push([]);

    rows.push(['CHI PHÍ', 'Kỳ hiện tại', 'Kỳ trước', 'Thay đổi (%)']);
    plData.chiRows.forEach(r => {
      const pct = pctChange(r.current, r.previous);
      rows.push([r.category, r.current, r.previous, `${pct}%`]);
    });
    rows.push(['TỔNG CHI PHÍ', plData.totalChiCurr, plData.totalChiPrev, `${pctChange(plData.totalChiCurr, plData.totalChiPrev)}%`]);
    rows.push([]);

    rows.push(['LỢI NHUẬN', plData.profitCurr, plData.profitPrev, `${pctChange(plData.profitCurr, plData.profitPrev)}%`]);
    const margin = plData.totalThuCurr > 0 ? ((plData.profitCurr / plData.totalThuCurr) * 100).toFixed(1) : '0';
    rows.push(['TỶ SUẤT LỢI NHUẬN', `${margin}%`]);

    // Build CSV string
    const csvContent = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-tai-chinh-${dateRange.from || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [plData, dateRange, periodLabel]);

  // Print
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-6 print:p-2 print:space-y-3">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <h2 className="text-xl md:text-2xl font-bold">📈 Báo Cáo Tài Chính</h2>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium"
          >
            📥 Xuất CSV
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg font-medium"
          >
            🖨️ In
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="bg-white rounded-xl border shadow-sm p-3 md:p-4 print:hidden">
        <div className="flex flex-wrap gap-2 mb-3">
          {PERIOD_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriodPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                periodPreset === p.id
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodPreset === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm" />
            <span className="text-gray-400">→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm" />
          </div>
        )}
        {!canViewAll && (
          <div className="mt-2 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded inline-block">Dữ liệu của bạn</div>
        )}
      </div>

      {/* Print header */}
      <div className="hidden print:block text-center mb-4">
        <div className="text-sm text-gray-500">Kỳ báo cáo: {periodLabel}</div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-green-50 p-3 rounded-xl border border-green-200">
          <div className="text-xs text-green-600 font-medium mb-1">Doanh Thu</div>
          <div className="text-lg font-bold text-green-700">{formatMoney(plData.totalThuCurr)}</div>
          {prevRange && (
            <div className="text-xs text-gray-500 mt-1">
              vs kỳ trước <PctBadge value={pctChange(plData.totalThuCurr, plData.totalThuPrev)} />
            </div>
          )}
        </div>
        <div className="bg-red-50 p-3 rounded-xl border border-red-200">
          <div className="text-xs text-red-600 font-medium mb-1">Chi Phí</div>
          <div className="text-lg font-bold text-red-700">{formatMoney(plData.totalChiCurr)}</div>
          {prevRange && (
            <div className="text-xs text-gray-500 mt-1">
              vs kỳ trước <ChiPctBadge value={pctChange(plData.totalChiCurr, plData.totalChiPrev)} />
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl border ${plData.profitCurr >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className={`text-xs font-medium mb-1 ${plData.profitCurr >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
            {plData.profitCurr >= 0 ? 'Lợi Nhuận' : 'Lỗ'}
          </div>
          <div className={`text-lg font-bold ${plData.profitCurr >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            {formatMoney(Math.abs(plData.profitCurr))}
          </div>
          {prevRange && (
            <div className="text-xs text-gray-500 mt-1">
              vs kỳ trước <PctBadge value={pctChange(plData.profitCurr, plData.profitPrev)} />
            </div>
          )}
        </div>
        <div className="bg-purple-50 p-3 rounded-xl border border-purple-200">
          <div className="text-xs text-purple-600 font-medium mb-1">Tỷ Suất LN</div>
          <div className="text-lg font-bold text-purple-700">
            {plData.totalThuCurr > 0 ? ((plData.profitCurr / plData.totalThuCurr) * 100).toFixed(1) : '0'}%
          </div>
          {prevRange && plData.totalThuPrev > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              Kỳ trước: {((plData.profitPrev / plData.totalThuPrev) * 100).toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      {/* P&L Detail Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-bold text-sm md:text-base">Báo Cáo Lãi/Lỗ Chi Tiết (P&L)</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-3 font-medium text-gray-600">Hạng mục</th>
                <th className="text-right p-3 font-medium text-gray-600">Kỳ hiện tại</th>
                {prevRange && <th className="text-right p-3 font-medium text-gray-600">Kỳ trước</th>}
                {prevRange && <th className="text-right p-3 font-medium text-gray-600">Thay đổi</th>}
              </tr>
            </thead>
            <tbody>
              {/* DOANH THU */}
              <tr className="bg-green-50/50">
                <td colSpan={prevRange ? 4 : 2} className="p-3 font-bold text-green-700">DOANH THU</td>
              </tr>
              {plData.thuRows.length > 0 ? plData.thuRows.map(r => (
                <tr key={`thu-${r.category}`} className="border-t hover:bg-gray-50">
                  <td className="p-3 pl-6 text-gray-700">{r.category}</td>
                  <td className="p-3 text-right font-medium text-green-600">{formatMoney(r.current)}</td>
                  {prevRange && <td className="p-3 text-right text-gray-500">{formatMoney(r.previous)}</td>}
                  {prevRange && <td className="p-3 text-right"><PctBadge value={pctChange(r.current, r.previous)} /></td>}
                </tr>
              )) : (
                <tr className="border-t"><td colSpan={prevRange ? 4 : 2} className="p-3 pl-6 text-gray-400 italic">Chưa có doanh thu</td></tr>
              )}
              <tr className="border-t bg-green-50 font-bold">
                <td className="p-3 text-green-800">Tổng Doanh Thu</td>
                <td className="p-3 text-right text-green-700">{formatMoney(plData.totalThuCurr)}</td>
                {prevRange && <td className="p-3 text-right text-gray-600">{formatMoney(plData.totalThuPrev)}</td>}
                {prevRange && <td className="p-3 text-right"><PctBadge value={pctChange(plData.totalThuCurr, plData.totalThuPrev)} /></td>}
              </tr>

              {/* CHI PHÍ */}
              <tr className="bg-red-50/50">
                <td colSpan={prevRange ? 4 : 2} className="p-3 font-bold text-red-700 pt-4">CHI PHÍ</td>
              </tr>
              {plData.chiRows.length > 0 ? plData.chiRows.map(r => (
                <tr key={`chi-${r.category}`} className="border-t hover:bg-gray-50">
                  <td className="p-3 pl-6 text-gray-700">{r.category}</td>
                  <td className="p-3 text-right font-medium text-red-600">{formatMoney(r.current)}</td>
                  {prevRange && <td className="p-3 text-right text-gray-500">{formatMoney(r.previous)}</td>}
                  {prevRange && <td className="p-3 text-right"><ChiPctBadge value={pctChange(r.current, r.previous)} /></td>}
                </tr>
              )) : (
                <tr className="border-t"><td colSpan={prevRange ? 4 : 2} className="p-3 pl-6 text-gray-400 italic">Chưa có chi phí</td></tr>
              )}
              <tr className="border-t bg-red-50 font-bold">
                <td className="p-3 text-red-800">Tổng Chi Phí</td>
                <td className="p-3 text-right text-red-700">{formatMoney(plData.totalChiCurr)}</td>
                {prevRange && <td className="p-3 text-right text-gray-600">{formatMoney(plData.totalChiPrev)}</td>}
                {prevRange && <td className="p-3 text-right"><ChiPctBadge value={pctChange(plData.totalChiCurr, plData.totalChiPrev)} /></td>}
              </tr>

              {/* LỢI NHUẬN */}
              <tr className={`border-t-2 font-bold text-base ${plData.profitCurr >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                <td className={`p-3 ${plData.profitCurr >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>
                  {plData.profitCurr >= 0 ? 'LỢI NHUẬN' : 'LỖ'}
                </td>
                <td className={`p-3 text-right ${plData.profitCurr >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                  {formatMoney(Math.abs(plData.profitCurr))}
                </td>
                {prevRange && (
                  <td className="p-3 text-right text-gray-600">{formatMoney(Math.abs(plData.profitPrev))}</td>
                )}
                {prevRange && (
                  <td className="p-3 text-right"><PctBadge value={pctChange(plData.profitCurr, plData.profitPrev)} /></td>
                )}
              </tr>

              {/* TỶ SUẤT */}
              <tr className="border-t bg-purple-50/50">
                <td className="p-3 font-medium text-purple-700">Tỷ Suất Lợi Nhuận</td>
                <td className="p-3 text-right font-bold text-purple-700">
                  {plData.totalThuCurr > 0 ? ((plData.profitCurr / plData.totalThuCurr) * 100).toFixed(1) : '0'}%
                </td>
                {prevRange && (
                  <td className="p-3 text-right text-gray-500">
                    {plData.totalThuPrev > 0 ? ((plData.profitPrev / plData.totalThuPrev) * 100).toFixed(1) : '0'}%
                  </td>
                )}
                {prevRange && <td className="p-3"></td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend Chart */}
      {trendData.length > 1 && (
        <div className="bg-white rounded-xl border shadow-sm p-4 md:p-5 print:break-before-page">
          <h3 className="font-bold text-sm md:text-base mb-4">Xu hướng Thu/Chi/Lãi (triệu VNĐ)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip content={<ReportsCustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="thu" stroke="#22c55e" strokeWidth={2} name="Thu" dot={{ r: 4 }} />
              <Line type="monotone" dataKey="chi" stroke="#ef4444" strokeWidth={2} name="Chi" dot={{ r: 4 }} />
              <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2} name="Lãi" strokeDasharray="5 5" dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Single month: Bar chart instead */}
      {trendData.length === 1 && (
        <div className="bg-white rounded-xl border shadow-sm p-4 md:p-5">
          <h3 className="font-bold text-sm md:text-base mb-4">Thu/Chi/Lãi tháng (triệu VNĐ)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip content={<ReportsCustomTooltip />} />
              <Bar dataKey="thu" fill="#22c55e" radius={[4, 4, 0, 0]} name="Thu" />
              <Bar dataKey="chi" fill="#ef4444" radius={[4, 4, 0, 0]} name="Chi" />
              <Bar dataKey="profit" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Lãi" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bottom row: Debt + Salary summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Công nợ tổng hợp */}
        {debtSummary && (
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <h3 className="font-bold text-sm mb-3">Tổng Hợp Công Nợ</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Phải thu ({debtSummary.receivableCount} khoản)</span>
                <span className="font-medium text-green-600">{formatMoney(debtSummary.receivableTotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Phải trả ({debtSummary.payableCount} khoản)</span>
                <span className="font-medium text-red-600">{formatMoney(debtSummary.payableTotal)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-medium">Chênh lệch</span>
                <span className={`font-bold ${debtSummary.receivableTotal >= debtSummary.payableTotal ? 'text-green-700' : 'text-red-700'}`}>
                  {formatMoney(debtSummary.receivableTotal - debtSummary.payableTotal)}
                </span>
              </div>
              {debtSummary.overdueCount > 0 && (
                <div className="flex justify-between items-center text-red-600 bg-red-50 p-2 rounded-lg">
                  <span className="text-sm font-medium">Quá hạn</span>
                  <span className="font-bold">{debtSummary.overdueCount} khoản</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lương tháng này (admin only) */}
        {salarySummary && (
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <h3 className="font-bold text-sm mb-3">Lương Tháng Này</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Tổng lương ({salarySummary.count} bảng)</span>
                <span className="font-medium text-purple-600">{formatMoney(salarySummary.total)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Đã trả ({salarySummary.paidCount} bảng)</span>
                <span className="font-medium text-green-600">{formatMoney(salarySummary.paid)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-medium">Chưa trả</span>
                <span className="font-bold text-orange-600">{formatMoney(salarySummary.total - salarySummary.paid)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Record count */}
      <div className="text-xs text-gray-400 text-center print:hidden">
        {currentReceipts.length} phiếu đã duyệt trong kỳ • Tổng: {visibleReceipts.filter(r => r.status === 'approved').length} phiếu
      </div>
    </div>
  );
}

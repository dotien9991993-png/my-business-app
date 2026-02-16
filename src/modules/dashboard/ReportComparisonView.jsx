import React, { useState, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatMoney } from '../../utils/formatUtils';
import { getVietnamDate, getTodayVN, formatDateVN } from '../../utils/dateUtils';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';
import {
  Section, ExportButton, PrintButton, EmptyState,
  ChartTooltip, exportToCSV, pctChange, filterByDateRange,
} from './reportUtils';

// Helper: format date YYYY-MM-DD from Date object
function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Compute default period boundaries
function getDefaultPeriods() {
  const vn = getVietnamDate();
  const thisMonthStart = vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-01';
  const today = getTodayVN();
  const prevMonthDate = new Date(vn.getFullYear(), vn.getMonth() - 1, 1);
  const prevMonthStart = fmtDate(prevMonthDate);
  const prevMonthEnd = new Date(vn.getFullYear(), vn.getMonth(), 0);
  const prevMonthEndStr = fmtDate(prevMonthEnd);
  return { thisMonthStart, today, prevMonthStart, prevMonthEndStr };
}

// Preset period calculator
function getPresetRange(preset) {
  const vn = getVietnamDate();
  const y = vn.getFullYear();
  const m = vn.getMonth(); // 0-indexed

  switch (preset) {
    case 'this_month':
      return {
        start: y + '-' + String(m + 1).padStart(2, '0') + '-01',
        end: getTodayVN(),
      };
    case 'prev_month': {
      const ps = new Date(y, m - 1, 1);
      const pe = new Date(y, m, 0);
      return { start: fmtDate(ps), end: fmtDate(pe) };
    }
    case 'this_quarter': {
      const qStart = Math.floor(m / 3) * 3;
      return {
        start: y + '-' + String(qStart + 1).padStart(2, '0') + '-01',
        end: getTodayVN(),
      };
    }
    case 'prev_quarter': {
      const curQStart = Math.floor(m / 3) * 3;
      const pqStart = curQStart - 3;
      const pqEnd = curQStart;
      let sy = y, ey = y;
      let sm = pqStart, em = pqEnd;
      if (sm < 0) { sm += 12; sy -= 1; }
      if (em < 0) { em += 12; ey -= 1; }
      const endDate = new Date(ey, em, 0);
      return {
        start: sy + '-' + String(sm + 1).padStart(2, '0') + '-01',
        end: fmtDate(endDate),
      };
    }
    case 'this_year':
      return { start: y + '-01-01', end: getTodayVN() };
    case 'prev_year':
      return { start: (y - 1) + '-01-01', end: (y - 1) + '-12-31' };
    default:
      return null;
  }
}

// Period selector component
function PeriodSelector({ label, start, end, onStartChange, onEndChange }) {
  const presets = [
    { key: 'this_month', label: 'Tháng này' },
    { key: 'prev_month', label: 'Tháng trước' },
    { key: 'this_quarter', label: 'Quý này' },
    { key: 'prev_quarter', label: 'Quý trước' },
    { key: 'this_year', label: 'Năm nay' },
    { key: 'prev_year', label: 'Năm trước' },
  ];

  const handlePreset = (preset) => {
    const range = getPresetRange(preset);
    if (range) {
      onStartChange(range.start);
      onEndChange(range.end);
    }
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="font-semibold text-sm text-gray-700 mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="date"
          value={start}
          onChange={e => onStartChange(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0"
        />
        <span className="text-gray-400 text-sm flex-shrink-0">&rarr;</span>
        <input
          type="date"
          value={end}
          onChange={e => onEndChange(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0"
        />
      </div>
    </div>
  );
}

export default function ReportComparisonView() {
  const _app = useApp();
  const { orders, receiptsPayments, customers } = useData();

  // Default periods
  const defaults = useMemo(() => getDefaultPeriods(), []);

  const [p1Start, setP1Start] = useState(defaults.thisMonthStart);
  const [p1End, setP1End] = useState(defaults.today);
  const [p2Start, setP2Start] = useState(defaults.prevMonthStart);
  const [p2End, setP2End] = useState(defaults.prevMonthEndStr);

  // ===== Lọc dữ liệu theo từng kỳ =====
  const p1Orders = useMemo(() =>
    filterByDateRange(orders, 'created_at', p1Start, p1End)
      .filter(o => o.status !== 'cancelled' && o.status !== 'returned'),
    [orders, p1Start, p1End]
  );

  const p2Orders = useMemo(() =>
    filterByDateRange(orders, 'created_at', p2Start, p2End)
      .filter(o => o.status !== 'cancelled' && o.status !== 'returned'),
    [orders, p2Start, p2End]
  );

  const p1Receipts = useMemo(() =>
    filterByDateRange(receiptsPayments, 'date', p1Start, p1End)
      .filter(r => r.status === 'approved'),
    [receiptsPayments, p1Start, p1End]
  );

  const p2Receipts = useMemo(() =>
    filterByDateRange(receiptsPayments, 'date', p2Start, p2End)
      .filter(r => r.status === 'approved'),
    [receiptsPayments, p2Start, p2End]
  );

  const p1Customers = useMemo(() =>
    filterByDateRange(customers, 'created_at', p1Start, p1End),
    [customers, p1Start, p1End]
  );

  const p2Customers = useMemo(() =>
    filterByDateRange(customers, 'created_at', p2Start, p2End),
    [customers, p2Start, p2End]
  );

  // ===== Tính toán chỉ số cho cả 2 kỳ =====
  const metrics = useMemo(() => {
    const p1Revenue = p1Orders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const p2Revenue = p2Orders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);

    const p1OrderCount = p1Orders.length;
    const p2OrderCount = p2Orders.length;

    const p1AvgOrder = p1OrderCount > 0 ? p1Revenue / p1OrderCount : 0;
    const p2AvgOrder = p2OrderCount > 0 ? p2Revenue / p2OrderCount : 0;

    const p1Thu = p1Receipts.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const p2Thu = p2Receipts.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);

    const p1Chi = p1Receipts.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const p2Chi = p2Receipts.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);

    const p1Profit = p1Thu - p1Chi;
    const p2Profit = p2Thu - p2Chi;

    const p1NewCust = p1Customers.length;
    const p2NewCust = p2Customers.length;

    return [
      { key: 'revenue', label: 'Doanh thu', p1: p1Revenue, p2: p2Revenue, isMoney: true },
      { key: 'orders', label: 'Số đơn hàng', p1: p1OrderCount, p2: p2OrderCount, isMoney: false },
      { key: 'avg_order', label: 'Đơn hàng trung bình', p1: p1AvgOrder, p2: p2AvgOrder, isMoney: true },
      { key: 'thu', label: 'Tổng thu', p1: p1Thu, p2: p2Thu, isMoney: true },
      { key: 'chi', label: 'Tổng chi', p1: p1Chi, p2: p2Chi, isMoney: true },
      { key: 'profit', label: 'Lợi nhuận', p1: p1Profit, p2: p2Profit, isMoney: true },
      { key: 'new_customers', label: 'Khách mới', p1: p1NewCust, p2: p2NewCust, isMoney: false },
    ];
  }, [p1Orders, p2Orders, p1Receipts, p2Receipts, p1Customers, p2Customers]);

  // ===== Dữ liệu biểu đồ (quy đổi triệu đồng) =====
  const chartData = useMemo(() => {
    return metrics
      .filter(m => m.isMoney)
      .map(m => ({
        name: m.label,
        'Kỳ 1': Math.round(m.p1 / 1000000 * 10) / 10,
        'Kỳ 2': Math.round(m.p2 / 1000000 * 10) / 10,
      }));
  }, [metrics]);

  // ===== Nhãn kỳ =====
  const p1Label = useMemo(() => formatDateVN(p1Start) + ' - ' + formatDateVN(p1End), [p1Start, p1End]);
  const p2Label = useMemo(() => formatDateVN(p2Start) + ' - ' + formatDateVN(p2End), [p2Start, p2End]);

  // ===== Hiển thị giá trị =====
  const displayValue = useCallback((val, isMoney) => {
    if (isMoney) return formatMoney(val);
    return new Intl.NumberFormat('vi-VN').format(val);
  }, []);

  // ===== Xuất CSV =====
  const handleExport = useCallback(() => {
    const columns = [
      { label: 'Chỉ số', accessor: 'label' },
      { label: `Kỳ 1 (${p1Start} → ${p1End})`, accessor: row => row.isMoney ? parseFloat(row.p1) : row.p1 },
      { label: `Kỳ 2 (${p2Start} → ${p2End})`, accessor: row => row.isMoney ? parseFloat(row.p2) : row.p2 },
      { label: 'Chênh lệch', accessor: row => row.p1 - row.p2 },
      { label: '% Thay đổi', accessor: row => pctChange(row.p1, row.p2) + '%' },
    ];
    exportToCSV(metrics, columns, `so-sanh-ky-${p1Start}-vs-${p2Start}`);
  }, [metrics, p1Start, p1End, p2Start, p2End]);

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-xl font-bold">So Sánh Theo Kỳ</h2>
        <div className="flex items-center gap-2">
          <ExportButton onClick={handleExport} />
          <PrintButton />
        </div>
      </div>

      {/* 1. Chọn kỳ so sánh */}
      <Section title="Chọn kỳ so sánh">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          <PeriodSelector
            label="Kỳ 1"
            start={p1Start}
            end={p1End}
            onStartChange={setP1Start}
            onEndChange={setP1End}
          />
          <div className="hidden md:flex items-center justify-center">
            <div className="w-px h-full bg-gray-200" />
          </div>
          <div className="md:hidden border-t border-gray-200" />
          <PeriodSelector
            label="Kỳ 2"
            start={p2Start}
            end={p2End}
            onStartChange={setP2Start}
            onEndChange={setP2End}
          />
        </div>
      </Section>

      {/* 2. Thẻ KPI so sánh */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((m) => {
          const pct = pctChange(m.p1, m.p2);
          const pctStr = pct === 0 ? 'Không đổi' : `${pct > 0 ? '+' : ''}${pct}%`;
          const pctColor = pct > 0 ? 'text-green-600' : pct < 0 ? 'text-red-600' : 'text-gray-500';
          return (
            <div key={m.key} className="p-3 md:p-4 rounded-xl border bg-white shadow-sm">
              <div className="text-xs font-medium text-gray-500 mb-1">{m.label}</div>
              <div className="flex flex-col gap-0.5">
                <div className="text-xs text-gray-400">
                  Kỳ 1: <span className="font-semibold text-gray-700">{displayValue(m.p1, m.isMoney)}</span>
                </div>
                <div className="text-xs text-gray-400">
                  Kỳ 2: <span className="font-semibold text-gray-700">{displayValue(m.p2, m.isMoney)}</span>
                </div>
              </div>
              <div className={`text-sm font-bold mt-1 ${pctColor}`}>
                {pctStr}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Biểu đồ so sánh tổng quan */}
      <Section title="So sánh tổng quan">
        {chartData.length > 0 && chartData.some(d => d['Kỳ 1'] !== 0 || d['Kỳ 2'] !== 0) ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={55} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => {
                  if (value === 'Kỳ 1') return `Kỳ 1 (${p1Label})`;
                  if (value === 'Kỳ 2') return `Kỳ 2 (${p2Label})`;
                  return value;
                }}
              />
              <Bar dataKey="Kỳ 1" fill="#16a34a" radius={[4, 4, 0, 0]} barSize={28} name="Kỳ 1" />
              <Bar dataKey="Kỳ 2" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={28} name="Kỳ 2" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu để so sánh" />
        )}
      </Section>

      {/* 4. Bảng so sánh chi tiết */}
      <Section title="Bảng so sánh chi tiết">
        {metrics.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-3 font-medium">Chỉ số</th>
                  <th className="pb-2 pr-3 font-medium text-right">Kỳ 1</th>
                  <th className="pb-2 pr-3 font-medium text-right">Kỳ 2</th>
                  <th className="pb-2 pr-3 font-medium text-right">Chênh lệch</th>
                  <th className="pb-2 font-medium text-right">% Thay đổi</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map(m => {
                  const diff = m.p1 - m.p2;
                  const pct = pctChange(m.p1, m.p2);
                  const diffColor = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500';
                  const pctColor = pct > 0 ? 'text-green-600' : pct < 0 ? 'text-red-600' : 'text-gray-500';
                  return (
                    <tr key={m.key} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 pr-3 font-medium text-gray-700">{m.label}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-700">{displayValue(m.p1, m.isMoney)}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-700">{displayValue(m.p2, m.isMoney)}</td>
                      <td className={`py-2.5 pr-3 text-right font-medium ${diffColor}`}>
                        {diff > 0 ? '+' : ''}{m.isMoney ? formatMoney(diff) : new Intl.NumberFormat('vi-VN').format(diff)}
                      </td>
                      <td className={`py-2.5 text-right font-bold ${pctColor}`}>
                        {pct > 0 ? '+' : ''}{pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu" />
        )}
      </Section>

      {/* Thông tin kỳ */}
      <div className="text-xs text-gray-400 text-center">
        Kỳ 1: {p1Label} | Kỳ 2: {p2Label}
      </div>
    </div>
  );
}

import React, { useState, useCallback } from 'react';
import { getVietnamDate, getTodayVN } from '../../utils/dateUtils';

// ===== TIME FILTER COMPONENT =====
export function TimeFilter({ timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd }) {
  const labels = {
    today: 'Hôm nay',
    week: 'Tuần này',
    month: 'Tháng này',
    quarter: 'Quý này',
    year: 'Năm nay',
    custom: 'Tùy chọn',
  };
  return (
    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(labels).map(([key, label]) => (
          <button key={key} onClick={() => setTimeRange(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              timeRange === key ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {timeRange === 'custom' && (
        <div className="flex gap-2 items-center">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="border rounded-lg px-2 py-1 text-sm" />
          <span className="text-gray-400">→</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="border rounded-lg px-2 py-1 text-sm" />
        </div>
      )}
    </div>
  );
}

// ===== DATE RANGE HELPERS =====
export function getDateRange(timeRange, customStart, customEnd) {
  const vn = getVietnamDate();
  const today = getTodayVN();
  let start, end;
  switch (timeRange) {
    case 'today': start = today; end = today; break;
    case 'week': {
      const dow = vn.getDay() || 7;
      const mon = new Date(vn); mon.setDate(vn.getDate() - dow + 1);
      start = mon.getFullYear() + '-' + String(mon.getMonth() + 1).padStart(2, '0') + '-' + String(mon.getDate()).padStart(2, '0');
      end = today; break;
    }
    case 'month':
      start = vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-01'; end = today; break;
    case 'quarter': {
      const qm = Math.floor(vn.getMonth() / 3) * 3;
      start = vn.getFullYear() + '-' + String(qm + 1).padStart(2, '0') + '-01'; end = today; break;
    }
    case 'year': start = vn.getFullYear() + '-01-01'; end = today; break;
    case 'custom': start = customStart || today; end = customEnd || today; break;
    default: start = vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-01'; end = today;
  }
  return { start, end };
}

export function filterByDateRange(items, dateField, start, end) {
  return (items || []).filter(item => {
    const d = item[dateField];
    if (!d) return false;
    const ds = d.slice(0, 10);
    return ds >= start && ds <= end;
  });
}

export function getPrevDateRange(start, end) {
  const s = new Date(start + 'T00:00:00+07:00');
  const e = new Date(end + 'T00:00:00+07:00');
  const diff = e - s;
  const pe = new Date(s.getTime() - 86400000);
  const ps = new Date(pe.getTime() - diff);
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { start: fmt(ps), end: fmt(pe) };
}

// ===== useTimeFilter HOOK =====
export function useTimeFilter(defaultRange = 'month') {
  const [timeRange, setTimeRange] = useState(defaultRange);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const range = getDateRange(timeRange, customStart, customEnd);
  const prevRange = getPrevDateRange(range.start, range.end);

  const filterCurrent = useCallback((items, dateField) =>
    filterByDateRange(items, dateField, range.start, range.end),
  [range.start, range.end]);

  const filterPrev = useCallback((items, dateField) =>
    filterByDateRange(items, dateField, prevRange.start, prevRange.end),
  [prevRange.start, prevRange.end]);

  return {
    timeRange, setTimeRange,
    customStart, setCustomStart,
    customEnd, setCustomEnd,
    range, prevRange,
    filterCurrent, filterPrev,
  };
}

// ===== EXPORT CSV =====
export function exportToCSV(rows, columns, filename) {
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      let val = typeof c.accessor === 'function' ? c.accessor(row) : row[c.accessor];
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""');
      if (String(val).includes(',') || String(val).includes('"') || String(val).includes('\n')) val = `"${val}"`;
      return val;
    }).join(',')
  ).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ===== FORMAT HELPERS =====
export function formatPercent(value, total) {
  if (!total || total === 0) return '0%';
  return Math.round((value / total) * 100) + '%';
}

export function pctChange(curr, prev) {
  if (!prev || prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / Math.abs(prev)) * 100);
}

// ===== STAT CARD =====
export function StatCard({ label, value, sub, color = 'green', onClick }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
    red: 'bg-red-50 border-red-200 text-red-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-600',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
  };
  const valColors = {
    green: 'text-green-700', blue: 'text-blue-700', orange: 'text-orange-700',
    red: 'text-red-700', purple: 'text-purple-700', gray: 'text-gray-700',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`p-3 md:p-4 rounded-xl border text-left ${colors[color]} ${onClick ? 'hover:opacity-80 transition-opacity' : ''}`}>
      <div className={`text-xs font-medium mb-1 ${colors[color].split(' ')[2]}`}>{label}</div>
      <div className={`text-lg md:text-xl font-bold ${valColors[color]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </Tag>
  );
}

// ===== SECTION WRAPPER =====
export function Section({ title, children, actions }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 md:p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-sm md:text-base">{title}</h3>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

// ===== EXPORT / PRINT BUTTONS =====
export function ExportButton({ onClick }) {
  return (
    <button onClick={onClick} className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors">
      📥 Xuất Excel
    </button>
  );
}

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="px-3 py-1.5 bg-gray-600 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors">
      🖨️ In
    </button>
  );
}

// ===== EMPTY STATE =====
export function EmptyState({ text = 'Chưa có dữ liệu' }) {
  return <div className="text-gray-400 text-sm text-center py-8">{text}</div>;
}

// ===== PIE COLORS =====
export const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e', '#a855f7'];

// ===== RECHARTS TOOLTIP =====
export const ChartTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {formatter ? formatter(p.value) : p.value}
        </div>
      ))}
    </div>
  );
};

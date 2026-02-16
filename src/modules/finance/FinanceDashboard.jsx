import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { formatMoney } from '../../utils/formatUtils';
import { getVietnamDate } from '../../utils/dateUtils';
import { isAdmin } from '../../utils/permissionUtils';

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

const PctBadge = ({ pct, inverse }) => {
  if (pct === 0) return <span className="text-xs text-gray-400 ml-1">0%</span>;
  const isPositive = inverse ? pct < 0 : pct > 0;
  return (
    <span className={`text-xs font-medium ml-1 ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  );
};

const FinanceCustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className={p.dataKey === 'thu' ? 'text-green-600' : 'text-red-600'}>
          {p.dataKey === 'thu' ? 'Thu' : 'Chi'}: {p.value}M
        </div>
      ))}
    </div>
  );
};

export default function FinanceDashboard({ currentUser, receiptsPayments, debts, salaries, getPermissionLevel, navigateTo }) {
  const financeLevel = getPermissionLevel('finance');
  const canViewAll = financeLevel >= 2 || isAdmin(currentUser);

  const visibleReceipts = canViewAll
    ? receiptsPayments
    : receiptsPayments.filter(r => r.created_by === currentUser.name);

  // Tính tháng hiện tại và tháng trước
  const { thisMonth, lastMonth, thisMonthLabel, lastMonthLabel } = useMemo(() => {
    const vn = getVietnamDate();
    const y = vn.getFullYear();
    const m = vn.getMonth();
    const pad = (n) => String(n).padStart(2, '0');
    const thisM = `${y}-${pad(m + 1)}`;
    const lm = m === 0 ? new Date(y - 1, 11, 1) : new Date(y, m - 1, 1);
    const lastM = `${lm.getFullYear()}-${pad(lm.getMonth() + 1)}`;
    return {
      thisMonth: thisM,
      lastMonth: lastM,
      thisMonthLabel: `T${m + 1}/${y}`,
      lastMonthLabel: `T${lm.getMonth() + 1}/${lm.getFullYear()}`
    };
  }, []);

  const getMonthReceipts = (monthPrefix) => {
    return visibleReceipts.filter(r =>
      r.status === 'approved' && (r.receipt_date || '').startsWith(monthPrefix)
    );
  };

  // Stats tháng này vs tháng trước
  const stats = useMemo(() => {
    const thisR = getMonthReceipts(thisMonth);
    const lastR = getMonthReceipts(lastMonth);

    const thisThu = thisR.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const thisChi = thisR.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const lastThu = lastR.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const lastChi = lastR.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);

    const pct = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

    return {
      thu: { value: thisThu, prev: lastThu, pct: pct(thisThu, lastThu) },
      chi: { value: thisChi, prev: lastChi, pct: pct(thisChi, lastChi) },
      profit: { value: thisThu - thisChi, prev: lastThu - lastChi, pct: pct(thisThu - thisChi, lastThu - lastChi) },
    };
  }, [visibleReceipts, thisMonth, lastMonth]);

  const pendingCount = useMemo(() => {
    return visibleReceipts.filter(r => r.status === 'pending').length;
  }, [visibleReceipts]);

  // BarChart data: 6 tháng gần nhất
  const barData = useMemo(() => {
    const vn = getVietnamDate();
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(vn.getFullYear(), vn.getMonth() - i, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthReceipts = visibleReceipts.filter(r => r.status === 'approved' && (r.receipt_date || '').startsWith(prefix));
      const thu = monthReceipts.filter(r => r.type === 'thu').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
      const chi = monthReceipts.filter(r => r.type === 'chi').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
      result.push({
        name: `T${d.getMonth() + 1}`,
        thu: Math.round(thu / 1000000 * 10) / 10,
        chi: Math.round(chi / 1000000 * 10) / 10,
      });
    }
    return result;
  }, [visibleReceipts]);

  // PieChart data: chi theo danh mục tháng này
  const pieData = useMemo(() => {
    const thisR = getMonthReceipts(thisMonth);
    const chiByCategory = {};
    thisR.filter(r => r.type === 'chi').forEach(r => {
      const cat = r.category || 'Khác';
      chiByCategory[cat] = (chiByCategory[cat] || 0) + parseFloat(r.amount || 0);
    });
    return Object.entries(chiByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [visibleReceipts, thisMonth]);

  const totalPie = pieData.reduce((s, d) => s + d.value, 0);

  // Công nợ
  const debtStats = useMemo(() => {
    if (!debts) return { receivable: 0, payable: 0, overdue: 0 };
    const now = new Date();
    const active = debts.filter(d => d.status !== 'paid');
    return {
      receivable: active.filter(d => d.type === 'receivable').reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0),
      payable: active.filter(d => d.type === 'payable').reduce((s, d) => s + parseFloat(d.remaining_amount || 0), 0),
      overdue: active.filter(d => d.due_date && new Date(d.due_date) < now).length,
    };
  }, [debts]);

  // Lương đã trả tháng này
  const salaryPaid = useMemo(() => {
    if (!salaries) return 0;
    return salaries
      .filter(s => s.status === 'paid' && (s.month || '').startsWith(thisMonth.slice(0, 7)))
      .reduce((sum, s) => sum + parseFloat(s.total_salary || 0), 0);
  }, [salaries, thisMonth]);

  // 5 phiếu pending gần nhất
  const pendingReceipts = useMemo(() => {
    return visibleReceipts
      .filter(r => r.status === 'pending')
      .sort((a, b) => new Date(b.created_at || b.receipt_date) - new Date(a.created_at || a.receipt_date))
      .slice(0, 5);
  }, [visibleReceipts]);

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl md:text-2xl font-bold">💰 Tổng Quan Tài Chính</h2>
        <div className="flex items-center gap-2">
          {!canViewAll && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Dữ liệu của bạn</span>
          )}
          <span className="text-xs text-gray-500 bg-green-50 px-2 py-1 rounded-full border border-green-200">{thisMonthLabel}</span>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Thu */}
        <div className="bg-green-50 p-3 md:p-4 rounded-xl border border-green-200">
          <div className="text-xs text-green-600 font-medium mb-1">Tổng Thu</div>
          <div className="text-lg md:text-xl font-bold text-green-700">{formatMoney(stats.thu.value)}</div>
          <div className="text-xs text-gray-500 mt-1">
            vs {lastMonthLabel} <PctBadge pct={stats.thu.pct} />
          </div>
        </div>
        {/* Chi */}
        <div className="bg-red-50 p-3 md:p-4 rounded-xl border border-red-200">
          <div className="text-xs text-red-600 font-medium mb-1">Tổng Chi</div>
          <div className="text-lg md:text-xl font-bold text-red-700">{formatMoney(stats.chi.value)}</div>
          <div className="text-xs text-gray-500 mt-1">
            vs {lastMonthLabel} <PctBadge pct={stats.chi.pct} inverse />
          </div>
        </div>
        {/* Lãi/Lỗ */}
        <div className={`p-3 md:p-4 rounded-xl border ${stats.profit.value >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className={`text-xs font-medium mb-1 ${stats.profit.value >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
            {stats.profit.value >= 0 ? 'Lãi' : 'Lỗ'}
          </div>
          <div className={`text-lg md:text-xl font-bold ${stats.profit.value >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            {formatMoney(Math.abs(stats.profit.value))}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            vs {lastMonthLabel} <PctBadge pct={stats.profit.pct} />
          </div>
        </div>
        {/* Chờ duyệt */}
        <button
          onClick={() => navigateTo('finance', 'receipts')}
          className={`p-3 md:p-4 rounded-xl border text-left transition-colors ${
            pendingCount > 0
              ? 'bg-amber-50 border-amber-300 hover:bg-amber-100'
              : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
          }`}
        >
          <div className={`text-xs font-medium mb-1 ${pendingCount > 0 ? 'text-amber-600' : 'text-gray-500'}`}>Chờ duyệt</div>
          <div className={`text-lg md:text-xl font-bold ${pendingCount > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{pendingCount}</div>
          <div className="text-xs text-gray-500 mt-1">phiếu thu/chi</div>
        </button>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BarChart - Thu/Chi 6 tháng */}
        <div className="bg-white rounded-xl border shadow-sm p-4 md:p-5">
          <h3 className="font-bold text-sm md:text-base mb-4">Thu/Chi 6 tháng gần nhất (triệu VNĐ)</h3>
          {barData.some(d => d.thu > 0 || d.chi > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} barGap={2}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} width={35} />
                <Tooltip content={<FinanceCustomTooltip />} />
                <Bar dataKey="thu" fill="#22c55e" radius={[4, 4, 0, 0]} name="Thu" />
                <Bar dataKey="chi" fill="#ef4444" radius={[4, 4, 0, 0]} name="Chi" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu</div>
          )}
        </div>

        {/* PieChart - Chi theo danh mục tháng này */}
        <div className="bg-white rounded-xl border shadow-sm p-4 md:p-5">
          <h3 className="font-bold text-sm md:text-base mb-4">Chi theo danh mục ({thisMonthLabel})</h3>
          {pieData.length > 0 ? (
            <div className="flex flex-col md:flex-row items-center gap-2">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    innerRadius={40}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 text-xs w-full md:w-auto">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-gray-600 truncate flex-1">{d.name}</span>
                    <span className="font-medium text-gray-800 whitespace-nowrap">{totalPie > 0 ? Math.round(d.value / totalPie * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">Chưa có chi phí tháng này</div>
          )}
        </div>
      </div>

      {/* Bottom row: Công nợ + Lương + Phiếu chờ duyệt */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Công nợ */}
        <button
          onClick={() => navigateTo('finance', 'debts')}
          className="bg-white rounded-xl border shadow-sm p-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h3 className="font-bold text-sm mb-3">Công nợ</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Phải thu</span>
              <span className="font-medium text-green-600">{formatMoney(debtStats.receivable)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Phải trả</span>
              <span className="font-medium text-red-600">{formatMoney(debtStats.payable)}</span>
            </div>
            {debtStats.overdue > 0 && (
              <div className="flex justify-between pt-1 border-t">
                <span className="text-sm text-red-600 font-medium">Quá hạn</span>
                <span className="font-bold text-red-600">{debtStats.overdue} khoản</span>
              </div>
            )}
          </div>
        </button>

        {/* Lương đã trả */}
        {canViewAll && (
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <h3 className="font-bold text-sm mb-3">Lương ({thisMonthLabel})</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Đã trả</span>
                <span className="font-medium text-purple-600">{formatMoney(salaryPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Số bảng lương</span>
                <span className="font-medium">{(salaries || []).filter(s => (s.month || '').startsWith(thisMonth.slice(0, 7))).length}</span>
              </div>
            </div>
          </div>
        )}

        {/* Phiếu chờ duyệt */}
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm">Phiếu chờ duyệt</h3>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">{pendingCount}</span>
            )}
          </div>
          {pendingReceipts.length > 0 ? (
            <div className="space-y-2">
              {pendingReceipts.map(r => (
                <button
                  key={r.id}
                  onClick={() => navigateTo('finance', 'receipts')}
                  className="w-full flex justify-between items-center p-2 bg-gray-50 rounded-lg hover:bg-gray-100 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{r.description}</div>
                    <div className="text-[10px] text-gray-500">{r.created_by} • {new Date(r.receipt_date).toLocaleDateString('vi-VN')}</div>
                  </div>
                  <span className={`text-sm font-bold ml-2 whitespace-nowrap ${r.type === 'thu' ? 'text-green-600' : 'text-red-600'}`}>
                    {r.type === 'thu' ? '+' : '-'}{formatMoney(r.amount)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">Không có phiếu chờ</p>
          )}
        </div>
      </div>
    </div>
  );
}

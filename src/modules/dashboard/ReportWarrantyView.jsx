import React, { useState, useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { formatMoney } from '../../utils/formatUtils';
import { formatDateVN } from '../../utils/dateUtils';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';
import {
  TimeFilter, useTimeFilter, StatCard, Section, ExportButton, PrintButton,
  EmptyState, PIE_COLORS, ChartTooltip, exportToCSV, pctChange,
} from './reportUtils';
import ReportGrid from './ReportGrid';
import ReportDetailWrapper, { ComingSoon } from './ReportDetailWrapper';

// Status labels cho sửa chữa
const REPAIR_STATUS_LABELS = {
  'pending': 'Chờ xử lý',
  'processing': 'Đang sửa',
  'completed': 'Hoàn thành',
  'cancelled': 'Hủy',
};

const REPAIR_STATUS_COLORS = {
  'pending': 'bg-yellow-100 text-yellow-700',
  'processing': 'bg-blue-100 text-blue-700',
  'completed': 'bg-green-500 text-white',
  'cancelled': 'bg-red-100 text-red-700',
};

// Status labels cho yêu cầu bảo hành
const REQUEST_STATUS_LABELS = {
  'pending': 'Chờ xử lý',
  'processing': 'Đang xử lý',
  'completed': 'Đã xử lý',
  'rejected': 'Từ chối',
};

const REQUEST_STATUS_COLORS = {
  'pending': 'bg-yellow-100 text-yellow-700',
  'processing': 'bg-blue-100 text-blue-700',
  'completed': 'bg-green-500 text-white',
  'rejected': 'bg-red-100 text-red-700',
};

function WarrantyContent() {
  useApp();
  const { warrantyCards, warrantyRepairs, warrantyRequests } = useData();
  const tf = useTimeFilter('month');

  // ===== Filtered data =====
  const currentRepairs = useMemo(() => {
    return tf.filterCurrent(warrantyRepairs, 'created_at');
  }, [warrantyRepairs, tf.filterCurrent]);

  const prevRepairs = useMemo(() => {
    return tf.filterPrev(warrantyRepairs, 'created_at');
  }, [warrantyRepairs, tf.filterPrev]);

  const currentRequests = useMemo(() => {
    return tf.filterCurrent(warrantyRequests, 'created_at');
  }, [warrantyRequests, tf.filterCurrent]);

  const prevRequests = useMemo(() => {
    return tf.filterPrev(warrantyRequests, 'created_at');
  }, [warrantyRequests, tf.filterPrev]);

  // ===== KPI Cards =====
  const kpi = useMemo(() => {
    // Thẻ BH hiệu lực
    const activeCards = (warrantyCards || []).filter(c => c.status === 'active').length;

    // Đang sửa chữa (pending + processing)
    const repairsInProgress = currentRepairs.filter(r => r.status === 'pending' || r.status === 'processing').length;
    const prevRepairsInProgress = prevRepairs.filter(r => r.status === 'pending' || r.status === 'processing').length;

    // Yêu cầu chờ xử lý (pending + processing)
    const requestsPending = currentRequests.filter(r => r.status === 'pending' || r.status === 'processing').length;
    const prevRequestsPending = prevRequests.filter(r => r.status === 'pending' || r.status === 'processing').length;

    // Chi phí bảo hành
    const totalCost = currentRepairs.reduce((sum, r) => sum + parseFloat(r.cost || 0), 0);
    const prevTotalCost = prevRepairs.reduce((sum, r) => sum + parseFloat(r.cost || 0), 0);

    return {
      activeCards,
      repairsInProgress, prevRepairsInProgress,
      requestsPending, prevRequestsPending,
      totalCost, prevTotalCost,
    };
  }, [warrantyCards, currentRepairs, prevRepairs, currentRequests, prevRequests]);

  // ===== Top sản phẩm có nhiều bảo hành (BarChart) =====
  const productIssueData = useMemo(() => {
    const byProduct = {};

    // Đếm từ repairs
    currentRepairs.forEach(r => {
      const name = r.product_name || 'Không rõ';
      byProduct[name] = (byProduct[name] || 0) + 1;
    });

    // Đếm từ requests
    currentRequests.forEach(r => {
      const name = r.product_name || 'Không rõ';
      byProduct[name] = (byProduct[name] || 0) + 1;
    });

    return Object.entries(byProduct)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [currentRepairs, currentRequests]);

  // ===== Thời gian xử lý bảo hành =====
  const processingTimeStats = useMemo(() => {
    const completedRepairs = currentRepairs.filter(r =>
      r.status === 'completed' && r.received_date && r.completed_date
    );

    if (completedRepairs.length === 0) {
      return { avg: 0, min: 0, max: 0, count: 0 };
    }

    const days = completedRepairs.map(r => {
      const received = new Date(r.received_date);
      const completed = new Date(r.completed_date);
      const diffMs = completed - received;
      return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    });

    const sum = days.reduce((s, d) => s + d, 0);
    return {
      avg: Math.round((sum / days.length) * 10) / 10,
      min: Math.min(...days),
      max: Math.max(...days),
      count: completedRepairs.length,
    };
  }, [currentRepairs]);

  // ===== Phân bố trạng thái sửa chữa (PieChart) =====
  const repairStatusData = useMemo(() => {
    const byStatus = {};
    currentRepairs.forEach(r => {
      const status = r.status || 'pending';
      const label = REPAIR_STATUS_LABELS[status] || status;
      byStatus[label] = (byStatus[label] || 0) + 1;
    });

    return Object.entries(byStatus)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [currentRepairs]);

  const repairStatusTotal = useMemo(() => {
    return repairStatusData.reduce((s, d) => s + d.value, 0);
  }, [repairStatusData]);

  // ===== Chi phí bảo hành theo tháng (BarChart) =====
  const monthlyCostData = useMemo(() => {
    const byMonth = {};
    currentRepairs.forEach(r => {
      const date = (r.created_at || '').slice(0, 7); // YYYY-MM
      if (!date) return;
      byMonth[date] = (byMonth[date] || 0) + parseFloat(r.cost || 0);
    });

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cost]) => {
        const [y, m] = month.split('-');
        return {
          month,
          label: `T${parseInt(m)}/${y}`,
          cost: Math.round(cost / 1000000 * 10) / 10,
          rawCost: cost,
        };
      });
  }, [currentRepairs]);

  // ===== Yêu cầu bảo hành gần đây =====
  const recentRequests = useMemo(() => {
    return [...(warrantyRequests || [])]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 10);
  }, [warrantyRequests]);

  // ===== Export handler =====
  const handleExport = () => {
    const repairColumns = [
      { label: 'STT', accessor: (_row, i) => i + 1 },
      { label: 'Sản phẩm', accessor: 'product_name' },
      { label: 'Khách hàng', accessor: 'customer_name' },
      { label: 'Mô tả lỗi', accessor: 'issue_description' },
      { label: 'Trạng thái', accessor: r => REPAIR_STATUS_LABELS[r.status] || r.status },
      { label: 'Chi phí', accessor: r => parseFloat(r.cost || 0) },
      { label: 'Ngày nhận', accessor: r => r.received_date ? r.received_date.slice(0, 10) : '' },
      { label: 'Ngày hoàn thành', accessor: r => r.completed_date ? r.completed_date.slice(0, 10) : '' },
      { label: 'Ngày tạo', accessor: r => r.created_at ? r.created_at.slice(0, 10) : '' },
    ];
    exportToCSV(currentRepairs, repairColumns, `bao-cao-bao-hanh-${tf.range.start}-${tf.range.end}`);
  };

  // ===== Pct change helper =====
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
          label="Thẻ BH hiệu lực"
          value={kpi.activeCards}
          color="green"
        />
        <StatCard
          label="Đang sửa chữa"
          value={kpi.repairsInProgress}
          sub={pctText(kpi.repairsInProgress, kpi.prevRepairsInProgress)}
          color="orange"
        />
        <StatCard
          label="Yêu cầu chờ xử lý"
          value={kpi.requestsPending}
          sub={pctText(kpi.requestsPending, kpi.prevRequestsPending)}
          color="blue"
        />
        <StatCard
          label="Chi phí bảo hành"
          value={formatMoney(kpi.totalCost)}
          sub={pctText(kpi.totalCost, kpi.prevTotalCost)}
          color="red"
        />
      </div>

      {/* 2. Top sản phẩm có nhiều bảo hành (BarChart) */}
      <Section title="Top sản phẩm có nhiều bảo hành">
        {productIssueData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(250, productIssueData.length * 36)}>
            <BarChart data={productIssueData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={140}
              />
              <Tooltip content={<ChartTooltip formatter={v => `${v} lần`} />} />
              <Bar
                dataKey="count"
                fill="#ef4444"
                radius={[0, 4, 4, 0]}
                name="Số lần bảo hành"
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu bảo hành trong kỳ này" />
        )}
      </Section>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 3. Thời gian xử lý bảo hành */}
        <Section title="Thời gian xử lý bảo hành">
          {processingTimeStats.count > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <div className="text-xs text-green-600 font-medium mb-1">Trung bình</div>
                  <div className="text-xl font-bold text-green-700">{processingTimeStats.avg}</div>
                  <div className="text-xs text-gray-500 mt-0.5">ngày</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="text-xs text-blue-600 font-medium mb-1">Nhanh nhất</div>
                  <div className="text-xl font-bold text-blue-700">{processingTimeStats.min}</div>
                  <div className="text-xs text-gray-500 mt-0.5">ngày</div>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                  <div className="text-xs text-orange-600 font-medium mb-1">Chậm nhất</div>
                  <div className="text-xl font-bold text-orange-700">{processingTimeStats.max}</div>
                  <div className="text-xs text-gray-500 mt-0.5">ngày</div>
                </div>
              </div>
              <div className="text-xs text-gray-500 text-center">
                Dựa trên {processingTimeStats.count} phiếu sửa chữa đã hoàn thành
              </div>
            </div>
          ) : (
            <EmptyState text="Chưa có dữ liệu thời gian xử lý" />
          )}
        </Section>

        {/* 4. Phân bố trạng thái sửa chữa (PieChart) */}
        <Section title="Phân bố trạng thái sửa chữa">
          {repairStatusData.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={repairStatusData}
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    innerRadius={45}
                    dataKey="value"
                    paddingAngle={2}
                    label={({ name, value }) =>
                      `${name}: ${repairStatusTotal > 0 ? Math.round(value / repairStatusTotal * 100) : 0}%`
                    }
                  >
                    {repairStatusData.map((_entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={value => `${value} phiếu`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
                {repairStatusData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="text-gray-600">{d.name}</span>
                    <span className="font-medium">
                      {repairStatusTotal > 0 ? Math.round(d.value / repairStatusTotal * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState text="Chưa có dữ liệu trạng thái sửa chữa" />
          )}
        </Section>
      </div>

      {/* 5. Chi phí bảo hành theo tháng (BarChart) */}
      <Section title="Chi phí bảo hành theo tháng">
        {monthlyCostData.length > 0 && monthlyCostData.some(d => d.rawCost > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyCostData}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                width={50}
                tickFormatter={v => `${v}tr`}
              />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
              <Bar
                dataKey="cost"
                fill="#16a34a"
                radius={[4, 4, 0, 0]}
                name="Chi phí (triệu VNĐ)"
                barSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu chi phí bảo hành" />
        )}
      </Section>

      {/* 6. Yêu cầu bảo hành gần đây (Table) */}
      <Section title="Yêu cầu bảo hành gần đây">
        {recentRequests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Khách hàng</th>
                  <th className="pb-2 pr-2 font-medium">Sản phẩm</th>
                  <th className="pb-2 pr-2 font-medium hidden sm:table-cell">Vấn đề</th>
                  <th className="pb-2 pr-2 font-medium text-center">Trạng thái</th>
                  <th className="pb-2 font-medium">Ngày</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 text-gray-700 max-w-[120px] truncate">
                      {r.customer_name || 'Không rõ'}
                    </td>
                    <td className="py-2 pr-2 text-gray-700 max-w-[140px] truncate">
                      {r.product_name || 'Không rõ'}
                    </td>
                    <td className="py-2 pr-2 text-gray-600 max-w-[200px] truncate hidden sm:table-cell">
                      {r.issue || '—'}
                    </td>
                    <td className="py-2 pr-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${REQUEST_STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {REQUEST_STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs whitespace-nowrap">
                      {formatDateVN(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có yêu cầu bảo hành" />
        )}
      </Section>
    </div>
  );
}

// ===== WarrantyProduct: Bảo hành theo sản phẩm =====
function WarrantyProduct() {
  const { warrantyRepairs, warrantyRequests } = useData();
  const tf = useTimeFilter('month');

  const currentRepairs = useMemo(() => tf.filterCurrent(warrantyRepairs, 'created_at'), [warrantyRepairs, tf.filterCurrent]);
  const currentRequests = useMemo(() => tf.filterCurrent(warrantyRequests, 'created_at'), [warrantyRequests, tf.filterCurrent]);

  const byProduct = useMemo(() => {
    const map = {};
    currentRepairs.forEach(r => {
      const name = r.product_name || 'Không rõ';
      if (!map[name]) map[name] = { name, repairs: 0, requests: 0, cost: 0, issues: {} };
      map[name].repairs += 1;
      map[name].cost += parseFloat(r.cost || 0);
      const issue = r.issue_description || r.issue || '';
      if (issue) map[name].issues[issue] = (map[name].issues[issue] || 0) + 1;
    });
    currentRequests.forEach(r => {
      const name = r.product_name || 'Không rõ';
      if (!map[name]) map[name] = { name, repairs: 0, requests: 0, cost: 0, issues: {} };
      map[name].requests += 1;
      const issue = r.issue || '';
      if (issue) map[name].issues[issue] = (map[name].issues[issue] || 0) + 1;
    });
    return Object.values(map).map(p => ({
      ...p, total: p.repairs + p.requests,
      topIssue: Object.entries(p.issues).sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
    })).sort((a, b) => b.total - a.total);
  }, [currentRepairs, currentRequests]);

  const totalProducts = byProduct.length;
  const topProduct = byProduct[0]?.name || '—';
  const maxCount = byProduct[0]?.total || 0;
  const avgPerProduct = totalProducts > 0 ? Math.round(byProduct.reduce((s, p) => s + p.total, 0) / totalProducts * 10) / 10 : 0;

  const chartData = useMemo(() => byProduct.slice(0, 10).map(p => ({ name: p.name, 'Số lần BH': p.total })), [byProduct]);

  const handleExport = () => {
    const rows = byProduct.map((p, i) => ({ stt: i + 1, ...p }));
    const columns = [
      { label: 'STT', accessor: 'stt' }, { label: 'Sản phẩm', accessor: 'name' },
      { label: 'Số lần BH', accessor: 'total' }, { label: 'Sửa chữa', accessor: 'repairs' },
      { label: 'Yêu cầu', accessor: 'requests' }, { label: 'Chi phí', accessor: p => formatMoney(p.cost) },
      { label: 'Lỗi phổ biến', accessor: 'topIssue' },
    ];
    exportToCSV(rows, columns, `bh-san-pham-${tf.range.start}-${tf.range.end}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
          customStart={tf.customStart} setCustomStart={tf.setCustomStart}
          customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />
        <div className="flex gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng SP bảo hành" value={totalProducts} color="blue" />
        <StatCard label="SP nhiều lỗi nhất" value={topProduct} color="red" />
        <StatCard label="Số lần BH max" value={maxCount} color="orange" />
        <StatCard label="TB BH/SP" value={avgPerProduct} color="green" />
      </div>
      <Section title="Top sản phẩm bảo hành">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(250, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
              <Tooltip content={<ChartTooltip formatter={v => `${v} lần`} />} />
              <Bar dataKey="Số lần BH" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu bảo hành sản phẩm" />}
      </Section>
      <Section title="Chi tiết bảo hành theo sản phẩm">
        {byProduct.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">Sản phẩm</th>
                <th className="pb-2 pr-2 font-medium text-center">Số lần BH</th>
                <th className="pb-2 pr-2 font-medium text-center">Sửa chữa</th>
                <th className="pb-2 pr-2 font-medium text-center">Yêu cầu</th>
                <th className="pb-2 pr-2 font-medium text-right">Chi phí</th>
                <th className="pb-2 font-medium">Lỗi phổ biến</th>
              </tr></thead>
              <tbody>
                {byProduct.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700 max-w-[150px] truncate">{p.name}</td>
                    <td className="py-2 pr-2 text-center font-bold text-red-600">{p.total}</td>
                    <td className="py-2 pr-2 text-center text-gray-700">{p.repairs}</td>
                    <td className="py-2 pr-2 text-center text-gray-700">{p.requests}</td>
                    <td className="py-2 pr-2 text-right text-gray-700">{formatMoney(p.cost)}</td>
                    <td className="py-2 text-gray-500 max-w-[180px] truncate">{p.topIssue}</td>
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

// ===== WarrantyCost: Chi phí bảo hành =====
function WarrantyCost() {
  const { warrantyRepairs } = useData();
  const tf = useTimeFilter('month');

  const currentRepairs = useMemo(() => tf.filterCurrent(warrantyRepairs, 'created_at'), [warrantyRepairs, tf.filterCurrent]);

  const monthlyData = useMemo(() => {
    const byMonth = {};
    currentRepairs.forEach(r => {
      const date = (r.created_at || '').slice(0, 7);
      if (!date) return;
      byMonth[date] = (byMonth[date] || 0) + parseFloat(r.cost || 0);
    });
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, cost]) => {
      const [y, m] = month.split('-');
      return { month, label: `T${parseInt(m)}/${y}`, cost: Math.round(cost / 1e6 * 10) / 10, rawCost: cost };
    });
  }, [currentRepairs]);

  const costByProduct = useMemo(() => {
    const map = {};
    currentRepairs.forEach(r => {
      const name = r.product_name || 'Không rõ';
      map[name] = (map[name] || 0) + parseFloat(r.cost || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [currentRepairs]);

  const totalCost = currentRepairs.reduce((s, r) => s + parseFloat(r.cost || 0), 0);
  const avgCost = currentRepairs.length > 0 ? totalCost / currentRepairs.length : 0;
  const maxCostRepair = currentRepairs.reduce((max, r) => parseFloat(r.cost || 0) > parseFloat(max.cost || 0) ? r : max, { cost: 0 });
  const freePct = currentRepairs.length > 0 ? Math.round(currentRepairs.filter(r => !r.cost || parseFloat(r.cost) === 0).length / currentRepairs.length * 100) : 0;

  const sortedRepairs = useMemo(() => {
    return [...currentRepairs].sort((a, b) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0)).slice(0, 20);
  }, [currentRepairs]);

  const costTotal = useMemo(() => costByProduct.reduce((s, d) => s + d.value, 0), [costByProduct]);

  const handleExport = () => {
    const columns = [
      { label: 'STT', accessor: (_r, i) => i + 1 }, { label: 'Phiếu sửa', accessor: r => r.id?.slice(0, 8) || '' },
      { label: 'Sản phẩm', accessor: 'product_name' }, { label: 'Mô tả', accessor: r => r.issue_description || '' },
      { label: 'Chi phí', accessor: r => parseFloat(r.cost || 0) },
      { label: 'Ngày', accessor: r => formatDateVN(r.created_at) },
      { label: 'Trạng thái', accessor: r => REPAIR_STATUS_LABELS[r.status] || r.status },
    ];
    exportToCSV(currentRepairs, columns, `chi-phi-bh-${tf.range.start}-${tf.range.end}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
          customStart={tf.customStart} setCustomStart={tf.setCustomStart}
          customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />
        <div className="flex gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng chi phí" value={formatMoney(totalCost)} color="red" />
        <StatCard label="TB chi phí/phiếu" value={formatMoney(avgCost)} color="orange" />
        <StatCard label="Phiếu chi phí cao nhất" value={formatMoney(parseFloat(maxCostRepair.cost || 0))} color="blue" />
        <StatCard label="Tỷ lệ BH miễn phí" value={`${freePct}%`} color="green" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Chi phí bảo hành theo tháng">
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
                <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1e6)} />} />
                <Bar dataKey="cost" fill="#ef4444" radius={[4, 4, 0, 0]} name="Chi phí (triệu)" barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState text="Chưa có dữ liệu chi phí" />}
        </Section>
        <Section title="Chi phí theo sản phẩm">
          {costByProduct.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={costByProduct} cx="50%" cy="50%" outerRadius={85} innerRadius={45} dataKey="value" paddingAngle={2}
                    label={({ name, value }) => `${name.slice(0, 10)}: ${costTotal > 0 ? Math.round(value / costTotal * 100) : 0}%`}>
                    {costByProduct.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => formatMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState text="Chưa có dữ liệu" />}
        </Section>
      </div>
      <Section title="Chi tiết phiếu sửa chữa">
        {sortedRepairs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">Phiếu sửa</th>
                <th className="pb-2 pr-2 font-medium">SP</th>
                <th className="pb-2 pr-2 font-medium hidden sm:table-cell">Mô tả</th>
                <th className="pb-2 pr-2 font-medium text-right">Chi phí</th>
                <th className="pb-2 pr-2 font-medium">Ngày</th>
                <th className="pb-2 font-medium text-center">Trạng thái</th>
              </tr></thead>
              <tbody>
                {sortedRepairs.map((r, i) => (
                  <tr key={r.id || i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 text-gray-600 text-xs font-mono">{(r.id || '').slice(0, 8)}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700 max-w-[120px] truncate">{r.product_name || '—'}</td>
                    <td className="py-2 pr-2 text-gray-500 max-w-[180px] truncate hidden sm:table-cell">{r.issue_description || '—'}</td>
                    <td className="py-2 pr-2 text-right font-medium text-red-600">{formatMoney(parseFloat(r.cost || 0))}</td>
                    <td className="py-2 pr-2 text-gray-500 text-xs whitespace-nowrap">{formatDateVN(r.created_at)}</td>
                    <td className="py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${REPAIR_STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {REPAIR_STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có phiếu sửa chữa" />}
      </Section>
    </div>
  );
}

// ===== WarrantyTime: Thời gian xử lý =====
function WarrantyTime() {
  const { warrantyRepairs } = useData();
  const tf = useTimeFilter('month');

  const currentRepairs = useMemo(() => tf.filterCurrent(warrantyRepairs, 'created_at'), [warrantyRepairs, tf.filterCurrent]);

  const completedWithDays = useMemo(() => {
    return currentRepairs
      .filter(r => r.status === 'completed' && r.received_date && r.completed_date)
      .map(r => {
        const received = new Date(r.received_date);
        const completed = new Date(r.completed_date);
        const days = Math.max(0, Math.round((completed - received) / (1000 * 60 * 60 * 24)));
        return { ...r, processDays: days };
      });
  }, [currentRepairs]);

  const stats = useMemo(() => {
    if (completedWithDays.length === 0) return { avg: 0, min: 0, max: 0, onTime: 0, total: 0 };
    const days = completedWithDays.map(r => r.processDays);
    const sum = days.reduce((s, d) => s + d, 0);
    const onTimeCount = days.filter(d => d <= 7).length;
    return {
      avg: Math.round(sum / days.length * 10) / 10,
      min: Math.min(...days),
      max: Math.max(...days),
      onTime: completedWithDays.length > 0 ? Math.round(onTimeCount / completedWithDays.length * 100) : 0,
      total: completedWithDays.length,
    };
  }, [completedWithDays]);

  const distData = useMemo(() => {
    const buckets = [
      { label: '1-3 ngày', min: 0, max: 3, count: 0 },
      { label: '3-7 ngày', min: 3, max: 7, count: 0 },
      { label: '7-14 ngày', min: 7, max: 14, count: 0 },
      { label: '14-30 ngày', min: 14, max: 30, count: 0 },
      { label: '>30 ngày', min: 30, max: Infinity, count: 0 },
    ];
    completedWithDays.forEach(r => {
      const b = buckets.find(b => r.processDays >= b.min && r.processDays < b.max);
      if (b) b.count += 1;
    });
    return buckets.map(b => ({ name: b.label, 'Số phiếu': b.count }));
  }, [completedWithDays]);

  const monthlyAvg = useMemo(() => {
    const byMonth = {};
    completedWithDays.forEach(r => {
      const m = (r.created_at || '').slice(0, 7);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { sum: 0, count: 0 };
      byMonth[m].sum += r.processDays;
      byMonth[m].count += 1;
    });
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, d]) => {
      const [y, m] = month.split('-');
      return { month, label: `T${parseInt(m)}/${y}`, 'TB ngày': Math.round(d.sum / d.count * 10) / 10 };
    });
  }, [completedWithDays]);

  const tableData = useMemo(() => {
    return [...completedWithDays].sort((a, b) => b.processDays - a.processDays).slice(0, 20);
  }, [completedWithDays]);

  const handleExport = () => {
    const columns = [
      { label: 'STT', accessor: (_r, i) => i + 1 }, { label: 'Phiếu', accessor: r => (r.id || '').slice(0, 8) },
      { label: 'Sản phẩm', accessor: 'product_name' }, { label: 'Ngày nhận', accessor: r => formatDateVN(r.received_date) },
      { label: 'Ngày xong', accessor: r => formatDateVN(r.completed_date) }, { label: 'Số ngày', accessor: 'processDays' },
      { label: 'SLA', accessor: r => r.processDays <= 7 ? 'Đạt' : 'Trễ' },
    ];
    exportToCSV(completedWithDays, columns, `thoi-gian-bh-${tf.range.start}-${tf.range.end}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
          customStart={tf.customStart} setCustomStart={tf.setCustomStart}
          customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />
        <div className="flex gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="TB ngày xử lý" value={`${stats.avg} ngày`} color="blue" />
        <StatCard label="Nhanh nhất" value={`${stats.min} ngày`} color="green" />
        <StatCard label="Chậm nhất" value={`${stats.max} ngày`} color="red" />
        <StatCard label="Đúng hạn" value={`${stats.onTime}%`} sub={`${stats.total} phiếu hoàn thành`} color="green" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Phân bố thời gian xử lý">
          {distData.some(d => d['Số phiếu'] > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={distData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={35} allowDecimals={false} />
                <Tooltip content={<ChartTooltip formatter={v => `${v} phiếu`} />} />
                <Bar dataKey="Số phiếu" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={36}>
                  {distData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState text="Chưa có dữ liệu thời gian xử lý" />}
        </Section>
        <Section title="TB thời gian xử lý theo tháng">
          {monthlyAvg.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyAvg}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={40} tickFormatter={v => `${v}d`} />
                <Tooltip content={<ChartTooltip formatter={v => `${v} ngày`} />} />
                <Line type="monotone" dataKey="TB ngày" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState text="Chưa có dữ liệu" />}
        </Section>
      </div>
      <Section title="Chi tiết thời gian xử lý">
        {tableData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">Phiếu</th>
                <th className="pb-2 pr-2 font-medium">SP</th>
                <th className="pb-2 pr-2 font-medium">Ngày nhận</th>
                <th className="pb-2 pr-2 font-medium">Ngày xong</th>
                <th className="pb-2 pr-2 font-medium text-center">Số ngày</th>
                <th className="pb-2 font-medium text-center">SLA</th>
              </tr></thead>
              <tbody>
                {tableData.map((r, i) => (
                  <tr key={r.id || i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 text-gray-600 text-xs font-mono">{(r.id || '').slice(0, 8)}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700 max-w-[130px] truncate">{r.product_name || '—'}</td>
                    <td className="py-2 pr-2 text-gray-500 text-xs whitespace-nowrap">{formatDateVN(r.received_date)}</td>
                    <td className="py-2 pr-2 text-gray-500 text-xs whitespace-nowrap">{formatDateVN(r.completed_date)}</td>
                    <td className="py-2 pr-2 text-center font-medium">{r.processDays}</td>
                    <td className="py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${r.processDays <= 7 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {r.processDays <= 7 ? 'Đạt' : 'Trễ'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có phiếu hoàn thành" />}
      </Section>
    </div>
  );
}

// ===== REPORT LIST =====
const WARRANTY_REPORTS = [
  { id: 'warranty_summary', name: 'Tổng quan bảo hành', icon: '📊', description: 'Thẻ BH, sửa chữa, yêu cầu và chi phí bảo hành', group: 'Bảo hành', popular: true },
  { id: 'warranty_product', name: 'BH theo sản phẩm', icon: '📦', description: 'Sản phẩm có nhiều lỗi bảo hành nhất', group: 'Bảo hành' },
  { id: 'warranty_cost', name: 'Chi phí bảo hành', icon: '💰', description: 'Phân tích chi phí bảo hành theo tháng', group: 'Bảo hành' },
  { id: 'warranty_time', name: 'Thời gian xử lý', icon: '⏱️', description: 'Thống kê thời gian xử lý bảo hành', group: 'Bảo hành' },
];

// ===== MAIN EXPORT: 2-LAYER UI =====
export default function ReportWarrantyView() {
  const [selectedReport, setSelectedReport] = useState(null);

  if (!selectedReport) {
    return <ReportGrid reports={WARRANTY_REPORTS} onSelect={setSelectedReport} title="🛡️ Báo Cáo Bảo Hành" />;
  }

  const report = WARRANTY_REPORTS.find(r => r.id === selectedReport);

  const renderReport = () => {
    switch (selectedReport) {
      case 'warranty_summary': return <WarrantyContent />;
      case 'warranty_product': return <WarrantyProduct />;
      case 'warranty_cost': return <WarrantyCost />;
      case 'warranty_time': return <WarrantyTime />;
      default: return <ComingSoon />;
    }
  };

  return (
    <ReportDetailWrapper report={report} onBack={() => setSelectedReport(null)}>
      {renderReport()}
    </ReportDetailWrapper>
  );
}

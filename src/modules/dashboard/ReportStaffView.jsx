import React, { useState, useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { formatMoney } from '../../utils/formatUtils';
import { isAdmin } from '../../utils/permissionUtils';
import { getTodayVN, formatDateVN } from '../../utils/dateUtils';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';
import {
  TimeFilter, useTimeFilter, StatCard, Section, ExportButton, PrintButton,
  EmptyState, PIE_COLORS, ChartTooltip, exportToCSV, formatPercent, pctChange,
} from './reportUtils';
import ReportGrid from './ReportGrid';
import ReportDetailWrapper, { ComingSoon } from './ReportDetailWrapper';

// Xếp loại KPI labels + colors
const KPI_RATING_COLORS = {
  'A': 'bg-green-100 text-green-700',
  'B': 'bg-blue-100 text-blue-700',
  'C': 'bg-yellow-100 text-yellow-700',
  'D': 'bg-orange-100 text-orange-700',
  'E': 'bg-red-100 text-red-700',
};

function StaffContent() {
  const { currentUser } = useApp();
  const { orders, allUsers, hrmEmployees, hrmAttendances, hrmKpiEvaluations, salaries } = useData();
  const tf = useTimeFilter('month');
  const admin = isAdmin(currentUser);

  // ===== Helper: map employee_id -> employee name =====
  const employeeMap = useMemo(() => {
    const map = {};
    (hrmEmployees || []).forEach(e => {
      map[e.id] = e.full_name || e.id;
    });
    return map;
  }, [hrmEmployees]);

  // ===== Helper: map user id -> user name =====
  const userMap = useMemo(() => {
    const map = {};
    (allUsers || []).forEach(u => {
      map[u.id] = u.name || u.id;
    });
    return map;
  }, [allUsers]);

  // ===== Active employees =====
  const activeEmployees = useMemo(() => {
    return (hrmEmployees || []).filter(e => e.status === 'active');
  }, [hrmEmployees]);

  // ===== Today attendance =====
  const today = useMemo(() => getTodayVN(), []);

  const todayAttendances = useMemo(() => {
    return (hrmAttendances || []).filter(a => a.date === today);
  }, [hrmAttendances, today]);

  const presentToday = useMemo(() => {
    return todayAttendances.filter(a => a.check_in).length;
  }, [todayAttendances]);

  const lateToday = useMemo(() => {
    return todayAttendances.filter(a => a.is_late === true).length;
  }, [todayAttendances]);

  // ===== Salaries in period (admin only) =====
  const filteredSalaries = useMemo(() => {
    if (!admin) return [];
    const { start, end } = tf.range;
    const startYear = parseInt(start.slice(0, 4), 10);
    const startMonth = parseInt(start.slice(5, 7), 10);
    const endYear = parseInt(end.slice(0, 4), 10);
    const endMonth = parseInt(end.slice(5, 7), 10);

    return (salaries || []).filter(s => {
      if (!s.year || !s.month) return false;
      const ym = s.year * 100 + s.month;
      return ym >= startYear * 100 + startMonth && ym <= endYear * 100 + endMonth;
    });
  }, [salaries, tf.range, admin]);

  const totalSalaryCost = useMemo(() => {
    return filteredSalaries.reduce((sum, s) => sum + parseFloat(s.total_salary || 0), 0);
  }, [filteredSalaries]);

  // Previous period salary cost
  const prevSalaryCost = useMemo(() => {
    if (!admin) return 0;
    const { start, end } = tf.prevRange;
    const startYear = parseInt(start.slice(0, 4), 10);
    const startMonth = parseInt(start.slice(5, 7), 10);
    const endYear = parseInt(end.slice(0, 4), 10);
    const endMonth = parseInt(end.slice(5, 7), 10);

    return (salaries || []).filter(s => {
      if (!s.year || !s.month) return false;
      const ym = s.year * 100 + s.month;
      return ym >= startYear * 100 + startMonth && ym <= endYear * 100 + endMonth;
    }).reduce((sum, s) => sum + parseFloat(s.total_salary || 0), 0);
  }, [salaries, tf.prevRange, admin]);

  // ===== Pct change helper =====
  const pctText = (curr, prev) => {
    const pct = pctChange(curr, prev);
    if (pct === 0) return 'Không đổi so với kỳ trước';
    return `${pct > 0 ? '+' : ''}${pct}% so với kỳ trước`;
  };

  // ===== Section 2: Hiệu suất bán hàng theo nhân viên (Top 10) =====
  const salesByEmployee = useMemo(() => {
    const currentOrders = tf.filterCurrent(orders, 'created_at')
      .filter(o => o.status !== 'cancelled' && o.status !== 'returned');

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
        name: userMap[uid] || uid,
        revenue: Math.round(data.revenue / 1000000 * 10) / 10,
        rawRevenue: data.revenue,
        orders: data.count,
      }))
      .sort((a, b) => b.rawRevenue - a.rawRevenue)
      .slice(0, 10);
  }, [orders, tf, userMap]);

  // ===== Section 3: Chấm công tổng hợp =====
  const attendanceSummary = useMemo(() => {
    const filtered = tf.filterCurrent(hrmAttendances, 'date');

    // Group by employee_id
    const byEmployee = {};
    filtered.forEach(a => {
      const eid = a.employee_id;
      if (!eid) return;
      if (!byEmployee[eid]) {
        byEmployee[eid] = {
          employeeId: eid,
          name: employeeMap[eid] || eid,
          workDays: 0,
          lateDays: 0,
          earlyLeaveDays: 0,
          overtimeHours: 0,
        };
      }
      if (a.check_in) byEmployee[eid].workDays += 1;
      if (a.is_late) byEmployee[eid].lateDays += 1;
      if (a.is_early_leave) byEmployee[eid].earlyLeaveDays += 1;
      byEmployee[eid].overtimeHours += parseFloat(a.overtime_hours || 0);
    });

    return Object.values(byEmployee).sort((a, b) => b.workDays - a.workDays);
  }, [hrmAttendances, tf, employeeMap]);

  // ===== Section 4: KPI tổng hợp =====
  const kpiSummary = useMemo(() => {
    const filtered = tf.filterCurrent(hrmKpiEvaluations, 'created_at');

    return filtered.map(k => ({
      employeeId: k.employee_id,
      name: employeeMap[k.employee_id] || k.employee_id,
      period: k.period || '',
      score: parseFloat(k.total_score || 0),
      rating: k.rating || '',
    })).sort((a, b) => b.score - a.score);
  }, [hrmKpiEvaluations, tf, employeeMap]);

  // KPI rating distribution for bar chart
  const kpiRatingDistribution = useMemo(() => {
    const counts = {};
    kpiSummary.forEach(k => {
      const rating = k.rating || 'Khác';
      counts[rating] = (counts[rating] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([rating, count]) => ({ rating, count }))
      .sort((a, b) => {
        const order = ['A', 'B', 'C', 'D', 'E'];
        return order.indexOf(a.rating) - order.indexOf(b.rating);
      });
  }, [kpiSummary]);

  // ===== Section 5: Chi phí nhân sự theo tháng (admin only) =====
  const monthlySalaryData = useMemo(() => {
    if (!admin) return [];

    const byMonth = {};
    (salaries || []).forEach(s => {
      if (!s.year || !s.month) return;
      const key = `${s.year}-${String(s.month).padStart(2, '0')}`;
      if (!byMonth[key]) {
        byMonth[key] = { month: key, label: `T${s.month}/${s.year}`, total: 0, bonus: 0, base: 0 };
      }
      byMonth[key].total += parseFloat(s.total_salary || 0);
      byMonth[key].bonus += parseFloat(s.bonus || 0);
      byMonth[key].base += parseFloat(s.base_salary || 0);
    });

    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map(d => ({
        ...d,
        totalM: Math.round(d.total / 1000000 * 10) / 10,
        bonusM: Math.round(d.bonus / 1000000 * 10) / 10,
        baseM: Math.round(d.base / 1000000 * 10) / 10,
      }));
  }, [salaries, admin]);

  // ===== Export handler =====
  const handleExport = () => {
    const rows = attendanceSummary.map((a, i) => ({ ...a, stt: i + 1 }));
    const columns = [
      { label: 'STT', accessor: 'stt' },
      { label: 'Tên nhân viên', accessor: 'name' },
      { label: 'Ngày công', accessor: 'workDays' },
      { label: 'Đi muộn', accessor: 'lateDays' },
      { label: 'Về sớm', accessor: 'earlyLeaveDays' },
      { label: 'Giờ OT', accessor: a => a.overtimeHours.toFixed(1) },
    ];
    exportToCSV(rows, columns, `bao-cao-nhan-vien-${tf.range.start}-${tf.range.end}`);
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
          label="Tổng nhân viên"
          value={activeEmployees.length}
          sub={`${activeEmployees.length} đang hoạt động`}
          color="blue"
        />
        <StatCard
          label="Có mặt hôm nay"
          value={presentToday}
          sub={activeEmployees.length > 0 ? formatPercent(presentToday, activeEmployees.length) + ' tổng NV' : ''}
          color="green"
        />
        <StatCard
          label="Đi muộn"
          value={lateToday}
          sub={presentToday > 0 ? formatPercent(lateToday, presentToday) + ' có mặt' : 'Hôm nay'}
          color="red"
        />
        {admin ? (
          <StatCard
            label="Chi phí nhân sự"
            value={formatMoney(totalSalaryCost)}
            sub={pctText(totalSalaryCost, prevSalaryCost)}
            color="orange"
          />
        ) : (
          <StatCard
            label="Chi phí nhân sự"
            value="---"
            sub="Chỉ Admin xem được"
            color="gray"
          />
        )}
      </div>

      {/* 2. Hiệu suất bán hàng theo nhân viên */}
      <Section title="Doanh thu theo nhân viên">
        {salesByEmployee.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(250, salesByEmployee.length * 36)}>
            <BarChart data={salesByEmployee} layout="vertical" margin={{ left: 10, right: 20 }}>
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
          <EmptyState text="Chưa có dữ liệu doanh thu nhân viên" />
        )}
      </Section>

      {/* 3. Chấm công tổng hợp */}
      <Section title="Tổng hợp chấm công">
        {attendanceSummary.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Tên NV</th>
                  <th className="pb-2 pr-2 font-medium text-center">Ngày công</th>
                  <th className="pb-2 pr-2 font-medium text-center">Đi muộn</th>
                  <th className="pb-2 pr-2 font-medium text-center">Về sớm</th>
                  <th className="pb-2 font-medium text-center">Giờ OT</th>
                </tr>
              </thead>
              <tbody>
                {attendanceSummary.map((a, i) => (
                  <tr key={a.employeeId} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700 max-w-[150px] truncate">{a.name}</td>
                    <td className="py-2 pr-2 text-center font-medium text-green-700">{a.workDays}</td>
                    <td className="py-2 pr-2 text-center">
                      {a.lateDays > 0 ? (
                        <span className="text-red-600 font-medium">{a.lateDays}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-center">
                      {a.earlyLeaveDays > 0 ? (
                        <span className="text-orange-600 font-medium">{a.earlyLeaveDays}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="py-2 text-center">
                      {a.overtimeHours > 0 ? (
                        <span className="text-blue-600 font-medium">{a.overtimeHours.toFixed(1)}h</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu chấm công trong kỳ này" />
        )}
      </Section>

      {/* 4. KPI tổng hợp */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* KPI Table */}
        <Section title="Đánh giá KPI nhân viên">
          {kpiSummary.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-2 font-medium">#</th>
                    <th className="pb-2 pr-2 font-medium">Tên NV</th>
                    <th className="pb-2 pr-2 font-medium text-center">Điểm KPI</th>
                    <th className="pb-2 font-medium text-center">Xếp loại</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiSummary.map((k, i) => (
                    <tr key={`${k.employeeId}-${k.period}-${i}`} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-2 font-medium text-gray-700 max-w-[150px] truncate">{k.name}</td>
                      <td className="py-2 pr-2 text-center font-bold text-green-700">{k.score.toFixed(1)}</td>
                      <td className="py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${KPI_RATING_COLORS[k.rating] || 'bg-gray-100 text-gray-600'}`}>
                          {k.rating || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="Chưa có dữ liệu KPI trong kỳ này" />
          )}
        </Section>

        {/* KPI Distribution Bar Chart */}
        <Section title="Phân bố xếp loại KPI">
          {kpiRatingDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={kpiRatingDistribution}>
                <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} width={35} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Số nhân viên" radius={[4, 4, 0, 0]} barSize={40}>
                  {kpiRatingDistribution.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Chưa có dữ liệu xếp loại KPI" />
          )}
        </Section>
      </div>

      {/* 5. Chi phí nhân sự theo tháng (admin only) */}
      {admin && (
        <Section title="Chi phí nhân sự theo tháng">
          {monthlySalaryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlySalaryData} barGap={2}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={50}
                  tickFormatter={v => `${v}tr`}
                />
                <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1000000)} />} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar
                  dataKey="baseM"
                  fill="#16a34a"
                  radius={[4, 4, 0, 0]}
                  name="Lương cơ bản (triệu)"
                  stackId="salary"
                />
                <Bar
                  dataKey="bonusM"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  name="Thưởng (triệu)"
                  stackId="salary"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Chưa có dữ liệu lương" />
          )}
        </Section>
      )}
    </div>
  );
}

// ===== StaffAttendance: Chấm công chi tiết =====
function StaffAttendance() {
  const { hrmEmployees, hrmAttendances } = useData();
  const tf = useTimeFilter('month');

  const employeeMap = useMemo(() => {
    const map = {};
    (hrmEmployees || []).forEach(e => { map[e.id] = e.full_name || e.id; });
    return map;
  }, [hrmEmployees]);

  const data = useMemo(() => {
    const filtered = tf.filterCurrent(hrmAttendances, 'date');
    const byEmp = {};
    filtered.forEach(a => {
      const eid = a.employee_id;
      if (!eid) return;
      if (!byEmp[eid]) byEmp[eid] = { name: employeeMap[eid] || eid, workDays: 0, lateDays: 0, earlyLeaveDays: 0, otHours: 0 };
      if (a.check_in) byEmp[eid].workDays += 1;
      if (a.is_late) byEmp[eid].lateDays += 1;
      if (a.is_early_leave) byEmp[eid].earlyLeaveDays += 1;
      byEmp[eid].otHours += parseFloat(a.overtime_hours || 0);
    });
    return Object.values(byEmp).sort((a, b) => b.workDays - a.workDays);
  }, [hrmAttendances, tf, employeeMap]);

  const totals = useMemo(() => {
    const totalWork = data.reduce((s, d) => s + d.workDays, 0);
    const totalLate = data.reduce((s, d) => s + d.lateDays, 0);
    const totalEarly = data.reduce((s, d) => s + d.earlyLeaveDays, 0);
    const totalOT = data.reduce((s, d) => s + d.otHours, 0);
    return { totalWork, totalLate, totalEarly, totalOT };
  }, [data]);

  const chartData = useMemo(() => data.slice(0, 15).map(d => ({ name: d.name, 'Ngày công': d.workDays })), [data]);

  const handleExport = () => {
    const rows = data.map((d, i) => ({ stt: i + 1, ...d }));
    const columns = [
      { label: 'STT', accessor: 'stt' }, { label: 'Nhân viên', accessor: 'name' },
      { label: 'Ngày công', accessor: 'workDays' }, { label: 'Đi muộn', accessor: 'lateDays' },
      { label: 'Về sớm', accessor: 'earlyLeaveDays' }, { label: 'Giờ OT', accessor: d => d.otHours.toFixed(1) },
    ];
    exportToCSV(rows, columns, `cham-cong-${tf.range.start}-${tf.range.end}`);
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
        <StatCard label="Tổng ngày công" value={totals.totalWork} color="green" />
        <StatCard label="Đi muộn" value={totals.totalLate} color="red" />
        <StatCard label="Về sớm" value={totals.totalEarly} color="orange" />
        <StatCard label="Giờ tăng ca" value={`${totals.totalOT.toFixed(1)}h`} color="blue" />
      </div>
      <Section title="Ngày công theo nhân viên">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(250, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
              <Tooltip content={<ChartTooltip formatter={v => `${v} ngày`} />} />
              <Bar dataKey="Ngày công" fill="#16a34a" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu chấm công" />}
      </Section>
      <Section title="Chi tiết chấm công">
        {data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">NV</th>
                <th className="pb-2 pr-2 font-medium text-center">Ngày công</th>
                <th className="pb-2 pr-2 font-medium text-center">Đi muộn</th>
                <th className="pb-2 pr-2 font-medium text-center">Về sớm</th>
                <th className="pb-2 pr-2 font-medium text-center">Giờ OT</th>
                <th className="pb-2 font-medium text-center">Tỷ lệ chuyên cần</th>
              </tr></thead>
              <tbody>
                {data.map((d, i) => {
                  const totalPossible = d.workDays + d.lateDays;
                  const rate = totalPossible > 0 ? Math.round((d.workDays - d.lateDays) / d.workDays * 100) : 0;
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-2 font-medium text-gray-700 max-w-[150px] truncate">{d.name}</td>
                      <td className="py-2 pr-2 text-center font-medium text-green-700">{d.workDays}</td>
                      <td className="py-2 pr-2 text-center">{d.lateDays > 0 ? <span className="text-red-600 font-medium">{d.lateDays}</span> : <span className="text-gray-400">0</span>}</td>
                      <td className="py-2 pr-2 text-center">{d.earlyLeaveDays > 0 ? <span className="text-orange-600 font-medium">{d.earlyLeaveDays}</span> : <span className="text-gray-400">0</span>}</td>
                      <td className="py-2 pr-2 text-center">{d.otHours > 0 ? <span className="text-blue-600 font-medium">{d.otHours.toFixed(1)}h</span> : <span className="text-gray-400">0</span>}</td>
                      <td className="py-2 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${rate >= 90 ? 'bg-green-100 text-green-700' : rate >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{rate}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu chấm công" />}
      </Section>
    </div>
  );
}

// ===== StaffKPI: Đánh giá KPI chi tiết =====
function StaffKPI() {
  const { hrmEmployees, hrmKpiEvaluations } = useData();
  const tf = useTimeFilter('month');

  const employeeMap = useMemo(() => {
    const map = {};
    (hrmEmployees || []).forEach(e => { map[e.id] = e.full_name || e.id; });
    return map;
  }, [hrmEmployees]);

  const filtered = useMemo(() => {
    return tf.filterCurrent(hrmKpiEvaluations, 'created_at').map(k => ({
      employeeId: k.employee_id,
      name: employeeMap[k.employee_id] || k.employee_id,
      period: k.period || '',
      score: parseFloat(k.total_score || 0),
      rating: k.rating || '',
      notes: k.notes || k.comment || '',
    })).sort((a, b) => b.score - a.score);
  }, [hrmKpiEvaluations, tf, employeeMap]);

  const ratingDist = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    filtered.forEach(k => { if (counts[k.rating] !== undefined) counts[k.rating]++; });
    return Object.entries(counts).map(([rating, count]) => ({ name: `Loại ${rating}`, value: count, rating })).filter(d => d.value > 0);
  }, [filtered]);

  const avgScore = useMemo(() => {
    if (filtered.length === 0) return 0;
    return Math.round(filtered.reduce((s, k) => s + k.score, 0) / filtered.length * 10) / 10;
  }, [filtered]);

  const countA = filtered.filter(k => k.rating === 'A').length;
  const countDE = filtered.filter(k => k.rating === 'D' || k.rating === 'E').length;

  const handleExport = () => {
    const rows = filtered.map((k, i) => ({ stt: i + 1, ...k }));
    const columns = [
      { label: 'STT', accessor: 'stt' }, { label: 'Nhân viên', accessor: 'name' },
      { label: 'Kỳ', accessor: 'period' }, { label: 'Điểm', accessor: k => k.score.toFixed(1) },
      { label: 'Xếp loại', accessor: 'rating' }, { label: 'Ghi chú', accessor: 'notes' },
    ];
    exportToCSV(rows, columns, `kpi-${tf.range.start}-${tf.range.end}`);
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
        <StatCard label="Tổng đánh giá" value={filtered.length} color="blue" />
        <StatCard label="Điểm TB" value={avgScore} color="green" />
        <StatCard label="Xếp loại A" value={countA} sub={filtered.length > 0 ? formatPercent(countA, filtered.length) : ''} color="green" />
        <StatCard label="Xếp loại D-E" value={countDE} sub={filtered.length > 0 ? formatPercent(countDE, filtered.length) : ''} color="red" />
      </div>
      <Section title="Phân bố xếp loại KPI">
        {ratingDist.length > 0 ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={ratingDist} cx="50%" cy="50%" outerRadius={85} innerRadius={45} dataKey="value" paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}>
                  {ratingDist.map((_entry, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => `${v} người`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu KPI" />}
      </Section>
      <Section title="Chi tiết đánh giá KPI">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">NV</th>
                <th className="pb-2 pr-2 font-medium">Kỳ</th>
                <th className="pb-2 pr-2 font-medium text-center">Điểm</th>
                <th className="pb-2 pr-2 font-medium text-center">Xếp loại</th>
                <th className="pb-2 font-medium">Ghi chú</th>
              </tr></thead>
              <tbody>
                {filtered.map((k, i) => (
                  <tr key={`${k.employeeId}-${k.period}-${i}`} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700 max-w-[150px] truncate">{k.name}</td>
                    <td className="py-2 pr-2 text-gray-600">{k.period}</td>
                    <td className="py-2 pr-2 text-center font-bold text-green-700">{k.score.toFixed(1)}</td>
                    <td className="py-2 pr-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${KPI_RATING_COLORS[k.rating] || 'bg-gray-100 text-gray-600'}`}>{k.rating || '-'}</span>
                    </td>
                    <td className="py-2 text-gray-500 max-w-[200px] truncate">{k.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu KPI trong kỳ này" />}
      </Section>
    </div>
  );
}

// ===== StaffSalary: Chi phí lương (admin only) =====
function StaffSalary() {
  const { currentUser } = useApp();
  const { hrmEmployees, salaries } = useData();
  const tf = useTimeFilter('month');
  const admin = isAdmin(currentUser);

  const employeeMap = useMemo(() => {
    const map = {};
    (hrmEmployees || []).forEach(e => { map[e.id] = e.full_name || e.id; });
    return map;
  }, [hrmEmployees]);

  const filteredSalaries = useMemo(() => {
    if (!admin) return [];
    const { start, end } = tf.range;
    const sY = parseInt(start.slice(0, 4), 10), sM = parseInt(start.slice(5, 7), 10);
    const eY = parseInt(end.slice(0, 4), 10), eM = parseInt(end.slice(5, 7), 10);
    return (salaries || []).filter(s => {
      if (!s.year || !s.month) return false;
      const ym = s.year * 100 + s.month;
      return ym >= sY * 100 + sM && ym <= eY * 100 + eM;
    });
  }, [salaries, tf.range, admin]);

  const monthlyData = useMemo(() => {
    const byMonth = {};
    filteredSalaries.forEach(s => {
      const key = `${s.year}-${String(s.month).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { month: key, label: `T${s.month}/${s.year}`, base: 0, bonus: 0, total: 0 };
      byMonth[key].base += parseFloat(s.base_salary || 0);
      byMonth[key].bonus += parseFloat(s.bonus || 0);
      byMonth[key].total += parseFloat(s.total_salary || 0);
    });
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
      .map(d => ({ ...d, baseM: Math.round(d.base / 1e6 * 10) / 10, bonusM: Math.round(d.bonus / 1e6 * 10) / 10 }));
  }, [filteredSalaries]);

  const byEmployee = useMemo(() => {
    const map = {};
    filteredSalaries.forEach(s => {
      const eid = s.employee_id;
      if (!eid) return;
      if (!map[eid]) map[eid] = { name: employeeMap[eid] || eid, base: 0, allowance: 0, bonus: 0, total: 0 };
      map[eid].base += parseFloat(s.base_salary || 0);
      map[eid].allowance += parseFloat(s.allowance || 0);
      map[eid].bonus += parseFloat(s.bonus || 0);
      map[eid].total += parseFloat(s.total_salary || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredSalaries, employeeMap]);

  const totalSalary = filteredSalaries.reduce((s, d) => s + parseFloat(d.total_salary || 0), 0);
  const totalBonus = filteredSalaries.reduce((s, d) => s + parseFloat(d.bonus || 0), 0);
  const uniqueEmps = new Set(filteredSalaries.map(s => s.employee_id)).size;
  const avgPerEmp = uniqueEmps > 0 ? totalSalary / uniqueEmps : 0;

  const handleExport = () => {
    const rows = byEmployee.map((d, i) => ({ stt: i + 1, ...d }));
    const columns = [
      { label: 'STT', accessor: 'stt' }, { label: 'Nhân viên', accessor: 'name' },
      { label: 'Lương cơ bản', accessor: d => formatMoney(d.base) }, { label: 'Phụ cấp', accessor: d => formatMoney(d.allowance) },
      { label: 'Thưởng', accessor: d => formatMoney(d.bonus) }, { label: 'Tổng lương', accessor: d => formatMoney(d.total) },
    ];
    exportToCSV(rows, columns, `luong-${tf.range.start}-${tf.range.end}`);
  };

  if (!admin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <div className="text-4xl mb-3">🔒</div>
        <div className="text-lg font-medium">Chỉ Admin xem được</div>
        <div className="text-sm mt-1">Báo cáo chi phí lương chỉ dành cho quản trị viên</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter timeRange={tf.timeRange} setTimeRange={tf.setTimeRange}
          customStart={tf.customStart} setCustomStart={tf.setCustomStart}
          customEnd={tf.customEnd} setCustomEnd={tf.setCustomEnd} />
        <div className="flex gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng lương" value={formatMoney(totalSalary)} color="green" />
        <StatCard label="Lương TB/NV" value={formatMoney(avgPerEmp)} color="blue" />
        <StatCard label="Thưởng" value={formatMoney(totalBonus)} color="orange" />
        <StatCard label="Chi phí/nhân viên" value={formatMoney(avgPerEmp)} sub={`${uniqueEmps} nhân viên`} color="purple" />
      </div>
      <Section title="Chi phí lương theo tháng">
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData} barGap={2}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={v => `${v}tr`} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v * 1e6)} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Bar dataKey="baseM" fill="#16a34a" radius={[4, 4, 0, 0]} name="Lương cơ bản (tr)" stackId="s" />
              <Bar dataKey="bonusM" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Thưởng (tr)" stackId="s" />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu lương" />}
      </Section>
      <Section title="Chi tiết lương theo nhân viên">
        {byEmployee.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">NV</th>
                <th className="pb-2 pr-2 font-medium text-right">Lương cơ bản</th>
                <th className="pb-2 pr-2 font-medium text-right">Phụ cấp</th>
                <th className="pb-2 pr-2 font-medium text-right">Thưởng</th>
                <th className="pb-2 font-medium text-right">Tổng lương</th>
              </tr></thead>
              <tbody>
                {byEmployee.map((d, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700 max-w-[150px] truncate">{d.name}</td>
                    <td className="py-2 pr-2 text-right text-gray-700">{formatMoney(d.base)}</td>
                    <td className="py-2 pr-2 text-right text-gray-600">{formatMoney(d.allowance)}</td>
                    <td className="py-2 pr-2 text-right text-orange-600 font-medium">{formatMoney(d.bonus)}</td>
                    <td className="py-2 text-right font-bold text-green-700">{formatMoney(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu lương" />}
      </Section>
    </div>
  );
}

// ===== StaffOvertime: Phân tích tăng ca =====
function StaffOvertime() {
  const { hrmEmployees, hrmAttendances } = useData();
  const tf = useTimeFilter('month');

  const employeeMap = useMemo(() => {
    const map = {};
    (hrmEmployees || []).forEach(e => { map[e.id] = e.full_name || e.id; });
    return map;
  }, [hrmEmployees]);

  const data = useMemo(() => {
    const filtered = tf.filterCurrent(hrmAttendances, 'date').filter(a => parseFloat(a.overtime_hours || 0) > 0);
    const byEmp = {};
    filtered.forEach(a => {
      const eid = a.employee_id;
      if (!eid) return;
      if (!byEmp[eid]) byEmp[eid] = { name: employeeMap[eid] || eid, otHours: 0, otDays: 0 };
      byEmp[eid].otHours += parseFloat(a.overtime_hours || 0);
      byEmp[eid].otDays += 1;
    });
    return Object.values(byEmp).sort((a, b) => b.otHours - a.otHours);
  }, [hrmAttendances, tf, employeeMap]);

  const totalOT = data.reduce((s, d) => s + d.otHours, 0);
  const topOT = data.length > 0 ? data[0].name : '—';
  const avgOT = data.length > 0 ? Math.round(totalOT / data.length * 10) / 10 : 0;

  const chartData = useMemo(() => data.slice(0, 15).map(d => ({ name: d.name, 'Giờ OT': Math.round(d.otHours * 10) / 10 })), [data]);

  const handleExport = () => {
    const rows = data.map((d, i) => ({ stt: i + 1, ...d, avgPerDay: d.otDays > 0 ? (d.otHours / d.otDays).toFixed(1) : 0 }));
    const columns = [
      { label: 'STT', accessor: 'stt' }, { label: 'Nhân viên', accessor: 'name' },
      { label: 'Giờ OT', accessor: d => d.otHours.toFixed(1) }, { label: 'Số ngày OT', accessor: 'otDays' },
      { label: 'TB giờ/ngày', accessor: 'avgPerDay' },
    ];
    exportToCSV(rows, columns, `tang-ca-${tf.range.start}-${tf.range.end}`);
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
        <StatCard label="Tổng giờ OT" value={`${totalOT.toFixed(1)}h`} color="blue" />
        <StatCard label="NV OT nhiều nhất" value={topOT} color="orange" />
        <StatCard label="TB giờ OT/NV" value={`${avgOT}h`} color="green" />
        <StatCard label="Số NV tăng ca" value={data.length} color="purple" />
      </div>
      <Section title="Giờ tăng ca theo nhân viên">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(250, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
              <Tooltip content={<ChartTooltip formatter={v => `${v}h`} />} />
              <Bar dataKey="Giờ OT" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState text="Chưa có dữ liệu tăng ca" />}
      </Section>
      <Section title="Chi tiết tăng ca">
        {data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">NV</th>
                <th className="pb-2 pr-2 font-medium text-center">Giờ OT</th>
                <th className="pb-2 pr-2 font-medium text-center">Số ngày OT</th>
                <th className="pb-2 font-medium text-center">TB giờ/ngày</th>
              </tr></thead>
              <tbody>
                {data.map((d, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-gray-700 max-w-[150px] truncate">{d.name}</td>
                    <td className="py-2 pr-2 text-center font-medium text-blue-700">{d.otHours.toFixed(1)}h</td>
                    <td className="py-2 pr-2 text-center text-gray-700">{d.otDays}</td>
                    <td className="py-2 text-center text-gray-600">{d.otDays > 0 ? (d.otHours / d.otDays).toFixed(1) : 0}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Chưa có dữ liệu tăng ca" />}
      </Section>
    </div>
  );
}

// ===== REPORT LIST =====
const STAFF_REPORTS = [
  { id: 'staff_performance', name: 'Hiệu suất nhân viên', icon: '📊', description: 'Tổng hợp chấm công, KPI, doanh thu theo nhân viên', group: 'Nhân sự', popular: true },
  { id: 'staff_attendance', name: 'Chấm công tổng hợp', icon: '📋', description: 'Chi tiết ngày công, đi muộn, về sớm, tăng ca', group: 'Nhân sự' },
  { id: 'staff_kpi', name: 'Đánh giá KPI', icon: '🎯', description: 'Kết quả đánh giá KPI và xếp loại nhân viên', group: 'Nhân sự' },
  { id: 'staff_salary', name: 'Chi phí lương', icon: '💰', description: 'Tổng hợp chi phí lương theo tháng', group: 'Nhân sự' },
  { id: 'staff_overtime', name: 'Tăng ca', icon: '⏰', description: 'Thống kê giờ tăng ca theo nhân viên', group: 'Nhân sự' },
];

// ===== MAIN EXPORT: 2-LAYER UI =====
export default function ReportStaffView() {
  const [selectedReport, setSelectedReport] = useState(null);

  if (!selectedReport) {
    return <ReportGrid reports={STAFF_REPORTS} onSelect={setSelectedReport} title="👤 Báo Cáo Nhân Viên" />;
  }

  const report = STAFF_REPORTS.find(r => r.id === selectedReport);

  const renderReport = () => {
    switch (selectedReport) {
      case 'staff_performance': return <StaffContent />;
      case 'staff_attendance': return <StaffAttendance />;
      case 'staff_kpi': return <StaffKPI />;
      case 'staff_salary': return <StaffSalary />;
      case 'staff_overtime': return <StaffOvertime />;
      default: return <ComingSoon />;
    }
  };

  return (
    <ReportDetailWrapper report={report} onBack={() => setSelectedReport(null)}>
      {renderReport()}
    </ReportDetailWrapper>
  );
}

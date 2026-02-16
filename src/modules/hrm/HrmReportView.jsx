import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { ATTENDANCE_STATUSES, KPI_RATINGS } from '../../constants/hrmConstants';
import { getVietnamDate } from '../../utils/dateUtils';

// Bảng màu xanh lá
const COLORS = ['#16a34a', '#2563eb', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];
const DEPT_COLORS = ['#16a34a', '#2563eb', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1'];

const pad = (n) => String(n).padStart(2, '0');

// Helper lấy tên nhân viên
const getEmpName = (emp) => emp?.full_name || emp?.name || 'N/A';

// Helper lấy tên phòng ban
const getDeptName = (deptId, departments) => {
  if (!deptId) return 'Chưa phân';
  const dept = departments.find(d => d.id === deptId);
  return dept?.name || 'Chưa phân';
};

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// Custom pie label
const renderPieLabel = ({ name, percent }) => {
  if (percent < 0.05) return null;
  return `${name} (${(percent * 100).toFixed(0)}%)`;
};

export default function HrmReportView({
  employees,
  departments,
  attendances,
  leaveBalances,
  kpiEvaluations,
  hasPermission
}) {
  const [activeSubTab, setActiveSubTab] = useState('attendance');

  // ============ CHẤM CÔNG STATE ============
  const vn = getVietnamDate();
  const [attMonth, setAttMonth] = useState(`${vn.getFullYear()}-${pad(vn.getMonth() + 1)}`);
  const [attDeptFilter, setAttDeptFilter] = useState('all');

  // ============ PHÉP NĂM STATE ============
  const [leaveYear, setLeaveYear] = useState(vn.getFullYear());

  // ============ KPI STATE ============
  const [kpiPeriod, setKpiPeriod] = useState(`${vn.getFullYear()}-${pad(vn.getMonth() + 1)}`);
  const [kpiDeptFilter, setKpiDeptFilter] = useState('all');

  // ============ BIẾN ĐỘNG STATE ============
  const [turnoverYear, setTurnoverYear] = useState(vn.getFullYear());
  const [turnoverFrom, setTurnoverFrom] = useState(`${vn.getFullYear()}-01-01`);
  const [turnoverTo, setTurnoverTo] = useState(`${vn.getFullYear()}-12-31`);
  const [turnoverMode, setTurnoverMode] = useState('year'); // 'year' | 'custom'

  // Nhân viên đang hoạt động
  const activeEmployees = useMemo(() => {
    return (employees || []).filter(e => e.status === 'active' || !e.status);
  }, [employees]);

  // ====================================================================
  // A. CHẤM CÔNG TAB
  // ====================================================================

  // Lọc chấm công theo tháng + phòng ban
  const filteredAttendances = useMemo(() => {
    if (!attendances) return [];
    return attendances.filter(a => {
      const dateMatch = (a.date || '').startsWith(attMonth);
      if (!dateMatch) return false;
      if (attDeptFilter === 'all') return true;
      const emp = (employees || []).find(e => e.id === a.employee_id);
      return emp?.department_id === attDeptFilter;
    });
  }, [attendances, attMonth, attDeptFilter, employees]);

  // Tổng hợp chấm công theo nhân viên
  const attendanceSummary = useMemo(() => {
    const empMap = {};
    filteredAttendances.forEach(a => {
      const empId = a.employee_id;
      if (!empMap[empId]) {
        const emp = (employees || []).find(e => e.id === empId);
        empMap[empId] = {
          id: empId,
          name: getEmpName(emp),
          department: getDeptName(emp?.department_id, departments || []),
          present: 0, late: 0, early_leave: 0, absent: 0, half_day: 0,
          overtime_hours: 0, total: 0,
        };
      }
      const row = empMap[empId];
      row.total++;
      const status = a.status || 'present';
      if (status === 'present') row.present++;
      else if (status === 'late') { row.late++; row.present++; }
      else if (status === 'early_leave') { row.early_leave++; row.present++; }
      else if (status === 'absent') row.absent++;
      else if (status === 'half_day') row.half_day++;
      row.overtime_hours += parseFloat(a.overtime_hours || 0);
    });
    return Object.values(empMap).sort((a, b) => b.present - a.present);
  }, [filteredAttendances, employees, departments]);

  // Dữ liệu biểu đồ cột chấm công theo phòng ban
  const attDeptChartData = useMemo(() => {
    const deptMap = {};
    attendanceSummary.forEach(emp => {
      const dept = emp.department;
      if (!deptMap[dept]) {
        deptMap[dept] = { name: dept, 'Có mặt': 0, 'Đi trễ': 0, 'Vắng': 0 };
      }
      deptMap[dept]['Có mặt'] += emp.present;
      deptMap[dept]['Đi trễ'] += emp.late;
      deptMap[dept]['Vắng'] += emp.absent;
    });
    return Object.values(deptMap);
  }, [attendanceSummary]);

  // Dữ liệu biểu đồ tròn phân bố trạng thái
  const attStatusPieData = useMemo(() => {
    const statusMap = {};
    filteredAttendances.forEach(a => {
      const status = a.status || 'present';
      const label = ATTENDANCE_STATUSES[status]?.label || status;
      statusMap[label] = (statusMap[label] || 0) + 1;
    });
    return Object.entries(statusMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredAttendances]);

  // Tổng cộng chấm công
  const attTotals = useMemo(() => {
    return attendanceSummary.reduce((acc, emp) => ({
      present: acc.present + emp.present,
      late: acc.late + emp.late,
      early_leave: acc.early_leave + emp.early_leave,
      absent: acc.absent + emp.absent,
      overtime_hours: acc.overtime_hours + emp.overtime_hours,
    }), { present: 0, late: 0, early_leave: 0, absent: 0, overtime_hours: 0 });
  }, [attendanceSummary]);

  // ====================================================================
  // B. PHÉP NĂM TAB
  // ====================================================================

  const leaveData = useMemo(() => {
    if (!leaveBalances || !employees) return [];
    return activeEmployees.map(emp => {
      const balance = (leaveBalances || []).find(
        lb => lb.employee_id === emp.id && lb.year === leaveYear
      );
      const annualUsed = balance?.annual_leave_used || 0;
      const annualTotal = balance?.annual_leave_total || 12;
      const sickUsed = balance?.sick_leave_used || 0;
      const sickTotal = balance?.sick_leave_total || 30;
      const annualRemaining = annualTotal - annualUsed;
      const sickRemaining = sickTotal - sickUsed;
      return {
        id: emp.id,
        name: getEmpName(emp),
        department: getDeptName(emp.department_id, departments || []),
        annualUsed, annualTotal, annualRemaining,
        sickUsed, sickTotal, sickRemaining,
        totalRemaining: annualRemaining + sickRemaining,
        lowLeave: annualRemaining <= 2,
      };
    }).sort((a, b) => a.annualRemaining - b.annualRemaining);
  }, [activeEmployees, leaveBalances, departments, leaveYear]);

  // ====================================================================
  // C. KPI TAB
  // ====================================================================

  // Lọc KPI theo kỳ + phòng ban
  const filteredKpis = useMemo(() => {
    if (!kpiEvaluations) return [];
    return kpiEvaluations.filter(k => {
      const periodMatch = !kpiPeriod || (k.period || '').startsWith(kpiPeriod);
      if (!periodMatch) return false;
      if (kpiDeptFilter === 'all') return true;
      const emp = (employees || []).find(e => e.id === k.employee_id);
      return emp?.department_id === kpiDeptFilter;
    });
  }, [kpiEvaluations, kpiPeriod, kpiDeptFilter, employees]);

  // Điểm KPI trung bình theo phòng ban
  const kpiDeptAvg = useMemo(() => {
    const deptMap = {};
    filteredKpis.forEach(k => {
      const emp = (employees || []).find(e => e.id === k.employee_id);
      const dept = getDeptName(emp?.department_id, departments || []);
      if (!deptMap[dept]) deptMap[dept] = { name: dept, scores: [] };
      deptMap[dept].scores.push(parseFloat(k.total_score || k.score || 0));
    });
    return Object.values(deptMap).map(d => ({
      name: d.name,
      'Điểm TB': d.scores.length > 0 ? Math.round(d.scores.reduce((s, v) => s + v, 0) / d.scores.length * 10) / 10 : 0,
      count: d.scores.length,
    })).sort((a, b) => b['Điểm TB'] - a['Điểm TB']);
  }, [filteredKpis, employees, departments]);

  // Phân bố xếp hạng A/B/C/D
  const kpiRatingDist = useMemo(() => {
    const dist = { A: 0, B: 0, C: 0, D: 0 };
    filteredKpis.forEach(k => {
      const score = parseFloat(k.total_score || k.score || 0);
      if (score >= 90) dist.A++;
      else if (score >= 75) dist.B++;
      else if (score >= 60) dist.C++;
      else dist.D++;
    });
    return Object.entries(dist).map(([key, value]) => ({
      name: `${key} - ${KPI_RATINGS[key]?.label || key}`,
      value,
      rating: key,
    })).filter(d => d.value > 0);
  }, [filteredKpis]);

  const KPI_RATING_COLORS = { A: '#16a34a', B: '#2563eb', C: '#f59e0b', D: '#ef4444' };

  // Top 10 nhân viên KPI
  const topKpiEmployees = useMemo(() => {
    const empScoreMap = {};
    filteredKpis.forEach(k => {
      const empId = k.employee_id;
      const score = parseFloat(k.total_score || k.score || 0);
      if (!empScoreMap[empId] || score > empScoreMap[empId].score) {
        const emp = (employees || []).find(e => e.id === empId);
        empScoreMap[empId] = {
          id: empId,
          name: getEmpName(emp),
          department: getDeptName(emp?.department_id, departments || []),
          score,
        };
      }
    });
    return Object.values(empScoreMap).sort((a, b) => b.score - a.score).slice(0, 10);
  }, [filteredKpis, employees, departments]);

  // Xu hướng KPI 6 tháng gần nhất
  const kpiTrendData = useMemo(() => {
    if (!kpiEvaluations || kpiEvaluations.length === 0) return [];
    const now = getVietnamDate();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: `T${d.getMonth() + 1}/${d.getFullYear() % 100}`,
      });
    }
    return months.map(m => {
      const monthKpis = (kpiEvaluations || []).filter(k => {
        const periodMatch = (k.period || '').startsWith(m.key);
        if (!periodMatch) return false;
        if (kpiDeptFilter === 'all') return true;
        const emp = (employees || []).find(e => e.id === k.employee_id);
        return emp?.department_id === kpiDeptFilter;
      });
      const scores = monthKpis.map(k => parseFloat(k.total_score || k.score || 0));
      const avg = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10 : 0;
      return { name: m.label, 'Điểm TB': avg, count: scores.length };
    });
  }, [kpiEvaluations, kpiDeptFilter, employees]);

  // ====================================================================
  // D. BIẾN ĐỘNG TAB
  // ====================================================================

  const turnoverEffectiveFrom = turnoverMode === 'custom' ? turnoverFrom : `${turnoverYear}-01-01`;
  const turnoverEffectiveTo = turnoverMode === 'custom' ? turnoverTo : `${turnoverYear}-12-31`;

  // Nhân viên mới + nghỉ việc theo tháng
  const turnoverMonthlyData = useMemo(() => {
    const allEmps = employees || [];
    const startDate = new Date(turnoverEffectiveFrom);
    const endDate = new Date(turnoverEffectiveTo);
    const months = [];
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endM = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (d <= endM) {
      months.push({
        key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: `T${d.getMonth() + 1}/${d.getFullYear() % 100}`,
      });
      d.setMonth(d.getMonth() + 1);
    }
    return months.map(m => {
      const newHires = allEmps.filter(e => (e.start_date || '').startsWith(m.key)).length;
      const resigned = allEmps.filter(e =>
        (e.status === 'resigned' || e.status === 'terminated') &&
        (e.end_date || '').startsWith(m.key)
      ).length;
      return { name: m.label, 'Tuyển mới': newHires, 'Nghỉ việc': resigned };
    });
  }, [employees, turnoverEffectiveFrom, turnoverEffectiveTo]);

  // Nhân sự hiện tại theo phòng ban (PieChart)
  const headcountByDept = useMemo(() => {
    const deptMap = {};
    activeEmployees.forEach(emp => {
      const dept = getDeptName(emp.department_id, departments || []);
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    });
    return Object.entries(deptMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [activeEmployees, departments]);

  // Xu hướng nhân sự theo thời gian (LineChart)
  const headcountTrendData = useMemo(() => {
    const allEmps = employees || [];
    const startDate = new Date(turnoverEffectiveFrom);
    const endDate = new Date(turnoverEffectiveTo);
    const months = [];
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endM = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (d <= endM) {
      months.push({
        key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: `T${d.getMonth() + 1}/${d.getFullYear() % 100}`,
        endOfMonth: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())}`,
      });
      d.setMonth(d.getMonth() + 1);
    }
    return months.map(m => {
      const count = allEmps.filter(e => {
        const hireDate = e.start_date || '';
        if (hireDate > m.endOfMonth) return false;
        if (e.status === 'resigned' || e.status === 'terminated') {
          const termDate = e.end_date || '';
          if (termDate && termDate <= m.endOfMonth) return false;
        }
        return true;
      }).length;
      return { name: m.label, 'Nhân sự': count };
    });
  }, [employees, turnoverEffectiveFrom, turnoverEffectiveTo]);

  // Phân bố loại hợp đồng
  const employmentTypeDist = useMemo(() => {
    const typeMap = {};
    const typeLabels = {
      full_time: 'Toàn thời gian',
      part_time: 'Bán thời gian',
      contract: 'Hợp đồng',
      intern: 'Thực tập',
    };
    activeEmployees.forEach(emp => {
      const type = emp.employment_type || 'full_time';
      const label = typeLabels[type] || type;
      typeMap[label] = (typeMap[label] || 0) + 1;
    });
    return Object.entries(typeMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [activeEmployees]);

  // ====================================================================
  // EXPORT CSV
  // ====================================================================

  const exportCSV = useCallback(() => {
    const rows = [];
    if (activeSubTab === 'attendance') {
      rows.push(['BÁO CÁO CHẤM CÔNG', `Tháng ${attMonth}`]);
      rows.push([]);
      rows.push(['Nhân viên', 'Phòng ban', 'Ngày công', 'Đi trễ', 'Về sớm', 'Vắng', 'Tăng ca (giờ)']);
      attendanceSummary.forEach(emp => {
        rows.push([emp.name, emp.department, emp.present, emp.late, emp.early_leave, emp.absent, emp.overtime_hours.toFixed(1)]);
      });
    } else if (activeSubTab === 'leave') {
      rows.push(['BÁO CÁO PHÉP NĂM', `Năm ${leaveYear}`]);
      rows.push([]);
      rows.push(['Nhân viên', 'Phòng ban', 'Phép năm (đã dùng)', 'Phép năm (tổng)', 'Nghỉ ốm (đã dùng)', 'Nghỉ ốm (tổng)', 'Còn lại']);
      leaveData.forEach(emp => {
        rows.push([emp.name, emp.department, emp.annualUsed, emp.annualTotal, emp.sickUsed, emp.sickTotal, emp.totalRemaining]);
      });
    } else if (activeSubTab === 'kpi') {
      rows.push(['BÁO CÁO KPI', `Kỳ ${kpiPeriod}`]);
      rows.push([]);
      rows.push(['Nhân viên', 'Phòng ban', 'Điểm KPI']);
      topKpiEmployees.forEach(emp => {
        rows.push([emp.name, emp.department, emp.score]);
      });
    } else if (activeSubTab === 'turnover') {
      rows.push(['BÁO CÁO BIẾN ĐỘNG NHÂN SỰ', `${turnoverEffectiveFrom} → ${turnoverEffectiveTo}`]);
      rows.push([]);
      rows.push(['Tháng', 'Tuyển mới', 'Nghỉ việc']);
      turnoverMonthlyData.forEach(m => {
        rows.push([m.name, m['Tuyển mới'], m['Nghỉ việc']]);
      });
    }
    const csvContent = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-nhan-su-${activeSubTab}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeSubTab, attendanceSummary, leaveData, topKpiEmployees, turnoverMonthlyData, attMonth, leaveYear, kpiPeriod, turnoverEffectiveFrom, turnoverEffectiveTo]);

  // === PERMISSION GUARD: Chỉ level 2+ mới xem được báo cáo ===
  if (hasPermission && !hasPermission('hrm', 2)) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
          <p className="text-red-600">Bạn không có quyền xem báo cáo nhân sự. Vui lòng liên hệ Admin.</p>
        </div>
      </div>
    );
  }

  // ====================================================================
  // RENDER
  // ====================================================================

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">Báo Cáo Nhân Sự</h2>
        <button
          onClick={exportCSV}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition-colors self-start"
        >
          Xuất CSV
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="bg-white rounded-xl border shadow-sm p-1 flex gap-1 overflow-x-auto">
        {[
          { id: 'attendance', label: 'Chấm công' },
          { id: 'leave', label: 'Phép năm' },
          { id: 'kpi', label: 'KPI' },
          { id: 'turnover', label: 'Biến động' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeSubTab === tab.id
                ? 'bg-green-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/* A. CHẤM CÔNG TAB */}
      {/* ============================================================ */}
      {activeSubTab === 'attendance' && (
        <div className="space-y-4">
          {/* Bộ lọc */}
          <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tháng</label>
              <input
                type="month"
                value={attMonth}
                onChange={e => setAttMonth(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phòng ban</label>
              <select
                value={attDeptFilter}
                onChange={e => setAttDeptFilter(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="all">Tất cả phòng ban</option>
                {(departments || []).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Thẻ tổng hợp */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-green-50 rounded-xl border border-green-200 p-3">
              <div className="text-xs text-green-600 font-medium">Có mặt</div>
              <div className="text-xl font-bold text-green-700">{attTotals.present}</div>
            </div>
            <div className="bg-orange-50 rounded-xl border border-orange-200 p-3">
              <div className="text-xs text-orange-600 font-medium">Đi trễ</div>
              <div className="text-xl font-bold text-orange-700">{attTotals.late}</div>
            </div>
            <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-3">
              <div className="text-xs text-yellow-600 font-medium">Về sớm</div>
              <div className="text-xl font-bold text-yellow-700">{attTotals.early_leave}</div>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-3">
              <div className="text-xs text-red-600 font-medium">Vắng</div>
              <div className="text-xl font-bold text-red-700">{attTotals.absent}</div>
            </div>
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-3">
              <div className="text-xs text-blue-600 font-medium">Tăng ca (giờ)</div>
              <div className="text-xl font-bold text-blue-700">{attTotals.overtime_hours.toFixed(1)}</div>
            </div>
          </div>

          {/* Bảng chấm công */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="font-bold text-sm md:text-base">Tổng hợp chấm công theo nhân viên</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-600">Nhân viên</th>
                    <th className="text-left p-3 font-medium text-gray-600">Phòng ban</th>
                    <th className="text-center p-3 font-medium text-gray-600">Ngày công</th>
                    <th className="text-center p-3 font-medium text-gray-600">Đi trễ</th>
                    <th className="text-center p-3 font-medium text-gray-600">Về sớm</th>
                    <th className="text-center p-3 font-medium text-gray-600">Vắng</th>
                    <th className="text-center p-3 font-medium text-gray-600">Tăng ca (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceSummary.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400">
                        Không có dữ liệu chấm công trong tháng này
                      </td>
                    </tr>
                  ) : attendanceSummary.map(emp => (
                    <tr key={emp.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-800">{emp.name}</td>
                      <td className="p-3 text-gray-600">{emp.department}</td>
                      <td className="p-3 text-center font-medium text-green-600">{emp.present}</td>
                      <td className="p-3 text-center">
                        {emp.late > 0 ? <span className="text-orange-600 font-medium">{emp.late}</span> : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="p-3 text-center">
                        {emp.early_leave > 0 ? <span className="text-yellow-600 font-medium">{emp.early_leave}</span> : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="p-3 text-center">
                        {emp.absent > 0 ? <span className="text-red-600 font-medium">{emp.absent}</span> : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="p-3 text-center">
                        {emp.overtime_hours > 0 ? <span className="text-blue-600 font-medium">{emp.overtime_hours.toFixed(1)}</span> : <span className="text-gray-300">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Biểu đồ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bar Chart: Chấm công theo phòng ban */}
            {attDeptChartData.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <h3 className="font-bold text-sm mb-4">Chấm công theo phòng ban</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={attDeptChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={35} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="Có mặt" fill="#16a34a" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Đi trễ" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Vắng" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Pie Chart: Phân bố trạng thái */}
            {attStatusPieData.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <h3 className="font-bold text-sm mb-4">Phân bố trạng thái chấm công</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={attStatusPieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={40}
                      dataKey="value"
                      label={renderPieLabel}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {attStatusPieData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* B. PHÉP NĂM TAB */}
      {/* ============================================================ */}
      {activeSubTab === 'leave' && (
        <div className="space-y-4">
          {/* Bộ lọc năm */}
          <div className="bg-white rounded-xl border shadow-sm p-4 flex gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Năm</label>
              <select
                value={leaveYear}
                onChange={e => setLeaveYear(parseInt(e.target.value))}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                {[vn.getFullYear(), vn.getFullYear() - 1, vn.getFullYear() - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="text-xs text-gray-500 ml-2 pb-1">
              {leaveData.filter(e => e.lowLeave).length > 0 && (
                <span className="text-red-600 font-medium">
                  {leaveData.filter(e => e.lowLeave).length} nhân viên sắp hết phép
                </span>
              )}
            </div>
          </div>

          {/* Bảng phép năm */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="font-bold text-sm md:text-base">Tổng hợp phép năm {leaveYear}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-600">Nhân viên</th>
                    <th className="text-left p-3 font-medium text-gray-600">Phòng ban</th>
                    <th className="text-center p-3 font-medium text-gray-600">Phép năm</th>
                    <th className="text-center p-3 font-medium text-gray-600">Nghỉ ốm</th>
                    <th className="text-center p-3 font-medium text-gray-600">Còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-400">
                        Chưa có dữ liệu phép năm
                      </td>
                    </tr>
                  ) : leaveData.map(emp => (
                    <tr key={emp.id} className={`border-t hover:bg-gray-50 ${emp.lowLeave ? 'bg-red-50/50' : ''}`}>
                      <td className="p-3 font-medium text-gray-800">
                        {emp.name}
                        {emp.lowLeave && (
                          <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Sắp hết</span>
                        )}
                      </td>
                      <td className="p-3 text-gray-600">{emp.department}</td>
                      <td className="p-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-gray-500">{emp.annualUsed}/{emp.annualTotal}</span>
                          <div className="w-full max-w-[80px] bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                emp.annualUsed / emp.annualTotal > 0.8 ? 'bg-red-500' :
                                emp.annualUsed / emp.annualTotal > 0.5 ? 'bg-yellow-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(100, (emp.annualUsed / emp.annualTotal) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-gray-500">{emp.sickUsed}/{emp.sickTotal}</span>
                          <div className="w-full max-w-[80px] bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                emp.sickUsed / emp.sickTotal > 0.8 ? 'bg-red-500' :
                                emp.sickUsed / emp.sickTotal > 0.5 ? 'bg-yellow-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${Math.min(100, (emp.sickUsed / emp.sickTotal) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`font-bold text-base ${
                          emp.totalRemaining <= 2 ? 'text-red-600' :
                          emp.totalRemaining <= 5 ? 'text-orange-600' : 'text-green-600'
                        }`}>
                          {emp.totalRemaining}
                        </span>
                        <span className="text-xs text-gray-400 ml-0.5">ngày</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* C. KPI TAB */}
      {/* ============================================================ */}
      {activeSubTab === 'kpi' && (
        <div className="space-y-4">
          {/* Bộ lọc */}
          <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kỳ đánh giá</label>
              <input
                type="month"
                value={kpiPeriod}
                onChange={e => setKpiPeriod(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phòng ban</label>
              <select
                value={kpiDeptFilter}
                onChange={e => setKpiDeptFilter(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="all">Tất cả phòng ban</option>
                {(departments || []).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="text-xs text-gray-500 pb-1 ml-2">
              {filteredKpis.length} đánh giá
            </div>
          </div>

          {/* Thẻ tổng hợp KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(KPI_RATINGS).map(([key, rating]) => {
              const count = filteredKpis.filter(k => {
                const score = parseFloat(k.total_score || k.score || 0);
                if (key === 'A') return score >= 90;
                if (key === 'B') return score >= 75 && score < 90;
                if (key === 'C') return score >= 60 && score < 75;
                return score < 60;
              }).length;
              const bgColor = key === 'A' ? 'bg-green-50 border-green-200' :
                key === 'B' ? 'bg-blue-50 border-blue-200' :
                key === 'C' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
              const textColor = key === 'A' ? 'text-green-700' :
                key === 'B' ? 'text-blue-700' :
                key === 'C' ? 'text-yellow-700' : 'text-red-700';
              return (
                <div key={key} className={`${bgColor} rounded-xl border p-3`}>
                  <div className={`text-xs font-medium ${textColor} opacity-80`}>Xếp hạng {key}</div>
                  <div className={`text-2xl font-bold ${textColor}`}>{count}</div>
                  <div className="text-xs text-gray-500">{rating.label}</div>
                </div>
              );
            })}
          </div>

          {/* Biểu đồ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* BarChart: KPI trung bình theo phòng ban */}
            {kpiDeptAvg.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <h3 className="font-bold text-sm mb-4">Điểm KPI trung bình theo phòng ban</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={kpiDeptAvg}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} width={35} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Điểm TB" fill="#16a34a" radius={[4, 4, 0, 0]}>
                      {kpiDeptAvg.map((_, idx) => (
                        <Cell key={idx} fill={DEPT_COLORS[idx % DEPT_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* PieChart: Phân bố xếp hạng */}
            {kpiRatingDist.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <h3 className="font-bold text-sm mb-4">Phân bố xếp hạng KPI</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={kpiRatingDist}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={40}
                      dataKey="value"
                      label={renderPieLabel}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {kpiRatingDist.map((entry, idx) => (
                        <Cell key={idx} fill={KPI_RATING_COLORS[entry.rating] || COLORS[idx]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Top 10 nhân viên KPI */}
          {topKpiEmployees.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="p-4 border-b">
                <h3 className="font-bold text-sm md:text-base">Top 10 nhân viên điểm KPI cao nhất</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-center p-3 font-medium text-gray-600 w-12">#</th>
                      <th className="text-left p-3 font-medium text-gray-600">Nhân viên</th>
                      <th className="text-left p-3 font-medium text-gray-600">Phòng ban</th>
                      <th className="text-center p-3 font-medium text-gray-600">Điểm</th>
                      <th className="text-center p-3 font-medium text-gray-600">Xếp hạng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topKpiEmployees.map((emp, idx) => {
                      const rating = emp.score >= 90 ? 'A' : emp.score >= 75 ? 'B' : emp.score >= 60 ? 'C' : 'D';
                      const ratingColor = rating === 'A' ? 'bg-green-100 text-green-700' :
                        rating === 'B' ? 'bg-blue-100 text-blue-700' :
                        rating === 'C' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
                      return (
                        <tr key={emp.id} className="border-t hover:bg-gray-50">
                          <td className="p-3 text-center font-medium text-gray-400">{idx + 1}</td>
                          <td className="p-3 font-medium text-gray-800">{emp.name}</td>
                          <td className="p-3 text-gray-600">{emp.department}</td>
                          <td className="p-3 text-center">
                            <span className="font-bold text-green-700">{emp.score}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ratingColor}`}>
                              {rating} - {KPI_RATINGS[rating]?.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Xu hướng KPI 6 tháng */}
          {kpiTrendData.some(m => m.count > 0) && (
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <h3 className="font-bold text-sm mb-4">Xu hướng điểm KPI trung bình (6 tháng gần nhất)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={kpiTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} width={35} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Điểm TB"
                    stroke="#16a34a"
                    strokeWidth={2.5}
                    dot={{ r: 5, fill: '#16a34a' }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {filteredKpis.length === 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-12 text-center text-gray-400">
              Chưa có dữ liệu KPI cho kỳ này
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* D. BIẾN ĐỘNG TAB */}
      {/* ============================================================ */}
      {activeSubTab === 'turnover' && (
        <div className="space-y-4">
          {/* Bộ lọc */}
          <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-3 items-end">
            <div className="flex gap-2">
              <button
                onClick={() => setTurnoverMode('year')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  turnoverMode === 'year' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Theo năm
              </button>
              <button
                onClick={() => setTurnoverMode('custom')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  turnoverMode === 'custom' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Tùy chọn
              </button>
            </div>
            {turnoverMode === 'year' ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Năm</label>
                <select
                  value={turnoverYear}
                  onChange={e => setTurnoverYear(parseInt(e.target.value))}
                  className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  {[vn.getFullYear(), vn.getFullYear() - 1, vn.getFullYear() - 2, vn.getFullYear() - 3].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Từ</label>
                  <input
                    type="date"
                    value={turnoverFrom}
                    onChange={e => setTurnoverFrom(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Đến</label>
                  <input
                    type="date"
                    value={turnoverTo}
                    onChange={e => setTurnoverTo(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Thẻ tổng hợp */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-green-50 rounded-xl border border-green-200 p-3">
              <div className="text-xs text-green-600 font-medium">Tổng nhân sự</div>
              <div className="text-2xl font-bold text-green-700">{activeEmployees.length}</div>
              <div className="text-xs text-gray-500">đang làm việc</div>
            </div>
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-3">
              <div className="text-xs text-blue-600 font-medium">Tuyển mới</div>
              <div className="text-2xl font-bold text-blue-700">
                {turnoverMonthlyData.reduce((s, m) => s + m['Tuyển mới'], 0)}
              </div>
              <div className="text-xs text-gray-500">trong kỳ</div>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-3">
              <div className="text-xs text-red-600 font-medium">Nghỉ việc</div>
              <div className="text-2xl font-bold text-red-700">
                {turnoverMonthlyData.reduce((s, m) => s + m['Nghỉ việc'], 0)}
              </div>
              <div className="text-xs text-gray-500">trong kỳ</div>
            </div>
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-3">
              <div className="text-xs text-purple-600 font-medium">Phòng ban</div>
              <div className="text-2xl font-bold text-purple-700">{headcountByDept.length}</div>
              <div className="text-xs text-gray-500">đang hoạt động</div>
            </div>
          </div>

          {/* Biểu đồ cột: Tuyển mới vs Nghỉ việc */}
          {turnoverMonthlyData.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <h3 className="font-bold text-sm mb-4">Tuyển mới và nghỉ việc theo tháng</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={turnoverMonthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="Tuyển mới" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Nghỉ việc" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PieChart: Nhân sự theo phòng ban */}
            {headcountByDept.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <h3 className="font-bold text-sm mb-4">Nhân sự theo phòng ban</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={headcountByDept}
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      innerRadius={45}
                      dataKey="value"
                      label={renderPieLabel}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {headcountByDept.map((_, idx) => (
                        <Cell key={idx} fill={DEPT_COLORS[idx % DEPT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* PieChart: Loại hợp đồng */}
            {employmentTypeDist.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <h3 className="font-bold text-sm mb-4">Phân bố loại hợp đồng</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={employmentTypeDist}
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      innerRadius={45}
                      dataKey="value"
                      label={renderPieLabel}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {employmentTypeDist.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* LineChart: Xu hướng nhân sự */}
          {headcountTrendData.length > 1 && (
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <h3 className="font-bold text-sm mb-4">Xu hướng nhân sự theo thời gian</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={headcountTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} width={35} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Nhân sự"
                    stroke="#16a34a"
                    strokeWidth={2.5}
                    dot={{ r: 5, fill: '#16a34a' }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-gray-400 text-center">
        {activeEmployees.length} nhân viên đang làm việc
        {attendances ? ` | ${attendances.length} bản ghi chấm công` : ''}
        {kpiEvaluations ? ` | ${kpiEvaluations.length} đánh giá KPI` : ''}
      </div>
    </div>
  );
}

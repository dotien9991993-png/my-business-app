import React, { useState, useMemo, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { KPI_RATINGS, DEFAULT_PAYROLL_CONFIG } from '../../constants/hrmConstants';
import { getVietnamDate, getNowISOVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';

// ============ CONSTANTS ============

const PAYROLL_STATUSES = {
  draft: { label: 'Nháp', color: 'bg-gray-100 text-gray-700' },
  calculated: { label: 'Đã tính', color: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Đã duyệt', color: 'bg-green-100 text-green-700' },
  paid: { label: 'Đã chi', color: 'bg-purple-100 text-purple-700' },
};

const ALLOWANCE_TYPES = [
  { key: 'lunch', label: 'Ăn trưa' },
  { key: 'transport', label: 'Xăng xe' },
  { key: 'phone', label: 'Điện thoại' },
  { key: 'other', label: 'Khác' },
];

// ============ HELPERS ============

const fmt = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + 'đ';
};

const pad = (n) => String(n).padStart(2, '0');

const getMonthOptions = () => {
  const vn = getVietnamDate();
  const options = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(vn.getFullYear(), vn.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    options.push({
      value: `${y}-${pad(m)}`,
      label: `Tháng ${m}/${y}`,
      year: y,
      month: m,
    });
  }
  return options;
};

const getMonthRange = (monthStr) => {
  const [y, m] = monthStr.split('-').map(Number);
  const from = `${y}-${pad(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${pad(m)}-${pad(lastDay)}`;
  return { from, to, year: y, month: m };
};

// Tính ngày công từ attendance
const countWorkingDays = (attendances, employeeId, monthFrom, monthTo) => {
  const validStatuses = ['present', 'late', 'early_leave'];
  return (attendances || []).filter((a) => {
    if (a.employee_id !== employeeId) return false;
    if (!a.date) return false;
    const d = a.date.substring(0, 10);
    return d >= monthFrom && d <= monthTo && validStatuses.includes(a.status);
  }).length;
};

// Tính nửa ngày (half_day counts as 0.5)
const countHalfDays = (attendances, employeeId, monthFrom, monthTo) => {
  return (attendances || []).filter((a) => {
    if (a.employee_id !== employeeId) return false;
    if (!a.date) return false;
    const d = a.date.substring(0, 10);
    return d >= monthFrom && d <= monthTo && a.status === 'half_day';
  }).length;
};

// Tổng giờ tăng ca
const sumOvertimeHours = (attendances, employeeId, monthFrom, monthTo) => {
  return (attendances || []).reduce((sum, a) => {
    if (a.employee_id !== employeeId) return sum;
    if (!a.date) return sum;
    const d = a.date.substring(0, 10);
    if (d < monthFrom || d > monthTo) return sum;
    return sum + (parseFloat(a.overtime_hours) || 0);
  }, 0);
};

// Lấy KPI rating cho nhân viên trong kỳ
const getKpiRating = (kpiEvaluations, employeeId, year, month) => {
  if (!kpiEvaluations || !kpiEvaluations.length) return null;

  const periodStr = `${year}-${String(month).padStart(2, '0')}`;

  // Tìm đánh giá KPI cho period này
  const evaluation = kpiEvaluations.find((e) => {
    if (e.employee_id !== employeeId) return false;
    if (e.status !== 'completed' && e.status !== 'manager_reviewed') return false;
    return e.period === periodStr;
  });

  return evaluation ? evaluation.rating : null;
};

const getKpiBonus = (rating) => {
  if (!rating || !KPI_RATINGS[rating]) return 0;
  return KPI_RATINGS[rating].bonus;
};

// ============ MAIN COMPONENT ============

export default function HrmPayrollView({
  employees,
  departments,
  positions,
  attendances,
  kpiEvaluations,
  loadHrmData,
  tenant,
  currentUser,
  canEdit,
}) {
  // ---- State ----
  const vn = getVietnamDate();
  const currentMonth = `${vn.getFullYear()}-${pad(vn.getMonth() + 1)}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [payrollData, setPayrollData] = useState([]);
  const [payrollStatus, setPayrollStatus] = useState('draft'); // draft, calculated, approved, paid
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [editingCell, setEditingCell] = useState(null); // { employeeId, field }
  const [editValue, setEditValue] = useState('');
  const [showDetail, setShowDetail] = useState(null); // employee payroll detail
  const [, setSavedPayrollId] = useState(null);

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const { from: monthFrom, to: monthTo, year: monthYear, month: monthNum } = useMemo(
    () => getMonthRange(selectedMonth),
    [selectedMonth]
  );

  // ---- Lọc nhân viên active ----
  const activeEmployees = useMemo(() => {
    let list = (employees || []).filter((e) => e.status === 'active');
    if (filterDepartment !== 'all') {
      list = list.filter((e) => e.department_id === filterDepartment);
    }
    if (searchText.trim()) {
      const s = searchText.toLowerCase().trim();
      list = list.filter(
        (e) =>
          (e.full_name || '').toLowerCase().includes(s) ||
          (e.employee_code || '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [employees, filterDepartment, searchText]);

  // ---- Tên phòng ban / chức vụ ----
  const getDeptName = useCallback(
    (deptId) => {
      const d = (departments || []).find((x) => x.id === deptId);
      return d ? d.name : '—';
    },
    [departments]
  );

  const getPositionName = useCallback(
    (posId) => {
      const p = (positions || []).find((x) => x.id === posId);
      return p ? p.name : '—';
    },
    [positions]
  );

  // ---- Tạo bảng lương ----
  const handleGeneratePayroll = useCallback(() => {
    setLoading(true);
    try {
      const config = DEFAULT_PAYROLL_CONFIG;
      const rows = activeEmployees.map((emp) => {
        const baseSalary = parseFloat(emp.base_salary) || 0;
        const dailyRate = baseSalary / config.workingDaysPerMonth;
        const hourlyRate = dailyRate / config.hoursPerDay;

        // Ngày công
        const fullDays = countWorkingDays(attendances, emp.id, monthFrom, monthTo);
        const halfDays = countHalfDays(attendances, emp.id, monthFrom, monthTo);
        const workingDays = fullDays + halfDays * 0.5;

        // Tăng ca
        const overtimeHours = sumOvertimeHours(attendances, emp.id, monthFrom, monthTo);

        // KPI
        const kpiRating = getKpiRating(kpiEvaluations, emp.id, monthYear, monthNum);
        const kpiBonus = getKpiBonus(kpiRating);

        // Tính lương
        const basicPay = dailyRate * workingDays;
        const overtimePay = overtimeHours * hourlyRate * config.overtimeRate;
        const allowances = 0; // Mặc định 0, admin có thể chỉnh
        const socialInsurance = baseSalary * config.socialInsuranceRate;
        const extraDeduction = 0; // Khấu trừ thêm (admin chỉnh)
        const totalDeduction = socialInsurance + extraDeduction;
        const netPay = basicPay + overtimePay + kpiBonus + allowances - totalDeduction;

        return {
          employee_id: emp.id,
          employee_code: emp.employee_code || '',
          employee_name: emp.full_name || '',
          department_id: emp.department_id,
          position_id: emp.position_id,
          base_salary: baseSalary,
          working_days: workingDays,
          overtime_hours: overtimeHours,
          overtime_pay: overtimePay,
          kpi_rating: kpiRating,
          kpi_bonus: kpiBonus,
          allowances: allowances,
          allowance_detail: { lunch: 0, transport: 0, phone: 0, other: 0 },
          social_insurance: socialInsurance,
          extra_deduction: extraDeduction,
          total_deduction: totalDeduction,
          basic_pay: basicPay,
          net_pay: netPay,
        };
      });

      setPayrollData(rows);
      setPayrollStatus('calculated');
    } catch (err) {
      console.error('Lỗi tạo bảng lương:', err);
      alert('Có lỗi xảy ra khi tạo bảng lương');
    } finally {
      setLoading(false);
    }
  }, [activeEmployees, attendances, kpiEvaluations, monthFrom, monthTo, monthYear, monthNum]);

  // ---- Recalculate single row ----
  const recalcRow = (row) => {
    const config = DEFAULT_PAYROLL_CONFIG;
    const dailyRate = row.base_salary / config.workingDaysPerMonth;
    const hourlyRate = dailyRate / config.hoursPerDay;
    const basicPay = dailyRate * row.working_days;
    const overtimePay = row.overtime_hours * hourlyRate * config.overtimeRate;
    const totalAllowances = Object.values(row.allowance_detail || {}).reduce(
      (s, v) => s + (parseFloat(v) || 0),
      0
    );
    const socialInsurance = row.base_salary * config.socialInsuranceRate;
    const totalDeduction = socialInsurance + (parseFloat(row.extra_deduction) || 0);
    const netPay =
      basicPay + overtimePay + row.kpi_bonus + totalAllowances - totalDeduction;

    return {
      ...row,
      basic_pay: basicPay,
      overtime_pay: overtimePay,
      allowances: totalAllowances,
      social_insurance: socialInsurance,
      total_deduction: totalDeduction,
      net_pay: netPay,
    };
  };

  // ---- Edit cell ----
  const handleStartEdit = (employeeId, field, currentValue) => {
    if (payrollStatus === 'approved' || payrollStatus === 'paid') return;
    setEditingCell({ employeeId, field });
    setEditValue(String(currentValue || 0));
  };

  const handleSaveEdit = () => {
    if (!editingCell) return;
    const { employeeId, field } = editingCell;
    const numValue = parseFloat(editValue) || 0;

    setPayrollData((prev) =>
      prev.map((row) => {
        if (row.employee_id !== employeeId) return row;

        let updated = { ...row };

        if (field === 'extra_deduction') {
          updated.extra_deduction = numValue;
        } else if (field.startsWith('allowance_')) {
          const key = field.replace('allowance_', '');
          updated.allowance_detail = { ...updated.allowance_detail, [key]: numValue };
        }

        return recalcRow(updated);
      })
    );

    setEditingCell(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // ---- Duyệt bảng lương → tạo phiếu chi ----
  const handleApprovePayroll = async () => {
    if (!payrollData.length) return;
    if (!confirm('Xác nhận duyệt bảng lương và tạo phiếu chi cho tất cả nhân viên?')) return;

    setApproving(true);
    try {
      const receipts = payrollData
        .filter((row) => row.net_pay > 0)
        .map((row) => ({
          tenant_id: tenant.id,
          type: 'chi',
          category: 'Lương',
          amount: Math.round(row.net_pay),
          description: `Lương tháng ${monthNum}/${monthYear} - ${row.employee_name} (${row.employee_code})`,
          date: getNowISOVN(),
          status: 'approved',
          created_by: currentUser?.id,
          metadata: {
            payroll_month: selectedMonth,
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            base_salary: row.base_salary,
            working_days: row.working_days,
            overtime_hours: row.overtime_hours,
            kpi_rating: row.kpi_rating,
            kpi_bonus: row.kpi_bonus,
            allowances: row.allowances,
            total_deduction: row.total_deduction,
          },
        }));

      if (receipts.length > 0) {
        const { error } = await supabase.from('receipts_payments').insert(receipts);
        if (error) throw error;
      }

      // Lưu bảng lương vào DB
      const payrollRecord = {
        tenant_id: tenant.id,
        month: selectedMonth,
        status: 'approved',
        total_net_pay: Math.round(payrollData.reduce((s, r) => s + r.net_pay, 0)),
        total_employees: payrollData.length,
        data: payrollData,
        approved_by: currentUser?.id,
        approved_at: getNowISOVN(),
        created_by: currentUser?.id,
      };

      const { data: savedPayroll, error: payrollError } = await supabase
        .from('payrolls')
        .upsert(payrollRecord, { onConflict: 'tenant_id,month' })
        .select()
        .single();

      if (payrollError) {
        console.warn('Lưu payroll record thất bại (bảng chưa tồn tại?):', payrollError.message);
      } else if (savedPayroll) {
        setSavedPayrollId(savedPayroll.id);
      }

      setPayrollStatus('approved');

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'approve', entityType: 'payroll',
        description: `Duyệt bảng lương tháng ${selectedMonth}, ${payrollData.length} nhân viên, tạo ${receipts.length} phiếu chi`
      });

      alert(`Đã duyệt bảng lương và tạo ${receipts.length} phiếu chi thành công!`);

      if (loadHrmData) loadHrmData();
    } catch (err) {
      console.error('Lỗi duyệt bảng lương:', err);
      alert('Có lỗi xảy ra: ' + (err.message || 'Không xác định'));
    } finally {
      setApproving(false);
    }
  };

  // ---- Export CSV ----
  const handleExportCSV = useCallback(() => {
    if (!payrollData.length) return;

    const headers = [
      'Mã NV',
      'Họ tên',
      'Phòng ban',
      'Chức vụ',
      'Lương CB',
      'Ngày công',
      'Tăng ca (h)',
      'Lương cơ bản',
      'Tăng ca',
      'KPI Rating',
      'Thưởng KPI',
      'Phụ cấp',
      'BHXH',
      'Khấu trừ khác',
      'Tổng khấu trừ',
      'Thực nhận',
    ];

    const rows = payrollData.map((row) => [
      row.employee_code,
      row.employee_name,
      getDeptName(row.department_id),
      getPositionName(row.position_id),
      Math.round(row.base_salary),
      row.working_days,
      row.overtime_hours,
      Math.round(row.basic_pay),
      Math.round(row.overtime_pay),
      row.kpi_rating || '—',
      Math.round(row.kpi_bonus),
      Math.round(row.allowances),
      Math.round(row.social_insurance),
      Math.round(row.extra_deduction),
      Math.round(row.total_deduction),
      Math.round(row.net_pay),
    ]);

    // BOM for UTF-8
    const bom = '\uFEFF';
    const csvContent =
      bom +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bang_luong_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [payrollData, selectedMonth, getDeptName, getPositionName]);

  // ---- Summary totals ----
  const summary = useMemo(() => {
    if (!payrollData.length) {
      return {
        totalBasicPay: 0,
        totalOvertimePay: 0,
        totalKpiBonus: 0,
        totalAllowances: 0,
        totalDeduction: 0,
        totalNetPay: 0,
        totalOvertimeHours: 0,
        avgNetPay: 0,
        count: 0,
      };
    }

    const totalBasicPay = payrollData.reduce((s, r) => s + r.basic_pay, 0);
    const totalOvertimePay = payrollData.reduce((s, r) => s + r.overtime_pay, 0);
    const totalKpiBonus = payrollData.reduce((s, r) => s + r.kpi_bonus, 0);
    const totalAllowances = payrollData.reduce((s, r) => s + r.allowances, 0);
    const totalDeduction = payrollData.reduce((s, r) => s + r.total_deduction, 0);
    const totalNetPay = payrollData.reduce((s, r) => s + r.net_pay, 0);
    const totalOvertimeHours = payrollData.reduce((s, r) => s + r.overtime_hours, 0);

    return {
      totalBasicPay,
      totalOvertimePay,
      totalKpiBonus,
      totalAllowances,
      totalDeduction,
      totalNetPay,
      totalOvertimeHours,
      avgNetPay: totalNetPay / payrollData.length,
      count: payrollData.length,
    };
  }, [payrollData]);

  // === PERMISSION GUARD: Chỉ level 3 / Admin mới xem được bảng lương ===
  if (canEdit && !canEdit('hrm')) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
          <p className="text-red-600">Bạn không có quyền xem bảng lương. Vui lòng liên hệ Admin.</p>
        </div>
      </div>
    );
  }

  // ---- KPI badge color ----
  const getKpiBadge = (rating) => {
    if (!rating) return <span className="text-gray-400 text-xs">—</span>;
    const r = KPI_RATINGS[rating];
    if (!r) return <span className="text-gray-400 text-xs">{rating}</span>;

    const colorMap = {
      green: 'bg-green-100 text-green-700',
      blue: 'bg-blue-100 text-blue-700',
      yellow: 'bg-yellow-100 text-yellow-700',
      red: 'bg-red-100 text-red-700',
    };

    return (
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[r.color] || 'bg-gray-100 text-gray-700'}`}
      >
        {rating} - {r.label}
      </span>
    );
  };

  // ---- Editable cell renderer ----
  const renderEditableCell = (row, field, value) => {
    const isEditing =
      editingCell &&
      editingCell.employeeId === row.employee_id &&
      editingCell.field === field;
    const isLocked = payrollStatus === 'approved' || payrollStatus === 'paid';

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-24 px-1 py-0.5 border rounded text-xs text-right"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            autoFocus
          />
          <button
            onClick={handleSaveEdit}
            className="text-green-600 hover:text-green-800 text-xs"
            title="Lưu"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <button
            onClick={handleCancelEdit}
            className="text-red-500 hover:text-red-700 text-xs"
            title="Hủy"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      );
    }

    return (
      <span
        className={`cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded text-xs ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
        onClick={() => !isLocked && handleStartEdit(row.employee_id, field, value)}
        title={isLocked ? 'Bảng lương đã duyệt' : 'Nhấn để chỉnh sửa'}
      >
        {fmt(value)}
      </span>
    );
  };

  // ---- Detail modal ----
  const renderDetailModal = () => {
    if (!showDetail) return null;

    const row = showDetail;
    const config = DEFAULT_PAYROLL_CONFIG;

    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-green-700 text-white px-5 py-4 rounded-t-xl flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">Chi tiết lương</h3>
              <p className="text-green-100 text-sm">
                Tháng {monthNum}/{monthYear}
              </p>
            </div>
            <button
              onClick={() => setShowDetail(null)}
              className="text-white/80 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* Thông tin NV */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-lg">
                  {(row.employee_name || '?')[0]}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{row.employee_name}</div>
                  <div className="text-xs text-gray-500">
                    {row.employee_code} | {getDeptName(row.department_id)} |{' '}
                    {getPositionName(row.position_id)}
                  </div>
                </div>
              </div>
            </div>

            {/* Chi tiết tính lương */}
            <div className="space-y-2 text-sm">
              <h4 className="font-semibold text-gray-700 border-b pb-1">Thu nhập</h4>

              <div className="flex justify-between">
                <span className="text-gray-600">Lương cơ bản</span>
                <span className="font-medium">{fmt(row.base_salary)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">
                  Ngày công: {row.working_days}/{config.workingDaysPerMonth} ngày
                </span>
                <span className="font-medium text-green-700">{fmt(row.basic_pay)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">
                  Tăng ca: {row.overtime_hours}h x {fmt(row.base_salary / config.workingDaysPerMonth / config.hoursPerDay)} x{' '}
                  {config.overtimeRate}
                </span>
                <span className="font-medium text-blue-700">{fmt(row.overtime_pay)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">
                  Thưởng KPI: {row.kpi_rating ? `Hạng ${row.kpi_rating}` : 'Chưa có'}
                </span>
                <span className="font-medium text-purple-700">{fmt(row.kpi_bonus)}</span>
              </div>

              {/* Phụ cấp chi tiết */}
              <div className="flex justify-between">
                <span className="text-gray-600">Phụ cấp tổng</span>
                <span className="font-medium text-orange-700">{fmt(row.allowances)}</span>
              </div>
              {row.allowance_detail && Object.entries(row.allowance_detail).map(([key, val]) => {
                if (!val) return null;
                const label = ALLOWANCE_TYPES.find((a) => a.key === key)?.label || key;
                return (
                  <div key={key} className="flex justify-between pl-4 text-xs text-gray-500">
                    <span>+ {label}</span>
                    <span>{fmt(val)}</span>
                  </div>
                );
              })}

              <h4 className="font-semibold text-gray-700 border-b pb-1 mt-3">Khấu trừ</h4>
              <div className="flex justify-between">
                <span className="text-gray-600">
                  BHXH ({(config.socialInsuranceRate * 100).toFixed(1)}%)
                </span>
                <span className="font-medium text-red-600">-{fmt(row.social_insurance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Khấu trừ khác</span>
                <span className="font-medium text-red-600">
                  -{fmt(row.extra_deduction)}
                </span>
              </div>

              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between text-base font-bold">
                  <span className="text-gray-800">Thực nhận</span>
                  <span className="text-green-700">{fmt(row.net_pay)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t bg-gray-50 rounded-b-xl flex justify-end">
            <button
              onClick={() => setShowDetail(null)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ---- Phụ cấp editor (inline for allowances) ----
  const renderAllowanceEditor = (row) => {
    const isLocked = payrollStatus === 'approved' || payrollStatus === 'paid';
    const detail = row.allowance_detail || { lunch: 0, transport: 0, phone: 0, other: 0 };
    const total = Object.values(detail).reduce((s, v) => s + (parseFloat(v) || 0), 0);

    return (
      <div className="relative group">
        <span
          className={`cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded text-xs ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
          title="Nhấn để xem chi tiết phụ cấp"
        >
          {fmt(total)}
        </span>
        {/* Tooltip on hover */}
        {!isLocked && (
          <div className="absolute z-30 bottom-full left-0 mb-1 hidden group-hover:block bg-white border shadow-lg rounded-lg p-3 w-56">
            <div className="text-xs font-semibold text-gray-700 mb-2">Phụ cấp chi tiết</div>
            {ALLOWANCE_TYPES.map((type) => (
              <div key={type.key} className="flex items-center gap-2 mb-1.5">
                <label className="text-xs text-gray-600 w-16">{type.label}:</label>
                <input
                  type="number"
                  className="flex-1 px-2 py-1 border rounded text-xs text-right"
                  value={detail[type.key] || 0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setPayrollData((prev) =>
                      prev.map((r) => {
                        if (r.employee_id !== row.employee_id) return r;
                        const updated = {
                          ...r,
                          allowance_detail: { ...r.allowance_detail, [type.key]: val },
                        };
                        return recalcRow(updated);
                      })
                    );
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ============ RENDER ============
  return (
    <div className="space-y-4">
      {/* ---- Stats Cards ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Tổng quỹ lương tháng</div>
          <div className="text-xl font-bold text-green-700">{fmt(summary.totalNetPay)}</div>
          <div className="text-xs text-gray-400 mt-1">{summary.count} nhân viên</div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Trung bình lương thực nhận</div>
          <div className="text-xl font-bold text-blue-700">{fmt(summary.avgNetPay)}</div>
          <div className="text-xs text-gray-400 mt-1">/ nhân viên</div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Tổng giờ tăng ca</div>
          <div className="text-xl font-bold text-orange-600">
            {summary.totalOvertimeHours.toFixed(1)}h
          </div>
          <div className="text-xs text-gray-400 mt-1">{fmt(summary.totalOvertimePay)}</div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Tổng thưởng KPI</div>
          <div className="text-xl font-bold text-purple-700">{fmt(summary.totalKpiBonus)}</div>
          <div className="text-xs text-gray-400 mt-1">
            {payrollData.filter((r) => r.kpi_rating).length}/{summary.count} có KPI
          </div>
        </div>
      </div>

      {/* ---- Toolbar ---- */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Chọn tháng */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Kỳ lương:</label>
            <select
              className="border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setPayrollData([]);
                setPayrollStatus('draft');
              }}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc phòng ban */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Phòng ban:</label>
            <select
              className="border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
            >
              <option value="all">Tất cả</option>
              {(departments || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tìm kiếm */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Tìm nhân viên..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>

          {/* Trạng thái */}
          {payrollStatus !== 'draft' && (
            <span
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${PAYROLL_STATUSES[payrollStatus]?.color || 'bg-gray-100 text-gray-700'}`}
            >
              {PAYROLL_STATUSES[payrollStatus]?.label || payrollStatus}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
          <button
            onClick={handleGeneratePayroll}
            disabled={loading || payrollStatus === 'approved'}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2 transition-colors"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Đang tính...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                {payrollData.length ? 'Tính lại bảng lương' : 'Tạo bảng lương tháng'}
              </>
            )}
          </button>

          {payrollData.length > 0 && payrollStatus === 'calculated' && (
            <button
              onClick={handleApprovePayroll}
              disabled={approving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              {approving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Đang duyệt...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Duyệt bảng lương
                </>
              )}
            </button>
          )}

          {payrollData.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Xuất CSV
            </button>
          )}

          {/* Thông tin tổng hợp nhỏ */}
          <div className="ml-auto text-xs text-gray-500">
            {activeEmployees.length} nhân viên đang hoạt động
          </div>
        </div>
      </div>

      {/* ---- Empty state ---- */}
      {payrollData.length === 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-12 text-center">
          <svg
            className="w-16 h-16 mx-auto text-gray-300 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <h3 className="text-gray-500 font-medium text-lg mb-2">Chưa có bảng lương</h3>
          <p className="text-gray-400 text-sm mb-4">
            Chọn kỳ lương và nhấn "Tạo bảng lương tháng" để tự động tính lương cho tất cả nhân
            viên dựa trên dữ liệu chấm công và KPI.
          </p>
          <div className="text-xs text-gray-400 space-y-1">
            <p>Công thức: Lương thực = Lương CB / 26 x Ngày công</p>
            <p>Tăng ca = Giờ TC x (Lương CB / 26 / 8) x 1.5</p>
            <p>BHXH = Lương CB x 10.5%</p>
          </div>
        </div>
      )}

      {/* ---- Payroll Table ---- */}
      {payrollData.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-green-50 border-b border-green-100">
                  <th className="text-left px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap sticky left-0 bg-green-50 z-10">
                    #
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap sticky left-8 bg-green-50 z-10 min-w-[160px]">
                    Nhân viên
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap">
                    Lương CB
                  </th>
                  <th className="text-center px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap">
                    Ngày công
                  </th>
                  <th className="text-center px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap">
                    Tăng ca (h)
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap">
                    Lương thực
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap">
                    Tiền TC
                  </th>
                  <th className="text-center px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap">
                    KPI
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap">
                    Thưởng KPI
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap">
                    Phụ cấp
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap">
                    Khấu trừ
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-green-800 text-xs whitespace-nowrap">
                    Thực nhận
                  </th>
                  <th className="px-3 py-3 text-center font-semibold text-green-800 text-xs whitespace-nowrap">
                    Chi tiết
                  </th>
                </tr>
              </thead>
              <tbody>
                {payrollData.map((row, idx) => (
                  <tr
                    key={row.employee_id}
                    className={`border-b hover:bg-green-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                  >
                    <td className="px-3 py-2.5 text-xs text-gray-400 sticky left-0 bg-inherit z-10">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 sticky left-8 bg-inherit z-10">
                      <div className="font-medium text-gray-900 text-xs">{row.employee_name}</div>
                      <div className="text-[10px] text-gray-500">
                        {row.employee_code} | {getDeptName(row.department_id)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-700">
                      {fmt(row.base_salary)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      <span
                        className={`font-medium ${row.working_days >= DEFAULT_PAYROLL_CONFIG.workingDaysPerMonth ? 'text-green-700' : 'text-orange-600'}`}
                      >
                        {row.working_days}
                      </span>
                      <span className="text-gray-400">/{DEFAULT_PAYROLL_CONFIG.workingDaysPerMonth}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-700">
                      {row.overtime_hours > 0 ? (
                        <span className="text-blue-600 font-medium">{row.overtime_hours.toFixed(1)}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium text-gray-800">
                      {fmt(row.basic_pay)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-blue-700">
                      {row.overtime_pay > 0 ? fmt(row.overtime_pay) : <span className="text-gray-400">0đ</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">{getKpiBadge(row.kpi_rating)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-purple-700">
                      {row.kpi_bonus > 0 ? fmt(row.kpi_bonus) : <span className="text-gray-400">0đ</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {renderAllowanceEditor(row)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-red-600">-{fmt(row.social_insurance)}</span>
                        {renderEditableCell(row, 'extra_deduction', row.extra_deduction)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={`font-bold text-sm ${row.net_pay >= 0 ? 'text-green-700' : 'text-red-600'}`}
                      >
                        {fmt(row.net_pay)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => setShowDetail(row)}
                        className="text-green-600 hover:text-green-800 hover:bg-green-50 rounded p-1 transition-colors"
                        title="Xem chi tiết"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}

                {/* ---- Summary row ---- */}
                <tr className="bg-green-100/70 border-t-2 border-green-300 font-semibold">
                  <td className="px-3 py-3 sticky left-0 bg-green-100/70 z-10"></td>
                  <td className="px-3 py-3 text-xs text-green-800 sticky left-8 bg-green-100/70 z-10">
                    Tổng cộng ({summary.count} NV)
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-green-800">
                    {fmt(payrollData.reduce((s, r) => s + r.base_salary, 0))}
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-green-800">
                    {payrollData.reduce((s, r) => s + r.working_days, 0).toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-green-800">
                    {summary.totalOvertimeHours.toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-green-800">
                    {fmt(summary.totalBasicPay)}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-blue-700">
                    {fmt(summary.totalOvertimePay)}
                  </td>
                  <td className="px-3 py-3"></td>
                  <td className="px-3 py-3 text-right text-xs text-purple-700">
                    {fmt(summary.totalKpiBonus)}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-orange-700">
                    {fmt(summary.totalAllowances)}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-red-600">
                    -{fmt(summary.totalDeduction)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-green-800">
                    {fmt(summary.totalNetPay)}
                  </td>
                  <td className="px-3 py-3"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Ghi chú công thức ---- */}
      {payrollData.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-green-800 mb-2">Công thức tính lương</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-green-700">
            <div>
              <span className="font-medium">Lương thực</span> = Lương CB / {DEFAULT_PAYROLL_CONFIG.workingDaysPerMonth} x Ngày công
            </div>
            <div>
              <span className="font-medium">Tăng ca</span> = Giờ TC x (Lương CB / {DEFAULT_PAYROLL_CONFIG.workingDaysPerMonth} / {DEFAULT_PAYROLL_CONFIG.hoursPerDay}) x {DEFAULT_PAYROLL_CONFIG.overtimeRate}
            </div>
            <div>
              <span className="font-medium">Thưởng KPI</span>: A = {fmt(KPI_RATINGS.A.bonus)}, B = {fmt(KPI_RATINGS.B.bonus)}, C = {fmt(KPI_RATINGS.C.bonus)}, D = 0đ
            </div>
            <div>
              <span className="font-medium">BHXH</span> = Lương CB x {(DEFAULT_PAYROLL_CONFIG.socialInsuranceRate * 100).toFixed(1)}% (8% BHXH + 1.5% BHYT + 1% BHTN)
            </div>
            <div className="md:col-span-2">
              <span className="font-medium">Thực nhận</span> = Lương thực + Tăng ca + Thưởng KPI + Phụ cấp - BHXH - Khấu trừ khác
            </div>
          </div>
        </div>
      )}

      {/* ---- Detail modal ---- */}
      {renderDetailModal()}
    </div>
  );
}

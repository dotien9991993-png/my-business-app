import React, { useState, useEffect } from 'react';
import { formatMoney } from '../../utils/formatUtils';
import { supabase } from '../../supabaseClient';

const TechnicalSummaryView = ({
  technicalJobs,
  tenant
}) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [bonusAmounts, setBonusAmounts] = useState({});

  const BASE_WAGE = 200000; // 200,000đ/công việc

  // Load bonus data từ database
  const loadBonuses = async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('technician_bonuses')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('month', selectedMonth)
        .eq('year', selectedYear);

      if (error) throw error;

      const bonusMap = {};
      (data || []).forEach(b => {
        bonusMap[b.technician_name] = b.bonus_amount || 0;
      });
      setBonusAmounts(bonusMap);
    } catch (error) {
      console.error('Error loading bonuses:', error);
    }
  };

  useEffect(() => {
    loadBonuses();
  }, [selectedMonth, selectedYear, tenant]);

  // Lọc công việc hoàn thành trong tháng
  const completedJobsInMonth = technicalJobs.filter(job => {
    if (job.status !== 'Hoàn thành') return false;
    const jobDate = new Date(job.scheduledDate);
    return jobDate.getMonth() + 1 === selectedMonth && jobDate.getFullYear() === selectedYear;
  });

  // Tính toán tổng hợp
  const calculateSummary = () => {
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalWages = 0;

    // Lấy danh sách kỹ thuật viên có công việc trong tháng
    const techniciansInMonth = new Set();

    const jobDetails = completedJobsInMonth.map(job => {
      const revenue = job.customerPayment || 0;
      const expenseItems = job.expenses || [];
      const expenseTotal = expenseItems.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
      const techCount = (job.technicians || []).length;
      const wages = techCount * BASE_WAGE;

      // Lưu danh sách kỹ thuật viên
      (job.technicians || []).forEach(tech => techniciansInMonth.add(tech));

      totalRevenue += revenue;
      totalExpenses += expenseTotal;
      totalWages += wages;

      return {
        ...job,
        revenue,
        expenseItems,
        expenseTotal,
        wages,
        profit: revenue - expenseTotal - wages
      };
    });

    // Chỉ tính công phát sinh của những kỹ thuật viên CÓ công việc trong tháng
    const totalBonus = Array.from(techniciansInMonth)
      .reduce((sum, techName) => sum + (bonusAmounts[techName] || 0), 0);

    totalWages += totalBonus;

    return {
      jobDetails,
      totalRevenue,
      totalExpenses,
      totalWages,
      totalBonus,
      netProfit: totalRevenue - totalExpenses - totalWages
    };
  };

  const summary = calculateSummary();

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-bold">📊 Tổng Hợp Kỹ Thuật</h2>
        <div className="flex gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-lg"
          >
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-lg"
          >
            {[2024,2025,2026,2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Doanh Thu */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-sm text-green-600 font-medium">💰 Doanh Thu</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{formatMoney(summary.totalRevenue)}</div>
          <div className="text-xs text-green-500 mt-1">{completedJobsInMonth.length} công việc hoàn thành</div>
        </div>

        {/* Tổng Chi Phí */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-sm text-red-600 font-medium">💸 Tổng Chi Phí</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{formatMoney(summary.totalExpenses + summary.totalWages)}</div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>• Chi phí lắp đặt:</span>
              <span className="font-medium">{formatMoney(summary.totalExpenses)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>• Tiền công cơ bản:</span>
              <span className="font-medium">{formatMoney(summary.totalWages - summary.totalBonus)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>• Công phát sinh:</span>
              <span className="font-medium">{formatMoney(summary.totalBonus)}</span>
            </div>
          </div>
        </div>

        {/* Còn Lại */}
        <div className={`border rounded-xl p-4 ${summary.netProfit >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className={`text-sm font-medium ${summary.netProfit >= 0 ? 'text-blue-600' : 'text-yellow-600'}`}>📈 Còn Lại</div>
          <div className={`text-2xl font-bold mt-1 ${summary.netProfit >= 0 ? 'text-blue-700' : 'text-yellow-700'}`}>{formatMoney(summary.netProfit)}</div>
          <div className="text-xs text-gray-500 mt-1">Doanh thu - Tổng chi phí</div>
        </div>
      </div>

      {/* Formula */}
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
        <strong>Công thức:</strong> Còn Lại = Doanh Thu - Tổng Chi Phí
        <div className="mt-1">
          {formatMoney(summary.netProfit)} = {formatMoney(summary.totalRevenue)} - {formatMoney(summary.totalExpenses + summary.totalWages)}
        </div>
        <div className="mt-1 text-xs">
          (Tổng chi phí = {formatMoney(summary.totalExpenses)} chi phí lắp đặt + {formatMoney(summary.totalWages - summary.totalBonus)} tiền công CB + {formatMoney(summary.totalBonus)} phát sinh)
        </div>
      </div>

      {/* Job Details */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-4 border-b">
          <h3 className="font-bold text-lg">📋 Chi tiết theo công việc</h3>
        </div>

        {summary.jobDetails.length > 0 ? (
          <div className="divide-y">
            {summary.jobDetails.map(job => (
              <div key={job.id} className="p-4">
                <div className="flex flex-col md:flex-row justify-between items-start gap-2">
                  <div className="flex-1">
                    <div className="font-bold">{job.title}</div>
                    <div className="text-sm text-gray-500">
                      {job.customerName} • {job.scheduledDate}
                    </div>
                    <div className="text-xs text-gray-400">
                      KTV: {(job.technicians || []).join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                      Hoàn thành
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div className="bg-green-50 p-2 rounded">
                    <div className="text-xs text-green-600">Thu</div>
                    <div className="font-bold text-green-700">{formatMoney(job.revenue)}</div>
                  </div>
                  <div className="bg-red-50 p-2 rounded">
                    <div className="text-xs text-red-600">Chi phí</div>
                    <div className="font-bold text-red-700">{formatMoney(job.expenseTotal)}</div>
                  </div>
                  <div className="bg-orange-50 p-2 rounded">
                    <div className="text-xs text-orange-600">Tiền công</div>
                    <div className="font-bold text-orange-700">{formatMoney(job.wages)}</div>
                    <div className="text-xs text-orange-500">{(job.technicians || []).length} người</div>
                  </div>
                  <div className={`p-2 rounded ${job.profit >= 0 ? 'bg-blue-50' : 'bg-yellow-50'}`}>
                    <div className={`text-xs ${job.profit >= 0 ? 'text-blue-600' : 'text-yellow-600'}`}>Còn lại</div>
                    <div className={`font-bold ${job.profit >= 0 ? 'text-blue-700' : 'text-yellow-700'}`}>{formatMoney(job.profit)}</div>
                  </div>
                </div>

                {/* Chi tiết chi phí */}
                {job.expenseItems && job.expenseItems.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    Chi tiết: {job.expenseItems.map(e => `${e.category}${e.description ? ': ' + e.description : ''} (${formatMoney(e.amount)})`).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-2">📭</div>
            <p>Chưa có công việc hoàn thành trong tháng {selectedMonth}/{selectedYear}</p>
          </div>
        )}
      </div>

      {/* Bonus Note */}
      {summary.totalBonus > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="font-medium text-purple-800">💡 Lưu ý về công phát sinh</div>
          <div className="text-sm text-purple-600 mt-1">
            Công phát sinh ({formatMoney(summary.totalBonus)}) được tính riêng cho từng kỹ thuật viên trong tab "Tiền Công".
          </div>
        </div>
      )}
    </div>
  );
};

export default TechnicalSummaryView;

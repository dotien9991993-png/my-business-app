import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { formatMoney } from '../../utils/formatters';

const BASE_WAGE = 200000;

export default function JobSummary({ user, tenantId }) {
  const [jobs, setJobs] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [expandedJob, setExpandedJob] = useState(null);

  // Load data
  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      setLoading(true);
      const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0);
      const monthEnd = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

      const [jobsRes, bonusRes] = await Promise.all([
        supabase
          .from('technical_jobs')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('status', 'Hoàn thành')
          .gte('scheduled_date', monthStart)
          .lte('scheduled_date', monthEnd)
          .order('scheduled_date', { ascending: false }),
        supabase
          .from('technician_bonuses')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('month', selectedMonth)
          .eq('year', selectedYear),
      ]);

      if (!jobsRes.error) setJobs(jobsRes.data || []);
      if (!bonusRes.error) setBonuses(bonusRes.data || []);
      setLoading(false);
    };
    load();
  }, [tenantId, selectedMonth, selectedYear]);

  // Calculate P&L
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalWages = 0;
    const techniciansInMonth = new Set();

    const jobDetails = jobs.map(job => {
      const revenue = job.customer_payment || 0;
      const expenseItems = job.expenses || [];
      const expenseTotal = expenseItems.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
      const techCount = (job.technicians || []).length;
      const wages = techCount * BASE_WAGE;

      (job.technicians || []).forEach(t => techniciansInMonth.add(t));

      totalRevenue += revenue;
      totalExpenses += expenseTotal;
      totalWages += wages;

      return {
        ...job,
        revenue,
        expenseTotal,
        wages,
        profit: revenue - expenseTotal - wages,
      };
    });

    // Add bonuses for technicians with work
    const totalBonus = bonuses
      .filter(b => techniciansInMonth.has(b.technician_name))
      .reduce((sum, b) => sum + (b.bonus_amount || 0), 0);

    totalWages += totalBonus;

    return {
      jobDetails,
      totalRevenue,
      totalExpenses,
      totalWages,
      totalBonus,
      netProfit: totalRevenue - totalExpenses - totalWages,
    };
  }, [jobs, bonuses]);

  const handleMonthChange = (delta) => {
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setSelectedMonth(m);
    setSelectedYear(y);
  };

  const monthLabel = new Date(selectedYear, selectedMonth - 1).toLocaleDateString('vi-VN', {
    month: 'long', year: 'numeric',
  });

  if (loading) return <div className="mjob-empty">Đang tải...</div>;

  return (
    <div className="mjob-summary">
      {/* Month navigation */}
      <div className="mjob-cal-nav">
        <button className="mjob-cal-nav-btn" onClick={() => handleMonthChange(-1)}>◀</button>
        <span className="mjob-cal-month">{monthLabel}</span>
        <button className="mjob-cal-nav-btn" onClick={() => handleMonthChange(1)}>▶</button>
      </div>

      {/* P&L Summary */}
      <div className="mjob-pnl">
        <div className="mjob-pnl-row">
          <span className="mjob-pnl-label">📊 Doanh thu (thu khách)</span>
          <span className="mjob-pnl-val mjob-text-green">{formatMoney(summary.totalRevenue)}</span>
        </div>
        <div className="mjob-pnl-row">
          <span className="mjob-pnl-label">📦 Chi phí vật tư</span>
          <span className="mjob-pnl-val mjob-text-red">-{formatMoney(summary.totalExpenses)}</span>
        </div>
        <div className="mjob-pnl-row">
          <span className="mjob-pnl-label">👷 Lương KTV ({formatMoney(summary.totalWages - summary.totalBonus)} + thưởng {formatMoney(summary.totalBonus)})</span>
          <span className="mjob-pnl-val mjob-text-red">-{formatMoney(summary.totalWages)}</span>
        </div>
        <div className="mjob-pnl-divider" />
        <div className="mjob-pnl-row mjob-pnl-total">
          <span className="mjob-pnl-label">💰 Lợi nhuận ròng</span>
          <span className={`mjob-pnl-val ${summary.netProfit >= 0 ? 'mjob-text-green' : 'mjob-text-red'}`}>
            {formatMoney(summary.netProfit)}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="mjob-summary-stats">
        <div className="mjob-summary-stat">
          <span>{jobs.length}</span>
          <span>Việc xong</span>
        </div>
        <div className="mjob-summary-stat">
          <span>{formatMoney(jobs.length > 0 ? Math.round(summary.netProfit / jobs.length) : 0)}</span>
          <span>LN/việc</span>
        </div>
        <div className="mjob-summary-stat">
          <span>{summary.totalRevenue > 0 ? Math.round((summary.netProfit / summary.totalRevenue) * 100) : 0}%</span>
          <span>Biên LN</span>
        </div>
      </div>

      {/* Per-job breakdown */}
      <div className="mjob-summary-jobs">
        <h3 className="mjob-section-title">📋 Chi tiết từng việc</h3>
        {summary.jobDetails.length === 0 ? (
          <div className="mjob-empty">Chưa có việc hoàn thành tháng này</div>
        ) : (
          summary.jobDetails.map(job => (
            <div key={job.id} className="mjob-summary-job">
              <button
                className="mjob-summary-job-header"
                onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
              >
                <div className="mjob-summary-job-info">
                  <span className="mjob-summary-job-date">{job.scheduled_date}</span>
                  <span className="mjob-summary-job-title">{job.title}</span>
                </div>
                <span className={`mjob-summary-job-profit ${job.profit >= 0 ? 'mjob-text-green' : 'mjob-text-red'}`}>
                  {formatMoney(job.profit)}
                  <span className="mjob-wages-expand">{expandedJob === job.id ? '▼' : '▶'}</span>
                </span>
              </button>

              {expandedJob === job.id && (
                <div className="mjob-summary-job-detail">
                  <div className="mjob-wages-row">
                    <span>Thu khách</span>
                    <span className="mjob-text-green">{formatMoney(job.revenue)}</span>
                  </div>
                  <div className="mjob-wages-row">
                    <span>Chi phí ({(job.expenses || []).length} khoản)</span>
                    <span className="mjob-text-red">-{formatMoney(job.expenseTotal)}</span>
                  </div>
                  {(job.expenses || []).map((e, i) => (
                    <div key={i} className="mjob-wages-row mjob-indent">
                      <span>• {e.category || e.description}</span>
                      <span>{formatMoney(e.amount)}</span>
                    </div>
                  ))}
                  <div className="mjob-wages-row">
                    <span>Lương ({(job.technicians || []).length} KTV)</span>
                    <span className="mjob-text-red">-{formatMoney(job.wages)}</span>
                  </div>
                  <div className="mjob-wages-row mjob-wages-row-total">
                    <span>Lợi nhuận</span>
                    <span className={job.profit >= 0 ? 'mjob-text-green' : 'mjob-text-red'}>
                      {formatMoney(job.profit)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

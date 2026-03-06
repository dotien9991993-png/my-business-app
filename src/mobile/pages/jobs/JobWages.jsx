import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { formatMoney } from '../../utils/formatters';

const BASE_WAGE = 200000; // 200,000đ per completed job

export default function JobWages({ user, tenantId }) {
  const [jobs, setJobs] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  // Load completed jobs + bonuses
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
          .lte('scheduled_date', monthEnd),
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

  // Bonus lookup
  const bonusMap = useMemo(() => {
    const map = {};
    bonuses.forEach(b => {
      map[b.technician_name] = {
        amount: b.bonus_amount || 0,
        note: b.note || '',
      };
    });
    return map;
  }, [bonuses]);

  // Per-technician breakdown
  const techWages = useMemo(() => {
    const wagesMap = {};

    jobs.forEach(job => {
      (job.technicians || []).forEach(tech => {
        if (!wagesMap[tech]) {
          wagesMap[tech] = { name: tech, jobCount: 0, baseWage: 0, bonus: 0, bonusNote: '', jobs: [] };
        }
        wagesMap[tech].jobs.push(job);
        wagesMap[tech].jobCount += 1;
        wagesMap[tech].baseWage = wagesMap[tech].jobCount * BASE_WAGE;
      });
    });

    // Add bonuses
    Object.keys(wagesMap).forEach(tech => {
      const b = bonusMap[tech];
      if (b) {
        wagesMap[tech].bonus = b.amount;
        wagesMap[tech].bonusNote = b.note;
      }
    });

    // Also add technicians who only have bonuses but no jobs
    Object.keys(bonusMap).forEach(tech => {
      if (!wagesMap[tech]) {
        wagesMap[tech] = {
          name: tech, jobCount: 0, baseWage: 0,
          bonus: bonusMap[tech].amount, bonusNote: bonusMap[tech].note, jobs: [],
        };
      }
    });

    return Object.values(wagesMap).sort((a, b) => b.jobCount - a.jobCount);
  }, [jobs, bonusMap]);

  // Totals
  const totalBase = techWages.reduce((sum, t) => sum + t.baseWage, 0);
  const totalBonus = techWages.reduce((sum, t) => sum + t.bonus, 0);
  const totalWage = totalBase + totalBonus;

  const [expandedTech, setExpandedTech] = useState(null);

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
    <div className="mjob-wages">
      {/* Month navigation */}
      <div className="mjob-cal-nav">
        <button className="mjob-cal-nav-btn" onClick={() => handleMonthChange(-1)}>◀</button>
        <span className="mjob-cal-month">{monthLabel}</span>
        <button className="mjob-cal-nav-btn" onClick={() => handleMonthChange(1)}>▶</button>
      </div>

      {/* Summary cards */}
      <div className="mjob-wages-summary">
        <div className="mjob-wages-card">
          <span className="mjob-wages-card-label">Tổng việc xong</span>
          <span className="mjob-wages-card-num">{jobs.length}</span>
        </div>
        <div className="mjob-wages-card">
          <span className="mjob-wages-card-label">Lương cơ bản</span>
          <span className="mjob-wages-card-num">{formatMoney(totalBase)}</span>
        </div>
        <div className="mjob-wages-card">
          <span className="mjob-wages-card-label">Thưởng</span>
          <span className="mjob-wages-card-num mjob-text-green">{formatMoney(totalBonus)}</span>
        </div>
        <div className="mjob-wages-card mjob-wages-total">
          <span className="mjob-wages-card-label">Tổng lương</span>
          <span className="mjob-wages-card-num">{formatMoney(totalWage)}</span>
        </div>
      </div>

      {/* Note */}
      <div className="mjob-wages-note">
        💡 Lương cơ bản: {formatMoney(BASE_WAGE)}/việc hoàn thành
      </div>

      {/* Per-technician */}
      {techWages.length === 0 ? (
        <div className="mjob-empty">Chưa có dữ liệu công tháng này</div>
      ) : (
        <div className="mjob-wages-list">
          {techWages.map(tech => (
            <div key={tech.name} className="mjob-wages-tech">
              <button
                className="mjob-wages-tech-header"
                onClick={() => setExpandedTech(expandedTech === tech.name ? null : tech.name)}
              >
                <div className="mjob-wages-tech-info">
                  <span className="mjob-wages-tech-name">👷 {tech.name}</span>
                  <span className="mjob-wages-tech-count">{tech.jobCount} việc</span>
                </div>
                <div className="mjob-wages-tech-total">
                  {formatMoney(tech.baseWage + tech.bonus)}
                  <span className="mjob-wages-expand">{expandedTech === tech.name ? '▼' : '▶'}</span>
                </div>
              </button>

              {expandedTech === tech.name && (
                <div className="mjob-wages-tech-detail">
                  <div className="mjob-wages-row">
                    <span>Lương cơ bản ({tech.jobCount} × {formatMoney(BASE_WAGE)})</span>
                    <span>{formatMoney(tech.baseWage)}</span>
                  </div>
                  {tech.bonus > 0 && (
                    <div className="mjob-wages-row mjob-text-green">
                      <span>Thưởng {tech.bonusNote ? `(${tech.bonusNote})` : ''}</span>
                      <span>+{formatMoney(tech.bonus)}</span>
                    </div>
                  )}
                  <div className="mjob-wages-row mjob-wages-row-total">
                    <span>Tổng</span>
                    <span>{formatMoney(tech.baseWage + tech.bonus)}</span>
                  </div>

                  {/* Job list */}
                  {tech.jobs.length > 0 && (
                    <div className="mjob-wages-jobs">
                      <div className="mjob-wages-jobs-title">Danh sách việc:</div>
                      {tech.jobs.map(j => (
                        <div key={j.id} className="mjob-wages-job-item">
                          <span>{j.scheduled_date} - {j.title}</span>
                          <span>{formatMoney(j.customer_payment || 0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import { formatMoney } from '../../utils/formatters';

const BASE_WAGE = 200000; // 200,000đ per completed job

export default function JobWages({ user, tenantId }) {
  const [jobs, setJobs] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [permLevel, setPermLevel] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [selectedTech, setSelectedTech] = useState(null);
  const [bonusInput, setBonusInput] = useState('');
  const [bonusNote, setBonusNote] = useState('');
  const [savingBonus, setSavingBonus] = useState(false);

  // Permission gate — giống desktop TechnicianWagesView: requires permLevel >= 2
  useEffect(() => {
    if (!user?.id || !tenantId) return;
    const loadPerm = async () => {
      const { data: u } = await supabase
        .from('users').select('role')
        .eq('id', user.id).single();
      if (u?.role === 'Admin' || u?.role === 'admin' || u?.role === 'Manager') {
        setPermLevel(3);
        return;
      }
      const { data: perm } = await supabase
        .from('user_permissions').select('permission_level')
        .eq('user_id', user.id).eq('module', 'technical').single();
      setPermLevel(perm?.permission_level || 1);
    };
    loadPerm();
  }, [user?.id, tenantId]);

  // Load completed jobs + bonuses
  const loadData = useCallback(async () => {
    if (!tenantId) return;
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
  }, [tenantId, selectedMonth, selectedYear]);

  useEffect(() => { loadData(); }, [loadData]);

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

  // Open bonus modal — giống desktop TechnicianWagesView
  const handleOpenBonus = (tech) => {
    setSelectedTech(tech);
    setBonusInput(String(tech.bonus || 0));
    setBonusNote(tech.bonusNote || '');
    setShowBonusModal(true);
  };

  // Save bonus — giống desktop saveBonus
  const handleSaveBonus = async () => {
    if (!selectedTech || permLevel < 3) return;
    setSavingBonus(true);
    try {
      const bonusData = {
        tenant_id: tenantId,
        technician_name: selectedTech.name,
        month: selectedMonth,
        year: selectedYear,
        bonus_amount: parseFloat(bonusInput) || 0,
        note: bonusNote,
        created_by: user?.name,
        updated_at: new Date().toISOString(),
      };

      // Check if record exists
      const existingBonus = bonuses.find(b => b.technician_name === selectedTech.name);
      if (existingBonus) {
        const { error } = await supabase
          .from('technician_bonuses')
          .update({ bonus_amount: bonusData.bonus_amount, note: bonusData.note, updated_at: bonusData.updated_at })
          .eq('id', existingBonus.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('technician_bonuses')
          .insert([bonusData]);
        if (error) throw error;
      }

      setShowBonusModal(false);
      await loadData();
    } catch (err) {
      console.error('Error saving bonus:', err);
      alert('Lỗi khi lưu: ' + err.message);
    } finally {
      setSavingBonus(false);
    }
  };

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

  // Permission gate — giống desktop: requires permLevel >= 2
  if (permLevel < 2) {
    return (
      <div className="mjob-empty">
        <div style={{ fontSize: '3rem', marginBottom: 8 }}>🔒</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Quyền truy cập hạn chế</div>
        <div style={{ color: '#666' }}>Bạn không có quyền xem thông tin tiền công.</div>
      </div>
    );
  }

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
                  <div className="mjob-wages-row mjob-text-green">
                    <span>Thưởng {tech.bonusNote ? `(${tech.bonusNote})` : ''}</span>
                    <span>{tech.bonus > 0 ? `+${formatMoney(tech.bonus)}` : formatMoney(0)}</span>
                  </div>
                  {permLevel >= 3 && (
                    <button
                      className="mjob-bonus-edit-btn"
                      onClick={(e) => { e.stopPropagation(); handleOpenBonus(tech); }}
                    >
                      ✏️ Sửa thưởng
                    </button>
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
      {/* Bonus Modal — giống desktop TechnicianWagesView */}
      {showBonusModal && selectedTech && (
        <div className="mjob-modal-overlay" onClick={() => setShowBonusModal(false)}>
          <div className="mjob-modal-content" onClick={e => e.stopPropagation()}>
            <div className="mjob-modal-header">
              💰 Công Phát Sinh - {selectedTech.name}
            </div>
            <div className="mjob-modal-body">
              <label className="mjob-modal-label">Số tiền (VNĐ)</label>
              <input
                type="number"
                value={bonusInput}
                onChange={e => setBonusInput(e.target.value)}
                className="mjob-modal-input"
                placeholder="VD: 500000"
                inputMode="numeric"
              />
              <label className="mjob-modal-label">Ghi chú</label>
              <textarea
                value={bonusNote}
                onChange={e => setBonusNote(e.target.value)}
                className="mjob-modal-input mjob-modal-textarea"
                rows={2}
                placeholder="VD: Công việc khó, đi xa, OT..."
              />
            </div>
            <div className="mjob-modal-footer">
              <button className="mjob-modal-btn-cancel" onClick={() => setShowBonusModal(false)}>Hủy</button>
              <button className="mjob-modal-btn-save" onClick={handleSaveBonus} disabled={savingBonus}>
                {savingBonus ? '...' : '💾 Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

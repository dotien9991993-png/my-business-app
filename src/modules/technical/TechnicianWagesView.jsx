import React, { useState, useEffect } from 'react';
import { formatMoney } from '../../utils/formatUtils';
import { getNowISOVN } from '../../utils/dateUtils';
import { supabase } from '../../supabaseClient';
import { logActivity } from '../../lib/activityLog';

const TechnicianWagesView = ({
  technicalJobs,
  tenant,
  currentUser,
  hasPermission,
  canEdit
}) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [bonusAmounts, setBonusAmounts] = useState({});
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState(null);
  const [bonusInput, setBonusInput] = useState('');
  const [bonusNote, setBonusNote] = useState('');
  const [, setLoadingBonuses] = useState(false);

  const BASE_WAGE = 200000; // 200,000đ/công việc

  // Load bonus data từ database
  const loadBonuses = async () => {
    if (!tenant) return;
    setLoadingBonuses(true);
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
        bonusMap[b.technician_name + '_note'] = b.note || '';
        bonusMap[b.technician_name + '_id'] = b.id;
      });
      setBonusAmounts(bonusMap);
    } catch (error) {
      console.error('Error loading bonuses:', error);
    }
    setLoadingBonuses(false);
  };

  // Load bonuses khi đổi tháng/năm
  useEffect(() => {
    loadBonuses();
  }, [selectedMonth, selectedYear, tenant]);

  // Lọc công việc hoàn thành trong tháng
  const completedJobsInMonth = technicalJobs.filter(job => {
    if (job.status !== 'Hoàn thành') return false;
    const jobDate = new Date(job.scheduledDate);
    return jobDate.getMonth() + 1 === selectedMonth && jobDate.getFullYear() === selectedYear;
  });

  // Tính tiền công cho từng kỹ thuật viên
  const getTechnicianWages = () => {
    const wagesMap = {};

    completedJobsInMonth.forEach(job => {
      const technicians = job.technicians || [];
      technicians.forEach(tech => {
        if (!wagesMap[tech]) {
          wagesMap[tech] = {
            name: tech,
            jobs: [],
            jobCount: 0,
            baseWage: 0,
            bonus: bonusAmounts[tech] || 0,
            bonusNote: bonusAmounts[tech + '_note'] || ''
          };
        }
        wagesMap[tech].jobs.push(job);
        wagesMap[tech].jobCount += 1;
        wagesMap[tech].baseWage = wagesMap[tech].jobCount * BASE_WAGE;
      });
    });

    return Object.values(wagesMap);
  };

  const technicianWages = getTechnicianWages();
  const totalBaseWage = technicianWages.reduce((sum, t) => sum + t.baseWage, 0);
  const totalBonus = technicianWages.reduce((sum, t) => sum + (bonusAmounts[t.name] || 0), 0);
  const totalWage = totalBaseWage + totalBonus;

  // Mở modal thêm công phát sinh
  const openBonusModal = (tech) => {
    setSelectedTechnician(tech);
    setBonusInput(bonusAmounts[tech.name] || '');
    setBonusNote(bonusAmounts[tech.name + '_note'] || '');
    setShowBonusModal(true);
  };

  // Lưu công phát sinh vào database
  const saveBonus = async () => {
    if (canEdit && !canEdit('technical')) return alert('Bạn không có quyền sửa công phát sinh');
    if (!selectedTechnician) return;

    const bonusData = {
      tenant_id: tenant.id,
      technician_name: selectedTechnician.name,
      month: selectedMonth,
      year: selectedYear,
      bonus_amount: parseFloat(bonusInput) || 0,
      note: bonusNote,
      created_by: currentUser.name,
      updated_at: getNowISOVN()
    };

    try {
      // Check if record exists
      const existingId = bonusAmounts[selectedTechnician.name + '_id'];

      if (existingId) {
        // Update existing
        const { error } = await supabase
          .from('technician_bonuses')
          .update({
            bonus_amount: bonusData.bonus_amount,
            note: bonusData.note,
            updated_at: bonusData.updated_at
          })
          .eq('id', existingId);

        if (error) throw error;
        logActivity({
          tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
          module: 'technical', action: 'update', entityType: 'technician_bonus',
          entityId: existingId, entityName: selectedTechnician.name,
          description: `Cập nhật công phát sinh ${selectedTechnician.name} tháng ${selectedMonth}/${selectedYear}: ${bonusData.bonus_amount}`
        });
      } else {
        // Insert new
        const { error } = await supabase
          .from('technician_bonuses')
          .insert([bonusData]);

        if (error) throw error;
        logActivity({
          tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
          module: 'technical', action: 'create', entityType: 'technician_bonus',
          entityName: selectedTechnician.name,
          description: `Thêm công phát sinh ${selectedTechnician.name} tháng ${selectedMonth}/${selectedYear}: ${bonusData.bonus_amount}`
        });
      }

      alert('✅ Đã lưu công phát sinh!');
      setShowBonusModal(false);
      await loadBonuses();
    } catch (error) {
      console.error('Error saving bonus:', error);
      alert('❌ Lỗi khi lưu: ' + error.message);
    }
  };

  // Permission check: level < 2 cannot view wage details
  if (hasPermission && !hasPermission('technical', 2)) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-yellow-800 mb-2">Quyền truy cập hạn chế</h2>
          <p className="text-yellow-600">Bạn không có quyền xem thông tin tiền công. Vui lòng liên hệ quản lý.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-bold">💰 Tiền Công Lắp Đặt</h2>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-sm text-blue-600">Công việc hoàn thành</div>
          <div className="text-2xl font-bold text-blue-700">{completedJobsInMonth.length}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-sm text-green-600">Tiền công cơ bản</div>
          <div className="text-xl font-bold text-green-700">{formatMoney(totalBaseWage)}</div>
          <div className="text-xs text-green-500">{formatMoney(BASE_WAGE)}/công việc</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="text-sm text-orange-600">Công phát sinh</div>
          <div className="text-xl font-bold text-orange-700">{formatMoney(totalBonus)}</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="text-sm text-purple-600">Tổng tiền công</div>
          <div className="text-xl font-bold text-purple-700">{formatMoney(totalWage)}</div>
        </div>
      </div>

      {/* Technician List */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-4 border-b">
          <h3 className="font-bold text-lg">👷 Chi tiết theo kỹ thuật viên</h3>
        </div>

        {technicianWages.length > 0 ? (
          <div className="divide-y">
            {technicianWages.map(tech => (
              <div key={tech.name} className="p-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div className="flex-1">
                    <div className="font-bold text-lg">{tech.name}</div>
                    <div className="text-sm text-gray-500">
                      {tech.jobCount} công việc hoàn thành
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Tiền công cơ bản ({tech.jobCount} × {formatMoney(BASE_WAGE)}):</span>
                        <span className="font-medium text-green-600">{formatMoney(tech.baseWage)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Công phát sinh:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-orange-600">{formatMoney(bonusAmounts[tech.name] || 0)}</span>
                          {(!canEdit || canEdit('technical')) && (
                            <button
                              onClick={() => openBonusModal(tech)}
                              className="px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded text-xs font-medium"
                            >
                              ✏️ Sửa
                            </button>
                          )}
                        </div>
                      </div>
                      {bonusAmounts[tech.name + '_note'] && (
                        <div className="text-xs text-gray-500 italic">
                          Ghi chú: {bonusAmounts[tech.name + '_note']}
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t">
                        <span className="font-bold">Tổng:</span>
                        <span className="font-bold text-purple-700">
                          {formatMoney(tech.baseWage + (bonusAmounts[tech.name] || 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Danh sách công việc */}
                <div className="mt-3 bg-gray-50 rounded-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">📋 Công việc:</div>
                  <div className="space-y-1">
                    {tech.jobs.map(job => (
                      <div key={job.id} className="text-sm flex justify-between">
                        <span className="text-gray-600">{job.title}</span>
                        <span className="text-gray-500">{job.scheduledDate}</span>
                      </div>
                    ))}
                  </div>
                </div>
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

      {/* Bonus Modal */}
      {showBonusModal && selectedTechnician && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-xl font-bold">💰 Công Phát Sinh - {selectedTechnician.name}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Số tiền (VNĐ)</label>
                <input
                  type="number"
                  value={bonusInput}
                  onChange={(e) => setBonusInput(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="VD: 500000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ghi chú</label>
                <textarea
                  value={bonusNote}
                  onChange={(e) => setBonusNote(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  rows={2}
                  placeholder="VD: Công việc khó, đi xa, OT..."
                />
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3">
              <button
                onClick={() => setShowBonusModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
              >
                Hủy
              </button>
              <button
                onClick={saveBonus}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
              >
                💾 Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechnicianWagesView;

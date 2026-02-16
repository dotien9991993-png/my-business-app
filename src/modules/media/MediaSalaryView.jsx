import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { getVietnamDate } from '../../utils/dateUtils';
import { SALARY_STATUSES } from '../../constants/mediaSalaryConstants';
import { isAdmin as isAdminCheck } from '../../utils/permissionUtils';

export default function MediaSalaryView({ tenant, currentUser, allUsers, tasks, loadFinanceData }) {
  const [salaries, setSalaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const vn = getVietnamDate();
    return vn.getMonth() + 1;
  });
  const [selectedYear, setSelectedYear] = useState(() => getVietnamDate().getFullYear());
  const [filterStatus, setFilterStatus] = useState('all');
  const [calculating, setCalculating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [videoListModal, setVideoListModal] = useState(null); // { userName, role, taskIds }

  const isAdmin = isAdminCheck(currentUser);

  const loadSalaries = useCallback(async () => {
    if (!tenant) return;
    try {
      let query = supabase.from('media_salaries').select('*').eq('tenant_id', tenant.id)
        .order('year', { ascending: false }).order('month', { ascending: false });
      if (!isAdmin) query = query.eq('user_id', currentUser.id);
      const { data } = await query;
      setSalaries(data || []);
    } catch (err) { console.error('Error loading salaries:', err); }
    finally { setLoading(false); }
  }, [tenant, currentUser, isAdmin]);

  useEffect(() => { loadSalaries(); }, [loadSalaries]);

  // Calculate salaries - auto count videos, admin inputs pay later
  const calculateSalaries = async () => {
    if (!isAdmin) return;
    setCalculating(true);
    try {
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const endYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

      const completedTasks = tasks.filter(t => {
        if (t.status !== 'Hoàn Thành') return false;
        const taskDate = t.completed_at || t.updated_at || '';
        return taskDate >= startDate && taskDate < endDate;
      });

      const userMap = {};
      allUsers.forEach(u => {
        userMap[u.name] = { userId: u.id, userName: u.name, crewTasks: [], actorTasks: [] };
      });

      completedTasks.forEach(t => {
        const crew = t.crew || [...new Set([...(t.cameramen || []), ...(t.editors || [])])];
        crew.forEach(name => {
          if (userMap[name]) userMap[name].crewTasks.push(t.id);
        });
        (t.actors || []).forEach(name => {
          if (userMap[name]) userMap[name].actorTasks.push(t.id);
        });
      });

      let count = 0;
      for (const [, userData] of Object.entries(userMap)) {
        const crewCount = userData.crewTasks.length;
        const actorCount = userData.actorTasks.length;
        if (crewCount === 0 && actorCount === 0) continue;

        // Check if salary already exists for this period
        const { data: existing } = await supabase.from('media_salaries')
          .select('id, status, camera_total, actor_total, bonus, deduction')
          .eq('tenant_id', tenant.id).eq('user_id', userData.userId)
          .eq('month', selectedMonth).eq('year', selectedYear).single();

        if (existing && existing.status !== 'draft') {
          // Don't overwrite approved/paid salaries
          continue;
        }

        // Keep existing manual inputs if re-calculating
        const crewPay = existing ? parseFloat(existing.camera_total || 0) : 0;
        const actorPay = existing ? parseFloat(existing.actor_total || 0) : 0;
        const bonus = existing ? parseFloat(existing.bonus || 0) : 0;
        const deduction = existing ? parseFloat(existing.deduction || 0) : 0;
        const total = crewPay + actorPay + bonus - deduction;

        const salaryData = {
          tenant_id: tenant.id,
          user_id: userData.userId,
          user_name: userData.userName,
          month: selectedMonth,
          year: selectedYear,
          camera_count: crewCount,
          camera_rate: 0,
          camera_total: crewPay,
          edit_count: 0,
          edit_rate: 0,
          edit_total: 0,
          actor_count: actorCount,
          actor_rate: 0,
          actor_total: actorPay,
          assign_count: 0,
          assign_rate: 0,
          assign_total: 0,
          bonus,
          deduction,
          total,
          status: 'draft',
          detail: { crewTasks: userData.crewTasks, actorTasks: userData.actorTasks },
          created_by: currentUser.name
        };

        const { error } = await supabase.from('media_salaries')
          .upsert(salaryData, { onConflict: 'tenant_id,user_id,month,year' });
        if (error) console.error('Error upserting salary:', error);
        count++;
      }

      alert(`✅ Đã tính lương tháng ${selectedMonth}/${selectedYear} cho ${count} nhân viên!`);
      await loadSalaries();
    } catch (err) {
      console.error('Error calculating salaries:', err);
      alert('❌ Lỗi khi tính lương!');
    } finally {
      setCalculating(false);
    }
  };

  // Save inline edits
  const saveEdit = async (salary) => {
    const crewPay = parseFloat(editValues.crew_pay || 0);
    const actorPay = parseFloat(editValues.actor_pay || 0);
    const bonus = parseFloat(editValues.bonus || 0);
    const deduction = parseFloat(editValues.deduction || 0);
    const total = crewPay + actorPay + bonus - deduction;

    try {
      const { error } = await supabase.from('media_salaries').update({
        camera_total: crewPay,
        actor_total: actorPay,
        bonus,
        deduction,
        total
      }).eq('id', salary.id);

      if (error) throw error;
      setEditingId(null);
      setEditValues({});
      await loadSalaries();
    } catch (err) {
      console.error('Error saving salary:', err);
      alert('❌ Lỗi khi lưu!');
    }
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditValues({
      crew_pay: parseFloat(s.camera_total || 0),
      actor_pay: parseFloat(s.actor_total || 0),
      bonus: parseFloat(s.bonus || 0),
      deduction: parseFloat(s.deduction || 0)
    });
  };

  // Approve salary
  const approveSalary = async (salary) => {
    try {
      await supabase.from('media_salaries').update({
        status: 'approved',
        approved_by: currentUser.name,
        approved_at: new Date().toISOString()
      }).eq('id', salary.id);
      await loadSalaries();
    } catch (_err) { alert('❌ Lỗi!'); }
  };

  // Pay salary - create finance receipt
  const paySalary = async (salary) => {
    if (!window.confirm(`Xác nhận trả lương ${formatMoney(salary.total)} cho ${salary.user_name}?`)) return;
    try {
      const { data: receipt, error: receiptError } = await supabase.from('receipts_payments').insert([{
        tenant_id: tenant.id,
        type: 'payment',
        category: 'Lương Media',
        amount: salary.total,
        description: `Lương Media tháng ${salary.month}/${salary.year} - ${salary.user_name}`,
        recipient: salary.user_name,
        receipt_date: new Date().toISOString().slice(0, 10),
        status: 'approved',
        created_by: currentUser.name
      }]).select().single();
      if (receiptError) throw receiptError;

      await supabase.from('media_salaries').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        receipt_id: receipt?.id || null
      }).eq('id', salary.id);

      alert('✅ Đã trả lương và tạo phiếu chi!');
      await loadSalaries();
      if (loadFinanceData) loadFinanceData();
    } catch (err) {
      console.error('Error paying salary:', err);
      alert('❌ Lỗi khi trả lương!');
    }
  };

  // Filter
  const filteredSalaries = salaries.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    return true;
  });

  const getStatusBadge = (status) => {
    const s = SALARY_STATUSES.find(x => x.id === status);
    return s ? <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.color}`}>{s.name}</span> : status;
  };

  // Get task titles for video list modal
  const getTaskTitles = (taskIds) => {
    return (taskIds || []).map(id => {
      const task = tasks.find(t => t.id === id);
      return task ? { id, title: task.title, dueDate: task.dueDate, platform: task.platform } : { id, title: '(Không tìm thấy)', dueDate: '', platform: '' };
    });
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Đang tải...</div>;

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      <h2 className="text-xl md:text-2xl font-bold">💰 Lương Media</h2>

      {/* Controls */}
      {isAdmin && (
        <div className="bg-white p-4 rounded-xl shadow flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium mb-1">Tháng</label>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Năm</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm">
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Trạng thái</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm">
              <option value="all">Tất cả</option>
              <option value="draft">Nháp</option>
              <option value="approved">Đã duyệt</option>
              <option value="paid">Đã trả</option>
            </select>
          </div>
          <button
            onClick={calculateSalaries}
            disabled={calculating}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {calculating ? '⏳ Đang tính...' : `🔄 Tính lương tháng ${selectedMonth}/${selectedYear}`}
          </button>
        </div>
      )}

      {/* Summary */}
      {filteredSalaries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-xl shadow text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredSalaries.length}</div>
            <div className="text-xs text-gray-500">Bảng lương</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow text-center">
            <div className="text-2xl font-bold text-green-600">{formatMoney(filteredSalaries.reduce((s, x) => s + parseFloat(x.total || 0), 0))}</div>
            <div className="text-xs text-gray-500">Tổng lương</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow text-center">
            <div className="text-2xl font-bold text-orange-600">{filteredSalaries.filter(s => s.status === 'draft').length}</div>
            <div className="text-xs text-gray-500">Chờ duyệt</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow text-center">
            <div className="text-2xl font-bold text-purple-600">{filteredSalaries.filter(s => s.status === 'paid').length}</div>
            <div className="text-xs text-gray-500">Đã trả</div>
          </div>
        </div>
      )}

      {/* Video List Modal */}
      {videoListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">{videoListModal.role === 'crew' ? '🎬 Video Q&D' : '🎭 Video Diễn'} - {videoListModal.userName}</h3>
              <button onClick={() => setVideoListModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="text-sm text-gray-500 mb-3">{videoListModal.taskIds.length} video</div>
            <div className="space-y-2">
              {getTaskTitles(videoListModal.taskIds).map(t => (
                <div key={t.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-sm">{t.title}</div>
                  <div className="text-xs text-gray-500">{t.platform} • {t.dueDate}</div>
                </div>
              ))}
              {videoListModal.taskIds.length === 0 && (
                <div className="text-center py-4 text-gray-400 text-sm">Không có video</div>
              )}
            </div>
            <button onClick={() => setVideoListModal(null)} className="mt-4 w-full px-4 py-2 bg-gray-200 rounded-lg font-medium text-sm">Đóng</button>
          </div>
        </div>
      )}

      {/* Salary Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-3 text-left">Nhân viên</th>
                <th className="px-3 py-3 text-center">🎬 Video Q&D</th>
                <th className="px-3 py-3 text-center">Tiền Q&D</th>
                <th className="px-3 py-3 text-center">🎭 Video Diễn</th>
                <th className="px-3 py-3 text-center">Tiền Diễn</th>
                <th className="px-3 py-3 text-center">Thưởng</th>
                <th className="px-3 py-3 text-center">Phạt</th>
                <th className="px-3 py-3 text-right">Tổng</th>
                <th className="px-3 py-3 text-center">T.Thái</th>
                {isAdmin && <th className="px-3 py-3 text-center">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredSalaries.length === 0 && (
                <tr><td colSpan={isAdmin ? 10 : 9} className="px-4 py-8 text-center text-gray-400">
                  {isAdmin ? 'Chưa có bảng lương. Chọn tháng/năm và bấm "Tính lương".' : 'Chưa có bảng lương.'}
                </td></tr>
              )}
              {filteredSalaries.map(s => {
                const isEditing = editingId === s.id;
                const detail = s.detail || {};
                const computedTotal = isEditing
                  ? (parseFloat(editValues.crew_pay || 0) + parseFloat(editValues.actor_pay || 0) + parseFloat(editValues.bonus || 0) - parseFloat(editValues.deduction || 0))
                  : parseFloat(s.total || 0);

                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium">
                      <div>{s.user_name}</div>
                      <div className="text-xs text-gray-400">{s.month}/{s.year}</div>
                    </td>
                    {/* Crew video count - clickable */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => setVideoListModal({ userName: s.user_name, role: 'crew', taskIds: detail.crewTasks || [] })}
                        className="text-blue-600 font-bold hover:underline cursor-pointer"
                        title="Xem danh sách video"
                      >
                        {s.camera_count || 0}
                      </button>
                    </td>
                    {/* Crew pay - editable */}
                    <td className="px-3 py-3 text-center">
                      {isEditing ? (
                        <input type="number" value={editValues.crew_pay || ''} onChange={(e) => setEditValues({ ...editValues, crew_pay: e.target.value })}
                          className="w-24 px-2 py-1 border rounded text-right text-sm" placeholder="0" />
                      ) : (
                        <span className={parseFloat(s.camera_total || 0) > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}>
                          {parseFloat(s.camera_total || 0) > 0 ? formatMoney(s.camera_total) : '-'}
                        </span>
                      )}
                    </td>
                    {/* Actor video count - clickable */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => setVideoListModal({ userName: s.user_name, role: 'actor', taskIds: detail.actorTasks || [] })}
                        className="text-pink-600 font-bold hover:underline cursor-pointer"
                        title="Xem danh sách video"
                      >
                        {s.actor_count || 0}
                      </button>
                    </td>
                    {/* Actor pay - editable */}
                    <td className="px-3 py-3 text-center">
                      {isEditing ? (
                        <input type="number" value={editValues.actor_pay || ''} onChange={(e) => setEditValues({ ...editValues, actor_pay: e.target.value })}
                          className="w-24 px-2 py-1 border rounded text-right text-sm" placeholder="0" />
                      ) : (
                        <span className={parseFloat(s.actor_total || 0) > 0 ? 'text-pink-600 font-medium' : 'text-gray-400'}>
                          {parseFloat(s.actor_total || 0) > 0 ? formatMoney(s.actor_total) : '-'}
                        </span>
                      )}
                    </td>
                    {/* Bonus - editable */}
                    <td className="px-3 py-3 text-center">
                      {isEditing ? (
                        <input type="number" value={editValues.bonus || ''} onChange={(e) => setEditValues({ ...editValues, bonus: e.target.value })}
                          className="w-20 px-2 py-1 border rounded text-right text-sm" placeholder="0" />
                      ) : (
                        <span className={parseFloat(s.bonus || 0) > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                          {parseFloat(s.bonus || 0) > 0 ? formatMoney(s.bonus) : '-'}
                        </span>
                      )}
                    </td>
                    {/* Deduction - editable */}
                    <td className="px-3 py-3 text-center">
                      {isEditing ? (
                        <input type="number" value={editValues.deduction || ''} onChange={(e) => setEditValues({ ...editValues, deduction: e.target.value })}
                          className="w-20 px-2 py-1 border rounded text-right text-sm" placeholder="0" />
                      ) : (
                        <span className={parseFloat(s.deduction || 0) > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
                          {parseFloat(s.deduction || 0) > 0 ? formatMoney(s.deduction) : '-'}
                        </span>
                      )}
                    </td>
                    {/* Total */}
                    <td className="px-3 py-3 text-right font-bold text-blue-700">{formatMoney(computedTotal)}</td>
                    {/* Status */}
                    <td className="px-3 py-3 text-center">{getStatusBadge(s.status)}</td>
                    {/* Actions */}
                    {isAdmin && (
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {s.status === 'draft' && !isEditing && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); startEdit(s); }} className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs mr-1 hover:bg-yellow-200">✏️ Nhập</button>
                            <button onClick={(e) => { e.stopPropagation(); approveSalary(s); }} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">Duyệt</button>
                          </>
                        )}
                        {isEditing && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); saveEdit(s); }} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs mr-1 hover:bg-green-200">💾 Lưu</button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200">Hủy</button>
                          </>
                        )}
                        {s.status === 'approved' && (
                          <button onClick={(e) => { e.stopPropagation(); paySalary(s); }} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200">💰 Trả</button>
                        )}
                        {s.status === 'paid' && <span className="text-xs text-gray-400">✅</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

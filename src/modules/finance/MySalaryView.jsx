import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';
import { formatMoney } from '../../utils/formatUtils';
import { getVietnamDate } from '../../utils/dateUtils';

export default function MySalaryView() {
  const { tenant, currentUser, allUsers } = useApp();
  const { tasks, technicalJobs } = useData();

  const getCurrentMonth = () => {
    const vn = getVietnamDate();
    return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}`;
  };

  const [salaries, setSalaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [taskListModal, setTaskListModal] = useState(null);

  // ---- Load my salaries (last 6 months) ----
  const loadMySalaries = useCallback(async () => {
    if (!tenant || !currentUser) return;
    try {
      const { data, error } = await supabase.from('salaries').select('*')
        .eq('tenant_id', tenant.id)
        .eq('user_id', currentUser.id)
        .order('month', { ascending: false })
        .limit(6);
      if (error) throw error;
      setSalaries(data || []);
    } catch (err) { console.error('Error loading salaries:', err); }
    finally { setLoading(false); }
  }, [tenant, currentUser]);

  useEffect(() => { loadMySalaries(); }, [loadMySalaries]);

  // Current month salary record
  const currentSalary = salaries.find(s => s.month === selectedMonth) || null;

  // ---- Realtime work tracking (current month) ----
  const myWorkThisMonth = useMemo(() => {
    const [year, monthNum] = selectedMonth.split('-').map(Number);
    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const nm = monthNum === 12 ? 1 : monthNum + 1;
    const ny = monthNum === 12 ? year + 1 : year;
    const endDate = `${ny}-${String(nm).padStart(2, '0')}-01`;
    const name = currentUser?.name;
    if (!name) return { crewTasks: [], actorTasks: [], techJobs: [] };

    const completedTasks = (tasks || []).filter(t => {
      if (t.status !== 'Hoàn Thành') return false;
      const d = t.completed_at || t.updated_at || '';
      return d >= startDate && d < endDate;
    });

    const completedJobs = (technicalJobs || []).filter(j => {
      const isDone = j.status === 'completed' || j.status === 'Hoàn thành';
      const d = j.completed_at || j.completedAt || j.updated_at || j.scheduledDate || '';
      return isDone && d >= startDate && d < endDate;
    });

    const crewTasks = [];
    const actorTasks = [];
    const techJobs = [];

    completedTasks.forEach(t => {
      const crew = t.crew || [...new Set([...(t.cameramen || []), ...(t.editors || [])])];
      if (crew.includes(name)) crewTasks.push(t.id);
      if ((t.actors || []).includes(name)) actorTasks.push(t.id);
    });

    completedJobs.forEach(j => {
      if ((j.technicians || []).includes(name)) techJobs.push(j.id);
    });

    return { crewTasks, actorTasks, techJobs };
  }, [tasks, technicalJobs, currentUser, selectedMonth]);

  // ---- Task/Job titles for popup ----
  const getTaskTitles = (ids) => (ids || []).map(id => {
    const t = (tasks || []).find(x => x.id === id);
    return t ? { id, title: t.title, sub: `${t.platform || ''} • ${t.dueDate || ''}` } : { id, title: '(Không tìm thấy)', sub: '' };
  });
  const getJobTitles = (ids) => (ids || []).map(id => {
    const j = (technicalJobs || []).find(x => x.id === id);
    return j ? { id, title: j.title, sub: `${j.customerName || ''} • ${j.scheduledDate || ''}` } : { id, title: '(Không tìm thấy)', sub: '' };
  });

  // ---- User name from UUID ----
  const getUserName = (uuid) => (allUsers || []).find(u => u.id === uuid)?.name || 'N/A';

  // ---- History chart data ----
  const salaryHistory = useMemo(() => {
    return [...salaries]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(s => ({
        month: s.month,
        label: s.month.slice(5) + '/' + s.month.slice(0, 4),
        total: parseFloat(s.total_salary || 0)
      }));
  }, [salaries]);

  // ---- Comparison vs previous month ----
  const comparison = useMemo(() => {
    const current = salaries.find(s => s.month === selectedMonth);
    const sorted = [...salaries].sort((a, b) => b.month.localeCompare(a.month));
    const currentIdx = sorted.findIndex(s => s.month === selectedMonth);
    const previous = currentIdx >= 0 && currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null;

    const currentTotal = parseFloat(current?.total_salary || 0);
    const previousTotal = parseFloat(previous?.total_salary || 0);
    const diff = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal * 100) : 0;

    return { currentTotal, previousTotal, previousMonth: previous?.month || null, diff };
  }, [salaries, selectedMonth]);

  // ---- Status badge ----
  const getStatusBadge = (status) => {
    const m = { draft: 'bg-yellow-100 text-yellow-700', approved: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700' };
    const l = { draft: 'Nháp', approved: 'Đã duyệt', paid: 'Đã trả' };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${m[status] || m.draft}`}>{l[status] || status}</span>;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Lương Của Tôi</h2>
          <p className="text-sm text-gray-600">Xem chi tiết lương và công việc hàng tháng</p>
        </div>
        <div>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm" />
        </div>
      </div>

      {/* Realtime Work Tracking */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-center cursor-pointer hover:bg-blue-100 transition"
          onClick={() => setTaskListModal({ title: 'Video Quay & Dựng tháng này', items: getTaskTitles(myWorkThisMonth.crewTasks) })}>
          <div className="text-2xl md:text-3xl font-bold text-blue-600">{myWorkThisMonth.crewTasks.length}</div>
          <div className="text-xs text-gray-600 mt-1">Video Q&D</div>
        </div>
        <div className="bg-pink-50 border border-pink-200 p-4 rounded-xl text-center cursor-pointer hover:bg-pink-100 transition"
          onClick={() => setTaskListModal({ title: 'Video Diễn viên tháng này', items: getTaskTitles(myWorkThisMonth.actorTasks) })}>
          <div className="text-2xl md:text-3xl font-bold text-pink-600">{myWorkThisMonth.actorTasks.length}</div>
          <div className="text-xs text-gray-600 mt-1">Diễn viên</div>
        </div>
        <div className="bg-cyan-50 border border-cyan-200 p-4 rounded-xl text-center cursor-pointer hover:bg-cyan-100 transition"
          onClick={() => setTaskListModal({ title: 'Job Kỹ thuật tháng này', items: getJobTitles(myWorkThisMonth.techJobs) })}>
          <div className="text-2xl md:text-3xl font-bold text-cyan-600">{myWorkThisMonth.techJobs.length}</div>
          <div className="text-xs text-gray-600 mt-1">Kỹ thuật</div>
        </div>
      </div>

      {/* Salary Detail Table */}
      {currentSalary ? (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg">Bảng lương tháng {selectedMonth}</h3>
            </div>
            {getStatusBadge(currentSalary.status)}
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-200 px-3 py-2 text-left w-[25%]">Hạng mục</th>
                  <th className="border border-gray-200 px-3 py-2 text-center w-[25%]">Số lượng</th>
                  <th className="border border-gray-200 px-3 py-2 text-center w-[25%]">Đơn giá / Chi tiết</th>
                  <th className="border border-gray-200 px-3 py-2 text-right w-[25%]">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {/* Basic */}
                <tr>
                  <td className="border border-gray-200 px-3 py-2 font-medium">Lương cơ bản</td>
                  <td className="border border-gray-200 px-3 py-2 text-center">{currentSalary.work_days || 0} ngày</td>
                  <td className="border border-gray-200 px-3 py-2 text-center">{formatMoney(currentSalary.basic_per_day || (currentSalary.basic_salary ? Math.round(parseFloat(currentSalary.basic_salary) / 26) : 0))}/ngày</td>
                  <td className="border border-gray-200 px-3 py-2 text-right font-medium text-blue-700">{formatMoney(currentSalary.actual_basic || 0)}</td>
                </tr>
                {/* Q&D */}
                <tr>
                  <td className="border border-gray-200 px-3 py-2 font-medium">Quay & Dựng</td>
                  <td className="border border-gray-200 px-3 py-2 text-center">
                    <button onClick={() => { const d = currentSalary.detail || {}; setTaskListModal({ title: 'Video Quay & Dựng', items: getTaskTitles(d.crewTasks) }); }}
                      className="text-blue-600 hover:underline font-medium">{currentSalary.media_videos || 0} video</button>
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-center">{formatMoney(currentSalary.media_per_video || 0)}/video</td>
                  <td className="border border-gray-200 px-3 py-2 text-right font-medium text-blue-600">{formatMoney(currentSalary.media_total || 0)}</td>
                </tr>
                {/* Actor */}
                {(currentSalary.media_actor_count || 0) > 0 && (
                  <tr>
                    <td className="border border-gray-200 px-3 py-2 font-medium">Diễn viên</td>
                    <td className="border border-gray-200 px-3 py-2 text-center">
                      <button onClick={() => { const d = currentSalary.detail || {}; setTaskListModal({ title: 'Video Diễn viên', items: getTaskTitles(d.actorTasks) }); }}
                        className="text-pink-600 hover:underline font-medium">{currentSalary.media_actor_count} video</button>
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-center">{formatMoney(currentSalary.media_actor_per_video || 0)}/video</td>
                    <td className="border border-gray-200 px-3 py-2 text-right font-medium text-pink-600">{formatMoney(currentSalary.media_actor_total || 0)}</td>
                  </tr>
                )}
                {/* Ky thuat */}
                {(currentSalary.kythuat_jobs || 0) > 0 && (
                  <tr>
                    <td className="border border-gray-200 px-3 py-2 font-medium">Kỹ thuật</td>
                    <td className="border border-gray-200 px-3 py-2 text-center">
                      <button onClick={() => { const d = currentSalary.detail || {}; setTaskListModal({ title: 'Job Kỹ thuật', items: getJobTitles(d.techJobs) }); }}
                        className="text-cyan-600 hover:underline font-medium">{currentSalary.kythuat_jobs} job</button>
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-center">{formatMoney(currentSalary.kythuat_per_job || 0)}/job</td>
                    <td className="border border-gray-200 px-3 py-2 text-right font-medium text-cyan-600">{formatMoney(currentSalary.kythuat_total || 0)}</td>
                  </tr>
                )}
                {/* Kho */}
                {parseFloat(currentSalary.kho_total || 0) > 0 && (
                  <tr>
                    <td className="border border-gray-200 px-3 py-2 font-medium">Kho</td>
                    <td className="border border-gray-200 px-3 py-2 text-center">{currentSalary.kho_orders || 0} đơn</td>
                    <td className="border border-gray-200 px-3 py-2 text-center">{formatMoney(currentSalary.kho_per_order || 0)}/đơn</td>
                    <td className="border border-gray-200 px-3 py-2 text-right font-medium text-orange-600">{formatMoney(currentSalary.kho_total)}</td>
                  </tr>
                )}
                {/* Livestream */}
                {parseFloat(currentSalary.livestream_total || 0) > 0 && (
                  <tr>
                    <td className="border border-gray-200 px-3 py-2 font-medium">
                      Livestream
                      <div className="text-xs text-gray-400 font-normal">HH khi DT ≥ 100tr</div>
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-center">DT: {formatMoney(currentSalary.livestream_revenue || 0)}</td>
                    <td className="border border-gray-200 px-3 py-2 text-center">{currentSalary.livestream_commission || 0}%</td>
                    <td className="border border-gray-200 px-3 py-2 text-right font-medium text-purple-600">{formatMoney(currentSalary.livestream_total)}</td>
                  </tr>
                )}
                {/* Sale */}
                {parseFloat(currentSalary.sale_total || 0) > 0 && (
                  <tr>
                    <td className="border border-gray-200 px-3 py-2 font-medium">Sale</td>
                    <td className="border border-gray-200 px-3 py-2 text-center">DT: {formatMoney(currentSalary.sale_revenue || 0)}</td>
                    <td className="border border-gray-200 px-3 py-2 text-center">{currentSalary.sale_commission || 0}%</td>
                    <td className="border border-gray-200 px-3 py-2 text-right font-medium text-green-600">{formatMoney(currentSalary.sale_total)}</td>
                  </tr>
                )}
                {/* Bonus */}
                {parseFloat(currentSalary.bonus || 0) > 0 && (
                  <tr>
                    <td className="border border-gray-200 px-3 py-2 font-medium text-green-700">Thưởng</td>
                    <td className="border border-gray-200 px-3 py-2 text-center text-gray-400">-</td>
                    <td className="border border-gray-200 px-3 py-2 text-center text-gray-400">-</td>
                    <td className="border border-gray-200 px-3 py-2 text-right font-medium text-green-600">+{formatMoney(currentSalary.bonus)}</td>
                  </tr>
                )}
                {/* Deduction */}
                {parseFloat(currentSalary.deduction || 0) > 0 && (
                  <tr>
                    <td className="border border-gray-200 px-3 py-2 font-medium text-red-700">Khấu trừ</td>
                    <td className="border border-gray-200 px-3 py-2 text-center text-gray-400">-</td>
                    <td className="border border-gray-200 px-3 py-2 text-center text-gray-400">-</td>
                    <td className="border border-gray-200 px-3 py-2 text-right font-medium text-red-600">-{formatMoney(currentSalary.deduction)}</td>
                  </tr>
                )}
                {/* Custom Items */}
                {(currentSalary.custom_items || []).map((item, idx) => {
                  const itemTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
                  return (
                    <tr key={`custom-${idx}`} className="bg-amber-50/50">
                      <td className="border border-gray-200 px-3 py-2 font-medium text-amber-800">{item.name}</td>
                      <td className="border border-gray-200 px-3 py-2 text-center">{parseFloat(item.quantity) || 0}</td>
                      <td className="border border-gray-200 px-3 py-2 text-center">{formatMoney(parseFloat(item.unit_price) || 0)}</td>
                      <td className={`border border-gray-200 px-3 py-2 text-right font-medium ${itemTotal >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
                        {formatMoney(itemTotal)}
                      </td>
                    </tr>
                  );
                })}
                {/* TOTAL */}
                <tr className="bg-gradient-to-r from-blue-50 to-indigo-50">
                  <td colSpan={3} className="border border-gray-200 px-3 py-3 font-bold text-lg">TỔNG LƯƠNG</td>
                  <td className="border border-gray-200 px-3 py-3 text-right font-bold text-xl text-blue-700">
                    {formatMoney(currentSalary.total_salary)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Note */}
          {currentSalary.note && (
            <div className="px-4 pb-3">
              <div className="text-sm text-gray-600">Ghi chú: {currentSalary.note}</div>
            </div>
          )}

          {/* Timeline */}
          <div className="px-4 pb-4 border-t pt-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
              {currentSalary.created_at && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-400 inline-block"></span>
                  <span>Tạo: {new Date(currentSalary.created_at).toLocaleDateString('vi-VN')} bởi {getUserName(currentSalary.created_by)}</span>
                </div>
              )}
              {currentSalary.approved_at && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
                  <span>Duyệt: {new Date(currentSalary.approved_at).toLocaleDateString('vi-VN')} bởi {getUserName(currentSalary.approved_by)}</span>
                </div>
              )}
              {currentSalary.paid_at && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
                  <span>Trả: {new Date(currentSalary.paid_at).toLocaleDateString('vi-VN')} bởi {getUserName(currentSalary.paid_by)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* No salary record yet */
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-medium text-gray-700">Admin chưa tính lương tháng {selectedMonth}</div>
          <div className="text-sm text-gray-500 mt-1">Công việc của bạn đang được ghi nhận tự động</div>
        </div>
      )}

      {/* Salary History Chart */}
      {salaryHistory.length > 1 && (
        <div className="bg-white rounded-xl shadow p-4 md:p-6">
          <h3 className="text-lg font-bold mb-4">Lịch sử lương</h3>
          <div className="h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salaryHistory} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(0)}tr` : v.toLocaleString()} />
                <Tooltip formatter={(value) => formatMoney(value)} labelFormatter={(label) => `Tháng ${label}`} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tổng lương" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Comparison */}
          {comparison.previousMonth && (
            <div className="mt-4 pt-3 border-t flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-gray-500">Tháng này: </span>
                <span className="font-bold text-blue-700">{formatMoney(comparison.currentTotal)}</span>
              </div>
              <div>
                <span className="text-gray-500">Tháng trước: </span>
                <span className="font-medium">{formatMoney(comparison.previousTotal)}</span>
              </div>
              {comparison.diff !== 0 && (
                <div className={`font-medium ${comparison.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {comparison.diff > 0 ? '+' : ''}{comparison.diff.toFixed(1)}%
                  {comparison.diff > 0 ? ' ↑' : ' ↓'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Previous months list (if chart not shown, show simple list) */}
      {salaryHistory.length <= 1 && salaries.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-bold">Lịch sử lương</h3>
          </div>
          <div className="divide-y">
            {salaries.map(s => (
              <div key={s.id} className="px-4 py-3 flex justify-between items-center"
                onClick={() => setSelectedMonth(s.month)} >
                <div>
                  <span className="font-medium">{s.month}</span>
                  <span className="ml-2">{getStatusBadge(s.status)}</span>
                </div>
                <span className="font-bold text-blue-700">{formatMoney(s.total_salary)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task/Job List Modal */}
      {taskListModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">{taskListModal.title}</h3>
              <button onClick={() => setTaskListModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-2">
              {taskListModal.items.map((item, i) => (
                <div key={item.id || i} className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-sm">{item.title}</div>
                  {item.sub && <div className="text-xs text-gray-500">{item.sub}</div>}
                </div>
              ))}
              {taskListModal.items.length === 0 && <div className="text-center py-4 text-gray-400 text-sm">Không có dữ liệu</div>}
            </div>
            <button onClick={() => setTaskListModal(null)} className="mt-4 w-full px-4 py-2 bg-gray-200 rounded-lg font-medium text-sm">Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}

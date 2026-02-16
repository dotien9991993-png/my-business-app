import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import { useData } from '../../contexts/DataContext';
import { formatMoney } from '../../utils/formatUtils';
import { getVietnamDate } from '../../utils/dateUtils';
import { isAdmin as isAdminCheck } from '../../utils/permissionUtils';

export default function SalaryCard() {
  const { tenant, currentUser, navigateTo } = useApp();
  const { tasks, technicalJobs } = useData();
  const isAdmin = isAdminCheck(currentUser);

  const [salary, setSalary] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const getCurrentMonth = () => {
    const vn = getVietnamDate();
    return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}`;
  };
  const currentMonth = getCurrentMonth();

  // Load current month salary
  useEffect(() => {
    if (!tenant || !currentUser || isAdmin) return;
    (async () => {
      try {
        const { data } = await supabase.from('salaries')
          .select('total_salary, status')
          .eq('tenant_id', tenant.id)
          .eq('user_id', currentUser.id)
          .eq('month', currentMonth)
          .maybeSingle();
        setSalary(data);
      } catch (err) { console.error('SalaryCard error:', err); }
      finally { setLoaded(true); }
    })();
  }, [tenant, currentUser, isAdmin, currentMonth]);

  // Realtime work counting
  const work = useMemo(() => {
    const [year, monthNum] = currentMonth.split('-').map(Number);
    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const nm = monthNum === 12 ? 1 : monthNum + 1;
    const ny = monthNum === 12 ? year + 1 : year;
    const endDate = `${ny}-${String(nm).padStart(2, '0')}-01`;
    const name = currentUser?.name;
    if (!name) return { crew: 0, actor: 0, tech: 0 };

    let crew = 0, actor = 0, tech = 0;

    (tasks || []).forEach(t => {
      if (t.status !== 'Hoàn Thành') return;
      const d = t.completed_at || t.updated_at || '';
      if (d < startDate || d >= endDate) return;
      const crewList = t.crew || [...new Set([...(t.cameramen || []), ...(t.editors || [])])];
      if (crewList.includes(name)) crew++;
      if ((t.actors || []).includes(name)) actor++;
    });

    (technicalJobs || []).forEach(j => {
      const isDone = j.status === 'completed' || j.status === 'Hoàn thành';
      if (!isDone) return;
      const d = j.completed_at || j.completedAt || j.updated_at || j.scheduledDate || '';
      if (d < startDate || d >= endDate) return;
      if ((j.technicians || []).includes(name)) tech++;
    });

    return { crew, actor, tech };
  }, [tasks, technicalJobs, currentUser, currentMonth]);

  // Don't show for admin
  if (isAdmin || !loaded) return null;

  const statusLabels = { draft: 'Nháp', approved: 'Đã duyệt', paid: 'Đã trả' };
  const statusColors = { draft: 'bg-yellow-100 text-yellow-700', approved: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700' };
  const hasWork = work.crew > 0 || work.actor > 0 || work.tech > 0;

  return (
    <div
      onClick={() => navigateTo('finance', 'salaries')}
      className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 p-4 rounded-xl cursor-pointer hover:shadow-md transition"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-600">Lương tháng này</div>
        {salary && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[salary.status] || ''}`}>
            {statusLabels[salary.status] || salary.status}
          </span>
        )}
      </div>
      <div className="text-xl md:text-2xl font-bold text-green-700 mb-1">
        {salary ? formatMoney(salary.total_salary) : 'Chưa tính'}
      </div>
      {hasWork && (
        <div className="text-xs text-gray-500">
          {work.crew > 0 && <span>Q&D: {work.crew}</span>}
          {work.actor > 0 && <span>{work.crew > 0 ? ' • ' : ''}Diễn: {work.actor}</span>}
          {work.tech > 0 && <span>{(work.crew > 0 || work.actor > 0) ? ' • ' : ''}KT: {work.tech}</span>}
        </div>
      )}
      <div className="text-xs text-blue-600 mt-1">Xem chi tiết →</div>
    </div>
  );
}

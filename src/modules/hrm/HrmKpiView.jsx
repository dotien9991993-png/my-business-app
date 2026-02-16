import React, { useState, useMemo, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { KPI_STATUSES, KPI_RATINGS, getRatingFromScore } from '../../constants/hrmConstants';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getVietnamDate, getNowISOVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';

// ============ HELPERS ============

const getRatingColor = (rating) => {
  const map = { A: 'bg-green-100 text-green-800', B: 'bg-blue-100 text-blue-800', C: 'bg-yellow-100 text-yellow-800', D: 'bg-red-100 text-red-800' };
  return map[rating] || 'bg-gray-100 text-gray-800';
};

const getStatusBadge = (status) => {
  const info = KPI_STATUSES[status];
  if (!info) return null;
  const cMap = { gray: 'bg-gray-100 text-gray-700 border-gray-300', blue: 'bg-blue-100 text-blue-700 border-blue-300', orange: 'bg-orange-100 text-orange-700 border-orange-300', green: 'bg-green-100 text-green-700 border-green-300' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cMap[info.color] || cMap.gray}`}>{info.label}</span>;
};

const getCurrentPeriod = () => {
  const vn = getVietnamDate();
  return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}`;
};

const NEXT_STATUS = { draft: 'self_evaluated', self_evaluated: 'manager_reviewed', manager_reviewed: 'completed' };
const NEXT_LABEL = { draft: 'Tự đánh giá', self_evaluated: 'QL duyệt', manager_reviewed: 'Hoàn thành' };

const IconPlus = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const IconEdit = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
const IconTrash = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

// ============ MAIN COMPONENT ============

export default function HrmKpiView({
  employees, departments, kpiTemplates, kpiCriteria,
  kpiEvaluations, kpiEvalDetails, loadHrmData, tenant, currentUser,
  hasPermission, canEdit,
}) {
  // === PERMISSION ===
  const userCanEdit = canEdit ? canEdit('hrm') : true; // level 3
  const canManageKpi = hasPermission ? hasPermission('hrm', 2) : true; // level 2+
  const [subTab, setSubTab] = useState('templates');

  // Mau KPI state
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', department_id: '' });
  const [criteriaList, setCriteriaList] = useState([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Danh gia state
  const [showEvalForm, setShowEvalForm] = useState(false);
  const [evalForm, setEvalForm] = useState({ employee_id: '', template_id: '', period: getCurrentPeriod(), employee_comment: '', manager_comment: '' });
  const [evalDetails, setEvalDetails] = useState([]);
  const [editingEval, setEditingEval] = useState(null);
  const [evalFilterDept, setEvalFilterDept] = useState('');
  const [evalFilterPeriod, setEvalFilterPeriod] = useState(getCurrentPeriod());
  const [evalFilterStatus, setEvalFilterStatus] = useState('');

  // Xep hang state
  const [rankPeriod, setRankPeriod] = useState(getCurrentPeriod());
  const [rankDeptFilter, setRankDeptFilter] = useState('');

  // ============ COMPUTED ============

  const activeEmployees = useMemo(() => (employees || []).filter(e => e.status === 'active'), [employees]);

  const deptMap = useMemo(() => {
    const m = {};
    (departments || []).forEach(d => { m[d.id] = d.name; });
    return m;
  }, [departments]);

  const empMap = useMemo(() => {
    const m = {};
    (employees || []).forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  const templateMap = useMemo(() => {
    const m = {};
    (kpiTemplates || []).forEach(t => { m[t.id] = t; });
    return m;
  }, [kpiTemplates]);

  const criteriaByTemplate = useMemo(() => {
    const m = {};
    (kpiCriteria || []).forEach(c => { (m[c.template_id] ||= []).push(c); });
    return m;
  }, [kpiCriteria]);

  const detailsByEval = useMemo(() => {
    const m = {};
    (kpiEvalDetails || []).forEach(d => { (m[d.evaluation_id] ||= []).push(d); });
    return m;
  }, [kpiEvalDetails]);

  const filteredTemplates = useMemo(() => {
    let list = kpiTemplates || [];
    if (templateSearch) {
      const s = templateSearch.toLowerCase();
      list = list.filter(t => (t.name || '').toLowerCase().includes(s));
    }
    return list;
  }, [kpiTemplates, templateSearch]);

  const filteredEvaluations = useMemo(() => {
    let list = kpiEvaluations || [];
    if (evalFilterPeriod) list = list.filter(e => e.period === evalFilterPeriod);
    if (evalFilterDept) list = list.filter(e => { const emp = empMap[e.employee_id]; return emp && emp.department_id === evalFilterDept; });
    if (evalFilterStatus) list = list.filter(e => e.status === evalFilterStatus);
    return list.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  }, [kpiEvaluations, evalFilterPeriod, evalFilterDept, evalFilterStatus, empMap]);

  const rankingData = useMemo(() => {
    let list = (kpiEvaluations || []).filter(e => e.period === rankPeriod && e.status === 'completed');
    if (rankDeptFilter) list = list.filter(e => { const emp = empMap[e.employee_id]; return emp && emp.department_id === rankDeptFilter; });
    return list.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  }, [kpiEvaluations, rankPeriod, rankDeptFilter, empMap]);

  const rankBarData = useMemo(() => rankingData.slice(0, 15).map(e => {
    const emp = empMap[e.employee_id];
    return { name: emp ? emp.full_name : 'N/A', score: Math.round((e.total_score || 0) * 10) / 10, rating: e.rating || getRatingFromScore(e.total_score || 0) };
  }), [rankingData, empMap]);

  const trendData = useMemo(() => {
    const vn = getVietnamDate();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(vn.getFullYear(), vn.getMonth() - i, 1);
      months.push({ period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `T${d.getMonth() + 1}/${d.getFullYear()}` });
    }
    return months.map(m => {
      let evals = (kpiEvaluations || []).filter(e => e.period === m.period && e.status === 'completed');
      if (rankDeptFilter) evals = evals.filter(e => { const emp = empMap[e.employee_id]; return emp && emp.department_id === rankDeptFilter; });
      const avg = evals.length > 0 ? Math.round(evals.reduce((s, e) => s + (e.total_score || 0), 0) / evals.length * 10) / 10 : 0;
      return { name: m.label, avg, count: evals.length };
    });
  }, [kpiEvaluations, rankDeptFilter, empMap]);

  const totalWeight = useMemo(() => criteriaList.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0), [criteriaList]);

  const evalTotalScore = useMemo(() => Math.round(evalDetails.reduce((s, d) => s + (d.weighted_score || 0), 0) * 10) / 10, [evalDetails]);
  const evalRating = useMemo(() => getRatingFromScore(evalTotalScore), [evalTotalScore]);

  // ============ TEMPLATE ACTIONS ============

  const resetTemplateForm = useCallback(() => {
    setTemplateForm({ name: '', department_id: '' });
    setCriteriaList([]);
    setEditingTemplate(null);
    setShowTemplateForm(false);
  }, []);

  const handleEditTemplate = useCallback((template) => {
    setEditingTemplate(template);
    setTemplateForm({ name: template.name, department_id: template.department_id || '' });
    const list = (criteriaByTemplate[template.id] || []).map(c => ({ id: c.id, name: c.name, weight: c.weight, target_value: c.target_value, unit: c.unit || '', description: c.description || '' }));
    setCriteriaList(list.length > 0 ? list : [{ name: '', weight: 0, target_value: 0, unit: '', description: '' }]);
    setShowTemplateForm(true);
  }, [criteriaByTemplate]);

  const handleNewTemplate = useCallback(() => {
    resetTemplateForm();
    setCriteriaList([{ name: '', weight: 0, target_value: 0, unit: '', description: '' }]);
    setShowTemplateForm(true);
  }, [resetTemplateForm]);

  const updateCriteria = useCallback((idx, field, value) => {
    setCriteriaList(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: value }; return n; });
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    if (!templateForm.name.trim()) return alert('Vui lòng nhập tên mẫu KPI');
    if (criteriaList.length === 0) return alert('Vui lòng thêm ít nhất 1 tiêu chí');
    const tw = criteriaList.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0);
    if (Math.abs(tw - 100) > 0.01) return alert(`Tổng trọng số phải bằng 100%. Hiện tại: ${tw}%`);
    if (criteriaList.find(c => !c.name.trim() || !c.weight)) return alert('Vui lòng nhập đầy đủ tên và trọng số cho tất cả tiêu chí');

    setSaving(true);
    try {
      let templateId;
      if (editingTemplate) {
        const { error } = await supabase.from('kpi_templates').update({ name: templateForm.name.trim(), department_id: templateForm.department_id || null }).eq('id', editingTemplate.id);
        if (error) throw error;
        templateId = editingTemplate.id;
        await supabase.from('kpi_criteria').delete().eq('template_id', templateId);
      } else {
        const { data, error } = await supabase.from('kpi_templates').insert({ name: templateForm.name.trim(), department_id: templateForm.department_id || null, tenant_id: tenant.id, created_at: getNowISOVN() }).select().single();
        if (error) throw error;
        templateId = data.id;
      }
      const rows = criteriaList.map((c, idx) => ({ template_id: templateId, name: c.name.trim(), weight: parseFloat(c.weight) || 0, target_value: parseFloat(c.target_value) || 0, unit: c.unit.trim(), description: c.description.trim(), sort_order: idx }));
      const { error: cErr } = await supabase.from('kpi_criteria').insert(rows);
      if (cErr) throw cErr;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: editingTemplate ? 'update' : 'create', entityType: 'kpi_template',
        entityId: templateId, entityName: templateForm.name.trim(),
        description: `${editingTemplate ? 'Cập nhật' : 'Tạo'} mẫu KPI: ${templateForm.name.trim()}`
      });
      await loadHrmData();
      resetTemplateForm();
    } catch (err) {
      console.error('Lỗi lưu mẫu KPI:', err);
      alert('Lỗi lưu mẫu KPI: ' + err.message);
    } finally { setSaving(false); }
  }, [templateForm, criteriaList, editingTemplate, tenant, currentUser, loadHrmData, resetTemplateForm]);

  const handleDeleteTemplate = useCallback(async (t) => {
    if (!confirm(`Bạn có chắc muốn xóa mẫu KPI "${t.name}"?`)) return;
    try {
      await supabase.from('kpi_criteria').delete().eq('template_id', t.id);
      const { error } = await supabase.from('kpi_templates').delete().eq('id', t.id);
      if (error) throw error;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'delete', entityType: 'kpi_template',
        entityId: t.id, entityName: t.name,
        description: `Xóa mẫu KPI: ${t.name}`
      });
      await loadHrmData();
    } catch (err) { alert('Lỗi xóa: ' + err.message); }
  }, [loadHrmData]);

  // ============ EVAL ACTIONS ============

  const handleSelectTemplate = useCallback((templateId) => {
    setEvalForm(p => ({ ...p, template_id: templateId }));
    setEvalDetails((criteriaByTemplate[templateId] || []).map(c => ({
      criteria_id: c.id, criteria_name: c.name, weight: c.weight, target_value: c.target_value,
      unit: c.unit || '', actual_value: 0, achievement_rate: 0, weighted_score: 0
    })));
  }, [criteriaByTemplate]);

  const updateEvalDetail = useCallback((idx, val) => {
    setEvalDetails(prev => {
      const n = [...prev]; const d = { ...n[idx] };
      d.actual_value = parseFloat(val) || 0;
      d.achievement_rate = d.target_value > 0 ? Math.min(Math.round((d.actual_value / d.target_value) * 100 * 10) / 10, 150) : 0;
      d.weighted_score = Math.round(d.achievement_rate * d.weight / 100 * 10) / 10;
      n[idx] = d; return n;
    });
  }, []);

  const resetEvalForm = useCallback(() => {
    setEvalForm({ employee_id: '', template_id: '', period: getCurrentPeriod(), employee_comment: '', manager_comment: '' });
    setEvalDetails([]); setEditingEval(null); setShowEvalForm(false);
  }, []);

  const handleEditEval = useCallback((ev) => {
    setEditingEval(ev);
    setEvalForm({ employee_id: ev.employee_id, template_id: ev.template_id, period: ev.period, employee_comment: ev.employee_comment || '', manager_comment: ev.manager_comment || '' });
    const details = (detailsByEval[ev.id] || []).map(d => ({ id: d.id, criteria_id: d.criteria_id, criteria_name: d.criteria_name || '', weight: d.weight || 0, target_value: d.target_value || 0, unit: d.unit || '', actual_value: d.actual_value || 0, achievement_rate: d.achievement_rate || 0, weighted_score: d.weighted_score || 0 }));
    if (details.length > 0) { setEvalDetails(details); }
    else { handleSelectTemplate(ev.template_id); }
    setShowEvalForm(true);
  }, [detailsByEval, handleSelectTemplate]);

  const handleSaveEval = useCallback(async (status = 'draft') => {
    if (!evalForm.employee_id) return alert('Vui lòng chọn nhân viên');
    if (!evalForm.template_id) return alert('Vui lòng chọn mẫu KPI');
    if (!evalForm.period) return alert('Vui lòng chọn kỳ đánh giá');

    setSaving(true);
    try {
      const totalScore = Math.round(evalDetails.reduce((s, d) => s + (d.weighted_score || 0), 0) * 10) / 10;
      const rating = getRatingFromScore(totalScore);
      let evalId;

      if (editingEval) {
        const { error } = await supabase.from('kpi_evaluations').update({ employee_id: evalForm.employee_id, template_id: evalForm.template_id, period: evalForm.period, total_score: totalScore, rating, status, employee_comment: evalForm.employee_comment || null, manager_comment: evalForm.manager_comment || null }).eq('id', editingEval.id);
        if (error) throw error;
        evalId = editingEval.id;
        await supabase.from('kpi_evaluation_details').delete().eq('evaluation_id', evalId);
      } else {
        const { data: existing } = await supabase.from('kpi_evaluations').select('id').eq('employee_id', evalForm.employee_id).eq('period', evalForm.period).eq('tenant_id', tenant.id).maybeSingle();
        if (existing) { setSaving(false); return alert('Nhân viên này đã có đánh giá trong kỳ này. Vui lòng sửa đánh giá hiện có.'); }
        const { data, error } = await supabase.from('kpi_evaluations').insert({ employee_id: evalForm.employee_id, template_id: evalForm.template_id, period: evalForm.period, total_score: totalScore, rating, status, employee_comment: evalForm.employee_comment || null, manager_comment: evalForm.manager_comment || null, tenant_id: tenant.id, evaluated_by: currentUser.name || currentUser.id, created_at: getNowISOVN() }).select().single();
        if (error) throw error;
        evalId = data.id;
      }

      const rows = evalDetails.map(d => ({ evaluation_id: evalId, criteria_id: d.criteria_id, target_value: d.target_value, actual_value: d.actual_value, achievement_rate: d.achievement_rate, weighted_score: d.weighted_score }));
      const { error: dErr } = await supabase.from('kpi_evaluation_details').insert(rows);
      if (dErr) throw dErr;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: editingEval ? 'update' : 'create', entityType: 'kpi_evaluation',
        entityId: evalId,
        description: `${editingEval ? 'Cập nhật' : 'Tạo'} đánh giá KPI kỳ ${evalForm.period} cho NV ${evalForm.employee_id}`
      });
      await loadHrmData();
      resetEvalForm();
    } catch (err) {
      console.error('Lỗi lưu đánh giá:', err);
      alert('Lỗi lưu đánh giá: ' + err.message);
    } finally { setSaving(false); }
  }, [evalForm, evalDetails, editingEval, tenant, currentUser, loadHrmData, resetEvalForm]);

  const handleDeleteEval = useCallback(async (ev) => {
    if (!confirm('Bạn có chắc muốn xóa đánh giá này?')) return;
    try {
      await supabase.from('kpi_evaluation_details').delete().eq('evaluation_id', ev.id);
      const { error } = await supabase.from('kpi_evaluations').delete().eq('id', ev.id);
      if (error) throw error;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'delete', entityType: 'kpi_evaluation',
        entityId: ev.id,
        description: `Xóa đánh giá KPI kỳ ${ev.period}`
      });
      await loadHrmData();
    } catch (err) { alert('Lỗi xóa: ' + err.message); }
  }, [loadHrmData]);

  const handleUpdateEvalStatus = useCallback(async (ev, newStatus) => {
    try {
      const { error } = await supabase.from('kpi_evaluations').update({ status: newStatus }).eq('id', ev.id);
      if (error) throw error;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'hrm', action: 'update', entityType: 'kpi_evaluation',
        entityId: ev.id,
        description: `Chuyển trạng thái đánh giá KPI sang ${KPI_STATUSES[newStatus]?.label || newStatus}`
      });
      await loadHrmData();
    } catch (err) { alert('Lỗi cập nhật: ' + err.message); }
  }, [loadHrmData]);

  // ============ TAB: MAU KPI ============

  const renderTemplatesTab = () => (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <input type="text" placeholder="Tìm kiếm mẫu KPI..." value={templateSearch} onChange={e => setTemplateSearch(e.target.value)}
          className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
        {userCanEdit && (
          <button onClick={handleNewTemplate} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center gap-2">
            <IconPlus /> Thêm mẫu KPI
          </button>
        )}
      </div>

      {/* Template Form Modal */}
      {showTemplateForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">{editingTemplate ? 'Sửa mẫu KPI' : 'Tạo mẫu KPI mới'}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên mẫu KPI *</label>
                <input type="text" value={templateForm.name} onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="VD: KPI Nhân viên Kinh doanh" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phòng ban</label>
                <select value={templateForm.department_id} onChange={e => setTemplateForm(p => ({ ...p, department_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
                  <option value="">-- Tất cả phòng ban --</option>
                  {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Tiêu chí ({criteriaList.length})</label>
                  <span className={`text-sm font-medium ${Math.abs(totalWeight - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                    Tổng: {totalWeight}% {Math.abs(totalWeight - 100) < 0.01 ? '(OK)' : '(phải = 100%)'}
                  </span>
                </div>
                <div className="space-y-3">
                  {criteriaList.map((c, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-400 mt-2 w-6 text-center">{idx + 1}</span>
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <input type="text" placeholder="Tên tiêu chí *" value={c.name} onChange={e => updateCriteria(idx, 'name', e.target.value)}
                            className="sm:col-span-2 border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500" />
                          <input type="number" placeholder="Trọng số (%)" value={c.weight || ''} onChange={e => updateCriteria(idx, 'weight', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500" min="0" max="100" />
                          <input type="number" placeholder="Chỉ tiêu" value={c.target_value || ''} onChange={e => updateCriteria(idx, 'target_value', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500" min="0" />
                        </div>
                        <button onClick={() => setCriteriaList(p => p.filter((_, i) => i !== idx))} disabled={criteriaList.length <= 1}
                          className="text-red-500 hover:text-red-700 p-1 disabled:opacity-30" title="Xóa tiêu chí"><IconTrash /></button>
                      </div>
                      <div className="flex gap-2 ml-8">
                        <input type="text" placeholder="Đơn vị (VD: triệu đồng, đơn, %)" value={c.unit} onChange={e => updateCriteria(idx, 'unit', e.target.value)}
                          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-green-500" />
                        <input type="text" placeholder="Mô tả" value={c.description} onChange={e => updateCriteria(idx, 'description', e.target.value)}
                          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-green-500" />
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setCriteriaList(p => [...p, { name: '', weight: 0, target_value: 0, unit: '', description: '' }])}
                  className="mt-2 text-green-600 hover:text-green-800 text-sm font-medium flex items-center gap-1"><IconPlus /> Thêm tiêu chí</button>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={resetTemplateForm} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">Hủy</button>
              <button onClick={handleSaveTemplate} disabled={saving}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : editingTemplate ? 'Cập nhật' : 'Tạo mẫu KPI'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template list */}
      {filteredTemplates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">Chưa có mẫu KPI nào. Hãy tạo mẫu đầu tiên!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTemplates.map(t => {
            const criteria = criteriaByTemplate[t.id] || [];
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800">{t.name}</h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {t.department_id && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{deptMap[t.department_id] || 'N/A'}</span>}
                      <span className="text-xs text-gray-500">{criteria.length} tiêu chí</span>
                    </div>
                  </div>
                  {userCanEdit && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEditTemplate(t)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Sửa"><IconEdit /></button>
                      <button onClick={() => handleDeleteTemplate(t)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Xóa"><IconTrash /></button>
                    </div>
                  )}
                </div>
                {criteria.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {criteria.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(c => (
                      <div key={c.id} className="flex items-center gap-2 text-xs text-gray-600">
                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full flex-shrink-0" />
                        <span className="truncate">{c.name}</span>
                        <span className="font-medium text-green-700 flex-shrink-0">{c.weight}%</span>
                        {c.target_value > 0 && <span className="text-gray-400 flex-shrink-0">(chỉ tiêu: {c.target_value}{c.unit ? ` ${c.unit}` : ''})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ============ TAB: DANH GIA ============

  const renderEvaluationsTab = () => (
    <div>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex-1 flex flex-wrap items-center gap-2">
          <input type="month" value={evalFilterPeriod} onChange={e => setEvalFilterPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
          <select value={evalFilterDept} onChange={e => setEvalFilterDept(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
            <option value="">Tất cả phòng ban</option>
            {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={evalFilterStatus} onChange={e => setEvalFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
            <option value="">Tất cả trạng thái</option>
            {Object.entries(KPI_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {canManageKpi && (
          <button onClick={() => { resetEvalForm(); setShowEvalForm(true); }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center gap-2">
            <IconPlus /> Tạo đánh giá
          </button>
        )}
      </div>

      {/* Eval Form Modal */}
      {showEvalForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">{editingEval ? 'Sửa đánh giá KPI' : 'Tạo đánh giá KPI mới'}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên *</label>
                  <select value={evalForm.employee_id} onChange={e => setEvalForm(p => ({ ...p, employee_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" disabled={!!editingEval}>
                    <option value="">-- Chọn nhân viên --</option>
                    {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mẫu KPI *</label>
                  <select value={evalForm.template_id} onChange={e => handleSelectTemplate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" disabled={!!editingEval}>
                    <option value="">-- Chọn mẫu KPI --</option>
                    {(kpiTemplates || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kỳ đánh giá *</label>
                  <input type="month" value={evalForm.period} onChange={e => setEvalForm(p => ({ ...p, period: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" disabled={!!editingEval} />
                </div>
              </div>

              {evalDetails.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Bảng chấm điểm</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-green-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-green-800 border-b">Tiêu chí</th>
                          <th className="text-center px-3 py-2 font-medium text-green-800 border-b w-20">Trọng số</th>
                          <th className="text-center px-3 py-2 font-medium text-green-800 border-b w-24">Chỉ tiêu</th>
                          <th className="text-center px-3 py-2 font-medium text-green-800 border-b w-28">Thực tế</th>
                          <th className="text-center px-3 py-2 font-medium text-green-800 border-b w-24">% Hoàn thành</th>
                          <th className="text-center px-3 py-2 font-medium text-green-800 border-b w-20">Điểm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evalDetails.map((d, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-800">{d.criteria_name}</div>
                              {d.unit && <div className="text-xs text-gray-400">Đơn vị: {d.unit}</div>}
                            </td>
                            <td className="text-center px-3 py-2 text-gray-600">{d.weight}%</td>
                            <td className="text-center px-3 py-2 text-gray-600">{d.target_value}</td>
                            <td className="text-center px-3 py-2">
                              <input type="number" value={d.actual_value || ''} onChange={e => updateEvalDetail(idx, e.target.value)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center focus:ring-2 focus:ring-green-500" min="0" step="any" />
                            </td>
                            <td className="text-center px-3 py-2">
                              <span className={`font-medium ${d.achievement_rate >= 100 ? 'text-green-600' : d.achievement_rate >= 75 ? 'text-blue-600' : d.achievement_rate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {d.achievement_rate}%
                              </span>
                            </td>
                            <td className="text-center px-3 py-2 font-semibold text-green-700">{d.weighted_score}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-green-50">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right font-bold text-green-800">Tổng điểm:</td>
                          <td className="text-center px-3 py-2 font-bold text-lg text-green-700">{evalTotalScore}</td>
                        </tr>
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right font-bold text-green-800">Xếp hạng:</td>
                          <td className="text-center px-3 py-2">
                            <span className={`px-2 py-1 rounded-full text-sm font-bold ${getRatingColor(evalRating)}`}>{evalRating} - {KPI_RATINGS[evalRating]?.label}</span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nhận xét nhân viên</label>
                  <textarea value={evalForm.employee_comment} onChange={e => setEvalForm(p => ({ ...p, employee_comment: e.target.value }))}
                    rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" placeholder="Nhân viên tự nhận xét..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nhận xét quản lý</label>
                  <textarea value={evalForm.manager_comment} onChange={e => setEvalForm(p => ({ ...p, manager_comment: e.target.value }))}
                    rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" placeholder="Quản lý nhận xét..." />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex flex-wrap justify-end gap-3">
              <button onClick={resetEvalForm} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">Hủy</button>
              <button onClick={() => handleSaveEval('draft')} disabled={saving}
                className="px-4 py-2 rounded-lg bg-gray-600 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu nháp'}</button>
              <button onClick={() => handleSaveEval('self_evaluated')} disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? 'Đang lưu...' : 'Gửi tự đánh giá'}</button>
              <button onClick={() => handleSaveEval('completed')} disabled={saving}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">{saving ? 'Đang lưu...' : 'Hoàn thành'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Tổng đánh giá', value: filteredEvaluations.length, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
          { label: 'Đang nháp', value: filteredEvaluations.filter(e => e.status === 'draft').length, bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700' },
          { label: 'Chờ duyệt', value: filteredEvaluations.filter(e => e.status === 'self_evaluated' || e.status === 'manager_reviewed').length, bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700' },
          { label: 'Hoàn thành', value: filteredEvaluations.filter(e => e.status === 'completed').length, bg: 'bg-green-50 border-green-200', text: 'text-green-700' }
        ].map((s, i) => (
          <div key={i} className={`${s.bg} border rounded-xl p-3`}>
            <div className={`text-2xl font-bold ${s.text}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Evaluation list */}
      {filteredEvaluations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">Chưa có đánh giá nào trong kỳ này.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Nhân viên</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700 hidden sm:table-cell">Phòng ban</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700 hidden md:table-cell">Mẫu KPI</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">Điểm</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">Xếp hạng</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">Trạng thái</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700 w-32">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvaluations.map(ev => {
                  const emp = empMap[ev.employee_id];
                  const tmpl = templateMap[ev.template_id];
                  const rating = ev.rating || getRatingFromScore(ev.total_score || 0);
                  const nextStatus = NEXT_STATUS[ev.status];
                  const nextLabel = NEXT_LABEL[ev.status];
                  return (
                    <tr key={ev.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{emp?.full_name || 'N/A'}</div>
                        <div className="text-xs text-gray-400 sm:hidden">{emp?.department_id ? deptMap[emp.department_id] : ''}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{emp?.department_id ? deptMap[emp.department_id] : '-'}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{tmpl?.name || 'N/A'}</td>
                      <td className="text-center px-4 py-3 font-bold text-green-700">{ev.total_score || 0}</td>
                      <td className="text-center px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getRatingColor(rating)}`}>{rating} - {KPI_RATINGS[rating]?.label}</span>
                      </td>
                      <td className="text-center px-4 py-3">{getStatusBadge(ev.status)}</td>
                      <td className="text-center px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {canManageKpi && (
                            <button onClick={() => handleEditEval(ev)} className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Sửa"><IconEdit /></button>
                          )}
                          {canManageKpi && nextStatus && <button onClick={() => handleUpdateEvalStatus(ev, nextStatus)}
                            className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">{nextLabel}</button>}
                          {userCanEdit && ev.status === 'draft' && <button onClick={() => handleDeleteEval(ev)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Xóa"><IconTrash /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ============ TAB: XEP HANG ============

  const renderRankingTab = () => {
    const ratingCounts = { A: 0, B: 0, C: 0, D: 0 };
    rankingData.forEach(e => { const r = e.rating || getRatingFromScore(e.total_score || 0); if (ratingCounts[r] !== undefined) ratingCounts[r]++; });
    const avgScore = rankingData.length > 0 ? Math.round(rankingData.reduce((s, e) => s + (e.total_score || 0), 0) / rankingData.length * 10) / 10 : 0;

    return (
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input type="month" value={rankPeriod} onChange={e => setRankPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
          <select value={rankDeptFilter} onChange={e => setRankDeptFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
            <option value="">Tất cả phòng ban</option>
            {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="text-2xl font-bold text-green-700">{rankingData.length}</div>
            <div className="text-xs text-gray-500 mt-1">Tổng NV</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="text-2xl font-bold text-green-700">{avgScore}</div>
            <div className="text-xs text-gray-500 mt-1">Điểm TB</div>
          </div>
          {Object.entries(KPI_RATINGS).map(([key, val]) => (
            <div key={key} className={`bg-${val.color === 'green' ? 'green' : val.color === 'blue' ? 'blue' : val.color === 'yellow' ? 'yellow' : 'red'}-50 border border-${val.color === 'green' ? 'green' : val.color === 'blue' ? 'blue' : val.color === 'yellow' ? 'yellow' : 'red'}-200 rounded-xl p-3`}>
              <div className={`text-2xl font-bold text-${val.color === 'green' ? 'green' : val.color === 'blue' ? 'blue' : val.color === 'yellow' ? 'yellow' : 'red'}-700`}>{ratingCounts[key]}</div>
              <div className="text-xs text-gray-500 mt-1">Hạng {key} ({val.label})</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Điểm KPI theo nhân viên</h4>
            {rankBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={rankBarData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 'auto']} />
                  <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${value} điểm`, 'Điểm KPI']} />
                  <Bar dataKey="score" fill="#16a34a" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu</div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Xu hướng KPI trung bình (6 tháng)</h4>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value, name) => name === 'avg' ? [`${value} điểm`, 'Điểm TB'] : [`${value} người`, 'Số lượng']} />
                <Legend formatter={(v) => v === 'avg' ? 'Điểm TB' : 'Số lượng đánh giá'} />
                <Line type="monotone" dataKey="avg" stroke="#16a34a" strokeWidth={2} dot={{ fill: '#16a34a', r: 4 }} activeDot={{ r: 6 }} name="avg" />
                <Line type="monotone" dataKey="count" stroke="#9ca3af" strokeWidth={1} strokeDasharray="5 5" dot={{ fill: '#9ca3af', r: 3 }} name="count" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ranking table */}
        {rankingData.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">Chưa có dữ liệu xếp hạng cho kỳ này.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h4 className="text-sm font-semibold text-gray-700">Bảng xếp hạng KPI</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-green-50 border-b border-green-100">
                  <tr>
                    <th className="text-center px-4 py-3 font-medium text-green-800 w-12">#</th>
                    <th className="text-left px-4 py-3 font-medium text-green-800">Nhân viên</th>
                    <th className="text-left px-4 py-3 font-medium text-green-800 hidden sm:table-cell">Phòng ban</th>
                    <th className="text-center px-4 py-3 font-medium text-green-800">Điểm</th>
                    <th className="text-center px-4 py-3 font-medium text-green-800">Xếp hạng</th>
                    <th className="text-left px-4 py-3 font-medium text-green-800 hidden md:table-cell">NX quản lý</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingData.map((ev, idx) => {
                    const emp = empMap[ev.employee_id];
                    const rating = ev.rating || getRatingFromScore(ev.total_score || 0);
                    const medals = ['🥇', '🥈', '🥉'];
                    return (
                      <tr key={ev.id} className={`border-b border-gray-100 ${idx < 3 ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}>
                        <td className="text-center px-4 py-3 font-bold text-gray-600">
                          {idx < 3 ? <span className="text-lg">{medals[idx]}</span> : idx + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{emp?.full_name || 'N/A'}</div>
                          {emp?.position && <div className="text-xs text-gray-400">{emp.position}</div>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{emp?.department_id ? deptMap[emp.department_id] : '-'}</td>
                        <td className="text-center px-4 py-3">
                          <div className="font-bold text-lg text-green-700">{ev.total_score || 0}</div>
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full mx-auto mt-1">
                            <div className={`h-full rounded-full ${rating === 'A' ? 'bg-green-500' : rating === 'B' ? 'bg-blue-500' : rating === 'C' ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(ev.total_score || 0, 100)}%` }} />
                          </div>
                        </td>
                        <td className="text-center px-4 py-3">
                          <span className={`px-3 py-1 rounded-full text-sm font-bold ${getRatingColor(rating)}`}>{rating} - {KPI_RATINGS[rating]?.label}</span>
                          {KPI_RATINGS[rating]?.bonus > 0 && (
                            <div className="text-xs text-green-600 mt-1">+{new Intl.NumberFormat('vi-VN').format(KPI_RATINGS[rating].bonus)}d</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell max-w-[200px] truncate">{ev.manager_comment || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============ MAIN RENDER ============

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Quản lý KPI</h2>
        <p className="text-sm text-gray-500 mt-1">Thiết lập mẫu, đánh giá và xếp hạng hiệu suất nhân viên</p>
      </div>

      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {[
          { key: 'templates', label: 'Mẫu KPI' },
          { key: 'evaluations', label: 'Đánh giá' },
          { key: 'ranking', label: 'Xếp hạng' }
        ].map(tab => (
          <button key={tab.key} onClick={() => setSubTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${subTab === tab.key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'templates' && renderTemplatesTab()}
      {subTab === 'evaluations' && renderEvaluationsTab()}
      {subTab === 'ranking' && renderRankingTab()}
    </div>
  );
}

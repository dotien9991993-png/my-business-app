import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { getStatusColor, getTeamColor, formatMoney } from '../../utils/formatUtils';
import { getVietnamDate } from '../../utils/dateUtils';
import { validateFacebookUrl, validateTikTokUrl, fetchStatsForLink, saveStatsToTask, loadPageConfigs } from '../../services/socialStatsService';

// Format số gọn: 1000→1K, 15000→15K, 1500000→1.5M
function formatCompactNumber(num) {
  if (num == null) return '—';
  if (num === 0) return '0';
  if (num >= 1000000) return (Math.round(num / 100000) / 10) + 'M';
  if (num >= 1000) return (Math.round(num / 100) / 10) + 'K';
  return num.toString();
}

// Tổng hợp stats theo platform — chỉ trả về platform có views data
function getTaskStatsByPlatform(task) {
  const links = task.postLinks || [];
  const byPlatform = {};
  for (const link of links) {
    if (!link.stats || !link.type || link.stats.views == null) continue;
    if (!byPlatform[link.type]) byPlatform[link.type] = { views: 0, likes: 0, comments: 0, shares: 0 };
    const p = byPlatform[link.type];
    p.views += link.stats.views || 0;
    p.likes += link.stats.likes || 0;
    p.comments += link.stats.comments || 0;
    p.shares += link.stats.shares || 0;
  }
  return Object.keys(byPlatform).length > 0 ? byPlatform : null;
}

// Reusable multi-select dropdown with checkboxes
function MultiSelectFilter({ label, options, selected, onChange, icon }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  const active = selected.length > 0;
  return (
    <div ref={ref} className="relative">
      <label className="text-xs sm:text-sm font-medium mb-1 md:mb-2 block">{icon ? `${icon} ` : ''}{label}</label>
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-left flex items-center justify-between gap-1 text-xs sm:text-sm transition-colors ${active ? 'border-blue-400 bg-blue-50' : 'bg-white'}`}>
        <span className="truncate">{active ? `${selected.length} đã chọn` : 'Tất cả'}</span>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[180px] bg-white border rounded-lg shadow-lg overflow-hidden">
          {active && (
            <button type="button" onClick={() => { onChange([]); }} className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 border-b font-medium">✕ Bỏ chọn tất cả</button>
          )}
          <div className="max-h-48 overflow-y-auto">
            {options.map(opt => {
              const val = typeof opt === 'string' ? opt : opt.value;
              const lbl = typeof opt === 'string' ? opt : opt.label;
              return (
                <label key={val} className="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-xs sm:text-sm border-b last:border-b-0">
                  <input type="checkbox" checked={selected.includes(val)} onChange={() => toggle(val)} className="w-3.5 h-3.5 text-blue-600 rounded" />
                  <span className="truncate">{lbl}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      {active && (
        <div className="flex gap-1 flex-wrap mt-1">
          {selected.map(v => {
            const opt = options.find(o => (typeof o === 'string' ? o : o.value) === v);
            const lbl = opt ? (typeof opt === 'string' ? opt : opt.label) : v;
            return <span key={v} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">
              {lbl}<button type="button" onClick={() => toggle(v)} className="text-blue-500 hover:text-red-500 ml-0.5">×</button>
            </span>;
          })}
        </div>
      )}
    </div>
  );
}

const TasksView = ({
  visibleTasks,
  setSelectedTask,
  setShowModal,
  setShowCreateTaskModal,
  taskFilterTeam,
  setTaskFilterTeam,
  taskFilterStatus,
  setTaskFilterStatus,
  taskFilterAssignee,
  setTaskFilterAssignee,
  taskFilterCategory,
  setTaskFilterCategory,
  taskDateFilter,
  setTaskDateFilter,
  taskCustomStartDate,
  setTaskCustomStartDate,
  taskCustomEndDate,
  setTaskCustomEndDate,
  taskFilterCrew,
  setTaskFilterCrew,
  taskFilterEditor,
  setTaskFilterEditor,
  taskFilterActor,
  setTaskFilterActor,
  taskFilterProduct,
  setTaskFilterProduct,
  taskFilterParticipant,
  setTaskFilterParticipant,
  taskSortBy,
  setTaskSortBy,
  tenant,
  currentUser,
}) => {
  // Filter state — multi-select filters are arrays, empty = "all"
  const filterTeam = taskFilterTeam || [];
  const setFilterTeam = setTaskFilterTeam;
  const filterStatus = taskFilterStatus || [];
  const setFilterStatus = setTaskFilterStatus;
  const filterAssignee = taskFilterAssignee || [];
  const setFilterAssignee = setTaskFilterAssignee;
  const filterCategory = taskFilterCategory || [];
  const setFilterCategory = setTaskFilterCategory;
  const dateFilter = taskDateFilter;
  const setDateFilter = setTaskDateFilter;
  const customStartDate = taskCustomStartDate;
  const setCustomStartDate = setTaskCustomStartDate;
  const customEndDate = taskCustomEndDate;
  const setCustomEndDate = setTaskCustomEndDate;
  const filterCrew = taskFilterCrew || [];
  const setFilterCrew = setTaskFilterCrew || (() => {});
  const filterEditor = taskFilterEditor || [];
  const setFilterEditor = setTaskFilterEditor || (() => {});
  const filterActor = taskFilterActor || [];
  const setFilterActor = setTaskFilterActor || (() => {});
  const filterProducts = taskFilterProduct || [];
  const setFilterProducts = setTaskFilterProduct || (() => {});
  const filterParticipant = taskFilterParticipant || 'all';
  const setFilterParticipant = setTaskFilterParticipant || (() => {});
  const sortBy = taskSortBy || 'newest';
  const setSortBy = setTaskSortBy || (() => {});
  const [activePreset, setActivePreset] = useState(null);

  // Quick presets
  const PRESETS = [
    { id: 'my_today', label: '🔥 Của tôi hôm nay', apply: () => {
      clearFilters();
      setFilterParticipant(currentUser?.name || 'all');
      setDateFilter('today');
      setFilterStatus(['Nháp', 'Chưa Quay', 'Đã Quay', 'Đang Edit']);
    }},
    { id: 'overdue', label: '⚠️ Quá hạn chưa xong', apply: () => {
      clearFilters();
      setDateFilter('overdue');
      setFilterStatus(['Nháp', 'Chưa Quay', 'Đã Quay', 'Đang Edit']);
    }},
    { id: 'this_month', label: '📅 Tháng này', apply: () => { clearFilters(); setDateFilter('month'); }},
    { id: 'missing_links', label: '❌ Thiếu link', apply: () => {
      clearFilters();
      setFilterStatus(['Hoàn Thành']);
      setFilterLinkIssue('missing');
    }},
    { id: 'no_stats', label: '📊 Lỗi stats', apply: () => { clearFilters(); setFilterLinkIssue('no_stats'); }},
    { id: 'done_week', label: '✅ Xong tuần này', apply: () => {
      clearFilters();
      setDateFilter('week');
      setFilterStatus(['Hoàn Thành']);
    }},
  ];
  const applyPreset = (preset) => {
    preset.apply();
    setActivePreset(preset.id);
  };
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [showProductFilter, setShowProductFilter] = useState(false);
  const [filterLinkIssue, setFilterLinkIssue] = useState('all');
  const [productFilterSearch, setProductFilterSearch] = useState('');
  const productFilterRef = React.useRef(null);

  // Bulk stats update
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkResult, setBulkResult] = useState(null);
  const bulkCancelRef = React.useRef(false);

  // Load product names for display
  const [productMap, setProductMap] = useState({});

  const videoCategories = [
    { id: 'video_dan', name: '🎬 Video dàn', color: 'purple' },
    { id: 'video_hangngay', name: '📅 Video hàng ngày', color: 'blue' },
    { id: 'video_huongdan', name: '📚 Video hướng dẫn', color: 'green' },
    { id: 'video_quangcao', name: '📢 Video quảng cáo', color: 'orange' },
    { id: 'video_review', name: '⭐ Video review', color: 'yellow' }
  ];

  // Collect all product IDs from visible tasks and load their names
  useEffect(() => {
    const allProductIds = [...new Set(visibleTasks.flatMap(t => t.product_ids || []))];
    if (allProductIds.length === 0) { setProductMap({}); return; }

    const loadProductNames = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, sku, sell_price')
          .in('id', allProductIds);
        if (error) throw error;
        const map = {};
        (data || []).forEach(p => { map[p.id] = { name: p.name, sku: p.sku, sell_price: p.sell_price }; });
        setProductMap(map);
      } catch (err) {
        console.error('Error loading product names:', err);
      }
    };
    loadProductNames();
  }, [visibleTasks]);

  // Close product filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (productFilterRef.current && !productFilterRef.current.contains(e.target)) {
        setShowProductFilter(false);
        setProductFilterSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleProductFilter = (pid) => {
    if (filterProducts.includes(pid)) {
      setFilterProducts(filterProducts.filter(id => id !== pid));
    } else {
      setFilterProducts([...filterProducts, pid]);
    }
  };

  // Helper: Get date range based on filter (Vietnam timezone UTC+7)
  const getDateRange = () => {
    // Get current date in Vietnam timezone (UTC+7)
    const vietnamTime = getVietnamDate();
    const today = new Date(vietnamTime.getFullYear(), vietnamTime.getMonth(), vietnamTime.getDate());

    switch(dateFilter) {
      case 'today': {
        // Hôm nay: deadline đúng ngày hôm nay
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { start: today, end: tomorrow };
      }
      case 'week': {
        // Tuần này: từ đầu tuần (Thứ 2) đến cuối tuần (Chủ nhật)
        const dayOfWeek = today.getDay(); // 0 = CN, 1 = T2, ...
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() + mondayOffset);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7); // Đến hết Chủ nhật
        return { start: weekStart, end: weekEnd };
      }
      case 'month': {
        // Tháng này: từ ngày 1 đến cuối tháng
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1); // Ngày đầu tháng sau
        return { start: monthStart, end: monthEnd };
      }
      case 'overdue': {
        // Quá hạn: deadline trước hôm nay
        return { start: new Date(2000, 0, 1), end: today };
      }
      case 'custom': {
        if (!customStartDate || !customEndDate) return null;
        const endDate = new Date(customEndDate);
        endDate.setDate(endDate.getDate() + 1); // Bao gồm ngày cuối
        return {
          start: new Date(customStartDate),
          end: endDate
        };
      }
      default:
        return null;
    }
  };

  const filteredTasks = visibleTasks.filter(t => {
    if (filterTeam.length > 0 && !filterTeam.includes(t.team)) return false;
    if (filterStatus.length > 0 && !filterStatus.includes(t.status)) return false;
    if (filterAssignee.length > 0 && !filterAssignee.includes(t.assignee)) return false;
    if (filterCategory.length > 0 && !filterCategory.includes(t.category)) return false;
    if (filterCrew.length > 0 && !(t.cameramen || []).some(c => filterCrew.includes(c))) return false;
    if (filterEditor.length > 0 && !(t.editors || []).some(e => filterEditor.includes(e))) return false;
    if (filterActor.length > 0 && !(t.actors || []).some(a => filterActor.includes(a))) return false;
    if (filterParticipant !== 'all') {
      const p = filterParticipant;
      if (t.assignee !== p && !(t.cameramen || []).includes(p) && !(t.editors || []).includes(p) && !(t.actors || []).includes(p)) return false;
    }
    if (filterProducts.length > 0 && !(t.product_ids || []).some(pid => filterProducts.includes(pid))) return false;
    if (filterLinkIssue === 'invalid' && !(t.postLinks || []).some(l =>
      (l.type === 'Facebook' && !validateFacebookUrl(l.url)) ||
      (l.type === 'TikTok' && !validateTikTokUrl(l.url))
    )) return false;
    if (filterLinkIssue === 'missing') {
      const platforms = (t.platform || '').split(', ').filter(Boolean);
      const linkTypes = (t.postLinks || []).map(l => l.type);
      if (platforms.length === 0 || !platforms.some(p => !linkTypes.includes(p))) return false;
    }
    if (filterLinkIssue === 'no_stats') {
      const links = t.postLinks || [];
      const hasLink = links.some(l => l.type === 'Facebook' || l.type === 'TikTok');
      const hasStats = links.some(l => l.stats && (l.stats.views > 0 || l.stats.likes > 0));
      if (!hasLink || hasStats) return false;
    }

    // Date filter (Vietnam timezone)
    if (dateFilter !== 'all') {
      const range = getDateRange();
      if (!range) return false;

      // Parse task date - chuyển về ngày thuần túy để so sánh
      if (!t.dueDate) return false;
      const taskDateParts = t.dueDate.split('-');
      const taskDate = new Date(parseInt(taskDateParts[0]), parseInt(taskDateParts[1]) - 1, parseInt(taskDateParts[2]));

      if (dateFilter === 'overdue') {
        // Overdue: deadline < today AND not completed
        if (!(taskDate < range.end && t.status !== 'Hoàn Thành')) return false;
      } else {
        // Other filters: start <= taskDate < end
        if (!(taskDate >= range.start && taskDate < range.end)) return false;
      }
    }

    return true;
  });

  // Participant stats — tính từ filteredTasks (đã áp dụng TẤT CẢ filter kể cả deadline)
  const participantStats = filterParticipant !== 'all' ? (() => {
    const p = filterParticipant;
    const tasks = filteredTasks;
    return {
      total: tasks.length,
      asContent: tasks.filter(t => t.assignee === p).length,
      asCrew: tasks.filter(t => (t.cameramen || []).includes(p)).length,
      asEditor: tasks.filter(t => (t.editors || []).includes(p)).length,
      asActor: tasks.filter(t => (t.actors || []).includes(p)).length,
    };
  })() : null;

  // Helper: get participant roles for a task
  const getParticipantRoles = (task) => {
    if (filterParticipant === 'all') return [];
    const p = filterParticipant;
    const roles = [];
    if (task.assignee === p) roles.push('📝 Content');
    if ((task.cameramen || []).includes(p)) roles.push('🎥 Quay');
    if ((task.editors || []).includes(p)) roles.push('✂️ Dựng');
    if ((task.actors || []).includes(p)) roles.push('🎭 Diễn');
    return roles;
  };

  const handleDateFilterChange = (value) => {
    setDateFilter(value);
    setShowCustomDate(value === 'custom');
    if (value !== 'custom') {
      setCustomStartDate('');
      setCustomEndDate('');
    }
  };

  const clearFilters = () => {
    setFilterTeam([]);
    setFilterStatus([]);
    setFilterAssignee([]);
    setFilterCategory([]);
    setFilterCrew([]);
    setFilterEditor([]);
    setFilterActor([]);
    setFilterParticipant('all');
    setFilterProducts([]);
    setFilterLinkIssue('all');
    setDateFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setShowCustomDate(false);
    setSortBy('newest');
    setActivePreset(null);
  };

  // Bulk update stats cho tất cả task đang hiển thị
  const handleBulkUpdateStats = async () => {
    const tasksWithFbLinks = filteredTasks.filter(task =>
      (task.postLinks || []).some(l => l.type === 'Facebook' && validateFacebookUrl(l.url))
    );
    if (!tasksWithFbLinks.length) {
      setBulkResult({ success: 0, total: 0 });
      setTimeout(() => setBulkResult(null), 3000);
      return;
    }

    const tenantId = tenant?.id;
    if (!tenantId) return;

    setBulkUpdating(true);
    setBulkProgress(0);
    setBulkTotal(tasksWithFbLinks.length);
    setBulkResult(null);
    bulkCancelRef.current = false;

    let pageConfigs;
    try {
      pageConfigs = await loadPageConfigs(tenantId);
    } catch {
      setBulkUpdating(false);
      setBulkResult({ success: 0, total: tasksWithFbLinks.length, error: 'Lỗi tải page configs' });
      setTimeout(() => setBulkResult(null), 5000);
      return;
    }

    let successCount = 0;
    for (let t = 0; t < tasksWithFbLinks.length; t++) {
      if (bulkCancelRef.current) break;
      const task = tasksWithFbLinks[t];
      const fbLinks = (task.postLinks || [])
        .map((l, idx) => ({ ...l, _idx: idx }))
        .filter(l => l.type === 'Facebook' && validateFacebookUrl(l.url));

      let taskSuccess = false;
      let currentPostLinks = [...(task.postLinks || [])];

      for (const link of fbLinks) {
        if (bulkCancelRef.current) break;
        try {
          const result = await fetchStatsForLink(link.url, pageConfigs, tenantId);
          if (result?.stats) {
            currentPostLinks = await saveStatsToTask(task.id, link._idx, result.stats, currentPostLinks);
            taskSuccess = true;
          }
        } catch {
          // skip link lỗi
        }
        // Delay 1 giây giữa mỗi request
        if (!bulkCancelRef.current) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (taskSuccess) successCount++;
      setBulkProgress(t + 1);
    }

    setBulkUpdating(false);
    setBulkResult({ success: successCount, total: tasksWithFbLinks.length });
    setTimeout(() => setBulkResult(null), 5000);
  };

  const uniqueCrew = [...new Set(visibleTasks.flatMap(t => t.cameramen || []))].sort();
  const uniqueEditors = [...new Set(visibleTasks.flatMap(t => t.editors || []))].sort();
  const uniqueActors = [...new Set(visibleTasks.flatMap(t => t.actors || []))].sort();
  const uniqueParticipants = [...new Set([
    ...visibleTasks.map(t => t.assignee),
    ...visibleTasks.flatMap(t => t.cameramen || []),
    ...visibleTasks.flatMap(t => t.editors || []),
    ...visibleTasks.flatMap(t => t.actors || []),
  ].filter(Boolean))].sort();
  // Unique products for filter
  const uniqueProductIds = [...new Set(visibleTasks.flatMap(t => t.product_ids || []))];

  // Badge counts: dùng filteredTasks trừ link filter để badge phản ánh context filter đang active
  const tasksForLinkBadge = filteredTasks.length !== visibleTasks.length && filterLinkIssue === 'all'
    ? filteredTasks
    : visibleTasks.filter(t => {
        if (filterTeam.length > 0 && !filterTeam.includes(t.team)) return false;
        if (filterStatus.length > 0 && !filterStatus.includes(t.status)) return false;
        if (filterAssignee.length > 0 && !filterAssignee.includes(t.assignee)) return false;
        if (filterCategory.length > 0 && !filterCategory.includes(t.category)) return false;
        if (filterCrew.length > 0 && !(t.cameramen || []).some(c => filterCrew.includes(c))) return false;
        if (filterEditor.length > 0 && !(t.editors || []).some(e => filterEditor.includes(e))) return false;
        if (filterActor.length > 0 && !(t.actors || []).some(a => filterActor.includes(a))) return false;
        if (filterProducts.length > 0 && !(t.product_ids || []).some(pid => filterProducts.includes(pid))) return false;
        if (dateFilter !== 'all') {
          const range = getDateRange();
          if (!range) return false;
          if (!t.dueDate) return false;
          const dp = t.dueDate.split('-');
          const td = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
          if (dateFilter === 'overdue') { if (!(td < range.end && t.status !== 'Hoàn Thành')) return false; }
          else { if (!(td >= range.start && td < range.end)) return false; }
        }
        return true;
      });
  const invalidLinkCount = tasksForLinkBadge.filter(t =>
    (t.postLinks || []).some(l =>
      (l.type === 'Facebook' && !validateFacebookUrl(l.url)) ||
      (l.type === 'TikTok' && !validateTikTokUrl(l.url))
    )
  ).length;
  const missingLinkCount = tasksForLinkBadge.filter(t => {
    const platforms = (t.platform || '').split(', ').filter(Boolean);
    if (platforms.length === 0) return false;
    const linkTypes = (t.postLinks || []).map(l => l.type);
    return platforms.some(p => !linkTypes.includes(p));
  }).length;
  const noStatsCount = tasksForLinkBadge.filter(t => {
    const links = t.postLinks || [];
    const hasLink = links.some(l => l.type === 'Facebook' || l.type === 'TikTok');
    const hasStats = links.some(l => l.stats && (l.stats.views > 0 || l.stats.likes > 0));
    return hasLink && !hasStats;
  }).length;

  // Sort filtered tasks
  const getTotalStats = (task) => {
    const links = task.postLinks || [];
    return links.reduce((acc, l) => {
      if (l.stats) { acc.views += l.stats.views || 0; acc.likes += l.stats.likes || 0; }
      return acc;
    }, { views: 0, likes: 0 });
  };

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    switch (sortBy) {
      case 'oldest': return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      case 'deadline_asc': return (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1;
      case 'deadline_desc': return (b.dueDate || '') < (a.dueDate || '') ? -1 : 1;
      case 'views': return getTotalStats(b).views - getTotalStats(a).views;
      case 'likes': return getTotalStats(b).likes - getTotalStats(a).likes;
      case 'title_az': return (a.title || '').localeCompare(b.title || '');
      case 'title_za': return (b.title || '').localeCompare(a.title || '');
      default: return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }
  });

  const hasActiveFilters = filterTeam.length > 0 || filterStatus.length > 0 || filterAssignee.length > 0 || filterCategory.length > 0 || filterCrew.length > 0 || filterEditor.length > 0 || filterActor.length > 0 || filterParticipant !== 'all' || filterProducts.length > 0 || filterLinkIssue !== 'all' || dateFilter !== 'all';

  // Export Excel
  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const catMap = { video_dan: 'Video dàn', video_hangngay: 'Hàng ngày', video_huongdan: 'Hướng dẫn', video_quangcao: 'Quảng cáo', video_review: 'Review' };
      const fmtD = (d) => d ? d.split('-').reverse().join('/') : '';
      const rows = sortedTasks.map((t, i) => {
        const links = t.postLinks || [];
        const fb = links.find(l => l.type === 'Facebook');
        const tt = links.find(l => l.type === 'TikTok');
        const yt = links.find(l => l.type === 'YouTube');
        const stats = getTotalStats(t);
        return {
          'STT': i + 1,
          'Tiêu đề': t.title || '',
          'Danh mục': catMap[t.category] || t.category || '',
          'Content': t.assignee || '',
          'Quay': (t.cameramen || []).join(', '),
          'Dựng': (t.editors || []).join(', '),
          'Diễn': (t.actors || []).join(', '),
          'Team': t.team || '',
          'Trạng thái': t.status || '',
          'Deadline': fmtD(t.dueDate),
          'Ngày tạo': fmtD(t.created_at?.substring(0, 10)),
          'Ngày HT': fmtD(t.completed_at?.substring(0, 10)),
          'Nền tảng': t.platform || '',
          'Link Facebook': fb?.url || '',
          'Link TikTok': tt?.url || '',
          'Link YouTube': yt?.url || '',
          'Views': stats.views || 0,
          'Likes': stats.likes || 0,
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 5 }, { wch: 35 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
        { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 10 }, { wch: 10 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Video');

      const today = new Date().toISOString().split('T')[0];
      const namePart = filterParticipant !== 'all'
        ? '-' + filterParticipant.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, '-')
        : '';
      XLSX.writeFile(wb, `quan-ly-video${namePart}-${today}.xlsx`);
    } catch (err) {
      alert('Lỗi xuất Excel: ' + err.message);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      <div className="flex justify-between items-center mb-3 md:mb-6 gap-2 flex-wrap">
        <h2 className="text-lg md:text-2xl font-bold">📋 Quản Lý Video</h2>
        <div className="flex gap-2 items-center">
          <button
            onClick={handleExportExcel}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm hidden md:inline-flex items-center gap-1"
          >
            📊 Xuất Excel
          </button>
          <button
            onClick={() => setShowCreateTaskModal(true)}
            className="px-3 md:px-6 py-2 md:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm md:text-base"
          >
            ➕ Tạo Mới
          </button>
        </div>
      </div>

      {/* Unified Responsive Filters */}
      <div className="bg-white rounded-xl shadow mb-3 md:mb-6 overflow-hidden">
        {/* Stats Bar */}
        <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-gray-50 border-b gap-2">
          <span className="text-xs md:text-sm text-gray-600 shrink-0">
            <span className="font-bold text-blue-600">{filteredTasks.length}</span>/{visibleTasks.length} video
          </span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="px-2 py-1 border rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
            <option value="deadline_asc">Deadline gần</option>
            <option value="deadline_desc">Deadline xa</option>
            <option value="views">Views cao</option>
            <option value="likes">Likes cao</option>
            <option value="title_az">Tên A-Z</option>
            <option value="title_za">Tên Z-A</option>
          </select>
          <div className="flex gap-1 flex-wrap justify-end">
            {filterProducts.length > 0 && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] md:text-xs rounded-full">{filterProducts.length} SP</span>}
            {filterStatus.length > 0 && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] md:text-xs rounded-full">{filterStatus.length} TT</span>}
            {filterAssignee.length > 0 && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] md:text-xs rounded-full">{filterAssignee.length} NV</span>}
            {filterTeam.length > 0 && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] md:text-xs rounded-full">{filterTeam.join(', ')}</span>}
            {filterParticipant !== 'all' && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] md:text-xs rounded-full">👤 {filterParticipant.split(' ').pop()}</span>}
            {dateFilter !== 'all' && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] md:text-xs rounded-full">{dateFilter === 'today' ? 'Hôm nay' : dateFilter === 'week' ? 'Tuần' : dateFilter === 'month' ? 'Tháng' : dateFilter === 'overdue' ? 'Quá hạn' : 'Tùy chỉnh'}</span>}
          </div>
        </div>

        <div className="p-2 md:p-4">
          {/* Quick Presets */}
          <div className="flex gap-1.5 flex-wrap mb-3 pb-3 border-b">
            {PRESETS.map(p => (
              <button key={p.id} type="button"
                onClick={() => activePreset === p.id ? clearFilters() : applyPreset(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  activePreset === p.id
                    ? 'bg-green-600 text-white border border-green-600'
                    : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Filter Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-3">
            {/* 1. Product - first, full width on mobile */}
            {uniqueProductIds.length > 0 ? (
              <div ref={productFilterRef} className="relative col-span-2 sm:col-span-1">
                <label className="text-xs sm:text-sm font-medium mb-1 md:mb-2 block">📦 Sản phẩm</label>
                <button
                  type="button"
                  onClick={() => { setShowProductFilter(!showProductFilter); setProductFilterSearch(''); }}
                  className={`w-full px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-left flex items-center justify-between gap-1 text-xs sm:text-sm transition-colors ${
                    filterProducts.length > 0 ? 'border-green-400 bg-green-50' : 'bg-white'
                  }`}
                >
                  <span className="truncate">
                    {filterProducts.length === 0 ? 'Tất cả' : `${filterProducts.length} SP đã chọn`}
                  </span>
                  <span className="text-gray-400 text-xs shrink-0">{showProductFilter ? '▲' : '▼'}</span>
                </button>
                {showProductFilter && (
                  <div className="absolute z-30 mt-1 w-64 sm:w-72 bg-white border rounded-lg shadow-lg overflow-hidden">
                    <div className="p-2 border-b">
                      <input
                        type="text"
                        value={productFilterSearch}
                        onChange={(e) => setProductFilterSearch(e.target.value)}
                        placeholder="🔍 Tìm sản phẩm..."
                        className="w-full px-3 py-1.5 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        autoFocus
                      />
                    </div>
                    {filterProducts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterProducts([])}
                        className="w-full px-3 py-1.5 text-left text-xs sm:text-sm text-red-600 hover:bg-red-50 border-b font-medium"
                      >
                        ✕ Bỏ chọn tất cả
                      </button>
                    )}
                    <div className="max-h-48 overflow-y-auto">
                      {uniqueProductIds
                        .filter(id => {
                          if (!productFilterSearch) return true;
                          const name = (productMap[id]?.name || '').toLowerCase();
                          const sku = (productMap[id]?.sku || '').toLowerCase();
                          return name.includes(productFilterSearch.toLowerCase()) || sku.includes(productFilterSearch.toLowerCase());
                        })
                        .map(id => (
                          <label
                            key={id}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-green-50 cursor-pointer text-xs sm:text-sm border-b last:border-b-0"
                          >
                            <input
                              type="checkbox"
                              checked={filterProducts.includes(id)}
                              onChange={() => toggleProductFilter(id)}
                              className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-600 rounded"
                            />
                            <span className="truncate">{productMap[id]?.name || 'Sản phẩm'}</span>
                          </label>
                        ))}
                      {uniqueProductIds.filter(id => {
                        if (!productFilterSearch) return true;
                        const name = (productMap[id]?.name || '').toLowerCase();
                        const sku = (productMap[id]?.sku || '').toLowerCase();
                        return name.includes(productFilterSearch.toLowerCase()) || sku.includes(productFilterSearch.toLowerCase());
                      }).length === 0 && (
                        <div className="px-3 py-2 text-xs sm:text-sm text-gray-400 text-center">Không tìm thấy</div>
                      )}
                    </div>
                  </div>
                )}
                {filterProducts.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {filterProducts.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] sm:text-xs">
                        {productMap[id]?.sku || productMap[id]?.name || 'SP'}
                        <button type="button" onClick={() => toggleProductFilter(id)} className="hover:text-red-600 font-bold">✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* 2. Trạng thái (multi) */}
            <MultiSelectFilter label="Trạng thái" selected={filterStatus} onChange={setFilterStatus}
              options={['Nháp', 'Chưa Quay', 'Đã Quay', 'Đang Edit', 'Hoàn Thành']} />

            {/* 3. Nhân viên (multi) */}
            <MultiSelectFilter label="Nhân viên" selected={filterAssignee} onChange={setFilterAssignee}
              options={Array.from(new Set(visibleTasks.map(t => t.assignee).filter(Boolean))).sort()} />

            {/* 4. Danh mục (multi) */}
            <MultiSelectFilter label="Danh mục" selected={filterCategory} onChange={setFilterCategory}
              options={videoCategories.map(c => ({ value: c.id, label: c.name }))} />

            {/* 5. Quay phim (multi) */}
            {uniqueCrew.length > 0 && (
              <MultiSelectFilter label="Quay phim" icon="🎬" selected={filterCrew} onChange={setFilterCrew} options={uniqueCrew} />
            )}

            {/* 5b. Dựng phim (multi) */}
            {uniqueEditors.length > 0 && (
              <MultiSelectFilter label="Dựng phim" icon="✂️" selected={filterEditor} onChange={setFilterEditor} options={uniqueEditors} />
            )}

            {/* 6. Diễn viên (multi) */}
            {uniqueActors.length > 0 && (
              <MultiSelectFilter label="Diễn viên" icon="🎭" selected={filterActor} onChange={setFilterActor} options={uniqueActors} />
            )}

            {/* 7. Team (multi) */}
            <MultiSelectFilter label="Team" selected={filterTeam} onChange={setFilterTeam}
              options={['Content', 'Edit Video', 'Livestream', 'Kho']} />

            {/* 8. Nhân viên tham gia — filter tổng hợp */}
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs sm:text-sm font-medium mb-1 md:mb-2 block">👤 NV tham gia</label>
              <select
                value={filterParticipant}
                onChange={(e) => setFilterParticipant(e.target.value)}
                className={`w-full px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${filterParticipant !== 'all' ? 'border-indigo-400 bg-indigo-50' : ''}`}
              >
                <option value="all">Tất cả</option>
                {uniqueParticipants.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Participant Stats Panel */}
          {participantStats && (
            <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-xs sm:text-sm font-bold text-indigo-700">📊 {filterParticipant}</span>
                <span className="text-xs text-gray-500">
                  — {dateFilter === 'all' ? 'toàn bộ thời gian' : dateFilter === 'today' ? 'hôm nay' : dateFilter === 'week' ? 'tuần này' : dateFilter === 'month' ? 'tháng này' : dateFilter === 'overdue' ? 'quá hạn' : dateFilter === 'custom' && customStartDate && customEndDate ? `từ ${customStartDate} đến ${customEndDate}` : ''}
                  {' '}— tham gia <strong>{participantStats.total}</strong> task
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {participantStats.asContent > 0 && (
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium">📝 Content: {participantStats.asContent}</span>
                )}
                {participantStats.asCrew > 0 && (
                  <span className="px-2 py-1 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-lg text-xs font-medium">🎥 Quay: {participantStats.asCrew}</span>
                )}
                {participantStats.asEditor > 0 && (
                  <span className="px-2 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-medium">✂️ Dựng: {participantStats.asEditor}</span>
                )}
                {participantStats.asActor > 0 && (
                  <span className="px-2 py-1 bg-pink-50 text-pink-700 border border-pink-200 rounded-lg text-xs font-medium">🎭 Diễn: {participantStats.asActor}</span>
                )}
              </div>
            </div>
          )}

          {/* Date Filter */}
          <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t">
            <label className="text-xs sm:text-sm font-medium mb-2 block">📅 Deadline:</label>
            <div className="flex gap-1.5 md:gap-2 flex-wrap">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'today', label: 'Hôm nay' },
                { id: 'week', label: 'Tuần này' },
                { id: 'month', label: 'Tháng này' },
                { id: 'overdue', label: '⚠️ Quá hạn', color: 'red' },
                { id: 'custom', label: 'Tùy chỉnh', color: 'purple' },
              ].map(d => (
                <button
                  key={d.id}
                  onClick={() => handleDateFilterChange(d.id)}
                  className={`px-2.5 md:px-4 py-1 md:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    dateFilter === d.id
                      ? d.color === 'red' ? 'bg-red-600 text-white'
                        : d.color === 'purple' ? 'bg-purple-600 text-white'
                        : 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {showCustomDate && (
              <div className="flex gap-2 md:gap-3 items-center bg-purple-50 p-2 md:p-3 rounded-lg mt-2">
                <div>
                  <label className="text-[10px] md:text-xs text-gray-600 block mb-1">Từ:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="mt-4 text-xs">→</div>
                <div>
                  <label className="text-[10px] md:text-xs text-gray-600 block mb-1">Đến:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Link Filter */}
          {(invalidLinkCount > 0 || missingLinkCount > 0 || noStatsCount > 0) && (
            <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t">
              <label className="text-xs sm:text-sm font-medium mb-2 block">🔗 Links:</label>
              <div className="flex gap-1.5 md:gap-2 flex-wrap">
                <button
                  onClick={() => setFilterLinkIssue('all')}
                  className={`px-2.5 md:px-4 py-1 md:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    filterLinkIssue === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Tất cả
                </button>
                {invalidLinkCount > 0 && (
                  <button
                    onClick={() => setFilterLinkIssue('invalid')}
                    className={`px-2.5 md:px-4 py-1 md:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${
                      filterLinkIssue === 'invalid' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ⚠️ Link sai
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      filterLinkIssue === 'invalid' ? 'bg-red-400 text-white' : 'bg-red-100 text-red-600'
                    }`}>{invalidLinkCount}</span>
                  </button>
                )}
                {missingLinkCount > 0 && (
                  <button
                    onClick={() => setFilterLinkIssue('missing')}
                    className={`px-2.5 md:px-4 py-1 md:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${
                      filterLinkIssue === 'missing' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Thiếu link
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      filterLinkIssue === 'missing' ? 'bg-amber-400 text-white' : 'bg-amber-100 text-amber-600'
                    }`}>{missingLinkCount}</span>
                  </button>
                )}
                {noStatsCount > 0 && (
                  <button
                    onClick={() => setFilterLinkIssue('no_stats')}
                    className={`px-2.5 md:px-4 py-1 md:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${
                      filterLinkIssue === 'no_stats' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    📊 Lỗi stats
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      filterLinkIssue === 'no_stats' ? 'bg-orange-400 text-white' : 'bg-orange-100 text-orange-600'
                    }`}>{noStatsCount}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Footer: count + clear + bulk stats */}
          <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t flex items-center justify-between gap-2">
            <span className="text-xs md:text-sm text-gray-600">
              <span className="font-bold text-blue-600">{filteredTasks.length}</span> / {visibleTasks.length} video
            </span>
            <div className="flex items-center gap-2">
              {bulkUpdating ? (
                <button
                  onClick={() => { bulkCancelRef.current = true; }}
                  className="px-3 md:px-4 py-1.5 md:py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2"
                >
                  <span className="animate-pulse">⏳</span> Đang cập nhật... {bulkProgress}/{bulkTotal}
                  <span className="px-1.5 py-0.5 bg-red-500 hover:bg-red-600 rounded text-white text-[10px] font-bold">Dừng</span>
                </button>
              ) : (
                <button
                  onClick={handleBulkUpdateStats}
                  className="px-3 md:px-4 py-1.5 md:py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-medium"
                >
                  📊 Cập nhật stats
                </button>
              )}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 md:px-4 py-1.5 md:py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-xs sm:text-sm font-medium"
                >
                  ✕ Xóa bộ lọc
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-1 md:gap-4">
        {sortedTasks.map(task => {
          const platformStats = getTaskStatsByPlatform(task);
          const totalPrice = (task.product_ids || []).reduce((sum, pid) => sum + (parseFloat(productMap[pid]?.sell_price) || 0), 0);

          return (
          <div
            key={task.id}
            onClick={() => {
              setSelectedTask(task);
              setShowModal(true);
            }}
            className="bg-white p-2.5 md:p-6 rounded-xl shadow hover:shadow-lg transition-all cursor-pointer"
          >
            {/* Title + Stats */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-1 md:gap-4 mb-1 md:mb-2">
              <h3 className="text-[13px] md:text-xl font-bold flex-1 min-w-0 leading-snug">{task.title}</h3>
              {/* Mobile: inline compact stats */}
              {(platformStats || totalPrice > 0) && (
                <div className="flex items-center gap-1.5 flex-wrap md:hidden" style={{ fontSize: 11 }}>
                  {platformStats && Object.entries(platformStats)
                    .sort((a) => a[0] === 'Facebook' ? -1 : 1)
                    .map(([platform, s]) => (
                    <span key={platform} className="inline-flex items-center gap-1 text-gray-500">
                      {platform === 'Facebook' && <svg width="12" height="12" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
                      {platform === 'TikTok' && <svg width="12" height="12" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.49a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.13a8.16 8.16 0 0 0 4.77 1.52v-3.45a4.85 4.85 0 0 1-1.01-.51z"/></svg>}
                      <span className="font-extrabold text-gray-800">▶{formatCompactNumber(s.views)}</span>
                      <span>👍{formatCompactNumber(s.likes)}</span>
                      <span>💬{formatCompactNumber(s.comments)}</span>
                      {s.shares > 0 && <span>🔗{formatCompactNumber(s.shares)}</span>}
                    </span>
                  ))}
                  {totalPrice > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}>💰{formatMoney(totalPrice)}</span>}
                </div>
              )}
              {/* Desktop: styled stats box */}
              {(platformStats || totalPrice > 0) && (
                <div className="hidden md:block shrink-0 overflow-hidden" style={{ width: 200, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  {platformStats && Object.entries(platformStats)
                    .sort((a) => a[0] === 'Facebook' ? -1 : 1)
                    .map(([platform, s], idx, arr) => (
                    <div key={platform} className="flex items-center gap-1.5" style={{ padding: '6px 10px', borderBottom: (idx < arr.length - 1 || totalPrice > 0) ? '1px solid #e2e8f0' : 'none' }}>
                      {platform === 'Facebook' && (
                        <div className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, background: '#eff6ff', borderRadius: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </div>
                      )}
                      {platform === 'TikTok' && (
                        <div className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, background: '#f5f5f5', borderRadius: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.49a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.13a8.16 8.16 0 0 0 4.77 1.52v-3.45a4.85 4.85 0 0 1-1.01-.51z"/></svg>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="flex items-center gap-0.5" style={{ minWidth: 48, fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#64748b"><path d="M8 5v14l11-7z"/></svg>
                          {formatCompactNumber(s.views)}
                        </span>
                        <span className="flex items-center gap-0.5" style={{ minWidth: 32, fontSize: 12, color: '#64748b' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#2563eb"><path d="M2 20h2V8H2v12zm20-11a2 2 0 0 0-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 0 7.58 5.59C7.22 5.95 7 6.45 7 7v11a2 2 0 0 0 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                          {formatCompactNumber(s.likes)}
                        </span>
                        <span className="flex items-center gap-0.5" style={{ minWidth: 28, fontSize: 12, color: '#64748b' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#6b7280"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          {formatCompactNumber(s.comments)}
                        </span>
                        <span className="flex items-center gap-0.5" style={{ minWidth: 28, fontSize: 12, color: '#64748b' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#6b7280"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
                          {formatCompactNumber(s.shares)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {totalPrice > 0 && (
                    <div style={{ padding: '5px 10px', fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                      💰 {formatMoney(totalPrice)}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-1 md:gap-2 mb-1.5 md:mb-3 flex-wrap">
              <span className={`px-1.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-sm font-medium ${getStatusColor(task.status)}`}>
                {task.status}
              </span>
              <span className={`px-1.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-sm font-medium ${getTeamColor(task.team)}`}>
                {task.team}
              </span>
              {task.category && (
                <span className={`px-1.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-sm font-medium ${
                  task.category === 'video_dan' ? 'bg-purple-100 text-purple-700' :
                  task.category === 'video_hangngay' ? 'bg-blue-100 text-blue-700' :
                  task.category === 'video_huongdan' ? 'bg-green-100 text-green-700' :
                  task.category === 'video_quangcao' ? 'bg-orange-100 text-orange-700' :
                  task.category === 'video_review' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {task.category === 'video_dan' ? '🎬 Dàn' :
                   task.category === 'video_hangngay' ? '📅 H.ngày' :
                   task.category === 'video_huongdan' ? '📚 H.dẫn' :
                   task.category === 'video_quangcao' ? '📢 QC' :
                   task.category === 'video_review' ? '⭐ Review' : task.category}
                </span>
              )}
              <span className="px-1.5 md:px-3 py-0.5 md:py-1 bg-gray-100 rounded-full text-[10px] md:text-sm">
                👤 {task.assignee}
              </span>
              {(task.crew || []).length > 0 && (
                <span className="px-1.5 md:px-3 py-0.5 md:py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] md:text-sm">
                  🎬 {task.crew.join(', ')}
                </span>
              )}
              {(task.actors || []).length > 0 && (
                <span className="px-1.5 md:px-3 py-0.5 md:py-1 bg-pink-50 text-pink-700 rounded-full text-[10px] md:text-sm">
                  🎭 {task.actors.join(', ')}
                </span>
              )}
              <span className="px-1.5 md:px-3 py-0.5 md:py-1 bg-gray-100 rounded-full text-[10px] md:text-sm text-gray-500 md:text-gray-700">
                📅 {task.dueDate}
              </span>
              {/* Participant role badges — highlight khi filter active */}
              {filterParticipant !== 'all' && getParticipantRoles(task).map(role => (
                <span key={role} className="px-1.5 md:px-3 py-0.5 md:py-1 bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-full text-[10px] md:text-sm font-bold">
                  {role}
                </span>
              ))}
            </div>
            {/* Product chips */}
            {(task.product_ids || []).length > 0 && (
              <div className="flex gap-1 md:gap-1.5 flex-wrap">
                {task.product_ids.map(pid => (
                  <span key={pid} className="px-1.5 md:px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-[10px] md:text-xs">
                    📦 {productMap[pid]?.sku || (productMap[pid]?.name ? (productMap[pid].name.length > 15 ? productMap[pid].name.slice(0, 15) + '...' : productMap[pid].name) : 'SP')}
                  </span>
                ))}
              </div>
            )}
            {(task.postLinks || []).some(l => l.link_valid === false) && (
              <div className="mt-0.5 md:mt-1">
                <span className="px-1.5 md:px-2 py-0.5 bg-red-50 border border-red-200 text-red-600 rounded-full text-[10px] md:text-xs">⚠️ Link sai</span>
              </div>
            )}
            {!platformStats && (task.postLinks || []).some(l => l.type === 'Facebook' || l.type === 'TikTok') && (
              <div className="mt-0.5 md:mt-1">
                <span className="px-1.5 md:px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-600 rounded-full text-[10px] md:text-xs">📊 Không có stats</span>
              </div>
            )}
            {task.isOverdue && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 md:p-3 mt-1.5 md:mt-3">
                <span className="text-red-700 font-medium text-xs md:text-base">⚠️ Quá hạn!</span>
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Toast thông báo kết quả bulk update */}
      {bulkResult && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${
          bulkResult.error ? 'bg-red-600' : bulkResult.success > 0 ? 'bg-green-600' : 'bg-gray-600'
        }`}>
          {bulkResult.error
            ? bulkResult.error
            : bulkResult.total === 0
              ? 'Không có task nào có link Facebook'
              : `Đã cập nhật ${bulkResult.success}/${bulkResult.total} task`}
        </div>
      )}
    </div>
  );
};

export default TasksView;

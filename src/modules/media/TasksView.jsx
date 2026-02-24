import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { getStatusColor, getTeamColor, formatMoney } from '../../utils/formatUtils';
import { getVietnamDate } from '../../utils/dateUtils';

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
  taskFilterActor,
  setTaskFilterActor,
  taskFilterProduct,
  setTaskFilterProduct,
}) => {
  // Dùng filter state từ App (không bị reset khi đóng modal)
  const filterTeam = taskFilterTeam;
  const setFilterTeam = setTaskFilterTeam;
  const filterStatus = taskFilterStatus;
  const setFilterStatus = setTaskFilterStatus;
  const filterAssignee = taskFilterAssignee;
  const setFilterAssignee = setTaskFilterAssignee;
  const filterCategory = taskFilterCategory;
  const setFilterCategory = setTaskFilterCategory;
  const dateFilter = taskDateFilter;
  const setDateFilter = setTaskDateFilter;
  const customStartDate = taskCustomStartDate;
  const setCustomStartDate = setTaskCustomStartDate;
  const customEndDate = taskCustomEndDate;
  const setCustomEndDate = setTaskCustomEndDate;
  const filterCrew = taskFilterCrew || 'all';
  const setFilterCrew = setTaskFilterCrew || (() => {});
  const filterActor = taskFilterActor || 'all';
  const setFilterActor = setTaskFilterActor || (() => {});
  const filterProducts = taskFilterProduct || [];
  const setFilterProducts = setTaskFilterProduct || (() => {});
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [showProductFilter, setShowProductFilter] = useState(false);
  const [productFilterSearch, setProductFilterSearch] = useState('');
  const productFilterRef = React.useRef(null);

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
    if (filterTeam !== 'all' && t.team !== filterTeam) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterAssignee !== 'all' && t.assignee !== filterAssignee) return false;
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (filterCrew !== 'all' && !(t.crew || []).includes(filterCrew)) return false;
    if (filterActor !== 'all' && !(t.actors || []).includes(filterActor)) return false;
    if (filterProducts.length > 0 && !(t.product_ids || []).some(pid => filterProducts.includes(pid))) return false;

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

  const handleDateFilterChange = (value) => {
    setDateFilter(value);
    setShowCustomDate(value === 'custom');
    if (value !== 'custom') {
      setCustomStartDate('');
      setCustomEndDate('');
    }
  };

  const clearFilters = () => {
    setFilterTeam('all');
    setFilterStatus('all');
    setFilterAssignee('all');
    setFilterCategory('all');
    setFilterCrew('all');
    setFilterActor('all');
    setFilterProducts([]);
    setDateFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setShowCustomDate(false);
  };

  const uniqueCrew = [...new Set(visibleTasks.flatMap(t => t.crew || []))].sort();
  const uniqueActors = [...new Set(visibleTasks.flatMap(t => t.actors || []))].sort();
  // Unique products for filter
  const uniqueProductIds = [...new Set(visibleTasks.flatMap(t => t.product_ids || []))];

  const hasActiveFilters = filterTeam !== 'all' || filterStatus !== 'all' || filterAssignee !== 'all' || filterCategory !== 'all' || filterCrew !== 'all' || filterActor !== 'all' || filterProducts.length > 0 || dateFilter !== 'all';

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      <div className="flex justify-between items-center mb-3 md:mb-6">
        <h2 className="text-lg md:text-2xl font-bold">📋 Quản Lý Video</h2>
        <button
          onClick={() => setShowCreateTaskModal(true)}
          className="px-3 md:px-6 py-2 md:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm md:text-base"
        >
          ➕ Tạo Mới
        </button>
      </div>

      {/* Unified Responsive Filters */}
      <div className="bg-white rounded-xl shadow mb-3 md:mb-6 overflow-hidden">
        {/* Stats Bar */}
        <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-gray-50 border-b">
          <span className="text-xs md:text-sm text-gray-600">
            <span className="font-bold text-blue-600">{filteredTasks.length}</span>/{visibleTasks.length} video
          </span>
          <div className="flex gap-1 flex-wrap justify-end">
            {filterProducts.length > 0 && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] md:text-xs rounded-full">{filterProducts.length} SP</span>}
            {filterStatus !== 'all' && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] md:text-xs rounded-full">{filterStatus}</span>}
            {filterAssignee !== 'all' && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] md:text-xs rounded-full">{filterAssignee.split(' ').pop()}</span>}
            {filterTeam !== 'all' && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] md:text-xs rounded-full">{filterTeam}</span>}
            {dateFilter !== 'all' && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] md:text-xs rounded-full">{dateFilter === 'today' ? 'Hôm nay' : dateFilter === 'week' ? 'Tuần' : dateFilter === 'month' ? 'Tháng' : dateFilter === 'overdue' ? 'Quá hạn' : 'Tùy chỉnh'}</span>}
          </div>
        </div>

        <div className="p-2 md:p-4">
          {/* Filter Grid: Row 1 = Product, Status, Assignee, Category | Row 2 = Crew, Actor, Team */}
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

            {/* 2. Trạng thái */}
            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 md:mb-2 block">Trạng thái</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">Tất cả</option>
                <option value="Nháp">Nháp</option>
                <option value="Chưa Quay">Chưa Quay</option>
                <option value="Đã Quay">Đã Quay</option>
                <option value="Đang Edit">Đang Edit</option>
                <option value="Hoàn Thành">Hoàn Thành</option>
              </select>
            </div>

            {/* 3. Nhân viên */}
            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 md:mb-2 block">Nhân viên</label>
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="w-full px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">Tất cả</option>
                {Array.from(new Set(visibleTasks.map(t => t.assignee))).sort().map(assignee => (
                  <option key={assignee} value={assignee}>{assignee}</option>
                ))}
              </select>
            </div>

            {/* 4. Danh mục */}
            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 md:mb-2 block">Danh mục</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">Tất cả</option>
                {videoCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* 5. Quay & Dựng */}
            {uniqueCrew.length > 0 && (
              <div>
                <label className="text-xs sm:text-sm font-medium mb-1 md:mb-2 block">🎬 Quay & Dựng</label>
                <select
                  value={filterCrew}
                  onChange={(e) => setFilterCrew(e.target.value)}
                  className="w-full px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="all">Tất cả</option>
                  {uniqueCrew.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 6. Diễn viên */}
            {uniqueActors.length > 0 && (
              <div>
                <label className="text-xs sm:text-sm font-medium mb-1 md:mb-2 block">🎭 Diễn viên</label>
                <select
                  value={filterActor}
                  onChange={(e) => setFilterActor(e.target.value)}
                  className="w-full px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="all">Tất cả</option>
                  {uniqueActors.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 7. Team - cuối cùng */}
            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 md:mb-2 block">Team</label>
              <select
                value={filterTeam}
                onChange={(e) => setFilterTeam(e.target.value)}
                className="w-full px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">Tất cả</option>
                <option value="Content">Content</option>
                <option value="Edit Video">Edit Video</option>
                <option value="Livestream">Livestream</option>
                <option value="Kho">Kho</option>
              </select>
            </div>
          </div>

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

          {/* Footer: count + clear */}
          <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t flex items-center justify-between">
            <span className="text-xs md:text-sm text-gray-600">
              <span className="font-bold text-blue-600">{filteredTasks.length}</span> / {visibleTasks.length} video
            </span>
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

      <div className="grid gap-3 md:gap-4">
        {filteredTasks.map(task => (
          <div
            key={task.id}
            onClick={() => {
              setSelectedTask(task);
              setShowModal(true);
            }}
            className="bg-white p-4 md:p-6 rounded-xl shadow hover:shadow-lg transition-all cursor-pointer"
          >
            {/* Title row: tiêu đề bên trái, tổng tiền SP bên phải */}
            <div className="flex justify-between items-start gap-3 mb-2">
              <h3 className="text-base md:text-xl font-bold flex-1">{task.title}</h3>
              {(task.product_ids || []).length > 0 && (() => {
                const total = task.product_ids.reduce((sum, pid) => sum + (parseFloat(productMap[pid]?.sell_price) || 0), 0);
                return total > 0 ? (
                  <span className="text-base md:text-lg font-bold text-blue-600 whitespace-nowrap shrink-0">
                    💰 {formatMoney(total)}
                  </span>
                ) : null;
              })()}
            </div>
            <div className="flex gap-1.5 md:gap-2 mb-2 md:mb-3 flex-wrap">
              <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs md:text-sm font-medium ${getStatusColor(task.status)}`}>
                {task.status}
              </span>
              <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs md:text-sm font-medium ${getTeamColor(task.team)}`}>
                {task.team}
              </span>
              {task.category && (
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  task.category === 'video_dan' ? 'bg-purple-100 text-purple-700' :
                  task.category === 'video_hangngay' ? 'bg-blue-100 text-blue-700' :
                  task.category === 'video_huongdan' ? 'bg-green-100 text-green-700' :
                  task.category === 'video_quangcao' ? 'bg-orange-100 text-orange-700' :
                  task.category === 'video_review' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {task.category === 'video_dan' ? '🎬 Video dàn' :
                   task.category === 'video_hangngay' ? '📅 Hàng ngày' :
                   task.category === 'video_huongdan' ? '📚 Hướng dẫn' :
                   task.category === 'video_quangcao' ? '📢 Quảng cáo' :
                   task.category === 'video_review' ? '⭐ Review' : task.category}
                </span>
              )}
              <span className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                👤 {task.assignee}
              </span>
              {(task.crew || []).length > 0 && (
                <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                  🎬 {task.crew.join(', ')}
                </span>
              )}
              {(task.actors || []).length > 0 && (
                <span className="px-3 py-1 bg-pink-50 text-pink-700 rounded-full text-sm">
                  🎭 {task.actors.join(', ')}
                </span>
              )}
              <span className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                📅 {task.dueDate}
              </span>
            </div>
            {/* Product chips */}
            {(task.product_ids || []).length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {task.product_ids.map(pid => (
                  <span key={pid} className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-xs">
                    📦 {productMap[pid]?.sku || (productMap[pid]?.name ? (productMap[pid].name.length > 15 ? productMap[pid].name.slice(0, 15) + '...' : productMap[pid].name) : 'SP')}
                  </span>
                ))}
              </div>
            )}
            {task.isOverdue && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                <span className="text-red-700 font-medium">⚠️ Quá hạn!</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TasksView;

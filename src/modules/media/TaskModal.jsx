import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { isAdmin } from '../../utils/permissionUtils';
import { formatMoney } from '../../utils/formatUtils';
import { getNowISOVN, getVietnamDate } from '../../utils/dateUtils';
import EkipSelector from './EkipSelector';
import { detectPlatform, fetchStatsForLink, saveStatsToTask, loadPageConfigs, validateLinkForPlatform, getValidationErrorMessage } from '../../services/socialStatsService';

const TaskModal = ({
  selectedTask,
  setSelectedTask,
  setShowModal,
  currentUser,
  allUsers,
  tenant,
  changeStatus,
  addComment,
  addPostLink,
  removePostLink,
  deleteTask,
  loadTasks,
  addNotification,
}) => {
  const [newComment, setNewComment] = useState('');
  const [showReassign, setShowReassign] = useState(false);
  const [newAssignee, setNewAssignee] = useState('');
  const [showEditTask, setShowEditTask] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editPlatform, setEditPlatform] = useState([]);
  const [editDueDate, setEditDueDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCrew, setEditCrew] = useState([]);
  const [editActors, setEditActors] = useState([]);

  // Link validation + preview
  const [showLinkWarning, setShowLinkWarning] = useState(false);
  const [missingLinks, setMissingLinks] = useState([]);
  const [linkInputErrors, setLinkInputErrors] = useState({});
  const [linkInputValues, setLinkInputValues] = useState({});
  const [linkPreviews, setLinkPreviews] = useState({});
  const latestPreviewUrl = useRef({});
  const linksRef = useRef(null);

  // Product states
  const [taskProducts, setTaskProducts] = useState([]);
  const [editProducts, setEditProducts] = useState([]);
  const [editProductSearch, setEditProductSearch] = useState('');
  const [editProductResults, setEditProductResults] = useState([]);
  const [showEditProductDropdown, setShowEditProductDropdown] = useState(false);
  const [searchingEditProducts, setSearchingEditProducts] = useState(false);
  const editProductSearchRef = useRef(null);
  const editDebounceRef = useRef(null);

  // Social stats
  const [pageConfigs, setPageConfigs] = useState([]);
  const [loadingStatsIndex, setLoadingStatsIndex] = useState(null);
  const [statsError, setStatsError] = useState({}); // { [linkIndex]: 'error message' }
  const [manualStatsIndex, setManualStatsIndex] = useState(null);
  const [manualStatsValues, setManualStatsValues] = useState({ views: '', likes: '', shares: '', comments: '' });
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, errors: [] });
  const [debugResult, setDebugResult] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);

  useEffect(() => {
    if (tenant?.id) {
      loadPageConfigs(tenant.id).then(setPageConfigs);
    }
  }, [tenant?.id]);

  const handleFetchStats = async (link, linkIndex) => {
    const platform = detectPlatform(link.url);
    if (!platform) {
      setStatsError(prev => ({ ...prev, [linkIndex]: 'Link này không phải Facebook hoặc TikTok' }));
      return;
    }

    setLoadingStatsIndex(linkIndex);
    setStatsError(prev => { const n = { ...prev }; delete n[linkIndex]; return n; });
    try {
      const result = await fetchStatsForLink(link.url, pageConfigs, tenant.id);

      if (result.note && !result.stats?.views) {
        setStatsError(prev => ({ ...prev, [linkIndex]: result.note }));
        setLoadingStatsIndex(null);
        return;
      }

      const existingLinks = selectedTask.postLinks || [];
      const updatedLinks = await saveStatsToTask(selectedTask.id, linkIndex, result.stats, existingLinks);
      setSelectedTask(prev => ({ ...prev, postLinks: updatedLinks }));
    } catch (err) {
      setStatsError(prev => ({ ...prev, [linkIndex]: err.message }));
    }
    setLoadingStatsIndex(null);
  };

  const handleManualStats = async (linkIndex, stats) => {
    try {
      const existingLinks = selectedTask.postLinks || [];
      const updatedLinks = await saveStatsToTask(selectedTask.id, linkIndex, {
        ...stats,
        updated_at: new Date().toISOString(),
      }, existingLinks);
      setSelectedTask(prev => ({ ...prev, postLinks: updatedLinks }));
    } catch (err) {
      alert('❌ Lỗi lưu stats: ' + err.message);
    }
  };

  const handleDebugViews = async (link) => {
    if (!pageConfigs?.length || !tenant?.id) {
      alert('Chưa có page config');
      return;
    }
    // Extract video ID from URL
    let videoId = null;
    const url = link.url || '';
    let m = url.match(/\/reel\/(\d+)/); if (m) videoId = m[1];
    if (!videoId) { m = url.match(/\/videos\/(\d+)/); if (m) videoId = m[1]; }
    if (!videoId) { m = url.match(/[?&]v=(\d+)/); if (m) videoId = m[1]; }
    if (!videoId) { m = url.match(/\/(\d{10,})/); if (m) videoId = m[1]; }
    if (!videoId) {
      alert('Không parse được video ID từ URL: ' + url);
      return;
    }
    const fbConfig = pageConfigs.find(c => c.platform === 'facebook');
    if (!fbConfig) { alert('Không có Facebook page config'); return; }

    setDebugLoading(true);
    setDebugResult(null);
    try {
      const resp = await fetch('/api/fb-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'debug_views',
          video_id: videoId,
          page_config_id: fbConfig.id,
          tenant_id: tenant.id,
        }),
      });
      const data = await resp.json();
      setDebugResult(data);
      console.log('[DEBUG VIEWS] Full result:', JSON.stringify(data, null, 2));
    } catch (err) {
      setDebugResult({ error: err.message });
    }
    setDebugLoading(false);
  };

  const handleBulkFetchStats = async () => {
    const links = selectedTask.postLinks || [];
    const fbLinks = links.map((l, i) => ({ link: l, index: i }))
      .filter(({ link }) => detectPlatform(link.url) === 'facebook');

    if (fbLinks.length === 0) return;
    setBulkLoading(true);
    setBulkProgress({ done: 0, total: fbLinks.length, errors: [] });

    let currentLinks = [...links];
    for (const { link, index } of fbLinks) {
      try {
        const result = await fetchStatsForLink(link.url, pageConfigs, tenant.id);
        currentLinks = await saveStatsToTask(selectedTask.id, index, result.stats, currentLinks);
        setSelectedTask(prev => ({ ...prev, postLinks: currentLinks }));
      } catch (err) {
        setBulkProgress(prev => ({ ...prev, errors: [...prev.errors, { url: link.url, error: err.message }] }));
      }
      setBulkProgress(prev => ({ ...prev, done: prev.done + 1 }));
      // Delay 1s giữa mỗi request (tránh rate limit)
      if (fbLinks.indexOf(fbLinks.find(f => f.index === index)) < fbLinks.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    setBulkLoading(false);
  };

  // Reset link input states when task changes
  useEffect(() => {
    setLinkInputValues({});
    setLinkPreviews({});
    setLinkInputErrors({});
    latestPreviewUrl.current = {};
  }, [selectedTask?.id]);

  // Fetch preview cho link đã validate
  const fetchLinkPreview = useCallback(async (plat, url) => {
    latestPreviewUrl.current[plat] = url;
    setLinkPreviews(prev => ({ ...prev, [plat]: { loading: true, data: null, error: null } }));

    if (plat === 'TikTok') {
      try {
        const resp = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
        if (!resp.ok) throw new Error('Failed');
        if (latestPreviewUrl.current[plat] !== url) return;
        const data = await resp.json();
        setLinkPreviews(prev => ({ ...prev, [plat]: {
          loading: false,
          data: { title: data.title, thumbnail: data.thumbnail_url, author: data.author_name },
          error: null
        }}));
      } catch {
        if (latestPreviewUrl.current[plat] !== url) return;
        setLinkPreviews(prev => ({ ...prev, [plat]: {
          loading: false, data: null,
          error: 'Không thể tải preview. Link có thể sai hoặc video đã bị xóa.'
        }}));
      }
    } else if (plat === 'Facebook') {
      // Facebook: dùng iframe embed — set data ngay, iframe tự load
      setLinkPreviews(prev => ({ ...prev, [plat]: {
        loading: false,
        data: { embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&width=300&show_text=false` },
        error: null
      }}));
    } else {
      // Platform khác: không cần preview
      setLinkPreviews(prev => ({ ...prev, [plat]: { loading: false, data: { noPreview: true }, error: null } }));
    }
  }, []);

  // Handle link input change — validate + trigger preview
  const handleLinkInput = useCallback((plat, val) => {
    setLinkInputValues(prev => ({ ...prev, [plat]: val }));
    setLinkPreviews(prev => { const n = { ...prev }; delete n[plat]; return n; });
    latestPreviewUrl.current[plat] = '';

    const trimmed = val.trim();
    if (!trimmed) {
      setLinkInputErrors(prev => { const n = { ...prev }; delete n[plat]; return n; });
      return;
    }

    const error = getValidationErrorMessage(trimmed, plat);
    if (error) {
      setLinkInputErrors(prev => ({ ...prev, [plat]: error }));
    } else {
      setLinkInputErrors(prev => { const n = { ...prev }; delete n[plat]; return n; });
      fetchLinkPreview(plat, trimmed);
    }
  }, [fetchLinkPreview]);

  // Xác nhận + lưu link
  const handleConfirmLink = useCallback((plat) => {
    const url = (linkInputValues[plat] || '').trim();
    if (!url) return;
    addPostLink(selectedTask.id, url, plat, true);
    setLinkInputValues(prev => { const n = { ...prev }; delete n[plat]; return n; });
    setLinkPreviews(prev => { const n = { ...prev }; delete n[plat]; return n; });
    setLinkInputErrors(prev => { const n = { ...prev }; delete n[plat]; return n; });
    latestPreviewUrl.current[plat] = '';
  }, [linkInputValues, addPostLink, selectedTask?.id]);

  const videoCategories = [
    { id: 'video_dan', name: '🎬 Video dàn', color: 'purple' },
    { id: 'video_hangngay', name: '📅 Video hàng ngày', color: 'blue' },
    { id: 'video_huongdan', name: '📚 Video hướng dẫn', color: 'green' },
    { id: 'video_quangcao', name: '📢 Video quảng cáo', color: 'orange' },
    { id: 'video_review', name: '⭐ Video review', color: 'yellow' }
  ];

  // Load product details from product_ids
  useEffect(() => {
    const loadProducts = async () => {
      const ids = selectedTask?.product_ids || [];
      if (ids.length === 0) { setTaskProducts([]); return; }
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, sku, sell_price, image_url, stock_quantity')
          .in('id', ids);
        if (error) throw error;
        setTaskProducts(data || []);
      } catch (err) {
        console.error('Error loading task products:', err);
        setTaskProducts([]);
      }
    };
    loadProducts();
  }, [selectedTask?.product_ids]);

  // Close edit product dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (editProductSearchRef.current && !editProductSearchRef.current.contains(e.target)) {
        setShowEditProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search products for edit form
  const searchEditProducts = useCallback(async (query) => {
    if (!query || query.length < 2 || !tenant?.id) {
      setEditProductResults([]);
      setShowEditProductDropdown(false);
      return;
    }
    setSearchingEditProducts(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, sell_price, image_url')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
        .limit(10);
      if (error) throw error;
      const selectedIds = editProducts.map(p => p.id);
      setEditProductResults((data || []).filter(p => !selectedIds.includes(p.id)));
      setShowEditProductDropdown(true);
    } catch (err) {
      console.error('Error searching products:', err);
      setEditProductResults([]);
    } finally {
      setSearchingEditProducts(false);
    }
  }, [tenant, editProducts]);

  const handleEditProductSearchChange = (e) => {
    const val = e.target.value;
    setEditProductSearch(val);
    if (editDebounceRef.current) clearTimeout(editDebounceRef.current);
    editDebounceRef.current = setTimeout(() => searchEditProducts(val), 300);
  };

  const selectEditProduct = (product) => {
    setEditProducts(prev => [...prev, product]);
    setEditProductSearch('');
    setEditProductResults([]);
    setShowEditProductDropdown(false);
  };

  const removeEditProduct = (productId) => {
    setEditProducts(prev => prev.filter(p => p.id !== productId));
  };

  if (!selectedTask) return null;

  const platforms = ['Facebook', 'Instagram', 'TikTok', 'Blog', 'Ads', 'Email'];

  const openEditMode = () => {
    setEditTitle(selectedTask.title || '');
    setEditPlatform(selectedTask.platform ? selectedTask.platform.split(', ') : []);
    // Normalize date-only → datetime-local format cho input
    const dd = selectedTask.dueDate || '';
    setEditDueDate(dd.includes('T') ? dd.slice(0, 16) : dd ? dd + 'T17:00' : '');
    setEditDescription(selectedTask.description || '');
    setEditCategory(selectedTask.category || '');
    setEditCrew(selectedTask.crew || []);
    setEditActors(selectedTask.actors || []);
    setEditProducts([...taskProducts]);
    setShowEditTask(true);
  };

  const toggleEditPlatform = (plat) => {
    if (editPlatform.includes(plat)) {
      setEditPlatform(editPlatform.filter(p => p !== plat));
    } else {
      setEditPlatform([...editPlatform, plat]);
    }
  };

  const toggleEditCrew = (name) => {
    if (editCrew.includes(name)) {
      setEditCrew(editCrew.filter(n => n !== name));
    } else {
      setEditCrew([...editCrew, name]);
    }
  };

  const toggleEditActor = (name) => {
    if (editActors.includes(name)) {
      setEditActors(editActors.filter(n => n !== name));
    } else {
      setEditActors([...editActors, name]);
    }
  };

  const saveEditTask = async () => {
    if (!editTitle || editPlatform.length === 0 || !editDueDate) {
      alert('⚠️ Vui lòng điền đầy đủ thông tin!');
      return;
    }
    try {
      const editProductIds = editProducts.map(p => p.id);
      const { error } = await supabase
        .from('tasks')
        .update({
          title: editTitle,
          platform: editPlatform.join(', '),
          due_date: editDueDate,
          description: editDescription,
          category: editCategory,
          cameramen: editCrew,
          editors: [],
          actors: editActors,
          product_ids: editProductIds
        })
        .eq('id', selectedTask.id);

      if (error) throw error;
      alert('✅ Cập nhật task thành công!');
      setShowEditTask(false);
      setTaskProducts([...editProducts]);
      await loadTasks();
      setSelectedTask({
        ...selectedTask,
        title: editTitle,
        platform: editPlatform.join(', '),
        dueDate: editDueDate,
        description: editDescription,
        category: editCategory,
        crew: editCrew,
        cameramen: editCrew,
        editors: [],
        actors: editActors,
        product_ids: editProductIds
      });
    } catch (error) {
      console.error('Error updating task:', error);
      alert('❌ Lỗi khi cập nhật video!');
    }
  };

  const reassignTask = async () => {
    if (!newAssignee) {
      alert('⚠️ Vui lòng chọn người được gán!');
      return;
    }

    try {
      const assignedUser = allUsers.find(u => u.name === newAssignee);
      const { error } = await supabase
        .from('tasks')
        .update({
          assignee: newAssignee,
          team: assignedUser.team
        })
        .eq('id', selectedTask.id);

      if (error) throw error;

      // Notify new assignee
      if (newAssignee !== currentUser.name) {
        addNotification({
          type: 'assigned',
          taskId: selectedTask.id,
          title: '📋 Video được chuyển giao',
          message: `${currentUser.name} đã chuyển video "${selectedTask.title}" cho bạn`,
          read: false,
          createdAt: getNowISOVN()
        });
      }

      setShowReassign(false);
      alert('✅ Đã chuyển giao video!');
      await loadTasks();
      setShowModal(false);
    } catch (error) {
      console.error('Error reassigning task:', error);
      alert('❌ Lỗi khi chuyển giao video!');
    }
  };

  const canReassign = isAdmin(currentUser) || currentUser.role === 'Manager' ||
    (currentUser.role === 'Team Lead' && (currentUser.teams || [currentUser.team]).filter(Boolean).includes(selectedTask.team));

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Chưa';
    try {
      // Date-only (no T) → chỉ hiện ngày, không hiện 07:00 sai
      if (!dateStr.includes('T')) {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
      }
      return new Date(dateStr).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  };

  // So sánh overdue đúng cho cả date-only và datetime
  const isDeadlinePassed = (dueDate) => {
    if (!dueDate) return false;
    const vn = getVietnamDate();
    if (dueDate.includes('T')) {
      return new Date(dueDate) < vn;
    }
    // Date-only → quá hạn khi ngày deadline < hôm nay (không tính cùng ngày)
    const [y, m, d] = dueDate.split('-').map(Number);
    const deadline = new Date(y, m - 1, d);
    const today = new Date(vn.getFullYear(), vn.getMonth(), vn.getDate());
    return deadline < today;
  };

  const taskCrew = selectedTask.crew || [];
  const taskActors = selectedTask.actors || [];
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white rounded-none md:rounded-xl max-w-4xl w-full h-full md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-3 md:p-6 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white sticky top-0 z-10">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <h2
                className={`text-base md:text-2xl font-bold mb-1 md:mb-2 cursor-pointer md:cursor-default ${
                  !titleExpanded ? 'line-clamp-2 md:line-clamp-none' : ''
                }`}
                onClick={() => setTitleExpanded(!titleExpanded)}
              >
                {selectedTask.title}
              </h2>
              {!titleExpanded && selectedTask.title.length > 60 && (
                <button
                  onClick={() => setTitleExpanded(true)}
                  className="text-white/70 text-xs mb-1 md:hidden"
                >
                  ... xem thêm
                </button>
              )}
              <div className={`flex gap-1.5 md:gap-2 flex-wrap items-center ${!headerExpanded ? 'max-h-[52px] md:max-h-none overflow-hidden' : ''}`}>
                <span className="px-2 md:px-3 py-0.5 md:py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs md:text-sm flex items-center gap-1 md:gap-2">
                  👤 {selectedTask.assignee}
                  {canReassign && (
                    <button
                      onClick={() => {
                        setNewAssignee(selectedTask.assignee);
                        setShowReassign(true);
                      }}
                      className="ml-1 px-1.5 md:px-2 py-0.5 bg-white/30 hover:bg-white/40 rounded text-xs"
                    >
                      🔄
                    </button>
                  )}
                </span>
                <span className="px-2 md:px-3 py-0.5 md:py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs md:text-sm">
                  🏢 {selectedTask.team}
                </span>
                <span className={`px-2 md:px-3 py-0.5 md:py-1 backdrop-blur-sm rounded-full text-xs md:text-sm ${
                  isDeadlinePassed(selectedTask.dueDate) && selectedTask.status !== 'Hoàn Thành'
                    ? 'bg-red-500/40 font-bold' : 'bg-white/20'
                }`}>
                  {isDeadlinePassed(selectedTask.dueDate) && selectedTask.status !== 'Hoàn Thành' ? '⚠️' : '📅'} {formatDateTime(selectedTask.dueDate)}
                  {isDeadlinePassed(selectedTask.dueDate) && selectedTask.status !== 'Hoàn Thành' && ' (Quá hạn)'}
                </span>
                <span className="px-2 md:px-3 py-0.5 md:py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs md:text-sm">
                  📱 {selectedTask.platform}
                </span>
                {/* Cameramen & Editors — inline with tags */}
                {taskCrew.length > 0 && (
                  <span className="px-2 md:px-3 py-0.5 md:py-1 bg-blue-400/30 backdrop-blur-sm rounded-full text-xs md:text-sm">
                    🎬 {taskCrew.join(', ')}
                  </span>
                )}
                {taskActors.length > 0 && (
                  <span className="px-2 md:px-3 py-0.5 md:py-1 bg-pink-400/30 backdrop-blur-sm rounded-full text-xs md:text-sm">
                    🎭 {taskActors.join(', ')}
                  </span>
                )}
                {/* Products in header — inline */}
                {taskProducts.map(product => (
                  <span key={product.id} className="inline-flex items-center gap-1 px-2 md:px-3 py-0.5 md:py-1 bg-green-400/30 backdrop-blur-sm rounded-full text-xs md:text-sm">
                    📦 {product.sku || (product.name.length > 15 ? product.name.slice(0, 15) + '...' : product.name)}
                  </span>
                ))}
              </div>
              {/* Xem thêm tags trên mobile */}
              {!headerExpanded && (taskCrew.length > 0 || taskActors.length > 0 || taskProducts.length > 0) && (
                <button
                  onClick={() => setHeaderExpanded(true)}
                  className="text-white/70 text-xs mt-1 md:hidden"
                >
                  + xem thêm tags
                </button>
              )}
              {headerExpanded && (
                <button
                  onClick={() => setHeaderExpanded(false)}
                  className="text-white/70 text-xs mt-1 md:hidden"
                >
                  thu gọn
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              <button
                onClick={openEditMode}
                className="px-2 md:px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs md:text-sm font-medium min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
              >
                ✏️ <span className="hidden md:inline ml-1">Sửa</span>
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="text-white/80 hover:text-white text-xl md:text-2xl min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6">
          {/* Mô tả */}
          {selectedTask.description && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 md:p-4">
              <h4 className="font-bold text-sm mb-2 text-gray-700">📝 Mô tả</h4>
              <p className="text-gray-600 text-sm whitespace-pre-wrap">{selectedTask.description}</p>
            </div>
          )}

          {/* Production Timeline - Clickable */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 md:p-4 rounded-xl border border-blue-200">
            <h4 className="font-bold text-sm mb-3 text-blue-900">📐 Tiến Trình Sản Xuất <span className="font-normal text-gray-500 text-xs md:text-sm">(bấm để cập nhật)</span></h4>
            <div className="grid grid-cols-2 md:flex md:items-center gap-2 md:flex-wrap text-xs">
              {/* Tạo - always show, not clickable */}
              <div className="flex items-center gap-1 px-2 md:px-3 py-1.5 rounded-lg border bg-green-50 border-green-300">
                <span>📝</span>
                <div>
                  <div className="font-medium">Tạo</div>
                  <div className="text-green-600 font-medium">{formatDateTime(selectedTask.created_at)}</div>
                </div>
              </div>
              {[
                { key: 'filmed_at', icon: '🎥', label: 'Quay xong', fills: ['filmed_at'], status: 'Đã Quay' },
                { key: 'edited_at', icon: '✂️', label: 'Edit xong', fills: ['filmed_at', 'edited_at'], status: 'Đang Edit' },
                { key: 'completed_at', icon: '✅', label: 'Hoàn thành', fills: ['filmed_at', 'edited_at', 'completed_at'], status: 'Hoàn Thành' }
              ].map(step => {
                const done = !!selectedTask[step.key];
                return (
                  <React.Fragment key={step.key}>
                    <span className="text-gray-400 hidden md:inline">→</span>
                    <button
                      disabled={done}
                      onClick={async () => {
                        // Kiểm tra link khi bấm Hoàn thành
                        if (step.status === 'Hoàn Thành') {
                          const taskPlatforms = (selectedTask.platform || '').split(', ').filter(Boolean);
                          const existingLinks = selectedTask.postLinks || [];
                          if (taskPlatforms.length > 0) {
                            const missing = taskPlatforms.filter(plat => !existingLinks.find(l => l.type === plat));
                            const invalid = taskPlatforms.filter(plat => {
                              const link = existingLinks.find(l => l.type === plat);
                              return link && !validateLinkForPlatform(link.url, plat);
                            });
                            if (missing.length > 0 || invalid.length > 0) {
                              setMissingLinks(taskPlatforms.map(plat => {
                                const link = existingLinks.find(l => l.type === plat);
                                const isValid = link ? validateLinkForPlatform(link.url, plat) : false;
                                return { platform: plat, hasLink: !!link, isValid };
                              }));
                              setShowLinkWarning(true);
                              return;
                            }
                          }
                        }

                        const now = new Date().toISOString();
                        const updateData = { status: step.status };
                        const localUpdate = { status: step.status };
                        step.fills.forEach(field => {
                          if (!selectedTask[field]) {
                            updateData[field] = now;
                            localUpdate[field] = now;
                          }
                        });
                        try {
                          const { error } = await supabase.from('tasks').update(updateData).eq('id', selectedTask.id);
                          if (error) throw error;
                          setSelectedTask(prev => ({ ...prev, ...localUpdate }));
                          loadTasks();
                        } catch (err) {
                          console.error('Error updating timeline:', err);
                          alert('❌ Lỗi khi cập nhật!');
                        }
                      }}
                      className={`flex items-center gap-1 px-2 md:px-3 py-2 md:py-1.5 rounded-lg border transition-all min-h-[44px] ${
                        done
                          ? 'bg-green-50 border-green-300'
                          : 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50 hover:scale-105 cursor-pointer'
                      }`}
                    >
                      <span>{step.icon}</span>
                      <div className="text-left">
                        <div className="font-medium">{step.label}</div>
                        <div className={done ? 'text-green-600 font-medium' : 'text-gray-400'}>
                          {done ? formatDateTime(selectedTask[step.key]) : 'Bấm để ghi nhận'}
                        </div>
                      </div>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Links per Platform — đưa lên trước SP */}
          <div ref={linksRef}>
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <h4 className="text-base md:text-lg font-bold">🔗 Links Theo Platform</h4>
              {(() => {
                const links = selectedTask.postLinks || [];
                const fbCount = links.filter(l => detectPlatform(l.url) === 'facebook').length;
                if (fbCount < 2) return null;
                return (
                  <button
                    onClick={handleBulkFetchStats}
                    disabled={bulkLoading}
                    className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 font-medium"
                  >
                    {bulkLoading ? `⏳ ${bulkProgress.done}/${bulkProgress.total}...` : '📊 Lấy stats tất cả'}
                  </button>
                );
              })()}
            </div>
            {bulkProgress.errors.length > 0 && !bulkLoading && (
              <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <b>Lỗi {bulkProgress.errors.length} link:</b>
                {bulkProgress.errors.map((e, i) => (
                  <div key={i} className="mt-0.5 truncate">• {e.url.substring(0, 50)}... — {e.error}</div>
                ))}
              </div>
            )}
            {(() => {
              const platformIcons = { 'Facebook': '📘', 'Instagram': '📸', 'TikTok': '🎵', 'Blog': '📝', 'Ads': '📢', 'Email': '📧', 'YouTube': '📺' };
              const platformColors = { 'Facebook': 'border-blue-300 bg-blue-50', 'Instagram': 'border-pink-300 bg-pink-50', 'TikTok': 'border-gray-800 bg-gray-50', 'Blog': 'border-green-300 bg-green-50', 'Ads': 'border-orange-300 bg-orange-50', 'Email': 'border-purple-300 bg-purple-50', 'YouTube': 'border-red-300 bg-red-50' };
              const taskPlatforms = (selectedTask.platform || '').split(', ').filter(Boolean);
              const existingLinks = selectedTask.postLinks || [];
              const oldLinkPlatforms = existingLinks.map(l => l.type).filter(t => !taskPlatforms.includes(t));
              const allPlatforms = [...taskPlatforms, ...oldLinkPlatforms];
              return (
                <div className="space-y-3">
                  {allPlatforms.map(plat => {
                    const link = existingLinks.find(l => l.type === plat);
                    const icon = platformIcons[plat] || '🔗';
                    const colorClass = platformColors[plat] || 'border-gray-300 bg-gray-50';
                    return (
                      <div key={plat} className={`border-2 rounded-lg p-3 ${colorClass}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{icon}</span>
                          <span className="font-bold text-sm">{plat}</span>
                          {link && <span className="text-xs text-gray-500">• {link.addedBy} • {link.addedAt}</span>}
                        </div>
                        {link ? (
                          <div>
                            <div className="flex items-center gap-1 md:gap-2">
                              <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs md:text-sm break-all flex-1 line-clamp-2 md:line-clamp-none">{link.url}</a>
                              {link.link_valid === false && (
                                <span className="text-amber-500 shrink-0" title="Link không đúng định dạng">⚠️</span>
                              )}
                              <button onClick={() => { navigator.clipboard.writeText(link.url); alert('✅ Đã copy!'); }} className="px-2 py-1 bg-white rounded text-xs hover:bg-gray-100 shrink-0">📋</button>
                              {(currentUser.name === link.addedBy || currentUser.role === 'Manager' || isAdmin(currentUser)) && (
                                <button onClick={() => { if (window.confirm('Xóa link này?')) removePostLink(selectedTask.id, existingLinks.indexOf(link)); }} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200 shrink-0">🗑️</button>
                              )}
                            </div>
                            {/* Social Stats */}
                            {detectPlatform(link.url) && (() => {
                              const li = existingLinks.indexOf(link);
                              const s = link.stats;
                              const isLoading = loadingStatsIndex === li;
                              const isFb = detectPlatform(link.url) === 'facebook';
                              const isTikTok = detectPlatform(link.url) === 'tiktok';
                              const errMsg = statsError[li];
                              return (
                                <div className="mt-2 p-2 bg-white/70 rounded-lg border border-gray-200">
                                  {s && (s.views !== null || s.likes !== null) ? (
                                    <div>
                                      <div className="flex flex-wrap gap-3 text-xs">
                                        {s.views !== null && <span title="Views">👁 <b>{Number(s.views).toLocaleString('vi-VN')}</b></span>}
                                        {s.likes !== null && <span title="Likes">❤️ <b>{Number(s.likes).toLocaleString('vi-VN')}</b></span>}
                                        {s.shares !== null && <span title="Shares">🔁 <b>{Number(s.shares).toLocaleString('vi-VN')}</b></span>}
                                        {s.comments !== null && <span title="Comments">💬 <b>{Number(s.comments).toLocaleString('vi-VN')}</b></span>}
                                      </div>
                                      <div className="flex items-center justify-between mt-1.5">
                                        <span className="text-[10px] text-gray-400">
                                          Cập nhật: {s.updated_at ? new Date(s.updated_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                                        </span>
                                        <div className="flex gap-1">
                                          <button
                                            onClick={() => isFb ? handleFetchStats(link, li) : null}
                                            disabled={isLoading || isTikTok}
                                            className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                                          >
                                            {isLoading ? '⏳...' : '🔄 Cập nhật'}
                                          </button>
                                          <button
                                            onClick={() => {
                                              setManualStatsIndex(li);
                                              setManualStatsValues({
                                                views: String(s.views || 0),
                                                likes: String(s.likes || 0),
                                                shares: String(s.shares || 0),
                                                comments: String(s.comments || 0),
                                              });
                                            }}
                                            className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                                          >
                                            ✏️ Sửa
                                          </button>
                                          {isFb && (
                                            <button
                                              onClick={() => handleDebugViews(link)}
                                              disabled={debugLoading}
                                              className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                                            >
                                              {debugLoading ? '...' : 'Debug'}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      {/* Debug views result */}
                                      {debugResult && (
                                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-300 rounded text-[10px] max-h-60 overflow-y-auto">
                                          <div className="flex justify-between items-center mb-1">
                                            <b className="text-red-700">DEBUG VIEWS RESULT</b>
                                            <button onClick={() => setDebugResult(null)} className="text-gray-400 hover:text-gray-600">X</button>
                                          </div>
                                          {debugResult.summary && (
                                            <table className="w-full text-left mb-2">
                                              <thead><tr className="border-b"><th className="pr-2">Test</th><th className="pr-2">Status</th><th className="pr-2">Views?</th><th>Value</th></tr></thead>
                                              <tbody>
                                                {Object.entries(debugResult.summary).map(([key, val]) => (
                                                  <tr key={key} className={val.has_views ? 'bg-green-100' : val.has_error ? 'bg-red-50' : ''}>
                                                    <td className="pr-2 font-mono">{key}</td>
                                                    <td className="pr-2">{val.status}</td>
                                                    <td className="pr-2">{val.has_views ? 'YES' : 'NO'}</td>
                                                    <td className="font-mono">{val.has_views ? JSON.stringify(val.views_value) : (val.error_msg || '—')}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          )}
                                          <details>
                                            <summary className="cursor-pointer text-gray-500">Full JSON response</summary>
                                            <pre className="mt-1 text-[9px] whitespace-pre-wrap break-all">{JSON.stringify(debugResult, null, 2)}</pre>
                                          </details>
                                        </div>
                                      )}
                                      {/* Stats history */}
                                      {link.stats_history?.length > 0 && (
                                        <details className="mt-1.5">
                                          <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">
                                            📈 Lịch sử ({link.stats_history.length} lần)
                                          </summary>
                                          <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
                                            {link.stats_history.slice().reverse().map((h, i) => (
                                              <div key={i} className="flex gap-3 text-[10px] text-gray-500 border-b border-gray-100 py-0.5">
                                                <span>{new Date(h.updated_at).toLocaleDateString('vi-VN')}</span>
                                                {h.views != null && <span>👁 {Number(h.views).toLocaleString('vi-VN')}</span>}
                                                <span>❤️ {Number(h.likes || 0).toLocaleString('vi-VN')}</span>
                                                <span>💬 {Number(h.comments || 0).toLocaleString('vi-VN')}</span>
                                                <span>🔁 {Number(h.shares || 0).toLocaleString('vi-VN')}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </details>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-gray-400">📊 Chưa có stats</span>
                                      <div className="flex gap-1">
                                        {isFb && (
                                          <button
                                            onClick={() => handleFetchStats(link, li)}
                                            disabled={isLoading}
                                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                                          >
                                            {isLoading ? '⏳ Đang tải...' : '📊 Lấy stats'}
                                          </button>
                                        )}
                                        <button
                                          onClick={() => {
                                            setManualStatsIndex(li);
                                            setManualStatsValues({ views: '0', likes: '0', shares: '0', comments: '0' });
                                          }}
                                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                                        >
                                          ✏️ Nhập tay
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {/* Inline manual stats form */}
                                  {manualStatsIndex === li && (
                                    <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-300">
                                      <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div>
                                          <label className="text-[10px] text-gray-500">👁 Views</label>
                                          <input type="number" value={manualStatsValues.views} onChange={e => setManualStatsValues(v => ({ ...v, views: e.target.value }))} className="w-full px-2 py-1 border rounded text-xs" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-gray-500">❤️ Likes</label>
                                          <input type="number" value={manualStatsValues.likes} onChange={e => setManualStatsValues(v => ({ ...v, likes: e.target.value }))} className="w-full px-2 py-1 border rounded text-xs" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-gray-500">🔁 Shares</label>
                                          <input type="number" value={manualStatsValues.shares} onChange={e => setManualStatsValues(v => ({ ...v, shares: e.target.value }))} className="w-full px-2 py-1 border rounded text-xs" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-gray-500">💬 Comments</label>
                                          <input type="number" value={manualStatsValues.comments} onChange={e => setManualStatsValues(v => ({ ...v, comments: e.target.value }))} className="w-full px-2 py-1 border rounded text-xs" />
                                        </div>
                                      </div>
                                      <div className="flex gap-2 justify-end">
                                        <button onClick={() => setManualStatsIndex(null)} className="text-xs px-3 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">Hủy</button>
                                        <button
                                          onClick={() => {
                                            handleManualStats(li, {
                                              views: parseInt(manualStatsValues.views) || 0,
                                              likes: parseInt(manualStatsValues.likes) || 0,
                                              shares: parseInt(manualStatsValues.shares) || 0,
                                              comments: parseInt(manualStatsValues.comments) || 0,
                                            });
                                            setManualStatsIndex(null);
                                          }}
                                          className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                                        >Lưu</button>
                                      </div>
                                    </div>
                                  )}
                                  {errMsg && (
                                    <div className="mt-1.5 p-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                      {errMsg}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (plat === 'Facebook' || plat === 'TikTok') ? (
                          <div>
                            <input
                              type="url"
                              value={linkInputValues[plat] || ''}
                              placeholder={`Paste link ${plat} đầy đủ vào đây...`}
                              className={`w-full px-3 py-2 border-2 rounded-lg text-sm focus:outline-none focus:ring-2 bg-white ${
                                linkInputErrors[plat] ? 'border-red-400 focus:ring-red-300' :
                                linkPreviews[plat]?.data ? 'border-green-400 focus:ring-green-300' :
                                'border-gray-200 focus:ring-blue-400'
                              }`}
                              onChange={(e) => handleLinkInput(plat, e.target.value)}
                            />
                            {/* Error message */}
                            {linkInputErrors[plat] && (
                              <div className="mt-1.5 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                                {linkInputErrors[plat]}
                              </div>
                            )}
                            {/* Loading preview */}
                            {linkPreviews[plat]?.loading && (
                              <div className="mt-2 p-3 bg-gray-50 rounded-lg border text-center text-sm text-gray-500">
                                ⏳ Đang tải preview...
                              </div>
                            )}
                            {/* Preview error */}
                            {linkPreviews[plat]?.error && !linkPreviews[plat]?.loading && (
                              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-sm text-amber-700">⚠️ {linkPreviews[plat].error}</p>
                                <button
                                  onClick={() => handleConfirmLink(plat)}
                                  className="mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium"
                                >
                                  Vẫn lưu link này
                                </button>
                              </div>
                            )}
                            {/* Preview success */}
                            {linkPreviews[plat]?.data && !linkPreviews[plat]?.loading && (
                              <div className="mt-2 border rounded-lg overflow-hidden bg-gray-50">
                                {plat === 'Facebook' && linkPreviews[plat].data.embedUrl && (
                                  <iframe
                                    src={linkPreviews[plat].data.embedUrl}
                                    width="100%"
                                    height="200"
                                    style={{ border: 'none', overflow: 'hidden' }}
                                    scrolling="no"
                                    frameBorder="0"
                                    allowFullScreen
                                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                                  />
                                )}
                                {plat === 'TikTok' && (
                                  <div className="flex gap-3 p-3">
                                    {linkPreviews[plat].data.thumbnail && (
                                      <img src={linkPreviews[plat].data.thumbnail} alt="" className="w-20 h-28 object-cover rounded" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium line-clamp-2">{linkPreviews[plat].data.title || 'Video TikTok'}</p>
                                      {linkPreviews[plat].data.author && (
                                        <p className="text-xs text-gray-500 mt-1">@{linkPreviews[plat].data.author}</p>
                                      )}
                                    </div>
                                  </div>
                                )}
                                <div className="p-2 border-t bg-white">
                                  <button
                                    onClick={() => handleConfirmLink(plat)}
                                    className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                                  >
                                    ✓ Xác nhận đúng video — Lưu link
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="url"
                              placeholder={`Paste link ${plat} vào đây...`}
                              className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.target.value.trim()) {
                                  addPostLink(selectedTask.id, e.target.value.trim(), plat);
                                  e.target.value = '';
                                }
                              }}
                            />
                            <button
                              onClick={(e) => {
                                const input = e.target.closest('div').querySelector('input');
                                if (input && input.value.trim()) {
                                  addPostLink(selectedTask.id, input.value.trim(), plat);
                                  input.value = '';
                                }
                              }}
                              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium shrink-0"
                            >
                              ✅ Lưu
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {allPlatforms.length === 0 && (
                    <div className="text-center py-6 bg-gray-50 rounded-lg text-gray-400 text-sm">Chưa chọn platform nào</div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Product details section — compact table */}
          {taskProducts.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 md:px-4 py-2 md:py-2.5 bg-gray-50 border-b">
                <h4 className="font-bold text-xs md:text-sm text-gray-800">📦 Sản phẩm ({taskProducts.length})</h4>
                <span className="font-bold text-xs md:text-sm text-blue-600">
                  💰 {formatMoney(taskProducts.reduce((sum, p) => sum + (parseFloat(p.sell_price) || 0), 0))}
                </span>
              </div>
              <div className="max-h-[200px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs sticky top-0">
                    <tr>
                      <th className="text-left px-2 md:px-4 py-1.5 font-medium">SKU</th>
                      <th className="text-left px-2 md:px-4 py-1.5 font-medium">Tên</th>
                      <th className="text-right px-2 md:px-4 py-1.5 font-medium">Giá</th>
                      <th className="text-right px-2 md:px-4 py-1.5 font-medium hidden md:table-cell">Tồn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {taskProducts.map(product => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-2 md:px-4 py-1.5 md:py-2 text-gray-600 whitespace-nowrap">{product.sku || '—'}</td>
                        <td className="px-2 md:px-4 py-1.5 md:py-2 font-medium truncate max-w-[120px] md:max-w-[200px]">{product.name}</td>
                        <td className="px-2 md:px-4 py-1.5 md:py-2 text-right text-gray-700 whitespace-nowrap">
                          {product.sell_price > 0 ? (Math.round(product.sell_price / 1000).toLocaleString('vi-VN') + 'k') : '—'}
                        </td>
                        <td className="px-2 md:px-4 py-1.5 md:py-2 text-right text-gray-600 hidden md:table-cell">{product.stock_quantity ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Edit Task Form */}
          {showEditTask && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="font-bold text-lg mb-3 text-blue-900">✏️ Chỉnh Sửa Video</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Tiêu đề *</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Platform *</label>
                  <div className="flex flex-wrap gap-2">
                    {platforms.map(plat => (
                      <button
                        key={plat}
                        onClick={() => toggleEditPlatform(plat)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${editPlatform.includes(plat) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                      >
                        {plat}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Danh mục Video */}
                <div>
                  <label className="block text-sm font-medium mb-2">🏷️ Danh mục Video</label>
                  <div className="flex flex-wrap gap-2">
                    {videoCategories.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setEditCategory(editCategory === cat.id ? '' : cat.id)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          editCategory === cat.id
                            ? `bg-${cat.color}-500 text-white`
                            : `bg-${cat.color}-100 text-${cat.color}-700 hover:bg-${cat.color}-200`
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                  {editCategory && (
                    <button
                      type="button"
                      onClick={() => setEditCategory('')}
                      className="mt-2 text-xs text-red-500 hover:text-red-700"
                    >
                      ✕ Xóa danh mục
                    </button>
                  )}
                </div>
                {/* Edit products */}
                <div ref={editProductSearchRef} className="relative">
                  <label className="block text-sm font-medium mb-1">📦 Sản phẩm trong video</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editProductSearch}
                      onChange={handleEditProductSearchChange}
                      placeholder="Tìm sản phẩm theo tên, SKU..."
                      className="w-full px-3 py-2 pl-9 border rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      {searchingEditProducts ? '...' : '🔍'}
                    </span>
                  </div>
                  {showEditProductDropdown && editProductResults.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {editProductResults.map(product => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => selectEditProduct(product)}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-green-50 border-b last:border-b-0 text-left"
                        >
                          <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center overflow-hidden shrink-0">
                            {product.image_url ? (
                              <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-gray-400 text-sm">📦</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{product.name}</div>
                            <div className="text-xs text-gray-500">
                              {product.sku && <span>SKU: {product.sku}</span>}
                              {product.sku && product.sell_price ? ' · ' : ''}
                              {product.sell_price ? <span>{formatMoney(product.sell_price)}</span> : ''}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {editProducts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {editProducts.map(product => (
                        <span
                          key={product.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 border border-green-200 text-green-800 rounded-full text-xs"
                        >
                          📦 {product.name}
                          <button
                            type="button"
                            onClick={() => removeEditProduct(product.id)}
                            className="text-green-600 hover:text-red-600 font-bold"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Ekip selector */}
                <EkipSelector
                  tenant={tenant}
                  allUsers={allUsers}
                  onApplyEkip={({ crew: c, actors: a }) => { setEditCrew(c); setEditActors(a); }}
                />
                {/* Crew edit (Quay & Dựng) */}
                <div>
                  <label className="block text-sm font-medium mb-1">🎬 Quay & Dựng</label>
                  <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                    {allUsers.map(user => (
                      <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded text-sm">
                        <input type="checkbox" checked={editCrew.includes(user.name)} onChange={() => toggleEditCrew(user.name)} className="w-3 h-3" />
                        {user.name} <span className="text-gray-400 text-xs">- {user.team}</span>
                      </label>
                    ))}
                  </div>
                  {editCrew.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {editCrew.map(n => (
                        <span key={n} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">🎬 {n}</span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Actors edit */}
                <div>
                  <label className="block text-sm font-medium mb-1">🎭 Diễn viên</label>
                  <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                    {allUsers.map(user => (
                      <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded text-sm">
                        <input type="checkbox" checked={editActors.includes(user.name)} onChange={() => toggleEditActor(user.name)} className="w-3 h-3" />
                        {user.name} <span className="text-gray-400 text-xs">- {user.team}</span>
                      </label>
                    ))}
                  </div>
                  {editActors.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {editActors.map(n => (
                        <span key={n} className="px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs">🎭 {n}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Deadline *</label>
                  <input
                    type="datetime-local"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Mô tả</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {showReassign && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h4 className="font-bold text-lg mb-3 text-yellow-900">🔄 Chuyển Giao Video</h4>
              <div className="space-y-3">
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  {allUsers
                    .filter(u => {
                      if (isAdmin(currentUser) || currentUser.role === 'Manager') return true;
                      if (currentUser.role === 'Team Lead') {
                        const userTeams = currentUser.teams || [currentUser.team].filter(Boolean);
                        const targetTeams = u.teams || [u.team].filter(Boolean);
                        return targetTeams.some(t => userTeams.includes(t));
                      }
                      return false;
                    })
                    .map(user => (
                      <option key={user.id} value={user.name}>
                        {user.name} - {(user.teams || [user.team]).filter(Boolean).join(', ')} ({user.role})
                      </option>
                    ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowReassign(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={reassignTask}
                    className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium"
                  >
                    ✅ Chuyển Giao
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="border-t pt-4 md:pt-6">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h5 className="text-base md:text-lg font-bold">💬 Nhận Xét & Feedback</h5>
              <span className="text-sm text-gray-500">
                {selectedTask.comments?.length || 0} nhận xét
              </span>
            </div>

            {selectedTask.comments && selectedTask.comments.length > 0 ? (
              <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                {selectedTask.comments.map((comment, index) => (
                  <div key={index} className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">
                        {comment.user === currentUser.name ? '👤' : '👨‍💼'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-sm">
                            {comment.user}
                            {comment.user === currentUser.name && ' (Bạn)'}
                          </span>
                          <span className="text-xs text-gray-500">• {comment.time}</span>
                        </div>
                        <div className="text-sm text-gray-700 bg-white p-3 rounded-lg">
                          {comment.text}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg mb-4">
                <div className="text-gray-400 text-sm">Chưa có nhận xét nào</div>
              </div>
            )}

            <div className="bg-white border-2 border-gray-200 rounded-lg p-3 md:p-4">
              <div className="font-medium text-sm mb-2">✍️ Thêm nhận xét:</div>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={`${currentUser.role === 'Manager' ? 'Nhận xét của bạn về task này...' : 'Cập nhật tiến độ, ghi chú...'}`}
                rows="2"
                className="w-full px-3 md:px-4 py-2 md:py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
              />
              <div className="flex justify-between items-center mt-2 md:mt-3">
                <div className="text-xs text-gray-500 hidden md:block">
                  💡 {currentUser.role === 'Manager' ? 'Admin/Manager có thể để lại feedback chi tiết' : 'Cập nhật tiến độ công việc của bạn'}
                </div>
                <button
                  onClick={() => {
                    if (newComment.trim()) {
                      addComment(selectedTask.id, newComment);
                      setNewComment('');
                    }
                  }}
                  className="px-4 md:px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm min-h-[44px] ml-auto"
                >
                  💬 Gửi
                </button>
              </div>
            </div>

            {currentUser.role === 'Manager' && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="text-sm font-medium text-yellow-800 mb-2">⚡ Phê duyệt nhanh:</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      changeStatus(selectedTask.id, 'Đã Duyệt');
                      setSelectedTask({ ...selectedTask, status: 'Đã Duyệt' });
                      addComment(selectedTask.id, '✅ Đã duyệt! Công việc làm tốt.');
                    }}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                  >
                    ✅ Phê Duyệt
                  </button>
                  <button
                    onClick={() => {
                      changeStatus(selectedTask.id, 'Cần Sửa');
                      setSelectedTask({ ...selectedTask, status: 'Cần Sửa' });
                      if (newComment.trim()) {
                        addComment(selectedTask.id, newComment);
                        setNewComment('');
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"
                  >
                    🔄 Yêu Cầu Sửa
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-3 md:p-6 border-t bg-gray-50 sticky bottom-0">
          <div className="flex gap-2 md:gap-3">
            <button
              onClick={() => {
                setShowEditTask(false);
                setShowModal(false);
              }}
              className="flex-1 px-4 md:px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm md:text-base min-h-[44px]"
            >
              Đóng
            </button>
            {currentUser && (isAdmin(currentUser) || currentUser.role === 'Manager' || selectedTask.assignee === currentUser.name) && (
              <button
                onClick={() => {
                  if (window.confirm('⚠️ Bạn có chắc chắn muốn xóa task này?\n\nHành động này không thể hoàn tác!')) {
                    deleteTask(selectedTask.id);
                  }
                }}
                className="px-4 md:px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm md:text-base min-h-[44px]"
              >
                🗑️ <span className="hidden md:inline">Xóa</span>
              </button>
            )}
            {showEditTask && (
              <button
                onClick={saveEditTask}
                className="flex-1 px-4 md:px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm md:text-base min-h-[44px]"
              >
                💾 Lưu
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Link Warning Modal */}
      {showLinkWarning && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-4">
              <h3 className="text-lg font-bold text-yellow-800">⚠️ Chưa thể hoàn thành!</h3>
              <p className="text-sm text-yellow-700 mt-1">
                {missingLinks.some(i => !i.hasLink) && missingLinks.some(i => i.hasLink && !i.isValid)
                  ? 'Có platform chưa điền link và link sai định dạng:'
                  : missingLinks.some(i => !i.hasLink)
                    ? 'Vui lòng điền đủ link cho các platform đã chọn:'
                    : 'Link không đúng định dạng. Vui lòng sửa lại:'}
              </p>
            </div>
            <div className="px-6 py-4 space-y-2">
              {missingLinks.map(item => (
                <div key={item.platform} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${
                  item.hasLink && item.isValid ? 'bg-green-50 border-green-200' :
                  item.hasLink && !item.isValid ? 'bg-amber-50 border-amber-200' :
                  'bg-red-50 border-red-200'
                }`}>
                  <span className="text-lg">{item.hasLink && item.isValid ? '✅' : item.hasLink ? '⚠️' : '❌'}</span>
                  <span className={`font-medium text-sm ${
                    item.hasLink && item.isValid ? 'text-green-700' : item.hasLink ? 'text-amber-700' : 'text-red-700'
                  }`}>
                    {item.platform}
                  </span>
                  <span className={`ml-auto text-xs ${
                    item.hasLink && item.isValid ? 'text-green-600' : item.hasLink ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {item.hasLink && item.isValid ? 'Đã có link' : item.hasLink ? 'Link sai định dạng' : 'Chưa có link'}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
              <button
                onClick={() => setShowLinkWarning(false)}
                className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  setShowLinkWarning(false);
                  setTimeout(() => {
                    linksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 100);
                }}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm"
              >
                🔗 Đi điền link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskModal;

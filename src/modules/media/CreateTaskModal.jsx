import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { getTodayVN } from '../../utils/dateUtils';
import { formatMoney } from '../../utils/formatUtils';
import { isAdmin } from '../../utils/permissionUtils';

const CreateTaskModal = ({ currentUser, allUsers, tenant, setShowCreateTaskModal, createNewTask }) => {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState(['Facebook', 'TikTok']);
  const [dueDate, setDueDate] = useState(getTodayVN());
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState(currentUser.name);
  const [videoCategory, setVideoCategory] = useState('');
  const [crew, setCrew] = useState([]);
  const [actors, setActors] = useState([]);

  // Product search states
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const productSearchRef = useRef(null);
  const debounceRef = useRef(null);

  const videoCategories = [
    { id: 'video_dan', name: '🎬 Video dàn', color: 'purple' },
    { id: 'video_hangngay', name: '📅 Video hàng ngày', color: 'blue' },
    { id: 'video_huongdan', name: '📚 Video hướng dẫn', color: 'green' },
    { id: 'video_quangcao', name: '📢 Video quảng cáo', color: 'orange' },
    { id: 'video_review', name: '⭐ Video review', color: 'yellow' }
  ];

  // Debounced product search
  const searchProducts = useCallback(async (query) => {
    if (!query || query.length < 2 || !tenant?.id) {
      setProductResults([]);
      setShowProductDropdown(false);
      return;
    }
    setSearchingProducts(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, sell_price, image_url')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
        .limit(10);
      if (error) throw error;
      // Filter out already selected
      const selectedIds = selectedProducts.map(p => p.id);
      setProductResults((data || []).filter(p => !selectedIds.includes(p.id)));
      setShowProductDropdown(true);
    } catch (err) {
      console.error('Error searching products:', err);
      setProductResults([]);
    } finally {
      setSearchingProducts(false);
    }
  }, [tenant, selectedProducts]);

  const handleProductSearchChange = (e) => {
    const val = e.target.value;
    setProductSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchProducts(val), 300);
  };

  const selectProduct = (product) => {
    setSelectedProducts(prev => [...prev, product]);
    setProductSearch('');
    setProductResults([]);
    setShowProductDropdown(false);
  };

  const removeProduct = (productId) => {
    setSelectedProducts(prev => prev.filter(p => p.id !== productId));
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const togglePlatform = (plat) => {
    if (platform.includes(plat)) {
      setPlatform(platform.filter(p => p !== plat));
    } else {
      setPlatform([...platform, plat]);
    }
  };

  const toggleCrew = (name) => {
    if (crew.includes(name)) {
      setCrew(crew.filter(n => n !== name));
    } else {
      setCrew([...crew, name]);
    }
  };

  const toggleActor = (name) => {
    if (actors.includes(name)) {
      setActors(actors.filter(n => n !== name));
    } else {
      setActors([...actors, name]);
    }
  };

  // Filter assignable users based on role
  const getAssignableUsers = () => {
    if (isAdmin(currentUser) || currentUser.role === 'Manager') {
      return allUsers;
    } else if (currentUser.role === 'Team Lead') {
      const userTeams = currentUser.teams || [currentUser.team].filter(Boolean);
      return allUsers.filter(u => {
        const targetTeams = u.teams || [u.team].filter(Boolean);
        return targetTeams.some(t => userTeams.includes(t));
      });
    } else {
      return allUsers.filter(u => u.name === currentUser.name);
    }
  };

  const assignableUsers = getAssignableUsers();

  const platforms = ['Facebook', 'Instagram', 'TikTok', 'Blog', 'Ads', 'Email'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white p-6 border-b">
          <h2 className="text-2xl font-bold">➕ Tạo Video Mới</h2>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Tiêu đề *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Viết bài blog về sản phẩm mới"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Platform * (Chọn nhiều)</label>
              <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                {platforms.map(plat => (
                  <label key={plat} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={platform.includes(plat)}
                      onChange={() => togglePlatform(plat)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>{plat}</span>
                  </label>
                ))}
              </div>
              {platform.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {platform.map(plat => (
                    <span key={plat} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-1">
                      {plat}
                      <button onClick={() => togglePlatform(plat)} className="text-blue-900 hover:text-red-600">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">🏷️ Danh mục Video</label>
            <div className="flex flex-wrap gap-2">
              {videoCategories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setVideoCategory(videoCategory === cat.id ? '' : cat.id)}
                  className={`px-3 py-2 rounded-lg border-2 font-medium transition-all ${
                    videoCategory === cat.id
                      ? (cat.color === 'purple' ? 'bg-purple-100 border-purple-500 text-purple-700'
                        : cat.color === 'blue' ? 'bg-blue-100 border-blue-500 text-blue-700'
                        : cat.color === 'green' ? 'bg-green-100 border-green-500 text-green-700'
                        : cat.color === 'orange' ? 'bg-orange-100 border-orange-500 text-orange-700'
                        : 'bg-yellow-100 border-yellow-500 text-yellow-700')
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product search - SAU Danh mục, TRƯỚC Gán cho */}
          <div ref={productSearchRef} className="relative">
            <label className="block text-sm font-medium mb-2">📦 Sản phẩm trong video (Chọn nhiều)</label>
            <div className="relative">
              <input
                type="text"
                value={productSearch}
                onChange={handleProductSearchChange}
                placeholder="Tìm sản phẩm theo tên, SKU..."
                className="w-full px-4 py-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                {searchingProducts ? '...' : '🔍'}
              </span>
            </div>

            {/* Dropdown kết quả */}
            {showProductDropdown && productResults.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {productResults.map(product => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => selectProduct(product)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 border-b last:border-b-0 text-left transition-colors"
                  >
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-400 text-lg">📦</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{product.name}</div>
                      <div className="text-xs text-gray-500">
                        {product.sku && <span>SKU: {product.sku}</span>}
                        {product.sku && product.sell_price ? ' · ' : ''}
                        {product.sell_price ? <span>Giá: {formatMoney(product.sell_price)}</span> : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showProductDropdown && productResults.length === 0 && productSearch.length >= 2 && !searchingProducts && (
              <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg p-4 text-center text-gray-500 text-sm">
                Không tìm thấy sản phẩm
              </div>
            )}

            {/* Chip sản phẩm đã chọn */}
            {selectedProducts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedProducts.map(product => (
                  <span
                    key={product.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-800 rounded-full text-sm"
                  >
                    <span className="w-5 h-5 rounded overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs">📦</span>
                      )}
                    </span>
                    <span className="truncate max-w-[150px]">{product.name}</span>
                    <button
                      type="button"
                      onClick={() => removeProduct(product.id)}
                      className="text-green-600 hover:text-red-600 font-bold ml-0.5"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Tổng tiền sản phẩm */}
            {selectedProducts.length > 0 && (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <div className="text-sm text-gray-700">📊 Tổng: <span className="font-medium">{selectedProducts.length} sản phẩm</span></div>
                <div className="text-lg font-bold text-blue-700 mt-0.5">
                  💰 Tổng giá trị: {formatMoney(selectedProducts.reduce((sum, p) => sum + (parseFloat(p.sell_price) || 0), 0))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              👤 Gán cho *
              {currentUser.role === 'Member' && <span className="text-xs text-gray-500 ml-2">(Chỉ gán cho bản thân)</span>}
            </label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={currentUser.role === 'Member'}
            >
              {assignableUsers.map(user => (
                <option key={user.id} value={user.name}>
                  {user.name} - {user.team} ({user.role})
                </option>
              ))}
            </select>
          </div>

          {/* Crew selection (Quay & Dựng) */}
          <div>
            <label className="block text-sm font-medium mb-2">🎬 Quay & Dựng (Chọn nhiều)</label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
              {allUsers.map(user => (
                <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={crew.includes(user.name)}
                    onChange={() => toggleCrew(user.name)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">{user.name} <span className="text-gray-400">- {user.team}</span></span>
                </label>
              ))}
            </div>
            {crew.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {crew.map(name => (
                  <span key={name} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1">
                    🎬 {name}
                    <button onClick={() => toggleCrew(name)} className="hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actor selection */}
          <div>
            <label className="block text-sm font-medium mb-2">🎭 Diễn viên (Chọn nhiều)</label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
              {allUsers.map(user => (
                <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={actors.includes(user.name)}
                    onChange={() => toggleActor(user.name)}
                    className="w-4 h-4 text-pink-600"
                  />
                  <span className="text-sm">{user.name} <span className="text-gray-400">- {user.team}</span></span>
                </label>
              ))}
            </div>
            {actors.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {actors.map(name => (
                  <span key={name} className="px-2 py-1 bg-pink-100 text-pink-700 rounded-full text-xs flex items-center gap-1">
                    🎭 {name}
                    <button onClick={() => toggleActor(name)} className="hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Deadline *</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Mô tả</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả chi tiết công việc..."
              rows="4"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 sticky bottom-0">
          <div className="flex gap-3">
            <button
              onClick={() => setShowCreateTaskModal(false)}
              className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                if (!title || platform.length === 0 || !dueDate) {
                  alert('⚠️ Vui lòng điền đầy đủ thông tin bắt buộc!');
                  return;
                }
                const productIds = selectedProducts.map(p => p.id);
                createNewTask(title, platform.join(', '), 'Trung bình', dueDate, description, assignee, videoCategory, crew, actors, productIds);
              }}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              ✅ Tạo Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateTaskModal;

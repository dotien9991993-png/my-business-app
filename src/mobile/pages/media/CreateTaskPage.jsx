import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { haptic } from '../../utils/haptics';
import { formatMoney } from '../../utils/formatters';

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'Blog', 'Ads', 'Email'];

const VIDEO_CATEGORIES = [
  { id: 'video_dan', name: 'Video dàn', icon: '🎬' },
  { id: 'video_hangngay', name: 'Video hàng ngày', icon: '📅' },
  { id: 'video_huongdan', name: 'Video hướng dẫn', icon: '📚' },
  { id: 'video_quangcao', name: 'Video quảng cáo', icon: '📢' },
  { id: 'video_review', name: 'Video review', icon: '⭐' },
];

const getDefaultDeadline = () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const deadline = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = deadline.getFullYear();
  const m = String(deadline.getMonth() + 1).padStart(2, '0');
  const d = String(deadline.getDate()).padStart(2, '0');
  const h = String(deadline.getHours()).padStart(2, '0');
  const min = String(deadline.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
};

export default function CreateTaskPage({ user, tenantId, onBack, onSubmit }) {
  // Form state — giống hệt desktop CreateTaskModal
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState(['Facebook', 'TikTok']);
  const [videoCategory, setVideoCategory] = useState('');
  const [assignee, setAssignee] = useState(user.name);
  const [cameramen, setCameramen] = useState([]);
  const [editors, setEditors] = useState([]);
  const [actors, setActors] = useState([]);
  const [dueDate, setDueDate] = useState(getDefaultDeadline());
  const [description, setDescription] = useState('');

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showProductDrop, setShowProductDrop] = useState(false);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const debounceRef = useRef(null);

  const [allUsers, setAllUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [ekipSearch, setEkipSearch] = useState('');

  // Expanded sections for ekip
  const [expandCameramen, setExpandCameramen] = useState(false);
  const [expandEditors, setExpandEditors] = useState(false);
  const [expandActors, setExpandActors] = useState(false);

  // Load active users
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('id, name, team, role, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');
      setAllUsers(data || []);
    })();
  }, [tenantId]);

  // Assignable users — giống desktop getAssignableUsers
  const assignableUsers = useMemo(() => {
    const role = user.role;
    if (role === 'Admin' || role === 'admin' || role === 'Manager') return allUsers;
    if (role === 'Team Lead') {
      const userTeams = user.teams || [user.team].filter(Boolean);
      return allUsers.filter(u => {
        const t = u.teams || [u.team].filter(Boolean);
        return t.some(team => userTeams.includes(team));
      });
    }
    return allUsers.filter(u => u.name === user.name);
  }, [allUsers, user]);

  const filteredEkipUsers = useMemo(() => {
    if (!ekipSearch.trim()) return allUsers;
    const q = ekipSearch.toLowerCase();
    return allUsers.filter(u =>
      u.name?.toLowerCase().includes(q) || u.team?.toLowerCase().includes(q)
    );
  }, [allUsers, ekipSearch]);

  // Product search — giống desktop debounced
  const searchProducts = useCallback(async (query) => {
    if (!query || query.length < 2 || !tenantId) {
      setProductResults([]);
      setShowProductDrop(false);
      return;
    }
    setSearchingProducts(true);
    try {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, sell_price, image_url')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
        .limit(10);
      const selectedIds = selectedProducts.map(p => p.id);
      setProductResults((data || []).filter(p => !selectedIds.includes(p.id)));
      setShowProductDrop(true);
    } catch (_) {
      setProductResults([]);
    } finally {
      setSearchingProducts(false);
    }
  }, [tenantId, selectedProducts]);

  const handleProductSearch = (e) => {
    const val = e.target.value;
    setProductSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchProducts(val), 300);
  };

  const togglePlatform = (plat) => {
    setPlatform(prev => prev.includes(plat) ? prev.filter(p => p !== plat) : [...prev, plat]);
  };

  const toggleList = (list, setList, name) => {
    setList(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const handleSubmit = async () => {
    // Validation — giống hệt desktop CreateTaskModal
    if (!title || platform.length === 0 || !dueDate) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        title,
        platform: platform.join(', '),
        category: videoCategory,
        assignee,
        cameramen,
        editors,
        actors,
        dueDate,
        description,
        productIds: selectedProducts.map(p => p.id),
      });
      await haptic('heavy');
      alert('Đã tạo task video!');
      onBack();
    } catch (err) {
      console.error('Error creating task:', err);
      alert('Lỗi khi tạo task: ' + (err.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  const isMember = user.role === 'Member';

  return (
    <div className="mobile-page mtask-create-page mpage-slide-in">
      {/* Header */}
      <div className="mtask-create-header">
        <button className="mtask-create-back" onClick={onBack}>← Quay lại</button>
        <h2 className="mtask-create-title">Tạo Video Mới</h2>
      </div>

      {/* Form */}
      <div className="mtask-create-body">

        {/* Section: Thông tin video */}
        <div className="mtask-create-section">
          <h3 className="mtask-create-section-title">Thông tin video</h3>

          <label className="mtask-create-label">
            Tiêu đề <span className="mtask-create-req">*</span>
          </label>
          <input
            type="text"
            className="mtask-create-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="VD: Viết bài blog về sản phẩm mới"
          />

          <label className="mtask-create-label">
            Danh mục video
          </label>
          <div className="mtask-create-cats">
            {VIDEO_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`mtask-create-cat ${videoCategory === cat.id ? 'active' : ''}`}
                onClick={() => setVideoCategory(videoCategory === cat.id ? '' : cat.id)}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Section: Platform */}
        <div className="mtask-create-section">
          <h3 className="mtask-create-section-title">
            Platform <span className="mtask-create-req">*</span>
          </h3>
          <div className="mtask-create-platforms">
            {PLATFORMS.map(plat => (
              <button
                key={plat}
                type="button"
                className={`mtask-create-plat ${platform.includes(plat) ? 'active' : ''}`}
                onClick={() => togglePlatform(plat)}
              >
                {plat}
              </button>
            ))}
          </div>
          {platform.length === 0 && (
            <p className="mtask-create-error">Chọn ít nhất 1 platform</p>
          )}
        </div>

        {/* Section: Sản phẩm */}
        <div className="mtask-create-section">
          <h3 className="mtask-create-section-title">Sản phẩm trong video</h3>

          <div className="mtask-create-product-search">
            <input
              type="text"
              className="mtask-create-input"
              value={productSearch}
              onChange={handleProductSearch}
              placeholder="Tìm sản phẩm theo tên, SKU..."
            />
            {searchingProducts && <span className="mtask-create-product-loading">...</span>}
          </div>

          {showProductDrop && productResults.length > 0 && (
            <div className="mtask-create-product-dropdown">
              {productResults.map(p => (
                <button key={p.id} className="mtask-create-product-option" onClick={() => {
                  setSelectedProducts(prev => [...prev, p]);
                  setProductSearch('');
                  setProductResults([]);
                  setShowProductDrop(false);
                }}>
                  <span className="mtask-create-product-name">{p.name}</span>
                  <span className="mtask-create-product-meta">
                    {p.sku && `SKU: ${p.sku}`}
                    {p.sku && p.sell_price ? ' · ' : ''}
                    {p.sell_price ? formatMoney(p.sell_price) : ''}
                  </span>
                </button>
              ))}
            </div>
          )}

          {showProductDrop && productResults.length === 0 && productSearch.length >= 2 && !searchingProducts && (
            <div className="mtask-create-product-empty">Không tìm thấy sản phẩm</div>
          )}

          {selectedProducts.length > 0 && (
            <div className="mtask-create-product-selected">
              {selectedProducts.map(p => (
                <span key={p.id} className="mtask-create-product-chip">
                  {p.name}
                  <button onClick={() => setSelectedProducts(prev => prev.filter(x => x.id !== p.id))}>×</button>
                </span>
              ))}
              <div className="mtask-create-product-total">
                {selectedProducts.length} sản phẩm · {formatMoney(selectedProducts.reduce((s, p) => s + (parseFloat(p.sell_price) || 0), 0))}
              </div>
            </div>
          )}
        </div>

        {/* Section: Phân công */}
        <div className="mtask-create-section">
          <h3 className="mtask-create-section-title">Phân công</h3>

          <label className="mtask-create-label">
            Gán cho <span className="mtask-create-req">*</span>
            {isMember && <span className="mtask-create-hint-inline"> (Chỉ gán cho bản thân)</span>}
          </label>
          <select
            className="mtask-create-input mtask-create-select"
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            disabled={isMember}
          >
            {assignableUsers.map(u => (
              <option key={u.id} value={u.name}>{u.name} - {u.team}</option>
            ))}
          </select>

          {allUsers.length > 6 && (
            <>
              <label className="mtask-create-label">Tìm nhân sự</label>
              <input
                type="text"
                className="mtask-create-input"
                value={ekipSearch}
                onChange={e => setEkipSearch(e.target.value)}
                placeholder="Tìm theo tên hoặc nhóm..."
              />
            </>
          )}

          {/* Cameramen */}
          <button className="mtask-create-ekip-toggle" onClick={() => setExpandCameramen(!expandCameramen)}>
            🎬 Quay phim {cameramen.length > 0 && `(${cameramen.length})`}
            <span>{expandCameramen ? '▼' : '▶'}</span>
          </button>
          {expandCameramen && (
            <div className="mtask-create-ekip-list">
              {filteredEkipUsers.map(u => (
                <label key={u.id} className="mtask-create-ekip-item">
                  <input type="checkbox" checked={cameramen.includes(u.name)} onChange={() => toggleList(cameramen, setCameramen, u.name)} />
                  <span className="mtask-create-ekip-name">{u.name}</span>
                  {u.team && <span className="mtask-create-ekip-team">{u.team}</span>}
                </label>
              ))}
            </div>
          )}
          {cameramen.length > 0 && (
            <div className="mtask-create-ekip-tags">
              {cameramen.map(n => <span key={n} className="mtask-create-ekip-tag cam">🎬 {n}<button onClick={() => toggleList(cameramen, setCameramen, n)}>×</button></span>)}
            </div>
          )}

          {/* Editors */}
          <button className="mtask-create-ekip-toggle" onClick={() => setExpandEditors(!expandEditors)}>
            ✂️ Dựng phim {editors.length > 0 && `(${editors.length})`}
            <span>{expandEditors ? '▼' : '▶'}</span>
          </button>
          {expandEditors && (
            <div className="mtask-create-ekip-list">
              {filteredEkipUsers.map(u => (
                <label key={u.id} className="mtask-create-ekip-item">
                  <input type="checkbox" checked={editors.includes(u.name)} onChange={() => toggleList(editors, setEditors, u.name)} />
                  <span className="mtask-create-ekip-name">{u.name}</span>
                  {u.team && <span className="mtask-create-ekip-team">{u.team}</span>}
                </label>
              ))}
            </div>
          )}
          {editors.length > 0 && (
            <div className="mtask-create-ekip-tags">
              {editors.map(n => <span key={n} className="mtask-create-ekip-tag edit">✂️ {n}<button onClick={() => toggleList(editors, setEditors, n)}>×</button></span>)}
            </div>
          )}

          {/* Actors */}
          <button className="mtask-create-ekip-toggle" onClick={() => setExpandActors(!expandActors)}>
            🎭 Diễn viên {actors.length > 0 && `(${actors.length})`}
            <span>{expandActors ? '▼' : '▶'}</span>
          </button>
          {expandActors && (
            <div className="mtask-create-ekip-list">
              {filteredEkipUsers.map(u => (
                <label key={u.id} className="mtask-create-ekip-item">
                  <input type="checkbox" checked={actors.includes(u.name)} onChange={() => toggleList(actors, setActors, u.name)} />
                  <span className="mtask-create-ekip-name">{u.name}</span>
                  {u.team && <span className="mtask-create-ekip-team">{u.team}</span>}
                </label>
              ))}
            </div>
          )}
          {actors.length > 0 && (
            <div className="mtask-create-ekip-tags">
              {actors.map(n => <span key={n} className="mtask-create-ekip-tag act">🎭 {n}<button onClick={() => toggleList(actors, setActors, n)}>×</button></span>)}
            </div>
          )}
        </div>

        {/* Section: Deadline & Mô tả */}
        <div className="mtask-create-section">
          <h3 className="mtask-create-section-title">Deadline & Mô tả</h3>

          <label className="mtask-create-label">
            Deadline <span className="mtask-create-req">*</span>
          </label>
          <input
            type="datetime-local"
            className="mtask-create-input"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />

          <label className="mtask-create-label">Mô tả</label>
          <textarea
            className="mtask-create-input mtask-create-textarea"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Mô tả chi tiết công việc..."
            rows="4"
          />
        </div>

        {/* Spacer for sticky button */}
        <div style={{ height: 130 }} />
      </div>

      {/* Sticky submit */}
      <div className="mtask-create-footer">
        <button
          className="mtask-create-submit"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Đang tạo...' : 'Tạo Video'}
        </button>
      </div>
    </div>
  );
}

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { warehouseCategories } from '../../constants/warehouseConstants';

export default function SalesProductsView({ products, orders, dynamicCategories, comboItems, getPermissionLevel }) {
  const permLevel = getPermissionLevel('sales');
  const effectiveCategories = dynamicCategories || warehouseCategories;
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [productSalesHistory, setProductSalesHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [committedQtyMap, setCommittedQtyMap] = useState({});

  useEffect(() => {
    const pendingStatuses = ['new', 'confirmed', 'packing', 'shipping'];
    const pendingOrderIds = (orders || []).filter(o => pendingStatuses.includes(o.status)).map(o => o.id);
    if (pendingOrderIds.length === 0) { setCommittedQtyMap({}); return; }
    (async () => {
      const { data } = await supabase.from('order_items').select('product_id, quantity').in('order_id', pendingOrderIds);
      if (!data) return;
      const map = {};
      data.forEach(item => { map[item.product_id] = (map[item.product_id] || 0) + item.quantity; });
      setCommittedQtyMap(map);
    })();
  }, [orders]);

  const getCommittedQty = (productId) => committedQtyMap[productId] || 0;

  // Tính tồn kho combo
  const getComboStock = (productId) => {
    const items = (comboItems || []).filter(ci => ci.combo_product_id === productId);
    if (items.length === 0) return 0;
    return Math.min(...items.map(ci => {
      const child = products.find(p => p.id === ci.child_product_id);
      return Math.floor((child?.stock_quantity || 0) / ci.quantity);
    }));
  };

  const getEffectiveStock = (p) => p.is_combo ? getComboStock(p.id) : (p.stock_quantity || 0);

  // Stock status helper
  const getStockStatus = (p) => {
    const stock = getEffectiveStock(p);
    if (stock === 0) return { label: 'Hết hàng', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' };
    if (stock <= (p.min_stock || 5)) return { label: 'Sắp hết', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' };
    return { label: 'Còn hàng', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' };
  };

  // Category icon
  const getCategoryIcon = (cat) => {
    if (!cat) return '📦';
    if (cat.includes('Micro')) return '🎤';
    if (cat.includes('Loa')) return '🔊';
    if (cat.includes('Mixer')) return '🎚️';
    if (cat.includes('Tai nghe')) return '🎧';
    if (cat.includes('Màn hình')) return '📺';
    if (cat.includes('Dây')) return '🔌';
    if (cat.includes('Đèn')) return '💡';
    return '📦';
  };

  // Filter + search
  const filtered = useMemo(() => {
    let result = (products || []).filter(p => p.is_active !== false);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q)
      );
    }
    if (filterCategory) result = result.filter(p => p.category === filterCategory);
    if (filterStock === 'instock') result = result.filter(p => getEffectiveStock(p) > (p.min_stock || 5));
    if (filterStock === 'low') result = result.filter(p => getEffectiveStock(p) > 0 && getEffectiveStock(p) <= (p.min_stock || 5));
    if (filterStock === 'out') result = result.filter(p => getEffectiveStock(p) === 0);
    return result;
  }, [products, search, filterCategory, filterStock, comboItems]);

  // Stats
  const stats = useMemo(() => {
    const active = (products || []).filter(p => p.is_active !== false);
    return {
      total: active.length,
      inStock: active.filter(p => getEffectiveStock(p) > 0).length,
      lowStock: active.filter(p => getEffectiveStock(p) > 0 && getEffectiveStock(p) <= (p.min_stock || 5)).length,
      outOfStock: active.filter(p => getEffectiveStock(p) === 0).length,
    };
  }, [products, comboItems]);

  // Load sales history for product detail
  const openProductDetail = async (product) => {
    setSelectedProduct(product);
    setShowDetailModal(true);
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('order_items')
        .select('*, orders!inner(order_number, status, created_at, customer_name)')
        .eq('product_id', product.id)
        .order('created_at', { foreignTable: 'orders', ascending: false })
        .limit(20);
      setProductSalesHistory(data || []);
    } catch (err) {
      console.error(err);
      setProductSalesHistory([]);
    }
    setLoadingHistory(false);
  };

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold">📱 Danh Mục Sản Phẩm</h2>
        <p className="text-sm text-gray-500">Xem sản phẩm từ kho — chỉ đọc, quản lý tại module Kho</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-blue-50 p-2.5 rounded-lg text-center">
          <div className="text-lg font-bold text-blue-700">{stats.total}</div>
          <div className="text-xs text-gray-600">Sản phẩm</div>
        </div>
        <div className="bg-green-50 p-2.5 rounded-lg text-center">
          <div className="text-lg font-bold text-green-700">{stats.inStock}</div>
          <div className="text-xs text-gray-600">Còn hàng</div>
        </div>
        <div className="bg-yellow-50 p-2.5 rounded-lg text-center">
          <div className="text-lg font-bold text-yellow-700">{stats.lowStock}</div>
          <div className="text-xs text-gray-600">Sắp hết</div>
        </div>
        <div className="bg-red-50 p-2.5 rounded-lg text-center">
          <div className="text-lg font-bold text-red-700">{stats.outOfStock}</div>
          <div className="text-xs text-gray-600">Hết hàng</div>
        </div>
      </div>

      {/* Low stock alert */}
      {(stats.lowStock > 0 || stats.outOfStock > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2 flex-wrap">
          <span className="text-yellow-600 text-lg">⚠️</span>
          <div className="text-sm flex-1">
            {stats.lowStock > 0 && <span className="font-medium text-yellow-700">{stats.lowStock} sản phẩm sắp hết hàng</span>}
            {stats.lowStock > 0 && stats.outOfStock > 0 && <span className="text-yellow-600"> • </span>}
            {stats.outOfStock > 0 && <span className="font-medium text-red-600">{stats.outOfStock} sản phẩm hết hàng</span>}
          </div>
          <button onClick={() => setFilterStock(stats.outOfStock > 0 ? 'out' : 'low')} className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium hover:bg-yellow-200">
            Xem chi tiết
          </button>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên, mã SP, barcode..."
            className="w-full border rounded-lg px-4 py-2.5 text-sm pl-10" />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Tất cả danh mục</option>
          {effectiveCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <select value={filterStock} onChange={e => setFilterStock(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Tất cả tồn kho</option>
          <option value="instock">Còn hàng</option>
          <option value="low">Sắp hết</option>
          <option value="out">Hết hàng</option>
        </select>
        <div className="flex gap-1">
          <button onClick={() => setViewMode('grid')}
            className={`px-3 py-2 rounded-lg text-sm ${viewMode === 'grid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            📦
          </button>
          <button onClick={() => setViewMode('table')}
            className={`px-3 py-2 rounded-lg text-sm ${viewMode === 'table' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            📋
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500">{filtered.length} / {stats.total} sản phẩm</div>

      {/* Empty */}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">📦</div>
          <p>{search || filterCategory || filterStock ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm trong kho'}</p>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(p => {
            const status = getStockStatus(p);
            return (
              <div key={p.id} onClick={() => openProductDetail(p)}
                className="bg-white rounded-xl border overflow-hidden hover:shadow-md cursor-pointer transition-shadow">
                <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center text-4xl">
                  {getCategoryIcon(p.category)}
                </div>
                <div className="p-3">
                  <div className="text-xs text-green-600 font-mono">{p.sku}</div>
                  <div className="font-medium text-sm text-gray-900 truncate mt-0.5" title={p.name}>
                    {p.name}
                    {p.is_combo && <span className="ml-1 px-1 py-0.5 bg-orange-100 text-orange-700 text-[9px] rounded font-medium">Combo</span>}
                  </div>
                  {p.brand && <div className="text-xs text-gray-400">{p.brand}</div>}
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm font-bold text-green-700">{formatMoney(p.sell_price)}</span>
                    <span className={`w-2 h-2 rounded-full ${status.dot}`} title={status.label} />
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className={`text-xs font-medium ${getEffectiveStock(p) === 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      Tồn: {getEffectiveStock(p)} {p.unit}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${status.color}`}>{status.label}</span>
                  </div>
                  {getCommittedQty(p.id) > 0 && (
                    <div className="text-[10px] text-amber-600">Cam kết: {getCommittedQty(p.id)} | Bán được: {Math.max(0, getEffectiveStock(p) - getCommittedQty(p.id))}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && filtered.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Mã SP</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Sản phẩm</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Danh mục</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Giá bán</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Tồn kho</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => {
                  const status = getStockStatus(p);
                  return (
                    <tr key={p.id} onClick={() => openProductDetail(p)} className="hover:bg-green-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-green-600">{p.sku}</span>
                        {p.barcode && <div className="text-xs text-gray-400">{p.barcode}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {p.name}
                          {p.is_combo && <span className="ml-1.5 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded font-medium align-middle">Combo</span>}
                        </div>
                        {p.brand && <div className="text-xs text-gray-500">{p.brand}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{p.category || '—'}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-green-700">{formatMoney(p.sell_price)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${getEffectiveStock(p) === 0 ? 'text-red-600' : 'text-gray-900'}`}>{getEffectiveStock(p)}</span>
                        <span className="text-gray-400 text-xs ml-1">{p.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {showDetailModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-xl flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">{selectedProduct.name}</h3>
                <div className="text-sm text-green-100 flex gap-2">
                  <span>{selectedProduct.sku}</span>
                  {selectedProduct.brand && <span>• {selectedProduct.brand}</span>}
                </div>
              </div>
              <button onClick={() => { setShowDetailModal(false); setSelectedProduct(null); }} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            <div className="p-4 space-y-4">
              {/* Product info cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 p-3 rounded-lg text-center">
                  <div className="text-lg font-bold text-green-700">{formatMoney(selectedProduct.sell_price)}</div>
                  <div className="text-xs text-gray-600">Giá bán</div>
                </div>
                <div className={`p-3 rounded-lg text-center ${getEffectiveStock(selectedProduct) === 0 ? 'bg-red-50' : getEffectiveStock(selectedProduct) <= (selectedProduct.min_stock || 5) ? 'bg-yellow-50' : 'bg-blue-50'}`}>
                  <div className={`text-lg font-bold ${getEffectiveStock(selectedProduct) === 0 ? 'text-red-700' : 'text-blue-700'}`}>
                    {getEffectiveStock(selectedProduct)} {selectedProduct.unit}
                  </div>
                  <div className="text-xs text-gray-600">{selectedProduct.is_combo ? 'Tồn combo' : 'Tồn kho'}</div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg text-center">
                  <div className="text-lg font-bold text-purple-700">{selectedProduct.warranty_months || 0}</div>
                  <div className="text-xs text-gray-600">Tháng BH</div>
                </div>
              </div>

              {/* Combo children list */}
              {selectedProduct.is_combo && (() => {
                const children = (comboItems || []).filter(ci => ci.combo_product_id === selectedProduct.id);
                return children.length > 0 ? (
                  <div className="bg-orange-50 rounded-lg p-3 space-y-2">
                    <div className="text-sm font-medium text-orange-700">Sản phẩm trong Combo:</div>
                    {children.map(ci => {
                      const child = products.find(p => p.id === ci.child_product_id);
                      return (
                        <div key={ci.id} className="flex justify-between items-center bg-white rounded px-3 py-1.5 text-sm">
                          <span className="truncate">{child?.name || 'SP đã xóa'}</span>
                          <span className="text-gray-500 shrink-0 ml-2">x{ci.quantity} (tồn: {child?.stock_quantity || 0})</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null;
              })()}

              {/* Details */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                {selectedProduct.category && <div><span className="text-gray-500">Danh mục:</span> <span className="font-medium">{selectedProduct.category}</span></div>}
                {selectedProduct.barcode && <div><span className="text-gray-500">Barcode:</span> <span className="font-mono">{selectedProduct.barcode}</span></div>}
                {selectedProduct.location && <div><span className="text-gray-500">Vị trí kho:</span> {selectedProduct.location}</div>}
                {selectedProduct.description && <div><span className="text-gray-500">Mô tả:</span> {selectedProduct.description}</div>}
                {selectedProduct.import_price > 0 && permLevel >= 3 && (
                  <div>
                    <span className="text-gray-500">Giá nhập:</span> {formatMoney(selectedProduct.import_price)}
                    {selectedProduct.sell_price > selectedProduct.import_price && (
                      <span className="text-green-600 ml-2 text-xs">
                        (+{Math.round((selectedProduct.sell_price - selectedProduct.import_price) / selectedProduct.import_price * 100)}% lãi)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Sales History */}
              <div>
                <h4 className="font-bold text-sm mb-2">Lịch sử bán ({productSalesHistory.length})</h4>
                {loadingHistory ? (
                  <div className="text-center py-4 text-gray-400">Đang tải...</div>
                ) : productSalesHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Chưa có lịch sử bán hàng</p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {productSalesHistory.map(item => (
                      <div key={item.id} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-lg text-sm">
                        <div>
                          <span className="font-medium">{item.orders?.order_number}</span>
                          <span className="text-gray-400 ml-2">{new Date(item.orders?.created_at).toLocaleDateString('vi-VN')}</span>
                          {item.orders?.customer_name && <span className="text-gray-500 ml-2">• {item.orders.customer_name}</span>}
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-gray-500">SL: {item.quantity} x {formatMoney(item.unit_price)}</span>
                          <div className="font-medium">{formatMoney(item.total_price)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { getDateStrVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';

export default function WarehouseStocktakeView({
  stocktakes = [],
  products = [],
  warehouses = [],
  warehouseStock = [],
  loadWarehouseData,
  tenant,
  currentUser,
  hasPermission,
  canEdit,
  productVariants = []
}) {
  // ── State ──────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedStocktake, setSelectedStocktake] = useState(null);
  const [stocktakeItems, setStocktakeItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [listStatusFilter, setListStatusFilter] = useState('all');
  const [loadingItems, setLoadingItems] = useState(false);
  const [toast, setToast] = useState(null);

  // Create form
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [formNote, setFormNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectMode, setSelectMode] = useState('all'); // 'all' | 'specific' | 'category'
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [createSearchTerm, setCreateSearchTerm] = useState('');

  // Detail modal
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [itemFilter, setItemFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);
  const [treatUncheckedAsMatch, setTreatUncheckedAsMatch] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');

  // Refs
  const dirtyRef = useRef(false);
  const dirtyItemsRef = useRef(new Set());
  const autoSaveTimer = useRef(null);
  const barcodeFieldRef = useRef(null);
  const handleSaveAllRef = useRef(null);
  const handleBarcodeScanRef = useRef(null);

  // ── Product map ────────────────────────────────
  const productMap = useMemo(() => {
    const map = {};
    products.forEach(p => { map[p.id] = p; });
    return map;
  }, [products]);

  // ── Helpers (moved up for use in create memos) ──
  const getWarehouseQty = useCallback((productId, warehouseId) => {
    const record = warehouseStock.find(ws => ws.product_id === productId && ws.warehouse_id === warehouseId);
    if (record) return record.quantity || 0;
    const hasAnyRecord = warehouseStock.some(ws => ws.warehouse_id === warehouseId);
    if (!hasAnyRecord) {
      const product = productMap[productId];
      return product?.stock_quantity || 0;
    }
    return 0;
  }, [warehouseStock, productMap]);

  const getWarehouseName = useCallback((id) => {
    return warehouses.find(w => w.id === id)?.name || 'N/A';
  }, [warehouses]);

  // ── Create form: products for selected warehouse ──
  const createWarehouseProducts = useMemo(() => {
    if (!selectedWarehouseId) return [];
    return products.filter(p => !p.is_combo).map(p => ({
      ...p,
      whQty: getWarehouseQty(p.id, selectedWarehouseId)
    }));
  }, [selectedWarehouseId, products, getWarehouseQty]);

  const createCategories = useMemo(() => {
    const catMap = {};
    createWarehouseProducts.forEach(p => {
      const cat = p.category || 'Chưa phân loại';
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push(p);
    });
    return Object.entries(catMap).sort((a, b) => a[0].localeCompare(b[0]));
  }, [createWarehouseProducts]);

  const filteredCreateProducts = useMemo(() => {
    if (!createSearchTerm) return createWarehouseProducts;
    const term = createSearchTerm.toLowerCase();
    return createWarehouseProducts.filter(p =>
      (p.name || '').toLowerCase().includes(term) ||
      (p.sku || '').toLowerCase().includes(term)
    );
  }, [createWarehouseProducts, createSearchTerm]);

  const createSelectedCount = useMemo(() => {
    if (selectMode === 'all') return createWarehouseProducts.length;
    if (selectMode === 'specific') return selectedProductIds.size;
    if (selectMode === 'category') {
      let count = 0;
      createCategories.forEach(([cat, prods]) => {
        if (selectedCategories.has(cat)) count += prods.length;
      });
      return count;
    }
    return 0;
  }, [selectMode, createWarehouseProducts, selectedProductIds, selectedCategories, createCategories]);

  // ── Effects ────────────────────────────────────
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Auto-save every 30s (using ref to avoid stale closure)
  useEffect(() => {
    if (showDetailModal && selectedStocktake?.status === 'in_progress') {
      autoSaveTimer.current = setInterval(() => {
        if (dirtyRef.current && handleSaveAllRef.current) {
          handleSaveAllRef.current(true);
        }
      }, 30000);
      return () => clearInterval(autoSaveTimer.current);
    }
  }, [showDetailModal, selectedStocktake?.id, selectedStocktake?.status]);

  // USB barcode scanner: detect rapid keystrokes + Enter
  useEffect(() => {
    if (!showDetailModal || selectedStocktake?.status !== 'in_progress') return;
    const buf = { text: '', timer: null };
    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter' && buf.text.length >= 2) {
        e.preventDefault();
        if (handleBarcodeScanRef.current) handleBarcodeScanRef.current(buf.text);
        buf.text = '';
        return;
      }
      if (e.key.length === 1) {
        buf.text += e.key;
        clearTimeout(buf.timer);
        buf.timer = setTimeout(() => { buf.text = ''; }, 150);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); clearTimeout(buf.timer); };
  }, [showDetailModal, selectedStocktake?.status]);

  // ── Helpers ────────────────────────────────────
  const genStocktakeCode = () => {
    const dateStr = getDateStrVN();
    const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `KK-${dateStr}-${rand}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getStatusBadge = (status) => {
    const config = {
      draft: { cls: 'bg-gray-100 text-gray-700', icon: '\uD83D\uDCDD', label: 'Nháp' },
      in_progress: { cls: 'bg-yellow-100 text-yellow-700', icon: '\uD83D\uDFE1', label: 'Đang kiểm' },
      completed: { cls: 'bg-green-100 text-green-700', icon: '\u2705', label: 'Hoàn thành' },
      cancelled: { cls: 'bg-red-100 text-red-700', icon: '\uD83D\uDD34', label: 'Đã hủy' }
    };
    const c = config[status] || config.draft;
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.cls}`}>{c.icon} {c.label}</span>;
  };

  // ── Load items ─────────────────────────────────
  const loadStocktakeItems = async (stocktakeId) => {
    setLoadingItems(true);
    try {
      const { data, error } = await supabase
        .from('stocktake_items')
        .select('*')
        .eq('stocktake_id', stocktakeId)
        .order('product_name');
      if (error) throw error;
      setStocktakeItems(data || []);
      dirtyRef.current = false;
      dirtyItemsRef.current.clear();
    } catch (err) {
      console.error('Lỗi tải danh sách kiểm kê:', err);
      setToast({ type: 'error', msg: 'Lỗi tải danh sách sản phẩm kiểm kê' });
    } finally {
      setLoadingItems(false);
    }
  };

  // ── Create ─────────────────────────────────────
  const handleCreate = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Bạn không có quyền tạo phiếu kiểm kê'); return; }
    if (!selectedWarehouseId) {
      setToast({ type: 'error', msg: 'Vui lòng chọn kho hàng' });
      return;
    }

    // Xác định danh sách SP cần kiểm kê
    let targetProducts;
    const nonCombo = products.filter(p => !p.is_combo);

    if (selectMode === 'all') {
      targetProducts = nonCombo;
    } else if (selectMode === 'specific') {
      if (selectedProductIds.size === 0) {
        setToast({ type: 'error', msg: 'Vui lòng chọn ít nhất 1 sản phẩm' });
        return;
      }
      targetProducts = nonCombo.filter(p => selectedProductIds.has(p.id));
    } else if (selectMode === 'category') {
      if (selectedCategories.size === 0) {
        setToast({ type: 'error', msg: 'Vui lòng chọn ít nhất 1 danh mục' });
        return;
      }
      targetProducts = nonCombo.filter(p => selectedCategories.has(p.category || 'Chưa phân loại'));
    } else {
      targetProducts = nonCombo;
    }

    setCreating(true);
    try {
      const code = genStocktakeCode();
      const { data: newSt, error: stErr } = await supabase
        .from('stocktakes')
        .insert({
          stocktake_code: code,
          status: 'draft',
          warehouse_id: selectedWarehouseId,
          tenant_id: tenant?.id,
          created_by: currentUser?.name,
          note: formNote || null,
          total_items: 0
        })
        .select()
        .single();
      if (stErr) throw stErr;

      // Tạo stocktake_items cho SP đã chọn (bao gồm variant nếu có)
      const items = [];
      targetProducts.forEach(p => {
        const pVariants = productVariants.filter(v => v.product_id === p.id && v.is_active !== false);
        if (pVariants.length > 0) {
          pVariants.forEach(v => {
            items.push({
              stocktake_id: newSt.id,
              product_id: p.id,
              product_name: `${p.name} - ${v.variant_name}`,
              product_sku: v.sku || p.sku || '',
              system_qty: getWarehouseQty(p.id, selectedWarehouseId),
              actual_qty: null,
              note: null,
              variant_id: v.id,
              variant_name: v.variant_name
            });
          });
        } else {
          items.push({
            stocktake_id: newSt.id,
            product_id: p.id,
            product_name: p.name,
            product_sku: p.sku || '',
            system_qty: getWarehouseQty(p.id, selectedWarehouseId),
            actual_qty: null,
            note: null,
            variant_id: null,
            variant_name: null
          });
        }
      });

      if (items.length > 0) {
        const { error: itemsErr } = await supabase
          .from('stocktake_items')
          .insert(items);
        if (itemsErr) throw itemsErr;
      }

      await supabase
        .from('stocktakes')
        .update({ total_items: items.length })
        .eq('id', newSt.id);

      if (loadWarehouseData) await loadWarehouseData();

      setShowCreateModal(false);
      setSelectedWarehouseId('');
      setFormNote('');
      setSelectMode('all');
      setSelectedProductIds(new Set());
      setSelectedCategories(new Set());
      setCreateSearchTerm('');

      // Mở chi tiết ngay
      setSelectedStocktake({ ...newSt, total_items: items.length });
      await loadStocktakeItems(newSt.id);
      setItemFilter('all');
      setCategoryFilter('all');
      setItemSearchTerm('');
      setBarcodeInput('');
      setShowDetailModal(true);

      logActivity({ tenantId: tenant?.id, userId: currentUser?.id, userName: currentUser?.name, module: 'warehouse', action: 'create', entityType: 'stocktake', entityId: newSt.id, entityName: code, description: `Tạo phiếu kiểm kê ${code} với ${items.length} sản phẩm` });
      setToast({ type: 'success', msg: `Đã tạo phiếu kiểm kê với ${items.length} sản phẩm` });
    } catch (err) {
      console.error('Lỗi tạo phiếu kiểm kê:', err);
      setToast({ type: 'error', msg: 'Lỗi tạo phiếu kiểm kê: ' + (err.message || '') });
    } finally {
      setCreating(false);
    }
  };

  // ── Local updates ──────────────────────────────
  const handleLocalUpdate = useCallback((itemId, field, value) => {
    dirtyRef.current = true;
    dirtyItemsRef.current.add(itemId);
    setStocktakeItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
  }, []);

  // ── Save ───────────────────────────────────────
  const handleSaveAll = useCallback(async (silent = false) => {
    if (!selectedStocktake) return;
    setSaving(true);
    try {
      const dirtyIds = dirtyItemsRef.current;
      const itemsToSave = dirtyIds.size > 0
        ? stocktakeItems.filter(i => dirtyIds.has(i.id))
        : [];

      if (itemsToSave.length === 0 && !silent) {
        setToast({ type: 'success', msg: 'Không có thay đổi cần lưu' });
        setSaving(false);
        return;
      }

      // Lưu theo batch (10 item/lần)
      for (let i = 0; i < itemsToSave.length; i += 10) {
        const batch = itemsToSave.slice(i, i + 10);
        await Promise.all(batch.map(item =>
          supabase.from('stocktake_items')
            .update({ actual_qty: item.actual_qty, note: item.note || null })
            .eq('id', item.id)
        ));
      }

      dirtyRef.current = false;
      dirtyItemsRef.current.clear();
      if (!silent) setToast({ type: 'success', msg: `Đã lưu tạm ${itemsToSave.length} sản phẩm` });
    } catch (err) {
      console.error('Lỗi lưu tạm:', err);
      if (!silent) setToast({ type: 'error', msg: 'Lỗi lưu: ' + (err.message || '') });
    } finally {
      setSaving(false);
    }
  }, [selectedStocktake, stocktakeItems]);

  // Keep ref updated
  handleSaveAllRef.current = handleSaveAll;

  // ── Set all match ──────────────────────────────
  const handleSetAllMatch = () => {
    let count = 0;
    setStocktakeItems(prev => prev.map(i => {
      if (i.actual_qty === null || i.actual_qty === undefined) {
        dirtyRef.current = true;
        dirtyItemsRef.current.add(i.id);
        count++;
        return { ...i, actual_qty: i.system_qty };
      }
      return i;
    }));
    setToast({ type: 'success', msg: `Đã đặt ${count} SP chưa kiểm = tồn hệ thống` });
  };

  // ── Barcode scan ───────────────────────────────
  const handleBarcodeScan = useCallback((sku) => {
    if (!sku || !sku.trim()) return;
    const normalized = sku.trim().toLowerCase();

    const item = stocktakeItems.find(i =>
      (i.product_sku || '').toLowerCase() === normalized ||
      (i.product_name || '').toLowerCase() === normalized
    );

    if (item) {
      const newQty = (item.actual_qty || 0) + 1;
      dirtyRef.current = true;
      dirtyItemsRef.current.add(item.id);
      setStocktakeItems(prev => prev.map(i => i.id === item.id ? { ...i, actual_qty: newQty } : i));
      setToast({ type: 'success', msg: `${item.product_name} → SL: ${newQty}` });
    } else {
      setToast({ type: 'error', msg: `Không tìm thấy SP với mã: ${sku.trim()}` });
    }
  }, [stocktakeItems]);

  // Keep ref updated
  handleBarcodeScanRef.current = handleBarcodeScan;

  // ── Complete ───────────────────────────────────
  const handleComplete = async () => {
    if (!canEdit('warehouse')) { alert('Bạn không có quyền hoàn thành kiểm kê'); return; }
    if (!selectedStocktake) return;
    setCompleting(true);
    try {
      // Xác định actual_qty cuối cùng
      const finalItems = stocktakeItems.map(item => {
        const actualQty = (treatUncheckedAsMatch && (item.actual_qty === null || item.actual_qty === undefined))
          ? item.system_qty : item.actual_qty;
        return { ...item, actual_qty: actualQty };
      });

      // Lưu tất cả items
      for (let i = 0; i < finalItems.length; i += 10) {
        const batch = finalItems.slice(i, i + 10);
        await Promise.all(batch.map(item =>
          supabase.from('stocktake_items')
            .update({ actual_qty: item.actual_qty, note: item.note || null })
            .eq('id', item.id)
        ));
      }

      // Điều chỉnh tồn kho cho SP có chênh lệch
      const itemsWithDiff = finalItems.filter(
        item => item.actual_qty != null && (item.actual_qty - item.system_qty) !== 0
      );

      for (const item of itemsWithDiff) {
        const diff = item.actual_qty - item.system_qty;

        const { error: rpcErr } = await supabase.rpc('adjust_warehouse_stock', {
          p_warehouse_id: selectedStocktake.warehouse_id,
          p_product_id: item.product_id,
          p_delta: diff
        });
        if (rpcErr) console.error(`Lỗi điều chỉnh tồn kho ${item.product_name}:`, rpcErr);

        await supabase.from('stock_transactions').insert({
          product_id: item.product_id,
          warehouse_id: selectedStocktake.warehouse_id,
          type: diff > 0 ? 'import' : 'export',
          quantity: Math.abs(diff),
          note: `Kiểm kê ${selectedStocktake.stocktake_code}: ${diff > 0 ? '+' : ''}${diff}`,
          tenant_id: tenant?.id,
          created_by: currentUser?.name
        });
      }

      const overTotal = finalItems.filter(i => i.actual_qty != null && i.actual_qty > i.system_qty)
        .reduce((s, i) => s + (i.actual_qty - i.system_qty), 0);
      const underTotal = finalItems.filter(i => i.actual_qty != null && i.actual_qty < i.system_qty)
        .reduce((s, i) => s + (i.actual_qty - i.system_qty), 0);

      await supabase.from('stocktakes')
        .update({
          status: 'completed',
          completed_by: currentUser?.name,
          completed_at: new Date().toISOString(),
          total_diff: overTotal + underTotal
        })
        .eq('id', selectedStocktake.id);

      if (loadWarehouseData) await loadWarehouseData();

      setStocktakeItems(finalItems);
      setSelectedStocktake(prev => ({ ...prev, status: 'completed' }));
      setShowConfirmComplete(false);
      dirtyRef.current = false;
      dirtyItemsRef.current.clear();
      logActivity({ tenantId: tenant?.id, userId: currentUser?.id, userName: currentUser?.name, module: 'warehouse', action: 'approve', entityType: 'stocktake', entityId: selectedStocktake.id, entityName: selectedStocktake.stocktake_code, description: `Hoàn thành kiểm kê ${selectedStocktake.stocktake_code}: điều chỉnh ${itemsWithDiff.length} SP, thừa +${overTotal}, thiếu ${underTotal}` });
      setToast({ type: 'success', msg: `Hoàn thành kiểm kê! Đã điều chỉnh ${itemsWithDiff.length} sản phẩm` });
    } catch (err) {
      console.error('Lỗi hoàn thành kiểm kê:', err);
      setToast({ type: 'error', msg: 'Lỗi: ' + (err.message || '') });
    } finally {
      setCompleting(false);
    }
  };

  // ── Cancel ─────────────────────────────────────
  const handleCancel = async () => {
    if (!canEdit('warehouse')) { alert('Bạn không có quyền hủy phiếu kiểm kê'); return; }
    if (!selectedStocktake) return;
    if (!window.confirm('Bạn có chắc chắn muốn hủy phiếu kiểm kê này?')) return;
    try {
      const { error } = await supabase.from('stocktakes')
        .update({ status: 'cancelled' })
        .eq('id', selectedStocktake.id);
      if (error) throw error;
      if (loadWarehouseData) await loadWarehouseData();
      setSelectedStocktake(prev => ({ ...prev, status: 'cancelled' }));
      setToast({ type: 'success', msg: 'Đã hủy phiếu kiểm kê' });
    } catch (err) {
      setToast({ type: 'error', msg: 'Lỗi hủy: ' + (err.message || '') });
    }
  };

  // ── Start audit (draft → in_progress) ─────────
  const handleStartAudit = async () => {
    if (!selectedStocktake) return;
    try {
      const { error } = await supabase.from('stocktakes')
        .update({ status: 'in_progress' })
        .eq('id', selectedStocktake.id);
      if (error) throw error;
      if (loadWarehouseData) await loadWarehouseData();
      setSelectedStocktake(prev => ({ ...prev, status: 'in_progress' }));
      logActivity({ tenantId: tenant?.id, userId: currentUser?.id, userName: currentUser?.name, module: 'warehouse', action: 'update', entityType: 'stocktake', entityId: selectedStocktake.id, entityName: selectedStocktake.stocktake_code, description: `Bắt đầu kiểm kê ${selectedStocktake.stocktake_code}` });
      setToast({ type: 'success', msg: 'Đã bắt đầu kiểm kê!' });
    } catch (err) {
      setToast({ type: 'error', msg: 'Lỗi: ' + (err.message || '') });
    }
  };

  // ── Delete ─────────────────────────────────────
  const handleDelete = async (st, e) => {
    e.stopPropagation();
    if (st.status !== 'draft' && st.status !== 'cancelled') return;
    if (!window.confirm(`Xóa phiếu ${st.stocktake_code}?`)) return;
    try {
      await supabase.from('stocktake_items').delete().eq('stocktake_id', st.id);
      await supabase.from('stocktakes').delete().eq('id', st.id);
      if (loadWarehouseData) await loadWarehouseData();
      setToast({ type: 'success', msg: 'Đã xóa phiếu kiểm kê' });
    } catch (err) {
      setToast({ type: 'error', msg: 'Lỗi xóa: ' + (err.message || '') });
    }
  };

  // ── Open detail ────────────────────────────────
  const openDetail = async (stocktake) => {
    setSelectedStocktake(stocktake);
    setItemSearchTerm('');
    setItemFilter('all');
    setCategoryFilter('all');
    setTreatUncheckedAsMatch(false);
    setBarcodeInput('');
    await loadStocktakeItems(stocktake.id);
    setShowDetailModal(true);
  };

  // ── Print ──────────────────────────────────────
  const handlePrint = (onlyDiff = false) => {
    const st = selectedStocktake;
    if (!st) return;
    const whName = getWarehouseName(st.warehouse_id);
    const items = onlyDiff
      ? stocktakeItems.filter(i => i.actual_qty != null && i.actual_qty !== i.system_qty)
      : stocktakeItems;

    const rows = items.map((item, i) => {
      const diff = item.actual_qty != null ? item.actual_qty - item.system_qty : null;
      const diffStr = diff === null ? 'Chưa kiểm' : diff === 0 ? '0' : (diff > 0 ? `+${diff}` : `${diff}`);
      const color = diff === null ? '#999' : diff > 0 ? 'green' : diff < 0 ? 'red' : '#333';
      return `<tr>
        <td style="border:1px solid #ccc;padding:4px 8px;text-align:center">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:4px 8px">${item.product_sku || ''}</td>
        <td style="border:1px solid #ccc;padding:4px 8px">${item.product_name}</td>
        <td style="border:1px solid #ccc;padding:4px 8px;text-align:center">${item.system_qty}</td>
        <td style="border:1px solid #ccc;padding:4px 8px;text-align:center">${item.actual_qty != null ? item.actual_qty : ''}</td>
        <td style="border:1px solid #ccc;padding:4px 8px;text-align:center;color:${color}">${diffStr}</td>
        <td style="border:1px solid #ccc;padding:4px 8px">${item.note || ''}</td>
      </tr>`;
    }).join('');

    const counted = stocktakeItems.filter(i => i.actual_qty != null);
    const overItems = counted.filter(i => i.actual_qty > i.system_qty);
    const underItems = counted.filter(i => i.actual_qty < i.system_qty);
    const matchItems = counted.filter(i => i.actual_qty === i.system_qty);
    const overSum = overItems.reduce((s, i) => s + (i.actual_qty - i.system_qty), 0);
    const underSum = underItems.reduce((s, i) => s + (i.actual_qty - i.system_qty), 0);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Phiếu kiểm kê ${st.stocktake_code}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;font-size:13px}table{border-collapse:collapse;width:100%}
      .header{text-align:center;margin-bottom:20px}.sign{display:flex;justify-content:space-between;margin-top:40px;text-align:center}
      .sign div{width:30%}.summary{margin:15px 0;padding:10px;background:#f5f5f5;border-radius:4px;font-size:12px}
      @media print{button{display:none}}</style></head><body>
      <div class="header"><h2 style="margin:0">HOÀNG NAM AUDIO</h2><h3 style="margin:8px 0">PHIẾU KIỂM KÊ KHO</h3></div>
      <p><strong>Mã phiếu:</strong> ${st.stocktake_code} &nbsp;&nbsp; <strong>Kho:</strong> ${whName} &nbsp;&nbsp;
      <strong>Ngày:</strong> ${formatDate(st.created_at)} &nbsp;&nbsp; <strong>Người tạo:</strong> ${st.created_by || ''}</p>
      ${st.note ? `<p><strong>Ghi chú:</strong> ${st.note}</p>` : ''}
      <table><thead><tr style="background:#f5f5f5">
        <th style="border:1px solid #ccc;padding:6px">#</th>
        <th style="border:1px solid #ccc;padding:6px">Mã SP</th>
        <th style="border:1px solid #ccc;padding:6px">Tên sản phẩm</th>
        <th style="border:1px solid #ccc;padding:6px">Tồn HT</th>
        <th style="border:1px solid #ccc;padding:6px">Thực tế</th>
        <th style="border:1px solid #ccc;padding:6px">Chênh lệch</th>
        <th style="border:1px solid #ccc;padding:6px">Ghi chú</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="summary">
        <strong>Tổng kết:</strong> ${items.length} sản phẩm |
        Khớp: ${matchItems.length} SP |
        Thừa: ${overItems.length} SP (${overSum > 0 ? '+' : ''}${overSum}) |
        Thiếu: ${underItems.length} SP (${underSum})
      </div>
      <div class="sign"><div><p><strong>Người kiểm kê</strong></p><p style="margin-top:50px"><em>(Ký, ghi rõ họ tên)</em></p></div>
      <div><p><strong>Thủ kho</strong></p><p style="margin-top:50px"><em>(Ký, ghi rõ họ tên)</em></p></div>
      <div><p><strong>Quản lý</strong></p><p style="margin-top:50px"><em>(Ký, ghi rõ họ tên)</em></p></div></div></body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  };

  // ── Computed: stats ────────────────────────────
  const stats = useMemo(() => {
    const total = stocktakes.length;
    const draft = stocktakes.filter(s => s.status === 'draft').length;
    const inProgress = stocktakes.filter(s => s.status === 'in_progress').length;
    const completed = stocktakes.filter(s => s.status === 'completed').length;
    const cancelled = stocktakes.filter(s => s.status === 'cancelled').length;
    return { total, draft, inProgress, completed, cancelled };
  }, [stocktakes]);

  // ── Computed: filtered list ────────────────────
  const filteredStocktakes = useMemo(() => {
    let list = stocktakes;
    if (listStatusFilter !== 'all') {
      list = list.filter(s => s.status === listStatusFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(s =>
        (s.stocktake_code || '').toLowerCase().includes(term) ||
        getWarehouseName(s.warehouse_id).toLowerCase().includes(term) ||
        (s.note || '').toLowerCase().includes(term) ||
        (s.created_by || '').toLowerCase().includes(term)
      );
    }
    return list;
  }, [stocktakes, searchTerm, listStatusFilter, getWarehouseName]);

  // ── Computed: item summary ─────────────────────
  const itemSummary = useMemo(() => {
    const counted = stocktakeItems.filter(i => i.actual_qty !== null && i.actual_qty !== undefined);
    const matched = counted.filter(i => i.actual_qty - i.system_qty === 0).length;
    const overItems = counted.filter(i => i.actual_qty > i.system_qty);
    const underItems = counted.filter(i => i.actual_qty < i.system_qty);
    const overTotal = overItems.reduce((s, i) => s + (i.actual_qty - i.system_qty), 0);
    const underTotal = underItems.reduce((s, i) => s + (i.actual_qty - i.system_qty), 0);
    const notCounted = stocktakeItems.length - counted.length;
    return {
      total: stocktakeItems.length, countedCount: counted.length, notCounted,
      matched, overCount: overItems.length, underCount: underItems.length,
      overTotal, underTotal
    };
  }, [stocktakeItems]);

  // ── Computed: item categories ──────────────────
  const itemCategories = useMemo(() => {
    const cats = new Set();
    stocktakeItems.forEach(item => {
      const p = productMap[item.product_id];
      if (p?.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [stocktakeItems, productMap]);

  // ── Computed: filtered items ───────────────────
  const filteredItems = useMemo(() => {
    let list = stocktakeItems;

    if (itemFilter === 'unchecked') list = list.filter(i => i.actual_qty === null || i.actual_qty === undefined);
    else if (itemFilter === 'checked') list = list.filter(i => i.actual_qty !== null && i.actual_qty !== undefined);
    else if (itemFilter === 'diff') list = list.filter(i => i.actual_qty != null && i.actual_qty !== i.system_qty);
    else if (itemFilter === 'over') list = list.filter(i => i.actual_qty != null && i.actual_qty > i.system_qty);
    else if (itemFilter === 'under') list = list.filter(i => i.actual_qty != null && i.actual_qty < i.system_qty);

    if (categoryFilter !== 'all') {
      list = list.filter(i => productMap[i.product_id]?.category === categoryFilter);
    }

    if (itemSearchTerm) {
      const term = itemSearchTerm.toLowerCase();
      list = list.filter(i =>
        (i.product_name || '').toLowerCase().includes(term) ||
        (i.product_sku || '').toLowerCase().includes(term)
      );
    }

    return list;
  }, [stocktakeItems, itemFilter, categoryFilter, itemSearchTerm, productMap]);

  // ── List diff display ──────────────────────────
  const getListDiffText = (st) => {
    if (st.status === 'completed' && st.total_diff != null) {
      const d = st.total_diff;
      if (d === 0) return <span className="text-green-600 text-xs font-medium">Khớp</span>;
      return <span className={`text-xs font-medium ${d > 0 ? 'text-blue-600' : 'text-red-600'}`}>{d > 0 ? '+' : ''}{d}</span>;
    }
    if (st.status === 'in_progress') return <span className="text-yellow-500 text-xs">Đang kiểm...</span>;
    if (st.status === 'draft') return <span className="text-gray-400 text-xs">Nháp</span>;
    if (st.status === 'cancelled') return <span className="text-gray-300 text-xs">-</span>;
    return <span className="text-gray-300 text-xs">-</span>;
  };

  // ── Diff cell render ───────────────────────────
  const DiffCell = ({ item }) => {
    const hasActual = item.actual_qty !== null && item.actual_qty !== undefined;
    const diff = hasActual ? item.actual_qty - item.system_qty : null;
    if (diff === null) return <span className="text-gray-400 text-xs">{'\u2B1C'} Chưa kiểm</span>;
    if (diff === 0) return <span className="text-green-600 text-xs font-medium">{'\u2705'} Khớp</span>;
    if (diff > 0) return <span className="text-blue-600 font-medium">{'\uD83D\uDFE2'} +{diff}</span>;
    return <span className="text-red-600 font-medium">{'\uD83D\uDD34'} {diff}</span>;
  };

  // ── Render ─────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium max-w-xs ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Kiểm kê kho</h2>
          <p className="text-sm text-gray-500 mt-1">Quản lý phiếu kiểm kê tồn kho</p>
        </div>
        {hasPermission('warehouse', 2) && (
          <button
            onClick={() => { setSelectedWarehouseId(''); setFormNote(''); setSelectMode('all'); setSelectedProductIds(new Set()); setSelectedCategories(new Set()); setCreateSearchTerm(''); setShowCreateModal(true); }}
            className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors font-medium shadow-sm flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Tạo phiếu kiểm kê
          </button>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Tổng phiếu', value: stats.total, color: 'amber', border: 'border-amber-500' },
          { label: 'Nháp', value: stats.draft, color: 'gray', border: 'border-gray-400' },
          { label: 'Đang kiểm', value: stats.inProgress, color: 'yellow', border: 'border-yellow-500' },
          { label: 'Hoàn thành', value: stats.completed, color: 'green', border: 'border-green-500' },
          { label: 'Đã hủy', value: stats.cancelled, color: 'red', border: 'border-red-500' }
        ].map((s, idx) => (
          <div key={idx} className={`bg-white rounded-xl shadow-sm border-l-4 ${s.border} p-4`}>
            <div className="text-sm text-gray-500">{s.label}</div>
            <div className={`text-2xl font-bold text-${s.color === 'amber' ? 'gray-800' : s.color + '-600'} mt-1`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search & filter */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text" placeholder="Tìm theo mã phiếu, kho, người tạo..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>
        <select value={listStatusFilter} onChange={e => setListStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm">
          <option value="all">Tất cả trạng thái</option>
          <option value="in_progress">Đang kiểm</option>
          <option value="completed">Hoàn thành</option>
          <option value="cancelled">Đã hủy</option>
          <option value="draft">Nháp</option>
        </select>
      </div>

      {/* Table - Desktop */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Mã phiếu</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kho</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ngày tạo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Số SP</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Chênh lệch</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Người tạo</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStocktakes.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Chưa có phiếu kiểm kê nào</td></tr>
              ) : filteredStocktakes.map(st => (
                <tr key={st.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(st)}>
                  <td className="px-4 py-3 font-medium text-amber-700 font-mono text-xs">{st.stocktake_code}</td>
                  <td className="px-4 py-3 text-gray-700">{getWarehouseName(st.warehouse_id)}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(st.created_at)}</td>
                  <td className="px-4 py-3">{getStatusBadge(st.status)}</td>
                  <td className="px-4 py-3 text-center text-gray-700 font-medium">{st.total_items || 0}</td>
                  <td className="px-4 py-3 text-center">{getListDiffText(st)}</td>
                  <td className="px-4 py-3 text-gray-500">{st.created_by || ''}</td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openDetail(st)} className="text-amber-600 hover:text-amber-800 font-medium text-xs">Chi tiết</button>
                      {st.status === 'completed' && (
                        <button onClick={(e) => { e.stopPropagation(); setSelectedStocktake(st); loadStocktakeItems(st.id).then(() => { setSelectedStocktake(st); handlePrint(false); }); }}
                          className="text-gray-500 hover:text-gray-700 text-xs">In</button>
                      )}
                      {canEdit('warehouse') && (st.status === 'draft' || st.status === 'cancelled') && (
                        <button onClick={e => handleDelete(st, e)} className="text-red-500 hover:text-red-700 text-xs">Xóa</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards - Mobile */}
      <div className="md:hidden space-y-2">
        {filteredStocktakes.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm">Chưa có phiếu kiểm kê nào</div>
        ) : filteredStocktakes.map(st => (
          <div key={st.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:bg-amber-50 cursor-pointer" onClick={() => openDetail(st)}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-amber-700 font-medium">{st.stocktake_code}</span>
                  {getStatusBadge(st.status)}
                </div>
                <div className="text-sm text-gray-700 mt-1">{getWarehouseName(st.warehouse_id)}</div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>{formatDate(st.created_at)}</span>
                  <span>{st.total_items || 0} SP</span>
                  {st.created_by && <span>{st.created_by}</span>}
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                {getListDiffText(st)}
                {canEdit('warehouse') && (st.status === 'draft' || st.status === 'cancelled') && (
                  <button onClick={e => handleDelete(st, e)} className="text-red-400 text-xs hover:text-red-600">Xóa</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Create Modal ═══ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-800">Tạo phiếu kiểm kê</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Chọn kho */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kho hàng <span className="text-red-500">*</span></label>
                <select value={selectedWarehouseId} onChange={e => { setSelectedWarehouseId(e.target.value); setSelectedProductIds(new Set()); setSelectedCategories(new Set()); setCreateSearchTerm(''); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                  <option value="">-- Chọn kho hàng --</option>
                  {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
                </select>
              </div>

              {/* Chọn SP mode */}
              {selectedWarehouseId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Chọn sản phẩm kiểm kê <span className="text-red-500">*</span></label>
                  <div className="space-y-2">
                    {[
                      { value: 'all', label: 'Tất cả sản phẩm trong kho', desc: `${createWarehouseProducts.length} sản phẩm` },
                      { value: 'specific', label: 'Chọn sản phẩm cụ thể', desc: 'Chọn từng SP' },
                      { value: 'category', label: 'Theo danh mục', desc: `${createCategories.length} danh mục` }
                    ].map(opt => (
                      <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectMode === opt.value ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-amber-200 hover:bg-amber-50/50'
                      }`}>
                        <input type="radio" name="selectMode" value={opt.value} checked={selectMode === opt.value}
                          onChange={() => { setSelectMode(opt.value); setSelectedProductIds(new Set()); setSelectedCategories(new Set()); setCreateSearchTerm(''); }}
                          className="mt-0.5 text-amber-600 focus:ring-amber-500" />
                        <div>
                          <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                          <div className="text-xs text-gray-500">{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Chọn SP cụ thể */}
              {selectedWarehouseId && selectMode === 'specific' && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Search */}
                  <div className="p-2 border-b bg-gray-50">
                    <div className="relative">
                      <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input type="text" placeholder="Tìm sản phẩm..." value={createSearchTerm} onChange={e => setCreateSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
                    </div>
                  </div>

                  {/* Select all */}
                  <label className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50 cursor-pointer hover:bg-gray-100 text-sm">
                    <input type="checkbox"
                      checked={createWarehouseProducts.length > 0 && selectedProductIds.size === createWarehouseProducts.length}
                      onChange={e => {
                        if (e.target.checked) setSelectedProductIds(new Set(createWarehouseProducts.map(p => p.id)));
                        else setSelectedProductIds(new Set());
                      }}
                      className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                    <span className="font-medium text-gray-700">Chọn tất cả ({createWarehouseProducts.length} SP)</span>
                  </label>

                  {/* Product list */}
                  <div className="max-h-[200px] overflow-y-auto divide-y divide-gray-100">
                    {filteredCreateProducts.length === 0 ? (
                      <div className="text-center py-4 text-gray-400 text-sm">Không tìm thấy sản phẩm</div>
                    ) : filteredCreateProducts.map(p => (
                      <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-amber-50 cursor-pointer">
                        <input type="checkbox"
                          checked={selectedProductIds.has(p.id)}
                          onChange={e => {
                            const next = new Set(selectedProductIds);
                            if (e.target.checked) next.add(p.id); else next.delete(p.id);
                            setSelectedProductIds(next);
                          }}
                          className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-800 truncate">{p.name}</div>
                          {p.sku && <div className="text-xs text-gray-400 font-mono">{p.sku}</div>}
                        </div>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${p.whQty > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          Tồn: {p.whQty}
                        </span>
                      </label>
                    ))}
                  </div>

                  {/* Selected count */}
                  <div className="px-3 py-2 border-t bg-gray-50 text-sm">
                    Đã chọn: <strong className="text-amber-700">{selectedProductIds.size}</strong> sản phẩm
                  </div>
                </div>
              )}

              {/* Chọn theo danh mục */}
              {selectedWarehouseId && selectMode === 'category' && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-[250px] overflow-y-auto divide-y divide-gray-100">
                    {createCategories.length === 0 ? (
                      <div className="text-center py-4 text-gray-400 text-sm">Không có danh mục nào</div>
                    ) : createCategories.map(([cat, prods]) => (
                      <label key={cat} className="flex items-center gap-2 px-3 py-2.5 hover:bg-amber-50 cursor-pointer">
                        <input type="checkbox"
                          checked={selectedCategories.has(cat)}
                          onChange={e => {
                            const next = new Set(selectedCategories);
                            if (e.target.checked) next.add(cat); else next.delete(cat);
                            setSelectedCategories(next);
                          }}
                          className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800">{cat}</span>
                        </div>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{prods.length} SP</span>
                      </label>
                    ))}
                  </div>

                  {/* Selected count */}
                  <div className="px-3 py-2 border-t bg-gray-50 text-sm">
                    Đã chọn: <strong className="text-amber-700">{selectedCategories.size}</strong> danh mục ({createSelectedCount} SP)
                  </div>
                </div>
              )}

              {/* Ghi chú */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea value={formNote} onChange={e => setFormNote(e.target.value)} rows={2}
                  placeholder="Ghi chú cho phiếu kiểm kê..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none text-sm" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-5 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
              <div className="text-sm text-gray-500">
                {selectedWarehouseId && (
                  <span>Sẽ tạo: <strong className="text-amber-700">{createSelectedCount}</strong> SP</span>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm">Đóng</button>
                <button onClick={handleCreate}
                  disabled={creating || !selectedWarehouseId || createSelectedCount === 0}
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-medium disabled:opacity-50 flex items-center gap-2 text-sm">
                  {creating && <Spinner small />}
                  {creating ? 'Đang tạo...' : 'Tạo phiếu kiểm kê'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Detail Modal ═══ */}
      {showDetailModal && selectedStocktake && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-1 md:p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[98vh] md:max-h-[95vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between p-3 md:p-5 border-b flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-base md:text-lg font-bold text-gray-800 flex flex-wrap items-center gap-2">
                  <span>{selectedStocktake.stocktake_code}</span>
                  {getStatusBadge(selectedStocktake.status)}
                </h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs md:text-sm text-gray-500">
                  <span>Kho: <strong className="text-gray-700">{getWarehouseName(selectedStocktake.warehouse_id)}</strong></span>
                  <span>Ngày: <strong className="text-gray-700">{formatDate(selectedStocktake.created_at)}</strong></span>
                  <span>Người tạo: <strong className="text-gray-700">{selectedStocktake.created_by || ''}</strong></span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                {/* Print buttons */}
                <div className="relative group">
                  <button onClick={() => handlePrint(false)} className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50" title="In phiếu">
                    In
                  </button>
                </div>
                {stocktakeItems.some(i => i.actual_qty != null && i.actual_qty !== i.system_qty) && (
                  <button onClick={() => handlePrint(true)} className="px-2.5 py-1.5 text-xs border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50" title="In chênh lệch">
                    In CL
                  </button>
                )}
                <button onClick={() => { setShowDetailModal(false); setSelectedStocktake(null); setStocktakeItems([]); }}
                  className="text-gray-400 hover:text-gray-600 p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-1.5 md:gap-3 px-3 md:px-5 py-2 bg-gray-50 border-b flex-shrink-0 text-xs">
              <span className="text-gray-600">Tổng SP: <strong>{itemSummary.total}</strong></span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">Đã kiểm: <strong>{itemSummary.countedCount}</strong></span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">Chưa kiểm: <strong>{itemSummary.notCounted}</strong></span>
              <span className="text-gray-400">|</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                Khớp: {itemSummary.matched}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                Thừa: {itemSummary.overCount} {itemSummary.overTotal > 0 ? `(+${itemSummary.overTotal})` : ''}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                Thiếu: {itemSummary.underCount} {itemSummary.underTotal < 0 ? `(${itemSummary.underTotal})` : ''}
              </span>
            </div>

            {/* Filters & barcode */}
            <div className="flex flex-wrap items-center gap-2 px-3 md:px-5 py-2 border-b flex-shrink-0">
              {/* Barcode scan input */}
              {selectedStocktake.status === 'in_progress' && (
                <div className="relative min-w-[120px]">
                  <input ref={barcodeFieldRef} type="text" placeholder="Quét mã SP..."
                    value={barcodeInput}
                    onChange={e => setBarcodeInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && barcodeInput.trim()) {
                        handleBarcodeScan(barcodeInput);
                        setBarcodeInput('');
                      }
                    }}
                    className="w-full pl-7 pr-2 py-1.5 text-sm border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-amber-50"
                  />
                  <svg className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
              )}

              {/* Search */}
              <div className="relative flex-1 min-w-[120px]">
                <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" placeholder="Tìm SP..." value={itemSearchTerm} onChange={e => setItemSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
              </div>

              {/* Status filter */}
              <select value={itemFilter} onChange={e => setItemFilter(e.target.value)}
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500">
                <option value="all">Tất cả ({itemSummary.total})</option>
                <option value="unchecked">Chưa kiểm ({itemSummary.notCounted})</option>
                <option value="checked">Đã kiểm ({itemSummary.countedCount})</option>
                <option value="diff">Chênh lệch ({itemSummary.overCount + itemSummary.underCount})</option>
                <option value="over">Thừa ({itemSummary.overCount})</option>
                <option value="under">Thiếu ({itemSummary.underCount})</option>
              </select>

              {/* Category filter */}
              {itemCategories.length > 1 && (
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500">
                  <option value="all">Tất cả danh mục</option>
                  {itemCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              )}

              {/* Quick actions */}
              {selectedStocktake.status === 'in_progress' && (
                <button onClick={handleSetAllMatch}
                  className="px-2.5 py-1.5 text-xs border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 whitespace-nowrap font-medium">
                  Đặt tất cả = Tồn HT
                </button>
              )}
            </div>

            {/* Items table */}
            <div className="flex-1 overflow-y-auto">
              {loadingItems ? (
                <div className="flex items-center justify-center py-20">
                  <Spinner />
                  <span className="ml-2 text-gray-500">Đang tải...</span>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <table className="hidden md:table w-full text-sm">
                    <thead className="bg-gray-50 border-b sticky top-0 z-10">
                      <tr>
                        <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-10">#</th>
                        <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-24">Mã SP</th>
                        <th className="text-left px-3 py-2.5 font-medium text-gray-600">Tên sản phẩm</th>
                        <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-16">Tồn HT</th>
                        <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-28">Thực tế</th>
                        <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-28">Chênh lệch</th>
                        <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-36">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredItems.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-8 text-gray-400">Không tìm thấy sản phẩm</td></tr>
                      ) : filteredItems.map((item, idx) => {
                        const hasActual = item.actual_qty !== null && item.actual_qty !== undefined;
                        const diff = hasActual ? item.actual_qty - item.system_qty : null;

                        return (
                          <tr key={item.id} className={`hover:bg-gray-50 ${
                            diff === null ? '' : diff === 0 ? '' : diff > 0 ? 'bg-blue-50/50' : 'bg-red-50/50'
                          }`}>
                            <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono text-xs">{item.product_sku || '-'}</td>
                            <td className="px-3 py-2 text-gray-800 font-medium text-sm">
                              {item.product_name}
                              {productMap[item.product_id]?.category && (
                                <span className="ml-1.5 text-[10px] text-gray-400 bg-gray-100 px-1 py-0.5 rounded">{productMap[item.product_id].category}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-gray-700 font-medium">{item.system_qty}</td>
                            <td className="px-3 py-2 text-center">
                              {selectedStocktake.status === 'in_progress' ? (
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number" min="0" step="1"
                                    value={hasActual ? item.actual_qty : ''}
                                    placeholder="..."
                                    onChange={e => {
                                      const val = e.target.value;
                                      if (val === '') { handleLocalUpdate(item.id, 'actual_qty', null); }
                                      else { const num = parseInt(val, 10); if (!isNaN(num) && num >= 0) handleLocalUpdate(item.id, 'actual_qty', num); }
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' || e.key === 'Tab') {
                                        if (e.key === 'Enter') e.preventDefault();
                                        const next = e.target.closest('tr')?.nextElementSibling?.querySelector('input[type="number"]');
                                        if (next) next.focus();
                                      }
                                    }}
                                    className="w-16 text-center border border-gray-300 rounded px-1.5 py-1 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                                  />
                                  <button
                                    onClick={() => handleLocalUpdate(item.id, 'actual_qty', (item.actual_qty || 0) + 1)}
                                    className="px-1.5 py-1 bg-amber-100 text-amber-700 rounded text-xs font-bold hover:bg-amber-200 flex-shrink-0"
                                    title="Cộng 1"
                                  >+1</button>
                                </div>
                              ) : (
                                <span className={hasActual ? 'text-gray-800 font-medium' : 'text-gray-300'}>{hasActual ? item.actual_qty : '-'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-sm"><DiffCell item={item} /></td>
                            <td className="px-3 py-2">
                              {selectedStocktake.status === 'in_progress' ? (
                                <input type="text" value={item.note || ''} placeholder="Ghi chú..."
                                  onChange={e => handleLocalUpdate(item.id, 'note', e.target.value)}
                                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500" />
                              ) : (
                                <span className="text-xs text-gray-500">{item.note || ''}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-gray-100">
                    {filteredItems.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">Không tìm thấy sản phẩm</div>
                    ) : filteredItems.map((item) => {
                      const hasActual = item.actual_qty !== null && item.actual_qty !== undefined;
                      const diff = hasActual ? item.actual_qty - item.system_qty : null;
                      return (
                        <div key={item.id} className={`px-3 py-3 ${diff === null ? '' : diff > 0 ? 'bg-blue-50/50' : diff < 0 ? 'bg-red-50/50' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-gray-400 font-mono">{item.product_sku || '-'}</div>
                              <div className="text-sm font-medium text-gray-800">{item.product_name}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <DiffCell item={item} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Tồn HT: <strong>{item.system_qty}</strong></span>
                            {selectedStocktake.status === 'in_progress' ? (
                              <>
                                <input type="number" min="0" step="1"
                                  value={hasActual ? item.actual_qty : ''} placeholder="SL..."
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === '') handleLocalUpdate(item.id, 'actual_qty', null);
                                    else { const num = parseInt(val, 10); if (!isNaN(num) && num >= 0) handleLocalUpdate(item.id, 'actual_qty', num); }
                                  }}
                                  className="w-16 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-amber-500" />
                                <button onClick={() => handleLocalUpdate(item.id, 'actual_qty', (item.actual_qty || 0) + 1)}
                                  className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-bold hover:bg-amber-200">+1</button>
                                <input type="text" value={item.note || ''} placeholder="Ghi chú..."
                                  onChange={e => handleLocalUpdate(item.id, 'note', e.target.value)}
                                  className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs" />
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-gray-700">Thực tế: <strong>{hasActual ? item.actual_qty : '-'}</strong></span>
                                {item.note && <span className="text-xs text-gray-400 truncate">{item.note}</span>}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Diff summary footer */}
            {!loadingItems && stocktakeItems.length > 0 && (
              <div className="px-3 md:px-5 py-2 border-t bg-gray-50 flex-shrink-0 text-xs flex flex-wrap gap-x-4 gap-y-1 text-gray-600">
                {itemSummary.overCount > 0 && (
                  <span className="text-blue-600">{'\uD83D\uDFE2'} Thừa: {itemSummary.overCount} SP (tổng +{itemSummary.overTotal})</span>
                )}
                {itemSummary.underCount > 0 && (
                  <span className="text-red-600">{'\uD83D\uDD34'} Thiếu: {itemSummary.underCount} SP (tổng {itemSummary.underTotal})</span>
                )}
                {itemSummary.matched > 0 && (
                  <span className="text-green-600">{'\u2705'} Khớp: {itemSummary.matched} SP</span>
                )}
                {itemSummary.notCounted > 0 && (
                  <span className="text-gray-400">{'\u2B1C'} Chưa kiểm: {itemSummary.notCounted} SP</span>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-between p-3 md:p-5 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
              <button
                onClick={() => { setShowDetailModal(false); setSelectedStocktake(null); setStocktakeItems([]); }}
                className="px-3 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
              >
                Đóng
              </button>

              {selectedStocktake.status === 'draft' && (
                <div className="flex flex-wrap gap-2">
                  {canEdit('warehouse') && (
                    <button onClick={handleCancel}
                      className="px-3 py-2 border border-red-300 text-red-600 rounded-xl hover:bg-red-50 font-medium text-sm">
                      Hủy phiếu
                    </button>
                  )}
                  <button onClick={handleStartAudit}
                    className="px-3 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-medium text-sm shadow-sm flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M12 2a10 10 0 110 20 10 10 0 010-20z" />
                    </svg>
                    Bắt đầu kiểm kê
                  </button>
                </div>
              )}

              {selectedStocktake.status === 'in_progress' && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleSaveAll(false)} disabled={saving}
                    className="px-3 py-2 border border-amber-300 text-amber-700 rounded-xl hover:bg-amber-50 font-medium text-sm disabled:opacity-50 flex items-center gap-1">
                    {saving && <Spinner small />}
                    Lưu tạm
                  </button>
                  {canEdit('warehouse') && (
                    <button onClick={handleCancel}
                      className="px-3 py-2 border border-red-300 text-red-600 rounded-xl hover:bg-red-50 font-medium text-sm">
                      Hủy phiếu
                    </button>
                  )}
                  {canEdit('warehouse') && (
                    <button onClick={() => { setTreatUncheckedAsMatch(false); setShowConfirmComplete(true); }}
                      className="px-3 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium text-sm shadow-sm flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Cân bằng kho
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Confirm Complete Modal ═══ */}
      {showConfirmComplete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Xác nhận hoàn thành kiểm kê?</h3>

              {itemSummary.notCounted > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-yellow-800 font-medium">
                    Còn {itemSummary.notCounted} sản phẩm chưa kiểm
                  </p>
                  <label className="flex items-center gap-2 mt-2 text-sm text-yellow-700 cursor-pointer">
                    <input type="checkbox" checked={treatUncheckedAsMatch} onChange={e => setTreatUncheckedAsMatch(e.target.checked)}
                      className="rounded border-yellow-400 text-amber-600 focus:ring-amber-500" />
                    Coi SP chưa kiểm = khớp với hệ thống
                  </label>
                </div>
              )}

              <div className="space-y-2 text-sm mb-4">
                <p className="text-gray-600 font-medium">Hệ thống sẽ điều chỉnh tồn kho:</p>
                {itemSummary.overCount > 0 && (
                  <p className="text-blue-700 flex items-center gap-1">{'\uD83D\uDFE2'} Tăng tồn: {itemSummary.overCount} SP (tổng +{itemSummary.overTotal})</p>
                )}
                {itemSummary.underCount > 0 && (
                  <p className="text-red-700 flex items-center gap-1">{'\uD83D\uDD34'} Giảm tồn: {itemSummary.underCount} SP (tổng {itemSummary.underTotal})</p>
                )}
                {itemSummary.matched > 0 && (
                  <p className="text-green-700 flex items-center gap-1">{'\u2705'} Giữ nguyên: {itemSummary.matched} SP</p>
                )}
              </div>

              <p className="text-xs text-red-500 font-medium bg-red-50 p-2 rounded">Hành động này KHÔNG THỂ hoàn tác.</p>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowConfirmComplete(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm">
                Hủy
              </button>
              <button onClick={handleComplete} disabled={completing}
                className="px-5 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium text-sm disabled:opacity-50 flex items-center gap-2">
                {completing && <Spinner small />}
                {completing ? 'Đang xử lý...' : 'Xác nhận điều chỉnh tồn kho'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Spinner component
function Spinner({ small }) {
  const size = small ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <svg className={`${size} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

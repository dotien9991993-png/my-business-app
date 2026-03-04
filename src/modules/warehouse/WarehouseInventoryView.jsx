import React, { useState, useMemo, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import { getNowISOVN, getTodayVN, formatDateTimeVN } from '../../utils/dateUtils';
import { warehouseCategories, warehouseUnits } from '../../constants/warehouseConstants';
import { logActivity } from '../../lib/activityLog';
import { uploadImage, getThumbnailUrl } from '../../utils/cloudinaryUpload';
import JsBarcode from 'jsbarcode';

export default function WarehouseInventoryView({ products, warehouses, warehouseStock, loadWarehouseData, tenant, currentUser, dynamicCategories, dynamicUnits, comboItems, productVariants, orders, suppliers, hasPermission, canEdit, getPermissionLevel }) {
  const { pendingOpenRecord, setPendingOpenRecord } = useApp();
  const permLevel = getPermissionLevel('warehouse');
  const effectiveCategories = dynamicCategories || warehouseCategories;
  const effectiveUnits = dynamicUnits || warehouseUnits;
  const [viewMode, setViewMode] = useState('table');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [committedQtyMap, setCommittedQtyMap] = useState({});

  // Load committed qty from pending orders
  useEffect(() => {
    if (!tenant?.id) return;
    const pendingOrderIds = (orders || []).filter(o => {
      const os = o.order_status || o.status;
      const ss = o.shipping_status || 'pending';
      // Đơn còn open/confirmed VÀ chưa giao = tồn cam kết
      return ['open', 'confirmed', 'new'].includes(os) && ['pending', 'packing', 'shipped', 'in_transit'].includes(ss);
    }).map(o => o.id);
    if (pendingOrderIds.length === 0) { setCommittedQtyMap({}); return; }
    (async () => {
      const { data } = await supabase.from('order_items').select('product_id, quantity').in('order_id', pendingOrderIds);
      if (!data) return;
      const map = {};
      data.forEach(item => { map[item.product_id] = (map[item.product_id] || 0) + item.quantity; });
      setCommittedQtyMap(map);
    })();
  }, [tenant?.id, orders]);

  const getCommittedQty = (productId) => committedQtyMap[productId] || 0;

  const getUnavailableQty = (productId) => {
    if (filterWarehouse) {
      const ws = (warehouseStock || []).find(s => s.warehouse_id === filterWarehouse && s.product_id === productId);
      return ws?.unavailable_quantity || 0;
    }
    return (warehouseStock || []).filter(s => s.product_id === productId).reduce((sum, s) => sum + (s.unavailable_quantity || 0), 0);
  };

  const getAvailableStock = (product) => Math.max(0, getEffectiveStock(product) - getCommittedQty(product.id) - getUnavailableQty(product.id));

  // Get stock quantity for a product at a specific warehouse
  const getWarehouseQty = (productId, warehouseId) => {
    const ws = (warehouseStock || []).find(s => s.warehouse_id === warehouseId && s.product_id === productId);
    return ws ? ws.quantity : 0;
  };

  // Get effective stock quantity (warehouse-specific or total, combo = calculated)
  const getEffectiveStock = (product) => {
    if (product.is_combo) return getComboStockDirect(product.id);
    if (filterWarehouse) return getWarehouseQty(product.id, filterWarehouse);
    return product.stock_quantity;
  };

  // Direct combo stock calc (avoids circular dependency with getEffectiveStock)
  const getComboStockDirect = (productId) => {
    const items = (comboItems || []).filter(ci => ci.combo_product_id === productId);
    if (items.length === 0) return 0;
    return Math.min(...items.map(ci => {
      const child = products.find(p => p.id === ci.child_product_id);
      if (!child) return 0;
      const childStock = filterWarehouse ? getWarehouseQty(child.id, filterWarehouse) : (child.stock_quantity || 0);
      return Math.floor(childStock / ci.quantity);
    }));
  };

  // Get warehouse stock breakdown for a product
  const getWarehouseBreakdown = (productId) => {
    return (warehouses || []).filter(w => w.is_active).map(w => ({
      ...w,
      quantity: getWarehouseQty(productId, w.id)
    })).filter(w => w.quantity > 0);
  };

  // Form states
  const [formSku, setFormSku] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formUnit, setFormUnit] = useState('Cái');
  const [formImportPrice, setFormImportPrice] = useState('');
  const [formSellPrice, setFormSellPrice] = useState('');
  const [formMinStock, setFormMinStock] = useState('5');
  const [formMaxStock, setFormMaxStock] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formWarranty, setFormWarranty] = useState('');
  const [formHasSerial, setFormHasSerial] = useState(false);
  const [formIsCombo, setFormIsCombo] = useState(false);
  const [formComboItems, setFormComboItems] = useState([]);
  const [comboChildSearch, setComboChildSearch] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formSupplierId, setFormSupplierId] = useState('');
  // Variant states
  const [formHasVariants, setFormHasVariants] = useState(false);
  const [formVariantOptions, setFormVariantOptions] = useState([]); // [{ name: 'Màu', values: ['Đỏ','Xanh'] }]
  const [formVariants, setFormVariants] = useState([]); // [{ variant_name, attributes, sku, price, cost_price, barcode }]
  const imageInputRef = useRef(null);

  // Adjust stock states
  const [adjustType, setAdjustType] = useState('add');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // Unavailable stock states
  const [showUnavailableModal, setShowUnavailableModal] = useState(false);
  const [unavailableProduct, setUnavailableProduct] = useState(null);
  const [unavailableAction, setUnavailableAction] = useState('lock');
  const [unavailableReason, setUnavailableReason] = useState('demo');
  const [unavailableQty, setUnavailableQty] = useState('');
  const [unavailableNote, setUnavailableNote] = useState('');
  const [unavailableWarehouseId, setUnavailableWarehouseId] = useState('');
  const [savingUnavailable, setSavingUnavailable] = useState(false);

  const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  const formatNumber = (num) => new Intl.NumberFormat('vi-VN').format(num || 0);

  const resetForm = () => {
    setFormSku(''); setFormBarcode(''); setFormName(''); setFormCategory('');
    setFormUnit('Cái'); setFormImportPrice(''); setFormSellPrice('');
    setFormMinStock('5'); setFormMaxStock(''); setFormLocation('');
    setFormDescription(''); setFormBrand(''); setFormWarranty(''); setFormHasSerial(false);
    setFormIsCombo(false); setFormComboItems([]); setComboChildSearch('');
    setFormImageUrl(''); setFormSupplierId('');
    setFormHasVariants(false); setFormVariantOptions([]); setFormVariants([]);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const result = await uploadImage(file, 'products');
      setFormImageUrl(result.url);
    } catch (err) {
      alert('Lỗi upload ảnh: ' + err.message);
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // Tính tồn kho combo = MIN(tồn SP con / qty trong combo)
  const getComboStock = (productId) => {
    const items = (comboItems || []).filter(ci => ci.combo_product_id === productId);
    if (items.length === 0) return 0;
    return Math.min(...items.map(ci => {
      const child = products.find(p => p.id === ci.child_product_id);
      const childStock = child ? getEffectiveStock(child) : 0;
      return Math.floor(childStock / ci.quantity);
    }));
  };

  // Tính tồn combo từ formComboItems (khi đang chỉnh sửa form)
  const getFormComboStock = () => {
    if (formComboItems.length === 0) return 0;
    return Math.min(...formComboItems.map(ci => {
      const child = products.find(p => p.id === ci.product_id);
      const childStock = child ? getEffectiveStock(child) : 0;
      return Math.floor(childStock / (ci.quantity || 1));
    }));
  };

  // Generate variants from options (Cartesian product)
  const generateVariantsFromOptions = (options, baseSku, basePrice, baseCost) => {
    if (!options || options.length === 0) return [];
    const validOptions = options.filter(o => o.name && o.values && o.values.length > 0);
    if (validOptions.length === 0) return [];
    // Cartesian product
    const combos = validOptions.reduce((acc, opt) => {
      if (acc.length === 0) return opt.values.map(v => [{ name: opt.name, value: v }]);
      const result = [];
      acc.forEach(combo => {
        opt.values.forEach(v => {
          result.push([...combo, { name: opt.name, value: v }]);
        });
      });
      return result;
    }, []);
    return combos.map((combo, idx) => {
      const variant_name = combo.map(c => c.value).join(' / ');
      const attributes = {};
      combo.forEach(c => { attributes[c.name] = c.value; });
      const skuSuffix = combo.map(c => c.value.replace(/\s+/g, '').slice(0, 3).toUpperCase()).join('-');
      return {
        variant_name,
        attributes,
        sku: baseSku ? `${baseSku}-${skuSuffix}` : skuSuffix,
        price: parseFloat(basePrice) || 0,
        cost_price: parseFloat(baseCost) || 0,
        barcode: '',
        sort_order: idx,
      };
    });
  };

  // Get variant count for a product
  const getVariantCount = (productId) => (productVariants || []).filter(v => v.product_id === productId).length;

  // SP con có thể chọn (không phải combo, active, chưa được chọn)
  const comboChildOptions = useMemo(() => {
    const selectedIds = new Set(formComboItems.map(i => i.product_id));
    let list = (products || []).filter(p => !p.is_combo && p.is_active !== false && !selectedIds.has(p.id));
    if (comboChildSearch.trim()) {
      const q = comboChildSearch.toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
    }
    return list.slice(0, 10);
  }, [products, formComboItems, comboChildSearch]);

  const generateSku = () => 'SP' + Date.now().toString().slice(-6);
  const generateBarcode = () => 'HNA' + Date.now().toString().slice(-8).toUpperCase();

  // Avg cost helper: use avg_cost if set, fallback to import_price
  const avgCost = (p) => (p.avg_cost > 0 ? p.avg_cost : (p.import_price || 0));

  // Stats
  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalValue = products.reduce((sum, p) => sum + (getEffectiveStock(p) * avgCost(p)), 0);
    const totalSellValue = products.reduce((sum, p) => sum + (getEffectiveStock(p) * (p.sell_price || 0)), 0);
    const lowStock = products.filter(p => getEffectiveStock(p) > 0 && getEffectiveStock(p) <= (p.min_stock || 5)).length;
    const outOfStock = products.filter(p => getEffectiveStock(p) === 0).length;
    const totalUnits = products.reduce((sum, p) => sum + (getEffectiveStock(p) || 0), 0);
    return { totalProducts, totalValue, totalSellValue, lowStock, outOfStock, totalUnits, potentialProfit: totalSellValue - totalValue };
  }, [products, filterWarehouse, warehouseStock]);

  // Filter and sort
  const filteredProducts = useMemo(() => {
    let result = products.filter(p => {
      const stock = getEffectiveStock(p);
      const matchSearch = !searchTerm ||
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = !filterCategory || p.category === filterCategory;
      const matchStock = !filterStock ||
        (filterStock === 'low' && stock <= (p.min_stock || 5) && stock > 0) ||
        (filterStock === 'out' && stock === 0) ||
        (filterStock === 'normal' && stock > (p.min_stock || 5)) ||
        (filterStock === 'low_alert' && stock > 0 && stock <= (p.min_stock || 5));
      return matchSearch && matchCategory && matchStock;
    });
    result.sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'stock_quantity') {
        aVal = getEffectiveStock(a);
        bVal = getEffectiveStock(b);
      } else if (['import_price', 'sell_price'].includes(sortBy)) {
        aVal = Number(a[sortBy]) || 0;
        bVal = Number(b[sortBy]) || 0;
      } else {
        aVal = a[sortBy] || '';
        bVal = b[sortBy] || '';
      }
      return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    return result;
  }, [products, searchTerm, filterCategory, filterStock, filterWarehouse, warehouseStock, sortBy, sortOrder]);

  const handleCreateProduct = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Bạn không có quyền thêm sản phẩm'); return; }
    if (!formName) { alert('Vui lòng nhập tên sản phẩm!'); return; }
    if (formIsCombo && formComboItems.length === 0) { alert('Vui lòng thêm ít nhất 1 sản phẩm con cho combo!'); return; }
    if (formHasVariants && formVariants.length === 0) { alert('Vui lòng tạo ít nhất 1 biến thể!'); return; }
    try {
      const { data: newProd, error } = await supabase.from('products').insert([{
        tenant_id: tenant.id, sku: formSku || generateSku(), barcode: formBarcode || generateBarcode(),
        name: formName, category: formCategory, unit: formUnit,
        import_price: parseFloat(formImportPrice) || 0, sell_price: parseFloat(formSellPrice) || 0,
        stock_quantity: 0, min_stock: parseInt(formMinStock) || 5,
        max_stock: formMaxStock ? parseInt(formMaxStock) : null,
        location: formLocation, description: formDescription,
        brand: formBrand, warranty_months: formWarranty ? parseInt(formWarranty) : null,
        has_serial: (formIsCombo || formHasVariants) ? false : formHasSerial,
        is_combo: formIsCombo,
        has_variants: formHasVariants,
        variant_options: formHasVariants ? formVariantOptions : [],
        image_url: formImageUrl || null,
        supplier_id: formSupplierId || null,
        created_by: currentUser.name
      }]).select().single();
      if (error) throw error;
      // Lưu biến thể
      if (formHasVariants && formVariants.length > 0 && newProd) {
        const variantRows = formVariants.map((v, idx) => ({
          tenant_id: tenant.id, product_id: newProd.id,
          variant_name: v.variant_name, attributes: v.attributes,
          sku: v.sku || null, price: parseFloat(v.price) || 0,
          cost_price: parseFloat(v.cost_price) || 0, barcode: v.barcode || null,
          sort_order: idx
        }));
        await supabase.from('product_variants').insert(variantRows);
      }
      // Lưu SP con cho combo
      if (formIsCombo && formComboItems.length > 0 && newProd) {
        const rows = formComboItems.map(ci => ({
          tenant_id: tenant.id, combo_product_id: newProd.id,
          child_product_id: ci.product_id, quantity: ci.quantity || 1
        }));
        await supabase.from('product_combo_items').insert(rows);
      }
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'create', entityType: 'product', entityId: newProd?.id, entityName: formName, description: 'Thêm sản phẩm: ' + formName });
      alert('✅ Thêm sản phẩm thành công!');
      setShowCreateModal(false); resetForm(); loadWarehouseData();
    } catch (error) { alert('❌ Lỗi: ' + error.message); }
  };

  const handleUpdateProduct = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Bạn không có quyền chỉnh sửa sản phẩm'); return; }
    if (!formName) { alert('Vui lòng nhập tên sản phẩm!'); return; }
    if (formIsCombo && formComboItems.length === 0) { alert('Vui lòng thêm ít nhất 1 sản phẩm con cho combo!'); return; }
    if (formHasVariants && formVariants.length === 0) { alert('Vui lòng tạo ít nhất 1 biến thể!'); return; }
    try {
      const { error } = await supabase.from('products').update({
        sku: formSku, barcode: formBarcode, name: formName, category: formCategory,
        unit: formUnit, import_price: parseFloat(formImportPrice) || 0,
        sell_price: parseFloat(formSellPrice) || 0, min_stock: parseInt(formMinStock) || 5,
        max_stock: formMaxStock ? parseInt(formMaxStock) : null,
        location: formLocation, description: formDescription,
        brand: formBrand, warranty_months: formWarranty ? parseInt(formWarranty) : null,
        has_serial: (formIsCombo || formHasVariants) ? false : formHasSerial,
        is_combo: formIsCombo,
        has_variants: formHasVariants,
        variant_options: formHasVariants ? formVariantOptions : [],
        image_url: formImageUrl || null,
        supplier_id: formSupplierId || null,
        updated_at: getNowISOVN()
      }).eq('id', selectedProduct.id);
      if (error) throw error;
      // Cập nhật SP con: xóa cũ, thêm mới
      await supabase.from('product_combo_items').delete().eq('combo_product_id', selectedProduct.id);
      if (formIsCombo && formComboItems.length > 0) {
        const rows = formComboItems.map(ci => ({
          tenant_id: tenant.id, combo_product_id: selectedProduct.id,
          child_product_id: ci.product_id, quantity: ci.quantity || 1
        }));
        await supabase.from('product_combo_items').insert(rows);
      }
      // Cập nhật biến thể: xóa cũ, thêm mới
      await supabase.from('product_variants').delete().eq('product_id', selectedProduct.id);
      if (formHasVariants && formVariants.length > 0) {
        const variantRows = formVariants.map((v, idx) => ({
          tenant_id: tenant.id, product_id: selectedProduct.id,
          variant_name: v.variant_name, attributes: v.attributes,
          sku: v.sku || null, price: parseFloat(v.price) || 0,
          cost_price: parseFloat(v.cost_price) || 0, barcode: v.barcode || null,
          sort_order: idx
        }));
        await supabase.from('product_variants').insert(variantRows);
      }
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'product', entityId: selectedProduct.id, entityName: formName, oldData: { name: selectedProduct.name, sku: selectedProduct.sku, import_price: selectedProduct.import_price, sell_price: selectedProduct.sell_price }, newData: { name: formName, sku: formSku, import_price: parseFloat(formImportPrice) || 0, sell_price: parseFloat(formSellPrice) || 0 }, description: 'Cập nhật sản phẩm: ' + formName });
      alert('✅ Cập nhật thành công!');
      setShowDetailModal(false); loadWarehouseData();
    } catch (error) { alert('❌ Lỗi: ' + error.message); }
  };

  const handleAdjustStock = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Bạn không có quyền điều chỉnh tồn kho'); return; }
    if (!adjustQuantity || parseInt(adjustQuantity) <= 0) { alert('Vui lòng nhập số lượng hợp lệ!'); return; }
    try {
      const qty = parseInt(adjustQuantity);
      const currentStock = getEffectiveStock(selectedProduct);
      let delta;
      if (adjustType === 'add') delta = qty;
      else if (adjustType === 'subtract') delta = -Math.min(qty, currentStock);
      else delta = qty - currentStock; // 'set'

      if (filterWarehouse) {
        // Adjust specific warehouse via RPC
        const { error: rpcError } = await supabase.rpc('adjust_warehouse_stock', {
          p_warehouse_id: filterWarehouse,
          p_product_id: selectedProduct.id,
          p_delta: delta
        });
        if (rpcError) throw rpcError;
      } else {
        // Adjust total (legacy behavior) - use default warehouse
        const defaultWh = (warehouses || []).find(w => w.is_default);
        if (defaultWh) {
          const { error: rpcError } = await supabase.rpc('adjust_warehouse_stock', {
            p_warehouse_id: defaultWh.id,
            p_product_id: selectedProduct.id,
            p_delta: delta
          });
          if (rpcError) throw rpcError;
        } else {
          // Fallback: direct update
          await supabase.from('products').update({
            stock_quantity: currentStock + delta, updated_at: getNowISOVN()
          }).eq('id', selectedProduct.id);
        }
      }

      const whName = filterWarehouse ? (warehouses || []).find(w => w.id === filterWarehouse)?.name : 'Tất cả kho';
      await supabase.from('stock_transactions').insert([{
        tenant_id: tenant.id, transaction_number: `ADJ-${Date.now()}`,
        type: delta < 0 ? 'export' : 'import',
        transaction_date: getTodayVN(),
        partner_name: 'Điều chỉnh tồn kho', total_amount: 0,
        note: `${adjustReason || 'Điều chỉnh'} - ${selectedProduct.name}: ${currentStock} → ${currentStock + delta} (${whName})`,
        status: 'completed', created_by: currentUser.name,
        warehouse_id: filterWarehouse || null
      }]);

      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'stock', entityId: selectedProduct.id, entityName: selectedProduct.name, oldData: { stock_quantity: currentStock }, newData: { stock_quantity: currentStock + delta }, description: `Điều chỉnh tồn kho ${selectedProduct.name}: ${currentStock} → ${currentStock + delta}` });
      alert('Điều chỉnh tồn kho thành công!');
      setShowAdjustModal(false); setAdjustQuantity(''); setAdjustReason(''); loadWarehouseData();
    } catch (error) { alert('Lỗi: ' + error.message); }
  };

  const openUnavailableModal = (product, e) => {
    if (e) e.stopPropagation();
    setUnavailableProduct(product);
    setUnavailableAction('lock');
    setUnavailableReason('demo');
    setUnavailableQty('');
    setUnavailableNote('');
    setUnavailableWarehouseId(filterWarehouse || (warehouses.length === 1 ? warehouses[0].id : ''));
    setShowUnavailableModal(true);
  };

  const handleUnavailable = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Không có quyền'); return; }
    if (!unavailableWarehouseId) { alert('Vui lòng chọn kho!'); return; }
    const qty = parseInt(unavailableQty);
    if (!qty || qty <= 0) { alert('Số lượng không hợp lệ!'); return; }
    const ws = (warehouseStock || []).find(s => s.warehouse_id === unavailableWarehouseId && s.product_id === unavailableProduct.id);
    if (unavailableAction === 'lock') {
      const available = (ws?.quantity || 0) - (ws?.unavailable_quantity || 0);
      if (qty > available) { alert(`Chỉ có ${available} SP khả dụng tại kho này!`); return; }
    } else {
      const currentUnavail = ws?.unavailable_quantity || 0;
      if (qty > currentUnavail) { alert(`Chỉ có ${currentUnavail} SP đang khóa tại kho này!`); return; }
    }
    setSavingUnavailable(true);
    try {
      const delta = unavailableAction === 'lock' ? qty : -qty;
      const { error } = await supabase.from('warehouse_stock')
        .update({ unavailable_quantity: (ws?.unavailable_quantity || 0) + delta })
        .eq('warehouse_id', unavailableWarehouseId).eq('product_id', unavailableProduct.id);
      if (error) throw error;
      await supabase.from('stock_unavailable_log').insert([{
        tenant_id: tenant.id, product_id: unavailableProduct.id, warehouse_id: unavailableWarehouseId,
        reason: unavailableReason, quantity: qty, action: unavailableAction,
        note: unavailableNote || null, created_by: currentUser.id
      }]);
      const reasonLabels = { demo: 'Demo', repair: 'Sửa chữa', hold: 'Giữ hàng', damaged: 'Hỏng' };
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'update', entityType: 'stock_unavailable', entityId: unavailableProduct.id, entityName: unavailableProduct.name, description: `${unavailableAction === 'lock' ? 'Khóa' : 'Mở khóa'} ${qty} ${unavailableProduct.name} - ${reasonLabels[unavailableReason]}` });
      alert(`${unavailableAction === 'lock' ? 'Khóa' : 'Mở khóa'} hàng thành công!`);
      setShowUnavailableModal(false);
      loadWarehouseData();
    } catch (error) { alert('Lỗi: ' + error.message); } finally { setSavingUnavailable(false); }
  };

  const handleDeleteProduct = async (id) => {
    if (!canEdit('warehouse')) { alert('Bạn không có quyền xóa sản phẩm'); return; }
    if (!window.confirm('Xóa sản phẩm này?')) return;
    try {
      const deletedProduct = products.find(p => p.id === id);
      await supabase.from('products').update({ is_active: false }).eq('id', id);
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'warehouse', action: 'delete', entityType: 'product', entityId: id, entityName: deletedProduct?.name, description: 'Xóa sản phẩm: ' + (deletedProduct?.name || id) });
      alert('✅ Đã xóa!'); setShowDetailModal(false); loadWarehouseData();
    } catch (error) { alert('❌ Lỗi: ' + error.message); }
  };

  const openDetail = (product) => {
    setSelectedProduct(product);
    setFormSku(product.sku || ''); setFormBarcode(product.barcode || '');
    setFormName(product.name || ''); setFormCategory(product.category || '');
    setFormUnit(product.unit || 'Cái'); setFormImportPrice(product.import_price?.toString() || '');
    setFormSellPrice(product.sell_price?.toString() || ''); setFormMinStock(product.min_stock?.toString() || '5');
    setFormMaxStock(product.max_stock?.toString() || ''); setFormLocation(product.location || '');
    setFormDescription(product.description || ''); setFormBrand(product.brand || '');
    setFormWarranty(product.warranty_months?.toString() || '');
    setFormHasSerial(product.has_serial || false);
    setFormIsCombo(product.is_combo || false);
    setFormImageUrl(product.image_url || '');
    setFormSupplierId(product.supplier_id || '');
    // Load combo children
    const existingChildren = (comboItems || []).filter(ci => ci.combo_product_id === product.id);
    setFormComboItems(existingChildren.map(ci => {
      const child = products.find(p => p.id === ci.child_product_id);
      return { product_id: ci.child_product_id, product_name: child?.name || 'SP đã xóa', quantity: ci.quantity };
    }));
    setComboChildSearch('');
    // Load variants
    setFormHasVariants(product.has_variants || false);
    setFormVariantOptions(product.variant_options || []);
    const existingVariants = (productVariants || []).filter(v => v.product_id === product.id);
    setFormVariants(existingVariants.map(v => ({
      id: v.id, variant_name: v.variant_name, attributes: v.attributes || {},
      sku: v.sku || '', price: v.price || 0, cost_price: v.cost_price || 0, barcode: v.barcode || '',
      sort_order: v.sort_order || 0
    })));
    setShowDetailModal(true);
  };

  // Open product detail from chat attachment
  useEffect(() => {
    if (pendingOpenRecord?.type === 'product' && pendingOpenRecord.id) {
      const product = products.find(p => p.id === pendingOpenRecord.id);
      if (product) {
        openDetail(product);
      }
      setPendingOpenRecord(null);
    }
  }, [pendingOpenRecord]);

  const openAdjust = (product, e) => {
    e?.stopPropagation();
    if (product.is_combo) { alert('Sản phẩm combo không điều chỉnh tồn kho trực tiếp. Tồn kho tính từ SP con.'); return; }
    setSelectedProduct(product);
    setAdjustType('add'); setAdjustQuantity(''); setAdjustReason('');
    setShowAdjustModal(true);
  };

  const getStockStatus = (p) => {
    const stock = getEffectiveStock(p);
    if (stock === 0) return { label: 'Hết hàng', color: 'bg-red-100 text-red-700', icon: '❌' };
    if (stock <= (p.min_stock || 5)) return { label: 'Sắp hết', color: 'bg-yellow-100 text-yellow-700', icon: '⚠️' };
    if (p.max_stock && stock > p.max_stock) return { label: 'Vượt mức', color: 'bg-purple-100 text-purple-700', icon: '📈' };
    return { label: 'Còn hàng', color: 'bg-green-100 text-green-700', icon: '✅' };
  };

  const toggleSort = (field) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('asc'); }
  };

  // ===== Export products to Excel =====
  const [exporting, setExporting] = useState(false);

  const handleExportExcel = async () => {
    if (filteredProducts.length === 0) { alert('Không có sản phẩm nào để xuất!'); return; }
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const exportProducts = filteredProducts;

      // Sheet 1: Sản phẩm
      const spRows = exportProducts.map((p, idx) => {
        const supplier = (suppliers || []).find(s => s.id === p.supplier_id);
        return {
          'STT': idx + 1,
          'Mã SP': p.sku || '',
          'Barcode': p.barcode || '',
          'Tên sản phẩm': p.name || '',
          'Danh mục': p.category || '',
          'Đơn vị': p.unit || '',
          'Thương hiệu': p.brand || '',
          'Giá nhập': p.import_price || 0,
          'Giá bán': p.sell_price || 0,
          'Giá vốn TB': p.avg_cost || 0,
          'Tồn kho': p.stock_quantity || 0,
          'Tồn tối thiểu': p.min_stock || 0,
          'Tồn tối đa': p.max_stock || '',
          'Vị trí': p.location || '',
          'Nhà cung cấp': supplier?.name || '',
          'BH (tháng)': p.warranty_months || '',
          'Serial': p.has_serial ? 'Có' : 'Không',
          'Combo': p.is_combo ? 'Có' : 'Không',
          'Biến thể': p.has_variants ? 'Có' : 'Không',
          'Trạng thái': p.is_active === false ? 'Ngưng KD' : 'Đang KD',
          'Mô tả': p.description || '',
        };
      });
      const ws1 = XLSX.utils.json_to_sheet(spRows);
      // Auto column widths
      const colWidths1 = Object.keys(spRows[0] || {}).map(key => {
        const maxLen = Math.max(key.length, ...spRows.map(r => String(r[key] || '').length));
        return { wch: Math.min(maxLen + 2, 40) };
      });
      ws1['!cols'] = colWidths1;

      // Sheet 2: Biến thể
      const variantRows = [];
      exportProducts.filter(p => p.has_variants).forEach(p => {
        const variants = (productVariants || []).filter(v => v.product_id === p.id);
        variants.forEach(v => {
          variantRows.push({
            'Mã SP gốc': p.sku || '',
            'Tên SP gốc': p.name || '',
            'Tên biến thể': v.variant_name || '',
            'Mã biến thể': v.sku || '',
            'Barcode': v.barcode || '',
            'Giá bán': v.price || 0,
            'Giá vốn': v.cost_price || 0,
            'Thuộc tính': v.attributes ? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(', ') : '',
          });
        });
      });
      const ws2 = XLSX.utils.json_to_sheet(variantRows.length > 0 ? variantRows : [{ 'Thông báo': 'Không có biến thể nào' }]);
      if (variantRows.length > 0) {
        const colWidths2 = Object.keys(variantRows[0]).map(key => {
          const maxLen = Math.max(key.length, ...variantRows.map(r => String(r[key] || '').length));
          return { wch: Math.min(maxLen + 2, 40) };
        });
        ws2['!cols'] = colWidths2;
      }

      // Sheet 3: Tồn kho theo kho
      const whRows = [];
      const activeWarehouses = (warehouses || []).filter(w => w.is_active);
      if (activeWarehouses.length > 0) {
        exportProducts.forEach(p => {
          activeWarehouses.forEach(w => {
            const qty = getWarehouseQty(p.id, w.id);
            if (qty > 0) {
              whRows.push({
                'Mã SP': p.sku || '',
                'Tên sản phẩm': p.name || '',
                'Kho': w.name || '',
                'Tồn kho': qty,
              });
            }
          });
        });
      }
      const ws3 = XLSX.utils.json_to_sheet(whRows.length > 0 ? whRows : [{ 'Thông báo': 'Không có dữ liệu tồn kho theo kho' }]);
      if (whRows.length > 0) {
        const colWidths3 = Object.keys(whRows[0]).map(key => {
          const maxLen = Math.max(key.length, ...whRows.map(r => String(r[key] || '').length));
          return { wch: Math.min(maxLen + 2, 40) };
        });
        ws3['!cols'] = colWidths3;
      }

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, 'Sản phẩm');
      XLSX.utils.book_append_sheet(wb, ws2, 'Biến thể');
      XLSX.utils.book_append_sheet(wb, ws3, 'Tồn kho theo kho');

      // Filename with date
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `san-pham_${today}.xlsx`);
    } catch (err) {
      alert('Lỗi xuất Excel: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // ===== Import products from Excel =====
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState('upload'); // upload | preview | importing | done
  const [importPreviewData, setImportPreviewData] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [importStats, setImportStats] = useState({ total: 0, valid: 0, errors: 0, created: 0, skipped: 0 });
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef(null);

  const IMPORT_TEMPLATE_COLUMNS = ['Mã SP', 'Tên sản phẩm', 'Danh mục', 'Đơn vị', 'Thương hiệu', 'Giá nhập', 'Giá bán', 'Tồn tối thiểu', 'Tồn tối đa', 'Vị trí', 'BH (tháng)', 'Serial (Có/Không)', 'Mô tả'];

  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Sheet 1: Hướng dẫn
      const guideData = [
        ['HƯỚNG DẪN IMPORT SẢN PHẨM'],
        [''],
        ['1. Điền thông tin sản phẩm vào sheet "Dữ liệu"'],
        ['2. Cột "Tên sản phẩm" là BẮT BUỘC'],
        ['3. Nếu bỏ trống "Mã SP", hệ thống sẽ tự tạo mã'],
        ['4. Giá nhập, Giá bán: nhập số (không có dấu phẩy, dấu chấm)'],
        ['5. Cột "Serial": nhập "Có" hoặc "Không"'],
        ['6. Nếu "Mã SP" trùng với SP đã tồn tại, dòng đó sẽ bị BỎ QUA'],
        [''],
        ['DANH MỤC HỢP LỆ:'],
        ...effectiveCategories.map(cat => [cat]),
        [''],
        ['ĐƠN VỊ HỢP LỆ:'],
        ...effectiveUnits.map(u => [u]),
      ];
      const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
      wsGuide['!cols'] = [{ wch: 60 }];
      XLSX.utils.book_append_sheet(wb, wsGuide, 'Hướng dẫn');

      // Sheet 2: Dữ liệu (template with headers + 2 example rows)
      const templateRows = [
        IMPORT_TEMPLATE_COLUMNS,
        ['', 'Loa Bluetooth JBL Go 3', 'Loa', 'Cái', 'JBL', 500000, 890000, 5, '', 'Kệ A1', 12, 'Có', 'Loa bluetooth di động'],
        ['', 'Dây AUX 3.5mm 1.5m', 'Phụ kiện', 'Sợi', '', 15000, 35000, 10, '', '', '', 'Không', ''],
      ];
      const wsData = XLSX.utils.aoa_to_sheet(templateRows);
      wsData['!cols'] = IMPORT_TEMPLATE_COLUMNS.map(col => ({ wch: Math.max(col.length + 4, 15) }));
      XLSX.utils.book_append_sheet(wb, wsData, 'Dữ liệu');

      XLSX.writeFile(wb, 'mau-import-san-pham.xlsx');
    } catch (err) {
      alert('Lỗi tải file mẫu: ' + err.message);
    }
  };

  const handleImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);

      // Find data sheet
      const sheetName = wb.SheetNames.find(s => s === 'Dữ liệu') || wb.SheetNames.find(s => s !== 'Hướng dẫn') || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (rows.length === 0) {
        alert('File không có dữ liệu!');
        return;
      }

      // Validate rows
      const existingSkus = new Set(products.map(p => (p.sku || '').toUpperCase()));
      const newSkus = new Set();
      const errors = [];
      const validRows = [];

      rows.forEach((row, idx) => {
        const rowNum = idx + 2; // Excel header = row 1
        const rowErrors = [];
        const name = String(row['Tên sản phẩm'] || '').trim();
        const sku = String(row['Mã SP'] || '').trim();
        const importPrice = parseFloat(row['Giá nhập']) || 0;
        const sellPrice = parseFloat(row['Giá bán']) || 0;

        if (!name) {
          rowErrors.push('Thiếu tên sản phẩm');
        }
        if (sku && existingSkus.has(sku.toUpperCase())) {
          rowErrors.push(`Mã SP "${sku}" đã tồn tại`);
        }
        if (sku && newSkus.has(sku.toUpperCase())) {
          rowErrors.push(`Mã SP "${sku}" trùng trong file`);
        }
        if (importPrice < 0) rowErrors.push('Giá nhập không hợp lệ');
        if (sellPrice < 0) rowErrors.push('Giá bán không hợp lệ');

        const parsed = {
          _row: rowNum,
          _errors: rowErrors,
          _valid: rowErrors.length === 0,
          sku: sku || null,
          name,
          category: String(row['Danh mục'] || '').trim(),
          unit: String(row['Đơn vị'] || 'Cái').trim(),
          brand: String(row['Thương hiệu'] || '').trim(),
          import_price: importPrice,
          sell_price: sellPrice,
          min_stock: parseInt(row['Tồn tối thiểu']) || 5,
          max_stock: row['Tồn tối đa'] ? parseInt(row['Tồn tối đa']) : null,
          location: String(row['Vị trí'] || '').trim(),
          warranty_months: row['BH (tháng)'] ? parseInt(row['BH (tháng)']) : null,
          has_serial: String(row['Serial (Có/Không)'] || '').trim().toLowerCase() === 'có',
          description: String(row['Mô tả'] || '').trim(),
        };

        if (sku) newSkus.add(sku.toUpperCase());
        if (rowErrors.length > 0) {
          errors.push({ row: rowNum, errors: rowErrors });
        }
        validRows.push(parsed);
      });

      setImportPreviewData(validRows);
      setImportErrors(errors);
      setImportStats({ total: rows.length, valid: validRows.filter(r => r._valid).length, errors: errors.length, created: 0, skipped: 0 });
      setImportStep('preview');
    } catch (err) {
      alert('Lỗi đọc file: ' + err.message);
    }
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const handleImportConfirm = async () => {
    const validRows = importPreviewData.filter(r => r._valid);
    if (validRows.length === 0) { alert('Không có dòng hợp lệ để import!'); return; }
    setImporting(true);
    setImportStep('importing');

    let created = 0, skipped = 0;
    const BATCH_SIZE = 100;
    // Pre-generate unique SKU/barcode to avoid duplicates in tight loop
    const baseTs = Date.now();
    let seqCounter = 0;
    const uniqueSku = () => 'SP' + String(baseTs + (++seqCounter)).slice(-6);
    const uniqueBarcode = () => 'HNA' + String(baseTs + seqCounter).slice(-8);

    try {
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, i + BATCH_SIZE).map(row => ({
          tenant_id: tenant.id,
          sku: row.sku || uniqueSku(),
          barcode: uniqueBarcode(),
          name: row.name,
          category: row.category,
          unit: row.unit,
          brand: row.brand,
          import_price: row.import_price,
          sell_price: row.sell_price,
          stock_quantity: 0,
          min_stock: row.min_stock,
          max_stock: row.max_stock,
          location: row.location,
          warranty_months: row.warranty_months,
          has_serial: row.has_serial,
          description: row.description,
          created_by: currentUser.name,
        }));

        const { data, error } = await supabase.from('products').insert(batch).select('id');
        if (error) throw error;
        created += (data?.length || 0);
      }

      skipped = importPreviewData.length - validRows.length;
      setImportStats(prev => ({ ...prev, created, skipped }));
      setImportStep('done');

      logActivity({
        tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name,
        module: 'warehouse', action: 'create', entityType: 'product',
        description: `Import ${created} sản phẩm từ Excel (bỏ qua ${skipped} dòng lỗi)`,
      });

      loadWarehouseData();
    } catch (err) {
      alert('Lỗi import: ' + err.message);
      setImportStep('preview');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-blue-600">{formatNumber(stats.totalProducts)}</div>
          <div className="text-gray-500 text-xs">Tổng SP</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-indigo-500">
          <div className="text-2xl font-bold text-indigo-600">{formatNumber(stats.totalUnits)}</div>
          <div className="text-gray-500 text-xs">Tổng SL</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
          <div className="text-sm font-bold text-green-600">{permLevel >= 3 ? formatCurrency(stats.totalValue) : '---'}</div>
          <div className="text-gray-500 text-xs">Giá trị (vốn)</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-teal-500">
          <div className="text-sm font-bold text-teal-600">{permLevel >= 3 ? formatCurrency(stats.totalSellValue) : '---'}</div>
          <div className="text-gray-500 text-xs">Giá trị (bán)</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-emerald-500">
          <div className="text-sm font-bold text-emerald-600">{permLevel >= 3 ? formatCurrency(stats.potentialProfit) : '---'}</div>
          <div className="text-gray-500 text-xs">LN dự kiến</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-yellow-500">
          <div className="text-2xl font-bold text-yellow-600">{stats.lowStock}</div>
          <div className="text-gray-500 text-xs">Sắp hết</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-500">
          <div className="text-2xl font-bold text-red-600">{stats.outOfStock}</div>
          <div className="text-gray-500 text-xs">Hết hàng</div>
        </div>
      </div>

      {/* Low stock alert banner */}
      {stats.lowStock > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-yellow-100" onClick={() => setFilterStock('low_alert')}>
          <span className="text-2xl">⚠️</span>
          <div>
            <div className="font-medium text-yellow-800">Cảnh báo tồn kho thấp</div>
            <div className="text-sm text-yellow-600">{stats.lowStock} sản phẩm sắp hết hàng (dưới mức tồn tối thiểu)</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text" placeholder="Tìm theo tên, mã SP, barcode..."
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-4 py-2 border rounded-lg bg-white min-w-[150px]">
            <option value="">📁 Tất cả danh mục</option>
            {effectiveCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select value={filterStock} onChange={(e) => setFilterStock(e.target.value)} className="px-4 py-2 border rounded-lg bg-white min-w-[130px]">
            <option value="">Tất cả tồn kho</option>
            <option value="normal">Còn hàng</option>
            <option value="low">Sắp hết</option>
            <option value="out">Hết hàng</option>
            <option value="low_alert">Cảnh báo tồn thấp</option>
          </select>
          {warehouses && warehouses.length > 1 && (
            <select value={filterWarehouse} onChange={(e) => setFilterWarehouse(e.target.value)} className="px-4 py-2 border rounded-lg bg-white min-w-[140px]">
              <option value="">Tất cả kho</option>
              {warehouses.filter(w => w.is_active).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div className="flex gap-2">
            <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-lg text-sm ${viewMode === 'table' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>📋 Bảng</button>
            <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 rounded-lg text-sm ${viewMode === 'grid' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>📦 Lưới</button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={exporting || filteredProducts.length === 0} className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50" title="Xuất danh sách sản phẩm ra Excel">
              {exporting ? <span className="animate-spin inline-block">⏳</span> : <span>📥</span>} Xuất Excel
            </button>
            {hasPermission('warehouse', 2) && (
              <button onClick={() => { setImportStep('upload'); setImportPreviewData([]); setImportErrors([]); setShowImportModal(true); }} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5" title="Nhập sản phẩm từ Excel">
                <span>📤</span> Import Excel
              </button>
            )}
            {hasPermission('warehouse', 2) && (
              <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium flex items-center gap-2">
                <span>➕</span> Thêm sản phẩm
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th onClick={() => toggleSort('sku')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100">
                    Mã SP {sortBy === 'sku' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => toggleSort('name')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100">
                    Sản phẩm {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Danh mục</th>
                  <th onClick={() => toggleSort('stock_quantity')} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100">
                    Tồn kho {sortBy === 'stock_quantity' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell" title="Đang chờ giao (đơn hàng chưa hoàn thành)">Cam kết</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell" title="Hàng demo/sửa chữa/giữ/hỏng">Không KD</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell" title="Tồn kho - Cam kết - Không KD">Có thể bán</th>
                  <th onClick={() => toggleSort('import_price')} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase hidden md:table-cell cursor-pointer hover:bg-gray-100">
                    Giá nhập {sortBy === 'import_price' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => toggleSort('sell_price')} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell cursor-pointer hover:bg-gray-100">
                    Giá bán {sortBy === 'sell_price' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase hidden xl:table-cell">Giá vốn TB</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase hidden xl:table-cell">LN dự kiến</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Trạng thái</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProducts.length === 0 ? (
                  <tr><td colSpan="13" className="px-4 py-12 text-center">
                    <div className="text-gray-400 text-5xl mb-3">📦</div>
                    <div className="text-gray-500">{products.length === 0 ? 'Chưa có sản phẩm nào' : 'Không tìm thấy'}</div>
                    {products.length === 0 && hasPermission('warehouse', 2) && <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm">➕ Thêm sản phẩm đầu tiên</button>}
                  </td></tr>
                ) : filteredProducts.map(product => {
                  const status = getStockStatus(product);
                  return (
                    <tr key={product.id} onClick={() => openDetail(product)} className={`hover:bg-amber-50 cursor-pointer transition-colors ${getEffectiveStock(product) > 0 && getEffectiveStock(product) <= (product.min_stock || 5) ? 'bg-red-50/50' : ''}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-amber-600 font-medium">{product.sku}</span>
                        {product.barcode && <div className="text-xs text-gray-400">{product.barcode}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {product.name}
                          {product.is_combo && <span className="ml-1.5 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded font-medium align-middle">Combo</span>}
                          {product.has_variants && <span className="ml-1.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded font-medium align-middle">{getVariantCount(product.id)} biến thể</span>}
                        </div>
                        {product.brand && <div className="text-xs text-gray-500">{product.brand}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell text-sm">{product.category || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-lg font-bold ${getEffectiveStock(product) === 0 ? 'text-red-600' : getEffectiveStock(product) <= (product.min_stock || 5) ? 'text-yellow-600' : 'text-gray-900'}`}>
                          {formatNumber(getEffectiveStock(product))}
                        </span>
                        <span className="text-gray-400 text-sm ml-1">{product.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        {getCommittedQty(product.id) > 0 ? (
                          <span className="text-amber-600 font-medium">{formatNumber(getCommittedQty(product.id))}</span>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        {getUnavailableQty(product.id) > 0 ? (
                          <button onClick={(e) => openUnavailableModal(product, e)} className="text-orange-600 font-medium hover:underline" title="Click để khóa/mở hàng">{formatNumber(getUnavailableQty(product.id))}</button>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className={`font-bold ${getAvailableStock(product) === 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {formatNumber(getAvailableStock(product))}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 hidden md:table-cell">{permLevel >= 3 ? formatCurrency(product.import_price) : '---'}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className="text-gray-700">{formatCurrency(product.sell_price)}</span>
                        {permLevel >= 3 && product.import_price > 0 && product.sell_price > product.import_price && (
                          <div className="text-xs text-green-600">+{Math.round((product.sell_price - product.import_price) / product.import_price * 100)}%</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 hidden xl:table-cell text-sm">{permLevel >= 3 ? formatCurrency(avgCost(product)) : '---'}</td>
                      <td className="px-4 py-3 text-right hidden xl:table-cell">
                        {permLevel >= 3 ? (() => {
                          const profit = (product.sell_price - avgCost(product)) * getEffectiveStock(product);
                          return <span className={`text-sm font-medium ${profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-600' : 'text-gray-400'}`}>{formatCurrency(profit)}</span>;
                        })() : <span className="text-sm text-gray-400">---</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                          {status.icon} <span className="hidden sm:inline">{status.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          {hasPermission('warehouse', 2) && (
                            <button onClick={(e) => openAdjust(product, e)} className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600" title="Điều chỉnh SL">🔄</button>
                          )}
                          {hasPermission('warehouse', 2) && !product.is_combo && (
                            <button onClick={(e) => openUnavailableModal(product, e)} className="p-1.5 hover:bg-orange-100 rounded-lg text-orange-600" title="Khóa/mở hàng">🔒</button>
                          )}
                          {hasPermission('warehouse', 2) && (
                            <button onClick={(e) => { e.stopPropagation(); openDetail(product); }} className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-600" title="Chi tiết">✏️</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-600">
            Hiển thị {filteredProducts.length} / {products.length} sản phẩm
          </div>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredProducts.length === 0 ? (
            <div className="col-span-full bg-white rounded-xl p-12 text-center">
              <div className="text-gray-400 text-5xl mb-3">📦</div>
              <div className="text-gray-500">{products.length === 0 ? 'Chưa có sản phẩm' : 'Không tìm thấy'}</div>
            </div>
          ) : filteredProducts.map(product => {
            const status = getStockStatus(product);
            return (
              <div key={product.id} onClick={() => openDetail(product)} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow border cursor-pointer">
                <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-5xl">
                  {product.category?.includes('Micro') ? '🎤' : product.category?.includes('Loa') ? '🔊' : product.category?.includes('Mixer') ? '🎚️' : product.category?.includes('Tai nghe') ? '🎧' : product.category?.includes('Màn hình') ? '📺' : product.category?.includes('Dây') ? '🔌' : '📦'}
                </div>
                <div className="p-3">
                  <div className="font-mono text-xs text-amber-600">{product.sku}</div>
                  <div className="font-medium text-gray-900 truncate" title={product.name}>
                    {product.name}
                    {product.is_combo && <span className="ml-1 px-1 py-0.5 bg-orange-100 text-orange-700 text-[9px] rounded font-medium">Combo</span>}
                    {product.has_variants && <span className="ml-1 px-1 py-0.5 bg-indigo-100 text-indigo-700 text-[9px] rounded font-medium">{getVariantCount(product.id)} BT</span>}
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className={`font-bold ${getEffectiveStock(product) === 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatNumber(getEffectiveStock(product))} {product.unit}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${status.color}`}>{status.icon}</span>
                  </div>
                  {getCommittedQty(product.id) > 0 && (
                    <div className="text-xs text-amber-600 mt-0.5">Cam kết: {getCommittedQty(product.id)} | Bán được: {getAvailableStock(product)}</div>
                  )}
                  <div className="text-sm text-green-600 font-medium mt-1">{permLevel >= 3 ? formatCurrency(product.sell_price) : ''}</div>
                  {hasPermission('warehouse', 2) && (
                    <div className="flex gap-1 mt-2">
                      <button onClick={(e) => openAdjust(product, e)} className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded text-xs font-medium">🔄 Điều chỉnh</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
              <h2 className="text-xl font-bold">➕ Thêm Sản Phẩm Mới</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Ảnh sản phẩm */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-700 mb-3">📷 Ảnh sản phẩm</h3>
                <input type="file" ref={imageInputRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
                {formImageUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={getThumbnailUrl(formImageUrl)} alt="" className="w-20 h-20 object-cover rounded-lg border" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => imageInputRef.current?.click()} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm" disabled={uploadingImage}>Đổi ảnh</button>
                      <button type="button" onClick={() => setFormImageUrl('')} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm">Xóa</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-amber-400 hover:text-amber-600 transition-colors text-sm" disabled={uploadingImage}>
                    {uploadingImage ? 'Đang tải ảnh...' : '📷 Thêm ảnh sản phẩm'}
                  </button>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-gray-700">📝 Thông tin cơ bản</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã SP (SKU)</label>
                    <input type="text" value={formSku} onChange={(e) => setFormSku(e.target.value)} placeholder="Tự động nếu để trống" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
                    <input type="text" value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} placeholder="Mã vạch" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên sản phẩm <span className="text-red-500">*</span></label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="VD: Micro Shure SM58" className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Danh mục</label>
                    <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">Chọn danh mục</option>
                      {effectiveCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Thương hiệu</label>
                    <input type="text" value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder="VD: Shure, JBL..." className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp</label>
                    <select value={formSupplierId} onChange={e => setFormSupplierId(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- Chọn NCC --</option>
                      {(suppliers || []).filter(s => s.is_active !== false).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-blue-700">💰 Giá & Tồn kho</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị</label>
                    <select value={formUnit} onChange={(e) => setFormUnit(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                      {effectiveUnits.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giá nhập</label>
                    <input type="number" value={formImportPrice} onChange={(e) => setFormImportPrice(e.target.value)} placeholder="0" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giá bán</label>
                    <input type="number" value={formSellPrice} onChange={(e) => setFormSellPrice(e.target.value)} placeholder="0" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tồn tối thiểu</label>
                    <input type="number" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} placeholder="5" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tồn tối đa</label>
                    <input type="number" value={formMaxStock} onChange={(e) => setFormMaxStock(e.target.value)} placeholder="Không giới hạn" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-green-700">📋 Thông tin bổ sung</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vị trí kho</label>
                    <input type="text" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="VD: Kệ A1" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bảo hành (tháng)</label>
                    <input type="number" value={formWarranty} onChange={(e) => setFormWarranty(e.target.value)} placeholder="0" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                </div>
                {!formIsCombo && (
                  <div className="flex items-center gap-2 py-2">
                    <input type="checkbox" id="hasSerial" checked={formHasSerial} onChange={e => setFormHasSerial(e.target.checked)} className="w-4 h-4 text-green-600 rounded" />
                    <label htmlFor="hasSerial" className="text-sm font-medium text-gray-700">Sản phẩm có Serial Number</label>
                  </div>
                )}
                {!formHasVariants && (
                  <div className="flex items-center gap-2 py-2">
                    <input type="checkbox" id="isCombo" checked={formIsCombo} onChange={e => { setFormIsCombo(e.target.checked); if (e.target.checked) { setFormHasSerial(false); setFormHasVariants(false); } }} className="w-4 h-4 text-orange-600 rounded" />
                    <label htmlFor="isCombo" className="text-sm font-medium text-gray-700">Đây là sản phẩm Combo</label>
                  </div>
                )}
                {!formIsCombo && (
                  <div className="flex items-center gap-2 py-2">
                    <input type="checkbox" id="hasVariants" checked={formHasVariants} onChange={e => { setFormHasVariants(e.target.checked); if (e.target.checked) { setFormHasSerial(false); setFormIsCombo(false); } }} className="w-4 h-4 text-indigo-600 rounded" />
                    <label htmlFor="hasVariants" className="text-sm font-medium text-gray-700">Sản phẩm có biến thể (màu sắc, kích thước...)</label>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                  <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} placeholder="Mô tả chi tiết..." className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>

              {/* Variant options builder */}
              {formHasVariants && (
                <div className="bg-indigo-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-indigo-700">Biến thể sản phẩm</h3>
                  {/* Option groups */}
                  {formVariantOptions.map((opt, optIdx) => (
                    <div key={optIdx} className="bg-white rounded-lg p-3 border space-y-2">
                      <div className="flex items-center gap-2">
                        <input type="text" value={opt.name} onChange={e => {
                          const next = [...formVariantOptions]; next[optIdx] = { ...next[optIdx], name: e.target.value }; setFormVariantOptions(next);
                        }} placeholder="Tên thuộc tính (VD: Màu sắc)" className="flex-1 px-3 py-1.5 border rounded-lg text-sm" />
                        <button type="button" onClick={() => setFormVariantOptions(prev => prev.filter((_, i) => i !== optIdx))} className="text-red-500 hover:text-red-700 text-lg">x</button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(opt.values || []).map((val, valIdx) => (
                          <span key={valIdx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                            {val}
                            <button type="button" onClick={() => {
                              const next = [...formVariantOptions]; next[optIdx] = { ...next[optIdx], values: next[optIdx].values.filter((_, i) => i !== valIdx) }; setFormVariantOptions(next);
                            }} className="text-indigo-400 hover:text-indigo-600">x</button>
                          </span>
                        ))}
                        <input type="text" placeholder="+ Thêm giá trị"
                          className="px-2 py-0.5 border rounded text-xs w-28"
                          onKeyDown={e => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              e.preventDefault();
                              const next = [...formVariantOptions];
                              next[optIdx] = { ...next[optIdx], values: [...(next[optIdx].values || []), e.target.value.trim()] };
                              setFormVariantOptions(next);
                              e.target.value = '';
                            }
                          }} />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setFormVariantOptions(prev => [...prev, { name: '', values: [] }])}
                    className="px-3 py-1.5 border-2 border-dashed border-indigo-300 text-indigo-600 rounded-lg text-sm hover:bg-indigo-100 w-full">
                    + Thêm thuộc tính
                  </button>
                  {formVariantOptions.some(o => o.name && o.values?.length > 0) && (
                    <button type="button" onClick={() => {
                      const generated = generateVariantsFromOptions(formVariantOptions, formSku, formSellPrice, formImportPrice);
                      setFormVariants(generated);
                    }} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                      Tạo {formVariantOptions.reduce((t, o) => t * Math.max(1, (o.values?.length || 0)), 1)} biến thể
                    </button>
                  )}
                  {/* Variants table */}
                  {formVariants.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-indigo-100">
                            <th className="px-2 py-1.5 text-left">Biến thể</th>
                            <th className="px-2 py-1.5 text-left">SKU</th>
                            <th className="px-2 py-1.5 text-right">Giá bán</th>
                            <th className="px-2 py-1.5 text-right">Giá nhập</th>
                            <th className="px-2 py-1.5 text-left">Barcode</th>
                            <th className="px-2 py-1.5 w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {formVariants.map((v, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="px-2 py-1">{v.variant_name}</td>
                              <td className="px-2 py-1">
                                <input type="text" value={v.sku || ''} onChange={e => {
                                  const next = [...formVariants]; next[idx] = { ...next[idx], sku: e.target.value }; setFormVariants(next);
                                }} className="w-24 px-1 py-0.5 border rounded text-xs" />
                              </td>
                              <td className="px-2 py-1">
                                <input type="number" value={v.price || ''} onChange={e => {
                                  const next = [...formVariants]; next[idx] = { ...next[idx], price: e.target.value }; setFormVariants(next);
                                }} className="w-24 px-1 py-0.5 border rounded text-xs text-right" />
                              </td>
                              <td className="px-2 py-1">
                                <input type="number" value={v.cost_price || ''} onChange={e => {
                                  const next = [...formVariants]; next[idx] = { ...next[idx], cost_price: e.target.value }; setFormVariants(next);
                                }} className="w-24 px-1 py-0.5 border rounded text-xs text-right" />
                              </td>
                              <td className="px-2 py-1">
                                <input type="text" value={v.barcode || ''} onChange={e => {
                                  const next = [...formVariants]; next[idx] = { ...next[idx], barcode: e.target.value }; setFormVariants(next);
                                }} className="w-24 px-1 py-0.5 border rounded text-xs" />
                              </td>
                              <td className="px-2 py-1">
                                <button type="button" onClick={() => setFormVariants(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">x</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Combo child products section */}
              {formIsCombo && (
                <div className="bg-orange-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-orange-700">Sản phẩm trong Combo</h3>
                  <div className="relative">
                    <input type="text" value={comboChildSearch} onChange={e => setComboChildSearch(e.target.value)}
                      placeholder="Tìm sản phẩm con..." className="w-full px-3 py-2 border rounded-lg text-sm" />
                    {comboChildSearch.trim() && comboChildOptions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {comboChildOptions.map(p => (
                          <button key={p.id} type="button" onClick={() => {
                            setFormComboItems(prev => [...prev, { product_id: p.id, product_name: p.name, quantity: 1 }]);
                            setComboChildSearch('');
                          }} className="w-full px-3 py-2 text-left hover:bg-orange-50 text-sm flex justify-between">
                            <span className="truncate">{p.name}</span>
                            <span className="text-gray-400 ml-2 shrink-0">Tồn: {getEffectiveStock(p)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {formComboItems.length > 0 ? (
                    <div className="space-y-2">
                      {formComboItems.map((ci, idx) => {
                        const child = products.find(p => p.id === ci.product_id);
                        return (
                          <div key={ci.product_id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{ci.product_name}</div>
                              <div className="text-xs text-gray-400">Tồn kho: {child ? getEffectiveStock(child) : 0}</div>
                            </div>
                            <label className="text-xs text-gray-500">SL:</label>
                            <input type="number" min="1" value={ci.quantity} onChange={e => {
                              const val = parseInt(e.target.value) || 1;
                              setFormComboItems(prev => prev.map((c, i) => i === idx ? { ...c, quantity: val } : c));
                            }} className="w-16 border rounded px-2 py-1 text-sm text-center" />
                            <button type="button" onClick={() => setFormComboItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 text-lg">✕</button>
                          </div>
                        );
                      })}
                      <div className="bg-orange-100 rounded-lg px-3 py-2 text-center">
                        <span className="text-sm text-orange-700">Tồn kho combo: </span>
                        <span className="font-bold text-orange-800">{getFormComboStock()}</span>
                        <span className="text-xs text-orange-600 ml-1">(dựa trên SP con)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-orange-500 text-center py-2">Chưa chọn sản phẩm con nào</div>
                  )}
                </div>
              )}
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3 justify-end sticky bottom-0">
              <button onClick={() => setShowCreateModal(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Hủy</button>
              <button onClick={handleCreateProduct} className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium">➕ Thêm sản phẩm</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
              <h2 className="text-xl font-bold">📦 Chi Tiết Sản Phẩm</h2>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className={`bg-gradient-to-r ${selectedProduct.is_combo ? 'from-orange-500 to-amber-500' : 'from-amber-500 to-orange-500'} rounded-xl p-6 text-white text-center`}>
                <div className="text-4xl font-bold">{formatNumber(selectedProduct.is_combo ? getComboStock(selectedProduct.id) : selectedProduct.stock_quantity)}</div>
                <div className="text-amber-100">{selectedProduct.unit} {selectedProduct.is_combo ? 'combo khả dụng (tính từ SP con)' : 'trong kho (tổng)'}</div>
                {getCommittedQty(selectedProduct.id) > 0 && (
                  <div className="flex justify-center gap-4 mt-2 text-sm text-amber-100">
                    <span>Cam kết: <strong className="text-white">{formatNumber(getCommittedQty(selectedProduct.id))}</strong></span>
                    <span>Có thể bán: <strong className="text-white">{formatNumber(getAvailableStock(selectedProduct))}</strong></span>
                  </div>
                )}
                {!selectedProduct.is_combo && (
                  <button onClick={() => { setShowDetailModal(false); openAdjust(selectedProduct); }} className="mt-3 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium">Điều chỉnh số lượng</button>
                )}
              </div>

              {/* Ảnh sản phẩm (detail) */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-700 mb-3">📷 Ảnh sản phẩm</h3>
                <input type="file" ref={imageInputRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
                {formImageUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={getThumbnailUrl(formImageUrl)} alt="" className="w-20 h-20 object-cover rounded-lg border" />
                    {hasPermission('warehouse', 2) && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => imageInputRef.current?.click()} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm" disabled={uploadingImage}>Đổi ảnh</button>
                        <button type="button" onClick={() => setFormImageUrl('')} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm">Xóa</button>
                      </div>
                    )}
                  </div>
                ) : hasPermission('warehouse', 2) ? (
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-amber-400 hover:text-amber-600 transition-colors text-sm" disabled={uploadingImage}>
                    {uploadingImage ? 'Đang tải ảnh...' : '📷 Thêm ảnh sản phẩm'}
                  </button>
                ) : (
                  <div className="text-sm text-gray-400">Chưa có ảnh</div>
                )}
              </div>

              {/* Barcode display */}
              {selectedProduct.barcode && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-700">Mã vạch</h3>
                    <button onClick={() => {
                      const printWin = window.open('', '_blank', 'width=400,height=300');
                      if (!printWin) return;
                      printWin.document.write(`<html><head><title>In mã vạch - ${selectedProduct.name}</title><style>body{font-family:sans-serif;text-align:center;padding:20px}h3{margin:4px 0;font-size:14px}p{margin:2px 0;font-size:11px;color:#666}svg{max-width:280px;height:auto}</style></head><body>`);
                      printWin.document.write(`<h3>${selectedProduct.name}</h3>`);
                      printWin.document.write(`<p>SKU: ${selectedProduct.sku || '—'}</p>`);
                      const svgEl = document.getElementById('barcode-detail-svg');
                      if (svgEl) printWin.document.write(svgEl.outerHTML);
                      printWin.document.write('</body></html>');
                      printWin.document.close();
                      setTimeout(() => { printWin.print(); }, 300);
                    }} className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200">
                      In mã vạch
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <svg id="barcode-detail-svg" ref={el => { if (el && selectedProduct.barcode) { try { JsBarcode(el, selectedProduct.barcode, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 14, margin: 5 }); } catch {} } }} />
                  </div>
                </div>
              )}

              {/* Warehouse stock breakdown */}
              {warehouses && warehouses.length > 0 && (
                <div className="bg-indigo-50 rounded-lg p-4">
                  <h3 className="font-medium text-indigo-700 mb-3">Tồn kho theo kho</h3>
                  <div className="space-y-2">
                    {getWarehouseBreakdown(selectedProduct.id).length === 0 ? (
                      <div className="text-sm text-gray-500">Chưa có tồn kho tại kho nào</div>
                    ) : getWarehouseBreakdown(selectedProduct.id).map(w => (
                      <div key={w.id} className="flex justify-between items-center bg-white rounded-lg px-3 py-2">
                        <span className="text-sm font-medium">{w.name}{w.is_default ? ' (Mặc định)' : ''}</span>
                        <span className="font-bold text-indigo-600">{formatNumber(w.quantity)} {selectedProduct.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Variants display (read-only) */}
              {selectedProduct.has_variants && getVariantCount(selectedProduct.id) > 0 && (
                <div className="bg-indigo-50 rounded-lg p-4">
                  <h3 className="font-medium text-indigo-700 mb-3">Biến thể ({getVariantCount(selectedProduct.id)})</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead><tr className="bg-indigo-100">
                        <th className="px-2 py-1.5 text-left">Tên</th>
                        <th className="px-2 py-1.5 text-left">SKU</th>
                        <th className="px-2 py-1.5 text-right">Giá bán</th>
                        <th className="px-2 py-1.5 text-right">Giá nhập</th>
                      </tr></thead>
                      <tbody>
                        {(productVariants || []).filter(v => v.product_id === selectedProduct.id).map(v => (
                          <tr key={v.id} className="border-b">
                            <td className="px-2 py-1.5 font-medium">{v.variant_name}</td>
                            <td className="px-2 py-1.5 text-gray-500 font-mono">{v.sku}</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(v.price)}</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(v.cost_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-gray-700">📝 Thông tin cơ bản</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Mã SP</label><input type="text" value={formSku} onChange={(e) => setFormSku(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label><input type="text" value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Tên sản phẩm</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Danh mục</label><select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option value="">Chọn</option>{effectiveCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Thương hiệu</label><input type="text" value={formBrand} onChange={(e) => setFormBrand(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp</label><select value={formSupplierId} onChange={e => setFormSupplierId(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option value="">-- Chọn NCC --</option>{(suppliers || []).filter(s => s.is_active !== false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-blue-700">💰 Giá & Định mức</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị</label><select value={formUnit} onChange={(e) => setFormUnit(e.target.value)} className="w-full px-3 py-2 border rounded-lg">{effectiveUnits.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Giá nhập</label><input type="number" value={formImportPrice} onChange={(e) => setFormImportPrice(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Giá bán</label><input type="number" value={formSellPrice} onChange={(e) => setFormSellPrice(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Tồn tối thiểu</label><input type="number" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Tồn tối đa</label><input type="number" value={formMaxStock} onChange={(e) => setFormMaxStock(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-green-700">📋 Thông tin bổ sung</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Vị trí kho</label><input type="text" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Bảo hành (tháng)</label><input type="number" value={formWarranty} onChange={(e) => setFormWarranty(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label><textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg" /></div>
                {!formIsCombo && (
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="hasSerialEdit" checked={formHasSerial} onChange={e => setFormHasSerial(e.target.checked)} className="w-4 h-4 text-green-600 rounded" />
                    <label htmlFor="hasSerialEdit" className="text-sm font-medium text-gray-700">Sản phẩm có Serial Number</label>
                  </div>
                )}
                {!formHasVariants && (
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="isComboEdit" checked={formIsCombo} onChange={e => { setFormIsCombo(e.target.checked); if (e.target.checked) { setFormHasSerial(false); setFormHasVariants(false); } }} className="w-4 h-4 text-orange-600 rounded" />
                    <label htmlFor="isComboEdit" className="text-sm font-medium text-gray-700">Đây là sản phẩm Combo</label>
                  </div>
                )}
                {!formIsCombo && (
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="hasVariantsEdit" checked={formHasVariants} onChange={e => { setFormHasVariants(e.target.checked); if (e.target.checked) { setFormHasSerial(false); setFormIsCombo(false); } }} className="w-4 h-4 text-indigo-600 rounded" />
                    <label htmlFor="hasVariantsEdit" className="text-sm font-medium text-gray-700">Sản phẩm có biến thể</label>
                  </div>
                )}
              </div>

              {/* Variant options (edit) */}
              {formHasVariants && (
                <div className="bg-indigo-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-indigo-700">Biến thể sản phẩm</h3>
                  {formVariantOptions.map((opt, optIdx) => (
                    <div key={optIdx} className="bg-white rounded-lg p-3 border space-y-2">
                      <div className="flex items-center gap-2">
                        <input type="text" value={opt.name} onChange={e => {
                          const next = [...formVariantOptions]; next[optIdx] = { ...next[optIdx], name: e.target.value }; setFormVariantOptions(next);
                        }} placeholder="Tên thuộc tính" className="flex-1 px-3 py-1.5 border rounded-lg text-sm" />
                        <button type="button" onClick={() => setFormVariantOptions(prev => prev.filter((_, i) => i !== optIdx))} className="text-red-500 hover:text-red-700 text-lg">x</button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(opt.values || []).map((val, valIdx) => (
                          <span key={valIdx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                            {val}
                            <button type="button" onClick={() => {
                              const next = [...formVariantOptions]; next[optIdx] = { ...next[optIdx], values: next[optIdx].values.filter((_, i) => i !== valIdx) }; setFormVariantOptions(next);
                            }} className="text-indigo-400 hover:text-indigo-600">x</button>
                          </span>
                        ))}
                        <input type="text" placeholder="+ Thêm" className="px-2 py-0.5 border rounded text-xs w-24"
                          onKeyDown={e => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              e.preventDefault();
                              const next = [...formVariantOptions]; next[optIdx] = { ...next[optIdx], values: [...(next[optIdx].values || []), e.target.value.trim()] }; setFormVariantOptions(next);
                              e.target.value = '';
                            }
                          }} />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setFormVariantOptions(prev => [...prev, { name: '', values: [] }])}
                    className="px-3 py-1.5 border-2 border-dashed border-indigo-300 text-indigo-600 rounded-lg text-sm hover:bg-indigo-100 w-full">
                    + Thêm thuộc tính
                  </button>
                  {formVariantOptions.some(o => o.name && o.values?.length > 0) && (
                    <button type="button" onClick={() => {
                      const generated = generateVariantsFromOptions(formVariantOptions, formSku, formSellPrice, formImportPrice);
                      setFormVariants(generated);
                    }} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                      Tạo lại biến thể ({formVariantOptions.reduce((t, o) => t * Math.max(1, (o.values?.length || 0)), 1)})
                    </button>
                  )}
                  {formVariants.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead><tr className="bg-indigo-100">
                          <th className="px-2 py-1.5 text-left">Biến thể</th>
                          <th className="px-2 py-1.5 text-left">SKU</th>
                          <th className="px-2 py-1.5 text-right">Giá bán</th>
                          <th className="px-2 py-1.5 text-right">Giá nhập</th>
                          <th className="px-2 py-1.5 text-left">Barcode</th>
                          <th className="px-2 py-1.5 w-8"></th>
                        </tr></thead>
                        <tbody>
                          {formVariants.map((v, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="px-2 py-1">{v.variant_name}</td>
                              <td className="px-2 py-1"><input type="text" value={v.sku || ''} onChange={e => { const n = [...formVariants]; n[idx] = { ...n[idx], sku: e.target.value }; setFormVariants(n); }} className="w-24 px-1 py-0.5 border rounded text-xs" /></td>
                              <td className="px-2 py-1"><input type="number" value={v.price || ''} onChange={e => { const n = [...formVariants]; n[idx] = { ...n[idx], price: e.target.value }; setFormVariants(n); }} className="w-24 px-1 py-0.5 border rounded text-xs text-right" /></td>
                              <td className="px-2 py-1"><input type="number" value={v.cost_price || ''} onChange={e => { const n = [...formVariants]; n[idx] = { ...n[idx], cost_price: e.target.value }; setFormVariants(n); }} className="w-24 px-1 py-0.5 border rounded text-xs text-right" /></td>
                              <td className="px-2 py-1"><input type="text" value={v.barcode || ''} onChange={e => { const n = [...formVariants]; n[idx] = { ...n[idx], barcode: e.target.value }; setFormVariants(n); }} className="w-24 px-1 py-0.5 border rounded text-xs" /></td>
                              <td className="px-2 py-1"><button type="button" onClick={() => setFormVariants(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">x</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Combo child products (edit) */}
              {formIsCombo && (
                <div className="bg-orange-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-orange-700">Sản phẩm trong Combo</h3>
                  <div className="relative">
                    <input type="text" value={comboChildSearch} onChange={e => setComboChildSearch(e.target.value)}
                      placeholder="Tìm sản phẩm con..." className="w-full px-3 py-2 border rounded-lg text-sm" />
                    {comboChildSearch.trim() && comboChildOptions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {comboChildOptions.map(p => (
                          <button key={p.id} type="button" onClick={() => {
                            setFormComboItems(prev => [...prev, { product_id: p.id, product_name: p.name, quantity: 1 }]);
                            setComboChildSearch('');
                          }} className="w-full px-3 py-2 text-left hover:bg-orange-50 text-sm flex justify-between">
                            <span className="truncate">{p.name}</span>
                            <span className="text-gray-400 ml-2 shrink-0">Tồn: {getEffectiveStock(p)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {formComboItems.length > 0 ? (
                    <div className="space-y-2">
                      {formComboItems.map((ci, idx) => {
                        const child = products.find(p => p.id === ci.product_id);
                        return (
                          <div key={ci.product_id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{ci.product_name}</div>
                              <div className="text-xs text-gray-400">Tồn kho: {child ? getEffectiveStock(child) : 0}</div>
                            </div>
                            <label className="text-xs text-gray-500">SL:</label>
                            <input type="number" min="1" value={ci.quantity} onChange={e => {
                              const val = parseInt(e.target.value) || 1;
                              setFormComboItems(prev => prev.map((c, i) => i === idx ? { ...c, quantity: val } : c));
                            }} className="w-16 border rounded px-2 py-1 text-sm text-center" />
                            <button type="button" onClick={() => setFormComboItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 text-lg">✕</button>
                          </div>
                        );
                      })}
                      <div className="bg-orange-100 rounded-lg px-3 py-2 text-center">
                        <span className="text-sm text-orange-700">Tồn kho combo: </span>
                        <span className="font-bold text-orange-800">{getFormComboStock()}</span>
                        <span className="text-xs text-orange-600 ml-1">(dựa trên SP con)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-orange-500 text-center py-2">Chưa chọn sản phẩm con nào</div>
                  )}
                </div>
              )}

              {/* Thông tin hệ thống */}
              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="font-medium text-purple-700 mb-3">🕐 Thông tin hệ thống</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Người tạo:</span>
                    <span className="ml-2 font-medium text-gray-800">{selectedProduct.created_by || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Ngày tạo:</span>
                    <span className="ml-2 font-medium text-gray-800">
                      {selectedProduct.created_at ? formatDateTimeVN(selectedProduct.created_at) : 'N/A'}
                    </span>
                  </div>
                  {selectedProduct.updated_at && (
                    <>
                      <div>
                        <span className="text-gray-500">Cập nhật lần cuối:</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-800">
                          {formatDateTimeVN(selectedProduct.updated_at)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3 justify-between sticky bottom-0">
              {canEdit('warehouse') && (
                <button onClick={() => handleDeleteProduct(selectedProduct.id)} className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg">🗑️ Xóa</button>
              )}
              {!canEdit('warehouse') && <div />}
              <div className="flex gap-3">
                <button onClick={() => setShowDetailModal(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Đóng</button>
                {hasPermission('warehouse', 2) && (
                  <button onClick={handleUpdateProduct} className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium">💾 Lưu</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Import sản phẩm từ Excel</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            <div className="p-6 space-y-4">
              {importStep === 'upload' && (
                <>
                  <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                    <div className="text-4xl mb-3">📄</div>
                    <p className="text-gray-600 mb-4">Chọn file Excel (.xlsx, .xls) để import sản phẩm</p>
                    <div className="flex justify-center gap-3">
                      <button onClick={handleDownloadTemplate} className="px-4 py-2 border border-blue-300 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 flex items-center gap-1.5">
                        📋 Tải file mẫu
                      </button>
                      <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer flex items-center gap-1.5">
                        📤 Chọn file
                        <input ref={importFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportFileChange} className="hidden" />
                      </label>
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                    <p className="font-medium mb-1">Lưu ý:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Cột "Tên sản phẩm" là bắt buộc</li>
                      <li>SP có "Mã SP" trùng với SP đã tồn tại sẽ bị bỏ qua</li>
                      <li>Tồn kho ban đầu = 0 (nhập kho riêng)</li>
                      <li>Tải file mẫu để xem format chuẩn</li>
                    </ul>
                  </div>
                </>
              )}

              {importStep === 'preview' && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-blue-700">{importStats.total}</div>
                      <div className="text-xs text-blue-600">Tổng dòng</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-green-700">{importStats.valid}</div>
                      <div className="text-xs text-green-600">Hợp lệ</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-red-700">{importStats.errors}</div>
                      <div className="text-xs text-red-600">Lỗi</div>
                    </div>
                  </div>

                  {importErrors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                      <p className="font-medium text-red-700 text-sm mb-1">Dòng lỗi (sẽ bị bỏ qua):</p>
                      {importErrors.map((e, i) => (
                        <p key={i} className="text-xs text-red-600">Dòng {e.row}: {e.errors.join(', ')}</p>
                      ))}
                    </div>
                  )}

                  <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">Dòng</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">Mã SP</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">Tên SP</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">Danh mục</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600">Giá nhập</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600">Giá bán</th>
                          <th className="px-2 py-1.5 text-center font-medium text-gray-600">TT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreviewData.slice(0, 50).map((row, idx) => (
                          <tr key={idx} className={row._valid ? (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50') : 'bg-red-50'}>
                            <td className="px-2 py-1 text-gray-400">{row._row}</td>
                            <td className="px-2 py-1 font-mono">{row.sku || <span className="text-gray-300 italic">tự tạo</span>}</td>
                            <td className="px-2 py-1 font-medium text-gray-800 max-w-[150px] truncate">{row.name}</td>
                            <td className="px-2 py-1 text-gray-600">{row.category}</td>
                            <td className="px-2 py-1 text-right">{formatNumber(row.import_price)}</td>
                            <td className="px-2 py-1 text-right">{formatNumber(row.sell_price)}</td>
                            <td className="px-2 py-1 text-center">{row._valid ? '✅' : '❌'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreviewData.length > 50 && (
                      <div className="p-2 text-center text-xs text-gray-500 bg-gray-50">...và {importPreviewData.length - 50} dòng khác</div>
                    )}
                  </div>
                </>
              )}

              {importStep === 'importing' && (
                <div className="text-center py-8">
                  <div className="inline-block w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-gray-600 font-medium">Đang import sản phẩm...</p>
                  <p className="text-sm text-gray-400">Vui lòng không đóng trang</p>
                </div>
              )}

              {importStep === 'done' && (
                <div className="text-center py-8">
                  <div className="text-5xl mb-3">✅</div>
                  <p className="text-lg font-bold text-green-700 mb-2">Import hoàn tất!</p>
                  <div className="flex justify-center gap-4 text-sm">
                    <span className="text-green-600">Đã tạo: <strong>{importStats.created}</strong></span>
                    <span className="text-gray-500">Bỏ qua: <strong>{importStats.skipped}</strong></span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-between">
              {importStep === 'preview' ? (
                <button onClick={() => setImportStep('upload')} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">
                  Chọn file khác
                </button>
              ) : <div />}
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setShowImportModal(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">
                  {importStep === 'done' ? 'Đóng' : 'Hủy'}
                </button>
                {importStep === 'preview' && importStats.valid > 0 && (
                  <button onClick={handleImportConfirm} disabled={importing} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                    Import {importStats.valid} sản phẩm
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">🔄 Điều Chỉnh Tồn Kho</h2>
              <p className="text-gray-500 text-sm mt-1">{selectedProduct.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <div className="text-sm text-amber-600">Tồn kho hiện tại{filterWarehouse ? ` (${(warehouses || []).find(w => w.id === filterWarehouse)?.name || ''})` : ' (tổng)'}</div>
                <div className="text-3xl font-bold text-amber-700">{formatNumber(getEffectiveStock(selectedProduct))} {selectedProduct.unit}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Loại điều chỉnh</label>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setAdjustType('add')} className={`py-2 rounded-lg font-medium text-sm ${adjustType === 'add' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>➕ Thêm</button>
                  <button onClick={() => setAdjustType('subtract')} className={`py-2 rounded-lg font-medium text-sm ${adjustType === 'subtract' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>➖ Giảm</button>
                  <button onClick={() => setAdjustType('set')} className={`py-2 rounded-lg font-medium text-sm ${adjustType === 'set' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>🎯 Đặt SL</button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{adjustType === 'add' ? 'Số lượng thêm' : adjustType === 'subtract' ? 'Số lượng giảm' : 'Số lượng mới'}</label>
                <input type="number" value={adjustQuantity} onChange={(e) => setAdjustQuantity(e.target.value)} min="0" className="w-full px-4 py-3 border rounded-lg text-xl font-bold text-center" placeholder="0" />
              </div>

              {adjustQuantity && (() => {
                const current = getEffectiveStock(selectedProduct);
                const q = parseInt(adjustQuantity || 0);
                const after = adjustType === 'add' ? current + q : adjustType === 'subtract' ? Math.max(0, current - q) : q;
                return (
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <span className="text-gray-500">Sau điều chỉnh:</span>
                    <span className="font-bold text-lg">{formatNumber(after)} {selectedProduct.unit}</span>
                  </div>
                );
              })()}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lý do</label>
                <select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  <option value="">Chọn lý do</option>
                  <option value="Kiểm kê">Kiểm kê định kỳ</option>
                  <option value="Hàng hư hỏng">Hàng hư hỏng</option>
                  <option value="Thất thoát">Thất thoát</option>
                  <option value="Chuyển kho">Chuyển kho</option>
                  <option value="Sửa lỗi nhập">Sửa lỗi nhập liệu</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3 justify-end">
              <button onClick={() => setShowAdjustModal(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Hủy</button>
              <button onClick={handleAdjustStock} className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium">✅ Xác nhận</button>
            </div>
          </div>
        </div>
      )}

      {/* Unavailable Stock Modal */}
      {showUnavailableModal && unavailableProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">🔒 Khóa / Mở Khóa Hàng</h2>
              <p className="text-gray-500 text-sm mt-1">{unavailableProduct.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kho</label>
                <select value={unavailableWarehouseId} onChange={(e) => setUnavailableWarehouseId(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  <option value="">-- Chọn kho --</option>
                  {(warehouses || []).filter(w => w.is_active).map(w => {
                    const ws = (warehouseStock || []).find(s => s.warehouse_id === w.id && s.product_id === unavailableProduct.id);
                    return <option key={w.id} value={w.id}>{w.name} (Tồn: {ws?.quantity || 0}, Khóa: {ws?.unavailable_quantity || 0})</option>;
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hành động</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setUnavailableAction('lock')} className={`py-2 rounded-lg font-medium text-sm ${unavailableAction === 'lock' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>🔒 Khóa hàng</button>
                  <button onClick={() => setUnavailableAction('release')} className={`py-2 rounded-lg font-medium text-sm ${unavailableAction === 'release' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>🔓 Mở khóa</button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lý do</label>
                <select value={unavailableReason} onChange={(e) => setUnavailableReason(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  <option value="demo">Demo / Trưng bày</option>
                  <option value="repair">Sửa chữa</option>
                  <option value="hold">Giữ hàng</option>
                  <option value="damaged">Hỏng</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng</label>
                <input type="number" value={unavailableQty} onChange={(e) => setUnavailableQty(e.target.value)} min="1" className="w-full px-4 py-3 border rounded-lg text-xl font-bold text-center" placeholder="0" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <input type="text" value={unavailableNote} onChange={(e) => setUnavailableNote(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Ghi chú (không bắt buộc)" />
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3 justify-end">
              <button onClick={() => setShowUnavailableModal(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">Hủy</button>
              <button onClick={handleUnavailable} disabled={savingUnavailable} className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium disabled:opacity-50">
                {savingUnavailable ? 'Đang xử lý...' : unavailableAction === 'lock' ? '🔒 Khóa' : '🔓 Mở khóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

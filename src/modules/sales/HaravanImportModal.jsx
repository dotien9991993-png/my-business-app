import React, { useState, useRef, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { formatMoney } from '../../utils/formatUtils';
import { getNowISOVN } from '../../utils/dateUtils';
// XLSX loaded dynamically khi cần
const getXLSX = () => import('xlsx');
import { logActivity } from '../../lib/activityLog';

// Haravan header → field mapping
const HEADER_MAP = {
  order_code: ['Mã đơn hàng'],
  created_at: ['Ngày đặt hàng'],
  subtotal: ['Tổng tiền'],
  shipping_fee: ['Phí vận chuyển'],
  discount_amount: ['Số tiền giảm'],
  total_amount: ['Tổng cộng'],
  promotion_code: ['Mã khuyến mãi'],
  payment_status_raw: ['Tình trạng thanh toán'],
  shipping_status_raw: ['Tình trạng giao hàng'],
  payment_method_raw: ['Phương thức thanh toán'],
  shipping_method: ['Phương thức vận chuyển'],
  channel: ['Kênh bán hàng'],
  warehouse_name: ['Kho bán'],
  notes: ['Ghi chú'],
  tags: ['Tags'],
  customer_name: ['Tên người nhận'],
  customer_email: ['Email'],
  address: ['Địa chỉ nhận hàng'],
  ward: ['Phường/Xã nhận hàng', 'Phường/ Xã nhận hàng'],
  district: ['Quận/Huyện nhận hàng', 'Quận/ Huyện nhận hàng'],
  province: ['Tỉnh/Thành phố nhận hàng', 'Tỉnh/ Thành phố nhận hàng'],
  product_name: ['Tên sản phẩm'],
  product_sku: ['Mã sản phẩm'],
  unit_price: ['Giá sản phẩm'],
  quantity: ['Số lượng sản phẩm'],
  brand: ['Hãng'],
};
const PHONE_HEADERS = ['Số điện thoại nhận hàng', 'Điện thoại nhận hàng', 'SĐT nhận hàng', 'Số điện thoại'];

const BATCH_SIZE = 50;
const BATCH_DELAY = 100;

const normalizePhone = (raw) => {
  if (!raw) return '';
  let p = String(raw).replace(/[\s.\-()]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  else if (p.startsWith('84') && p.length >= 11) p = '0' + p.slice(2);
  return p;
};

const parseNum = (val) => {
  if (val == null || val === '') return 0;
  return parseFloat(String(val).replace(/[^\d.-]/g, '')) || 0;
};

const mapPaymentStatus = (raw) => {
  const s = (raw || '').toLowerCase().trim();
  if (s.includes('đã thanh toán') || s.includes('paid')) return 'paid';
  if (s.includes('hoàn') || s.includes('refund')) return 'refunded';
  return 'unpaid';
};

const mapOrderStatus = (shippingRaw) => {
  const s = (shippingRaw || '').toLowerCase().trim();
  if (s.includes('hoàn thành') || s.includes('completed')) return 'completed';
  if (s.includes('đã giao') || s.includes('delivered')) return 'delivered';
  if (s.includes('hủy') || s.includes('cancel')) return 'cancelled';
  if (s.includes('đang giao') || s.includes('shipping')) return 'shipping';
  if (s.includes('đóng gói') || s.includes('packing')) return 'packing';
  if (s.includes('xác nhận') || s.includes('confirmed')) return 'confirmed';
  return 'completed';
};

// Map legacy status → 3-way status fields (for Haravan import)
const mapThreeWayStatus = (legacyStatus) => {
  const map = {
    new: { order_status: 'open', shipping_status: 'pending' },
    confirmed: { order_status: 'confirmed', shipping_status: 'pending' },
    packing: { order_status: 'confirmed', shipping_status: 'packing' },
    shipping: { order_status: 'confirmed', shipping_status: 'shipped' },
    delivered: { order_status: 'confirmed', shipping_status: 'delivered' },
    completed: { order_status: 'completed', shipping_status: 'delivered' },
    cancelled: { order_status: 'cancelled', shipping_status: 'pending' },
    returned: { order_status: 'returned', shipping_status: 'returned_to_sender' },
  };
  return map[legacyStatus] || { order_status: 'completed', shipping_status: 'delivered' };
};

const mapPaymentMethod = (raw) => {
  const s = (raw || '').toLowerCase().trim();
  if (s.includes('cod') || s.includes('giao hàng')) return 'cod';
  if (s.includes('chuyển khoản') || s.includes('transfer') || s.includes('bank')) return 'transfer';
  if (s.includes('thẻ') || s.includes('card')) return 'card';
  if (s.includes('momo') || s.includes('ví')) return 'ewallet';
  return 'cash';
};

const formatDuration = (ms) => {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs} giây`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins} phút ${remainSecs} giây`;
};

export default function HaravanImportModal({ isOpen, onClose, tenant, currentUser, customers, products, orders, loadSalesData, warehouses }) {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [parsedOrders, setParsedOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [result, setResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [showAllPreview, setShowAllPreview] = useState(false);
  const [errorLog, setErrorLog] = useState([]);
  const fileRef = useRef(null);
  const cancelRef = useRef(false);

  const reset = () => {
    setStep(1); setFileName(''); setParsedOrders([]); setStats(null);
    setProgress(0); setProgressText(''); setResult(null); setImporting(false);
    setShowAllPreview(false); setErrorLog([]); cancelRef.current = false;
  };

  const handleClose = () => { reset(); onClose(); };

  const buildColumnMap = (headers) => {
    const colMap = {};
    for (const [field, aliases] of Object.entries(HEADER_MAP)) {
      for (const alias of aliases) {
        const idx = headers.findIndex(h => h.trim() === alias);
        if (idx !== -1) { colMap[field] = idx; break; }
      }
    }
    let phoneIdx = -1;
    for (const ph of PHONE_HEADERS) {
      for (let i = headers.length - 1; i >= 0; i--) {
        if (headers[i].trim() === ph) { phoneIdx = i; break; }
      }
      if (phoneIdx !== -1) break;
    }
    if (phoneIdx !== -1) colMap.customer_phone = phoneIdx;
    return colMap;
  };

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await getXLSX();
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        if (json.length < 2) return alert('File trống hoặc chỉ có header');

        const headers = json[0].map(h => String(h));
        const rows = json.slice(1).filter(r => r.some(c => c !== ''));
        const colMap = buildColumnMap(headers);

        if (colMap.order_code == null) return alert('Không tìm thấy cột "Mã đơn hàng"');

        const get = (row, field) => {
          const idx = colMap[field];
          return idx != null ? String(row[idx] ?? '').trim() : '';
        };

        // Group rows by order code
        const groupMap = new Map();
        for (const row of rows) {
          const code = get(row, 'order_code');
          if (!code) continue;
          if (!groupMap.has(code)) groupMap.set(code, []);
          groupMap.get(code).push(row);
        }

        // Build existing data sets for duplicate check
        const existingCodes = new Set((orders || []).map(o => o.external_order_code).filter(Boolean));
        const existingPhones = new Map();
        (customers || []).forEach(c => { const p = normalizePhone(c.phone); if (p) existingPhones.set(p, c); });
        const existingSkus = new Map();
        (products || []).forEach(p => { if (p.sku) existingSkus.set(p.sku.toLowerCase(), p); });

        // Parse each order group — collect all for import, stats for preview
        const parsed = [];
        const channelCounts = {};
        const uniquePhones = new Set();
        const allNewProductSkus = new Map();
        let totalRevenue = 0;
        let minDate = null, maxDate = null;
        let duplicateCount = 0, errorCount = 0;

        for (const [code, groupRows] of groupMap) {
          const first = groupRows[0];
          const phone = normalizePhone(get(first, 'customer_phone'));
          const name = get(first, 'customer_name');
          const addressParts = [get(first, 'address'), get(first, 'ward'), get(first, 'district'), get(first, 'province')].filter(Boolean);

          const items = groupRows.map(r => ({
            product_name: get(r, 'product_name'),
            product_sku: get(r, 'product_sku'),
            unit_price: parseNum(get(r, 'unit_price')),
            quantity: parseInt(get(r, 'quantity')) || 1,
            brand: get(r, 'brand'),
          })).filter(it => it.product_name);

          const isDuplicate = existingCodes.has(code);
          const errors = [];
          if (!name && !phone) errors.push('Thiếu tên và SĐT');
          if (items.length === 0) errors.push('Không có sản phẩm');

          const existingCustomer = phone ? existingPhones.get(phone) : null;
          const newProducts = items.filter(it => it.product_sku && !existingSkus.has(it.product_sku.toLowerCase()));

          const orderData = {
            order_code: code,
            created_at: get(first, 'created_at'),
            subtotal: parseNum(get(first, 'subtotal')),
            shipping_fee: parseNum(get(first, 'shipping_fee')),
            discount_amount: parseNum(get(first, 'discount_amount')),
            total_amount: parseNum(get(first, 'total_amount')),
            promotion_code: get(first, 'promotion_code'),
            payment_status: mapPaymentStatus(get(first, 'payment_status_raw')),
            status: mapOrderStatus(get(first, 'shipping_status_raw')),
            ...mapThreeWayStatus(mapOrderStatus(get(first, 'shipping_status_raw'))),
            payment_method: mapPaymentMethod(get(first, 'payment_method_raw')),
            shipping_method: get(first, 'shipping_method'),
            channel: get(first, 'channel'),
            warehouse_name: get(first, 'warehouse_name'),
            notes: get(first, 'notes'),
            tags: get(first, 'tags'),
            customer_name: name,
            customer_phone: phone,
            customer_email: get(first, 'customer_email'),
            shipping_address: addressParts.join(', '),
            items, isDuplicate, errors, existingCustomer, newProducts,
            isNewCustomer: !!phone && !existingCustomer,
          };
          parsed.push(orderData);

          // Stats
          if (isDuplicate) { duplicateCount++; continue; }
          if (errors.length > 0) { errorCount++; continue; }
          totalRevenue += orderData.total_amount;
          if (phone) uniquePhones.add(phone);
          const ch = orderData.channel || 'Không rõ';
          channelCounts[ch] = (channelCounts[ch] || 0) + 1;
          newProducts.forEach(p => allNewProductSkus.set(p.product_sku.toLowerCase(), p));

          // Date range
          if (orderData.created_at) {
            try {
              const d = new Date(orderData.created_at);
              if (!isNaN(d.getTime())) {
                if (!minDate || d < minDate) minDate = d;
                if (!maxDate || d > maxDate) maxDate = d;
              }
            } catch (_e) { /* skip */ }
          }
        }

        const validCount = parsed.filter(o => !o.isDuplicate && o.errors.length === 0).length;
        const newCustomerCount = new Set(
          parsed.filter(o => !o.isDuplicate && o.errors.length === 0 && o.isNewCustomer).map(o => o.customer_phone)
        ).size;

        setStats({
          totalRows: rows.length,
          totalOrders: parsed.length,
          validOrders: validCount,
          duplicateCount,
          errorCount,
          uniqueCustomers: uniquePhones.size,
          newCustomers: newCustomerCount,
          channelCounts,
          totalRevenue,
          newProducts: allNewProductSkus.size,
          dateRange: minDate && maxDate
            ? `${minDate.toLocaleDateString('vi-VN')} — ${maxDate.toLocaleDateString('vi-VN')}`
            : null,
        });
        setParsedOrders(parsed);
        setStep(2);
      } catch (err) {
        console.error(err);
        alert('Không thể đọc file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const doImport = useCallback(async () => {
    setImporting(true);
    setStep(3);
    setProgress(0);
    setProgressText('Đang chuẩn bị...');
    setErrorLog([]);
    cancelRef.current = false;

    const startTime = Date.now();
    const validOrders = parsedOrders.filter(o => !o.isDuplicate && o.errors.length === 0);
    const totalCount = validOrders.length;
    let insertedOrders = 0, insertedCustomers = 0, insertedProducts = 0, skipped = 0, comboCount = 0, errors = 0;
    const errorsArr = [];

    // ======= Phase 1: Pre-create products =======
    setProgressText('Tạo sản phẩm mới...');
    const newProductSkus = new Map();
    for (const order of validOrders) {
      for (const item of order.newProducts) {
        const skuKey = item.product_sku.toLowerCase();
        if (!newProductSkus.has(skuKey)) newProductSkus.set(skuKey, item);
      }
    }
    if (newProductSkus.size > 0) {
      const productRows = [];
      for (const [, item] of newProductSkus) {
        const nameIsCombo = /combo/i.test(item.product_name);
        if (nameIsCombo) comboCount++;
        productRows.push({
          tenant_id: tenant.id, name: item.product_name, sku: item.product_sku,
          sell_price: item.unit_price, brand: item.brand || null,
          stock_quantity: 0, is_active: true, created_by: currentUser.name,
          is_combo: nameIsCombo
        });
      }
      // Batch insert products (up to 200 at a time)
      for (let i = 0; i < productRows.length; i += 200) {
        const batch = productRows.slice(i, i + 200);
        try {
          const { data, error } = await supabase.from('products').insert(batch).select('id');
          if (!error && data) insertedProducts += data.length;
          else if (error) {
            // Fallback: insert one by one
            for (const row of batch) {
              try {
                const { data: d } = await supabase.from('products').insert([row]).select('id').single();
                if (d) insertedProducts++;
              } catch (_e) { /* skip */ }
            }
          }
        } catch (_e) { /* skip */ }
      }
    }

    if (cancelRef.current) { finishImport(startTime, insertedOrders, insertedCustomers, insertedProducts, skipped, comboCount, errors, errorsArr, true); return; }

    // ======= Phase 2: Load ALL existing data from DB =======
    setProgressText('Đang tải dữ liệu khách hàng & sản phẩm...');

    // Load all customers → phone→id map
    const { data: allDbCustomers } = await supabase.from('customers').select('id, phone').eq('tenant_id', tenant.id);
    const phoneToId = new Map();
    (allDbCustomers || []).forEach(c => { const p = normalizePhone(c.phone); if (p) phoneToId.set(p, c.id); });

    // Load all products → sku→id map
    const { data: allDbProducts } = await supabase.from('products').select('id, sku').eq('tenant_id', tenant.id);
    const skuToId = new Map();
    (allDbProducts || []).forEach(p => { if (p.sku) skuToId.set(p.sku.toLowerCase(), p.id); });

    // Load existing external_order_codes → Set (in case new ones were added since file parse)
    const { data: existingOrderCodes } = await supabase.from('orders').select('external_order_code').eq('tenant_id', tenant.id).not('external_order_code', 'is', null);
    const existingCodeSet = new Set((existingOrderCodes || []).map(o => o.external_order_code));

    // Warehouse map
    const whMap = new Map();
    (warehouses || []).forEach(w => whMap.set(w.name, w.id));

    if (cancelRef.current) { finishImport(startTime, insertedOrders, insertedCustomers, insertedProducts, skipped, comboCount, errors, errorsArr, true); return; }

    // ======= Phase 3: Import in batches =======
    for (let batchStart = 0; batchStart < totalCount; batchStart += BATCH_SIZE) {
      if (cancelRef.current) break;

      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalCount);
      const batch = validOrders.slice(batchStart, batchEnd);

      setProgress(Math.round((batchStart / totalCount) * 100));
      setProgressText(`Đang import... ${batchStart}/${totalCount} (${Math.round((batchStart / totalCount) * 100)}%)`);

      // 3a. Collect & create new customers in this batch
      const newCustomersInBatch = [];
      for (const o of batch) {
        if (o.customer_phone && !phoneToId.has(o.customer_phone)) {
          newCustomersInBatch.push({
            tenant_id: tenant.id, name: o.customer_name, phone: o.customer_phone,
            email: o.customer_email || null, address: o.shipping_address || null,
            source: 'online', created_by: 'Haravan Import'
          });
          // Mark as processing to avoid duplicate inserts within same batch
          phoneToId.set(o.customer_phone, '__pending__');
        }
      }

      if (newCustomersInBatch.length > 0) {
        try {
          const { data: newCusts, error: custErr } = await supabase.from('customers').insert(newCustomersInBatch).select('id, phone');
          if (!custErr && newCusts) {
            for (const c of newCusts) {
              phoneToId.set(normalizePhone(c.phone), c.id);
              insertedCustomers++;
            }
          } else {
            // Fallback: one by one (handle constraint violations)
            for (const row of newCustomersInBatch) {
              try {
                const { data: c } = await supabase.from('customers').insert([row]).select('id, phone').single();
                if (c) { phoneToId.set(normalizePhone(c.phone), c.id); insertedCustomers++; }
              } catch (_e) {
                // Might already exist, try to find
                const { data: existing } = await supabase.from('customers').select('id').eq('tenant_id', tenant.id).eq('phone', row.phone).maybeSingle();
                if (existing) phoneToId.set(normalizePhone(row.phone), existing.id);
              }
            }
          }
        } catch (_e) { /* fallback handled above */ }
      }

      // 3b. Insert orders + items in this batch
      for (const o of batch) {
        if (cancelRef.current) break;

        // Double-check not already imported
        if (existingCodeSet.has(o.order_code)) { skipped++; continue; }

        try {
          const customerId = phoneToId.get(o.customer_phone) || null;
          const resolvedCustomerId = customerId === '__pending__' ? null : customerId;
          const warehouseId = o.warehouse_name ? (whMap.get(o.warehouse_name) || null) : null;
          const paidAmount = o.payment_status === 'paid' ? o.total_amount : 0;

          const { data: order, error: orderErr } = await supabase.from('orders').insert([{
            tenant_id: tenant.id, order_number: o.order_code, order_type: 'online',
            status: o.status, customer_id: resolvedCustomerId,
            customer_name: o.customer_name, customer_phone: o.customer_phone,
            shipping_address: o.shipping_address || null,
            shipping_provider: o.shipping_method || null,
            shipping_fee: o.shipping_fee, shipping_payer: 'customer',
            discount_amount: o.discount_amount, subtotal: o.subtotal, total_amount: o.total_amount,
            payment_method: o.payment_method, payment_status: o.payment_status,
            paid_amount: paidAmount,
            note: o.notes || null, created_by: 'Haravan Import',
            external_order_code: o.order_code, channel: o.channel || null,
            promotion_code: o.promotion_code || null, shipping_method: o.shipping_method || null,
            source: 'haravan_import', warehouse_id: warehouseId,
            created_at: o.created_at || getNowISOVN()
          }]).select('id').single();

          if (orderErr) {
            errors++;
            errorsArr.push(`${o.order_code}: ${orderErr.message}`);
            continue;
          }

          if (order) {
            existingCodeSet.add(o.order_code); // Prevent re-insert in later batches
            const itemsData = o.items.map(item => ({
              order_id: order.id, product_id: skuToId.get((item.product_sku || '').toLowerCase()) || null,
              product_name: item.product_name, product_sku: item.product_sku || '',
              quantity: item.quantity, unit_price: item.unit_price, discount: 0,
              total_price: item.unit_price * item.quantity
            }));
            await supabase.from('order_items').insert(itemsData);
            insertedOrders++;
          }
        } catch (err) {
          errors++;
          errorsArr.push(`${o.order_code}: ${err.message}`);
        }
      }

      // Update progress after batch
      setProgress(Math.round((batchEnd / totalCount) * 100));
      setProgressText(`Đang import... ${batchEnd}/${totalCount} (${Math.round((batchEnd / totalCount) * 100)}%)`);

      // Delay between batches
      if (batchEnd < totalCount && !cancelRef.current) {
        await new Promise(r => setTimeout(r, BATCH_DELAY));
      }
    }

    finishImport(startTime, insertedOrders, insertedCustomers, insertedProducts, skipped, comboCount, errors, errorsArr, cancelRef.current);
  }, [parsedOrders, tenant, currentUser, warehouses]);

  const finishImport = async (startTime, insertedOrders, insertedCustomers, insertedProducts, skipped, comboCount, errors, errorsArr, cancelled) => {
    const duration = Date.now() - startTime;
    setResult({ insertedOrders, insertedCustomers, insertedProducts, skipped, comboCount, errors, duration, cancelled });
    setErrorLog(errorsArr);
    setImporting(false);
    setProgress(100);
    if (insertedOrders > 0) {
      logActivity({ tenantId: tenant.id, userId: currentUser.id, userName: currentUser.name, module: 'sales', action: 'import', entityType: 'order', entityId: 'haravan-import', entityName: 'Haravan Import', description: 'Import ' + insertedOrders + ' đơn từ Haravan' + (insertedCustomers > 0 ? ', ' + insertedCustomers + ' KH mới' : '') + (skipped > 0 ? ', bỏ qua ' + skipped : '') });
    }
    await loadSalesData();
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setProgressText('Đang dừng sau batch hiện tại...');
  };

  const previewOrders = showAllPreview ? parsedOrders.slice(0, 100) : parsedOrders.slice(0, 20);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[60] p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-4xl w-full my-4">
        {/* Header */}
        <div className="p-4 border-b bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-xl flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">Import đơn hàng từ Haravan</h3>
            <div className="text-sm text-orange-100">
              {step === 1 && 'Bước 1: Tải file Excel lên'}
              {step === 2 && 'Bước 2: Xem trước & kiểm tra'}
              {step === 3 && (result ? 'Hoàn thành' : 'Đang import...')}
            </div>
          </div>
          {!importing && <button onClick={handleClose} className="text-white/80 hover:text-white text-xl">✕</button>}
        </div>

        <div className="p-4 space-y-4">
          {/* Steps indicator */}
          <div className="flex items-center gap-1">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
                {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-orange-500' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="space-y-3">
              <div
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); }}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition"
              >
                <div className="text-4xl mb-2">📊</div>
                <p className="text-sm text-gray-600 font-medium">Kéo thả file Haravan Excel vào đây</p>
                <p className="text-xs text-gray-400 mt-1">hoặc click để chọn file (.xlsx, .xls, .csv)</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800 space-y-1">
                <div className="font-medium">Hướng dẫn:</div>
                <ul className="list-disc ml-4 text-xs space-y-0.5">
                  <li>Vào Haravan Admin → Đơn hàng → Xuất file Excel</li>
                  <li>Hỗ trợ file lớn (1000+ đơn hàng), import theo batch</li>
                  <li>Đơn hàng đã tồn tại (trùng mã) sẽ được bỏ qua</li>
                  <li>Khách hàng và sản phẩm mới được tự động tạo</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Preview with stats */}
          {step === 2 && stats && (
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                File: <span className="font-medium">{fileName}</span>
                <span className="text-gray-400 ml-2">({stats.totalRows.toLocaleString()} dòng → {stats.totalOrders.toLocaleString()} đơn hàng)</span>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                <div className="bg-green-50 rounded-lg p-2.5 text-center">
                  <div className="text-xl font-bold text-green-700">{stats.validOrders.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-600">Đơn mới</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-2.5 text-center">
                  <div className="text-xl font-bold text-yellow-700">{stats.duplicateCount.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-600">Đã tồn tại</div>
                </div>
                <div className="bg-red-50 rounded-lg p-2.5 text-center">
                  <div className="text-xl font-bold text-red-700">{stats.errorCount}</div>
                  <div className="text-[10px] text-gray-600">Lỗi</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                  <div className="text-xl font-bold text-blue-700">{stats.newCustomers.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-600">KH mới</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-2.5 text-center">
                  <div className="text-xl font-bold text-purple-700">{stats.newProducts}</div>
                  <div className="text-[10px] text-gray-600">SP mới</div>
                </div>
              </div>

              {/* Detailed stats */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div className="flex justify-between"><span className="text-gray-500">Tổng khách hàng (unique SĐT):</span><span className="font-medium">{stats.uniqueCustomers.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tổng doanh thu:</span><span className="font-bold text-green-700">{formatMoney(stats.totalRevenue)}</span></div>
                  {stats.dateRange && <div className="flex justify-between col-span-2"><span className="text-gray-500">Khoảng thời gian:</span><span className="font-medium">{stats.dateRange}</span></div>}
                </div>
                {/* Channel breakdown */}
                {Object.keys(stats.channelCounts).length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-gray-500 mb-1.5">Kênh bán hàng:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(stats.channelCounts).sort((a, b) => b[1] - a[1]).map(([ch, count]) => (
                        <span key={ch} className="px-2 py-0.5 bg-white rounded border text-xs">
                          {ch}: <span className="font-medium">{count.toLocaleString()}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Preview table — only first 20 orders */}
              <div>
                <div className="text-xs text-gray-500 mb-1">
                  Xem trước {previewOrders.length} / {parsedOrders.length} đơn hàng
                </div>
                <div className="max-h-64 overflow-auto border rounded-lg">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5 text-gray-500">Mã đơn</th>
                        <th className="text-left px-2 py-1.5 text-gray-500">Ngày</th>
                        <th className="text-left px-2 py-1.5 text-gray-500">Khách hàng</th>
                        <th className="text-left px-2 py-1.5 text-gray-500 hidden md:table-cell">Sản phẩm</th>
                        <th className="text-right px-2 py-1.5 text-gray-500">Tổng tiền</th>
                        <th className="text-left px-2 py-1.5 text-gray-500">TT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewOrders.map((o, i) => (
                        <tr key={i} className={`border-t ${o.errors.length > 0 ? 'bg-red-50' : o.isDuplicate ? 'bg-yellow-50' : ''}`}>
                          <td className="px-2 py-1.5 font-mono font-medium text-[11px]">{o.order_code}</td>
                          <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">
                            {o.created_at ? new Date(o.created_at).toLocaleDateString('vi-VN') : '—'}
                          </td>
                          <td className="px-2 py-1.5 truncate max-w-[100px]">{o.customer_name || '—'}</td>
                          <td className="px-2 py-1.5 truncate max-w-[140px] hidden md:table-cell">
                            {o.items.map(it => it.product_name).join(', ') || '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium">{formatMoney(o.total_amount)}</td>
                          <td className="px-2 py-1.5">
                            {o.errors.length > 0 ? <span className="text-red-600">Lỗi</span>
                              : o.isDuplicate ? <span className="text-yellow-600">Trùng</span>
                              : <span className="text-green-600">Mới</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedOrders.length > 20 && !showAllPreview && (
                  <button onClick={() => setShowAllPreview(true)} className="text-xs text-orange-600 hover:underline mt-1">
                    Xem thêm (tối đa 100 dòng)...
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setStep(1); setParsedOrders([]); setStats(null); }} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Quay lại</button>
                <button onClick={doImport}
                  disabled={stats.validOrders === 0}
                  className={`flex-1 px-4 py-2.5 text-white rounded-lg text-sm font-medium ${stats.validOrders === 0 ? 'bg-gray-300' : 'bg-green-600 hover:bg-green-700'}`}>
                  Import {stats.validOrders.toLocaleString()} đơn hàng
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Importing / Result */}
          {step === 3 && (
            <div className="space-y-4 py-4">
              {!result ? (
                <>
                  <div className="text-center text-sm text-gray-600">
                    {progressText || 'Đang import đơn hàng...'}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div className="bg-orange-500 h-3 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="text-center text-sm font-medium text-orange-600">{progress}%</div>
                  <div className="text-center text-xs text-gray-400">
                    Vui lòng không đóng trang. Import theo batch {BATCH_SIZE} đơn/lần.
                  </div>
                  <button onClick={handleCancel}
                    className="w-full px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium">
                    Dừng import
                  </button>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <div className="text-5xl mb-3">{result.cancelled ? '⚠️' : '✅'}</div>
                    <h4 className="text-lg font-bold text-gray-800 mb-1">
                      {result.cancelled ? 'Import đã dừng!' : 'Import hoàn tất!'}
                    </h4>
                    <div className="text-sm text-gray-500">Thời gian: {formatDuration(result.duration)}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-700">{result.insertedOrders.toLocaleString()}</div>
                      <div className="text-xs text-gray-600">Đơn hàng mới</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-700">{result.insertedCustomers.toLocaleString()}</div>
                      <div className="text-xs text-gray-600">Khách hàng mới</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-purple-700">{result.insertedProducts}</div>
                      <div className="text-xs text-gray-600">Sản phẩm mới</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-gray-600">{result.skipped.toLocaleString()}</div>
                      <div className="text-xs text-gray-600">Bỏ qua (trùng)</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-700">{result.errors}</div>
                      <div className="text-xs text-gray-600">Lỗi</div>
                    </div>
                  </div>
                  {result.comboCount > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
                      {result.comboCount} sản phẩm combo cần thiết lập SP con thủ công tại module Kho.
                    </div>
                  )}
                  {errorLog.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="text-sm font-medium text-red-700 mb-1">Chi tiết lỗi ({errorLog.length}):</div>
                      <div className="max-h-32 overflow-y-auto text-xs text-red-600 space-y-0.5">
                        {errorLog.slice(0, 50).map((e, i) => <div key={i}>{e}</div>)}
                        {errorLog.length > 50 && <div className="text-gray-500">...và {errorLog.length - 50} lỗi khác</div>}
                      </div>
                    </div>
                  )}
                  <button onClick={handleClose} className="w-full px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium">
                    Đóng
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

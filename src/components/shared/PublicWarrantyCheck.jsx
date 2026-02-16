import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { formatDateVN, getTodayVN } from '../../utils/dateUtils';
import { formatMoney } from '../../utils/formatUtils';
import { repairStatuses } from '../../constants/warrantyConstants';

// ---- Rate limiting (client-side) ----
const RATE_KEY = 'wc_rate';
const RATE_MAX = 10;

function checkRateLimit() {
  try {
    const stored = JSON.parse(localStorage.getItem(RATE_KEY) || '{}');
    const now = Date.now();
    const entries = (stored.entries || []).filter(t => now - t < 60000);
    if (entries.length >= RATE_MAX) return false;
    entries.push(now);
    localStorage.setItem(RATE_KEY, JSON.stringify({ entries }));
    return true;
  } catch { return true; }
}

// ---- Phone masking: 0912***456 ----
function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || '';
  return phone.slice(0, 4) + '***' + phone.slice(-3);
}

// ---- Repair status stepper ----
const REPAIR_STEPS = [
  { key: 'received', label: 'Tiếp nhận', icon: '📥' },
  { key: 'diagnosing', label: 'Chẩn đoán', icon: '🔍' },
  { key: 'repairing', label: 'Đang sửa', icon: '🔧' },
  { key: 'done', label: 'Hoàn thành', icon: '✅' },
  { key: 'returned', label: 'Đã trả', icon: '📤' },
];

// ---- Helpers ----
function calcWarrantyEnd(startDate, months) {
  if (!startDate || !months) return null;
  const parts = startDate.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1 + months, parts[2]);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Loading skeleton ----
function Skeleton({ className }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className || ''}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-5 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="bg-white rounded-xl shadow p-5 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function PublicWarrantyCheck({ tenant }) {
  const [activeTab, setActiveTab] = useState('phone'); // phone, lookup, repair, contact
  const [loading, setLoading] = useState(false);

  // Tab A: Theo SĐT (2 nguồn dữ liệu)
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSearched, setPhoneSearched] = useState(false);
  const [phoneItems, setPhoneItems] = useState([]);
  const [phoneStats, setPhoneStats] = useState({ registered: 0, unregistered: 0, expired: 0 });
  const [selectedPhoneItem, setSelectedPhoneItem] = useState(null);
  const [phoneRepairs, setPhoneRepairs] = useState([]);

  // Tab B: Tra cứu Serial
  const [searchInput, setSearchInput] = useState('');
  const [searched, setSearched] = useState(false);
  const [serial, setSerial] = useState(null);
  const [product, setProduct] = useState(null);
  const [warranty, setWarranty] = useState(null);
  const [repairs, setRepairs] = useState([]);
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState(false);
  const [actForm, setActForm] = useState({ phone: '', name: '' });
  const [actError, setActError] = useState('');

  // Tab C: Sửa chữa
  const [repairInput, setRepairInput] = useState('');
  const [repairResult, setRepairResult] = useState(null);
  const [repairSearched, setRepairSearched] = useState(false);

  // Tab D: Liên hệ + Gửi yêu cầu
  const [reqForm, setReqForm] = useState({ serial: '', name: '', phone: '', desc: '', images: [] });
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqSuccess, setReqSuccess] = useState(false);
  const [reqError, setReqError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // QR Scanner
  const [showScanner, setShowScanner] = useState(false);
  const fileInputRef = useRef(null);

  // ---- Derived helpers ----
  const today = getTodayVN();
  const getDaysRemaining = (endDate) => {
    if (!endDate) return 0;
    const end = new Date(endDate + 'T23:59:59+07:00');
    return Math.max(0, Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24)));
  };
  const getWarrantyProgress = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate + 'T00:00:00+07:00');
    const end = new Date(endDate + 'T23:59:59+07:00');
    const now = new Date();
    const total = end - start;
    const elapsed = now - start;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  // Parse serial from URL hash → vào tab Tra cứu Serial
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/#warranty-check\/(.+)/);
    if (match) {
      const val = decodeURIComponent(match[1]);
      setSearchInput(val);
      setActiveTab('lookup');
      setTimeout(() => doSerialSearch(val), 200);
    }
  }, []);

  // ---- QR Scanner ----
  useEffect(() => {
    if (!showScanner) return;
    let html5QrCode = null;
    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        html5QrCode = new Html5Qrcode('qr-reader-public');
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => {
            html5QrCode.stop().catch(() => {});
            setShowScanner(false);
            // Trích serial từ URL hoặc dùng trực tiếp
            const urlMatch = text.match(/#warranty-check\/(.+)/);
            const serialValue = urlMatch ? decodeURIComponent(urlMatch[1]) : text;
            setSearchInput(serialValue);
            setActiveTab('lookup');
            doSerialSearch(serialValue);
          },
          () => {}
        );
      } catch (err) {
        console.error('Scanner error:', err);
      }
    };
    startScanner();
    return () => {
      if (html5QrCode) html5QrCode.stop().catch(() => {});
    };
  }, [showScanner]);

  // ============================================================
  // TAB A: THEO SĐT — 2 nguồn dữ liệu
  // ============================================================
  const searchByPhone = async () => {
    const q = phoneInput.trim();
    if (!q || !tenant?.id) return;
    if (!checkRateLimit()) return;
    setLoading(true);
    setPhoneSearched(true);
    setPhoneItems([]);
    setSelectedPhoneItem(null);
    setPhoneStats({ registered: 0, unregistered: 0, expired: 0 });
    setPhoneRepairs([]);

    try {
      // Query song song: warranty_cards + orders
      const [cardsRes, ordersRes] = await Promise.all([
        // Nguồn 1: warranty_cards (SP đã quét QR liên kết serial)
        supabase
          .from('warranty_cards').select('*')
          .eq('tenant_id', tenant.id)
          .eq('customer_phone', q)
          .order('created_at', { ascending: false }),
        // Nguồn 2: orders + order_items (đơn hàng có SĐT)
        supabase
          .from('orders')
          .select('id, order_number, created_at, status, customer_name, customer_phone, order_items(id, product_id, product_name, product_sku, quantity, unit_price, warranty_months)')
          .eq('tenant_id', tenant.id)
          .eq('customer_phone', q)
          .in('status', ['completed', 'delivered'])
          .order('created_at', { ascending: false })
      ]);

      const cards = cardsRes.data || [];
      const orders = ordersRes.data || [];

      // ---- Gộp kết quả ----
      const items = [];

      // 1. Thêm warranty_cards → đã đăng ký serial
      cards.forEach(card => {
        const wEnd = card.warranty_end;
        const isActive = card.status !== 'voided' && wEnd >= today;
        const isExpired = card.status !== 'voided' && wEnd < today;
        items.push({
          type: 'registered',
          productName: card.product_name,
          productId: card.product_id,
          serial: card.serial_number,
          cardNumber: card.card_number,
          warrantyStart: card.warranty_start,
          warrantyEnd: card.warranty_end,
          warrantyMonths: card.warranty_months,
          isActive,
          isExpired,
          isVoided: card.status === 'voided',
          orderDate: card.warranty_start,
          quantity: 1,
          rawCard: card
        });
      });

      // 2. Đếm đã đăng ký theo product_id
      const registeredByProduct = {};
      cards.forEach(card => {
        if (card.product_id) {
          registeredByProduct[card.product_id] = (registeredByProduct[card.product_id] || 0) + 1;
        }
      });

      // 3. Thêm order_items chưa có warranty_card → chưa đăng ký serial
      const usedCounts = { ...registeredByProduct };
      orders.forEach(order => {
        (order.order_items || []).forEach(item => {
          const already = usedCounts[item.product_id] || 0;
          const unregisteredQty = item.quantity - Math.min(already, item.quantity);
          usedCounts[item.product_id] = Math.max(0, already - item.quantity);

          if (unregisteredQty > 0) {
            const orderDate = order.created_at?.split('T')[0] || today;
            const wMonths = item.warranty_months || 12;
            const wEnd = calcWarrantyEnd(orderDate, wMonths);
            items.push({
              type: 'unregistered',
              productName: item.product_name,
              productId: item.product_id,
              quantity: unregisteredQty,
              orderDate,
              orderNumber: order.order_number,
              warrantyStart: orderDate,
              warrantyEnd: wEnd,
              warrantyMonths: wMonths,
              isActive: wEnd >= today,
              isExpired: wEnd < today,
              isVoided: false,
              serial: null,
              cardNumber: null,
              rawCard: null
            });
          }
        });
      });

      // Thống kê
      const registered = items.filter(i => i.type === 'registered').length;
      const unregistered = items.filter(i => i.type === 'unregistered').reduce((sum, i) => sum + (i.quantity || 1), 0);
      const expired = items.filter(i => i.isExpired).length;

      setPhoneItems(items);
      setPhoneStats({ registered, unregistered, expired });
    } catch (err) { console.error('Phone search error:', err); }
    setLoading(false);
  };

  const openPhoneDetail = async (item) => {
    setSelectedPhoneItem(item);
    setPhoneRepairs([]);
    if (item.type === 'registered' && item.rawCard) {
      try {
        const { data: reps } = await supabase
          .from('warranty_repairs').select('*')
          .eq('tenant_id', tenant.id).eq('warranty_card_id', item.rawCard.id)
          .order('created_at', { ascending: false });
        setPhoneRepairs(reps || []);
      } catch { /* ignore */ }
    }
  };

  // Quét QR từ SP chưa đăng ký → chuyển sang tab Serial
  const handleScanForRegistration = () => {
    // Giữ SĐT để tự điền khi chuyển tab
    if (phoneInput.trim()) {
      setActForm(prev => ({ ...prev, phone: phoneInput.trim() }));
    }
    setShowScanner(true);
  };

  // ============================================================
  // TAB B: TRA CỨU SERIAL
  // ============================================================
  const doSerialSearch = useCallback(async (query) => {
    const q = (query || searchInput).trim();
    if (!q || !tenant?.id) return;
    if (!checkRateLimit()) return;
    setLoading(true);
    setSearched(true);
    setSerial(null);
    setProduct(null);
    setWarranty(null);
    setRepairs([]);
    setShowPhoneForm(false);
    setActivationSuccess(false);
    setActError('');

    try {
      // 1. Tìm theo serial_number
      let { data: serialData } = await supabase
        .from('product_serials')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('serial_number', q)
        .maybeSingle();

      // 2. Nếu không tìm thấy, thử card_number
      if (!serialData) {
        const { data: card } = await supabase
          .from('warranty_cards').select('*')
          .eq('tenant_id', tenant.id).eq('card_number', q)
          .maybeSingle();
        if (card) {
          setWarranty(card);
          setProduct({ name: card.product_name, sku: card.product_sku });
          if (card.serial_id) {
            const { data: s } = await supabase.from('product_serials').select('*').eq('id', card.serial_id).maybeSingle();
            if (s) setSerial(s);
          }
          const { data: reps } = await supabase
            .from('warranty_repairs').select('*')
            .eq('tenant_id', tenant.id).eq('warranty_card_id', card.id)
            .order('created_at', { ascending: false });
          setRepairs(reps || []);
          setLoading(false);
          return;
        }
      }

      if (!serialData) { setLoading(false); return; }

      // Tải thông tin sản phẩm
      if (serialData.product_id) {
        const { data: p } = await supabase.from('products')
          .select('id, name, sku, brand, warranty_months, image_url')
          .eq('id', serialData.product_id).maybeSingle();
        setProduct(p);
      }
      setSerial(serialData);

      // Kiểm tra warranty_card
      const { data: existingCards } = await supabase
        .from('warranty_cards').select('*')
        .eq('tenant_id', tenant.id).eq('serial_id', serialData.id)
        .order('created_at', { ascending: false }).limit(1);
      const card = existingCards?.[0] || null;
      setWarranty(card);

      if (card) {
        // Đã đăng ký → hiện thông tin BH
        const { data: reps } = await supabase
          .from('warranty_repairs').select('*')
          .eq('tenant_id', tenant.id).eq('warranty_card_id', card.id)
          .order('created_at', { ascending: false });
        setRepairs(reps || []);
      } else if (['in_stock', 'sold'].includes(serialData.status)) {
        // Chưa đăng ký → hiện form nhập SĐT
        setShowPhoneForm(true);
        // Tự điền SĐT nếu đã có từ tab Theo SĐT
        if (phoneInput.trim()) {
          setActForm(prev => ({ ...prev, phone: phoneInput.trim() }));
        }
      }
    } catch (err) { console.error('Search error:', err); }
    setLoading(false);
  }, [searchInput, tenant, phoneInput]);

  // ---- Đăng ký serial: nhập SĐT → tìm đơn hàng → tạo warranty_card ----
  const handleActivateSerial = async () => {
    setActError('');
    if (!actForm.phone.trim() || actForm.phone.trim().length < 9) return setActError('Số điện thoại không hợp lệ');
    if (!serial?.id || !tenant?.id) return setActError('Lỗi hệ thống');
    if (!checkRateLimit()) return setActError('Quá nhiều yêu cầu. Vui lòng thử lại sau.');

    setActivating(true);
    try {
      const phone = actForm.phone.trim();
      const warrantyMonths = product?.warranty_months || 12;
      let warrantyStart = today;
      let customerName = actForm.name.trim() || phone;
      let matchedOrderId = null;

      // Tìm đơn hàng có SĐT + SP cùng loại
      if (serial.product_id) {
        // Bước 1: tìm order_items có product_id khớp
        const { data: matchItems } = await supabase
          .from('order_items')
          .select('order_id')
          .eq('product_id', serial.product_id);

        const orderIds = (matchItems || []).map(i => i.order_id);

        if (orderIds.length > 0) {
          // Bước 2: tìm order có SĐT khớp
          const { data: matchOrders } = await supabase
            .from('orders')
            .select('id, created_at, customer_name, customer_phone')
            .eq('tenant_id', tenant.id)
            .eq('customer_phone', phone)
            .in('id', orderIds)
            .in('status', ['completed', 'delivered'])
            .order('created_at', { ascending: false })
            .limit(1);

          if (matchOrders?.length > 0) {
            // Tìm thấy đơn → BH từ ngày mua
            warrantyStart = matchOrders[0].created_at?.split('T')[0] || today;
            customerName = matchOrders[0].customer_name || customerName;
            matchedOrderId = matchOrders[0].id;
          }
        }
      }
      // Không tìm thấy đơn → BH từ hôm nay (fallback)

      const warrantyEnd = calcWarrantyEnd(warrantyStart, warrantyMonths);

      // Tạo mã thẻ BH
      const dateStr = today.replace(/-/g, '');
      const prefix = `BH-${dateStr}-`;
      const { data: lastCard } = await supabase.from('warranty_cards').select('card_number')
        .eq('tenant_id', tenant.id).like('card_number', `${prefix}%`)
        .order('card_number', { ascending: false }).limit(1);
      let lastNum = 0;
      if (lastCard?.[0]) { const p = lastCard[0].card_number.split('-'); lastNum = parseInt(p[p.length - 1]) || 0; }
      const cardNumber = `${prefix}${String(lastNum + 1).padStart(3, '0')}`;

      // Cập nhật serial
      await supabase.from('product_serials').update({
        status: 'sold',
        customer_name: customerName,
        customer_phone: phone,
        warranty_start: warrantyStart,
        warranty_end: warrantyEnd,
        updated_at: new Date().toISOString()
      }).eq('id', serial.id);

      // Tạo warranty_card
      const { data: newCard } = await supabase.from('warranty_cards').insert([{
        tenant_id: tenant.id,
        card_number: cardNumber,
        serial_id: serial.id,
        product_id: serial.product_id,
        product_name: product?.name || '',
        product_sku: product?.sku || '',
        serial_number: serial.serial_number,
        customer_name: customerName,
        customer_phone: phone,
        order_id: matchedOrderId || serial.sold_order_id || null,
        warranty_start: warrantyStart,
        warranty_end: warrantyEnd,
        warranty_months: warrantyMonths,
        status: 'active',
        created_by: 'customer_qr_activate'
      }]).select().single();

      setWarranty(newCard);
      setShowPhoneForm(false);
      setActivationSuccess(true);
      setSerial(prev => ({ ...prev, status: 'sold', warranty_start: warrantyStart, warranty_end: warrantyEnd }));
    } catch (err) {
      console.error('Activation error:', err);
      setActError('Có lỗi xảy ra. Vui lòng thử lại.');
    }
    setActivating(false);
  };

  // ============================================================
  // TAB C: TRẠNG THÁI SỬA CHỮA
  // ============================================================
  const searchRepair = async () => {
    const q = repairInput.trim();
    if (!q || !tenant?.id) return;
    if (!checkRateLimit()) return;
    setLoading(true);
    setRepairSearched(true);
    setRepairResult(null);
    try {
      let { data: rep } = await supabase
        .from('warranty_repairs').select('*')
        .eq('tenant_id', tenant.id).eq('repair_number', q)
        .maybeSingle();
      if (!rep) {
        const { data: reps } = await supabase
          .from('warranty_repairs').select('*')
          .eq('tenant_id', tenant.id).eq('serial_number', q)
          .order('created_at', { ascending: false }).limit(1);
        rep = reps?.[0] || null;
      }
      setRepairResult(rep);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  // ============================================================
  // TAB D: LIÊN HỆ + GỬI YÊU CẦU
  // ============================================================
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (reqForm.images.length + files.length > 3) {
      alert('Tối đa 3 ảnh');
      return;
    }
    setUploadingImage(true);
    const newImages = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `warranty-requests/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('warranty-images').upload(path, file);
      if (!error) {
        const { data: urlData } = supabase.storage.from('warranty-images').getPublicUrl(path);
        newImages.push(urlData.publicUrl);
      }
    }
    setReqForm(prev => ({ ...prev, images: [...prev.images, ...newImages] }));
    setUploadingImage(false);
  };

  const handleSubmitRequest = async () => {
    setReqError('');
    if (!reqForm.name.trim()) return setReqError('Vui lòng nhập họ tên');
    if (!reqForm.phone.trim() || reqForm.phone.trim().length < 9) return setReqError('Số điện thoại không hợp lệ');
    if (!reqForm.desc.trim()) return setReqError('Vui lòng mô tả lỗi / vấn đề');
    if (!checkRateLimit()) return setReqError('Quá nhiều yêu cầu. Vui lòng thử lại sau.');

    setReqSubmitting(true);
    try {
      let serialId = null;
      if (reqForm.serial.trim()) {
        const { data: s } = await supabase.from('product_serials').select('id')
          .eq('tenant_id', tenant.id).eq('serial_number', reqForm.serial.trim()).maybeSingle();
        if (s) serialId = s.id;
      }

      const { error } = await supabase.from('warranty_requests').insert([{
        tenant_id: tenant.id,
        serial_id: serialId,
        serial_number: reqForm.serial.trim() || null,
        customer_name: reqForm.name.trim(),
        customer_phone: reqForm.phone.trim(),
        description: reqForm.desc.trim(),
        images: reqForm.images
      }]);
      if (error) throw error;
      setReqSuccess(true);
      setReqForm({ serial: '', name: '', phone: '', desc: '', images: [] });
    } catch (err) {
      console.error(err);
      setReqError('Có lỗi xảy ra. Vui lòng thử lại.');
    }
    setReqSubmitting(false);
  };

  // ---- Tab items (thứ tự mới: SĐT → Serial → Sửa chữa → Liên hệ) ----
  const tabs = [
    { id: 'phone', icon: '📱', label: 'Theo SĐT' },
    { id: 'lookup', icon: '🔍', label: 'Serial' },
    { id: 'repair', icon: '🔧', label: 'Sửa chữa' },
    { id: 'contact', icon: '📞', label: 'Liên hệ' },
  ];

  // Auto-fill serial vào form yêu cầu
  useEffect(() => {
    if (serial?.serial_number && activeTab === 'contact') {
      setReqForm(prev => ({ ...prev, serial: serial.serial_number }));
    }
  }, [activeTab, serial]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1B5E20] to-[#2E7D32] text-white py-6 px-4">
        <div className="max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-bold tracking-wide mb-0.5">HOÀNG NAM AUDIO</h1>
          <p className="text-green-200 text-xs tracking-wider">Hệ thống tra cứu bảo hành</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="max-w-lg mx-auto -mt-3 px-4">
        <div className="bg-white rounded-xl shadow-lg flex overflow-hidden">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-3 text-center transition-all ${
                activeTab === t.id
                  ? 'bg-[#1B5E20] text-white font-bold'
                  : 'text-gray-600 hover:bg-green-50'
              }`}
            >
              <div className="text-lg">{t.icon}</div>
              <div className="text-[10px] mt-0.5 font-medium">{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4">

        {/* ============================================================ */}
        {/* TAB A: THEO SĐT — 2 nguồn dữ liệu */}
        {/* ============================================================ */}
        {activeTab === 'phone' && (
          <div className="space-y-4">
            {/* Tìm kiếm */}
            <div className="bg-white rounded-xl shadow p-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">Nhập số điện thoại đã mua hàng</label>
              <div className="flex gap-2">
                <input value={phoneInput} onChange={e => setPhoneInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchByPhone()}
                  placeholder="0901234567" type="tel"
                  className="flex-1 border-2 border-green-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B5E20]" autoFocus />
                <button onClick={searchByPhone} disabled={loading || !phoneInput.trim()}
                  className="px-5 py-2.5 bg-[#1B5E20] text-white rounded-lg font-medium text-sm hover:bg-[#2E7D32] disabled:opacity-50">
                  {loading ? '...' : 'Tìm'}
                </button>
              </div>
            </div>

            {loading && <LoadingSkeleton />}

            {/* Không tìm thấy */}
            {phoneSearched && !loading && phoneItems.length === 0 && (
              <div className="bg-white rounded-xl shadow p-6 text-center">
                <div className="text-4xl mb-2">📱</div>
                <div className="text-gray-600 font-medium">Không tìm thấy sản phẩm nào</div>
                <div className="text-gray-400 text-sm mt-1">Số điện thoại chưa có đơn hàng hoặc bảo hành</div>
              </div>
            )}

            {/* Thống kê tổng */}
            {phoneItems.length > 0 && !selectedPhoneItem && (
              <>
                <div className="bg-gradient-to-r from-green-50 to-yellow-50 rounded-xl p-4 grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{phoneStats.registered}</div>
                    <div className="text-gray-500 text-xs">Đã đăng ký</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">{phoneStats.unregistered}</div>
                    <div className="text-gray-500 text-xs">Chưa đăng ký</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-500">{phoneStats.expired}</div>
                    <div className="text-gray-500 text-xs">Hết hạn BH</div>
                  </div>
                </div>

                {/* Danh sách sản phẩm */}
                <div className="space-y-2">
                  {phoneItems.map((item, idx) => (
                    <div key={idx} onClick={() => openPhoneDetail(item)}
                      className={`bg-white rounded-xl shadow p-4 cursor-pointer hover:shadow-md transition border-l-4 ${
                        item.type === 'registered'
                          ? item.isActive ? 'border-green-500' : item.isExpired ? 'border-gray-300' : 'border-red-400'
                          : 'border-yellow-400'
                      }`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{item.productName}</div>
                          {item.type === 'registered' ? (
                            <div className="text-xs text-gray-500 font-mono">{item.serial}</div>
                          ) : (
                            <div className="text-xs text-yellow-600 font-medium">⚠️ Chưa đăng ký serial</div>
                          )}
                          <div className="text-xs text-gray-400 mt-0.5">Mua: {formatDateVN(item.orderDate)}</div>
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          {item.type === 'registered' ? (
                            <>
                              <span className={`text-xs font-bold ${item.isActive ? 'text-green-600' : item.isExpired ? 'text-gray-500' : 'text-red-500'}`}>
                                {item.isActive ? `Còn ${getDaysRemaining(item.warrantyEnd)} ngày` : item.isExpired ? 'Hết hạn' : 'Đã hủy'}
                              </span>
                              <div className="text-xs text-gray-400 mt-0.5">{item.cardNumber}</div>
                            </>
                          ) : (
                            <>
                              <span className={`text-xs font-bold ${item.isActive ? 'text-yellow-600' : 'text-gray-500'}`}>
                                {item.isActive ? `BH còn ${getDaysRemaining(item.warrantyEnd)} ngày` : 'Hết hạn BH'}
                              </span>
                              {item.quantity > 1 && <div className="text-xs text-gray-400">x{item.quantity}</div>}
                            </>
                          )}
                        </div>
                      </div>
                      {/* Progress bar */}
                      {item.warrantyStart && item.warrantyEnd && item.isActive && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${item.type === 'registered' ? 'bg-green-500' : 'bg-yellow-400'}`}
                              style={{ width: `${100 - getWarrantyProgress(item.warrantyStart, item.warrantyEnd)}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Chi tiết SP đã đăng ký */}
            {selectedPhoneItem && selectedPhoneItem.type === 'registered' && (
              <div className="space-y-4">
                <button onClick={() => setSelectedPhoneItem(null)} className="text-sm text-[#1B5E20] font-medium">&larr; Quay lại</button>
                {(() => {
                  const c = selectedPhoneItem;
                  return (
                    <div className={`rounded-xl shadow-lg p-5 ${c.isActive ? 'bg-green-50 border-2 border-green-400' : 'bg-gray-50 border-2 border-gray-300'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-bold text-lg mb-1">{c.productName}</div>
                          <div className="text-sm text-gray-500 font-mono">{c.serial}</div>
                        </div>
                        <div className="text-3xl">{c.isActive ? '🟢' : c.isExpired ? '🔴' : '🟡'}</div>
                      </div>
                      <div className={`text-center py-2 rounded-lg font-bold text-sm ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                        {c.isActive ? `CÒN BẢO HÀNH — ${getDaysRemaining(c.warrantyEnd)} ngày` : c.isExpired ? 'HẾT HẠN BẢO HÀNH' : 'ĐÃ HỦY'}
                      </div>
                      {c.isActive && c.warrantyStart && c.warrantyEnd && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{formatDateVN(c.warrantyStart)}</span>
                            <span className="font-bold text-[#1B5E20]">{getDaysRemaining(c.warrantyEnd)} ngày còn lại</span>
                            <span>{formatDateVN(c.warrantyEnd)}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className="bg-[#1B5E20] h-2.5 rounded-full transition-all" style={{ width: `${100 - getWarrantyProgress(c.warrantyStart, c.warrantyEnd)}%` }} />
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                        <div><span className="text-gray-500">Số thẻ:</span><div className="font-medium">{c.cardNumber}</div></div>
                        <div><span className="text-gray-500">Thời hạn:</span><div className="font-medium">{c.warrantyMonths} tháng</div></div>
                        <div><span className="text-gray-500">Từ:</span><div className="font-medium">{formatDateVN(c.warrantyStart)}</div></div>
                        <div><span className="text-gray-500">Đến:</span><div className="font-medium">{formatDateVN(c.warrantyEnd)}</div></div>
                      </div>
                    </div>
                  );
                })()}

                {/* Lịch sử sửa chữa */}
                {phoneRepairs.length > 0 && (
                  <div className="bg-white rounded-xl shadow p-4">
                    <h3 className="font-bold text-sm text-gray-700 mb-2">Lịch sử sửa chữa</h3>
                    {phoneRepairs.map(r => (
                      <div key={r.id} className="border-l-4 border-blue-400 pl-3 py-2 mb-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{r.repair_number}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${repairStatuses[r.status]?.color || 'bg-gray-100'}`}>
                            {repairStatuses[r.status]?.label || r.status}
                          </span>
                        </div>
                        {r.symptom && <div className="text-xs text-gray-500 mt-0.5">{r.symptom}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Gửi yêu cầu BH */}
                {selectedPhoneItem.isActive && (
                  <button onClick={() => { setActiveTab('contact'); setReqForm(prev => ({ ...prev, serial: selectedPhoneItem.serial || '', phone: phoneInput.trim() })); }}
                    className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm">
                    Gửi yêu cầu bảo hành
                  </button>
                )}
              </div>
            )}

            {/* Chi tiết SP chưa đăng ký */}
            {selectedPhoneItem && selectedPhoneItem.type === 'unregistered' && (
              <div className="space-y-4">
                <button onClick={() => setSelectedPhoneItem(null)} className="text-sm text-[#1B5E20] font-medium">&larr; Quay lại</button>

                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-lg font-bold text-gray-800">{selectedPhoneItem.productName}</div>
                      {selectedPhoneItem.orderNumber && (
                        <div className="text-xs text-gray-500">Đơn hàng: {selectedPhoneItem.orderNumber}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-0.5">Ngày mua: {formatDateVN(selectedPhoneItem.orderDate)}</div>
                    </div>
                    <div className="text-3xl">⚠️</div>
                  </div>

                  <div className="text-center py-2.5 bg-yellow-100 rounded-lg text-yellow-700 font-bold text-sm mb-3">
                    CHƯA ĐĂNG KÝ SERIAL
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Thời hạn BH:</span><div className="font-medium">{selectedPhoneItem.warrantyMonths} tháng</div></div>
                    <div><span className="text-gray-500">Trạng thái:</span><div className={`font-medium ${selectedPhoneItem.isActive ? 'text-yellow-600' : 'text-gray-500'}`}>
                      {selectedPhoneItem.isActive ? `Còn ${getDaysRemaining(selectedPhoneItem.warrantyEnd)} ngày` : 'Hết hạn'}
                    </div></div>
                    <div><span className="text-gray-500">BH từ:</span><div className="font-medium">{formatDateVN(selectedPhoneItem.warrantyStart)}</div></div>
                    <div><span className="text-gray-500">BH đến:</span><div className="font-medium">{formatDateVN(selectedPhoneItem.warrantyEnd)}</div></div>
                  </div>

                  {/* Progress bar */}
                  {selectedPhoneItem.isActive && selectedPhoneItem.warrantyStart && selectedPhoneItem.warrantyEnd && (
                    <div className="mt-3">
                      <div className="w-full bg-yellow-200 rounded-full h-2">
                        <div className="bg-yellow-500 h-2 rounded-full" style={{ width: `${100 - getWarrantyProgress(selectedPhoneItem.warrantyStart, selectedPhoneItem.warrantyEnd)}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow p-5 text-center">
                  <p className="text-sm text-gray-600 mb-3">Quét mã QR trên sản phẩm để đăng ký serial và kích hoạt bảo hành đầy đủ</p>
                  <button onClick={handleScanForRegistration}
                    className="w-full py-3 bg-[#1B5E20] hover:bg-[#2E7D32] text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9V5a2 2 0 012-2h4M15 3h4a2 2 0 012 2v4M21 15v4a2 2 0 01-2 2h-4M9 21H5a2 2 0 01-2-2v-4" /></svg>
                    Quét QR đăng ký serial
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB B: TRA CỨU SERIAL */}
        {/* ============================================================ */}
        {activeTab === 'lookup' && (
          <div className="space-y-4">
            {/* Tìm kiếm */}
            <div className="bg-white rounded-xl shadow p-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">Nhập mã serial hoặc số thẻ BH</label>
              <div className="flex gap-2">
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSerialSearch()}
                  placeholder="VD: SN-12345 hoặc BH-20250101-001"
                  className="flex-1 border-2 border-green-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B5E20]"
                  autoFocus
                />
                <button
                  onClick={() => setShowScanner(true)}
                  className="px-3 py-2.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
                  title="Quét QR"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9V5a2 2 0 012-2h4M15 3h4a2 2 0 012 2v4M21 15v4a2 2 0 01-2 2h-4M9 21H5a2 2 0 01-2-2v-4" /></svg>
                </button>
                <button
                  onClick={() => doSerialSearch()}
                  disabled={loading || !searchInput.trim()}
                  className="px-5 py-2.5 bg-[#1B5E20] text-white rounded-lg font-medium text-sm hover:bg-[#2E7D32] disabled:opacity-50"
                >
                  {loading ? '...' : 'Tìm'}
                </button>
              </div>
            </div>

            {/* QR Scanner */}
            {showScanner && (
              <div className="bg-white rounded-xl shadow p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-sm">Quét mã QR / Barcode</span>
                  <button onClick={() => setShowScanner(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>
                <div id="qr-reader-public" className="rounded-lg overflow-hidden" />
              </div>
            )}

            {loading && <LoadingSkeleton />}

            {/* Đăng ký thành công */}
            {activationSuccess && warranty && (
              <div className="bg-green-50 border-2 border-green-400 rounded-xl p-5 text-center">
                <div className="text-4xl mb-2">🎉</div>
                <div className="text-[#1B5E20] font-bold text-lg mb-1">Đăng ký bảo hành thành công!</div>
                <div className="text-green-600 text-sm mb-3">Số thẻ: <span className="font-bold text-base">{warranty.card_number}</span></div>
                <div className="bg-white rounded-lg p-4 text-left text-sm space-y-1 border">
                  <div><span className="text-gray-500">Sản phẩm:</span> <span className="font-medium">{warranty.product_name}</span></div>
                  <div><span className="text-gray-500">Serial:</span> <span className="font-medium font-mono">{warranty.serial_number}</span></div>
                  <div><span className="text-gray-500">Bảo hành:</span> <span className="font-medium">{warranty.warranty_months} tháng</span></div>
                  <div><span className="text-gray-500">Từ ngày:</span> <span className="font-medium">{formatDateVN(warranty.warranty_start)}</span></div>
                  <div><span className="text-gray-500">Đến ngày:</span> <span className="font-medium">{formatDateVN(warranty.warranty_end)}</span></div>
                </div>
                <p className="text-xs text-gray-400 mt-3">Chụp màn hình này để lưu thông tin bảo hành</p>
              </div>
            )}

            {/* Không tìm thấy serial */}
            {searched && !loading && !serial && !warranty && !activationSuccess && (
              <div className="bg-white rounded-xl shadow p-6 text-center">
                <div className="text-4xl mb-2">❌</div>
                <div className="text-gray-700 font-medium">Mã serial không hợp lệ</div>
                <div className="text-gray-400 text-sm mt-1">Vui lòng kiểm tra lại mã serial hoặc liên hệ cửa hàng</div>
              </div>
            )}

            {/* Serial chưa đăng ký → form nhập SĐT */}
            {!loading && showPhoneForm && serial && !warranty && (
              <div className="space-y-4">
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-lg font-bold text-gray-800">{product?.name || 'Sản phẩm'}</div>
                      <div className="text-sm text-gray-500 font-mono">{serial.serial_number}</div>
                      {product?.brand && <div className="text-xs text-gray-400 mt-0.5">{product.brand}</div>}
                    </div>
                    <div className="text-3xl">🛡️</div>
                  </div>
                  <div className="text-center py-2.5 bg-yellow-100 rounded-lg text-yellow-700 font-bold text-sm">
                    CHƯA ĐĂNG KÝ BẢO HÀNH
                  </div>
                  <div className="text-center text-xs text-yellow-600 mt-2">
                    Thời hạn: {product?.warranty_months || 12} tháng
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow p-5">
                  <h3 className="font-bold text-gray-800 mb-1 text-sm">Đăng ký bảo hành</h3>
                  <p className="text-xs text-gray-500 mb-3">Nhập SĐT mua hàng để hệ thống tìm đơn và tính BH từ ngày mua</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Số điện thoại *</label>
                      <input value={actForm.phone} onChange={e => setActForm(p => ({ ...p, phone: e.target.value }))}
                        placeholder="0901234567" type="tel" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B5E20]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Họ tên (nếu không tìm thấy đơn)</label>
                      <input value={actForm.name} onChange={e => setActForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Nguyễn Văn A" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B5E20]" />
                    </div>
                    {actError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">{actError}</div>}
                    <button onClick={handleActivateSerial} disabled={activating}
                      className="w-full py-3 bg-[#1B5E20] hover:bg-[#2E7D32] text-white rounded-lg font-bold text-sm disabled:opacity-50">
                      {activating ? 'Đang đăng ký...' : 'ĐĂNG KÝ BẢO HÀNH'}
                    </button>
                    <p className="text-[10px] text-gray-400 text-center">
                      Nếu tìm thấy đơn hàng khớp SĐT → BH tính từ ngày mua. Nếu không → BH từ hôm nay.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Serial đã đăng ký → hiện thông tin BH đầy đủ */}
            {!loading && warranty && !activationSuccess && (
              <div className="space-y-4">
                {(() => {
                  const isActive = warranty.status !== 'voided' && warranty.warranty_end >= today;
                  const isExpired = warranty.status !== 'voided' && warranty.warranty_end < today;
                  return (
                    <div className={`rounded-xl shadow-lg p-5 ${isActive ? 'bg-green-50 border-2 border-green-400' : isExpired ? 'bg-gray-50 border-2 border-gray-300' : 'bg-red-50 border-2 border-red-300'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-lg font-bold text-gray-800">{warranty.product_name || product?.name || 'Sản phẩm'}</div>
                          <div className="text-sm text-gray-500 font-mono">{serial?.serial_number || warranty.serial_number}</div>
                        </div>
                        <div className="text-3xl">{isActive ? '🟢' : isExpired ? '🔴' : '🟡'}</div>
                      </div>

                      <div className={`text-center py-3 rounded-lg font-bold ${isActive ? 'bg-green-100 text-green-700' : isExpired ? 'bg-gray-200 text-gray-600' : 'bg-red-100 text-red-600'}`}>
                        {isActive ? 'CÒN BẢO HÀNH' : isExpired ? 'HẾT HẠN BẢO HÀNH' : 'ĐÃ HỦY BẢO HÀNH'}
                      </div>

                      {isActive && warranty.warranty_start && warranty.warranty_end && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{formatDateVN(warranty.warranty_start)}</span>
                            <span className="font-bold text-[#1B5E20]">{getDaysRemaining(warranty.warranty_end)} ngày còn lại</span>
                            <span>{formatDateVN(warranty.warranty_end)}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className="bg-[#1B5E20] h-2.5 rounded-full transition-all" style={{ width: `${100 - getWarrantyProgress(warranty.warranty_start, warranty.warranty_end)}%` }} />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                        <div><span className="text-gray-500">Số thẻ BH:</span><div className="font-medium">{warranty.card_number}</div></div>
                        <div><span className="text-gray-500">Thời hạn:</span><div className="font-medium">{warranty.warranty_months} tháng</div></div>
                        <div><span className="text-gray-500">Từ ngày:</span><div className="font-medium">{formatDateVN(warranty.warranty_start)}</div></div>
                        <div><span className="text-gray-500">Đến ngày:</span><div className="font-medium">{formatDateVN(warranty.warranty_end)}</div></div>
                        {warranty.customer_name && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Khách hàng:</span>
                            <div className="font-medium">{warranty.customer_name} — {maskPhone(warranty.customer_phone)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Lịch sử sửa chữa */}
                {repairs.length > 0 && (
                  <div className="bg-white rounded-xl shadow p-4">
                    <h3 className="font-bold text-sm text-gray-700 mb-3">Lịch sử sửa chữa ({repairs.length})</h3>
                    <div className="space-y-3">
                      {repairs.map(r => {
                        const st = repairStatuses[r.status] || {};
                        return (
                          <div key={r.id} className="border-l-4 border-blue-400 pl-3 py-1">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-medium text-sm">{r.repair_number}</div>
                                <div className="text-xs text-gray-500">{r.symptom || ''}</div>
                                {r.solution && <div className="text-xs text-green-600 mt-0.5">KQ: {r.solution}</div>}
                              </div>
                              <div className="text-right">
                                <span className={`px-2 py-0.5 rounded-full text-xs ${st.color || 'bg-gray-100'}`}>{st.label || r.status}</span>
                                <div className="text-xs text-gray-400 mt-1">{formatDateVN(r.received_at || r.created_at)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Gửi yêu cầu BH */}
                {warranty && warranty.status !== 'voided' && warranty.warranty_end >= today && (
                  <button onClick={() => { setActiveTab('contact'); setReqForm(prev => ({ ...prev, serial: serial?.serial_number || warranty.serial_number || '' })); }}
                    className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm">
                    Gửi yêu cầu bảo hành
                  </button>
                )}
              </div>
            )}

            {/* Serial tìm thấy nhưng không có thẻ BH và không thể đăng ký */}
            {!loading && serial && !warranty && !showPhoneForm && searched && !activationSuccess && (
              <div className="bg-gray-50 border-2 border-gray-300 rounded-xl p-5 text-center">
                <div className="text-3xl mb-2">⚪</div>
                <div className="text-lg font-bold text-gray-800">{product?.name || 'Sản phẩm'}</div>
                <div className="text-sm text-gray-500 font-mono mb-2">{serial.serial_number}</div>
                <div className="text-gray-500 text-sm">Không có thẻ bảo hành</div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB C: TRẠNG THÁI SỬA CHỮA */}
        {/* ============================================================ */}
        {activeTab === 'repair' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow p-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">Nhập mã phiếu sửa chữa hoặc serial</label>
              <div className="flex gap-2">
                <input value={repairInput} onChange={e => setRepairInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchRepair()}
                  placeholder="VD: SC-20250101-001 hoặc SN-12345"
                  className="flex-1 border-2 border-green-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B5E20]" autoFocus />
                <button onClick={searchRepair} disabled={loading || !repairInput.trim()}
                  className="px-5 py-2.5 bg-[#1B5E20] text-white rounded-lg font-medium text-sm hover:bg-[#2E7D32] disabled:opacity-50">
                  {loading ? '...' : 'Tìm'}
                </button>
              </div>
            </div>

            {loading && <LoadingSkeleton />}

            {repairSearched && !loading && !repairResult && (
              <div className="bg-white rounded-xl shadow p-6 text-center">
                <div className="text-4xl mb-2">🔧</div>
                <div className="text-gray-600 font-medium">Không tìm thấy phiếu sửa chữa</div>
              </div>
            )}

            {repairResult && (
              <div className="space-y-4">
                {/* Stepper */}
                <div className="bg-white rounded-xl shadow p-5">
                  <div className="font-bold text-sm mb-4">Trạng thái: {repairResult.repair_number}</div>
                  <div className="flex items-center justify-between relative">
                    {REPAIR_STEPS.map((step, i) => {
                      const stepIdx = REPAIR_STEPS.findIndex(s => s.key === repairResult.status);
                      const isCancelled = repairResult.status === 'cancelled';
                      const isDone = !isCancelled && i <= stepIdx;
                      const isCurrent = !isCancelled && i === stepIdx;
                      return (
                        <div key={step.key} className="flex flex-col items-center relative z-10 flex-1">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all ${
                            isCurrent ? 'bg-[#1B5E20] border-[#1B5E20] text-white scale-110' :
                            isDone ? 'bg-green-100 border-green-400 text-green-700' :
                            'bg-gray-100 border-gray-300 text-gray-400'
                          }`}>
                            {step.icon}
                          </div>
                          <div className={`text-[9px] mt-1 text-center font-medium ${isCurrent ? 'text-[#1B5E20] font-bold' : isDone ? 'text-green-600' : 'text-gray-400'}`}>
                            {step.label}
                          </div>
                          {i < REPAIR_STEPS.length - 1 && (
                            <div className={`absolute top-5 left-[55%] w-full h-0.5 ${isDone && i < stepIdx ? 'bg-green-400' : 'bg-gray-200'}`} style={{ zIndex: -1 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {repairResult.status === 'cancelled' && (
                    <div className="mt-3 text-center py-2 bg-red-100 text-red-600 rounded-lg font-bold text-sm">ĐÃ HỦY</div>
                  )}
                </div>

                {/* Chi tiết sửa chữa */}
                <div className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-gray-500">Mã phiếu:</span><div className="font-medium">{repairResult.repair_number}</div></div>
                    <div><span className="text-gray-500">Serial:</span><div className="font-medium font-mono">{repairResult.serial_number}</div></div>
                    <div><span className="text-gray-500">Sản phẩm:</span><div className="font-medium">{repairResult.product_name}</div></div>
                    <div><span className="text-gray-500">Loại:</span><div className="font-medium">{repairResult.repair_type === 'warranty' ? 'Bảo hành' : 'Có phí'}</div></div>
                    {repairResult.received_at && <div><span className="text-gray-500">Tiếp nhận:</span><div className="font-medium">{formatDateVN(repairResult.received_at)}</div></div>}
                    {repairResult.technician && <div><span className="text-gray-500">KTV:</span><div className="font-medium">{repairResult.technician}</div></div>}
                  </div>
                  {repairResult.symptom && (
                    <div className="pt-2 border-t">
                      <span className="text-gray-500">Mô tả lỗi:</span>
                      <div className="font-medium mt-0.5">{repairResult.symptom}</div>
                    </div>
                  )}
                  {repairResult.diagnosis && (
                    <div>
                      <span className="text-gray-500">Chẩn đoán:</span>
                      <div className="font-medium mt-0.5">{repairResult.diagnosis}</div>
                    </div>
                  )}
                  {repairResult.solution && (
                    <div>
                      <span className="text-gray-500">Kết quả:</span>
                      <div className="font-medium mt-0.5 text-green-600">{repairResult.solution}</div>
                    </div>
                  )}
                  {repairResult.repair_type === 'paid' && repairResult.total_cost > 0 && (
                    <div className="pt-2 border-t">
                      <span className="text-gray-500">Chi phí:</span>
                      <div className="font-bold text-orange-600">{formatMoney(repairResult.total_cost)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB D: LIÊN HỆ + GỬI YÊU CẦU */}
        {/* ============================================================ */}
        {activeTab === 'contact' && (
          <div className="space-y-4">
            {/* Thông tin liên hệ */}
            <div className="bg-white rounded-xl shadow p-5">
              <h3 className="font-bold text-[#1B5E20] mb-3">Thông tin liên hệ</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📞</span>
                  <div>
                    <div className="text-gray-500 text-xs">Điện thoại</div>
                    <div className="font-medium">{tenant?.phone || '0123 456 789'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xl">💬</span>
                  <div>
                    <div className="text-gray-500 text-xs">Zalo</div>
                    <div className="font-medium">{tenant?.phone || '0123 456 789'}</div>
                  </div>
                </div>
                {tenant?.address && (
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📍</span>
                    <div>
                      <div className="text-gray-500 text-xs">Địa chỉ</div>
                      <div className="font-medium">{tenant.address}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-xl">🕐</span>
                  <div>
                    <div className="text-gray-500 text-xs">Giờ làm việc</div>
                    <div className="font-medium">T2-T7: 8:00 - 18:00 | CN: 8:00 - 12:00</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form gửi yêu cầu */}
            {reqSuccess ? (
              <div className="bg-green-50 border-2 border-green-400 rounded-xl p-5 text-center">
                <div className="text-4xl mb-2">✅</div>
                <div className="text-[#1B5E20] font-bold text-lg mb-1">Đã gửi yêu cầu thành công!</div>
                <div className="text-green-600 text-sm">Chúng tôi sẽ liên hệ bạn trong thời gian sớm nhất</div>
                <button onClick={() => { setReqSuccess(false); setReqForm({ serial: '', name: '', phone: '', desc: '', images: [] }); }}
                  className="mt-3 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-medium">
                  Gửi yêu cầu mới
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow p-5">
                <h3 className="font-bold text-[#1B5E20] mb-3">Gửi yêu cầu bảo hành</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Mã serial (nếu có)</label>
                    <input value={reqForm.serial} onChange={e => setReqForm(p => ({ ...p, serial: e.target.value }))}
                      placeholder="VD: SN-12345" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B5E20]" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Họ tên *</label>
                    <input value={reqForm.name} onChange={e => setReqForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Nguyễn Văn A" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B5E20]" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Số điện thoại *</label>
                    <input value={reqForm.phone} onChange={e => setReqForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="0901234567" type="tel" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B5E20]" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Mô tả lỗi / vấn đề *</label>
                    <textarea value={reqForm.desc} onChange={e => setReqForm(p => ({ ...p, desc: e.target.value }))}
                      placeholder="Mô tả chi tiết lỗi bạn gặp phải..." rows={3}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B5E20] resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Ảnh/video lỗi (tối đa 3)</label>
                    <div className="flex gap-2 flex-wrap">
                      {reqForm.images.map((url, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => setReqForm(p => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))}
                            className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                        </div>
                      ))}
                      {reqForm.images.length < 3 && (
                        <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}
                          className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-[#1B5E20] hover:text-[#1B5E20]">
                          {uploadingImage ? <span className="text-xs">...</span> : <><span className="text-xl">📷</span><span className="text-[9px]">Thêm ảnh</span></>}
                        </button>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleImageUpload} />
                  </div>
                  {reqError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">{reqError}</div>}
                  <button onClick={handleSubmitRequest} disabled={reqSubmitting}
                    className="w-full py-3 bg-[#1B5E20] hover:bg-[#2E7D32] text-white rounded-lg font-bold text-sm disabled:opacity-50">
                    {reqSubmitting ? 'Đang gửi...' : 'GỬI YÊU CẦU'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 pb-8">
          <p className="text-xs text-gray-400">{tenant?.name || 'Hoàng Nam Audio'}{tenant?.phone ? ` — ${tenant.phone}` : ''}</p>
          <a href="#" className="text-xs text-[#1B5E20] hover:underline mt-1 inline-block">Quay lại trang chính</a>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { getNowISOVN, getTodayVN, formatDateVN, getDateStrVN, addMonthsVN } from '../../utils/dateUtils';
import { warrantyStatuses } from '../../constants/warrantyConstants';
import QRCode from 'qrcode';
import { logActivity } from '../../lib/activityLog';

export default function WarrantyCardsView({ tenant, currentUser, warrantyCards, serials, products, loadWarrantyData, hasPermission, canEdit }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStartDate] = useState('');
  const [filterEndDate] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Create form
  const [formSerialSearch, setFormSerialSearch] = useState('');
  const [formSelectedSerial, setFormSelectedSerial] = useState(null);
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerPhone, setFormCustomerPhone] = useState('');
  const [formCustomerEmail, setFormCustomerEmail] = useState('');
  const [formCustomerAddress, setFormCustomerAddress] = useState('');
  const [formWarrantyMonths, setFormWarrantyMonths] = useState('12');
  const [formWarrantyStart, setFormWarrantyStart] = useState(getTodayVN());
  const [formNote, setFormNote] = useState('');

  const today = getTodayVN();

  const getEffectiveStatus = (card) => {
    if (card.status === 'voided') return 'voided';
    if (card.warranty_end && card.warranty_end < today) return 'expired';
    return card.status;
  };

  const getDaysRemaining = (endDate) => {
    if (!endDate) return 0;
    const end = new Date(endDate + 'T23:59:59+07:00');
    const now = new Date();
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  };

  const filteredCards = useMemo(() => {
    let list = warrantyCards || [];
    if (filterStatus) {
      list = list.filter(c => {
        const es = getEffectiveStatus(c);
        return es === filterStatus;
      });
    }
    if (filterStartDate) list = list.filter(c => c.warranty_start >= filterStartDate);
    if (filterEndDate) list = list.filter(c => c.warranty_end <= filterEndDate);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.card_number || '').toLowerCase().includes(q) ||
        (c.serial_number || '').toLowerCase().includes(q) ||
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.customer_phone || '').includes(q) ||
        (c.product_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [warrantyCards, filterStatus, filterStartDate, filterEndDate, search]);

  const paginatedCards = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCards.slice(start, start + pageSize);
  }, [filteredCards, page]);

  const totalPages = Math.ceil(filteredCards.length / pageSize);

  // Search serials for create
  const searchedSerials = useMemo(() => {
    if (!formSerialSearch.trim()) return [];
    const q = formSerialSearch.toLowerCase();
    return (serials || []).filter(s =>
      s.status === 'sold' &&
      ((s.serial_number || '').toLowerCase().includes(q) || (s.customer_phone || '').includes(q))
    ).slice(0, 10);
  }, [serials, formSerialSearch]);

  const selectSerial = (serial) => {
    setFormSelectedSerial(serial);
    setFormSerialSearch(serial.serial_number);
    setFormCustomerName(serial.customer_name || '');
    setFormCustomerPhone(serial.customer_phone || '');
    const product = (products || []).find(p => p.id === serial.product_id);
    if (product?.warranty_months) setFormWarrantyMonths(String(product.warranty_months));
    if (serial.warranty_start) setFormWarrantyStart(serial.warranty_start);
  };

  const genCardNumber = async () => {
    const dateStr = getDateStrVN();
    const prefix = `BH-${dateStr}-`;
    const { data } = await supabase
      .from('warranty_cards')
      .select('card_number')
      .eq('tenant_id', tenant.id)
      .like('card_number', `${prefix}%`)
      .order('card_number', { ascending: false })
      .limit(1);
    let lastNum = 0;
    if (data && data.length > 0) {
      const parts = data[0].card_number.split('-');
      lastNum = parseInt(parts[parts.length - 1]) || 0;
    }
    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
  };

  const handleCreate = async () => {
    if (!hasPermission('warranty', 2)) return alert('Bạn không có quyền tạo thẻ bảo hành');
    if (!formSelectedSerial) return alert('Chọn serial number');
    if (!formCustomerName.trim()) return alert('Nhập tên khách hàng');
    const months = parseInt(formWarrantyMonths) || 12;
    const warrantyEnd = addMonthsVN(formWarrantyStart, months);
    const product = (products || []).find(p => p.id === formSelectedSerial.product_id);

    try {
      const cardNumber = await genCardNumber();
      const { error } = await supabase.from('warranty_cards').insert([{
        tenant_id: tenant.id,
        card_number: cardNumber,
        serial_id: formSelectedSerial.id,
        product_id: formSelectedSerial.product_id,
        product_name: product?.name || '',
        product_sku: product?.sku || '',
        serial_number: formSelectedSerial.serial_number,
        customer_name: formCustomerName,
        customer_phone: formCustomerPhone,
        customer_email: formCustomerEmail,
        customer_address: formCustomerAddress,
        order_id: formSelectedSerial.sold_order_id || null,
        warranty_start: formWarrantyStart,
        warranty_end: warrantyEnd,
        warranty_months: months,
        status: 'active',
        note: formNote || null,
        created_by: currentUser.name
      }]);
      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'create', entityType: 'warranty_card',
        entityName: cardNumber,
        description: `Tạo thẻ bảo hành ${cardNumber} cho serial ${formSelectedSerial.serial_number}, KH: ${formCustomerName}`
      });

      // Update serial
      await supabase.from('product_serials').update({
        warranty_start: formWarrantyStart,
        warranty_end: warrantyEnd,
        updated_at: getNowISOVN()
      }).eq('id', formSelectedSerial.id);

      alert('Tạo thẻ bảo hành thành công!');
      setShowCreateModal(false);
      setFormSelectedSerial(null); setFormSerialSearch('');
      setFormCustomerName(''); setFormCustomerPhone(''); setFormCustomerEmail(''); setFormCustomerAddress('');
      setFormWarrantyMonths('12'); setFormWarrantyStart(getTodayVN()); setFormNote('');
      loadWarrantyData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  const handleExtend = async (card) => {
    if (!hasPermission('warranty', 2)) return alert('Bạn không có quyền gia hạn bảo hành');
    const months = prompt('Gia hạn thêm bao nhiêu tháng?');
    if (!months || isNaN(months) || parseInt(months) <= 0) return;
    const addedMonths = parseInt(months);
    const newEnd = addMonthsVN(card.warranty_end, addedMonths);
    try {
      await supabase.from('warranty_cards').update({
        warranty_end: newEnd,
        extended_months: (card.extended_months || 0) + addedMonths,
        status: 'extended',
        updated_at: getNowISOVN()
      }).eq('id', card.id);
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'update', entityType: 'warranty_card',
        entityId: card.id, entityName: card.card_number,
        description: `Gia hạn BH ${card.card_number} thêm ${addedMonths} tháng`
      });
      if (card.serial_id) {
        await supabase.from('product_serials').update({
          warranty_end: newEnd, updated_at: getNowISOVN()
        }).eq('id', card.serial_id);
      }
      alert('Gia hạn thành công!');
      setShowDetailModal(false);
      loadWarrantyData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  const handleVoid = async (card) => {
    if (!canEdit('warranty')) return alert('Bạn không có quyền hủy thẻ bảo hành');
    const reason = prompt('Lý do hủy thẻ bảo hành?');
    if (reason === null) return;
    try {
      await supabase.from('warranty_cards').update({
        status: 'voided',
        void_reason: reason,
        updated_at: getNowISOVN()
      }).eq('id', card.id);
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'update', entityType: 'warranty_card',
        entityId: card.id, entityName: card.card_number,
        description: `Hủy thẻ BH ${card.card_number}: ${reason || 'Không có lý do'}`
      });
      alert('Đã hủy thẻ bảo hành');
      setShowDetailModal(false);
      loadWarrantyData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  const printWarrantyCard = async (card) => {
    let qrHtml = '';
    try {
      const url = `${window.location.origin}/#warranty-check/${encodeURIComponent(card.serial_number)}`;
      const qrDataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 });
      qrHtml = `<div style="text-align:center;margin:15px 0"><img src="${qrDataUrl}" style="width:100px;height:100px"><div style="font-size:9px;color:#888;margin-top:4px">Quét mã để kiểm tra BH</div></div>`;
    } catch (_e) { /* QR generation failed, skip */ }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Phiếu BH ${card.card_number}</title>
<style>body{font-family:Arial,sans-serif;max-width:210mm;margin:0 auto;padding:30px;font-size:13px}
.center{text-align:center}.bold{font-weight:bold}.line{border-top:2px solid #22c55e;margin:15px 0}
table{width:100%;border-collapse:collapse}td{padding:6px 8px;vertical-align:top;border:1px solid #e5e7eb}
.header{background:#f0fdf4;padding:20px;border-radius:10px;margin-bottom:20px}
.terms{font-size:11px;color:#666;margin-top:20px;padding:10px;background:#f9fafb;border-radius:8px}
@media print{body{margin:0}}</style></head><body>
<div class="header center"><h2 style="margin:0;color:#15803d">${tenant?.name || 'HOANG NAM AUDIO'}</h2>
${tenant?.address ? `<p style="margin:4px 0;font-size:12px">${tenant.address}</p>` : ''}
${tenant?.phone ? `<p style="margin:4px 0;font-size:12px">${tenant.phone}</p>` : ''}
<h3 style="margin:10px 0 0;color:#166534">PHIẾU BẢO HÀNH SẢN PHẨM</h3>
<div style="font-size:14px;font-weight:bold;color:#15803d;margin-top:5px">${card.card_number}</div></div>
<table>
<tr><td class="bold" style="width:30%;background:#f0fdf4">Sản phẩm</td><td>${card.product_name}</td></tr>
<tr><td class="bold" style="background:#f0fdf4">Mã SP</td><td>${card.product_sku || '-'}</td></tr>
<tr><td class="bold" style="background:#f0fdf4">Serial</td><td style="font-family:monospace;font-weight:bold">${card.serial_number}</td></tr>
<tr><td class="bold" style="background:#f0fdf4">Khách hàng</td><td>${card.customer_name}${card.customer_phone ? ` — ${card.customer_phone}` : ''}</td></tr>
${card.customer_address ? `<tr><td class="bold" style="background:#f0fdf4">Địa chỉ</td><td>${card.customer_address}</td></tr>` : ''}
<tr><td class="bold" style="background:#f0fdf4">Thời hạn BH</td><td>${card.warranty_months} tháng${card.extended_months > 0 ? ` (+${card.extended_months} tháng gia hạn)` : ''}</td></tr>
<tr><td class="bold" style="background:#f0fdf4">Ngày bắt đầu</td><td>${formatDateVN(card.warranty_start)}</td></tr>
<tr><td class="bold" style="background:#f0fdf4">Ngày kết thúc</td><td style="font-weight:bold;color:#15803d">${formatDateVN(card.warranty_end)}</td></tr>
</table>
${qrHtml}
<div class="terms"><p class="bold">Điều khoản bảo hành:</p>
<p>1. Sản phẩm được bảo hành miễn phí trong thời hạn ghi trên phiếu.</p>
<p>2. Không bảo hành các trường hợp: hư hỏng do tác động bên ngoài, sử dụng sai hướng dẫn, sét đánh, nguồn điện không ổn định.</p>
<p>3. Vui lòng mang theo phiếu bảo hành khi đến bảo hành sản phẩm.</p>
<p>4. Quét mã QR phía trên để kiểm tra tình trạng bảo hành trực tuyến.</p></div>
<div style="display:flex;justify-content:space-between;margin-top:30px;text-align:center">
<div style="width:45%"><p>Khách hàng</p><br><br><p>___________</p></div>
<div style="width:45%"><p>Đại diện cửa hàng</p><br><br><p>___________</p></div></div>
<script>window.onload=function(){window.print()}</script></body></html>`;
    const win = window.open('', '_blank', 'width=800,height=600');
    win.document.write(html); win.document.close();
  };

  const stats = useMemo(() => ({
    total: (warrantyCards || []).length,
    active: (warrantyCards || []).filter(c => getEffectiveStatus(c) === 'active' || getEffectiveStatus(c) === 'extended').length,
    expired: (warrantyCards || []).filter(c => getEffectiveStatus(c) === 'expired').length,
    voided: (warrantyCards || []).filter(c => c.status === 'voided').length,
  }), [warrantyCards]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-gray-600 text-sm">Tổng thẻ BH</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          <div className="text-gray-600 text-sm">Còn hạn</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-gray-400">
          <div className="text-2xl font-bold text-gray-600">{stats.expired}</div>
          <div className="text-gray-600 text-sm">Hết hạn</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-red-500">
          <div className="text-2xl font-bold text-red-600">{stats.voided}</div>
          <div className="text-gray-600 text-sm">Đã hủy</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm mã thẻ, serial, SĐT, tên KH..." className="flex-1 px-3 py-2 border rounded-lg" />
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg">
          <option value="">Tất cả</option>
          {Object.entries(warrantyStatuses).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        {hasPermission('warranty', 2) && (
          <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium whitespace-nowrap">
            + Tạo thẻ BH
          </button>
        )}
      </div>

      {/* Card List */}
      <div className="space-y-3">
        {paginatedCards.map(card => {
          const es = getEffectiveStatus(card);
          const days = getDaysRemaining(card.warranty_end);
          const wsInfo = warrantyStatuses[es] || warrantyStatuses.active;
          return (
            <div
              key={card.id}
              onClick={() => { setSelectedCard(card); setShowDetailModal(true); }}
              className="bg-white rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow border-l-4"
              style={{ borderLeftColor: es === 'active' || es === 'extended' ? '#22c55e' : es === 'expired' ? '#9ca3af' : '#ef4444' }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold">{card.card_number}</div>
                  <div className="text-sm text-gray-600">{card.product_name} - {card.serial_number}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    KH: {card.customer_name} {card.customer_phone ? `(${card.customer_phone})` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${wsInfo.color}`}>
                    {wsInfo.icon} {wsInfo.label}
                  </span>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatDateVN(card.warranty_start)} - {formatDateVN(card.warranty_end)}
                  </div>
                  {(es === 'active' || es === 'extended') && (
                    <div className="text-xs text-green-600 font-medium mt-1">Còn {days} ngày</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {paginatedCards.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center text-gray-500">Không có thẻ bảo hành nào</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{filteredCards.length} thẻ</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-50">←</button>
            <span className="px-3 py-1 text-sm">{page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 border rounded disabled:opacity-50">→</button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-lg">Tạo thẻ bảo hành</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-gray-100 rounded">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Serial Number *</label>
                <input
                  type="text"
                  value={formSerialSearch}
                  onChange={e => { setFormSerialSearch(e.target.value); setFormSelectedSerial(null); }}
                  placeholder="Nhập serial để tìm..."
                  className="w-full mt-1 px-3 py-2 border rounded-lg"
                />
                {searchedSerials.length > 0 && !formSelectedSerial && (
                  <div className="mt-1 border rounded-lg max-h-40 overflow-y-auto">
                    {searchedSerials.map(s => {
                      const p = (products || []).find(x => x.id === s.product_id);
                      return (
                        <button key={s.id} onClick={() => selectSerial(s)} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b">
                          <div className="font-mono font-medium">{s.serial_number}</div>
                          <div className="text-gray-500">{p?.name} - KH: {s.customer_name || '-'}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {formSelectedSerial && (
                  <div className="mt-1 p-2 bg-green-50 rounded text-sm text-green-700">
                    Serial: {formSelectedSerial.serial_number} - {(products || []).find(p => p.id === formSelectedSerial.product_id)?.name}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Tên KH *</label>
                  <input type="text" value={formCustomerName} onChange={e => setFormCustomerName(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">SĐT</label>
                  <input type="text" value={formCustomerPhone} onChange={e => setFormCustomerPhone(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <input type="email" value={formCustomerEmail} onChange={e => setFormCustomerEmail(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Địa chỉ</label>
                  <input type="text" value={formCustomerAddress} onChange={e => setFormCustomerAddress(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Ngày BH</label>
                  <input type="date" value={formWarrantyStart} onChange={e => setFormWarrantyStart(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Số tháng</label>
                  <input type="number" value={formWarrantyMonths} onChange={e => setFormWarrantyMonths(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Kết thúc</label>
                  <div className="mt-1 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                    {formatDateVN(addMonthsVN(formWarrantyStart, parseInt(formWarrantyMonths) || 0))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Ghi chú</label>
                <input type="text" value={formNote} onChange={e => setFormNote(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
              </div>
              <button onClick={handleCreate} className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
                Tạo thẻ bảo hành
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedCard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-lg">{selectedCard.card_number}</h3>
              <button onClick={() => setShowDetailModal(false)} className="p-1 hover:bg-gray-100 rounded">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="font-bold text-lg">{selectedCard.product_name}</div>
                <div>Serial: <span className="font-mono font-bold">{selectedCard.serial_number}</span></div>
                <div>SKU: {selectedCard.product_sku || '-'}</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 space-y-1 text-sm">
                <div className="font-semibold">Khách hàng</div>
                <div>{selectedCard.customer_name}</div>
                {selectedCard.customer_phone && <div>{selectedCard.customer_phone}</div>}
                {selectedCard.customer_email && <div>{selectedCard.customer_email}</div>}
                {selectedCard.customer_address && <div>{selectedCard.customer_address}</div>}
              </div>
              <div className={`rounded-xl p-4 text-sm ${getEffectiveStatus(selectedCard) === 'active' || getEffectiveStatus(selectedCard) === 'extended' ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                <div className="font-semibold mb-2">Bảo hành</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>Bắt đầu: {formatDateVN(selectedCard.warranty_start)}</div>
                  <div>Kết thúc: {formatDateVN(selectedCard.warranty_end)}</div>
                  <div>Thời gian: {selectedCard.warranty_months} tháng</div>
                  <div>
                    {(() => {
                      const es = getEffectiveStatus(selectedCard);
                      if (es === 'active' || es === 'extended') return <span className="text-green-600 font-medium">Còn {getDaysRemaining(selectedCard.warranty_end)} ngày</span>;
                      if (es === 'expired') return <span className="text-gray-500">Hết hạn</span>;
                      return <span className="text-red-500">Đã hủy{selectedCard.void_reason ? `: ${selectedCard.void_reason}` : ''}</span>;
                    })()}
                  </div>
                </div>
                {selectedCard.extended_months > 0 && <div className="mt-1 text-blue-600">Đã gia hạn +{selectedCard.extended_months} tháng</div>}
              </div>
              {selectedCard.note && <div className="text-sm text-gray-600">Ghi chú: {selectedCard.note}</div>}
              <div className="flex gap-2">
                <button onClick={() => printWarrantyCard(selectedCard)} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">🖨️ In phiếu BH</button>
                {(getEffectiveStatus(selectedCard) === 'active' || getEffectiveStatus(selectedCard) === 'extended') && (
                  <>
                    {hasPermission('warranty', 2) && (
                      <button onClick={() => handleExtend(selectedCard)} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Gia hạn</button>
                    )}
                    {canEdit('warranty') && (
                      <button onClick={() => handleVoid(selectedCard)} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Hủy thẻ</button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

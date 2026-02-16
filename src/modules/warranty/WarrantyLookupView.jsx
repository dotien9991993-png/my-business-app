import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { formatDateVN, formatDateTimeVN, getTodayVN, addMonthsVN } from '../../utils/dateUtils';
import { serialStatuses, repairStatuses } from '../../constants/warrantyConstants';
import QRScanner from '../../components/shared/QRScanner';

export default function WarrantyLookupView({ tenant, loadWarrantyData, hasPermission }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [repairHistory, setRepairHistory] = useState([]);
  const [warrantyCard, setWarrantyCard] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  const handleScanSuccess = (text) => {
    setShowScanner(false);
    setSearch(text);
    // Auto-search after scan
    setTimeout(() => {
      const q = text.trim();
      if (q) handleSearchWithQuery(q);
    }, 100);
  };

  const today = getTodayVN();

  const getWarrantyStatus = (card) => {
    if (!card) return null;
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

  const handleSearchWithQuery = useCallback(async (queryOverride) => {
    const q = (queryOverride || search).trim();
    if (!q) return;
    setLoading(true);
    setResults([]);
    try {
      // Search serials by serial_number, customer_phone, customer_name
      const { data: serialResults } = await supabase
        .from('product_serials')
        .select('*')
        .eq('tenant_id', tenant.id)
        .or(`serial_number.ilike.%${q}%,customer_phone.ilike.%${q}%,customer_name.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (serialResults && serialResults.length > 0) {
        // For each serial, get warranty card
        const serialIds = serialResults.map(s => s.id);
        const { data: cards } = await supabase
          .from('warranty_cards')
          .select('*')
          .eq('tenant_id', tenant.id)
          .in('serial_id', serialIds);

        // Get products
        const productIds = [...new Set(serialResults.map(s => s.product_id))];
        const { data: productsData } = await supabase
          .from('products')
          .select('id, name, sku, brand, warranty_months')
          .in('id', productIds);
        const productMap = {};
        (productsData || []).forEach(p => { productMap[p.id] = p; });
        const cardMap = {};
        (cards || []).forEach(c => { cardMap[c.serial_id] = c; });

        const enriched = serialResults.map(s => ({
          ...s,
          product: productMap[s.product_id] || {},
          warrantyCard: cardMap[s.id] || null,
        }));
        setResults(enriched);
      } else {
        // Also try warranty cards by phone
        const { data: cardResults } = await supabase
          .from('warranty_cards')
          .select('*')
          .eq('tenant_id', tenant.id)
          .or(`serial_number.ilike.%${q}%,customer_phone.ilike.%${q}%,customer_name.ilike.%${q}%,card_number.ilike.%${q}%`)
          .limit(20);

        if (cardResults && cardResults.length > 0) {
          const enriched = cardResults.map(c => ({
            id: c.serial_id || c.id,
            serial_number: c.serial_number,
            product_id: c.product_id,
            status: 'sold',
            product: { name: c.product_name, sku: c.product_sku },
            warrantyCard: c,
            customer_name: c.customer_name,
            customer_phone: c.customer_phone,
          }));
          setResults(enriched);
        }
      }
    } catch (err) {
      console.error('Search error:', err);
    }
    setLoading(false);
  }, [search, tenant]);

  const handleSearch = () => handleSearchWithQuery();

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const openDetail = async (item) => {
    setSelectedItem(item);
    setWarrantyCard(item.warrantyCard);
    // Load repair history
    if (item.serial_number) {
      const { data } = await supabase
        .from('warranty_repairs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('serial_number', item.serial_number)
        .order('created_at', { ascending: false });
      setRepairHistory(data || []);
    }
  };

  const handleExtendWarranty = async (card) => {
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
        updated_at: new Date().toISOString()
      }).eq('id', card.id);
      // Also update serial
      if (card.serial_id) {
        await supabase.from('product_serials').update({
          warranty_end: newEnd,
          updated_at: new Date().toISOString()
        }).eq('id', card.serial_id);
      }
      alert('Gia hạn bảo hành thành công!');
      setWarrantyCard(prev => ({ ...prev, warranty_end: newEnd, extended_months: (prev.extended_months || 0) + addedMonths, status: 'extended' }));
      loadWarrantyData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Search Bar */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-4">Tra cứu bảo hành</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập serial, SĐT, hoặc tên khách hàng..."
            className="flex-1 px-4 py-3 border rounded-lg text-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            autoFocus
          />
          <button
            onClick={() => setShowScanner(true)}
            className="px-4 py-3 bg-blue-100 text-blue-700 rounded-lg font-medium hover:bg-blue-200"
            title="Quét mã QR/Barcode"
          >
            📷
          </button>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {loading ? '...' : '🔍 Tìm'}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm text-gray-500">Tìm thấy {results.length} kết quả</div>
          {results.map((item, idx) => {
            const card = item.warrantyCard;
            const ws = getWarrantyStatus(card);
            const days = card ? getDaysRemaining(card.warranty_end) : 0;
            const statusInfo = serialStatuses[item.status] || {};
            return (
              <div
                key={idx}
                onClick={() => openDetail(item)}
                className="bg-white rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow border-l-4"
                style={{ borderLeftColor: ws === 'active' || ws === 'extended' ? '#22c55e' : ws === 'expired' ? '#9ca3af' : ws === 'voided' ? '#ef4444' : '#d1d5db' }}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-lg">{item.product?.name || 'N/A'}</div>
                    <div className="text-sm text-gray-500">Serial: {item.serial_number}</div>
                    {item.customer_name && <div className="text-sm text-gray-600 mt-1">KH: {item.customer_name} {item.customer_phone ? `- ${item.customer_phone}` : ''}</div>}
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color || 'bg-gray-100'}`}>
                      {statusInfo.icon} {statusInfo.label}
                    </span>
                    {card && (
                      <div className="mt-2">
                        {ws === 'active' || ws === 'extended' ? (
                          <span className="text-green-600 text-sm font-medium">Còn {days} ngày BH</span>
                        ) : ws === 'expired' ? (
                          <span className="text-gray-500 text-sm">Hết hạn BH</span>
                        ) : ws === 'voided' ? (
                          <span className="text-red-500 text-sm">BH đã hủy</span>
                        ) : (
                          <span className="text-gray-400 text-sm">Không có BH</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {results.length === 0 && !loading && search && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-500">
          Không tìm thấy kết quả nào
        </div>
      )}

      {/* QR Scanner */}
      <QRScanner isOpen={showScanner} onScanSuccess={handleScanSuccess} onClose={() => setShowScanner(false)} />

      {/* Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
              <h3 className="text-xl font-bold">Chi tiết bảo hành</h3>
              <button onClick={() => setSelectedItem(null)} className="p-2 hover:bg-gray-100 rounded-full">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Product Info */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="font-bold text-lg mb-2">{selectedItem.product?.name || 'N/A'}</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>SKU: {selectedItem.product?.sku || '-'}</div>
                  <div>Brand: {selectedItem.product?.brand || '-'}</div>
                  <div>Serial: <span className="font-mono font-bold">{selectedItem.serial_number}</span></div>
                  <div>Trạng thái: {serialStatuses[selectedItem.status]?.icon} {serialStatuses[selectedItem.status]?.label}</div>
                </div>
              </div>

              {/* Customer */}
              {selectedItem.customer_name && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="font-semibold mb-1">Khách hàng</div>
                  <div className="text-sm">{selectedItem.customer_name}</div>
                  {selectedItem.customer_phone && <div className="text-sm text-gray-600">{selectedItem.customer_phone}</div>}
                </div>
              )}

              {/* Warranty Card */}
              {warrantyCard && (
                <div className={`rounded-xl p-4 ${getWarrantyStatus(warrantyCard) === 'active' || getWarrantyStatus(warrantyCard) === 'extended' ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                  <div className="font-semibold mb-2">Thẻ bảo hành: {warrantyCard.card_number}</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Bắt đầu: {formatDateVN(warrantyCard.warranty_start)}</div>
                    <div>Kết thúc: {formatDateVN(warrantyCard.warranty_end)}</div>
                    <div>Thời gian: {warrantyCard.warranty_months} tháng{warrantyCard.extended_months > 0 ? ` (+${warrantyCard.extended_months})` : ''}</div>
                    <div>
                      {(() => {
                        const ws = getWarrantyStatus(warrantyCard);
                        const days = getDaysRemaining(warrantyCard.warranty_end);
                        if (ws === 'active' || ws === 'extended') return <span className="text-green-600 font-medium">Còn {days} ngày</span>;
                        if (ws === 'expired') return <span className="text-gray-500">Hết hạn</span>;
                        return <span className="text-red-500">Đã hủy</span>;
                      })()}
                    </div>
                  </div>
                  {hasPermission('warranty', 2) && (getWarrantyStatus(warrantyCard) === 'active' || getWarrantyStatus(warrantyCard) === 'extended') && (
                    <button
                      onClick={() => handleExtendWarranty(warrantyCard)}
                      className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                    >
                      Gia hạn BH
                    </button>
                  )}
                </div>
              )}

              {/* Repair History */}
              {repairHistory.length > 0 && (
                <div>
                  <div className="font-semibold mb-2">Lịch sử sửa chữa ({repairHistory.length})</div>
                  <div className="space-y-2">
                    {repairHistory.map(r => (
                      <div key={r.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium">{r.repair_number}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${repairStatuses[r.status]?.color || 'bg-gray-100'}`}>
                            {repairStatuses[r.status]?.label || r.status}
                          </span>
                        </div>
                        <div className="text-gray-600">{r.symptom || '-'}</div>
                        <div className="text-gray-500 text-xs mt-1">{formatDateTimeVN(r.received_at)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

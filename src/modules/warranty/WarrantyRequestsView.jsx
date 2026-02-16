import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { formatDateTimeVN, getDateStrVN, getNowISOVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';

const REQUEST_STATUSES = {
  pending: { label: 'Chờ xử lý', color: 'bg-yellow-100 text-yellow-700', icon: '🕐' },
  contacted: { label: 'Đã liên hệ', color: 'bg-blue-100 text-blue-700', icon: '📞' },
  in_progress: { label: 'Đang xử lý', color: 'bg-purple-100 text-purple-700', icon: '🔧' },
  resolved: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700', icon: '✅' },
  closed: { label: 'Đóng', color: 'bg-gray-100 text-gray-700', icon: '📁' },
};

const STATUS_FLOW = {
  pending: ['contacted', 'in_progress', 'resolved', 'closed'],
  contacted: ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
};

export default function WarrantyRequestsView({ tenant, currentUser, warrantyRequests, loadWarrantyData, hasPermission }) {
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    let list = warrantyRequests || [];
    if (filterStatus !== 'all') list = list.filter(r => r.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.customer_phone || '').includes(q) ||
        (r.serial_number || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [warrantyRequests, filterStatus, search]);

  const statusCounts = useMemo(() => {
    const counts = { all: (warrantyRequests || []).length };
    Object.keys(REQUEST_STATUSES).forEach(k => { counts[k] = 0; });
    (warrantyRequests || []).forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return counts;
  }, [warrantyRequests]);

  const openDetail = (req) => {
    setSelectedRequest(req);
    setAdminNote(req.admin_note || '');
  };

  const handleChangeStatus = async (newStatus) => {
    if (!hasPermission('warranty', 2)) return alert('Bạn không có quyền đổi trạng thái yêu cầu');
    if (!selectedRequest) return;
    setSubmitting(true);
    try {
      await supabase.from('warranty_requests').update({
        status: newStatus,
        admin_note: adminNote.trim() || selectedRequest.admin_note,
        updated_at: new Date().toISOString()
      }).eq('id', selectedRequest.id);
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'update', entityType: 'warranty_request',
        entityId: selectedRequest.id, entityName: selectedRequest.customer_name,
        description: `Chuyển yêu cầu BH của ${selectedRequest.customer_name} sang ${REQUEST_STATUSES[newStatus]?.label || newStatus}`
      });
      setSelectedRequest(prev => ({ ...prev, status: newStatus, admin_note: adminNote.trim() || prev.admin_note }));
      loadWarrantyData();
    } catch (err) { alert('Lỗi: ' + err.message); }
    setSubmitting(false);
  };

  const handleSaveNote = async () => {
    if (!hasPermission('warranty', 2)) return alert('Bạn không có quyền ghi chú');
    if (!selectedRequest) return;
    setSubmitting(true);
    try {
      await supabase.from('warranty_requests').update({
        admin_note: adminNote.trim(),
        updated_at: new Date().toISOString()
      }).eq('id', selectedRequest.id);
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'update', entityType: 'warranty_request',
        entityId: selectedRequest.id, entityName: selectedRequest.customer_name,
        description: `Cập nhật ghi chú yêu cầu BH của ${selectedRequest.customer_name}`
      });
      setSelectedRequest(prev => ({ ...prev, admin_note: adminNote.trim() }));
      loadWarrantyData();
    } catch (err) { alert('Lỗi: ' + err.message); }
    setSubmitting(false);
  };

  const handleCreateRepairFromRequest = async () => {
    if (!hasPermission('warranty', 2)) return alert('Bạn không có quyền tạo phiếu sửa chữa');
    if (!selectedRequest) return;
    if (!selectedRequest.serial_number) return alert('Yêu cầu này chưa có serial number');

    setSubmitting(true);
    try {
      // Generate repair number
      const dateStr = getDateStrVN();
      const prefix = `SC-${dateStr}-`;
      const { data: lastRepair } = await supabase.from('warranty_repairs').select('repair_number')
        .eq('tenant_id', tenant.id).like('repair_number', `${prefix}%`)
        .order('repair_number', { ascending: false }).limit(1);
      let lastNum = 0;
      if (lastRepair?.[0]) { const p = lastRepair[0].repair_number.split('-'); lastNum = parseInt(p[p.length - 1]) || 0; }
      const repairNumber = `${prefix}${String(lastNum + 1).padStart(3, '0')}`;

      // Find serial
      let serialId = selectedRequest.serial_id;
      let warrantyCardId = null;
      if (!serialId && selectedRequest.serial_number) {
        const { data: s } = await supabase.from('product_serials').select('id')
          .eq('tenant_id', tenant.id).eq('serial_number', selectedRequest.serial_number).maybeSingle();
        if (s) serialId = s.id;
      }

      // Find warranty card
      if (serialId) {
        const { data: card } = await supabase.from('warranty_cards').select('id')
          .eq('tenant_id', tenant.id).eq('serial_id', serialId)
          .order('created_at', { ascending: false }).limit(1);
        if (card?.[0]) warrantyCardId = card[0].id;
      }

      const { error } = await supabase.from('warranty_repairs').insert([{
        tenant_id: tenant.id,
        repair_number: repairNumber,
        serial_id: serialId,
        warranty_card_id: warrantyCardId,
        product_name: selectedRequest.serial_number ? `SP Serial: ${selectedRequest.serial_number}` : 'N/A',
        serial_number: selectedRequest.serial_number,
        customer_name: selectedRequest.customer_name,
        customer_phone: selectedRequest.customer_phone,
        status: 'received',
        repair_type: warrantyCardId ? 'warranty' : 'paid',
        symptom: selectedRequest.description,
        received_at: getNowISOVN(),
        created_by: currentUser.name
      }]);
      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'create', entityType: 'warranty_repair',
        entityName: repairNumber,
        description: `Tạo phiếu sửa chữa ${repairNumber} từ yêu cầu BH của ${selectedRequest.customer_name}`
      });

      // Update request status
      await supabase.from('warranty_requests').update({
        status: 'in_progress',
        admin_note: (adminNote.trim() ? adminNote.trim() + '\n' : '') + `Đã tạo phiếu sửa chữa: ${repairNumber}`,
        updated_at: new Date().toISOString()
      }).eq('id', selectedRequest.id);

      setSelectedRequest(prev => ({
        ...prev,
        status: 'in_progress',
        admin_note: (prev.admin_note || '') + `\nĐã tạo phiếu sửa chữa: ${repairNumber}`
      }));
      setAdminNote(prev => (prev ? prev + '\n' : '') + `Đã tạo phiếu sửa chữa: ${repairNumber}`);
      loadWarrantyData();
      alert(`Đã tạo phiếu sửa chữa: ${repairNumber}`);
    } catch (err) { alert('Lỗi: ' + err.message); }
    setSubmitting(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h2 className="text-xl font-bold mb-3">Yêu cầu bảo hành từ khách</h2>

        {/* Status filter pills */}
        <div className="flex gap-2 flex-wrap mb-3">
          <button onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${filterStatus === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Tất cả ({statusCounts.all})
          </button>
          {Object.entries(REQUEST_STATUSES).map(([k, v]) => (
            <button key={k} onClick={() => setFilterStatus(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${filterStatus === k ? 'bg-green-600 text-white' : `${v.color} hover:opacity-80`}`}>
              {v.icon} {v.label} ({statusCounts[k] || 0})
            </button>
          ))}
        </div>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo tên, SĐT, serial, mô tả..."
          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-500">Không có yêu cầu nào</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(req => {
            const st = REQUEST_STATUSES[req.status] || {};
            return (
              <div key={req.id} onClick={() => openDetail(req)}
                className="bg-white rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition border-l-4"
                style={{ borderLeftColor: req.status === 'pending' ? '#eab308' : req.status === 'in_progress' ? '#8b5cf6' : req.status === 'resolved' ? '#22c55e' : '#9ca3af' }}>
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{req.customer_name}</div>
                    <div className="text-xs text-gray-500">{req.customer_phone}{req.serial_number ? ` • ${req.serial_number}` : ''}</div>
                    {req.description && <div className="text-xs text-gray-600 mt-1 truncate">{req.description}</div>}
                  </div>
                  <div className="text-right ml-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.icon} {st.label}</span>
                    <div className="text-xs text-gray-400 mt-1">{formatDateTimeVN(req.created_at)}</div>
                  </div>
                </div>
                {req.images && req.images.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {req.images.map((url, i) => (
                      <div key={i} className="w-10 h-10 rounded overflow-hidden border"><img src={url} alt="" className="w-full h-full object-cover" /></div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedRequest(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
              <h3 className="text-xl font-bold">Chi tiết yêu cầu BH</h3>
              <button onClick={() => setSelectedRequest(null)} className="p-2 hover:bg-gray-100 rounded-full">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Status */}
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${REQUEST_STATUSES[selectedRequest.status]?.color}`}>
                  {REQUEST_STATUSES[selectedRequest.status]?.icon} {REQUEST_STATUSES[selectedRequest.status]?.label}
                </span>
                <span className="text-sm text-gray-500">{formatDateTimeVN(selectedRequest.created_at)}</span>
              </div>

              {/* Customer info */}
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="font-semibold mb-1">Khách hàng</div>
                <div className="text-sm">{selectedRequest.customer_name} — {selectedRequest.customer_phone}</div>
                {selectedRequest.serial_number && <div className="text-sm text-gray-600 mt-1">Serial: <span className="font-mono font-bold">{selectedRequest.serial_number}</span></div>}
              </div>

              {/* Description */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="font-semibold mb-1">Mô tả lỗi / vấn đề</div>
                <div className="text-sm whitespace-pre-wrap">{selectedRequest.description || 'Không có mô tả'}</div>
              </div>

              {/* Images */}
              {selectedRequest.images && selectedRequest.images.length > 0 && (
                <div>
                  <div className="font-semibold mb-2">Ảnh đính kèm ({selectedRequest.images.length})</div>
                  <div className="flex gap-2 flex-wrap">
                    {selectedRequest.images.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="w-24 h-24 rounded-lg overflow-hidden border hover:opacity-80">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin note */}
              {hasPermission('warranty', 2) && (
                <div>
                  <div className="font-semibold mb-1">Ghi chú admin</div>
                  <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3}
                    placeholder="Ghi chú nội bộ..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none" />
                  <button onClick={handleSaveNote} disabled={submitting}
                    className="mt-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-xs disabled:opacity-50">
                    Lưu ghi chú
                  </button>
                </div>
              )}
              {/* Show admin note read-only for lower permission */}
              {!hasPermission('warranty', 2) && selectedRequest.admin_note && (
                <div>
                  <div className="font-semibold mb-1">Ghi chú admin</div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">{selectedRequest.admin_note}</div>
                </div>
              )}

              {/* Status change buttons */}
              {hasPermission('warranty', 2) && (STATUS_FLOW[selectedRequest.status] || []).length > 0 && (
                <div>
                  <div className="font-semibold mb-2">Chuyển trạng thái</div>
                  <div className="flex gap-2 flex-wrap">
                    {(STATUS_FLOW[selectedRequest.status] || []).map(nextStatus => {
                      const st = REQUEST_STATUSES[nextStatus];
                      return (
                        <button key={nextStatus} onClick={() => handleChangeStatus(nextStatus)} disabled={submitting}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${st.color} hover:opacity-80 disabled:opacity-50`}>
                          {st.icon} {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Create repair */}
              {hasPermission('warranty', 2) && selectedRequest.serial_number && ['pending', 'contacted', 'in_progress'].includes(selectedRequest.status) && (
                <button onClick={handleCreateRepairFromRequest} disabled={submitting}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm disabled:opacity-50">
                  🔧 Tạo phiếu sửa chữa từ yêu cầu này
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

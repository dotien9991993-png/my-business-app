import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { getNowISOVN, getTodayVN, formatDateTimeVN, getDateStrVN } from '../../utils/dateUtils';
import { repairStatuses, repairStatusFlow, repairTypes } from '../../constants/warrantyConstants';
import { formatMoney } from '../../utils/formatUtils';
import { logActivity } from '../../lib/activityLog';

export default function WarrantyRepairView({ tenant, currentUser, warrantyRepairs, serials, warrantyCards, products, loadWarrantyData, loadFinanceData, allUsers, hasPermission, canEdit }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRepair, setSelectedRepair] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Create form
  const [formSerialSearch, setFormSerialSearch] = useState('');
  const [formSerial, setFormSerial] = useState(null);
  const [formWarrantyCard, setFormWarrantyCard] = useState(null);
  const [formRepairType, setFormRepairType] = useState('warranty');
  const [formSymptom, setFormSymptom] = useState('');
  const [formTechnician, setFormTechnician] = useState('');
  const [formNote, setFormNote] = useState('');

  // Detail edit
  const [diagnosis, setDiagnosis] = useState('');
  const [solution, setSolution] = useState('');
  const [parts, setParts] = useState([]);
  const [laborCost, setLaborCost] = useState('');

  const today = getTodayVN();

  const technicians = useMemo(() => {
    return (allUsers || []).filter(u => u.role !== 'Admin' && u.team !== 'Admin').map(u => u.name);
  }, [allUsers]);

  const filteredRepairs = useMemo(() => {
    let list = warrantyRepairs || [];
    if (filterStatus) list = list.filter(r => r.status === filterStatus);
    if (filterType) list = list.filter(r => r.repair_type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.repair_number || '').toLowerCase().includes(q) ||
        (r.serial_number || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.customer_phone || '').includes(q) ||
        (r.product_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [warrantyRepairs, filterStatus, filterType, search]);

  const paginatedRepairs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRepairs.slice(start, start + pageSize);
  }, [filteredRepairs, page]);

  const totalPages = Math.ceil(filteredRepairs.length / pageSize);

  const stats = useMemo(() => ({
    total: (warrantyRepairs || []).length,
    active: (warrantyRepairs || []).filter(r => ['received', 'diagnosing', 'repairing'].includes(r.status)).length,
    done: (warrantyRepairs || []).filter(r => r.status === 'done' || r.status === 'returned').length,
    warranty: (warrantyRepairs || []).filter(r => r.repair_type === 'warranty').length,
  }), [warrantyRepairs]);

  // Search serials for create
  const searchedSerials = useMemo(() => {
    if (!formSerialSearch.trim()) return [];
    const q = formSerialSearch.toLowerCase();
    return (serials || []).filter(s =>
      (s.serial_number || '').toLowerCase().includes(q) || (s.customer_phone || '').includes(q)
    ).slice(0, 10);
  }, [serials, formSerialSearch]);

  const selectSerial = (serial) => {
    setFormSerial(serial);
    setFormSerialSearch(serial.serial_number);
    // Check warranty card
    const card = (warrantyCards || []).find(c => c.serial_id === serial.id && c.status !== 'voided');
    setFormWarrantyCard(card || null);
    // Determine warranty vs paid
    if (card && card.warranty_end >= today) {
      setFormRepairType('warranty');
    } else {
      setFormRepairType('paid');
    }
  };

  const genRepairNumber = async () => {
    const dateStr = getDateStrVN();
    const prefix = `SC-${dateStr}-`;
    const { data } = await supabase
      .from('warranty_repairs')
      .select('repair_number')
      .eq('tenant_id', tenant.id)
      .like('repair_number', `${prefix}%`)
      .order('repair_number', { ascending: false })
      .limit(1);
    let lastNum = 0;
    if (data && data.length > 0) {
      const parts = data[0].repair_number.split('-');
      lastNum = parseInt(parts[parts.length - 1]) || 0;
    }
    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
  };

  const handleCreate = async () => {
    if (!hasPermission('warranty', 1)) return alert('Bạn không có quyền tạo phiếu sửa chữa');
    if (!formSerial) return alert('Chọn serial number');
    if (!formSymptom.trim()) return alert('Mô tả triệu chứng');
    const product = (products || []).find(p => p.id === formSerial.product_id);

    try {
      const repairNumber = await genRepairNumber();
      const { error } = await supabase.from('warranty_repairs').insert([{
        tenant_id: tenant.id,
        repair_number: repairNumber,
        serial_id: formSerial.id,
        warranty_card_id: formWarrantyCard?.id || null,
        product_name: product?.name || '',
        serial_number: formSerial.serial_number,
        customer_name: formSerial.customer_name || '',
        customer_phone: formSerial.customer_phone || '',
        status: 'received',
        repair_type: formRepairType,
        symptom: formSymptom,
        is_warranty_covered: formRepairType === 'warranty',
        technician: formTechnician || null,
        note: formNote || null,
        received_at: getNowISOVN(),
        created_by: currentUser.name
      }]);
      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'create', entityType: 'warranty_repair',
        entityName: repairNumber,
        description: `Tạo phiếu sửa chữa ${repairNumber} cho serial ${formSerial.serial_number}`
      });

      // Update serial status
      await supabase.from('product_serials').update({
        status: 'warranty_repair',
        updated_at: getNowISOVN()
      }).eq('id', formSerial.id);

      alert(`Tạo phiếu sửa chữa: ${repairNumber}`);
      setShowCreateModal(false);
      setFormSerial(null); setFormSerialSearch(''); setFormWarrantyCard(null);
      setFormSymptom(''); setFormTechnician(''); setFormNote('');
      setFormRepairType('warranty');
      loadWarrantyData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  const openDetail = (repair) => {
    setSelectedRepair(repair);
    setDiagnosis(repair.diagnosis || '');
    setSolution(repair.solution || '');
    setParts(repair.parts_used || []);
    setLaborCost(String(repair.labor_cost || ''));
    setShowDetailModal(true);
  };

  const handleChangeStatus = async (repair, newStatus) => {
    if (!hasPermission('warranty', 2)) return alert('Bạn không có quyền đổi trạng thái phiếu sửa chữa');
    const label = repairStatuses[newStatus]?.label || newStatus;
    if (!window.confirm(`Chuyển phiếu ${repair.repair_number} sang "${label}"?`)) return;

    try {
      const updates = { status: newStatus, updated_at: getNowISOVN() };

      // Record timestamps
      if (newStatus === 'diagnosing') updates.diagnosed_at = getNowISOVN();
      if (newStatus === 'repairing') updates.repaired_at = getNowISOVN();
      if (newStatus === 'done') updates.completed_at = getNowISOVN();
      if (newStatus === 'returned') updates.returned_at = getNowISOVN();

      // Save diagnosis/solution/parts/cost
      updates.diagnosis = diagnosis;
      updates.solution = solution;
      updates.parts_used = parts;
      updates.labor_cost = parseFloat(laborCost) || 0;
      updates.parts_cost = parts.reduce((sum, p) => sum + (p.quantity || 1) * (p.unit_price || 0), 0);
      updates.total_cost = updates.labor_cost + updates.parts_cost;

      const { error } = await supabase.from('warranty_repairs').update(updates).eq('id', repair.id);
      if (error) throw error;

      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'update', entityType: 'warranty_repair',
        entityId: repair.id, entityName: repair.repair_number,
        description: `Chuyển phiếu sửa chữa ${repair.repair_number} sang ${label}`
      });

      // When returned: serial back to sold
      if (newStatus === 'returned') {
        if (repair.serial_id) {
          await supabase.from('product_serials').update({
            status: 'sold', updated_at: getNowISOVN()
          }).eq('id', repair.serial_id);
        }
        // For paid repairs: create finance receipt
        if (repair.repair_type === 'paid' && updates.total_cost > 0) {
          const dateStr = getDateStrVN();
          const rcPrefix = `PT-${dateStr}-`;
          const { data: lastRc } = await supabase.from('receipts_payments').select('receipt_number').like('receipt_number', `${rcPrefix}%`).order('receipt_number', { ascending: false }).limit(1);
          const lastRcNum = lastRc?.[0] ? parseInt(lastRc[0].receipt_number.slice(-3)) || 0 : 0;
          const receiptNumber = `${rcPrefix}${String(lastRcNum + 1).padStart(3, '0')}`;
          const { data: receipt } = await supabase.from('receipts_payments').insert([{
            tenant_id: tenant.id,
            receipt_number: receiptNumber,
            type: 'thu',
            amount: updates.total_cost,
            description: `Sửa chữa có phí - ${repair.repair_number} - ${repair.product_name}`,
            category: 'Dịch vụ sửa chữa',
            receipt_date: getTodayVN(),
            note: `Phiếu sửa chữa: ${repair.repair_number}`,
            status: 'approved',
            created_by: currentUser.name,
            created_at: getNowISOVN()
          }]).select().single();
          if (receipt) {
            await supabase.from('warranty_repairs').update({ receipt_id: receipt.id }).eq('id', repair.id);
          }
          if (loadFinanceData) loadFinanceData();
        }
      }

      // When cancelled: serial back to previous status
      if (newStatus === 'cancelled' && repair.serial_id) {
        await supabase.from('product_serials').update({
          status: 'sold', updated_at: getNowISOVN()
        }).eq('id', repair.serial_id);
      }

      setSelectedRepair(prev => ({ ...prev, ...updates }));
      loadWarrantyData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  const addPart = () => setParts([...parts, { name: '', quantity: 1, unit_price: 0 }]);
  const removePart = (idx) => setParts(parts.filter((_, i) => i !== idx));
  const updatePart = (idx, field, value) => {
    setParts(parts.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const totalPartsCost = parts.reduce((sum, p) => sum + (p.quantity || 1) * (p.unit_price || 0), 0);
  const totalCost = totalPartsCost + (parseFloat(laborCost) || 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-gray-600 text-sm">Tổng phiếu SC</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-orange-500">
          <div className="text-2xl font-bold text-orange-600">{stats.active}</div>
          <div className="text-gray-600 text-sm">Đang xử lý</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
          <div className="text-2xl font-bold text-green-600">{stats.done}</div>
          <div className="text-gray-600 text-sm">Hoàn thành/Trả</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-purple-500">
          <div className="text-2xl font-bold text-purple-600">{stats.warranty}</div>
          <div className="text-gray-600 text-sm">Bảo hành</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm mã phiếu, serial, KH..." className="flex-1 px-3 py-2 border rounded-lg" />
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg">
          <option value="">Tất cả trạng thái</option>
          {Object.entries(repairStatuses).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg">
          <option value="">Tất cả loại</option>
          <option value="warranty">Bảo hành</option>
          <option value="paid">Có phí</option>
        </select>
        {hasPermission('warranty', 1) && (
          <button onClick={() => { setFormSerial(null); setFormSerialSearch(''); setFormWarrantyCard(null); setFormSymptom(''); setFormTechnician(''); setFormNote(''); setShowCreateModal(true); }} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium whitespace-nowrap">
            + Tạo phiếu SC
          </button>
        )}
      </div>

      {/* Repair List */}
      <div className="space-y-3">
        {paginatedRepairs.map(r => {
          const stInfo = repairStatuses[r.status] || {};
          const typeInfo = repairTypes[r.repair_type] || {};
          return (
            <div key={r.id} onClick={() => openDetail(r)} className="bg-white rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold">{r.repair_number}</div>
                  <div className="text-sm text-gray-600">{r.product_name} - {r.serial_number}</div>
                  <div className="text-sm text-gray-500 mt-1">KH: {r.customer_name} {r.customer_phone ? `(${r.customer_phone})` : ''}</div>
                  {r.symptom && <div className="text-sm text-gray-500 mt-1 truncate max-w-xs">{r.symptom}</div>}
                </div>
                <div className="text-right space-y-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${stInfo.color || 'bg-gray-100'}`}>
                    {stInfo.icon} {stInfo.label}
                  </span>
                  <div>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${typeInfo.color || 'bg-gray-100'}`}>
                      {typeInfo.label}
                    </span>
                  </div>
                  {r.technician && <div className="text-xs text-gray-500">{r.technician}</div>}
                </div>
              </div>
            </div>
          );
        })}
        {paginatedRepairs.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center text-gray-500">Không có phiếu sửa chữa nào</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{filteredRepairs.length} phiếu</span>
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
              <h3 className="font-bold text-lg">Tạo phiếu sửa chữa</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-gray-100 rounded">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Serial Number *</label>
                <input type="text" value={formSerialSearch} onChange={e => { setFormSerialSearch(e.target.value); setFormSerial(null); }} placeholder="Nhập serial để tìm..." className="w-full mt-1 px-3 py-2 border rounded-lg" />
                {searchedSerials.length > 0 && !formSerial && (
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
                {formSerial && (
                  <div className="mt-1 p-2 bg-green-50 rounded text-sm">
                    <div className="text-green-700 font-medium">{formSerial.serial_number} - {(products || []).find(p => p.id === formSerial.product_id)?.name}</div>
                    <div className="text-gray-600">KH: {formSerial.customer_name || '-'} {formSerial.customer_phone ? `(${formSerial.customer_phone})` : ''}</div>
                    {formWarrantyCard && (
                      <div className="text-blue-600 mt-1">
                        BH: {formWarrantyCard.card_number} - {formWarrantyCard.warranty_end >= today ? `còn hạn đến ${formWarrantyCard.warranty_end}` : 'hết hạn'}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Loại sửa chữa</label>
                <div className="flex gap-3 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="repairType" value="warranty" checked={formRepairType === 'warranty'} onChange={() => setFormRepairType('warranty')} />
                    <span className="text-sm">Bảo hành</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="repairType" value="paid" checked={formRepairType === 'paid'} onChange={() => setFormRepairType('paid')} />
                    <span className="text-sm">Có phí</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Triệu chứng / Lỗi *</label>
                <textarea value={formSymptom} onChange={e => setFormSymptom(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg" placeholder="Mô tả triệu chứng, hiện tượng lỗi..." />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Kỹ thuật viên</label>
                <select value={formTechnician} onChange={e => setFormTechnician(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg">
                  <option value="">Chưa phân công</option>
                  {technicians.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Ghi chú</label>
                <input type="text" value={formNote} onChange={e => setFormNote(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
              </div>
              <button onClick={handleCreate} className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
                Tạo phiếu sửa chữa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedRepair && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h3 className="font-bold text-lg">{selectedRepair.repair_number}</h3>
                <div className="flex gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${repairStatuses[selectedRepair.status]?.color}`}>
                    {repairStatuses[selectedRepair.status]?.icon} {repairStatuses[selectedRepair.status]?.label}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${repairTypes[selectedRepair.repair_type]?.color}`}>
                    {repairTypes[selectedRepair.repair_type]?.label}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-gray-100 rounded-full">✕</button>
            </div>
            <div className="p-4 space-y-4">
              {/* Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                  <div className="font-semibold">Sản phẩm</div>
                  <div>{selectedRepair.product_name}</div>
                  <div className="font-mono">{selectedRepair.serial_number}</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-sm space-y-1">
                  <div className="font-semibold">Khách hàng</div>
                  <div>{selectedRepair.customer_name || '-'}</div>
                  <div>{selectedRepair.customer_phone || '-'}</div>
                </div>
              </div>

              {/* Symptom */}
              <div>
                <div className="font-semibold text-sm mb-1">Triệu chứng</div>
                <div className="bg-yellow-50 rounded-lg p-3 text-sm">{selectedRepair.symptom || '-'}</div>
              </div>

              {/* Diagnosis & Solution (editable) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Chẩn đoán</label>
                  <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Giải pháp</label>
                  <textarea value={solution} onChange={e => setSolution(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>

              {/* Parts */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Linh kiện sử dụng</span>
                  <button onClick={addPart} className="text-xs text-blue-600 hover:underline">+ Thêm</button>
                </div>
                {parts.map((p, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input type="text" value={p.name} onChange={e => updatePart(idx, 'name', e.target.value)} placeholder="Tên linh kiện" className="flex-1 px-2 py-1 border rounded text-sm" />
                    <input type="number" value={p.quantity} onChange={e => updatePart(idx, 'quantity', parseInt(e.target.value) || 1)} className="w-16 px-2 py-1 border rounded text-sm" min="1" />
                    <input type="number" value={p.unit_price} onChange={e => updatePart(idx, 'unit_price', parseFloat(e.target.value) || 0)} placeholder="Đơn giá" className="w-28 px-2 py-1 border rounded text-sm" />
                    <button onClick={() => removePart(idx)} className="text-red-500 text-sm px-1">✕</button>
                  </div>
                ))}
              </div>

              {/* Costs */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Phí linh kiện:</span>
                  <span>{formatMoney(totalPartsCost)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span>Tiền công:</span>
                  <input type="number" value={laborCost} onChange={e => setLaborCost(e.target.value)} className="w-32 px-2 py-1 border rounded text-sm text-right" />
                </div>
                <div className="flex justify-between font-bold border-t pt-2">
                  <span>Tổng chi phí:</span>
                  <span className="text-green-700">{formatMoney(totalCost)}</span>
                </div>
              </div>

              {/* Timeline */}
              <div className="text-xs text-gray-500 space-y-1">
                {selectedRepair.received_at && <div>Tiếp nhận: {formatDateTimeVN(selectedRepair.received_at)}</div>}
                {selectedRepair.diagnosed_at && <div>Chẩn đoán: {formatDateTimeVN(selectedRepair.diagnosed_at)}</div>}
                {selectedRepair.repaired_at && <div>Sửa chữa: {formatDateTimeVN(selectedRepair.repaired_at)}</div>}
                {selectedRepair.completed_at && <div>Hoàn thành: {formatDateTimeVN(selectedRepair.completed_at)}</div>}
                {selectedRepair.returned_at && <div>Trả hàng: {formatDateTimeVN(selectedRepair.returned_at)}</div>}
                {selectedRepair.technician && <div>KTV: {selectedRepair.technician}</div>}
              </div>

              {/* Status flow buttons */}
              {hasPermission('warranty', 2) && (repairStatusFlow[selectedRepair.status] || []).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {(repairStatusFlow[selectedRepair.status] || []).map(nextStatus => {
                    // Cancel requires full CRUD (level 3)
                    if (nextStatus === 'cancelled' && !canEdit('warranty')) return null;
                    const info = repairStatuses[nextStatus] || {};
                    return (
                      <button
                        key={nextStatus}
                        onClick={() => handleChangeStatus(selectedRepair, nextStatus)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${nextStatus === 'cancelled' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                      >
                        {info.icon} {info.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

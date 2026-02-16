import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { getNowISOVN } from '../../utils/dateUtils';
import { serialStatuses } from '../../constants/warrantyConstants';
import QRCode from 'qrcode';
import { logActivity } from '../../lib/activityLog';

export default function WarrantySerialView({ tenant, currentUser, serials, products, warehouses, loadWarrantyData, loadWarehouseData, hasPermission, canEdit }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Form states - single
  const [formProductId, setFormProductId] = useState('');
  const [formSerial, setFormSerial] = useState('');
  const [formBatch, setFormBatch] = useState('');
  const [formMfgDate, setFormMfgDate] = useState('');
  const [formWarehouse, setFormWarehouse] = useState('');
  const [formNote, setFormNote] = useState('');

  // Form states - batch
  const [batchProductId, setBatchProductId] = useState('');
  const [batchPrefix, setBatchPrefix] = useState('');
  const [batchStart, setBatchStart] = useState('1');
  const [batchEnd, setBatchEnd] = useState('10');
  const [batchPadding, setBatchPadding] = useState('4');
  const [batchWarehouse, setBatchWarehouse] = useState('');
  const [batchBatch, setBatchBatch] = useState('');

  const allProducts = products || [];
  const serialProducts = allProducts;

  const filteredSerials = useMemo(() => {
    let list = serials || [];
    if (filterStatus) list = list.filter(s => s.status === filterStatus);
    if (filterProduct) list = list.filter(s => s.product_id === filterProduct);
    if (filterWarehouse) list = list.filter(s => s.warehouse_id === filterWarehouse);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.serial_number || '').toLowerCase().includes(q) ||
        (s.batch_number || '').toLowerCase().includes(q) ||
        (s.customer_name || '').toLowerCase().includes(q) ||
        (s.customer_phone || '').includes(q)
      );
    }
    return list;
  }, [serials, filterStatus, filterProduct, filterWarehouse, search]);

  const paginatedSerials = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSerials.slice(start, start + pageSize);
  }, [filteredSerials, page]);

  const totalPages = Math.ceil(filteredSerials.length / pageSize);

  const getProductName = (pid) => (products || []).find(p => p.id === pid)?.name || '-';
  const getWarehouseName = (wid) => (warehouses || []).find(w => w.id === wid)?.name || '-';

  const stats = useMemo(() => ({
    total: (serials || []).length,
    in_stock: (serials || []).filter(s => s.status === 'in_stock').length,
    sold: (serials || []).filter(s => s.status === 'sold').length,
    warranty_repair: (serials || []).filter(s => s.status === 'warranty_repair').length,
  }), [serials]);

  const resetForm = () => {
    setFormProductId(''); setFormSerial(''); setFormBatch(''); setFormMfgDate('');
    setFormWarehouse(''); setFormNote('');
  };

  const handleCreateSingle = async () => {
    if (!hasPermission('warranty', 2)) return alert('Bạn không có quyền thêm serial');
    if (!formProductId) return alert('Chọn sản phẩm');
    if (!formSerial.trim()) return alert('Nhập serial number');
    try {
      // Check duplicate
      const { data: existing } = await supabase
        .from('product_serials')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('serial_number', formSerial.trim())
        .maybeSingle();
      if (existing) return alert('Serial đã tồn tại!');

      const { error } = await supabase.from('product_serials').insert([{
        tenant_id: tenant.id,
        product_id: formProductId,
        serial_number: formSerial.trim(),
        batch_number: formBatch || null,
        manufacturing_date: formMfgDate || null,
        status: 'in_stock',
        warehouse_id: formWarehouse || null,
        note: formNote || null,
        created_by: currentUser.name
      }]);
      if (error) throw error;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'create', entityType: 'serial',
        entityName: formSerial.trim(),
        description: `Thêm serial: ${formSerial.trim()}`
      });
      // Auto-enable has_serial on the product
      const product = allProducts.find(p => p.id === formProductId);
      if (product && !product.has_serial) {
        await supabase.from('products').update({ has_serial: true }).eq('id', formProductId);
      }
      alert('Thêm serial thành công!');
      setShowCreateModal(false);
      resetForm();
      loadWarrantyData();
      if (loadWarehouseData) loadWarehouseData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  const handleCreateBatch = async () => {
    if (!canEdit('warranty')) return alert('Bạn không có quyền thêm serial hàng loạt');
    if (!batchProductId) return alert('Chọn sản phẩm');
    if (!batchPrefix.trim()) return alert('Nhập tiền tố serial');
    const start = parseInt(batchStart);
    const end = parseInt(batchEnd);
    const padding = parseInt(batchPadding) || 4;
    if (isNaN(start) || isNaN(end) || end < start) return alert('Số bắt đầu/kết thúc không hợp lệ');
    const count = end - start + 1;
    if (count > 200) return alert('Tối đa 200 serial một lần');

    try {
      // Generate serials
      const newSerials = [];
      for (let i = start; i <= end; i++) {
        newSerials.push({
          tenant_id: tenant.id,
          product_id: batchProductId,
          serial_number: batchPrefix + String(i).padStart(padding, '0'),
          batch_number: batchBatch || null,
          status: 'in_stock',
          warehouse_id: batchWarehouse || null,
          created_by: currentUser.name
        });
      }

      // Check duplicates
      const serialNumbers = newSerials.map(s => s.serial_number);
      const { data: existing } = await supabase
        .from('product_serials')
        .select('serial_number')
        .eq('tenant_id', tenant.id)
        .in('serial_number', serialNumbers);
      if (existing && existing.length > 0) {
        return alert(`Serial đã tồn tại: ${existing.map(e => e.serial_number).join(', ')}`);
      }

      const { error } = await supabase.from('product_serials').insert(newSerials);
      if (error) throw error;
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'create', entityType: 'serial',
        description: `Tạo hàng loạt ${count} serial: ${batchPrefix}${String(start).padStart(padding, '0')} → ${batchPrefix}${String(end).padStart(padding, '0')}`
      });
      // Auto-enable has_serial on the product
      const product = allProducts.find(p => p.id === batchProductId);
      if (product && !product.has_serial) {
        await supabase.from('products').update({ has_serial: true }).eq('id', batchProductId);
      }
      alert(`Đã tạo ${count} serial thành công!`);
      setShowBatchModal(false);
      setBatchProductId(''); setBatchPrefix(''); setBatchStart('1'); setBatchEnd('10');
      setBatchWarehouse(''); setBatchBatch('');
      loadWarrantyData();
      if (loadWarehouseData) loadWarehouseData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  const handleChangeStatus = async (serial, newStatus) => {
    if (!hasPermission('warranty', 2)) return alert('Bạn không có quyền đổi trạng thái serial');
    if (!window.confirm(`Đổi trạng thái serial ${serial.serial_number} sang "${serialStatuses[newStatus]?.label}"?`)) return;
    try {
      await supabase.from('product_serials').update({
        status: newStatus,
        updated_at: getNowISOVN()
      }).eq('id', serial.id);
      logActivity({
        tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name,
        module: 'warranty', action: 'update', entityType: 'serial',
        entityId: serial.id, entityName: serial.serial_number,
        description: `Đổi trạng thái serial ${serial.serial_number} sang ${serialStatuses[newStatus]?.label || newStatus}`
      });
      loadWarrantyData();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  const printSerialLabels = async (serialsToPrint) => {
    const labels = [];
    for (const s of serialsToPrint) {
      try {
        const qr = await QRCode.toDataURL(s.serial_number, { width: 100, margin: 1 });
        labels.push({ serial: s.serial_number, product: getProductName(s.product_id), qr });
      } catch (_e) {
        labels.push({ serial: s.serial_number, product: getProductName(s.product_id), qr: '' });
      }
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tem Serial</title>
<style>body{font-family:Arial,sans-serif;margin:0;padding:10px}.label{display:inline-block;width:50mm;height:30mm;border:1px dashed #ccc;margin:2mm;padding:3mm;text-align:center;page-break-inside:avoid;vertical-align:top}.label img{width:18mm;height:18mm}.sn{font-size:9px;font-family:monospace;font-weight:bold;margin:1mm 0}.pn{font-size:7px;color:#666}@media print{.label{border:none}}</style></head><body>
${labels.map(l => `<div class="label">${l.qr ? `<img src="${l.qr}">` : ''}<div class="sn">${l.serial}</div><div class="pn">${l.product}</div></div>`).join('')}
<script>window.onload=function(){window.print()}</script></body></html>`;
    const win = window.open('', '_blank', 'width=600,height=400');
    win.document.write(html); win.document.close();
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-gray-600 text-sm">Tổng serial</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
          <div className="text-2xl font-bold text-green-600">{stats.in_stock}</div>
          <div className="text-gray-600 text-sm">Trong kho</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-purple-500">
          <div className="text-2xl font-bold text-purple-600">{stats.sold}</div>
          <div className="text-gray-600 text-sm">Đã bán</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-orange-500">
          <div className="text-2xl font-bold text-orange-600">{stats.warranty_repair}</div>
          <div className="text-gray-600 text-sm">Đang BH</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm serial, batch, khách hàng..."
            className="flex-1 px-3 py-2 border rounded-lg"
          />
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg">
            <option value="">Tất cả trạng thái</option>
            {Object.entries(serialStatuses).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={filterProduct} onChange={e => { setFilterProduct(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg">
            <option value="">Tất cả SP</option>
            {allProducts.map(p => <option key={p.id} value={p.id}>{p.name}{p.has_serial ? ' [Serial]' : ''}</option>)}
          </select>
          <select value={filterWarehouse} onChange={e => { setFilterWarehouse(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg">
            <option value="">Tất cả kho</option>
            {(warehouses || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {hasPermission('warranty', 2) && (
            <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
              + Thêm serial
            </button>
          )}
          {canEdit('warranty') && (
            <button onClick={() => setShowBatchModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
              + Thêm hàng loạt
            </button>
          )}
          {filteredSerials.length > 0 && (
            <button onClick={() => printSerialLabels(paginatedSerials)} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium">
              🏷️ In tem
            </button>
          )}
        </div>
      </div>

      {/* Serial list */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Serial</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Sản phẩm</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">Batch</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">Kho</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">Khách hàng</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedSerials.map(s => {
                const st = serialStatuses[s.status] || {};
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium">{s.serial_number}</td>
                    <td className="px-4 py-3">{getProductName(s.product_id)}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500">{s.batch_number || '-'}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500">{s.warehouse_id ? getWarehouseName(s.warehouse_id) : '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color || 'bg-gray-100'}`}>
                        {st.icon} {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500">{s.customer_name || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {hasPermission('warranty', 2) && s.status === 'in_stock' && (
                        <button onClick={() => handleChangeStatus(s, 'defective')} className="text-xs text-red-600 hover:underline" title="Đánh dấu lỗi">Lỗi</button>
                      )}
                      {hasPermission('warranty', 2) && s.status === 'defective' && (
                        <button onClick={() => handleChangeStatus(s, 'in_stock')} className="text-xs text-green-600 hover:underline" title="Hoàn lại kho">Kho</button>
                      )}
                      {hasPermission('warranty', 2) && s.status === 'returned' && (
                        <button onClick={() => handleChangeStatus(s, 'in_stock')} className="text-xs text-green-600 hover:underline" title="Nhập lại kho">Kho</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paginatedSerials.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Không có serial nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <span className="text-sm text-gray-600">{filteredSerials.length} serial</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-50">←</button>
              <span className="px-3 py-1 text-sm">{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 border rounded disabled:opacity-50">→</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Single Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">Thêm serial</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-gray-100 rounded">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Sản phẩm *</label>
                <select value={formProductId} onChange={e => setFormProductId(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg">
                  <option value="">Chọn sản phẩm</option>
                  {serialProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku || '-'}){p.has_serial ? ' [Serial]' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Serial Number *</label>
                <input type="text" value={formSerial} onChange={e => setFormSerial(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" placeholder="VD: SN-2024-001" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Batch</label>
                  <input type="text" value={formBatch} onChange={e => setFormBatch(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Ngày SX</label>
                  <input type="date" value={formMfgDate} onChange={e => setFormMfgDate(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Kho</label>
                <select value={formWarehouse} onChange={e => setFormWarehouse(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg">
                  <option value="">Chọn kho</option>
                  {(warehouses || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Ghi chú</label>
                <input type="text" value={formNote} onChange={e => setFormNote(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
              </div>
              <button onClick={handleCreateSingle} className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
                Thêm serial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Create Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBatchModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">Thêm serial hàng loạt</h3>
              <button onClick={() => setShowBatchModal(false)} className="p-1 hover:bg-gray-100 rounded">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Sản phẩm *</label>
                <select value={batchProductId} onChange={e => setBatchProductId(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg">
                  <option value="">Chọn sản phẩm</option>
                  {serialProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku || '-'}){p.has_serial ? ' [Serial]' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Tiền tố serial *</label>
                <input type="text" value={batchPrefix} onChange={e => setBatchPrefix(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" placeholder="VD: HNA-SPK-" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Bắt đầu</label>
                  <input type="number" value={batchStart} onChange={e => setBatchStart(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Kết thúc</label>
                  <input type="number" value={batchEnd} onChange={e => setBatchEnd(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Padding</label>
                  <input type="number" value={batchPadding} onChange={e => setBatchPadding(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="text-sm text-gray-500">
                Preview: {batchPrefix}{String(parseInt(batchStart) || 1).padStart(parseInt(batchPadding) || 4, '0')} ... {batchPrefix}{String(parseInt(batchEnd) || 10).padStart(parseInt(batchPadding) || 4, '0')}
                <br />Tổng: {Math.max(0, (parseInt(batchEnd) || 0) - (parseInt(batchStart) || 0) + 1)} serial
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Kho</label>
                  <select value={batchWarehouse} onChange={e => setBatchWarehouse(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg">
                    <option value="">Chọn kho</option>
                    {(warehouses || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Batch</label>
                  <input type="text" value={batchBatch} onChange={e => setBatchBatch(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <button onClick={handleCreateBatch} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                Tạo hàng loạt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

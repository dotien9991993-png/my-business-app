import React, { useState } from 'react';

export default function WarehouseHistoryView({ stockTransactions, warehouses }) {
  const [filterType, setFilterType] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

  const getWarehouseName = (whId) => {
    if (!whId) return '';
    const wh = (warehouses || []).find(w => w.id === whId);
    return wh ? wh.name : '';
  };

  const filteredTransactions = stockTransactions.filter(t => {
    const matchType = !filterType || t.type === filterType;
    const matchWarehouse = !filterWarehouse || t.warehouse_id === filterWarehouse;
    const matchSearch = !searchTerm ||
      t.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.partner_name && t.partner_name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchType && matchSearch && matchWarehouse;
  });

  const totalTransfer = stockTransactions.filter(t => t.type === 'transfer').length;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-gray-500">
          <div className="text-2xl font-bold text-gray-600">{stockTransactions.length}</div>
          <div className="text-gray-600 text-sm">Tổng giao dịch</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
          <div className="text-2xl font-bold text-green-600">{stockTransactions.filter(t => t.type === 'import').length}</div>
          <div className="text-gray-600 text-sm">Phiếu nhập</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-blue-600">{stockTransactions.filter(t => t.type === 'export').length}</div>
          <div className="text-gray-600 text-sm">Phiếu xuất</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-purple-500">
          <div className="text-2xl font-bold text-purple-600">{totalTransfer}</div>
          <div className="text-gray-600 text-sm">Chuyển kho</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="Tìm kiếm..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="">Tất cả loại</option>
          <option value="import">Nhập kho</option>
          <option value="export">Xuất kho</option>
          <option value="transfer">Chuyển kho</option>
        </select>
        {warehouses && warehouses.length > 1 && (
          <select
            value={filterWarehouse}
            onChange={(e) => setFilterWarehouse(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="">Tất cả kho</option>
            {warehouses.filter(w => w.is_active).map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-bold text-lg mb-4">Lịch sử giao dịch</h3>
        <div className="space-y-3">
          {filteredTransactions.length === 0 ? (
            <div className="text-center text-gray-500 py-8">Chưa có giao dịch nào</div>
          ) : filteredTransactions.map(trans => {
            const isTransfer = trans.type === 'transfer';
            const bgColor = isTransfer ? 'bg-purple-50' : trans.type === 'import' ? 'bg-green-50' : 'bg-blue-50';
            const iconBg = isTransfer ? 'bg-purple-500' : trans.type === 'import' ? 'bg-green-500' : 'bg-blue-500';
            const icon = isTransfer ? '🔄' : trans.type === 'import' ? '📥' : '📤';
            const textColor = isTransfer ? 'text-purple-600' : trans.type === 'import' ? 'text-green-600' : 'text-blue-600';
            const whName = getWarehouseName(trans.warehouse_id);
            const toWhName = isTransfer ? getWarehouseName(trans.transfer_to_warehouse_id) : '';

            return (
              <div key={trans.id} className={`flex items-start gap-4 p-4 rounded-lg ${bgColor}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBg} text-white text-lg`}>
                  {icon}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`font-mono text-sm ${textColor}`}>
                        {trans.transaction_number}
                      </span>
                      <div className="font-medium">
                        {isTransfer
                          ? `Chuyển kho: ${whName || 'N/A'} → ${toWhName || 'N/A'}`
                          : trans.partner_name || (trans.type === 'import' ? 'Nhập kho' : 'Xuất kho')
                        }
                      </div>
                      {whName && !isTransfer && (
                        <div className="text-xs text-gray-500 mt-0.5">Kho: {whName}</div>
                      )}
                    </div>
                    <div className="text-right">
                      {!isTransfer && (
                        <div className={`font-bold ${textColor}`}>
                          {trans.type === 'import' ? '+' : '-'}{formatCurrency(trans.total_amount)}
                        </div>
                      )}
                      <div className="text-sm text-gray-500">{new Date(trans.transaction_date).toLocaleDateString('vi-VN')}</div>
                    </div>
                  </div>
                  {trans.note && <div className="text-sm text-gray-600 mt-1">{trans.note}</div>}
                  <div className="text-xs text-gray-400 mt-1">Bởi: {trans.created_by}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

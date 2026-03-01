import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
const formatNumber = (num) => new Intl.NumberFormat('vi-VN').format(num || 0);

export default function WarehouseReportView({ products, stockTransactions, warehouses, warehouseStock, tenant, hasPermission, getPermissionLevel }) {
  const permLevel = getPermissionLevel('warehouse');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);

  // State
  const [reportType, setReportType] = useState('xnt');
  const [periodType, setPeriodType] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [xntData, setXntData] = useState([]);
  const [loadingXnt, setLoadingXnt] = useState(false);
  // History state
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const HISTORY_PAGE_SIZE = 30;

  // Period helpers
  const getDateRange = useCallback(() => {
    let startDate, endDate;

    if (periodType === 'month') {
      const [y, m] = selectedMonth.split('-').map(Number);
      startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (periodType === 'quarter') {
      const startMonth = (selectedQuarter - 1) * 3 + 1;
      const endMonth = selectedQuarter * 3;
      startDate = `${selectedYear}-${String(startMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, endMonth, 0).getDate();
      endDate = `${selectedYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else {
      startDate = customStartDate || `${currentYear}-01-01`;
      endDate = customEndDate || `${currentYear}-12-31`;
    }

    return { startDate, endDate };
  }, [periodType, selectedMonth, selectedQuarter, selectedYear, customStartDate, customEndDate, currentYear]);

  // Load XNT report
  const loadXntReport = useCallback(async () => {
    if (!tenant?.id) return;
    setLoadingXnt(true);

    try {
      const { startDate, endDate } = getDateRange();

      let query = supabase
        .from('stock_transaction_items')
        .select('*, stock_transactions!inner(type, transaction_date, warehouse_id, tenant_id)')
        .eq('stock_transactions.tenant_id', tenant.id)
        .gte('stock_transactions.transaction_date', startDate)
        .lte('stock_transactions.transaction_date', endDate);

      if (filterWarehouse) {
        query = query.eq('stock_transactions.warehouse_id', filterWarehouse);
      }

      const { data: items, error } = await query;

      if (error) {
        console.error('Lỗi tải báo cáo XNT:', error);
        setXntData([]);
        setLoadingXnt(false);
        return;
      }

      // Group by product_id
      const grouped = {};
      (items || []).forEach(item => {
        const pid = item.product_id;
        if (!grouped[pid]) {
          grouped[pid] = { nhap: 0, xuat: 0, nhap_value: 0, xuat_value: 0 };
        }
        const qty = item.quantity || 0;
        const price = item.unit_price || 0;
        if (item.stock_transactions.type === 'import') {
          grouped[pid].nhap += qty;
          grouped[pid].nhap_value += qty * price;
        } else if (item.stock_transactions.type === 'export') {
          grouped[pid].xuat += qty;
          grouped[pid].xuat_value += qty * price;
        }
      });

      // Build XNT data array
      const result = (products || []).map(product => {
        const pid = product.id;
        const stats = grouped[pid] || { nhap: 0, xuat: 0, nhap_value: 0, xuat_value: 0 };

        // Current stock
        let ton_cuoi = product.stock || 0;
        if (filterWarehouse && warehouseStock) {
          const ws = warehouseStock.find(w => w.product_id === pid && w.warehouse_id === filterWarehouse);
          ton_cuoi = ws ? (ws.quantity || 0) : 0;
        }

        // Beginning stock = end stock - imports + exports
        const ton_dau = ton_cuoi - stats.nhap + stats.xuat;

        return {
          product_id: pid,
          product_name: product.name || '',
          sku: product.sku || '',
          ton_dau,
          nhap: stats.nhap,
          xuat: stats.xuat,
          ton_cuoi,
          nhap_value: stats.nhap_value || (stats.nhap * (product.import_price || 0)),
          xuat_value: stats.xuat_value || (stats.xuat * (product.sell_price || product.import_price || 0)),
        };
      }).filter(item => item.nhap > 0 || item.xuat > 0 || item.ton_dau !== 0 || item.ton_cuoi !== 0);

      setXntData(result);
    } catch (err) {
      console.error('Lỗi tải báo cáo XNT:', err);
      setXntData([]);
    } finally {
      setLoadingXnt(false);
    }
  }, [tenant, getDateRange, filterWarehouse, products, warehouseStock]);

  // Auto-load XNT when dependencies change
  useEffect(() => {
    if (reportType === 'xnt') {
      loadXntReport();
    }
  }, [reportType, loadXntReport]);

  // XNT summary
  const xntSummary = useMemo(() => {
    const totalNhapQty = xntData.reduce((s, r) => s + r.nhap, 0);
    const totalXuatQty = xntData.reduce((s, r) => s + r.xuat, 0);
    const totalNhapValue = xntData.reduce((s, r) => s + r.nhap_value, 0);
    const totalXuatValue = xntData.reduce((s, r) => s + r.xuat_value, 0);
    return { totalNhapQty, totalXuatQty, totalNhapValue, totalXuatValue };
  }, [xntData]);

  // Chart data: last 6 months import/export totals
  const chartData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      months.push({ key, label: `T${m}/${y}`, nhap: 0, xuat: 0 });
    }

    (stockTransactions || []).forEach(tx => {
      if (!tx.transaction_date) return;
      const txMonth = tx.transaction_date.substring(0, 7);
      const found = months.find(m => m.key === txMonth);
      if (found) {
        const qty = tx.total_quantity || tx.quantity || 0;
        if (tx.type === 'import') found.nhap += qty;
        else if (tx.type === 'export') found.xuat += qty;
      }
    });

    return months.map(m => ({ month: m.label, nhap: m.nhap, xuat: m.xuat }));
  }, [stockTransactions, now]);

  // Value report data
  const valueData = useMemo(() => {
    let totalCostValue = 0;
    let totalSellValue = 0;

    (products || []).forEach(p => {
      const stock = p.stock_quantity || 0;
      const cost = p.avg_cost || p.import_price || 0;
      const sell = p.sell_price || 0;
      totalCostValue += stock * cost;
      totalSellValue += stock * sell;
    });

    const expectedProfit = totalSellValue - totalCostValue;

    // Top 10 by capital tied up
    const top10ByValue = [...(products || [])]
      .map(p => ({
        ...p,
        tiedValue: (p.stock_quantity || 0) * (p.import_price || 0),
      }))
      .sort((a, b) => b.tiedValue - a.tiedValue)
      .slice(0, 10);

    // Top 10 by sales volume in period
    const { startDate, endDate } = getDateRange();
    const exportTx = (stockTransactions || []).filter(tx =>
      tx.type === 'export' &&
      tx.transaction_date >= startDate &&
      tx.transaction_date <= endDate
    );

    const salesByProduct = {};
    exportTx.forEach(tx => {
      // If transaction has items detail, use them; otherwise approximate
      const pid = tx.product_id;
      if (pid) {
        salesByProduct[pid] = (salesByProduct[pid] || 0) + (tx.total_quantity || tx.quantity || 0);
      }
    });

    const top10BySales = Object.entries(salesByProduct)
      .map(([pid, qty]) => {
        const product = (products || []).find(p => p.id === pid);
        return { product_id: pid, product_name: product?.name || 'N/A', sku: product?.sku || '', qty };
      })
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    return { totalCostValue, totalSellValue, expectedProfit, top10ByValue, top10BySales };
  }, [products, stockTransactions, getDateRange]);

  // Stock value trend for chart (last 6 months approximation)
  const valueChartData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      months.push({ label: `T${m}/${y}`, value: 0 });
    }

    // Use current stock × import_price as approximation for each month
    const currentValue = (products || []).reduce((s, p) => s + (p.stock_quantity || 0) * (p.import_price || 0), 0);

    // Approximate past values by subtracting/adding transactions
    let runningValue = currentValue;
    const reversed = [...months].reverse();
    reversed.forEach((m, idx) => {
      if (idx === 0) {
        m.value = currentValue;
      } else {
        // Subtract this month's imports, add exports (going backwards)
        const prev = reversed[idx - 1];
        const monthKey = (() => {
          const parts = prev.label.replace('T', '').split('/');
          return `${parts[1]}-${String(parts[0]).padStart(2, '0')}`;
        })();

        let monthImportValue = 0;
        let monthExportValue = 0;
        (stockTransactions || []).forEach(tx => {
          if (!tx.transaction_date) return;
          const txMonth = tx.transaction_date.substring(0, 7);
          if (txMonth === monthKey) {
            const qty = tx.total_quantity || tx.quantity || 0;
            const price = tx.unit_price || 0;
            if (tx.type === 'import') monthImportValue += qty * price;
            else if (tx.type === 'export') monthExportValue += qty * price;
          }
        });

        runningValue = runningValue - monthImportValue + monthExportValue;
        m.value = Math.max(0, runningValue);
      }
    });

    return months.map(m => ({ month: m.label, value: m.value }));
  }, [products, stockTransactions, now]);

  // ---- Low stock products ----
  const lowStockProducts = useMemo(() => {
    return (products || [])
      .map(p => {
        const minStock = p.min_stock || 5;
        let stock = p.stock_quantity || p.stock || 0;
        if (filterWarehouse && warehouseStock) {
          const ws = warehouseStock.find(w => w.product_id === p.id && w.warehouse_id === filterWarehouse);
          stock = ws ? (ws.quantity || 0) : 0;
        }
        return { ...p, currentStock: stock, minStock, needMore: Math.max(0, minStock - stock) };
      })
      .filter(p => p.currentStock <= p.minStock)
      .sort((a, b) => a.currentStock - b.currentStock);
  }, [products, warehouseStock, filterWarehouse]);

  const lowStockSummary = useMemo(() => ({
    total: lowStockProducts.length,
    outOfStock: lowStockProducts.filter(p => p.currentStock === 0).length,
  }), [lowStockProducts]);

  // ---- Stock history (paginated) ----
  const loadHistory = useCallback(async () => {
    if (!tenant?.id) return;
    setLoadingHistory(true);
    try {
      const { startDate, endDate } = getDateRange();
      let query = supabase
        .from('stock_transactions')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .order('created_at', { ascending: false })
        .range(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE - 1);
      if (filterWarehouse) query = query.eq('warehouse_id', filterWarehouse);
      const { data, count, error } = await query;
      if (error) throw error;
      // Map warehouse names
      const mapped = (data || []).map(tx => {
        const wh = (warehouses || []).find(w => w.id === tx.warehouse_id);
        return { ...tx, warehouse_name: wh?.name || '—' };
      });
      setHistoryData(mapped);
      setHistoryTotal(count || 0);
    } catch (err) {
      console.error('Load history error:', err);
      setHistoryData([]);
    }
    setLoadingHistory(false);
  }, [tenant, getDateRange, filterWarehouse, historyPage, warehouses]);

  useEffect(() => {
    if (reportType === 'history') loadHistory();
  }, [reportType, loadHistory]);

  // Entire view guard (placed after all hooks to comply with rules-of-hooks)
  if (!hasPermission('warehouse', 2)) {
    return (
      <div className="p-8 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <p className="text-gray-500">Bạn không có quyền xem báo cáo kho</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Report type tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'xnt', label: 'Xuất Nhập Tồn' },
          { id: 'value', label: 'Giá Trị Kho' },
          { id: 'lowstock', label: 'Cảnh Báo Tồn Kho' },
          { id: 'history', label: 'Lịch Sử Kho' },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => setReportType(tab.id)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              reportType === tab.id
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            {tab.id === 'lowstock' && lowStockSummary.total > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{lowStockSummary.total}</span>
            )}
          </button>
        ))}
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period type radios */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="periodType"
                value="month"
                checked={periodType === 'month'}
                onChange={() => setPeriodType('month')}
                className="accent-amber-600"
              />
              <span className="text-sm">Tháng</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="periodType"
                value="quarter"
                checked={periodType === 'quarter'}
                onChange={() => setPeriodType('quarter')}
                className="accent-amber-600"
              />
              <span className="text-sm">Quý</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="periodType"
                value="custom"
                checked={periodType === 'custom'}
                onChange={() => setPeriodType('custom')}
                className="accent-amber-600"
              />
              <span className="text-sm">Tùy chọn</span>
            </label>
          </div>

          <div className="h-6 w-px bg-gray-300" />

          {/* Date inputs based on period type */}
          {periodType === 'month' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          )}

          {periodType === 'quarter' && (
            <div className="flex items-center gap-2">
              <select
                value={selectedQuarter}
                onChange={e => setSelectedQuarter(Number(e.target.value))}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value={1}>Quý 1</option>
                <option value={2}>Quý 2</option>
                <option value={3}>Quý 3</option>
                <option value={4}>Quý 4</option>
              </select>
              <input
                type="number"
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="border rounded-lg px-3 py-1.5 text-sm w-24 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                min={2020}
                max={2030}
              />
            </div>
          )}

          {periodType === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              <span className="text-gray-500 text-sm">đến</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          )}

          <div className="h-6 w-px bg-gray-300" />

          {/* Warehouse filter */}
          <select
            value={filterWarehouse}
            onChange={e => setFilterWarehouse(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          >
            <option value="">Tất cả kho</option>
            {(warehouses || []).map(wh => (
              <option key={wh.id} value={wh.id}>{wh.name}</option>
            ))}
          </select>

          {/* Load report button */}
          {reportType === 'xnt' && (
            <button
              onClick={loadXntReport}
              disabled={loadingXnt}
              className="ml-auto bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {loadingXnt ? 'Đang tải...' : 'Tải báo cáo'}
            </button>
          )}
        </div>
      </div>

      {/* XNT Report */}
      {reportType === 'xnt' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-l-4 border-l-green-500 p-4">
              <p className="text-sm text-gray-500 mb-1">Tổng nhập</p>
              <p className="text-2xl font-bold text-green-700">{formatNumber(xntSummary.totalNhapQty)} <span className="text-sm font-normal text-gray-500">SP</span></p>
              <p className="text-sm text-green-600 mt-1">{permLevel >= 3 ? formatCurrency(xntSummary.totalNhapValue) : '---'}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-l-4 border-l-amber-500 p-4">
              <p className="text-sm text-gray-500 mb-1">Tổng xuất</p>
              <p className="text-2xl font-bold text-amber-700">{formatNumber(xntSummary.totalXuatQty)} <span className="text-sm font-normal text-gray-500">SP</span></p>
              <p className="text-sm text-amber-600 mt-1">{permLevel >= 3 ? formatCurrency(xntSummary.totalXuatValue) : '---'}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-l-4 border-l-blue-500 p-4">
              <p className="text-sm text-gray-500 mb-1">Chênh lệch</p>
              <p className="text-2xl font-bold text-blue-700">
                {formatNumber(xntSummary.totalNhapQty - xntSummary.totalXuatQty)} <span className="text-sm font-normal text-gray-500">SP</span>
              </p>
              <p className="text-sm text-blue-600 mt-1">{permLevel >= 3 ? formatCurrency(xntSummary.totalNhapValue - xntSummary.totalXuatValue) : '---'}</p>
            </div>
          </div>

          {/* XNT Table */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800">Bảng Xuất Nhập Tồn</h3>
              <p className="text-sm text-gray-500 mt-0.5">{xntData.length} sản phẩm có biến động</p>
            </div>

            {loadingXnt ? (
              <div className="p-8 text-center text-gray-500">
                <div className="inline-block w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" />
                <p>Đang tải dữ liệu...</p>
              </div>
            ) : xntData.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p>Không có dữ liệu trong kỳ đã chọn</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-600">STT</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Mã SP</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Tên SP</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Tồn đầu kỳ</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Nhập</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Xuất</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Tồn cuối kỳ</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">GT Nhập</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">GT Xuất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {xntData.map((row, idx) => (
                      <tr key={row.product_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.sku || '-'}</td>
                        <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px] truncate">{row.product_name}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(row.ton_dau)}</td>
                        <td className="px-3 py-2 text-right text-green-600 font-medium">{row.nhap > 0 ? `+${formatNumber(row.nhap)}` : '-'}</td>
                        <td className="px-3 py-2 text-right text-amber-600 font-medium">{row.xuat > 0 ? `-${formatNumber(row.xuat)}` : '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatNumber(row.ton_cuoi)}</td>
                        <td className="px-3 py-2 text-right text-green-600 text-xs">{permLevel >= 3 ? (row.nhap_value > 0 ? formatCurrency(row.nhap_value) : '-') : '---'}</td>
                        <td className="px-3 py-2 text-right text-amber-600 text-xs">{permLevel >= 3 ? (row.xuat_value > 0 ? formatCurrency(row.xuat_value) : '-') : '---'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold border-t-2">
                      <td colSpan={3} className="px-3 py-2 text-gray-700">Tổng cộng</td>
                      <td className="px-3 py-2 text-right">{formatNumber(xntData.reduce((s, r) => s + r.ton_dau, 0))}</td>
                      <td className="px-3 py-2 text-right text-green-600">+{formatNumber(xntSummary.totalNhapQty)}</td>
                      <td className="px-3 py-2 text-right text-amber-600">-{formatNumber(xntSummary.totalXuatQty)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(xntData.reduce((s, r) => s + r.ton_cuoi, 0))}</td>
                      <td className="px-3 py-2 text-right text-green-600 text-xs">{permLevel >= 3 ? formatCurrency(xntSummary.totalNhapValue) : '---'}</td>
                      <td className="px-3 py-2 text-right text-amber-600 text-xs">{permLevel >= 3 ? formatCurrency(xntSummary.totalXuatValue) : '---'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Bar chart: Import vs Export by month */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="font-semibold text-gray-800 mb-4">Biểu đồ Nhập - Xuất 6 tháng gần nhất</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value, name) => [formatNumber(value), name === 'nhap' ? 'Nhập' : 'Xuất']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                  <Legend formatter={(value) => value === 'nhap' ? 'Nhập kho' : 'Xuất kho'} />
                  <Bar dataKey="nhap" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="xuat" fill="#d97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Value Report */}
      {reportType === 'value' && (
        <div className="space-y-4">
          {/* 3 big stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-l-4 border-l-green-500 p-5">
              <p className="text-sm text-gray-500 mb-1">Giá trị nhập (vốn)</p>
              <p className="text-2xl font-bold text-green-700">{permLevel >= 3 ? formatCurrency(valueData.totalCostValue) : '---'}</p>
              <p className="text-xs text-gray-400 mt-1">Tổng tồn kho x giá nhập</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-l-4 border-l-amber-500 p-5">
              <p className="text-sm text-gray-500 mb-1">Giá trị bán (doanh thu tiềm năng)</p>
              <p className="text-2xl font-bold text-amber-700">{permLevel >= 3 ? formatCurrency(valueData.totalSellValue) : '---'}</p>
              <p className="text-xs text-gray-400 mt-1">Tổng tồn kho x giá bán</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-l-4 border-l-blue-500 p-5">
              <p className="text-sm text-gray-500 mb-1">Lợi nhuận dự kiến</p>
              <p className={`text-2xl font-bold ${valueData.expectedProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                {permLevel >= 3 ? formatCurrency(valueData.expectedProfit) : '---'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Giá bán - Giá nhập</p>
            </div>
          </div>

          {/* Top 10 capital tied up */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800">Top 10 vốn tồn kho</h3>
              <p className="text-sm text-gray-500 mt-0.5">Sản phẩm chiếm nhiều vốn nhất</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2 font-medium text-gray-600">STT</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Sản phẩm</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Mã SP</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">Tồn kho</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">Giá nhập</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">Giá trị tồn</th>
                  </tr>
                </thead>
                <tbody>
                  {valueData.top10ByValue.map((p, idx) => (
                    <tr key={p.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px] truncate">{p.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{p.sku || '-'}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(p.stock_quantity || 0)}</td>
                      <td className="px-3 py-2 text-right text-xs">{permLevel >= 3 ? formatCurrency(p.import_price) : '---'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-amber-700">{permLevel >= 3 ? formatCurrency(p.tiedValue) : '---'}</td>
                    </tr>
                  ))}
                </tbody>
                {valueData.top10ByValue.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold border-t-2">
                      <td colSpan={5} className="px-3 py-2 text-gray-700">Tổng Top 10</td>
                      <td className="px-3 py-2 text-right text-amber-700">
                        {permLevel >= 3 ? formatCurrency(valueData.top10ByValue.reduce((s, p) => s + p.tiedValue, 0)) : '---'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {valueData.top10ByValue.length === 0 && (
                <div className="p-8 text-center text-gray-500">Chưa có dữ liệu sản phẩm</div>
              )}
            </div>
          </div>

          {/* Top 10 by sales */}
          {valueData.top10BySales.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="p-4 border-b bg-gray-50">
                <h3 className="font-semibold text-gray-800">Top 10 xuất kho nhiều nhất</h3>
                <p className="text-sm text-gray-500 mt-0.5">Trong kỳ đã chọn</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-600">STT</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Sản phẩm</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Mã SP</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">SL xuất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valueData.top10BySales.map((item, idx) => (
                      <tr key={item.product_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{item.product_name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.sku || '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-700">{formatNumber(item.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Line chart: Stock value trend */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="font-semibold text-gray-800 mb-4">Xu hướng giá trị tồn kho (6 tháng)</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={valueChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => {
                      if (val >= 1e9) return `${(val / 1e9).toFixed(1)}tỷ`;
                      if (val >= 1e6) return `${(val / 1e6).toFixed(0)}tr`;
                      if (val >= 1e3) return `${(val / 1e3).toFixed(0)}k`;
                      return val;
                    }}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value), 'Giá trị tồn']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                  <Legend formatter={() => 'Giá trị tồn kho'} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#d97706"
                    strokeWidth={2}
                    dot={{ fill: '#d97706', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Low Stock Report */}
      {reportType === 'lowstock' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-l-4 border-l-red-500 p-4">
              <p className="text-sm text-gray-500 mb-1">Cần nhập thêm</p>
              <p className="text-2xl font-bold text-red-700">{lowStockSummary.total} <span className="text-sm font-normal text-gray-500">sản phẩm</span></p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-l-4 border-l-orange-500 p-4">
              <p className="text-sm text-gray-500 mb-1">Hết hàng</p>
              <p className="text-2xl font-bold text-orange-700">{lowStockSummary.outOfStock} <span className="text-sm font-normal text-gray-500">sản phẩm</span></p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-l-4 border-l-green-500 p-4">
              <p className="text-sm text-gray-500 mb-1">Tổng sản phẩm</p>
              <p className="text-2xl font-bold text-green-700">{(products || []).length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800">Sản phẩm cần nhập thêm</h3>
              <p className="text-sm text-gray-500 mt-0.5">{lowStockProducts.length} sản phẩm dưới mức tồn kho tối thiểu</p>
            </div>
            {lowStockProducts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Tất cả sản phẩm đều đủ tồn kho</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-600">STT</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Mã SP</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Tên SP</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Tồn hiện tại</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Tồn tối thiểu</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Cần nhập thêm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockProducts.map((p, idx) => (
                      <tr key={p.id} className={`${p.currentStock === 0 ? 'bg-red-50' : p.currentStock <= Math.floor(p.minStock / 2) ? 'bg-yellow-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{p.sku || '-'}</td>
                        <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px] truncate">{p.name}</td>
                        <td className={`px-3 py-2 text-right font-bold ${p.currentStock === 0 ? 'text-red-600' : 'text-orange-600'}`}>{formatNumber(p.currentStock)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{formatNumber(p.minStock)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-700">{formatNumber(p.needMore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Report */}
      {reportType === 'history' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Lịch sử xuất nhập kho</h3>
                <p className="text-sm text-gray-500 mt-0.5">{historyTotal} phiếu trong kỳ</p>
              </div>
              <button onClick={loadHistory} disabled={loadingHistory}
                className="bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {loadingHistory ? 'Đang tải...' : 'Tải lại'}
              </button>
            </div>
            {loadingHistory ? (
              <div className="p-8 text-center text-gray-500">
                <div className="inline-block w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" />
                <p>Đang tải dữ liệu...</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Không có phiếu nào trong kỳ đã chọn</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-600">Thời gian</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Loại</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Mã phiếu</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Kho</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Tổng tiền</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Nhân viên</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.map((tx, idx) => (
                      <tr key={tx.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-600 text-xs">{new Date(tx.created_at).toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${tx.type === 'import' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {tx.type === 'import' ? 'Nhập' : 'Xuất'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{tx.transaction_code || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{tx.warehouse_name}</td>
                        <td className="px-3 py-2 text-right font-medium">{permLevel >= 3 ? formatCurrency(tx.total_amount || 0) : '---'}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{tx.created_by || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* Pagination */}
          {Math.ceil(historyTotal / HISTORY_PAGE_SIZE) > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPage === 0}
                className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">&lt;</button>
              <span className="text-sm text-gray-600">Trang {historyPage + 1} / {Math.ceil(historyTotal / HISTORY_PAGE_SIZE)}</span>
              <button onClick={() => setHistoryPage(p => Math.min(Math.ceil(historyTotal / HISTORY_PAGE_SIZE) - 1, p + 1))}
                disabled={historyPage >= Math.ceil(historyTotal / HISTORY_PAGE_SIZE) - 1}
                className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">&gt;</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { formatMoney } from '../../utils/formatUtils';
// formatDateVN available from '../../utils/dateUtils' if needed
import { useData } from '../../contexts/DataContext';
import { useApp } from '../../contexts/AppContext';
import { isAdmin } from '../../utils/permissionUtils';
import {
  TimeFilter, useTimeFilter, StatCard, Section, ExportButton, PrintButton,
  EmptyState, PIE_COLORS, ChartTooltip, exportToCSV, formatPercent, pctChange
} from './reportUtils';
import ReportGrid from './ReportGrid';
import ReportDetailWrapper, { ComingSoon } from './ReportDetailWrapper';

// ===== HELPER: parse order items (có thể là JSON string hoặc array) =====
function parseOrderItems(order) {
  if (!order.items) return [];
  if (typeof order.items === 'string') {
    try { return JSON.parse(order.items); } catch (_e) { return []; }
  }
  return Array.isArray(order.items) ? order.items : [];
}

function ProductsContent() {
  const { products, orders, stockTransactions } = useData();
  const { currentUser } = useApp();
  const canViewProfit = isAdmin(currentUser) || (currentUser?.permissions?.dashboard || 0) >= 3;
  const tf = useTimeFilter('month');
  const { filterCurrent, filterPrev } = tf;

  // ===== Lọc dữ liệu theo kỳ =====
  const currentOrders = useMemo(() => filterCurrent(orders, 'created_at'), [orders, filterCurrent]);
  const currentTransactions = useMemo(() => filterCurrent(stockTransactions, 'created_at'), [stockTransactions, filterCurrent]);
  const prevTransactions = useMemo(() => filterPrev(stockTransactions, 'created_at'), [stockTransactions, filterPrev]);

  // ===== 1. KPI Cards =====
  const kpis = useMemo(() => {
    const allProducts = products || [];
    const totalSKU = allProducts.length;

    const stockValue = allProducts.reduce((sum, p) => {
      const qty = parseFloat(p.stock_quantity || 0);
      const cost = parseFloat(p.cost_price || p.price || 0);
      return sum + qty * cost;
    }, 0);

    const lowStockCount = allProducts.filter(p => {
      const qty = parseFloat(p.stock_quantity || 0);
      const min = parseFloat(p.min_stock || 0);
      return min > 0 && qty <= min;
    }).length;

    const importCount = currentTransactions.filter(t => t.type === 'import').length;
    const exportCount = currentTransactions.filter(t => t.type === 'export').length;
    const prevImportCount = prevTransactions.filter(t => t.type === 'import').length;
    const prevExportCount = prevTransactions.filter(t => t.type === 'export').length;

    return {
      totalSKU,
      stockValue,
      lowStockCount,
      importCount,
      exportCount,
      totalTransactions: importCount + exportCount,
      prevTotalTransactions: prevImportCount + prevExportCount,
    };
  }, [products, currentTransactions, prevTransactions]);

  // ===== 2. Top 10 sản phẩm bán chạy =====
  const topSellingProducts = useMemo(() => {
    const salesMap = {};
    currentOrders.forEach(order => {
      const items = parseOrderItems(order);
      items.forEach(item => {
        const name = item.product_name || item.name || 'Không rõ';
        const qty = parseFloat(item.quantity || 0);
        if (!salesMap[name]) salesMap[name] = { name, quantity: 0 };
        salesMap[name].quantity += qty;
      });
    });
    return Object.values(salesMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  }, [currentOrders]);

  // ===== 3. Sản phẩm chậm bán =====
  const slowMovingProducts = useMemo(() => {
    const allProducts = products || [];
    // Đếm số lượng bán theo product_id trong kỳ
    const soldMap = {};
    currentOrders.forEach(order => {
      const items = parseOrderItems(order);
      items.forEach(item => {
        const pid = item.product_id;
        if (pid) soldMap[pid] = (soldMap[pid] || 0) + parseFloat(item.quantity || 0);
      });
    });

    return allProducts
      .filter(p => parseFloat(p.stock_quantity || 0) > 0)
      .map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku || '-',
        stock: parseFloat(p.stock_quantity || 0),
        costPrice: parseFloat(p.cost_price || p.price || 0),
        stockValue: parseFloat(p.stock_quantity || 0) * parseFloat(p.cost_price || p.price || 0),
        sold: soldMap[p.id] || 0,
      }))
      .filter(p => p.sold === 0)
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 15);
  }, [products, currentOrders]);

  // ===== 4. Phân tích ABC =====
  const abcAnalysis = useMemo(() => {
    const allProducts = (products || [])
      .map(p => ({
        name: p.name,
        value: parseFloat(p.stock_quantity || 0) * parseFloat(p.cost_price || p.price || 0),
      }))
      .filter(p => p.value > 0)
      .sort((a, b) => b.value - a.value);

    const totalValue = allProducts.reduce((s, p) => s + p.value, 0);
    if (totalValue === 0) return [];

    let cumulative = 0;
    let groupA = 0, groupB = 0, groupC = 0;
    let valueA = 0, valueB = 0, valueC = 0;

    allProducts.forEach(p => {
      cumulative += p.value;
      const pct = cumulative / totalValue;
      if (pct <= 0.8) {
        groupA++;
        valueA += p.value;
      } else if (pct <= 0.95) {
        groupB++;
        valueB += p.value;
      } else {
        groupC++;
        valueC += p.value;
      }
    });

    return [
      { name: `Nhóm A (Cao) - ${groupA} SP`, value: valueA, count: groupA },
      { name: `Nhóm B (Trung bình) - ${groupB} SP`, value: valueB, count: groupB },
      { name: `Nhóm C (Thấp) - ${groupC} SP`, value: valueC, count: groupC },
    ].filter(g => g.count > 0);
  }, [products]);

  // ===== 5. Cảnh báo tồn kho =====
  const lowStockProducts = useMemo(() => {
    return (products || [])
      .filter(p => {
        const qty = parseFloat(p.stock_quantity || 0);
        const min = parseFloat(p.min_stock || 0);
        return min > 0 && qty <= min;
      })
      .map(p => {
        const stock = parseFloat(p.stock_quantity || 0);
        const minStock = parseFloat(p.min_stock || 0);
        const shortage = Math.max(0, minStock - stock);
        const cost = parseFloat(p.cost_price || p.price || 0);
        return {
          id: p.id,
          name: p.name,
          stock,
          minStock,
          shortage,
          importValue: shortage * cost,
        };
      })
      .sort((a, b) => b.shortage - a.shortage);
  }, [products]);

  // ===== 6. Biến động nhập/xuất kho =====
  const stockMovementChart = useMemo(() => {
    const dateMap = {};
    currentTransactions.forEach(t => {
      const date = (t.created_at || '').slice(0, 10);
      if (!date) return;
      if (!dateMap[date]) dateMap[date] = { date, import: 0, export: 0 };
      if (t.type === 'import') {
        dateMap[date].import += parseFloat(t.quantity || 0);
      } else if (t.type === 'export') {
        dateMap[date].export += parseFloat(t.quantity || 0);
      }
    });
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [currentTransactions]);

  // ===== Export CSV =====
  const handleExport = () => {
    const allProducts = products || [];
    const columns = [
      { label: 'Tên sản phẩm', accessor: 'name' },
      { label: 'SKU', accessor: p => p.sku || '' },
      { label: 'Danh mục', accessor: p => p.category || '' },
      { label: 'Thương hiệu', accessor: p => p.brand || '' },
      { label: 'Giá bán', accessor: p => parseFloat(p.price || 0) },
      ...(canViewProfit ? [{ label: 'Giá vốn', accessor: p => parseFloat(p.cost_price || 0) }] : []),
      { label: 'Tồn kho', accessor: p => parseFloat(p.stock_quantity || 0) },
      { label: 'Tồn tối thiểu', accessor: p => parseFloat(p.min_stock || 0) },
      ...(canViewProfit ? [{ label: 'Giá trị tồn', accessor: p => parseFloat(p.stock_quantity || 0) * parseFloat(p.cost_price || p.price || 0) }] : []),
    ];
    exportToCSV(allProducts, columns, 'bao-cao-hang-hoa');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter {...tf} />
        <div className="flex gap-2">
          <ExportButton onClick={handleExport} />
          <PrintButton />
        </div>
      </div>

      {/* 1. KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Tổng SKU"
          value={kpis.totalSKU}
          color="blue"
        />
        {canViewProfit && <StatCard
          label="Giá trị tồn kho"
          value={formatMoney(kpis.stockValue)}
          color="orange"
        />}
        <StatCard
          label="Sắp hết hàng"
          value={kpis.lowStockCount}
          sub={kpis.lowStockCount > 0 ? 'sản phẩm cần nhập thêm' : 'Đủ hàng'}
          color="red"
        />
        <StatCard
          label="Nhập/Xuất kho"
          value={`${kpis.importCount}/${kpis.exportCount}`}
          sub={pctChange(kpis.totalTransactions, kpis.prevTotalTransactions) !== 0
            ? `${pctChange(kpis.totalTransactions, kpis.prevTotalTransactions) > 0 ? '+' : ''}${pctChange(kpis.totalTransactions, kpis.prevTotalTransactions)}% so với kỳ trước`
            : 'phiếu nhập/xuất'}
          color="green"
        />
      </div>

      {/* 2. Top 10 sản phẩm bán chạy */}
      <Section title="Top 10 sản phẩm bán chạy">
        {topSellingProducts.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(250, topSellingProducts.length * 36)}>
            <BarChart data={topSellingProducts} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11 }}
                tickFormatter={name => name.length > 20 ? name.slice(0, 20) + '...' : name}
              />
              <Tooltip content={<ChartTooltip formatter={v => `${v} sản phẩm`} />} />
              <Bar dataKey="quantity" fill="#22c55e" radius={[0, 4, 4, 0]} name="Số lượng bán" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu bán hàng trong kỳ" />
        )}
      </Section>

      {/* 3 + 4: Chậm bán + ABC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 3. Sản phẩm chậm bán */}
        <Section title="Sản phẩm chậm bán">
          {slowMovingProducts.length > 0 ? (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="pb-2 pl-4 md:pl-0 font-medium">Tên SP</th>
                    <th className="pb-2 font-medium">SKU</th>
                    <th className="pb-2 text-right font-medium">Tồn kho</th>
                    {canViewProfit && <th className="pb-2 text-right font-medium">Giá vốn</th>}
                    {canViewProfit && <th className="pb-2 text-right pr-4 md:pr-0 font-medium">Giá trị tồn</th>}
                  </tr>
                </thead>
                <tbody>
                  {slowMovingProducts.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 pl-4 md:pl-0">
                        <span className="font-medium text-gray-800 truncate block max-w-[160px]">{p.name}</span>
                      </td>
                      <td className="py-2 text-gray-500 text-xs">{p.sku}</td>
                      <td className="py-2 text-right font-medium">{p.stock}</td>
                      {canViewProfit && <td className="py-2 text-right text-gray-600">{formatMoney(p.costPrice)}</td>}
                      {canViewProfit && <td className="py-2 text-right pr-4 md:pr-0 font-medium text-orange-600">{formatMoney(p.stockValue)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="Không có sản phẩm chậm bán" />
          )}
        </Section>

        {/* 4. Phân tích ABC */}
        <Section title="Phân tích ABC hàng tồn kho">
          {abcAnalysis.length > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={abcAnalysis}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={45}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {abcAnalysis.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => formatMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 w-full">
                {abcAnalysis.map((group, i) => {
                  const total = abcAnalysis.reduce((s, g) => s + g.value, 0);
                  return (
                    <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-sm font-medium">{group.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold">{formatMoney(group.value)}</span>
                        <span className="text-xs text-gray-500 ml-2">{formatPercent(group.value, total)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState text="Chưa có dữ liệu sản phẩm" />
          )}
        </Section>
      </div>

      {/* 5. Cảnh báo sắp hết hàng */}
      <Section title="Cảnh báo sắp hết hàng">
        {lowStockProducts.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[550px]">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pl-4 md:pl-0 font-medium">Tên SP</th>
                  <th className="pb-2 text-right font-medium">Tồn kho</th>
                  <th className="pb-2 text-right font-medium">Tồn tối thiểu</th>
                  <th className="pb-2 text-right font-medium">Thiếu</th>
                  <th className="pb-2 text-right pr-4 md:pr-0 font-medium">Giá trị cần nhập</th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.map(p => (
                  <tr key={p.id} className={`border-b last:border-0 ${p.stock === 0 ? 'bg-red-50' : 'bg-orange-50'}`}>
                    <td className="py-2 pl-4 md:pl-0">
                      <span className="font-medium text-gray-800 truncate block max-w-[180px]">{p.name}</span>
                    </td>
                    <td className={`py-2 text-right font-bold ${p.stock === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                      {p.stock}
                    </td>
                    <td className="py-2 text-right text-gray-600">{p.minStock}</td>
                    <td className="py-2 text-right font-bold text-red-600">{p.shortage}</td>
                    <td className="py-2 text-right pr-4 md:pr-0 font-medium text-red-600">{formatMoney(p.importValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="pt-2 pl-4 md:pl-0" colSpan={3}>Tổng cộng</td>
                  <td className="pt-2 text-right text-red-600">
                    {lowStockProducts.reduce((s, p) => s + p.shortage, 0)}
                  </td>
                  <td className="pt-2 text-right pr-4 md:pr-0 text-red-600">
                    {formatMoney(lowStockProducts.reduce((s, p) => s + p.importValue, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState text="Tất cả sản phẩm đều đủ hàng" />
        )}
      </Section>

      {/* 6. Biến động nhập/xuất kho */}
      <Section title="Biến động nhập/xuất kho">
        {stockMovementChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stockMovementChart} barGap={2}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={d => {
                  const parts = d.split('-');
                  return `${parts[2]}/${parts[1]}`;
                }}
              />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip
                content={<ChartTooltip formatter={v => `${v} sản phẩm`} />}
                labelFormatter={d => {
                  const parts = d.split('-');
                  return `${parts[2]}/${parts[1]}/${parts[0]}`;
                }}
              />
              <Bar dataKey="import" fill="#22c55e" radius={[4, 4, 0, 0]} name="Nhập kho" stackId="stock" />
              <Bar dataKey="export" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Xuất kho" stackId="stock" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có giao dịch nhập/xuất trong kỳ" />
        )}
      </Section>
    </div>
  );
}

// ===== 2. XUẤT NHẬP TỒN =====
function InventoryXNT() {
  const { products, stockTransactions } = useData();
  const tf = useTimeFilter('month');
  const { filterCurrent } = tf;

  const currentTx = useMemo(() => filterCurrent(stockTransactions, 'created_at'), [stockTransactions, filterCurrent]);

  const data = useMemo(() => {
    const allProducts = products || [];
    // Tính nhập/xuất trong kỳ cho từng SP
    const txMap = {};
    currentTx.forEach(t => {
      const pid = t.product_id;
      if (!pid) return;
      if (!txMap[pid]) txMap[pid] = { imported: 0, exported: 0 };
      const qty = parseFloat(t.quantity || 0);
      if (t.type === 'import') txMap[pid].imported += qty;
      else if (t.type === 'export') txMap[pid].exported += qty;
    });

    const rows = allProducts.map(p => {
      const stock = parseFloat(p.stock_quantity || 0);
      const cost = parseFloat(p.cost_price || p.price || 0);
      const tx = txMap[p.id] || { imported: 0, exported: 0 };
      const beginStock = stock - tx.imported + tx.exported;
      return {
        id: p.id, name: p.name, sku: p.sku || '-',
        beginStock: Math.max(0, beginStock),
        imported: tx.imported, exported: tx.exported,
        endStock: stock, stockValue: stock * cost,
      };
    }).filter(r => r.imported > 0 || r.exported > 0 || r.endStock > 0);
    return rows.sort((a, b) => b.stockValue - a.stockValue);
  }, [products, currentTx]);

  const totals = useMemo(() => {
    const t = { imported: 0, exported: 0, beginStock: 0, endStock: 0 };
    data.forEach(r => {
      t.imported += r.imported; t.exported += r.exported;
      t.beginStock += r.beginStock; t.endStock += r.endStock;
    });
    return t;
  }, [data]);

  const handleExport = () => {
    exportToCSV(data, [
      { label: 'Sản phẩm', accessor: 'name' },
      { label: 'SKU', accessor: 'sku' },
      { label: 'Tồn đầu kỳ', accessor: 'beginStock' },
      { label: 'Nhập', accessor: 'imported' },
      { label: 'Xuất', accessor: 'exported' },
      { label: 'Tồn cuối kỳ', accessor: 'endStock' },
      { label: 'Giá trị tồn', accessor: 'stockValue' },
    ], 'xuat-nhap-ton');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter {...tf} />
        <div className="flex gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng nhập" value={totals.imported} sub="sản phẩm" color="green" />
        <StatCard label="Tổng xuất" value={totals.exported} sub="sản phẩm" color="orange" />
        <StatCard label="Tồn đầu kỳ" value={totals.beginStock} color="blue" />
        <StatCard label="Tồn cuối kỳ" value={totals.endStock} color="purple" />
      </div>
      <Section title="Chi tiết xuất nhập tồn">
        {data.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pl-4 md:pl-0 font-medium">Sản phẩm</th>
                  <th className="pb-2 text-right font-medium">Tồn đầu kỳ</th>
                  <th className="pb-2 text-right font-medium">Nhập</th>
                  <th className="pb-2 text-right font-medium">Xuất</th>
                  <th className="pb-2 text-right font-medium">Tồn cuối kỳ</th>
                  <th className="pb-2 text-right pr-4 md:pr-0 font-medium">Giá trị tồn</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pl-4 md:pl-0">
                      <span className="font-medium text-gray-800 truncate block max-w-[180px]">{r.name}</span>
                    </td>
                    <td className="py-2 text-right text-gray-600">{r.beginStock}</td>
                    <td className="py-2 text-right text-green-600 font-medium">{r.imported > 0 ? `+${r.imported}` : '-'}</td>
                    <td className="py-2 text-right text-orange-600 font-medium">{r.exported > 0 ? `-${r.exported}` : '-'}</td>
                    <td className="py-2 text-right font-bold">{r.endStock}</td>
                    <td className="py-2 text-right pr-4 md:pr-0 font-medium text-blue-600">{formatMoney(r.stockValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Không có dữ liệu xuất nhập tồn trong kỳ" />
        )}
      </Section>
    </div>
  );
}

// ===== 3. CẢNH BÁO HẾT HÀNG =====
function InventoryLowstock() {
  const { products } = useData();

  const data = useMemo(() => {
    return (products || [])
      .filter(p => {
        const qty = parseFloat(p.stock_quantity || 0);
        const min = parseFloat(p.min_stock || 0);
        return min > 0 && qty <= min;
      })
      .map(p => {
        const stock = parseFloat(p.stock_quantity || 0);
        const minStock = parseFloat(p.min_stock || 0);
        const shortage = Math.max(0, minStock - stock);
        const cost = parseFloat(p.cost_price || p.price || 0);
        return {
          id: p.id, name: p.name, sku: p.sku || '-',
          stock, minStock, shortage, importValue: shortage * cost,
        };
      })
      .sort((a, b) => b.shortage - a.shortage);
  }, [products]);

  const kpis = useMemo(() => {
    const outOfStock = data.filter(p => p.stock === 0).length;
    const almostOut = data.filter(p => p.stock > 0).length;
    const totalImportValue = data.reduce((s, p) => s + p.importValue, 0);
    return { total: data.length, outOfStock, almostOut, totalImportValue };
  }, [data]);

  const handleExport = () => {
    exportToCSV(data, [
      { label: 'Sản phẩm', accessor: 'name' },
      { label: 'SKU', accessor: 'sku' },
      { label: 'Tồn kho', accessor: 'stock' },
      { label: 'Tồn tối thiểu', accessor: 'minStock' },
      { label: 'Thiếu', accessor: 'shortage' },
      { label: 'Giá trị cần nhập', accessor: 'importValue' },
    ], 'canh-bao-het-hang');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng SP cần nhập" value={kpis.total} color="red" />
        <StatCard label="Hết hàng" value={kpis.outOfStock} sub="stock = 0" color="red" />
        <StatCard label="Sắp hết" value={kpis.almostOut} sub="dưới mức tối thiểu" color="orange" />
        <StatCard label="Giá trị cần nhập" value={formatMoney(kpis.totalImportValue)} color="blue" />
      </div>
      <Section title="Danh sách sản phẩm cần nhập hàng">
        {data.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pl-4 md:pl-0 font-medium">Sản phẩm</th>
                  <th className="pb-2 font-medium">SKU</th>
                  <th className="pb-2 text-right font-medium">Tồn kho</th>
                  <th className="pb-2 text-right font-medium">Tồn tối thiểu</th>
                  <th className="pb-2 text-right font-medium">Thiếu</th>
                  <th className="pb-2 text-right pr-4 md:pr-0 font-medium">Giá trị cần nhập</th>
                </tr>
              </thead>
              <tbody>
                {data.map(p => (
                  <tr key={p.id} className={`border-b last:border-0 ${p.stock === 0 ? 'bg-red-50' : 'bg-orange-50'}`}>
                    <td className="py-2 pl-4 md:pl-0">
                      <span className="font-medium text-gray-800 truncate block max-w-[180px]">{p.name}</span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{p.sku}</td>
                    <td className={`py-2 text-right font-bold ${p.stock === 0 ? 'text-red-600' : 'text-orange-600'}`}>{p.stock}</td>
                    <td className="py-2 text-right text-gray-600">{p.minStock}</td>
                    <td className="py-2 text-right font-bold text-red-600">{p.shortage}</td>
                    <td className="py-2 text-right pr-4 md:pr-0 font-medium text-red-600">{formatMoney(p.importValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="pt-2 pl-4 md:pl-0" colSpan={4}>Tổng cộng</td>
                  <td className="pt-2 text-right text-red-600">{data.reduce((s, p) => s + p.shortage, 0)}</td>
                  <td className="pt-2 text-right pr-4 md:pr-0 text-red-600">{formatMoney(kpis.totalImportValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState text="Tất cả sản phẩm đều đủ hàng" />
        )}
      </Section>
    </div>
  );
}

// ===== 4. SẢN PHẨM BÁN CHẠY =====
function ProductBestseller() {
  const { orders } = useData();
  const tf = useTimeFilter('month');
  const { filterCurrent } = tf;

  const currentOrders = useMemo(() => filterCurrent(orders, 'created_at'), [orders, filterCurrent]);

  const salesData = useMemo(() => {
    const salesMap = {};
    currentOrders.forEach(order => {
      parseOrderItems(order).forEach(item => {
        const name = item.product_name || item.name || 'Không rõ';
        const qty = parseFloat(item.quantity || 0);
        const price = parseFloat(item.price || item.unit_price || 0);
        const revenue = qty * price;
        if (!salesMap[name]) salesMap[name] = { name, quantity: 0, revenue: 0 };
        salesMap[name].quantity += qty;
        salesMap[name].revenue += revenue;
      });
    });
    return Object.values(salesMap).sort((a, b) => b.quantity - a.quantity);
  }, [currentOrders]);

  const kpis = useMemo(() => {
    const totalQty = salesData.reduce((s, p) => s + p.quantity, 0);
    const totalRevenue = salesData.reduce((s, p) => s + p.revenue, 0);
    const top1 = salesData[0]?.name || '-';
    return { top1, totalQty, totalRevenue, productCount: salesData.length };
  }, [salesData]);

  const chartData = useMemo(() => salesData.slice(0, 20), [salesData]);
  const totalRevenue = kpis.totalRevenue;

  const handleExport = () => {
    exportToCSV(salesData, [
      { label: '#', accessor: (_p, i) => i + 1 },
      { label: 'Sản phẩm', accessor: 'name' },
      { label: 'SL bán', accessor: 'quantity' },
      { label: 'Doanh thu', accessor: 'revenue' },
    ], 'sp-ban-chay');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter {...tf} />
        <div className="flex gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Top 1 SP" value={kpis.top1.length > 15 ? kpis.top1.slice(0, 15) + '...' : kpis.top1} color="green" />
        <StatCard label="Tổng SL bán" value={kpis.totalQty} color="blue" />
        <StatCard label="Tổng doanh thu" value={formatMoney(kpis.totalRevenue)} color="orange" />
        <StatCard label="Số SP có đơn" value={kpis.productCount} color="purple" />
      </div>
      <Section title="Top 20 sản phẩm bán chạy">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }}
                tickFormatter={n => n.length > 22 ? n.slice(0, 22) + '...' : n} />
              <Tooltip content={<ChartTooltip formatter={v => `${v} sản phẩm`} />} />
              <Bar dataKey="quantity" fill="#22c55e" radius={[0, 4, 4, 0]} name="Số lượng bán" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu bán hàng trong kỳ" />
        )}
      </Section>
      <Section title="Bảng chi tiết sản phẩm bán chạy">
        {salesData.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pl-4 md:pl-0 font-medium w-10">#</th>
                  <th className="pb-2 font-medium">Sản phẩm</th>
                  <th className="pb-2 text-right font-medium">SL bán</th>
                  <th className="pb-2 text-right font-medium">Doanh thu</th>
                  <th className="pb-2 text-right pr-4 md:pr-0 font-medium">% tổng DT</th>
                </tr>
              </thead>
              <tbody>
                {salesData.slice(0, 30).map((p, i) => (
                  <tr key={p.name} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pl-4 md:pl-0 text-gray-500">{i + 1}</td>
                    <td className="py-2"><span className="font-medium text-gray-800 truncate block max-w-[200px]">{p.name}</span></td>
                    <td className="py-2 text-right font-medium">{p.quantity}</td>
                    <td className="py-2 text-right text-green-600 font-medium">{formatMoney(p.revenue)}</td>
                    <td className="py-2 text-right pr-4 md:pr-0 text-gray-600">{formatPercent(p.revenue, totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu bán hàng trong kỳ" />
        )}
      </Section>
    </div>
  );
}

// ===== 5. SẢN PHẨM CHẬM BÁN =====
function ProductSlowMoving() {
  const { products, orders } = useData();
  const { currentUser } = useApp();
  const canViewProfit = isAdmin(currentUser) || (currentUser?.permissions?.dashboard || 0) >= 3;
  const tf = useTimeFilter('month');
  const { filterCurrent } = tf;

  const currentOrders = useMemo(() => filterCurrent(orders, 'created_at'), [orders, filterCurrent]);
  const [now] = useState(() => Date.now());

  const data = useMemo(() => {
    const allProducts = products || [];
    const soldSet = new Set();
    currentOrders.forEach(order => {
      parseOrderItems(order).forEach(item => {
        if (item.product_id) soldSet.add(item.product_id);
      });
    });

    return allProducts
      .filter(p => parseFloat(p.stock_quantity || 0) > 0 && !soldSet.has(p.id))
      .map(p => {
        const stock = parseFloat(p.stock_quantity || 0);
        const cost = parseFloat(p.cost_price || p.price || 0);
        const lastSold = p.last_sold_at || p.updated_at || p.created_at;
        const daysSince = lastSold ? Math.floor((now - new Date(lastSold).getTime()) / 86400000) : 999;
        return {
          id: p.id, name: p.name, sku: p.sku || '-',
          stock, costPrice: cost, stockValue: stock * cost, daysSince,
        };
      })
      .sort((a, b) => b.stockValue - a.stockValue);
  }, [products, currentOrders, now]);

  const kpis = useMemo(() => {
    const totalValue = data.reduce((s, p) => s + p.stockValue, 0);
    const allStockValue = (products || []).reduce((s, p) =>
      s + parseFloat(p.stock_quantity || 0) * parseFloat(p.cost_price || p.price || 0), 0);
    const pctOfTotal = allStockValue > 0 ? Math.round(totalValue / allStockValue * 100) : 0;
    const avgDays = data.length > 0 ? Math.round(data.reduce((s, p) => s + p.daysSince, 0) / data.length) : 0;
    return { total: data.length, totalValue, pctOfTotal, avgDays };
  }, [data, products]);

  const handleExport = () => {
    exportToCSV(data, [
      { label: 'Sản phẩm', accessor: 'name' },
      { label: 'SKU', accessor: 'sku' },
      { label: 'Tồn kho', accessor: 'stock' },
      ...(canViewProfit ? [{ label: 'Giá vốn', accessor: 'costPrice' }] : []),
      ...(canViewProfit ? [{ label: 'Giá trị tồn', accessor: 'stockValue' }] : []),
      { label: 'Ngày không bán', accessor: 'daysSince' },
    ], 'sp-cham-ban');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter {...tf} />
        <div className="flex gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng SP chậm bán" value={kpis.total} color="orange" />
        <StatCard label="Giá trị tồn đọng" value={formatMoney(kpis.totalValue)} color="red" />
        <StatCard label="% tổng tồn kho" value={`${kpis.pctOfTotal}%`} color="blue" />
        <StatCard label="Ngày tồn TB" value={kpis.avgDays} sub="ngày" color="purple" />
      </div>
      <Section title="Danh sách sản phẩm chậm bán">
        {data.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pl-4 md:pl-0 font-medium">Sản phẩm</th>
                  <th className="pb-2 font-medium">SKU</th>
                  <th className="pb-2 text-right font-medium">Tồn kho</th>
                  {canViewProfit && <th className="pb-2 text-right font-medium">Giá vốn</th>}
                  {canViewProfit && <th className="pb-2 text-right font-medium">Giá trị tồn</th>}
                  <th className="pb-2 text-right pr-4 md:pr-0 font-medium">Ngày không bán</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 30).map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pl-4 md:pl-0">
                      <span className="font-medium text-gray-800 truncate block max-w-[180px]">{p.name}</span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{p.sku}</td>
                    <td className="py-2 text-right font-medium">{p.stock}</td>
                    {canViewProfit && <td className="py-2 text-right text-gray-600">{formatMoney(p.costPrice)}</td>}
                    {canViewProfit && <td className="py-2 text-right font-medium text-orange-600">{formatMoney(p.stockValue)}</td>}
                    <td className={`py-2 text-right pr-4 md:pr-0 font-bold ${p.daysSince > 60 ? 'text-red-600' : 'text-orange-600'}`}>
                      {p.daysSince >= 999 ? 'N/A' : `${p.daysSince} ngày`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Không có sản phẩm chậm bán trong kỳ" />
        )}
      </Section>
    </div>
  );
}

// ===== 6. PHÂN TÍCH ABC =====
function ProductABC() {
  const { products } = useData();

  const { pieData, tableData, totalValue } = useMemo(() => {
    const allProducts = (products || [])
      .map(p => ({
        id: p.id, name: p.name,
        value: parseFloat(p.stock_quantity || 0) * parseFloat(p.cost_price || p.price || 0),
      }))
      .filter(p => p.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = allProducts.reduce((s, p) => s + p.value, 0);
    if (total === 0) return { pieData: [], tableData: [], totalValue: 0 };

    let cumulative = 0;
    const rows = allProducts.map(p => {
      cumulative += p.value;
      const cumulativePct = cumulative / total;
      const group = cumulativePct <= 0.8 ? 'A' : cumulativePct <= 0.95 ? 'B' : 'C';
      return { ...p, group, cumulativePct };
    });

    const groupA = rows.filter(r => r.group === 'A');
    const groupB = rows.filter(r => r.group === 'B');
    const groupC = rows.filter(r => r.group === 'C');

    const pie = [
      { name: `Nhóm A (${groupA.length} SP)`, value: groupA.reduce((s, r) => s + r.value, 0), count: groupA.length },
      { name: `Nhóm B (${groupB.length} SP)`, value: groupB.reduce((s, r) => s + r.value, 0), count: groupB.length },
      { name: `Nhóm C (${groupC.length} SP)`, value: groupC.reduce((s, r) => s + r.value, 0), count: groupC.length },
    ].filter(g => g.count > 0);

    return { pieData: pie, tableData: rows, totalValue: total };
  }, [products]);

  const kpis = useMemo(() => {
    const gA = pieData.find(g => g.name.startsWith('Nhóm A'));
    const gB = pieData.find(g => g.name.startsWith('Nhóm B'));
    const gC = pieData.find(g => g.name.startsWith('Nhóm C'));
    return {
      groupA: `${gA?.count || 0} SP / ${formatMoney(gA?.value || 0)}`,
      groupB: `${gB?.count || 0} SP / ${formatMoney(gB?.value || 0)}`,
      groupC: `${gC?.count || 0} SP / ${formatMoney(gC?.value || 0)}`,
      totalValue: formatMoney(totalValue),
    };
  }, [pieData, totalValue]);

  const handleExport = () => {
    exportToCSV(tableData, [
      { label: 'Sản phẩm', accessor: 'name' },
      { label: 'Nhóm', accessor: 'group' },
      { label: 'Giá trị tồn', accessor: 'value' },
      { label: '% tích lũy', accessor: r => Math.round(r.cumulativePct * 100) + '%' },
    ], 'phan-tich-abc');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Nhóm A (80%)" value={kpis.groupA} color="green" />
        <StatCard label="Nhóm B (15%)" value={kpis.groupB} color="orange" />
        <StatCard label="Nhóm C (5%)" value={kpis.groupC} color="red" />
        <StatCard label="Tổng giá trị" value={kpis.totalValue} color="blue" />
      </div>
      <Section title="Phân bổ ABC">
        {pieData.length > 0 ? (
          <div className="flex flex-col items-center gap-3">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} innerRadius={50}
                  dataKey="value" paddingAngle={2}>
                  {pieData.map((_entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={v => formatMoney(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu sản phẩm" />
        )}
      </Section>
      <Section title="Chi tiết phân loại ABC">
        {tableData.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pl-4 md:pl-0 font-medium">Sản phẩm</th>
                  <th className="pb-2 text-center font-medium">Nhóm</th>
                  <th className="pb-2 text-right font-medium">Giá trị tồn</th>
                  <th className="pb-2 text-right pr-4 md:pr-0 font-medium">% tích lũy</th>
                </tr>
              </thead>
              <tbody>
                {tableData.slice(0, 30).map(r => (
                  <tr key={r.id} className={`border-b last:border-0 ${r.group === 'A' ? 'bg-green-50' : r.group === 'B' ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                    <td className="py-2 pl-4 md:pl-0">
                      <span className="font-medium text-gray-800 truncate block max-w-[200px]">{r.name}</span>
                    </td>
                    <td className="py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.group === 'A' ? 'bg-green-200 text-green-800' : r.group === 'B' ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-700'}`}>{r.group}</span>
                    </td>
                    <td className="py-2 text-right font-medium">{formatMoney(r.value)}</td>
                    <td className="py-2 text-right pr-4 md:pr-0 text-gray-600">{Math.round(r.cumulativePct * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu" />
        )}
      </Section>
    </div>
  );
}

// ===== 7. VÒNG QUAY HÀNG TỒN =====
function ProductTurnover() {
  const { products, orders } = useData();
  const tf = useTimeFilter('month');
  const { filterCurrent } = tf;

  const currentOrders = useMemo(() => filterCurrent(orders, 'created_at'), [orders, filterCurrent]);

  const data = useMemo(() => {
    const allProducts = products || [];
    // Tính GVHB (COGS) từ đơn hàng
    const cogsMap = {};
    currentOrders.forEach(order => {
      parseOrderItems(order).forEach(item => {
        const pid = item.product_id;
        if (!pid) return;
        const qty = parseFloat(item.quantity || 0);
        const cost = parseFloat(item.cost_price || item.price || 0);
        cogsMap[pid] = (cogsMap[pid] || 0) + qty * cost;
      });
    });

    return allProducts
      .filter(p => parseFloat(p.stock_quantity || 0) > 0 || cogsMap[p.id])
      .map(p => {
        const stock = parseFloat(p.stock_quantity || 0);
        const cost = parseFloat(p.cost_price || p.price || 0);
        const avgInventory = stock * cost; // Đơn giản: dùng tồn kho hiện tại
        const cogs = cogsMap[p.id] || 0;
        const turnover = avgInventory > 0 ? cogs / avgInventory : 0;
        const daysInStock = turnover > 0 ? Math.round(30 / turnover) : 999;
        return {
          id: p.id, name: p.name,
          cogs, avgInventory, turnover: Math.round(turnover * 100) / 100,
          daysInStock: Math.min(daysInStock, 999),
        };
      })
      .filter(p => p.avgInventory > 0)
      .sort((a, b) => b.turnover - a.turnover);
  }, [products, currentOrders]);

  const kpis = useMemo(() => {
    const withTurnover = data.filter(p => p.turnover > 0);
    const avgTurnover = withTurnover.length > 0
      ? Math.round(withTurnover.reduce((s, p) => s + p.turnover, 0) / withTurnover.length * 100) / 100
      : 0;
    const fastest = data[0]?.name || '-';
    const slowest = data.filter(p => p.turnover > 0).slice(-1)[0]?.name || data.slice(-1)[0]?.name || '-';
    const totalCogs = data.reduce((s, p) => s + p.cogs, 0);
    return { avgTurnover, fastest, slowest, totalCogs };
  }, [data]);

  const chartData = useMemo(() => {
    const top10 = data.filter(p => p.turnover > 0).slice(0, 10);
    return top10;
  }, [data]);

  const handleExport = () => {
    exportToCSV(data, [
      { label: 'Sản phẩm', accessor: 'name' },
      { label: 'GVHB', accessor: 'cogs' },
      { label: 'Tồn TB', accessor: 'avgInventory' },
      { label: 'Vòng quay', accessor: 'turnover' },
      { label: 'Số ngày tồn', accessor: 'daysInStock' },
    ], 'vong-quay-hang-ton');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TimeFilter {...tf} />
        <div className="flex gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Vòng quay TB" value={kpis.avgTurnover} sub="lần/kỳ" color="blue" />
        <StatCard label="SP quay nhanh nhất" value={kpis.fastest.length > 15 ? kpis.fastest.slice(0, 15) + '...' : kpis.fastest} color="green" />
        <StatCard label="SP quay chậm nhất" value={kpis.slowest.length > 15 ? kpis.slowest.slice(0, 15) + '...' : kpis.slowest} color="red" />
        <StatCard label="Tổng GVHB" value={formatMoney(kpis.totalCogs)} color="orange" />
      </div>
      <Section title="Top sản phẩm theo vòng quay">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(250, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }}
                tickFormatter={n => n.length > 22 ? n.slice(0, 22) + '...' : n} />
              <Tooltip content={<ChartTooltip formatter={v => `${v} lần`} />} />
              <Bar dataKey="turnover" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Vòng quay" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu vòng quay" />
        )}
      </Section>
      <Section title="Bảng chi tiết vòng quay">
        {data.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[550px]">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pl-4 md:pl-0 font-medium">Sản phẩm</th>
                  <th className="pb-2 text-right font-medium">GVHB</th>
                  <th className="pb-2 text-right font-medium">Tồn TB</th>
                  <th className="pb-2 text-right font-medium">Vòng quay</th>
                  <th className="pb-2 text-right pr-4 md:pr-0 font-medium">Số ngày tồn</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 30).map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pl-4 md:pl-0">
                      <span className="font-medium text-gray-800 truncate block max-w-[180px]">{p.name}</span>
                    </td>
                    <td className="py-2 text-right text-gray-600">{formatMoney(p.cogs)}</td>
                    <td className="py-2 text-right text-gray-600">{formatMoney(p.avgInventory)}</td>
                    <td className={`py-2 text-right font-bold ${p.turnover >= 1 ? 'text-green-600' : p.turnover > 0 ? 'text-orange-600' : 'text-red-600'}`}>
                      {p.turnover}
                    </td>
                    <td className="py-2 text-right pr-4 md:pr-0 text-gray-600">
                      {p.daysInStock >= 999 ? 'N/A' : `${p.daysInStock} ngày`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu" />
        )}
      </Section>
    </div>
  );
}

// ===== 8. THEO DANH MỤC =====
function ProductCategory() {
  const { products } = useData();

  const data = useMemo(() => {
    const catMap = {};
    (products || []).forEach(p => {
      const cat = p.category || 'Chưa phân loại';
      if (!catMap[cat]) catMap[cat] = { name: cat, count: 0, stock: 0, value: 0 };
      catMap[cat].count++;
      const qty = parseFloat(p.stock_quantity || 0);
      const cost = parseFloat(p.cost_price || p.price || 0);
      catMap[cat].stock += qty;
      catMap[cat].value += qty * cost;
    });
    return Object.values(catMap).sort((a, b) => b.value - a.value);
  }, [products]);

  const totalValue = useMemo(() => data.reduce((s, c) => s + c.value, 0), [data]);

  const kpis = useMemo(() => {
    const mostProducts = data.length > 0 ? data.reduce((max, c) => c.count > max.count ? c : max, data[0]).name : '-';
    const highestValue = data.length > 0 ? data[0].name : '-';
    const avgPerCat = data.length > 0 ? Math.round((products || []).length / data.length) : 0;
    return { total: data.length, mostProducts, highestValue, avgPerCat };
  }, [data, products]);

  const handleExport = () => {
    exportToCSV(data, [
      { label: 'Danh mục', accessor: 'name' },
      { label: 'Số SP', accessor: 'count' },
      { label: 'Tồn kho', accessor: 'stock' },
      { label: 'Giá trị tồn', accessor: 'value' },
      { label: '% tổng', accessor: r => totalValue > 0 ? Math.round(r.value / totalValue * 100) + '%' : '0%' },
    ], 'theo-danh-muc');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng danh mục" value={kpis.total} color="blue" />
        <StatCard label="DM nhiều SP nhất" value={kpis.mostProducts.length > 15 ? kpis.mostProducts.slice(0, 15) + '...' : kpis.mostProducts} color="green" />
        <StatCard label="DM giá trị cao nhất" value={kpis.highestValue.length > 15 ? kpis.highestValue.slice(0, 15) + '...' : kpis.highestValue} color="orange" />
        <StatCard label="TB SP/DM" value={kpis.avgPerCat} color="purple" />
      </div>
      <Section title="Giá trị tồn kho theo danh mục">
        {data.length > 0 ? (
          <div className="flex flex-col items-center gap-3">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                  dataKey="value" paddingAngle={2}
                  label={({ name, value }) => `${name.length > 12 ? name.slice(0, 12) + '...' : name}: ${totalValue > 0 ? Math.round(value / totalValue * 100) : 0}%`}>
                  {data.map((_entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={v => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu danh mục" />
        )}
      </Section>
      <Section title="Chi tiết theo danh mục">
        {data.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pl-4 md:pl-0 font-medium">Danh mục</th>
                  <th className="pb-2 text-right font-medium">Số SP</th>
                  <th className="pb-2 text-right font-medium">Tồn kho</th>
                  <th className="pb-2 text-right font-medium">Giá trị tồn</th>
                  <th className="pb-2 text-right pr-4 md:pr-0 font-medium">% tổng</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c, i) => (
                  <tr key={c.name} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pl-4 md:pl-0">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="font-medium text-gray-800">{c.name}</span>
                      </div>
                    </td>
                    <td className="py-2 text-right font-medium">{c.count}</td>
                    <td className="py-2 text-right text-gray-600">{c.stock}</td>
                    <td className="py-2 text-right font-medium text-blue-600">{formatMoney(c.value)}</td>
                    <td className="py-2 text-right pr-4 md:pr-0 text-gray-600">{formatPercent(c.value, totalValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="pt-2 pl-4 md:pl-0">Tổng cộng</td>
                  <td className="pt-2 text-right">{data.reduce((s, c) => s + c.count, 0)}</td>
                  <td className="pt-2 text-right">{data.reduce((s, c) => s + c.stock, 0)}</td>
                  <td className="pt-2 text-right text-blue-600">{formatMoney(totalValue)}</td>
                  <td className="pt-2 text-right pr-4 md:pr-0">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu" />
        )}
      </Section>
    </div>
  );
}

// ===== 9. BIÊN LỢI NHUẬN =====
function ProductMargin() {
  const { products } = useData();
  const { currentUser } = useApp();
  const canViewProfit = isAdmin(currentUser) || (currentUser?.permissions?.dashboard || 0) >= 3;

  const data = useMemo(() => {
    return (products || [])
      .map(p => {
        const costPrice = parseFloat(p.cost_price || 0);
        const sellPrice = parseFloat(p.price || 0);
        const margin = sellPrice - costPrice;
        const marginPct = sellPrice > 0 ? Math.round(margin / sellPrice * 100) : 0;
        return {
          id: p.id, name: p.name,
          costPrice, sellPrice, margin, marginPct,
        };
      })
      .filter(p => p.sellPrice > 0)
      .sort((a, b) => b.marginPct - a.marginPct);
  }, [products]);

  const kpis = useMemo(() => {
    if (data.length === 0) return { avgMargin: 0, highest: '-', lowest: '-', totalPotential: 0 };
    const avgMargin = Math.round(data.reduce((s, p) => s + p.marginPct, 0) / data.length);
    const highest = data[0]?.name || '-';
    const withMargin = data.filter(p => p.marginPct > 0);
    const lowest = withMargin.length > 0 ? withMargin[withMargin.length - 1]?.name || '-' : '-';
    const totalPotential = data.reduce((s, p) => s + Math.max(0, p.margin), 0);
    return { avgMargin, highest, lowest, totalPotential };
  }, [data]);

  const chartData = useMemo(() => data.slice(0, 20), [data]);

  if (!canViewProfit) return (
    <div className="p-8 text-center">
      <div className="text-5xl mb-4">&#128274;</div>
      <div className="font-bold text-gray-700">Không có quyền xem</div>
      <div className="text-sm text-gray-500 mt-1">Cần quyền cấp 3 để xem biên lợi nhuận</div>
    </div>
  );

  const handleExport = () => {
    exportToCSV(data, [
      { label: 'Sản phẩm', accessor: 'name' },
      { label: 'Giá vốn', accessor: 'costPrice' },
      { label: 'Giá bán', accessor: 'sellPrice' },
      { label: 'Biên LN', accessor: 'margin' },
      { label: 'Biên LN %', accessor: r => r.marginPct + '%' },
    ], 'bien-loi-nhuan');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Biên LN trung bình" value={`${kpis.avgMargin}%`} color="green" />
        <StatCard label="SP LN cao nhất" value={kpis.highest.length > 15 ? kpis.highest.slice(0, 15) + '...' : kpis.highest} color="blue" />
        <StatCard label="SP LN thấp nhất" value={kpis.lowest.length > 15 ? kpis.lowest.slice(0, 15) + '...' : kpis.lowest} color="red" />
        <StatCard label="Tổng LN tiềm năng" value={formatMoney(kpis.totalPotential)} color="orange" />
      </div>
      <Section title="Top 20 sản phẩm theo biên lợi nhuận">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }}
                tickFormatter={n => n.length > 22 ? n.slice(0, 22) + '...' : n} />
              <Tooltip content={<ChartTooltip formatter={v => `${v}%`} />} />
              <Bar dataKey="marginPct" fill="#16a34a" radius={[0, 4, 4, 0]} name="Biên LN %" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu giá sản phẩm" />
        )}
      </Section>
      <Section title="Chi tiết biên lợi nhuận">
        {data.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[550px]">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pl-4 md:pl-0 font-medium">Sản phẩm</th>
                  <th className="pb-2 text-right font-medium">Giá vốn</th>
                  <th className="pb-2 text-right font-medium">Giá bán</th>
                  <th className="pb-2 text-right font-medium">Biên LN</th>
                  <th className="pb-2 text-right pr-4 md:pr-0 font-medium">Biên LN %</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 30).map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pl-4 md:pl-0">
                      <span className="font-medium text-gray-800 truncate block max-w-[180px]">{p.name}</span>
                    </td>
                    <td className="py-2 text-right text-gray-600">{formatMoney(p.costPrice)}</td>
                    <td className="py-2 text-right text-gray-600">{formatMoney(p.sellPrice)}</td>
                    <td className={`py-2 text-right font-medium ${p.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatMoney(p.margin)}
                    </td>
                    <td className={`py-2 text-right pr-4 md:pr-0 font-bold ${p.marginPct >= 30 ? 'text-green-600' : p.marginPct >= 10 ? 'text-orange-600' : 'text-red-600'}`}>
                      {p.marginPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu" />
        )}
      </Section>
    </div>
  );
}

// ===== 10. LỊCH SỬ GIÁ =====
function ProductPriceHistory() {
  const { products } = useData();
  const { currentUser } = useApp();
  const canViewProfit = isAdmin(currentUser) || (currentUser?.permissions?.dashboard || 0) >= 3;

  const data = useMemo(() => {
    return (products || [])
      .map(p => {
        const costPrice = parseFloat(p.cost_price || 0);
        const sellPrice = parseFloat(p.price || 0);
        const stock = parseFloat(p.stock_quantity || 0);
        const margin = sellPrice - costPrice;
        const marginPct = sellPrice > 0 ? Math.round(margin / sellPrice * 100) : 0;
        return {
          id: p.id, name: p.name, sku: p.sku || '-',
          costPrice, sellPrice, margin, marginPct, stock,
        };
      })
      .filter(p => p.sellPrice > 0)
      .sort((a, b) => b.sellPrice - a.sellPrice);
  }, [products]);

  const kpis = useMemo(() => {
    if (data.length === 0) return { avgPrice: 0, maxPrice: 0, minPrice: 0, totalSellValue: 0 };
    const prices = data.map(p => p.sellPrice);
    const avgPrice = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const totalSellValue = data.reduce((s, p) => s + p.sellPrice * p.stock, 0);
    return { avgPrice, maxPrice, minPrice, totalSellValue };
  }, [data]);

  const chartData = useMemo(() => data.slice(0, 20), [data]);

  const handleExport = () => {
    exportToCSV(data, [
      { label: 'Sản phẩm', accessor: 'name' },
      { label: 'SKU', accessor: 'sku' },
      ...(canViewProfit ? [{ label: 'Giá vốn', accessor: 'costPrice' }] : []),
      { label: 'Giá bán', accessor: 'sellPrice' },
      ...(canViewProfit ? [{ label: 'Biên LN', accessor: 'margin' }] : []),
      { label: 'Tồn kho', accessor: 'stock' },
    ], 'lich-su-gia');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2"><ExportButton onClick={handleExport} /><PrintButton /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Giá TB" value={formatMoney(kpis.avgPrice)} color="blue" />
        <StatCard label="Giá cao nhất" value={formatMoney(kpis.maxPrice)} color="green" />
        <StatCard label="Giá thấp nhất" value={formatMoney(kpis.minPrice)} color="orange" />
        <StatCard label="Tổng giá trị bán" value={formatMoney(kpis.totalSellValue)} color="purple" />
      </div>
      <Section title="Top sản phẩm theo giá bán">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => formatMoney(v)} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }}
                tickFormatter={n => n.length > 22 ? n.slice(0, 22) + '...' : n} />
              <Tooltip content={<ChartTooltip formatter={v => formatMoney(v)} />} />
              <Bar dataKey="sellPrice" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Giá bán" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Chưa có dữ liệu giá" />
        )}
      </Section>
      <Section title="Bảng giá sản phẩm">
        {data.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pl-4 md:pl-0 font-medium">Sản phẩm</th>
                  <th className="pb-2 font-medium">SKU</th>
                  {canViewProfit && <th className="pb-2 text-right font-medium">Giá vốn</th>}
                  <th className="pb-2 text-right font-medium">Giá bán</th>
                  {canViewProfit && <th className="pb-2 text-right font-medium">Biên LN</th>}
                  <th className="pb-2 text-right pr-4 md:pr-0 font-medium">Tồn kho</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 30).map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pl-4 md:pl-0">
                      <span className="font-medium text-gray-800 truncate block max-w-[180px]">{p.name}</span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{p.sku}</td>
                    {canViewProfit && <td className="py-2 text-right text-gray-600">{formatMoney(p.costPrice)}</td>}
                    <td className="py-2 text-right font-medium text-blue-600">{formatMoney(p.sellPrice)}</td>
                    {canViewProfit && <td className={`py-2 text-right font-medium ${p.marginPct >= 30 ? 'text-green-600' : p.marginPct >= 10 ? 'text-orange-600' : 'text-red-600'}`}>
                      {p.marginPct}%
                    </td>}
                    <td className="py-2 text-right pr-4 md:pr-0 text-gray-600">{p.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="Chưa có dữ liệu" />
        )}
      </Section>
    </div>
  );
}

// ===== REPORT LIST =====
const PRODUCT_REPORTS = [
  { id: 'inventory_summary', name: 'Tổng quan tồn kho', icon: '📊', description: 'SKU, giá trị tồn kho, cảnh báo hết hàng, nhập xuất', group: 'Tồn kho', popular: true },
  { id: 'inventory_xnt', name: 'Xuất nhập tồn', icon: '🔄', description: 'Chi tiết xuất nhập tồn kho theo kỳ', group: 'Tồn kho', popular: true },
  { id: 'inventory_lowstock', name: 'Cảnh báo hết hàng', icon: '⚠️', description: 'Danh sách sản phẩm sắp hết hoặc đã hết hàng', group: 'Tồn kho' },
  { id: 'product_bestseller', name: 'SP bán chạy', icon: '🔥', description: 'Top sản phẩm bán chạy nhất theo số lượng và doanh thu', group: 'Bán hàng' },
  { id: 'product_slowmoving', name: 'SP chậm bán', icon: '🐌', description: 'Sản phẩm tồn kho lâu, không có giao dịch', group: 'Bán hàng' },
  { id: 'product_abc', name: 'Phân tích ABC', icon: '📐', description: 'Phân loại hàng hóa theo giá trị tồn kho (80-15-5)', group: 'Phân tích' },
  { id: 'product_turnover', name: 'Vòng quay hàng tồn', icon: '🔁', description: 'Tốc độ quay vòng hàng tồn kho', group: 'Phân tích' },
  { id: 'product_category', name: 'Theo danh mục', icon: '🏷️', description: 'Phân tích tồn kho theo nhóm hàng', group: 'Phân tích' },
  { id: 'product_margin', name: 'Biên lợi nhuận', icon: '💰', description: 'So sánh giá vốn và giá bán theo từng SP', group: 'Giá' },
  { id: 'product_pricehistory', name: 'Lịch sử giá', icon: '📈', description: 'Theo dõi biến động giá theo thời gian', group: 'Giá' },
];

// ===== MAIN EXPORT: 2-LAYER UI =====
export default function ReportProductsView() {
  const [selectedReport, setSelectedReport] = useState(null);
  const { currentUser } = useApp();
  const canViewProfit = isAdmin(currentUser) || (currentUser?.permissions?.dashboard || 0) >= 3;

  const visibleReports = canViewProfit ? PRODUCT_REPORTS : PRODUCT_REPORTS.filter(r => r.id !== 'product_margin');

  if (!selectedReport) {
    return <ReportGrid reports={visibleReports} onSelect={setSelectedReport} title="📦 Báo Cáo Hàng Hóa" />;
  }

  const report = visibleReports.find(r => r.id === selectedReport);

  const renderReport = () => {
    switch (selectedReport) {
      case 'inventory_summary': return <ProductsContent />;
      case 'inventory_xnt': return <InventoryXNT />;
      case 'inventory_lowstock': return <InventoryLowstock />;
      case 'product_bestseller': return <ProductBestseller />;
      case 'product_slowmoving': return <ProductSlowMoving />;
      case 'product_abc': return <ProductABC />;
      case 'product_turnover': return <ProductTurnover />;
      case 'product_category': return <ProductCategory />;
      case 'product_margin': return <ProductMargin />;
      case 'product_pricehistory': return <ProductPriceHistory />;
      default: return <ComingSoon />;
    }
  };

  return (
    <ReportDetailWrapper report={report} onBack={() => setSelectedReport(null)}>
      {renderReport()}
    </ReportDetailWrapper>
  );
}

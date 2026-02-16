import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getTodayVN, addMonthsVN } from '../../utils/dateUtils';
import { repairStatuses } from '../../constants/warrantyConstants';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function WarrantyDashboard({ serials, warrantyCards, warrantyRepairs }) {
  const today = getTodayVN();
  const thirtyDaysLater = addMonthsVN(today, 1);

  const stats = useMemo(() => {
    const activeSerials = (serials || []).filter(s => s.status === 'in_stock' || s.status === 'sold').length;
    const activeCards = (warrantyCards || []).filter(c => c.status !== 'voided' && c.warranty_end >= today).length;
    const expiringSoon = (warrantyCards || []).filter(c =>
      c.status !== 'voided' && c.warranty_end >= today && c.warranty_end <= thirtyDaysLater
    ).length;
    const activeRepairs = (warrantyRepairs || []).filter(r =>
      ['received', 'diagnosing', 'repairing'].includes(r.status)
    ).length;
    return { activeSerials, activeCards, expiringSoon, activeRepairs };
  }, [serials, warrantyCards, warrantyRepairs, today, thirtyDaysLater]);

  // Repairs by month (last 6 months)
  const repairsByMonth = useMemo(() => {
    const months = [];
    const vn = new Date(today + 'T00:00:00+07:00');
    for (let i = 5; i >= 0; i--) {
      const d = new Date(vn);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `T${d.getMonth() + 1}`;
      months.push({ key, label, warranty: 0, paid: 0 });
    }
    (warrantyRepairs || []).forEach(r => {
      const month = (r.received_at || r.created_at || '').substring(0, 7);
      const found = months.find(m => m.key === month);
      if (found) {
        if (r.repair_type === 'warranty') found.warranty++;
        else found.paid++;
      }
    });
    return months;
  }, [warrantyRepairs, today]);

  // Top products by repair count
  const topRepairProducts = useMemo(() => {
    const counts = {};
    (warrantyRepairs || []).forEach(r => {
      const name = r.product_name || 'N/A';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [warrantyRepairs]);

  // Expiring warranties list
  const expiringList = useMemo(() => {
    return (warrantyCards || [])
      .filter(c => c.status !== 'voided' && c.warranty_end >= today && c.warranty_end <= thirtyDaysLater)
      .sort((a, b) => a.warranty_end.localeCompare(b.warranty_end))
      .slice(0, 10);
  }, [warrantyCards, today, thirtyDaysLater]);

  // Active repairs list
  const activeRepairsList = useMemo(() => {
    return (warrantyRepairs || [])
      .filter(r => ['received', 'diagnosing', 'repairing'].includes(r.status))
      .sort((a, b) => (a.received_at || '').localeCompare(b.received_at || ''))
      .slice(0, 10);
  }, [warrantyRepairs]);

  const getDaysRemaining = (endDate) => {
    if (!endDate) return 0;
    const end = new Date(endDate + 'T23:59:59+07:00');
    return Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-blue-600">{stats.activeSerials}</div>
          <div className="text-gray-600 text-sm">Serial hoạt động</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500">
          <div className="text-2xl font-bold text-green-600">{stats.activeCards}</div>
          <div className="text-gray-600 text-sm">BH còn hạn</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-yellow-500">
          <div className="text-2xl font-bold text-yellow-600">{stats.expiringSoon}</div>
          <div className="text-gray-600 text-sm">Sắp hết hạn (30 ngày)</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-red-500">
          <div className="text-2xl font-bold text-red-600">{stats.activeRepairs}</div>
          <div className="text-gray-600 text-sm">Đang sửa chữa</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Repairs by month */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold mb-3">Sửa chữa theo tháng</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={repairsByMonth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="warranty" name="Bảo hành" fill="#22c55e" stackId="a" />
              <Bar dataKey="paid" name="Có phí" fill="#f59e0b" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top products by repairs */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold mb-3">SP sửa nhiều nhất</h3>
          {topRepairProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={topRepairProducts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                  {topRepairProducts.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-400">Chưa có dữ liệu</div>
          )}
        </div>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expiring soon */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold mb-3">BH sắp hết hạn</h3>
          {expiringList.length > 0 ? (
            <div className="space-y-2">
              {expiringList.map(c => {
                const days = getDaysRemaining(c.warranty_end);
                return (
                  <div key={c.id} className="flex justify-between items-center p-2 bg-yellow-50 rounded-lg text-sm">
                    <div>
                      <div className="font-medium">{c.product_name}</div>
                      <div className="text-gray-500">{c.customer_name} - {c.serial_number}</div>
                    </div>
                    <div className={`font-medium ${days <= 7 ? 'text-red-600' : 'text-yellow-600'}`}>
                      {days} ngày
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-gray-400 text-sm">Không có BH nào sắp hết hạn</div>
          )}
        </div>

        {/* Active repairs */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold mb-3">Đang sửa chữa</h3>
          {activeRepairsList.length > 0 ? (
            <div className="space-y-2">
              {activeRepairsList.map(r => {
                const stInfo = repairStatuses[r.status] || {};
                return (
                  <div key={r.id} className="flex justify-between items-center p-2 bg-orange-50 rounded-lg text-sm">
                    <div>
                      <div className="font-medium">{r.repair_number}</div>
                      <div className="text-gray-500">{r.product_name} - {r.customer_name}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${stInfo.color || 'bg-gray-100'}`}>
                      {stInfo.icon} {stInfo.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-gray-400 text-sm">Không có phiếu SC nào đang xử lý</div>
          )}
        </div>
      </div>
    </div>
  );
}

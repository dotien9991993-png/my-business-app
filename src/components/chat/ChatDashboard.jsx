import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';

const TIME_RANGES = [
  { id: '7d', label: '7 ngày', days: 7 },
  { id: '30d', label: '30 ngày', days: 30 },
  { id: '90d', label: '90 ngày', days: 90 },
];

const formatNumber = (n) => (n || 0).toLocaleString('vi-VN');

// Simple bar chart component (no external dependency)
function SimpleBarChart({ data, barColor = '#16a34a', height = 120 }) {
  if (!data?.length) return <div className="text-center text-gray-400 text-xs py-4">Chưa có dữ liệu</div>;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end group relative min-w-0">
          <div
            className="w-full rounded-t transition-all hover:opacity-80"
            style={{
              height: `${Math.max((item.value / maxVal) * (height - 20), 2)}px`,
              backgroundColor: barColor,
              minWidth: '4px',
            }}
          />
          <span className="text-[8px] text-gray-400 truncate w-full text-center mt-0.5">{item.label}</span>
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChatDashboard() {
  const { tenant, allUsers } = useApp();
  const [timeRange, setTimeRange] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalMessages: 0,
    totalRooms: 0,
    activeUsers: 0,
    filesShared: 0,
  });
  const [hourlyData, setHourlyData] = useState([]);
  const [dailyData, setDailyData] = useState([]);
  const [topUsers, setTopUsers] = useState([]);
  const [topRooms, setTopRooms] = useState([]);

  const rangeDays = useMemo(() => TIME_RANGES.find(r => r.id === timeRange)?.days || 7, [timeRange]);

  const fromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays);
    return d.toISOString();
  }, [rangeDays]);

  const loadStats = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);

    try {
      // 1. Total messages in range
      const { count: totalMessages } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', fromDate)
        .neq('message_type', 'system');

      // 2. Total active rooms
      const { count: totalRooms } = await supabase
        .from('chat_rooms')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      // 3. Active users (distinct senders)
      const { data: senderData } = await supabase
        .from('chat_messages')
        .select('sender_id')
        .gte('created_at', fromDate)
        .neq('message_type', 'system');
      const uniqueSenders = new Set((senderData || []).map(m => m.sender_id));

      // 4. Files shared
      const { count: filesShared } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', fromDate)
        .in('message_type', ['file', 'image']);

      setStats({
        totalMessages: totalMessages || 0,
        totalRooms: totalRooms || 0,
        activeUsers: uniqueSenders.size,
        filesShared: filesShared || 0,
      });

      // 5. Messages by hour (last 7 days for hourly)
      const hourFrom = new Date();
      hourFrom.setDate(hourFrom.getDate() - Math.min(rangeDays, 7));
      const { data: hourMessages } = await supabase
        .from('chat_messages')
        .select('created_at')
        .gte('created_at', hourFrom.toISOString())
        .neq('message_type', 'system');

      const hourCounts = Array(24).fill(0);
      (hourMessages || []).forEach(m => {
        const h = parseInt(new Date(m.created_at).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }));
        hourCounts[h]++;
      });
      setHourlyData(hourCounts.map((count, h) => ({
        label: `${h}h`,
        value: count,
      })));

      // 6. Messages by day
      const { data: dayMessages } = await supabase
        .from('chat_messages')
        .select('created_at')
        .gte('created_at', fromDate)
        .neq('message_type', 'system');

      const dayCounts = {};
      (dayMessages || []).forEach(m => {
        const day = new Date(m.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      });
      // Sort by date
      const sortedDays = Object.entries(dayCounts)
        .sort((a, b) => {
          const [dA, mA] = a[0].split('/').map(Number);
          const [dB, mB] = b[0].split('/').map(Number);
          return mA !== mB ? mA - mB : dA - dB;
        })
        .map(([label, value]) => ({ label, value }));
      setDailyData(sortedDays);

      // 7. Top users by message count
      const userCounts = {};
      (senderData || []).forEach(m => {
        userCounts[m.sender_id] = (userCounts[m.sender_id] || 0) + 1;
      });
      const topUsersList = Object.entries(userCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId, count]) => {
          const user = (allUsers || []).find(u => u.id === userId);
          return { userId, name: user?.name || 'Người dùng', count, avatar: user?.avatar_url };
        });
      setTopUsers(topUsersList);

      // 8. Top rooms by message count
      const { data: roomMessages } = await supabase
        .from('chat_messages')
        .select('room_id')
        .gte('created_at', fromDate)
        .neq('message_type', 'system');

      const roomCounts = {};
      (roomMessages || []).forEach(m => {
        roomCounts[m.room_id] = (roomCounts[m.room_id] || 0) + 1;
      });

      const topRoomIds = Object.entries(roomCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      if (topRoomIds.length > 0) {
        const { data: roomData } = await supabase
          .from('chat_rooms')
          .select('id, name, type')
          .in('id', topRoomIds.map(r => r[0]));

        const roomMap = {};
        (roomData || []).forEach(r => { roomMap[r.id] = r; });

        setTopRooms(topRoomIds.map(([roomId, count]) => ({
          roomId,
          name: roomMap[roomId]?.name || (roomMap[roomId]?.type === 'direct' ? 'Chat riêng' : 'Phòng chat'),
          type: roomMap[roomId]?.type || 'direct',
          count,
        })));
      } else {
        setTopRooms([]);
      }
    } catch (err) {
      console.error('Error loading chat stats:', err);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, fromDate, allUsers]);

  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm">Đang tải thống kê...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Time range selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Thống kê Chat</h2>
        <div className="flex gap-1">
          {TIME_RANGES.map(range => (
            <button
              key={range.id}
              onClick={() => setTimeRange(range.id)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                timeRange === range.id
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Tin nhắn', value: formatNumber(stats.totalMessages), icon: '💬', color: 'green' },
          { label: 'Phòng chat', value: formatNumber(stats.totalRooms), icon: '🏠', color: 'blue' },
          { label: 'Người hoạt động', value: formatNumber(stats.activeUsers), icon: '👥', color: 'purple' },
          { label: 'File chia sẻ', value: formatNumber(stats.filesShared), icon: '📎', color: 'orange' },
        ].map((card, i) => (
          <div key={i} className="bg-white border rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{card.icon}</span>
              <span className="text-[11px] text-gray-500">{card.label}</span>
            </div>
            <div className="text-xl font-bold text-gray-800">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Hourly chart */}
      <div className="bg-white border rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Tin nhắn theo giờ trong ngày</h3>
        <SimpleBarChart data={hourlyData} barColor="#16a34a" height={100} />
      </div>

      {/* Daily chart */}
      <div className="bg-white border rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Tin nhắn theo ngày</h3>
        <SimpleBarChart data={dailyData} barColor="#2563eb" height={100} />
      </div>

      {/* Top users & rooms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top users */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top người nhắn tin</h3>
          {topUsers.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-2">
              {topUsers.map((u, i) => (
                <div key={u.userId} className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' :
                    i === 1 ? 'bg-gray-200 text-gray-600' :
                    i === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0 overflow-hidden">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      u.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="text-sm text-gray-700 flex-1 truncate">{u.name}</span>
                  <span className="text-xs text-gray-500 font-medium">{formatNumber(u.count)}</span>
                  {/* Bar */}
                  <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${Math.max((u.count / (topUsers[0]?.count || 1)) * 100, 5)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top rooms */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top phòng chat</h3>
          {topRooms.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-2">
              {topRooms.map((r, i) => (
                <div key={r.roomId} className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' :
                    i === 1 ? 'bg-gray-200 text-gray-600' :
                    i === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="text-sm flex-shrink-0">{r.type === 'group' ? '👥' : '💬'}</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{r.name}</span>
                  <span className="text-xs text-gray-500 font-medium">{formatNumber(r.count)}</span>
                  <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.max((r.count / (topRooms[0]?.count || 1)) * 100, 5)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

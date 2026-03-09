import React, { useState, useEffect, useRef } from 'react';
import { useMobileOrders } from '../../hooks/useMobileOrders';
import OrderCard from './OrderCard';
import OrderDetail from './OrderDetail';
import MobileSkeleton from '../../components/MobileSkeleton';
import MobilePullRefresh from '../../components/MobilePullRefresh';

const STATUS_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'open', label: 'Mở' },
  { id: 'confirmed', label: 'Xác nhận' },
  { id: 'completed', label: 'Hoàn thành' },
  { id: 'cancelled', label: 'Đã hủy' },
];

const DATE_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: '7 ngày' },
  { id: 'month', label: 'Tháng này' },
];

export default function OrdersPage({ user, tenantId, openEntityId, onEntityOpened }) {
  const {
    orders, totalCount, loading, filters,
    updateFilter, loadOrderDetail, refresh
  } = useMobileOrders(user?.id, user?.name, tenantId);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const searchTimer = useRef(null);

  // Open entity from chat attachment
  useEffect(() => {
    if (!openEntityId) return;
    (async () => {
      try {
        const detail = await loadOrderDetail(openEntityId);
        if (detail) {
          setSelectedOrder(detail);
          setOrderDetail(detail);
        }
      } catch (err) {
        console.error('Error loading order:', err);
      }
      onEntityOpened?.();
    })();
  }, [openEntityId, onEntityOpened, loadOrderDetail]);

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      updateFilter('search', searchInput);
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [searchInput, updateFilter]);

  // Open detail
  const handleOpenDetail = async (order) => {
    setSelectedOrder(order);
    setLoadingDetail(true);
    try {
      const detail = await loadOrderDetail(order.id);
      setOrderDetail(detail);
    } catch (err) {
      console.error('Error loading order detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedOrder(null);
    setOrderDetail(null);
  };

  // Show detail view
  if (selectedOrder) {
    return (
      <OrderDetail
        order={selectedOrder}
        detail={orderDetail}
        loading={loadingDetail}
        onBack={handleCloseDetail}
      />
    );
  }

  return (
    <MobilePullRefresh onRefresh={refresh}>
    <div className="mobile-page mord-page">
      {/* Search */}
      <div className="mord-search">
        <input
          placeholder="Tìm mã đơn, tên KH, SĐT..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
      </div>

      {/* Status tabs */}
      <div className="mord-status-tabs">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.id}
            className={`mord-status-tab ${filters.status === tab.id ? 'active' : ''}`}
            onClick={() => updateFilter('status', tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date filter */}
      <div className="mord-date-filter">
        {DATE_FILTERS.map(f => (
          <button
            key={f.id}
            className={`mord-date-btn ${filters.dateRange === f.id ? 'active' : ''}`}
            onClick={() => updateFilter('dateRange', f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Count */}
      <div className="mord-count">
        {totalCount} đơn hàng
      </div>

      {/* Order list */}
      <div className="mord-list">
        {loading ? (
          <MobileSkeleton type="card" count={3} />
        ) : orders.length === 0 ? (
          <div className="mord-empty">
            {filters.search ? 'Không tìm thấy đơn hàng' : 'Chưa có đơn hàng'}
          </div>
        ) : (
          orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={() => handleOpenDetail(order)}
            />
          ))
        )}
      </div>
    </div>
    </MobilePullRefresh>
  );
}

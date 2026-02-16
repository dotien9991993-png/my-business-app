import React, { Suspense, useMemo } from 'react';
import { useApp } from '../../contexts/AppContext';
import { isAdmin } from '../../utils/permissionUtils';
import DashboardView from './DashboardView';

const ReportRevenueView = React.lazy(() => import('./ReportRevenueView'));
const ReportProductsView = React.lazy(() => import('./ReportProductsView'));
const ReportCustomersView = React.lazy(() => import('./ReportCustomersView'));
const ReportStaffView = React.lazy(() => import('./ReportStaffView'));
const ReportFinanceView = React.lazy(() => import('./ReportFinanceView'));
const ReportWarrantyView = React.lazy(() => import('./ReportWarrantyView'));
const ReportComparisonView = React.lazy(() => import('./ReportComparisonView'));

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
  </div>
);

// minLevel required for each tab
const TAB_MIN_LEVELS = {
  overview: 1,
  revenue: 2,
  products: 2,
  customers: 2,
  staff: 3,
  finance: 3,
  warranty: 3,
  comparison: 3
};

const NoTabAccess = () => (
  <div className="p-6">
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="text-xl font-bold text-yellow-800 mb-2">Không có quyền truy cập</h2>
      <p className="text-yellow-600">Bạn không có quyền xem báo cáo này.</p>
    </div>
  </div>
);

export default function DashboardModule() {
  const { activeTab, currentUser } = useApp();

  const dashLevel = useMemo(() => {
    if (isAdmin(currentUser)) return 3;
    return currentUser?.permissions?.dashboard || 0;
  }, [currentUser]);

  // Check if user has access to the current tab
  const minRequired = TAB_MIN_LEVELS[activeTab] || 1;
  if (dashLevel < minRequired) {
    return <NoTabAccess />;
  }

  return (
    <Suspense fallback={<Loading />}>
      {activeTab === 'revenue' ? <ReportRevenueView />
        : activeTab === 'products' ? <ReportProductsView />
        : activeTab === 'customers' ? <ReportCustomersView />
        : activeTab === 'staff' ? <ReportStaffView />
        : activeTab === 'finance' ? <ReportFinanceView />
        : activeTab === 'warranty' ? <ReportWarrantyView />
        : activeTab === 'comparison' ? <ReportComparisonView />
        : <DashboardView />}
    </Suspense>
  );
}

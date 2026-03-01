// Cấp độ quyền hạn
export const permissionLevels = [
  { value: 0, label: 'Không có quyền', desc: 'Ẩn hoàn toàn module', color: 'gray' },
  { value: 1, label: 'Xem của mình', desc: 'Xem dữ liệu mình tạo/được gán', color: 'yellow' },
  { value: 2, label: 'Xem tất cả', desc: 'Tạo + Sửa của mình + Xem tất cả', color: 'blue' },
  { value: 3, label: 'Toàn quyền', desc: 'Xem + Tạo + Sửa + Xóa (như Admin)', color: 'green' }
];

// Định nghĩa các module nghiệp vụ
export const departments = [
  { id: 'media', name: '🎬 Media', desc: 'Sản xuất video, hình ảnh, nội dung' },
  { id: 'warehouse', name: '📦 Kho', desc: 'Quản lý hàng hóa, xuất nhập kho' },
  { id: 'sales', name: '🛒 Sale', desc: 'Bán hàng, chăm sóc khách hàng' },
  { id: 'technical', name: '🔧 Kỹ thuật', desc: 'Lắp đặt, sửa chữa, bảo trì' },
  { id: 'finance', name: '💰 Tài chính', desc: 'Thu chi, công nợ, lương' },
  { id: 'warranty', name: '🛡️ Bảo hành', desc: 'Serial, thẻ bảo hành, sửa chữa' },
  { id: 'hrm', name: '👤 Nhân sự', desc: 'Quản lý nhân viên, chấm công, KPI, lương' },
  { id: 'dashboard', name: '📊 Báo Cáo', desc: 'Báo cáo tổng hợp doanh nghiệp' }
];

// Định nghĩa các tabs trong từng module
export const moduleTabs = {
  media: [
    { id: 'videos', name: '📹 Quản lý Video', desc: 'Danh sách video, task' },
    { id: 'calendar', name: '📅 Lịch', desc: 'Lịch deadline' },
    { id: 'report', name: '📊 Báo cáo', desc: 'Thống kê, báo cáo' }
  ],
  warehouse: [
    { id: 'products', name: '📦 Sản phẩm', desc: 'Danh sách sản phẩm' },
    { id: 'import', name: '📥 Nhập kho', desc: 'Phiếu nhập hàng' },
    { id: 'export', name: '📤 Xuất kho', desc: 'Phiếu xuất hàng' },
    { id: 'inventory', name: '📋 Tồn kho', desc: 'Báo cáo tồn kho' },
    { id: 'transfer', name: '🔄 Chuyển kho', desc: 'Chuyển hàng giữa các kho' },
    { id: 'stocktake', name: '📝 Kiểm kê', desc: 'Kiểm kê tồn kho' },
    { id: 'report', name: '📊 Báo cáo', desc: 'Báo cáo xuất nhập tồn' },
    { id: 'suppliers', name: '🏢 Nhà cung cấp', desc: 'Quản lý nhà cung cấp' },
    { id: 'warehouses', name: '🏭 Quản lý kho', desc: 'CRUD kho' }
  ],
  finance: [
    { id: 'overview', name: '📊 Tổng quan', desc: 'Dashboard tài chính' },
    { id: 'receipts', name: '🧾 Thu/Chi', desc: 'Phiếu thu, phiếu chi' },
    { id: 'debts', name: '📋 Công nợ', desc: 'Quản lý công nợ' },
    { id: 'salaries', name: '💰 Lương', desc: 'Tính lương nhân viên' },
    { id: 'reports', name: '📈 Báo cáo', desc: 'Báo cáo tài chính' }
  ],
  technical: [
    { id: 'jobs', name: '🔧 Công việc', desc: 'Danh sách lắp đặt/sửa chữa' }
  ],
  sales: [
    { id: 'orders', name: '🛒 Đơn hàng', desc: 'Quản lý đơn hàng' },
    { id: 'customers', name: '👥 Khách hàng', desc: 'Quản lý khách hàng' },
    { id: 'products', name: '📱 Sản phẩm', desc: 'Xem sản phẩm bán' },
    { id: 'shipping', name: '🚚 Vận chuyển', desc: 'Quản lý vận chuyển' },
    { id: 'cod', name: '💰 Đối soát COD', desc: 'Đối soát tiền thu hộ' },
    { id: 'reconciliation', name: '📊 Đối soát', desc: 'Đối soát đơn hàng' },
    { id: 'coupons', name: '🎟️ Mã giảm giá', desc: 'Quản lý mã giảm giá / khuyến mãi' },
    { id: 'report', name: '📈 Báo cáo', desc: 'Báo cáo bán hàng' }
  ],
  warranty: [
    { id: 'lookup', name: '🔍 Tra cứu', desc: 'Tra cứu bảo hành' },
    { id: 'serials', name: '🏷️ Serial', desc: 'Quản lý serial number' },
    { id: 'cards', name: '🛡️ Thẻ BH', desc: 'Thẻ bảo hành' },
    { id: 'repairs', name: '🔧 Sửa chữa', desc: 'Phiếu sửa chữa' },
    { id: 'dashboard', name: '📊 Tổng quan', desc: 'Dashboard bảo hành' },
    { id: 'requests', name: '📩 Yêu cầu BH', desc: 'Yêu cầu từ khách hàng' }
  ],
  hrm: [
    { id: 'employees', name: '👤 Nhân viên', desc: 'Danh sách, hồ sơ nhân viên' },
    { id: 'attendance', name: '⏰ Chấm công', desc: 'Check-in/out, bảng chấm công' },
    { id: 'schedule', name: '📅 Lịch làm việc', desc: 'Ca làm, phân ca' },
    { id: 'kpi', name: '🎯 KPI', desc: 'Chỉ tiêu, đánh giá' },
    { id: 'payroll', name: '💰 Lương', desc: 'Bảng lương, tính lương' },
    { id: 'leaves', name: '📋 Đơn từ', desc: 'Nghỉ phép, tăng ca, công tác' },
    { id: 'report', name: '📊 Báo cáo', desc: 'Thống kê nhân sự' },
    { id: 'settings', name: '⚙️ Cài đặt', desc: 'Phòng ban, chức vụ, ca làm' }
  ],
  dashboard: [
    { id: 'overview', name: '📊 Tổng Quan', desc: 'Dashboard tổng quan doanh nghiệp', minLevel: 1 },
    { id: 'revenue', name: '📈 Doanh Thu', desc: 'Báo cáo doanh thu', minLevel: 2 },
    { id: 'products', name: '📦 Hàng Hóa', desc: 'Báo cáo hàng hóa', minLevel: 2 },
    { id: 'customers', name: '👥 Khách Hàng', desc: 'Báo cáo khách hàng', minLevel: 2 },
    { id: 'staff', name: '👤 Nhân Viên', desc: 'Báo cáo nhân viên, lương', minLevel: 3 },
    { id: 'finance', name: '💰 Tài Chính', desc: 'Báo cáo tài chính', minLevel: 3 },
    { id: 'warranty', name: '🛡️ Bảo Hành', desc: 'Báo cáo bảo hành', minLevel: 3 },
    { id: 'comparison', name: '📊 So Sánh', desc: 'So sánh theo kỳ', minLevel: 3 }
  ]
};

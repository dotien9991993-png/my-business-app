// Trạng thái nhân viên
export const EMPLOYEE_STATUSES = {
  active: { label: 'Đang làm', color: 'green' },
  on_leave: { label: 'Nghỉ phép', color: 'yellow' },
  resigned: { label: 'Đã nghỉ việc', color: 'gray' },
  terminated: { label: 'Đã sa thải', color: 'red' }
};

// Loại hợp đồng
export const EMPLOYMENT_TYPES = {
  full_time: { label: 'Toàn thời gian', color: 'blue' },
  part_time: { label: 'Bán thời gian', color: 'purple' },
  contract: { label: 'Hợp đồng', color: 'orange' },
  intern: { label: 'Thực tập', color: 'cyan' }
};

// Trạng thái chấm công
export const ATTENDANCE_STATUSES = {
  present: { label: 'Có mặt', icon: '✅', color: 'green' },
  absent: { label: 'Vắng', icon: '🔴', color: 'red' },
  late: { label: 'Đi trễ', icon: '⏰', color: 'orange' },
  early_leave: { label: 'Về sớm', icon: '⚡', color: 'yellow' },
  half_day: { label: 'Nửa ngày', icon: '🟡', color: 'yellow' },
  holiday: { label: 'Nghỉ lễ', icon: '🎉', color: 'blue' },
  sick: { label: 'Nghỉ ốm', icon: '🏥', color: 'purple' },
  annual_leave: { label: 'Phép năm', icon: '🏖️', color: 'cyan' }
};

// Phương thức chấm công
export const CHECK_IN_METHODS = {
  manual: 'Thủ công',
  qr_code: 'Quét QR',
  gps: 'GPS',
  face_id: 'Nhận diện khuôn mặt'
};

// Loại đơn từ
export const LEAVE_TYPES = {
  annual_leave: { label: 'Nghỉ phép năm', color: 'blue', icon: '🏖️' },
  sick_leave: { label: 'Nghỉ ốm', color: 'red', icon: '🏥' },
  unpaid_leave: { label: 'Nghỉ không lương', color: 'gray', icon: '📋' },
  overtime: { label: 'Tăng ca', color: 'orange', icon: '⏰' },
  business_trip: { label: 'Công tác', color: 'purple', icon: '✈️' },
  work_from_home: { label: 'Làm việc tại nhà', color: 'green', icon: '🏠' }
};

// Trạng thái đơn từ
export const LEAVE_REQUEST_STATUSES = {
  pending: { label: 'Chờ duyệt', color: 'yellow' },
  approved: { label: 'Đã duyệt', color: 'green' },
  rejected: { label: 'Từ chối', color: 'red' },
  cancelled: { label: 'Đã hủy', color: 'gray' }
};

// Trạng thái KPI
export const KPI_STATUSES = {
  draft: { label: 'Nháp', color: 'gray' },
  self_evaluated: { label: 'Tự đánh giá', color: 'blue' },
  manager_reviewed: { label: 'QL đã duyệt', color: 'orange' },
  completed: { label: 'Hoàn thành', color: 'green' }
};

// Xếp hạng KPI
export const KPI_RATINGS = {
  A: { label: 'Xuất sắc', minScore: 90, color: 'green', bonus: 2000000 },
  B: { label: 'Tốt', minScore: 75, color: 'blue', bonus: 1000000 },
  C: { label: 'Trung bình', minScore: 60, color: 'yellow', bonus: 500000 },
  D: { label: 'Yếu', minScore: 0, color: 'red', bonus: 0 }
};

// Tính rating từ score
export const getRatingFromScore = (score) => {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  return 'D';
};

// Cấp chức vụ
export const POSITION_LEVELS = {
  0: 'Nhân viên',
  1: 'Trưởng nhóm',
  2: 'Trưởng phòng',
  3: 'Giám đốc'
};

// Giới tính
export const GENDERS = {
  male: 'Nam',
  female: 'Nữ'
};

// Cấu hình lương mặc định
export const DEFAULT_PAYROLL_CONFIG = {
  workingDaysPerMonth: 26,
  hoursPerDay: 8,
  overtimeRate: 1.5,
  socialInsuranceRate: 0.105, // 10.5% (8% BHXH + 1.5% BHYT + 1% BHTN)
  personalDeduction: 11000000, // Giảm trừ cá nhân
  dependentDeduction: 4400000, // Giảm trừ người phụ thuộc
};

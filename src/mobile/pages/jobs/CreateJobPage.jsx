import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { getTodayVN } from '../../utils/formatters';
import { haptic } from '../../utils/haptics';

const JOB_TYPES = [
  { value: 'Lắp đặt', label: 'Lắp đặt mới' },
  { value: 'Bảo trì', label: 'Bảo trì/Bảo dưỡng' },
  { value: 'Sửa chữa', label: 'Sửa chữa' },
  { value: 'Nâng cấp', label: 'Nâng cấp' },
];

export default function CreateJobPage({ user, tenantId, onBack, onSubmit }) {
  // Form state — giống hệt desktop CreateJobModal
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Lắp đặt');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [equipment, setEquipment] = useState('');
  const [technicians, setTechnicians] = useState([user.name]);
  const [scheduledDate, setScheduledDate] = useState(getTodayVN());
  const [scheduledTime, setScheduledTime] = useState('');
  const [customerPayment, setCustomerPayment] = useState('');

  const [allUsers, setAllUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [techSearch, setTechSearch] = useState('');

  // Load active users for technician selection — giống desktop getTechnicalUsers
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('id, name, team, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');
      setAllUsers(data || []);
    })();
  }, [tenantId]);

  const filteredUsers = useMemo(() => {
    if (!techSearch.trim()) return allUsers;
    const q = techSearch.toLowerCase();
    return allUsers.filter(u =>
      u.name?.toLowerCase().includes(q) || u.team?.toLowerCase().includes(q)
    );
  }, [allUsers, techSearch]);

  const toggleTechnician = (name) => {
    setTechnicians(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
  };

  const handleSubmit = async () => {
    // Validation — giống hệt desktop CreateJobModal
    if (!title || !customerName || !customerPhone || !address || !scheduledDate) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
      return;
    }
    if (technicians.length === 0) {
      alert('Vui lòng chọn ít nhất 1 kỹ thuật viên!');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        title,
        type,
        customerName,
        customerPhone,
        address,
        equipment: equipment ? equipment.split(',').map(e => e.trim()).filter(Boolean) : [],
        technicians,
        scheduledDate,
        scheduledTime: scheduledTime || '09:00',
        customerPayment: customerPayment ? parseFloat(customerPayment) : 0,
        createdBy: user.name,
      });
      await haptic('heavy');
      alert('Đã tạo công việc kỹ thuật!');
      onBack();
    } catch (err) {
      console.error('Error creating job:', err);
      alert('Lỗi khi tạo công việc: ' + (err.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-page mjob-create-page mpage-slide-in">
      {/* Header */}
      <div className="mjob-create-header">
        <button className="mjob-create-back" onClick={onBack}>← Quay lại</button>
        <h2 className="mjob-create-title">Tạo Công Việc Kỹ Thuật</h2>
      </div>

      {/* Form */}
      <div className="mjob-create-body">

        {/* Section: Công việc */}
        <div className="mjob-create-section">
          <h3 className="mjob-create-section-title">Công việc</h3>

          <label className="mjob-create-label">
            Tiêu đề <span className="mjob-create-req">*</span>
          </label>
          <input
            type="text"
            className="mjob-create-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="VD: Lắp dàn karaoke - Quán ABC"
          />

          <label className="mjob-create-label">
            Loại công việc <span className="mjob-create-req">*</span>
          </label>
          <select
            className="mjob-create-input mjob-create-select"
            value={type}
            onChange={e => setType(e.target.value)}
          >
            {JOB_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Section: Khách hàng */}
        <div className="mjob-create-section">
          <h3 className="mjob-create-section-title">Khách hàng</h3>

          <label className="mjob-create-label">
            Tên khách hàng <span className="mjob-create-req">*</span>
          </label>
          <input
            type="text"
            className="mjob-create-input"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Anh/Chị..."
          />

          <label className="mjob-create-label">
            Số điện thoại <span className="mjob-create-req">*</span>
          </label>
          <input
            type="tel"
            className="mjob-create-input"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            placeholder="0909..."
            inputMode="tel"
          />

          <label className="mjob-create-label">
            Địa chỉ <span className="mjob-create-req">*</span>
          </label>
          <input
            type="text"
            className="mjob-create-input"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="123 Đường ABC, Quận XYZ..."
          />
        </div>

        {/* Section: Thiết bị */}
        <div className="mjob-create-section">
          <h3 className="mjob-create-section-title">Thiết bị</h3>

          <label className="mjob-create-label">
            Danh sách thiết bị
          </label>
          <textarea
            className="mjob-create-input mjob-create-textarea"
            value={equipment}
            onChange={e => setEquipment(e.target.value)}
            placeholder="VD: Dàn karaoke Paramax, Loa sub 18 inch x2, Micro..."
            rows="3"
          />
          <p className="mjob-create-hint">Phân cách bằng dấu phẩy</p>
        </div>

        {/* Section: Kỹ thuật viên */}
        <div className="mjob-create-section">
          <h3 className="mjob-create-section-title">
            Kỹ thuật viên <span className="mjob-create-req">*</span>
          </h3>

          {allUsers.length > 6 && (
            <input
              type="text"
              className="mjob-create-input mjob-create-tech-search"
              value={techSearch}
              onChange={e => setTechSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc nhóm..."
            />
          )}

          <div className="mjob-create-tech-list">
            {filteredUsers.map(u => (
              <label key={u.id} className="mjob-create-tech-item">
                <input
                  type="checkbox"
                  checked={technicians.includes(u.name)}
                  onChange={() => toggleTechnician(u.name)}
                />
                <span className="mjob-create-tech-name">{u.name}</span>
                {u.team && <span className="mjob-create-tech-team">{u.team}</span>}
              </label>
            ))}
            {filteredUsers.length === 0 && (
              <div className="mjob-create-tech-empty">Không tìm thấy</div>
            )}
          </div>
          {technicians.length === 0 && (
            <p className="mjob-create-error">Chọn ít nhất 1 kỹ thuật viên</p>
          )}
          {technicians.length > 0 && (
            <div className="mjob-create-tech-selected">
              {technicians.map(t => (
                <span key={t} className="mjob-create-tech-tag">
                  {t}
                  <button onClick={() => toggleTechnician(t)}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Section: Lịch hẹn */}
        <div className="mjob-create-section">
          <h3 className="mjob-create-section-title">Lịch hẹn</h3>

          <div className="mjob-create-row">
            <div className="mjob-create-col-2">
              <label className="mjob-create-label">
                Ngày hẹn <span className="mjob-create-req">*</span>
              </label>
              <input
                type="date"
                className="mjob-create-input"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
              />
            </div>
            <div className="mjob-create-col-1">
              <label className="mjob-create-label">Giờ</label>
              <input
                type="time"
                className="mjob-create-input"
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                placeholder="09:00"
              />
            </div>
          </div>
        </div>

        {/* Section: Tài chính */}
        <div className="mjob-create-section">
          <h3 className="mjob-create-section-title">Tài chính</h3>

          <label className="mjob-create-label">Thu của khách (VNĐ)</label>
          <input
            type="number"
            className="mjob-create-input"
            value={customerPayment}
            onChange={e => setCustomerPayment(e.target.value)}
            placeholder="0"
            inputMode="numeric"
          />
        </div>

        {/* Spacer for sticky button */}
        <div style={{ height: 130 }} />
      </div>

      {/* Sticky submit button */}
      <div className="mjob-create-footer">
        <button
          className="mjob-create-submit"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Đang tạo...' : 'Tạo công việc'}
        </button>
      </div>
    </div>
  );
}

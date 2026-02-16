import React, { useState, useEffect } from 'react';

const CreateJobModal = ({
  showCreateJobModal,
  setShowCreateJobModal,
  prefillJobData,
  currentUser,
  allUsers,
  createTechnicalJob
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Lắp đặt');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [equipment, setEquipment] = useState('');
  const [technicians, setTechnicians] = useState([currentUser.name]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [customerPayment, setCustomerPayment] = useState('');

  // Prefill from task if available
  useEffect(() => {
    if (prefillJobData) {
      setTitle(prefillJobData.title || '');
      setCustomerName(prefillJobData.customerName || '');
      setCustomerPhone(prefillJobData.customerPhone || '');
      setAddress(prefillJobData.address || '');
      setEquipment(prefillJobData.equipment || '');
      setScheduledDate(prefillJobData.scheduledDate || '');
    }
  }, []);

  const getTechnicalUsers = () => {
    // Trả về tất cả users có thể được giao công việc kỹ thuật
    return allUsers.filter(u => u.is_active !== false);
  };

  const technicalUsers = getTechnicalUsers();

  const toggleTechnician = (techName) => {
    if (technicians.includes(techName)) {
      setTechnicians(technicians.filter(t => t !== techName));
    } else {
      setTechnicians([...technicians, techName]);
    }
  };

  if (!showCreateJobModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b bg-gradient-to-r from-orange-500 to-red-600 text-white sticky top-0">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">🔧 Tạo Công Việc Kỹ Thuật</h2>
            <button onClick={() => setShowCreateJobModal(false)} className="text-2xl hover:bg-white/20 w-8 h-8 rounded">×</button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Tiêu đề *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Lắp dàn karaoke - Quán ABC"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Loại công việc *</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="Lắp đặt">Lắp đặt mới</option>
              <option value="Bảo trì">Bảo trì/Bảo dưỡng</option>
              <option value="Sửa chữa">Sửa chữa</option>
              <option value="Nâng cấp">Nâng cấp</option>
            </select>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Tên khách hàng *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Anh/Chị..."
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Số điện thoại *</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="0909..."
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Địa chỉ *</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Đường ABC, Quận XYZ..."
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Thiết bị</label>
            <textarea
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              placeholder="VD: Dàn karaoke Paramax, Loa sub 18 inch x2, Micro..."
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              rows="3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">👥 Kỹ thuật viên * (Chọn nhiều)</label>
            <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
              {technicalUsers.map(user => (
                <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                  <input
                    type="checkbox"
                    checked={technicians.includes(user.name)}
                    onChange={() => toggleTechnician(user.name)}
                    className="w-4 h-4 text-orange-600"
                  />
                  <span className="text-sm">{user.name} - {user.team}</span>
                </label>
              ))}
            </div>
            {technicians.length === 0 && (
              <p className="text-xs text-red-600 mt-1">⚠️ Chọn ít nhất 1 kỹ thuật viên</p>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Ngày hẹn *</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Giờ</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">💰 Thu của khách (VNĐ)</label>
            <input
              type="number"
              value={customerPayment}
              onChange={(e) => setCustomerPayment(e.target.value)}
              placeholder="39300000"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 flex gap-3">
          <button
            onClick={() => setShowCreateJobModal(false)}
            className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              if (!title || !customerName || !customerPhone || !address || !scheduledDate) {
                alert('⚠️ Vui lòng điền đầy đủ thông tin bắt buộc!');
                return;
              }
              if (technicians.length === 0) {
                alert('⚠️ Vui lòng chọn ít nhất 1 kỹ thuật viên!');
                return;
              }
              createTechnicalJob({
                title,
                type,
                customerName,
                customerPhone,
                address,
                equipment: equipment ? equipment.split(',').map(e => e.trim()) : [],
                technicians,
                scheduledDate,
                scheduledTime: scheduledTime || '09:00',
                customerPayment: customerPayment ? parseFloat(customerPayment) : 0,
                createdBy: currentUser.name
              });
            }}
            className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
          >
            ✅ Tạo Công Việc
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateJobModal;

import React, { useState } from 'react';

export default function RegisterModal({ onRegister, onClose, onSwitchToLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [team, setTeam] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    const result = await onRegister(name, email, password, phone, team, 'Member');
    if (result === true) setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="text-xl font-bold text-green-700 mb-3">Đăng ký thành công!</h2>
          <p className="text-gray-600 mb-2">Vui lòng chờ Admin duyệt tài khoản.</p>
          <p className="text-sm text-gray-500 mb-6">Liên hệ quản lý để được duyệt nhanh hơn.</p>
          <button
            onClick={onSwitchToLogin}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            Về trang Đăng nhập
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-6">Đăng Ký Tài Khoản</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Họ tên <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nguyễn Văn A"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="email@company.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Mật khẩu <span className="text-red-500">*</span></label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Tối thiểu 6 ký tự"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Số điện thoại</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0901234567"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Team <span className="text-red-500">*</span></label>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Chọn team</option>
              <option value="Content">Content</option>
              <option value="Edit Video">Edit Video</option>
              <option value="Livestream">Livestream</option>
              <option value="Kho">Kho</option>
              <option value="Kỹ Thuật">Kỹ Thuật</option>
              <option value="Sale">Sale</option>
              <option value="Kinh Doanh">Kinh Doanh</option>
            </select>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-sm text-amber-800">
              Tài khoản mới cần được <strong>Admin duyệt</strong> trước khi sử dụng.
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
            >
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              Đăng Ký
            </button>
          </div>
          <div className="text-center text-sm">
            Đã có tài khoản?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-blue-600 hover:underline font-medium"
            >
              Đăng nhập
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

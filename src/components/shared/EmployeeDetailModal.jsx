import React, { useState } from 'react';
import bcrypt from 'bcryptjs';
import { supabase } from '../../supabaseClient';

export default function EmployeeDetailModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    date_of_birth: user.date_of_birth || '',
    start_date: user.start_date || '',
    address: user.address || '',
    bank_name: user.bank_name || '',
    bank_account: user.bank_account || '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name || !form.email) {
      alert('Họ tên và Email không được để trống!');
      return;
    }
    setSaving(true);
    try {
      const updateData = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        date_of_birth: form.date_of_birth || null,
        start_date: form.start_date || null,
        address: form.address || null,
        bank_name: form.bank_name || null,
        bank_account: form.bank_account || null,
      };
      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);
      if (error) throw error;
      alert('Cập nhật thành công!');
      if (onSaved) onSaved();
    } catch (err) {
      console.error('Error updating employee:', err);
      alert('Lỗi khi cập nhật!');
    }
    setSaving(false);
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('Mật khẩu mới phải có ít nhất 6 ký tự!');
      return;
    }
    if (!window.confirm(`Đặt lại mật khẩu cho "${user.name}"?`)) return;
    try {
      const hashed = await bcrypt.hash(newPassword, 10);
      const { error } = await supabase
        .from('users')
        .update({ password: hashed, password_hashed: true })
        .eq('id', user.id);
      if (error) throw error;
      alert('Đã đặt lại mật khẩu!');
      setNewPassword('');
    } catch (err) {
      console.error('Error resetting password:', err);
      alert('Lỗi khi đặt lại mật khẩu!');
    }
  };

  const Field = ({ label, name, type = 'text', placeholder }) => (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[name]}
        onChange={e => setForm({...form, [name]: e.target.value})}
        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        placeholder={placeholder}
      />
    </div>
  );

  const roleLabel = {
    'Admin': 'Quản trị viên',
    'admin': 'Quản trị viên',
    'Manager': 'Quản lý',
    'Team Lead': 'Trưởng nhóm',
    'Member': 'Nhân viên',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
              {user.name?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold">{user.name}</h2>
              <p className="text-blue-100 text-sm">{roleLabel[user.role] || user.role} - {(user.teams || [user.team].filter(Boolean)).join(', ') || 'N/A'}</p>
              <p className="text-blue-200 text-xs">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Họ tên *" name="name" placeholder="Nguyễn Văn A" />
            </div>
            <div className="col-span-2">
              <Field label="Email *" name="email" type="email" placeholder="email@company.com" />
            </div>
            <Field label="Số điện thoại" name="phone" type="tel" placeholder="0901234567" />
            <Field label="Ngày sinh" name="date_of_birth" type="date" />
            <Field label="Ngày vào làm" name="start_date" type="date" />
            <div />
            <div className="col-span-2">
              <Field label="Địa chỉ" name="address" placeholder="Số nhà, đường, quận/huyện, TP" />
            </div>
            <Field label="Ngân hàng" name="bank_name" placeholder="VD: Vietcombank" />
            <Field label="Số tài khoản" name="bank_account" placeholder="Số TK ngân hàng" />
          </div>

          {/* Account info (read-only) */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Thông tin tài khoản</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Chức vụ: </span>
                <span className="font-medium">{roleLabel[user.role] || user.role}</span>
              </div>
              <div>
                <span className="text-gray-500">Trạng thái: </span>
                <span className={`font-medium ${user.status === 'approved' ? 'text-green-600' : 'text-amber-600'}`}>{user.status || 'approved'}</span>
              </div>
              <div>
                <span className="text-gray-500">Ngày tạo: </span>
                <span className="font-medium">{user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">Hoạt động: </span>
                <span className={`font-medium ${user.is_active !== false ? 'text-green-600' : 'text-red-600'}`}>{user.is_active !== false ? 'Có' : 'Không'}</span>
              </div>
            </div>
          </div>

          {/* Reset password */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-amber-800 mb-2">Đặt lại mật khẩu</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                placeholder="Nhập mật khẩu mới (min 6 ký tự)"
              />
              <button
                onClick={handleResetPassword}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium whitespace-nowrap"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">
            Đóng
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
}

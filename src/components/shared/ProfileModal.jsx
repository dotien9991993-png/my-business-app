import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';

export default function ProfileModal({ onClose }) {
  const { currentUser, setCurrentUser, changePassword } = useApp();
  const [editing, setEditing] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [form, setForm] = useState({
    phone: currentUser.phone || '',
    address: currentUser.address || '',
    date_of_birth: currentUser.date_of_birth || '',
    bank_name: currentUser.bank_name || '',
    bank_account: currentUser.bank_account || '',
  });
  const [pwForm, setPwForm] = useState({ old: '', new: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          phone: form.phone || null,
          address: form.address || null,
          date_of_birth: form.date_of_birth || null,
          bank_name: form.bank_name || null,
          bank_account: form.bank_account || null,
        })
        .eq('id', currentUser.id);
      if (error) throw error;
      setCurrentUser({ ...currentUser, ...form });
      setEditing(false);
      alert('Cập nhật thành công!');
    } catch (err) {
      console.error('Error updating profile:', err);
      alert('Lỗi khi cập nhật!');
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (pwForm.new !== pwForm.confirm) {
      alert('Mật khẩu xác nhận không khớp!');
      return;
    }
    if (pwForm.new.length < 6) {
      alert('Mật khẩu mới phải có ít nhất 6 ký tự!');
      return;
    }
    const result = await changePassword(currentUser.id, pwForm.old, pwForm.new);
    if (result) {
      setPwForm({ old: '', new: '', confirm: '' });
      setShowChangePassword(false);
    }
  };

  const InfoRow = ({ label, value }) => (
    <div className="flex justify-between py-2 border-b border-gray-100">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="font-medium text-sm">{value || '-'}</span>
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
        <div className="p-6 border-b bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-xl">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
              {currentUser.name?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold">{currentUser.name}</h2>
              <p className="text-green-100 text-sm">{roleLabel[currentUser.role] || currentUser.role} - {currentUser.team}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Read-only info */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">Thông tin tài khoản</h3>
            <InfoRow label="Họ tên" value={currentUser.name} />
            <InfoRow label="Email" value={currentUser.email} />
            <InfoRow label="Chức vụ" value={roleLabel[currentUser.role] || currentUser.role} />
            <InfoRow label="Team" value={(currentUser.teams || [currentUser.team].filter(Boolean)).join(', ')} />
            <InfoRow label="Ngày vào làm" value={currentUser.start_date ? new Date(currentUser.start_date).toLocaleDateString('vi-VN') : '-'} />
          </div>

          {/* Editable info */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700">Thông tin cá nhân</h3>
              {!editing && (
                <button onClick={() => setEditing(true)} className="text-sm text-blue-600 hover:underline font-medium">
                  Chỉnh sửa
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Số điện thoại</label>
                  <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" placeholder="0901234567" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Ngày sinh</label>
                  <input type="date" value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Địa chỉ</label>
                  <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" placeholder="Số nhà, đường, quận/huyện, TP" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Ngân hàng</label>
                  <input type="text" value={form.bank_name} onChange={e => setForm({...form, bank_name: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" placeholder="VD: Vietcombank" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Số tài khoản</label>
                  <input type="text" value={form.bank_account} onChange={e => setForm({...form, bank_account: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" placeholder="Số tài khoản ngân hàng" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setEditing(false)} className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium">Hủy</button>
                  <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                    {saving ? 'Đang lưu...' : 'Lưu'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <InfoRow label="Số điện thoại" value={currentUser.phone} />
                <InfoRow label="Ngày sinh" value={currentUser.date_of_birth ? new Date(currentUser.date_of_birth).toLocaleDateString('vi-VN') : '-'} />
                <InfoRow label="Địa chỉ" value={currentUser.address} />
                <InfoRow label="Ngân hàng" value={currentUser.bank_name} />
                <InfoRow label="Số tài khoản" value={currentUser.bank_account} />
              </>
            )}
          </div>

          {/* Change password */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700">Mật khẩu</h3>
              {!showChangePassword && (
                <button onClick={() => setShowChangePassword(true)} className="text-sm text-blue-600 hover:underline font-medium">
                  Đổi mật khẩu
                </button>
              )}
            </div>
            {showChangePassword && (
              <div className="space-y-3 bg-gray-50 rounded-lg p-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Mật khẩu hiện tại</label>
                  <input type="password" value={pwForm.old} onChange={e => setPwForm({...pwForm, old: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                  <input type="password" value={pwForm.new} onChange={e => setPwForm({...pwForm, new: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Xác nhận mật khẩu mới</label>
                  <input type="password" value={pwForm.confirm} onChange={e => setPwForm({...pwForm, confirm: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowChangePassword(false); setPwForm({ old: '', new: '', confirm: '' }); }} className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium">Hủy</button>
                  <button onClick={handleChangePassword} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">Đổi mật khẩu</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t">
          <button onClick={onClose} className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import { uploadImage } from '../../utils/cloudinaryUpload';
import { getNotificationSettings, saveNotificationSettings, playMessageSound, playNotificationSound } from '../../utils/notificationSound';

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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [notifSettings, setNotifSettings] = useState(getNotificationSettings);
  const avatarInputRef = useRef(null);

  const toggleNotifSetting = (key) => {
    const updated = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(updated);
    saveNotificationSettings(updated);
    // Phát âm thanh demo khi bật
    if (updated[key]) {
      if (key === 'soundMessage') playMessageSound();
      if (key === 'soundSystem') playNotificationSound();
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      alert('Chỉ hỗ trợ ảnh JPG, PNG, GIF, WebP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Ảnh quá lớn (tối đa 5MB)');
      return;
    }
    setUploadingAvatar(true);
    try {
      const result = await uploadImage(file, 'avatars');
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: result.url })
        .eq('id', currentUser.id);
      if (error) throw error;
      setCurrentUser({ ...currentUser, avatar_url: result.url });
      alert('Cập nhật ảnh đại diện thành công!');
    } catch (err) {
      console.error('Error uploading avatar:', err);
      alert('Lỗi khi tải ảnh lên: ' + (err.message || err));
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

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
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="relative w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold flex-shrink-0 overflow-hidden group"
              title="Đổi ảnh đại diện"
            >
              {currentUser.avatar_url ? (
                <img src={currentUser.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
              ) : (
                currentUser.name?.charAt(0)?.toUpperCase()
              )}
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-sm">📷</span>
                )}
              </div>
            </button>
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

          {/* Notification settings */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">Cài đặt thông báo</h3>
            <div className="space-y-3 bg-gray-50 rounded-lg p-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💬</span>
                  <span className="text-sm text-gray-700">Âm thanh tin nhắn mới</span>
                </div>
                <div
                  onClick={() => toggleNotifSetting('soundMessage')}
                  className={`relative w-11 h-6 rounded-full transition-colors ${notifSettings.soundMessage ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifSettings.soundMessage ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔔</span>
                  <span className="text-sm text-gray-700">Âm thanh thông báo hệ thống</span>
                </div>
                <div
                  onClick={() => toggleNotifSetting('soundSystem')}
                  className={`relative w-11 h-6 rounded-full transition-colors ${notifSettings.soundSystem ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifSettings.soundSystem ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📢</span>
                  <span className="text-sm text-gray-700">Thông báo trên trình duyệt</span>
                </div>
                <div
                  onClick={() => toggleNotifSetting('browserPush')}
                  className={`relative w-11 h-6 rounded-full transition-colors ${notifSettings.browserPush ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifSettings.browserPush ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </div>
              </label>
            </div>
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

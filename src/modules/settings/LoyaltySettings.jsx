import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const DEFAULT_CONFIG = {
  enabled: false,
  points_per_amount: 10000,  // Mỗi 10,000đ = 1 điểm
  point_value: 1000,          // 1 điểm = 1,000đ
  min_redeem_points: 10,      // Tối thiểu 10 điểm để dùng
};

const TIERS = [
  { name: 'Thành viên', min: 0, max: 99, color: 'bg-gray-100 text-gray-700' },
  { name: 'Bạc', min: 100, max: 499, color: 'bg-gray-200 text-gray-800' },
  { name: 'Vàng', min: 500, max: 999, color: 'bg-yellow-100 text-yellow-800' },
  { name: 'Kim cương', min: 1000, max: Infinity, color: 'bg-blue-100 text-blue-800' },
];

export { DEFAULT_CONFIG as LOYALTY_DEFAULT_CONFIG, TIERS as LOYALTY_TIERS };

export default function LoyaltySettings({ tenant, currentUser, getSettingValue, loadSettingsData }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const dbConfig = getSettingValue('loyalty', 'config', null);
    if (dbConfig) setConfig({ ...DEFAULT_CONFIG, ...dbConfig });
  }, [getSettingValue]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const saveConfig = async (newConfig) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('system_settings').upsert({
        tenant_id: tenant.id,
        category: 'loyalty',
        key: 'config',
        value: newConfig,
        updated_by: currentUser.name,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,category,key' });
      if (error) throw error;
      await loadSettingsData();
      showToast('Đã lưu cấu hình tích điểm!');
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setSaving(false); }
  };

  const updateField = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
  };

  const handleSave = () => saveConfig(config);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Cấu hình tích điểm khách hàng</h2>
        {toast && (
          <div className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium">{toast}</div>
        )}
      </div>

      <div className="bg-white rounded-xl border p-6 space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-gray-800">Bật tích điểm</div>
            <div className="text-sm text-gray-500">Khách hàng sẽ được tích điểm khi đơn hàng hoàn thành</div>
          </div>
          <button onClick={() => updateField('enabled', !config.enabled)}
            className={`relative w-12 h-6 rounded-full transition ${config.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition ${config.enabled ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>

        {config.enabled && (
          <>
            {/* Points per amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Mỗi bao nhiêu VNĐ = 1 điểm</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="1000" step="1000" value={config.points_per_amount}
                    onChange={e => updateField('points_per_amount', parseInt(e.target.value) || 10000)}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                  <span className="text-sm text-gray-500">VNĐ</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">Mua {(config.points_per_amount || 10000).toLocaleString('vi-VN')}đ = 1 điểm</div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Giá trị 1 điểm</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="100" step="100" value={config.point_value}
                    onChange={e => updateField('point_value', parseInt(e.target.value) || 1000)}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                  <span className="text-sm text-gray-500">VNĐ</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">1 điểm = {(config.point_value || 1000).toLocaleString('vi-VN')}đ khi đổi</div>
              </div>
            </div>

            {/* Min redeem */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Số điểm tối thiểu để sử dụng</label>
              <input type="number" min="1" value={config.min_redeem_points}
                onChange={e => updateField('min_redeem_points', parseInt(e.target.value) || 10)}
                className="w-48 border rounded-lg px-3 py-2 text-sm" />
            </div>

            {/* Tier preview */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Hạng thành viên</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TIERS.map(t => (
                  <div key={t.name} className={`rounded-lg p-3 text-center ${t.color}`}>
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs mt-0.5">{t.min}{t.max === Infinity ? '+' : `-${t.max}`} điểm</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Example */}
            <div className="bg-blue-50 rounded-lg p-4 text-sm">
              <div className="font-medium text-blue-700 mb-1">Ví dụ</div>
              <div className="text-blue-600">
                Khách mua đơn {(config.points_per_amount * 5).toLocaleString('vi-VN')}đ → Tích được <span className="font-bold">5 điểm</span> → Giá trị quy đổi: <span className="font-bold">{(5 * config.point_value).toLocaleString('vi-VN')}đ</span>
              </div>
            </div>
          </>
        )}

        {/* Save button */}
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium text-white ${saving ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>
      </div>
    </div>
  );
}

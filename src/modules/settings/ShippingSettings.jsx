import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { shippingProviders as defaultProviders } from '../../constants/salesConstants';
import AddressPicker from '../../components/shared/AddressPicker';
import { loginVtp, getProvinces } from '../../utils/viettelpostApi';

const API_PROVIDERS = [
  {
    key: 'ghn', name: 'GHN (Giao Hàng Nhanh)', color: 'orange',
    testUrl: 'https://online-gateway.ghn.vn/shiip/public-api/v2/master-data/province',
    hasShopId: true, tokenHeader: 'Token',
    logo: '🟠'
  },
  {
    key: 'ghtk', name: 'GHTK (Giao Hàng Tiết Kiệm)', color: 'green',
    testUrl: 'https://services.giaohangtietkiem.vn/services/shipment/fee?pick_province=Hà+Nội&pick_district=Cầu+Giấy&province=Hồ+Chí+Minh&district=Quận+1&weight=1000',
    hasShopId: false, tokenHeader: 'Token',
    logo: '🟢'
  },
  {
    key: 'viettel_post', name: 'Viettel Post', color: 'red',
    testUrl: 'https://partner.viettelpost.vn/v2/categories/listProvinceById?provinceId=-1',
    hasShopId: false, tokenHeader: 'Token',
    logo: '🔴'
  }
];

export default function ShippingSettings({ tenant, currentUser, shippingConfigs, loadSettingsData, getSettingValue }) {
  const [configs, setConfigs] = useState({});
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState({});
  const [saving, setSaving] = useState({});
  const [otherProviders, setOtherProviders] = useState([]);
  const [newProvider, setNewProvider] = useState('');
  const [toast, setToast] = useState(null);
  const [vtpSender, setVtpSender] = useState({ name: '', phone: '', address: '', province_id: null, province_name: '', district_id: null, district_name: '', ward_id: null, ward_name: '' });
  const [savingVtp, setSavingVtp] = useState(false);
  const [vtpAuthMode, setVtpAuthMode] = useState('login');
  const [vtpUsername, setVtpUsername] = useState('');
  const [vtpPassword, setVtpPassword] = useState('');
  const [vtpLoggingIn, setVtpLoggingIn] = useState(false);

  useEffect(() => {
    const cfgMap = {};
    for (const p of API_PROVIDERS) {
      const existing = (shippingConfigs || []).find(c => c.provider === p.key);
      cfgMap[p.key] = {
        api_token: existing?.api_token || '',
        shop_id: existing?.shop_id || '',
        is_active: existing?.is_active || false,
        saved: !!existing
      };
    }
    setConfigs(cfgMap);

    const dbOther = getSettingValue('shipping', 'other_providers', null);
    setOtherProviders(dbOther || defaultProviders.filter(p => !['GHN', 'GHTK', 'Viettel Post'].includes(p)));

    const dbVtpSender = getSettingValue('shipping', 'vtp_sender_address', null);
    if (dbVtpSender) setVtpSender(dbVtpSender);
  }, [shippingConfigs, getSettingValue]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const maskToken = (token) => {
    if (!token || token.length < 8) return token;
    return '****' + token.slice(-4);
  };

  const handleVtpLogin = async () => {
    if (!vtpUsername.trim() || !vtpPassword.trim()) return alert('Vui lòng nhập username và password');
    setVtpLoggingIn(true);
    try {
      const result = await loginVtp(vtpUsername, vtpPassword);
      if (result.success && result.data?.token) {
        const token = result.data.token;
        setConfigs(prev => ({ ...prev, viettel_post: { ...prev.viettel_post, api_token: token, is_active: true, saved: true } }));
        await supabase.from('shipping_configs').upsert({
          tenant_id: tenant.id, provider: 'viettel_post',
          api_token: token, is_active: true, updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id,provider' });
        // Lưu credentials để server auto-refresh token khi hết hạn
        await supabase.from('system_settings').upsert({
          tenant_id: tenant.id, category: 'shipping', key: 'vtp_credentials',
          value: { username: vtpUsername.trim(), password: vtpPassword.trim() },
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id,category,key' });
        await loadSettingsData();
        showToast('Đăng nhập Viettel Post thành công!');
        setVtpPassword('');
      } else {
        alert('Đăng nhập thất bại: ' + (result.error || 'Sai username hoặc password'));
      }
    } catch (_err) {
      alert('Lỗi kết nối (có thể do CORS). Thử cách 2: nhập token thủ công.');
    }
    finally { setVtpLoggingIn(false); }
  };

  const handleVtpClearToken = async () => {
    if (!window.confirm('Xóa token Viettel Post?')) return;
    setConfigs(prev => ({ ...prev, viettel_post: { ...prev.viettel_post, api_token: '', is_active: false } }));
    await supabase.from('shipping_configs').upsert({
      tenant_id: tenant.id, provider: 'viettel_post',
      api_token: '', is_active: false, updated_at: new Date().toISOString()
    }, { onConflict: 'tenant_id,provider' });
    await loadSettingsData();
    showToast('Đã xóa token VTP');
  };

  const updateConfig = (providerKey, field, value) => {
    setConfigs(prev => ({ ...prev, [providerKey]: { ...prev[providerKey], [field]: value } }));
  };

  const saveConfig = async (providerKey) => {
    const cfg = configs[providerKey];
    setSaving(prev => ({ ...prev, [providerKey]: true }));
    try {
      const { error } = await supabase.from('shipping_configs').upsert({
        tenant_id: tenant.id,
        provider: providerKey,
        api_token: cfg.api_token,
        shop_id: cfg.shop_id || null,
        is_active: cfg.is_active,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,provider' });
      if (error) throw error;
      await loadSettingsData();
      showToast(`Đã lưu cấu hình ${providerKey.toUpperCase()}!`);
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setSaving(prev => ({ ...prev, [providerKey]: false })); }
  };

  const testConnection = async (provider) => {
    const cfg = configs[provider.key];
    if (!cfg.api_token) return alert('Vui lòng nhập API Token');
    setTesting(prev => ({ ...prev, [provider.key]: true }));
    setTestResults(prev => ({ ...prev, [provider.key]: null }));
    try {
      if (provider.key === 'viettel_post') {
        // VTP: gọi qua proxy để tránh CORS
        const result = await getProvinces(cfg.api_token);
        if (result.success) {
          setTestResults(prev => ({ ...prev, [provider.key]: { success: true, msg: 'Kết nối thành công!' } }));
        } else {
          setTestResults(prev => ({ ...prev, [provider.key]: { success: false, msg: result.error || 'Token không hợp lệ' } }));
        }
      } else {
        // GHN, GHTK: gọi qua proxy chung /api/shipping-test
        const resp = await fetch(provider.testUrl, {
          method: 'GET',
          headers: { [provider.tokenHeader]: cfg.api_token, 'Content-Type': 'application/json' }
        });
        if (resp.ok) {
          setTestResults(prev => ({ ...prev, [provider.key]: { success: true, msg: 'Kết nối thành công!' } }));
        } else {
          const body = await resp.text().catch(() => '');
          setTestResults(prev => ({ ...prev, [provider.key]: { success: false, msg: `Lỗi ${resp.status}: ${body.slice(0, 100)}` } }));
        }
      }
    } catch (err) {
      setTestResults(prev => ({ ...prev, [provider.key]: { success: false, msg: 'Không thể kết nối: ' + err.message } }));
    }
    finally { setTesting(prev => ({ ...prev, [provider.key]: false })); }
  };

  const saveOtherProviders = async (list) => {
    try {
      await supabase.from('system_settings').upsert({
        tenant_id: tenant.id, category: 'shipping', key: 'other_providers',
        value: list, updated_by: currentUser.name, updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,category,key' });
      await loadSettingsData();
      showToast('Đã lưu!');
    } catch (err) { alert('Lỗi: ' + err.message); }
  };

  const addOtherProvider = () => {
    if (!newProvider.trim()) return;
    if (otherProviders.includes(newProvider.trim())) return alert('Đã tồn tại');
    const newList = [...otherProviders, newProvider.trim()];
    setOtherProviders(newList);
    setNewProvider('');
    saveOtherProviders(newList);
  };

  const removeOtherProvider = (idx) => {
    if (!window.confirm('Xóa đơn vị VC này?')) return;
    const newList = [...otherProviders];
    newList.splice(idx, 1);
    setOtherProviders(newList);
    saveOtherProviders(newList);
  };

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      <h2 className="text-xl md:text-2xl font-bold">🚚 Cấu Hình Vận Chuyển</h2>
      <p className="text-sm text-gray-500">Cấu hình API vận chuyển và quản lý đơn vị giao hàng.</p>

      {/* API Providers */}
      <div className="space-y-4">
        {API_PROVIDERS.map(provider => {
          const cfg = configs[provider.key] || {};
          const result = testResults[provider.key];
          const isTesting = testing[provider.key];
          const isSaving = saving[provider.key];

          return (
            <div key={provider.key} className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{provider.logo}</span>
                  <h3 className="font-bold text-gray-800">{provider.name}</h3>
                </div>
                <div className="flex items-center gap-3">
                  {cfg.saved && cfg.api_token && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {cfg.is_active ? 'Đang bật' : 'Đã tắt'}
                    </span>
                  )}
                  {!cfg.saved && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">Chưa cấu hình</span>}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={cfg.is_active || false}
                      onChange={e => updateConfig(provider.key, 'is_active', e.target.checked)}
                      className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>
              </div>

              {provider.key === 'viettel_post' ? (
                cfg.api_token ? (
                  /* VTP Connected */
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 font-medium text-sm">Đã kết nối Viettel Post</span>
                    </div>
                    <div className="text-xs text-gray-400">Token: {maskToken(cfg.api_token)}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => testConnection(provider)} disabled={isTesting}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isTesting ? 'bg-gray-200 text-gray-400' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                        {isTesting ? 'Đang test...' : 'Test kết nối'}
                      </button>
                      <button onClick={handleVtpClearToken}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200">
                        Xóa token / Đổi TK
                      </button>
                      {result && (
                        <span className={`text-xs font-medium ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                          {result.success ? '✅' : '❌'} {result.msg}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* VTP Not Connected */
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button onClick={() => setVtpAuthMode('login')}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition ${vtpAuthMode === 'login' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500'}`}>
                        Cách 1: Đăng nhập
                      </button>
                      <button onClick={() => setVtpAuthMode('manual')}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition ${vtpAuthMode === 'manual' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500'}`}>
                        Cách 2: Nhập token
                      </button>
                    </div>
                    {vtpAuthMode === 'login' ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-sm font-medium text-gray-600 mb-1 block">Username (partner.viettelpost.vn)</label>
                          <input value={vtpUsername} onChange={e => setVtpUsername(e.target.value)}
                            placeholder="Nhập username..." className="w-full border rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-600 mb-1 block">Password</label>
                          <input type="password" value={vtpPassword} onChange={e => setVtpPassword(e.target.value)}
                            placeholder="Nhập password..." className="w-full border rounded-lg px-3 py-2 text-sm"
                            onKeyDown={e => e.key === 'Enter' && handleVtpLogin()} />
                        </div>
                        <button onClick={handleVtpLogin} disabled={vtpLoggingIn}
                          className={`w-full py-2.5 rounded-lg text-sm font-medium text-white ${vtpLoggingIn ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}>
                          {vtpLoggingIn ? 'Đang đăng nhập...' : 'Đăng nhập Viettel Post'}
                        </button>
                        <p className="text-xs text-gray-400">Nếu lỗi kết nối (CORS), hãy dùng Cách 2.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <div className="text-sm font-medium text-red-700 mb-2">Hướng dẫn lấy token:</div>
                          <ol className="text-xs text-red-600 space-y-1 list-decimal list-inside">
                            <li>Truy cập <a href="https://partner.viettelpost.vn" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-red-800">partner.viettelpost.vn</a></li>
                            <li>Đăng nhập bằng tài khoản đối tác</li>
                            <li>Nhấn F12 &rarr; tab Application &rarr; Local Storage</li>
                            <li>Tìm key <code className="bg-red-100 px-1 rounded">token</code> &rarr; copy giá trị</li>
                            <li>Paste vào ô bên dưới</li>
                          </ol>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-600 mb-1 block">API Token</label>
                          <input type="password" value={cfg.api_token || ''} onChange={e => updateConfig('viettel_post', 'api_token', e.target.value)}
                            placeholder="Paste token..." className="w-full border rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => saveConfig('viettel_post')} disabled={isSaving}
                            className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${isSaving ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}>
                            {isSaving ? 'Đang lưu...' : 'Lưu token'}
                          </button>
                          <button onClick={() => testConnection(provider)} disabled={isTesting}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isTesting ? 'bg-gray-200 text-gray-400' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                            {isTesting ? 'Đang test...' : 'Test kết nối'}
                          </button>
                          {result && (
                            <span className={`text-xs font-medium ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                              {result.success ? '✅' : '❌'} {result.msg}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : (
                /* GHN, GHTK - Generic auth */
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-600 mb-1 block">API Token</label>
                      <div className="relative">
                        <input type="password" value={cfg.api_token || ''} onChange={e => updateConfig(provider.key, 'api_token', e.target.value)}
                          placeholder="Nhập API token..." className="w-full border rounded-lg px-3 py-2 text-sm pr-16" />
                        {cfg.saved && cfg.api_token && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{maskToken(cfg.api_token)}</span>
                        )}
                      </div>
                    </div>
                    {provider.hasShopId && (
                      <div>
                        <label className="text-sm font-medium text-gray-600 mb-1 block">Shop ID</label>
                        <input value={cfg.shop_id || ''} onChange={e => updateConfig(provider.key, 'shop_id', e.target.value)}
                          placeholder="Nhập Shop ID..." className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => testConnection(provider)} disabled={isTesting}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isTesting ? 'bg-gray-200 text-gray-400' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                      {isTesting ? 'Đang test...' : 'Test kết nối'}
                    </button>
                    <button onClick={() => saveConfig(provider.key)} disabled={isSaving}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white ${isSaving ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
                      {isSaving ? 'Đang lưu...' : 'Lưu'}
                    </button>
                    {result && (
                      <span className={`text-xs font-medium ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                        {result.success ? '✅' : '❌'} {result.msg}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* VTP Sender Address */}
      {configs.viettel_post?.is_active && configs.viettel_post?.api_token && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="font-bold text-red-700">📍 Địa chỉ lấy hàng Viettel Post</h3>
          <p className="text-xs text-gray-500">Cấu hình địa chỉ gửi hàng mặc định cho đơn Viettel Post.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">Tên người gửi</label>
              <input value={vtpSender.name} onChange={e => setVtpSender(prev => ({ ...prev, name: e.target.value }))}
                placeholder="VD: Hoang Nam Audio" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">SĐT người gửi</label>
              <input value={vtpSender.phone} onChange={e => setVtpSender(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="0909..." className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Tỉnh / Quận / Phường</label>
            <AddressPicker
              token={configs.viettel_post.api_token}
              value={vtpSender}
              onChange={(addr) => setVtpSender(prev => ({ ...prev, ...addr }))}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Địa chỉ chi tiết</label>
            <input value={vtpSender.address} onChange={e => setVtpSender(prev => ({ ...prev, address: e.target.value }))}
              placeholder="Số nhà, tên đường..." className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <button
            onClick={async () => {
              if (!vtpSender.name || !vtpSender.phone || !vtpSender.province_id) {
                return alert('Vui lòng điền đầy đủ tên, SĐT và chọn tỉnh/huyện/xã');
              }
              setSavingVtp(true);
              try {
                await supabase.from('system_settings').upsert({
                  tenant_id: tenant.id, category: 'shipping', key: 'vtp_sender_address',
                  value: vtpSender, updated_by: currentUser.name, updated_at: new Date().toISOString()
                }, { onConflict: 'tenant_id,category,key' });
                await loadSettingsData();
                showToast('Đã lưu địa chỉ lấy hàng VTP!');
              } catch (err) { alert('Lỗi: ' + err.message); }
              finally { setSavingVtp(false); }
            }}
            disabled={savingVtp}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${savingVtp ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {savingVtp ? 'Đang lưu...' : '💾 Lưu địa chỉ lấy hàng'}
          </button>
        </div>
      )}

      {/* Other providers */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">📋 Đơn vị vận chuyển khác</h3>
        <p className="text-xs text-gray-500">Đơn vị VC không cần API (tự giao, Grab, J&T...)</p>

        <div className="space-y-1.5">
          {otherProviders.map((p, idx) => (
            <div key={idx} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 group">
              <span className="text-sm">{p}</span>
              <button onClick={() => removeOtherProvider(idx)}
                className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600">Xóa</button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <input value={newProvider} onChange={e => setNewProvider(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addOtherProvider()}
            placeholder="VD: Grab Express, Tự giao..."
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={addOtherProvider}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            + Thêm
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-green-600 text-white">
          {toast}
        </div>
      )}
    </div>
  );
}

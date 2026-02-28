import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';

export default function SocialPagesSettings({ tenant, currentUser }) {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [tokenError, setTokenError] = useState('');
  const [validatingToken, setValidatingToken] = useState(false);
  const [toast, setToast] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [testingTokenId, setTestingTokenId] = useState(null);

  // Form state
  const [formPlatform, setFormPlatform] = useState('facebook');
  const [formPageName, setFormPageName] = useState('');
  const [formPageId, setFormPageId] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formAccessToken, setFormAccessToken] = useState('');
  const [formTokenExpires, setFormTokenExpires] = useState('');

  const loadConfigs = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('social_page_configs')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    setConfigs(data || []);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // Detect OAuth callback từ Facebook
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('fb_connected');
    const fbError = params.get('fb_error');
    const fbPages = params.get('fb_pages');

    if (connected === 'true') {
      setToast({ type: 'success', msg: `Kết nối thành công! Đã thêm ${fbPages || ''} page.` });
      loadConfigs();
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    } else if (fbError) {
      setToast({ type: 'error', msg: 'Lỗi: ' + decodeURIComponent(fbError) });
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const resetForm = () => {
    setEditingId(null);
    setFormPlatform('facebook');
    setFormPageName('');
    setFormPageId('');
    setFormUsername('');
    setFormAccessToken('');
    setFormTokenExpires('');
    setTokenError('');
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (config) => {
    setEditingId(config.id);
    setFormPlatform(config.platform);
    setFormPageName(config.page_name);
    setFormPageId(config.page_id || '');
    setFormUsername(config.username || '');
    setFormAccessToken(config.access_token || '');
    setFormTokenExpires(config.token_expires_at ? config.token_expires_at.slice(0, 16) : '');
    setShowForm(true);
  };

  const connectFacebook = async () => {
    if (!tenant?.id) return;
    setConnecting(true);
    try {
      const resp = await fetch('/api/fb-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_oauth_url', state: tenant.id }),
      });
      const data = await resp.json();
      if (data.error) {
        setToast({ type: 'error', msg: data.error });
        setConnecting(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setToast({ type: 'error', msg: 'Không thể kết nối: ' + err.message });
      setConnecting(false);
    }
  };

  const testToken = async (config) => {
    if (!config.access_token) return;
    setTestingTokenId(config.id);
    try {
      const resp = await fetch(
        `https://graph.facebook.com/${config.page_id || 'me'}?fields=name&access_token=${encodeURIComponent(config.access_token)}`
      );
      const data = await resp.json();
      if (data.error) {
        if (data.error.code === 190) {
          setToast({ type: 'error', msg: `"${config.page_name}": Token hết hạn, vui lòng kết nối lại` });
        } else {
          setToast({ type: 'error', msg: `"${config.page_name}": ${data.error.message}` });
        }
      } else {
        setToast({ type: 'success', msg: `"${config.page_name}": Token hoạt động tốt` });
      }
    } catch (err) {
      setToast({ type: 'error', msg: `Không thể kiểm tra: ${err.message}` });
    } finally {
      setTestingTokenId(null);
    }
  };

  const validateFacebookToken = async (token) => {
    if (!token) return { valid: true }; // Cho phép lưu không có token
    setValidatingToken(true);
    setTokenError('');
    try {
      const resp = await fetch(`https://graph.facebook.com/me?access_token=${encodeURIComponent(token)}`);
      const data = await resp.json();

      if (data.error) {
        if (data.error.code === 190) {
          return { valid: false, error: 'Token đã hết hạn hoặc không hợp lệ. Vui lòng lấy token mới.' };
        }
        return { valid: false, error: `Facebook API lỗi: ${data.error.message}` };
      }

      // Nếu response có "category" → đây là Page Token
      if (data.category) {
        return { valid: true, pageId: data.id, pageName: data.name };
      }

      // Không có category → User Token
      return {
        valid: false,
        error: 'Token này là User Token, không phải Page Token.\nVào Graph API Explorer → dropdown "Người dùng hoặc Trang" → chọn tên Page → Generate Access Token'
      };
    } catch (err) {
      return { valid: false, error: `Không thể kiểm tra token: ${err.message}` };
    } finally {
      setValidatingToken(false);
    }
  };

  const saveConfig = async () => {
    if (!formPageName.trim()) return alert('Vui lòng nhập tên page');
    setTokenError('');

    // Validate Facebook token nếu có
    if (formPlatform === 'facebook' && formAccessToken.trim()) {
      const validation = await validateFacebookToken(formAccessToken.trim());
      if (!validation.valid) {
        setTokenError(validation.error);
        return;
      }
      // Auto-fill Page ID từ token nếu chưa nhập
      if (validation.pageId && !formPageId.trim()) {
        setFormPageId(validation.pageId);
      }
    }

    setSaving(true);

    const payload = {
      tenant_id: tenant.id,
      platform: formPlatform,
      page_name: formPageName.trim(),
      page_id: formPageId.trim() || null,
      username: formUsername.trim() || null,
      access_token: formAccessToken.trim() || null,
      token_expires_at: formTokenExpires ? new Date(formTokenExpires).toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      await supabase.from('social_page_configs').update(payload).eq('id', editingId);
    } else {
      await supabase.from('social_page_configs').insert(payload);
    }

    setSaving(false);
    setShowForm(false);
    resetForm();
    loadConfigs();
  };

  const deleteConfig = async (config) => {
    if (!confirm(`Xóa page "${config.page_name}"?`)) return;
    await supabase.from('social_page_configs').update({ is_active: false }).eq('id', config.id);
    loadConfigs();
  };

  const getTokenStatus = (config) => {
    if (!config.access_token) return { label: 'Chưa có token', color: 'text-gray-400', bg: 'bg-gray-100' };
    if (config.platform === 'facebook' && !config.token_expires_at) {
      return { label: 'Token vĩnh viễn', color: 'text-green-700', bg: 'bg-green-100' };
    }
    if (!config.token_expires_at) return { label: 'Đã cấu hình', color: 'text-green-700', bg: 'bg-green-100' };

    const expires = new Date(config.token_expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) return { label: 'Hết hạn', color: 'text-red-700', bg: 'bg-red-100' };
    if (daysLeft <= 7) return { label: `Còn ${daysLeft} ngày`, color: 'text-orange-700', bg: 'bg-orange-100' };
    return { label: `Còn ${daysLeft} ngày`, color: 'text-green-700', bg: 'bg-green-100' };
  };

  const platformLabel = (p) => p === 'facebook' ? '📘 Facebook' : '🎵 TikTok';

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] max-w-sm px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-fade-in ${
          toast.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-start gap-2">
            <span>{toast.type === 'success' ? '✅' : '❌'}</span>
            <span className="flex-1">{toast.msg}</span>
            <button onClick={() => setToast(null)} className="text-gray-400 hover:text-gray-600 ml-2">&times;</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">📊 Mạng Xã Hội</h2>
          <p className="text-gray-500 text-sm mt-1">Kết nối Facebook Page / TikTok để lấy stats video tự động</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={connectFacebook}
            disabled={connecting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm flex items-center gap-1.5"
          >
            {connecting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Đang kết nối...
              </>
            ) : (
              <>📘 Kết nối Facebook</>
            )}
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
          >
            + Thêm Page
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải...</div>
      ) : configs.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <div className="text-5xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-gray-600 mb-2">Chưa kết nối page nào</h3>
          <p className="text-gray-400 mb-4">Thêm Facebook Page hoặc TikTok account để lấy stats video</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={connectFacebook}
              disabled={connecting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
            >
              📘 Kết nối Facebook
            </button>
            <button onClick={openCreate} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm">
              + Thêm Page thủ công
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map(config => {
            const tokenStatus = getTokenStatus(config);
            return (
              <div key={config.id} className="bg-white border rounded-xl p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{config.platform === 'facebook' ? '📘' : '🎵'}</span>
                      <h3 className="font-bold text-gray-800">{config.page_name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tokenStatus.bg} ${tokenStatus.color}`}>
                        {tokenStatus.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                      <span>Platform: <b>{platformLabel(config.platform)}</b></span>
                      {config.page_id && <span>Page ID: <b>{config.page_id}</b></span>}
                      {config.username && <span>Username: <b>{config.username}</b></span>}
                      {config.access_token && <span>Token: <b>••••{config.access_token.slice(-6)}</b></span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {config.platform === 'facebook' && config.access_token && (
                      <button
                        onClick={() => testToken(config)}
                        disabled={testingTokenId === config.id}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg text-sm disabled:opacity-50"
                        title="Test token"
                      >
                        {testingTokenId === config.id ? '⏳' : '🔍'}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(config)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-sm"
                      title="Sửa"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => deleteConfig(config)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                      title="Xóa"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingId ? 'Sửa Page' : 'Thêm Page Mới'}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Platform */}
              <div>
                <label className="block text-sm font-medium mb-1">Platform *</label>
                <div className="flex gap-2">
                  {[
                    { id: 'facebook', label: '📘 Facebook' },
                    { id: 'tiktok', label: '🎵 TikTok' },
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFormPlatform(p.id)}
                      className={`flex-1 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all ${
                        formPlatform === p.id
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Page Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Tên Page *</label>
                <input
                  type="text"
                  value={formPageName}
                  onChange={e => setFormPageName(e.target.value)}
                  placeholder="VD: Hoàng Nam Audio"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Page ID */}
              <div>
                <label className="block text-sm font-medium mb-1">Page ID</label>
                <input
                  type="text"
                  value={formPageId}
                  onChange={e => setFormPageId(e.target.value)}
                  placeholder={formPlatform === 'facebook' ? 'VD: 100064523456789' : 'VD: 7123456789'}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {formPlatform === 'facebook'
                    ? 'Lấy từ Facebook Page → About → Page ID'
                    : 'Lấy từ TikTok Creator Portal'
                  }
                </p>
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={e => setFormUsername(e.target.value)}
                  placeholder={formPlatform === 'facebook' ? 'VD: hoangnamaudio.4' : 'VD: @hoangnamaudio'}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">Dùng để match link video với đúng page</p>
              </div>

              {/* Access Token */}
              <div>
                <label className="block text-sm font-medium mb-1">Access Token</label>
                <textarea
                  value={formAccessToken}
                  onChange={e => setFormAccessToken(e.target.value)}
                  placeholder={formPlatform === 'facebook'
                    ? 'Page Access Token (long-lived) từ Facebook Developer'
                    : 'TikTok API token (nếu có)'
                  }
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-xs font-mono"
                />
                {formPlatform === 'facebook' && (
                  <p className="text-xs text-gray-400 mt-1">
                    Lấy long-lived token từ Facebook Developer → Graph API Explorer → dropdown "Người dùng hoặc Trang" → chọn Page → Generate Access Token
                  </p>
                )}
                {tokenError && (
                  <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700 font-medium whitespace-pre-line">{tokenError}</p>
                  </div>
                )}
              </div>

              {/* Token Expires */}
              <div>
                <label className="block text-sm font-medium mb-1">Token hết hạn</label>
                <input
                  type="datetime-local"
                  value={formTokenExpires}
                  onChange={e => setFormTokenExpires(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">Để trống nếu token không có hạn (long-lived)</p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t flex justify-end gap-3">
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={saveConfig}
                disabled={saving || validatingToken}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                {validatingToken ? 'Đang kiểm tra token...' : saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Thêm Page'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

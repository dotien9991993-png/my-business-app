/**
 * Vercel Serverless Function - Zalo OAuth 2.0 Callback
 * Nhận authorization code từ Zalo, đổi lấy tokens, lưu vào DB
 *
 * Flow: User → Zalo OAuth → redirect về đây với ?code=XXX&oa_id=XXX&state=TENANT_ID
 *
 * Env vars cần thiết trên Vercel:
 *   ZALO_APP_ID, ZALO_SECRET_KEY, ZALO_REDIRECT_URI
 *   VITE_SUPABASE_URL (hoặc SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Chỉ chấp nhận GET (redirect từ Zalo)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, oa_id, state } = req.query;
  const tenantId = state; // tenant_id được truyền qua state param

  const APP_URL = process.env.APP_URL || `https://${req.headers.host}`;

  if (!code || !tenantId) {
    return res.redirect(
      302,
      `${APP_URL}?zalo_error=${encodeURIComponent('Thiếu mã xác thực hoặc tenant')}#settings`,
    );
  }

  // Validate state/tenantId format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    return res.redirect(
      302,
      `${APP_URL}?zalo_error=${encodeURIComponent('Mã tenant không hợp lệ')}#settings`,
    );
  }

  const APP_ID = process.env.ZALO_APP_ID;
  const SECRET_KEY = process.env.ZALO_SECRET_KEY;
  const REDIRECT_URI =
    process.env.ZALO_REDIRECT_URI || `https://${req.headers.host}/api/zalo-callback`;

  if (!APP_ID || !SECRET_KEY) {
    return res.redirect(
      302,
      `${APP_URL}?zalo_error=${encodeURIComponent('Server chưa cấu hình ZALO_APP_ID / ZALO_SECRET_KEY')}#settings`,
    );
  }

  try {
    // === Bước 1: Đổi code → access_token + refresh_token ===
    const tokenResponse = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        secret_key: SECRET_KEY,
      },
      body: new URLSearchParams({
        code,
        app_id: APP_ID,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }).toString(),
    });

    const tokenData = await tokenResponse.json();
    console.log('Zalo OAuth token exchange:', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      error: tokenData.error,
    });

    if (!tokenData.access_token) {
      const errMsg =
        tokenData.error_description ||
        tokenData.error_reason ||
        tokenData.message ||
        'Không lấy được token từ Zalo';
      return res.redirect(
        302,
        `${APP_URL}?zalo_error=${encodeURIComponent(errMsg)}#settings`,
      );
    }

    // === Bước 2: Lưu tokens vào DB ===
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.redirect(
        302,
        `${APP_URL}?zalo_error=${encodeURIComponent('Server chưa cấu hình SUPABASE_SERVICE_ROLE_KEY')}#settings`,
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const payload = {
      tenant_id: tenantId,
      app_id: APP_ID,
      secret_key: SECRET_KEY,
      oa_id: oa_id || '',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      access_token_expires_at: new Date(
        Date.now() + (tokenData.expires_in || 3600) * 1000,
      ).toISOString(),
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Upsert: update nếu đã có, insert nếu chưa
    const { data: existing } = await supabaseAdmin
      .from('zalo_config')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from('zalo_config').update(payload).eq('id', existing.id);
    } else {
      payload.created_at = new Date().toISOString();
      await supabaseAdmin.from('zalo_config').insert([payload]);
    }

    // === Bước 3: Redirect về app với thông báo thành công ===
    return res.redirect(302, `${APP_URL}?zalo_connected=true#settings`);
  } catch (error) {
    console.error('Zalo OAuth callback error:', error);
    return res.redirect(
      302,
      `${APP_URL}?zalo_error=${encodeURIComponent(error.message || 'Lỗi không xác định')}#settings`,
    );
  }
}

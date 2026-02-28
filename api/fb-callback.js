/**
 * Vercel Serverless Function - Facebook OAuth 2.0 Callback
 * Nhận authorization code từ Facebook, đổi lấy long-lived token,
 * lấy tất cả Pages với permanent page token, lưu vào social_page_configs
 *
 * Flow: User → Facebook OAuth → redirect về đây với ?code=XXX&state=TENANT_ID
 *
 * Env vars cần thiết trên Vercel:
 *   FB_APP_ID, FB_APP_SECRET, FB_REDIRECT_URI (optional)
 *   VITE_SUPABASE_URL (hoặc SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Chỉ chấp nhận GET (redirect từ Facebook)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error: fbError, error_description } = req.query;
  const tenantId = state;

  const APP_URL = process.env.APP_URL || `https://${req.headers.host}`;
  const redirectBase = `${APP_URL}`;

  // User denied permission
  if (fbError) {
    const msg = error_description || fbError || 'User từ chối quyền truy cập';
    return res.redirect(
      302,
      `${redirectBase}?fb_error=${encodeURIComponent(msg)}#settings/social`
    );
  }

  // Bước 1: Validate params
  if (!code || !tenantId) {
    return res.redirect(
      302,
      `${redirectBase}?fb_error=${encodeURIComponent('Thiếu mã xác thực hoặc tenant')}#settings/social`
    );
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    return res.redirect(
      302,
      `${redirectBase}?fb_error=${encodeURIComponent('Mã tenant không hợp lệ')}#settings/social`
    );
  }

  const APP_ID = process.env.FB_APP_ID;
  const APP_SECRET = process.env.FB_APP_SECRET;
  const REDIRECT_URI = process.env.FB_REDIRECT_URI || `https://${req.headers.host}/api/fb-callback`;

  if (!APP_ID || !APP_SECRET) {
    return res.redirect(
      302,
      `${redirectBase}?fb_error=${encodeURIComponent('Server chưa cấu hình FB_APP_ID / FB_APP_SECRET')}#settings/social`
    );
  }

  // Helper: safe JSON parse từ Facebook response (có thể trả HTML hoặc body rỗng)
  async function safeFbJson(resp, stepName) {
    const text = await resp.text();
    console.log(`[fb-callback] ${stepName} - status: ${resp.status}, body length: ${text.length}`);
    if (!text) {
      throw new Error(`Facebook trả response rỗng ở ${stepName} (HTTP ${resp.status})`);
    }
    try {
      return JSON.parse(text);
    } catch {
      console.error(`[fb-callback] ${stepName} - không parse được JSON:`, text.substring(0, 500));
      throw new Error(`Facebook trả response không hợp lệ ở ${stepName} (HTTP ${resp.status})`);
    }
  }

  try {
    // === Bước 2: Đổi code → short-lived user token ===
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${encodeURIComponent(code)}`;
    const tokenResp = await fetch(tokenUrl);
    const tokenData = await safeFbJson(tokenResp, 'Step 2 - code exchange');
    console.log('[fb-callback] Step 2 - code exchange:', { hasToken: !!tokenData.access_token, error: tokenData.error });

    if (tokenData.error || !tokenData.access_token) {
      const errMsg = tokenData.error?.message || 'Không lấy được token từ Facebook';
      return res.redirect(
        302,
        `${redirectBase}?fb_error=${encodeURIComponent(errMsg)}#settings/social`
      );
    }

    const shortLivedToken = tokenData.access_token;

    // === Bước 3: Đổi short-lived → long-lived user token (~60 ngày) ===
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;
    const longLivedResp = await fetch(longLivedUrl);
    const longLivedData = await safeFbJson(longLivedResp, 'Step 3 - long-lived token');
    console.log('[fb-callback] Step 3 - long-lived token:', { hasToken: !!longLivedData.access_token, expiresIn: longLivedData.expires_in });

    if (longLivedData.error || !longLivedData.access_token) {
      const errMsg = longLivedData.error?.message || 'Không đổi được long-lived token';
      return res.redirect(
        302,
        `${redirectBase}?fb_error=${encodeURIComponent(errMsg)}#settings/social`
      );
    }

    const longLivedToken = longLivedData.access_token;

    // === Bước 4: Lấy tất cả Pages + permanent page tokens ===
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(longLivedToken)}&fields=id,name,access_token,username,link&limit=100`;
    const pagesResp = await fetch(pagesUrl);
    const pagesData = await safeFbJson(pagesResp, 'Step 4 - pages');
    console.log('[fb-callback] Step 4 - pages:', { count: pagesData.data?.length, error: pagesData.error });

    if (pagesData.error) {
      const errMsg = pagesData.error.message || 'Không lấy được danh sách Pages';
      return res.redirect(
        302,
        `${redirectBase}?fb_error=${encodeURIComponent(errMsg)}#settings/social`
      );
    }

    const pages = pagesData.data || [];
    if (pages.length === 0) {
      return res.redirect(
        302,
        `${redirectBase}?fb_error=${encodeURIComponent('Tài khoản Facebook không quản lý Page nào. Vui lòng kiểm tra quyền.')}#settings/social`
      );
    }

    // === Bước 5: Upsert mỗi page vào social_page_configs ===
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.redirect(
        302,
        `${redirectBase}?fb_error=${encodeURIComponent('Server chưa cấu hình SUPABASE_SERVICE_ROLE_KEY')}#settings/social`
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let upsertCount = 0;
    for (const page of pages) {
      const payload = {
        tenant_id: tenantId,
        platform: 'facebook',
        page_name: page.name,
        page_id: page.id,
        username: page.username || null,
        access_token: page.access_token,
        token_expires_at: null, // Page token từ long-lived user token = vĩnh viễn
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      // Tìm existing config bằng tenant_id + platform + page_id
      const { data: existing } = await supabaseAdmin
        .from('social_page_configs')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('platform', 'facebook')
        .eq('page_id', page.id)
        .maybeSingle();

      if (existing) {
        await supabaseAdmin
          .from('social_page_configs')
          .update(payload)
          .eq('id', existing.id);
      } else {
        payload.created_at = new Date().toISOString();
        await supabaseAdmin.from('social_page_configs').insert([payload]);
      }
      upsertCount++;
    }

    console.log(`[fb-callback] Upserted ${upsertCount} pages for tenant ${tenantId}`);

    // === Redirect về app với thông báo thành công ===
    return res.redirect(
      302,
      `${redirectBase}?fb_connected=true&fb_pages=${upsertCount}#settings/social`
    );
  } catch (error) {
    console.error('Facebook OAuth callback error:', error);
    return res.redirect(
      302,
      `${redirectBase}?fb_error=${encodeURIComponent(error.message || 'Lỗi không xác định')}#settings/social`
    );
  }
}

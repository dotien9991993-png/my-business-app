import { supabase } from '../supabaseClient';

/**
 * Detect platform từ URL
 * @returns 'facebook' | 'tiktok' | null
 */
export function detectPlatform(url) {
  if (!url) return null;
  if (/facebook\.com|fb\.watch|fb\.com/i.test(url)) return 'facebook';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return null;
}

/**
 * Match URL với page config phù hợp
 * So sánh username/page_id trong URL path segments (exact match)
 */
export function matchPageConfig(url, configs) {
  if (!url || !configs?.length) return null;

  const platform = detectPlatform(url);
  if (!platform) return null;

  // Lọc configs cùng platform
  const samePlatformConfigs = configs.filter(c => c.platform === platform);
  if (samePlatformConfigs.length === 0) return null;

  // Nếu chỉ có 1 config cho platform → dùng luôn
  if (samePlatformConfigs.length === 1) return samePlatformConfigs[0];

  // Parse URL lấy path segments để exact match
  let pathSegments = [];
  try {
    const parsed = new URL(url);
    pathSegments = parsed.pathname.split('/').filter(Boolean).map(s => s.toLowerCase());
  } catch {
    pathSegments = url.toLowerCase().split('/').filter(Boolean);
  }

  for (const config of samePlatformConfigs) {
    // Exact match username theo path segment
    if (config.username) {
      const uname = config.username.toLowerCase().replace(/^@/, '');
      if (pathSegments.some(seg => seg === uname)) {
        return config;
      }
    }
    // Match page_id trong URL (page_id thường là số dài, ít risk false positive)
    if (config.page_id && url.includes(config.page_id)) {
      return config;
    }
  }

  // Không match được khi có 2+ pages → trả null để báo lỗi rõ ràng
  return null;
}

/**
 * Load danh sách page configs cho tenant
 */
export async function loadPageConfigs(tenantId) {
  const { data } = await supabase
    .from('social_page_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);
  return data || [];
}

/**
 * Fetch stats TikTok qua oEmbed API (không cần token)
 * oEmbed chỉ trả title + author, KHÔNG có views/likes
 * => Parse từ HTML embed nếu có, hoặc trả thông tin cơ bản
 */
export async function fetchTikTokStats(url) {
  if (!url) throw new Error('Thiếu URL TikTok');

  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const resp = await fetch(oembedUrl);

    if (!resp.ok) {
      throw new Error(`TikTok oEmbed lỗi: ${resp.status}`);
    }

    const data = await resp.json();

    // oEmbed trả về: title, author_name, author_url, thumbnail_url, html
    // Không có views/likes trực tiếp — trả về những gì có
    return {
      stats: {
        views: null,
        likes: null,
        shares: null,
        comments: null,
        updated_at: new Date().toISOString(),
      },
      meta: {
        title: data.title || '',
        author: data.author_name || '',
        author_url: data.author_url || '',
        thumbnail: data.thumbnail_url || '',
      },
      source: 'tiktok_oembed',
      note: 'TikTok oEmbed không cung cấp stats chi tiết. Nhập thủ công hoặc dùng TikTok Business API.',
    };
  } catch (err) {
    throw new Error(`Lỗi gọi TikTok API: ${err.message}`);
  }
}

/**
 * Safe parse JSON từ response — tránh lỗi "Unexpected end of JSON input"
 * khi API không khả dụng (VD: chạy npm run dev thay vì vercel dev)
 */
async function safeParseJSON(resp) {
  const text = await resp.text();
  if (!text) {
    throw new Error('API /api/fb-stats không trả về dữ liệu. Nếu đang chạy local, cần dùng "vercel dev" thay vì "npm run dev"');
  }
  try {
    return JSON.parse(text);
  } catch {
    // Response không phải JSON (VD: HTML 404 page)
    throw new Error(`API trả về dữ liệu không hợp lệ (status ${resp.status}). Nếu đang chạy local, cần dùng "vercel dev"`);
  }
}

/**
 * Detect loại URL Facebook: reel, video, hay post
 */
export function detectFacebookUrlType(url) {
  if (/\/reel\//.test(url)) return 'reel';
  if (/\/share\/r\//.test(url)) return 'reel';   // share reel link
  if (/\/videos\//.test(url) || /\/watch/.test(url)) return 'video';
  if (/\/share\/v\//.test(url)) return 'video';   // share video link
  if (/\/posts\//.test(url) || /\/permalink\.php/.test(url)) return 'post';
  return 'video'; // fallback
}

/**
 * Resolve Facebook URL qua server-side (handle fb.watch, m.facebook, /share/*, etc.)
 * Trả về resolved URL hoặc original nếu đã standard
 */
async function resolveUrl(url) {
  try {
    const resp = await fetch('/api/fb-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve_url', url }),
    });
    const data = await safeParseJSON(resp);
    if (resp.ok && data.resolved_url) {
      return data.resolved_url;
    }
  } catch (err) {
    console.warn('[resolveUrl] Error:', err.message);
  }
  return url; // fallback về URL gốc
}

/**
 * Gọi url_lookup — ultimate fallback dùng Facebook URL Object endpoint
 */
async function fetchUrlLookup(url, pageConfigId, tenantId) {
  const resp = await fetch('/api/fb-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'url_lookup',
      url,
      page_config_id: pageConfigId,
      tenant_id: tenantId,
    }),
  });
  const data = await safeParseJSON(resp);
  if (!resp.ok) {
    throw new Error(data.error || 'URL Lookup thất bại');
  }
  return { stats: data.stats, source: 'facebook_url_lookup' };
}

/**
 * Fetch stats Facebook qua /api/fb-stats proxy — Universal flow
 * 1. Resolve URL server-side (fb.watch, m.facebook, /share/*, etc.)
 * 2. Detect type từ resolved URL
 * 3. Gọi action phù hợp, fallback action khác
 * 4. Ultimate fallback: url_lookup
 */
export async function fetchFacebookStats(url, pageConfigId, tenantId) {
  if (!url || !pageConfigId || !tenantId) {
    throw new Error('Thiếu url, pageConfigId hoặc tenantId');
  }

  // Bước 1: Resolve URL
  const resolvedUrl = await resolveUrl(url);

  // Bước 2: Detect type từ resolved URL
  const urlType = detectFacebookUrlType(resolvedUrl);

  // Bước 3: Gọi action phù hợp
  const callAction = async (action, targetUrl) => {
    const resp = await fetch('/api/fb-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        url: targetUrl,
        page_config_id: pageConfigId,
        tenant_id: tenantId,
      }),
    });
    const data = await safeParseJSON(resp);
    if (!resp.ok) throw new Error(data.error || 'Lỗi gọi Facebook API');
    return data;
  };

  // Post: chỉ gọi get_post_stats, fallback url_lookup
  if (urlType === 'post') {
    try {
      const data = await callAction('get_post_stats', resolvedUrl);
      return { stats: data.stats, source: 'facebook_post' };
    } catch {
      // Fallback url_lookup
      return await fetchUrlLookup(resolvedUrl, pageConfigId, tenantId);
    }
  }

  // Reel/Video: thử primary → fallback → url_lookup
  const primaryAction = urlType === 'reel' ? 'get_reel_stats' : 'get_video_stats';
  const fallbackAction = urlType === 'reel' ? 'get_video_stats' : 'get_reel_stats';

  // Thử primary
  try {
    const data = await callAction(primaryAction, resolvedUrl);
    return {
      stats: data.stats,
      source: primaryAction === 'get_reel_stats' ? 'facebook_insights' : 'facebook_graph',
    };
  } catch {
    // Thử fallback action
  }

  try {
    const data = await callAction(fallbackAction, resolvedUrl);
    return {
      stats: data.stats,
      source: fallbackAction === 'get_reel_stats' ? 'facebook_insights' : 'facebook_graph',
    };
  } catch {
    // Ultimate fallback: url_lookup
  }

  // Bước 4: url_lookup
  return await fetchUrlLookup(resolvedUrl, pageConfigId, tenantId);
}

/**
 * Fetch stats cho 1 link bất kỳ (auto detect platform)
 * @param {string} url - URL video
 * @param {Array} pageConfigs - danh sách social_page_configs
 * @param {string} tenantId
 * @returns {{ stats, source, meta?, note?, error? }}
 */
export async function fetchStatsForLink(url, pageConfigs, tenantId) {
  const platform = detectPlatform(url);

  if (platform === 'tiktok') {
    return await fetchTikTokStats(url);
  }

  if (platform === 'facebook') {
    // Resolve URL trước khi match page config
    const resolvedUrl = await resolveUrl(url);

    // Thử match bằng resolved URL, fallback original URL
    let config = matchPageConfig(resolvedUrl, pageConfigs);
    if (!config && resolvedUrl !== url) {
      config = matchPageConfig(url, pageConfigs);
    }

    if (!config) {
      const fbConfigs = pageConfigs.filter(c => c.platform === 'facebook');
      if (fbConfigs.length === 0) {
        throw new Error('Chưa cấu hình Facebook Page trong Cài đặt → Mạng Xã Hội');
      }
      // Nếu chỉ có 1 FB config → dùng luôn
      if (fbConfigs.length === 1) {
        config = fbConfigs[0];
      } else {
        throw new Error('Không xác định được page cho link này. Vui lòng kiểm tra lại Username trong Cài đặt → Mạng Xã Hội');
      }
    }

    // Truyền resolvedUrl cho fetchFacebookStats (bên trong sẽ skip resolve lại nếu đã standard)
    return await fetchFacebookStats(resolvedUrl, config.id, tenantId);
  }

  throw new Error(`Platform không hỗ trợ stats: ${platform || 'unknown'}`);
}

/**
 * Lưu stats vào post_links của task
 * Update field stats trong object link tương ứng
 */
export async function saveStatsToTask(taskId, linkIndex, stats, postLinks) {
  const updated = [...postLinks];
  const link = { ...updated[linkIndex] };

  // Lưu history (max 30 entries)
  const history = [...(link.stats_history || [])];
  if (link.stats && link.stats.updated_at) {
    history.push({ ...link.stats });
    if (history.length > 30) history.splice(0, history.length - 30);
  }

  link.stats = stats;
  link.stats_history = history;
  updated[linkIndex] = link;

  const { error } = await supabase
    .from('tasks')
    .update({ post_links: updated })
    .eq('id', taskId);

  if (error) throw error;
  return updated;
}

/**
 * Validate Facebook URL — chấp nhận TẤT CẢ dạng link Facebook
 * Server sẽ resolve URL không standard (fb.watch, m.facebook, /share/, etc.)
 */
export function validateFacebookUrl(url) {
  if (!url) return false;
  return /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.com|m\.facebook\.com)\//i.test(url);
}

/**
 * Validate TikTok URL — chỉ chấp nhận link đầy đủ
 * OK: tiktok.com/@username/video/{id}
 * REJECT: vt.tiktok.com/..., vm.tiktok.com/...
 */
export function validateTikTokUrl(url) {
  if (!url) return false;
  return /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/.test(url);
}

/**
 * Validate link theo platform
 * @returns true nếu URL hợp lệ cho platform đó
 */
export function validateLinkForPlatform(url, platform) {
  if (platform === 'Facebook') return validateFacebookUrl(url);
  if (platform === 'TikTok') return validateTikTokUrl(url);
  return true;
}

/**
 * Trả về error message cụ thể nếu URL sai, null nếu hợp lệ
 */
export function getValidationErrorMessage(url, platform) {
  if (!url) return null;

  if (platform === 'Facebook') {
    if (validateFacebookUrl(url)) return null;
    return 'Link Facebook không hợp lệ. Cần link từ facebook.com, fb.watch, hoặc m.facebook.com.';
  }

  if (platform === 'TikTok') {
    if (validateTikTokUrl(url)) return null;
    if (/(vt|vm)\.tiktok\.com/i.test(url)) {
      return 'Vui lòng dán link đầy đủ (không dùng vt.tiktok hoặc vm.tiktok). Mở video trên TikTok → copy URL từ thanh địa chỉ trình duyệt.';
    }
    return 'Link TikTok không đúng định dạng. Cần dạng: tiktok.com/@username/video/...';
  }

  return null;
}

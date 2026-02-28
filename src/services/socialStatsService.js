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
 * Clean Facebook URL — bỏ tracking params (__cft__, __tn__, fbclid, mibextid...)
 */
function cleanFacebookUrl(url) {
  try {
    const u = new URL(url);
    const keysToRemove = [];
    for (const key of u.searchParams.keys()) {
      if (/^(__cft__|__tn__|fbclid|mibextid|__eep__)/.test(key) || key === 'ref' || key === 'locale') {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Extract Facebook ID và type từ URL (client-side, không cần server call)
 * @returns {{ id: string|null, type: 'reel'|'video'|'post'|null }}
 */
function extractFacebookId(url) {
  if (!url) return { id: null, type: null };
  try {
    // /reel/ID — reel ID chính là video ID
    let match = url.match(/facebook\.com\/reel\/(\d+)/);
    if (match) return { id: match[1], type: 'reel' };

    // /videos/ID
    match = url.match(/facebook\.com\/[^/]+\/videos\/(\d+)/);
    if (match) return { id: match[1], type: 'video' };

    // /watch/?v=ID
    match = url.match(/facebook\.com\/watch\/?\?v=(\d+)/);
    if (match) return { id: match[1], type: 'video' };

    // /permalink.php?story_fbid=ID&id=PAGE_ID → composite post ID
    const storyMatch = url.match(/story_fbid=(\d+)/);
    if (storyMatch) {
      const pageIdMatch = url.match(/[?&]id=(\d+)/);
      if (pageIdMatch) return { id: `${pageIdMatch[1]}_${storyMatch[1]}`, type: 'post' };
      return { id: storyMatch[1], type: 'post' };
    }

    // /posts/ID
    match = url.match(/facebook\.com\/[^/]+\/posts\/([\w.]+)/);
    if (match) return { id: match[1], type: 'post' };

    // Fallback: tìm chuỗi số dài (>= 10 digits)
    match = url.match(/\/(\d{10,})/);
    if (match) return { id: match[1], type: 'video' };

    return { id: null, type: null };
  } catch {
    return { id: null, type: null };
  }
}

/**
 * Resolve Facebook URL qua server-side (handle fb.watch, m.facebook, /share/*, etc.)
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
  return url;
}

/**
 * Gọi /api/fb-stats — trả về data hoặc null (không throw)
 */
async function callFbStats(action, url, pageConfigId, tenantId) {
  try {
    const resp = await fetch('/api/fb-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        url,
        page_config_id: pageConfigId,
        tenant_id: tenantId,
      }),
    });
    const data = await safeParseJSON(resp);
    console.log(`[callFbStats] action=${action} resp.ok=${resp.ok} stats.views=${data?.stats?.views} stats=`, JSON.stringify(data?.stats));
    if (!resp.ok || !data.stats) return null;
    return data;
  } catch (err) {
    console.log(`[callFbStats] action=${action} ERROR:`, err.message);
    return null;
  }
}

/**
 * Phương pháp 1 & 4: Thử lấy stats bằng ID trực tiếp
 * Construct synthetic URL từ ID, thử với từng token (config) cho đến khi thành công
 * Reel thử get_reel_stats (có video_insights) trước, fallback get_video_stats
 */
async function tryGetStatsById(id, type, allConfigs, tenantId) {
  // Construct synthetic URL để server parse ID
  const syntheticUrl = type === 'reel'
    ? `https://www.facebook.com/reel/${id}`
    : type === 'post'
      ? `https://www.facebook.com/x/posts/${id}`
      : `https://www.facebook.com/x/videos/${id}`;

  // Actions theo thứ tự ưu tiên
  const actions = type === 'post'
    ? ['get_post_stats']
    : type === 'reel'
      ? ['get_reel_stats', 'get_video_stats']
      : ['get_video_stats', 'get_reel_stats'];

  // Thử từng action, mỗi action thử tất cả configs
  for (const action of actions) {
    for (const config of allConfigs) {
      const data = await callFbStats(action, syntheticUrl, config.id, tenantId);
      if (data) {
        const source = action === 'get_reel_stats' ? 'facebook_insights'
          : action === 'get_post_stats' ? 'facebook_post'
          : 'facebook_graph';
        return { stats: data.stats, source };
      }
    }
  }
  return null;
}

/**
 * Phương pháp 3: Query page posts/videos rồi match URL
 */
async function matchFromPagePosts(url, config, tenantId) {
  try {
    const resp = await fetch('/api/fb-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get_page_posts_match',
        url,
        page_config_id: config.id,
        tenant_id: tenantId,
      }),
    });
    const data = await safeParseJSON(resp);
    if (resp.ok && data.stats) {
      return { stats: data.stats, source: 'facebook_page_match' };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Fetch stats Facebook — Universal flow với 4 phương pháp fallback:
 * 1. Extract ID trực tiếp → gọi Graph API với tất cả tokens
 * 2. Resolve redirect (fb.watch, /share/*, m.facebook) → extract ID → retry
 * 3. Query page posts/videos → match URL
 * 4. (Built into get_reel_stats) Video Insights endpoint
 */
export async function fetchFacebookStats(url, allFbConfigs, tenantId) {
  if (!url || !allFbConfigs?.length || !tenantId) {
    throw new Error('Thiếu url, page configs hoặc tenantId');
  }

  // Bước 0: Clean URL — bỏ tracking params
  const cleanUrl = cleanFacebookUrl(url);
  console.log('[fetchFacebookStats] cleanUrl:', cleanUrl);

  // Bước 1: Thử extract ID trực tiếp từ URL
  const extracted = extractFacebookId(cleanUrl);
  console.log('[fetchFacebookStats] extracted:', JSON.stringify(extracted));
  if (extracted.id) {
    const result = await tryGetStatsById(extracted.id, extracted.type, allFbConfigs, tenantId);
    console.log('[fetchFacebookStats] Bước 1 result:', result ? `views=${result.stats?.views} source=${result.source}` : 'NULL');
    if (result) return result;
  }

  // Bước 2: Resolve URL (cho fb.watch, /share/v/, /share/r/, m.facebook...)
  const resolvedUrl = await resolveUrl(cleanUrl);
  console.log('[fetchFacebookStats] Bước 2 resolvedUrl:', resolvedUrl);
  if (resolvedUrl !== cleanUrl) {
    const extracted2 = extractFacebookId(resolvedUrl);
    console.log('[fetchFacebookStats] extracted2:', JSON.stringify(extracted2));
    if (extracted2.id) {
      const result = await tryGetStatsById(extracted2.id, extracted2.type, allFbConfigs, tenantId);
      console.log('[fetchFacebookStats] Bước 2 result:', result ? `views=${result.stats?.views}` : 'NULL');
      if (result) return result;
    }
  }

  // Bước 3: Query page posts/videos rồi match
  console.log('[fetchFacebookStats] Bước 3: matchFromPagePosts...');
  for (const config of allFbConfigs) {
    const result = await matchFromPagePosts(cleanUrl, config, tenantId);
    console.log('[fetchFacebookStats] Bước 3 result:', result ? `views=${result.stats?.views}` : 'NULL');
    if (result) return result;
  }

  // Bước 4: Tất cả fail
  throw new Error('Không thể lấy stats cho link này. Vui lòng nhập stats thủ công.');
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
    const fbConfigs = (pageConfigs || []).filter(c => c.platform === 'facebook');
    if (fbConfigs.length === 0) {
      throw new Error('Chưa cấu hình Facebook Page trong Cài đặt → Mạng Xã Hội');
    }
    return await fetchFacebookStats(url, fbConfigs, tenantId);
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

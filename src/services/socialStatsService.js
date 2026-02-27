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
 * So sánh username/page_id trong URL với bảng social_page_configs
 */
export function matchPageConfig(url, configs) {
  if (!url || !configs?.length) return null;

  for (const config of configs) {
    // Match username trong URL (VD: facebook.com/hoangnamaudio.4/...)
    if (config.username && url.toLowerCase().includes(config.username.toLowerCase())) {
      return config;
    }
    // Match page_id trong URL
    if (config.page_id && url.includes(config.page_id)) {
      return config;
    }
  }

  // Fallback: trả về config đầu tiên cùng platform
  const platform = detectPlatform(url);
  if (platform) {
    return configs.find(c => c.platform === platform) || null;
  }

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
 * Fetch stats Facebook qua /api/fb-stats proxy
 */
export async function fetchFacebookStats(url, pageConfigId, tenantId) {
  if (!url || !pageConfigId || !tenantId) {
    throw new Error('Thiếu url, pageConfigId hoặc tenantId');
  }

  // Thử reel insights trước
  const reelResp = await fetch('/api/fb-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'get_reel_stats',
      url,
      page_config_id: pageConfigId,
      tenant_id: tenantId,
    }),
  });

  const reelData = await reelResp.json();

  if (reelResp.ok && reelData.stats) {
    return { stats: reelData.stats, source: 'facebook_insights' };
  }

  // Fallback: lấy stats thường
  const videoResp = await fetch('/api/fb-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'get_video_stats',
      url,
      page_config_id: pageConfigId,
      tenant_id: tenantId,
    }),
  });

  const videoData = await videoResp.json();

  if (!videoResp.ok) {
    throw new Error(videoData.error || 'Lỗi gọi Facebook API');
  }

  return { stats: videoData.stats, source: 'facebook_graph' };
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
    const config = matchPageConfig(url, pageConfigs);
    if (!config) {
      throw new Error('Chưa cấu hình Facebook Page trong Cài đặt → Mạng Xã Hội');
    }
    return await fetchFacebookStats(url, config.id, tenantId);
  }

  throw new Error(`Platform không hỗ trợ stats: ${platform || 'unknown'}`);
}

/**
 * Lưu stats vào post_links của task
 * Update field stats trong object link tương ứng
 */
export async function saveStatsToTask(taskId, linkIndex, stats, postLinks) {
  const updated = [...postLinks];
  updated[linkIndex] = {
    ...updated[linkIndex],
    stats,
  };

  const { error } = await supabase
    .from('tasks')
    .update({ post_links: updated })
    .eq('id', taskId);

  if (error) throw error;
  return updated;
}

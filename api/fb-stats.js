/**
 * Vercel Serverless Function - Facebook Graph API Proxy
 * Lấy stats video (views, likes, shares, comments) mà không lộ access token
 */

import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGINS = [
  'https://in.hoangnamaudio.vn',
  'https://hoangnamaudio.vn',
  'http://localhost:5173'
];

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

function getCorsOrigin(req) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)
    || /^https:\/\/[a-z0-9-]+\.hoangnamaudio\.vn$/.test(origin)
    || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

/**
 * Parse Facebook URL để lấy video/reel ID
 * Hỗ trợ:
 *   https://www.facebook.com/reel/123456
 *   https://www.facebook.com/username/videos/123456
 *   https://www.facebook.com/watch/?v=123456
 *   https://fb.watch/abc123
 */
function parseFacebookVideoId(url) {
  if (!url) return null;
  try {
    // /reel/ID
    let match = url.match(/facebook\.com\/reel\/(\d+)/);
    if (match) return match[1];

    // /videos/ID
    match = url.match(/facebook\.com\/[^/]+\/videos\/(\d+)/);
    if (match) return match[1];

    // /watch/?v=ID
    match = url.match(/facebook\.com\/watch\/?\?v=(\d+)/);
    if (match) return match[1];

    // /posts/ID
    match = url.match(/facebook\.com\/[^/]+\/posts\/([\w.]+)/);
    if (match) return match[1];

    // /permalink.php?story_fbid=ID&id=PAGE_ID → composite ID cho Graph API
    const storyMatch = url.match(/story_fbid=(\d+)/);
    if (storyMatch) {
      const pageIdMatch = url.match(/[?&]id=(\d+)/);
      if (pageIdMatch) return `${pageIdMatch[1]}_${storyMatch[1]}`;
      return storyMatch[1];
    }

    // fb.watch/ID — redirect, cần video ID từ user
    // Fallback: tìm chuỗi số dài trong URL
    match = url.match(/\/(\d{10,})/);
    if (match) return match[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Detect URL đã ở dạng standard (có thể parse ID trực tiếp) hay chưa
 * Standard = facebook.com với path rõ ràng chứa ID
 */
function isStandardFacebookUrl(url) {
  return /facebook\.com\/(reel\/\d|[\w.-]+\/videos\/\d|watch\/?\?.*v=\d|[\w.-]+\/posts\/[\w.]|permalink\.php)/.test(url);
}

/**
 * Universal Facebook URL resolver
 * Resolve MỌI dạng URL Facebook (fb.watch, m.facebook, /share/v/, /share/r/, bất kỳ)
 * → URL thật ở dạng standard chứa video/reel/post ID
 * Follow redirect server-side với UA facebookexternalhit
 */
async function resolveFacebookUrl(inputUrl) {
  try {
    const resp = await fetch(inputUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'facebookexternalhit/1.1' },
    });

    // resp.url = URL cuối cùng sau khi follow redirects
    const finalUrl = resp.url;
    if (finalUrl && finalUrl !== inputUrl && /facebook\.com/.test(finalUrl)) {
      console.log(`[resolveFacebookUrl] Resolved: ${inputUrl} → ${finalUrl}`);
      return finalUrl;
    }

    // Fallback: parse HTML tìm og:url hoặc canonical
    const html = await resp.text();
    let match = html.match(/property="og:url"\s+content="([^"]+)"/);
    if (!match) match = html.match(/content="([^"]+)"\s+property="og:url"/);
    if (!match) match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
    if (match) {
      console.log(`[resolveFacebookUrl] From meta tag: ${inputUrl} → ${match[1]}`);
      return match[1];
    }

    console.log(`[resolveFacebookUrl] Could not resolve: ${inputUrl}, using original`);
    return inputUrl;
  } catch (err) {
    console.log(`[resolveFacebookUrl] Error: ${err.message}, using original`);
    return inputUrl;
  }
}

export default async function handler(req, res) {
  const corsOrigin = getCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' });
  }

  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { action, ...params } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }

  // Pre-process: resolve MỌI URL Facebook không phải dạng standard
  if (params.url && !isStandardFacebookUrl(params.url)) {
    params.url = await resolveFacebookUrl(params.url);
  }

  try {
    // === Tạo OAuth URL để kết nối Facebook Pages ===
    if (action === 'get_oauth_url') {
      const APP_ID = process.env.FB_APP_ID;
      const REDIRECT_URI = process.env.FB_REDIRECT_URI || `https://${req.headers.host}/api/fb-callback`;

      if (!APP_ID) {
        return res.status(500).json({ error: 'Server chưa cấu hình FB_APP_ID' });
      }

      const state = params.state || '';
      const scopes = 'pages_show_list,pages_read_engagement,pages_read_user_content,read_insights';
      const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}&response_type=code`;

      return res.status(200).json({ url });
    }

    // === Resolve URL Facebook (không cần token) ===
    if (action === 'resolve_url') {
      const { url } = params;
      if (!url) return res.status(400).json({ error: 'Thiếu url' });

      const resolvedUrl = isStandardFacebookUrl(url) ? url : await resolveFacebookUrl(url);
      return res.status(200).json({ resolved_url: resolvedUrl, original_url: url });
    }

    // === Lấy stats Facebook — UNIFIED (nhận video_id trực tiếp, không parse URL) ===
    if (action === 'get_fb_stats') {
      const { video_id, page_config_id, tenant_id } = params;

      if (!video_id || !page_config_id || !tenant_id) {
        return res.status(400).json({ error: 'Thiếu video_id, page_config_id hoặc tenant_id' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Server chưa cấu hình Supabase' });
      }
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: config } = await supabase
        .from('social_page_configs')
        .select('access_token, page_id, token_expires_at')
        .eq('id', page_config_id)
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .single();

      if (!config?.access_token) {
        return res.status(404).json({ error: 'Không tìm thấy token cho page_config_id: ' + page_config_id });
      }

      if (config.token_expires_at && new Date(config.token_expires_at) < new Date()) {
        return res.status(401).json({ error: 'Token hết hạn' });
      }

      // Gọi CHÍNH XÁC endpoint đã test thành công
      const fields = 'id,views,title,description,likes.summary(true),comments.summary(true)';
      const graphUrl = `https://graph.facebook.com/v21.0/${video_id}?fields=${fields}&access_token=${config.access_token}`;
      console.log(`[get_fb_stats] Calling: GET /v21.0/${video_id}?fields=${fields}`);

      const fbResp = await fetch(graphUrl);
      const fbData = await fbResp.json();
      console.log('[get_fb_stats] Facebook response:', JSON.stringify(fbData));

      if (fbData.error) {
        return res.status(400).json({
          error: `Facebook API error (code ${fbData.error.code}): ${fbData.error.message}`,
          fb_error: fbData.error,
        });
      }

      const stats = {
        views: fbData.views ?? null,
        likes: fbData.likes?.summary?.total_count || 0,
        comments: fbData.comments?.summary?.total_count || 0,
        shares: 0,
        title: fbData.title || fbData.description || '',
        updated_at: new Date().toISOString(),
      };

      console.log('[get_fb_stats] Returning stats:', JSON.stringify(stats));
      return res.status(200).json({ stats, raw: fbData });
    }

    // === Lấy stats video Facebook (legacy — dùng URL) ===
    if (action === 'get_video_stats') {
      const { url, page_config_id, tenant_id } = params;

      if (!url || !page_config_id || !tenant_id) {
        return res.status(400).json({ error: 'Thiếu url, page_config_id hoặc tenant_id' });
      }

      // Lấy access_token từ DB
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Server chưa cấu hình Supabase' });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: config, error: configError } = await supabase
        .from('social_page_configs')
        .select('access_token, page_id, token_expires_at')
        .eq('id', page_config_id)
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .single();

      if (configError || !config) {
        return res.status(404).json({ error: 'Không tìm thấy cấu hình page' });
      }

      if (!config.access_token) {
        return res.status(400).json({ error: 'Page chưa có access token' });
      }

      // Kiểm tra token hết hạn
      if (config.token_expires_at && new Date(config.token_expires_at) < new Date()) {
        return res.status(401).json({ error: 'Access token đã hết hạn. Vui lòng cập nhật trong Cài đặt.' });
      }

      const videoId = parseFacebookVideoId(url);
      if (!videoId) {
        return res.status(400).json({ error: 'Không parse được video ID từ URL' });
      }

      // Gọi Facebook Graph API — thử với views trước (video thường)
      const fields = 'id,title,views,likes.summary(true),comments.summary(true)';
      const graphUrl = `https://graph.facebook.com/v21.0/${videoId}?fields=${fields}&access_token=${config.access_token}`;

      const fbResponse = await fetch(graphUrl);
      const fbData = await fbResponse.json();
      console.log('[get_video_stats] Graph API response:', JSON.stringify(fbData));

      if (fbData.error) {
        const code = fbData.error.code;
        let userMessage;
        if (code === 200) {
          userMessage = 'Token sai loại hoặc thiếu quyền';
        } else if (code === 190) {
          userMessage = 'Token đã hết hạn';
        } else if (code === 100) {
          userMessage = 'Không tìm thấy video hoặc video ID không hợp lệ';
        } else {
          userMessage = `Facebook API: ${fbData.error.message}`;
        }
        return res.status(400).json({ error: userMessage, fb_error_code: code, fb_error: fbData.error });
      }

      const stats = {
        views: fbData.views || 0,
        likes: fbData.likes?.summary?.total_count || 0,
        comments: fbData.comments?.summary?.total_count || 0,
        shares: 0,
        title: fbData.title || '',
        updated_at: new Date().toISOString(),
      };

      return res.status(200).json({ stats, raw: fbData });
    }

    // === Lấy stats Reel (2 bước: basic engagement + insights views) ===
    if (action === 'get_reel_stats') {
      const { url, page_config_id, tenant_id } = params;

      if (!url || !page_config_id || !tenant_id) {
        return res.status(400).json({ error: 'Thiếu url, page_config_id hoặc tenant_id' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: config } = await supabase
        .from('social_page_configs')
        .select('access_token, page_id')
        .eq('id', page_config_id)
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .single();

      if (!config?.access_token) {
        return res.status(404).json({ error: 'Không tìm thấy token' });
      }

      const videoId = parseFacebookVideoId(url);
      if (!videoId) {
        return res.status(400).json({ error: 'Không parse được video ID từ URL' });
      }

      // BƯỚC 1: Lấy basic engagement + views field (likes, comments, views)
      const basicFields = 'id,title,views,likes.summary(true),comments.summary(true)';
      const basicUrl = `https://graph.facebook.com/v21.0/${videoId}?fields=${basicFields}&access_token=${config.access_token}`;
      const basicResp = await fetch(basicUrl);
      const basicData = await basicResp.json();
      console.log('[get_reel_stats] BƯỚC 1 - basic engagement:', JSON.stringify(basicData));

      if (basicData.error) {
        const code = basicData.error.code;
        let userMessage;
        if (code === 200) {
          userMessage = 'Token sai loại hoặc thiếu quyền. Vui lòng vào Cài đặt → Mạng Xã Hội → cập nhật lại Page Access Token';
        } else if (code === 190) {
          userMessage = 'Token đã hết hạn. Vui lòng vào Cài đặt → Mạng Xã Hội → lấy token mới';
        } else if (code === 100) {
          userMessage = 'Không tìm thấy video hoặc video ID không hợp lệ';
        } else {
          userMessage = `Facebook API: ${basicData.error.message}`;
        }
        return res.status(400).json({
          error: userMessage,
          fb_error_code: code,
          fb_error: basicData.error
        });
      }

      const likes = basicData.likes?.summary?.total_count || 0;
      const comments = basicData.comments?.summary?.total_count || 0;
      const shares = 0;
      const title = basicData.title || '';

      // BƯỚC 2: Lấy views — dùng field views trước, fallback qua insights
      let views = basicData.views || 0;
      let insightsRaw = null;
      // Chỉ gọi insights nếu views chưa có từ basic fields
      // Reels dùng metric: blue_reels_play_count / fb_reels_total_plays (KHÔNG phải total_video_views)
      if (!views) {
        try {
          const insightsUrl = `https://graph.facebook.com/v21.0/${videoId}/video_insights?metric=blue_reels_play_count,fb_reels_total_plays&access_token=${config.access_token}`;
          const insightsResp = await fetch(insightsUrl);
          const insightsData = await insightsResp.json();
          console.log('[get_reel_stats] BƯỚC 2 - insights:', JSON.stringify(insightsData));
          insightsRaw = insightsData;

          if (!insightsData.error && insightsData.data) {
            for (const m of insightsData.data) {
              if (['blue_reels_play_count', 'fb_reels_total_plays'].includes(m.name)) {
                const val = m.values?.[0]?.value || 0;
                if (val > views) views = val;
              }
            }
          }
        } catch (insErr) {
          console.log('[get_reel_stats] Insights lỗi (bỏ qua):', insErr.message);
        }
      }

      // BƯỚC 3: Gộp kết quả
      const stats = {
        views,
        likes,
        comments,
        shares,
        title,
        updated_at: new Date().toISOString(),
      };

      return res.status(200).json({
        stats,
        raw: { basic: basicData, insights: insightsRaw },
      });
    }

    // === Lấy stats Post Facebook (dạng /posts/, /permalink.php, /share/) ===
    if (action === 'get_post_stats') {
      const { url, page_config_id, tenant_id } = params;

      if (!url || !page_config_id || !tenant_id) {
        return res.status(400).json({ error: 'Thiếu url, page_config_id hoặc tenant_id' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Server chưa cấu hình Supabase' });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: config, error: configError } = await supabase
        .from('social_page_configs')
        .select('access_token, page_id, token_expires_at')
        .eq('id', page_config_id)
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .single();

      if (configError || !config) {
        return res.status(404).json({ error: 'Không tìm thấy cấu hình page' });
      }

      if (!config.access_token) {
        return res.status(400).json({ error: 'Page chưa có access token' });
      }

      if (config.token_expires_at && new Date(config.token_expires_at) < new Date()) {
        return res.status(401).json({ error: 'Access token đã hết hạn. Vui lòng cập nhật trong Cài đặt.' });
      }

      const postId = parseFacebookVideoId(url);
      if (!postId) {
        return res.status(400).json({ error: 'Không parse được post ID từ URL' });
      }

      const fields = 'id,message,reactions.summary(true),comments.summary(true)';
      const graphUrl = `https://graph.facebook.com/v21.0/${postId}?fields=${fields}&access_token=${config.access_token}`;

      const fbResponse = await fetch(graphUrl);
      const fbData = await fbResponse.json();
      console.log('[get_post_stats] Graph API response:', JSON.stringify(fbData));

      if (fbData.error) {
        const code = fbData.error.code;
        let userMessage;
        if (code === 200) {
          userMessage = 'Token sai loại hoặc thiếu quyền. Vui lòng vào Cài đặt → Mạng Xã Hội → cập nhật lại Page Access Token';
        } else if (code === 190) {
          userMessage = 'Token đã hết hạn. Vui lòng vào Cài đặt → Mạng Xã Hội → lấy token mới';
        } else if (code === 100) {
          userMessage = 'Không tìm thấy post hoặc post ID không hợp lệ. Thử nhập stats tay.';
        } else {
          userMessage = `Facebook API: ${fbData.error.message}`;
        }
        return res.status(400).json({
          error: userMessage,
          fb_error_code: code,
          fb_error: fbData.error
        });
      }

      const stats = {
        views: null,
        likes: fbData.reactions?.summary?.total_count || 0,
        comments: fbData.comments?.summary?.total_count || 0,
        shares: 0,
        title: fbData.message ? fbData.message.substring(0, 100) : '',
        updated_at: new Date().toISOString(),
      };

      return res.status(200).json({ stats, raw: fbData });
    }

    // === Query Page posts/videos rồi match URL ===
    if (action === 'get_page_posts_match') {
      const { url, page_config_id, tenant_id } = params;

      if (!url || !page_config_id || !tenant_id) {
        return res.status(400).json({ error: 'Thiếu url, page_config_id hoặc tenant_id' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Server chưa cấu hình Supabase' });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: config } = await supabase
        .from('social_page_configs')
        .select('access_token, page_id, token_expires_at')
        .eq('id', page_config_id)
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .single();

      if (!config?.access_token || !config.page_id) {
        return res.status(404).json({ error: 'Không tìm thấy cấu hình page hoặc thiếu page_id' });
      }

      if (config.token_expires_at && new Date(config.token_expires_at) < new Date()) {
        return res.status(401).json({ error: 'Access token đã hết hạn' });
      }

      // Extract numeric ID từ input URL để match
      const inputId = parseFacebookVideoId(url);
      console.log(`[get_page_posts_match] Input URL: ${url}, extracted ID: ${inputId}`);

      // Helper: normalize stats từ video object
      const videoToStats = (video) => ({
        views: video.views || 0,
        likes: video.likes?.summary?.total_count || 0,
        comments: video.comments?.summary?.total_count || 0,
        shares: 0,
        title: video.title || '',
        updated_at: new Date().toISOString(),
      });

      // Helper: normalize stats từ post object
      const postToStats = (post) => ({
        views: null,
        likes: post.reactions?.summary?.total_count || 0,
        comments: post.comments?.summary?.total_count || 0,
        shares: 0,
        title: post.message ? post.message.substring(0, 100) : '',
        updated_at: new Date().toISOString(),
      });

      // Helper: check if 2 IDs match (xử lý composite ID dạng page_id_post_id)
      const idsMatch = (id1, id2) => {
        if (!id1 || !id2) return false;
        if (id1 === id2) return true;
        // Tách composite ID: "123_456" → "456"
        const strip = (id) => id.includes('_') ? id.split('_').pop() : id;
        return strip(id1) === strip(id2);
      };

      // 1. Thử query videos của page
      try {
        const videosGraphUrl = `https://graph.facebook.com/v21.0/${config.page_id}/videos?fields=permalink_url,id,title,views,likes.summary(true),comments.summary(true)&limit=100&access_token=${config.access_token}`;
        const videosResp = await fetch(videosGraphUrl);
        const videosData = await videosResp.json();

        if (!videosData.error && videosData.data) {
          for (const video of videosData.data) {
            if (inputId && idsMatch(inputId, video.id)) {
              console.log(`[get_page_posts_match] Matched video by ID: ${video.id}`);
              return res.status(200).json({ stats: videoToStats(video), raw: video, matched_by: 'video_id' });
            }
            if (video.permalink_url && inputId) {
              const permalinkId = parseFacebookVideoId(video.permalink_url);
              if (permalinkId && idsMatch(inputId, permalinkId)) {
                console.log(`[get_page_posts_match] Matched video by permalink: ${video.permalink_url}`);
                return res.status(200).json({ stats: videoToStats(video), raw: video, matched_by: 'permalink' });
              }
            }
          }
        }
      } catch (err) {
        console.log('[get_page_posts_match] Videos query error:', err.message);
      }

      // 2. Thử query published_posts của page
      try {
        const postsGraphUrl = `https://graph.facebook.com/v21.0/${config.page_id}/published_posts?fields=permalink_url,id,message,reactions.summary(true),comments.summary(true)&limit=100&access_token=${config.access_token}`;
        const postsResp = await fetch(postsGraphUrl);
        const postsData = await postsResp.json();

        if (!postsData.error && postsData.data) {
          for (const post of postsData.data) {
            if (inputId && idsMatch(inputId, post.id)) {
              console.log(`[get_page_posts_match] Matched post by ID: ${post.id}`);
              return res.status(200).json({ stats: postToStats(post), raw: post, matched_by: 'post_id' });
            }
            if (post.permalink_url && inputId) {
              const permalinkId = parseFacebookVideoId(post.permalink_url);
              if (permalinkId && idsMatch(inputId, permalinkId)) {
                console.log(`[get_page_posts_match] Matched post by permalink: ${post.permalink_url}`);
                return res.status(200).json({ stats: postToStats(post), raw: post, matched_by: 'permalink' });
              }
            }
          }
        }
      } catch (err) {
        console.log('[get_page_posts_match] Posts query error:', err.message);
      }

      return res.status(404).json({ error: 'Không tìm thấy post/video match trong page' });
    }

    // === URL Lookup — fallback dùng Facebook URL Object endpoint ===
    if (action === 'url_lookup') {
      const { url, page_config_id, tenant_id } = params;

      if (!url || !page_config_id || !tenant_id) {
        return res.status(400).json({ error: 'Thiếu url, page_config_id hoặc tenant_id' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Server chưa cấu hình Supabase' });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: config, error: configError } = await supabase
        .from('social_page_configs')
        .select('access_token, page_id, token_expires_at')
        .eq('id', page_config_id)
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .single();

      if (configError || !config) {
        return res.status(404).json({ error: 'Không tìm thấy cấu hình page' });
      }

      if (!config.access_token) {
        return res.status(400).json({ error: 'Page chưa có access token' });
      }

      if (config.token_expires_at && new Date(config.token_expires_at) < new Date()) {
        return res.status(401).json({ error: 'Access token đã hết hạn. Vui lòng cập nhật trong Cài đặt.' });
      }

      // Gọi Facebook URL Object endpoint
      const lookupUrl = `https://graph.facebook.com/v21.0/?id=${encodeURIComponent(url)}&fields=og_object{id,type,engagement}&access_token=${config.access_token}`;
      const lookupResp = await fetch(lookupUrl);
      const lookupData = await lookupResp.json();
      console.log('[url_lookup] Response:', JSON.stringify(lookupData));

      if (lookupData.error) {
        return res.status(400).json({
          error: `Facebook URL Lookup: ${lookupData.error.message}`,
          fb_error_code: lookupData.error.code,
          fb_error: lookupData.error
        });
      }

      const ogObject = lookupData.og_object || {};
      const engagement = ogObject.engagement || {};

      const stats = {
        views: null,
        likes: engagement.count || 0,
        comments: null,
        shares: null,
        title: '',
        updated_at: new Date().toISOString(),
      };

      // Nếu có og_id, thử lấy thêm chi tiết
      if (ogObject.id) {
        try {
          const detailUrl = `https://graph.facebook.com/v21.0/${ogObject.id}?fields=engagement,title,description&access_token=${config.access_token}`;
          const detailResp = await fetch(detailUrl);
          const detailData = await detailResp.json();
          console.log('[url_lookup] Detail response:', JSON.stringify(detailData));

          if (!detailData.error) {
            if (detailData.engagement) {
              stats.likes = detailData.engagement.reaction_count || stats.likes;
              stats.comments = detailData.engagement.comment_count || null;
              stats.shares = detailData.engagement.share_count || null;
            }
            stats.title = detailData.title || detailData.description || '';
          }
        } catch (detailErr) {
          console.log('[url_lookup] Detail error (bỏ qua):', detailErr.message);
        }
      }

      return res.status(200).json({
        stats,
        raw: lookupData,
        source: 'url_lookup',
        og_type: ogObject.type || null,
      });
    }

    // === Debug Views — Test TẤT CẢ cách lấy views ===
    if (action === 'debug_views') {
      const { video_id, page_config_id, tenant_id } = params;

      if (!video_id || !page_config_id || !tenant_id) {
        return res.status(400).json({ error: 'Thiếu video_id, page_config_id hoặc tenant_id' });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: config } = await supabase
        .from('social_page_configs')
        .select('access_token, page_id, page_name')
        .eq('id', page_config_id)
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .single();

      if (!config?.access_token) {
        return res.status(404).json({ error: 'Không tìm thấy token' });
      }

      const token = config.access_token;
      const vid = video_id;
      const tests = {};

      // Helper gọi API
      async function callTest(url) {
        try {
          const resp = await fetch(url);
          const body = await resp.json();
          return { status: resp.status, body, url: url.replace(token, 'TOKEN***') };
        } catch (err) {
          return { status: 'ERROR', error: err.message, url: url.replace(token, 'TOKEN***') };
        }
      }

      // Test 0: Token type check
      tests['0_token_type'] = await callTest(
        `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${token}`
      );

      // Test 1: fields=views
      tests['1_fields_views'] = await callTest(
        `https://graph.facebook.com/v21.0/${vid}?fields=id,views&access_token=${token}`
      );

      // Test 2: fields=video_views
      tests['2_fields_video_views'] = await callTest(
        `https://graph.facebook.com/v21.0/${vid}?fields=id,video_views&access_token=${token}`
      );

      // Test 3: fields=views,video_views,universal_video_id
      tests['3_fields_combined'] = await callTest(
        `https://graph.facebook.com/v21.0/${vid}?fields=id,views,universal_video_id&access_token=${token}`
      );

      // Test 4: video_insights không metric
      tests['4_insights_no_metric'] = await callTest(
        `https://graph.facebook.com/v21.0/${vid}/video_insights?access_token=${token}`
      );

      // Test 5: video_insights với metric cụ thể
      tests['5_insights_with_metrics'] = await callTest(
        `https://graph.facebook.com/v21.0/${vid}/video_insights?metric=total_video_impressions,total_video_views&access_token=${token}`
      );

      // Test 6: video_insights qua fields
      tests['6_insights_via_fields'] = await callTest(
        `https://graph.facebook.com/v21.0/${vid}?fields=video_insights.metric(total_video_impressions,total_video_views)&access_token=${token}`
      );

      // Test 7: post insights endpoint
      tests['7_post_insights'] = await callTest(
        `https://graph.facebook.com/v21.0/${vid}/insights?metric=post_video_views,post_impressions&period=lifetime&access_token=${token}`
      );

      // Test 8: Reel-specific metrics
      tests['8_reel_metrics'] = await callTest(
        `https://graph.facebook.com/v21.0/${vid}/video_insights?metric=blue_reels_play_count,fb_reels_total_plays&access_token=${token}`
      );

      // Test 9: Page videos (top 5) xem views có data không
      tests['9_page_videos'] = await callTest(
        `https://graph.facebook.com/v21.0/${config.page_id}/videos?fields=id,title,views,permalink_url&limit=5&access_token=${token}`
      );

      // Tổng kết: endpoint nào có views
      const summary = {};
      for (const [key, result] of Object.entries(tests)) {
        let hasViews = false;
        let viewsValue = null;
        const body = result.body;

        if (body && !body.error) {
          // Check direct fields
          if (body.views !== undefined) { hasViews = true; viewsValue = body.views; }
          if (body.video_views !== undefined) { hasViews = true; viewsValue = body.video_views; }
          // Check insights data array
          if (body.data && Array.isArray(body.data)) {
            for (const m of body.data) {
              if (m.values?.[0]?.value !== undefined) {
                hasViews = true;
                viewsValue = viewsValue || {};
                viewsValue[m.name] = m.values[0].value;
              }
            }
          }
          // Check video_insights nested
          if (body.video_insights?.data) {
            for (const m of body.video_insights.data) {
              if (m.values?.[0]?.value !== undefined) {
                hasViews = true;
                viewsValue = viewsValue || {};
                viewsValue[m.name] = m.values[0].value;
              }
            }
          }
          // Check page videos
          if (body.data && Array.isArray(body.data) && body.data[0]?.views !== undefined) {
            hasViews = true;
            viewsValue = body.data.map(v => ({ id: v.id, views: v.views, title: v.title }));
          }
        }

        summary[key] = {
          status: result.status,
          has_views: hasViews,
          views_value: viewsValue,
          has_error: !!body?.error,
          error_msg: body?.error?.message || null,
        };
      }

      return res.status(200).json({
        video_id: vid,
        page_name: config.page_name,
        page_id: config.page_id,
        tested_at: new Date().toISOString(),
        summary,
        full_results: tests,
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use: get_fb_stats, get_oauth_url, resolve_url, get_video_stats, get_reel_stats, get_post_stats, get_page_posts_match, url_lookup, debug_views' });
  } catch (error) {
    console.error('FB Stats proxy error:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
  }
}

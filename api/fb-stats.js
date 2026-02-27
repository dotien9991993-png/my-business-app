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

    // fb.watch/ID — redirect, cần video ID từ user
    // Fallback: tìm chuỗi số dài trong URL
    match = url.match(/\/(\d{10,})/);
    if (match) return match[1];

    return null;
  } catch {
    return null;
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

  try {
    // === Lấy stats video Facebook ===
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

      // Gọi Facebook Graph API
      const fields = 'views,likes.summary(true),comments.summary(true),shares';
      const graphUrl = `https://graph.facebook.com/v21.0/${videoId}?fields=${fields}&access_token=${config.access_token}`;

      const fbResponse = await fetch(graphUrl);
      const fbData = await fbResponse.json();

      if (fbData.error) {
        return res.status(400).json({
          error: `Facebook API: ${fbData.error.message}`,
          fb_error: fbData.error
        });
      }

      // Normalize response
      const stats = {
        views: fbData.views || 0,
        likes: fbData.likes?.summary?.total_count || 0,
        comments: fbData.comments?.summary?.total_count || 0,
        shares: fbData.shares?.count || 0,
        updated_at: new Date().toISOString(),
      };

      return res.status(200).json({ stats, raw: fbData });
    }

    // === Lấy stats Reel (dùng insights nếu là page owner) ===
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

      // Thử lấy insights (chỉ hoạt động nếu là page owner)
      const insightsUrl = `https://graph.facebook.com/v21.0/${videoId}/video_insights?metric=total_video_impressions,total_video_views,total_video_reactions_by_type_total,total_video_stories_by_action_type&access_token=${config.access_token}`;
      const insightsResp = await fetch(insightsUrl);
      const insightsData = await insightsResp.json();

      if (insightsData.error) {
        // Fallback sang get_video_stats thường
        return res.status(400).json({
          error: `Insights API: ${insightsData.error.message}`,
          fallback: 'get_video_stats'
        });
      }

      const metrics = {};
      (insightsData.data || []).forEach(m => {
        metrics[m.name] = m.values?.[0]?.value || 0;
      });

      const stats = {
        views: metrics.total_video_views || 0,
        impressions: metrics.total_video_impressions || 0,
        likes: typeof metrics.total_video_reactions_by_type_total === 'object'
          ? Object.values(metrics.total_video_reactions_by_type_total).reduce((a, b) => a + b, 0)
          : 0,
        shares: metrics.total_video_stories_by_action_type?.share || 0,
        comments: metrics.total_video_stories_by_action_type?.comment || 0,
        updated_at: new Date().toISOString(),
      };

      return res.status(200).json({ stats, raw: insightsData });
    }

    return res.status(400).json({ error: 'Invalid action. Use: get_video_stats, get_reel_stats' });
  } catch (error) {
    console.error('FB Stats proxy error:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
  }
}

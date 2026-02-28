/**
 * DEBUG ENDPOINT — Test Facebook Graph API views cho Reels
 * Tạm thời, xóa sau khi debug xong
 *
 * Gọi: GET /api/debug-fb-views?reel_id=1827660067951555
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing Supabase config' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const reelId = req.query.reel_id || '1827660067951555';

  // Lấy 1 active FB page config
  const { data: configs } = await supabase
    .from('social_page_configs')
    .select('id, page_id, page_name, access_token, platform')
    .eq('is_active', true)
    .eq('platform', 'facebook')
    .limit(5);

  if (!configs?.length) {
    return res.status(404).json({ error: 'Không có FB page config nào' });
  }

  const results = {};

  // Test với từng config (có thể có nhiều page)
  for (const config of configs) {
    const token = config.access_token;
    const pageId = config.page_id;
    const configResult = {
      page_name: config.page_name,
      page_id: pageId,
      tests: {},
    };

    // Helper: gọi API và log kết quả
    async function callApi(label, url) {
      try {
        const resp = await fetch(url);
        const body = await resp.json();
        return {
          url: url.replace(token, 'TOKEN_HIDDEN'),
          status: resp.status,
          body,
        };
      } catch (err) {
        return {
          url: url.replace(token, 'TOKEN_HIDDEN'),
          status: 'FETCH_ERROR',
          error: err.message,
        };
      }
    }

    // ── Test 1: Basic fields + views + video_views ──
    configResult.tests['1_basic_all_fields'] = await callApi(
      'Basic all fields',
      `https://graph.facebook.com/v21.0/${reelId}?fields=id,views,length,description,title,likes.summary(true),comments.summary(true)&access_token=${token}`
    );

    // ── Test 2: Chỉ video_views ──
    configResult.tests['2_only_video_views'] = await callApi(
      'Only video_views',
      `https://graph.facebook.com/v21.0/${reelId}?fields=id,video_views&access_token=${token}`
    );

    // ── Test 3: video_insights không metric ──
    configResult.tests['3_video_insights_no_metric'] = await callApi(
      'video_insights (no metric)',
      `https://graph.facebook.com/v21.0/${reelId}/video_insights?access_token=${token}`
    );

    // ── Test 4: video_insights với metrics cụ thể ──
    configResult.tests['4_video_insights_with_metrics'] = await callApi(
      'video_insights with metrics',
      `https://graph.facebook.com/v21.0/${reelId}/video_insights?metric=total_video_impressions,total_video_views,total_video_10s_views,total_video_30s_views,total_video_avg_time_watched&access_token=${token}`
    );

    // ── Test 5: Post insights qua fields ──
    configResult.tests['5_post_insights_via_fields'] = await callApi(
      'Post insights via fields',
      `https://graph.facebook.com/v21.0/${reelId}?fields=insights.metric(post_video_views_organic,post_video_views,post_impressions)&access_token=${token}`
    );

    // ── Test 6: Permissions check ──
    configResult.tests['6_permissions'] = await callApi(
      'Permissions',
      `https://graph.facebook.com/v21.0/me/permissions?access_token=${token}`
    );

    // ── Test 7: Page videos (top 5) xem views/video_views ──
    configResult.tests['7_page_videos_top5'] = await callApi(
      'Page videos top 5',
      `https://graph.facebook.com/v21.0/${pageId}/videos?fields=id,title,views,video_views,permalink_url&limit=5&access_token=${token}`
    );

    results[config.id] = configResult;
  }

  return res.status(200).json({
    reel_id: reelId,
    tested_at: new Date().toISOString(),
    configs_count: configs.length,
    results,
  });
}

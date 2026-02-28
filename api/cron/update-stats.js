/**
 * Vercel Cron Job — Tự động cập nhật stats Facebook mỗi ngày
 * Schedule: 6h sáng VN (23:00 UTC) — cấu hình trong vercel.json
 *
 * Flow:
 * 1. Load tất cả FB page configs
 * 2. Với mỗi Page: GET /videos + /video_reels + /published_posts
 * 3. Gom media items, dedup theo fb_id (ưu tiên video/reel có views)
 * 4. Load tasks có post_links Facebook
 * 5. Match links ↔ media items bằng ID / permalink / số dài
 * 6. Batch update tasks vào Supabase
 */

import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 60,
};

// ── Helpers ──

function extractId(url) {
  if (!url) return null;
  try {
    let match = url.match(/\/reel\/(\d+)/);
    if (match) return match[1];
    match = url.match(/\/videos\/(\d+)/);
    if (match) return match[1];
    match = url.match(/[?&]v=(\d+)/);
    if (match) return match[1];
    const storyMatch = url.match(/story_fbid=(\w+)/);
    if (storyMatch) {
      const pageIdMatch = url.match(/[?&]id=(\d+)/);
      if (pageIdMatch) return `${pageIdMatch[1]}_${storyMatch[1]}`;
      return storyMatch[1];
    }
    match = url.match(/\/posts\/([\w.]+)/);
    if (match) return match[1];
    match = url.match(/\/(\d{10,})/);
    if (match) return match[1];
    return null;
  } catch {
    return null;
  }
}

function cleanUrl(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return (url || '').toLowerCase().replace(/\/+$/, '');
  }
}

function isFacebookUrl(url) {
  return /facebook\.com|fb\.watch|fb\.com|m\.facebook\.com/i.test(url || '');
}

// ── Fetch Page-level data ──

/**
 * Lấy videos của Page (1 trang, không pagination để tiết kiệm thời gian)
 */
async function fetchPageVideos(pageId, accessToken) {
  try {
    const url = `https://graph.facebook.com/v21.0/${pageId}/videos?fields=id,title,permalink_url,views,likes.summary(true),comments.summary(true),created_time&limit=25&access_token=${accessToken}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) {
      console.log(`[cron] Videos error ${pageId}:`, data.error.message);
      return [];
    }
    return (data.data || []).map(v => ({
      fb_id: v.id,
      permalink_url: v.permalink_url || '',
      views: v.views || 0,
      likes: v.likes?.summary?.total_count || 0,
      comments: v.comments?.summary?.total_count || 0,
      shares: 0,
      title: v.title || '',
      type: 'video',
    }));
  } catch (err) {
    console.log(`[cron] Videos fetch error ${pageId}:`, err.message);
    return [];
  }
}

/**
 * Lấy reels của Page qua /video_reels endpoint
 */
async function fetchPageReels(pageId, accessToken) {
  try {
    const url = `https://graph.facebook.com/v21.0/${pageId}/video_reels?fields=id,title,permalink_url,views,likes.summary(true),comments.summary(true),created_time&limit=25&access_token=${accessToken}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) {
      console.log(`[cron] Reels error ${pageId}:`, data.error.message);
      return [];
    }
    return (data.data || []).map(v => ({
      fb_id: v.id,
      permalink_url: v.permalink_url || '',
      views: v.views || 0,
      likes: v.likes?.summary?.total_count || 0,
      comments: v.comments?.summary?.total_count || 0,
      shares: 0,
      title: v.title || '',
      type: 'reel',
    }));
  } catch (err) {
    console.log(`[cron] Reels fetch error ${pageId}:`, err.message);
    return [];
  }
}

/**
 * Lấy published posts của Page (25 gần nhất)
 */
async function fetchPagePosts(pageId, accessToken) {
  try {
    const url = `https://graph.facebook.com/v21.0/${pageId}/published_posts?fields=id,permalink_url,message,reactions.summary(true),comments.summary(true),created_time&limit=25&access_token=${accessToken}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) {
      console.log(`[cron] Posts error ${pageId}:`, data.error.message);
      return [];
    }
    return (data.data || []).map(p => ({
      fb_id: p.id,
      permalink_url: p.permalink_url || '',
      views: null,
      likes: p.reactions?.summary?.total_count || 0,
      comments: p.comments?.summary?.total_count || 0,
      shares: 0,
      title: p.message ? p.message.substring(0, 100) : '',
      type: 'post',
    }));
  } catch (err) {
    console.log(`[cron] Posts fetch error ${pageId}:`, err.message);
    return [];
  }
}

// ── Matching ──

function findMatch(taskUrl, allMediaItems) {
  const taskId = extractId(taskUrl);
  const cleanTaskUrl = cleanUrl(taskUrl);

  for (const item of allMediaItems) {
    if (taskId && item.fb_id) {
      const itemIdParts = item.fb_id.split('_');
      const itemNumericId = itemIdParts.length > 1 ? itemIdParts[itemIdParts.length - 1] : item.fb_id;
      if (taskId === item.fb_id || taskId === itemNumericId) return item;
      if (taskId.includes('_') && taskId.endsWith('_' + itemNumericId)) return item;
    }
    if (item.permalink_url && cleanTaskUrl === cleanUrl(item.permalink_url)) return item;
    if (item.fb_id) {
      const parts = item.fb_id.split('_');
      for (const part of parts) {
        if (part.length >= 8 && taskUrl.includes(part)) return item;
      }
    }
  }
  return null;
}

// ── Main handler ──

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server chưa cấu hình Supabase' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startTime = Date.now();

  // ── Bước 1: Load FB page configs ──
  const { data: pages } = await supabase
    .from('social_page_configs')
    .select('id, tenant_id, access_token, page_id, page_name, token_expires_at')
    .eq('is_active', true)
    .eq('platform', 'facebook');

  if (!pages?.length) {
    return res.status(200).json({ message: 'Không có FB page config nào', updated: 0 });
  }

  // ── Bước 2: Lấy videos + reels + posts từ mỗi Page ──
  const allMediaItems = [];
  const tenantIds = new Set();
  const pageStats = [];

  for (const page of pages) {
    if (page.token_expires_at && new Date(page.token_expires_at) < new Date()) {
      console.log(`[cron] Skip ${page.page_name}: token expired`);
      continue;
    }
    if (!page.page_id || !page.access_token) continue;
    tenantIds.add(page.tenant_id);

    // Fetch song song: videos + reels + posts
    const [videos, reels, posts] = await Promise.all([
      fetchPageVideos(page.page_id, page.access_token),
      fetchPageReels(page.page_id, page.access_token),
      fetchPagePosts(page.page_id, page.access_token),
    ]);

    // Dedup: gom videos + reels, ưu tiên item có views > 0
    const mediaMap = new Map();
    for (const item of [...videos, ...reels]) {
      const existing = mediaMap.get(item.fb_id);
      if (!existing || (item.views > 0 && (!existing.views || item.views > existing.views))) {
        mediaMap.set(item.fb_id, item);
      }
    }
    // Posts: chỉ thêm nếu chưa có trong videos/reels
    for (const item of posts) {
      if (!mediaMap.has(item.fb_id)) {
        mediaMap.set(item.fb_id, item);
      }
    }

    const dedupedItems = [...mediaMap.values()];
    for (const item of dedupedItems) {
      item.tenant_id = page.tenant_id;
      item.page_name = page.page_name || '';
    }
    allMediaItems.push(...dedupedItems);

    const stat = {
      page: page.page_name || page.page_id,
      videos: videos.length,
      reels: reels.length,
      posts: posts.length,
      deduped: dedupedItems.length,
    };
    pageStats.push(stat);
    console.log(`[cron] ${stat.page}: ${stat.videos} videos, ${stat.reels} reels, ${stat.posts} posts → ${stat.deduped} unique`);
  }

  if (!allMediaItems.length) {
    return res.status(200).json({ message: 'Không lấy được media nào từ Facebook', updated: 0, pageStats });
  }

  // ── Bước 3: Load tasks có post_links ──
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, tenant_id, post_links')
    .in('tenant_id', [...tenantIds])
    .not('post_links', 'is', null);

  if (!tasks?.length) {
    return res.status(200).json({
      message: 'Không có task nào cần cập nhật',
      totalMedia: allMediaItems.length,
      updated: 0,
      pageStats,
    });
  }

  // ── Bước 4: Match + gom batch updates ──
  let linksUpdated = 0;
  let linksNotMatched = 0;
  let linksSkipped = 0;
  const updates = []; // { taskId, postLinks }

  for (const task of tasks) {
    if (!task.post_links?.length) continue;

    const tenantMedia = allMediaItems.filter(m => m.tenant_id === task.tenant_id);
    if (!tenantMedia.length) continue;

    let taskModified = false;
    const links = [...task.post_links];

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (!link.url || !isFacebookUrl(link.url)) {
        linksSkipped++;
        continue;
      }

      const matched = findMatch(link.url, tenantMedia);
      if (matched) {
        const updatedLink = { ...link };
        const history = [...(updatedLink.stats_history || [])];
        if (updatedLink.stats?.updated_at) {
          history.push({ ...updatedLink.stats });
          if (history.length > 30) history.splice(0, history.length - 30);
        }
        updatedLink.stats = {
          views: matched.views,
          likes: matched.likes,
          comments: matched.comments,
          shares: matched.shares,
          title: matched.title || updatedLink.stats?.title || '',
          updated_at: new Date().toISOString(),
        };
        updatedLink.stats_history = history;
        links[i] = updatedLink;
        taskModified = true;
        linksUpdated++;
      } else {
        linksNotMatched++;
      }
    }

    if (taskModified) {
      updates.push({ taskId: task.id, postLinks: links });
    }
  }

  // ── Bước 5: Batch update Supabase ──
  let tasksUpdated = 0;
  let updateErrors = 0;

  // Fire all updates concurrently (Promise.all)
  if (updates.length > 0) {
    const results = await Promise.all(
      updates.map(u =>
        supabase
          .from('tasks')
          .update({ post_links: u.postLinks })
          .eq('id', u.taskId)
          .then(({ error }) => {
            if (error) {
              console.log(`[cron] Update ${u.taskId} error:`, error.message);
              return false;
            }
            return true;
          })
      )
    );
    tasksUpdated = results.filter(Boolean).length;
    updateErrors = results.filter(r => !r).length;
  }

  // ── Bước 6: Summary ──
  const duration = Math.round((Date.now() - startTime) / 1000);
  const summary = {
    totalMedia: allMediaItems.length,
    totalTasks: tasks.length,
    linksUpdated,
    linksNotMatched,
    linksSkipped,
    tasksUpdated,
    updateErrors,
    duration_seconds: duration,
    pageStats,
  };

  console.log('[cron/update-stats] Done:', JSON.stringify(summary));
  return res.status(200).json(summary);
}

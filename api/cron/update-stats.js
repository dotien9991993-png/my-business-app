/**
 * Vercel Cron Job — Tự động cập nhật stats Facebook mỗi ngày
 * Schedule: 6h sáng VN (23:00 UTC) — cấu hình trong vercel.json
 *
 * Chiến lược BATCH: Lấy TẤT CẢ video/posts từ Page trong 2-4 API calls,
 * rồi match với links trong tasks. Nhanh hơn 100x so với gọi từng video.
 *
 * Flow:
 * 1. Load tất cả FB page configs
 * 2. Với mỗi Page: GET /{page_id}/videos + /published_posts (có pagination)
 * 3. Gom tất cả media items vào 1 array
 * 4. Load tasks có post_links Facebook
 * 5. Match links ↔ media items bằng ID / permalink / số dài
 * 6. Cập nhật stats vào tasks
 */

import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 60,
};

// ── Helpers ──

/**
 * Extract ID từ Facebook URL (cho matching)
 */
function extractId(url) {
  if (!url) return null;
  try {
    // /reel/{id}
    let match = url.match(/\/reel\/(\d+)/);
    if (match) return match[1];

    // /videos/{id}
    match = url.match(/\/videos\/(\d+)/);
    if (match) return match[1];

    // /watch/?v={id}
    match = url.match(/[?&]v=(\d+)/);
    if (match) return match[1];

    // /permalink.php?story_fbid={id}&id={page_id} → composite
    const storyMatch = url.match(/story_fbid=(\w+)/);
    if (storyMatch) {
      const pageIdMatch = url.match(/[?&]id=(\d+)/);
      if (pageIdMatch) return `${pageIdMatch[1]}_${storyMatch[1]}`;
      return storyMatch[1];
    }

    // /posts/{id}
    match = url.match(/\/posts\/([\w.]+)/);
    if (match) return match[1];

    // Fallback: tìm số dài (>= 10 digits) trong URL
    match = url.match(/\/(\d{10,})/);
    if (match) return match[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Clean URL để so sánh — bỏ query params, trailing slash, lowercase
 */
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
 * Lấy tất cả videos của 1 Page (bao gồm Reels)
 * Pagination: tối đa maxPages trang (mỗi trang 100)
 */
async function fetchPageVideos(pageId, accessToken, maxPages = 3) {
  const items = [];
  let url = `https://graph.facebook.com/v21.0/${pageId}/videos?fields=id,title,permalink_url,views,likes.summary(true),comments.summary(true),created_time&limit=100&access_token=${accessToken}`;
  let page = 0;

  while (url && page < maxPages) {
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.error) {
      console.log(`[cron] Videos error for page ${pageId}:`, data.error.message);
      break;
    }

    if (data.data) {
      for (const v of data.data) {
        items.push({
          fb_id: v.id,
          permalink_url: v.permalink_url || '',
          views: v.views || 0,
          likes: v.likes?.summary?.total_count || 0,
          comments: v.comments?.summary?.total_count || 0,
          shares: 0,
          title: v.title || '',
          type: 'video',
        });
      }
    }

    url = data.paging?.next || null;
    page++;
  }

  return items;
}

/**
 * Lấy tất cả published posts của 1 Page
 * Chỉ lấy 1 trang (100 posts gần nhất)
 */
async function fetchPagePosts(pageId, accessToken) {
  const items = [];
  const url = `https://graph.facebook.com/v21.0/${pageId}/published_posts?fields=id,permalink_url,message,reactions.summary(true),comments.summary(true),created_time&limit=100&access_token=${accessToken}`;

  const resp = await fetch(url);
  const data = await resp.json();

  if (data.error) {
    console.log(`[cron] Posts error for page ${pageId}:`, data.error.message);
    return items;
  }

  if (data.data) {
    for (const p of data.data) {
      items.push({
        fb_id: p.id,
        permalink_url: p.permalink_url || '',
        views: null,
        likes: p.reactions?.summary?.total_count || 0,
        comments: p.comments?.summary?.total_count || 0,
        shares: 0,
        title: p.message ? p.message.substring(0, 100) : '',
        type: 'post',
      });
    }
  }

  return items;
}

// ── Matching ──

/**
 * Tìm media item match với task link URL
 * Thử 3 cách: ID match → permalink match → số dài trong URL
 */
function findMatch(taskUrl, allMediaItems) {
  const taskId = extractId(taskUrl);
  const cleanTaskUrl = cleanUrl(taskUrl);

  for (const item of allMediaItems) {
    // Match 1: So sánh ID trực tiếp
    if (taskId && item.fb_id) {
      // fb_id có thể là "12345" hoặc "page_id_12345"
      const itemIdParts = item.fb_id.split('_');
      const itemNumericId = itemIdParts.length > 1 ? itemIdParts[itemIdParts.length - 1] : item.fb_id;

      if (taskId === item.fb_id || taskId === itemNumericId) {
        return item;
      }
      // Ngược lại: taskId có thể là composite, itemNumericId match phần sau
      if (taskId.includes('_') && taskId.endsWith('_' + itemNumericId)) {
        return item;
      }
    }

    // Match 2: So sánh permalink_url (clean, bỏ query params)
    if (item.permalink_url && cleanTaskUrl === cleanUrl(item.permalink_url)) {
      return item;
    }

    // Match 3: Tìm ID dài từ fb_id trong task URL
    if (item.fb_id) {
      const parts = item.fb_id.split('_');
      for (const part of parts) {
        if (part.length >= 8 && taskUrl.includes(part)) {
          return item;
        }
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

  // Verify Vercel cron secret
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

  // ── Bước 1: Load tất cả active FB page configs ──
  const { data: pages } = await supabase
    .from('social_page_configs')
    .select('id, tenant_id, access_token, page_id, page_name, token_expires_at')
    .eq('is_active', true)
    .eq('platform', 'facebook');

  if (!pages?.length) {
    return res.status(200).json({ message: 'Không có FB page config nào', updated: 0 });
  }

  // ── Bước 2: Lấy tất cả videos + posts từ mỗi Page ──
  const allMediaItems = [];
  const tenantIds = new Set();

  for (const page of pages) {
    // Skip token hết hạn
    if (page.token_expires_at && new Date(page.token_expires_at) < new Date()) {
      console.log(`[cron] Skipping page ${page.page_name || page.page_id}: token expired`);
      continue;
    }

    if (!page.page_id || !page.access_token) continue;

    tenantIds.add(page.tenant_id);

    // Lấy videos (bao gồm reels) — tối đa 3 trang = 300 videos
    const videos = await fetchPageVideos(page.page_id, page.access_token, 3);
    for (const v of videos) {
      v.tenant_id = page.tenant_id;
      v.page_name = page.page_name || '';
    }
    allMediaItems.push(...videos);

    // Lấy published posts — 1 trang = 100 posts
    const posts = await fetchPagePosts(page.page_id, page.access_token);
    for (const p of posts) {
      p.tenant_id = page.tenant_id;
      p.page_name = page.page_name || '';
    }
    allMediaItems.push(...posts);

    console.log(`[cron] Page ${page.page_name || page.page_id}: ${videos.length} videos, ${posts.length} posts`);
  }

  if (!allMediaItems.length) {
    return res.status(200).json({ message: 'Không lấy được media nào từ Facebook', updated: 0 });
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
      totalMediaFromAPI: allMediaItems.length,
      updated: 0,
    });
  }

  // ── Bước 4: Match links ↔ media items và cập nhật stats ──
  let linksUpdated = 0;
  let linksNotMatched = 0;
  let linksSkipped = 0;
  let tasksUpdated = 0;

  for (const task of tasks) {
    if (!task.post_links?.length) continue;

    // Chỉ match media cùng tenant
    const tenantMedia = allMediaItems.filter(m => m.tenant_id === task.tenant_id);
    if (!tenantMedia.length) continue;

    let taskModified = false;
    const links = [...task.post_links];

    for (let i = 0; i < links.length; i++) {
      const link = links[i];

      // Skip link không phải Facebook
      if (!link.url || !isFacebookUrl(link.url)) {
        linksSkipped++;
        continue;
      }

      // Tìm match
      const matched = findMatch(link.url, tenantMedia);

      if (matched) {
        // Lưu stats cũ vào history
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

    // Update task nếu có thay đổi
    if (taskModified) {
      const { error: updateErr } = await supabase
        .from('tasks')
        .update({ post_links: links })
        .eq('id', task.id);

      if (updateErr) {
        console.log(`[cron] Update task ${task.id} error:`, updateErr.message);
      } else {
        tasksUpdated++;
      }
    }
  }

  // ── Bước 5: Log kết quả ──
  const duration = Math.round((Date.now() - startTime) / 1000);
  const summary = {
    totalMediaFromAPI: allMediaItems.length,
    totalTasks: tasks.length,
    linksUpdated,
    linksNotMatched,
    linksSkipped,
    tasksUpdated,
    duration_seconds: duration,
  };

  console.log('[cron/update-stats] Done:', JSON.stringify(summary));
  return res.status(200).json(summary);
}

/**
 * Vercel Cron Job — Tự động cập nhật stats Facebook mỗi ngày
 * Schedule: 6h sáng hàng ngày (cấu hình trong vercel.json)
 *
 * Flow:
 * 1. Load tất cả FB page configs (grouped by tenant)
 * 2. Load tasks có post_links Facebook (tạo/cập nhật trong 60 ngày gần)
 * 3. Với mỗi link: clean URL → extract ID → gọi Graph API → update stats
 * 4. Delay 2s giữa mỗi request (respect rate limit)
 */

import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 300,
};

// ── Helpers: parse & clean URL (mirror logic từ fb-stats.js + socialStatsService) ──

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

function extractFacebookId(url) {
  if (!url) return { id: null, type: null };
  try {
    let match = url.match(/facebook\.com\/reel\/(\d+)/);
    if (match) return { id: match[1], type: 'reel' };

    match = url.match(/facebook\.com\/[^/]+\/videos\/(\d+)/);
    if (match) return { id: match[1], type: 'video' };

    match = url.match(/facebook\.com\/watch\/?\?v=(\d+)/);
    if (match) return { id: match[1], type: 'video' };

    const storyMatch = url.match(/story_fbid=(\d+)/);
    if (storyMatch) {
      const pageIdMatch = url.match(/[?&]id=(\d+)/);
      if (pageIdMatch) return { id: `${pageIdMatch[1]}_${storyMatch[1]}`, type: 'post' };
      return { id: storyMatch[1], type: 'post' };
    }

    match = url.match(/facebook\.com\/[^/]+\/posts\/([\w.]+)/);
    if (match) return { id: match[1], type: 'post' };

    match = url.match(/\/(\d{10,})/);
    if (match) return { id: match[1], type: 'video' };

    return { id: null, type: null };
  } catch {
    return { id: null, type: null };
  }
}

async function resolveFacebookUrl(inputUrl) {
  try {
    const resp = await fetch(inputUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'facebookexternalhit/1.1' },
    });
    const finalUrl = resp.url;
    if (finalUrl && finalUrl !== inputUrl && /facebook\.com/.test(finalUrl)) {
      return finalUrl;
    }
    const html = await resp.text();
    let match = html.match(/property="og:url"\s+content="([^"]+)"/);
    if (!match) match = html.match(/content="([^"]+)"\s+property="og:url"/);
    if (!match) match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
    if (match) return match[1];
    return inputUrl;
  } catch {
    return inputUrl;
  }
}

function isFacebookUrl(url) {
  return /facebook\.com|fb\.watch|fb\.com|m\.facebook\.com/i.test(url || '');
}

// ── Graph API calls ──

async function fetchVideoStats(id, accessToken) {
  const fields = 'id,title,views,likes.summary(true),comments.summary(true),shares';
  const url = `https://graph.facebook.com/v21.0/${id}?fields=${fields}&access_token=${accessToken}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.error) return null;

  let views = data.views || 0;

  // Nếu views = 0, thử video_insights (phương pháp 4)
  if (!views) {
    try {
      const insUrl = `https://graph.facebook.com/v21.0/${id}/video_insights?metric=total_video_views&access_token=${accessToken}`;
      const insResp = await fetch(insUrl);
      const insData = await insResp.json();
      if (!insData.error && insData.data) {
        for (const m of insData.data) {
          if (m.name === 'total_video_views') views = m.values?.[0]?.value || 0;
        }
      }
    } catch { /* ignore */ }
  }

  return {
    views,
    likes: data.likes?.summary?.total_count || 0,
    comments: data.comments?.summary?.total_count || 0,
    shares: data.shares?.count || 0,
    title: data.title || '',
    updated_at: new Date().toISOString(),
  };
}

async function fetchPostStats(id, accessToken) {
  const fields = 'id,message,reactions.summary(true),comments.summary(true),shares';
  const url = `https://graph.facebook.com/v21.0/${id}?fields=${fields}&access_token=${accessToken}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.error) return null;

  return {
    views: null,
    likes: data.reactions?.summary?.total_count || 0,
    comments: data.comments?.summary?.total_count || 0,
    shares: data.shares?.count || 0,
    title: data.message ? data.message.substring(0, 100) : '',
    updated_at: new Date().toISOString(),
  };
}

/**
 * Thử lấy stats với từng token cho đến khi thành công
 */
async function tryGetStats(id, type, configs) {
  for (const config of configs) {
    if (config.token_expires_at && new Date(config.token_expires_at) < new Date()) continue;
    const stats = type === 'post'
      ? await fetchPostStats(id, config.access_token)
      : await fetchVideoStats(id, config.access_token);
    if (stats) return stats;
  }
  return null;
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

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

  // 1. Load tất cả active FB page configs
  const { data: allConfigs } = await supabase
    .from('social_page_configs')
    .select('id, tenant_id, access_token, page_id, token_expires_at')
    .eq('is_active', true)
    .eq('platform', 'facebook');

  if (!allConfigs?.length) {
    return res.status(200).json({ message: 'Không có FB page config nào', updated: 0 });
  }

  // Group configs by tenant_id
  const configsByTenant = {};
  for (const c of allConfigs) {
    if (!configsByTenant[c.tenant_id]) configsByTenant[c.tenant_id] = [];
    configsByTenant[c.tenant_id].push(c);
  }
  const tenantIds = Object.keys(configsByTenant);

  // 2. Load tasks có post_links, tạo/cập nhật trong 60 ngày gần
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, tenant_id, post_links')
    .in('tenant_id', tenantIds)
    .not('post_links', 'is', null)
    .gte('updated_at', sixtyDaysAgo);

  if (!tasks?.length) {
    return res.status(200).json({ message: 'Không có task nào cần cập nhật', updated: 0 });
  }

  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const errors = [];

  // 3. Process từng task
  for (const task of tasks) {
    if (!task.post_links?.length) continue;

    const tenantConfigs = configsByTenant[task.tenant_id];
    if (!tenantConfigs?.length) continue;

    let taskModified = false;
    const links = [...task.post_links];

    for (let i = 0; i < links.length; i++) {
      // Timeout guard: dừng nếu đã chạy > 4 phút (để có thời gian trả response)
      if (Date.now() - startTime > 240_000) {
        console.log('[cron/update-stats] Timeout guard — stopping early');
        break;
      }

      const link = links[i];
      if (!link.url || !isFacebookUrl(link.url)) {
        skipped++;
        continue;
      }

      try {
        // Clean URL → extract ID
        const cleanUrl = cleanFacebookUrl(link.url);
        let extracted = extractFacebookId(cleanUrl);

        // Nếu không extract được → resolve redirect rồi thử lại
        if (!extracted.id) {
          const resolved = await resolveFacebookUrl(cleanUrl);
          extracted = extractFacebookId(resolved);
        }

        if (!extracted.id) {
          skipped++;
          continue;
        }

        // Thử lấy stats với tất cả tokens
        const stats = await tryGetStats(extracted.id, extracted.type, tenantConfigs);

        if (stats) {
          // Lưu stats + history (max 30 entries)
          const updatedLink = { ...link };
          const history = [...(updatedLink.stats_history || [])];
          if (updatedLink.stats?.updated_at) {
            history.push({ ...updatedLink.stats });
            if (history.length > 30) history.splice(0, history.length - 30);
          }
          updatedLink.stats = stats;
          updatedLink.stats_history = history;
          links[i] = updatedLink;
          taskModified = true;
          updated++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        errors.push(`Task ${task.id} link ${i}: ${err.message}`);
      }

      // Delay 2 giây giữa mỗi request
      await delay(2000);
    }

    // Cập nhật task nếu có thay đổi
    if (taskModified) {
      const { error: updateErr } = await supabase
        .from('tasks')
        .update({ post_links: links })
        .eq('id', task.id);

      if (updateErr) {
        errors.push(`Update task ${task.id}: ${updateErr.message}`);
      }
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  const summary = { updated, failed, skipped, total_tasks: tasks.length, duration_seconds: duration };
  if (errors.length) summary.errors = errors.slice(0, 20); // Max 20 errors in response

  console.log('[cron/update-stats] Done:', JSON.stringify(summary));
  return res.status(200).json(summary);
}

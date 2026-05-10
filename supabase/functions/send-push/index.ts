// Supabase Edge Function: send-push
//
// Gửi push notification đến user qua APNs (iOS) và FCM (Android).
// Được trigger từ DB trigger sau khi insert vào bảng `notifications`,
// hoặc gọi trực tiếp từ client/server-side.
//
// ============================================
// SETUP (chạy 1 lần):
// ============================================
// 1. Tạo APNs Auth Key (.p8) tại https://developer.apple.com/account → Keys
// 2. Tạo FCM Server Key tại https://console.firebase.google.com (nếu cần Android)
// 3. Set Supabase secrets:
//    supabase secrets set APNS_KEY_ID=YOUR_KEY_ID
//    supabase secrets set APNS_TEAM_ID=JPXP6KJ6C7
//    supabase secrets set APNS_BUNDLE_ID=vn.hoangnamaudio.app
//    supabase secrets set APNS_PRIVATE_KEY="$(cat AuthKey_XXXXX.p8)"
//    supabase secrets set FCM_SERVER_KEY=YOUR_FCM_KEY  (nếu cần Android)
// 4. Deploy:
//    supabase functions deploy send-push
//
// ============================================
// PAYLOAD:
// ============================================
// POST { user_id: 'uuid', tenant_id: 'uuid', title: 'string', body: 'string', data: {...} }

// @ts-ignore — Deno runtime
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
// @ts-ignore — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — Deno runtime
import { create as createJWT, getNumericDate } from 'https://deno.land/x/djwt@v3.0.1/mod.ts';

const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') || '';
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID') || '';
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') || 'vn.hoangnamaudio.app';
const APNS_PRIVATE_KEY = Deno.env.get('APNS_PRIVATE_KEY') || '';
const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY') || '';

const APNS_HOST = 'https://api.push.apple.com'; // production
// const APNS_HOST = 'https://api.sandbox.push.apple.com'; // dev/TestFlight

// Cache APNs JWT (token có hiệu lực 1 giờ)
let apnsJwtCache: { token: string; expiresAt: number } | null = null;

async function getApnsJwt(): Promise<string> {
  if (apnsJwtCache && apnsJwtCache.expiresAt > Date.now() + 60_000) {
    return apnsJwtCache.token;
  }
  // Parse PEM private key
  const pemContents = APNS_PRIVATE_KEY
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const token = await createJWT(
    { alg: 'ES256', kid: APNS_KEY_ID, typ: 'JWT' },
    { iss: APNS_TEAM_ID, iat: getNumericDate(0) },
    cryptoKey
  );
  apnsJwtCache = { token, expiresAt: Date.now() + 50 * 60 * 1000 }; // 50 phút
  return token;
}

async function sendToApns(deviceToken: string, title: string, body: string, data: Record<string, unknown> = {}) {
  if (!APNS_PRIVATE_KEY) throw new Error('APNS_PRIVATE_KEY chưa được cấu hình');
  const jwt = await getApnsJwt();
  const payload = {
    aps: {
      alert: { title, body },
      sound: 'default',
      badge: 1,
      'mutable-content': 1,
    },
    ...data, // tap → navigate
  };
  const resp = await fetch(`${APNS_HOST}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      'authorization': `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    return { ok: false, status: resp.status, error: errText };
  }
  return { ok: true };
}

async function sendToFcm(deviceToken: string, title: string, body: string, data: Record<string, unknown> = {}) {
  if (!FCM_SERVER_KEY) return { ok: false, error: 'FCM not configured' };
  const resp = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${FCM_SERVER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: deviceToken,
      notification: { title, body, sound: 'default' },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    }),
  });
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: await resp.text() };
  }
  return { ok: true };
}

// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { user_id, tenant_id, title, body, data = {} } = await req.json();
    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: 'Thiếu user_id/title/body' }), { status: 400 });
    }

    // Lấy device tokens của user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', user_id)
      .eq('tenant_id', tenant_id);

    if (error) throw error;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'User chưa đăng ký device' }));
    }

    // Gửi song song
    const results = await Promise.all(
      tokens.map(async (t) => {
        try {
          if (t.platform === 'ios') return await sendToApns(t.token, title, body, data);
          if (t.platform === 'android') return await sendToFcm(t.token, title, body, data);
          return { ok: false, error: 'Unknown platform: ' + t.platform };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      })
    );

    // Cleanup token chết (APNs trả 410 = token revoked)
    const deadTokenIndices = results
      .map((r, i) => (!r.ok && (r as any).status === 410 ? i : -1))
      .filter(i => i >= 0);
    if (deadTokenIndices.length > 0) {
      const deadTokens = deadTokenIndices.map(i => tokens[i].token);
      await supabase.from('device_tokens').delete().in('token', deadTokens);
    }

    const sent = results.filter(r => r.ok).length;
    return new Response(JSON.stringify({ ok: true, sent, total: tokens.length, results }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});

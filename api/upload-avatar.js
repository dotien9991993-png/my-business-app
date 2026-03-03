/**
 * Vercel Serverless Function - Upload Avatar
 * Dùng service role key để upload ảnh lên Supabase Storage (bypass RLS)
 *
 * POST /api/upload-avatar
 * Body: { userId, fileName, fileBase64 }
 */

import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGINS = [
  'https://in.hoangnamaudio.vn',
  'https://hoangnamaudio.vn',
  'http://localhost:5173'
];

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, fileName, fileBase64, mimeType } = req.body;

    if (!userId || !fileBase64) {
      return res.status(400).json({ error: 'Thiếu userId hoặc file' });
    }

    if (!ALLOWED_TYPES.includes(mimeType)) {
      return res.status(400).json({ error: 'Chỉ hỗ trợ ảnh JPG, PNG, GIF, WebP' });
    }

    // Decode base64
    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > MAX_SIZE) {
      return res.status(400).json({ error: 'Ảnh quá lớn (tối đa 5MB)' });
    }

    // Init Supabase with service role key
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const ext = fileName?.split('.').pop() || 'jpg';
    const path = `${userId}_${Date.now()}.${ext}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = urlData.publicUrl;

    // Update user record
    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId);

    if (updateError) throw updateError;

    return res.status(200).json({ url: avatarUrl });
  } catch (err) {
    console.error('Upload avatar error:', err);
    return res.status(500).json({ error: err.message || 'Upload thất bại' });
  }
}

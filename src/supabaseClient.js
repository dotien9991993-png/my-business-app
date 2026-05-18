import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Cấu hình tối ưu cho production:
// - eventsPerSecond: giới hạn realtime events tránh flood (mặc định 10)
// - persistSession: tự refresh session
// - heartbeatIntervalMs: giảm tần suất heartbeat realtime (mặc định 30s, tăng lên 60s tiết kiệm egress)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 5, // throttle, mặc định 10 — giảm xuống 5 để tiết kiệm
    },
    heartbeatIntervalMs: 60_000, // 60s thay vì 30s
    timeout: 30_000,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: { 'x-app-version': '1.0.0' },
  },
})

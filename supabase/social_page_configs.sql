-- Cấu hình trang mạng xã hội (Facebook Page, TikTok account)
-- Lưu access token để gọi API lấy stats video

CREATE TABLE IF NOT EXISTS social_page_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'tiktok')),
  page_name TEXT NOT NULL,
  page_id TEXT,
  username TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_social_page_configs_tenant ON social_page_configs(tenant_id);

ALTER TABLE social_page_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_page_configs_tenant_access" ON social_page_configs
  FOR ALL USING (true) WITH CHECK (true);

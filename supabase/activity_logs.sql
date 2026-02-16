-- Activity Logs - Ghi lại lịch sử hoạt động người dùng
-- Chạy migration này trên Supabase SQL Editor

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID,
  user_name TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  entity_name TEXT,
  old_data JSONB,
  new_data JSONB,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_logs_tenant_created ON activity_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_module ON activity_logs(module);
CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_name);
CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_entity_type ON activity_logs(entity_type);

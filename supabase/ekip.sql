-- Ekip (nhóm làm việc) cho module Media
-- Cho phép tạo sẵn nhóm Quay & Dựng + Diễn viên để chọn nhanh khi tạo/sửa video

CREATE TABLE IF NOT EXISTS ekips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  camera_ids UUID[] DEFAULT '{}',
  editor_ids UUID[] DEFAULT '{}',
  actor_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ekips_tenant_id ON ekips(tenant_id);

ALTER TABLE ekips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ekips_tenant_access" ON ekips
  FOR ALL USING (true) WITH CHECK (true);

-- Nếu bảng đã tồn tại, chạy lệnh này để thêm cột created_by:
-- ALTER TABLE ekips ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

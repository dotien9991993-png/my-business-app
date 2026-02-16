-- =============================================
-- Customer Upgrade Migration
-- Nâng cấp bảng customers + tạo bảng customer_interactions
-- =============================================

-- 1. Thêm cột mới vào bảng customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type TEXT DEFAULT 'retail';
-- Giá trị: retail (khách lẻ), regular (khách quen), wholesale (đại lý/sỉ), vip

ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source TEXT;
-- Giá trị: walk_in (đến cửa hàng), online, referral (giới thiệu), facebook, zalo

-- 2. Tạo bảng ghi chú tương tác khách hàng (CRM đơn giản)
CREATE TABLE IF NOT EXISTS customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- call, zalo, visit, complaint, feedback, warranty
  content TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index để truy vấn nhanh theo customer
CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer ON customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_tenant ON customer_interactions(tenant_id);

-- RLS cho customer_interactions
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_interactions_tenant_policy" ON customer_interactions
  FOR ALL USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);

-- Nếu dùng anon key (không set app.tenant_id), cho phép tất cả authenticated users
CREATE POLICY "customer_interactions_anon_access" ON customer_interactions
  FOR ALL USING (true);

-- 3. Cập nhật last_purchase_at cho khách hàng hiện tại (từ đơn hàng gần nhất)
UPDATE customers c SET last_purchase_at = (
  SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id
) WHERE c.last_purchase_at IS NULL;

-- 4. Auto-classify existing customers based on order count/total
-- Khách quen: >= 2 đơn hoàn thành
-- VIP: tổng mua >= 50 triệu
UPDATE customers c SET customer_type = 'vip'
WHERE (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') >= 50000000
  AND c.customer_type = 'retail';

UPDATE customers c SET customer_type = 'regular'
WHERE (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') >= 2
  AND c.customer_type = 'retail';

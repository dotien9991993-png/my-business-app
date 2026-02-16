-- ============================================================
-- WARRANTY REQUESTS + ACTIVATE WARRANTY RPC
-- ============================================================

-- Bảng yêu cầu BH từ khách hàng (public)
CREATE TABLE IF NOT EXISTS warranty_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  serial_id UUID REFERENCES product_serials(id),
  serial_number TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  description TEXT,
  images JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending', -- pending, contacted, in_progress, resolved, closed
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_warranty_requests_tenant ON warranty_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warranty_requests_status ON warranty_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_warranty_requests_phone ON warranty_requests(tenant_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_warranty_requests_serial ON warranty_requests(serial_id);

-- RLS
ALTER TABLE warranty_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warranty_requests_all" ON warranty_requests FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE warranty_requests;

-- ============================================================
-- RPC: Kích hoạt bảo hành (server-side, an toàn)
-- ============================================================
CREATE OR REPLACE FUNCTION activate_warranty(
  p_tenant_id UUID,
  p_serial_number TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT DEFAULT NULL,
  p_customer_address TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_serial RECORD;
  v_product RECORD;
  v_existing_card RECORD;
  v_card_number TEXT;
  v_warranty_months INT;
  v_warranty_end DATE;
  v_new_card_id UUID;
  v_last_num INT;
  v_date_str TEXT;
BEGIN
  -- 1. Tìm serial thuộc tenant
  SELECT * INTO v_serial
  FROM product_serials
  WHERE serial_number = p_serial_number
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serial khong ton tai');
  END IF;

  -- 2. Kiểm tra đã có warranty_card chưa
  SELECT * INTO v_existing_card
  FROM warranty_cards
  WHERE serial_id = v_serial.id
    AND tenant_id = p_tenant_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serial da duoc kich hoat bao hanh', 'card_number', v_existing_card.card_number);
  END IF;

  -- 3. Chỉ cho phép kích hoạt serial in_stock hoặc sold (chưa có warranty)
  IF v_serial.status NOT IN ('in_stock', 'sold') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serial khong hop le de kich hoat');
  END IF;

  -- 4. Lấy thông tin sản phẩm
  SELECT * INTO v_product FROM products WHERE id = v_serial.product_id;
  v_warranty_months := COALESCE(v_product.warranty_months, 12);
  v_warranty_end := CURRENT_DATE + (v_warranty_months || ' months')::INTERVAL;

  -- 5. Tạo mã thẻ BH: BH-YYYYMMDD-XXX (sequential)
  v_date_str := TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD');

  SELECT COALESCE(
    MAX(
      NULLIF(SPLIT_PART(card_number, '-', 3), '')::INT
    ), 0
  ) INTO v_last_num
  FROM warranty_cards
  WHERE tenant_id = p_tenant_id
    AND card_number LIKE 'BH-' || v_date_str || '-%';

  v_card_number := 'BH-' || v_date_str || '-' || LPAD((v_last_num + 1)::TEXT, 3, '0');

  -- 6. Cập nhật serial
  UPDATE product_serials SET
    status = 'sold',
    customer_name = p_customer_name,
    customer_phone = p_customer_phone,
    warranty_start = CURRENT_DATE,
    warranty_end = v_warranty_end,
    sold_at = COALESCE(sold_at, NOW()),
    updated_at = NOW()
  WHERE id = v_serial.id;

  -- 7. Tạo warranty card
  INSERT INTO warranty_cards (
    tenant_id, card_number, serial_id, product_id,
    product_name, product_sku, serial_number,
    customer_name, customer_phone, customer_email, customer_address,
    order_id, warranty_start, warranty_end, warranty_months,
    status, created_by
  ) VALUES (
    p_tenant_id, v_card_number, v_serial.id, v_serial.product_id,
    v_product.name, v_product.sku, p_serial_number,
    p_customer_name, p_customer_phone, p_customer_email, p_customer_address,
    v_serial.sold_order_id, CURRENT_DATE, v_warranty_end, v_warranty_months,
    'active', 'customer_self_activate'
  ) RETURNING id INTO v_new_card_id;

  -- 8. Trả kết quả
  RETURN jsonb_build_object(
    'success', true,
    'card_id', v_new_card_id,
    'card_number', v_card_number,
    'product_name', v_product.name,
    'product_sku', v_product.sku,
    'serial_number', p_serial_number,
    'warranty_start', CURRENT_DATE,
    'warranty_end', v_warranty_end,
    'warranty_months', v_warranty_months,
    'customer_name', p_customer_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Storage bucket cho warranty request images
-- ============================================================
-- Run in Supabase dashboard:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('warranty-images', 'warranty-images', true);
-- CREATE POLICY "warranty_images_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'warranty-images');
-- CREATE POLICY "warranty_images_select" ON storage.objects FOR SELECT USING (bucket_id = 'warranty-images');

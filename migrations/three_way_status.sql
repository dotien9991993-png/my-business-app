-- ============================================
-- Migration: Three-way status system
-- order_status, shipping_status, payment_status
-- ============================================

-- 1. Add new columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'open';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'pending';
-- payment_status already exists

-- 2. Migrate data from old status → new 3 fields
UPDATE orders SET
  order_status = CASE
    WHEN status IN ('new') THEN 'open'
    WHEN status IN ('confirmed','packing','shipping','delivered') THEN 'confirmed'
    WHEN status = 'completed' THEN 'completed'
    WHEN status = 'cancelled' THEN 'cancelled'
    WHEN status = 'returned' THEN 'returned'
    ELSE 'open'
  END,
  shipping_status = CASE
    WHEN status = 'packing' THEN 'packing'
    WHEN status = 'shipping' THEN 'shipped'
    WHEN status IN ('delivered','completed') THEN 'delivered'
    WHEN status = 'returned' THEN 'returned_to_sender'
    ELSE 'pending'
  END
WHERE order_status IS NULL OR order_status = 'open';

-- 3. Rename partial → partial_paid
UPDATE orders SET payment_status = 'partial_paid' WHERE payment_status = 'partial';

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_status ON orders(shipping_status);

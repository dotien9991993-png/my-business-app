-- Add custom_items column to salaries table
-- Stores custom/free-form salary line items as JSONB array
-- Example: [{"name": "Phụ cấp xăng xe", "quantity": 1, "unit_price": 500000, "amount": 500000}]
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS custom_items JSONB DEFAULT '[]'::jsonb;

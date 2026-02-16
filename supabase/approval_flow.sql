-- Approval Flow - Quy trình duyệt phiếu kho
-- Chạy migration này trên Supabase SQL Editor
-- LƯU Ý: DEFAULT 'approved' để phiếu cũ vẫn hoạt động bình thường

-- Phiếu nhập kho
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved';
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- Index cho filter theo trạng thái duyệt
CREATE INDEX IF NOT EXISTS idx_stock_trans_approval ON stock_transactions(approval_status);

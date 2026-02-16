-- =============================================
-- User Approval System + Employee Information
-- =============================================
-- SAFE: All columns use DEFAULT values so existing users are NOT affected
-- Existing users get status='approved', is_active=true automatically

-- Account approval status
-- Values: 'pending', 'approved', 'rejected', 'suspended'
-- DEFAULT 'approved' ensures existing users can still login
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

-- Employee personal info
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;

-- Bank info (for salary payment)
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account TEXT;

-- Active flag (soft delete / disable)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

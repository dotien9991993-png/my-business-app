-- =============================================
-- Password Hashing Migration
-- =============================================
-- Adds password_hashed flag to users table
-- Existing users: password_hashed = false (plaintext, will auto-migrate on next login)
-- New users: password_hashed = true (bcrypt hashed at registration)

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hashed BOOLEAN DEFAULT false;

-- Referral security and platform agreement fields
-- Safe to run repeatedly on existing FastPanel installs.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(32) DEFAULT '2026-05-24';
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip INET;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_user_agent TEXT;

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS referral_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS referral_application_status VARCHAR(24) NOT NULL DEFAULT 'not_requested';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS referral_requested_at TIMESTAMPTZ;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS referral_reviewed_at TIMESTAMPTZ;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS referral_reviewed_by UUID;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS referral_reject_reason TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS referral_moderation_note TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS anti_fraud_note TEXT;

CREATE INDEX IF NOT EXISTS idx_sellers_referral_status ON sellers(referral_application_status);
CREATE INDEX IF NOT EXISTS idx_sellers_referral_enabled ON sellers(referral_enabled);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);

INSERT INTO settings (key, value) VALUES
  ('referral_enabled', 'true'),
  ('default_referral_commission_rate', '0.0100'),
  ('max_referral_commission_rate', '0.0500'),
  ('referral_payout_basis', 'turnover'),
  ('terms_version', '2026-05-24')
ON CONFLICT (key) DO NOTHING;

-- SellWay Migration v1.3
-- SMSPilot phone verification

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone_verify_code_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone_verify_expires TIMESTAMPTZ;

INSERT INTO settings (key, value, description) VALUES
  ('sms_code_template', 'Ваш код подтверждения {{code}}', 'Шаблон SMS-кода подтверждения')
ON CONFLICT (key) DO NOTHING;

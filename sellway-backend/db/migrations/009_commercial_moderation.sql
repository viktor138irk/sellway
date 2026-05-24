ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS commercial_terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_terms_version VARCHAR(32),
  ADD COLUMN IF NOT EXISTS commercial_application_status VARCHAR(24) NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS commercial_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS commercial_reject_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sellers_commercial_status
  ON sellers(commercial_application_status);

INSERT INTO settings (key, value, description) VALUES
  ('commercial_terms_version', '2026-05-25', 'Version of additional seller/freelancer terms'),
  ('commercial_terms_text', 'Additional terms for sellers and freelancers: the account must pass moderation before publishing goods or services.', 'Additional seller/freelancer terms')
ON CONFLICT (key) DO NOTHING;

UPDATE sellers s
SET
  commercial_terms_accepted_at = COALESCE(s.commercial_terms_accepted_at, s.created_at, NOW()),
  commercial_terms_version = COALESCE(s.commercial_terms_version, '2026-05-25'),
  commercial_application_status = CASE
    WHEN s.verified THEN 'approved'
    WHEN s.commercial_application_status = 'not_requested' THEN 'pending'
    ELSE s.commercial_application_status
  END,
  commercial_requested_at = COALESCE(s.commercial_requested_at, s.created_at, NOW())
FROM users u
WHERE u.id = s.user_id
  AND u.role IN ('seller', 'freelancer', 'admin')
  AND s.commercial_terms_accepted_at IS NULL;

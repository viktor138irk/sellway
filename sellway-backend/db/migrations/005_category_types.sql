ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS category_type VARCHAR(20) NOT NULL DEFAULT 'product';

ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_category_type_check;

ALTER TABLE categories
  ADD CONSTRAINT categories_category_type_check
  CHECK (category_type IN ('product', 'service'));

ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_type_slug
  ON categories(category_type, slug);

CREATE INDEX IF NOT EXISTS idx_categories_type_parent
  ON categories(category_type, parent_id);

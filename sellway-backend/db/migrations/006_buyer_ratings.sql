ALTER TABLE users ADD COLUMN IF NOT EXISTS buyer_rating DECIMAL(3,2) DEFAULT 0.00;
ALTER TABLE users ADD COLUMN IF NOT EXISTS buyer_reviews_count INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS trg_seller_rating ON reviews;
CREATE TRIGGER trg_seller_rating AFTER INSERT OR UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_seller_rating();

CREATE TABLE IF NOT EXISTS buyer_reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id),
  seller_id   UUID NOT NULL REFERENCES users(id),
  buyer_id    UUID NOT NULL REFERENCES users(id),
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_buyer_reviews_buyer ON buyer_reviews(buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyer_reviews_seller ON buyer_reviews(seller_id);

CREATE OR REPLACE FUNCTION update_buyer_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET
    buyer_rating = (SELECT COALESCE(AVG(rating),0) FROM buyer_reviews WHERE buyer_id = NEW.buyer_id),
    buyer_reviews_count = (SELECT COUNT(*) FROM buyer_reviews WHERE buyer_id = NEW.buyer_id)
  WHERE id = NEW.buyer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_buyer_rating ON buyer_reviews;
CREATE TRIGGER trg_buyer_rating AFTER INSERT OR UPDATE ON buyer_reviews
FOR EACH ROW EXECUTE FUNCTION update_buyer_rating();

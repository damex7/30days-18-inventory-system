-- 009: stock_levels, how many of each product are at each location RIGHT NOW.
--
-- This is the number the app reads constantly (lists, dashboard, "only 2
-- left"), kept next to the ledger (010) that explains it. Each change to a
-- quantity happens in the SAME transaction as the movement that records it
-- (lib/inventory/stock.ts), so the two can never disagree.

CREATE TABLE stock_levels (
  -- CASCADE on both: when a product or location is deleted, its stock rows
  -- go with it. That is safe because deleting is only possible when there
  -- are NO movements for it (RESTRICT, in 010), and with no movements every
  -- quantity is 0: the rows hold nothing worth keeping.
  product_id  integer NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  location_id integer NOT NULL REFERENCES locations (id) ON DELETE CASCADE,

  -- THE SAFETY NET. The app never lets stock go below zero: its UPDATE says
  -- "... WHERE quantity + change >= 0" (lib/inventory/stock.ts). This CHECK
  -- is the second guard: if any other query, script or console session ever
  -- forgets that condition, PostgreSQL refuses the change (error 23514) and
  -- rolls back the whole transaction, the movement included.
  quantity    integer NOT NULL DEFAULT 0 CONSTRAINT stock_levels_quantity_check CHECK (quantity >= 0),

  -- COMPOSITE PRIMARY KEY: one row per (product, location) pair, never two.
  -- It is also the index for "this product's stock everywhere" (it starts
  -- with product_id) and for the exact row a movement updates.
  PRIMARY KEY (product_id, location_id)
);

-- "Everything at the Store room" (the products list filtered by location)
-- starts from location_id, which the primary key can't serve because it
-- leads with product_id. It also makes the CASCADE on location delete cheap.
CREATE INDEX stock_levels_location_id_idx ON stock_levels (location_id);

-- EVERY PRODUCT HAS A ROW AT EVERY LOCATION, starting at 0. Two triggers
-- keep that true, whether a product arrives from the form, the CSV import
-- or the seed, and when an admin adds a location.
--
-- Why it matters: a stock change is then ALWAYS an UPDATE of a row that
-- exists. The "never below zero" guard is a single conditional UPDATE that
-- locks the row, with no "insert it if missing" special case, where two
-- first receipts at the same moment could race.
CREATE FUNCTION create_stock_levels_for_product() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stock_levels (product_id, location_id)
  SELECT NEW.id, l.id FROM locations l
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE TRIGGER products_create_stock_levels
  AFTER INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION create_stock_levels_for_product();

CREATE FUNCTION create_stock_levels_for_location() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stock_levels (product_id, location_id)
  SELECT p.id, NEW.id FROM products p
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE TRIGGER locations_create_stock_levels
  AFTER INSERT ON locations
  FOR EACH ROW EXECUTE FUNCTION create_stock_levels_for_location();

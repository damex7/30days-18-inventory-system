-- 008: products, the things the shop keeps.
--
-- How much of each product there is lives in stock_levels (009), and every
-- change to that number is a row in stock_movements (010). This table only
-- describes the product.

CREATE TABLE products (
  id                 integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- The shop's own short code, printed on shelf labels: "BEV-PEAK-400".
  -- citext + UNIQUE: "bev-peak-400" is the same SKU, so it can't be added
  -- twice. Letters, digits, dot, dash and underscore only (it goes into
  -- URLs, CSV files and WhatsApp messages).
  sku                citext      NOT NULL UNIQUE CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$'),

  name               text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),

  -- ON DELETE RESTRICT: a category can't be deleted while ANY product
  -- (archived ones included) uses it. PostgreSQL refuses with error 23503,
  -- and the app says how many products use it (lib/inventory/categories.ts).
  -- RESTRICT rather than the default NO ACTION: both refuse, but RESTRICT
  -- checks immediately and can't be postponed to the end of a transaction.
  -- NOT NULL: every product belongs somewhere on the shelves.
  category_id        integer     NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,

  -- Who we usually reorder from; used to group the low-stock report.
  -- NULLable (some things are bought at the market), and ON DELETE SET NULL:
  -- it's only a preference, so deleting a supplier (allowed only when it
  -- has no deliveries in the ledger) just clears it here.
  supplier_id        integer     NULL REFERENCES suppliers (id) ON DELETE SET NULL,

  -- How the product is counted. A fixed list in a CHECK rather than a
  -- table: the app's forms and labels know exactly these six.
  -- Quantities are whole numbers, so "kg" means whole kilograms (a 50 kg bag
  -- of rice sold by the kg); fractions are out of scope today.
  unit               text        NOT NULL CHECK (unit IN ('piece', 'pack', 'carton', 'bag', 'kg', 'litre')),

  -- MONEY IS INTEGER KOBO (₦1 = 100 kobo), never a float: 0.1 + 0.2 is not
  -- 0.3 in floating point, and stock values add up thousands of prices.
  -- bigint, because a sum of quantity × price can pass 2^31 kobo (₦21m).
  -- Selling below cost is allowed (clearance), so there's no CHECK between them.
  cost_price_kobo    bigint      NOT NULL CHECK (cost_price_kobo >= 0),
  selling_price_kobo bigint      NOT NULL CHECK (selling_price_kobo >= 0),

  -- At or below this total quantity, the product is "low" and appears on
  -- the low-stock report. 0 means "never warn, only when out".
  reorder_level      integer     NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),

  -- Archived products are hidden from lists and forms but stay in old
  -- movements. A product that has movements can only be archived
  -- (stock_movements.product_id is ON DELETE RESTRICT).
  archived_at        timestamptz NULL,

  -- OPTIMISTIC CONCURRENCY (as on Day 16). The edit form remembers the
  -- version it was loaded with; the UPDATE only matches if it's still that
  -- version, and adds 1. If someone else saved in between, nothing is
  -- overwritten and the form shows what they changed.
  version            integer     NOT NULL DEFAULT 1 CHECK (version >= 1),

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FOREIGN KEY INDEXES. PostgreSQL indexes the REFERENCED side (categories.id
-- is a primary key) but NOT the referencing column. Without these:
-- * "filter products by category / supplier" would read the whole table;
-- * deleting a category would scan every product to check RESTRICT, and
--   deleting a supplier would scan every product to apply SET NULL.
CREATE INDEX products_category_id_idx ON products (category_id);
CREATE INDEX products_supplier_id_idx ON products (supplier_id);

-- The default product list: active products sorted by name. A PARTIAL index
-- (WHERE archived_at IS NULL) holds only active products, so it stays small
-- and matches the list's own filter.
CREATE INDEX products_active_name_idx ON products (name, id) WHERE archived_at IS NULL;

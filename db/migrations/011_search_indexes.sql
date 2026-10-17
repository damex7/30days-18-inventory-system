-- 011: fast "contains" search on product names and SKUs.
--
-- The products page searches with ILIKE '%milo%' ("contains, ignoring
-- case"). A normal B-tree index can't help with a pattern that STARTS with
-- %, so without this every search reads every product.
--
-- pg_trgm splits text into TRIGRAMS (overlapping 3-letter pieces: "milo"
-- → "  m", " mi", "mil", "ilo", "lo "). A GIN index maps each trigram to the
-- rows containing it, so ILIKE '%milo%' only checks rows that contain all
-- of "mil" and "ilo". The README shows the EXPLAIN plan using these
-- indexes on 20,000 products.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX products_name_trgm_idx ON products USING gin (name gin_trgm_ops);

-- sku is citext, which has no trigram operator class of its own, so the
-- index is on sku::text, and the search query compares sku::text too
-- (lib/inventory/products.ts) so that the planner can use it.
CREATE INDEX products_sku_trgm_idx ON products USING gin ((sku::text) gin_trgm_ops);

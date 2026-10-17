-- 007: the catalogue's supporting tables: categories, suppliers, locations.
--
-- Shared ideas in this and the next migrations:
--
-- * IDS are `integer GENERATED ALWAYS AS IDENTITY` (1, 2, 3 …), not UUIDs.
--   This is an internal tool where every member of staff may see every
--   product, so a counting id reveals nothing secret, and /products/12 is
--   friendlier than a 36-character UUID. GENERATED ALWAYS means the
--   database hands out ids and refuses one typed by hand.
--
-- * ARCHIVE, DON'T DELETE. A row that history points at (a supplier that
--   delivered stock, a location that held it) can't be deleted: foreign keys
--   with ON DELETE RESTRICT refuse. Instead `archived_at` is set: archived
--   rows are hidden from lists and forms, still shown in old movements, and
--   can be restored by clearing the column. A timestamp rather than a
--   boolean also records WHEN.
--
-- * citext (from 001) makes a column compare case-insensitively everywhere,
--   including in its UNIQUE index, so "Drinks" and "drinks" can't both exist.
--
-- * set_updated_at() (from 001) keeps updated_at honest: a trigger sets it
--   on every UPDATE, so no query can forget to.

CREATE TABLE categories (
  id          integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- UNIQUE (case-insensitive, via citext) is both the guarantee against
  -- duplicates, even two admins adding "Snacks" at the same moment, and the
  -- index that keeps the list sorted by name.
  name        citext      NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 60),

  -- See "archive, don't delete" above. A category that products use can't
  -- be deleted (products.category_id is ON DELETE RESTRICT, in 008).
  archived_at timestamptz NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE suppliers (
  id             integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Unique, ignoring case: two "Garki Provisions" rows would split one
  -- supplier's deliveries in two.
  name           citext      NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 120),

  -- Who to ask for at the distributor. Optional: some suppliers are just a shop.
  contact_person text        NULL CHECK (length(btrim(contact_person)) BETWEEN 1 AND 100),

  -- A Nigerian mobile number stored ONE way: E.164, "+234" then 10 digits
  -- starting 70, 80, 81, 90 or 91. lib/phone.ts accepts "0803 123 4567",
  -- "+234 803 123 4567" and so on, and turns each into "+2348031234567".
  -- Storing one format means search, de-duplication and wa.me links work,
  -- and this CHECK refuses anything that slipped past the app.
  phone          text        NULL CHECK (phone ~ '^\+234[789][01][0-9]{8}$'),

  email          citext      NULL CHECK (length(email) <= 254 AND email LIKE '%_@_%._%'),
  address        text        NULL CHECK (length(btrim(address)) BETWEEN 1 AND 300),
  notes          text        NULL CHECK (length(notes) <= 2000),

  -- A supplier with deliveries in the ledger can't be deleted
  -- (stock_movements.supplier_id is ON DELETE RESTRICT, in 010): archive it.
  archived_at    timestamptz NULL,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE locations (
  id          integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- "Shop floor", "Store room". Unique, ignoring case.
  name        citext      NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 60),

  -- A location with movements can't be deleted (RESTRICT, in 010). The app
  -- also refuses to archive a location that still holds stock: the goods
  -- must be transferred out first, or they'd vanish from every list.
  archived_at timestamptz NULL,

  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The shop's two places. In the migration, not only the seed, because the
-- app can't record any stock without at least one location.
INSERT INTO locations (name) VALUES ('Shop floor'), ('Store room');

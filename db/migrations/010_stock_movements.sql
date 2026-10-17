-- 010: stock_movements, THE LEDGER. One row for every change to stock:
-- goods received, sold, damaged, returned, moved between locations, or
-- corrected after a count.
--
-- WHY A LEDGER INSTEAD OF EDITING A NUMBER
-- If staff simply typed a new quantity, a shelf showing 9 tins would be all
-- you'd ever know. With a ledger:
-- * every quantity can be EXPLAINED: 24 received on Monday, 15 sold since;
-- * every change says WHO made it and WHEN (users are never deleted);
-- * a mistake is fixed by a NEW row (an adjustment with a reason), so the
--   mistake and its correction both stay visible: nothing is erased;
-- * history, stock value over time and "what went missing" reports come
--   free, and stock_levels can always be re-checked against the sum here.
--
-- APPEND-ONLY: rows are only ever INSERTed. A trigger at the bottom makes
-- PostgreSQL itself refuse any UPDATE, DELETE or TRUNCATE.

CREATE TABLE stock_movements (
  -- bigint: unlike products, this table grows every day, forever.
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- RESTRICT on product, location and supplier: history must survive, so a
  -- product, location or supplier with movements can't be deleted. The app
  -- catches error 23503 and offers to archive instead.
  product_id       integer     NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  location_id      integer     NOT NULL REFERENCES locations (id) ON DELETE RESTRICT,

  -- receive      goods in from a supplier                    (+)
  -- sale         sold to a customer                          (−)
  -- damage       damaged, expired or spoilt                  (−)
  -- return       a customer brought goods back               (+)
  -- transfer_out leaving one location as half of a transfer  (−)
  -- transfer_in  arriving at another location: the other half (+)
  -- adjustment   an admin's correction after counting        (±)
  type             text        NOT NULL CHECK (type IN (
                     'receive', 'sale', 'damage', 'return', 'transfer_out', 'transfer_in', 'adjustment'
                   )),

  -- SIGNED change: +24 received, −3 sold. Never 0, because a movement that
  -- moves nothing is noise in the history.
  quantity_change  integer     NOT NULL CHECK (quantity_change <> 0),

  -- The quantity at this location straight AFTER this movement, copied from
  -- the stock_levels UPDATE's RETURNING in the same transaction. The
  -- history can then show a running balance without adding up every row
  -- before it.
  quantity_after   integer     NOT NULL CHECK (quantity_after >= 0),

  -- What each unit cost on THIS delivery (prices change; products.cost_price_kobo
  -- is only today's). Receipts only.
  unit_cost_kobo   bigint      NULL CHECK (unit_cost_kobo >= 0),

  -- Who delivered it. Receipts only, optional (market purchases have none).
  supplier_id      integer     NULL REFERENCES suppliers (id) ON DELETE RESTRICT,

  -- The supplier's invoice or waybill number, a receipt number, etc.
  reference        text        NULL CHECK (length(btrim(reference)) BETWEEN 1 AND 60),

  -- Free text; REQUIRED for adjustments (see the CHECK below).
  note             text        NULL CHECK (length(note) <= 500),

  -- WHO did it. RESTRICT: the app never deletes users (they are deactivated
  -- instead, db/migrations/006), and this makes sure nobody ever can while
  -- they have movements. Every change keeps its author.
  user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  -- Links the two halves of ONE transfer: the transfer_out row and the
  -- transfer_in row share this id. Not a foreign key: there is no
  -- "transfers" table, just this shared label.
  transfer_id      uuid        NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),

  -- The sign must match the type, so a "sale" can't add stock.
  CONSTRAINT stock_movements_direction_check CHECK (
    (type IN ('receive', 'return', 'transfer_in') AND quantity_change > 0)
    OR (type IN ('sale', 'damage', 'transfer_out') AND quantity_change < 0)
    OR type = 'adjustment'
  ),

  -- A receipt records what each unit cost; nothing else carries a cost or supplier.
  CONSTRAINT stock_movements_receipt_check CHECK (
    (type = 'receive' AND unit_cost_kobo IS NOT NULL)
    OR (type <> 'receive' AND unit_cost_kobo IS NULL AND supplier_id IS NULL)
  ),

  -- transfer_id is set exactly on the two transfer types.
  CONSTRAINT stock_movements_transfer_check CHECK (
    (type IN ('transfer_out', 'transfer_in')) = (transfer_id IS NOT NULL)
  ),

  -- An adjustment must say why ("counted on 12 Oct: 2 tins missing").
  CONSTRAINT stock_movements_adjustment_reason_check CHECK (
    type <> 'adjustment' OR length(btrim(note)) >= 3
  )
);

-- INDEXES, one per real query (each also serves a foreign key's RESTRICT
-- check, which looks for referencing rows by the leading column):
--
-- A product's history on /products/[id], newest first. created_at alone
-- can repeat (a transfer writes two rows in the same transaction, with the
-- same now()), so id breaks ties and the order is always the same.
CREATE INDEX stock_movements_product_created_idx ON stock_movements (product_id, created_at DESC, id DESC);

-- The ledger on /movements and "last 10 movements" on the dashboard,
-- including date-range filters.
CREATE INDEX stock_movements_created_idx ON stock_movements (created_at DESC, id DESC);

-- The ledger filtered by location or by user.
CREATE INDEX stock_movements_location_created_idx ON stock_movements (location_id, created_at DESC);
CREATE INDEX stock_movements_user_created_idx ON stock_movements (user_id, created_at DESC);

-- A supplier's recent deliveries. PARTIAL: only receipts have a supplier,
-- so the index skips every other row.
CREATE INDEX stock_movements_supplier_created_idx ON stock_movements (supplier_id, created_at DESC)
  WHERE supplier_id IS NOT NULL;

-- Finding the other half of a transfer.
CREATE INDEX stock_movements_transfer_idx ON stock_movements (transfer_id) WHERE transfer_id IS NOT NULL;

-- APPEND-ONLY, enforced by the database. Mistakes are fixed with a new
-- adjustment, never by rewriting history.
CREATE FUNCTION forbid_ledger_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only: % is not allowed', TG_OP
    USING HINT = 'Record a new adjustment movement to correct a mistake.';
END;
$$;

CREATE TRIGGER stock_movements_no_update_or_delete
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_changes();

CREATE TRIGGER stock_movements_no_truncate
  BEFORE TRUNCATE ON stock_movements
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_ledger_changes();

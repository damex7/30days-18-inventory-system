-- 012: fix the "an adjustment must give a reason" CHECK from 010.
--
-- 010 said: type <> 'adjustment' OR length(btrim(note)) >= 3.
-- For an adjustment with NO note, length(btrim(NULL)) is NULL, so the
-- whole expression is NULL ("unknown"). A CHECK only refuses a row when its
-- result is FALSE; NULL counts as passing. So a reasonless adjustment got
-- through. Found by a test insert right after 010 was applied.
--
-- Why a new migration and not an edit to 010: 010 had already run, and
-- the migrate script never re-runs an applied file (it warns that the
-- checksum changed). Fixing history means adding to it. On a fresh
-- database 010 and 012 run one after the other with the same end result.
--
-- Rule of thumb: in a CHECK, any comparison on a NULLable column needs an
-- explicit `IS NOT NULL`.
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_adjustment_reason_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_adjustment_reason_check CHECK (
  type <> 'adjustment' OR (note IS NOT NULL AND length(btrim(note)) >= 3)
);

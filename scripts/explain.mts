// npm run db:explain
//
// Shows how PostgreSQL runs the two queries that matter most as the
// catalogue grows: the product SEARCH (name or SKU contains "milo") and the
// LOW-STOCK list. With only 42 products every plan is a quick sequential
// scan (reading 42 rows is cheaper than using any index), which teaches
// nothing. So, INSIDE A TRANSACTION, this script adds 20,000 more products
// (the trigger gives each one a stock row at every location), gives them
// random stock, runs ANALYZE so the planner knows the new sizes, prints
// EXPLAIN (ANALYZE, BUFFERS) for both queries, and then ROLLS BACK. Nothing
// is left behind (though identity counters advance; they never roll back).
//
// The SQL below is the same shape as lib/inventory/products.ts (the list
// query) and lib/inventory/reports.ts (lowStockReport).

import { neonConfig, Pool } from '@neondatabase/serverless'

neonConfig.webSocketConstructor = WebSocket

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const SEARCH = `
  SELECT p.id, p.sku::text, p.name, lv.total, lv.by_location
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(sum(sl.quantity), 0) AS total,
           COALESCE(jsonb_object_agg(sl.location_id, sl.quantity), '{}'::jsonb) AS by_location
    FROM stock_levels sl WHERE sl.product_id = p.id
  ) lv
  WHERE p.archived_at IS NULL
    AND (p.name ILIKE $1 OR p.sku::text ILIKE $1)
  ORDER BY p.name, p.id
  LIMIT 25`

const LOW_STOCK = `
  SELECT p.id, p.sku::text, p.name, p.reorder_level, lv.total, s.name::text AS supplier
  FROM products p
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(sum(quantity), 0) AS total,
           COALESCE(jsonb_object_agg(location_id, quantity), '{}'::jsonb) AS by_location
    FROM stock_levels WHERE product_id = p.id
  ) lv
  WHERE p.archived_at IS NULL AND lv.total <= p.reorder_level
  ORDER BY s.name NULLS LAST, lv.total > 0, p.name`

const pool = new Pool({ connectionString })
const client = await pool.connect()

async function explain(title: string, sql: string, params: unknown[] = []) {
  const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${sql}`, params)
  console.log(`\n=== ${title} ===`)
  for (const row of rows) console.log(row['QUERY PLAN'])
}

try {
  await client.query('BEGIN')

  const started = Date.now()
  // 20,000 fake products spread over the real categories and suppliers.
  await client.query(`
    INSERT INTO products (sku, name, category_id, supplier_id, unit, cost_price_kobo, selling_price_kobo, reorder_level)
    SELECT 'TEST-' || g,
           (ARRAY['Rice', 'Beans', 'Soap', 'Biscuit', 'Juice', 'Noodles', 'Oil', 'Tissue'])[1 + g % 8] || ' test item ' || g,
           (SELECT id FROM categories ORDER BY id LIMIT 1 OFFSET g % 8),
           (SELECT id FROM suppliers ORDER BY id LIMIT 1 OFFSET g % 4),
           'piece', 10000 + g % 500 * 100, 12000 + g % 500 * 120, 5 + g % 20
    FROM generate_series(1, 20000) AS g`)
  // Random stock (a few products end up at or below their reorder level).
  await client.query(`UPDATE stock_levels SET quantity = (random() * 60)::int WHERE product_id IN (SELECT id FROM products WHERE sku::text LIKE 'TEST-%')`)
  await client.query('ANALYZE products')
  await client.query('ANALYZE stock_levels')
  const { rows: sizes } = await client.query(`SELECT (SELECT count(*) FROM products) AS products, (SELECT count(*) FROM stock_levels) AS stock_rows`)
  console.log(`Test data: ${sizes[0]?.products} products, ${sizes[0]?.stock_rows} stock rows (built in ${Date.now() - started} ms, rolled back at the end)`)

  await explain('Product search: name or SKU contains "milo"', SEARCH, ['%milo%'])
  await explain('Low-stock report', LOW_STOCK)
} finally {
  await client.query('ROLLBACK')
  client.release()
  await pool.end()
  console.log('\nRolled back: the test products are gone.')
}

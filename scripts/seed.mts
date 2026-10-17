// npm run db:seed
//
// Fills the database with a believable small shop: Mama Ngozi Provisions
// in Wuse 2, Abuja. It creates:
//   - two accounts with confirmed email addresses:
//       admin@example.com  (admin)  password from SEED_ADMIN_PASSWORD
//       staff@example.com  (staff)  password from SEED_STAFF_PASSWORD
//   - the two locations, 8 categories, 4 suppliers and 41 products
//   - about four weeks of stock history: opening receipts, daily sales,
//     refills from the store room, weekly deliveries, the odd damaged item
//     and customer return, and one count correction. Some products end low
//     or out of stock, so the dashboard and the low-stock report have
//     something to show.
//
// The passwords come from environment variables (.env.local, or Vercel's
// settings), never from this file: a password committed to git is public
// forever, even after it's deleted.
//
// SAFE TO RUN TWICE: every insert says ON CONFLICT DO NOTHING, and the
// history is only written when the ledger is empty. A second run changes
// nothing, not even a password someone has since changed.
//
// THE HISTORY IS SIMULATED IN JAVASCRIPT, THEN WRITTEN IN ONE TRANSACTION.
// The simulation keeps a running quantity per product and location, so
// every movement's quantity_after is right, and the final stock_levels are
// exactly the sum of the ledger, the same promise the app keeps.
//
// Run `npm run db:migrate` first: the seed needs the tables.
// Uses only "erasable" TypeScript, so Node runs it without a build step.

import { randomUUID } from 'node:crypto'
import { hash } from '@node-rs/argon2'
import { neonConfig, Pool } from '@neondatabase/serverless'

neonConfig.webSocketConstructor = WebSocket

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and paste your Neon connection string.')
  process.exit(1)
}

// The same argon2id settings as lib/auth/password.ts (that file is
// server-only, so scripts repeat them).
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 }

type SeedUser = { email: string; name: string; role: 'admin' | 'staff'; passwordVar: string }
const USERS: SeedUser[] = [
  { email: 'admin@example.com', name: 'Ngozi Okafor', role: 'admin', passwordVar: 'SEED_ADMIN_PASSWORD' },
  { email: 'staff@example.com', name: 'Musa Ibrahim', role: 'staff', passwordVar: 'SEED_STAFF_PASSWORD' },
]

for (const user of USERS) {
  const password = process.env[user.passwordVar]
  if (!password || password.length < 8 || password.length > 128) {
    console.error(`${user.passwordVar} must be set to a password of 8 to 128 characters (in .env.local).`)
    process.exit(1)
  }
}

const CATEGORIES = ['Drinks', 'Provisions', 'Toiletries', 'Cleaning', 'Snacks', 'Rice and grains', 'Cooking oil', 'Baby care']

// Fictional distributors. The phone numbers are in the 0700 000 00xx
// range, which is not given to real subscribers.
const SUPPLIERS = [
  { key: 'garki', name: 'Garki Beverages Ltd', contact: 'Aisha Bello', phone: '+2347000000101', email: 'orders@garkibeverages.example', address: 'Plot 12, Area 11, Garki, Abuja', notes: 'Delivers Tuesdays. Crates must be returned.' },
  { key: 'kubwa', name: 'Kubwa Wholesale Depot', contact: 'Emeka Nwosu', phone: '+2347000000102', email: 'sales@kubwadepot.example', address: 'Kubwa Main Market, Abuja', notes: 'Rice, oil and provisions. Delivers Thursdays; 30-day credit.' },
  { key: 'utako', name: 'Utako Home Care Supplies', contact: 'Funmilayo Adeyemi', phone: '+2347000000103', email: null, address: 'Utako Market, Abuja', notes: 'Toiletries, cleaning and baby care. Call before 10 am.' },
  { key: 'wuse', name: 'Wuse Market Distributors', contact: 'Chinedu Eze', phone: '+2347000000104', email: 'wusemarket@example.com', address: 'Wuse Market, Zone 5, Abuja', notes: 'Snacks and biscuits. Cash on delivery.' },
] as const
type SupplierKey = (typeof SUPPLIERS)[number]['key']

type Unit = 'piece' | 'pack' | 'carton' | 'bag' | 'kg' | 'litre'
type SeedProduct = {
  sku: string
  name: string
  category: string
  supplier: SupplierKey | null
  unit: Unit
  cost: number // Naira
  price: number // Naira
  reorder: number
  /** Typical units sold per day at the shop floor. */
  dailySales: number
  /** Deliveries stop after this day, so the product runs low or out by today. */
  stopDeliveriesAfterDay?: number
}

const PRODUCTS: SeedProduct[] = [
  // Drinks
  { sku: 'DRK-COKE-50CL', name: 'Coca-Cola 50cl bottle', category: 'Drinks', supplier: 'garki', unit: 'piece', cost: 450, price: 600, reorder: 24, dailySales: 9 },
  { sku: 'DRK-FANTA-50CL', name: 'Fanta Orange 50cl bottle', category: 'Drinks', supplier: 'garki', unit: 'piece', cost: 450, price: 600, reorder: 24, dailySales: 6 },
  { sku: 'DRK-LACASERA-35CL', name: 'La Casera apple drink 35cl', category: 'Drinks', supplier: 'garki', unit: 'piece', cost: 350, price: 450, reorder: 24, dailySales: 4 },
  { sku: 'DRK-MALTA-33CL', name: 'Malta Guinness can 33cl', category: 'Drinks', supplier: 'garki', unit: 'piece', cost: 700, price: 900, reorder: 24, dailySales: 5 },
  { sku: 'DRK-EVA-75CL', name: 'Eva table water 75cl', category: 'Drinks', supplier: 'garki', unit: 'piece', cost: 250, price: 350, reorder: 24, dailySales: 10 },
  { sku: 'DRK-COKE-PACK12', name: 'Coca-Cola 35cl, pack of 12', category: 'Drinks', supplier: 'garki', unit: 'pack', cost: 4800, price: 5800, reorder: 5, dailySales: 1 },
  { sku: 'DRK-HOLLANDIA-1L', name: 'Hollandia yoghurt 1L', category: 'Drinks', supplier: 'garki', unit: 'piece', cost: 2600, price: 3200, reorder: 6, dailySales: 1.5, stopDeliveriesAfterDay: 12 },
  // Provisions
  { sku: 'PRV-PEAK-400G', name: 'Peak milk powder refill 400g', category: 'Provisions', supplier: 'kubwa', unit: 'pack', cost: 4900, price: 5800, reorder: 10, dailySales: 2 },
  { sku: 'PRV-MILO-500G', name: 'Milo refill 500g', category: 'Provisions', supplier: 'kubwa', unit: 'pack', cost: 4600, price: 5500, reorder: 10, dailySales: 2 },
  { sku: 'PRV-SUGAR-1KG', name: 'Dangote granulated sugar 1kg', category: 'Provisions', supplier: 'kubwa', unit: 'pack', cost: 1900, price: 2300, reorder: 12, dailySales: 2.5 },
  { sku: 'PRV-INDOMIE-70G', name: 'Indomie chicken noodles 70g', category: 'Provisions', supplier: 'kubwa', unit: 'piece', cost: 260, price: 350, reorder: 40, dailySales: 14 },
  { sku: 'PRV-INDOMIE-CTN40', name: 'Indomie chicken 70g, carton of 40', category: 'Provisions', supplier: 'kubwa', unit: 'carton', cost: 9800, price: 11500, reorder: 4, dailySales: 0.6 },
  { sku: 'PRV-SEMO-1KG', name: 'Golden Penny Semovita 1kg', category: 'Provisions', supplier: 'kubwa', unit: 'pack', cost: 1800, price: 2200, reorder: 10, dailySales: 2 },
  { sku: 'PRV-GINO-210G', name: 'Gino tomato paste 210g', category: 'Provisions', supplier: 'kubwa', unit: 'piece', cost: 350, price: 450, reorder: 30, dailySales: 6 },
  { sku: 'PRV-MAGGI-100', name: 'Maggi Star cubes, pack of 100', category: 'Provisions', supplier: 'kubwa', unit: 'pack', cost: 1900, price: 2400, reorder: 8, dailySales: 1.2 },
  { sku: 'PRV-SALT-1KG', name: 'Dangote salt 1kg', category: 'Provisions', supplier: 'kubwa', unit: 'pack', cost: 600, price: 800, reorder: 10, dailySales: 1 },
  // Rice and grains
  { sku: 'RCE-MAMAGOLD-50KG', name: 'Mama Gold rice 50kg bag', category: 'Rice and grains', supplier: 'kubwa', unit: 'bag', cost: 78000, price: 86000, reorder: 3, dailySales: 0.25, stopDeliveriesAfterDay: 6 },
  { sku: 'RCE-MAMAGOLD-KG', name: 'Mama Gold rice, loose', category: 'Rice and grains', supplier: 'kubwa', unit: 'kg', cost: 1650, price: 1900, reorder: 25, dailySales: 6 },
  { sku: 'GRN-BEANS-OLOYIN-KG', name: 'Honey beans (oloyin), loose', category: 'Rice and grains', supplier: 'kubwa', unit: 'kg', cost: 2000, price: 2400, reorder: 20, dailySales: 4 },
  { sku: 'GRN-GARRI-IJEBU-KG', name: 'Ijebu garri, loose', category: 'Rice and grains', supplier: 'kubwa', unit: 'kg', cost: 1200, price: 1500, reorder: 20, dailySales: 5 },
  { sku: 'GRN-SPAG-500G', name: 'Golden Penny spaghetti 500g', category: 'Rice and grains', supplier: 'kubwa', unit: 'pack', cost: 1050, price: 1300, reorder: 20, dailySales: 4 },
  // Cooking oil
  { sku: 'OIL-KINGS-1L', name: 'Kings vegetable oil 1L', category: 'Cooking oil', supplier: 'kubwa', unit: 'piece', cost: 3300, price: 3900, reorder: 8, dailySales: 1.5 },
  { sku: 'OIL-KINGS-5L', name: 'Kings vegetable oil 5L', category: 'Cooking oil', supplier: 'kubwa', unit: 'piece', cost: 15500, price: 17800, reorder: 3, dailySales: 0.4, stopDeliveriesAfterDay: 8 },
  { sku: 'OIL-POWER-75CL', name: 'Power Oil 75cl', category: 'Cooking oil', supplier: 'kubwa', unit: 'piece', cost: 2500, price: 3000, reorder: 8, dailySales: 1.5 },
  { sku: 'OIL-PALM-1L', name: 'Red palm oil, loose', category: 'Cooking oil', supplier: null, unit: 'litre', cost: 2200, price: 2700, reorder: 10, dailySales: 2 },
  // Toiletries
  { sku: 'TOI-JOY-SOAP', name: 'Joy beauty soap 140g', category: 'Toiletries', supplier: 'utako', unit: 'piece', cost: 650, price: 850, reorder: 12, dailySales: 2 },
  { sku: 'TOI-DETTOL-SOAP', name: 'Dettol antiseptic soap 110g', category: 'Toiletries', supplier: 'utako', unit: 'piece', cost: 900, price: 1150, reorder: 12, dailySales: 1.5 },
  { sku: 'TOI-CLOSEUP-140G', name: 'Close-Up toothpaste 140g', category: 'Toiletries', supplier: 'utako', unit: 'piece', cost: 1350, price: 1700, reorder: 10, dailySales: 1.5, stopDeliveriesAfterDay: 10 },
  { sku: 'TOI-ROSE-TISSUE10', name: 'Rose Plus toilet tissue, 10 rolls', category: 'Toiletries', supplier: 'utako', unit: 'pack', cost: 3200, price: 3900, reorder: 6, dailySales: 1 },
  { sku: 'TOI-VASELINE-250ML', name: 'Vaseline body lotion 250ml', category: 'Toiletries', supplier: 'utako', unit: 'piece', cost: 2900, price: 3500, reorder: 6, dailySales: 0.7 },
  // Cleaning
  { sku: 'CLN-HYPO-1L', name: 'Hypo bleach 1L', category: 'Cleaning', supplier: 'utako', unit: 'piece', cost: 1000, price: 1300, reorder: 10, dailySales: 1.2 },
  { sku: 'CLN-MFRESH-500ML', name: 'Morning Fresh washing-up liquid 500ml', category: 'Cleaning', supplier: 'utako', unit: 'piece', cost: 1350, price: 1650, reorder: 10, dailySales: 1.5 },
  { sku: 'CLN-ARIEL-900G', name: 'Ariel detergent powder 900g', category: 'Cleaning', supplier: 'utako', unit: 'pack', cost: 3700, price: 4400, reorder: 8, dailySales: 1, stopDeliveriesAfterDay: 14 },
  { sku: 'CLN-SPONGE-3', name: 'Scouring sponges, pack of 3', category: 'Cleaning', supplier: 'utako', unit: 'pack', cost: 500, price: 700, reorder: 15, dailySales: 1.5 },
  // Snacks
  { sku: 'SNK-GALA', name: 'Gala sausage roll', category: 'Snacks', supplier: 'wuse', unit: 'piece', cost: 300, price: 400, reorder: 30, dailySales: 8 },
  { sku: 'SNK-CABIN-125G', name: 'Cabin biscuits 125g', category: 'Snacks', supplier: 'wuse', unit: 'piece', cost: 400, price: 550, reorder: 20, dailySales: 3 },
  { sku: 'SNK-DIGESTIVE-400G', name: 'McVitie’s digestive biscuits 400g', category: 'Snacks', supplier: 'wuse', unit: 'pack', cost: 2300, price: 2800, reorder: 8, dailySales: 0.8 },
  { sku: 'SNK-PLANTAIN-100G', name: 'Plantain chips 100g', category: 'Snacks', supplier: null, unit: 'pack', cost: 500, price: 700, reorder: 20, dailySales: 3, stopDeliveriesAfterDay: 16 },
  { sku: 'SNK-CHINCHIN-250G', name: 'Chin-chin 250g', category: 'Snacks', supplier: null, unit: 'pack', cost: 1000, price: 1400, reorder: 12, dailySales: 1.5 },
  // Baby care
  { sku: 'BBY-MOLFIX-S4', name: 'Molfix diapers size 4, pack of 42', category: 'Baby care', supplier: 'utako', unit: 'pack', cost: 11500, price: 13500, reorder: 4, dailySales: 0.5, stopDeliveriesAfterDay: 9 },
  { sku: 'BBY-CERELAC-400G', name: 'Cerelac wheat 400g', category: 'Baby care', supplier: 'utako', unit: 'pack', cost: 4300, price: 5000, reorder: 6, dailySales: 0.6 },
  { sku: 'BBY-WIPES-64', name: 'Baby wipes, pack of 64', category: 'Baby care', supplier: 'utako', unit: 'pack', cost: 2200, price: 2700, reorder: 6, dailySales: 0.6 },
]

// ---------------------------------------------------------------------------
// The history simulation
// ---------------------------------------------------------------------------

const DAYS = 28
const SHOP = 'Shop floor'
const STORE = 'Store room'

/** A small seeded random generator (mulberry32): the same history on every machine. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}
const rand = random(18_2026)
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
/** A whole number of sales around `mean` (never negative). */
const around = (mean: number) => Math.max(0, Math.round(mean * (0.4 + rand() * 1.2)))

/** Midnight in Lagos (UTC+1, no daylight saving), `daysAgo` days back, plus an hour of the day. */
function lagosTime(daysAgo: number, hour: number, minute: number): Date {
  const now = new Date()
  const lagosNow = new Date(now.getTime() + 60 * 60 * 1000)
  const midnightUtc = Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate()) - 60 * 60 * 1000
  return new Date(midnightUtc - daysAgo * 24 * 60 * 60 * 1000 + (hour * 60 + minute) * 60 * 1000)
}

type Movement = {
  sku: string
  location: string
  type: 'receive' | 'sale' | 'damage' | 'return' | 'transfer_out' | 'transfer_in' | 'adjustment'
  change: number
  after: number
  unitCostKobo: number | null
  supplier: SupplierKey | null
  reference: string | null
  note: string | null
  user: 'admin' | 'staff'
  transferId: string | null
  at: Date
}

function simulate(): { movements: Movement[]; levels: Map<string, number> } {
  const movements: Movement[] = []
  const levels = new Map<string, number>()
  const key = (sku: string, location: string) => `${sku}|${location}`
  const level = (sku: string, location: string) => levels.get(key(sku, location)) ?? 0
  let invoice = 4100

  function move(m: Omit<Movement, 'after'>) {
    const after = level(m.sku, m.location) + m.change
    if (after < 0) throw new Error(`Simulation bug: ${m.sku} at ${m.location} would go below zero`)
    levels.set(key(m.sku, m.location), after)
    movements.push({ ...m, after })
  }

  for (let day = 0; day <= DAYS; day++) {
    const daysAgo = DAYS - day
    const now = new Date()
    const usable = (at: Date) => at.getTime() < now.getTime() - 5 * 60 * 1000

    // A morning delivery round: day 0 is the opening stock for everything;
    // after that, each supplier comes once a week and tops up what's low.
    const weekday = day % 7
    const deliveryDay: Record<SupplierKey, number> = { garki: 1, kubwa: 3, utako: 4, wuse: 5 }
    for (const supplier of [...SUPPLIERS.map((s) => s.key), null] as (SupplierKey | null)[]) {
      const deliveringToday = day === 0 || (supplier ? deliveryDay[supplier] === weekday : weekday === 6)
      if (!deliveringToday) continue
      const at = lagosTime(daysAgo, 9, between(0, 50))
      if (!usable(at)) continue
      invoice += between(1, 9)
      const reference = supplier ? `INV-${invoice}` : `MKT-${invoice}`
      for (const p of PRODUCTS.filter((x) => x.supplier === supplier)) {
        if (day > 0 && p.stopDeliveriesAfterDay !== undefined && day > p.stopDeliveriesAfterDay) continue
        const total = level(p.sku, SHOP) + level(p.sku, STORE)
        const target = Math.max(p.reorder * 3, Math.ceil(p.dailySales * 12))
        if (day > 0 && total > p.reorder * 1.5) continue
        const quantity = Math.max(target - total, 1)
        // Prices rose about 5% during the month (as they do): early
        // deliveries cost a little less than today's cost price.
        const costNaira = day < 14 ? Math.round((p.cost * 0.95) / 10) * 10 : p.cost
        move({ sku: p.sku, location: STORE, type: 'receive', change: quantity, unitCostKobo: costNaira * 100, supplier, reference, note: day === 0 ? 'Opening stock' : null, user: 'staff', transferId: null, at })
      }
    }

    // Refill the shop floor from the store room before opening.
    for (const p of PRODUCTS) {
      const shop = level(p.sku, SHOP)
      const store = level(p.sku, STORE)
      const want = Math.max(Math.ceil(p.dailySales * 4), p.reorder)
      if (shop >= want / 2 || store === 0) continue
      const quantity = Math.min(want - shop, store)
      if (quantity <= 0) continue
      const at = lagosTime(daysAgo, 10, between(0, 55))
      if (!usable(at)) continue
      const transferId = randomUUID()
      const note = 'Morning refill'
      move({ sku: p.sku, location: STORE, type: 'transfer_out', change: -quantity, unitCostKobo: null, supplier: null, reference: null, note, user: 'staff', transferId, at })
      move({ sku: p.sku, location: SHOP, type: 'transfer_in', change: quantity, unitCostKobo: null, supplier: null, reference: null, note, user: 'staff', transferId, at })
    }

    // The day's sales at the shop floor, a few at a time.
    for (const p of PRODUCTS) {
      let toSell = around(p.dailySales * (weekday === 5 || weekday === 6 ? 1.4 : 1))
      while (toSell > 0) {
        const available = level(p.sku, SHOP)
        if (available === 0) break
        const quantity = Math.min(available, toSell, between(1, 4))
        const at = lagosTime(daysAgo, between(11, 20), between(0, 59))
        if (!usable(at)) break
        move({ sku: p.sku, location: SHOP, type: 'sale', change: -quantity, unitCostKobo: null, supplier: null, reference: null, note: null, user: rand() < 0.7 ? 'staff' : 'admin', transferId: null, at })
        toSell -= quantity
      }
    }

    // Now and then: damaged or expired goods, and a customer return.
    if (rand() < 0.3) {
      const p = PRODUCTS[between(0, PRODUCTS.length - 1)]
      if (p && level(p.sku, SHOP) > 0) {
        const at = lagosTime(daysAgo, 19, between(0, 40))
        const reason = p.category === 'Drinks' ? 'Bottle cracked in the crate' : p.category === 'Snacks' ? 'Past its best-before date' : 'Packaging torn, unsellable'
        if (usable(at)) move({ sku: p.sku, location: SHOP, type: 'damage', change: -1, unitCostKobo: null, supplier: null, reference: null, note: reason, user: 'staff', transferId: null, at })
      }
    }
    if (rand() < 0.12) {
      const p = PRODUCTS[between(0, PRODUCTS.length - 1)]
      const at = lagosTime(daysAgo, 17, between(0, 59))
      if (p && usable(at)) move({ sku: p.sku, location: SHOP, type: 'return', change: 1, unitCostKobo: null, supplier: null, reference: `RCPT-${between(1000, 9999)}`, note: 'Customer changed their mind, item unopened', user: 'staff', transferId: null, at })
    }

    // One stock count, two weeks in: the admin finds two noodle packs missing.
    if (day === 14) {
      const sku = 'PRV-INDOMIE-70G'
      const counted = Math.max(level(sku, SHOP) - 2, 0)
      const change = counted - level(sku, SHOP)
      const at = lagosTime(daysAgo, 20, 30)
      if (change !== 0 && usable(at)) {
        move({ sku, location: SHOP, type: 'adjustment', change, unitCostKobo: null, supplier: null, reference: null, note: 'Weekly count: 2 packs missing from the shelf', user: 'admin', transferId: null, at })
      }
    }
  }

  return { movements, levels }
}

// ---------------------------------------------------------------------------
// Writing it all
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString })
const client = await pool.connect()

try {
  // 1. Accounts.
  const userIds: Record<'admin' | 'staff', string> = { admin: '', staff: '' }
  for (const user of USERS) {
    const passwordHash = await hash(process.env[user.passwordVar] as string, ARGON2_OPTIONS)
    const created = await client.query<{ id: string }>(
      `WITH created AS (
         INSERT INTO users (email, name, password_hash, role, email_verified_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (email) DO NOTHING
         RETURNING id
       )
       INSERT INTO auth_events (user_id, type, ip, metadata)
       SELECT id, 'user_created', 'seed', '{"seeded": true}'::jsonb FROM created
       RETURNING user_id AS id`,
      [user.email, user.name, passwordHash, user.role],
    )
    console.log(created.rows.length ? `✓ created ${user.email} (${user.role})` : `· ${user.email} already exists, left as it is`)
    const { rows } = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [user.email])
    userIds[user.role] = rows[0]?.id ?? ''
  }

  // 2. The catalogue, in one transaction. unnest() turns each array
  //    parameter into rows, so a whole list goes in with one statement.
  await client.query('BEGIN')
  await client.query(`INSERT INTO locations (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO NOTHING`, [[SHOP, STORE]])
  await client.query(`INSERT INTO categories (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO NOTHING`, [CATEGORIES])
  for (const s of SUPPLIERS) {
    await client.query(
      `INSERT INTO suppliers (name, contact_person, phone, email, address, notes) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (name) DO NOTHING`,
      [s.name, s.contact, s.phone, s.email, s.address, s.notes],
    )
  }
  const supplierName = (key: SupplierKey | null) => SUPPLIERS.find((s) => s.key === key)?.name ?? null
  const inserted = await client.query(
    `INSERT INTO products (sku, name, category_id, supplier_id, unit, cost_price_kobo, selling_price_kobo, reorder_level)
     SELECT r.sku, r.name, c.id, s.id, r.unit, r.cost, r.price, r.reorder
     FROM jsonb_to_recordset($1::jsonb) AS r(sku text, name text, category text, supplier text, unit text, cost bigint, price bigint, reorder int)
     JOIN categories c ON c.name = r.category
     LEFT JOIN suppliers s ON s.name = r.supplier
     ON CONFLICT (sku) DO NOTHING
     RETURNING id`,
    [JSON.stringify(PRODUCTS.map((p) => ({ sku: p.sku, name: p.name, category: p.category, supplier: supplierName(p.supplier), unit: p.unit, cost: p.cost * 100, price: p.price * 100, reorder: p.reorder })))],
  )
  await client.query('COMMIT')
  console.log(`✓ catalogue: ${CATEGORIES.length} categories, ${SUPPLIERS.length} suppliers, ${inserted.rowCount} new products (of ${PRODUCTS.length})`)

  // 3. The history, only into an EMPTY ledger (so a second run adds nothing).
  const { rows: existing } = await client.query<{ n: string }>('SELECT count(*) AS n FROM stock_movements')
  if (Number(existing[0]?.n) > 0) {
    console.log(`· the ledger already has ${existing[0]?.n} movements: history left as it is`)
  } else {
    const { movements, levels } = simulate()
    movements.sort((a, b) => a.at.getTime() - b.at.getTime())
    await client.query('BEGIN')
    // BATCHES of 400 rows per statement (about 100 KB of JSON each), all
    // inside the ONE transaction above: if any batch fails, every batch is
    // rolled back and the ledger stays empty. `ord` keeps the rows in time
    // order, so their identity ids count up with time. Ids are looked up by SKU and name.
    const BATCH = 400
    for (let start = 0; start < movements.length; start += BATCH) {
      const batch = movements.slice(start, start + BATCH)
      await client.query(
        `INSERT INTO stock_movements
           (product_id, location_id, type, quantity_change, quantity_after, unit_cost_kobo, supplier_id, reference, note, user_id, transfer_id, created_at)
         SELECT p.id, l.id, r.type, r.change, r.after, r.unit_cost, s.id, r.reference, r.note, r.user_id, r.transfer_id, r.at
         FROM jsonb_to_recordset($1::jsonb) AS r(sku text, location text, type text, change int, after int, unit_cost bigint,
              supplier text, reference text, note text, user_id uuid, transfer_id uuid, at timestamptz, ord bigint)
         JOIN products p ON p.sku = r.sku
         JOIN locations l ON l.name = r.location
         LEFT JOIN suppliers s ON s.name = r.supplier
         ORDER BY r.ord`,
        [
          JSON.stringify(
            batch.map((m, i) => ({
              ord: start + i,
              sku: m.sku,
              location: m.location,
              type: m.type,
              change: m.change,
              after: m.after,
              unit_cost: m.unitCostKobo,
              supplier: supplierName(m.supplier),
              reference: m.reference,
              note: m.note,
              user_id: userIds[m.user],
              transfer_id: m.transferId,
              at: m.at.toISOString(),
            })),
          ),
        ],
      )
    }
    // The final quantities: exactly what the ledger adds up to.
    await client.query(
      `UPDATE stock_levels sl SET quantity = r.quantity
       FROM jsonb_to_recordset($1::jsonb) AS r(sku text, location text, quantity int)
       JOIN products p ON p.sku = r.sku
       JOIN locations l ON l.name = r.location
       WHERE sl.product_id = p.id AND sl.location_id = l.id`,
      [JSON.stringify([...levels].map(([k, quantity]) => ({ sku: k.split('|')[0], location: k.split('|')[1], quantity })))],
    )
    await client.query('COMMIT')
    console.log(`✓ history: ${movements.length} movements over ${DAYS} days`)
  }

  // 4. Proof: the ledger and the stock levels agree, for every row.
  const { rows: mismatches } = await client.query(
    `SELECT sl.product_id, sl.location_id, sl.quantity, COALESCE(sum(m.quantity_change), 0) AS ledger
     FROM stock_levels sl
     LEFT JOIN stock_movements m ON m.product_id = sl.product_id AND m.location_id = sl.location_id
     GROUP BY sl.product_id, sl.location_id, sl.quantity
     HAVING sl.quantity <> COALESCE(sum(m.quantity_change), 0)`,
  )
  console.log(mismatches.length === 0 ? '✓ every stock level equals the sum of its ledger rows' : `✗ ${mismatches.length} stock levels disagree with the ledger`)

  const { rows: status } = await client.query<{ low: string; out: string }>(
    `SELECT count(*) FILTER (WHERE t.total > 0 AND t.total <= p.reorder_level) AS low, count(*) FILTER (WHERE t.total = 0) AS out
     FROM products p CROSS JOIN LATERAL (SELECT sum(quantity) AS total FROM stock_levels WHERE product_id = p.id) t
     WHERE p.archived_at IS NULL`,
  )
  console.log(`  ${status[0]?.low} products low, ${status[0]?.out} out of stock`)
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  throw error
} finally {
  client.release()
  await pool.end()
}

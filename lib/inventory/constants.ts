// Plain data shared by the server and the browser: units, movement types
// and their labels. Each list matches a CHECK constraint in db/migrations.

/** products.unit (CHECK in 008_products.sql). */
export const UNITS = ['piece', 'pack', 'carton', 'bag', 'kg', 'litre'] as const
export type Unit = (typeof UNITS)[number]

const UNIT_PLURALS: Record<Unit, string> = { piece: 'pieces', pack: 'packs', carton: 'cartons', bag: 'bags', kg: 'kg', litre: 'litres' }

/** "1 carton", "3 cartons", "2 kg". */
export function quantityLabel(quantity: number, unit: Unit): string {
  return `${quantity.toLocaleString('en-NG')} ${Math.abs(quantity) === 1 ? unit : UNIT_PLURALS[unit]}`
}

/** stock_movements.type (CHECK in 010_stock_movements.sql). */
export const MOVEMENT_TYPES = ['receive', 'sale', 'damage', 'return', 'transfer_out', 'transfer_in', 'adjustment'] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  receive: 'Received',
  sale: 'Sold',
  damage: 'Damaged / expired',
  return: 'Customer return',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  adjustment: 'Count adjustment',
}

/**
 * What the "Record stock" form offers. A transfer is ONE choice in the
 * form, but TWO ledger rows (transfer_out + transfer_in).
 */
export const FORM_TYPES = ['sale', 'receive', 'damage', 'return', 'transfer', 'adjustment'] as const
export type FormMovementType = (typeof FORM_TYPES)[number]

export const FORM_TYPE_LABELS: Record<FormMovementType, { label: string; hint: string }> = {
  sale: { label: 'Sale', hint: 'Sold to a customer' },
  receive: { label: 'Receive', hint: 'Goods in from a supplier' },
  damage: { label: 'Damage', hint: 'Damaged, expired or spoilt' },
  return: { label: 'Return', hint: 'A customer brought it back' },
  transfer: { label: 'Transfer', hint: 'Move between locations' },
  adjustment: { label: 'Adjust', hint: 'Correct after a count (admin)' },
}

/** Only admins may record these (the Server Action checks the role too). */
export const ADMIN_ONLY_TYPES: ReadonlySet<FormMovementType> = new Set(['adjustment'])

/** Stock status of a product (or of one location's stock of it). */
export const STOCK_STATUSES = ['in', 'low', 'out'] as const
export type StockStatus = (typeof STOCK_STATUSES)[number]

/**
 * "out" at 0; "low" at or below the reorder level; otherwise "in".
 * The same rule as the SQL in lib/inventory/products.ts.
 */
export function stockStatus(quantity: number, reorderLevel: number): StockStatus {
  if (quantity <= 0) return 'out'
  if (quantity <= reorderLevel) return 'low'
  return 'in'
}

/**
 * The low-stock report's suggestion: order enough to get back to TWICE the
 * reorder level, and always at least 1. Twice, so the next order isn't due
 * again straight away.
 */
export function suggestedReorder(quantity: number, reorderLevel: number): number {
  return Math.max(2 * reorderLevel - quantity, 1)
}

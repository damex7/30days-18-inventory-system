// GET /movements/export?…: the ledger as CSV, with the same filters as the
// /movements page, oldest first (the natural order for a ledger on paper).
// Checks the session itself; see app/(app)/products/export/route.ts.
import { authorizeRequest } from '@/lib/auth/dal'
import { csvFilename, toCsv } from '@/lib/inventory/csv'
import { listMovementsForExport } from '@/lib/inventory/movements'
import { movementListSchema } from '@/lib/inventory/validation'
import { koboToInput } from '@/lib/money'

const lagos = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export async function GET(request: Request) {
  const auth = await authorizeRequest('staff')
  if (!auth.ok) return new Response(auth.status === 401 ? 'Sign in to export.' : 'Not allowed.', { status: auth.status })

  const params = movementListSchema.parse(Object.fromEntries(new URL(request.url).searchParams))
  const movements = await listMovementsForExport(params)

  const header = ['id', 'time_lagos', 'type', 'sku', 'product', 'location', 'quantity_change', 'quantity_after', 'unit_cost', 'supplier', 'reference', 'note', 'recorded_by', 'transfer_id']
  const rows = movements.map((m) => [
    m.id,
    lagos.format(m.createdAt).replace(',', ''),
    m.type,
    m.productSku,
    m.productName,
    m.locationName,
    m.quantityChange,
    m.quantityAfter,
    m.unitCostKobo === null ? null : koboToInput(m.unitCostKobo),
    m.supplierName,
    m.reference,
    m.note,
    m.userName,
    m.transferId,
  ])

  return new Response(toCsv([header, ...rows]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('movements')}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// GET /products/import/template: a CSV with the expected header and two
// example rows. Admin only, checked here (route handlers aren't covered
// by the page's own check).
import { authorizeRequest } from '@/lib/auth/dal'
import { toCsv } from '@/lib/inventory/csv'
import { IMPORT_COLUMNS } from '@/lib/inventory/import'

export async function GET() {
  const auth = await authorizeRequest('admin')
  if (!auth.ok) return new Response('Not allowed.', { status: auth.status })
  const csv = toCsv([
    [...IMPORT_COLUMNS],
    ['DRK-CHIVITA-1L', 'Chivita orange juice 1L', 'Drinks', 'Garki Beverages Ltd', 'piece', '1850', '2300', '6'],
    ['PRV-OVALTINE-400G', 'Ovaltine refill 400g', 'Provisions', '', 'pack', '3,900.00', '4,600', '8'],
  ])
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ipamo-products-template.csv"', 'Cache-Control': 'no-store' },
  })
}

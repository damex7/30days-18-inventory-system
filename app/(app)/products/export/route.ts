// GET /products/export?…: the product list as CSV, with the SAME filters
// and sort as the page (the Export button copies the page's URL params).
//
// A ROUTE HANDLER, so it must check the session itself: the proxy only
// redirects requests with no cookie at all, and a stale or forged cookie
// gets past it. authorizeRequest answers 401/403 instead of redirecting,
// which suits a file download. Reading data with GET needs no CSRF check:
// it changes nothing, and another site can't read the response.
import { authorizeRequest } from '@/lib/auth/dal'
import { csvFilename, toCsv } from '@/lib/inventory/csv'
import { locationOptions } from '@/lib/inventory/locations'
import { listProductsForExport } from '@/lib/inventory/products'
import { productListSchema } from '@/lib/inventory/validation'
import { koboToInput } from '@/lib/money'

export async function GET(request: Request) {
  const auth = await authorizeRequest('staff')
  if (!auth.ok) return new Response(auth.status === 401 ? 'Sign in to export.' : 'Not allowed.', { status: auth.status })

  const url = new URL(request.url)
  const params = productListSchema.parse(Object.fromEntries(url.searchParams))
  const [products, locations] = await Promise.all([listProductsForExport(params), locationOptions()])

  const header = ['sku', 'name', 'category', 'supplier', 'unit', 'cost_price', 'selling_price', 'reorder_level', ...locations.map((l) => `stock_${l.name}`), 'total_stock', 'status']
  const rows = products.map((p) => [
    p.sku,
    p.name,
    p.categoryName,
    p.supplierName,
    p.unit,
    // Naira with two decimals, from integer kobo (no float maths).
    koboToInput(p.costPriceKobo),
    koboToInput(p.sellingPriceKobo),
    p.reorderLevel,
    ...locations.map((l) => p.byLocation[String(l.id)] ?? 0),
    p.totalQuantity,
    p.archivedAt ? 'archived' : p.status,
  ])

  return new Response(toCsv([header, ...rows]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('products')}"`,
      // Stock changes by the minute: never cache an export.
      'Cache-Control': 'no-store',
    },
  })
}

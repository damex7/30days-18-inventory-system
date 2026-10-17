import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { StockBadge } from '@/components/ui/stock-badge'
import { Pagination, SortHeader, TableFrame } from '@/components/ui/table-parts'
import { plural } from '@/lib/action-helpers'
import { verifySession } from '@/lib/auth/dal'
import { cn } from '@/lib/cn'
import { categoryOptions } from '@/lib/inventory/categories'
import { quantityLabel } from '@/lib/inventory/constants'
import { locationOptions } from '@/lib/inventory/locations'
import { listProducts, PRODUCT_PAGE_SIZE } from '@/lib/inventory/products'
import type { ProductListRow } from '@/lib/inventory/rows'
import { supplierOptions } from '@/lib/inventory/suppliers'
import { productListSchema, type ProductListParams } from '@/lib/inventory/validation'
import { formatNaira } from '@/lib/money'
import { hrefWith } from '@/lib/url'

export const metadata: Metadata = { title: 'Products' }

const NOTICES: Record<string, string> = { deleted: 'Product deleted.' }
const DEFAULTS = { status: 'all', sort: 'name', dir: 'asc', page: 1 }
const SORT_LABELS: Record<string, string> = {
  name: 'name',
  sku: 'SKU',
  category: 'category',
  supplier: 'supplier',
  stock: 'stock',
  cost: 'cost price',
  price: 'selling price',
  reorder: 'reorder level',
  status: 'status',
}

export default function ProductsPage({ searchParams }: PageProps<'/products'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Products searchParams={searchParams} />
    </Suspense>
  )
}

/** Turns the parsed params back into URL values (for links that change one thing). */
function current(params: ProductListParams) {
  return { q: params.q, category: params.category, supplier: params.supplier, location: params.location, status: params.status, sort: params.sort, dir: params.dir, page: params.page }
}

async function Products({ searchParams }: Pick<PageProps<'/products'>, 'searchParams'>) {
  const { user } = await verifySession()
  const isAdmin = user.role === 'admin'
  const raw = await searchParams
  // Everything comes from the URL, checked by Zod. A mangled value falls
  // back to its default instead of breaking the page.
  const params = productListSchema.parse(raw)
  const notice =
    raw.notice === 'imported'
      ? `Imported ${plural(Number(raw.count) || 0, 'product')}${Number(raw.skipped) ? ` (${Number(raw.skipped)} rows skipped)` : ''}. Record receipts to give them stock.`
      : (NOTICES[typeof raw.notice === 'string' ? raw.notice : ''] ?? null)

  const [{ products, total }, locations, categories, suppliers] = await Promise.all([listProducts(params), locationOptions(), categoryOptions(), supplierOptions()])
  const base = current(params)
  const pages = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE))
  const filterLocation = locations.find((l) => l.id === params.location)
  const sortLabel = params.sort.startsWith('loc-') ? `stock at ${locations.find((l) => `loc-${l.id}` === params.sort)?.name ?? 'a location'}` : SORT_LABELS[params.sort]
  const filtered = Boolean(params.q || params.category || params.supplier || params.location || params.status !== 'all')

  /** A column header link: same filters, this sort; clicking the active column flips the direction. */
  const sortHref = (key: string) => hrefWith('/products', base, { sort: key, dir: params.sort === key && params.dir === 'asc' ? 'desc' : 'asc', page: 1 }, DEFAULTS)
  const exportHref = hrefWith('/products/export', { ...base, page: undefined }, {}, DEFAULTS)

  return (
    <div>
      <PageHeader
        title="Products"
        description="Everything the shop keeps. Search, filter and sort; the address bar keeps your view, so you can bookmark or share it."
        actions={
          <>
            <a href={exportHref} className={button.secondary} download>
              <Icon name="download" />
              Export CSV
            </a>
            {isAdmin ? (
              <>
                <Link href="/products/import" className={button.secondary}>
                  <Icon name="upload" />
                  Import
                </Link>
                <Link href="/products/new" className={button.primary}>
                  <Icon name="plus" />
                  Add product
                </Link>
              </>
            ) : null}
          </>
        }
      />
      <Flash message={notice} />

      {/* A plain GET form: submitting it simply loads /products?q=…&status=…,
          so filtering works before JavaScript loads and lands in the URL. */}
      <form action="/products" role="search" aria-label="Filter products" className="mb-4 rounded-card border border-line bg-raised p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2">
            <label htmlFor="q" className="mb-1 block text-sm font-semibold">
              Search name or SKU
            </label>
            <input id="q" name="q" type="search" defaultValue={params.q} maxLength={100} placeholder="e.g. milo or PRV-" className="field block min-h-11 w-full px-3" />
          </div>
          <FilterSelect name="category" label="Category" value={params.category} options={categories} />
          <FilterSelect name="supplier" label="Supplier" value={params.supplier} options={suppliers} />
          <FilterSelect name="location" label="Location" value={params.location} options={locations} allLabel="All locations" />
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-semibold">
              Status
            </label>
            <select id="status" name="status" defaultValue={params.status} className="field block min-h-11 w-full px-2.5">
              <option value="all">Any (active)</option>
              <option value="in">In stock</option>
              <option value="low">Low</option>
              <option value="out">Out of stock</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {/* Sorting from the form too, for phones (where there are no column headers). */}
          <div className="md:hidden">
            <label htmlFor="sort" className="mb-1 block text-sm font-semibold">
              Sort by
            </label>
            <select id="sort" name="sort" defaultValue={params.sort} className="field block min-h-11 px-2.5">
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label[0]?.toUpperCase()}
                  {label.slice(1)}
                </option>
              ))}
              {locations.map((l) => (
                <option key={l.id} value={`loc-${l.id}`}>
                  Stock at {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:hidden">
            <label htmlFor="dir" className="mb-1 block text-sm font-semibold">
              Order
            </label>
            <select id="dir" name="dir" defaultValue={params.dir} className="field block min-h-11 px-2.5">
              <option value="asc">A → Z, low → high</option>
              <option value="desc">Z → A, high → low</option>
            </select>
          </div>
          {/* On wide screens these two selects are hidden by CSS, but a hidden
              <select> is still submitted, so the column sort chosen in the
              table headers is kept when the filters change. */}
          <button type="submit" className={button.primary}>
            <Icon name="filter" />
            Apply
          </button>
          {filtered ? (
            <Link href="/products" className={button.ghost}>
              Clear filters
            </Link>
          ) : null}
        </div>
      </form>

      <p aria-live="polite" className="mb-3 text-sm text-muted">
        {total === 0 ? 'No products match.' : `${total.toLocaleString('en-NG')} ${total === 1 ? 'product' : 'products'} · sorted by ${sortLabel}, ${params.dir === 'asc' ? 'ascending' : 'descending'}`}
        {filterLocation ? ` · stock and status counted at ${filterLocation.name}` : ''}
      </p>

      {products.length === 0 ? (
        <EmptyState title={filtered ? 'Nothing matches those filters' : 'No products yet'}>
          {filtered ? <Link href="/products">Clear the filters</Link> : isAdmin ? <Link href="/products/new">Add the first product</Link> : 'An admin hasn’t added any yet.'}
        </EmptyState>
      ) : (
        <>
          <div className="max-md:hidden">
            <TableFrame>
              <table className="w-full min-w-[62rem] text-left text-sm [&_td]:px-2.5 [&_th]:px-2.5">
                <caption className="sr-only">
                  Products, sorted by {sortLabel}, {params.dir === 'asc' ? 'ascending' : 'descending'}. Page {params.page} of {pages}.
                </caption>
                <thead>
                  <tr>
                    <SortHeader label="Product" active={params.sort === 'name'} dir={params.dir} href={sortHref('name')} className="min-w-[13rem]" />
                    <SortHeader label="SKU" active={params.sort === 'sku'} dir={params.dir} href={sortHref('sku')} />
                    <SortHeader label="Category" active={params.sort === 'category'} dir={params.dir} href={sortHref('category')} />
                    <SortHeader label="Supplier" active={params.sort === 'supplier'} dir={params.dir} href={sortHref('supplier')} />
                    {locations.map((l) => (
                      <SortHeader key={l.id} label={l.name} active={params.sort === `loc-${l.id}`} dir={params.dir} href={sortHref(`loc-${l.id}`)} align="right" />
                    ))}
                    <SortHeader label="Total" active={params.sort === 'stock'} dir={params.dir} href={sortHref('stock')} align="right" />
                    <SortHeader label="Reorder" active={params.sort === 'reorder'} dir={params.dir} href={sortHref('reorder')} align="right" />
                    <SortHeader label={filterLocation ? `Status (${filterLocation.name})` : 'Status'} active={params.sort === 'status'} dir={params.dir} href={sortHref('status')} />
                    <SortHeader label="Cost" active={params.sort === 'cost'} dir={params.dir} href={sortHref('cost')} align="right" />
                    <SortHeader label="Price" active={params.sort === 'price'} dir={params.dir} href={sortHref('price')} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <th scope="row" className="px-3 py-2.5 font-normal">
                        <Link href={`/products/${p.id}`} className="font-semibold underline decoration-line-strong">
                          {p.name}
                        </Link>
                      </th>
                      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{p.sku}</td>
                      <td className="px-3 py-2.5">{p.categoryName}</td>
                      <td className="px-3 py-2.5 text-xs">{p.supplierName ?? <span className="text-muted">—</span>}</td>
                      {locations.map((l) => (
                        <td key={l.id} className={cn('px-3 py-2.5 text-right tabular-nums', params.location === l.id && 'bg-canary/50 font-semibold')}>
                          {(p.byLocation[String(l.id)] ?? 0).toLocaleString('en-NG')}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{p.totalQuantity.toLocaleString('en-NG')}</td>
                      <td className="px-3 py-2.5 text-right text-muted tabular-nums">{p.reorderLevel}</td>
                      <td className="px-3 py-2.5">
                        <StockBadge status={p.archivedAt ? 'archived' : p.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatNaira(p.costPriceKobo)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatNaira(p.sellingPriceKobo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
          </div>

          <ul aria-label="Products" className="space-y-2 md:hidden">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} locations={locations} highlight={params.location} />
            ))}
          </ul>

          <div className="mt-4">
            <Pagination page={params.page} total={total} pageSize={PRODUCT_PAGE_SIZE} hrefFor={(page) => hrefWith('/products', base, { page }, DEFAULTS)} label="Product pages" />
          </div>
        </>
      )}
    </div>
  )
}

function FilterSelect({ name, label, value, options, allLabel = 'All' }: { name: string; label: string; value: number | undefined; options: { id: number; name: string }[]; allLabel?: string }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <select id={name} name={name} defaultValue={value ?? ''} className="field block min-h-11 w-full px-2.5">
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  )
}

/** One product as a card, for phones: the same facts as a table row, stacked. */
function ProductCard({ product: p, locations, highlight }: { product: ProductListRow; locations: { id: number; name: string }[]; highlight: number | undefined }) {
  return (
    <li className="rounded-card border border-line bg-raised p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/products/${p.id}`} className="font-semibold underline decoration-line-strong">
            {p.name}
          </Link>
          <p className="font-mono text-xs text-muted">
            {p.sku} · {p.categoryName}
          </p>
        </div>
        <StockBadge status={p.archivedAt ? 'archived' : p.status} />
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-sm">
        {locations.map((l) => (
          <div key={l.id} className={cn('rounded-control px-2 py-1', highlight === l.id ? 'bg-canary' : 'bg-sunken/60')}>
            <dt className="truncate text-xs text-muted">{l.name}</dt>
            <dd className="font-semibold tabular-nums">{(p.byLocation[String(l.id)] ?? 0).toLocaleString('en-NG')}</dd>
          </div>
        ))}
        <div className="rounded-control bg-sunken/60 px-2 py-1">
          <dt className="text-xs text-muted">Total</dt>
          <dd className="font-semibold tabular-nums">{quantityLabel(p.totalQuantity, p.unit)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-sm tabular-nums">
        {formatNaira(p.sellingPriceKobo)} <span className="text-muted">· cost {formatNaira(p.costPriceKobo)} · reorder at {p.reorderLevel}</span>
      </p>
    </li>
  )
}

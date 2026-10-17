import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { deleteProductAction, setProductArchivedAction } from '@/app/(app)/products/actions'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { MovementList } from '@/components/inventory/movement-list'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Flash } from '@/components/ui/flash'
import { Icon, type IconName } from '@/components/ui/icon'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { StockBadge } from '@/components/ui/stock-badge'
import { Pagination } from '@/components/ui/table-parts'
import { plural } from '@/lib/action-helpers'
import { verifySession } from '@/lib/auth/dal'
import { cn } from '@/lib/cn'
import { quantityLabel, stockStatus, type FormMovementType } from '@/lib/inventory/constants'
import { locationOptions } from '@/lib/inventory/locations'
import { listMovements, MOVEMENT_PAGE_SIZE } from '@/lib/inventory/movements'
import { countProductMovements, getProduct } from '@/lib/inventory/products'
import { movementListSchema } from '@/lib/inventory/validation'
import { formatNaira, lineValue } from '@/lib/money'

export const metadata: Metadata = { title: 'Product' }

const NOTICES: Record<string, string> = { created: 'Product added. Record a receipt to add its first stock.', saved: 'Changes saved.' }
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const QUICK: { type: FormMovementType; label: string; icon: IconName; adminOnly?: boolean }[] = [
  { type: 'sale', label: 'Sell', icon: 'receipt' },
  { type: 'receive', label: 'Receive', icon: 'download' },
  { type: 'damage', label: 'Record damage', icon: 'alert' },
  { type: 'transfer', label: 'Transfer', icon: 'transfer' },
  { type: 'return', label: 'Customer return', icon: 'restore' },
  { type: 'adjustment', label: 'Adjust count', icon: 'edit', adminOnly: true },
]

export default function ProductPage({ params, searchParams }: PageProps<'/products/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductDetails params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function ProductDetails({ params, searchParams }: Pick<PageProps<'/products/[id]'>, 'params' | 'searchParams'>) {
  const { user } = await verifySession()
  const isAdmin = user.role === 'admin'
  const id = Number((await params).id)
  const product = Number.isSafeInteger(id) && id > 0 ? await getProduct(id) : null
  if (!product) notFound()

  const raw = await searchParams
  const notice = NOTICES[first(raw.notice) ?? ''] ?? first(raw.recorded) ?? null
  const page = movementListSchema.parse({ page: raw.page }).page
  const [locations, history, movementCount] = await Promise.all([
    locationOptions(),
    listMovements({ product: id, page }),
    countProductMovements(id),
  ])

  const status = product.archivedAt ? 'archived' : stockStatus(product.totalQuantity, product.reorderLevel)
  const margin = product.sellingPriceKobo - product.costPriceKobo
  const marginPercent = product.sellingPriceKobo > 0 ? Math.round((margin / product.sellingPriceKobo) * 1000) / 10 : 0
  const record = (type: FormMovementType) => `/movements/new?product=${id}&type=${type}`

  return (
    // Bottom padding on phones leaves room for the sticky Sell / Receive bar.
    <div className="space-y-6 max-md:pb-24">
      <PageHeader
        back={{ href: '/products', label: 'Products' }}
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-ink">{product.sku}</span>
            <StockBadge status={status} />
            <span>
              · {product.categoryName} · counted in {product.unit}s
            </span>
          </span>
        }
        actions={
          isAdmin ? (
            <>
              <Link href={`/products/${id}/edit`} className={button.secondary}>
                <Icon name="edit" />
                Edit
              </Link>
              <ConfirmAction
                action={setProductArchivedAction}
                fields={{ id: String(id), archived: product.archivedAt ? 'false' : 'true' }}
                triggerVariant="secondary"
                trigger={product.archivedAt ? 'Restore' : 'Archive'}
                icon={product.archivedAt ? 'restore' : 'archive'}
                title={product.archivedAt ? `Restore ${product.name}?` : `Archive ${product.name}?`}
                body={
                  product.archivedAt
                    ? 'It will appear in lists and forms again.'
                    : 'It will be hidden from the product list and forms, and nothing more can be recorded for it. Its history stays, and you can restore it.'
                }
                confirmLabel={product.archivedAt ? 'Restore' : 'Archive'}
              />
              <ConfirmAction
                action={deleteProductAction}
                archiveAction={product.archivedAt ? undefined : setProductArchivedAction}
                fields={{ id: String(id) }}
                triggerVariant="dangerOutline"
                trigger="Delete"
                icon="trash"
                danger
                title={`Delete ${product.name}?`}
                body={
                  movementCount > 0
                    ? `It has ${plural(movementCount, 'stock movement')}, so the database will refuse: history can’t be deleted. You’ll be offered to archive it instead.`
                    : 'It has no stock movements at all, so it will be deleted for good.'
                }
                confirmLabel="Delete"
                pendingLabel="Deleting…"
              />
            </>
          ) : null
        }
      />
      <Flash message={notice} />

      {product.archivedAt ? (
        <p className="rounded-control border-l-4 border-line-strong bg-sunken p-3 text-sm">
          <strong>Archived.</strong> It’s hidden from lists and forms, and no stock can be recorded for it. Its history below is kept.
        </p>
      ) : null}

      {/* STOCK PER LOCATION */}
      <section aria-labelledby="stock-title">
        <h2 id="stock-title" className="sr-only">
          Stock per location
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {locations.map((l) => {
            const quantity = product.byLocation[String(l.id)] ?? 0
            return (
              <div key={l.id} className="rounded-card border border-line bg-raised p-4 shadow-card">
                <p className="text-sm text-muted">{l.name}</p>
                <p className={cn('mt-1 text-3xl font-bold tabular-nums', quantity === 0 && 'text-danger')}>{quantity.toLocaleString('en-NG')}</p>
                <p className="text-xs text-muted">{product.unit === 'kg' ? 'kg' : `${product.unit}s`}</p>
              </div>
            )
          })}
          <div className="rounded-card border-2 border-carbon bg-raised p-4 shadow-card">
            <p className="text-sm text-muted">Total</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{product.totalQuantity.toLocaleString('en-NG')}</p>
            <p className="text-xs text-muted">reorder at {product.reorderLevel}</p>
          </div>
        </div>
      </section>

      {/* QUICK ACTIONS */}
      {!product.archivedAt ? (
        <nav aria-label="Record stock for this product" className="flex flex-wrap gap-2 max-md:hidden">
          {QUICK.filter((q) => !q.adminOnly || isAdmin).map((q, index) => (
            <Link key={q.type} href={record(q.type)} className={index === 0 ? button.primary : button.secondary}>
              <Icon name={q.icon} />
              {q.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <Sheet title="Details" id="details">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <Fact label="Cost price" value={formatNaira(product.costPriceKobo)} />
          <Fact label="Selling price" value={formatNaira(product.sellingPriceKobo)} />
          <Fact label="Margin per unit" value={`${formatNaira(margin)} (${marginPercent}%)`} />
          <Fact label="Stock value at cost" value={formatNaira(lineValue(product.totalQuantity, product.costPriceKobo))} />
          <Fact label="Category" value={<Link href={`/products?category=${product.categoryId}`} className="underline">{product.categoryName}</Link>} />
          <Fact label="Usual supplier" value={product.supplierId ? <Link href={`/suppliers/${product.supplierId}`} className="underline">{product.supplierName}</Link> : 'None'} />
          <Fact label="Reorder level" value={quantityLabel(product.reorderLevel, product.unit)} />
          <Fact label="Record version" value={`v${product.version}`} />
        </dl>
      </Sheet>

      <section aria-labelledby="history-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="history-title" className="text-2xl">
            History
          </h2>
          <p className="text-sm text-muted">
            {plural(history.total, 'movement')} ·{' '}
            <Link href={`/movements?product=${id}`} className="font-semibold text-ink underline">
              filter in the ledger
            </Link>
          </p>
        </div>
        {history.movements.length === 0 ? (
          <EmptyState title="No movements yet">Nothing has been received or sold. A receipt adds the first stock.</EmptyState>
        ) : (
          <>
            <MovementList movements={history.movements} caption={`Stock history of ${product.name}, newest first`} showProduct={false} />
            <div className="mt-4">
              <Pagination page={page} total={history.total} pageSize={MOVEMENT_PAGE_SIZE} hrefFor={(p) => `/products/${id}${p > 1 ? `?page=${p}` : ''}`} label="History pages" />
            </div>
          </>
        )}
      </section>

      {/* ONE-THUMB BAR on phones: the two jobs staff do all day, always in reach. */}
      {!product.archivedAt ? (
        <nav aria-label="Quick actions" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 p-3 backdrop-blur md:hidden">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Link href={record('sale')} className={button.large}>
              <Icon name="receipt" />
              Sell
            </Link>
            <Link href={record('receive')} className={button.largeSecondary}>
              <Icon name="download" />
              Receive
            </Link>
            <Link href={`/movements/new?product=${id}`} className={cn(button.largeSecondary, 'px-4')} aria-label="Other movement types">
              <Icon name="plus" />
            </Link>
          </div>
        </nav>
      ) : null}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

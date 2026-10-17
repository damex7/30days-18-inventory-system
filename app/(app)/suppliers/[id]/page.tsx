import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { deleteSupplierAction, setSupplierArchivedAction } from '@/app/(app)/suppliers/actions'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { MovementList } from '@/components/inventory/movement-list'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { StockBadge } from '@/components/ui/stock-badge'
import { verifySession } from '@/lib/auth/dal'
import { quantityLabel } from '@/lib/inventory/constants'
import { supplierDeliveries } from '@/lib/inventory/movements'
import { listProducts } from '@/lib/inventory/products'
import { getSupplier } from '@/lib/inventory/suppliers'
import { productListSchema } from '@/lib/inventory/validation'
import { formatPhone, whatsappNumber } from '@/lib/phone'

export const metadata: Metadata = { title: 'Supplier' }

const NOTICES: Record<string, string> = { created: 'Supplier added.', saved: 'Changes saved.' }
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default function SupplierPage({ params, searchParams }: PageProps<'/suppliers/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SupplierDetails params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function SupplierDetails({ params, searchParams }: Pick<PageProps<'/suppliers/[id]'>, 'params' | 'searchParams'>) {
  const { user } = await verifySession()
  const isAdmin = user.role === 'admin'
  const id = Number((await params).id)
  const supplier = Number.isSafeInteger(id) && id > 0 ? await getSupplier(id) : null
  if (!supplier) notFound()
  const notice = NOTICES[first((await searchParams).notice) ?? ''] ?? null

  // Two independent reads, sent at the same time rather than one after another.
  const [{ products, total }, deliveries] = await Promise.all([
    listProducts(productListSchema.parse({ supplier: String(id), sort: 'status' })),
    supplierDeliveries(id),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/suppliers', label: 'Suppliers' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {supplier.name}
            {supplier.archivedAt ? <StockBadge status="archived" /> : null}
          </span>
        }
        actions={
          isAdmin ? (
            <>
              <Link href={`/suppliers/${id}/edit`} className={button.secondary}>
                <Icon name="edit" />
                Edit
              </Link>
              <ConfirmAction
                action={setSupplierArchivedAction}
                fields={{ id: String(id), archived: supplier.archivedAt ? 'false' : 'true' }}
                triggerVariant="secondary"
                trigger={supplier.archivedAt ? 'Restore' : 'Archive'}
                icon={supplier.archivedAt ? 'restore' : 'archive'}
                title={supplier.archivedAt ? `Restore ${supplier.name}?` : `Archive ${supplier.name}?`}
                body={supplier.archivedAt ? 'It will appear in forms again.' : 'It will be hidden from forms and lists. Past deliveries still show it, and you can restore it.'}
                confirmLabel={supplier.archivedAt ? 'Restore' : 'Archive'}
              />
              <ConfirmAction
                action={deleteSupplierAction}
                archiveAction={supplier.archivedAt ? undefined : setSupplierArchivedAction}
                fields={{ id: String(id) }}
                triggerVariant="dangerOutline"
                trigger="Delete"
                icon="trash"
                danger
                title={`Delete ${supplier.name}?`}
                body="Only a supplier with no deliveries in the ledger can be deleted. Products that name it as their usual supplier will simply have none."
                confirmLabel="Delete"
                pendingLabel="Deleting…"
              />
            </>
          ) : null
        }
      />
      <Flash message={notice} />

      <Sheet>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-sm text-muted">Contact</dt>
            <dd className="font-semibold">{supplier.contactPerson ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Phone</dt>
            <dd>
              {supplier.phone ? (
                <span className="flex flex-wrap items-center gap-x-3">
                  <a href={`tel:${supplier.phone}`} className="font-semibold tabular-nums underline">
                    {formatPhone(supplier.phone)}
                  </a>
                  <a href={`https://wa.me/${whatsappNumber(supplier.phone)}`} className="inline-flex items-center gap-1 text-sm underline" rel="noopener" target="_blank">
                    <Icon name="chat" className="size-4" />
                    WhatsApp<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </span>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Email</dt>
            <dd className="break-all">{supplier.email ? <a href={`mailto:${supplier.email}`} className="underline">{supplier.email}</a> : '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Address</dt>
            <dd>{supplier.address ?? '—'}</dd>
          </div>
        </dl>
        {supplier.notes ? <p className="mt-4 border-t border-line pt-3 text-[0.95rem]">{supplier.notes}</p> : null}
      </Sheet>

      <Sheet title={`Products it supplies (${total})`} id="products">
        {products.length === 0 ? (
          <p className="text-muted">No active products name this supplier as their usual supplier.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {products.map((product) => (
              <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/products/${product.id}`} className="font-semibold underline decoration-line-strong">
                  {product.name}
                </Link>
                <span className="flex items-center gap-2 text-sm tabular-nums">
                  {quantityLabel(product.totalQuantity, product.unit)}
                  <StockBadge status={product.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {total > products.length ? (
          <Link href={`/products?supplier=${id}`} className="mt-3 inline-block font-semibold underline">
            See all {total} in Products
          </Link>
        ) : null}
      </Sheet>

      <section aria-labelledby="deliveries-title">
        <h2 id="deliveries-title" className="mb-3 text-2xl">
          Recent deliveries
        </h2>
        {deliveries.length === 0 ? (
          <EmptyState title="No deliveries yet">Receipts from this supplier will appear here.</EmptyState>
        ) : (
          <MovementList movements={deliveries} caption={`Recent deliveries from ${supplier.name}, newest first`} />
        )}
      </section>
    </div>
  )
}

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
import { plural } from '@/lib/action-helpers'
import { verifySession } from '@/lib/auth/dal'
import { shortDate } from '@/lib/format'
import { listSuppliers } from '@/lib/inventory/suppliers'
import { formatPhone } from '@/lib/phone'

export const metadata: Metadata = { title: 'Suppliers' }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default function SuppliersPage({ searchParams }: PageProps<'/suppliers'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Suppliers searchParams={searchParams} />
    </Suspense>
  )
}

async function Suppliers({ searchParams }: Pick<PageProps<'/suppliers'>, 'searchParams'>) {
  const { user } = await verifySession()
  const isAdmin = user.role === 'admin'
  const notice = first((await searchParams).notice) === 'deleted' ? 'Supplier deleted.' : null
  const suppliers = await listSuppliers()

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Who we buy from. A supplier with deliveries in the ledger can’t be deleted, only archived."
        actions={
          isAdmin ? (
            <Link href="/suppliers/new" className={button.primary}>
              <Icon name="plus" />
              Add supplier
            </Link>
          ) : null
        }
      />
      <Flash message={notice} />

      {suppliers.length === 0 ? (
        <EmptyState title="No suppliers yet">{isAdmin ? <Link href="/suppliers/new">Add the first supplier</Link> : 'An admin hasn’t added any yet.'}</EmptyState>
      ) : (
        <ul aria-label="Suppliers" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {suppliers.map((supplier) => (
            <li key={supplier.id} className="flex flex-col rounded-card border border-line bg-raised p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl">
                  <Link href={`/suppliers/${supplier.id}`} className="underline decoration-line-strong">
                    {supplier.name}
                  </Link>
                </h2>
                {supplier.archivedAt ? <StockBadge status="archived" /> : null}
              </div>
              {supplier.contactPerson ? <p className="mt-1 text-sm">{supplier.contactPerson}</p> : null}
              {supplier.phone ? (
                <p className="mt-0.5 text-sm">
                  <a href={`tel:${supplier.phone}`} className="font-semibold tabular-nums underline">
                    {formatPhone(supplier.phone)}
                  </a>
                </p>
              ) : null}
              <p className="mt-2 text-sm text-muted">
                {plural(supplier.products, 'product')} · {plural(supplier.deliveries, 'delivery', 'deliveries')}
                {supplier.lastDeliveryAt ? ` · last ${shortDate(supplier.lastDeliveryAt)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

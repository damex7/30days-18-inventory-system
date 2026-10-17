import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { MovementList } from '@/components/inventory/movement-list'
import { TableSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/table-parts'
import { verifySession } from '@/lib/auth/dal'
import { MOVEMENT_LABELS, MOVEMENT_TYPES } from '@/lib/inventory/constants'
import { locationOptions } from '@/lib/inventory/locations'
import { listMovements, MOVEMENT_PAGE_SIZE } from '@/lib/inventory/movements'
import { productChoices } from '@/lib/inventory/products'
import { movementListSchema, type MovementListParams } from '@/lib/inventory/validation'
import { hrefWith } from '@/lib/url'
import { listUserOptions } from '@/lib/users'

export const metadata: Metadata = { title: 'Movements' }

export default function MovementsPage({ searchParams }: PageProps<'/movements'>) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Movements searchParams={searchParams} />
    </Suspense>
  )
}

function current(params: MovementListParams) {
  return { type: params.type, product: params.product, location: params.location, user: params.user, from: params.from, to: params.to, page: params.page }
}

/**
 * THE LEDGER: every stock change ever made, newest first, filterable.
 * Nothing here can be edited or deleted (the database refuses); a mistake
 * is corrected with a new adjustment, so both stay visible.
 */
async function Movements({ searchParams }: Pick<PageProps<'/movements'>, 'searchParams'>) {
  await verifySession()
  const params = movementListSchema.parse(await searchParams)
  const [{ movements, total }, products, locations, users] = await Promise.all([listMovements(params), productChoices(), locationOptions(), listUserOptions()])
  const base = current(params)
  const filtered = Boolean(params.type || params.product || params.location || params.user || params.from || params.to)
  const exportHref = hrefWith('/movements/export', { ...base, page: undefined })

  return (
    <div>
      <PageHeader
        title="Movements"
        description="The ledger: every receipt, sale, damage, return, transfer and adjustment, with who made it and when. Lines are never edited or deleted; mistakes are fixed with a new adjustment."
        actions={
          <>
            <a href={exportHref} className={button.secondary} download>
              <Icon name="download" />
              Export CSV
            </a>
            <Link href="/movements/new" className={button.primary}>
              <Icon name="plus" />
              Record stock
            </Link>
          </>
        }
      />

      <form action="/movements" role="search" aria-label="Filter the ledger" className="mb-4 rounded-card border border-line bg-raised p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label htmlFor="type" className="mb-1 block text-sm font-semibold">
              Type
            </label>
            <select id="type" name="type" defaultValue={params.type ?? ''} className="field block min-h-11 w-full px-2.5">
              <option value="">All types</option>
              {MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MOVEMENT_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="product" className="mb-1 block text-sm font-semibold">
              Product
            </label>
            <select id="product" name="product" defaultValue={params.product ?? ''} className="field block min-h-11 w-full px-2.5">
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="location" className="mb-1 block text-sm font-semibold">
              Location
            </label>
            <select id="location" name="location" defaultValue={params.location ?? ''} className="field block min-h-11 w-full px-2.5">
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="user" className="mb-1 block text-sm font-semibold">
              By
            </label>
            <select id="user" name="user" defaultValue={params.user ?? ''} className="field block min-h-11 w-full px-2.5">
              <option value="">Anyone</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.active ? '' : ' (deactivated)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="mb-1 block text-sm font-semibold">
              From
            </label>
            <input id="from" name="from" type="date" defaultValue={params.from} className="field block min-h-11 w-full px-2.5" />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-sm font-semibold">
              To
            </label>
            <input id="to" name="to" type="date" defaultValue={params.to} className="field block min-h-11 w-full px-2.5" />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className={button.primary}>
              <Icon name="filter" />
              Apply
            </button>
            {filtered ? (
              <Link href="/movements" className={button.ghost}>
                Clear filters
              </Link>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">Dates are days in Lagos time (WAT); “to” includes the whole day.</p>
      </form>

      <p aria-live="polite" className="mb-3 text-sm text-muted">
        {total === 0 ? 'No movements match.' : `${total.toLocaleString('en-NG')} ${total === 1 ? 'movement' : 'movements'}, newest first`}
      </p>

      {movements.length === 0 ? (
        <EmptyState title={filtered ? 'Nothing matches those filters' : 'The ledger is empty'}>
          {filtered ? <Link href="/movements">Clear the filters</Link> : <Link href="/movements/new">Record the first movement</Link>}
        </EmptyState>
      ) : (
        <>
          <MovementList movements={movements} caption={`Stock movements, newest first. Page ${params.page}.`} />
          <div className="mt-4">
            <Pagination page={params.page} total={total} pageSize={MOVEMENT_PAGE_SIZE} hrefFor={(page) => hrefWith('/movements', base, { page }, { page: 1 })} label="Ledger pages" />
          </div>
        </>
      )}
    </div>
  )
}

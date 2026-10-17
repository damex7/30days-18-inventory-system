import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { createLocationAction, deleteLocationAction, renameLocationAction, setLocationArchivedAction } from '@/app/(app)/locations/actions'
import { NameForm } from '@/components/catalogue/name-form'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { StockBadge } from '@/components/ui/stock-badge'
import { plural } from '@/lib/action-helpers'
import { verifySession } from '@/lib/auth/dal'
import { listLocations } from '@/lib/inventory/locations'
import { LIMITS } from '@/lib/inventory/validation'

export const metadata: Metadata = { title: 'Locations' }

const NOTICES: Record<string, string> = { renamed: 'Location renamed.', deleted: 'Location deleted.' }
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default function LocationsPage({ searchParams }: PageProps<'/locations'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Locations searchParams={searchParams} />
    </Suspense>
  )
}

async function Locations({ searchParams }: Pick<PageProps<'/locations'>, 'searchParams'>) {
  const { user } = await verifySession()
  const isAdmin = user.role === 'admin'
  const params = await searchParams
  const editId = Number(first(params.edit)) || null
  const notice = NOTICES[first(params.notice) ?? ''] ?? null
  const locations = await listLocations()

  return (
    <div>
      <PageHeader title="Locations" description="Where stock is kept. Every product has a stock line at every location, starting at 0." />
      <Flash message={notice} />

      {isAdmin && !editId ? (
        <Sheet title="Add a location" id="add" className="mb-6 max-w-2xl">
          <NameForm action={createLocationAction} label="Location name" submitLabel="Add location" maxLength={LIMITS.locationName} />
        </Sheet>
      ) : null}

      <ul aria-label="Locations" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {locations.map((location) => (
          <li key={location.id} className="rounded-card border border-line bg-raised p-4 shadow-card">
            {editId === location.id && isAdmin ? (
              <NameForm
                action={renameLocationAction}
                label={`Rename “${location.name}”`}
                submitLabel="Save"
                defaultValue={location.name}
                id={location.id}
                maxLength={LIMITS.locationName}
                cancelHref="/locations"
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name="store" className="text-muted" />
                  <h2 className="text-xl">{location.name}</h2>
                  {location.archivedAt ? <StockBadge status="archived" /> : null}
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-muted">Units</dt>
                    <dd className="font-semibold tabular-nums">{location.units.toLocaleString('en-NG')}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Products here</dt>
                    <dd className="font-semibold tabular-nums">{location.productsStocked}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Movements</dt>
                    <dd className="font-semibold tabular-nums">
                      <Link href={`/movements?location=${location.id}`} className="underline">
                        {location.movements.toLocaleString('en-NG')}
                      </Link>
                    </dd>
                  </div>
                </dl>
                {isAdmin ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link href={`/locations?edit=${location.id}`} className={button.small}>
                      <Icon name="edit" className="size-4" />
                      Rename
                    </Link>
                    <ConfirmAction
                      action={setLocationArchivedAction}
                      fields={{ id: String(location.id), archived: location.archivedAt ? 'false' : 'true' }}
                      trigger={location.archivedAt ? 'Restore' : 'Archive'}
                      icon={location.archivedAt ? 'restore' : 'archive'}
                      title={location.archivedAt ? `Restore “${location.name}”?` : `Archive “${location.name}”?`}
                      body={
                        location.archivedAt
                          ? 'It will appear in movement forms again.'
                          : location.units > 0
                            ? `It holds ${plural(location.units, 'unit')} of stock, so it can’t be archived until they’re transferred out.`
                            : 'It will be hidden from movement forms. Its history stays in the ledger.'
                      }
                      confirmLabel={location.archivedAt ? 'Restore' : 'Archive'}
                    />
                    <ConfirmAction
                      action={deleteLocationAction}
                      archiveAction={location.archivedAt ? undefined : setLocationArchivedAction}
                      fields={{ id: String(location.id) }}
                      trigger="Delete"
                      icon="trash"
                      danger
                      title={`Delete “${location.name}”?`}
                      body={
                        location.movements > 0
                          ? `${plural(location.movements, 'movement')} happened here, so the database will refuse. You’ll be offered to archive it instead.`
                          : 'Nothing has ever been stocked here, so it will be deleted for good.'
                      }
                      confirmLabel="Delete"
                      pendingLabel="Deleting…"
                    />
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

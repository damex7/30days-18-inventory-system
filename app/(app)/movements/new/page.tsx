import type { Metadata } from 'next'
import { Suspense } from 'react'
import { MovementForm } from '@/components/inventory/movement-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { verifySession } from '@/lib/auth/dal'
import { locationOptions } from '@/lib/inventory/locations'
import { productChoices } from '@/lib/inventory/products'
import { supplierOptions } from '@/lib/inventory/suppliers'
import { formTypeSchema } from '@/lib/inventory/validation'

export const metadata: Metadata = { title: 'Record stock' }

export default function NewMovementPage({ searchParams }: PageProps<'/movements/new'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewMovement searchParams={searchParams} />
    </Suspense>
  )
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/**
 * One form for every kind of stock movement. ?type= and ?product= come from
 * the quick-action buttons on a product page, so "Sell" opens with the
 * product and the type already chosen.
 */
async function NewMovement({ searchParams }: Pick<PageProps<'/movements/new'>, 'searchParams'>) {
  const { user } = await verifySession()
  const params = await searchParams
  const type = formTypeSchema.catch('sale').parse(first(params.type))
  const productParam = first(params.product)

  const [products, locations, suppliers] = await Promise.all([productChoices(), locationOptions(), supplierOptions()])
  const initialProductId = products.some((p) => String(p.id) === productParam) ? String(productParam) : ''

  return (
    <div className="max-w-4xl">
      <PageHeader title="Record stock" description="Every change is saved as a line in the ledger, with your name and the time. The stock level and the ledger line are saved together, or not at all." />
      <div className="rounded-card border border-line bg-raised p-4 shadow-card sm:p-6">
        <MovementForm
          products={products.map((p) => ({ id: p.id, name: p.name, sku: p.sku, category: p.categoryName, unit: p.unit, costKobo: p.costPriceKobo, supplierId: p.supplierId, byLocation: p.byLocation }))}
          locations={locations}
          suppliers={suppliers}
          isAdmin={user.role === 'admin'}
          initialType={type}
          initialProductId={initialProductId}
        />
      </div>
    </div>
  )
}

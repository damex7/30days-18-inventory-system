import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SupplierForm } from '@/components/catalogue/supplier-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'Add a supplier' }

export default function NewSupplierPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewSupplier />
    </Suspense>
  )
}

async function NewSupplier() {
  // Staff are sent to the dashboard with "That area is for admins only".
  await requireRole('admin')
  return (
    <div className="max-w-2xl">
      <PageHeader title="Add a supplier" back={{ href: '/suppliers', label: 'Suppliers' }} />
      <div className="ruled rounded-card border border-line p-5 pl-10 shadow-card sm:p-7 sm:pl-12">
        <SupplierForm cancelHref="/suppliers" />
      </div>
    </div>
  )
}

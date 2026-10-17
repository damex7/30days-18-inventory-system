import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { SupplierForm } from '@/components/catalogue/supplier-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { getSupplier } from '@/lib/inventory/suppliers'
import { formatPhone } from '@/lib/phone'

export const metadata: Metadata = { title: 'Edit supplier' }

export default function EditSupplierPage({ params }: PageProps<'/suppliers/[id]/edit'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditSupplier params={params} />
    </Suspense>
  )
}

async function EditSupplier({ params }: Pick<PageProps<'/suppliers/[id]/edit'>, 'params'>) {
  await requireRole('admin')
  const id = Number((await params).id)
  const supplier = Number.isSafeInteger(id) && id > 0 ? await getSupplier(id) : null
  if (!supplier) notFound()

  return (
    <div className="max-w-2xl">
      <PageHeader title={`Edit ${supplier.name}`} back={{ href: `/suppliers/${supplier.id}`, label: supplier.name }} />
      <div className="ruled rounded-card border border-line p-5 pl-10 shadow-card sm:p-7 sm:pl-12">
        <SupplierForm
          cancelHref={`/suppliers/${supplier.id}`}
          supplier={{
            id: supplier.id,
            name: supplier.name,
            contactPerson: supplier.contactPerson ?? '',
            phone: supplier.phone ? formatPhone(supplier.phone) : '',
            email: supplier.email ?? '',
            address: supplier.address ?? '',
            notes: supplier.notes ?? '',
          }}
        />
      </div>
    </div>
  )
}

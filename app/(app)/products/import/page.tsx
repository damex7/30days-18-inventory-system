import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ImportForm } from '@/components/inventory/import-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'Import products' }

export default function ImportPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Import />
    </Suspense>
  )
}

async function Import() {
  await requireRole('admin')
  return (
    <div>
      <PageHeader
        title="Import products"
        back={{ href: '/products', label: 'Products' }}
        description="Add many products from a spreadsheet. Every row is checked first; only the valid ones are imported, all in one transaction. Categories and suppliers must already exist (matched by name)."
      />
      <ImportForm />
    </div>
  )
}

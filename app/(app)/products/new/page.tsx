import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ProductForm } from '@/components/catalogue/product-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { categoryOptions } from '@/lib/inventory/categories'
import { supplierOptions } from '@/lib/inventory/suppliers'

export const metadata: Metadata = { title: 'Add a product' }

export default function NewProductPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewProduct />
    </Suspense>
  )
}

async function NewProduct() {
  await requireRole('admin')
  const [categories, suppliers] = await Promise.all([categoryOptions(), supplierOptions()])
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add a product" back={{ href: '/products', label: 'Products' }} />
      <div className="ruled rounded-card border border-line p-5 pl-10 shadow-card sm:p-7 sm:pl-12">
        <ProductForm categories={categories} suppliers={suppliers} />
      </div>
    </div>
  )
}

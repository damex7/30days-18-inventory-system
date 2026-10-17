import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ProductForm } from '@/components/catalogue/product-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { categoryOptions } from '@/lib/inventory/categories'
import { getProduct } from '@/lib/inventory/products'
import { supplierOptions } from '@/lib/inventory/suppliers'
import { productFormValues } from '@/lib/inventory/form-values'

export const metadata: Metadata = { title: 'Edit product' }

export default function EditProductPage({ params }: PageProps<'/products/[id]/edit'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditProduct params={params} />
    </Suspense>
  )
}

async function EditProduct({ params }: Pick<PageProps<'/products/[id]/edit'>, 'params'>) {
  await requireRole('admin')
  const id = Number((await params).id)
  const product = Number.isSafeInteger(id) && id > 0 ? await getProduct(id) : null
  if (!product) notFound()
  // Options include the product's own category and supplier even if they were archived since.
  const [categories, suppliers] = await Promise.all([categoryOptions(product.categoryId), supplierOptions(product.supplierId)])

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${product.name}`} description={`Version ${product.version}. If someone else saves first, you’ll see what they changed before anything is overwritten.`} back={{ href: `/products/${id}`, label: product.name }} />
      <div className="ruled rounded-card border border-line p-5 pl-10 shadow-card sm:p-7 sm:pl-12">
        <ProductForm
          categories={categories}
          suppliers={suppliers}
          product={{
            id: product.id,
            version: product.version,
            values: productFormValues(product),
          }}
        />
      </div>
    </div>
  )
}

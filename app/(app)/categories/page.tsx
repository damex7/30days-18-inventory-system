import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { createCategoryAction, deleteCategoryAction, renameCategoryAction, setCategoryArchivedAction } from '@/app/(app)/categories/actions'
import { NameForm } from '@/components/catalogue/name-form'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { StockBadge } from '@/components/ui/stock-badge'
import { plural } from '@/lib/action-helpers'
import { verifySession } from '@/lib/auth/dal'
import { listCategories } from '@/lib/inventory/categories'
import { LIMITS } from '@/lib/inventory/validation'

export const metadata: Metadata = { title: 'Categories' }

const NOTICES: Record<string, string> = { renamed: 'Category renamed.', deleted: 'Category deleted.' }
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default function CategoriesPage({ searchParams }: PageProps<'/categories'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Categories searchParams={searchParams} />
    </Suspense>
  )
}

async function Categories({ searchParams }: Pick<PageProps<'/categories'>, 'searchParams'>) {
  const { user } = await verifySession()
  const isAdmin = user.role === 'admin'
  const params = await searchParams
  const editId = Number(first(params.edit)) || null
  const notice = NOTICES[first(params.notice) ?? ''] ?? null
  const categories = await listCategories()

  return (
    <div>
      <PageHeader
        title="Categories"
        description={
          isAdmin
            ? 'Shelves for grouping products. A category that products use can’t be deleted; archive it to hide it from forms.'
            : 'Shelves for grouping products. Only an admin can change them.'
        }
      />
      <Flash message={notice} />

      {isAdmin && !editId ? (
        <Sheet title="Add a category" id="add" className="mb-6 max-w-2xl">
          <NameForm action={createCategoryAction} label="Category name" submitLabel="Add category" maxLength={LIMITS.categoryName} />
        </Sheet>
      ) : null}

      {categories.length === 0 ? (
        <EmptyState title="No categories yet">{isAdmin ? 'Add the first one above, e.g. “Drinks”.' : 'An admin hasn’t added any yet.'}</EmptyState>
      ) : (
        <ul aria-label="Categories" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {categories.map((category) => {
            const total = category.activeProducts + category.archivedProducts
            return (
              <li key={category.id} className="rounded-card border border-line bg-raised p-4 shadow-card">
                {editId === category.id && isAdmin ? (
                  <NameForm
                    action={renameCategoryAction}
                    label={`Rename “${category.name}”`}
                    submitLabel="Save"
                    defaultValue={category.name}
                    id={category.id}
                    maxLength={LIMITS.categoryName}
                    cancelHref="/categories"
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl">{category.name}</h2>
                      {category.archivedAt ? <StockBadge status="archived" /> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      <Link href={`/products?category=${category.id}`} className="font-semibold text-ink underline">
                        {plural(category.activeProducts, 'product')}
                      </Link>
                      {category.archivedProducts ? ` · ${category.archivedProducts} archived` : ''}
                    </p>
                    {isAdmin ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Link href={`/categories?edit=${category.id}`} className={button.small}>
                          <Icon name="edit" className="size-4" />
                          Rename
                        </Link>
                        {category.archivedAt ? (
                          <ConfirmAction
                            action={setCategoryArchivedAction}
                            fields={{ id: String(category.id), archived: 'false' }}
                            trigger="Restore"
                            icon="restore"
                            title={`Restore “${category.name}”?`}
                            body="It will appear in product forms again."
                            confirmLabel="Restore"
                          />
                        ) : (
                          <ConfirmAction
                            action={setCategoryArchivedAction}
                            fields={{ id: String(category.id), archived: 'true' }}
                            trigger="Archive"
                            icon="archive"
                            title={`Archive “${category.name}”?`}
                            body="It will be hidden from product forms. Products already in it keep it, and you can restore it at any time."
                            confirmLabel="Archive"
                            pendingLabel="Archiving…"
                          />
                        )}
                        <ConfirmAction
                          action={deleteCategoryAction}
                          archiveAction={category.archivedAt ? undefined : setCategoryArchivedAction}
                          fields={{ id: String(category.id) }}
                          trigger="Delete"
                          icon="trash"
                          danger
                          title={`Delete “${category.name}”?`}
                          body={
                            total > 0
                              ? `${plural(total, 'product')} ${total === 1 ? 'uses' : 'use'} this category, so the database will refuse. You’ll be offered to archive it instead.`
                              : 'No products use it, so it will be deleted for good.'
                          }
                          confirmLabel="Delete"
                          pendingLabel="Deleting…"
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

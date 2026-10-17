import type { Metadata } from 'next'
import Link from 'next/link'
import { Mark } from '@/components/brand/mark'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Page not found' }

/** Any URL that matches no route, and every notFound() call (an unknown product id, say). */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <Mark className="mb-5 size-16" />
        <p className="font-semibold tracking-wide text-muted uppercase">404</p>
        <h1 className="mt-1 text-4xl">Not in the book</h1>
        <p className="mt-3 max-w-sm text-muted">
          There’s no page at this address. The link may be mistyped, or the product, supplier or record was deleted.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className={button.primary}>
            Dashboard
          </Link>
          <Link href="/products" className={button.secondary}>
            All products
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

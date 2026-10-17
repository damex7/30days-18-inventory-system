import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { MovementList } from '@/components/inventory/movement-list'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Flash } from '@/components/ui/flash'
import { Icon, type IconName } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { verifySession } from '@/lib/auth/dal'
import { cn } from '@/lib/cn'
import { recentMovements } from '@/lib/inventory/movements'
import { dashboardSummary } from '@/lib/inventory/reports'
import { formatNaira } from '@/lib/money'
import { site } from '@/lib/site'

export const metadata: Metadata = { title: 'Dashboard' }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  )
}

async function Dashboard({ searchParams }: Pick<PageProps<'/dashboard'>, 'searchParams'>) {
  const { user } = await verifySession()
  const params = await searchParams
  const denied = first(params.denied)
  const notice = first(params.notice) === 'password-set' ? 'Your password is set. Welcome to Ìpamọ́.' : first(params.notice) === 'password-reset' ? 'Your password was reset and every other device signed out.' : null

  // Two independent queries, sent together.
  const [summary, movements] = await Promise.all([dashboardSummary(), recentMovements(10)])
  const margin = summary.retailValue - summary.costValue

  return (
    <div className="space-y-6">
      <PageHeader title={`Good day, ${user.name.split(' ')[0]}`} description={site.shopName} />
      <Flash message={notice} />
      {denied ? (
        <Notice tone="warning" title={denied === 'verify' ? 'Please confirm your email address first' : 'That area is for admins only'}>
          <p>{denied === 'verify' ? 'Admin pages need a confirmed email address. Use the link we sent you.' : 'Ask the shop’s admin if you need to change products, suppliers, locations or users.'}</p>
        </Notice>
      ) : null}

      <section aria-labelledby="figures-title">
        <h2 id="figures-title" className="sr-only">
          Stock at a glance
        </h2>
        {/* Phones: the three counts share a row, each amount gets a full row.
            Wide screens: five across. */}
        <div className="grid grid-cols-6 gap-3 lg:grid-cols-5">
          <Tile label="Products" value={summary.products.toLocaleString('en-NG')} sub={`${summary.units.toLocaleString('en-NG')} units in stock`} icon="box" href="/products" className="col-span-2 lg:col-span-1" />
          <Tile label="Stock value at cost" value={formatNaira(summary.costValue)} sub="What we paid" icon="receipt" money className="col-span-6 max-lg:order-last lg:col-span-1" />
          <Tile label="At selling price" value={formatNaira(summary.retailValue)} sub={`${formatNaira(margin)} potential margin`} icon="report" money className="col-span-6 max-lg:order-last lg:col-span-1" />
          <Tile
            label="Low stock"
            value={summary.low.toLocaleString('en-NG')}
            sub="At or below reorder level"
            icon="lowStock"
            tone={summary.low > 0 ? 'warning' : undefined}
            href="/products?status=low&sort=status"
            className="col-span-2 lg:col-span-1"
          />
          <Tile
            label="Out of stock"
            value={summary.out.toLocaleString('en-NG')}
            sub="None left anywhere"
            icon="outOfStock"
            tone={summary.out > 0 ? 'danger' : undefined}
            href="/products?status=out"
            className="col-span-2 lg:col-span-1"
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/movements/new?type=sale" className={button.primary}>
          <Icon name="receipt" />
          Record a sale
        </Link>
        <Link href="/movements/new?type=receive" className={button.secondary}>
          <Icon name="download" />
          Receive goods
        </Link>
        <Link href="/reports/low-stock" className={button.secondary}>
          <Icon name="report" />
          What to reorder
        </Link>
      </div>

      <section aria-labelledby="recent-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="recent-title" className="text-2xl">
            Last 10 movements
          </h2>
          <Link href="/movements" className="text-sm font-semibold underline">
            The whole ledger
          </Link>
        </div>
        {movements.length === 0 ? (
          <EmptyState title="No movements yet">
            <Link href="/movements/new?type=receive">Receive the first stock</Link>
          </EmptyState>
        ) : (
          <MovementList movements={movements} caption="The 10 most recent stock movements, newest first" />
        )}
      </section>
    </div>
  )
}

/**
 * A figure tile. Low and out of stock carry their status colour on the
 * edge AND an icon AND words, so colour is never the only signal.
 */
function Tile({ label, value, sub, icon, tone, href, className, money = false }: { label: string; value: ReactNode; sub: string; icon: IconName; tone?: 'warning' | 'danger'; href?: string; className?: string; money?: boolean }) {
  const body = (
    <>
      <p className={cn('flex gap-1.5 text-sm font-semibold text-muted', money ? 'items-center' : 'flex-col max-lg:leading-tight lg:flex-row lg:items-center')}>
        <Icon name={icon} className={cn('size-4', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger')} />
        {label}
      </p>
      <p className={cn('mt-1.5 font-bold tabular-nums', money ? 'text-2xl whitespace-nowrap lg:text-xl xl:text-[1.4rem]' : 'text-2xl sm:text-[1.7rem]', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger')}>{value}</p>
      <p className="mt-0.5 text-xs leading-snug text-muted">{sub}</p>
    </>
  )
  const classes = cn(
    'block rounded-card border bg-raised p-3 shadow-card sm:p-4',
    tone === 'warning' ? 'border-l-4 border-warning' : tone === 'danger' ? 'border-l-4 border-danger' : 'border-line',
    href && 'no-underline transition-colors hover:bg-canary/50',
    className,
  )
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the dashboard" className="space-y-6">
      <div className="skeleton h-10 w-72 max-w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton h-28 rounded-card" />
        ))}
      </div>
      <div className="skeleton h-80 rounded-card" />
    </div>
  )
}

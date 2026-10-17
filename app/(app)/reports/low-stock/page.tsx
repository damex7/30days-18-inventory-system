import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { CopyButton } from '@/components/inventory/copy-button'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { StockBadge } from '@/components/ui/stock-badge'
import { TableFrame, Th } from '@/components/ui/table-parts'
import { verifySession } from '@/lib/auth/dal'
import { quantityLabel, stockStatus, suggestedReorder } from '@/lib/inventory/constants'
import { locationOptions } from '@/lib/inventory/locations'
import { lowStockReport, type LowStockRow } from '@/lib/inventory/reports'
import { formatNaira, lineValue } from '@/lib/money'
import { formatPhone, whatsappNumber } from '@/lib/phone'
import { site } from '@/lib/site'

export const metadata: Metadata = { title: 'Low stock' }

export default function LowStockPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LowStock />
    </Suspense>
  )
}

type Group = { key: string; supplierId: number | null; name: string; contact: string | null; phone: string | null; archived: boolean; rows: LowStockRow[] }

/** Rows arrive sorted by supplier name (no supplier last), so grouping is one pass. */
function groupBySupplier(rows: LowStockRow[]): Group[] {
  const groups: Group[] = []
  for (const row of rows) {
    const key = row.supplierId ? String(row.supplierId) : 'none'
    let group = groups.find((g) => g.key === key)
    if (!group) {
      group = { key, supplierId: row.supplierId, name: row.supplierName ?? 'No usual supplier', contact: row.supplierContact, phone: row.supplierPhone, archived: row.supplierArchived, rows: [] }
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

/** A plain-text order list, ready to paste into WhatsApp. */
function whatsappMessage(group: Group): string {
  const greeting = group.contact ? `Hello ${group.contact.split(' ')[0]},` : 'Hello,'
  const lines = group.rows.map((r) => `• ${r.name} (${r.sku}): ${quantityLabel(suggestedReorder(r.total, r.reorderLevel), r.unit)}`)
  return [greeting, '', `This is ${site.shopName}. Please can we order:`, '', ...lines, '', 'Kindly confirm the price and when you can deliver. Thank you.'].join('\n')
}

async function LowStock() {
  await verifySession()
  const [rows, locations] = await Promise.all([lowStockReport(), locationOptions()])
  const groups = groupBySupplier(rows)
  const totalCost = rows.reduce((sum, r) => sum + lineValue(suggestedReorder(r.total, r.reorderLevel), r.costPriceKobo), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Low stock"
        description={
          <>
            Everything at or below its reorder level, grouped by usual supplier. <strong className="text-ink">Suggested order = twice the reorder level, minus what’s in stock</strong> (at
            least 1), so the next order isn’t due again straight away.
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Nothing is low">Every product is above its reorder level. Well kept!</EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted">
            {rows.length} {rows.length === 1 ? 'product' : 'products'} to reorder · about {formatNaira(totalCost)} at today’s cost prices
          </p>
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`group-${group.key}`} className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id={`group-${group.key}`} className="flex flex-wrap items-center gap-2 text-2xl">
                    {group.supplierId ? (
                      <Link href={`/suppliers/${group.supplierId}`} className="underline decoration-line-strong">
                        {group.name}
                      </Link>
                    ) : (
                      group.name
                    )}
                    {group.archived ? <StockBadge status="archived" /> : null}
                  </h2>
                  <p className="text-sm text-muted">
                    {group.contact ?? (group.supplierId ? 'No contact person' : 'Bought at the market')}
                    {group.phone ? (
                      <>
                        {' · '}
                        <a href={`tel:${group.phone}`} className="font-semibold text-ink tabular-nums underline">
                          {formatPhone(group.phone)}
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <CopyButton text={whatsappMessage(group)} label="Copy as WhatsApp message" />
                  {group.phone ? (
                    <a href={`https://wa.me/${whatsappNumber(group.phone)}?text=${encodeURIComponent(whatsappMessage(group))}`} target="_blank" rel="noopener" className={button.ghost}>
                      <Icon name="chat" />
                      Open WhatsApp<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : null}
                </div>
              </div>

              <TableFrame>
                <table className="w-full min-w-[40rem] text-left text-[0.95rem]">
                  <caption className="sr-only">Low-stock products from {group.name}</caption>
                  <thead>
                    <tr>
                      <Th>Product</Th>
                      {locations.map((l) => (
                        <Th key={l.id} align="right">
                          {l.name}
                        </Th>
                      ))}
                      <Th align="right">Total</Th>
                      <Th align="right">Reorder at</Th>
                      <Th>Status</Th>
                      <Th align="right">Suggested order</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((r) => (
                      <tr key={r.id}>
                        <th scope="row" className="px-3 py-2.5 font-normal">
                          <Link href={`/products/${r.id}`} className="font-semibold underline decoration-line-strong">
                            {r.name}
                          </Link>
                          <span className="block font-mono text-xs text-muted">{r.sku}</span>
                        </th>
                        {locations.map((l) => (
                          <td key={l.id} className="px-3 py-2.5 text-right tabular-nums">
                            {r.byLocation[String(l.id)] ?? 0}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.total}</td>
                        <td className="px-3 py-2.5 text-right text-muted tabular-nums">{r.reorderLevel}</td>
                        <td className="px-3 py-2.5">
                          <StockBadge status={stockStatus(r.total, r.reorderLevel)} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap tabular-nums">{quantityLabel(suggestedReorder(r.total, r.reorderLevel), r.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

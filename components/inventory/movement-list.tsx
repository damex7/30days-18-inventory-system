import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icon'
import { TableFrame, Th } from '@/components/ui/table-parts'
import { cn } from '@/lib/cn'
import { longDate } from '@/lib/format'
import { MOVEMENT_LABELS, quantityLabel, type MovementType } from '@/lib/inventory/constants'
import type { Movement } from '@/lib/inventory/rows'
import { formatNaira } from '@/lib/money'

const TYPE_ICONS: Record<MovementType, IconName> = {
  receive: 'download',
  sale: 'receipt',
  damage: 'alert',
  return: 'restore',
  transfer_out: 'transfer',
  transfer_in: 'transfer',
  adjustment: 'edit',
}

/** The type as an icon and a word, never colour alone. */
export function MovementType({ type }: { type: MovementType }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon name={TYPE_ICONS[type]} className="size-4 text-muted" />
      {MOVEMENT_LABELS[type]}
    </span>
  )
}

/** "+24" or "−3": the sign carries the meaning; a real minus sign (−) reads better than a hyphen. */
export function Change({ value }: { value: number }) {
  return <span className={cn('font-bold tabular-nums', value > 0 ? 'text-success' : 'text-ink')}>{value > 0 ? `+${value.toLocaleString('en-NG')}` : `−${Math.abs(value).toLocaleString('en-NG')}`}</span>
}

function Details({ movement }: { movement: Movement }) {
  const parts: string[] = []
  if (movement.supplierName) parts.push(movement.supplierName)
  if (movement.unitCostKobo !== null) parts.push(`${formatNaira(movement.unitCostKobo)} each`)
  if (movement.reference) parts.push(movement.reference)
  return (
    <>
      {parts.length ? <span className="block">{parts.join(' · ')}</span> : null}
      {movement.note ? <span className="block text-muted italic">“{movement.note}”</span> : null}
    </>
  )
}

/**
 * A list of ledger rows. On wide screens an accessible table (caption,
 * th scope="col"); on a phone the same rows as cards, because seven
 * columns can't fit in 360px. Archived products still show here (history
 * is complete), marked as archived.
 */
export function MovementList({ movements, caption, showProduct = true }: { movements: Movement[]; caption: string; showProduct?: boolean }) {
  return (
    <>
      <div className="max-md:hidden">
        <TableFrame>
          <table className="w-full text-left text-[0.95rem]">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <Th>When</Th>
                {showProduct ? <Th>Product</Th> : null}
                <Th>Type</Th>
                <Th>Location</Th>
                <Th align="right">Change</Th>
                <Th align="right">After</Th>
                <Th>By</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="align-top">
                  <td className="px-3 py-2.5 text-sm whitespace-nowrap text-muted tabular-nums">{longDate(m.createdAt)}</td>
                  {showProduct ? (
                    <td className="px-3 py-2.5">
                      <Link href={`/products/${m.productId}`} className="font-semibold underline decoration-line-strong">
                        {m.productName}
                      </Link>
                      <span className="block font-mono text-xs text-muted">
                        {m.productSku}
                        {m.productArchived ? ' · archived' : ''}
                      </span>
                    </td>
                  ) : null}
                  <td className="px-3 py-2.5">
                    <MovementType type={m.type} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{m.locationName}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Change value={m.quantityChange} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{m.quantityAfter.toLocaleString('en-NG')}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{m.userName}</td>
                  <td className="max-w-64 px-3 py-2.5 text-sm">
                    <Details movement={m} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      </div>

      <ul aria-label={caption} className="space-y-2 md:hidden">
        {movements.map((m) => (
          <li key={m.id} className="rounded-card border border-line bg-raised p-3.5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {showProduct ? (
                  <Link href={`/products/${m.productId}`} className="font-semibold underline decoration-line-strong">
                    {m.productName}
                  </Link>
                ) : null}
                <p className="text-sm">
                  <MovementType type={m.type} /> · {m.locationName}
                </p>
              </div>
              <p className="shrink-0 text-right text-lg">
                <Change value={m.quantityChange} />
                <span className="block text-xs text-muted">{quantityLabel(m.quantityAfter, m.productUnit)} after</span>
              </p>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {longDate(m.createdAt)} · {m.userName}
            </p>
            <div className="mt-1 text-sm">
              <Details movement={m} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

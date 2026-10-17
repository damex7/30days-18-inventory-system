import type { StockStatus } from '@/lib/inventory/constants'
import { cn } from '@/lib/cn'
import { Icon } from './icon'

const LOOKS: Record<StockStatus | 'archived', { label: string; icon: 'outOfStock' | 'lowStock' | 'inStock' | 'archive'; className: string }> = {
  // A solid stamp: the one status that needs action first.
  out: { label: 'Out', icon: 'outOfStock', className: 'bg-danger text-on-danger border-danger' },
  // Biro blue on a pale wash.
  low: { label: 'Low', icon: 'lowStock', className: 'bg-warning-soft text-warning border-warning' },
  in: { label: 'In stock', icon: 'inStock', className: 'bg-success-soft text-success border-success' },
  archived: { label: 'Archived', icon: 'archive', className: 'bg-sunken text-muted border-line-strong' },
}

/**
 * A stock status as a small stamp. Colour is NEVER the only signal: each
 * status has its own icon shape (✕ box, ▼ triangle, ✓ box) and a word, so
 * it reads the same in greyscale, to colour-blind staff and to a screen reader.
 */
export function StockBadge({ status, className }: { status: StockStatus | 'archived'; className?: string }) {
  const look = LOOKS[status]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-control border px-1.5 py-0.5 text-xs font-bold whitespace-nowrap uppercase', look.className, className)}>
      <Icon name={look.icon} className="size-3.5" />
      {look.label}
    </span>
  )
}

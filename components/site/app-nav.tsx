// CLIENT COMPONENT: it highlights the current page with usePathname.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

type NavLink = { href: string; label: string; icon: IconName }

const STAFF_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/products', label: 'Products', icon: 'box' },
  { href: '/movements', label: 'Movements', icon: 'receipt' },
  { href: '/reports/low-stock', label: 'Low stock', icon: 'report' },
]

const ADMIN_LINKS: NavLink[] = [
  { href: '/categories', label: 'Categories', icon: 'tag' },
  { href: '/suppliers', label: 'Suppliers', icon: 'truck' },
  { href: '/locations', label: 'Locations', icon: 'store' },
  { href: '/admin/users', label: 'Users', icon: 'users' },
]

/** "/products/12/edit" is inside Products; "/movements/new" is the Record button's, not Movements'. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/movements') return pathname === '/movements'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The strip of tabs under the header. On a phone it scrolls sideways
 * (one row, no hidden menu to open). The admin tabs only show for admins,
 * but that's just tidiness: each of those pages and actions checks the
 * role on the server (requireRole), so typing the URL gets staff nowhere.
 */
export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const links = isAdmin ? [...STAFF_LINKS, ...ADMIN_LINKS] : STAFF_LINKS
  return (
    <nav aria-label="Main" className="border-b border-line bg-paper">
      <ul className="mx-auto flex max-w-page gap-0.5 overflow-x-auto px-2 [scrollbar-width:thin] sm:px-4">
        {links.map((link, index) => {
          const active = isActive(pathname, link.href)
          return (
            <li key={link.href} className={cn('shrink-0', isAdmin && index === STAFF_LINKS.length && 'ml-2 border-l border-line pl-2')}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // A rose underline (the duplicate copy) marks "you are here";
                  // aria-current says it to screen readers.
                  'relative flex min-h-12 items-center gap-2 rounded-control px-3 text-[0.95rem] font-semibold no-underline transition-colors',
                  active
                    ? 'text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-pill after:bg-rose'
                    : 'text-muted hover:bg-canary hover:text-ink',
                )}
              >
                <Icon name={link.icon} className={cn('size-[1.1rem]', active && 'text-rose')} />
                {link.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

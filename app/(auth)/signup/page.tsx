import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard } from '@/components/site/auth-card'
import { button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Accounts' }

/**
 * SIGN-UP IS CLOSED (Day 18). Day 17 let anyone create an account; a shop's
 * stock records shouldn't be open to anyone with an email address. Only an
 * admin creates accounts, at /admin/users. The page stays so old links and
 * habits land somewhere helpful instead of a 404.
 */
export default function SignUpPage() {
  return (
    <AuthCard title="Accounts are made by the admin" intro="Ìpamọ́ keeps one shop’s stock records, so there’s no public sign-up.">
      <div className="space-y-4">
        <p>
          If you work here, ask the shop’s admin to create your account. They’ll give you a temporary password, and you’ll choose your own the first
          time you sign in.
        </p>
        <Link href="/login" className={`${button.primary} w-full`}>
          Go to sign in
        </Link>
      </div>
    </AuthCard>
  )
}

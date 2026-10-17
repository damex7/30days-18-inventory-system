// ROOT LAYOUT: only what every page needs: <html>/<body>, fonts, the
// no-flash theme script and the skip link. Headers live one level down, in
// each route group's layout.

import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono, Public_Sans } from 'next/font/google'
import { site } from '@/lib/site'
import { themeScript } from '@/lib/theme'
import './globals.css'

// next/font downloads the fonts at build time and serves them from this
// site: no request to Google from the visitor's browser and no layout jump.
//
// GLYPH CHECK: each font's character map was parsed for ₦ (U+20A6), Ì, ọ,
// ẹ, ṣ and the combining acute and grave, and for the `tnum` (tabular
// figures) and `mark`/`mkmk` (stacked accents) features. Archivo and
// Public Sans have all of them; IBM Plex Sans has no `tnum`, and Barlow
// Condensed and Schibsted Grotesk have no ₦, so they were ruled out. The
// "vietnamese" subset holds ọ, ẹ and the combining marks.
const archivo = Archivo({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  // The width axis: headings are set at 82% width (globals.css), the
  // condensed look of a receipt book's printed header.
  axes: ['wdth'],
  variable: '--font-archivo',
})
const publicSans = Public_Sans({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-public-sans',
})
// SKUs only (plain ASCII), so its missing ṣ doesn't matter.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  preload: false,
})

export const metadata: Metadata = {
  title: {
    default: `${site.name}: ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  // An internal stock tool: keep it out of search engines.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f3ea' },
    { media: '(prefers-color-scheme: dark)', color: '#121214' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      // The <head> script sets data-theme before React loads, so the server's
      // <html> and the browser's may differ ON PURPOSE. This silences that
      // one expected warning, for this element's attributes only.
      suppressHydrationWarning
      className={`${archivo.variable} ${publicSans.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh text-base leading-relaxed antialiased">
        {/* SKIP LINK: the first Tab stop on every page. */}
        <a
          href="#main"
          className="sr-only z-50 rounded-control bg-carbon px-4 py-2 font-semibold text-on-carbon focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}

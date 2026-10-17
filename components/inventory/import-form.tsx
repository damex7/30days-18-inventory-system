'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { confirmImportAction, previewImportAction, type ImportState } from '@/app/(app)/products/import/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { SubmitButton } from '@/components/forms/submit-button'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { TableFrame, Th } from '@/components/ui/table-parts'
import { cn } from '@/lib/cn'

/**
 * Step 1: choose a file → the server checks every row and sends back a
 * preview. Step 2: "Import N products" posts the same text back, the server
 * checks it again and inserts only the valid rows in one transaction.
 */
export function ImportForm() {
  const [preview, previewAction] = useActionState<ImportState, FormData>(previewImportAction, { status: 'idle' })
  const [confirm, confirmAction] = useActionState<ImportState, FormData>(confirmImportAction, { status: 'idle' })
  const result = preview.preview
  const problems = result ? result.rows.filter((r) => r.errors.length) : []

  return (
    <div className="space-y-6">
      <form action={previewAction} className="rounded-card border border-line bg-raised p-5 shadow-card">
        <ErrorSummary state={preview} labels={{}} />
        <label htmlFor="file" className="mb-1.5 block font-semibold">
          CSV file
        </label>
        <p id="file-hint" className="-mt-1 mb-2 text-sm text-muted">
          Up to 1 MB and 1,000 rows. Columns: sku, name, category, supplier, unit, cost_price, selling_price, reorder_level.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input id="file" name="file" type="file" accept=".csv,text/csv" required aria-describedby="file-hint" className="field block min-h-12 w-full p-2 file:mr-3 file:rounded-control file:border-0 file:bg-canary file:px-3 file:py-1.5 file:font-semibold file:text-ink" />
          <SubmitButton variant="secondary" pendingLabel="Checking…" className="shrink-0">
            <Icon name="search" />
            Check the file
          </SubmitButton>
        </div>
      </form>

      {result ? (
        <section aria-labelledby="preview-title" className="space-y-4">
          <div role="status" className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="preview-title" className="text-2xl">
              Preview of {result.fileName}
            </h2>
            <p className="font-semibold">
              <span className="text-success">{result.valid} ready</span>
              {problems.length ? (
                <>
                  {' · '}
                  <span className="text-danger">
                    {problems.length} with problems (will be skipped)
                  </span>
                </>
              ) : null}
            </p>
          </div>

          <TableFrame>
            <table className="w-full min-w-[48rem] text-left text-sm">
              <caption className="sr-only">Each row of the file and whether it can be imported</caption>
              <thead>
                <tr>
                  <Th>Line</Th>
                  <Th>Result</Th>
                  <Th>SKU</Th>
                  <Th>Name</Th>
                  <Th>Category</Th>
                  <Th>Unit</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Price</Th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.line} className={cn('align-top', row.errors.length > 0 && 'bg-danger-soft/40')}>
                    <td className="px-3 py-2 text-muted tabular-nums">{row.line}</td>
                    <td className="px-3 py-2">
                      {row.errors.length ? (
                        <ul className="space-y-0.5 text-danger">
                          {row.errors.map((e) => (
                            <li key={e} className="flex gap-1">
                              <Icon name="errorCircle" className="mt-0.5 size-3.5" />
                              <span>
                                <span className="sr-only">Problem: </span>
                                {e}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-success">
                          <Icon name="check" className="size-4" /> Ready
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.values.sku}</td>
                    <td className="px-3 py-2">{row.values.name}</td>
                    <td className="px-3 py-2">{row.values.category}</td>
                    <td className="px-3 py-2">{row.values.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.values.cost_price}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.values.selling_price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>

          {result.valid > 0 ? (
            <form action={confirmAction} className="flex flex-wrap items-center gap-3">
              <ErrorSummary state={confirm} labels={{}} />
              {/* The same text goes back to the server, which checks it all again. */}
              <input type="hidden" name="csv" value={result.csv} />
              <SubmitButton pendingLabel="Importing…">
                <Icon name="upload" />
                Import {result.valid} {result.valid === 1 ? 'product' : 'products'}
              </SubmitButton>
              <p className="text-sm text-muted">They start with 0 in stock. Record receipts to add stock.</p>
            </form>
          ) : (
            <p className="font-semibold text-danger">No row can be imported. Fix the file and check it again.</p>
          )}
        </section>
      ) : null}

      <p className="text-sm">
        <Link href="/products/import/template" className={button.ghost} prefetch={false}>
          <Icon name="download" />
          Download a template
        </Link>
      </p>
    </div>
  )
}

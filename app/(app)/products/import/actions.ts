// CSV IMPORT SERVER ACTIONS (admin only).
//
// Two steps, both on the server:
// 1. previewImportAction reads the uploaded file and checks every row.
//    Nothing is written. The page shows each row with its problems.
// 2. confirmImportAction receives the SAME text back (a hidden field) and
//    checks it AGAIN before inserting. The browser could have changed the
//    text, and the catalogue may have changed in between, so the preview's
//    verdict is never trusted.
'use server'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/dal'
import { checkImport, importProducts, MAX_IMPORT_BYTES, type ImportRow } from '@/lib/inventory/import'
import { failed, field, type FormState } from '@/lib/validation'

export type ImportState = FormState & { preview?: { rows: Omit<ImportRow, 'product'>[]; valid: number; csv: string; fileName: string } }

export async function previewImportAction(_previous: ImportState, formData: FormData): Promise<ImportState> {
  await requireRole('admin')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return failed('Choose a CSV file first.')
  if (file.size > MAX_IMPORT_BYTES) return failed('That file is over 1 MB. Split it into smaller files.')
  if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') return failed('That doesn’t look like a CSV file. In Excel, use File › Save As › CSV UTF-8.')

  const text = await file.text()
  const check = await checkImport(text)
  if (!check.ok) return failed(check.message)

  return {
    status: 'success',
    message: `${check.valid} of ${check.rows.length} rows are ready to import.`,
    // `product` (the parsed values) stays on the server; the page only needs what to show.
    preview: { rows: check.rows.map(({ line, values, errors }) => ({ line, values, errors })), valid: check.valid, csv: text, fileName: file.name },
    submissionId: Date.now(),
  }
}

export async function confirmImportAction(_previous: ImportState, formData: FormData): Promise<ImportState> {
  await requireRole('admin')
  const text = field(formData, 'csv')
  const check = await checkImport(text)
  if (!check.ok) return failed(check.message)

  const valid = check.rows.flatMap((r) => (r.product ? [r.product] : []))
  if (valid.length === 0) return failed('None of the rows are valid, so nothing was imported.')

  const { inserted, skipped } = await importProducts(valid)
  redirect(`/products?notice=imported&count=${inserted}&skipped=${skipped + (check.rows.length - valid.length)}`)
}

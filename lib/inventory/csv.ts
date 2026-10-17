// CSV, by hand (no library): a small RFC 4180 reader and writer.
//
// RFC 4180 in short: rows end with a line break; fields are separated by
// commas; a field containing a comma, a quote or a line break is wrapped
// in double quotes, and a quote inside it is doubled ("").

/**
 * CSV INJECTION ("formula injection"). Spreadsheet apps treat a cell that
 * starts with = + - @ (or a tab or carriage return) as a FORMULA. A product
 * named =HYPERLINK("http://evil.example","Click") would become a live link
 * in the owner's Excel, and older formulas could even run commands. So any
 * text cell starting with one of those characters gets a leading
 * apostrophe, which spreadsheets show as plain text. Plain numbers like -3
 * (a sale in the ledger) are left alone.
 */
function neutralise(cell: string): string {
  if (/^[=+\-@\t\r]/.test(cell) && !/^-?\d+(\.\d+)?$/.test(cell)) return `'${cell}`
  return cell
}

function quote(cell: string): string {
  const safe = neutralise(cell)
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * Rows → CSV text, with CRLF line endings (what Excel expects) and a UTF-8
 * byte-order mark, so Excel reads "Ìpamọ́" and "₦" correctly instead of
 * guessing an old Windows code page.
 */
export function toCsv(rows: (string | number | null)[][]): string {
  return '﻿' + rows.map((row) => row.map((cell) => quote(cell === null ? '' : String(cell))).join(',')).join('\r\n') + '\r\n'
}

/**
 * CSV text → rows of fields. A small state machine reading one character
 * at a time: inside quotes, commas and line breaks are part of the field
 * and "" is one quote; outside, a comma ends the field and a line break
 * ends the row. Accepts \n or \r\n, ignores a leading BOM and blank lines.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let fieldText = ''
  let inQuotes = false
  const input = text.replace(/^﻿/, '')

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          fieldText += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        fieldText += char
      }
    } else if (char === '"' && fieldText === '') {
      inQuotes = true
    } else if (char === ',') {
      row.push(fieldText)
      fieldText = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(fieldText)
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
      fieldText = ''
    } else {
      fieldText += char
    }
  }
  row.push(fieldText)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

/** "ipamo-products-2026-10-17.csv", dated in Lagos. */
export function csvFilename(kind: string): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())
  return `ipamo-${kind}-${day}.csv`
}

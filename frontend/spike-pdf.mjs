// Throwaway spike: reconstruct transcript lines from pdfjs text items.
import fs from 'fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const PDF = '/Users/ujbook/Downloads/B_Mozzumdar_Transcript.pdf'
const data = new Uint8Array(fs.readFileSync(PDF))
const doc = await getDocument({ data }).promise

const COLUMN_SPLIT = 290 // x below this = left page-column, above = right

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p)
  const items = (await page.getTextContent()).items
    .filter((it) => it.str.trim())
    .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }))

  // Split into the two page-columns, build lines (group by y), order top-down.
  const lines = []
  for (const col of [items.filter((i) => i.x < COLUMN_SPLIT), items.filter((i) => i.x >= COLUMN_SPLIT)]) {
    const rows = new Map() // rounded-y -> items
    for (const it of col) {
      const key = Math.round(it.y)
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key).push(it)
    }
    ;[...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // top of page first
      .forEach(([, its]) => {
        lines.push(its.sort((a, b) => a.x - b.x).map((i) => i.str).join('  '))
      })
  }

  console.log(`\n===== PAGE ${p}: ${lines.length} reconstructed lines =====`)
  lines.forEach((l) => console.log(l))
}

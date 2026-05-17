import * as pdfjs from 'pdfjs-dist'

// Set worker path for pdfjs (needed for browser usage)
// Using the minified worker from the distribution package
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const COLUMN_SPLIT = 290

/**
 * Reconstructs lines from a PDF page, handling the two-column layout.
 */
async function reconstructLines(page) {
  const textContent = await page.getTextContent()
  const items = textContent.items
    .filter((it) => it.str.trim())
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5]
    }))

  const lines = []
  const leftCol = items.filter((i) => i.x < COLUMN_SPLIT)
  const rightCol = items.filter((i) => i.x >= COLUMN_SPLIT)

  for (const col of [leftCol, rightCol]) {
    const rows = new Map()
    for (const it of col) {
      const key = Math.round(it.y)
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key).push(it)
    }

    const sortedY = [...rows.entries()].sort((a, b) => b[0] - a[0])
    for (const [, its] of sortedY) {
      lines.push(its.sort((a, b) => a.x - b.x).map((i) => i.str).join('  '))
    }
  }
  return lines
}

/** Season ordering within an academic year (Winter earliest, Fall latest). */
const SEASON_ORDER = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 }

/** A sortable ordinal for a term like "2026 Fall" — bigger means later. */
function termOrdinal(year, season) {
  return year * 4 + (SEASON_ORDER[season] ?? 0)
}

/** The term that contains today's date, as an ordinal. */
function currentTermOrdinal(now = new Date()) {
  const month = now.getMonth() // 0 = Jan
  const season = month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Fall'
  return termOrdinal(now.getFullYear(), season)
}

/**
 * Status for an ungraded course, decided by comparing its term to today:
 * a future term is `planned`, the current or a past term is `in-progress`.
 */
function statusForTerm(term, now = new Date()) {
  const match = term.match(/(20\d{2})\s+(Spring|Fall|Summer|Winter)/i)
  if (!match) return 'in-progress'
  const ordinal = termOrdinal(
    parseInt(match[1], 10),
    match[2][0].toUpperCase() + match[2].slice(1).toLowerCase(),
  )
  return ordinal > currentTermOrdinal(now) ? 'planned' : 'in-progress'
}

/**
 * Parses raw lines into the transcript object format.
 */
export function parseTranscriptLines(lines) {
  const transcript = {
    student: { name: 'Unknown Student', cumGpa: 0 },
    courses: []
  }

  let currentTerm = ''
  
  // Refined Regex Patterns - more flexible with whitespace
  const nameRegex = /Name:\s+(.*)/i
  const termRegex = /^(20\d{2})\s+(Spring|Fall|Summer|Winter)\s+Term/i
  const gpaRegex = /Cum GPA:\s+(\d\.\d{3})/i
  
  // Course pattern: DEPT NUM [spaces] TITLE [spaces] EARNED_CREDITS [spaces] GRADE (optional)
  // Allowing 1 or more spaces everywhere but 2 or more before/after title to separate it from codes
  const courseRegex = /^([A-Z]{2,5})\s+(\d{3,5}W?)\s+(.*?)\s+(\d\.\d{2})(?:\s+([A-F][+-]?|P|NC|W|CR|AU|IN|S|U|CR))?\s*$/

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 1. Check for Student Name
    const nameMatch = trimmed.match(nameRegex)
    if (nameMatch && transcript.student.name === 'Unknown Student') {
      transcript.student.name = nameMatch[1].trim()
      continue
    }

    // 2. Check for Term headers
    const termMatch = trimmed.match(termRegex)
    if (termMatch) {
      currentTerm = `${termMatch[1]} ${termMatch[2]}`
      continue
    }

    // 3. Check for GPA (cumulative)
    const gpaMatch = trimmed.match(gpaRegex)
    if (gpaMatch) {
      transcript.student.cumGpa = parseFloat(gpaMatch[1])
      continue
    }

    // 4. Check for Course entries
    const courseMatch = trimmed.match(courseRegex)
    if (courseMatch) {
      let [_, dept, num, title, earned, grade] = courseMatch
      
      const credits = parseFloat(earned)
      const code = `${dept} ${num}`

      // Skip lines that aren't real courses
      if (title.includes('Unofficial Copy')) {
        // Sometimes "Unofficial Copy" is appended to the title due to the watermark
        title = title.replace(/Unofficial Copy/g, '').trim()
        if (!title) continue
      }

      // Determine status: graded courses are completed; ungraded ones are
      // planned or in-progress depending on whether their term is in the future.
      let status = 'completed'
      if (!grade || earned === '0.00') {
        status = statusForTerm(currentTerm)
      }

      transcript.courses.push({
        code,
        title: title.trim(),
        credits: credits || 3,
        grade: grade || null,
        status,
        term: currentTerm
      })
    }
  }

  return transcript
}

/**
 * Main entry point for PDF parsing in the browser.
 */
export async function parsePDFTranscript(arrayBuffer) {
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const doc = await loadingTask.promise
  let allLines = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const lines = await reconstructLines(page)
    allLines = allLines.concat(lines)
  }

  return parseTranscriptLines(allLines)
}

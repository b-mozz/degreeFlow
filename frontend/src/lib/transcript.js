/**
 * transcript.js — where the app gets the student's transcript.
 *
 * Priority:
 *   1. localStorage key `parsedTranscript` — what the (future) upload +
 *      transcript-parser flow will write.
 *   2. The bundled DEMO_TRANSCRIPT fallback, so the app is usable today.
 *
 * Returns the full `courses` list (used by the Flowchart) plus `completed` /
 * `inProgress` / `planned` code arrays derived from it (used by the
 * recommender call). Tolerant of either a `courses` array or pre-split code
 * arrays in storage.
 */

import { DEMO_TRANSCRIPT } from '../data/demoTranscript'

const STORAGE_KEY = 'parsedTranscript'

const codesByStatus = (courses, status) =>
  courses.filter((c) => c.status === status).map((c) => c.code)

/** Normalize whatever was stored into a consistent transcript object. */
function normalize(raw, source) {
  const student = raw.student ?? {}
  const courses = Array.isArray(raw.courses) ? raw.courses : []

  // Prefer deriving code arrays from `courses`; fall back to stored arrays
  // (or a `derived` block, the shape the backend JSON uses).
  const stored = raw.derived ?? raw
  const pick = (status, key) =>
    courses.length > 0 ? codesByStatus(courses, status) : (Array.isArray(stored[key]) ? stored[key] : [])

  return {
    student,
    courses,
    completed: pick('completed', 'completed'),
    inProgress: pick('in-progress', 'inProgress'),
    planned: pick('planned', 'planned'),
    source,
  }
}

export function loadTranscript() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.courses) || Array.isArray(parsed.completed) || parsed.derived) {
        return normalize(parsed, 'localStorage')
      }
    }
  } catch {
    // Corrupt/old localStorage value — fall through to the demo.
  }
  return normalize(DEMO_TRANSCRIPT, 'demo')
}

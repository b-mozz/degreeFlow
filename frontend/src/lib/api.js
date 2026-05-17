/**
 * api.js — all calls to the DegreeFlow backend.
 *
 * Requests go to `/api/*`, which Vite's dev server proxies to the Express
 * backend on :3000 (see vite.config.js). Keeping every fetch in this one file
 * means components never touch URLs or response plumbing directly.
 */

// In development, we use Vite proxy (/api). 
// In production, we use the environment variable VITE_API_URL (e.g., https://your-backend.onrender.com).
const BASE = import.meta.env.VITE_API_URL || '/api'

/** Throw a useful Error if the response isn't OK; otherwise return parsed JSON. */
async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json()
}

/**
 * POST /recommendations — the course recommendation engine.
 *
 * The result is a pure function of the transcript input, so we cache it in
 * sessionStorage keyed on that input. Repeated visits to the Suggestions page
 * (within the same browser session) are then instant — the backend SQL query
 * only runs the first time, or whenever the transcript actually changes.
 * Pass `{ force: true }` to bypass the cache and re-fetch.
 *
 * @param {object}   input
 * @param {string[]} input.completed   passed course codes
 * @param {string[]} [input.inProgress] current-term codes (grade pending)
 * @param {string[]} [input.planned]    future-term codes (registered)
 * @param {string}   [input.major]      degree slug, defaults to "CS"
 * @param {boolean}  [input.force]      skip the cache and re-fetch
 * @returns {Promise<object>} { major, completedCount, required, majorElectives, generalElectives }
 */
export async function getRecommendations({
  completed,
  inProgress = [],
  planned = [],
  major = 'CS',
  force = false,
}) {
  const payload = { completed, inProgress, planned, major }
  const cacheKey = `recommendations:${JSON.stringify(payload)}`

  if (!force) {
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch {
      // Corrupt cache or storage unavailable — fall through to a fresh fetch.
    }
  }

  const res = await fetch(`${BASE}/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await handle(res)

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(data))
  } catch {
    // Storage full or unavailable — caching is best-effort, ignore.
  }
  return data
}

/**
 * GET /courses/:code/professors/top — top-ranked professors for one course.
 * Not used by the Suggestions page yet, but the recommendation response
 * already embeds a professor per gen-ed pick; this is here for a future
 * "see all professors" drill-down.
 *
 * @param {string} courseCode e.g. "CSCI 23500"
 * @param {number} [limit]
 */
export async function getTopProfessors(courseCode, limit = 5) {
  const res = await fetch(
    `${BASE}/courses/${encodeURIComponent(courseCode)}/professors/top?limit=${limit}`
  )
  return handle(res)
}

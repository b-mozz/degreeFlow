/**
 * api.js — all calls to the DegreeFlow backend.
 *
 * Requests go to `/api/*`, which Vite's dev server proxies to the Express
 * backend on :3000 (see vite.config.js). Keeping every fetch in this one file
 * means components never touch URLs or response plumbing directly.
 */

const BASE = '/api'

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
 * @param {object}   input
 * @param {string[]} input.completed   passed course codes
 * @param {string[]} [input.inProgress] current-term codes (grade pending)
 * @param {string[]} [input.planned]    future-term codes (registered)
 * @param {string}   [input.major]      degree slug, defaults to "CS"
 * @returns {Promise<object>} { major, completedCount, required, majorElectives, generalElectives }
 */
export async function getRecommendations({ completed, inProgress = [], planned = [], major = 'CS' }) {
  const res = await fetch(`${BASE}/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed, inProgress, planned, major }),
  })
  return handle(res)
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

/**
 * services/professorRanking.ts — "top professors for a course" business logic.
 *
 * WHAT IS A "SERVICE"?
 * --------------------
 * A service is a plain TypeScript module that does ONE job in domain terms.
 * It does not know:
 *   - that HTTP exists
 *   - what JSON looks like
 *   - what Express, req, or res are
 * It only knows: "given these inputs, return this data."
 *
 * That separation is what makes the code testable and reusable. You can call
 * `topProfessorsForCourse(...)` from:
 *   - an HTTP route handler
 *   - a CLI script in /scripts
 *   - a unit test
 * ...without changing a line.
 *
 * WHAT THIS FILE DOES
 * -------------------
 * Given a course (by id OR by code like "CSCI 23500"), find every professor
 * who has taught it, score each one, and return the top N.
 *
 * SCORING — INTENTIONALLY LEFT EMPTY
 * ----------------------------------
 * The actual ranking formula is YOUR call. Some things to think about when
 * you fill in `scoreProfessor`:
 *   - avgRating is good, but a prof with 4.9 from 2 ratings is noisier than
 *     4.3 from 200. Consider weighting by `numRatings` (Bayesian average).
 *   - Lower avgDifficulty is generally preferred, but not always — depends on
 *     what the student wants.
 *   - wouldTakeAgain (a percentage) is a strong signal.
 *   - Profs with `null` stats (never rated) — drop them, or rank last?
 *
 * Start simple (e.g. just avgRating, profs with >=5 ratings), confirm it
 * works end-to-end, then improve.
 */

import { prisma } from "../db";

// The shape we promise to return. Keeping it explicit makes the route layer
// easier to write — you know exactly what fields are available to send back.
export interface RankedProfessor {
  id: string;
  name: string;
  department: string | null;
  avgRating: number | null;
  avgDifficulty: number | null;
  wouldTakeAgain: number | null;
  numRatings: number;
  score: number; 
}

/**
 * Find the course in the DB. Accepts either the UUID `id` or the human
 * `code` (e.g. "CSCI 23500"). Returns null if no match.
 *
 * Why a helper? Because the route might receive either form, and we don't
 * want that branching to leak into the ranking logic itself.
 */
async function findCourse(courseIdOrCode: string) {
  return prisma.course.findFirst({
    where: {
      OR: [{ id: courseIdOrCode }, { code: courseIdOrCode }],
    },
  });
}

/**
 * Pure scoring function. Takes a professor row, returns a number.
 * Higher = better. Filtering (e.g. "skip profs with <5 ratings") happens
 * in the caller, not here — keep this function dumb and predictable.
 *
 * TODO (you): replace this placeholder with your real formula.
 */
function scoreProfessor(p: {
  avgRating: number | null;
  avgDifficulty: number | null;
  wouldTakeAgain: number | null;
  numRatings: number;
}): number {
  // No rating data at all → can't rank this prof. Send them to the bottom.
  if (p.avgRating == null || p.numRatings === 0) return 0;

  // Bayesian shrinkage. A prof with a 5.0 from 1 review shouldn't beat a 4.7
  // from 200 reviews. We pull the rating toward a "prior" (rough global avg)
  // by an amount that fades as numRatings grows.
  //   - PRIOR_MEAN: where to pull toward (ballpark of the average RMP rating).
  //   - PRIOR_WEIGHT: "pretend every prof had this many extra average reviews."
  // Higher PRIOR_WEIGHT = more skepticism of small samples.
  const PRIOR_MEAN = 3.5;
  const PRIOR_WEIGHT = 5;
  const adjRating =
    (p.numRatings * p.avgRating + PRIOR_WEIGHT * PRIOR_MEAN) /
    (p.numRatings + PRIOR_WEIGHT);

  // Normalize each signal to a 0–5 scale where higher = better for the student.
  // Using `?? <neutral>` so a missing field is treated as "average," not punished.
  const ratingScore = adjRating;                                 // already 0–5
  const easeScore = 5 - (p.avgDifficulty ?? 3);                  // invert: harder = lower score
  const wouldTakeScore = ((p.wouldTakeAgain ?? 50) / 100) * 5;   // percent → 0–5

  // Weighted sum. Weights sum to 1.0; tune these once you eyeball real results.
  return ratingScore * 0.5 + wouldTakeScore * 0.3 + easeScore * 0.2;
}

/**
 * The main export. This is what the route handler will call.
 *
 * Steps:
 *   1. Resolve the course (so we can return a clean 404 from the route if
 *      it doesn't exist).
 *   2. Pull all professors linked to that course via the implicit join table.
 *   3. Score each one.
 *   4. Sort descending by score, take the top `limit`.
 */
export async function topProfessorsForCourse(
  courseIdOrCode: string,
  limit = 5
): Promise<{ course: { id: string; code: string; name: string }; professors: RankedProfessor[] } | null> {
  const course = await findCourse(courseIdOrCode);
  if (!course) return null;

  // Fetch professors that taught this course.
  // Prisma's many-to-many relation lets us filter Professor by `courses: { some: { id } }`.
  const profs = await prisma.professor.findMany({
    where: { courses: { some: { id: course.id } } },
  });

  // Score, then sort. Doing it in JS (not SQL) is fine for now — even Hunter's
  // largest course probably has <50 instructors. If it ever gets slow, push
  // the math into a raw SQL query.
  const ranked: RankedProfessor[] = profs
    .map((p) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      avgRating: p.avgRating,
      avgDifficulty: p.avgDifficulty,
      wouldTakeAgain: p.wouldTakeAgain,
      numRatings: p.numRatings,
      score: scoreProfessor(p),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    course: { id: course.id, code: course.code, name: course.name },
    professors: ranked,
  };
}

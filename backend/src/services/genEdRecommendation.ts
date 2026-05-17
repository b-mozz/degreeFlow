/**
 * services/genEdRecommendation.ts — "what gen-ed should I take?" logic.
 *
 * Gen-ed (Hunter Core + Pluralism & Diversity) works differently from the
 * major buckets, by design (per the agreed approach):
 *
 *   - NO prerequisite check. Gen-ed courses are almost all intro-level, so
 *     the rare prereq miss is acceptable — and it keeps this simple.
 *   - For each requirement bucket, ask only: has the student accounted for
 *     enough courses (completed + in-progress + planned) to satisfy it?
 *   - If NOT, suggest the top courses for that bucket, ranked purely by
 *     professor quality (the same Bayesian scorer the major recommender's
 *     professor feature uses).
 *
 * Data source: the `Requirement` / `RequirementCourse` tables (seeded from
 * docs/requirement-course-lists.md).
 */

import { prisma } from "../db";
import { scoreProfessor } from "./professorRanking";

/** The professor we'd point the student at for a suggested course. */
export interface ProfessorPick {
  name: string;
  avgRating: number | null;
  avgDifficulty: number | null;
  numRatings: number;
  score: number;
}

/** One recommended course for an unfulfilled bucket. */
export interface GenEdSuggestion {
  code: string;
  name: string;
  credits: number;
  /** Best-rated professor for this course, or null if none are rated. */
  professor: ProfessorPick | null;
}

/** One requirement bucket and its status. */
export interface GenEdBucket {
  slug: string;
  name: string;
  category: string;
  coursesNeeded: number;
  /** completed + in-progress + planned courses that fall in this bucket. */
  coursesAccountedFor: number;
  satisfied: boolean;
  /** Top picks, ranked by professor score. Empty when the bucket is satisfied. */
  suggestions: GenEdSuggestion[];
}

/**
 * Recommend gen-ed courses for every unfulfilled requirement bucket.
 *
 * @param taken  every course the student has completed, is taking, or has
 *               planned — used both to decide "satisfied?" and to avoid
 *               suggesting a course twice.
 * @param limitPerBucket  how many picks to return per unfulfilled bucket.
 */
export async function recommendGeneralElectives(
  taken: Set<string>,
  limitPerBucket = 5
): Promise<GenEdBucket[]> {
  // One query: every requirement, its course links, each linked course's
  // professors. Catalog-unmatched links (courseId = null) come back with
  // course = null and are skipped as candidates.
  const requirements = await prisma.requirement.findMany({
    include: {
      courses: {
        include: { course: { include: { professors: true } } },
      },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return requirements.map((req) => {
    const accountedFor = req.courses.filter((rc) => taken.has(rc.courseCode)).length;
    const satisfied = accountedFor >= req.coursesNeeded;

    let suggestions: GenEdSuggestion[] = [];
    if (!satisfied) {
      suggestions = req.courses
        // Candidate = not already taken, and present in our catalog.
        .filter((rc) => !taken.has(rc.courseCode) && rc.course)
        .map((rc) => {
          const course = rc.course!;
          // Best professor for this course by the shared scoring formula.
          let best: ProfessorPick | null = null;
          for (const p of course.professors) {
            const score = scoreProfessor(p);
            if (!best || score > best.score) {
              best = {
                name: p.name,
                avgRating: p.avgRating,
                avgDifficulty: p.avgDifficulty,
                numRatings: p.numRatings,
                score,
              };
            }
          }
          return {
            code: course.code,
            name: course.name,
            credits: course.credits,
            professor: best,
          };
        })
        // Rank by best-professor score; courses with no rated prof sort last.
        .sort((a, b) => (b.professor?.score ?? 0) - (a.professor?.score ?? 0))
        .slice(0, limitPerBucket);
    }

    return {
      slug: req.slug,
      name: req.name,
      category: req.category,
      coursesNeeded: req.coursesNeeded,
      coursesAccountedFor: accountedFor,
      satisfied,
      suggestions,
    };
  });
}

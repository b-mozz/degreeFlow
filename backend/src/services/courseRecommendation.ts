/**
 * services/courseRecommendation.ts — "what should I take next?" logic.
 *
 * Given the courses a student has completed, this decides — for the
 * Computer Science major — which courses they can take next, which are
 * blocked (and by what), and how many elective credits remain.
 *
 * It is a pure service in the same spirit as professorRanking.ts: no HTTP, no
 * JSON, no Express. Inputs in, structured data out. The route layer and the
 * /scripts demos both call `recommendCourses(...)` the same way.
 *
 * THE ALGORITHM (RECOMMENDER_PLAN §3, strict mode)
 * ------------------------------------------------
 *   completed = set of finished course codes
 *   for each course c the major still needs:
 *     missing = prereqs(c) - completed
 *     missing empty  -> ELIGIBLE NOW
 *     missing nonempty -> BLOCKED, blocked-by `missing`
 *
 * "Strict" means every prereq edge is treated as mandatory, because the DB
 * lost the AND/OR structure during scraping (see prereqGraph.ts). This can
 * over-restrict a few courses; that's a known, documented tradeoff.
 */

import { prisma } from "../db";
import {
  COURSE_PREREQS,
  DEGREES,
  DegreeRequirements,
  explainUnmet,
  qualifiesAsElective,
} from "../config/degreeRequirements";
import { buildPrereqGraphs, countDownstream, PrereqGraphs } from "./prereqGraph";
import { recommendGeneralElectives, GenEdBucket } from "./genEdRecommendation";

/** A course the student can take right now. */
export interface EligibleCourse {
  code: string;
  name: string;
  credits: number;
  /** How many further courses this one transitively unlocks. Higher = take sooner. */
  unlocks: number;
}

/** A course the student still needs but cannot take yet. */
export interface BlockedCourse {
  code: string;
  name: string;
  credits: number;
  /** Prerequisites not yet satisfied. */
  missing: string[];
}

export interface RequirementBucket {
  /** True when nothing in this bucket is still outstanding. */
  satisfied: boolean;
  eligible: EligibleCourse[];
  blocked: BlockedCourse[];
}

export interface ElectiveBucket extends RequirementBucket {
  creditsRequired: number;
  creditsCompleted: number;
  creditsRemaining: number;
}

export interface Recommendation {
  major: string;
  completedCount: number;
  /** Required core CSCI + required MATH/STAT courses. */
  required: RequirementBucket;
  /** The 12-credit CSCI elective bucket. */
  majorElectives: ElectiveBucket;
  /** Hunter Core + Pluralism & Diversity buckets, with picks for unfilled ones. */
  generalElectives: GenEdBucket[];
}

export interface RecommendInput {
  /** Course codes the student has passed (caller already filtered by grade). */
  completed: string[];
  /** Optional: courses in progress — excluded from suggestions, not counted as done. */
  inProgress?: string[];
  /** Optional: courses registered for a future term — treated like inProgress. */
  planned?: string[];
  /** Degree slug from DEGREES. Defaults to "CS". */
  major?: string;
  /** Max courses to return per eligible list. Defaults to 10. */
  limit?: number;
}

/** Minimal course facts the recommender needs, keyed by course code. */
type CourseInfo = Map<
  string,
  { code: string; name: string; credits: number; subjectCode: string; courseNumber: string }
>;

/**
 * Decide whether `code`'s prerequisites are satisfied by `completed`.
 * Returns the list of unmet prereqs (empty list == eligible).
 *
 * Prefers the hand-encoded AND/OR tree from the config — that's the only
 * source that knows "(A or B) and C". Courses with no tree (most electives)
 * fall back to the flat DB graph, where every edge is treated as required
 * (strict mode; documented over-restriction).
 */
function unmetPrereqs(
  code: string,
  completed: Set<string>,
  graphs: PrereqGraphs
): string[] {
  const tree = COURSE_PREREQS[code];
  if (tree) return explainUnmet(tree, completed);

  // Fallback: flat DB graph, strict AND.
  const required = graphs.prereqs.get(code) ?? new Set<string>();
  return [...required].filter((prereq) => !completed.has(prereq));
}

/**
 * Build one bucket (eligible vs blocked) from a fixed list of needed courses.
 * Used for the required core — the candidate list is just "what's left".
 */
function classifyNeeded(
  needed: string[],
  completed: Set<string>,
  graphs: PrereqGraphs,
  info: CourseInfo
): RequirementBucket {
  const eligible: EligibleCourse[] = [];
  const blocked: BlockedCourse[] = [];

  for (const code of needed) {
    const facts = info.get(code);
    // A required course missing from the catalog still matters — surface it
    // with placeholder facts rather than silently dropping it.
    const name = facts?.name ?? "(not in catalog)";
    const credits = facts?.credits ?? 0;

    const missing = unmetPrereqs(code, completed, graphs);
    if (missing.length === 0) {
      eligible.push({ code, name, credits, unlocks: countDownstream(code, graphs.unlocks) });
    } else {
      blocked.push({ code, name, credits, missing });
    }
  }

  // Most-unlocking first — clearing deep prereqs early is the greedy win.
  eligible.sort((a, b) => b.unlocks - a.unlocks);
  return { satisfied: eligible.length === 0 && blocked.length === 0, eligible, blocked };
}

/**
 * The main export. Resolve the degree, load the graph and catalog, then
 * produce the three buckets.
 */
export async function recommendCourses(
  input: RecommendInput
): Promise<Recommendation> {
  const req: DegreeRequirements = DEGREES[input.major ?? "CS"];
  if (!req) {
    throw new Error(`Unknown major: ${input.major}`);
  }
  const limit = input.limit ?? 10;

  const completed = new Set(input.completed);
  const inProgress = new Set(input.inProgress ?? []);
  const planned = new Set(input.planned ?? []);
  // A course already taken, in progress, or planned should never be recommended.
  const excludeFromSuggestions = new Set([...completed, ...inProgress, ...planned]);

  const graphs = await buildPrereqGraphs();

  // ---- Load every course we might need facts for, in one query. ----
  // That's: required core + math, the elective subject's whole catalog, and
  // anything the student has completed (for credit counting).
  const rows = await prisma.course.findMany({
    where: {
      OR: [
        { code: { in: [...req.coreCourses, ...req.mathCourses] } },
        { subjectCode: req.electiveRule.subject },
        { code: { in: [...completed] } },
      ],
    },
    select: { code: true, name: true, credits: true, subjectCode: true, courseNumber: true },
  });
  const info: CourseInfo = new Map(rows.map((r) => [r.code, r]));

  // ---- Bucket 1: required core + math. ----
  // Exclude in-progress courses too — you can't be told to "take next"
  // something you're already enrolled in.
  const neededRequired = [...req.coreCourses, ...req.mathCourses].filter(
    (code) => !excludeFromSuggestions.has(code)
  );
  const required = classifyNeeded(neededRequired, completed, graphs, info);

  // ---- Bucket 2: major (CSCI) electives. ----
  // Count credits the student already earned from courses that qualify.
  let creditsCompleted = 0;
  for (const code of completed) {
    const facts = info.get(code);
    if (facts && qualifiesAsElective(facts, req)) {
      creditsCompleted += facts.credits;
    }
  }
  const creditsRemaining = Math.max(0, req.electiveCreditsRequired - creditsCompleted);

  // Candidate electives: every catalog course that qualifies and isn't already
  // taken / in progress. Then split eligible vs blocked on prereqs.
  const electiveEligible: EligibleCourse[] = [];
  const electiveBlocked: BlockedCourse[] = [];
  for (const facts of rows) {
    if (excludeFromSuggestions.has(facts.code)) continue;
    if (!qualifiesAsElective(facts, req)) continue;

    const missing = unmetPrereqs(facts.code, completed, graphs);
    const base = { code: facts.code, name: facts.name, credits: facts.credits };
    if (missing.length === 0) {
      electiveEligible.push({ ...base, unlocks: countDownstream(facts.code, graphs.unlocks) });
    } else {
      electiveBlocked.push({ ...base, missing });
    }
  }
  electiveEligible.sort((a, b) => b.unlocks - a.unlocks);
  // Blocked electives: fewest missing prereqs first ("you're 1 course away").
  electiveBlocked.sort((a, b) => a.missing.length - b.missing.length);

  const majorElectives: ElectiveBucket = {
    satisfied: creditsRemaining === 0,
    creditsRequired: req.electiveCreditsRequired,
    creditsCompleted,
    creditsRemaining,
    eligible: electiveEligible.slice(0, limit),
    blocked: electiveBlocked.slice(0, limit),
  };

  return {
    major: req.major,
    completedCount: completed.size,
    required: {
      ...required,
      eligible: required.eligible.slice(0, limit),
    },
    majorElectives,
    // Gen-ed: no prereq check — for each unfilled requirement bucket, suggest
    // top courses ranked by professor quality. `excludeFromSuggestions` is the
    // union of completed + in-progress + planned.
    generalElectives: await recommendGeneralElectives(excludeFromSuggestions),
  };
}

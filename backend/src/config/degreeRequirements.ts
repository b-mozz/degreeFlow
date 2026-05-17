/**
 * config/degreeRequirements.ts — what a degree actually requires.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The database (Course / Prerequisite / Professor) knows what courses exist
 * and how they chain together — but it has NO idea what any *major* requires.
 * The recommender can't say "take this next" without a target to aim at.
 *
 * This file is that target. It's a plain hardcoded config (per RECOMMENDER_PLAN
 * step 1) — fast to write, no migration. When we support more than one major,
 * this same shape gets promoted to a `DegreeProgram` table; the recommender
 * code won't have to change because it only ever reads the interface below.
 *
 * SOURCE
 * ------
 * Hunter College official "Computer Science BA" degree map (updated Mar-2024)
 * plus the DegreeWorks elective audit rule. Codes are normalized to the
 * 5-digit form the catalog scraper stores (e.g. "CSCI 23500", not "CSCI 235").
 */

/** A range of course numbers, inclusive on both ends. e.g. [20000, 29999]. */
export type NumberRange = [number, number];

/**
 * How to decide whether an arbitrary course counts as a "major elective".
 * Mirrors the DegreeWorks audit rule, which is range-based with carve-outs.
 */
export interface ElectiveRule {
  /** Subject code the elective must belong to, e.g. "CSCI". */
  subject: string;
  /** Course-number ranges that qualify. A course matches if it's in ANY range. */
  includeRanges: NumberRange[];
  /** Course-number ranges explicitly disqualified (e.g. all 499xx). */
  excludeRanges: NumberRange[];
  /** Specific course codes disqualified by name. */
  excludeCodes: string[];
}

export interface DegreeRequirements {
  major: string;
  /** Catalog plan code — handy when this moves to a DB row. */
  programCode: string;
  /** Total credits the major itself demands (excludes gen-ed / Hunter Core). */
  totalMajorCredits: number;
  /** Lowest passing grade the department accepts for a major course. */
  minGrade: string;
  /** Core courses — every one is required, no choice. */
  coreCourses: string[];
  /** Required math/stat courses — also all required. */
  mathCourses: string[];
  /** Credits of CSCI electives the student must accumulate. */
  electiveCreditsRequired: number;
  /** Predicate config for which courses count toward that elective bucket. */
  electiveRule: ElectiveRule;
}

/**
 * B.A. Computer Science — Hunter College.
 *
 * Known fuzziness (documented so the next person doesn't "fix" it blindly):
 *  - CSCI 12700 is the intro course; it's a prerequisite to the major and the
 *    degree map pins it, so it's treated as core.
 *  - CSCI 13600 (Supervised Programming Lab) and MATH 15600 (Calc II lab) were
 *    REMOVED from the major — no longer required, so they are not listed here.
 */
export const CS_BA: DegreeRequirements = {
  major: "Computer Science (B.A.)",
  programCode: "COMPSCI-BA",
  totalMajorCredits: 54, // after removing CSCI 13600 (1cr) and MATH 15600 (1cr)
  minGrade: "C",

  coreCourses: [
    "CSCI 12700", // Introduction to Computer Science
    "CSCI 13500", // Software Analysis & Design I
    "CSCI 15000", // Discrete Structures
    "CSCI 16000", // Computer Architecture I
    "CSCI 23500", // Software Analysis & Design II
    "CSCI 26000", // Computer Architecture II
    "CSCI 26500", // Computer Theory I
    "CSCI 33500", // Software Analysis & Design III
    "CSCI 34000", // Operating Systems
    "CSCI 49900", // Capstone Course in Computer Science
  ],

  mathCourses: [
    "MATH 15000", // Calculus I
    "MATH 15500", // Calculus II
    "MATH 16000", // Matrix Algebra
    "STAT 21300", // Applied Statistics
  ],

  electiveCreditsRequired: 12, // 4 courses x 3 credits, per the degree map

  // DegreeWorks rule, decoded:
  //   "CSCI 13700:18000 or 18400:19999 or 2@ or 3@ or 4@
  //    Except CSCI 15000, 22700, 23200, 23300, 23500, 26500, 33500, 34000, 499@"
  electiveRule: {
    subject: "CSCI",
    includeRanges: [
      [13700, 18000],
      [18400, 19999],
      [20000, 29999], // 2@
      [30000, 39999], // 3@
      [40000, 49999], // 4@
    ],
    excludeRanges: [
      [49900, 49999], // 499@ — capstone / independent study, not electives
    ],
    excludeCodes: [
      "CSCI 15000",
      "CSCI 22700",
      "CSCI 23200",
      "CSCI 23300",
      "CSCI 23500",
      "CSCI 26500",
      "CSCI 33500",
      "CSCI 34000",
    ],
  },
};

/** All degrees the recommender knows about, keyed by a short slug. */
export const DEGREES: Record<string, DegreeRequirements> = {
  CS: CS_BA,
};

/**
 * Does `course` count toward the major-elective bucket of `req`?
 *
 * A course qualifies when it is in the elective subject, lands inside an
 * include-range, and is NOT carved out by an exclude-range, an explicit
 * exclude-code, or by already being a core requirement (no double-counting).
 */
export function qualifiesAsElective(
  course: { subjectCode: string; courseNumber: string; code: string },
  req: DegreeRequirements
): boolean {
  const rule = req.electiveRule;
  if (course.subjectCode !== rule.subject) return false;

  const num = parseInt(course.courseNumber, 10);
  if (!Number.isFinite(num)) return false;

  const inRange = ([lo, hi]: NumberRange) => num >= lo && num <= hi;
  if (!rule.includeRanges.some(inRange)) return false;
  if (rule.excludeRanges.some(inRange)) return false;
  if (rule.excludeCodes.includes(course.code)) return false;

  // A course used to satisfy core can't also satisfy the elective bucket.
  if (req.coreCourses.includes(course.code)) return false;
  if (req.mathCourses.includes(course.code)) return false;

  return true;
}

/* ------------------------------------------------------------------ *
 * PREREQUISITE LOGIC — hand-encoded AND/OR trees
 * ------------------------------------------------------------------ *
 * WHY THIS LIVES HERE AND NOT IN THE DB
 * The `Prerequisite` table is FLAT: it lost the AND/OR structure during
 * scraping, so it can't tell "(A or B) and C" from "A and B and C". For
 * Operating Systems that's the difference between needing one architecture
 * course and needing two. The recommender can't be trusted on the flat data.
 *
 * Until a real prereqText parser exists, we hand-encode the truth for the
 * courses the recommender actually audits — the core of each major. The map
 * is keyed by course CODE, not by major, so if two majors both require
 * CSCI 23500 the tree is written once and reused.
 *
 * SCOPE / KNOWN GAPS
 *  - "or equivalent" and "appropriate placement-exam score" can't be modeled
 *    from completed-course data — those alternatives are simply dropped, so
 *    the recommender is slightly STRICTER than reality for placement cases.
 *  - Corequisites (e.g. CSCI 13600, MATH 15600) are NOT prerequisites; a
 *    coreq may be taken in the same term. They're encoded as the prereq of
 *    the partner course so they unlock together — see comments inline.
 *  - Codes are normalized to the catalog's 5-digit form ("MATH 15500").
 */

/** A boolean prerequisite expression: a course code, an AND, or an OR. */
export type PrereqExpr =
  | string
  | { allOf: PrereqExpr[] }
  | { oneOf: PrereqExpr[] };

/**
 * A catalog prereq of "precalculus" is also satisfied by ANY higher math
 * course — a student who finished Calc I plainly meets a precalc requirement.
 * The catalog text only lists the precalc options, so we widen it here.
 */
const PRECALC_OR_HIGHER: PrereqExpr[] = [
  "MATH 12400", "MATH 12500", "MATH 12550", // precalc tier
  "MATH 15000", "MATH 15100", "MATH 15200", "MATH 15500", // calculus tier
];

/**
 * Accurate prereq trees for every core course the recommender audits.
 * A course with NO entry here is treated as having no prerequisites; the
 * recommender falls back to the flat DB graph for non-core courses.
 */
export const COURSE_PREREQS: Record<string, PrereqExpr> = {
  // ---- CSCI core ----
  // CSCI 12700 — no prerequisites.
  "CSCI 13500": {
    allOf: [
      "CSCI 12700", // "or equivalent" dropped — can't see placement
      { oneOf: PRECALC_OR_HIGHER },
    ],
  },
  "CSCI 15000": { oneOf: PRECALC_OR_HIGHER },
  "CSCI 16000": { allOf: ["CSCI 12700", "CSCI 15000"] },
  "CSCI 23500": { allOf: ["CSCI 13500", "CSCI 15000", "MATH 15000"] },
  "CSCI 26000": {
    allOf: ["CSCI 13500", { oneOf: ["CSCI 16000", "CSCI 24500"] }, "MATH 15000"],
  },
  "CSCI 26500": {
    allOf: [{ oneOf: ["CSCI 16000", "CSCI 14500"] }, "MATH 15000"],
  },
  "CSCI 33500": { allOf: ["CSCI 23500", "MATH 15500"] },
  "CSCI 34000": {
    allOf: [
      { oneOf: ["CSCI 24500", "CSCI 26000"] },
      "CSCI 23500",
      { oneOf: ["STAT 11300", "STAT 21300"] },
      "MATH 15500", // catalog text says "MATH 155" — normalized
    ],
  },
  "CSCI 49900": { allOf: ["CSCI 33500", "CSCI 34000"] },

  // ---- Math / Stat core ----
  // Placement-exam alternatives dropped throughout.
  "MATH 15000": { oneOf: ["MATH 12400", "MATH 12500", "MATH 12550"] },
  "MATH 15500": { oneOf: ["MATH 15000", "MATH 15100"] },
  "MATH 16000": { oneOf: PRECALC_OR_HIGHER },
  "STAT 21300": { oneOf: PRECALC_OR_HIGHER },
};

/** Is `expr` fully satisfied by the set of `completed` course codes? */
export function evalPrereq(expr: PrereqExpr, completed: Set<string>): boolean {
  if (typeof expr === "string") return completed.has(expr);
  if ("allOf" in expr) return expr.allOf.every((e) => evalPrereq(e, completed));
  return expr.oneOf.some((e) => evalPrereq(e, completed));
}

/**
 * Human-readable list of what's still missing from `expr`. Empty == satisfied.
 * An unsatisfied OR collapses to a single "one of: A / B" entry so the caller
 * doesn't render every alternative as separately required.
 */
export function explainUnmet(expr: PrereqExpr, completed: Set<string>): string[] {
  if (evalPrereq(expr, completed)) return [];
  if (typeof expr === "string") return [expr];
  if ("allOf" in expr) return expr.allOf.flatMap((e) => explainUnmet(e, completed));
  const options = expr.oneOf.map((e) =>
    typeof e === "string" ? e : explainUnmet(e, completed).join(" + ")
  );
  return [`one of: ${options.join(" / ")}`];
}

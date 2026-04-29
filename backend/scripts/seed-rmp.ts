/**
 * SEED: RateMyProfessor scraper
 *
 * Goal: pull every Hunter College professor's aggregate ratings from RMP and
 * upsert them into our `Professor` table.
 *
 * How RMP works:
 *   - There is no official API. Their own website uses a GraphQL endpoint at
 *     https://www.ratemyprofessors.com/graphql with a hardcoded basic-auth
 *     header (test:test). That's what we hit directly.
 *   - Schools have opaque base64 IDs. We look up Hunter's ID by name first.
 *   - Teachers are paginated using a cursor. We loop until `hasNextPage` is
 *     false to collect everyone.
 *
 * Data captured per professor:
 *   - First + last name (combined into `name` for our schema)
 *   - Department
 *   - Avg rating, avg difficulty, would-take-again %, num ratings
 *   - The RMP `legacyId` (the numeric ID in URLs) — we store this as `rmpId`.
 *
 * Course linking:
 *   - The Teacher.courseCodes field gives us the aggregate list of courses
 *     each prof has been rated under (one entry per course code, with a
 *     courseCount we currently ignore — we just want the codes).
 *   - RMP codes are the short form ("CSCI 235") while Hunter's catalog uses
 *     the long form ("CSCI 23500"). We normalize both to a `${SUBJ}-${first 3
 *     digits}` key and build a lookup map at the start of the run.
 *   - We use Prisma's implicit many-to-many — `courses: { set: [...] }`
 *     replaces the prof's full course list each run, so re-running is safe
 *     and idempotent.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { shortKey } from "./lib/course-key";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// RMP's public-facing GraphQL endpoint. The Authorization header is the same
// hardcoded credential their own frontend uses ("test:test" base64-encoded).
const RMP_ENDPOINT = "https://www.ratemyprofessors.com/graphql";
const RMP_HEADERS = {
  "Content-Type": "application/json",
  "Authorization": "Basic dGVzdDp0ZXN0",
};

// Hardcoded school ID for Hunter College CUNY (ratemyprofessors.com/school/226).
// RMP search returns multiple "Hunter College" entries (high school, dupes,
// etc.) so we skip the lookup and use the known ID directly.
const SCHOOL_LEGACY_ID = 226;
const SCHOOL_ID = Buffer.from(`School-${SCHOOL_LEGACY_ID}`).toString("base64");

/**
 * Wrapper that POSTs a GraphQL query and returns the parsed `data` field.
 * Throws on HTTP error or GraphQL errors.
 */
async function gql<T = any>(query: string, variables: Record<string, any>): Promise<T> {
  const res = await fetch(RMP_ENDPOINT, {
    method: "POST",
    headers: RMP_HEADERS,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`RMP HTTP ${res.status}`);
  const json: any = await res.json();
  if (json.errors) throw new Error(`RMP GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data as T;
}

interface RmpTeacher {
  id: string;            // opaque GraphQL id (base64)
  legacyId: number;      // numeric ID used in URLs
  firstName: string;
  lastName: string;
  department: string | null;
  avgRating: number | null;
  avgDifficulty: number | null;
  numRatings: number;
  wouldTakeAgainPercent: number | null; // -1 when "no data"
  courseCodes: Array<{ courseName: string; courseCount: number }>;
}

/**
 * Fetch one page of teachers for a school. Uses cursor-based pagination.
 */
async function fetchTeachersPage(
  schoolId: string,
  cursor: string | null,
  pageSize: number
): Promise<{ teachers: RmpTeacher[]; nextCursor: string | null; hasNext: boolean }> {
  const data = await gql<any>(
    `query SearchTeachers($query: TeacherSearchQuery!, $first: Int, $after: String) {
      newSearch {
        teachers(query: $query, first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              legacyId
              firstName
              lastName
              department
              avgRating
              avgDifficulty
              numRatings
              wouldTakeAgainPercent
              courseCodes {
                courseName
                courseCount
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    {
      query: { text: "", schoolID: schoolId },
      first: pageSize,
      after: cursor,
    }
  );

  const conn = data?.newSearch?.teachers;
  const edges = conn?.edges ?? [];
  return {
    teachers: edges.map((e: any) => e.node as RmpTeacher),
    nextCursor: conn?.pageInfo?.endCursor ?? null,
    hasNext: conn?.pageInfo?.hasNextPage ?? false,
  };
}

async function main() {
  console.log(`Using Hunter College CUNY (school/${SCHOOL_LEGACY_ID}, id=${SCHOOL_ID})\n`);

  console.log("Fetching all professors...");
  const all: RmpTeacher[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const PAGE_SIZE = 100;

  while (true) {
    const { teachers, nextCursor, hasNext } = await fetchTeachersPage(SCHOOL_ID, cursor, PAGE_SIZE);
    all.push(...teachers);
    pages++;
    console.log(`  page ${pages}: +${teachers.length} (total ${all.length})`);

    if (!hasNext || !nextCursor) break;
    cursor = nextCursor;

    // Be polite — RMP doesn't publish a rate limit but no point hammering.
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\nTotal professors: ${all.length}`);

  // Build a lookup: shortKey ("CSCI-235") -> Course id. One DB read covers
  // every course in the catalog so we can resolve RMP codes in memory.
  console.log("Building course-code lookup...");
  const courses = await prisma.course.findMany({ select: { id: true, code: true } });
  const codeToCourseId = new Map<string, string>();
  for (const c of courses) {
    const key = shortKey(c.code);
    if (key) codeToCourseId.set(key, c.id);
  }
  console.log(`  ${codeToCourseId.size} courses in lookup table.`);

  console.log("\nUpserting professors and linking courses...");
  let inserted = 0;
  let updated = 0;
  let totalLinks = 0;
  let unmatchedCodes = 0;

  for (const t of all) {
    const name = `${t.firstName} ${t.lastName}`.trim();
    const wouldTakeAgain =
      typeof t.wouldTakeAgainPercent === "number" && t.wouldTakeAgainPercent >= 0
        ? t.wouldTakeAgainPercent
        : null;

    // Resolve this prof's RMP course codes to Course IDs in our DB.
    // Skip codes we don't recognize (different department, typos, etc.).
    const courseIds = new Set<string>();
    for (const cc of t.courseCodes ?? []) {
      const id = codeToCourseId.get(shortKey(cc.courseName));
      if (id) courseIds.add(id);
      else unmatchedCodes++;
    }
    const connectIds = [...courseIds].map((id) => ({ id }));
    totalLinks += connectIds.length;

    const result = await prisma.professor.upsert({
      where: { rmpId: String(t.legacyId) },
      update: {
        name,
        department: t.department ?? null,
        avgRating: t.avgRating,
        avgDifficulty: t.avgDifficulty,
        wouldTakeAgain,
        numRatings: t.numRatings,
        // `set` replaces the prof's full course list, so re-running this
        // script picks up new courses and drops stale links automatically.
        courses: { set: connectIds },
      },
      create: {
        rmpId: String(t.legacyId),
        name,
        department: t.department ?? null,
        avgRating: t.avgRating,
        avgDifficulty: t.avgDifficulty,
        wouldTakeAgain,
        numRatings: t.numRatings,
        courses: { connect: connectIds },
      },
    });
    if (Date.now() - result.createdAt.getTime() < 5000) inserted++;
    else updated++;
  }

  console.log(`\nDone.`);
  console.log(`  Professors inserted: ~${inserted}, updated: ~${updated}`);
  console.log(`  Prof<->Course links written: ${totalLinks}`);
  console.log(`  RMP codes that didn't match any Hunter course: ${unmatchedCodes}`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

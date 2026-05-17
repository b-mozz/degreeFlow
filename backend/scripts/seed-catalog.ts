import "dotenv/config"; // Load DATABASE_URL from .env into process.env
import vm from "vm"; // Node.js 'Virtual Machine' module to execute code in a sandbox
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client"; // The database client generator
import { parsePrereqs } from "./parse-prereqs"; // Our helper function from the other file

const prisma = new PrismaClient();

// A list of department IDs used to build the URLs we will scrape.
const DEPARTMENT_IDS = [
  "AFR-HTR", "ANTH-HTR", "ART-HTR", "BIO-HTR", "CHEM-HTR", "CLASS-HTR",
  "CSCI-HTR", "CURR-HTR", "DAN-HTR", "ECON-HTR", "EDU-HTR", "ENGL-HTR",
  "FILM-HTR", "GEOG-HTR", "GER-HTR", "HIST-HTR", "HMBIOL-HTR", "MATH-HTR",
  "MLS-HTR", "MUS-HTR", "NUR-HTR", "NPH-HTR", "PHIL-HTR", "PT-HTR",
  "PHYS-HTR", "POLSCI-HTR", "PSYCH-HTR", "ROMLAN-HTR", "SAS-HTR",
  "EDUC-HTR", "NURSE-HTR", "SW-HTR", "SOC-HTR", "SPED-HTR", "THR-HTR",
  "URBAF-HTR", "UPH-HTR", "WGS-HTR",
];

// The starting point for our web scraping.
const BASE_URL = "https://hunter-undergraduate.catalog.cuny.edu/departments";

/**
 * INTERFACE: This is a TypeScript-only feature.
 * It defines the 'shape' of an object so the editor can warn us if we misspell a property.
 * Here, we are describing what a "Course" object looks like when it comes from the website.
 */
interface RawCourse {
  _id: string;
  code: string; // e.g., "CSCI 12700"
  courseGroupId: string; // e.g., "0245171" — used to build the detail-page URL
  name: string; // e.g., "Introduction to Computer Science"
  longName?: string; // The '?' means this property is optional
  description?: string;
  subjectCode: string;
  courseNumber: string;
  departments: string[];
  career: string;
  credits?: {
    creditHours?: { min: number; max: number };
  };
  components?: Array<{ id: string; code: string; name: string; contactHours: number }>;
  effectiveStartDate?: string;
  effectiveEndDate?: string | null;
}

// Coursedog school identifier for Hunter — used in the requirement-group API URL.
const SCHOOL_ID = "htr01";

// How many requests we're willing to have in flight at once.
// Hunter's catalog rate-limits aggressively — empirically ~5 req/sec is the
// ceiling before it starts failing. Concurrency 1 + sleep keeps us well below.
const DETAIL_CONCURRENCY = 1;
const DETAIL_DELAY_MS = 500; // pause between detail-page requests
const API_CONCURRENCY = 12; // Coursedog advertises ~100 req/sec; 12 is comfortably under.

// Pretend to be a real browser so the catalog's WAF doesn't flag us.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Browser-like headers required by the Coursedog API (it checks Origin/Referer).
const COURSEDOG_HEADERS = {
  "Origin": "https://hunter-undergraduate.catalog.cuny.edu",
  "Referer": "https://hunter-undergraduate.catalog.cuny.edu/",
  "X-Requested-With": "catalog",
  "User-Agent": BROWSER_UA,
};

// On-disk cache of resolved requirementGroup IDs so re-runs skip already-fetched
// detail pages. The cache key is courseGroupId; value is the requirementGroup
// id (string) or null (we know the page has no requirementGroup). Anything not
// in the cache will be retried.
const CACHE_DIR = path.join(__dirname, "..", ".cache");
const RG_CACHE_PATH = path.join(CACHE_DIR, "requirement-groups.json");

function loadRgCache(): Record<string, string | null> {
  try {
    return JSON.parse(fs.readFileSync(RG_CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveRgCache(cache: Record<string, string | null>): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(RG_CACHE_PATH, JSON.stringify(cache));
}

/**
 * HELPER: sleep
 * JavaScript is "non-blocking". This function returns a 'Promise' that waits for 'ms' milliseconds.
 * We use 'await sleep(1500)' later to avoid hammering the website too fast.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HELPER: extractNuxtData
 * The website uses a framework called 'Nuxt'. It hides its data in a script tag 
 * assigned to 'window.__NUXT__'. This function finds that text and turns it 
 * back into a real JavaScript object.
 */
function extractNuxtData(html: string): any {
  // Regex to find the data inside the HTML <script> tag
  const match = html.match(/window\.__NUXT__=(.*?);<\/script>/s);
  if (!match) {
    throw new Error("Could not find __NUXT__ data in HTML");
  }
  // 'vm.runInNewContext' safely evaluates the string as JavaScript code
  return vm.runInNewContext(match[1]);
}

/**
 * HELPER: getCredits
 * Safely extracts the credit number. If it's missing, it returns 0.
 * '??' is the "Nullish Coalescing" operator - it picks the right side if the left is null/undefined.
 */
function getCredits(course: RawCourse): number {
  return course.credits?.creditHours?.min ?? 0;
}

/**
 * HELPER: runWithConcurrency
 * Runs an async task on every item in `items`, but never lets more than
 * `concurrency` of them run at once. This is the "promise pool" pattern —
 * it keeps us from hammering a server with 6,000 simultaneous requests.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  // Spawn N "workers" that pull items off the shared queue until empty.
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await task(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

/**
 * HELPER: fetchWithRetry
 * Wraps fetch with exponential backoff for rate-limit (429) and 5xx errors.
 * Returns the Response on success, or null after retries are exhausted.
 * Returning null differs from throwing because we want callers to record the
 * failure and move on without crashing the whole scrape.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  maxAttempts = 4
): Promise<Response | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      // Retry on rate-limit and server errors; bail out (return null) on
      // permanent client errors like 404.
      if (res.status === 429 || res.status >= 500) {
        const wait = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s
        await sleep(wait);
        continue;
      }
      return res;
    } catch {
      // Network error — same backoff.
      const wait = 1000 * Math.pow(2, attempt - 1);
      await sleep(wait);
    }
  }
  return null;
}

// Sentinel returned by detail-page fetch when the request failed (vs. when the
// page loaded but had no requirementGroup). This lets the caller cache the
// "no group" case but retry the "fetch failed" case on the next run.
const FETCH_FAILED = Symbol("fetch-failed");
type RgResult = string | null | typeof FETCH_FAILED;

/**
 * HELPER: fetchCourseRequirementGroupId
 * Loads a single course's detail page and extracts the requirementGroup ID.
 * Returns:
 *   - string id  (success, has a group)
 *   - null       (success, page exists but no group)
 *   - FETCH_FAILED (transient failure — caller should retry next run)
 */
async function fetchCourseRequirementGroupId(courseGroupId: string): Promise<RgResult> {
  const url = `https://hunter-undergraduate.catalog.cuny.edu/courses/${courseGroupId}`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res || !res.ok) return FETCH_FAILED;
  try {
    const html = await res.text();
    const data = extractNuxtData(html);
    const rg = data?.data?.[0]?.course?.requirementGroup;
    return typeof rg === "string" && rg.length > 0 ? rg : null;
  } catch {
    return FETCH_FAILED;
  }
}

/**
 * HELPER: fetchRequirementGroupText
 * Calls Coursedog's public API to resolve a requirement-group ID into the
 * human-readable prerequisite description. Returns null on permanent failure.
 */
async function fetchRequirementGroupText(rgId: string): Promise<string | null> {
  const url = `https://app.coursedog.com/api/v1/${SCHOOL_ID}/requirementGroups/${rgId}?returnFields=descriptionLong`;
  const res = await fetchWithRetry(url, { headers: COURSEDOG_HEADERS });
  if (!res || !res.ok) return null;
  try {
    const json: any = await res.json();
    const text = json?.data?.[rgId]?.descriptionLong;
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * FUNCTION: fetchDepartmentCourses
 * This is an 'async' (asynchronous) function. It fetches the HTML for a department
 * and extracts the list of courses.
 */
async function fetchDepartmentCourses(deptId: string): Promise<RawCourse[]> {
  const url = `${BASE_URL}/${deptId}/courses`;
  
  // 'fetch' is a built-in function to download data from a URL
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`  Failed to fetch ${deptId}: ${response.status}`);
    return [];
  }

  // Convert the response into a plain text string (the HTML)
  const html = await response.text();

  try {
    const nuxtData = extractNuxtData(html);
    // The site puts page-level data into nuxtData.data as an array. The courses
    // page lives at a different index than the department landing page, and the
    // ordering has changed in the past — so scan all entries for coursesFallback.
    const pages: any[] = nuxtData.data ?? [];
    const courses: RawCourse[] =
      pages.find((p) => Array.isArray(p?.coursesFallback))?.coursesFallback ?? [];
    return courses;
  } catch (err) {
    console.error(`  Error parsing ${deptId}:`, err);
    return [];
  }
}

/**
 * MAIN EXECUTION BLOCK
 */
async function main() {
  console.log("Starting Hunter College catalog scrape...\n");

  // A 'Map' is like a dictionary. We use it to ensure we only keep one copy of each course code.
  const courseMap = new Map<string, RawCourse>();

  // Loop through every department ID we defined at the top
  for (const deptId of DEPARTMENT_IDS) {
    console.log(`Fetching ${deptId}...`);
    
    // Get the courses for this department
    const courses = await fetchDepartmentCourses(deptId);

    let added = 0;
    for (const course of courses) {
      // Logic: Only keep active Undergraduate courses
      if (course.career !== "Undergraduate") continue; // 'continue' skips to the next loop iteration
      if (course.effectiveEndDate) continue; // If it has an end date, it's an old course

      // If we haven't seen this course code yet, add it to our Map
      if (!courseMap.has(course.code)) {
        courseMap.set(course.code, course);
        added++;
      }
    }

    console.log(`  Found ${courses.length} courses, ${added} new unique added`);
    
    // Wait 1.5 seconds before the next department to be polite to the server
    await sleep(1500);
  }

  console.log(`\nTotal unique courses: ${courseMap.size}`);
  console.log("Upserting courses to database...\n");

  // This Map will store our database IDs so we can link prerequisites later
  const courseCodeToId = new Map<string, string>();

  // Loop through all the unique courses we collected
  for (const course of courseMap.values()) {
    /**
     * 'upsert' means "Update or Insert".
     * If the course already exists (matching 'code'), update its details.
     * If it doesn't exist, create a new record.
     */
    const upserted = await prisma.course.upsert({
      where: { code: course.code },
      update: {
        courseNumber: course.courseNumber,
        subjectCode: course.subjectCode,
        name: course.name,
        longName: course.longName ?? null,
        description: course.description ?? null,
        credits: getCredits(course),
        department: course.departments[0] ?? "",
        career: course.career,
        // We store complex objects as a JSON string
        componentsJson: course.components ? JSON.stringify(course.components) : null,
      },
      create: {
        code: course.code,
        courseNumber: course.courseNumber,
        subjectCode: course.subjectCode,
        name: course.name,
        longName: course.longName ?? null,
        description: course.description ?? null,
        credits: getCredits(course),
        department: course.departments[0] ?? "",
        career: course.career,
        componentsJson: course.components ? JSON.stringify(course.components) : null,
      },
    });

    // Save the internal database ID linked to the human-readable course code
    courseCodeToId.set(course.code, upserted.id);
  }

  console.log("Courses upserted.\n");

  // -------------------------------------------------------------------------
  // STAGE 4: Resolve each course's requirementGroup ID
  // -------------------------------------------------------------------------
  // The catalog hides prereqs behind a per-course "requirementGroup" ID that
  // only appears on detail pages. We fetch every course's detail page in
  // parallel (capped concurrency) and collect the unique IDs.
  // -------------------------------------------------------------------------
  // Load any prior cached results so a re-run only retries the failures.
  const rgCache = loadRgCache();
  const cachedHits = Object.keys(rgCache).length;
  console.log(`Loaded ${cachedHits} cached detail-page results from .cache/requirement-groups.json`);

  const allCourses = [...courseMap.values()];

  // Only fetch courses whose courseGroupId isn't already in the cache.
  // (Cache values include both "has a group" and "no group" — both are final.
  //  Failed fetches are NOT cached, so they get retried automatically.)
  const toFetch = allCourses.filter(
    (c) => c.courseGroupId && !(c.courseGroupId in rgCache)
  );
  console.log(`Fetching ${toFetch.length} new detail pages (concurrency=${DETAIL_CONCURRENCY})...`);

  let detailDone = 0;
  let detailFailed = 0;

  await runWithConcurrency(toFetch, DETAIL_CONCURRENCY, async (course) => {
    const result = await fetchCourseRequirementGroupId(course.courseGroupId);
    if (result === FETCH_FAILED) {
      detailFailed++;
      // Don't cache failures — leave them out so next run retries them.
    } else {
      rgCache[course.courseGroupId] = result; // string id OR null
    }
    detailDone++;
    if (detailDone % 100 === 0) {
      console.log(`  ${detailDone}/${toFetch.length} fetched (${detailFailed} failures so far)`);
      saveRgCache(rgCache); // periodic flush so a crash/Ctrl-C still saves progress
    }
    // Politeness pause to stay under the catalog's rate limit.
    await sleep(DETAIL_DELAY_MS);
  });
  saveRgCache(rgCache); // final flush

  // Build the courseCode -> requirementGroup map from the (now-complete) cache.
  const courseToRgId = new Map<string, string>();
  for (const course of allCourses) {
    const rg = rgCache[course.courseGroupId];
    if (typeof rg === "string") courseToRgId.set(course.code, rg);
  }

  console.log(
    `  Done. ${courseToRgId.size} courses have a requirementGroup. ` +
    `${detailFailed} fetches failed (run again to retry).\n`
  );

  // -------------------------------------------------------------------------
  // STAGE 5: Resolve each unique requirementGroup -> human-readable text
  // -------------------------------------------------------------------------
  // OPTIMIZATION: many courses share the same requirement group (e.g., all
  // 300-level CSCI courses might point to the same "must be a CS major" rule).
  // Deduplicating before calling the API saves a lot of requests.
  // -------------------------------------------------------------------------
  const uniqueRgIds = [...new Set(courseToRgId.values())];
  console.log(`Resolving ${uniqueRgIds.length} unique requirement groups via Coursedog API...`);

  const rgIdToText = new Map<string, string>();
  let apiDone = 0;

  await runWithConcurrency(uniqueRgIds, API_CONCURRENCY, async (rgId) => {
    const text = await fetchRequirementGroupText(rgId);
    if (text) rgIdToText.set(rgId, text);
    apiDone++;
    if (apiDone % 200 === 0) {
      console.log(`  ${apiDone}/${uniqueRgIds.length} requirement groups resolved`);
    }
  });

  console.log(`  Done. ${rgIdToText.size} groups had usable text.\n`);

  // -------------------------------------------------------------------------
  // STAGE 6: Parse prereq text and write Prerequisite rows
  // -------------------------------------------------------------------------
  // We try two text sources for each course:
  //   1. The requirementGroup text from the API (the structured one).
  //   2. The course description (fallback — some courses really do put
  //      "Prerequisites: ..." in their description).
  // Both are run through parsePrereqs and the resulting codes are unioned.
  // -------------------------------------------------------------------------
  console.log("Creating prerequisite relationships...");

  // Build a flat list of (courseId, prereqCode, prereqCourseId) rows first,
  // then write them in chunks. This is dramatically faster than doing one
  // upsert per row over the network.
  type PrereqRow = { courseId: string; prereqCode: string; prereqCourseId: string | null };
  const rows: PrereqRow[] = [];

  // We also persist the raw rgText to Course.prereqText so the AND/OR parser
  // can read from the DB instead of re-hitting Coursedog every time.
  const prereqTextUpdates: { id: string; text: string }[] = [];

  for (const course of allCourses) {
    const courseId = courseCodeToId.get(course.code);
    if (!courseId) continue;

    // Source 1: requirementGroup text
    const rgId = courseToRgId.get(course.code);
    const rgText = rgId ? rgIdToText.get(rgId) : undefined;
    if (rgText) prereqTextUpdates.push({ id: courseId, text: rgText });
    // Source 2: description (fallback)
    const fromRg = parsePrereqs(rgText);
    const fromDesc = parsePrereqs(course.description);

    // Union the two sources. Set deduplicates automatically.
    const codes = new Set<string>([...fromRg, ...fromDesc]);

    for (const prereqCode of codes) {
      // Skip self-references (a course can't be its own prereq).
      if (prereqCode === course.code) continue;
      rows.push({
        courseId,
        prereqCode,
        prereqCourseId: courseCodeToId.get(prereqCode) ?? null,
      });
    }
  }

  // Bulk-insert with skipDuplicates. The unique constraint on
  // (courseId, prereqCode) means re-runs are safe — duplicates just no-op.
  // Chunked to avoid massive single statements.
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = await prisma.prerequisite.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  console.log(`  Inserted ${inserted} new prerequisite rows (out of ${rows.length} parsed).`);

  // Persist raw prereq text to Course.prereqText for the structured parser.
  // Done as N small updates rather than a single SQL because Prisma's
  // updateMany can't apply a different value per row. ~3-4k rows total — fine.
  console.log(`Writing prereqText to ${prereqTextUpdates.length} courses...`);
  for (const u of prereqTextUpdates) {
    await prisma.course.update({ where: { id: u.id }, data: { prereqText: u.text } });
  }
  console.log("  Done.");

  // -------------------------------------------------------------------------
  // STAGE 7: Backfill prereqCourseId for any rows that were inserted earlier
  // with a null link, but whose prereqCode now matches a real course in the DB.
  // One SQL statement instead of N round trips.
  // -------------------------------------------------------------------------
  const backfill = await prisma.$executeRaw`
    UPDATE "Prerequisite" AS p
    SET "prereqCourseId" = c.id
    FROM "Course" AS c
    WHERE p."prereqCode" = c.code
      AND p."prereqCourseId" IS NULL
  `;
  console.log(`  Backfilled prereqCourseId on ${backfill} previously-unresolved rows.`);
  console.log("\nDone!");
}

/**
 * ENTRY POINT
 * This starts the 'main' function.
 * '.catch' handles any errors that happen anywhere in the script.
 * '.finally' runs at the end no matter what (even on error) to close the DB connection.
 */
main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

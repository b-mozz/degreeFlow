# Prerequisite Scraping Strategy

This document explains **how** the seed script collects prerequisite data and **why** the approach is structured the way it is. Read `CODE_EXPLAINED.md` first if you haven't.

---

## 1. The problem

The Hunter College catalog (`hunter-undergraduate.catalog.cuny.edu`) lists every course, but the **course `description` field almost never contains prerequisite information**. Example — CSCI 33500's description is just:

> *"The design and analysis of various types of algorithms, including searching, sorting, graph and tree algorithms..."*

No mention of MATH 155 or CSCI 23500, even though those are real prereqs. Our first version of `parsePrereqs` returned only **16 prereq links across the entire catalog** because it was reading from this field and there was nothing there to read.

The catalog UI *does* render prereqs on each course's detail page (e.g., *"Prerequisites: (CSCI 24500 or CSCI 26000) and CSCI 23500..."*), so the data exists somewhere — just not in the obvious place.

---

## 2. How we discovered the real source

Tried in order:

| Attempt | Result |
|---|---|
| Read `description` from listing endpoint | Empty / no prereq text |
| Read `description` from per-course detail page | Same — descriptions are pure prose, no prereqs |
| Look for a `prerequisites` / `requisites` field on the course object | Found `requirementGroup` — but it's just an opaque ID like `"014086"` |
| Try Coursedog's bulk course APIs (`/api/v1/htr01/courses` etc.) | Either return wrong data or require auth |
| Open DevTools → Network tab on a course page, watch what XHRs fire after load | **Found the answer** |

The browser issues a request to:
```
GET https://app.coursedog.com/api/v1/htr01/requirementGroups/{id}?returnFields=descriptionLong
```
The response contains the human-readable prereq text:
```json
{
  "data": {
    "015017": {
      "descriptionLong": "Prerequisites: (CSCI 24500 or CSCI 26000) and CSCI 23500 and (STAT 11300 or STAT 21300) and MATH 155."
    }
  }
}
```

This endpoint is **public** — no auth required, just the right `Origin` and `Referer` headers (CORS check). We can hit it directly from Node.

---

## 3. The pipeline

The seed script now runs in seven stages. Stages 1–3 are unchanged; stages 4–7 are the new prereq logic.

```
[1] Scrape department listings  →  get every course's basic fields + courseGroupId
[2] Dedupe across departments    →  one row per course code
[3] Upsert Course rows           →  populate the Course table
[4] Fetch each course's detail page (concurrency 5)
        - extracts course.requirementGroup (an ID)
        - many courses don't have one → skipped
[5] For each UNIQUE requirementGroup ID, hit Coursedog API (concurrency 10)
        - returns descriptionLong = the prereq prose
[6] Parse the prereq text per course → collect (courseId, prereqCode) pairs
        - bulk insert with createMany + skipDuplicates
[7] One SQL UPDATE backfills prereqCourseId for any rows whose prereqCode
    now matches a Course (handles re-runs and out-of-order discovery)
```

---

## 4. Why each design choice

### 4a. Why fetch detail pages at all?
The cheap **listing endpoint** (one request per department, ~38 requests total) doesn't include `requirementGroup`. The **detail endpoint** (one per course, ~6,000 requests) does. There is no middle option — Coursedog's bulk course API requires authentication. So the detail-page fetch is unavoidable.

### 4b. Why dedupe `requirementGroup` IDs before calling the Coursedog API?
Many courses share the same requirement group. For example, every course in a major might point to "CSCI major in good standing." If we have 6,000 courses but only 3,000 unique requirement groups, deduping cuts our API calls in half. With this codebase it tends to roughly halve the API workload.

### 4c. Why bounded concurrency (`runWithConcurrency`)?
Naive parallelism — `await Promise.all(courses.map(fetch...))` — would fire 6,000 simultaneous requests. The catalog server would either rate-limit us, drop connections, or our local network stack would melt. The `runWithConcurrency` helper runs N "workers" pulling from a shared queue, so we're never over the limit.

We use **5 concurrent** for the catalog (cautious — Hunter's server is older and rate-limit-sensitive) and **10 concurrent** for the Coursedog API (the response headers advertise `100 req/sec`, so 10 is well within bounds).

### 4d. Why `createMany` instead of `upsert` for prereqs?
The original code did one `prisma.prerequisite.upsert(...)` per prereq link — one network round-trip per row. With ~10,000 prereq rows that's slow. `createMany` sends them in batches of 500. The `skipDuplicates` flag relies on the schema's `@@unique([courseId, prereqCode])` constraint to ignore rows that already exist, so re-runs are safe.

### 4e. Why the SQL backfill in stage 7?
`createMany` + `skipDuplicates` has a sharp edge: if a prereq row already exists with `prereqCourseId = null` (e.g., from a previous run when the prereq course wasn't yet scraped), the new run will *skip* it instead of *updating* it. A row-by-row upsert would handle this correctly, but at the cost of speed.

The backfill is a single `UPDATE ... FROM` statement that resolves every unlinked `prereqCode` in one go — fast, idempotent, and re-running it is harmless.

### 4f. Why keep parsing `description` as a fallback?
A small number of courses *do* put prereq text in their description (legacy data, special programs). The cost of also running `parsePrereqs(description)` is essentially zero, so we union both sources. If both produce the same code, the `Set` deduplicates it.

### 4g. Why filter out self-references?
Some requirement groups are written sloppily and reference the course itself (e.g., MATH 150's prereq text containing "MATH 150"). Self-edges break graph algorithms downstream — we drop them at insert time.

---

## 5. What this approach does NOT solve

- **Logical structure is lost.** The text says `"(CSCI 24500 or CSCI 26000) and CSCI 23500"` — there's a clear AND/OR structure, but our regex just extracts the codes. The `Prerequisite` table flattens everything to a list, so we can't distinguish "you need both" from "you need one of." Fixing this requires a real expression parser (next iteration).
- **Non-course requirements are ignored.** Things like "permission of department" or "junior standing" don't match the regex and are silently dropped.
- **Cross-college courses become unresolved.** A prereq like `BIO 100` from Brooklyn College won't match anything in our DB; it gets stored as raw `prereqCode` text with `prereqCourseId = null`. That's by design — the data is preserved even if the link can't be made.
- **Stale catalog data.** If Hunter changes a course's prereqs, we won't pick that up until the next seed run.

---

## 6. Cost summary

| Stage | Requests | Time @ throttle |
|---|---|---|
| Listing pages (1 per dept) | ~38 | ~1 min (1.5s sleep between) |
| Detail pages (1 per course) | ~6,000 | ~5 min @ concurrency 5 |
| Coursedog API (1 per unique group) | ~3,000-5,000 | ~1 min @ concurrency 10 |
| DB writes | bulk | <30 sec |
| **Total** | | **~7-8 min** |

Compared to the previous approach (16 prereqs from descriptions only), we expect this to produce **thousands** of prereq edges — roughly 1-3 per course on average for any course that has one.

---

## 7. Future improvements

1. **Cache requirementGroup texts on disk** so repeat runs skip the API entirely.
2. **Cache detail-page fetches** with HTTP `If-None-Match`/`ETag` so we only re-download changed pages.
3. **Replace the regex with a proper parser** that captures the AND/OR tree structure into a new `PrerequisiteGroup` table.
4. **Capture co-requisites and recommended prep** — Coursedog's `requirementGroup` schema distinguishes these but we currently lump everything together.

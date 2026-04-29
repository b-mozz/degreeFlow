# Database Schema

This doc explains every table in the DegreeFlow database, how they relate to each other, and what each field is for. The source of truth is `backend/prisma/schema.prisma` — this is the human-readable companion.

---

## Overview

There are **four** tables (Prisma calls them "models"):

| Table | What it stores |
|---|---|
| `Course` | Every course in the Hunter catalog. |
| `Prerequisite` | Edges in the prereq graph: "Course A requires Course B". |
| `Professor` | Hunter professors with aggregate RateMyProfessor stats. |
| `_CourseToProfessor` | Hidden join table — which profs teach which courses. |

Visually:

```
       ┌─────────────────────┐
       │       Course        │◀──── prereqCourse (optional)
       │                     │
       │ id, code, name, ... │◀──── course
       └─────────────────────┘             │
              ▲   ▲                        │
              │   │ @@unique               │
              │   └────────────────┐       │
              │                    │       │
              │ M2M (implicit)     │ ┌───────────────┐
              │                    │ │ Prerequisite  │
              ▼                    └─│ id, prereqCode│
       ┌─────────────────────┐       └───────────────┘
       │    Professor        │
       │                     │
       │ id, name, rmpId,    │
       │ avgRating, ...      │
       └─────────────────────┘
```

---

## `Course`

One row per course. Populated by the catalog scraper (`scripts/seed-catalog.ts`).

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (UUID, PK) | Internal primary key. |
| `code` | `String` (unique) | Human-readable code, e.g. `"CSCI 23500"`. |
| `courseNumber` | `String` | Just the number part, e.g. `"23500"`. |
| `subjectCode` | `String` | Just the subject part, e.g. `"CSCI"`. |
| `name` | `String` | Short name, e.g. `"Algorithms"`. |
| `longName` | `String?` | Long/marketing name, often the same as `name`. |
| `description` | `String?` | Catalog description (free text). |
| `credits` | `Int` | Credit hours. Defaults to `0` when missing. |
| `department` | `String` | Department code from Hunter, e.g. `"CSCI-HTR"`. |
| `career` | `String` | `"Undergraduate"` for everything we scrape. |
| `componentsJson` | `String?` | JSON-encoded extras (lecture/lab info). |
| `createdAt` | `DateTime` | When the row was first inserted. |

**Relations**
- `prerequisites: Prerequisite[]` — every Prerequisite row whose `course` is *this* course (i.e., what *this* course requires).
- `prerequisiteOf: Prerequisite[]` — every Prerequisite row whose `prereqCourse` is *this* course (i.e., what other courses require *this* one).
- `professors: Professor[]` — implicit many-to-many. Profs who have been rated for this course on RMP.

---

## `Prerequisite`

A "join table with extra columns" — one row per prereq edge. Populated by the catalog scraper after parsing prereq text from the Coursedog requirement-group API.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (UUID, PK) | Internal primary key. |
| `courseId` | `String` (FK → Course) | The course that has this prereq requirement. |
| `prereqCourseId` | `String?` (FK → Course) | The course that *is* the prereq. Nullable — if the prereq references a course we haven't scraped (e.g. `"BIO 100"` from a different college, or a course that was renamed), this is `null`. |
| `prereqCode` | `String` | Raw text like `"MATH 150"`. Always preserved, even when we couldn't link to a real Course row. |

**Constraint**: `@@unique([courseId, prereqCode])` — a course cannot list the same prereq twice.

**Why two pointers?** Because the catalog references real-world courses we may or may not have. The text is always saved (`prereqCode`); the foreign key (`prereqCourseId`) is filled in when we find a match. A nightly backfill query keeps this consistent as new courses get added.

**Why one row per edge instead of a logical tree?** The catalog text says things like `"(CSCI 24500 or CSCI 26000) and CSCI 23500 and (STAT 11300 or STAT 21300)"`. We currently flatten that to a list of codes — losing the AND/OR structure. A future iteration would replace this with a `PrerequisiteGroup` table that captures the boolean tree.

---

## `Professor`

One row per Hunter prof on RateMyProfessor. Populated by `scripts/seed-rmp.ts`.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (UUID, PK) | Internal primary key. |
| `name` | `String` | `"FirstName LastName"`. |
| `department` | `String?` | RMP's department label (free text — not always one of Hunter's). |
| `rmpId` | `String?` (unique) | The numeric `legacyId` from RMP. Used as the "natural key" so we can re-run the scraper idempotently. |
| `avgRating` | `Float?` | RMP overall rating (1–5). Null when the prof has no ratings. |
| `avgDifficulty` | `Float?` | RMP difficulty (1–5). |
| `wouldTakeAgain` | `Float?` | Percentage 0–100. RMP returns `-1` when there's no data; we normalize that to `null`. |
| `numRatings` | `Int` | How many ratings the prof has on RMP. `0` means "exists in the directory but no ratings." |
| `createdAt` | `DateTime` | When the row was first inserted. |

**Relations**
- `courses: Course[]` — implicit many-to-many. Courses this prof has been rated under on RMP.

---

## `_CourseToProfessor` (hidden)

You won't see this in `schema.prisma` — Prisma generates it automatically because we declared an implicit many-to-many between `Course` and `Professor`. It has only two columns:

| Field | Type |
|---|---|
| `A` | `String` (FK → Course.id) |
| `B` | `String` (FK → Professor.id) |

Indexed on both `(A, B)` and `(B, A)`, so lookups in either direction are a single fast JOIN.

**Why use the hidden table** instead of an explicit join model? Because we don't need to attach metadata (like `courseCount`) to the relationship — we only need to answer "which profs teach course X" and "which courses does prof Y teach." The implicit table is simpler and the same speed.

If we later need to store per-(prof, course) data — e.g., rating count, average difficulty for *this specific* course — we'd swap to an explicit `ProfessorCourse` model.

---

## How the data gets there

| Script | What it populates |
|---|---|
| `scripts/seed-catalog.ts` | `Course` and `Prerequisite` (from Hunter's catalog + Coursedog API). |
| `scripts/seed-rmp.ts` | `Professor` and `_CourseToProfessor` (from RateMyProfessor's GraphQL). |

Both are idempotent — re-running them updates existing rows without duplicating anything.

---

## Code snippets

These all assume you have a Prisma client set up like in the seed scripts:

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
```

### Get one course with its prereqs
```ts
const course = await prisma.course.findUnique({
  where: { code: "CSCI 33500" },
  include: { prerequisites: { include: { prereqCourse: true } } },
});
```

### Get every prof who teaches a course, sorted by rating
```ts
const result = await prisma.course.findUnique({
  where: { code: "CSCI 23500" },
  include: { professors: { orderBy: { avgRating: "desc" } } },
});
const profs = result?.professors ?? [];
```

### Get every course a prof has been rated for
```ts
const prof = await prisma.professor.findFirst({
  where: { name: "John Smith" },
  include: { courses: true },
});
```

### Find easy electives in CSCI (high rating, low difficulty, ≥10 ratings)
```ts
const electives = await prisma.course.findMany({
  where: {
    subjectCode: "CSCI",
    professors: {
      some: {
        numRatings: { gte: 10 },
        avgRating:  { gte: 4.0 },
        avgDifficulty: { lte: 3.0 },
      },
    },
  },
  include: { professors: true },
  take: 20,
});
```

### List all courses that require a given course
```ts
const csci235 = await prisma.course.findUnique({
  where: { code: "CSCI 23500" },
  include: { prerequisiteOf: { include: { course: true } } },
});
const dependents = csci235?.prerequisiteOf.map((p) => p.course) ?? [];
```

### Aggregate stats
```ts
const numCourses = await prisma.course.count();
const ratedProfs = await prisma.professor.count({
  where: { numRatings: { gt: 0 } },
});
```

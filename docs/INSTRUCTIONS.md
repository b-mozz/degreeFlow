# Next Session — Instructions

Pick up here. Goal: build the AND/OR prereq parser so the recommender can use real prereq semantics instead of strict-mode.

---

## Where we left off

- `Course.prereqText` column exists and is populated for 3,919 / 8,873 courses (raw `descriptionLong` from Coursedog).
- The flat `Prerequisite` table still exists with ~4,915 rows (extracted codes only). Keep it — the `/courses/:id/professors/top` endpoint isn't touching it, but downstream code might.
- `seed-catalog.ts` writes `prereqText` automatically on every re-run.

Sample of real prereq strings (already in DB):

```
[AFPRL 30900]  Prerequisite: ENGL12000 and (BLPR 20300 or AFPRL 20300 or BLPR 20400 or AFPRL 20400)
[ENGL 32954]   Prerequisite: ENGL 22000 or Non-Degree
[POLSC 30415]  Prerequisite: Engl 12000
[CSCI 39592]   Prerequisite: CSCI 23500.
```

Real messiness already visible:
- `ENGL12000` — no space between subject and number (existing regex misses these)
- `Engl 12000` — lowercase subject
- `or Non-Degree`, `or permission of department`, `or equivalent` — non-course conditions
- Trailing periods, inconsistent `Prerequisite:` vs `Prerequisites:`

---

## Step 1 — Build the parser fixture (DO THIS FIRST, ~30 min)

Goal: a file `backend/scripts/parser.fixtures.ts` (or similar) with ~30 hand-picked prereq strings and their expected parse output. This is the spec. Every parser iteration runs against this file.

### How to pick the 30

Pull a varied sample from `Course.prereqText`. Aim for:
- 5 simple single-prereq (`"CSCI 23500"`)
- 5 pure AND (`"ENGL 12000 and MATH 100"`)
- 5 pure OR (`"STAT 11300 or STAT 21300"`)
- 5 mixed CNF — `(A or B) and C and (D or E)`
- 5 with noise — "permission of department", "with grade of C or better", "Non-Degree", lowercase, missing space
- 5 weird/unique cases that look hard

Quick query to grab them:

```ts
// scripts/sample-prereqs.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
async function main() {
  const rows = await prisma.course.findMany({
    where: { NOT: { prereqText: null } },
    select: { code: true, prereqText: true },
    take: 100,
  });
  for (const r of rows) console.log(`[${r.code}]  ${r.prereqText}`);
}
main().finally(() => prisma.$disconnect());
```

Manually pick 30 from the output that cover the categories above.

### Expected-output format

Use CNF: `string[][]` where outer array = AND groups, inner array = OR options.

```ts
export const FIXTURES = [
  {
    name: "simple single",
    raw: "Prerequisite: CSCI 23500.",
    expected: [["CSCI 23500"]],
  },
  {
    name: "pure AND",
    raw: "Prerequisite: ENGL 12000 and MATH 15000.",
    expected: [["ENGL 12000"], ["MATH 15000"]],
  },
  {
    name: "pure OR",
    raw: "Prerequisite: STAT 11300 or STAT 21300.",
    expected: [["STAT 11300", "STAT 21300"]],
  },
  {
    name: "CNF mixed",
    raw: "(CSCI 24500 or CSCI 26000) and CSCI 23500 and (STAT 11300 or STAT 21300) and MATH 155",
    expected: [["CSCI 24500", "CSCI 26000"], ["CSCI 23500"], ["STAT 11300", "STAT 21300"], ["MATH 15500"]],
  },
  // ... add 26 more
];
```

For the noise cases, decide what the parser should do — usually drop the noise and keep the courses, but record that decision in a comment.

---

## Step 2 — Schema for structured prereqs

Add to `prisma/schema.prisma`:

```prisma
model PrereqGroup {
  id        String         @id @default(uuid())
  courseId  String
  course    Course         @relation("CoursePrereqGroups", fields: [courseId], references: [id])
  options   PrereqOption[]
  position  Int            // order of the AND group within the course (0-indexed)

  @@index([courseId])
}

model PrereqOption {
  id              String       @id @default(uuid())
  groupId         String
  group           PrereqGroup  @relation(fields: [groupId], references: [id])
  prereqCode      String
  prereqCourseId  String?
  prereqCourse    Course?      @relation("PrereqOptionFor", fields: [prereqCourseId], references: [id])

  @@unique([groupId, prereqCode])
}
```

And on `Course`:

```prisma
prereqGroups       PrereqGroup[]   @relation("CoursePrereqGroups")
prereqOptionsFor   PrereqOption[]  @relation("PrereqOptionFor")
```

Then:
```bash
cd backend && npx prisma migrate dev --name add_prereq_groups
npx prisma generate
```

Don't drop the existing `Prerequisite` table.

---

## Step 3 — Parser pipeline

Build as four pure functions in `scripts/parse-prereqs-structured.ts`. Each one tested against the fixture before moving to the next.

### 3a. `cleanPrereqText(raw: string): string`

Normalize:
- Lowercase comparisons (but preserve case in tokens)
- Strip the leading `Prerequisite(s):` label
- Strip trailing punctuation
- Strip non-course phrases:
  - `with (a )?grade of [A-D][+\-]? or (better|higher)`
  - `or (permission|consent) of (the )?(department|instructor|chair)`
  - `or equivalent`
  - `or Non[- ]?Degree`
  - `(junior|senior|sophomore) standing`
- Insert space in `ENGL12000` → `ENGL 12000` (regex: `([A-Z]{2,5})(\d{3,5})` → `$1 $2`, case-insensitive)
- Uppercase subject codes

### 3b. `tokenize(clean: string): Token[]`

Token types: `COURSE`, `AND`, `OR`, `LPAREN`, `RPAREN`. Walk char-by-char or use regex matchAll. Skip unknown tokens with a warning logged to an audit array.

### 3c. `parse(tokens: Token[]): AST`

Recursive descent, grammar:

```
expr   := term ("AND" term)*
term   := factor ("OR" factor)*
factor := COURSE | "(" expr ")"
```

Note the precedence — verify against fixture cases. AND binds looser than OR (so `A or B and C or D` = `(A or B) and (C or D)`).

### 3d. `toCNF(ast: AST): string[][]`

For most real Hunter strings, the AST is already in CNF. Implement only the cases you actually see in the fixture; throw "unhandled AST shape" otherwise so you know when to extend it.

---

## Step 4 — Wire into seed

In `seed-catalog.ts` Stage 6, where we already have `rgText` in scope:

```ts
const cnf = parsePrereqsStructured(rgText);  // returns string[][] | null
if (cnf) {
  // Write groups + options for this course inside a transaction.
  // Delete existing groups for this courseId first so re-runs are clean.
}
```

Wrap each course's writes in `prisma.$transaction([...])` so a half-written set never appears.

Keep the existing flat `Prerequisite` insert. Both populate side-by-side.

---

## Step 5 — Eligibility service

`backend/src/services/eligibility.ts`:

```ts
export async function isEligible(
  courseCode: string,
  completed: Set<string>
): Promise<{ ok: boolean; missingGroups: string[][] }> {
  // Load groups for the course.
  // For each group, check if any option ∈ completed.
  // ok = every group satisfied.
}
```

Test with a hand-built `completed` set against a known course.

---

## Step 6 — Recommender

Now revisit `RECOMMENDER_PLAN.md`. The strict-mode warning in §1 is no longer needed — replace with the structured eligibility check. Build `recommendNextCourses` on top of `isEligible`.

---

## Open decisions to make as you go

- **Comma handling.** "CSCI 12700, CSCI 13500, and CSCI 23500" — usually AND but sometimes OR. Pick one default (recommend AND), audit-log every case so you can review.
- **What to do with un-parseable strings?** Skip and log to a JSON file, or fall back to flat-list mode for that course? Recommend: skip with audit log; revisit after first run.
- **Drop the flat `Prerequisite` table?** Only after the structured table is fully populated AND no consumer reads from `Prerequisite`. Phase that into a later session.

---

## Files / references

- Schema: `backend/prisma/schema.prisma`
- Existing parser (codes-only): `backend/scripts/parse-prereqs.ts`
- Seed entry point: `backend/scripts/seed-catalog.ts` (Stage 6 is where structured writes go)
- Recommender plan: `docs/RECOMMENDER_PLAN.md`
- Prereq scraping background: `docs/PREREQ_STRATEGY.md`

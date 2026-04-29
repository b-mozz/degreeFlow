# DegreeFlow — Code Walkthrough

A friendly tour of the codebase for someone new to TypeScript and Prisma. This document explains the **big picture first**, then walks through each file and the concepts it relies on.

---

## 1. What does this project do?

DegreeFlow scrapes the **Hunter College course catalog** from the web, parses out **courses and their prerequisites**, and stores everything in a **PostgreSQL database**. Eventually you'll be able to build features like "show me a graph of which classes I need to take", but right now the project is just the **data-gathering backend**.

The flow looks like this:

```
Hunter Catalog Website
        │
        ▼  (fetch HTML, extract hidden Nuxt JSON)
    seed-catalog.ts  ──► uses ──► parse-prereqs.ts (regex to find course codes)
        │
        ▼  (Prisma Client)
    PostgreSQL DB  (tables defined in prisma/schema.prisma)
```

---

## 2. The tools / vocabulary

Before we read code, here's the cheat-sheet of unfamiliar things you'll see:

### TypeScript (TS)
- A **superset of JavaScript** that adds **types**. You write `name: string`, `count: number`, etc. and the editor catches mistakes before you run the code.
- TypeScript files end in `.ts`. They get compiled (or run on-the-fly via `ts-node`) into plain JavaScript that Node.js can execute.
- Common TS-only syntax you'll see in this repo:
  - `interface RawCourse { ... }` — describes the **shape** of an object. It's like a contract: "anything called a RawCourse must have these fields."
  - `string | null | undefined` — a **union type**. The value can be any of those.
  - `string?` (with question mark) — means the field is **optional**.
  - `Promise<void>` — the function returns a Promise that, when finished, gives nothing back.
  - `as` — type assertion ("trust me, treat this as X").

### Prisma
- An **ORM** (Object-Relational Mapper). Instead of writing raw SQL, you describe your tables in `schema.prisma`, and Prisma generates a typed client (`PrismaClient`) so you can do things like:
  ```ts
  await prisma.course.create({ data: { code: "CSCI 12700", name: "Intro" } })
  ```
- The **schema file** (`prisma/schema.prisma`) is the source of truth. When you change it, you run `npx prisma migrate` or `npx prisma generate` to update both the database and the TypeScript client.
- Generated client code lives in `generated/prisma/` (you don't edit it by hand).

### Node.js core ideas
- **Async / await**: many operations (fetching a webpage, querying a DB) take time. Functions marked `async` return a Promise, and `await something()` pauses until it finishes — without freezing the whole program.
- **Modules**: `import x from "y"` pulls in code from another file or library. `export function foo()` makes something usable from another file.

---

## 3. Project layout

```
degreeFlow/
├── package.json          ← lists dependencies + scripts (e.g. "npm run seed")
├── tsconfig.json         ← TypeScript compiler settings
├── prisma.config.ts      ← tells Prisma where the schema and DB live
├── prisma/
│   └── schema.prisma     ← database table definitions
├── scripts/
│   ├── seed-catalog.ts   ← scraper + DB seeder (the main script)
│   └── parse-prereqs.ts  ← helper that pulls course codes out of text
└── generated/prisma/     ← auto-generated Prisma client (don't edit)
```

---

## 4. `package.json` — the project manifest

```json
"scripts": {
  "seed": "ts-node scripts/seed-catalog.ts"
}
```
- Run `npm run seed` and Node will execute the scraper through `ts-node` (which compiles TS to JS on the fly).

Dependencies in plain English:
- **`@prisma/client` + `prisma`** — the ORM and its CLI.
- **`dotenv`** — loads secrets like `DATABASE_URL` from a `.env` file.
- **`ts-node`** — lets you run `.ts` files without a separate compile step.
- **`typescript`** — the TS compiler itself.
- **`@types/node`** — TypeScript type definitions for Node's built-in modules (so the editor knows what `vm` or `fetch` look like).

---

## 5. `prisma/schema.prisma` — the database design

Three tables (Prisma calls them **models**):

### `Course`
Each row is one course (e.g., CSCI 23500).

Key fields:
- `id` — internal UUID primary key.
- `code` — human-readable like `"CSCI 23500"`. Marked `@unique`, so the DB rejects duplicates.
- `name`, `longName`, `description`, `credits`, `department`, `career` — what you'd expect from a course catalog.
- `componentsJson` — a JSON blob stored as a string (for stuff that doesn't fit cleanly into columns, like lecture/lab components).
- `prerequisites` and `prerequisiteOf` — **relations** to the `Prerequisite` table. One course can require many prereqs and be required by many others ("many-to-many through a join table").

### `Prerequisite`
A **join table** that says "Course A requires Course B".
- `courseId` — the course that has the requirement.
- `prereqCourseId` — the course being required (nullable, in case it's a prereq we haven't scraped yet — like a course from another college).
- `prereqCode` — the raw text like `"MATH 150"`. This is always saved even when we couldn't link to a real `Course` row.
- `@@unique([courseId, prereqCode])` — composite uniqueness, so we never store the same link twice.

### `Professor`
Currently unused by the seed script, but reserved for future RateMyProfessors integration.

> **Why two pointers (`prereqCourseId` and `prereqCode`)?** Because the catalog references courses we may not have scraped (foreign departments, retired classes). The text is always preserved; the link is only made if we can resolve it.

---

## 6. `scripts/parse-prereqs.ts` — the regex helper

Input: a course description string (or null/undefined).
Output: an array of course codes mentioned in the prerequisites section.

It works in two steps:

1. **Find the section.** Run a regex looking for `Prerequisites:` (or variants like `Prereq:`) followed by text up to the next period or end of string. If there's no such section, return `[]`.
2. **Extract codes.** Inside that section, scan for the pattern `LETTERS WHITESPACE NUMBERS` (e.g., `CSCI 23500`). Collect them all, deduplicate via `new Set(...)`, return.

If you've never seen regex before, the cheat sheet:
- `[A-Z]{2,5}` — 2 to 5 uppercase letters.
- `\d{3,5}` — 3 to 5 digits.
- `\b` — word boundary (no characters glued to it).
- `/g` flag — find every match, not just the first.
- `/i` flag — case-insensitive.
- `/s` flag — let `.` match newlines.

---

## 7. `scripts/seed-catalog.ts` — the main script

This is where most of the action is. It runs in five stages.

### Stage 1: setup
```ts
const prisma = new PrismaClient();
```
Opens a connection pool to the database. Every `prisma.course.findMany()` etc. uses this.

### Stage 2: scrape each department
```ts
for (const deptId of DEPARTMENT_IDS) { ... }
```
For each department code (`CSCI-HTR`, `MATH-HTR`, …):
1. Build a URL like `https://hunter-undergraduate.catalog.cuny.edu/departments/CSCI-HTR/courses`.
2. `fetch` the HTML.
3. The website is built with **Nuxt** (a Vue framework). The page ships its data inside a `<script>` tag that does `window.__NUXT__=...`. The function `extractNuxtData` digs out that string and uses Node's `vm` module to safely turn it back into a JavaScript object.
4. Pull the `coursesFallback` array out of that object — that's the list of `RawCourse`s.
5. `await sleep(1500)` — wait 1.5 seconds before the next request to be polite (and avoid getting blocked).

Filtering rules:
- Skip if `career !== "Undergraduate"`.
- Skip if `effectiveEndDate` is set (= retired course).
- Use a `Map` keyed by course code to avoid duplicates across departments (cross-listed courses).

### Stage 3: upsert courses
```ts
await prisma.course.upsert({
  where: { code: course.code },
  update: { ... },
  create: { ... },
});
```
**Upsert = "update if exists, otherwise insert"**. This makes the script safe to re-run — running `npm run seed` twice won't create duplicates; it'll just update the existing rows.

It also remembers the database ID for each course in a second Map (`courseCodeToId`), so the next stage can link them.

### Stage 4: parse and link prerequisites
For each course:
1. Run `parsePrereqs(course.description)` to get the list of mentioned codes.
2. For each code, look up its DB id (or `null` if it's a course we don't have).
3. Upsert into the `Prerequisite` table, keyed by `(courseId, prereqCode)`.

### Stage 5: cleanup
```ts
main()
  .catch((err) => { ... process.exit(1); })
  .finally(() => prisma.$disconnect());
```
- `.catch` runs if anything inside `main` threw an error.
- `.finally` always runs at the end and closes the DB connection cleanly.

---

## 8. How to run it

```bash
# 1. Install dependencies
npm install

# 2. Set up your database (one-time)
#    Create a .env file with: DATABASE_URL="postgresql://user:pass@localhost:5432/degreeflow"
npx prisma migrate dev    # creates tables based on schema.prisma
npx prisma generate       # regenerates the typed client

# 3. Run the scraper
npm run seed
```

---

## 9. Mental model — what to keep in mind

- **The schema is the contract.** Change `schema.prisma` → re-run `prisma generate` → the TypeScript types update everywhere. Don't try to add fields by editing generated code.
- **Async functions return Promises.** If you forget `await`, you'll get a Promise object instead of the value you wanted.
- **Upserts make scripts re-runnable.** This is a deliberate pattern — the seed script is **idempotent**.
- **Scraping is fragile.** If Hunter redesigns their site, `extractNuxtData` will break. That's expected; you'll just need to inspect the new HTML and update the regex/path.
- **Types catch mistakes early.** If you add a field to the Prisma schema but forget to update the `upsert(...)` call, TypeScript will complain at edit-time before you even run the code.

---

## 10. Things to explore next

- Open `generated/prisma/index.d.ts` and read a few lines — that's the auto-generated TypeScript that defines what methods like `prisma.course.findMany()` look like.
- Try `npx prisma studio` — a visual table browser for your DB.
- Add a `console.log(prereqCodes)` inside the prereq loop to see what `parsePrereqs` actually finds.

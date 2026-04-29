# DegreeFlow — Project Status

## What it is

DegreeFlow is a tool for Hunter College (CUNY) students. The goal: replace the slow/cluttered DegreeWorks experience with something that:

1. Parses an unofficial transcript and extracts courses + grades
2. Shows degree progress as a visual flowchart
3. Surfaces GPA analytics (trends, what-if, strongest/weakest subjects)
4. Recommends electives using RateMyProfessor difficulty data + the student's own GPA trends
5. Suggests an optimal order for remaining courses based on prereqs and workload

Full product spec lives in `docs/project-details.md`.

---

## Tech stack

| Layer    | Tools                                  |
| -------- | -------------------------------------- |
| Frontend | React, TailwindCSS, React Flow *(not started yet)* |
| Backend  | Node.js, Express, Prisma               |
| Database | PostgreSQL (currently local — to be moved to Supabase) |
| Scraping | Puppeteer / Cheerio                    |
| Auth     | Microsoft OAuth *(planned)*            |
| AI       | OpenAI GPT-4 *(planned, for transcript parsing)* |

---

## Repo layout

```
degreeFlow/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Course, Prerequisite, Professor models
│   │   └── migrations/            # 3 migrations so far
│   ├── scripts/
│   │   ├── seed-catalog.ts        # Scrapes Hunter catalog → Course + Prerequisite rows
│   │   ├── seed-rmp.ts            # Scrapes RateMyProfessor → Professor rows
│   │   ├── parse-prereqs.ts       # Prereq text parsing (in progress)
│   │   ├── debug-rmp-unmatched.ts
│   │   └── lib/course-key.ts
│   └── src/
│       ├── server.ts              # Express entry
│       ├── db.ts                  # Prisma client
│       ├── routes/courses.ts      # /courses endpoints
│       └── services/professorRanking.ts
├── frontend/                      # Empty — not started
├── docs/                          # Design docs & session notes
└── .gitignore
```

---

## What's done

### Backend / database
- Prisma schema with three models: `Course`, `Prerequisite` (join table), `Professor` (many-to-many with Course).
- Hunter course catalog scraper (`seed-catalog.ts`) is working — populates ~8,873 courses with codes, names, credits, department, components, and the raw `prereqText` field from Coursedog.
- RateMyProfessor scraper (`seed-rmp.ts`) is working — populates professor difficulty ratings and links them to courses.
- One Express route live: `GET /courses/:id/professors/top` (returns top-ranked professors for a course; uses `services/professorRanking.ts`).
- Three migrations applied: initial schema, professor↔course relation, `prereqText` column.

### Data state (last run)
- 8,873 courses scraped.
- 3,919 of those have non-null `prereqText`.
- ~4,915 rows in the flat `Prerequisite` table (extracted course codes only — no AND/OR semantics yet).

### Frontend
- Not started. `frontend/` is an empty placeholder.

---

## What's in progress / next

The active task (see `docs/INSTRUCTIONS.md`) is building an **AND/OR prereq parser** that turns raw `prereqText` strings like:

```
"Prerequisite: ENGL12000 and (BLPR 20300 or AFPRL 20300)"
```

into a structured boolean expression the recommender can actually reason about. The current flat `Prerequisite` table only stores extracted codes — it loses all the AND/OR structure, which makes "what can I take next?" queries unreliable.

Plan: build a fixture file of ~30 hand-labeled prereq strings, then iterate the parser against it.

---

## What collaborators need to do to run it

1. `cd backend && npm install` (and `npm install` at repo root for the lockfile).
2. Set up a local Postgres database, then create `backend/.env` with:
   ```
   DATABASE_URL=postgresql://<user>:<pass>@localhost:5432/degreeflow
   ```
3. `npx prisma migrate dev` to apply migrations.
4. `npm run seed` to populate the course catalog (slow — scrapes the Hunter catalog).
5. `npm run seed:rmp` to populate professor ratings.
6. `npm run dev` to start the Express server.

> Note: the database will be moved to a managed cloud Postgres (likely Supabase) soon so collaborators don't each need to seed locally.

---

## Open questions / known issues

- Prereq text is messy: `ENGL12000` (no space), lowercase subjects, `or Non-Degree`, `or permission of department`, etc. The parser needs to handle all of these.
- No tests yet.
- No auth, no transcript parser, no frontend, no recommender — all planned.
- Database currently lives on a single laptop; needs to migrate to cloud before serious collaboration.

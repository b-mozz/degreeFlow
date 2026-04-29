# Task: Build Hunter College Course Catalog Scraper + DB Seeder

## Context
I'm building DegreeFlow, a degree planning app for Hunter College students. The backend is Node.js + Express + Prisma + PostgreSQL. I need a scraper that pulls course data from the Hunter catalog and seeds it into my database.

## Data Source
The Hunter undergraduate catalog is at `https://hunter-undergraduate.catalog.cuny.edu`. It's a Nuxt.js app powered by Coursedog. Course data is **server-side rendered** inside a `window.__NUXT__` JavaScript blob on each department's courses page.

**URL pattern:** `https://hunter-undergraduate.catalog.cuny.edu/departments/{DEPT_ID}/courses`

**Department IDs** (from the catalog page — use all of these):
```
AFR-HTR, ANTH-HTR, ART-HTR, BIO-HTR, CHEM-HTR, CLASS-HTR, CSCI-HTR,
CURR-HTR, DAN-HTR, ECON-HTR, EDU-HTR, ENGL-HTR, FILM-HTR, GEOG-HTR,
GER-HTR, HIST-HTR, HMBIOL-HTR, MATH-HTR, MLS-HTR, MUS-HTR, NUR-HTR,
NPH-HTR, PHIL-HTR, PT-HTR, PHYS-HTR, POLSCI-HTR, PSYCH-HTR,
ROMLAN-HTR, SAS-HTR, EDUC-HTR, NURSE-HTR, SW-HTR, SOC-HTR, SPED-HTR,
THR-HTR, URBAF-HTR, UPH-HTR, WGS-HTR
```

**How to extract course data:**
1. Fetch the HTML from each department URL
2. Extract the `window.__NUXT__=...` script content using regex
3. The `__NUXT__` blob is a self-executing function that returns an object. Inside `data[0].coursesFallback` is an array of course objects.
4. IMPORTANT: The `__NUXT__` blob uses variable compression (single-letter variables). You CANNOT just JSON.parse it. You need to evaluate the JavaScript function to get the actual object. Use `vm.runInNewContext()` from Node's `vm` module or `new Function()` to safely evaluate it.

**Course object shape (fields available in coursesFallback):**
```js
{
  _id: "0245171-2013-12-01",        // internal coursedog ID
  code: "CSCI 23500",               // course code (what students see)
  name: "Software Analysis and Design 2",  // short name
  longName: "Software Analysis and Design 2", // full name
  description: "Representation of information...", // full description text
  subjectCode: "CSCI",              // department subject code
  courseNumber: "23500",             // just the number portion
  departments: ["CSCI-HTR"],         // department IDs array
  career: "Undergraduate",          // career level
  credits: {
    creditHours: { min: 3, max: 3 },
    contactHours: { value: 3 },
    repeatable: false,
    numberOfRepeats: 0
  },
  components: [                      // lecture, lab, recitation etc
    { id: "LEC", code: "LEC", name: "Lecture", contactHours: 3 }
  ],
  effectiveStartDate: "2013-12-01",
  effectiveEndDate: null             // null means still active
}
```

## Prerequisite Parsing
There is NO structured prerequisite field. Prerequisites must be parsed from the `description` text. Common patterns in Hunter course descriptions:
- "Prerequisites: CSCI 135 and CSCI 150"
- "Prerequisite: CSCI 235"
- "Prereq: MATH 150 or MATH 155"
- Sometimes embedded mid-description

Strategy:
1. Regex for prerequisite-related keywords in the description
2. Extract course codes (pattern: 2-5 uppercase letters followed by a space and 3-5 digit number, e.g. `CSCI 23500`, `MATH 150`)
3. Store as rows in a `prerequisite` join table linking course_id → prereq_course_code
4. Don't worry about AND/OR logic for MVP — just store which courses are mentioned as prereqs

## What to Build

### 1. Prisma Schema (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Course {
  id              String   @id @default(uuid())
  code            String   @unique  // "CSCI 23500"
  courseNumber     String             // "23500"
  subjectCode     String             // "CSCI"
  name            String             // short name
  longName        String?            // full name
  description     String?
  credits         Int      @default(0)
  department      String             // "CSCI-HTR"
  career          String   @default("Undergraduate")
  componentsJson  String?            // JSON string of components array
  
  prerequisites   Prerequisite[] @relation("CoursePrereqs")
  prerequisiteOf  Prerequisite[] @relation("PrereqFor")
  
  createdAt       DateTime @default(now())
}

model Prerequisite {
  id              String   @id @default(uuid())
  courseId         String
  course          Course   @relation("CoursePrereqs", fields: [courseId], references: [id])
  prereqCourseId  String?
  prereqCourse    Course?  @relation("PrereqFor", fields: [prereqCourseId], references: [id])
  prereqCode      String   // raw code string like "CSCI 13500" (kept even if course not in DB)
  
  @@unique([courseId, prereqCode])
}

model Professor {
  id              String   @id @default(uuid())
  name            String
  department      String?
  rmpId           String?  @unique
  avgRating       Float?
  avgDifficulty   Float?
  wouldTakeAgain  Float?   // percentage
  numRatings      Int      @default(0)
  
  createdAt       DateTime @default(now())
}
```

### 2. Scraper Script (`scripts/seed-catalog.js`)

Write a Node.js script that:
1. Iterates through all department IDs
2. For each department, fetches the courses page HTML
3. Extracts the `window.__NUXT__=(function(...){...})(...);` blob using regex
4. Evaluates it safely to get the JS object
5. Pulls `coursesFallback` from the result (path: result.data[0].coursesFallback)
6. Deduplicates courses across departments (some courses appear in multiple departments)
7. For each course, parses prerequisites from the description text
8. Upserts all courses into the database via Prisma
9. Creates prerequisite relationships

**Important implementation notes:**
- Add a delay between department fetches (1-2 seconds) to be polite to the server
- Filter to only `career === "Undergraduate"` courses
- Filter out courses where `effectiveEndDate` is set (those are retired/inactive)
- Handle the compressed __NUXT__ format — it's a function call, not JSON. Use something like:
  ```js
  const vm = require('vm');
  const nuxtMatch = html.match(/window\.__NUXT__=(.*?);<\/script>/s);
  const nuxtData = vm.runInNewContext(nuxtMatch[1]);
  ```
- Log progress (which department is being fetched, how many courses found)
- The script should be idempotent (safe to re-run via upsert)

### 3. Project Structure
```
scripts/
  seed-catalog.js      # main scraper + seeder
  parse-prereqs.js     # prerequisite parser (helper module)
prisma/
  schema.prisma
.env                   # DATABASE_URL
```

## Run Instructions
After building, I should be able to:
```bash
# Set up the database
npx prisma migrate dev --name init

# Run the scraper
node scripts/seed-catalog.js
```

## Do NOT include
- RateMyProfessor scraping (will be a separate script later)
- CUNY Global Search scraping (separate script later)  
- Express routes or API endpoints
- Frontend code
- Authentication
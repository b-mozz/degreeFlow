```
name: Bimukti Mozzumdar
```

# DegreeFlow MVP

CUNY DegreeWorks is slow, cluttered, and tells you _what_ courses you need — but not _which_ ones are easy, interesting, or fit your schedule. Finding a good elective means digging through the catalog, cross-referencing RateMyProfessor, and hoping for the best.

DegreeFlow fixes this for Hunter students: upload your transcript, see your degree progress as a visual flowchart, and get smart elective suggestions based on professor difficulty ratings and your strengths.

---

## Features

1. **Transcript Parser** — Paste unofficial transcript, AI extracts courses/grades
2. **Degree Flowchart** — Visual map of major requirements (completed vs remaining)
3. **GPA Analytics** — Trends, what-if calculator, strongest/weakest subjects
4. **Smart Electives** — Recommendations based on RateMyProfessor difficulty + your GPA trends
5. **Course Path Optimizer** — Optimal order for remaining courses (prereqs, workload)

---

## Data Sources

|Data|Source|Method|
|---|---|---|
|Major requirements|Hunter Catalog|Manual entry|
|Course list + prereqs|Hunter Catalog|Scrape with Puppeteer|
|Difficulty ratings|RateMyProfessor|Scrape unofficial API|

---

## Tech Stack

|Layer|Tools|
|---|---|
|Frontend|React, TailwindCSS, React Flow|
|Backend|Node.js, Express, Prisma|
|Database|PostgreSQL (Supabase)|
|Auth|Microsoft OAuth (`@azure/msal-node`)|
|AI|OpenAI GPT-4|
|Scraping|Puppeteer / Cheerio|

---

## Cost

|Service|Cost|
|---|---|
|Vercel + Railway + Supabase|$0 (free tiers)|
|OpenAI|~$5-10/mo|
|**Total**|**~$5-10/mo**|

---


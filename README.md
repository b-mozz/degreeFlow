# DegreeFlow

An automated degree-audit and course-recommendation tool for Hunter College (CUNY) students — a faster alternative to DegreeWorks.

**[Live Demo](https://degree-flow-omega.vercel.app/upload)**

## What it does

- Parses an unofficial transcript into structured course history
- Tracks degree progress across a catalog of 8,800+ courses and 920 requirement groups
- Recommends valid schedules from remaining requirements, enforcing prerequisites and term availability
- Ranks each course's professors using a Bayesian-weighted score over RateMyProfessors data

## Stack

React · TypeScript · Node.js / Express · Prisma · PostgreSQL · Puppeteer

## Setup

```bash
# Backend
cd backend
npm install
echo "DATABASE_URL=postgresql://user:pass@localhost:5432/degreeflow" > .env
npx prisma migrate dev
npm run seed        # scrape course catalog
npm run seed:rmp    # scrape professor ratings
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

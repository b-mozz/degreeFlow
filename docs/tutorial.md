# DegreeFlow Backend — Learning Resources

A beginner-friendly path through the stack. Ordered roughly in the sequence you'd actually learn them — don't try to absorb all at once.

**Stack:** Node.js + TypeScript + Fastify + Prisma + Postgres + Zod + Pino + Vitest, deployed on Railway. Redis + BullMQ added later.

---

## Foundation (learn first)

### Node.js
- Official intro (short, clear): https://nodejs.org/en/learn/getting-started/introduction-to-nodejs
- The Odin Project's NodeJS path (free, structured): https://www.theodinproject.com/paths/full-stack-javascript/courses/nodejs

### TypeScript
The most important one to actually understand, not just copy.
- Official "TS for JS programmers" (start here): https://www.typescriptlang.org/docs/handbook/typescript-from-scratch.html
- Total TypeScript free beginner tutorial (best free TS resource on the internet): https://www.totaltypescript.com/tutorials/beginners-typescript
- Matt Pocock's YouTube (short videos, very good): https://www.youtube.com/@mattpocockuk

### Node + TS together
- Official Node guide: https://nodejs.org/en/learn/getting-started/nodejs-with-typescript

---

## Web framework

### Fastify
- Official "Getting Started" (do the whole thing — it's short): https://fastify.dev/docs/latest/Guides/Getting-Started/
- TypeScript guide: https://fastify.dev/docs/latest/Reference/TypeScript/
- Plugins guide (important — plugins are how Fastify is structured): https://fastify.dev/docs/latest/Guides/Plugins-Guide/

---

## Database

### PostgreSQL
- Interactive tutorial (no install needed, best for beginners): https://pgexercises.com/
- "Postgres for everything" mental model: https://www.postgresqltutorial.com/

### Prisma
This is what you'll actually use day-to-day, not raw SQL.
- Official quickstart with Postgres + TS: https://www.prisma.io/docs/getting-started/quickstart-prismaPostgres
- Prisma Schema reference (bookmark this): https://www.prisma.io/docs/orm/prisma-schema/data-model/models
- Prisma Client queries (bookmark this too): https://www.prisma.io/docs/orm/prisma-client/queries/crud

---

## Validation & types at the edges

### Zod
- Official docs (very readable): https://zod.dev/
- Total TypeScript free Zod tutorial: https://www.totaltypescript.com/tutorials/zod

### Fastify + Zod integration
This is what makes the whole stack feel cohesive.
- `fastify-type-provider-zod`: https://github.com/turkerdev/fastify-type-provider-zod

---

## API documentation

### OpenAPI / Swagger
- Concept intro (what OpenAPI even is): https://swagger.io/docs/specification/v3_0/about/
- Fastify Swagger plugin: https://github.com/fastify/fastify-swagger

---

## Logging

### Pino
- Official docs: https://getpino.io/#/
- Fastify logging guide (uses Pino under the hood): https://fastify.dev/docs/latest/Reference/Logging/

---

## Caching & background jobs (later, after the basics work)

### Redis
- "Try Redis" interactive tutorial: https://redis.io/learn/howtos/quick-start
- Redis data types overview: https://redis.io/docs/latest/develop/data-types/

### BullMQ
Job queues built on Redis — productionize your scrapers.
- Getting started: https://docs.bullmq.io/guide/introduction

---

## Testing

### Vitest
Modern test runner — like Jest but faster and TS-native.
- Getting started: https://vitest.dev/guide/

### Supertest
For testing HTTP endpoints.
- README walkthrough: https://github.com/ladjs/supertest

---

## Deployment

### Railway
Easiest free-tier deploy for Node + Postgres.
- Quickstart: https://docs.railway.com/quick-start
- Deploy a Fastify app: https://docs.railway.com/guides/fastify

---

## "Just one tutorial that ties it all together"

If you want one cohesive read instead of jumping between docs:
- Fastify + Prisma + Postgres tutorial: https://www.prisma.io/blog/fastify-prisma-rest-api-oCpCp7BD7c
- Or this newer one: https://blog.logrocket.com/building-rest-api-fastify-prisma-orm/

---

## Suggested order

1. Skim **Node intro** + **TS handbook intro** (1–2 hours total). Don't try to master TS before writing code; you'll learn it as you build.
2. Do the **Fastify Getting Started** end to end (1 hour). You'll have a "hello world" API.
3. Do the **Prisma quickstart** with your existing Postgres DB (1–2 hours). You already have a schema — just generate the client and run a query.
4. Read the **Zod intro** + the **Fastify-Zod type provider** README. Now you have validated, typed endpoints.
5. Build your "top 5 professors for course X" endpoint. This is the moment everything clicks.
6. Add **Pino logging**, **Swagger docs**, **Vitest tests** for that one endpoint.
7. Deploy to **Railway**. Get a public URL.
8. *Then* add Redis/BullMQ once the boring parts work.

Skip steps 6–8 entirely until step 5 works end-to-end. Beginners' #1 mistake is trying to set up the perfect stack before writing a single endpoint.

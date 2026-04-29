/**
 * db.ts — the single Prisma client for the whole backend.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Prisma talks to Postgres through a connection pool. Every `new PrismaClient()`
 * opens its own pool. If routes/services each created their own client, you'd
 * quickly run out of Postgres connections (especially in dev with hot reload).
 *
 * The fix: create ONE client here, export it, and have every other file
 * `import { prisma } from "../db"`. This is the standard pattern in every
 * Prisma project — a "singleton".
 *
 * WHAT THE `globalThis` TRICK IS DOING
 * ------------------------------------
 * In dev, when you use a watcher (nodemon / ts-node-dev) the file gets
 * re-imported on every save. Without protection, each reload would create a
 * fresh PrismaClient and leak the previous one. By stashing the instance on
 * the Node global object, reloads reuse the same client.
 * In production we just create it once and move on.
 */

import "dotenv/config"; // Load DATABASE_URL from .env before we touch Prisma.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Tell TypeScript that `globalThis` *might* have a `prisma` field on it.
// (We're adding it ourselves below; TS doesn't know that by default.)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7 requires an explicit driver adapter — it doesn't talk to Postgres
// directly anymore. PrismaPg is the official pg-based one and is what your
// seed scripts use, so we match that here.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ?? // reuse existing one if present (dev hot-reload)
  new PrismaClient({
    adapter,
    // `log` controls what Prisma prints. Useful while learning — you can SEE
    // the SQL it generates for each query. Remove "query" once it gets noisy.
    log: ["query", "warn", "error"],
  });

// In dev, save the instance globally so the next reload finds it.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

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

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

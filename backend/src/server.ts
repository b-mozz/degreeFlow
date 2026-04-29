/**
 * server.ts — the entry point that wires everything together and listens on a port.
 *
 * MENTAL MODEL
 * ------------
 * Express works like a pipeline. A request comes in, walks through a list of
 * "middleware" functions (parsers, loggers, auth, etc.), and eventually
 * matches a route handler that sends a response.
 *
 * This file does only three things:
 *   1. Create the Express app.
 *   2. Register global middleware (here: just JSON body parsing).
 *   3. Mount each resource router under its URL prefix.
 *   4. Start listening.
 *
 * Notice what's NOT here:
 *   - No SQL, no Prisma calls, no business logic.
 *   - No giant block of `app.get(...)` definitions — those live in routes/.
 * That's the whole point of the structure: this file stays ~30 lines forever.
 *
 * RUNNING IT
 * ----------
 * Once you've installed `express`:
 *   npx ts-node src/server.ts
 * Then in another terminal:
 *   curl "http://localhost:3000/courses/CSCI%2023500/professors/top?limit=5"
 *
 * Add this to package.json scripts to make it easier:
 *   "dev": "ts-node src/server.ts"
 */

import express from "express";
import { coursesRouter } from "./routes/courses";

const app = express();

// Middleware: parse JSON bodies on incoming requests so `req.body` is an
// object instead of a raw stream. We don't use POST yet, but this is cheap
// to add now and you'll need it the moment you write your first POST.
app.use(express.json());

// Mount the courses router. Every route defined inside coursesRouter is now
// reachable under the /courses prefix. Add more routers here as the API grows
// (e.g. app.use("/professors", professorsRouter)).
app.use("/courses", coursesRouter);

// A trivial health check. Useful for "is the server actually up?" checks
// without needing the database.
app.get("/health", (_req, res) => res.json({ ok: true }));

// `PORT` from the environment lets you change the port without editing code
// (e.g. `PORT=4000 npm run dev`). Default to 3000 for local dev.
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`degreeFlow API listening on http://localhost:${port}`);
});

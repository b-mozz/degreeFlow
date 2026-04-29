/**
 * routes/courses.ts — HTTP endpoints for the Course resource.
 *
 * WHAT BELONGS IN A ROUTE FILE
 * ----------------------------
 * Routes are translators between the outside world (HTTP) and your services.
 * The job of every handler in here is roughly four lines:
 *   1. Read inputs from the request (params, query string, body).
 *   2. Validate / sanitize them.
 *   3. Call a service function.
 *   4. Send a JSON response (or an error).
 *
 * Routes should NOT contain business logic. If you find yourself writing a
 * `for` loop or a math formula in here, that probably belongs in a service.
 *
 * WHY ONE FILE PER RESOURCE
 * -------------------------
 * Every endpoint that starts with `/courses/...` lives here. When the file
 * gets too big, you split by sub-resource (e.g. courses/professors.ts), not
 * by HTTP verb. Grouping by resource matches how you think about the API.
 *
 * THE `Router` PATTERN
 * --------------------
 * `express.Router()` is a mini-app you can attach routes to, then mount onto
 * the main app under a prefix. server.ts does `app.use("/courses", router)`,
 * so a handler defined here as `router.get("/:id/professors/top", ...)`
 * actually answers `GET /courses/:id/professors/top`.
 */

import { Router } from "express";
import { topProfessorsForCourse } from "../services/professorRanking";

export const coursesRouter = Router();

/**
 * id --> course code
 * limit ---> how many 'top' professors do i want
 * GET /courses/:id/professors/top?limit=5
 *
 * `:id` can be either the course UUID or its code (e.g. "CSCI 23500") — the
 * service handles both. `limit` is optional and defaults to 5.
 *
 * The `async` keyword lets us `await` the service call. Express 5 catches
 * thrown errors in async handlers and forwards them to error middleware;
 * if you're on Express 4, you'd wrap this in a try/catch or a helper.
 */
coursesRouter.get("/:id/professors/top", async (req, res) => {
  // `req.params.id` comes from the `:id` segment in the URL.
  // `req.query.limit` comes from `?limit=...` and is always a string|undefined.
  const { id } = req.params;
  const limit = parseLimit(req.query.limit);

  const result = await topProfessorsForCourse(id, limit);

  // Service returns null when the course doesn't exist. That's a 404, not a
  // server error — the request was well-formed, the resource just isn't there.
  if (!result) {
    return res.status(404).json({ error: "Course not found" });
  }

  return res.json(result);
});

/**
 * Tiny helper to keep the handler clean. Parses `?limit=...`, clamps it to a
 * sane range, falls back to 5. Validation like this belongs at the route
 * layer because it's about HTTP input, not domain rules.
 */
function parseLimit(raw: unknown): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(n, 50); // hard cap so a client can't ask for 10,000
}

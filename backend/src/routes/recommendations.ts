/**
 * routes/recommendations.ts — HTTP endpoint for course recommendations.
 *
 * One endpoint: POST /recommendations
 *
 * Body:
 *   {
 *     "completed":  ["CSCI 12700", "CSCI 13500", ...],   // required
 *     "inProgress": ["CSCI 26500"],                       // optional
 *     "major":      "CS",                                 // optional, default "CS"
 *     "limit":      10                                    // optional
 *   }
 *
 * It's a POST (not GET) because the input — a student's whole completed-course
 * list — is too big and too "body-shaped" to live in a query string. The
 * transcript parser will eventually produce `completed`; for now a hardcoded
 * demo array (see scripts/) fills it.
 *
 * Like courses.ts, this file only translates HTTP <-> service. All the graph
 * logic lives in services/courseRecommendation.ts.
 */

import { Router } from "express";
import { recommendCourses } from "../services/courseRecommendation";
import { DEGREES } from "../config/degreeRequirements";

export const recommendationsRouter = Router();

recommendationsRouter.post("/", async (req, res) => {
  const body = req.body ?? {};

  // --- Validate `completed`: must be an array of non-empty strings. ---
  if (!Array.isArray(body.completed) || body.completed.some((c: unknown) => typeof c !== "string")) {
    return res.status(400).json({ error: "`completed` must be an array of course-code strings" });
  }

  // --- `inProgress` / `planned` are optional but, if present, same shape. ---
  for (const field of ["inProgress", "planned"] as const) {
    if (
      body[field] !== undefined &&
      (!Array.isArray(body[field]) || body[field].some((c: unknown) => typeof c !== "string"))
    ) {
      return res.status(400).json({ error: `\`${field}\` must be an array of course-code strings` });
    }
  }

  // --- `major` is optional; reject unknown slugs with a clear 400. ---
  const major = body.major ?? "CS";
  if (!DEGREES[major]) {
    return res.status(400).json({
      error: `Unknown major "${major}". Known: ${Object.keys(DEGREES).join(", ")}`,
    });
  }

  const limit = parseLimit(body.limit);

  const result = await recommendCourses({
    completed: body.completed,
    inProgress: body.inProgress,
    planned: body.planned,
    major,
    limit,
  });

  return res.json(result);
});

/** Clamp `limit` to a sane range; fall back to the service default. */
function parseLimit(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, 50);
}

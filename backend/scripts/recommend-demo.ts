/**
 * recommend-demo.ts — run the recommender against demo-transcript.json.
 *
 * Reads the hand-parsed transcript, feeds its completed/in-progress/planned
 * course lists into recommendCourses(), and prints all three buckets.
 *
 * Run with:  npx ts-node scripts/recommend-demo.ts
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { recommendCourses } from "../src/services/courseRecommendation";
import { prisma } from "../src/db";

async function main() {
  const tx = JSON.parse(
    fs.readFileSync(path.join(__dirname, "demo-transcript.json"), "utf8")
  );
  const { completed, inProgress, planned } = tx.derived;

  const r = await recommendCourses({ completed, inProgress, planned });

  console.log(`\n=== ${r.major} — ${r.completedCount} courses completed ===\n`);

  console.log("MAJOR — required (core + math):");
  console.log("  eligible now:");
  r.required.eligible.forEach((c) =>
    console.log(`    ${c.code}  ${c.name}  (unlocks ${c.unlocks})`)
  );
  console.log("  blocked:");
  r.required.blocked.forEach((c) =>
    console.log(`    ${c.code}  ${c.name}  — missing: ${c.missing.join(" | ")}`)
  );

  const me = r.majorElectives;
  console.log(
    `\nMAJOR ELECTIVES — ${me.creditsCompleted}/${me.creditsRequired} cr, ${me.creditsRemaining} remaining:`
  );
  me.eligible.forEach((c) =>
    console.log(`    ${c.code}  ${c.name}  (unlocks ${c.unlocks})`)
  );

  console.log("\nGENERAL ELECTIVES (gen-ed buckets):");
  for (const b of r.generalElectives) {
    const mark = b.satisfied ? "DONE" : "NEEDED";
    console.log(
      `  [${mark}] ${b.name}  (${b.coursesAccountedFor}/${b.coursesNeeded})`
    );
    for (const s of b.suggestions) {
      const p = s.professor
        ? `${s.professor.name} (rating ${s.professor.avgRating ?? "—"}, score ${s.professor.score.toFixed(2)})`
        : "no rated professor";
      console.log(`      ${s.code}  ${s.name}  →  ${p}`);
    }
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

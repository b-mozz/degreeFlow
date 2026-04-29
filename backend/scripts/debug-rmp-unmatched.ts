/**
 * DIAGNOSTIC: print the most common RMP course codes that didn't match any
 * Hunter Course in our DB. Helps decide whether unmatched codes are:
 *   - Real Hunter courses we didn't scrape (fix the catalog scraper)
 *   - Code-format aliases (e.g. RMP "ENG 220" vs Hunter "ENGL 22000") — fix shortKey()
 *   - Garbage (free-text class names students typed) — ignore
 *
 * No DB writes. Just hits RMP, runs the same matching logic, prints a table.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { shortKey } from "./lib/course-key";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RMP_ENDPOINT = "https://www.ratemyprofessors.com/graphql";
const RMP_HEADERS = {
  "Content-Type": "application/json",
  "Authorization": "Basic dGVzdDp0ZXN0",
};
const SCHOOL_ID = Buffer.from("School-226").toString("base64");

async function gql<T = any>(query: string, variables: any): Promise<T> {
  const res = await fetch(RMP_ENDPOINT, {
    method: "POST",
    headers: RMP_HEADERS,
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function main() {
  console.log("Loading Hunter courses from DB...");
  const courses = await prisma.course.findMany({ select: { code: true } });
  const knownKeys = new Set<string>();
  for (const c of courses) {
    const k = shortKey(c.code);
    if (k) knownKeys.add(k);
  }
  console.log(`  ${knownKeys.size} courses known.\n`);

  console.log("Pulling all professors with courseCodes from RMP...");
  const counts = new Map<string, { count: number; sampleRaw: string }>();
  let cursor: string | null = null;
  let page = 0;

  while (true) {
    const data: any = await gql<any>(
      `query($q:TeacherSearchQuery!,$first:Int,$after:String){
         newSearch{teachers(query:$q,first:$first,after:$after){
           edges{node{courseCodes{courseName courseCount}}}
           pageInfo{hasNextPage endCursor}
         }}
       }`,
      { q: { text: "", schoolID: SCHOOL_ID }, first: 100, after: cursor }
    );
    const conn: any = data.newSearch.teachers;
    for (const e of conn.edges) {
      for (const cc of e.node.courseCodes ?? []) {
        const key = shortKey(cc.courseName);
        // skip empty (didn't look like a code) and skip matched
        if (!key || knownKeys.has(key)) continue;

        // Skip graduate courses (anything >= 500) to reduce noise,
        // since our catalog scraper only pulls Undergraduate courses.
        const numMatch = key.match(/-(\d+)/);
        if (numMatch && parseInt(numMatch[1], 10) >= 500) continue;

        const prev = counts.get(key);
        counts.set(key, {
          count: (prev?.count ?? 0) + cc.courseCount,
          sampleRaw: prev?.sampleRaw ?? cc.courseName,
        });
      }
    }
    page++;
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
    await new Promise((r) => setTimeout(r, 200));
  }

  // Sort unmatched codes by total rating count, descending.
  const sorted = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(`\nTop 60 unmatched codes (by total rating count):\n`);
  console.log("count   key          example raw input from RMP");
  console.log("-----   ----------   --------------------------");
  for (const [key, info] of sorted.slice(0, 60)) {
    console.log(
      `${String(info.count).padStart(5)}   ${key.padEnd(11)}  ${info.sampleRaw}`
    );
  }
  console.log(`\n(${sorted.length} unique unmatched keys total)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

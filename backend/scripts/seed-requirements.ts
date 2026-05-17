/**
 * seed-requirements.ts — load degree requirements into the DB.
 *
 * Reads `docs/requirement-course-lists.md` (the hand-collected source of
 * truth) and populates the `Requirement` and `RequirementCourse` tables.
 *
 * The markdown has two course-list formats, both handled here:
 *   - Hunter Core sections: Markdown tables (`| Subject | Number | Code | … |`)
 *   - Pluralism & Diversity sections: inline `` `CODE` `` backtick lists
 *
 * Each `## ` heading is matched against the REQUIREMENTS table below; course
 * codes found under a recognized heading are linked to that requirement.
 * Unrecognized headings (intro, "Requirement Structure") are skipped — and
 * any heading line clears the "current requirement" so stray backtick codes
 * in prose (e.g. the dirty-data notes) are never miscounted.
 *
 * Idempotent: re-running upserts requirements and rebuilds their course links.
 *
 * Run with:  npm run seed:requirements
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * The 12 requirement buckets, each tied to its exact `## ` heading in the
 * markdown. `coursesNeeded` drives the recommender's "is this bucket done?"
 * check. NOTE: "Individual and Society" is one bucket of 2 here because the
 * markdown keeps its two sub-areas in a single combined course list.
 */
interface ReqDef {
  slug: string;
  name: string;
  category: "Required Core" | "Flexible Core" | "Pluralism & Diversity";
  coursesNeeded: number;
  creditsRequired: number;
  heading: string;
  description?: string;
}

const REQUIREMENTS: ReqDef[] = [
  { slug: "rc-english-composition", name: "English Composition", category: "Required Core", coursesNeeded: 2, creditsRequired: 6, heading: "CUNY Pathways — Required Core: English Composition" },
  { slug: "rc-math-quant-reasoning", name: "Mathematical and Quantitative Reasoning", category: "Required Core", coursesNeeded: 1, creditsRequired: 3, heading: "CUNY Pathways — Required Core: Mathematical and Quantitative Reasoning" },
  { slug: "rc-life-physical-sciences", name: "Life and Physical Sciences", category: "Required Core", coursesNeeded: 1, creditsRequired: 3, heading: "CUNY Pathways — Required Core: Life and Physical Sciences" },
  { slug: "fc-world-cultures", name: "World Cultures and Global Issues", category: "Flexible Core", coursesNeeded: 1, creditsRequired: 3, heading: "CUNY Pathways — Flexible Core: World Cultures and Global Issues" },
  { slug: "fc-us-experience", name: "US Experience in its Diversity", category: "Flexible Core", coursesNeeded: 1, creditsRequired: 3, heading: "CUNY Pathways — Flexible Core: US Experience in its Diversity" },
  { slug: "fc-creative-expression", name: "Creative Expression", category: "Flexible Core", coursesNeeded: 1, creditsRequired: 3, heading: "CUNY Pathways — Flexible Core: Creative Expression" },
  { slug: "fc-scientific-world", name: "Scientific World", category: "Flexible Core", coursesNeeded: 1, creditsRequired: 3, heading: "CUNY Pathways — Flexible Core: Scientific World" },
  { slug: "fc-individual-and-society", name: "Individual and Society", category: "Flexible Core", coursesNeeded: 2, creditsRequired: 6, heading: "CUNY Pathways — Flexible Core: Individual and Society", description: "Two sub-areas (Social Science; Humanities, Cultures & Ideas), one course each — combined course list." },
  { slug: "pd-cat1-migration", name: "P&D Category 1: Migration, Diaspora & Globalization", category: "Pluralism & Diversity", coursesNeeded: 1, creditsRequired: 3, heading: "Pluralism & Diversity — Category 1: Migration, Diaspora & Globalization" },
  { slug: "pd-cat2-residency", name: "P&D Category 2: Residency, Citizenship & Human Rights", category: "Pluralism & Diversity", coursesNeeded: 1, creditsRequired: 3, heading: "Pluralism & Diversity — Category 2: Residency, Citizenship & Human Rights" },
  { slug: "pd-cat3-intersectionality", name: "P&D Category 3: Intersectionality & Social Justice", category: "Pluralism & Diversity", coursesNeeded: 1, creditsRequired: 3, heading: "Pluralism & Diversity — Category 3: Intersectionality & Social Justice" },
  { slug: "pd-cat4-knowledge", name: "P&D Category 4: Knowledge Construction, Environments & Technologies", category: "Pluralism & Diversity", coursesNeeded: 1, creditsRequired: 3, heading: "Pluralism & Diversity — Category 4: Knowledge Construction, Environments & Technologies" },
];

/** Looks like a course code: 2-8 letters, space(s), then digits. */
const CODE_RE = /^[A-Z]{2,8}\s+\d{3,5}/;

/**
 * Parse the markdown into a map of heading -> unique course codes.
 * Resets the active section on EVERY heading line so prose between sections
 * (which contains backtick-quoted codes in the dirty-data notes) is ignored.
 */
function parseMarkdown(md: string): Map<string, string[]> {
  const byHeading = new Map<string, Set<string>>();
  const headingToSlug = new Map(REQUIREMENTS.map((r) => [r.heading, r.slug]));

  let current: string | null = null; // slug of the active requirement

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();

    // Any heading line ends the current section.
    if (/^#{1,6}\s/.test(line)) {
      current = null;
      const h2 = line.match(/^##\s+(.*)$/);
      if (h2) {
        const slug = headingToSlug.get(h2[1].trim());
        if (slug) {
          current = slug;
          if (!byHeading.has(slug)) byHeading.set(slug, new Set());
        }
      }
      continue;
    }
    if (!current) continue;

    const bucket = byHeading.get(current)!;

    // Format A — Markdown table row: take the 3rd cell ("Code" column).
    if (line.startsWith("|")) {
      const cells = line.split("|").map((c) => c.trim());
      const code = cells[3];
      if (code && CODE_RE.test(code)) bucket.add(code);
    }

    // Format B — inline `` `CODE` `` tokens (Pluralism & Diversity lists).
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const tok = m[1].trim();
      if (CODE_RE.test(tok)) bucket.add(tok);
    }
  }

  return new Map([...byHeading].map(([slug, set]) => [slug, [...set]]));
}

async function main() {
  const mdPath = path.join(__dirname, "..", "docs", "requirement-course-lists.md");
  const md = fs.readFileSync(mdPath, "utf8");
  const codesBySlug = parseMarkdown(md);

  // Resolve raw codes against the catalog once.
  const catalog = await prisma.course.findMany({ select: { id: true, code: true } });
  const codeToId = new Map(catalog.map((c) => [c.code, c.id]));

  let totalLinks = 0;
  let unmatched = 0;

  for (const def of REQUIREMENTS) {
    const codes = codesBySlug.get(def.slug) ?? [];

    // Upsert the requirement bucket.
    const req = await prisma.requirement.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        name: def.name,
        category: def.category,
        coursesNeeded: def.coursesNeeded,
        creditsRequired: def.creditsRequired,
        description: def.description ?? null,
      },
      update: {
        name: def.name,
        category: def.category,
        coursesNeeded: def.coursesNeeded,
        creditsRequired: def.creditsRequired,
        description: def.description ?? null,
      },
    });

    // Rebuild this requirement's course links from scratch (idempotent).
    await prisma.requirementCourse.deleteMany({ where: { requirementId: req.id } });

    const rows = codes.map((code) => {
      const courseId = codeToId.get(code) ?? null;
      if (!courseId) unmatched++;
      return { requirementId: req.id, courseCode: code, courseId };
    });
    if (rows.length > 0) {
      await prisma.requirementCourse.createMany({ data: rows, skipDuplicates: true });
    }
    totalLinks += rows.length;

    const matched = rows.length - rows.filter((r) => !r.courseId).length;
    console.log(
      `  ${def.slug.padEnd(26)} ${String(rows.length).padStart(3)} courses ` +
        `(${matched} matched to catalog, ${rows.length - matched} unmatched)`
    );
  }

  console.log(
    `\nSeeded ${REQUIREMENTS.length} requirements, ${totalLinks} course links ` +
      `(${unmatched} codes not found in the Course table).`
  );
}

main()
  .catch((e) => {
    console.error("seed-requirements failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

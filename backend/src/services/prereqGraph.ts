/**
 * services/prereqGraph.ts — load the prerequisite graph into memory.
 *
 * WHAT THIS IS
 * ------------
 * The `Prerequisite` table is a flat list of `(course, prereqCode)` edges.
 * Every question the recommender asks ("what can I take next?", "what unlocks
 * the most?") is really a graph query. Running a fresh SQL query per course
 * would be wasteful — the whole graph fits comfortably in memory (a few
 * thousand edges), so we load it once and hand back plain Maps.
 *
 * IMPORTANT — KNOWN DATA LIMITATION
 * ---------------------------------
 * Per PREREQ_STRATEGY.md, the AND/OR structure of prerequisites was lost
 * during scraping. This graph stores ALL listed prereqs as a flat set with no
 * "these two are alternatives" information. The recommender therefore runs in
 * STRICT mode (treats every edge as required). That over-restricts some
 * courses but is honest about the data; see RECOMMENDER_PLAN §1.
 */

import { prisma } from "../db";

/** course code -> set of course codes that must come before it. */
export type PrereqGraph = Map<string, Set<string>>;

/** course code -> set of course codes it is a prerequisite FOR (reverse edges). */
export type UnlocksGraph = Map<string, Set<string>>;

export interface PrereqGraphs {
  /** forward: course -> its prerequisites */
  prereqs: PrereqGraph;
  /** reverse: course -> courses it unlocks */
  unlocks: UnlocksGraph;
}

/**
 * Read every prerequisite edge once and build both the forward and reverse
 * adjacency maps. Reverse edges are what let us rank a course by "how many
 * downstream courses does taking this open up".
 */
export async function buildPrereqGraphs(): Promise<PrereqGraphs> {
  // One query. We only need the owning course's code and the raw prereq code
  // string — `prereqCode` is always populated even when the prereq course
  // isn't itself in our catalog.
  const edges = await prisma.prerequisite.findMany({
    select: {
      prereqCode: true,
      course: { select: { code: true } },
    },
  });

  const prereqs: PrereqGraph = new Map();
  const unlocks: UnlocksGraph = new Map();

  const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(value);
  };

  for (const edge of edges) {
    const course = edge.course.code; // e.g. "CSCI 33500"
    const prereq = edge.prereqCode; // e.g. "CSCI 23500"
    add(prereqs, course, prereq);
    add(unlocks, prereq, course);
  }

  return { prereqs, unlocks };
}

/**
 * Count how many courses a given course ultimately unlocks (transitively).
 * Used to rank eligible courses: clearing a deep prerequisite early is more
 * valuable than clearing a leaf. Plain BFS over the reverse graph.
 */
export function countDownstream(code: string, unlocks: UnlocksGraph): number {
  const seen = new Set<string>();
  const queue = [...(unlocks.get(code) ?? [])];

  while (queue.length > 0) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    for (const further of unlocks.get(next) ?? []) {
      if (!seen.has(further)) queue.push(further);
    }
  }

  return seen.size;
}

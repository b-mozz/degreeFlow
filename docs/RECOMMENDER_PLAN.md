# Course Recommender — Plan

Working notes for the next feature: given a student's completed courses, recommend major courses, major electives, and general electives they should take next.

---

## 1. The constraint our data imposes

From `PREREQ_STRATEGY.md` §5: **AND/OR structure was thrown away** during scraping. The `Prerequisite` table is just flat `(courseId, prereqCode)` pairs.

Example — CSCI 33500's real prereqs:

> `(CSCI 24500 or CSCI 26000) AND CSCI 23500 AND (STAT 11300 or STAT 21300) AND MATH 155`

Our DB has 6 flat edges. No idea which are alternatives.

### Choice we have to make

| Option | Behavior | Tradeoff |
|---|---|---|
| **Strict (AND everything)** | Require ALL listed prereqs satisfied | Honest about data limits; over-restrictive (a student with CSCI 24500 but not 26000 looks blocked from 33500) |
| **Lenient (≥X% satisfied)** | Course eligible if some fraction of prereqs met | Wrong in the other direction; arbitrary threshold |
| **Fix the data first** | Parse `descriptionLong` into a `PrerequisiteGroup` AND/OR tree | Real fix, ~1-2 days of work, blocks recommender progress |

**MVP decision: Strict.** It's transparent about a known limitation and keeps the algorithm simple. Upgrade later.

---

## 2. This is graph theory

The prereq graph is a **DAG** (directed acyclic): edges go `prereq → course`.

| Algorithm | What it gives you | When |
|---|---|---|
| Kahn's topological sort | Order to take courses | "give me a full plan" |
| Source nodes of a sub-DAG | Courses with all prereqs met | "what can I take RIGHT NOW" ← **this is the recommender** |
| Longest path in DAG | Min semesters to graduate | "how long until I'm done" |
| Reverse BFS from goal | Which courses are *blocking* a target | "why can't I take CSCI 49999" |

The recommender is mostly **source-node detection** on a residual graph (the graph minus completed courses).

---

## 3. The core algorithm

```
Inputs:
  completed: Set<courseCode>           // from transcript
  required:  Set<courseCode>           // CS major core
  graph:     Map<courseCode, Set<prereqCode>>

For each course c in (required - completed):
  prereqs = graph.get(c) ?? ∅
  if prereqs ⊆ completed:
    c is ELIGIBLE NOW
  else:
    missing = prereqs - completed
    c is BLOCKED, blocked-by missing
```

O(n × avg_prereqs). For ~50 major courses, instant — no DP needed.

### Secondary signals worth adding once it works

- **Rank eligible courses** by "how many downstream courses they unlock" (reverse-graph BFS) — greedy unblocking.
- **Surface blocked-but-close courses** ("you're 1 prereq away from CSCI 33500 — take CSCI 23500 next").
- **For electives**, intersect "eligible" with "in elective bucket" and rank by professor score (existing service).

---

## 4. Build order (bottom-up, like the prof ranker)

Each step independently testable from a script. No HTTP until step 5.

1. **Define major requirements somewhere.**
   Hardcode in a TS file: `CS_REQUIRED = ["CSCI 12700", "CSCI 13500", ...]`.
   Don't over-engineer until the algorithm works. Promote to a DB table later.

2. **Service: `buildPrereqGraph()`**
   Query the `Prerequisite` table once, return `Map<courseCode, Set<courseCode>>`.
   Pure DB → in-memory adjacency. Test from a script.

3. **Service: `recommendNextCourses({ completed, required, electives })`**
   Implements §3 above. Returns:
   ```ts
   {
     eligible: string[],
     blocked:  { course: string, missing: string[] }[],
     completed: string[],
   }
   ```
   No HTTP, no transcript parsing. Just graph logic. Test from a script with a hardcoded array.

4. **Transcript demo input.**
   Hardcode parsed transcript as JSON in `scripts/` (`completed: ["CSCI 12700", ...]`).
   Don't build the AI parser yet — separate phase. Step 3 only cares about `Set<string>`.

5. **Route: `POST /recommendations`**
   Body: `{ completed: string[], major: "CS" }`. Calls the service. Returns the buckets.
   API surface now exists; frontend / transcript parser fills the body later.

---

## 5. Open questions

- **Strict mode now, AND/OR fix later?** (Current default: yes.)
- **Where should `CS_REQUIRED` live?**
  - Hardcoded TS file — fast, fine for MVP.
  - JSON file — slightly more separable.
  - `MajorRequirement` table — proper, slower.
- **Single-semester picks (3-5 courses) or full multi-semester plan?**
  Single is just step 3. Multi-semester needs Kahn's + load-balancing heuristics — much bigger.

---

## 6. What this plan does NOT cover yet

- Transcript parsing (AI/OCR pipeline) — separate phase.
- Major elective bucket structure (which courses count as "elective for CS major") — needs catalog scraping or manual entry.
- General education / Hunter Core requirements — completely separate model.
- Co-requisites, "permission of department," class standing — out of scope until prereq AND/OR is fixed.
- Schedule/time conflicts, professor availability per semester — depends on a `Section` table we don't have.

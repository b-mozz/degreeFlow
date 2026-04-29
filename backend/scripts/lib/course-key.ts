/**
 * Shared helper for normalizing course codes between Hunter's catalog format
 * ("CSCI 23500") and the shorthand RMP students type ("CSCI 235", "ENG220",
 * "ENGLISH 120", etc.).
 *
 * The output is a stable lookup key like "CSCI-235" — same key for both
 * "CSCI 23500" and "CSCI 235", so a single Map<key, courseId> works for
 * both sides.
 */

/**
 * Subject-code aliases. RMP students use shorthand or spelled-out names;
 * Hunter's catalog uses its own canonical abbreviation. Map the RMP form
 * to Hunter's. Verified against the actual subject codes in our DB.
 */
const SUBJECT_ALIASES: Record<string, string> = {
  ENG: "ENGL",
  ENGLISH: "ENGL",
  BIO: "BIOL",
  BIOLOGY: "BIOL",
  PSY: "PSYCH",
  PSYCHOLOGY: "PSYCH",
  PSCYH: "PSYCH",
  PYSCH: "PSYCH",
  PSYC: "PSYCH",
  HIS: "HIST",
  HISTORY: "HIST",
  MAT: "MATH",
  MATHEMATICS: "MATH",
  CALC: "MATH",
  PHY: "PHYS",
  PHYSICS: "PHYS",
  CHE: "CHEM",
  CHEMISTRY: "CHEM",
  GEO: "GEOG",
  GEOGRAPHY: "GEOG",
  GEOLOGY: "GEOL",
  CS: "CSCI",
  STATS: "STAT",
  POL: "POLSC",
  POLSCI: "POLSC",
  POLS: "POLSC",
  PHIL: "PHILO",
  PHILOSOPHY: "PHILO",
  ECON: "ECO",
  CLASSICS: "CLA",
  SOCIOLOGY: "SOC",
  ANTH: "ANTHC",
  ANTHR: "ANTHC",
  ANTHRO: "ANTHC",
  ANT: "ANTHC",
  MUSIC: "MUS",
  MUSH: "MUSHL",
  WOMST: "WGSS",
  WGS: "WGSS",
  URB: "URBS",
  MED: "MEDIA",
  GERM: "GERMN",
  FRENCH: "FREN",
  SPANISH: "SPAN",
  SPA: "SPAN",
  ITALIAN: "ITAL",
  AFRICAN: "AFPRL",
  PGEO: "PGEOG",
  ACCOUNTING: "ACC",
  CH: "COMHE",
};

/**
 * Common course-level aliases. Sometimes students use a "standard" number
 * (like 101 for Intro) but Hunter uses a specific one (like 100).
 * Maps "SUBJECT-NUM" (shortKey output) to the canonical "SUBJECT-NUM".
 */
const COURSE_ALIASES: Record<string, string> = {
  "PSYCH-101": "PSYCH-100", // Standard Intro vs Hunter Intro
  "SOC-100": "SOC-101",    // Hunter Intro is 101
  "ENGL-101": "ENGL-120",  // Hunter's first year comp is 120
};

/**
 * Reduce any course-code string to a stable key.
 * Returns "" when the input doesn't look like a code.
 */
export function shortKey(code: string): string {
  const m = code.toUpperCase().match(/^\s*([A-Z]{2,15})\s*(\d{3,5})/);
  if (!m) return "";
  const subject = SUBJECT_ALIASES[m[1]] ?? m[1];
  const key = `${subject}-${m[2].slice(0, 3)}`;
  return COURSE_ALIASES[key] ?? key;
}

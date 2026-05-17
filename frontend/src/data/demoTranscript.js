/**
 * demoTranscript.js — a bundled sample transcript.
 *
 * Fallback so the app works before the transcript parser (a separate task)
 * exists. Once that parser writes a real transcript to localStorage, it takes
 * priority — see lib/transcript.js.
 *
 * Sample Hunter transcript with a fictional student identity. `status` is
 * one of completed | in-progress | planned.
 */

export const DEMO_TRANSCRIPT = {
  student: { name: 'Jordan Rivera', cumGpa: 3.931 },
  courses: [
    // 2024 Spring
    { code: 'CLA 10100',  title: 'Classical Mythology',           credits: 3, grade: 'A',  status: 'completed', term: '2024 Spring' },
    { code: 'CSCI 12700', title: 'Introduction: Computer Science', credits: 3, grade: 'A',  status: 'completed', term: '2024 Spring' },
    { code: 'ENGL 12000', title: 'Expository Writing',             credits: 3, grade: 'A',  status: 'completed', term: '2024 Spring' },
    { code: 'MATH 15000', title: 'Calculus I',                     credits: 4, grade: 'A+', status: 'completed', term: '2024 Spring' },
    { code: 'MEDIA 18000',title: 'Introduction to Media Studies',  credits: 3, grade: 'A',  status: 'completed', term: '2024 Spring' },
    // 2024 Fall
    { code: 'CSCI 13500', title: 'Software Analysis and Design 1', credits: 4, grade: 'A+', status: 'completed', term: '2024 Fall' },
    { code: 'CSCI 15000', title: 'Discrete Structures',            credits: 4, grade: 'A',  status: 'completed', term: '2024 Fall' },
    { code: 'ENGL 22000', title: 'Intro: Writing about Literature',credits: 3, grade: 'A+', status: 'completed', term: '2024 Fall' },
    { code: 'MATH 15500', title: 'Calculus 2',                     credits: 4, grade: 'A+', status: 'completed', term: '2024 Fall' },
    // 2025 Spring
    { code: 'CSCI 16000', title: 'Computer Architecture 1',        credits: 3, grade: 'A',  status: 'completed', term: '2025 Spring' },
    { code: 'CSCI 23500', title: 'Software Analysis and Design 2', credits: 3, grade: 'B',  status: 'completed', term: '2025 Spring' },
    { code: 'MATH 15600', title: 'Intr Math Proof Wrks',           credits: 1, grade: 'A+', status: 'completed', term: '2025 Spring' },
    { code: 'MATH 16000', title: 'Matrix Algebra',                 credits: 3, grade: 'A+', status: 'completed', term: '2025 Spring' },
    { code: 'SOC 10100',  title: 'Introduction to Sociology',      credits: 3, grade: 'A+', status: 'completed', term: '2025 Spring' },
    // 2025 Fall — in progress
    { code: 'CSCI 26000', title: 'Computer Architecture 2',        credits: 3, grade: null, status: 'in-progress', term: '2025 Fall' },
    { code: 'CSCI 33500', title: 'Software Analysis and Design 3', credits: 3, grade: null, status: 'in-progress', term: '2025 Fall' },
    { code: 'FILM 10100', title: 'Introduction to Cinema',         credits: 3, grade: null, status: 'in-progress', term: '2025 Fall' },
    { code: 'HONS 2012M', title: 'Human Value',                    credits: 3, grade: null, status: 'in-progress', term: '2025 Fall' },
    { code: 'STAT 21300', title: 'Introduction to Applied Stat',   credits: 3, grade: null, status: 'in-progress', term: '2025 Fall' },
    // 2026 Spring — planned
    { code: 'CHEM 10100', title: 'Inquiries - Nature of Matter',   credits: 3, grade: null, status: 'planned', term: '2026 Spring' },
    { code: 'CSCI 26500', title: 'Computer Theory 1',              credits: 3, grade: null, status: 'planned', term: '2026 Spring' },
    { code: 'CSCI 39548', title: 'Practical Web Development',      credits: 3, grade: null, status: 'planned', term: '2026 Spring' },
    { code: 'HONS 3011W', title: 'Lit & Question of Human Rights', credits: 3, grade: null, status: 'planned', term: '2026 Spring' },
    { code: 'MUSHL 10700',title: 'The World of Music',             credits: 3, grade: null, status: 'planned', term: '2026 Spring' },
  ],
}

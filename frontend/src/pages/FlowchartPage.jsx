import Navbar from '../components/Navbar'
import CourseCard from '../components/CourseCard'

const STATS = {
  creditsEarned: 33,
  creditsTotal: 54,
  coursesCompleted: 9,
  coursesTotal: 16,
  gpa: 3.93,
  completionPct: 61,
}

const SECTIONS = [
  {
    id: 'core-cs',
    label: 'Core CS Requirements',
    indicator: 'bg-gray-900',
    courses: [
      { code: 'CSCI 127', title: 'Intro to CS',                   credits: 4, semester: 'Fall 2023', grade: 'A',  status: 'completed' },
      { code: 'CSCI 135', title: 'Software Analysis & Design I',  credits: 3, semester: 'Fall 2024', grade: 'B',  status: 'completed' },
      { code: 'CSCI 150', title: 'Discrete Structures',           credits: 4, semester: 'Fall 2024', grade: 'C+', status: 'completed' },
      { code: 'CSCI 235', title: 'Software Analysis & Design II', credits: 3, semester: 'Spr 2025', grade: 'B',  status: 'completed' },
      { code: 'CSCI 335', title: 'Software Analysis & Design III',credits: 3, semester: 'Fall 2025', grade: 'A+', status: 'completed' },
      { code: 'CSCI 340', title: 'Operating Systems',             credits: 3, semester: 'Sum 2025', grade: 'B-', status: 'completed' },
    ],
  },
  {
    id: 'in-progress',
    label: 'In Progress',
    indicator: 'bg-blue-600',
    courses: [
      { code: 'CSCI 265', title: 'Computer Theory 1', credits: 3, semester: 'Spr 2026', grade: null, status: 'in-progress' },
      { code: 'CSCI 400', title: 'Senior Project',    credits: 3, semester: 'Spr 2026', grade: null, status: 'in-progress' },
    ],
  },
  {
    id: 'remaining-cs',
    label: 'Remaining CS Courses',
    indicator: 'bg-orange-400',
    courses: [
      { code: 'CSCI 320', title: 'Theory of Computation', credits: 3, semester: null, grade: null, status: 'needed' },
      { code: 'CSCI 405', title: 'Computer Security',     credits: 3, semester: null, grade: null, status: 'needed' },
      { code: 'CSCI 49X', title: 'CS Elective',           credits: 3, semester: null, grade: null, status: 'needed' },
      { code: 'CSCI 49X', title: 'CS Elective',           credits: 3, semester: null, grade: null, status: 'needed' },
    ],
  },
  {
    id: 'math',
    label: 'Math & Statistics',
    indicator: 'bg-green-500',
    courses: [
      { code: 'MATH 150', title: 'Calculus I',        credits: 4, semester: 'Fall 2024', grade: 'A+', status: 'completed' },
      { code: 'MATH 160', title: 'Matrix Algebra',    credits: 3, semester: 'Fall 2024', grade: 'A',  status: 'completed' },
      { code: 'MATH 155', title: 'Calculus II',       credits: 4, semester: 'Spr 2025', grade: 'C',  status: 'completed' },
      { code: 'STAT 213', title: 'Intro to Statistics',credits: 3, semester: null,       grade: null, status: 'needed' },
    ],
  },
]

function TrendIcon() {
  return (
    <svg className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  )
}

function ArrowDown() {
  return (
    <div className="flex justify-center my-3 text-gray-300">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  )
}

export default function FlowchartPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-3xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Degree Flowchart</h1>
        <p className="text-sm text-gray-500 mb-6">B.A. Computer Science — Hunter College</p>

        {/* Stats bar */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Degree Progress</span>
            <div className="flex items-center gap-5">
              <span className="text-sm font-semibold text-gray-800">
                {STATS.creditsEarned}/{STATS.creditsTotal} cr
              </span>
              <span className="text-sm font-semibold text-purple-600">
                {STATS.coursesCompleted}/{STATS.coursesTotal} Courses
              </span>
              <span className="text-sm font-semibold text-green-600">
                {STATS.gpa} GPA
              </span>
            </div>
            <span className="text-sm font-bold text-gray-800">
              {STATS.completionPct}%{' '}
              <span className="font-normal text-gray-500">completed</span>
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-600 rounded-full transition-all"
              style={{ width: `${STATS.completionPct}%` }}
            />
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6 flex items-start gap-3">
          <TrendIcon />
          <div>
            <p className="text-sm font-semibold text-gray-800">Select a Course</p>
            <p className="text-sm text-gray-500">
              Click on any course to see details, difficulty ratings, and prerequisites.
            </p>
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map((section, idx) => (
          <div key={section.id}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-3 h-3 rounded-sm ${section.indicator}`} />
              <h2 className="text-sm font-semibold text-gray-800">{section.label}</h2>
              <span className="text-sm text-gray-400">{section.courses.length}</span>
            </div>

            {/* Course grid */}
            <div className="grid grid-cols-3 gap-3">
              {section.courses.map((course, i) => (
                <CourseCard key={i} course={course} />
              ))}
            </div>

            {idx < SECTIONS.length - 1 && <ArrowDown />}
          </div>
        ))}
      </div>
    </div>
  )
}

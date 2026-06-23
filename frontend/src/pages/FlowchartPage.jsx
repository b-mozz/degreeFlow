import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import CourseCard from '../components/CourseCard'
import { loadTranscript } from '../lib/transcript'
import { getRecommendations } from '../lib/api'
import NoTranscript from '../components/NoTranscript'

/** Per-status section heading style. */
const SECTION_META = {
  completed:     { label: 'Completed',         dot: 'bg-green-500' },
  'in-progress': { label: 'In Progress',       dot: 'bg-amber-400' },
  planned:       { label: 'Planned',           dot: 'bg-blue-400' },
  needed:        { label: 'Remaining — Major', dot: 'bg-red-400' },
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

function Stat({ value, label }) {
  return (
    <div className="border border-gray-200 bg-white rounded-lg px-4 py-3 shadow-sm">
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

/** Header link back to the upload page, so users can swap transcripts without hunting for it. */
function UploadNewTranscriptLink() {
  return (
    <Link
      to="/upload"
      className="flex-shrink-0 inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-purple-700 hover:text-purple-800 hover:underline mt-1"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
      <span className="hidden sm:inline">Upload new transcript</span>
      <span className="sm:hidden">New transcript</span>
    </Link>
  )
}

/** Placeholder card matching CourseCard's dimensions, used while /recommendations is in flight. */
function SkeletonCourseCard() {
  return (
    <div className="border border-gray-200 bg-white rounded-lg p-3 animate-pulse">
      <div className="flex justify-between items-start mb-2">
        <div className="h-3 w-14 bg-gray-200 rounded" />
        <div className="h-4 w-4 bg-gray-200 rounded-full" />
      </div>
      <div className="h-3.5 w-5/6 bg-gray-200 rounded mb-1.5" />
      <div className="h-3.5 w-2/3 bg-gray-200 rounded mb-3" />
      <div className="flex justify-between items-center">
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-3 w-10 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

export default function FlowchartPage() {
  const [transcript] = useState(loadTranscript)
  const [rec, setRec] = useState(null)
  const [recError, setRecError] = useState(null)

  const hasTranscript = transcript.source !== 'empty' && transcript.courses.length > 0

  // The transcript is local, so the completed/in-progress/planned sections
  // render immediately. Only the "Remaining — Major" section needs the API.
  useEffect(() => {
    if (!hasTranscript) return
    let cancelled = false
    getRecommendations({
      completed: transcript.completed,
      inProgress: transcript.inProgress,
      planned: transcript.planned,
    })
      .then((r) => { if (!cancelled) setRec(r) })
      .catch((e) => { if (!cancelled) setRecError(e.message) })
    return () => { cancelled = true }
  }, [transcript, hasTranscript])

  if (!hasTranscript) return <NoTranscript />

  // Transcript courses, bucketed by status into CourseCard-shaped objects.
  const byStatus = { completed: [], 'in-progress': [], planned: [] }
  for (const c of transcript.courses) {
    if (!byStatus[c.status]) continue
    byStatus[c.status].push({
      code: c.code, title: c.title, credits: c.credits,
      grade: c.grade, semester: c.term, status: c.status,
    })
  }

  // Remaining major courses come from the recommender (eligible + blocked).
  const remaining = rec
    ? [...rec.required.eligible, ...rec.required.blocked].map((c) => ({
        code: c.code, title: c.name, credits: c.credits,
        grade: null, semester: null, status: 'needed',
      }))
    : []

  const sections = [
    { key: 'completed', courses: byStatus.completed },
    { key: 'in-progress', courses: byStatus['in-progress'] },
    { key: 'planned', courses: byStatus.planned },
    { key: 'needed', courses: remaining },
  ].filter((s) => s.courses.length > 0)

  // Stats — all derivable from the local transcript.
  const creditsEarned = byStatus.completed.reduce((s, c) => s + (c.credits || 0), 0)
  const gpa = transcript.student?.cumGpa
  const totalKnown =
    byStatus.completed.length + byStatus['in-progress'].length +
    byStatus.planned.length + remaining.length
  const completionPct = totalKnown > 0
    ? Math.round((byStatus.completed.length / totalKnown) * 100)
    : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 py-10">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Degree Flowchart</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {rec ? rec.major : 'B.A. Computer Science'}
              {transcript.source === 'demo' && (
                <span className="ml-2 text-xs text-gray-400">· demo transcript</span>
              )}
            </p>
          </div>
          <UploadNewTranscriptLink />
        </header>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <Stat value={gpa != null ? gpa.toFixed(2) : '—'} label="cumulative GPA" />
          <Stat value={creditsEarned} label="credits earned" />
          <Stat value={byStatus.completed.length} label="courses completed" />
          <Stat value={byStatus['in-progress'].length} label="in progress" />
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Courses completed</span>
            <span>{completionPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-600 rounded-full" style={{ width: `${completionPct}%` }} />
          </div>
        </div>

        {recError && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-3 mb-6">
            <p className="text-xs text-red-600">
              Couldn’t load remaining courses ({recError}). Is the backend running on <code>:3000</code>?
            </p>
          </div>
        )}

        {/* Sections */}
        {sections.map((section, idx) => {
          const meta = SECTION_META[section.key]
          const isLast = idx === sections.length - 1
          const showArrowAfter = !isLast || (!rec && !recError)
          return (
            <div key={section.key}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-3 h-3 rounded-sm ${meta.dot}`} />
                <h2 className="text-sm font-semibold text-gray-800">{meta.label}</h2>
                <span className="text-sm text-gray-400">{section.courses.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {section.courses.map((course) => (
                  <CourseCard key={`${section.key}-${course.code}`} course={course} />
                ))}
              </div>
              {showArrowAfter && <ArrowDown />}
            </div>
          )
        })}

        {/* Loading skeleton for the Remaining — Major section while /recommendations is fetching. */}
        {!rec && !recError && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-3 h-3 rounded-sm ${SECTION_META.needed.dot}`} />
              <h2 className="text-sm font-semibold text-gray-800">{SECTION_META.needed.label}</h2>
              <div className="h-3 w-6 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-busy="true" aria-label="Loading remaining courses">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCourseCard key={i} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import Collapsible from '../components/Collapsible'
import { loadTranscript } from '../lib/transcript'
import { getRecommendations, getTopProfessors } from '../lib/api'

/* ------------------------------------------------------------------ *
 * Small presentational pieces
 * ------------------------------------------------------------------ */

const CHIP_TONES = {
  gray: 'bg-gray-100 text-gray-600',
  green: 'bg-emerald-50 text-emerald-700',
  purple: 'bg-purple-50 text-purple-700',
  amber: 'bg-amber-50 text-amber-700',
}

function Chip({ children, tone = 'gray' }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${CHIP_TONES[tone]}`}>
      {children}
    </span>
  )
}

/** One course card: code + credits, title, optional sub-line and right slot. */
function CourseRow({ code, name, credits, sub, right }) {
  return (
    <div className="flex items-start justify-between gap-4 bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-gray-900">{code}</span>
          {credits != null && <span className="text-xs text-gray-400">{credits} cr</span>}
        </div>
        <p className="text-sm text-gray-600 leading-snug">{name}</p>
        {sub}
      </div>
      {right && <div className="flex-shrink-0 pt-0.5">{right}</div>}
    </div>
  )
}

/** A vertical stack of course cards with consistent spacing. */
function CardList({ children }) {
  return <div className="space-y-2">{children}</div>
}

/** Sub-heading inside a section ("Ready to take", "Blocked", …). */
function GroupLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-5 mb-2 first:mt-0">
      {children}
    </p>
  )
}

function Empty({ children }) {
  return <p className="text-sm text-gray-500 py-2">{children}</p>
}

/** A professor line for a gen-ed pick. */
function ProfessorNote({ professor }) {
  if (!professor) {
    return <p className="text-xs text-gray-400 mt-1">No rated professor on record</p>
  }
  const rating = professor.avgRating != null ? professor.avgRating.toFixed(1) : '—'
  const diff = professor.avgDifficulty != null ? professor.avgDifficulty.toFixed(1) : '—'
  return (
    <p className="text-xs text-gray-500 mt-1">
      {professor.name} · <span className="text-amber-600">★ {rating}</span>
      <span className="text-gray-300"> · </span>
      difficulty {diff}
    </p>
  )
}

/* ------------------------------------------------------------------ *
 * Section bodies
 * ------------------------------------------------------------------ */

function MajorRequirements({ required }) {
  const { eligible, blocked } = required
  if (eligible.length === 0 && blocked.length === 0) {
    return <Empty>All major requirements are complete.</Empty>
  }
  return (
    <>
      {eligible.length > 0 && (
        <>
          <GroupLabel>Ready to take</GroupLabel>
          <CardList>
            {eligible.map((c) => (
              <CourseRow
                key={c.code}
                code={c.code}
                name={c.name}
                credits={c.credits}
                right={<Chip tone="green">Ready</Chip>}
              />
            ))}
          </CardList>
        </>
      )}
      {blocked.length > 0 && (
        <>
          <GroupLabel>Blocked — prerequisites left</GroupLabel>
          <CardList>
            {blocked.map((c) => (
              <CourseRow
                key={c.code}
                code={c.code}
                name={c.name}
                credits={c.credits}
                sub={
                  <p className="text-xs text-amber-600 mt-1">
                    Needs: {c.missing.join(' · ')}
                  </p>
                }
                right={<Chip tone="gray">Blocked</Chip>}
              />
            ))}
          </CardList>
        </>
      )}
    </>
  )
}

/** Chevron that rotates when its card is open. */
function Chevron({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

/** One professor line inside an expanded elective card. */
function ProfessorListRow({ professor }) {
  const rating = professor.avgRating != null ? professor.avgRating.toFixed(1) : '—'
  const diff = professor.avgDifficulty != null ? professor.avgDifficulty.toFixed(1) : '—'
  return (
    <li className="flex items-center justify-between gap-3 text-xs">
      <span className="text-gray-700 font-medium truncate">{professor.name}</span>
      <span className="text-gray-500 flex-shrink-0">
        <span className="text-amber-600">★ {rating}</span>
        <span className="text-gray-300"> · </span>
        difficulty {diff}
        <span className="text-gray-300"> · </span>
        {professor.numRatings} ratings
      </span>
    </li>
  )
}

/**
 * A major-elective card. Styled like the Flowchart's CourseCard, and clickable:
 * expanding it fetches the top professors for that course on demand.
 */
function ElectiveCard({ course }) {
  const { code, name, credits, unlocks, professor } = course
  const [open, setOpen] = useState(false)
  const [profs, setProfs] = useState(null)
  const [loadingProfs, setLoadingProfs] = useState(false)
  const [profError, setProfError] = useState(null)

  const toggle = () => {
    const next = !open
    setOpen(next)
    // Lazy-load professors the first time the card is opened.
    if (next && profs === null && !loadingProfs) {
      setLoadingProfs(true)
      setProfError(null)
      getTopProfessors(code, 5)
        .then((res) => setProfs(res.professors))
        .catch((err) => setProfError(err.message))
        .finally(() => setLoadingProfs(false))
    }
  }

  return (
    <div className="border border-emerald-200 bg-white rounded-xl shadow-sm overflow-hidden self-start">
      <button
        type="button"
        onClick={toggle}
        className="w-full text-left p-3.5 hover:bg-emerald-50/60 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-gray-900">{code}</span>
              <span className="text-xs text-gray-400">{credits} cr</span>
            </div>
            <p className="text-sm text-gray-600 leading-snug mt-0.5">{name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unlocks > 0
              ? <Chip tone="purple">unlocks {unlocks}</Chip>
              : <Chip tone="green">Ready</Chip>}
            <Chevron open={open} />
          </div>
        </div>
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <ProfessorNote professor={professor} />
        </div>
      </button>

      {open && (
        <div className="border-t border-emerald-100 bg-emerald-50/40 px-3.5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Top professors
          </p>
          {loadingProfs && <p className="text-xs text-gray-500">Loading professors…</p>}
          {profError && (
            <p className="text-xs text-red-500">Couldn’t load professors ({profError})</p>
          )}
          {profs && profs.length === 0 && (
            <p className="text-xs text-gray-500">No rated professors on record.</p>
          )}
          {profs && profs.length > 0 && (
            <ul className="space-y-1.5">
              {profs.map((p) => (
                <ProfessorListRow key={p.id} professor={p} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function MajorElectives({ majorElectives }) {
  const { creditsCompleted, creditsRequired, eligible } = majorElectives
  const pct = creditsRequired > 0 ? Math.min(100, (creditsCompleted / creditsRequired) * 100) : 0
  return (
    <>
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Elective credits</span>
          <span>{creditsCompleted} / {creditsRequired} cr</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-purple-600 rounded-full" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {eligible.length === 0 ? (
        <Empty>No eligible electives found.</Empty>
      ) : (
        <>
          <GroupLabel>Eligible now — tap a course for professors</GroupLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            {eligible.map((c) => (
              <ElectiveCard key={c.code} course={c} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function GeneralEducation({ generalElectives }) {
  const needed = generalElectives.filter((b) => !b.satisfied)
  const done = generalElectives.filter((b) => b.satisfied)

  return (
    <>
      {needed.length === 0 ? (
        <Empty>Every general-education requirement is covered.</Empty>
      ) : (
        needed.map((bucket) => (
          <div
            key={bucket.slug}
            className="mt-4 pt-4 border-t border-gray-100 first:mt-0 first:pt-0 first:border-0"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">{bucket.name}</p>
              <Chip tone="amber">
                pick {bucket.coursesNeeded - bucket.coursesAccountedFor}
              </Chip>
            </div>
            <p className="text-xs text-gray-400 mb-2">{bucket.category}</p>
            {bucket.suggestions.length === 0 ? (
              <Empty>No suggestions available for this requirement.</Empty>
            ) : (
              <CardList>
                {bucket.suggestions.map((s) => (
                  <CourseRow
                    key={s.code}
                    code={s.code}
                    name={s.name}
                    credits={s.credits}
                    sub={<ProfessorNote professor={s.professor} />}
                  />
                ))}
              </CardList>
            )}
          </div>
        ))
      )}

      {done.length > 0 && (
        <>
          <GroupLabel>Already covered</GroupLabel>
          <div className="flex flex-wrap gap-2">
            {done.map((b) => (
              <span key={b.slug} className="text-xs text-gray-500">
                <span className="text-emerald-500">✓</span> {b.name}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function SuggestionsPage() {
  const [transcript] = useState(loadTranscript)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getRecommendations({
      completed: transcript.completed,
      inProgress: transcript.inProgress,
      planned: transcript.planned,
    })
      .then((res) => { if (!cancelled) setData(res) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [transcript])

  const genEdGaps = data ? data.generalElectives.filter((b) => !b.satisfied).length : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 py-10">
        <header className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Suggested Courses</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data ? data.major : 'B.A. Computer Science'}
            {transcript.source === 'demo' && (
              <span className="ml-2 text-xs text-gray-400">· demo transcript</span>
            )}
          </p>
        </header>

        {loading && (
          <p className="text-sm text-gray-500 py-12 text-center">Loading recommendations…</p>
        )}

        {error && !loading && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-4">
            <p className="text-sm font-medium text-red-700">Couldn’t load recommendations</p>
            <p className="text-xs text-red-500 mt-1">{error}</p>
            <p className="text-xs text-gray-500 mt-2">
              Is the backend running on <code>:3000</code>?
            </p>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Stat value={data.completedCount} label="courses completed" />
              <Stat value={`${data.majorElectives.creditsRemaining} cr`} label="electives to go" />
              <Stat value={genEdGaps} label="gen-ed gaps" />
            </div>

            <div className="space-y-3">
              <Collapsible
                title="Major Requirements"
                subtitle="Core CSCI and math courses for the degree"
                accent="bg-purple-600"
                chip={
                  data.required.eligible.length > 0
                    ? <Chip tone="green">{data.required.eligible.length} ready</Chip>
                    : <Chip tone="gray">{data.required.blocked.length} blocked</Chip>
                }
              >
                <MajorRequirements required={data.required} />
              </Collapsible>

              <Collapsible
                title="Major Electives"
                subtitle="CSCI electives you can take next"
                accent="bg-emerald-500"
                chip={
                  <Chip tone={data.majorElectives.satisfied ? 'green' : 'purple'}>
                    {data.majorElectives.creditsRemaining} cr left
                  </Chip>
                }
              >
                <MajorElectives majorElectives={data.majorElectives} />
              </Collapsible>

              <Collapsible
                title="General Education"
                subtitle="Hunter Core & Pluralism and Diversity"
                accent="bg-amber-500"
                chip={
                  genEdGaps > 0
                    ? <Chip tone="amber">{genEdGaps} to fill</Chip>
                    : <Chip tone="green">all covered</Chip>
                }
              >
                <GeneralEducation generalElectives={data.generalElectives} />
              </Collapsible>
            </div>
          </>
        )}
      </div>
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

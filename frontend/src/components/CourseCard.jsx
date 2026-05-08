function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

const STYLES = {
  completed:    { border: 'border-green-400',  bg: 'bg-white',     Icon: CheckIcon },
  'in-progress':{ border: 'border-amber-400',  bg: 'bg-amber-50',  Icon: ClockIcon },
  needed:       { border: 'border-red-400',    bg: 'bg-white',     Icon: AlertIcon },
}

const BADGE = {
  'in-progress': <span className="text-xs font-medium text-amber-500">In Progress</span>,
  needed:        <span className="text-xs font-medium text-red-400">Needed</span>,
}

export default function CourseCard({ course }) {
  const { code, title, credits, semester, grade, status } = course
  const { border, bg, Icon } = STYLES[status]

  return (
    <div className={`border ${border} ${bg} rounded-lg p-3`}>
      <div className="flex justify-between items-start mb-1">
        <span className="text-xs text-gray-500 font-medium">{code}</span>
        <Icon />
      </div>
      <p className="text-sm font-semibold text-gray-800 mb-3 leading-snug">{title}</p>
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">
          {credits} credits{semester ? ` • ${semester}` : ' • Not scheduled'}
        </span>
        {status === 'completed' && grade
          ? <span className="text-xs text-gray-500 font-medium">{grade}</span>
          : BADGE[status]
        }
      </div>
    </div>
  )
}

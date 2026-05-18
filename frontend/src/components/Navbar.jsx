import { Link, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { label: 'Dashboard', to: '/upload' },
  { label: 'Flowchart', to: '/flowchart' },
  { label: 'Suggestions', to: '/suggestions' },
]

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <nav className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center gap-4 sm:gap-0">
      <span className="text-lg sm:text-2xl font-bold text-purple-700 tracking-tight flex-shrink-0">DegreeFlow</span>

      <div className="flex-1 flex justify-end sm:justify-center gap-4 sm:gap-8 flex-wrap">
        {NAV_LINKS.map(({ label, to }) => {
          const active = pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={`text-sm font-medium pb-1 transition-colors ${
                active
                  ? 'text-purple-700 border-b-2 border-purple-700'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

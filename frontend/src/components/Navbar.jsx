import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { label: 'Dashboard', to: '/upload' },
  { label: 'Flowchart', to: '/flowchart' },
  { label: 'Suggestions', to: '/suggestions' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4">
      <div className="flex items-center justify-between">
        <span className="text-lg sm:text-2xl font-bold text-purple-700 tracking-tight">DegreeFlow</span>
        <button
          className="sm:hidden text-gray-500 hover:text-gray-800"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="text-2xl">{menuOpen ? '✕' : '☰'}</span>
        </button>
        <div className="hidden sm:flex gap-8">
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
      </div>
      {menuOpen && (
        <div className="sm:hidden flex flex-col gap-4 mt-4">
          {NAV_LINKS.map(({ label, to }) => {
            const active = pathname === to
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
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
      )}
    </nav>
  )
}

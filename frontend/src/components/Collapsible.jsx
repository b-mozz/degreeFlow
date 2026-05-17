import { useState } from 'react'

function Chevron({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

/**
 * A plain expand/collapse panel — the "dropdown" sections of the page.
 * `accent` is a Tailwind bg-* class for the small colour dot that lets the
 * eye tell sections apart at a glance.
 */
export default function Collapsible({ title, subtitle, chip, accent, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="border border-gray-200 rounded-xl bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {accent && <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${accent}`} />}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {chip}
          <Chevron open={open} />
        </div>
      </button>

      {open && <div className="px-4 sm:px-5 pb-5 border-t border-gray-100 pt-4">{children}</div>}
    </section>
  )
}

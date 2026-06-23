import { Link } from 'react-router-dom'
import Navbar from './Navbar'

/** Shown on the Flowchart / Suggestions pages when no transcript has been uploaded yet. */
export default function NoTranscript() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <svg className="w-10 h-10 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <h1 className="text-lg font-semibold text-gray-900">No transcript yet</h1>
        <p className="text-sm text-gray-500 mt-1">Upload your transcript to see this page.</p>
        <Link
          to="/upload"
          className="inline-block mt-5 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
        >
          Upload transcript
        </Link>
      </div>
    </div>
  )
}

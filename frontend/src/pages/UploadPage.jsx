import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { extractPDFLines, looksLikeTranscript, parseTranscriptLines } from '../lib/pdfParser'
import { loadTranscript } from '../lib/transcript'
import { getRecommendations } from '../lib/api'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB — must match the limit shown in the upload UI.

function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function UploadIcon() {
  return (
    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}

export default function UploadPage() {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState(null)
  const [text, setText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [rejection, setRejection] = useState(null)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const canParse = (file !== null || text.trim().length > 0) && !isParsing

  const clearFileInput = () => {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const rejectTooLarge = (f) => {
    setRejection({
      title: 'That file is too large',
      body: `“${f.name}” is ${formatMB(f.size)}. DegreeFlow only accepts transcripts up to 5 MB — try exporting a fresh copy from CUNYfirst, or paste the text below instead.`,
    })
    clearFileInput()
  }

  const rejectNonTranscript = () => {
    setRejection({
      title: "That doesn't look like a transcript",
      body: 'DegreeFlow only accepts unofficial Hunter College transcripts. Please upload a PDF of your transcript and try again.',
    })
    clearFileInput()
  }

  /** Accept a freshly-picked file iff it's a PDF and within the size limit. */
  const acceptFile = (candidate) => {
    if (!candidate) return
    if (candidate.type !== 'application/pdf') return // file input's `accept` filter already enforces this on click
    if (candidate.size > MAX_FILE_BYTES) {
      rejectTooLarge(candidate)
      return
    }
    setFile(candidate)
    setText('')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    acceptFile(e.dataTransfer.files[0])
  }

  const handleFileChange = (e) => {
    acceptFile(e.target.files[0])
  }

  const handleParse = async () => {
    // Safety net: acceptFile already rejects oversized files at selection time,
    // but check here too in case a stale File object somehow slips through.
    if (file && file.size > MAX_FILE_BYTES) {
      rejectTooLarge(file)
      return
    }
    setIsParsing(true)
    try {
      let lines
      if (file) {
        const buffer = await file.arrayBuffer()
        lines = await extractPDFLines(buffer)
      } else {
        lines = text.split('\n').filter(l => l.trim())
      }

      if (!looksLikeTranscript(lines)) {
        rejectNonTranscript()
        return
      }

      const result = parseTranscriptLines(lines)

      // Defense in depth: a PDF can hit the marker heuristic and still parse
      // zero courses (e.g. a transcript-shaped form). Treat that as "not a
      // transcript" too, since the rest of the app needs at least one course.
      if (!result.courses || result.courses.length === 0) {
        rejectNonTranscript()
        return
      }

      console.log('Parsed transcript:', result)
      localStorage.setItem('parsedTranscript', JSON.stringify(result))

      // Warm the recommendations cache in the background. loadTranscript()
      // re-reads the value we just stored and derives the course-code arrays.
      // Fire-and-forget: the result lands in sessionStorage so the Suggestions
      // page gets an instant cache hit later. Errors here are non-fatal.
      const t = loadTranscript()
      getRecommendations({
        completed: t.completed,
        inProgress: t.inProgress,
        planned: t.planned,
      }).catch(() => {})

      navigate('/flowchart')
    } catch (err) {
      console.error('Failed to parse transcript:', err)
      alert(`Error parsing transcript: ${err.message || 'Unknown error'}. Please try pasting the text directly if the PDF fails.`)
    } finally {

      setIsParsing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-2xl mx-auto py-16 px-4">
        <p className="text-center text-xs font-semibold tracking-widest text-purple-600 uppercase mb-3">
          Step 1 of 3
        </p>
        <h1 className="text-4xl font-bold text-center text-gray-900 mb-4">
          Upload Your Transcript
        </h1>
        <p className="text-center text-gray-500 text-sm leading-relaxed mb-10">
          Paste or upload your unofficial Hunter transcript. Our AI will<br />
          extract your courses, grades, and credits automatically.
        </p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              file
                ? 'border-green-400 bg-green-50'
                : dragOver
                ? 'border-purple-400 bg-purple-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <UploadIcon />
            </div>

            {file ? (
              <>
                <p className="font-semibold text-green-700 mb-1">{file.name}</p>
                <p className="text-xs text-gray-400">Click to change file</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-700 mb-1">Drag & drop your transcript PDF</p>
                <p className="text-gray-400 text-sm mb-5">or click to browse files</p>
                <button
                  type="button"
                  className="bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-800 transition-colors"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                >
                  Choose File
                </button>
                <p className="text-gray-400 text-xs mt-4">Supports PDF • Max 5MB</p>
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* OR divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-400 text-sm">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Paste area */}
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Paste transcript text
          </label>
          <textarea
            rows={5}
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            placeholder="Paste your unofficial transcript here..."
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (e.target.value.trim()) setFile(null) // Clear file if text is pasted
            }}
          />
        </div>

        <div className="mt-5">
          <button
            onClick={handleParse}
            disabled={!canParse}
            className="border border-purple-700 text-purple-700 bg-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isParsing ? 'Parsing...' : 'Parse Transcript'}
          </button>
        </div>
      </div>

      <RejectionModal
        rejection={rejection}
        onClose={() => setRejection(null)}
      />
    </div>
  )
}

function RejectionModal({ rejection, onClose }) {
  if (!rejection) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rejection-title"
      >
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 id="rejection-title" className="text-lg font-semibold text-gray-900 text-center mb-2">
          {rejection.title}
        </h2>
        <p className="text-sm text-gray-500 text-center leading-relaxed mb-5">
          {rejection.body}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-800 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  )
}


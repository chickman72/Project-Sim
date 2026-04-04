import React from 'react'

type TranscriptMessage = {
  role: 'student' | 'assistant'
  content: string
  timestamp?: string
}

type TranscriptViewerProps = {
  open: boolean
  title: string
  loading: boolean
  error: string | null
  messages: TranscriptMessage[]
  studentLabel?: string
  assistantLabel?: string
  onClose: () => void
}

export default function TranscriptViewer({
  open,
  title,
  loading,
  error,
  messages,
  studentLabel = 'You',
  assistantLabel = 'Patient',
  onClose,
}: TranscriptViewerProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
        aria-label="Close transcript"
      />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl border-l border-gray-200 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Transcript Review</h3>
            <p className="text-sm text-gray-600 truncate">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {loading && <p className="text-sm text-gray-600">Loading transcript...</p>}
          {!loading && error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && messages.length === 0 && (
            <p className="text-sm text-gray-600">No transcript entries were found for this session.</p>
          )}

          {!loading && !error && messages.length > 0 && (
            <div className="space-y-3">
              {messages.map((message, index) => {
                const isStudent = message.role === 'student'
                return (
                  <div key={`${message.role}-${index}`} className={isStudent ? 'text-right' : 'text-left'}>
                    <div
                      className={`inline-block max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        isStudent
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                      }`}
                    >
                      <div className={`mb-1 text-xs font-semibold ${isStudent ? 'text-blue-100' : 'text-gray-500'}`}>
                        {isStudent ? studentLabel : assistantLabel}
                      </div>
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

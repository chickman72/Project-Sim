import React, { useState } from 'react'

type TranscriptMessage = {
  role: 'student' | 'assistant'
  content: string
  timestamp?: string
}

type TranscriptViewerProps = {
  open: boolean
  title: string
  sessionId?: string
  exportStudentName?: string
  exportSimulationTitle?: string
  loading: boolean
  error: string | null
  messages: TranscriptMessage[]
  studentLabel?: string
  assistantLabel?: string
  variant?: 'drawer' | 'modal'
  onClose: () => void
}

export default function TranscriptViewer({
  open,
  title,
  sessionId,
  exportStudentName,
  exportSimulationTitle,
  loading,
  error,
  messages,
  studentLabel = 'You',
  assistantLabel = 'Patient',
  variant = 'drawer',
  onClose,
}: TranscriptViewerProps) {
  const [pdfError, setPdfError] = useState<string | null>(null)

  if (!open) return null

  const toSafeFileToken = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')

  const downloadTranscriptPdf = async () => {
    setPdfError(null)
    const lines: string[] = [
      `Transcript Review`,
      `Session: ${sessionId || 'Unknown'}`,
      `Title: ${title || 'Transcript'}`,
      '',
    ]

    messages.forEach((message) => {
      const speaker = message.role === 'student' ? studentLabel : assistantLabel
      const when = message.timestamp ? new Date(message.timestamp).toLocaleString() : ''
      if (when) {
        lines.push(`${when} - ${speaker}`)
      } else {
        lines.push(`${speaker}`)
      }
      lines.push(`  ${message.content || ''}`)
      lines.push('')
    })

    try {
      const module = await import('jspdf')
      const { jsPDF } = module as any
      const doc = new jsPDF()
      doc.setFontSize(10)

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      const maxWidth = pageWidth - 2 * margin
      let yPosition = margin

      const wrappedLines = lines.flatMap((line) => doc.splitTextToSize(line || ' ', maxWidth))
      wrappedLines.forEach((wrappedLine) => {
        if (yPosition + 7 > pageHeight - margin) {
          doc.addPage()
          yPosition = margin
        }
        doc.text(wrappedLine, margin, yPosition)
        yPosition += 7
      })

      const studentPart = toSafeFileToken(exportStudentName || 'student')
      const simulationPart = toSafeFileToken(exportSimulationTitle || title || 'simulation')
      const baseName = `transcript-${studentPart}-${simulationPart}`
      doc.save(`${baseName}.pdf`)
    } catch (err) {
      console.error('Failed to generate transcript PDF:', err)
      setPdfError('Unable to generate PDF. Please try again.')
    }
  }

  const body = (
    <>
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Transcript Review</h3>
          <p className="text-sm text-gray-600 truncate">{title}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadTranscriptPdf}
            disabled={loading || !!error || messages.length === 0}
            className="px-3 py-1.5 rounded-md bg-blue-600 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Download PDF
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {pdfError && <p className="mb-3 text-sm text-red-600">{pdfError}</p>}
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
    </>
  )

  if (variant === 'modal') {
    return (
      <div className="fixed inset-0 z-50">
        <button
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
          aria-label="Close transcript"
        />
        <div className="relative mx-auto mt-16 h-[80vh] w-[94%] max-w-4xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl flex flex-col">
          {body}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
        aria-label="Close transcript"
      />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl border-l border-gray-200 flex flex-col">
        {body}
      </div>
    </div>
  )
}

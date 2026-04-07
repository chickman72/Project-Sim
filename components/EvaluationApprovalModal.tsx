'use client'

import React, { useMemo, useState } from 'react'

type EvaluationRow = {
  criteriaId: string
  status: 'Met' | 'Not Met'
  aiFeedback: string
  instructorOverride?: string
}

type TranscriptMessage = {
  role: 'student' | 'assistant'
  content: string
  timestamp?: string
  inputMethod?: 'text' | 'voice'
}

type EvaluationApprovalModalProps = {
  open: boolean
  title: string
  loading: boolean
  saving: boolean
  error: string | null
  evaluationData: EvaluationRow[]
  transcript: TranscriptMessage[]
  onClose: () => void
  onSave: (rows: EvaluationRow[], publish: boolean) => Promise<void>
}

export default function EvaluationApprovalModal({
  open,
  title,
  loading,
  saving,
  error,
  evaluationData,
  transcript,
  onClose,
  onSave,
}: EvaluationApprovalModalProps) {
  const [draft, setDraft] = useState<EvaluationRow[]>([])

  React.useEffect(() => {
    if (open) setDraft(evaluationData)
  }, [open, evaluationData])

  const canSave = useMemo(
    () => draft.length > 0 && draft.every((row) => row.criteriaId && row.aiFeedback.trim().length > 0),
    [draft]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/35" onClick={onClose} aria-label="Close evaluator" />
      <div className="absolute inset-y-0 right-0 w-full max-w-5xl bg-white border-l border-gray-200 shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Evaluation Review</h3>
            <p className="text-sm text-gray-600 truncate">{title}</p>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-gray-300 text-sm hover:bg-gray-50">
            Close
          </button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden">
          <div className="border-r border-gray-200 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-800">AI Rubric Output</div>
            <div className="p-4 space-y-4 overflow-y-auto">
              {loading && <p className="text-sm text-gray-600">Loading evaluation...</p>}
              {!loading && error && <p className="text-sm text-red-600">{error}</p>}
              {!loading && !error && draft.length === 0 && <p className="text-sm text-gray-600">No evaluation rows found.</p>}

              {!loading && !error && draft.map((row, idx) => (
                <div key={`${row.criteriaId}-${idx}`} className="rounded-lg border border-gray-200 p-3 bg-gray-50 space-y-3">
                  <div className="text-sm font-semibold text-gray-900">{row.criteriaId}</div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                    <select
                      value={row.status}
                      onChange={(e) => {
                        const next = [...draft]
                        next[idx] = { ...next[idx], status: e.target.value as 'Met' | 'Not Met' }
                        setDraft(next)
                      }}
                      className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="Met">Met</option>
                      <option value="Not Met">Not Met</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Finalized Feedback</label>
                    <textarea
                      value={row.instructorOverride ?? row.aiFeedback}
                      onChange={(e) => {
                        const next = [...draft]
                        next[idx] = { ...next[idx], instructorOverride: e.target.value }
                        setDraft(next)
                      }}
                      className="w-full min-h-20 px-2 py-1 border border-gray-300 rounded-md text-sm resize-y"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-800">Transcript</div>
            <div className="p-4 bg-gray-50 overflow-y-auto space-y-3">
              {transcript.length === 0 && <p className="text-sm text-gray-600">No transcript available.</p>}
              {transcript.map((message, idx) => {
                const isStudent = message.role === 'student'
                return (
                  <div key={`${message.role}-${idx}`} className={isStudent ? 'text-right' : 'text-left'}>
                    <div className={`inline-block max-w-[90%] rounded-2xl px-4 py-3 text-sm ${isStudent ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-900'}`}>
                      <div className={`mb-1 text-xs font-semibold ${isStudent ? 'text-blue-100' : 'text-gray-500'}`}>
                        {isStudent
                          ? `Student (${message.inputMethod === 'voice' ? 'Voice' : 'Text'})`
                          : 'Patient'}
                      </div>
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={() => onSave(draft, false)}
            disabled={saving || !canSave}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => onSave(draft, true)}
            disabled={saving || !canSave}
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Approve & Publish to Student'}
          </button>
        </div>
      </div>
    </div>
  )
}

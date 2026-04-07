'use client'

import React, { useMemo, useState } from 'react'
import TranscriptViewer from './TranscriptViewer'
import EvaluationApprovalModal from './EvaluationApprovalModal'

type NeedsReviewStatus = 'in-progress' | 'completed' | 'abandoned' | 'timeout'
type EvaluationStatus = 'none' | 'pending_approval' | 'published'

type EvaluationRow = {
  criteriaId: string
  status: 'Met' | 'Not Met'
  aiFeedback: string
  instructorOverride?: string
}

type NeedsReviewRow = {
  sessionId: string
  date: string
  studentName: string
  studentEmail: string
  simulationCode: string
  simulationName: string
  status: NeedsReviewStatus
  durationSeconds?: number
  cohortId: string
  cohortName: string
  flagType: 'none' | 'abandoned_or_timeout' | 'low_duration'
  isFlagged: boolean
  evaluationStatus: EvaluationStatus
  evaluationData?: EvaluationRow[]
  rubric?: Array<{ id: string; name: string; successCondition: string }>
}

type NeedsReviewResponse = {
  rows: NeedsReviewRow[]
  cohorts: Array<{ id: string; name: string }>
  simulations: Array<{ code: string; name: string }>
}

type TranscriptMessage = {
  role: 'student' | 'assistant'
  content: string
  timestamp?: string
  inputMethod?: 'text' | 'voice'
}

const formatDate = (iso: string) => {
  const date = new Date(iso)
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatDuration = (seconds?: number) => {
  if (typeof seconds !== 'number') return '-'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

const statusBadgeClass = (status: NeedsReviewStatus) => {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-700'
  if (status === 'in-progress') return 'bg-blue-100 text-blue-700'
  if (status === 'abandoned') return 'bg-rose-100 text-rose-700'
  return 'bg-orange-100 text-orange-700'
}

export default function NeedsReviewDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<NeedsReviewRow[]>([])
  const [cohorts, setCohorts] = useState<Array<{ id: string; name: string }>>([])
  const [simulations, setSimulations] = useState<Array<{ code: string; name: string }>>([])
  const [cohortFilter, setCohortFilter] = useState('')
  const [simulationFilter, setSimulationFilter] = useState('')
  const [busySessionId, setBusySessionId] = useState<string | null>(null)

  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [transcriptSessionId, setTranscriptSessionId] = useState<string | undefined>(undefined)
  const [transcriptTitle, setTranscriptTitle] = useState('')
  const [transcriptStudentName, setTranscriptStudentName] = useState<string | undefined>(undefined)
  const [transcriptSimulationTitle, setTranscriptSimulationTitle] = useState<string | undefined>(undefined)
  const [transcriptMessages, setTranscriptMessages] = useState<TranscriptMessage[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)

  const [evaluationOpen, setEvaluationOpen] = useState(false)
  const [evaluationTitle, setEvaluationTitle] = useState('')
  const [evaluationLoading, setEvaluationLoading] = useState(false)
  const [evaluationSaving, setEvaluationSaving] = useState(false)
  const [evaluationError, setEvaluationError] = useState<string | null>(null)
  const [evaluationRows, setEvaluationRows] = useState<EvaluationRow[]>([])
  const [evaluationTranscript, setEvaluationTranscript] = useState<TranscriptMessage[]>([])
  const [activeEvalSessionId, setActiveEvalSessionId] = useState<string | null>(null)

  const loadData = React.useCallback(async (cohortId?: string, simulationCode?: string) => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (cohortId) params.set('cohortId', cohortId)
      if (simulationCode) params.set('simulationCode', simulationCode)

      const resp = await fetch(`/api/instructor/needs-review${params.toString() ? `?${params.toString()}` : ''}`)
      if (!resp.ok) {
        const txt = await resp.text()
        throw new Error(txt || 'Failed to load review dashboard')
      }

      const data: NeedsReviewResponse = await resp.json()
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setCohorts(Array.isArray(data.cohorts) ? data.cohorts : [])
      setSimulations(Array.isArray(data.simulations) ? data.simulations : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load review dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    loadData(cohortFilter || undefined, simulationFilter || undefined)
  }, [cohortFilter, simulationFilter, loadData])

  const flaggedCount = useMemo(() => rows.filter((row) => row.isFlagged).length, [rows])

  const openTranscript = async (row: NeedsReviewRow) => {
    setTranscriptOpen(true)
    setTranscriptSessionId(row.sessionId)
    setTranscriptTitle(`${row.simulationName} - ${row.studentName}`)
    setTranscriptStudentName(row.studentName)
    setTranscriptSimulationTitle(row.simulationName)
    setTranscriptMessages([])
    setTranscriptError(null)
    setTranscriptLoading(true)
    try {
      const resp = await fetch(`/api/instructor/transcript/${encodeURIComponent(row.sessionId)}`)
      const data = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(data?.error || 'Failed to load transcript')
      setTranscriptMessages(Array.isArray(data?.messages) ? data.messages : [])
    } catch (err: any) {
      setTranscriptError(err?.message || 'Failed to load transcript')
    } finally {
      setTranscriptLoading(false)
    }
  }

  const runAIEval = async (row: NeedsReviewRow) => {
    try {
      const rubric = Array.isArray(row.rubric)
        ? row.rubric
            .map((item) => ({
              criteriaId: item.id || item.name,
              description: `${item.name}: ${item.successCondition}`,
            }))
            .filter((item) => item.criteriaId && item.description)
        : []

      if (!rubric.length) {
        throw new Error('No rubric configured for this simulation. Add Evaluation Criteria in /config first.')
      }

      setBusySessionId(row.sessionId)
      const resp = await fetch('/api/instructor/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: row.sessionId, rubric }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(data?.error || 'Failed to run AI evaluation')
      await loadData(cohortFilter || undefined, simulationFilter || undefined)
    } catch (err: any) {
      setError(err?.message || 'Failed to run AI evaluation')
    } finally {
      setBusySessionId(null)
    }
  }

  const reopenSession = async (row: NeedsReviewRow) => {
    try {
      setBusySessionId(row.sessionId)
      const resp = await fetch('/api/instructor/reopen-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: row.sessionId }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(data?.error || 'Failed to reopen session')
      await loadData(cohortFilter || undefined, simulationFilter || undefined)
    } catch (err: any) {
      setError(err?.message || 'Failed to reopen session')
    } finally {
      setBusySessionId(null)
    }
  }

  const openEvaluation = async (row: NeedsReviewRow) => {
    setActiveEvalSessionId(row.sessionId)
    setEvaluationTitle(`${row.simulationName} - ${row.studentName}`)
    setEvaluationOpen(true)
    setEvaluationLoading(true)
    setEvaluationError(null)
    setEvaluationRows([])
    setEvaluationTranscript([])

    try {
      const [evalResp, transcriptResp] = await Promise.all([
        fetch(`/api/instructor/evaluation/${encodeURIComponent(row.sessionId)}`),
        fetch(`/api/instructor/transcript/${encodeURIComponent(row.sessionId)}`),
      ])
      const evalData = await evalResp.json().catch(() => null)
      const transcriptData = await transcriptResp.json().catch(() => null)
      if (!evalResp.ok) throw new Error(evalData?.error || 'Failed to load evaluation')
      if (!transcriptResp.ok) throw new Error(transcriptData?.error || 'Failed to load transcript')

      setEvaluationRows(Array.isArray(evalData?.evaluationData) ? evalData.evaluationData : [])
      setEvaluationTranscript(Array.isArray(transcriptData?.messages) ? transcriptData.messages : [])
    } catch (err: any) {
      setEvaluationError(err?.message || 'Failed to load evaluation details')
    } finally {
      setEvaluationLoading(false)
    }
  }

  const saveEvaluation = async (nextRows: EvaluationRow[], publish: boolean) => {
    if (!activeEvalSessionId) return
    try {
      setEvaluationSaving(true)
      const resp = await fetch(`/api/instructor/evaluation/${encodeURIComponent(activeEvalSessionId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluationStatus: publish ? 'published' : 'pending_approval',
          evaluationData: nextRows,
        }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(data?.error || 'Failed to save evaluation')
      setEvaluationOpen(false)
      await loadData(cohortFilter || undefined, simulationFilter || undefined)
    } catch (err: any) {
      setEvaluationError(err?.message || 'Failed to save evaluation')
    } finally {
      setEvaluationSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Needs Review Dashboard</h3>
          <p className="text-sm text-gray-600">Flagged first, then newest sessions.</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          Flagged: <span className="font-semibold text-rose-700">{flaggedCount}</span> / {rows.length}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Filter by Cohort</label>
          <select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
            <option value="">All Cohorts</option>
            {cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Filter by Simulation</label>
          <select value={simulationFilter} onChange={(e) => setSimulationFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
            <option value="">All Simulations</option>
            {simulations.map((simulation) => <option key={simulation.code} value={simulation.code}>{simulation.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700 uppercase text-xs tracking-wide">
            <tr>
              <th className="px-3 py-3 text-left">Flag</th>
              <th className="px-3 py-3 text-left">Date</th>
              <th className="px-3 py-3 text-left">Student</th>
              <th className="px-3 py-3 text-left">Simulation</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-left">Duration</th>
              <th className="px-3 py-3 text-left">Score (Coming Soon)</th>
              <th className="px-3 py-3 text-left">Actions</th>
              <th className="px-3 py-3 text-right">Transcript</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Loading sessions...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">No sessions found for current filters.</td></tr>}

            {!loading && rows.map((row) => {
              const rowClass = row.flagType === 'abandoned_or_timeout' ? 'bg-rose-50' : row.flagType === 'low_duration' ? 'bg-amber-50' : 'bg-white'
              const flagLabel = row.flagType === 'abandoned_or_timeout' ? '[!] Abandoned/Timeout' : row.flagType === 'low_duration' ? '[!] Very Short' : '-'

              return (
                <tr key={row.sessionId} className={rowClass}>
                  <td className="px-3 py-3 font-medium text-xs text-gray-700">{flagLabel}</td>
                  <td className="px-3 py-3 text-gray-700">{formatDate(row.date)}</td>
                  <td className="px-3 py-3 text-gray-700">
                    <div className="font-medium text-gray-900">{row.studentName}</div>
                    <div className="text-xs text-gray-500">{row.studentEmail}</div>
                  </td>
                  <td className="px-3 py-3 text-gray-700">
                    <div className="font-medium text-gray-900">{row.simulationName}</div>
                    <div className="text-xs text-gray-500">{row.cohortName}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(row.status)}`}>{row.status}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-700">{formatDuration(row.durationSeconds)}</td>
                  <td className="px-3 py-3 text-gray-400">-</td>
                  <td className="px-3 py-3">
                    {row.status === 'completed' && (
                      <button
                        onClick={() => reopenSession(row)}
                        disabled={busySessionId === row.sessionId}
                        className="mr-2 mb-1 px-3 py-1.5 rounded-md bg-slate-600 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
                      >
                        {busySessionId === row.sessionId ? 'Reopening...' : 'Reopen Session'}
                      </button>
                    )}
                    {row.evaluationStatus === 'none' && (
                      <button
                        onClick={() => runAIEval(row)}
                        disabled={busySessionId === row.sessionId}
                        className="mb-1 px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
                      >
                        {busySessionId === row.sessionId ? 'Running...' : 'Run AI Eval'}
                      </button>
                    )}
                    {row.evaluationStatus === 'pending_approval' && (
                      <button
                        onClick={() => openEvaluation(row)}
                        className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
                      >
                        Review & Publish
                      </button>
                    )}
                    {row.evaluationStatus === 'published' && (
                      <button
                        onClick={() => openEvaluation(row)}
                        className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
                      >
                        View/Edit Eval
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => openTranscript(row)} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
                      Review Transcript
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <TranscriptViewer
        open={transcriptOpen}
        sessionId={transcriptSessionId}
        exportStudentName={transcriptStudentName}
        exportSimulationTitle={transcriptSimulationTitle}
        title={transcriptTitle}
        loading={transcriptLoading}
        error={transcriptError}
        messages={transcriptMessages}
        studentLabel="Student"
        assistantLabel="Patient"
        variant="modal"
        onClose={() => setTranscriptOpen(false)}
      />

      <EvaluationApprovalModal
        open={evaluationOpen}
        title={evaluationTitle}
        loading={evaluationLoading}
        saving={evaluationSaving}
        error={evaluationError}
        evaluationData={evaluationRows}
        transcript={evaluationTranscript}
        onClose={() => setEvaluationOpen(false)}
        onSave={saveEvaluation}
      />
    </div>
  )
}

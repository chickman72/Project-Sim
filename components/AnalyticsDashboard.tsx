'use client'

import { useEffect, useState } from 'react'

type SessionState = 'in-progress' | 'completed' | 'abandoned' | 'timeout'

type SimSessionRecord = {
  id: string
  timestamp?: string
  eventType: string
  ok?: boolean
  userId?: string
  username?: string
  sessionId?: string
  scenarioId?: string
  promptVersion?: string
  completionStatus?: SessionState
  sessionDurationSeconds?: number
  sessionTags?: string[]
  userMessage?: string
  assistant?: string
  studentInput?: string
  aiOutput?: string
  requestJson?: string
  responseJson?: string
  latencyMs?: number
  errorJson?: string
}

type GroupedSession = {
  sessionId: string
  userId?: string
  username?: string
  scenarioId?: string
  scenarioTitle?: string
  promptVersion?: string
  completionStatus?: SessionState
  sessionDurationSeconds?: number
  durationSeconds?: number
  sessionTags?: string[][]
  startTime?: string
  endTime?: string
  events: SimSessionRecord[]
}

export default function AnalyticsDashboard() {
  const [sessions, setSessions] = useState<GroupedSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<GroupedSession | null>(null)

  const parseJson = (jsonString?: string): unknown => {
    if (!jsonString) return null
    try {
      return JSON.parse(jsonString)
    } catch {
      return null
    }
  }

  const getUserText = (record: SimSessionRecord) => {
    if (record.studentInput) return record.studentInput
    if (record.userMessage) return record.userMessage
    const request = parseJson(record.requestJson)
    if (request && typeof request === 'object' && 'userMessage' in request) {
      return String((request as any).userMessage)
    }
    return ''
  }

  const getAiText = (record: SimSessionRecord) => {
    if (record.aiOutput) return record.aiOutput
    if (record.assistant) return record.assistant
    const response = parseJson(record.responseJson)
    if (response && typeof response === 'object') {
      if ('assistant' in response) return String((response as any).assistant)
      if (Array.isArray((response as any).choices) && (response as any).choices[0]?.message?.content) {
        return String((response as any).choices[0].message.content)
      }
    }
    return ''
  }

  const fetchSessions = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/sessions')
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || `Status ${res.status}`)
      }
      const sessionsData = await res.json()
      
      // Derive all scenarioIds from both top-level session fields and event-level records
      const scenarioIds = [...new Set(
        sessionsData.flatMap((session: any) => {
          const ids = [] as string[]
          if (typeof session.scenarioId === 'string' && session.scenarioId) ids.push(session.scenarioId)
          if (Array.isArray(session.events)) {
            for (const event of session.events) {
              if (typeof event.scenarioId === 'string' && event.scenarioId) {
                ids.push(event.scenarioId)
              }
            }
          }
          return ids
        }).filter(Boolean)
      )]
      const simulationMap = new Map()
      
      if (scenarioIds.length > 0) {
        try {
          const simRes = await fetch('/api/admin/simulations')
          if (simRes.ok) {
            const simulations = await simRes.json()
            simulations.forEach((sim: any) => {
              simulationMap.set(sim.code, sim.title || 'Untitled')
            })
          }
        } catch (err) {
          console.warn('Failed to fetch simulation details:', err)
        }
      }
      
      const sessionsWithTitles = sessionsData.map((session: any) => {
        const scenarioId =
          session.scenarioId ||
          session.events?.find((event: any) => typeof event.scenarioId === 'string' && event.scenarioId)?.scenarioId ||
          undefined

        return {
          ...session,
          scenarioId,
          scenarioTitle: scenarioId ? simulationMap.get(scenarioId) || scenarioId : 'Unknown'
        }
      })
      
      setSessions(Array.isArray(sessionsWithTitles) ? sessionsWithTitles : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics sessions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  const formatTimestamp = (value?: string) => {
    if (!value) return 'Unknown'
    const parsed = Date.parse(value)
    if (Number.isNaN(parsed)) return 'Unknown'
    return new Date(parsed).toLocaleString()
  }

  const formatDuration = (value?: number) => {
    if (value == null) return '-'
    return `${value}s`
  }

  const downloadTranscriptPdf = async (session: GroupedSession) => {
    const lines: string[] = [
      `Transcript for ${session.scenarioTitle || 'Unknown'} (${session.scenarioId || 'Unknown'})`,
      `User: ${session.username ?? session.userId ?? 'Unknown'}`,
      `Start Time: ${formatTimestamp(session.startTime)}`,
      `Duration: ${formatDuration(session.durationSeconds ?? session.sessionDurationSeconds)}`,
      '',
    ]

    session.events.forEach((event) => {
      const eventTime = formatTimestamp(event.timestamp)
      if (event.eventType === 'login' || event.eventType === 'logout') {
        lines.push(`${eventTime} - ${event.eventType.toUpperCase()}`)
        lines.push(`  Status: ${event.ok ? 'Success' : 'Failure'}`)
        if (event.userId) lines.push(`  User ID: ${event.userId}`)
      } else if (event.eventType === 'chat') {
        const userText = getUserText(event)
        const aiText = getAiText(event)
        lines.push(`${eventTime} - CHAT`)
        if (userText) lines.push(`  User: ${userText}`)
        if (aiText) lines.push(`  Assistant: ${aiText}`)
      } else if (event.eventType === 'chat_error') {
        const userText = getUserText(event)
        lines.push(`${eventTime} - CHAT_ERROR`)
        if (userText) lines.push(`  User: ${userText}`)
        if (event.errorJson) lines.push(`  Error: ${event.errorJson}`)
      } else if (event.eventType === 'session_state') {
        lines.push(`${eventTime} - SESSION_STATE`)
        if (event.completionStatus) lines.push(`  Completion: ${event.completionStatus}`)
        if (event.sessionDurationSeconds != null) lines.push(`  Session Duration: ${event.sessionDurationSeconds}s`)
      }
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

      // Split all text into wrapped lines
      const wrappedLines = lines.flatMap((line) =>
        doc.splitTextToSize(line || ' ', maxWidth)
      )

      // Add wrapped lines to PDF with pagination
      wrappedLines.forEach((wrappedLine) => {
        if (yPosition + 7 > pageHeight - margin) {
          doc.addPage()
          yPosition = margin
        }
        doc.text(wrappedLine, margin, yPosition)
        yPosition += 7
      })

      doc.save(`transcript-${session.sessionId || 'session'}.pdf`)
    } catch (err) {
      console.error('Failed to generate PDF:', err)
      setError('Unable to generate PDF. Please try again.')
    }
  }

  const deleteSession = async (sessionId: string) => {
    const confirmed = window.confirm('Delete all logs for this session? This cannot be undone.')
    if (!confirmed) return

    try {
      const res = await fetch(`/api/admin/sessions?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || `Status ${res.status}`)
      }
      setSelectedSession((current) => (current?.sessionId === sessionId ? null : current))
      fetchSessions()
    } catch (err: any) {
      setError(err?.message || 'Failed to delete session')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Simulation Analytics</h2>
          <p className="text-sm text-gray-500">Session-level metrics and status for tracked simulations.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fetchSessions}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-100">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Start Time</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">User</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Simulation</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Chats</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Duration</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Loading analytics...
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  No analytics sessions found.
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr key={session.sessionId}>
                  <td className="px-4 py-3 text-gray-700">{formatTimestamp(session.startTime)}</td>
                  <td className="px-4 py-3 text-gray-700">{session.username ?? session.userId ?? 'Unknown'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="flex flex-col">
                      <span className="font-medium">{session.scenarioTitle}</span>
                      <span className="text-sm text-gray-500 font-mono">{session.scenarioId || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{session.events.filter((event) => event.eventType === 'chat').length}</td>
                  <td className="px-4 py-3 text-gray-700">{session.completionStatus ?? 'Unknown'}</td>
                  <td className="px-4 py-3 text-gray-700">{formatDuration(session.durationSeconds ?? session.sessionDurationSeconds)}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSession(session)}
                      className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      View Transcript
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSession(session.sessionId)}
                      className="inline-flex items-center rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Transcript for {selectedSession.scenarioTitle} ({selectedSession.scenarioId})</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => downloadTranscriptPdf(selectedSession)}
                  className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSession(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[82vh] overflow-y-auto px-6 py-4">
              {selectedSession.events.map((event) => {
                if (event.eventType === 'login' || event.eventType === 'logout') {
                  return (
                    <div key={event.id} className="border-l-4 border-gray-400 pl-4">
                      <div className="text-sm text-gray-500">{formatTimestamp(event.timestamp)}</div>
                      <div className="mt-1 font-medium">{event.eventType === 'login' ? 'Login' : 'Logout'} event</div>
                      <div className="text-sm text-gray-600">Status: {event.ok ? 'Success' : 'Failure'}</div>
                      {event.userId && <div className="text-sm text-gray-600">User ID: {event.userId}</div>}
                    </div>
                  )
                }

                if (event.eventType === 'session_state') {
                  return (
                    <div key={event.id} className="border-l-4 border-yellow-500 pl-4">
                      <div className="text-sm text-gray-500">{formatTimestamp(event.timestamp)}</div>
                      <div className="mt-1 font-medium">Session summary</div>
                      <div className="text-sm text-gray-600">Status: {event.completionStatus ?? 'Unknown'}</div>
                      {event.sessionDurationSeconds != null && (
                        <div className="text-sm text-gray-600">Duration: {formatDuration(event.sessionDurationSeconds)}</div>
                      )}
                    </div>
                  )
                }

                const userText = getUserText(event)
                const aiText = getAiText(event)
                return (
                  <div key={event.id} className="border-l-4 border-blue-500 pl-4">
                    <div className="text-sm text-gray-500">{formatTimestamp(event.timestamp)}</div>
                    <div className="mt-1">
                      <strong>User:</strong> {userText || '—'}
                    </div>
                    <div className="mt-1">
                      <strong>AI:</strong> {aiText || '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

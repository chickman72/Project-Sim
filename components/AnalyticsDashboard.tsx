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
}

type GroupedSession = {
  sessionId: string
  userId?: string
  username?: string
  scenarioId?: string
  promptVersion?: string
  completionStatus?: SessionState
  sessionDurationSeconds?: number
  durationSeconds?: number
  sessionTags?: string[]
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
      const data = await res.json()
      setSessions(Array.isArray(data) ? data : [])
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
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Session ID</th>
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
                  <td className="px-4 py-3 text-gray-700">{session.sessionId}</td>
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
              <h3 className="text-lg font-semibold text-gray-900">Transcript for Session {selectedSession.sessionId}</h3>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
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

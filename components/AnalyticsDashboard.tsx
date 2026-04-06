'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type TelemetryEventType = 'login' | 'logout' | 'chat_message' | 'sim_start' | 'sim_complete'

type AnalyticsEvent = {
  id: string
  timestamp: string
  eventType: TelemetryEventType
  userId: string
  userName: string
  cohortName?: string
  metadata?: {
    cohortId?: string
    sessionId?: string
    duration?: number
  }
}

type AnalyticsResponse = {
  summary: {
    totalLogins: number
    messagesSent: number
    avgSimulationDurationSeconds: number
    totalActiveUsers: number
    totalTimeSpentSeconds: number
  }
  eventsPerDay: Array<{ date: string; count: number }>
  events: AnalyticsEvent[]
  users: Array<{ id: string; name: string }>
  cohorts: Array<{ id: string; name: string }>
}

type TranscriptMessage = {
  role: 'student' | 'assistant'
  content: string
  timestamp?: string
}

const EVENT_OPTIONS: Array<{ value: ''; label: string } | { value: TelemetryEventType; label: string }> = [
  { value: '', label: 'All Events' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'chat_message', label: 'Chat Message' },
  { value: 'sim_start', label: 'Simulation Start' },
  { value: 'sim_complete', label: 'Simulation Complete' },
]

const formatSeconds = (seconds: number) => {
  if (!seconds || Number.isNaN(seconds)) return '0m'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

const formatEventType = (value: string) =>
  value
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsResponse | null>(null)

  const [cohortId, setCohortId] = useState('')
  const [userId, setUserId] = useState('')
  const [eventType, setEventType] = useState<TelemetryEventType | ''>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null)
  const [sessionTranscriptLoading, setSessionTranscriptLoading] = useState(false)
  const [sessionTranscriptError, setSessionTranscriptError] = useState<string | null>(null)
  const [sessionTranscriptMessages, setSessionTranscriptMessages] = useState<TranscriptMessage[]>([])

  const fetchAnalytics = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (cohortId) params.set('cohortId', cohortId)
      if (userId) params.set('userId', userId)
      if (eventType) params.set('eventType', eventType)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/admin/analytics?${params.toString()}`)
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || `Status ${res.status}`)
      }
      const json = (await res.json()) as AnalyticsResponse
      setData(json)
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId, userId, eventType, startDate, endDate])

  const kpis = useMemo(() => {
    const summary = data?.summary
    return [
      { label: 'Total Logins', value: String(summary?.totalLogins ?? 0) },
      { label: 'Messages Sent', value: String(summary?.messagesSent ?? 0) },
      { label: 'Avg Simulation Duration', value: formatSeconds(summary?.avgSimulationDurationSeconds ?? 0) },
      { label: 'Total Active Users', value: String(summary?.totalActiveUsers ?? 0) },
      { label: 'Total Time Spent', value: formatSeconds(summary?.totalTimeSpentSeconds ?? 0) },
    ]
  }, [data])

  const sessionGroups = useMemo(() => {
    if (!data?.events?.length) return []
    const grouped = new Map<
      string,
      {
        date: string
        sessionId: string
        userName: string
        cohortName: string
        count: number
        events: AnalyticsEvent[]
      }
    >()

    for (const event of data.events) {
      const sessionId = event.metadata?.sessionId
      if (!sessionId) continue
      const date = event.timestamp.slice(0, 10)
      const key = `${date}::${sessionId}`
      const existing = grouped.get(key)
      if (existing) {
        existing.count += 1
        existing.events.push(event)
      } else {
        grouped.set(key, {
          date,
          sessionId,
          userName: event.userName || event.userId,
          cohortName: event.cohortName || '-',
          count: 1,
          events: [event],
        })
      }
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        events: [...group.events].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        ),
      }))
      .sort((a, b) => {
        const aTime = new Date(a.events[0]?.timestamp || '').getTime()
        const bTime = new Date(b.events[0]?.timestamp || '').getTime()
        return bTime - aTime
      })
  }, [data?.events])

  const selectedSessionGroup = useMemo(() => {
    if (!selectedSessionKey) return null
    return (
      sessionGroups.find((group) => `${group.date}::${group.sessionId}` === selectedSessionKey) ||
      null
    )
  }, [selectedSessionKey, sessionGroups])

  useEffect(() => {
    const run = async () => {
      if (!selectedSessionGroup) {
        setSessionTranscriptMessages([])
        setSessionTranscriptError(null)
        setSessionTranscriptLoading(false)
        return
      }

      const hasChatActivity = selectedSessionGroup.events.some((event) => event.eventType === 'chat_message')
      if (!hasChatActivity) {
        setSessionTranscriptMessages([])
        setSessionTranscriptError(null)
        setSessionTranscriptLoading(false)
        return
      }

      try {
        setSessionTranscriptLoading(true)
        setSessionTranscriptError(null)
        const resp = await fetch(`/api/admin/transcript/${encodeURIComponent(selectedSessionGroup.sessionId)}`)
        const data = await resp.json().catch(() => null)
        if (!resp.ok) throw new Error(data?.error || 'Failed to load transcript')
        setSessionTranscriptMessages(Array.isArray(data?.messages) ? data.messages : [])
      } catch (err: any) {
        setSessionTranscriptError(err?.message || 'Failed to load transcript')
        setSessionTranscriptMessages([])
      } finally {
        setSessionTranscriptLoading(false)
      }
    }

    run()
  }, [selectedSessionGroup])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-gray-900">Advanced Analytics</h2>
        <p className="text-sm text-gray-500">Telemetry events by cohort, student, and event type.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <select
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select Cohort</option>
            {(data?.cohorts || []).map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name}
              </option>
            ))}
          </select>

          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select Student</option>
            {(data?.users || []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>

          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as TelemetryEventType | '')}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {EVENT_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={() => {
              setCohortId('')
              setUserId('')
              setEventType('')
              setStartDate('')
              setEndDate('')
            }}
            className="rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpi.label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Events per Day</h3>
          {loading && <span className="text-sm text-gray-500">Loading...</span>}
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.eventsPerDay || []} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-base font-semibold text-gray-900">Session Activity Breakdown</h3>
        </div>
        <div className="max-h-[360px] overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Session ID</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Student</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Cohort</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Activity Count</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Transactions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    Loading session activity...
                  </td>
                </tr>
              ) : !sessionGroups.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    No session-level activity found for current filters.
                  </td>
                </tr>
              ) : (
                sessionGroups.map((group) => {
                  const key = `${group.date}::${group.sessionId}`
                  return (
                    <tr key={key}>
                      <td className="px-4 py-3 text-gray-700">{group.date}</td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">{group.sessionId}</td>
                      <td className="px-4 py-3 text-gray-700">{group.userName}</td>
                      <td className="px-4 py-3 text-gray-700">{group.cohortName}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{group.count}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedSessionKey(key)}
                          className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                        >
                          View Transactions
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-base font-semibold text-gray-900">Raw Event Feed</h3>
        </div>
        <div className="max-h-[460px] overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date/Time</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">User Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Event Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Cohort</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    Loading events...
                  </td>
                </tr>
              ) : !data?.events?.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    No telemetry events found.
                  </td>
                </tr>
              ) : (
                data.events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-3 text-gray-700">{new Date(event.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-700">{event.userName}</td>
                    <td className="px-4 py-3 text-gray-700">{formatEventType(event.eventType)}</td>
                    <td className="px-4 py-3 text-gray-700">{event.cohortName || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSessionGroup && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelectedSessionKey(null)}
            aria-label="Close session transactions"
          />
          <div className="relative mx-auto mt-16 h-[80vh] w-[94%] max-w-5xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Session Transactions</h3>
                <p className="text-sm text-gray-600">
                  {selectedSessionGroup.date} • {selectedSessionGroup.userName} • {selectedSessionGroup.count} activities
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSessionKey(null)}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50 p-4">
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Date/Time</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Event Type</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">User</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Cohort</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedSessionGroup.events.map((event) => (
                      <tr key={event.id}>
                        <td className="px-4 py-3 text-gray-700">{new Date(event.timestamp).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-700">{formatEventType(event.eventType)}</td>
                        <td className="px-4 py-3 text-gray-700">{event.userName}</td>
                        <td className="px-4 py-3 text-gray-700">{event.cohortName || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedSessionGroup.events.some((event) => event.eventType === 'chat_message') && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-white">
                  <div className="border-b border-gray-200 px-4 py-3">
                    <h4 className="text-sm font-semibold text-gray-900">Full Chat Transcript</h4>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-4 bg-gray-50">
                    {sessionTranscriptLoading && <p className="text-sm text-gray-600">Loading transcript...</p>}
                    {!sessionTranscriptLoading && sessionTranscriptError && (
                      <p className="text-sm text-red-600">{sessionTranscriptError}</p>
                    )}
                    {!sessionTranscriptLoading && !sessionTranscriptError && sessionTranscriptMessages.length === 0 && (
                      <p className="text-sm text-gray-600">No transcript entries found for this session.</p>
                    )}
                    {!sessionTranscriptLoading && !sessionTranscriptError && sessionTranscriptMessages.length > 0 && (
                      <div className="space-y-3">
                        {sessionTranscriptMessages.map((message, index) => {
                          const isStudent = message.role === 'student'
                          return (
                            <div
                              key={`${message.role}-${index}-${message.timestamp || ''}`}
                              className={isStudent ? 'text-right' : 'text-left'}
                            >
                              <div
                                className={`inline-block max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                  isStudent
                                    ? 'bg-blue-600 text-white rounded-br-md'
                                    : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                                }`}
                              >
                                <div className={`mb-1 text-xs font-semibold ${isStudent ? 'text-blue-100' : 'text-gray-500'}`}>
                                  {isStudent ? 'Student' : 'AI'}
                                  {message.timestamp ? ` • ${new Date(message.timestamp).toLocaleString()}` : ''}
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

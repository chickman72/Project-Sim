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
    </div>
  )
}

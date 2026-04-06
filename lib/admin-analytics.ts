import type { SqlParameter } from '@azure/cosmos'
import { getLogsContainer, getSetupsContainer, getTelemetryContainer } from './cosmos'
import { listUsers } from './user'
import { getCohortsContainer, type Cohort } from './cohort'
import type { TelemetryEvent, TelemetryEventType } from './telemetry'

export type AnalyticsFilters = {
  eventType?: TelemetryEventType | ''
  userId?: string
  cohortId?: string
  startDate?: string
  endDate?: string
}

type EnrichedTelemetryEvent = TelemetryEvent & {
  userName: string
  userEmail?: string
  cohortId?: string
  cohortName?: string
}

type SeriesPoint = {
  date: string
  count: number
}

type AnalyticsSummary = {
  totalLogins: number
  messagesSent: number
  avgSimulationDurationSeconds: number
  totalActiveUsers: number
  totalTimeSpentSeconds: number
}

export type AdminAnalyticsResult = {
  summary: AnalyticsSummary
  eventsPerDay: SeriesPoint[]
  events: EnrichedTelemetryEvent[]
  users: Array<{ id: string; name: string }>
  cohorts: Array<{ id: string; name: string }>
}

const isoDay = (value: string) => value.slice(0, 10)

const parseMs = (value?: string) => {
  if (!value) return NaN
  return Date.parse(value)
}

const loadCohorts = async (): Promise<Cohort[]> => {
  const container = await getCohortsContainer()
  const { resources } = await container.items.query('SELECT * FROM c').fetchAll()
  return resources as Cohort[]
}

const loadSessionScenarioMap = async (sessionIds: string[]): Promise<Map<string, string>> => {
  const result = new Map<string, string>()
  if (!sessionIds.length) return result

  const logsContainer = await getLogsContainer()
  const lookups = sessionIds.map(async (sessionId) => {
    try {
      const { resources } = await logsContainer.items
        .query<{ scenarioId?: string }>({
          query:
            'SELECT TOP 1 c.scenarioId FROM c WHERE c.sessionId = @sessionId AND IS_DEFINED(c.scenarioId) AND c.scenarioId != "" ORDER BY c.timestamp DESC',
          parameters: [{ name: '@sessionId', value: sessionId }],
        })
        .fetchAll()

      const scenarioId = resources?.[0]?.scenarioId
      if (typeof scenarioId === 'string' && scenarioId) {
        result.set(sessionId, scenarioId)
      }
    } catch {
      // Ignore lookup failures for individual sessions.
    }
  })

  await Promise.all(lookups)
  return result
}

const loadScenarioCohortMap = async (): Promise<Map<string, string>> => {
  const result = new Map<string, string>()
  const setupsContainer = await getSetupsContainer()
  const { resources } = await setupsContainer.items
    .query<{ code?: string; assignedCohortId?: string }>({
      query: 'SELECT c.code, c.assignedCohortId FROM c WHERE IS_DEFINED(c.code)',
    })
    .fetchAll()

  for (const row of resources || []) {
    if (typeof row.code === 'string' && typeof row.assignedCohortId === 'string' && row.assignedCohortId) {
      result.set(row.code, row.assignedCohortId)
    }
  }

  return result
}

type LegacyAuditRecord = {
  id: string
  timestamp?: string
  eventType?: string
  userId?: string | null
  sessionId?: string | null
  completionStatus?: 'in-progress' | 'completed' | 'abandoned' | 'timeout'
  sessionDurationSeconds?: number
}

const getTelemetryStartTimestamp = async (): Promise<string | undefined> => {
  const telemetryContainer = await getTelemetryContainer()
  const { resources } = await telemetryContainer.items
    .query<{ timestamp?: string }>({
      query: 'SELECT TOP 1 c.timestamp FROM c ORDER BY c.timestamp ASC',
    })
    .fetchAll()
  const ts = resources?.[0]?.timestamp
  return typeof ts === 'string' ? ts : undefined
}

const normalizeLegacyEventType = (
  record: LegacyAuditRecord
): { eventType: TelemetryEventType; duration?: number } | null => {
  if (record.eventType === 'login') return { eventType: 'login' }
  if (record.eventType === 'logout') return { eventType: 'logout' }
  if (record.eventType === 'chat') return { eventType: 'chat_message' }
  if (record.eventType === 'session_state') {
    if (record.completionStatus === 'in-progress' && (record.sessionDurationSeconds ?? 0) === 0) {
      return { eventType: 'sim_start' }
    }
    if (record.completionStatus === 'completed') {
      return {
        eventType: 'sim_complete',
        ...(typeof record.sessionDurationSeconds === 'number'
          ? { duration: record.sessionDurationSeconds }
          : {}),
      }
    }
  }
  return null
}

const loadLegacyTelemetryEvents = async (
  filters: AnalyticsFilters,
  telemetryStartTimestamp?: string
): Promise<TelemetryEvent[]> => {
  const logsContainer = await getLogsContainer()

  const where: string[] = []
  const parameters: SqlParameter[] = []

  where.push('c.eventType IN (@login, @logout, @chat, @sessionState)')
  parameters.push({ name: '@login', value: 'login' })
  parameters.push({ name: '@logout', value: 'logout' })
  parameters.push({ name: '@chat', value: 'chat' })
  parameters.push({ name: '@sessionState', value: 'session_state' })

  if (filters.userId) {
    where.push('c.userId = @userId')
    parameters.push({ name: '@userId', value: filters.userId })
  }
  if (filters.startDate) {
    where.push('c.timestamp >= @startDate')
    parameters.push({ name: '@startDate', value: new Date(filters.startDate).toISOString() })
  }
  if (filters.endDate) {
    const end = new Date(filters.endDate)
    end.setHours(23, 59, 59, 999)
    where.push('c.timestamp <= @endDate')
    parameters.push({ name: '@endDate', value: end.toISOString() })
  }
  if (telemetryStartTimestamp) {
    // Avoid double-counting now that telemetry events are recorded in a dedicated container.
    where.push('c.timestamp < @telemetryStart')
    parameters.push({ name: '@telemetryStart', value: telemetryStartTimestamp })
  }

  const query = `SELECT * FROM c WHERE ${where.join(' AND ')} ORDER BY c.timestamp DESC`
  const { resources } = await logsContainer.items.query<LegacyAuditRecord>({ query, parameters }).fetchAll()

  const mapped: TelemetryEvent[] = []
  for (const record of resources || []) {
    if (!record || !record.userId || record.userId === 'GLOBAL') continue
    if (!record.timestamp) continue

    const normalized = normalizeLegacyEventType(record)
    if (!normalized) continue
    if (filters.eventType && normalized.eventType !== filters.eventType) continue

    mapped.push({
      id: `legacy-${record.id}`,
      userId: String(record.userId),
      eventType: normalized.eventType,
      timestamp: record.timestamp,
      metadata: {
        ...(record.sessionId && record.sessionId !== 'GLOBAL' ? { sessionId: String(record.sessionId) } : {}),
        ...(typeof normalized.duration === 'number' ? { duration: normalized.duration } : {}),
      },
    })
  }

  return mapped
}

export const getAdminAnalytics = async (filters: AnalyticsFilters): Promise<AdminAnalyticsResult> => {
  const telemetryContainer = await getTelemetryContainer()

  const where: string[] = []
  const parameters: SqlParameter[] = []

  if (filters.eventType) {
    where.push('c.eventType = @eventType')
    parameters.push({ name: '@eventType', value: filters.eventType })
  }
  if (filters.userId) {
    where.push('c.userId = @userId')
    parameters.push({ name: '@userId', value: filters.userId })
  }
  if (filters.startDate) {
    where.push('c.timestamp >= @startDate')
    parameters.push({ name: '@startDate', value: new Date(filters.startDate).toISOString() })
  }
  if (filters.endDate) {
    const end = new Date(filters.endDate)
    end.setHours(23, 59, 59, 999)
    where.push('c.timestamp <= @endDate')
    parameters.push({ name: '@endDate', value: end.toISOString() })
  }

  const query = `SELECT * FROM c${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY c.timestamp DESC`
  const { resources } = await telemetryContainer.items.query({ query, parameters }).fetchAll()
  const rawTelemetryEvents = (resources || []) as TelemetryEvent[]
  const telemetryStartTimestamp = await getTelemetryStartTimestamp()
  const legacyEvents = await loadLegacyTelemetryEvents(filters, telemetryStartTimestamp)
  const rawEvents = [...rawTelemetryEvents, ...legacyEvents]

  const sessionIds = Array.from(
    new Set(rawEvents.map((event) => event.metadata?.sessionId).filter((value): value is string => typeof value === 'string' && value.length > 0))
  )

  const [users, cohorts, sessionScenarioMap, scenarioCohortMap] = await Promise.all([
    listUsers(),
    loadCohorts(),
    loadSessionScenarioMap(sessionIds),
    loadScenarioCohortMap(),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const cohortById = new Map(cohorts.map((c) => [c.id, c]))

  let events = rawEvents.map((event) => {
    const user = userById.get(event.userId)
    const sessionId = event.metadata?.sessionId
    const scenarioId = sessionId ? sessionScenarioMap.get(sessionId) : undefined
    const cohortId = scenarioId ? scenarioCohortMap.get(scenarioId) : undefined
    const cohort = cohortId ? cohortById.get(cohortId) : undefined
    return {
      ...event,
      userName: user?.username || event.userId,
      userEmail: user?.email,
      cohortId,
      cohortName: cohort?.name
    } as EnrichedTelemetryEvent
  })

  if (filters.cohortId) {
    events = events.filter((event) => event.cohortId === filters.cohortId)
  }

  events.sort((a, b) => {
    const am = parseMs(a.timestamp)
    const bm = parseMs(b.timestamp)
    if (Number.isNaN(am) && Number.isNaN(bm)) return 0
    if (Number.isNaN(am)) return 1
    if (Number.isNaN(bm)) return -1
    return bm - am
  })

  const activeUserIds = new Set(events.map((event) => event.userId))
  const totalLogins = events.filter((event) => event.eventType === 'login').length
  const messagesSent = events.filter((event) => event.eventType === 'chat_message').length
  const simCompletions = events.filter((event) => event.eventType === 'sim_complete')
  const avgSimulationDurationSeconds =
    simCompletions.length > 0
      ? Math.round(
          simCompletions.reduce((sum, event) => sum + (event.metadata?.duration || 0), 0) / simCompletions.length
        )
      : 0

  const dayCounts = new Map<string, number>()
  events.forEach((event) => {
    const day = isoDay(event.timestamp)
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1)
  })
  const eventsPerDay = Array.from(dayCounts.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, count]) => ({ date, count }))

  const ascending = [...events].sort((a, b) => {
    const am = parseMs(a.timestamp)
    const bm = parseMs(b.timestamp)
    if (Number.isNaN(am) && Number.isNaN(bm)) return 0
    if (Number.isNaN(am)) return -1
    if (Number.isNaN(bm)) return 1
    return am - bm
  })

  const loginStartedAtByUser = new Map<string, number>()
  const simStartedAtBySession = new Map<string, number>()
  const loginDurationByUser = new Map<string, number>()
  const simDurationByUser = new Map<string, number>()

  ascending.forEach((event) => {
    const t = parseMs(event.timestamp)
    if (Number.isNaN(t)) return

    if (event.eventType === 'login') {
      loginStartedAtByUser.set(event.userId, t)
      return
    }

    if (event.eventType === 'logout') {
      const start = loginStartedAtByUser.get(event.userId)
      if (typeof start === 'number' && t >= start) {
        const seconds = Math.floor((t - start) / 1000)
        loginDurationByUser.set(event.userId, (loginDurationByUser.get(event.userId) || 0) + seconds)
      }
      loginStartedAtByUser.delete(event.userId)
      return
    }

    if (event.eventType === 'sim_start') {
      const sid = event.metadata?.sessionId
      if (sid) simStartedAtBySession.set(sid, t)
      return
    }

    if (event.eventType === 'sim_complete') {
      const explicitDuration = event.metadata?.duration
      if (typeof explicitDuration === 'number' && explicitDuration >= 0) {
        simDurationByUser.set(event.userId, (simDurationByUser.get(event.userId) || 0) + Math.floor(explicitDuration))
        return
      }
      const sid = event.metadata?.sessionId
      if (!sid) return
      const start = simStartedAtBySession.get(sid)
      if (typeof start === 'number' && t >= start) {
        const seconds = Math.floor((t - start) / 1000)
        simDurationByUser.set(event.userId, (simDurationByUser.get(event.userId) || 0) + seconds)
      }
      simStartedAtBySession.delete(sid)
    }
  })

  let totalTimeSpentSeconds = 0
  activeUserIds.forEach((userId) => {
    const loginDuration = loginDurationByUser.get(userId) || 0
    const simDuration = simDurationByUser.get(userId) || 0
    totalTimeSpentSeconds += loginDuration > 0 ? loginDuration : simDuration
  })

  return {
    summary: {
      totalLogins,
      messagesSent,
      avgSimulationDurationSeconds,
      totalActiveUsers: activeUserIds.size,
      totalTimeSpentSeconds
    },
    eventsPerDay,
    events,
    users: users.map((u) => ({ id: u.id, name: u.username })),
    cohorts: cohorts.map((c) => ({ id: c.id, name: c.name }))
  }
}

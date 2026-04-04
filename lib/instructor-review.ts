import { getCohortsByInstructor } from './cohort'
import { getLogsContainer, getSetupsContainer } from './cosmos'
import { getUserById } from './user'

export type NeedsReviewStatus = 'in-progress' | 'completed' | 'abandoned' | 'timeout'

export type NeedsReviewRow = {
  sessionId: string
  date: string
  studentId: string
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
}

export type NeedsReviewFilters = {
  cohortId?: string
  simulationCode?: string
}

type CohortRecord = {
  id: string
  name: string
  studentIds: string[]
}

type SetupRecord = {
  code: string
  title?: string
  assignedCohortId?: string
}

type SessionStateRecord = {
  sessionId?: string
  userId?: string
  scenarioId?: string
  completionStatus?: NeedsReviewStatus
  sessionDurationSeconds?: number
  timestamp?: string
}

type StudentInfo = {
  name: string
  email: string
}

const LOW_DURATION_SECONDS = 120

export const getNeedsReviewDataForInstructor = async (
  instructorId: string,
  filters: NeedsReviewFilters = {}
): Promise<{ rows: NeedsReviewRow[]; cohorts: Array<{ id: string; name: string }>; simulations: Array<{ code: string; name: string }> }> => {
  const cohortsRaw = await getCohortsByInstructor(instructorId)
  const cohorts: CohortRecord[] = cohortsRaw.map((cohort) => ({
    id: cohort.id,
    name: cohort.name,
    studentIds: cohort.studentIds || [],
  }))

  if (cohorts.length === 0) {
    return { rows: [], cohorts: [], simulations: [] }
  }

  const cohortById = new Map(cohorts.map((cohort) => [cohort.id, cohort]))

  const setupsContainer = await getSetupsContainer()
  const { resources: setupResources } = await setupsContainer.items
    .query<SetupRecord>('SELECT c.code, c.title, c.assignedCohortId FROM c WHERE IS_DEFINED(c.assignedCohortId)')
    .fetchAll()

  const cohortSimulationMap = new Map<string, SetupRecord[]>()
  for (const setup of setupResources) {
    if (!setup.assignedCohortId) continue
    if (!cohortById.has(setup.assignedCohortId)) continue
    const current = cohortSimulationMap.get(setup.assignedCohortId) || []
    current.push(setup)
    cohortSimulationMap.set(setup.assignedCohortId, current)
  }

  const studentIds = Array.from(new Set(cohorts.flatMap((cohort) => cohort.studentIds || [])))
  const scenarioCodes = Array.from(
    new Set(
      Array.from(cohortSimulationMap.values())
        .flat()
        .map((setup) => setup.code)
        .filter((code): code is string => typeof code === 'string' && code.length > 0)
    )
  )

  if (studentIds.length === 0 || scenarioCodes.length === 0) {
    return {
      rows: [],
      cohorts: cohorts.map((cohort) => ({ id: cohort.id, name: cohort.name })),
      simulations: scenarioCodes.map((code) => ({
        code,
        name: setupResources.find((s) => s.code === code)?.title || code,
      })),
    }
  }

  const logsContainer = await getLogsContainer()
  const { resources: sessionRows } = await logsContainer.items.query<SessionStateRecord>({
    query:
      'SELECT c.sessionId, c.userId, c.scenarioId, c.completionStatus, c.sessionDurationSeconds, c.timestamp FROM c WHERE c.eventType = @eventType AND ARRAY_CONTAINS(@studentIds, c.userId) AND ARRAY_CONTAINS(@scenarioIds, c.scenarioId)',
    parameters: [
      { name: '@eventType', value: 'session_state' },
      { name: '@studentIds', value: studentIds },
      { name: '@scenarioIds', value: scenarioCodes },
    ],
  }).fetchAll()

  const latestBySession = new Map<string, SessionStateRecord>()
  for (const row of sessionRows) {
    if (!row.sessionId || row.sessionId === 'GLOBAL') continue
    const existing = latestBySession.get(row.sessionId)
    const rowTime = new Date(row.timestamp || '').getTime()
    const existingTime = new Date(existing?.timestamp || '').getTime()
    if (!existing || rowTime > existingTime) {
      latestBySession.set(row.sessionId, row)
    }
  }

  const studentInfoMap = new Map<string, StudentInfo>()
  await Promise.all(
    studentIds.map(async (studentId) => {
      const user = await getUserById(studentId)
      studentInfoMap.set(studentId, {
        name: user?.username || studentId,
        email: user?.email || '-',
      })
    })
  )

  const setupByCode = new Map<string, SetupRecord>()
  for (const setup of setupResources) {
    setupByCode.set(setup.code, setup)
  }

  let rows: NeedsReviewRow[] = Array.from(latestBySession.values())
    .filter((row) => !!row.userId && !!row.scenarioId && !!row.completionStatus && !!row.sessionId)
    .map((row) => {
      const setup = setupByCode.get(row.scenarioId as string)
      const cohortId = setup?.assignedCohortId as string
      const cohort = cohortById.get(cohortId)
      const student = studentInfoMap.get(row.userId as string)
      const status = row.completionStatus as NeedsReviewStatus
      const duration = typeof row.sessionDurationSeconds === 'number' ? row.sessionDurationSeconds : undefined

      const abandonedOrTimeout = status === 'abandoned' || status === 'timeout'
      const lowDuration = status === 'completed' && typeof duration === 'number' && duration < LOW_DURATION_SECONDS

      const flagType: NeedsReviewRow['flagType'] = abandonedOrTimeout
        ? 'abandoned_or_timeout'
        : lowDuration
          ? 'low_duration'
          : 'none'

      return {
        sessionId: row.sessionId as string,
        date: row.timestamp || new Date().toISOString(),
        studentId: row.userId as string,
        studentName: student?.name || (row.userId as string),
        studentEmail: student?.email || '-',
        simulationCode: row.scenarioId as string,
        simulationName: setup?.title || (row.scenarioId as string),
        status,
        durationSeconds: duration,
        cohortId,
        cohortName: cohort?.name || 'Unknown Cohort',
        flagType,
        isFlagged: flagType !== 'none',
      }
    })
    .filter((row) => !!row.cohortId)

  if (filters.cohortId) {
    rows = rows.filter((row) => row.cohortId === filters.cohortId)
  }

  if (filters.simulationCode) {
    rows = rows.filter((row) => row.simulationCode === filters.simulationCode)
  }

  rows.sort((a, b) => {
    const aPriority = a.flagType === 'abandoned_or_timeout' ? 2 : a.flagType === 'low_duration' ? 1 : 0
    const bPriority = b.flagType === 'abandoned_or_timeout' ? 2 : b.flagType === 'low_duration' ? 1 : 0
    if (aPriority !== bPriority) return bPriority - aPriority
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  const simulations = Array.from(
    new Map(rows.map((row) => [row.simulationCode, { code: row.simulationCode, name: row.simulationName }])).values()
  )

  return {
    rows,
    cohorts: cohorts.map((cohort) => ({ id: cohort.id, name: cohort.name })),
    simulations,
  }
}

export const instructorCanAccessSession = async (instructorId: string, sessionId: string): Promise<boolean> => {
  const data = await getNeedsReviewDataForInstructor(instructorId)
  return data.rows.some((row) => row.sessionId === sessionId)
}

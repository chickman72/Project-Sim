import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { getCohortsByStudent } from '../../../lib/cohort'
import { getLogsContainer, getSetupsContainer } from '../../../lib/cosmos'

type Assignment = {
  id: string
  code: string
  title: string
  description: string
  assignedCohortId?: string
  visibility?: 'global' | 'cohort' | 'private'
  isPracticeMode?: boolean
  isGlobal: boolean
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || session.role !== 'Student') {
    return res.status(403).json({ error: 'Forbidden. Students only.' })
  }

  try {
    const cohorts = await getCohortsByStudent(session.userId)
    const cohortIds = new Set(cohorts.map((cohort) => cohort.id))

    const logsContainer = await getLogsContainer()
    const { resources: sessionStateRows } = await logsContainer.items.query<{
      scenarioId?: string
      completionStatus?: 'in-progress' | 'completed' | 'abandoned' | 'timeout'
      timestamp?: string
    }>(
      {
        query:
          'SELECT c.scenarioId, c.completionStatus, c.timestamp FROM c WHERE c.userId = @userId AND c.eventType = @eventType AND IS_DEFINED(c.scenarioId)',
        parameters: [
          { name: '@userId', value: session.userId },
          { name: '@eventType', value: 'session_state' },
        ],
      }
    ).fetchAll()

    const latestByScenario = new Map<string, { completionStatus?: string; timestamp?: string }>()
    for (const row of sessionStateRows) {
      const scenarioId = typeof row.scenarioId === 'string' ? row.scenarioId : ''
      if (!scenarioId) continue
      const existing = latestByScenario.get(scenarioId)
      const rowTime = new Date(row.timestamp || '').getTime()
      const existingTime = new Date(existing?.timestamp || '').getTime()
      if (!existing || rowTime > existingTime) {
        latestByScenario.set(scenarioId, {
          completionStatus: row.completionStatus,
          timestamp: row.timestamp,
        })
      }
    }

    const completedScenarioIds = new Set(
      Array.from(latestByScenario.entries())
        .filter(([, value]) => value.completionStatus === 'completed')
        .map(([scenarioId]) => scenarioId)
    )

    const setupsContainer = await getSetupsContainer()
    const { resources } = await setupsContainer.items
      .query<Assignment>('SELECT c.id, c.code, c.title, c.description, c.assignedCohortId, c.visibility, c.isPracticeMode FROM c')
      .fetchAll()

    const activeAssignments = resources
      .filter((sim) => {
        const visibility = sim.visibility || (sim.assignedCohortId ? 'cohort' : 'global')
        const accessible =
          visibility === 'global'
            ? true
            : visibility === 'cohort'
              ? !!sim.assignedCohortId && cohortIds.has(sim.assignedCohortId)
              : false // private simulations remain hidden until explicitly assigned
        if (!accessible) return false
        if (sim.isPracticeMode) return true
        return !completedScenarioIds.has(sim.code)
      })
      .map((sim) => ({
        visibility: sim.visibility || (sim.assignedCohortId ? 'cohort' : 'global'),
        id: sim.id,
        code: sim.code,
        title: sim.title || 'Untitled Scenario',
        description: sim.description || 'No description provided.',
        assignedCohortId: sim.assignedCohortId,
        isPracticeMode: Boolean(sim.isPracticeMode),
        isGlobal: (sim.visibility || (sim.assignedCohortId ? 'cohort' : 'global')) === 'global',
      }))

    return res.status(200).json(activeAssignments)
  } catch (error: any) {
    console.error('Student assignments fetch error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

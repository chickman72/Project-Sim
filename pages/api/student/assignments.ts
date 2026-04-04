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
    const { resources: completedRows } = await logsContainer.items.query<{ scenarioId?: string }>(
      {
        query:
          'SELECT c.scenarioId FROM c WHERE c.userId = @userId AND c.eventType = @eventType AND c.completionStatus = @status AND IS_DEFINED(c.scenarioId)',
        parameters: [
          { name: '@userId', value: session.userId },
          { name: '@eventType', value: 'session_state' },
          { name: '@status', value: 'completed' },
        ],
      }
    ).fetchAll()

    const completedScenarioIds = new Set(
      completedRows
        .map((row) => row.scenarioId)
        .filter((scenarioId): scenarioId is string => typeof scenarioId === 'string' && scenarioId.length > 0)
    )

    const setupsContainer = await getSetupsContainer()
    const { resources } = await setupsContainer.items
      .query<Assignment>('SELECT c.id, c.code, c.title, c.description, c.assignedCohortId, c.visibility FROM c')
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
        return !completedScenarioIds.has(sim.code)
      })
      .map((sim) => ({
        visibility: sim.visibility || (sim.assignedCohortId ? 'cohort' : 'global'),
        id: sim.id,
        code: sim.code,
        title: sim.title || 'Untitled Scenario',
        description: sim.description || 'No description provided.',
        assignedCohortId: sim.assignedCohortId,
        isGlobal: (sim.visibility || (sim.assignedCohortId ? 'cohort' : 'global')) === 'global',
      }))

    return res.status(200).json(activeAssignments)
  } catch (error: any) {
    console.error('Student assignments fetch error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

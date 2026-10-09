import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { getCohortsByInstructor } from '../../../lib/cohort'
import { getSetupsContainer } from '../../../lib/cosmos'

type CohortScenario = {
  code: string
  title?: string
  assignedCohortId?: string
  visibility?: 'global' | 'cohort' | 'private'
  isEnabled?: boolean
  userId?: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const session = verifySessionToken(req.cookies?.[getSessionCookieName()])
  if (!session || (session.role !== 'Instructor' && session.role !== 'Administrator')) {
    return res.status(403).json({ error: 'Access denied. Instructor or Administrator role required.' })
  }

  try {
    const cohorts = await getCohortsByInstructor(session.userId)
    const manageableCohortIds = new Set(cohorts.map((cohort) => cohort.id))
    if (manageableCohortIds.size === 0) return res.status(200).json([])

    const container = await getSetupsContainer()
    const { resources } = await container.items
      .query<CohortScenario>('SELECT c.code, c.title, c.assignedCohortId, c.visibility, c.isEnabled, c.userId FROM c')
      .fetchAll()

    return res.status(200).json(
      resources.filter(
        (scenario) =>
          (scenario.visibility || (scenario.assignedCohortId ? 'cohort' : 'global')) === 'cohort' &&
          typeof scenario.assignedCohortId === 'string' &&
          manageableCohortIds.has(scenario.assignedCohortId),
      ).map((scenario) => ({
        code: scenario.code,
        title: scenario.title,
        assignedCohortId: scenario.assignedCohortId,
        visibility: scenario.visibility,
        isEnabled: scenario.isEnabled,
        canEdit: scenario.userId === session.userId,
      })),
    )
  } catch (error: any) {
    console.error('Cohort scenario lookup error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

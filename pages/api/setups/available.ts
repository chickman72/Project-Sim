import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { getCohortsByStudent } from '../../../lib/cohort'
import { getSetupsContainer } from '../../../lib/cosmos'

interface AvailableSimulation {
  id: string
  code: string
  title: string
  description: string
  assignedCohortId?: string
  visibility?: 'global' | 'cohort' | 'private'
  isGlobal: boolean
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)

  if (!session || session.role !== 'Student') {
    return res.status(403).json({ error: 'Forbidden. Students only.' })
  }

  if (req.method === 'GET') {
    try {
      // Get student's cohorts
      const cohorts = await getCohortsByStudent(session.userId)
      const cohortIds = new Set(cohorts.map(c => c.id))

      // Get all simulations
      const container = await getSetupsContainer()
      const { resources: allSetups } = await container.items
        .query('SELECT c.id, c.code, c.title, c.description, c.assignedCohortId, c.visibility FROM c')
        .fetchAll()

      // Filter simulations:
      // 1. Global simulations (no assignedCohortId)
      // 2. Simulations assigned to student's cohorts
      const availableSimulations: AvailableSimulation[] = (allSetups as any[])
        .filter(sim => {
          const visibility = sim.visibility || (sim.assignedCohortId ? 'cohort' : 'global')
          if (visibility === 'private') {
            return false
          }
          if (visibility === 'global') {
            // Global simulation
            return true
          }
          // Assigned to a cohort - check if student is in that cohort
          return !!sim.assignedCohortId && cohortIds.has(sim.assignedCohortId)
        })
        .map(sim => ({
          id: sim.id,
          code: sim.code,
          title: sim.title || 'Untitled',
          description: sim.description || '',
          visibility: sim.visibility || (sim.assignedCohortId ? 'cohort' : 'global'),
          assignedCohortId: sim.assignedCohortId,
          isGlobal: (sim.visibility || (sim.assignedCohortId ? 'cohort' : 'global')) === 'global'
        }))

      return res.status(200).json(availableSimulations)
    } catch (error: any) {
      console.error('Available simulations fetch error:', error)
      return res.status(500).json({ error: error.message || 'Internal server error' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

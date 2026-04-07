import type { NextApiRequest, NextApiResponse } from 'next'
import { getSetupsContainer, getUsersContainer } from '../../../lib/cosmos'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { logAdminAction } from '../../../lib/audit-log'

interface Simulation {
  id: string
  code: string
  title: string
  description: string
  prompt: string
  userId: string
  updatedAt: string
  username?: string
  assignedCohortId?: string
  isPracticeMode?: boolean
  patientVoice?: string
  conversationStarters?: string[]
  rubric?: Array<{ id: string; name: string; successCondition: string }>
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)

  if (!session || session.role !== 'Administrator') {
    return res.status(403).json({ error: 'Access denied. Administrator role required.' })
  }

  try {
    if (req.method === 'GET') {
      // Get all simulations
      const setupsContainer = await getSetupsContainer()
      const usersContainer = await getUsersContainer()

    if (req.method === 'GET') {
      // Get all simulations
      const setupsContainer = await getSetupsContainer()
      const usersContainer = await getUsersContainer()

      // Get all setups
      const querySpec = {
        query: 'SELECT c.id, c.code, c.title, c.description, c.prompt, c.userId, c.updatedAt, c.assignedCohortId, c.isPracticeMode, c.patientVoice, c.conversationStarters, c.rubric FROM c',
        parameters: []
      }
      const { resources: setups } = await setupsContainer.items.query(querySpec).fetchAll()

      // Get all users to map userId to username
      const userQuerySpec = {
        query: 'SELECT c.id, c.username FROM c',
        parameters: []
      }
      const { resources: users } = await usersContainer.items.query(userQuerySpec).fetchAll()
      
      const userMap = new Map(users.map((user: any) => [user.id, user.username]))

      // Combine setups with usernames
      const simulations: Simulation[] = setups.map((setup: any) => ({
        ...setup,
        username: userMap.get(setup.userId) || setup.userId
      }))

      return res.status(200).json(simulations)
    }
    }

    if (req.method === 'DELETE') {
      const { code } = req.query
      if (typeof code !== 'string') {
        return res.status(400).json({ error: 'Invalid code' })
      }

      const container = await getSetupsContainer()

      // Read the setup first to get details for logging
      let existingSetup = null
      try {
        const { resource } = await container.item(code, code).read()
        existingSetup = resource
      } catch (error: any) {
        if (error.code === 404) return res.status(404).json({ error: 'Simulation not found' })
        throw error
      }

      // Delete the setup
      await container.item(code, code).delete()
      
      // Log the admin action after successful deletion
      await logAdminAction(session.userId, 'DELETE_SIM', code, {
        title: existingSetup?.title,
        description: existingSetup?.description,
        deletedAt: new Date().toISOString()
      })

      return res.status(200).json({ success: true })
    }

    return res.status(405).end()
  } catch (error: any) {
    console.error('API /admin/simulations error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

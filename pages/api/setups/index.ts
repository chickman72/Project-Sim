import type { NextApiRequest, NextApiResponse } from 'next'
import { getSetupsContainer } from '../../../lib/cosmos'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  try {
    const container = await getSetupsContainer()

    if (req.method === 'GET') {
      // Get all setups for the current user
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: session.userId }]
      }
      const { resources } = await container.items.query(querySpec).fetchAll()
      return res.status(200).json(resources)
    }

    if (req.method === 'POST') {
      // Create or update a setup
      const { code, title, description, prompt } = req.body
      if (!code || !prompt) {
        return res.status(400).json({ error: 'code and prompt are required' })
      }

      const itemToInsert = {
        id: code, // Cosmos DB uses 'id' natively
        code,
        title,
        description,
        prompt,
        userId: session.userId,
        updatedAt: new Date().toISOString()
      }

      const { resource } = await container.items.upsert(itemToInsert)
      return res.status(200).json(resource)
    }

    return res.status(405).end()
  } catch (error: any) {
    console.error('API /setups error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

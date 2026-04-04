import type { NextApiRequest, NextApiResponse } from 'next'
import { getSetupsContainer } from '../../../lib/cosmos'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { logAdminAction } from '../../../lib/audit-log'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query
  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Invalid code' })
  }

  try {
    const container = await getSetupsContainer()

    if (req.method === 'GET') {
      // Anyone can fetch a setup by code (students need this)
      try {
        const { resource } = await container.item(code, code).read()
        if (!resource) {
          return res.status(404).json({ error: 'Setup not found' })
        }
        // Return only what the student needs
        return res.status(200).json({
          code: resource.code,
          title: resource.title,
          description: resource.description,
          prompt: resource.prompt
        })
      } catch (error: any) {
        if (error.code === 404) return res.status(404).json({ error: 'Setup not found' })
        throw error
      }
    }

    if (req.method === 'DELETE') {
      // Only authenticated users (instructors) can delete
      const token = req.cookies?.[getSessionCookieName()]
      const session = verifySessionToken(token)
      if (!session) {
        return res.status(401).json({ error: 'Not authenticated' })
      }

      const container = await getSetupsContainer()
      
      // Read the setup first to get details for logging
      let existingSetup = null
      try {
        const { resource } = await container.item(code, code).read()
        existingSetup = resource
      } catch (error: any) {
        if (error.code === 404) return res.status(404).json({ error: 'Setup not found' })
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
    console.error(`API /setups/${code} error:`, error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

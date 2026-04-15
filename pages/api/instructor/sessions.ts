import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { getLogsContainer } from '../../../lib/cosmos'
import { instructorCanAccessSession } from '../../../lib/instructor-review'

type DeleteSessionsResponse = {
  deletedSessions: number
  deletedRecords: number
  denied: string[]
  failed: string[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<DeleteSessionsResponse | { error: string }>) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || (session.role !== 'Instructor' && session.role !== 'Administrator')) {
    return res.status(403).json({ error: 'Forbidden. Instructor or Administrator required.' })
  }

  const incomingIds = Array.isArray(req.body?.sessionIds) ? req.body.sessionIds : []
  const sessionIds: string[] = Array.from(
    new Set(
      incomingIds
        .map((value: unknown) => String(value || '').trim())
        .filter((value: string) => value.length > 0),
    ),
  )

  if (sessionIds.length === 0) {
    return res.status(400).json({ error: 'sessionIds is required and must contain at least one id' })
  }

  try {
    const logsContainer = await getLogsContainer()
    const denied: string[] = []
    const failed: string[] = []
    let deletedSessions = 0
    let deletedRecords = 0

    for (const sessionId of sessionIds) {
      const canAccess = await instructorCanAccessSession(session.userId, sessionId)
      if (!canAccess) {
        denied.push(sessionId)
        continue
      }

      try {
        const { resources } = await logsContainer.items.query<{ id: string }>({
          query: 'SELECT c.id FROM c WHERE c.sessionId = @sessionId',
          parameters: [{ name: '@sessionId', value: sessionId }],
        }).fetchAll()

        await Promise.all(resources.map((item) => logsContainer.item(item.id, sessionId).delete()))
        deletedSessions += 1
        deletedRecords += resources.length
      } catch (error) {
        console.error(`Failed deleting session ${sessionId}:`, error)
        failed.push(sessionId)
      }
    }

    return res.status(200).json({
      deletedSessions,
      deletedRecords,
      denied,
      failed,
    })
  } catch (error: any) {
    console.error('Instructor bulk delete sessions API error:', error)
    return res.status(500).json({ error: error?.message || 'Internal server error' })
  }
}

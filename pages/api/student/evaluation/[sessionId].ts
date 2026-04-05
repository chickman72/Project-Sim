import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../../lib/auth'
import { getLatestSessionStateDoc } from '../../../../lib/evaluation'
import { getLogsContainer } from '../../../../lib/cosmos'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || session.role !== 'Student') {
    return res.status(403).json({ error: 'Forbidden. Students only.' })
  }

  const { sessionId } = req.query
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return res.status(400).json({ error: 'Invalid sessionId' })
  }

  try {
    const container = await getLogsContainer()
    const { resources } = await container.items.query<{ sessionId?: string; userId?: string }>({
      query:
        'SELECT TOP 1 c.sessionId, c.userId FROM c WHERE c.sessionId = @sessionId AND c.eventType = @eventType ORDER BY c.timestamp DESC',
      parameters: [
        { name: '@sessionId', value: sessionId },
        { name: '@eventType', value: 'session_state' },
      ],
    }).fetchAll()

    const owner = resources[0]
    if (!owner || owner.userId !== session.userId) {
      return res.status(403).json({ error: 'Access denied for this evaluation' })
    }

    const doc = await getLatestSessionStateDoc(sessionId)
    if (!doc || doc.evaluationStatus !== 'published') {
      return res.status(404).json({ error: 'Published evaluation not found' })
    }

    return res.status(200).json({
      evaluationStatus: doc.evaluationStatus,
      evaluationData: doc.evaluationData || [],
    })
  } catch (error: any) {
    console.error('Student evaluation fetch error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

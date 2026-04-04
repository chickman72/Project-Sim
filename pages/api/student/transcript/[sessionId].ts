import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../../lib/auth'
import { getLogsContainer } from '../../../../lib/cosmos'

type TranscriptRow = {
  timestamp?: string
  studentInput?: string
  aiOutput?: string
}

type TranscriptMessage = {
  role: 'student' | 'assistant'
  content: string
  timestamp?: string
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

  const { sessionId } = req.query
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return res.status(400).json({ error: 'Invalid sessionId' })
  }

  try {
    const container = await getLogsContainer()
    const { resources } = await container.items.query<TranscriptRow>({
      query:
        'SELECT c.timestamp, c.studentInput, c.aiOutput FROM c WHERE c.userId = @userId AND c.sessionId = @sessionId AND c.eventType = @eventType ORDER BY c.timestamp ASC',
      parameters: [
        { name: '@userId', value: session.userId },
        { name: '@sessionId', value: sessionId },
        { name: '@eventType', value: 'chat' },
      ],
    }).fetchAll()

    const messages: TranscriptMessage[] = []
    for (const row of resources) {
      if (row.studentInput) {
        messages.push({ role: 'student', content: row.studentInput, timestamp: row.timestamp })
      }
      if (row.aiOutput) {
        messages.push({ role: 'assistant', content: row.aiOutput, timestamp: row.timestamp })
      }
    }

    return res.status(200).json({ sessionId, messages })
  } catch (error: any) {
    console.error('Student transcript fetch error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { getLogsContainer, getSetupsContainer } from '../../../lib/cosmos'

type CompletedRow = {
  sessionId?: string
  scenarioId?: string
  timestamp?: string
  sessionDurationSeconds?: number
  evaluationStatus?: 'none' | 'pending_approval' | 'published'
}

type CompletedScenario = {
  sessionId: string
  scenarioId?: string
  scenarioName: string
  completedAt: string
  durationSeconds?: number
  evaluationStatus: 'none' | 'pending_approval' | 'published'
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
    const logsContainer = await getLogsContainer()
    const { resources } = await logsContainer.items.query<CompletedRow>({
      query:
        'SELECT c.sessionId, c.scenarioId, c.timestamp, c.sessionDurationSeconds, c.evaluationStatus FROM c WHERE c.userId = @userId AND c.eventType = @eventType AND c.completionStatus = @status ORDER BY c.timestamp DESC',
      parameters: [
        { name: '@userId', value: session.userId },
        { name: '@eventType', value: 'session_state' },
        { name: '@status', value: 'completed' },
      ],
    }).fetchAll()

    const latestBySession = new Map<string, CompletedRow>()
    for (const row of resources) {
      if (!row.sessionId || row.sessionId === 'GLOBAL') continue
      if (!latestBySession.has(row.sessionId)) {
        latestBySession.set(row.sessionId, row)
      }
    }

    const setupsContainer = await getSetupsContainer()
    const { resources: allSetups } = await setupsContainer.items
      .query<{ code?: string; title?: string }>('SELECT c.code, c.title FROM c')
      .fetchAll()

    const titleByCode = new Map<string, string>()
    for (const setup of allSetups) {
      if (typeof setup.code === 'string' && setup.code.length > 0) {
        titleByCode.set(setup.code, setup.title || setup.code)
      }
    }

    const completed: CompletedScenario[] = Array.from(latestBySession.values()).map((row) => {
      const scenarioName = row.scenarioId
        ? titleByCode.get(row.scenarioId) || row.scenarioId
        : 'Scenario'

      return {
        sessionId: row.sessionId as string,
        scenarioId: row.scenarioId,
        scenarioName,
        completedAt: row.timestamp || new Date().toISOString(),
        durationSeconds: typeof row.sessionDurationSeconds === 'number' ? row.sessionDurationSeconds : undefined,
        evaluationStatus: row.evaluationStatus || 'none',
      }
    })

    return res.status(200).json(completed)
  } catch (error: any) {
    console.error('Student completed scenarios fetch error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

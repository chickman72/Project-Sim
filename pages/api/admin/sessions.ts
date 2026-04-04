import type { NextApiRequest, NextApiResponse } from 'next'
import { getLogsContainer } from '../../../lib/cosmos'
import { getUserById } from '../../../lib/user'

type SimSessionRecord = {
  id: string
  timestamp?: string
  eventType: string
  ok?: boolean
  userId?: string
  username?: string
  sessionId?: string
  scenarioId?: string
  promptVersion?: string
  completionStatus?: 'in-progress' | 'completed' | 'abandoned' | 'timeout'
  sessionDurationSeconds?: number
  sessionTags?: string[]
  userMessage?: string
  assistant?: string
  studentInput?: string
  aiOutput?: string
  requestJson?: string
  responseJson?: string
  latencyMs?: number
}

type GroupedSession = {
  sessionId: string
  userId?: string
  username?: string
  scenarioId?: string
  promptVersion?: string
  completionStatus?: 'in-progress' | 'completed' | 'abandoned' | 'timeout'
  sessionDurationSeconds?: number
  durationSeconds?: number
  sessionTags?: string[]
  startTime?: string
  endTime?: string
  events: SimSessionRecord[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const container = await getLogsContainer()

  if (req.method === 'DELETE') {
    const sessionId = Array.isArray(req.query.sessionId) ? req.query.sessionId[0] : req.query.sessionId
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query parameter required' })
    }

    try {
      const querySpec = {
        query: 'SELECT c.id FROM c WHERE c.sessionId = @sessionId',
        parameters: [{ name: '@sessionId', value: sessionId }],
      }
      const { resources } = await container.items.query<{ id: string }>(querySpec).fetchAll()
      await Promise.all(
        resources.map((item) => container.item(item.id, sessionId).delete())
      )
      return res.status(200).json({ deleted: resources.length })
    } catch (error) {
      console.error('Failed to delete session analytics:', error)
      return res.status(500).json({ error: 'Failed to delete session analytics' })
    }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const querySpec = {
      query:
        'SELECT * FROM c WHERE c.eventType IN (@sessionState, @chat, @login, @logout, @chatError) ORDER BY c.timestamp ASC',
      parameters: [
        { name: '@sessionState', value: 'session_state' },
        { name: '@chat', value: 'chat' },
        { name: '@login', value: 'login' },
        { name: '@logout', value: 'logout' },
        { name: '@chatError', value: 'chat_error' },
      ],
    }

    const { resources } = await container.items
      .query<SimSessionRecord>(querySpec)
      .fetchAll()

    const uniqueUserIds = Array.from(
      new Set(resources.filter((r) => typeof r.userId === 'string' && r.userId !== 'GLOBAL').map((r) => r.userId!))
    )

    const userMap = new Map<string, string>()
    await Promise.all(
      uniqueUserIds.map(async (id) => {
        try {
          const user = await getUserById(id)
          if (user?.username) {
            userMap.set(id, user.username)
          }
        } catch {
          // Ignore lookup failures and fall back to raw userId
        }
      })
    )

    // Group by sessionId
    const sessionMap = new Map<string, SimSessionRecord[]>()
    for (const record of resources) {
      if (record.sessionId && record.sessionId !== 'GLOBAL') {
        if (!sessionMap.has(record.sessionId)) {
          sessionMap.set(record.sessionId, [])
        }
        sessionMap.get(record.sessionId)!.push({
          ...record,
          username: record.userId ? userMap.get(record.userId) ?? record.userId : undefined,
        })
      }
    }

    // Build grouped sessions
    const groupedSessions: GroupedSession[] = []
    for (const [sessionId, records] of sessionMap) {
      const sortedRecords = records.sort((a, b) => new Date(a.timestamp || '').getTime() - new Date(b.timestamp || '').getTime())
      const sessionState = sortedRecords.find((r) => r.eventType === 'session_state')
      const summarySource = sessionState || sortedRecords[0]

      const firstLogin = sortedRecords.find((r) => r.eventType === 'login')
      const lastLogout = [...sortedRecords].reverse().find((r) => r.eventType === 'logout')
      const lastChat = [...sortedRecords].reverse().find((r) => r.eventType === 'chat')
      const endRecord = lastLogout || lastChat || sortedRecords[sortedRecords.length - 1]

      const startTime = firstLogin?.timestamp || sortedRecords[0]?.timestamp
      const endTime = endRecord?.timestamp
      const durationSeconds = startTime && endTime
        ? Math.max(0, Math.floor((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000))
        : undefined

      groupedSessions.push({
        sessionId,
        userId: summarySource?.userId,
        username: summarySource?.username,
        scenarioId: summarySource?.scenarioId,
        promptVersion: summarySource?.promptVersion,
        completionStatus: summarySource?.completionStatus,
        sessionDurationSeconds: summarySource?.sessionDurationSeconds,
        durationSeconds,
        sessionTags: summarySource?.sessionTags,
        startTime,
        endTime,
        events: sortedRecords,
      })
    }

    // Sort by startTime desc
    groupedSessions.sort((a, b) => new Date(b.startTime || '').getTime() - new Date(a.startTime || '').getTime())

    return res.status(200).json(groupedSessions)
  } catch (error) {
    console.error('Failed to fetch session analytics:', error)
    return res.status(500).json({ error: 'Failed to load session analytics' })
  }
}

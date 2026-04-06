import type { NextApiRequest, NextApiResponse } from 'next'
import { verifySessionToken, getSessionCookieName } from '../../../lib/auth'
import { getAdminAnalytics, type AnalyticsFilters } from '../../../lib/admin-analytics'
import type { TelemetryEventType } from '../../../lib/telemetry'

const parseEventType = (value: unknown): TelemetryEventType | '' => {
  if (typeof value !== 'string') return ''
  if (!['login', 'logout', 'chat_message', 'sim_start', 'sim_complete'].includes(value)) return ''
  return value as TelemetryEventType
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || session.role !== 'Administrator') {
    return res.status(403).json({ error: 'Access denied. Administrator role required.' })
  }

  try {
    const filters: AnalyticsFilters = {
      eventType: parseEventType(req.query.eventType),
      userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
      cohortId: typeof req.query.cohortId === 'string' ? req.query.cohortId : undefined,
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined
    }

    const analytics = await getAdminAnalytics(filters)
    return res.status(200).json(analytics)
  } catch (error) {
    console.error('API /admin/analytics error:', error)
    return res.status(500).json({ error: 'Failed to load analytics data' })
  }
}

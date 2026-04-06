import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../../lib/auth'
import { writeAuditRecord } from '../../../../lib/audit-log'
import { getPrimaryCohortIdForUser, logTelemetryEvent } from '../../../../lib/telemetry'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || session.role !== 'Student') {
    return res.status(403).json({ error: 'Forbidden. Students only.' })
  }

  const scenarioId =
    typeof req.body?.scenarioId === 'string' && req.body.scenarioId.trim().length > 0
      ? req.body.scenarioId.trim()
      : undefined

  const sessionDurationSeconds =
    typeof req.body?.sessionDurationSeconds === 'number' && req.body.sessionDurationSeconds >= 0
      ? Math.floor(req.body.sessionDurationSeconds)
      : undefined

  try {
    await writeAuditRecord({
      eventType: 'session_state',
      ok: true,
      userId: session.userId,
      sessionId: session.sessionId,
      clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
      userAgent: String(req.headers['user-agent'] || ''),
      path: req.url || null,
      method: req.method || null,
      scenarioId,
      completionStatus: 'completed',
      evaluationStatus: 'none',
      sessionDurationSeconds,
    })

    try {
      const cohortId = await getPrimaryCohortIdForUser(session.userId)
      await logTelemetryEvent({
        userId: session.userId,
        eventType: 'sim_complete',
        metadata: {
          ...(cohortId ? { cohortId } : {}),
          ...(session.sessionId ? { sessionId: session.sessionId } : {}),
          ...(typeof sessionDurationSeconds === 'number' ? { duration: sessionDurationSeconds } : {})
        }
      })
    } catch (telemetryErr) {
      console.error('Failed writing telemetry event', telemetryErr)
    }

    return res.status(200).json({ success: true })
  } catch (error: any) {
    console.error('Student session complete error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

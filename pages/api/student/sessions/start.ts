import type { NextApiRequest, NextApiResponse } from 'next'
import { createSessionToken, getSessionCookieName, verifySessionToken } from '../../../../lib/auth'
import { writeAuditRecord } from '../../../../lib/audit-log'

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

  try {
    const freshToken = createSessionToken(session.userId, session.role)
    const nextSession = verifySessionToken(freshToken)
    if (!nextSession) {
      return res.status(500).json({ error: 'Failed to initialize session' })
    }

    const secure = process.env.NODE_ENV === 'production'
    const cookie = `${getSessionCookieName()}=${freshToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}${secure ? '; Secure' : ''}`
    res.setHeader('Set-Cookie', cookie)

    await writeAuditRecord({
      eventType: 'session_state',
      ok: true,
      userId: session.userId,
      sessionId: nextSession.sessionId,
      clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
      userAgent: String(req.headers['user-agent'] || ''),
      path: req.url || null,
      method: req.method || null,
      scenarioId,
      completionStatus: 'in-progress',
      sessionDurationSeconds: 0,
    })

    return res.status(200).json({ sessionId: nextSession.sessionId })
  } catch (error: any) {
    console.error('Student session start error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

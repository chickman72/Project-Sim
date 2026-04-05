import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { reopenSimSessionInternal } from '../../../lib/evaluation'
import { instructorCanAccessSession } from '../../../lib/instructor-review'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || (session.role !== 'Instructor' && session.role !== 'Administrator')) {
    return res.status(403).json({ error: 'Forbidden. Instructor or Administrator required.' })
  }

  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : ''
  if (!sessionId) {
    return res.status(400).json({ error: 'Invalid sessionId' })
  }

  try {
    const canAccess = await instructorCanAccessSession(session.userId, sessionId)
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied for this session' })
    }

    await reopenSimSessionInternal(sessionId)
    return res.status(200).json({ success: true, sessionId })
  } catch (error: any) {
    console.error('Instructor reopen session API error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

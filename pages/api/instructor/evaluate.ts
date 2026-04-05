import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { instructorCanAccessSession } from '../../../lib/instructor-review'
import { runAIEvaluationInternal } from '../../../lib/evaluation'

type RubricCriterion = { criteriaId: string; description: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || (session.role !== 'Instructor' && session.role !== 'Administrator')) {
    return res.status(403).json({ error: 'Forbidden. Instructor or Administrator required.' })
  }

  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : ''
  const rubric = Array.isArray(req.body?.rubric) ? (req.body.rubric as RubricCriterion[]) : []
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' })
  if (!rubric.length) return res.status(400).json({ error: 'rubric is required' })

  try {
    const canAccess = await instructorCanAccessSession(session.userId, sessionId)
    if (!canAccess) return res.status(403).json({ error: 'Access denied for this session' })

    const evaluationData = await runAIEvaluationInternal(sessionId, rubric)
    return res.status(200).json({ evaluationStatus: 'pending_approval', evaluationData })
  } catch (error: any) {
    console.error('Run AI evaluation error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

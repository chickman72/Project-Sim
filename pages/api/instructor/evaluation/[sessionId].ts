import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../../lib/auth'
import { getLatestSessionStateDoc, updateSessionEvaluation } from '../../../../lib/evaluation'
import { instructorCanAccessSession } from '../../../../lib/instructor-review'
import type { EvaluationCriterion, EvaluationStatus } from '../../../../lib/audit-log'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || (session.role !== 'Instructor' && session.role !== 'Administrator')) {
    return res.status(403).json({ error: 'Forbidden. Instructor or Administrator required.' })
  }

  const { sessionId } = req.query
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return res.status(400).json({ error: 'Invalid sessionId' })
  }

  try {
    const canAccess = await instructorCanAccessSession(session.userId, sessionId)
    if (!canAccess) return res.status(403).json({ error: 'Access denied for this session' })

    if (req.method === 'GET') {
      const doc = await getLatestSessionStateDoc(sessionId)
      return res.status(200).json({
        evaluationStatus: doc?.evaluationStatus || 'none',
        evaluationData: doc?.evaluationData || [],
      })
    }

    if (req.method === 'PUT') {
      const status = req.body?.evaluationStatus as EvaluationStatus
      const evaluationData = (req.body?.evaluationData || []) as EvaluationCriterion[]
      if (!Array.isArray(evaluationData)) {
        return res.status(400).json({ error: 'evaluationData must be an array' })
      }
      const nextStatus: EvaluationStatus = status === 'published' ? 'published' : 'pending_approval'
      await updateSessionEvaluation(sessionId, nextStatus, evaluationData)
      return res.status(200).json({ success: true, evaluationStatus: nextStatus, evaluationData })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Instructor evaluation API error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

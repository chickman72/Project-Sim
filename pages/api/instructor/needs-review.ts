import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { getNeedsReviewDataForInstructor } from '../../../lib/instructor-review'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || (session.role !== 'Instructor' && session.role !== 'Administrator')) {
    return res.status(403).json({ error: 'Forbidden. Instructor or Administrator required.' })
  }

  const cohortId = typeof req.query.cohortId === 'string' ? req.query.cohortId : undefined
  const simulationCode = typeof req.query.simulationCode === 'string' ? req.query.simulationCode : undefined
  const archetypeRaw = typeof req.query.archetype === 'string' ? req.query.archetype : undefined
  const archetype =
    archetypeRaw === 'clinical' || archetypeRaw === 'tutor' || archetypeRaw === 'assistant'
      ? archetypeRaw
      : undefined

  try {
    const data = await getNeedsReviewDataForInstructor(session.userId, { cohortId, simulationCode, archetype })
    return res.status(200).json(data)
  } catch (error: any) {
    console.error('Needs review fetch error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

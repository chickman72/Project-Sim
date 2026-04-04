import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { getCohortsByStudent } from '../../../lib/cohort'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)

  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  // This endpoint allows any authenticated user to get cohorts they're enrolled in
  if (req.method === 'GET') {
    try {
      const cohorts = await getCohortsByStudent(session.userId)
      return res.status(200).json(cohorts)
    } catch (error: any) {
      console.error('Cohorts fetch error:', error)
      return res.status(500).json({ error: error.message || 'Internal server error' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

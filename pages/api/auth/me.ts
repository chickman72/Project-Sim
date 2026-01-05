import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session) return res.status(401).json({ error: 'Not authenticated' })

  return res.status(200).json({ userId: session.userId })
}


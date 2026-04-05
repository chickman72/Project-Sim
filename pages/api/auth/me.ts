import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from 'lib/auth'
import { getUserById } from 'lib/user'

const normalizeRole = (role: string | undefined | null): 'Student' | 'Instructor' | 'Administrator' => {
  const raw = String(role || '').trim().toLowerCase()
  if (raw === 'student') return 'Student'
  if (raw === 'instructor') return 'Instructor'
  if (raw === 'administrator' || raw === 'admin') return 'Administrator'
  return 'Student'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session) return res.status(401).json({ error: 'Not authenticated' })

  const user = await getUserById(session.userId)
  if (!user) return res.status(401).json({ error: 'Not authenticated' })

  return res.status(200).json({
    userId: session.userId,
    username: user.username,
    role: normalizeRole(session.role || user.role),
  })
}

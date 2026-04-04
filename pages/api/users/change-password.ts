import type { NextApiRequest, NextApiResponse } from 'next'
import { verifySessionToken, getSessionCookieName } from 'lib/auth'
import { getUserById, updateUser } from 'lib/user'
import crypto from 'node:crypto'

const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || !session.userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'POST') {
    const { newPassword } = req.body || {}

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    try {
      const user = await getUserById(session.userId)
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      const passwordHash = hashPassword(newPassword)
      const updated = await updateUser(session.userId, {
        passwordHash,
        requiresPasswordChange: false
      })

      if (!updated) {
        return res.status(500).json({ error: 'Failed to update password' })
      }

      return res.status(200).json({ success: true, message: 'Password changed successfully' })
    } catch (error) {
      console.error('Error changing password:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).end()
}

import type { NextApiRequest, NextApiResponse } from 'next'
import { getUserByResetToken, updateUser } from 'lib/user'
import crypto from 'node:crypto'

const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { token, newPassword } = req.body || {}

  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Token is required' })
  }

  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  try {
    const user = await getUserByResetToken(token)
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' })
    }

    const passwordHash = hashPassword(newPassword)
    const updated = await updateUser(user.id, {
      passwordHash,
      resetToken: undefined as any,
      resetTokenExpiry: undefined as any
    })

    if (!updated) {
      return res.status(500).json({ error: 'Failed to reset password' })
    }

    return res.status(200).json({ success: true, message: 'Password reset successfully' })
  } catch (error) {
    console.error('Error resetting password with token:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

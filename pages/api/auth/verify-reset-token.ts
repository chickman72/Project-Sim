import type { NextApiRequest, NextApiResponse } from 'next'
import { getUserByResetToken } from 'lib/user'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  const { token } = req.query

  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Token is required' })
  }

  try {
    const user = await getUserByResetToken(token)
    if (!user) {
      return res.status(404).json({ error: 'Invalid or expired token' })
    }

    return res.status(200).json({ valid: true })
  } catch (error) {
    console.error('Error verifying reset token:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

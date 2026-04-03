import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'node:crypto'
import { verifySessionToken, getSessionCookieName } from 'lib/auth'
import { updateUser, deleteUser, getUserById, getUserByUsername, UserRole } from 'lib/user'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || session.role !== 'Administrator') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const { id } = req.query
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid id' })
  }

  if (req.method === 'PUT') {
    const { username, password, role } = req.body || {}
    if ((username && typeof username !== 'string') || (password && typeof password !== 'string') || (role && !['Administrator', 'Instructor', 'Student'].includes(role))) {
      return res.status(400).json({ error: 'Invalid input' })
    }

    const updates: any = {}
    if (username) {
      const existing = await getUserByUsername(username)
      if (existing && existing.id !== id) {
        return res.status(400).json({ error: 'Username already exists' })
      }
      updates.username = username
    }
    if (password) updates.passwordHash = crypto.createHash('sha256').update(password).digest('hex')
    if (role) updates.role = role as UserRole

    try {
      const user = await updateUser(id, updates)
      if (!user) return res.status(404).json({ error: 'User not found' })
      const safeUser = { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt }
      return res.status(200).json(safeUser)
    } catch (error) {
      console.error('Error updating user:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const success = await deleteUser(id)
      if (!success) return res.status(404).json({ error: 'User not found' })
      return res.status(204).end()
    } catch (error) {
      console.error('Error deleting user:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).end()
}
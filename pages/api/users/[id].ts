import type { NextApiRequest, NextApiResponse } from 'next'
import { verifySessionToken, getSessionCookieName } from 'lib/auth'
import { getUserById, updateUser, deleteUser, UserRole } from 'lib/user'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || session.role !== 'Administrator') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const { id } = req.query

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' })
  }

  if (req.method === 'PUT') {
    const { username, password, role } = req.body || {}

    try {
      const user = await getUserById(id)
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      const updates: Partial<{username: string; passwordHash?: string; role: UserRole; requiresPasswordChange?: boolean}> = {}
      if (typeof username === 'string') updates.username = username
      if (typeof role === 'string' && ['Administrator', 'Instructor', 'Student'].includes(role)) {
        updates.role = role as UserRole
      }
      if (typeof password === 'string' && password.length > 0) {
        const crypto = await import('node:crypto')
        updates.passwordHash = crypto.createHash('sha256').update(password).digest('hex')
      }

      const updated = await updateUser(id, updates)
      if (!updated) {
        return res.status(500).json({ error: 'Failed to update user' })
      }

      const safeUser = { id: updated.id, username: updated.username, role: updated.role, createdAt: updated.createdAt, updatedAt: updated.updatedAt }
      return res.status(200).json(safeUser)
    } catch (error) {
      console.error('Error updating user:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const user = await getUserById(id)
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      const success = await deleteUser(id)
      if (!success) {
        return res.status(500).json({ error: 'Failed to delete user' })
      }

      return res.status(200).json({ success: true, message: 'User deleted' })
    } catch (error) {
      console.error('Error deleting user:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).end()
}

import type { NextApiRequest, NextApiResponse } from 'next'
import { verifySessionToken, getSessionCookieName } from 'lib/auth'
import { listUsers, createUser, getUserByUsername, UserRole } from 'lib/user'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || session.role !== 'Administrator') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  if (req.method === 'GET') {
    try {
      const users = await listUsers()
      // Don't return password hashes
      const safeUsers = users.map(u => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt, updatedAt: u.updatedAt }))
      return res.status(200).json(safeUsers)
    } catch (error) {
      console.error('Error listing users:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  if (req.method === 'POST') {
    const { username, password, role } = req.body || {}
    if (typeof username !== 'string' || typeof password !== 'string' || !['Administrator', 'Instructor', 'Student'].includes(role)) {
      return res.status(400).json({ error: 'Invalid input' })
    }

    try {
      const existing = await getUserByUsername(username)
      if (existing) {
        return res.status(400).json({ error: 'Username already exists' })
      }

      const user = await createUser(username, password, role as UserRole)
      const safeUser = { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt }
      return res.status(201).json(safeUser)
    } catch (error) {
      console.error('Error creating user:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).end()
}
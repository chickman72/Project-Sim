import type { NextApiRequest, NextApiResponse } from 'next'
import { verifySessionToken, getSessionCookieName } from 'lib/auth'
import { bulkImportUsers, BulkImportResult } from 'lib/user'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session || session.role !== 'Administrator') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  if (req.method === 'POST') {
    const { csvContent, role } = req.body || {}
    
    if (typeof csvContent !== 'string' || !csvContent.trim()) {
      return res.status(400).json({ error: 'Invalid input: csvContent is required' })
    }

    const userRole = role || 'Student'
    if (!['Student', 'Instructor', 'Administrator'].includes(userRole)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    try {
      const result = await bulkImportUsers(csvContent, userRole as 'Student' | 'Instructor' | 'Administrator')
      return res.status(200).json(result)
    } catch (error) {
      console.error('Error importing users:', error)
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to import users'
      })
    }
  }

  return res.status(405).end()
}

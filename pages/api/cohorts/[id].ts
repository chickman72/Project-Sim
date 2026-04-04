import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { 
  getCohortById,
  updateCohort,
  deleteCohort
} from '../../../lib/cohort'
import { logAdminAction } from '../../../lib/audit-log'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)

  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  // Only Instructors and Administrators can manage cohorts
  if (session.role !== 'Instructor' && session.role !== 'Administrator') {
    return res.status(403).json({ error: 'Access denied. Instructor or Administrator role required.' })
  }

  const { id } = req.query
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid cohort ID' })
  }

  try {
    if (req.method === 'GET') {
      // Get a specific cohort
      const cohort = await getCohortById(id)
      if (!cohort) {
        return res.status(404).json({ error: 'Cohort not found' })
      }

      // Verify the cohort belongs to the instructor (or that the requester is an admin)
      if (session.role !== 'Administrator' && cohort.instructorId !== session.userId) {
        return res.status(403).json({ error: 'You can only view your own cohorts' })
      }

      return res.status(200).json(cohort)
    }

    if (req.method === 'PUT') {
      // Update a cohort
      const cohort = await getCohortById(id)
      if (!cohort) {
        return res.status(404).json({ error: 'Cohort not found' })
      }

      // Verify the cohort belongs to the instructor
      if (session.role !== 'Administrator' && cohort.instructorId !== session.userId) {
        return res.status(403).json({ error: 'You can only update your own cohorts' })
      }

      const { name } = req.body
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'name is required and cannot be empty' })
      }

      const updatedCohort = await updateCohort(id, { name: name.trim() })

      // Log the action
      if (session.role === 'Administrator') {
        await logAdminAction(session.userId, 'UPDATE_COHORT', id, {
          oldName: cohort.name,
          newName: name.trim()
        })
      }

      return res.status(200).json(updatedCohort)
    }

    if (req.method === 'DELETE') {
      // Delete a cohort
      const cohort = await getCohortById(id)
      if (!cohort) {
        return res.status(404).json({ error: 'Cohort not found' })
      }

      // Verify the cohort belongs to the instructor
      if (session.role !== 'Administrator' && cohort.instructorId !== session.userId) {
        return res.status(403).json({ error: 'You can only delete your own cohorts' })
      }

      await deleteCohort(id)

      // Log the action
      if (session.role === 'Administrator') {
        await logAdminAction(session.userId, 'DELETE_COHORT', id, {
          cohortName: cohort.name,
          studentCount: cohort.studentIds.length
        })
      }

      return res.status(200).json({ message: 'Cohort deleted successfully' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Cohort API error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

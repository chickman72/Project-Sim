import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { 
  createCohort, 
  getCohortsByInstructor, 
  getCohortById,
  addStudentToCohort,
  removeStudentFromCohort
} from '../../../lib/cohort'
import { logAdminAction } from '../../../lib/audit-log'

interface CohortResponse {
  id: string
  name: string
  instructorId: string
  studentIds: string[]
  createdAt: string
  updatedAt: string
}

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

  try {
    if (req.method === 'GET') {
      // Get all cohorts for the current instructor
      // Administrators can view any instructor's cohorts if they pass instructorId param
      let instructorId = session.userId

      if (session.role === 'Administrator' && req.query.instructorId) {
        instructorId = req.query.instructorId as string
      }

      const cohorts = await getCohortsByInstructor(instructorId)
      return res.status(200).json(cohorts)
    }

    if (req.method === 'POST') {
      // Create a new cohort
      const { name, studentIds } = req.body

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required and must be a string' })
      }

      if (name.trim().length === 0) {
        return res.status(400).json({ error: 'name cannot be empty' })
      }

      const cohort = await createCohort(name.trim(), session.userId)
      
      // Add students to the newly created cohort if provided
      if (Array.isArray(studentIds) && studentIds.length > 0) {
        for (const studentId of studentIds) {
          await addStudentToCohort(cohort.id, studentId)
        }
        // Fetch the updated cohort
        const updated = await getCohortById(cohort.id)
        if (updated) {
          await logAdminAction(session.userId, 'CREATE_COHORT', updated.id, {
            cohortName: updated.name,
            instructorId: session.userId,
            studentCount: updated.studentIds.length
          })
          return res.status(201).json(updated)
        }
      } else {
        await logAdminAction(session.userId, 'CREATE_COHORT', cohort.id, {
          cohortName: cohort.name,
          instructorId: session.userId,
          studentCount: 0
        })
      }

      return res.status(201).json(cohort)
    }

    if (req.method === 'PUT') {
      // Add or remove students from a cohort
      const { cohortId, studentId, action } = req.body

      if (!cohortId || typeof cohortId !== 'string') {
        return res.status(400).json({ error: 'cohortId is required and must be a string' })
      }

      if (!studentId || typeof studentId !== 'string') {
        return res.status(400).json({ error: 'studentId is required and must be a string' })
      }

      if (!action || (action !== 'add' && action !== 'remove')) {
        return res.status(400).json({ error: 'action must be "add" or "remove"' })
      }

      // Verify the cohort belongs to the instructor (or that the requester is an admin)
      const cohort = await getCohortById(cohortId)
      if (!cohort) {
        return res.status(404).json({ error: 'Cohort not found' })
      }

      if (session.role !== 'Administrator' && cohort.instructorId !== session.userId) {
        return res.status(403).json({ error: 'You can only modify your own cohorts' })
      }

      try {
        if (action === 'add') {
          await addStudentToCohort(cohortId, studentId)
        } else {
          await removeStudentFromCohort(cohortId, studentId)
        }

        const updatedCohort = await getCohortById(cohortId)

        // Log the action
        if (session.role === 'Administrator') {
          const logAction = action === 'add' ? 'ADD_STUDENT_TO_COHORT' : 'REMOVE_STUDENT_FROM_COHORT'
          await logAdminAction(session.userId, logAction, cohortId, {
            cohortName: updatedCohort?.name,
            studentId,
            action
          })
        }

        return res.status(200).json(updatedCohort)
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          return res.status(400).json({ error: 'Student is already in this cohort' })
        }
        throw error
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Cohort API error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

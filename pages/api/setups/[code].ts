import type { NextApiRequest, NextApiResponse } from 'next'
import { getSetupsContainer } from '../../../lib/cosmos'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { logAdminAction } from '../../../lib/audit-log'
import { getCohortsByStudent } from '../../../lib/cohort'

const DEFAULT_PATIENT_VOICE = 'en-US-JennyNeural'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query
  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Invalid code' })
  }

  try {
    const container = await getSetupsContainer()

    if (req.method === 'GET') {
      // Check authentication for access control
      const token = req.cookies?.[getSessionCookieName()]
      const session = verifySessionToken(token)

      try {
        const { resource } = await container.item(code, code).read()
        if (!resource) {
          return res.status(404).json({ error: 'Setup not found' })
        }

        const visibility = resource.visibility || (resource.assignedCohortId ? 'cohort' : 'global')

        // Non-global simulations require authentication.
        if (visibility !== 'global' && !session) {
          return res.status(401).json({ error: 'Not authenticated' })
        }

        // If student, check if they have access to this simulation
        if (session && session.role === 'Student') {
          if (visibility === 'private') {
            return res.status(403).json({ error: 'Access denied. This simulation is private and not assigned to you.' })
          }

          // If simulation is assigned to a cohort, check student's cohorts
          if (visibility === 'cohort' && resource.assignedCohortId) {
            const studentCohorts = await getCohortsByStudent(session.userId)
            const hasAccess = studentCohorts.some(c => c.id === resource.assignedCohortId)
            if (!hasAccess) {
              return res.status(403).json({ error: 'Access denied. This simulation is not available to you.' })
            }
          }
          // Global simulations (no assignedCohortId) are always accessible
        }

        // Return only what the student needs
        return res.status(200).json({
          code: resource.code,
          title: resource.title,
          description: resource.description,
          prompt: resource.prompt,
          archetype:
            resource.archetype === 'tutor' || resource.archetype === 'assistant' ? resource.archetype : 'clinical',
          targetCohorts: (() => {
            const normalized = Array.isArray(resource.targetCohorts)
              ? Array.from(
                  new Set(
                    resource.targetCohorts
                      .map((item: any) => String(item || '').trim())
                      .filter((item: string) => item.length > 0),
                  ),
                )
              : []
            return normalized.length > 0 ? normalized : ['global']
          })(),
          knowledgeBaseMode: resource.knowledgeBaseMode === 'strict_rag' ? 'strict_rag' : 'standard',
          uploadedDocuments: Array.isArray(resource.uploadedDocuments)
            ? resource.uploadedDocuments
                .map((item: any) => ({
                  fileName: String(item?.fileName || '').trim(),
                  blobUrl: String(item?.blobUrl || '').trim(),
                }))
                .filter((item: { fileName: string; blobUrl: string }) => item.fileName && item.blobUrl)
            : [],
          patientVoice:
            typeof resource.patientVoice === 'string' && resource.patientVoice.trim().length > 0
              ? resource.patientVoice.trim()
              : DEFAULT_PATIENT_VOICE,
          conversationStarters: Array.isArray(resource.conversationStarters)
            ? resource.conversationStarters.map((item: any) => String(item || '')).filter((item: string) => item.trim().length > 0)
            : [],
        })
      } catch (error: any) {
        if (error.code === 404) return res.status(404).json({ error: 'Setup not found' })
        throw error
      }
    }

    if (req.method === 'DELETE') {
      // Only authenticated users (instructors) can delete
      const token = req.cookies?.[getSessionCookieName()]
      const session = verifySessionToken(token)
      if (!session) {
        return res.status(401).json({ error: 'Not authenticated' })
      }

      const container = await getSetupsContainer()
      
      // Read the setup first to get details for logging
      let existingSetup = null
      try {
        const { resource } = await container.item(code, code).read()
        existingSetup = resource
      } catch (error: any) {
        if (error.code === 404) return res.status(404).json({ error: 'Setup not found' })
        throw error
      }

      // Delete the setup
      await container.item(code, code).delete()
      
      // Log the admin action after successful deletion
      await logAdminAction(session.userId, 'DELETE_SIM', code, {
        title: existingSetup?.title,
        description: existingSetup?.description,
        deletedAt: new Date().toISOString()
      })
      
      return res.status(200).json({ success: true })
    }

    return res.status(405).end()
  } catch (error: any) {
    console.error(`API /setups/${code} error:`, error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

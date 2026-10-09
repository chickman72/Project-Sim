import type { NextApiRequest, NextApiResponse } from 'next'
import { getSetupsContainer } from '../../../lib/cosmos'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { logAdminAction } from '../../../lib/audit-log'
import { canManageCohort, getCohortById } from '../../../lib/cohort'

type SimulationVisibility = 'global' | 'cohort' | 'private'
type KnowledgeBaseMode = 'standard' | 'strict_rag'
type AgentArchetype = 'clinical' | 'tutor' | 'assistant'
type RubricCriterion = {
  id: string
  name: string
  successCondition: string
}
type UploadedSimulationDocument = {
  fileName: string
  blobUrl: string
}
const DEFAULT_PATIENT_VOICE = 'en-US-JennyNeural'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  try {
    const container = await getSetupsContainer()

    if (req.method === 'GET') {
      // Get all setups for the current user
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: session.userId }]
      }
      const { resources } = await container.items.query(querySpec).fetchAll()
      return res.status(200).json(resources)
    }

    if (req.method === 'POST') {
      // Create or update a setup
      const {
        code,
        title,
        description,
        prompt,
        patientVoice,
        assignedCohortId,
        visibility,
        isPracticeMode,
        interactionModes,
        personas,
        isEnabled,
        rubric,
        conversationStarters,
        knowledgeBaseMode,
        archetype,
        uploadedDocuments,
      } = req.body
      if (!code || !prompt) {
        return res.status(400).json({ error: 'code and prompt are required' })
      }

      const validVisibility = new Set<SimulationVisibility>(['global', 'cohort', 'private'])
      let normalizedVisibility: SimulationVisibility =
        typeof visibility === 'string' && validVisibility.has(visibility as SimulationVisibility)
          ? (visibility as SimulationVisibility)
          : assignedCohortId
            ? 'cohort'
            : 'global'

      if (typeof visibility === 'string' && !validVisibility.has(visibility as SimulationVisibility)) {
        return res.status(400).json({ error: 'visibility must be one of: global, cohort, private' })
      }

      let normalizedAssignedCohortId: string | undefined
      if (normalizedVisibility === 'cohort') {
        if (typeof assignedCohortId !== 'string' || assignedCohortId.trim().length === 0) {
          return res.status(400).json({ error: 'assignedCohortId is required when visibility is cohort' })
        }

        const cohortId = assignedCohortId.trim()
        const cohort = await getCohortById(cohortId)
        if (!cohort) {
          return res.status(400).json({ error: 'Assigned cohort was not found' })
        }

        if (session.role !== 'Administrator' && !canManageCohort(cohort, session.userId)) {
          return res.status(403).json({ error: 'You can only assign simulations to your own cohorts' })
        }

        normalizedAssignedCohortId = cohortId
      } else {
        normalizedAssignedCohortId = undefined
      }

      let normalizedRubric: RubricCriterion[] = []
      if (Array.isArray(rubric)) {
        normalizedRubric = rubric
          .map((item: any) => ({
            id: String(item?.id || '').trim(),
            name: String(item?.name || '').trim(),
            successCondition: String(item?.successCondition || '').trim(),
          }))
          .filter((item) => item.id && item.name && item.successCondition)
      }

      const normalizedConversationStarters: string[] = Array.isArray(conversationStarters)
        ? conversationStarters
            .map((item: any) => String(item || '').trim())
            .filter((item: string) => item.length > 0)
        : []

      const normalizedPatientVoice =
        typeof patientVoice === 'string' && patientVoice.trim().length > 0
          ? patientVoice.trim()
          : DEFAULT_PATIENT_VOICE

      let normalizedKnowledgeBaseMode: KnowledgeBaseMode = 'standard'
      if (knowledgeBaseMode === 'strict_rag') {
        normalizedKnowledgeBaseMode = 'strict_rag'
      } else if (knowledgeBaseMode === 'standard' || typeof knowledgeBaseMode === 'undefined') {
        normalizedKnowledgeBaseMode = 'standard'
      } else {
        return res.status(400).json({ error: 'knowledgeBaseMode must be one of: standard, strict_rag' })
      }

      const normalizedUploadedDocuments: UploadedSimulationDocument[] = Array.isArray(uploadedDocuments)
        ? uploadedDocuments
            .map((item: any) => ({
              fileName: String(item?.fileName || '').trim(),
              blobUrl: String(item?.blobUrl || '').trim(),
            }))
            .filter((item: UploadedSimulationDocument) => item.fileName && item.blobUrl)
        : []

      let normalizedArchetype: AgentArchetype = 'clinical'
      if (archetype === 'tutor' || archetype === 'assistant' || archetype === 'clinical') {
        normalizedArchetype = archetype
      } else if (typeof archetype !== 'undefined') {
        return res.status(400).json({ error: 'archetype must be one of: clinical, tutor, assistant' })
      }

      const normalizedInteractionModes = {
        text: interactionModes?.text !== false,
        speak: interactionModes?.speak !== false,
        video: normalizedArchetype === 'clinical' && interactionModes?.video !== false,
      }
      if (!normalizedInteractionModes.text && !normalizedInteractionModes.speak && !normalizedInteractionModes.video) {
        return res.status(400).json({ error: 'At least one student response option must be enabled' })
      }
      const normalizedPersonas = Array.isArray(personas)
        ? personas
            .map((persona: any, index: number) => {
              const presentation = persona?.presentation === 'male' ? 'male' : 'female'
              return {
                id: String(persona?.id || `persona-${index + 1}`).trim() || `persona-${index + 1}`,
                name: String(persona?.name || '').trim(),
                presentation,
                voice:
                  String(persona?.voice || '').trim() ||
                  (presentation === 'male' ? 'en-US-GuyNeural' : 'en-US-JennyNeural'),
                avatarCharacter: presentation === 'male' ? 'harry' : 'lisa',
                avatarStyle: String(persona?.avatarStyle || 'casual-sitting').trim() || 'casual-sitting',
              }
            })
            .filter((persona: { name: string }) => persona.name.length > 0)
        : []

      const container = await getSetupsContainer()
      
      // Check if setup already exists to determine action type
      let existingSetup = null
      try {
        const { resource } = await container.item(code, code).read()
        existingSetup = resource
      } catch (error: any) {
        // Item doesn't exist, which is fine for create
      }

      const itemToInsert = {
        id: code, // Cosmos DB uses 'id' natively
        code,
        title,
        description,
        prompt,
        archetype: normalizedArchetype,
        patientVoice: normalizedPatientVoice,
        visibility: normalizedVisibility,
        assignedCohortId: normalizedAssignedCohortId,
        isPracticeMode: Boolean(isPracticeMode),
        interactionModes: normalizedInteractionModes,
        personas: normalizedPersonas,
        isEnabled: typeof isEnabled === 'boolean' ? isEnabled : existingSetup?.isEnabled !== false,
        conversationStarters: normalizedConversationStarters,
        rubric: normalizedRubric,
        knowledgeBaseMode: normalizedKnowledgeBaseMode,
        uploadedDocuments: normalizedUploadedDocuments,
        userId: session.userId,
        updatedAt: new Date().toISOString()
      }

      const { resource } = await container.items.upsert(itemToInsert)
      
      // Log the admin action after successful operation
      const action = existingSetup ? 'UPDATE_SIM' : 'CREATE_SIM'
      await logAdminAction(session.userId, action, code, {
        title,
        description,
        updatedAt: itemToInsert.updatedAt
      })
      
      return res.status(200).json(resource)
    }

    return res.status(405).end()
  } catch (error: any) {
    console.error('API /setups error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type RubricCriterion = {
  id: string
  name: string
  successCondition: string
}

export type UploadedSimulationDocument = {
  fileName: string
  blobUrl: string
}

export type DraftSimulation = {
  archetype: 'clinical' | 'tutor' | 'assistant'
  title: string
  description: string
  prompt: string
  patientVoice: string
  targetCohorts: string[]
  visibility: 'global' | 'cohort' | 'private'
  assignedCohortId?: string
  isPracticeMode: boolean
  conversationStarters: string[]
  rubric: RubricCriterion[]
  knowledgeBaseMode: 'standard' | 'strict_rag'
  uploadedDocuments?: UploadedSimulationDocument[]
}

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

export type InteractionModes = {
  text: boolean
  speak: boolean
  video: boolean
}

export type SimulationPersona = {
  id: string
  name: string
  presentation: 'male' | 'female'
  voice: string
  avatarCharacter: 'harry' | 'lisa'
  avatarStyle: string
}

export type DraftSimulation = {
  archetype: 'clinical' | 'tutor' | 'assistant'
  title: string
  description: string
  prompt: string
  patientVoice: string
  visibility: 'global' | 'cohort' | 'private'
  assignedCohortId?: string
  isPracticeMode: boolean
  interactionModes: InteractionModes
  personas: SimulationPersona[]
  conversationStarters: string[]
  rubric: RubricCriterion[]
  knowledgeBaseMode: 'standard' | 'strict_rag'
  uploadedDocuments?: UploadedSimulationDocument[]
}

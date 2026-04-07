export type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type RubricCriterion = {
  id: string
  name: string
  successCondition: string
}

export type DraftSimulation = {
  title: string
  description: string
  prompt: string
  visibility: 'global' | 'cohort' | 'private'
  assignedCohortId?: string
  isPracticeMode: boolean
  conversationStarters: string[]
  rubric: RubricCriterion[]
}

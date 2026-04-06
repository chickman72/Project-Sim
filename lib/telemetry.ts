import crypto from 'node:crypto'
import { getTelemetryContainer } from './cosmos'
import { getCohortsByStudent } from './cohort'

export type TelemetryEventType =
  | 'login'
  | 'logout'
  | 'chat_message'
  | 'sim_start'
  | 'sim_complete'

export interface TelemetryEvent {
  id: string
  userId: string
  eventType: TelemetryEventType
  timestamp: string
  metadata?: {
    cohortId?: string
    sessionId?: string
    duration?: number
  }
}

export const getPrimaryCohortIdForUser = async (userId: string): Promise<string | undefined> => {
  try {
    const cohorts = await getCohortsByStudent(userId)
    const first = cohorts[0]
    return first?.id
  } catch {
    return undefined
  }
}

export async function logTelemetryEvent(
  payload: Omit<TelemetryEvent, 'id' | 'timestamp'>
): Promise<void> {
  const container = await getTelemetryContainer()
  const event: TelemetryEvent = {
    id: crypto.randomUUID(),
    userId: String(payload.userId),
    eventType: payload.eventType,
    timestamp: new Date().toISOString(),
    ...(payload.metadata ? { metadata: payload.metadata } : {})
  }
  await container.items.create(event)
}

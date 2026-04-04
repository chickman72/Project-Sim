import crypto from 'node:crypto'
import { getLogsContainer } from './cosmos'

export type AuditEventType =
  | 'login'
  | 'logout'
  | 'chat'
  | 'chat_error'
  | 'auth_required'
  | 'session_state'

export type CompletionStatus = 'in-progress' | 'completed' | 'abandoned' | 'timeout'

export type SimMessage = {
  id: string
  timestamp: string
  userId: string
  sessionId: string
  studentInput: string
  aiOutput: string
  scenarioId?: string
  promptVersion?: string
  latencyMs?: number
}

export type SimSession = {
  id: string
  timestamp: string
  userId: string
  sessionId: string
  scenarioId?: string
  promptVersion?: string
  completionStatus?: CompletionStatus
  sessionDurationSeconds?: number
  sessionTags?: string[]
}

export type AuditRecord = {
  id: string
  timestamp: string
  eventType: AuditEventType
  ok: boolean
  userId: string | null
  sessionId: string | null
  clientIp: string | null
  userAgent: string | null
  path: string | null
  method: string | null
  durationMs?: number
  upstreamStatus?: number
  endpoint?: string
  model?: string
  userMessage?: string
  assistant?: string
  studentInput?: string
  aiOutput?: string
  scenarioId?: string
  promptVersion?: string
  latencyMs?: number
  completionStatus?: CompletionStatus
  sessionDurationSeconds?: number
  sessionTags?: string[]
  messagesJson?: string
  requestJson?: string
  responseJson?: string
  errorJson?: string
}

export type AdminAuditAction = 'CREATE_SIM' | 'UPDATE_SIM' | 'DELETE_SIM'

export type AdminAuditLog = {
  logId: string
  adminId: string
  action: AdminAuditAction
  resourceId: string
  timestamp: string
  details?: Record<string, unknown>
  type: 'AdminAuditLog'
}

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ unserializable: true, type: typeof value })
  }
}

export const createAuditId = () => crypto.randomBytes(16).toString('hex')

export const writeAuditRecord = async (record: Omit<AuditRecord, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => {
  const id = record.id || createAuditId()
  const timestamp = record.timestamp || new Date().toISOString()
  const full: AuditRecord = { id, timestamp, ...record }
  // Cosmos DB requires partitionKey to be set. Use 'GLOBAL' if sessionId is null
  const itemToInsert = {
    ...full,
    sessionId: full.sessionId || 'GLOBAL',
    sessionTags: full.sessionTags ?? [],
  }

  try {
    const container = await getLogsContainer()
    await container.items.create(itemToInsert)
  } catch (error) {
    console.error('Failed writing audit log to Cosmos DB', error)
  }

  return { id }
}

export const logAdminAction = async (
  adminId: string,
  action: AdminAuditAction,
  resourceId: string,
  details?: Record<string, unknown>
) => {
  const logEntry: AdminAuditLog = {
    logId: crypto.randomUUID(),
    adminId,
    action,
    resourceId,
    timestamp: new Date().toISOString(),
    details,
    type: 'AdminAuditLog'
  }

  try {
    const container = await getLogsContainer()
    await container.items.create({
      ...logEntry,
      sessionId: 'GLOBAL', // Use GLOBAL partition key for admin logs
      id: logEntry.logId // Cosmos DB requires 'id' field
    })
  } catch (error) {
    console.error('Failed writing admin audit log to Cosmos DB', error)
  }

  return { logId: logEntry.logId }
}

export const toAuditJson = (value: unknown) => safeStringify(value)

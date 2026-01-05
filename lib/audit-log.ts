import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export type AuditEventType =
  | 'login'
  | 'logout'
  | 'chat'
  | 'chat_error'
  | 'auth_required'

export type AuditRecord = {
  id: string
  timestamp: string
  eventType: AuditEventType
  ok: boolean
  userId: string | null
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
  messagesJson?: string
  requestJson?: string
  responseJson?: string
  errorJson?: string
}

const ensureLogsDir = async () => {
  const dir = path.join(process.cwd(), 'logs')
  await mkdir(dir, { recursive: true })
  return dir
}

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ unserializable: true, type: typeof value })
  }
}

const readJsonArrayFile = async (filePath: string): Promise<unknown[]> => {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeJsonArrayFile = async (filePath: string, records: unknown[]) => {
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(records, null, 2) + '\n', 'utf8')
  try {
    await rename(tmp, filePath)
  } catch {
    try {
      await unlink(filePath)
    } catch {
      // ignore
    }
    await rename(tmp, filePath)
  }
}

export const createAuditId = () => crypto.randomBytes(16).toString('hex')

export const writeAuditRecord = async (record: Omit<AuditRecord, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => {
  const logsDir = await ensureLogsDir()
  const adminPath = path.join(logsDir, 'interactions.json')

  const id = record.id || createAuditId()
  const timestamp = record.timestamp || new Date().toISOString()
  const full: AuditRecord = { id, timestamp, ...record }

  const existing = await readJsonArrayFile(adminPath)
  existing.push(full)
  await writeJsonArrayFile(adminPath, existing)

  const stamp = timestamp.replace(/[:.]/g, '-')
  const perPath = path.join(logsDir, `interaction-${stamp}-${id.slice(0, 8)}.json`)
  await writeFile(perPath, JSON.stringify(full, null, 2) + '\n', 'utf8')

  return { adminPath, perPath, id }
}

export const toAuditJson = (value: unknown) => safeStringify(value)

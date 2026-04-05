import { getLogsContainer } from './cosmos'
import type { EvaluationCriterion, EvaluationStatus } from './audit-log'

type TranscriptTurn = {
  studentInput?: string
  aiOutput?: string
  timestamp?: string
}

type SessionStateDoc = {
  id: string
  sessionId: string
  eventType: string
  timestamp?: string
  completionStatus?: 'in-progress' | 'completed' | 'abandoned' | 'timeout'
  sessionDurationSeconds?: number
  evaluationStatus?: EvaluationStatus
  evaluationData?: EvaluationCriterion[]
}

const DEFAULT_LLMLITE_URL =
  'https://proxy-ai-anes-uabmc-awefchfueccrddhf.eastus2-01.azurewebsites.net/'

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '')

const getLLMLiteEndpoint = () => {
  const raw = process.env.LLMLITE_URL || DEFAULT_LLMLITE_URL
  const base = normalizeUrl(raw)
  if (/(^|\/)v1\/chat\/completions$/.test(base) || /(^|\/)chat\/completions$/.test(base)) return base
  if (/(^|\/)v1$/.test(base)) return `${base}/chat/completions`
  return `${base}/chat/completions`
}

const getLLMLiteApiKey = () => process.env.LLMLITE_API_KEY || process.env.LLMLITE_KEY

export const getSessionTranscript = async (sessionId: string): Promise<TranscriptTurn[]> => {
  const container = await getLogsContainer()
  const { resources } = await container.items.query<TranscriptTurn>({
    query:
      'SELECT c.studentInput, c.aiOutput, c.timestamp FROM c WHERE c.sessionId = @sessionId AND c.eventType = @eventType ORDER BY c.timestamp ASC',
    parameters: [
      { name: '@sessionId', value: sessionId },
      { name: '@eventType', value: 'chat' },
    ],
  }).fetchAll()
  return resources
}

export const getLatestSessionStateDoc = async (sessionId: string): Promise<SessionStateDoc | null> => {
  const container = await getLogsContainer()
  const { resources } = await container.items.query<SessionStateDoc>({
    query:
      'SELECT TOP 1 c.id, c.sessionId, c.eventType, c.timestamp, c.completionStatus, c.sessionDurationSeconds, c.evaluationStatus, c.evaluationData FROM c WHERE c.sessionId = @sessionId AND c.eventType = @eventType ORDER BY c.timestamp DESC',
    parameters: [
      { name: '@sessionId', value: sessionId },
      { name: '@eventType', value: 'session_state' },
    ],
  }).fetchAll()
  return resources[0] || null
}

export const updateSessionEvaluation = async (
  sessionId: string,
  evaluationStatus: EvaluationStatus,
  evaluationData: EvaluationCriterion[]
) => {
  const container = await getLogsContainer()
  const current = await getLatestSessionStateDoc(sessionId)
  if (!current) throw new Error('Session record not found')

  const { resource } = await container.item(current.id, sessionId).read<any>()
  if (!resource) throw new Error('Session record not found')

  resource.evaluationStatus = evaluationStatus
  resource.evaluationData = evaluationData
  resource.updatedAt = new Date().toISOString()

  await container.item(current.id, sessionId).replace(resource)
  return resource
}

export const reopenSimSessionInternal = async (sessionId: string) => {
  const container = await getLogsContainer()
  const current = await getLatestSessionStateDoc(sessionId)
  if (!current) throw new Error('Session record not found')

  const { resource } = await container.item(current.id, sessionId).read<any>()
  if (!resource) throw new Error('Session record not found')

  resource.completionStatus = 'in-progress'
  resource.evaluationStatus = 'none'
  resource.evaluationData = []
  resource.updatedAt = new Date().toISOString()

  await container.item(current.id, sessionId).replace(resource)
  return resource
}

const extractJsonArray = (raw: string) => {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  const json = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate
  return JSON.parse(json)
}

const sanitizeEvaluation = (value: any): EvaluationCriterion[] => {
  if (!Array.isArray(value)) throw new Error('Evaluator response was not an array')
  const normalized: EvaluationCriterion[] = value.map((item) => ({
    criteriaId: String(item?.criteriaId || '').trim(),
    status: item?.status === 'Met' ? 'Met' : 'Not Met',
    aiFeedback: String(item?.aiFeedback || '').trim(),
    instructorOverride: typeof item?.instructorOverride === 'string' ? item.instructorOverride : undefined,
  }))
  if (!normalized.length || normalized.some((c) => !c.criteriaId || !c.aiFeedback)) {
    throw new Error('Evaluator response contained invalid criteria rows')
  }
  return normalized
}

export const runAIEvaluationInternal = async (
  sessionId: string,
  rubric: Array<{ criteriaId: string; description: string }>
) => {
  const transcriptTurns = await getSessionTranscript(sessionId)
  if (!transcriptTurns.length) throw new Error('No transcript found for session')

  const transcriptText = transcriptTurns
    .map((turn) => {
      const lines: string[] = []
      if (turn.studentInput) lines.push(`Student: ${turn.studentInput}`)
      if (turn.aiOutput) lines.push(`Patient: ${turn.aiOutput}`)
      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')

  const systemPrompt =
    'You are an expert Nursing Faculty evaluator. Grade the student transcript against the rubric. Return JSON only.'
  const userPrompt = [
    'Evaluate this transcript and produce a JSON array.',
    'Each array item must be:',
    '{ "criteriaId": string, "status": "Met" | "Not Met", "aiFeedback": string }',
    'Do not include markdown or extra keys.',
    '',
    'Rubric JSON:',
    JSON.stringify(rubric, null, 2),
    '',
    'Transcript:',
    transcriptText,
  ].join('\n')

  const llmUrl = getLLMLiteEndpoint()
  const apiKey = getLLMLiteApiKey()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-litellm-api-key'] = apiKey

  const resp = await fetch(llmUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: process.env.LLMLITE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1200,
    }),
  })

  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`LLM evaluation failed (${resp.status}): ${txt}`)
  }

  const data = await resp.json()
  const rawContent =
    data?.choices?.[0]?.message?.content ||
    data?.message?.content ||
    data?.assistant ||
    ''
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('LLM returned empty evaluation content')
  }

  const parsed = extractJsonArray(rawContent)
  const evaluationData = sanitizeEvaluation(parsed)
  await updateSessionEvaluation(sessionId, 'pending_approval', evaluationData)
  return evaluationData
}

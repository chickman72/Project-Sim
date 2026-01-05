import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../lib/auth'
import { toAuditJson, writeAuditRecord } from '../../lib/audit-log'

const DEFAULT_LLMLITE_URL =
  'https://proxy-ai-anes-uabmc-awefchfueccrddhf.eastus2-01.azurewebsites.net/'

type Msg = { role: string; content: string }

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '')

const getLLMLiteEndpoint = () => {
  const raw = process.env.LLMLITE_URL || DEFAULT_LLMLITE_URL
  const base = normalizeUrl(raw)

  if (/(^|\/)v1\/chat\/completions$/.test(base) || /(^|\/)chat\/completions$/.test(base)) {
    return base
  }

  if (/(^|\/)v1$/.test(base)) return `${base}/chat/completions`
  return `${base}/chat/completions`
}

const getLLMLiteApiKey = () => process.env.LLMLITE_API_KEY || process.env.LLMLITE_KEY

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  if (!session) {
    try {
      await writeAuditRecord({
        eventType: 'auth_required',
        ok: false,
        userId: null,
        clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
        userAgent: String(req.headers['user-agent'] || ''),
        path: req.url || null,
        method: req.method || null,
      })
    } catch (logErr) {
      console.error('Failed writing audit log', logErr)
    }
    return res.status(401).json({ error: 'Not authenticated' })
  }

  const { systemPrompt, history, userMessage, model } = req.body || {}
  if (!userMessage) return res.status(400).json({ error: 'userMessage required' })

  const messages: Msg[] = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  if (Array.isArray(history)) {
    for (const m of history) {
      if (m && typeof m.role === 'string' && typeof m.content === 'string') {
        messages.push({ role: m.role, content: m.content })
      }
    }
  }
  const last = Array.isArray(history) && history.length ? history[history.length - 1] : null
  const duplicateUser = last && last.role === 'user' && last.content === userMessage
  if (!duplicateUser) messages.push({ role: 'user', content: userMessage })

  // Route all requests through LLMLite proxy (no direct OpenAI calls from this app).
  try {
    const llmUrl = getLLMLiteEndpoint()
    const startMs = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    const chosenModel =
      model || process.env.LLMLITE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'

    const apiKey = getLLMLiteApiKey()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['x-litellm-api-key'] = apiKey

    const resp = await fetch(llmUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: chosenModel,
        messages,
        max_tokens: 1000,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!resp.ok) {
      const status = resp.status
      const contentType = resp.headers.get('content-type') || ''
      const body = contentType.includes('application/json') ? await resp.json() : await resp.text()

      try {
        await writeAuditRecord({
          eventType: 'chat',
          ok: false,
          userId: session.userId,
          clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
          userAgent: String(req.headers['user-agent'] || ''),
          path: req.url || null,
          method: req.method || null,
          endpoint: llmUrl,
          model: chosenModel,
          durationMs: Date.now() - startMs,
          upstreamStatus: status,
          userMessage,
          messagesJson: toAuditJson(messages),
          requestJson: toAuditJson({
            systemPrompt: systemPrompt ?? null,
            historyCount: Array.isArray(history) ? history.length : 0,
            userMessage,
            messages,
          }),
          responseJson: toAuditJson(body),
        })
      } catch (logErr) {
        console.error('Failed writing audit log', logErr)
      }

      return res.status(502).json({ error: 'Upstream error', status, details: body })
    }
    const data = await resp.json()
    let assistant = ''
    if (data?.choices && data.choices[0]?.message?.content) {
      assistant = data.choices[0].message.content
    } else if (data?.message?.content) {
      assistant = data.message.content
    } else if (typeof data === 'string') {
      assistant = data
    } else if (data?.assistant) {
      assistant = data.assistant
    }

    try {
      await writeAuditRecord({
        eventType: 'chat',
        ok: true,
        userId: session.userId,
        clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
        userAgent: String(req.headers['user-agent'] || ''),
        path: req.url || null,
        method: req.method || null,
        endpoint: llmUrl,
        model: chosenModel,
        durationMs: Date.now() - startMs,
        userMessage,
        assistant,
        messagesJson: toAuditJson(messages),
        requestJson: toAuditJson({
          systemPrompt: systemPrompt ?? null,
          historyCount: Array.isArray(history) ? history.length : 0,
          userMessage,
          messages,
        }),
        responseJson: toAuditJson(data),
      })
    } catch (logErr) {
      console.error('Failed writing audit log', logErr)
    }

    return res.status(200).json({ assistant })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Upstream request timed out' })
    }

    try {
      await writeAuditRecord({
        eventType: 'chat_error',
        ok: false,
        userId: session.userId,
        clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
        userAgent: String(req.headers['user-agent'] || ''),
        path: req.url || null,
        method: req.method || null,
        endpoint: getLLMLiteEndpoint(),
        model: model || process.env.LLMLITE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        userMessage,
        messagesJson: toAuditJson(messages),
        requestJson: toAuditJson({
          systemPrompt: systemPrompt ?? null,
          historyCount: Array.isArray(history) ? history.length : 0,
          userMessage,
          messages,
        }),
        errorJson: toAuditJson({ message: err?.message ?? String(err), name: err?.name, stack: err?.stack }),
      })
    } catch (logErr) {
      console.error('Failed writing audit log', logErr)
    }

    return res.status(500).json({ error: err.message || 'Unknown error' })
  }
}

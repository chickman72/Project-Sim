'use server'

import type { ChatMessage } from '../../components/simulation/types'

const DEFAULT_LLMLITE_URL =
  'https://proxy-ai-anes-uabmc-awefchfueccrddhf.eastus2-01.azurewebsites.net/'

type LLMMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

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

export async function sendPreviewMessage(systemPrompt: string, messageHistory: ChatMessage[]) {
  const prompt = typeof systemPrompt === 'string' ? systemPrompt.trim() : ''
  if (!prompt) {
    throw new Error('System prompt is required for preview testing')
  }

  if (!Array.isArray(messageHistory) || messageHistory.length === 0) {
    throw new Error('Message history is required')
  }

  const messages: LLMMessage[] = [{ role: 'system', content: prompt }]

  for (const message of messageHistory) {
    if (!message || typeof message.role !== 'string' || typeof message.content !== 'string') continue
    if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') continue
    messages.push({ role: message.role, content: message.content })
  }

  const llmUrl = getLLMLiteEndpoint()
  const chosenModel = process.env.LLMLITE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const apiKey = getLLMLiteApiKey()

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-litellm-api-key'] = apiKey

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  try {
    const response = await fetch(llmUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: chosenModel,
        messages,
        max_tokens: 1000,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail || `Preview request failed with status ${response.status}`)
    }

    const data = await response.json()

    if (typeof data?.assistant === 'string' && data.assistant.trim()) return data.assistant
    if (typeof data?.choices?.[0]?.message?.content === 'string' && data.choices[0].message.content.trim()) {
      return data.choices[0].message.content
    }
    if (typeof data?.message?.content === 'string' && data.message.content.trim()) return data.message.content

    throw new Error('Preview response did not include assistant text')
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Preview request timed out')
    }
    throw new Error(err?.message || 'Preview request failed')
  } finally {
    clearTimeout(timeout)
  }
}

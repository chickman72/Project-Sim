'use server'

import type { ChatMessage } from '../../components/simulation/types'
import { getLlmEndpoint, getLlmHeaders, getLlmModel, getLlmTokenLimit } from '../../lib/llm-config'

type LLMMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

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

  const llmUrl = getLlmEndpoint()
  const chosenModel = getLlmModel()
  const headers = getLlmHeaders()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  try {
    const response = await fetch(llmUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: chosenModel,
        messages,
        ...getLlmTokenLimit(1000),
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

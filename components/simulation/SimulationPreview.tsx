'use client'

import React, { useState } from 'react'
import { sendPreviewMessage } from '../../app/actions/sendPreviewMessage'
import SimulationHeader from './SimulationHeader'
import SimulationSidebar from './SimulationSidebar'
import SimulationChatInterface from './SimulationChatInterface'
import type { ChatMessage, DraftSimulation } from './types'

type Props = {
  draftSim: DraftSimulation
}

export default function SimulationPreview({ draftSim }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    setError(null)
    const userMessage: ChatMessage = { role: 'user', content: text }
    const nextHistory = [...messages, userMessage]

    setMessages(nextHistory)
    setInput('')
    setLoading(true)

    try {
      const assistantText = await sendPreviewMessage(draftSim.prompt, nextHistory)
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }])
    } catch (err: any) {
      setError(err?.message || 'Preview request failed')
    } finally {
      setLoading(false)
    }
  }

  const resetPreview = () => {
    setMessages([])
    setInput('')
    setError(null)
    setLoading(false)
  }

  const validConversationStarters = draftSim.conversationStarters.filter((item) => item.trim().length > 0)

  return (
    <div className="h-full">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Live Student Preview</h3>
        <p className="text-xs text-gray-600">This sandbox is ephemeral and does not save transcript data.</p>
      </div>
      <div className="h-[800px] max-h-[80vh] grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <SimulationHeader
            title={draftSim.title || 'Untitled Simulation'}
            description={draftSim.description}
          />
          <SimulationSidebar
            conversationStarters={validConversationStarters}
            onSelectStarter={(starter) => setInput(starter)}
          />
        </div>
        <div className="lg:col-span-2 h-full">
          <SimulationChatInterface
            isPreview={true}
            title="Simulation Chat"
            messages={messages}
            input={input}
            loading={loading}
            error={error}
            onInputChange={setInput}
            onSend={send}
            onResetPreview={resetPreview}
          />
        </div>
      </div>
    </div>
  )
}

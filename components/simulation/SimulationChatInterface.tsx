import React from 'react'
import type { ChatMessage } from './types'

type Props = {
  title?: string
  isPreview?: boolean
  messages: ChatMessage[]
  input: string
  loading: boolean
  error?: string | null
  voiceError?: string | null
  onInputChange: (value: string) => void
  onSend: () => void
  onEndSession?: () => void
  endSessionLabel?: string
  endSessionClassName?: string
  onResetPreview?: () => void
  showVoiceButton?: boolean
  voiceMode?: boolean
  onToggleVoiceMode?: () => void
  isListening?: boolean
  isAiSpeaking?: boolean
  interactionMode?: 'text' | 'voice' | 'avatar'
  onInteractionModeChange?: (mode: 'text' | 'voice' | 'avatar') => void
  allowAvatarMode?: boolean
}

export default function SimulationChatInterface({
  title = 'Simulation Chat',
  isPreview = false,
  messages,
  input,
  loading,
  error,
  voiceError,
  onInputChange,
  onSend,
  onEndSession,
  endSessionLabel = 'End Session & Submit',
  endSessionClassName = 'bg-red-600 hover:bg-red-700',
  onResetPreview,
  showVoiceButton = false,
  voiceMode = false,
  onToggleVoiceMode,
  isListening = false,
  isAiSpeaking = false,
  interactionMode = 'text',
  onInteractionModeChange,
  allowAvatarMode = true,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {!isPreview && onEndSession && (
          <button
            type="button"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white shadow-sm ${endSessionClassName}`}
            onClick={onEndSession}
          >
            {endSessionLabel}
          </button>
        )}
      </div>

      {!isPreview && onInteractionModeChange && (
        <div className="mb-3">
          <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-1">
            {[
              { key: 'text' as const, label: 'Text' },
              { key: 'voice' as const, label: 'Speak' },
              { key: 'avatar' as const, label: 'Video' },
            ]
              .filter((mode) => allowAvatarMode || mode.key !== 'avatar')
              .map((mode) => (
              <button
                key={mode.key}
                type="button"
                onClick={() => onInteractionModeChange(mode.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  interactionMode === mode.key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isPreview && onResetPreview && (
        <div className="mb-2">
          <button
            type="button"
            onClick={onResetPreview}
            className="px-3 py-1.5 rounded-md border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Reset Preview
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 border rounded-md bg-gray-50 min-h-[320px]">
        {messages.length === 0 && <div className="text-sm text-gray-500">No messages yet. Start by sending a message.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`mb-3 ${m.role === 'assistant' ? 'text-left' : 'text-right'}`}>
            <div className={`inline-block max-w-[90%] px-3 py-2 rounded-xl ${m.role === 'assistant' ? 'bg-white border border-gray-200 text-gray-900' : 'bg-blue-600 text-white'}`}>
              <div className="text-sm whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3">
        {error && <div className="text-red-600 mb-2 text-sm">{error}</div>}
        {voiceError && <div className="text-red-600 mb-2 text-sm">{voiceError}</div>}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            className="flex-1 p-2 border rounded-md"
            placeholder={
              interactionMode === 'voice'
                ? 'Type or use microphone for voice chat...'
                : interactionMode === 'avatar'
                  ? 'Type a message for avatar response...'
                  : 'Type a message...'
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
          />
          {showVoiceButton && onToggleVoiceMode && interactionMode === 'voice' && (
            <button
              className={`px-4 py-2 rounded-md border transition-colors ${
                isListening
                  ? 'bg-red-600 border-red-700 text-white animate-pulse'
                  : voiceMode
                    ? 'bg-red-100 border-red-300 text-red-800'
                    : 'bg-white text-gray-800'
              }`}
              onClick={onToggleVoiceMode}
              type="button"
            >
              {isListening ? 'Listening...' : 'Hold to Speak'}
            </button>
          )}
          {interactionMode !== 'voice' && (
            <button className="px-4 py-2 bg-green-600 text-white rounded-md" onClick={onSend} disabled={loading}>
              {loading ? 'Sending...' : 'Send'}
            </button>
          )}
        </div>
        {showVoiceButton && (isListening || loading || isAiSpeaking) && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {isListening && (
              <span className="inline-flex items-center gap-2 text-red-600">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                Listening...
              </span>
            )}
            {loading && (
              <span className="inline-flex items-center gap-2 text-blue-600">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                AI is generating...
              </span>
            )}
            {isAiSpeaking && (
              <span className="inline-flex items-center gap-2 text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                AI is speaking...
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

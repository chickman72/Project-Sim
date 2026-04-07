"use client"

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { create } from 'zustand'
import TranscriptViewer from '../../components/TranscriptViewer'
import SimulationHeader from '../../components/simulation/SimulationHeader'
import SimulationSidebar from '../../components/simulation/SimulationSidebar'
import SimulationChatInterface from '../../components/simulation/SimulationChatInterface'
import AvatarPlayer, { type AvatarPlayerHandle } from '../../components/simulation/AvatarPlayer'
import type { ChatMessage } from '../../components/simulation/types'

type Assignment = {
  id: string
  code: string
  title: string
  description: string
  assignedCohortId?: string
  isGlobal: boolean
  isPracticeMode?: boolean
}

type CompletedScenario = {
  sessionId: string
  scenarioId?: string
  scenarioName: string
  completedAt: string
  durationSeconds?: number
  evaluationStatus: 'none' | 'pending_approval' | 'published'
}

type TranscriptMessage = {
  role: 'student' | 'assistant'
  content: string
  timestamp?: string
  inputMethod?: 'text' | 'voice'
}

type EvaluationCriterion = {
  criteriaId: string
  status: 'Met' | 'Not Met'
  aiFeedback: string
  instructorOverride?: string
}

type Store = {
  systemPrompt: string
  messages: ChatMessage[]
  setSystemPrompt: (s: string) => void
  addMessage: (m: ChatMessage) => void
  clear: () => void
}

const useStore = create<Store>((set) => ({
  systemPrompt: 'You are the patient in this scenario. Respond in English only.',
  messages: [],
  setSystemPrompt: (s) => set({ systemPrompt: s }),
  addMessage: (m) => set((state) => ({ messages: [...state.messages, m] })),
  clear: () => set({ messages: [] }),
}))

const formatDate = (iso: string) => {
  const date = new Date(iso)
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatDuration = (seconds?: number) => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return '-'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

const DEFAULT_PATIENT_VOICE = 'en-US-JennyNeural'

export default function Page() {
  const router = useRouter()
  const systemPrompt = useStore((s) => s.systemPrompt)
  const setSystemPrompt = useStore((s) => s.setSystemPrompt)
  const messages = useStore((s) => s.messages)
  const addMessage = useStore((s) => s.addMessage)
  const clear = useStore((s) => s.clear)
  const messagesRef = useRef<ChatMessage[]>(messages)

  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'Administrator' | 'Instructor' | 'Student' | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  const [hubTab, setHubTab] = useState<'active' | 'completed'>('active')
  const [hubLoading, setHubLoading] = useState(false)
  const [activeAssignments, setActiveAssignments] = useState<Assignment[]>([])
  const [completedScenarios, setCompletedScenarios] = useState<CompletedScenario[]>([])

  const [view, setView] = useState<'hub' | 'chat'>('hub')
  const [activeSimulationCode, setActiveSimulationCode] = useState('')
  const [activeSimulationTitle, setActiveSimulationTitle] = useState('')
  const [activeSimulationDescription, setActiveSimulationDescription] = useState('')
  const [activePatientVoice, setActivePatientVoice] = useState(DEFAULT_PATIENT_VOICE)
  const [activeSimulationIsPracticeMode, setActiveSimulationIsPracticeMode] = useState(false)
  const [activeConversationStarters, setActiveConversationStarters] = useState<string[]>([])
  const [simulationStartedAt, setSimulationStartedAt] = useState<number | null>(null)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [interactionMode, setInteractionMode] = useState<'text' | 'voice' | 'avatar'>('text')

  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isNavWarningOpen, setIsNavWarningOpen] = useState(false)
  const [isCompletingSession, setIsCompletingSession] = useState(false)

  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [transcriptSessionId, setTranscriptSessionId] = useState<string | undefined>(undefined)
  const [transcriptTitle, setTranscriptTitle] = useState('')
  const [transcriptSimTitle, setTranscriptSimTitle] = useState<string | undefined>(undefined)
  const [transcriptMessages, setTranscriptMessages] = useState<TranscriptMessage[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackTitle, setFeedbackTitle] = useState('')
  const [feedbackRows, setFeedbackRows] = useState<EvaluationCriterion[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  const speechRecognitionRef = useRef<any>(null)
  const transcriptBufferRef = useRef('')
  const ignoreTranscriptRef = useRef(false)
  const avatarPlayerRef = useRef<AvatarPlayerHandle | null>(null)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsAudioUrlRef = useRef<string | null>(null)

  const fetchHubData = React.useCallback(async () => {
    if (!userId || userRole !== 'Student') return

    try {
      setHubLoading(true)
      const [assignmentsResp, completedResp] = await Promise.all([
        fetch('/api/student/assignments'),
        fetch('/api/student/completed'),
      ])

      if (!assignmentsResp.ok) {
        const txt = await assignmentsResp.text()
        throw new Error(txt || 'Failed to load assignments')
      }

      if (!completedResp.ok) {
        const txt = await completedResp.text()
        throw new Error(txt || 'Failed to load completed scenarios')
      }

      const assignmentsData = await assignmentsResp.json()
      const completedData = await completedResp.json()

      setActiveAssignments(Array.isArray(assignmentsData) ? assignmentsData : [])
      setCompletedScenarios(Array.isArray(completedData) ? completedData : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load student dashboard')
    } finally {
      setHubLoading(false)
    }
  }, [userId, userRole])

  React.useEffect(() => {
    ;(async () => {
      try {
        const resp = await fetch('/api/auth/me')
        if (!resp.ok) return
        const data = await resp.json()
        if (data?.userId) {
          setUserId(String(data.userId))
          setUserName(data.username || String(data.userId))
          setUserEmail(data.email || null)
          setUserRole(data.role || null)
        }
      } finally {
        setAuthChecked(true)
      }
    })()
  }, [])

  React.useEffect(() => {
    if (!authChecked) return
    if (!userId) {
      router.replace('/')
      return
    }
    if (userRole === 'Instructor') {
      router.replace('/config')
      return
    }
    if (userRole === 'Administrator') {
      router.replace('/admin')
    }
  }, [authChecked, userId, userRole, router])

  React.useEffect(() => {
    fetchHubData()
  }, [fetchHubData])

  React.useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const stopTts = React.useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause()
      ttsAudioRef.current.onended = null
      ttsAudioRef.current.onerror = null
      ttsAudioRef.current = null
    }
    if (ttsAudioUrlRef.current) {
      URL.revokeObjectURL(ttsAudioUrlRef.current)
      ttsAudioUrlRef.current = null
    }
    setIsAiSpeaking(false)
  }, [])

  const stopListening = React.useCallback((abort = false) => {
    const recognition = speechRecognitionRef.current
    if (!recognition) {
      setIsListening(false)
      setVoiceMode(false)
      return
    }
    if (abort && typeof recognition.abort === 'function') {
      recognition.abort()
    } else {
      recognition.stop()
    }
  }, [])

  const speakAssistantWithAvatar = React.useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message) return

      try {
        if (!avatarPlayerRef.current) {
          throw new Error('Avatar player is not initialized')
        }
        await avatarPlayerRef.current.speak(message)
      } catch (err: any) {
        setVoiceError(err?.message || 'Failed to speak with avatar')
      }
    },
    [],
  )

  const speakAssistantWithVoice = React.useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message) return

      stopTts()
      setIsAiSpeaking(true)
      try {
        const resp = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            voice: activePatientVoice || DEFAULT_PATIENT_VOICE,
          }),
        })
        if (!resp.ok) {
          const detail = await resp.text()
          throw new Error(detail || `TTS request failed (${resp.status})`)
        }

        const blob = await resp.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        ttsAudioRef.current = audio
        ttsAudioUrlRef.current = url

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            if (ttsAudioUrlRef.current) {
              URL.revokeObjectURL(ttsAudioUrlRef.current)
              ttsAudioUrlRef.current = null
            }
            ttsAudioRef.current = null
            setIsAiSpeaking(false)
            resolve()
          }
          audio.onerror = () => {
            if (ttsAudioUrlRef.current) {
              URL.revokeObjectURL(ttsAudioUrlRef.current)
              ttsAudioUrlRef.current = null
            }
            ttsAudioRef.current = null
            setIsAiSpeaking(false)
            reject(new Error('Failed to play synthesized speech'))
          }
          void audio.play().catch((err) => reject(err))
        })
      } catch (err: any) {
        setIsAiSpeaking(false)
        setVoiceError(err?.message || 'Failed to speak response audio')
      }
    },
    [activePatientVoice, stopTts],
  )

  const handleSendMessage = React.useCallback(
    async (
      text: string,
      opts?: {
        userMessageAlreadyAppended?: boolean
        messageHistory?: ChatMessage[]
        inputMethod?: 'text' | 'voice'
        responseMode?: 'text' | 'voice' | 'avatar'
      },
    ) => {
      const content = text.trim()
      if (!content) return
      if (loading) return

      const responseMode = opts?.responseMode || interactionMode
      setError(null)
      const historyToSend = opts?.messageHistory ?? messagesRef.current.slice()
      if (!opts?.userMessageAlreadyAppended) {
        addMessage({ role: 'user', content })
      }
      setLoading(true)

      try {
        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt,
            history: historyToSend,
            userMessage: content,
            inputMethod: opts?.inputMethod || 'text',
            scenarioId: activeSimulationCode || undefined,
            completionStatus: 'in-progress',
            sessionTags: ['Student'],
          }),
        })

        const textResp = await resp.text()
        let data: any = null
        try { data = textResp ? JSON.parse(textResp) : null } catch { data = { raw: textResp } }
        if (!resp.ok) {
          const detail = data?.details ?? data?.error ?? data?.raw ?? `Status ${resp.status}`
          throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
        }

        const assistantResponse =
          data?.assistant ||
          data?.choices?.[0]?.message?.content ||
          ''
        if (!assistantResponse) {
          throw new Error('Invalid response from API')
        }

        addMessage({ role: 'assistant', content: assistantResponse })
        if (responseMode === 'voice') {
          void speakAssistantWithVoice(assistantResponse)
        } else if (responseMode === 'avatar') {
          void speakAssistantWithAvatar(assistantResponse)
        }
      } catch (err: any) {
        setError(err?.message || 'Request failed')
      } finally {
        setLoading(false)
      }
    },
    [loading, addMessage, systemPrompt, activeSimulationCode, interactionMode, speakAssistantWithAvatar, speakAssistantWithVoice],
  )

  const logout = async () => {
    setError(null)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      ignoreTranscriptRef.current = true
      stopListening(true)
      stopTts()
      setUserId(null)
      setUserName(null)
      setUserEmail(null)
      setUserRole(null)
      setView('hub')
      setActiveSimulationCode('')
      setActiveSimulationTitle('')
      setActiveSimulationDescription('')
      setActiveSimulationIsPracticeMode(false)
      setActivePatientVoice(DEFAULT_PATIENT_VOICE)
      setActiveConversationStarters([])
      setSimulationStartedAt(null)
      setInteractionMode('text')
      setVoiceMode(false)
      setVoiceError(null)
      clear()
    }
  }

  const applyPatientRolePrompt = (prompt: string) => {
    const trimmed = prompt.trim()
    const roleHint = [
      'IMPORTANT: You are the patient described in the scenario prompt above.',
      'You are not an AI assistant or clinician.',
      'The user is the nurse; stay in character as the patient and respond as that patient would.',
      'Do not act as the nurse or narrator, and do not step out of role.',
      'Speak in the first person as the patient.',
      'Respond only in English.',
      'If asked about being an AI or system, respond as the patient and stay in character.',
      'If anything conflicts, these role rules take priority.',
    ].join(' ')
    return trimmed ? `${trimmed}\n\n${roleHint}` : roleHint
  }

  const startSimulation = async (assignment: Assignment) => {
    setError(null)
    try {
      const startResp = await fetch('/api/student/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: assignment.code }),
      })
      if (!startResp.ok) {
        const detail = await startResp.text()
        throw new Error(detail || 'Failed to initialize simulation session')
      }

      const setupResp = await fetch(`/api/setups/${encodeURIComponent(assignment.code)}`)
      if (!setupResp.ok) {
        const text = await setupResp.text()
        let data: any = null
        try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
        const detail = data?.error ?? data?.raw ?? 'Failed to load simulation setup'
        throw new Error(String(detail))
      }

      const setup = await setupResp.json()
      const basePrompt = setup.prompt || 'You are the patient in this scenario.'

      clear()
      setInput('')
      setVoiceError(null)
      setSystemPrompt(applyPatientRolePrompt(basePrompt))
      setActiveSimulationCode(assignment.code)
      setActiveSimulationTitle(setup.title || assignment.title || 'Simulation')
      setActiveSimulationDescription(setup.description || assignment.description || '')
      setActivePatientVoice(
        typeof setup.patientVoice === 'string' && setup.patientVoice.trim().length > 0
          ? setup.patientVoice.trim()
          : DEFAULT_PATIENT_VOICE,
      )
      setActiveSimulationIsPracticeMode(Boolean(assignment.isPracticeMode))
      setActiveConversationStarters(
        Array.isArray(setup.conversationStarters)
          ? setup.conversationStarters.map((item: any) => String(item || '')).filter((item: string) => item.trim().length > 0)
          : []
      )
      setSimulationStartedAt(Date.now())
      setInteractionMode('text')
      setView('chat')
    } catch (err: any) {
      setError(err?.message || 'Failed to start simulation')
    }
  }

  const completeSimulation = async () => {
    if (!activeSimulationCode) return

    try {
      setIsCompletingSession(true)
      const sessionDurationSeconds = simulationStartedAt
        ? Math.max(0, Math.floor((Date.now() - simulationStartedAt) / 1000))
        : undefined

      const resp = await fetch('/api/student/sessions/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: activeSimulationCode, sessionDurationSeconds }),
      })

      if (!resp.ok) {
        const detail = await resp.text()
        throw new Error(detail || 'Failed to complete simulation')
      }

      ignoreTranscriptRef.current = true
      stopListening(true)
      stopTts()
      setVoiceMode(false)
      clear()
      setInput('')
      setView('hub')
      setIsConfirmOpen(false)
      setActiveSimulationCode('')
      setActiveSimulationTitle('')
      setActiveSimulationDescription('')
      setActivePatientVoice(DEFAULT_PATIENT_VOICE)
      setActiveSimulationIsPracticeMode(false)
      setActiveConversationStarters([])
      setSimulationStartedAt(null)
      setInteractionMode('text')
      await fetchHubData()
    } catch (err: any) {
      setError(err?.message || 'Failed to complete simulation')
    } finally {
      setIsCompletingSession(false)
    }
  }

  const returnToHub = async () => {
    ignoreTranscriptRef.current = true
    stopListening(true)
    stopTts()
    setVoiceMode(false)
    setView('hub')
    setActivePatientVoice(DEFAULT_PATIENT_VOICE)
    setActiveSimulationIsPracticeMode(false)
    setActiveConversationStarters([])
    setInteractionMode('text')
    clear()
    setInput('')
    await fetchHubData()
  }

  const handleBackToDashboardClick = () => {
    setIsNavWarningOpen(true)
  }

  const applyConversationStarter = (starter: string) => {
    setInput(starter)
  }

  const send = () => {
    const content = input.trim()
    if (!content) return
    setInput('')
    void handleSendMessage(content, {
      inputMethod: 'text',
      responseMode: interactionMode,
    })
  }

  const startSpeechRecognition = () => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setVoiceError('Speech recognition is not supported in this browser')
      setVoiceMode(false)
      setIsListening(false)
      return
    }

    transcriptBufferRef.current = ''
    ignoreTranscriptRef.current = false

    const recognition = new SpeechRecognitionCtor()
    speechRecognitionRef.current = recognition
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onstart = () => {
      setIsListening(true)
      setVoiceMode(true)
    }

    recognition.onresult = (event: any) => {
      let finalized = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) {
          finalized += String(result[0]?.transcript || '')
        }
      }
      if (finalized) {
        transcriptBufferRef.current = `${transcriptBufferRef.current} ${finalized}`.trim()
      }
    }

    recognition.onerror = (event: any) => {
      if (event?.error && event.error !== 'no-speech' && event.error !== 'aborted') {
        setVoiceError(`Microphone error: ${event.error}`)
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      setVoiceMode(false)
      const transcript = transcriptBufferRef.current.trim()
      transcriptBufferRef.current = ''
      speechRecognitionRef.current = null
      if (!transcript || ignoreTranscriptRef.current) {
        ignoreTranscriptRef.current = false
        return
      }
      const historyToSend = messagesRef.current.slice()
      addMessage({ role: 'user', content: transcript })
      void handleSendMessage(transcript, {
        userMessageAlreadyAppended: true,
        messageHistory: historyToSend,
        inputMethod: 'voice',
        responseMode: interactionMode,
      })
    }

    recognition.start()
  }

  const toggleVoiceMode = () => {
    setVoiceError(null)
    if (isListening) {
      stopListening(false)
      return
    }
    startSpeechRecognition()
  }

  React.useEffect(() => {
    if (interactionMode !== 'voice' && isListening) {
      stopListening(false)
    }
  }, [interactionMode, isListening, stopListening])

  React.useEffect(() => {
    return () => {
      ignoreTranscriptRef.current = true
      stopListening(true)
      stopTts()
    }
  }, [stopListening, stopTts])

  const openTranscript = async (session: CompletedScenario) => {
    setTranscriptOpen(true)
    setTranscriptSessionId(session.sessionId)
    setTranscriptTitle(session.scenarioName)
    setTranscriptSimTitle(session.scenarioName)
    setTranscriptMessages([])
    setTranscriptError(null)
    setTranscriptLoading(true)

    try {
      const resp = await fetch(`/api/student/transcript/${encodeURIComponent(session.sessionId)}`)
      const text = await resp.text()
      let data: any = null
      try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }

      if (!resp.ok) {
        const detail = data?.error ?? data?.raw ?? 'Failed to load transcript'
        throw new Error(String(detail))
      }

      setTranscriptMessages(Array.isArray(data?.messages) ? data.messages : [])
    } catch (err: any) {
      setTranscriptError(err?.message || 'Failed to load transcript')
    } finally {
      setTranscriptLoading(false)
    }
  }

  const openFeedback = async (session: CompletedScenario) => {
    setFeedbackOpen(true)
    setFeedbackTitle(session.scenarioName)
    setFeedbackRows([])
    setFeedbackError(null)
    setFeedbackLoading(true)

    try {
      const resp = await fetch(`/api/student/evaluation/${encodeURIComponent(session.sessionId)}`)
      const text = await resp.text()
      let data: any = null
      try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
      if (!resp.ok) {
        const detail = data?.error ?? data?.raw ?? 'Failed to load published feedback'
        throw new Error(String(detail))
      }
      setFeedbackRows(Array.isArray(data?.evaluationData) ? data.evaluationData : [])
    } catch (err: any) {
      setFeedbackError(err?.message || 'Failed to load published feedback')
    } finally {
      setFeedbackLoading(false)
    }
  }

  const initials = userName ? userName.charAt(0).toUpperCase() : userId ? userId.charAt(0).toUpperCase() : ''

  const UserBadge = () => (
    <div
      className="relative inline-block text-left"
      onMouseEnter={() => setIsUserMenuOpen(true)}
      onMouseLeave={() => setIsUserMenuOpen(false)}
    >
      <div className="cursor-pointer">
        <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">{initials}</div>
      </div>
      <div className={`${isUserMenuOpen ? 'block' : 'hidden'} absolute right-0 mt-2 w-64 rounded-md bg-white border border-gray-200 shadow-lg p-3 text-sm z-10`}>
        <div className="text-gray-600 font-medium break-all">{userName || userId}</div>
        <div className="text-gray-500 text-xs break-all">{userEmail || '-'}</div>
        <div className="text-gray-500 text-xs">{userRole?.toUpperCase()}</div>
      </div>
    </div>
  )

  if (!authChecked || !userId || (userRole && userRole !== 'Student')) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="max-w-xl w-full bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h1 className="text-2xl font-semibold mb-2 text-gray-900">Redirecting...</h1>
          <p className="text-sm text-gray-600">Taking you to the main login page.</p>
        </div>
      </div>
    )
  }

  if (view === 'chat') {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6">
        <div className="max-w-7xl mx-auto mb-3">
          <button
            type="button"
            onClick={handleBackToDashboardClick}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            &lt; Back to Dashboard
          </button>
        </div>
        <div className="max-w-7xl mx-auto h-[calc(100vh-3rem)] grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col justify-between">
            <div>
              <SimulationHeader
                title={activeSimulationTitle}
                description={activeSimulationDescription}
              />
              <SimulationSidebar
                conversationStarters={activeConversationStarters}
                onSelectStarter={applyConversationStarter}
              />
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-xs text-gray-600">Logged in as: {userName || userId}</div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="space-y-4">
              {interactionMode === 'avatar' && (
                <AvatarPlayer
                  ref={avatarPlayerRef}
                  voice={activePatientVoice}
                  avatarCharacter="lisa"
                  avatarStyle="casual-sitting"
                  onSpeakStart={() => setIsAiSpeaking(true)}
                  onSpeakEnd={() => setIsAiSpeaking(false)}
                  onError={(message) => {
                    setIsAiSpeaking(false)
                    setVoiceError(message)
                  }}
                />
              )}
              <SimulationChatInterface
                title="Simulation Chat"
                messages={messages}
                input={input}
                loading={loading}
                error={error}
                voiceError={voiceError}
                onInputChange={setInput}
                onSend={send}
                onEndSession={() => setIsConfirmOpen(true)}
                endSessionLabel={activeSimulationIsPracticeMode ? 'End Practice Session' : 'Complete Simulation'}
                endSessionClassName={activeSimulationIsPracticeMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
                showVoiceButton={true}
                voiceMode={voiceMode}
                onToggleVoiceMode={toggleVoiceMode}
                isListening={isListening}
                isAiSpeaking={isAiSpeaking}
                interactionMode={interactionMode}
                onInteractionModeChange={(mode) => {
                  setInteractionMode(mode)
                  setVoiceError(null)
                }}
              />
            </div>
          </div>
        </div>
        {isNavWarningOpen && (
          <div className="fixed inset-0 z-50">
            <button
              className="absolute inset-0 bg-black/40"
              onClick={() => setIsNavWarningOpen(false)}
              aria-label="Close navigation warning"
            />
            <div className="relative mx-auto mt-24 w-[92%] max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl p-5">
              <h3 className="text-lg font-semibold text-gray-900">Leaving Active Simulation</h3>
              <p className="mt-2 text-sm text-gray-600">
                You are about to leave this active session. What would you like to do?
              </p>
              <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setIsNavWarningOpen(false)
                    await returnToHub()
                  }}
                  className="px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Pause &amp; Return to Hub
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsNavWarningOpen(false)
                    setIsConfirmOpen(true)
                  }}
                  className={`px-3 py-2 rounded-md text-sm text-white ${
                    activeSimulationIsPracticeMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  End Session &amp; Submit
                </button>
                <button
                  type="button"
                  onClick={() => setIsNavWarningOpen(false)}
                  className="px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {isConfirmOpen && (
          <div className="fixed inset-0 z-50">
            <button
              className="absolute inset-0 bg-black/40"
              onClick={() => {
                if (!isCompletingSession) setIsConfirmOpen(false)
              }}
              aria-label="Close confirmation modal"
            />
            <div className="relative mx-auto mt-24 w-[92%] max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl p-5">
              <h3 className="text-lg font-semibold text-gray-900">
                {activeSimulationIsPracticeMode ? 'End Practice Session?' : 'Submit Graded Simulation?'}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {activeSimulationIsPracticeMode
                  ? 'Are you sure you want to end this practice session? You can always start a new one later.'
                  : 'Are you sure you are ready to submit? This is a graded assessment. You will not be able to edit or resume this session once completed.'}
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmOpen(false)}
                  disabled={isCompletingSession}
                  className="px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={completeSimulation}
                  disabled={isCompletingSession}
                  className={`px-3 py-2 rounded-md text-sm text-white disabled:opacity-60 ${
                    activeSimulationIsPracticeMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isCompletingSession
                    ? 'Submitting...'
                    : activeSimulationIsPracticeMode
                      ? 'End Session'
                      : 'Yes, Submit for Grading'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-2xl p-6 sm:p-8 shadow-sm mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Student Learning Hub</h1>
              <p className="mt-2 text-blue-100 text-sm sm:text-base">
                Launch your assigned simulations and review completed scenario transcripts.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <UserBadge />
              <button
                className="px-4 py-2 bg-red-500 text-white text-sm rounded-md hover:bg-red-600"
                onClick={logout}
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="border-b border-gray-200 px-4 sm:px-6 py-3 flex gap-2">
            <button
              onClick={() => setHubTab('active')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                hubTab === 'active' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Active Assignments
            </button>
            <button
              onClick={() => setHubTab('completed')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                hubTab === 'completed' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Completed Scenarios
            </button>
          </div>

          <div className="p-4 sm:p-6">
            {hubLoading && <p className="text-sm text-gray-600">Loading your learning hub...</p>}

            {!hubLoading && hubTab === 'active' && (
              <>
                {activeAssignments.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
                    You have no active assignments right now.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {activeAssignments.map((assignment) => (
                      <div key={assignment.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-semibold text-gray-900 line-clamp-2">{assignment.title}</h3>
                          <span className="shrink-0 rounded-full bg-blue-50 text-blue-700 px-2 py-1 text-xs font-medium">
                            {assignment.isGlobal ? 'Global' : 'Assigned'}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{assignment.description}</p>
                        <button
                          onClick={() => startSimulation(assignment)}
                          className="mt-4 w-full px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700"
                        >
                          Start Simulation
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {!hubLoading && hubTab === 'completed' && (
              <>
                {completedScenarios.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
                    You have not completed any scenarios yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Scenario</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Duration</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Transcript</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Feedback</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {completedScenarios.map((session) => (
                          <tr key={session.sessionId}>
                            <td className="px-4 py-3 text-sm text-gray-700">{formatDate(session.completedAt)}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">{session.scenarioName}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{formatDuration(session.durationSeconds)}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => openTranscript(session)}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                              >
                                Review Transcript
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {session.evaluationStatus === 'published' ? (
                                <button
                                  onClick={() => openFeedback(session)}
                                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700"
                                >
                                  View Instructor Feedback
                                </button>
                              ) : (
                                <span className="text-xs text-gray-500">Not published</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <TranscriptViewer
        open={transcriptOpen}
        sessionId={transcriptSessionId}
        exportStudentName={userName || userId || 'student'}
        exportSimulationTitle={transcriptSimTitle}
        title={transcriptTitle}
        loading={transcriptLoading}
        error={transcriptError}
        messages={transcriptMessages}
        variant="modal"
        onClose={() => setTranscriptOpen(false)}
      />

      {feedbackOpen && (
        <div className="fixed inset-0 z-50">
          <button className="absolute inset-0 bg-black/35" onClick={() => setFeedbackOpen(false)} aria-label="Close feedback" />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white border-l border-gray-200 shadow-xl flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Instructor Feedback</h3>
                <p className="text-sm text-gray-600 truncate">{feedbackTitle}</p>
              </div>
              <button onClick={() => setFeedbackOpen(false)} className="px-3 py-1.5 rounded-md border border-gray-300 text-sm hover:bg-gray-50">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-3">
              {feedbackLoading && <p className="text-sm text-gray-600">Loading feedback...</p>}
              {!feedbackLoading && feedbackError && <p className="text-sm text-red-600">{feedbackError}</p>}
              {!feedbackLoading && !feedbackError && feedbackRows.length === 0 && <p className="text-sm text-gray-600">No published feedback found.</p>}
              {!feedbackLoading && !feedbackError && feedbackRows.map((row, idx) => (
                <div key={`${row.criteriaId}-${idx}`} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-sm font-semibold text-gray-900">{row.criteriaId}</div>
                  <div className={`mt-1 inline-flex px-2 py-1 rounded-full text-xs font-semibold ${row.status === 'Met' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {row.status}
                  </div>
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{row.instructorOverride || row.aiFeedback}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


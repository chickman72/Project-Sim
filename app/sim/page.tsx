"use client"

import React, { useRef, useState } from 'react'
import Link from 'next/link'
import { create } from 'zustand'
import { usePatientVoice } from '../../lib/usePatientVoice'
import TranscriptViewer from '../../components/TranscriptViewer'

type Message = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

type Assignment = {
  id: string
  code: string
  title: string
  description: string
  assignedCohortId?: string
  isGlobal: boolean
}

type CompletedScenario = {
  sessionId: string
  scenarioId?: string
  scenarioName: string
  completedAt: string
  durationSeconds?: number
}

type TranscriptMessage = {
  role: 'student' | 'assistant'
  content: string
  timestamp?: string
}

type Store = {
  systemPrompt: string
  messages: Message[]
  setSystemPrompt: (s: string) => void
  addMessage: (m: Message) => void
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

export default function Page() {
  const systemPrompt = useStore((s) => s.systemPrompt)
  const setSystemPrompt = useStore((s) => s.setSystemPrompt)
  const messages = useStore((s) => s.messages)
  const addMessage = useStore((s) => s.addMessage)
  const clear = useStore((s) => s.clear)

  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'Administrator' | 'Instructor' | 'Student' | null>(null)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  const [hubTab, setHubTab] = useState<'active' | 'completed'>('active')
  const [hubLoading, setHubLoading] = useState(false)
  const [activeAssignments, setActiveAssignments] = useState<Assignment[]>([])
  const [completedScenarios, setCompletedScenarios] = useState<CompletedScenario[]>([])

  const [view, setView] = useState<'hub' | 'chat'>('hub')
  const [activeSimulationCode, setActiveSimulationCode] = useState('')
  const [activeSimulationTitle, setActiveSimulationTitle] = useState('')
  const [activeSimulationDescription, setActiveSimulationDescription] = useState('')
  const [simulationStartedAt, setSimulationStartedAt] = useState<number | null>(null)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)

  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [transcriptTitle, setTranscriptTitle] = useState('')
  const [transcriptMessages, setTranscriptMessages] = useState<TranscriptMessage[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)

  const micStreamRef = useRef<MediaStream | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const micWorkletRef = useRef<AudioWorkletNode | null>(null)
  const micWorkletUrlRef = useRef<string | null>(null)
  const micGainRef = useRef<GainNode | null>(null)

  const {
    connect,
    disconnect,
    sendAudio,
    isSpeaking,
    isPatientSpeaking,
  } = usePatientVoice({
    systemPrompt,
  })

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
          setUserRole(data.role || null)
        }
      } catch {
        // ignore
      }
    })()
  }, [])

  React.useEffect(() => {
    fetchHubData()
  }, [fetchHubData])

  const login = async () => {
    setError(null)
    setAuthLoading(true)
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: loginId, password }),
      })
      const text = await resp.text()
      let data: any = null
      try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
      if (!resp.ok) {
        const detail = data?.error ?? data?.raw ?? `Status ${resp.status}`
        throw new Error(String(detail))
      }

      if (data.requiresPasswordChange) {
        window.location.href = '/reset-password'
        return
      }

      setUserId(String(data.userId || loginId))
      setUserName(data.username || loginId)
      setUserRole(data.role || null)
      setPassword('')
      setView('hub')
      clear()
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const stopMic = React.useCallback(() => {
    if (micProcessorRef.current) {
      micProcessorRef.current.onaudioprocess = null
      micProcessorRef.current.disconnect()
      micProcessorRef.current = null
    }
    if (micWorkletRef.current) {
      micWorkletRef.current.port.onmessage = null
      micWorkletRef.current.disconnect()
      micWorkletRef.current = null
    }
    micSourceRef.current?.disconnect()
    micSourceRef.current = null
    micGainRef.current?.disconnect()
    micGainRef.current = null
    micStreamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop())
    micStreamRef.current = null
    if (micContextRef.current) {
      micContextRef.current.close()
      micContextRef.current = null
    }
    if (micWorkletUrlRef.current) {
      URL.revokeObjectURL(micWorkletUrlRef.current)
      micWorkletUrlRef.current = null
    }
  }, [])

  const logout = async () => {
    setError(null)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      stopMic()
      disconnect()
      setUserId(null)
      setUserName(null)
      setUserRole(null)
      setLoginId('')
      setPassword('')
      setView('hub')
      setActiveSimulationCode('')
      setActiveSimulationTitle('')
      setActiveSimulationDescription('')
      setSimulationStartedAt(null)
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
      setSimulationStartedAt(Date.now())
      setView('chat')
    } catch (err: any) {
      setError(err?.message || 'Failed to start simulation')
    }
  }

  const completeSimulation = async () => {
    if (!activeSimulationCode) return

    try {
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

      stopMic()
      disconnect()
      setVoiceMode(false)
      clear()
      setInput('')
      setView('hub')
      setActiveSimulationCode('')
      setActiveSimulationTitle('')
      setActiveSimulationDescription('')
      setSimulationStartedAt(null)
      await fetchHubData()
    } catch (err: any) {
      setError(err?.message || 'Failed to complete simulation')
    }
  }

  const returnToHub = async () => {
    stopMic()
    disconnect()
    setVoiceMode(false)
    setView('hub')
    clear()
    setInput('')
    await fetchHubData()
  }

  const send = async () => {
    if (!input.trim()) return
    setError(null)
    const userMsg: Message = { role: 'user', content: input }
    const historyToSend = messages.slice()
    addMessage(userMsg)
    setInput('')
    setLoading(true)

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          history: historyToSend,
          userMessage: userMsg.content,
          scenarioId: activeSimulationCode || undefined,
          completionStatus: 'in-progress',
          sessionTags: ['Student'],
        }),
      })

      const text = await resp.text()
      let data: any = null
      try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
      if (!resp.ok) {
        const detail = data?.details ?? data?.error ?? data?.raw ?? `Status ${resp.status}`
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
      }

      if (data?.assistant) {
        addMessage({ role: 'assistant', content: data.assistant })
      } else if (data?.choices?.[0]?.message?.content) {
        addMessage({ role: 'assistant', content: data.choices[0].message.content })
      } else {
        throw new Error('Invalid response from API')
      }
    } catch (err: any) {
      setError(err?.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const startMic = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    micStreamRef.current = stream

    const audioContext: AudioContext = new AudioContext({ sampleRate: 24000 })
    micContextRef.current = audioContext
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const source = audioContext.createMediaStreamSource(stream)
    micSourceRef.current = source

    const gain = (audioContext as any).createGain()
    gain.gain.value = 0
    micGainRef.current = gain

    const useWorklet = 'audioWorklet' in audioContext
    if (useWorklet) {
      const workletCode = `
        class MicProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0]
            if (input && input[0]) {
              this.port.postMessage(input[0])
            }
            return true
          }
        }
        registerProcessor('mic-processor', MicProcessor)
      `
      const blob = new Blob([workletCode], { type: 'application/javascript' })
      const url = URL.createObjectURL(blob)
      micWorkletUrlRef.current = url
      await audioContext.audioWorklet.addModule(url)
      const worklet = new AudioWorkletNode(audioContext, 'mic-processor')
      micWorkletRef.current = worklet
      worklet.port.onmessage = (event) => {
        const inputData = event.data as Float32Array
        const pcm = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i += 1) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        sendAudio(pcm)
      }
      source.connect(worklet)
      ;(worklet as any).connect(gain)
      ;(gain as any).connect((audioContext as any).destination)
      return
    }

    const processor = (audioContext as any).createScriptProcessor(1024, 1, 1)
    micProcessorRef.current = processor
    processor.onaudioprocess = (event: any) => {
      const inputData = event.inputBuffer.getChannelData(0)
      const pcm = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i += 1) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      sendAudio(pcm)
    }

    source.connect(processor)
    processor.connect(gain)
    ;(gain as any).connect((audioContext as any).destination)
  }

  const toggleVoiceMode = async () => {
    if (voiceMode) {
      stopMic()
      disconnect()
      setVoiceMode(false)
      return
    }

    try {
      setVoiceError(null)
      if (!systemPrompt) {
        throw new Error('Scenario prompt not found')
      }
      await connect(systemPrompt)
      await startMic()
      setVoiceMode(true)
    } catch (err: any) {
      stopMic()
      disconnect()
      setVoiceMode(false)
      setVoiceError(err?.message || 'Failed to start microphone')
    }
  }

  React.useEffect(() => {
    return () => {
      stopMic()
      disconnect()
    }
  }, [stopMic, disconnect])

  const openTranscript = async (session: CompletedScenario) => {
    setTranscriptOpen(true)
    setTranscriptTitle(session.scenarioName)
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
      <div className={`${isUserMenuOpen ? 'block' : 'hidden'} absolute right-0 mt-2 w-52 rounded-md bg-white border border-gray-200 shadow-lg p-3 text-sm z-10`}>
        <div className="text-gray-600 font-medium break-all">{userName || loginId || userId}</div>
        <div className="text-gray-500 text-xs">{userRole?.toUpperCase()}</div>
        <button
          className="mt-2 w-full px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          onClick={logout}
        >
          Log Out
        </button>
      </div>
    </div>
  )

  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="max-w-xl w-full bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h1 className="text-2xl font-semibold mb-4 text-gray-900">Student Login</h1>
          {error && <div className="text-red-600 mb-3">{error}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Login ID</label>
              <input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="e.g., student123"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="Enter password"
                type="password"
                autoComplete="current-password"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); login() } }}
              />
            </div>
            <button
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
              onClick={login}
              disabled={authLoading || !loginId.trim() || !password}
            >
              {authLoading ? 'Logging in...' : 'Log In'}
            </button>
            <div className="text-center">
              <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700">
                Forgot Password?
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (userRole && userRole !== 'Student') {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Student Learning Hub</h1>
          <p className="text-gray-600">This dashboard is only available for student accounts.</p>
          <div className="mt-4 flex items-center gap-3">
            <Link href="/config" className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700">
              Go to Instructor Config
            </Link>
            <button className="px-4 py-2 rounded-md bg-gray-200 text-gray-800 text-sm hover:bg-gray-300" onClick={logout}>
              Log Out
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'chat') {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6">
        <div className="max-w-7xl mx-auto h-[calc(100vh-3rem)] grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 mb-2">Simulation Details</h2>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="font-medium text-gray-800">{activeSimulationTitle}</p>
                  <p className="text-gray-500 font-mono">{activeSimulationCode}</p>
                </div>
                {activeSimulationDescription && <p className="text-gray-600 pt-2 whitespace-pre-wrap">{activeSimulationDescription}</p>}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-xs text-gray-600">Logged in as: {userName || userId}</div>
              <button
                className="w-full px-3 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700"
                onClick={completeSimulation}
              >
                Mark Complete
              </button>
              <button
                className="w-full px-3 py-2 bg-gray-200 text-gray-800 rounded-md text-sm hover:bg-gray-300"
                onClick={returnToHub}
              >
                Back to Hub
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col">
            <h2 className="font-semibold mb-2 text-gray-900">Simulation Chat</h2>
            <div className="flex-1 overflow-y-auto p-3 border rounded-md bg-gray-50">
              {messages.length === 0 && <div className="text-sm text-gray-500">No messages yet. Start by sending a message.</div>}
              {messages.map((m: Message, i: number) => (
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
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 p-2 border rounded-md"
                  placeholder="Type a message..."
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                />
                <button
                  className={`px-4 py-2 rounded-md border ${voiceMode ? 'bg-red-600 text-white' : 'bg-white text-gray-800'}`}
                  onClick={toggleVoiceMode}
                  type="button"
                >
                  Speak
                </button>
                <button className="px-4 py-2 bg-green-600 text-white rounded-md" onClick={send} disabled={loading}>
                  {loading ? 'Sending...' : 'Send'}
                </button>
              </div>
              {voiceMode && (
                <div className="mt-2 flex items-center gap-2 text-xs text-red-600">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span>
                    Mic live
                    {isSpeaking ? ' - speaking' : ''}
                    {!isSpeaking && isPatientSpeaking ? ' - responding' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
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
            <UserBadge />
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
                        <p className="mt-2 text-sm text-gray-600 line-clamp-3">{assignment.description}</p>
                        <div className="mt-3 text-xs text-gray-500 font-mono">{assignment.code}</div>
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
        title={transcriptTitle}
        loading={transcriptLoading}
        error={transcriptError}
        messages={transcriptMessages}
        onClose={() => setTranscriptOpen(false)}
      />
    </div>
  )
}

"use client"

import React, { useRef, useState } from 'react'
import { create } from 'zustand'
import { usePatientVoice } from '../../lib/usePatientVoice'

type Message = {
  role: 'user' | 'assistant' | 'system'
  content: string
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
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)

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
      setUserId(String(data.userId || loginId))
      setUserName(data.username || loginId)
      setUserRole(data.role || null)
      setPassword('')
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const logout = async () => {
    setError(null)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setUserId(null)
      setUserName(null)
      setUserRole(null)
      setLoginId('')
      setPassword('')
      clear()
      setSimulationStarted(false)
      setSimulationCode('')
      setTitle('')
      setDescription('')
    }
  }

  const send = async () => {
    if (!input.trim()) return
    setError(null)
    const userMsg: Message = { role: 'user', content: input }
    // capture current history before we optimistically add the user's message
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
          scenarioId: simulationCode || undefined,
          sessionTags: userRole ? [userRole] : undefined,
        }),
      })
      const text = await resp.text()
      let data: any = null
      try { data = text ? JSON.parse(text) : null } catch (e) { data = { raw: text } }
      if (!resp.ok) {
        const detail = data?.details ?? data?.error ?? data?.raw ?? `Status ${resp.status}`
        const detailStr =
          typeof detail === 'string'
            ? detail
            : detail
              ? JSON.stringify(detail)
              : `Status ${resp.status}`
        throw new Error(detailStr)
      }
      if (data?.assistant) {
        addMessage({ role: 'assistant', content: data.assistant })
      } else if (data?.choices?.[0]?.message?.content) {
        addMessage({ role: 'assistant', content: data.choices[0].message.content })
      } else {
        throw new Error('Invalid response from API')
      }
    } catch (err: any) {
      setError(err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const [simulationCode, setSimulationCode] = useState('')
  const [simulationStarted, setSimulationStarted] = useState(false)

  const applyPatientRolePrompt = (prompt: string) => {
    const trimmed = prompt.trim()
    const roleHint =
      [
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

  const startSimulation = async () => {
    if (!simulationCode.trim()) {
      setError('Please enter a simulation code')
      return
    }
    try {
      const resp = await fetch(`/api/setups/${simulationCode.trim().toUpperCase()}`)
      if (!resp.ok) {
        throw new Error('Invalid simulation code or setup not found')
      }
      const setup = await resp.json()
      const basePrompt = setup.prompt || 'You are the patient in this scenario.'
      setSystemPrompt(applyPatientRolePrompt(basePrompt))
      setTitle(setup.title || 'Simulation')
      setDescription(setup.description || '')
      setSimulationStarted(true)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load simulation')
    }
  }

  const loadNewSimulation = () => {
    setError(null)
    clear()
    setSimulationStarted(false)
    setSimulationCode('')
    setTitle('')
    setDescription('')
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
      (gain as any).connect((audioContext as any).destination)
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
    (gain as any).connect((audioContext as any).destination)
  }

  const stopMic = () => {
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
      console.log('[voice] systemPrompt:', systemPrompt)
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
  }, [disconnect])

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
      <div className="h-screen p-6">
        <div className="max-w-xl mx-auto bg-white rounded shadow p-6">
          <h1 className="text-xl font-semibold mb-4">Student Login</h1>
          {error && <div className="text-red-600 mb-3">{error}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Login ID</label>
              <input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="e.g., student123"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter password"
                type="password"
                autoComplete="current-password"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); login() } }}
              />
            </div>
            <button
              className="w-full px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
              onClick={login}
              disabled={authLoading || !loginId.trim() || !password}
            >
              {authLoading ? 'Logging in...' : 'Log In'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!simulationStarted) {
    return (
      <div className="h-screen p-6">
        <div className="max-w-xl mx-auto bg-white rounded shadow p-6">
          <h1 className="text-xl font-semibold mb-4">Enter Simulation Code</h1>
          {error && <div className="text-red-600 mb-3">{error}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Simulation Code</label>
              <input
                value={simulationCode}
                onChange={(e) => setSimulationCode(e.target.value.toUpperCase())}
                className="w-full p-2 border rounded"
                placeholder="Enter code from instructor"
              />
            </div>
            <button
              className="w-full px-4 py-2 bg-green-600 text-white rounded"
              onClick={startSimulation}
            >
              Start Simulation
            </button>
          </div>
           <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserBadge />
              <span className="text-xs text-gray-600">Logged in as: {userName || userId}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }


  return (
    <div className="h-screen p-6">
      <div className="max-w-7xl mx-auto h-full grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="md:col-span-1 bg-white rounded shadow p-4 flex flex-col justify-between">
          <div>
            <h2 className="font-semibold mb-2">Simulation Details</h2>
            <div className="space-y-2 text-sm">
              <div>
                <p className="font-medium text-gray-800">{title}</p>
                <p className="text-gray-500 font-mono">{simulationCode}</p>
              </div>
              {description && <p className="text-gray-600 pt-2 whitespace-pre-wrap">{description}</p>}
            </div>
          </div>
           <div className="mt-4">
            <div className="text-xs text-gray-600 mb-2">Logged in as: {userName || userId}</div>
            <div className="flex items-center space-x-2">
               <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700" onClick={loadNewSimulation}>
                Load New Sim
              </button>
              <button className="px-3 py-1 bg-gray-700 text-white rounded text-sm hover:bg-gray-800" onClick={logout}>
                Log Out
              </button>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 bg-white rounded shadow p-4 flex flex-col">
          <h2 className="font-semibold mb-2">Simulation Log</h2>
          <div className="flex-1 overflow-y-auto p-2 border rounded bg-gray-50">
            {messages.length === 0 && <div className="text-sm text-gray-500">No messages yet. Start by sending a message.</div>}
            {messages.map((m: Message, i: number) => (
              <div key={i} className={`mb-3 ${m.role === 'assistant' ? 'text-left' : 'text-right'}`}>
                <div className={`inline-block px-3 py-2 rounded-lg ${m.role === 'assistant' ? 'bg-gray-200' : 'bg-blue-500 text-white'}`}>
                  <div className="text-sm">{m.content}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            {error && <div className="text-red-600 mb-2">{error}</div>}
            {voiceError && <div className="text-red-600 mb-2">{voiceError}</div>}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 p-2 border rounded"
                placeholder="Type a message..."
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              />
              <button
                className={`px-4 py-2 rounded border ${voiceMode ? 'bg-red-600 text-white' : 'bg-white text-gray-800'}`}
                onClick={toggleVoiceMode}
                type="button"
              >
                Speak to the Patient
              </button>
              <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={send} disabled={loading}>
                {loading ? 'Sending...' : 'Text with the Patient'}
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

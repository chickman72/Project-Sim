"use client"

import React, { useState } from 'react'
import create from 'zustand'

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
  systemPrompt: 'You are a helpful assistant.',
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
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  React.useEffect(() => {
    ;(async () => {
      try {
        const resp = await fetch('/api/auth/me')
        if (!resp.ok) return
        const data = await resp.json()
        if (data?.userId) setUserId(String(data.userId))
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
      setLoginId('')
      setPassword('')
      clear()
      setSimulationStarted(false)
      setSimulationCode('')
      setTitle('')
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
        body: JSON.stringify({ systemPrompt, history: historyToSend, userMessage: userMsg.content }),
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

  const startSimulation = () => {
    const storedSetup = localStorage.getItem(simulationCode)
    if (storedSetup) {
      try {
        // Handle new JSON-based setup
        const setup = JSON.parse(storedSetup)
        setSystemPrompt(setup.prompt || 'You are a helpful assistant.')
        setTitle(setup.title || 'Simulation')
      } catch (e) {
        // Handle old string-based setup for backward compatibility
        setSystemPrompt(storedSetup)
        setTitle('Simulation')
      }
      setSimulationStarted(true)
      setError(null)
    } else {
      setError('Invalid simulation code')
    }
  }

  const loadNewSimulation = () => {
    setError(null)
    clear()
    setSimulationStarted(false)
    setSimulationCode('')
    setTitle('')
  }

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
            <div className="text-xs text-gray-600">Logged in as: {userId}</div>
            <button className="px-3 py-1 bg-gray-700 text-white rounded" onClick={logout}>
              Log Out
            </button>
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
              <p className="text-gray-600 pt-2">You are participating in a simulation. Follow the instructions provided by the scenario.</p>
            </div>
          </div>
           <div className="mt-4">
            <div className="text-xs text-gray-600 mb-2">Logged in as: {userId}</div>
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
            {messages.map((m, i) => (
              <div key={i} className={`mb-3 ${m.role === 'assistant' ? 'text-left' : 'text-right'}`}>
                <div className={`inline-block px-3 py-2 rounded-lg ${m.role === 'assistant' ? 'bg-gray-200' : 'bg-blue-500 text-white'}`}>
                  <div className="text-sm">{m.content}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            {error && <div className="text-red-600 mb-2">{error}</div>}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 p-2 border rounded"
                placeholder="Type a message..."
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              />
              <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={send} disabled={loading}>
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

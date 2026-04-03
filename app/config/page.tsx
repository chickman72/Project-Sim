"use client"

import React, { useState, useEffect } from 'react'
import create from 'zustand'

type Store = {
  systemPrompt: string
  setSystemPrompt: (s: string) => void
}

const useStore = create<Store>((set) => ({
  systemPrompt: 'You are the patient in this scenario. Respond in English only.',
  setSystemPrompt: (s) => set({ systemPrompt: s }),
}))

export default function Page() {
  const systemPrompt = useStore((s) => s.systemPrompt)
  const setSystemPrompt = useStore((s) => s.setSystemPrompt)

  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'Administrator' | 'Instructor' | 'Student' | null>(null)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [simulationCode, setSimulationCode] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [setups, setSetups] = useState<{ code: string; prompt: string; title: string; description: string }[]>([])

  useEffect(() => {
    if (!userId) {
      setSetups([])
      return
    }
    ;(async () => {
      try {
        const resp = await fetch('/api/setups')
        if (resp.ok) {
          const data = await resp.json()
          const setupsWithTitles = data.map((s: any) => ({ ...s, title: s.title || '', description: s.description || '' }))
          setSetups(setupsWithTitles)
        }
      } catch {
        // ignore
      }
    })()
  }, [userId])

  useEffect(() => {
    ;(async () => {
      try {
        const resp = await fetch('/api/auth/me')
        if (!resp.ok) {
          setError('Not authenticated')
          return
        }
        const data = await resp.json()
        if (!data?.userId) {
          setError('Not authenticated')
          return
        }
        if (data.role === 'Student') {
          setError('Access denied. Instructor or Administrator role required.')
          return
        }
        setUserId(String(data.userId))
        setUserName(data.username || String(data.userId))
        setUserRole(data.role || null)
      } catch {
        setError('Not authenticated')
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
    }
  }

  const saveSetup = async () => {
    const codeToUse = simulationCode || Math.random().toString(36).substring(2, 8).toUpperCase()
    const setupData = { code: codeToUse, title, description, prompt: systemPrompt }
    
    try {
      const resp = await fetch('/api/setups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupData)
      })
      if (!resp.ok) throw new Error('Failed to save setup')
      
      const newSetups = setups.filter(s => s.code !== codeToUse)
      newSetups.push(setupData)
      setSetups(newSetups)
      setSimulationCode(codeToUse)
      setIsDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving setup')
    }
  }

  const deleteSetup = async (code: string) => {
    try {
      const resp = await fetch(`/api/setups/${code}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error('Failed to delete setup')
      const newSetups = setups.filter((setup) => setup.code !== code)
      setSetups(newSetups)
      if (simulationCode === code) {
        setSystemPrompt('')
        setTitle('')
        setDescription('')
        setSimulationCode(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting setup')
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

  if (!userId || userRole === 'Student') {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-6">Instructor Login</h1>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Login ID</label>
              <input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., instructor"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
                type="password"
                autoComplete="current-password"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); login() } }}
              />
            </div>
            <button
              className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              onClick={login}
              disabled={authLoading || !loginId.trim() || !password}
            >
              {authLoading ? 'Logging in...' : 'Log In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Instructor Configuration</h1>
          <div className="flex items-center gap-3">
            <UserBadge />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Simulation Setup</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    setIsDirty(true)
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                  placeholder="e.g., Customer Service Simulation"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    setIsDirty(true)
                  }}
                  className="w-full h-24 p-4 border rounded-md resize-y focus:ring-2 focus:ring-blue-500 mb-4"
                  placeholder="e.g., You will play the role of a nurse talking to a patient..."
                />
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-1">Scenario Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => {
                  setSystemPrompt(e.target.value)
                  setIsDirty(true)
                }}
                className="w-full h-64 p-4 border rounded-md resize-y focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., You are a customer service representative for a clothing store..."
              />
              {isDirty && (
                <div className="mt-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4" role="alert">
                  <p className="font-bold">Warning</p>
                  <p>You have unsaved changes to the simulation setup. Save the setup to apply them.</p>
                </div>
              )}
              <button
                className="mt-6 w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors"
                onClick={saveSetup}
              >
                {simulationCode ? 'Save Changes' : 'Save as New Setup'}
              </button>
              <button
                className="mt-2 w-full px-6 py-3 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300 transition-colors"
                onClick={() => {
                  setSystemPrompt('')
                  setTitle('')
                  setDescription('')
                  setSimulationCode(null)
                  setIsDirty(false)
                }}
              >
                Create New
              </button>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Previous Setups</h2>
              {setups.length > 0 ? (
                <ul className="space-y-4">
                  {setups.map((setup) => (
                    <li key={setup.code} className="bg-white rounded-lg shadow-md p-4 flex items-start justify-between">
                      <div className="flex-grow min-w-0 mr-4">
                        <p className="font-semibold text-gray-800">{setup.title || 'Untitled'}</p>
                        <p className="font-mono text-sm text-gray-500">{setup.code}</p>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap break-words mt-2">{setup.prompt}</p>
                      </div>
                      <div className="flex-shrink-0 flex items-center space-x-2">
                        <button
                          className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600"
                          onClick={() => {
                            setSystemPrompt(setup.prompt)
                            setTitle(setup.title || '')
                            setDescription(setup.description || '')
                            setSimulationCode(setup.code)
                            setIsDirty(false)
                          }}
                        >
                          Select
                        </button>
                        <button
                          className="p-1 rounded-md hover:bg-red-100"
                          onClick={() => deleteSetup(setup.code)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">No previous setups found.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client"

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function Page() {
  const router = useRouter()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === '1') {
      setSuccessMessage(params.get('message') || 'Registration successful. Please log in.')
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const resp = await fetch('/api/auth/me')
        if (!resp.ok) return
        const data = await resp.json()
        if (!data?.role) return

        if (data.role === 'Student') {
          router.replace('/sim')
          return
        }
        if (data.role === 'Instructor') {
          router.replace('/config')
          return
        }
        if (data.role === 'Administrator') {
          router.replace('/admin')
          return
        }
      } finally {
        setCheckingSession(false)
      }
    })()
  }, [router])

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

      const redirectTo = typeof data?.redirectTo === 'string' ? data.redirectTo : '/sim'
      router.replace(redirectTo)
    } catch (err: any) {
      setError(err?.message || 'Login failed')
    } finally {
      setAuthLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <h1 className="text-xl font-semibold text-gray-900">Loading...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-6">Sign In</h1>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-md mb-6" role="alert">
            <span className="block sm:inline">{successMessage}</span>
          </div>
        )}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Login ID or Email</label>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., student@school.edu"
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

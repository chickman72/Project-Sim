"use client"

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import BrandLoader from '../components/BrandLoader'
import BrandWordmark from '../components/BrandWordmark'

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
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = { raw: text }
      }

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <BrandWordmark className="text-2xl" />
          <BrandLoader centered className="mt-6" label="Checking your session..." />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 md:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-10 bg-white">
        <div className="w-full max-w-md">
          <BrandWordmark className="text-3xl" />
          <p className="mt-3 text-sm text-slate-600">Sign in to continue to your workspace.</p>

          {error && (
            <div className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              <span>{error}</span>
            </div>
          )}
          {successMessage && (
            <div className="mt-6 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="alert">
              <span>{successMessage}</span>
            </div>
          )}

          <div className="mt-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Login ID or Email</label>
              <input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g., student@school.edu"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter password"
                type="password"
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    login()
                  }
                }}
              />
            </div>
            <button
              className="w-full px-4 py-2.5 bg-brand-600 text-white font-semibold rounded-md hover:bg-brand-700 disabled:opacity-50 transition-colors"
              onClick={login}
              disabled={authLoading || !loginId.trim() || !password}
            >
              {authLoading ? 'Signing in...' : 'Sign In'}
            </button>
            <div className="text-center">
              <Link href="/forgot-password" className="text-sm text-brand-600 hover:text-brand-700">
                Forgot Password?
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center justify-center bg-brand-700 px-10">
        <div className="max-w-md text-left text-white">
          <p className="text-brand-100 text-sm uppercase tracking-[0.18em]">Cognitive Clinicals</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight">The Universal Educational AI Layer.</h2>
          <p className="mt-4 text-sm text-brand-100">
            Trusted clinical simulation and course intelligence built for modern institutions.
          </p>
        </div>
      </div>
    </div>
  )
}

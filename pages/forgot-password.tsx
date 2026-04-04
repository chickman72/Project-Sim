'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail })
      })

      const data = await res.json()

      if (res.ok) {
        setSuccess(true)
        setUsernameOrEmail('')

        // In development, show reset link
        if (data.resetLink) {
          // Automatically redirect after 3 seconds
          setTimeout(() => {
            window.location.href = data.resetLink
          }, 3000)
        }
      } else {
        setError(data.error || 'Failed to process request')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process request')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h1>
            <p className="text-gray-600 mb-6">
              If an account exists with that username or email, we've sent a password reset link. Check your email and click the link to reset your password.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              The link will expire in 1 hour.
            </p>
            <Link
              href="/sim"
              className="inline-block px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">Forgot Password?</h1>
        <p className="text-center text-sm text-gray-600 mb-6">
          Enter your username or email address and we'll send you a link to reset your password.
        </p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username or Email</label>
            <input
              type="text"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., john@example.com or johndoe"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !usernameOrEmail.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Remember your password?{' '}
            <Link href="/sim" className="text-blue-600 hover:text-blue-700 font-medium">
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

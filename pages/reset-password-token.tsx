'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

export default function ResetPasswordTokenPage() {
  const router = useRouter()
  const { token } = router.query
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)

  useEffect(() => {
    if (!token) return

    // Verify token validity
    const verifyToken = async () => {
      try {
        const res = await fetch(`/api/auth/verify-reset-token?token=${token}`)
        if (res.ok) {
          setTokenValid(true)
        } else {
          setTokenValid(false)
          setError('Reset link is invalid or has expired.')
        }
      } catch (err) {
        setTokenValid(false)
        setError('Failed to verify reset link.')
      }
    }

    verifyToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      })

      if (res.ok) {
        setSuccess(true)
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/sim')
        }, 2000)
      } else {
        const errorData = await res.json().catch(() => ({}))
        setError(errorData.error || 'Failed to reset password')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  if (tokenValid === null) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Verifying reset link...</div>
      </div>
    )
  }

  if (tokenValid === false) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Link Expired</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => router.push('/forgot-password')}
              className="inline-block px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors"
            >
              Request New Link
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Password Reset Successful</h1>
            <p className="text-gray-600 mb-4">Your password has been changed. Redirecting to login...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">Reset Password</h1>
        <p className="text-center text-sm text-gray-600 mb-6">Enter your new password below.</p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter new password"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Confirm new password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

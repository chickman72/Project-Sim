'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import AnalyticsDashboard from '../../components/AnalyticsDashboard'

export default function AdminAnalyticsPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const resp = await fetch('/api/auth/me')
        if (!resp.ok) {
          router.replace('/')
          return
        }
        const data = await resp.json()
        if (data?.role !== 'Administrator') {
          router.replace('/')
          return
        }
        setAllowed(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  if (loading || !allowed) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-semibold text-center text-gray-900 mb-2">Redirecting...</h1>
          <p className="text-sm text-gray-600 text-center">Taking you to the main login page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <AnalyticsDashboard />
        </div>
      </div>
    </div>
  )
}

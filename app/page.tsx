"use client"

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Page() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/config')
  }, [router])

  return (
    <div className="h-screen p-6">
      <div className="max-w-xl mx-auto bg-white rounded shadow p-6">
        <h1 className="text-xl font-semibold mb-4">Redirecting...</h1>
      </div>
    </div>
  )
}
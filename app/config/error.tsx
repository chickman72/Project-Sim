'use client'

import { useEffect } from 'react'

type ConfigErrorBoundaryProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ConfigErrorBoundary({ error, reset }: ConfigErrorBoundaryProps) {
  useEffect(() => {
    console.error('[config] Server Components render failed', {
      digest: error.digest,
      message: error.message,
      name: error.name,
      stack: error.stack,
      error,
    })
  }, [error])

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-red-900">Configuration failed to render</h1>
        <p className="mt-3 text-sm text-slate-700">
          The browser console includes the Server Components error digest for this failure.
        </p>
        {error.digest ? (
          <p className="mt-3 break-all rounded border border-red-100 bg-red-50 p-3 font-mono text-xs text-red-900">
            Digest: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Try again
        </button>
      </div>
    </main>
  )
}

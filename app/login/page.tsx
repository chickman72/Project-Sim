import Link from 'next/link'

type LoginPageProps = {
  searchParams?: Promise<{ success?: string; message?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sp = searchParams ? await searchParams : undefined
  const success = sp?.success === '1'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-semibold text-gray-900">Login</h1>

        {success && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {sp?.message || 'Registration successful. Please log in.'}
          </div>
        )}

        <p className="mt-4 text-sm text-gray-600">
          Student sign-in is available on the Simulation page.
        </p>

        <Link
          href="/sim"
          className="mt-5 inline-flex px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Go to Student Login
        </Link>
      </div>
    </div>
  )
}

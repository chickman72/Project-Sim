import Link from 'next/link'
import { getCohortById } from '../../../lib/cohort'
import { registerStudentForCohort } from './actions'

type RegisterPageProps = {
  params: Promise<{ cohortId: string }>
  searchParams?: Promise<{ error?: string }>
}

export default async function RegisterPage({ params, searchParams }: RegisterPageProps) {
  const { cohortId } = await params
  const sp = searchParams ? await searchParams : undefined
  const cohort = await getCohortById(cohortId)

  if (!cohort) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h1 className="text-xl font-semibold text-gray-900">Invalid Invite Link</h1>
          <p className="mt-2 text-sm text-gray-600">This class registration link is not valid or has expired.</p>
          <Link href="/sim" className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-700">
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  const action = registerStudentForCohort.bind(null, cohortId)

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-semibold text-gray-900">Register for {cohort.name}</h1>
        <p className="mt-2 text-sm text-gray-600">Create your student account to join this class.</p>

        {sp?.error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {sp.error}
          </div>
        )}

        <form action={action} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Jane Student"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="student@school.edu"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Re-enter password"
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700"
          >
            Create Account
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500">Already have an account? Use the login page to sign in.</p>
      </div>
    </div>
  )
}

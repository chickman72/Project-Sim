import Link from 'next/link'
import { getPendingInvite } from '../../../config/user-actions'
import { completeInvitedUserRegistration } from './actions'

type InvitePageProps = {
  params: Promise<{ token: string }>
  searchParams?: Promise<{ error?: string }>
}

export default async function InviteRegistrationPage({ params, searchParams }: InvitePageProps) {
  const { token } = await params
  const sp = searchParams ? await searchParams : undefined
  const invite = await getPendingInvite(token)

  if (!invite) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h1 className="text-xl font-semibold text-gray-900">Invite Link Invalid</h1>
          <p className="mt-2 text-sm text-gray-600">This invite link is invalid or has expired.</p>
          <Link href="/login" className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-700">
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  const action = completeInvitedUserRegistration.bind(null, token)

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-semibold text-gray-900">Complete Account Setup</h1>
        <p className="mt-2 text-sm text-gray-600">You were invited as a {invite.role}.</p>

        {sp?.error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {sp.error}
          </div>
        )}

        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p>
            <span className="font-medium">Email:</span> {invite.email}
          </p>
          <p className="mt-1">
            <span className="font-medium">Cohorts:</span> {invite.cohorts.join(', ')}
          </p>
        </div>

        <form action={action} className="mt-6 space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Jane Student"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
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
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
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
            Activate Account
          </button>
        </form>
      </div>
    </div>
  )
}

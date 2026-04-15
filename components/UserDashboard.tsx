'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { generateUserInvite, getUsersByCohort, updateUserCohorts, type UserDashboardItem } from '../app/config/user-actions'

type InviteRole = 'student' | 'instructor' | 'admin'
type UserDashboardProps = {
  currentUserRole?: 'Administrator' | 'Instructor' | 'Student' | null
}

const parseCohortInput = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  )

const stringifyCohorts = (cohorts: string[]) => cohorts.join(', ')

export default function UserDashboard({ currentUserRole = null }: UserDashboardProps) {
  const [users, setUsers] = useState<UserDashboardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editingUser, setEditingUser] = useState<UserDashboardItem | null>(null)
  const [editingCohorts, setEditingCohorts] = useState('')
  const [isSavingCohorts, setIsSavingCohorts] = useState(false)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('student')
  const [inviteCohorts, setInviteCohorts] = useState('global')
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false)
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null)
  const [generatedInviteExpiry, setGeneratedInviteExpiry] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await getUsersByCohort()
      setUsers(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const cohortNameToIdMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const user of users) {
      user.cohorts.forEach((id, index) => {
        const display = String(user.cohortDisplayNames[index] || '').trim().toLowerCase()
        const cohortId = String(id || '').trim()
        if (display && cohortId && !map.has(display)) {
          map.set(display, cohortId)
        }
      })
    }
    return map
  }, [users])

  const openEditModal = (user: UserDashboardItem) => {
    setEditingUser(user)
    setEditingCohorts(stringifyCohorts(user.cohortDisplayNames))
  }

  const closeEditModal = () => {
    setEditingUser(null)
    setEditingCohorts('')
    setIsSavingCohorts(false)
  }

  const handleSaveCohorts = async () => {
    if (!editingUser) return
    try {
      setIsSavingCohorts(true)
      setError(null)
      const parsed = parseCohortInput(editingCohorts)
      const normalizedForSave = parsed.map((tag) => {
        const trimmed = tag.trim()
        if (!trimmed) return trimmed
        if (trimmed === 'global') return 'global'
        return cohortNameToIdMap.get(trimmed.toLowerCase()) || trimmed
      })
      const updated = await updateUserCohorts(editingUser.id, normalizedForSave)
      setUsers((prev) => prev.map((user) => (user.id === updated.id ? updated : user)))
      closeEditModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user cohorts')
      setIsSavingCohorts(false)
    }
  }

  const closeInviteModal = () => {
    setInviteOpen(false)
    setInviteEmail('')
    setInviteRole('student')
    setInviteCohorts('global')
    setGeneratedInviteLink(null)
    setGeneratedInviteExpiry(null)
    setCopyStatus(null)
    setIsGeneratingInvite(false)
  }

  const handleGenerateInvite = async () => {
    try {
      setIsGeneratingInvite(true)
      setError(null)
      setCopyStatus(null)
      const result = await generateUserInvite(inviteEmail, inviteRole, parseCohortInput(inviteCohorts))
      setGeneratedInviteLink(result.inviteUrl)
      setGeneratedInviteExpiry(result.expiresAt)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite')
    } finally {
      setIsGeneratingInvite(false)
    }
  }

  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.email.localeCompare(b.email)), [users])

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">User Management</h2>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700"
        >
          Invite New User
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-600">Loading users...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Email</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Role</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Cohorts</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-sm text-gray-500 text-center">
                    No users found.
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user) => (
                  <tr key={user.id} className="border-t border-gray-200">
                    <td className="px-3 py-2 text-sm text-gray-800">{user.email}</td>
                    <td className="px-3 py-2 text-sm text-gray-700 capitalize">{user.role}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {user.cohortDisplayNames.map((cohortName, index) => (
                          <span
                            key={`${user.id}-${user.cohorts[index] || cohortName}-${index}`}
                            className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800"
                            title={user.cohorts[index] || cohortName}
                          >
                            {cohortName}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Edit Cohorts</h3>
            <p className="mt-1 text-sm text-gray-600">{editingUser.email}</p>
            <label className="block mt-4 text-sm font-medium text-gray-700">Cohort Tags (comma separated)</label>
            <input
              value={editingCohorts}
              onChange={(e) => setEditingCohorts(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="global, summer-2026-NAI611"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isSavingCohorts}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCohorts}
                disabled={isSavingCohorts}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
              >
                {isSavingCohorts ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Invite New User</h3>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="student@example.edu"
                  disabled={Boolean(generatedInviteLink)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={Boolean(generatedInviteLink)}
                >
                  <option value="student">Student</option>
                  <option value="instructor">Instructor</option>
                  {currentUserRole === 'Administrator' && <option value="admin">Admin</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Cohort Tags (comma separated)</label>
                <input
                  value={inviteCohorts}
                  onChange={(e) => setInviteCohorts(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="global, summer-2026-NAI611"
                  disabled={Boolean(generatedInviteLink)}
                />
              </div>
            </div>

            {generatedInviteLink && (
              <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-sm font-medium text-green-800">Invite Link Generated</p>
                <p className="mt-1 text-xs text-green-700 break-all">{generatedInviteLink}</p>
                {generatedInviteExpiry && <p className="mt-1 text-xs text-green-700">Expires: {new Date(generatedInviteExpiry).toLocaleString()}</p>}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(generatedInviteLink)
                        setCopyStatus('Copied')
                      } catch {
                        setCopyStatus('Copy failed')
                      }
                    }}
                    className="px-3 py-1.5 text-xs rounded-md bg-green-700 text-white hover:bg-green-800"
                  >
                    Copy to Clipboard
                  </button>
                  {copyStatus && <span className="text-xs text-green-700">{copyStatus}</span>}
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeInviteModal}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                {generatedInviteLink ? 'Close' : 'Cancel'}
              </button>
              {!generatedInviteLink && (
                <button
                  type="button"
                  onClick={handleGenerateInvite}
                  disabled={isGeneratingInvite}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
                >
                  {isGeneratingInvite ? 'Generating...' : 'Generate Invite Link'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

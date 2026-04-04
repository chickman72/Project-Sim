'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import AnalyticsDashboard from '../components/AnalyticsDashboard'

interface User {
  id: string
  username: string
  role: 'Administrator' | 'Instructor' | 'Student'
  createdAt: string
  updatedAt: string
}

interface Simulation {
  id: string
  code: string
  title: string
  description: string
  prompt: string
  userId: string
  username: string
  updatedAt: string
  assignedCohortId?: string
}

export default function AdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [simulations, setSimulations] = useState<Simulation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({ username: '', password: '', role: 'Administrator' as 'Administrator' | 'Instructor' | 'Student' })
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'Administrator' | 'Instructor' | 'Student' | null>(null)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'users' | 'analytics' | 'simulations'>('users')
  const [selectedSimulation, setSelectedSimulation] = useState<Simulation | null>(null)
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [showBulkImportModal, setShowBulkImportModal] = useState(false)
  const [bulkImportRole, setBulkImportRole] = useState<'Student' | 'Instructor' | 'Administrator'>('Student')
  const [importLoading, setImportLoading] = useState(false)
  const [importResults, setImportResults] = useState<any | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const resp = await fetch('/api/auth/me')
      if (resp.ok) {
        const data = await resp.json()
        if (data?.userId && data?.role === 'Administrator') {
          setUserId(data.userId)
          setUserName(data.username || data.userId)
          setUserRole(data.role)
          fetchUsers()
          fetchSimulations()
        } else {
          setLoading(false)
        }
      } else {
        setLoading(false)
      }
    } catch {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      } else if (res.status === 403) {
        setError('Access denied. Administrator role required.')
      } else {
        setError('Failed to load users')
      }
    } catch (err) {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const fetchSimulations = async () => {
    try {
      const res = await fetch('/api/admin/simulations')
      if (res.ok) {
        const data = await res.json()
        setSimulations(data)
      } else if (res.status === 403) {
        setError('Access denied. Administrator role required.')
      } else {
        setError('Failed to load simulations')
      }
    } catch (err) {
      setError('Failed to load simulations')
    }
  }

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
      try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
      if (!resp.ok) {
        const detail = data?.error ?? data?.raw ?? `Status ${resp.status}`
        throw new Error(String(detail))
      }
      if (data.role !== 'Administrator') {
        throw new Error('Access denied. Administrator role required.')
      }
      
      // Check if user needs to reset password
      if (data.requiresPasswordChange) {
        // Redirect to password reset page instead of logging in
        router.push('/reset-password')
        return
      }

      setUserId(String(data.userId || loginId))
      setUserName(data.username || loginId)
      setUserRole(data.role)
      setPassword('')
      fetchUsers()
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const logout = async () => {
    setError(null)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setUserId(null)
      setUserName(null)
      setUserRole(null)
      setLoginId('')
      setPassword('')
      setUsers([])
      setShowAddForm(false)
      setEditingUser(null)
      setFormData({ username: '', password: '', role: 'Student' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.username || (!editingUser && !formData.password)) return

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users'
      const method = editingUser ? 'PUT' : 'POST'
      const body = editingUser
        ? { username: formData.username, role: formData.role, ...(formData.password && { password: formData.password }) }
        : formData

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        await fetchUsers()
        setShowAddForm(false)
        setEditingUser(null)
        setFormData({ username: '', password: '', role: 'Student' })
      } else {
        const errorData = await res.json().catch(() => ({}))
        setError(errorData.error || `Failed to save user (${res.status})`)
      }
    } catch (err) {
      setError('Failed to save user')
    }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({ username: user.username, password: '', role: user.role })
    setShowAddForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return

    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchUsers()
      } else {
        setError('Failed to delete user')
      }
    } catch (err) {
      setError('Failed to delete user')
    }
  }

  const handleDeleteSimulation = async (code: string) => {
    if (!confirm('Are you sure you want to delete this simulation? This action cannot be undone.')) return

    try {
      const res = await fetch(`/api/admin/simulations?code=${code}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchSimulations()
      } else {
        setError('Failed to delete simulation')
      }
    } catch (err) {
      setError('Failed to delete simulation')
    }
  }

  const handleViewPrompt = (simulation: Simulation) => {
    setSelectedSimulation(simulation)
    setShowPromptModal(true)
  }

  const closePromptModal = () => {
    setShowPromptModal(false)
    setSelectedSimulation(null)
  }

  const resetForm = () => {
    setShowAddForm(false)
    setEditingUser(null)
    setFormData({ username: '', password: '', role: 'Administrator' })
  }

  const handleBulkImport = async (file: File) => {
    setImportLoading(true)
    setImportResults(null)
    setError(null)

    try {
      const csvContent = await file.text()
      const res = await fetch('/api/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent, role: bulkImportRole })
      })

      if (res.ok) {
        const results = await res.json()
        setImportResults(results)
        await fetchUsers()
      } else {
        const errorData = await res.json().catch(() => ({}))
        setError(errorData.error || 'Failed to import users')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import users')
    } finally {
      setImportLoading(false)
    }
  }

  if (!userId) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-6">Administrator Login</h1>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Login ID</label>
              <input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., admin"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
                type="password"
                autoComplete="current-password"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); login() } }}
              />
            </div>
            <button
              className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              onClick={login}
              disabled={authLoading || !loginId.trim() || !password}
            >
              {authLoading ? 'Logging in...' : 'Log In'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const initials = userName ? userName.charAt(0).toUpperCase() : userId ? userId.charAt(0).toUpperCase() : ''

  const UserBadge = () => (
    <div
      className="relative inline-block text-left"
      onMouseEnter={() => setIsUserMenuOpen(true)}
      onMouseLeave={() => setIsUserMenuOpen(false)}
    >
      <div className="cursor-pointer">
        <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">{initials}</div>
      </div>
      <div className={`${isUserMenuOpen ? 'block' : 'hidden'} absolute right-0 mt-2 w-52 rounded-md bg-white border border-gray-200 shadow-lg p-3 text-sm z-10`}>
        <div className="text-gray-600 font-medium break-all">{userName || userId}</div>
        <div className="text-gray-500 text-xs">{(userRole || '').toUpperCase()}</div>
        <button
          className="mt-2 w-full px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          onClick={logout}
        >
          Log Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Console</h1>
              <p className="text-sm text-gray-500">Manage users or review simulation session analytics.</p>
            </div>
            <div className="flex items-center gap-3">
              <UserBadge />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 rounded-md border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`${activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'} rounded-md px-4 py-2 font-medium transition`}
            >
              Users
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('simulations')}
              className={`${activeTab === 'simulations' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'} rounded-md px-4 py-2 font-medium transition`}
            >
              Simulations
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`${activeTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'} rounded-md px-4 py-2 font-medium transition`}
            >
              Analytics
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {activeTab === 'users' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Users</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Add User
                  </button>
                  <button
                    onClick={() => setShowBulkImportModal(true)}
                    className="px-4 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors"
                  >
                    Bulk Import CSV
                  </button>
                </div>
              </div>

              {loading ? (
                <div>Loading...</div>
              ) : (
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 p-2 text-left">Username</th>
                      <th className="border border-gray-300 p-2 text-left">Role</th>
                      <th className="border border-gray-300 p-2 text-left">Created</th>
                      <th className="border border-gray-300 p-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id}>
                        <td className="border border-gray-300 p-2">{user.username}</td>
                        <td className="border border-gray-300 p-2">{user.role}</td>
                        <td className="border border-gray-300 p-2">{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td className="border border-gray-300 p-2">
                          <button
                            onClick={() => handleEdit(user)}
                            className="px-3 py-1 bg-yellow-500 text-white text-sm rounded-md hover:bg-yellow-600 mr-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            {showAddForm && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4">{editingUser ? 'Edit User' : 'Add User'}</h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required={!editingUser}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value as 'Administrator' | 'Instructor' | 'Student' })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Student">Student</option>                    <option value="Instructor">Instructor</option>                      <option value="Administrator">Administrator</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 px-4 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors">
                      {editingUser ? 'Update' : 'Create'}
                    </button>
                    <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300 transition-colors">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
        ) : activeTab === 'simulations' ? (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Simulations</h2>
              <button
                type="button"
                onClick={fetchSimulations}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
            {loading ? (
              <div>Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 p-2 text-left">Created By</th>
                      <th className="border border-gray-300 p-2 text-left">Title</th>
                      <th className="border border-gray-300 p-2 text-left">Code</th>
                      <th className="border border-gray-300 p-2 text-left">Description</th>
                      <th className="border border-gray-300 p-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulations.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="border border-gray-300 p-4 text-center text-gray-500">
                          No simulations found.
                        </td>
                      </tr>
                    ) : (
                      simulations.map(simulation => (
                        <tr key={simulation.id}>
                          <td className="border border-gray-300 p-2">{simulation.username}</td>
                          <td className="border border-gray-300 p-2">{simulation.title || 'Untitled'}</td>
                          <td className="border border-gray-300 p-2 font-mono">{simulation.code}</td>
                          <td className="border border-gray-300 p-2 max-w-xs truncate">{simulation.description || ''}</td>
                          <td className="border border-gray-300 p-2">
                            <button
                              onClick={() => handleViewPrompt(simulation)}
                              className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 mr-2"
                            >
                              View Prompt
                            </button>
                            <button
                              onClick={() => handleDeleteSimulation(simulation.code)}
                              className="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <AnalyticsDashboard />
            </div>
          </div>
        )}
      </div>

      {/* Bulk Import Modal */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Bulk Import Users from CSV</h3>
              <button
                type="button"
                onClick={() => {
                  setShowBulkImportModal(false)
                  setImportResults(null)
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto px-6 py-4">
              {!importResults ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-3">
                      Upload a CSV file with columns: <code className="bg-gray-100 px-2 py-1 rounded">name</code> and <code className="bg-gray-100 px-2 py-1 rounded">email</code>
                    </p>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                      Example CSV format:
                      <pre className="text-xs mt-2">name,email{'\n'}John Smith,john@example.com{'\n'}Jane Doe,jane@example.com</pre>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">User Role</label>
                    <select
                      value={bulkImportRole}
                      onChange={(e) => setBulkImportRole(e.target.value as 'Student' | 'Instructor' | 'Administrator')}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Student">Student</option>
                      <option value="Instructor">Instructor</option>
                      <option value="Administrator">Administrator</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">CSV File</label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0]
                        if (file) {
                          handleBulkImport(file)
                        }
                      }}
                      disabled={importLoading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>

                  {importLoading && (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span className="ml-2 text-gray-600">Importing users...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg ${importResults.failed === 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                    <p className={`font-semibold ${importResults.failed === 0 ? 'text-green-800' : 'text-yellow-800'}`}>
                      Import Complete
                    </p>
                    <p className={importResults.failed === 0 ? 'text-green-700' : 'text-yellow-700'}>
                      Successfully imported {importResults.success} user{importResults.success !== 1 ? 's' : ''}.
                      {importResults.failed > 0 && ` ${importResults.failed} user${importResults.failed !== 1 ? 's' : ''} failed.`}
                    </p>
                  </div>

                  {importResults.failures && importResults.failures.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Failures:</h4>
                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="p-2 text-left">Email</th>
                              <th className="p-2 text-left">Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importResults.failures.map((failure: any, idx: number) => (
                              <tr key={idx} className="border-t">
                                <td className="p-2">{failure.email}</td>
                                <td className="p-2 text-red-600">{failure.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowBulkImportModal(false)
                        setImportResults(null)
                      }}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prompt Modal */}
      {showPromptModal && selectedSimulation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold">
                Prompt for "{selectedSimulation.title || 'Untitled'}" ({selectedSimulation.code})
              </h3>
              <button
                onClick={closePromptModal}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="bg-gray-50 p-4 rounded-md">
                <pre className="whitespace-pre-wrap text-sm font-mono">{selectedSimulation.prompt}</pre>
              </div>
            </div>
            <div className="flex justify-end p-6 border-t">
              <button
                onClick={closePromptModal}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
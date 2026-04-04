'use client'

import { useState, useEffect } from 'react'
import AnalyticsDashboard from '../components/AnalyticsDashboard'

interface User {
  id: string
  username: string
  role: 'Administrator' | 'Instructor' | 'Student'
  createdAt: string
  updatedAt: string
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
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
  const [activeTab, setActiveTab] = useState<'users' | 'analytics'>('users')

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

  const resetForm = () => {
    setShowAddForm(false)
    setEditingUser(null)
    setFormData({ username: '', password: '', role: 'Administrator' })
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
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add User
                </button>
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
        ) : (
          <div className="grid grid-cols-1 gap-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <AnalyticsDashboard />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
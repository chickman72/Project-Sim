'use client'

import { useState, useEffect } from 'react'

interface Student {
  id: string
  username: string
  email?: string
}

interface Cohort {
  id: string
  name: string
  instructorId: string
  studentIds: string[]
  createdAt: string
  updatedAt: string
}

interface CohortManagerProps {
  instructorId: string
  onClose?: () => void
}

export default function CohortManager({ instructorId, onClose }: CohortManagerProps) {
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCohort, setEditingCohort] = useState<Cohort | null>(null)
  const [formData, setFormData] = useState({ name: '', selectedStudents: new Set<string>() })
  const [studentSearch, setStudentSearch] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Load cohorts and students
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Load cohorts
        const cohortsRes = await fetch('/api/cohorts')
        if (!cohortsRes.ok) throw new Error('Failed to load cohorts')
        const cohortsData = await cohortsRes.json()
        setCohorts(cohortsData)

        // Load students
        const studentsRes = await fetch('/api/users?role=Student')
        if (!studentsRes.ok) throw new Error('Failed to load students')
        const studentsData = await studentsRes.json()
        setStudents(studentsData)
      } catch (err: any) {
        setError(err.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleCreateCohort = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setError('Cohort name is required')
      return
    }

    try {
      setError(null)
      const res = await fetch('/api/cohorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          studentIds: Array.from(formData.selectedStudents)
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create cohort')
      }

      const newCohort = await res.json()
      setCohorts([newCohort, ...cohorts])
      setFormData({ name: '', selectedStudents: new Set<string>() })
      setShowCreateForm(false)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleUpdateCohort = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCohort || !formData.name.trim()) {
      setError('Cohort name is required')
      return
    }

    try {
      setError(null)
      const res = await fetch(`/api/cohorts/${encodeURIComponent(editingCohort.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formData.name.trim() })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update cohort')
      }

      const updatedCohort = await res.json()
      setCohorts(cohorts.map(c => c.id === editingCohort.id ? updatedCohort : c))
      setEditingCohort(null)
      setFormData({ name: '', selectedStudents: new Set<string>() })
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDeleteCohort = async (cohortId: string) => {
    if (!confirm('Are you sure you want to delete this cohort?')) return

    try {
      setError(null)
      const res = await fetch(`/api/cohorts/${encodeURIComponent(cohortId)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete cohort')
      }

      setCohorts(cohorts.filter(c => c.id !== cohortId))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleAddStudent = async (cohortId: string, studentId: string) => {
    try {
      setError(null)
      const res = await fetch('/api/cohorts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, studentId, action: 'add' })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add student')
      }

      const updatedCohort = await res.json()
      setCohorts(cohorts.map(c => c.id === cohortId ? updatedCohort : c))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleRemoveStudent = async (cohortId: string, studentId: string) => {
    try {
      setError(null)
      const res = await fetch('/api/cohorts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, studentId, action: 'remove' })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove student')
      }

      const updatedCohort = await res.json()
      setCohorts(cohorts.map(c => c.id === cohortId ? updatedCohort : c))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const toggleStudentSelection = (studentId: string) => {
    const newSelected = new Set(formData.selectedStudents)
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId)
    } else {
      newSelected.add(studentId)
    }
    setFormData({ ...formData, selectedStudents: newSelected })
  }

  const search = studentSearch.toLowerCase()
  const filteredStudents = students.filter((s) => {
    const username = (s.username || '').toLowerCase()
    const email = (s.email || '').toLowerCase()
    return username.includes(search) || email.includes(search)
  })

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    return student ? student.username : studentId
  }

  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 1800)
  }

  const handleCopyInviteLink = async (cohortId: string) => {
    try {
      const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, '')
      const inviteLink = `${base}/register/${encodeURIComponent(cohortId)}`
      await navigator.clipboard.writeText(inviteLink)
      showToast('Copied!')
    } catch {
      showToast('Could not copy link')
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading cohorts and students...</div>
  }

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 rounded-md bg-gray-900 text-white px-4 py-2 text-sm shadow-lg">
          {toastMessage}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Create/Edit Form */}
      {(showCreateForm || editingCohort) && (
        <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">
            {editingCohort ? 'Edit Cohort' : 'Create New Cohort'}
          </h3>

          <form onSubmit={editingCohort ? handleUpdateCohort : handleCreateCohort} className="space-y-4">
            {/* Cohort Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cohort Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Cohort A, Spring 2024"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Student Selection (only for create) */}
            {!editingCohort && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Add Students (Optional)
                </label>
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search by username or email..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                />

                <div className="border border-gray-300 rounded-md p-3 bg-white max-h-48 overflow-y-auto">
                  {filteredStudents.length > 0 ? (
                    <div className="space-y-2">
                      {filteredStudents.map((student) => (
                        <label key={student.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.selectedStudents.has(student.id)}
                            onChange={() => toggleStudentSelection(student.id)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">
                            {student.username} ({student.email || '-'})
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-2">
                      {studentSearch ? 'No students found' : 'No students available'}
                    </p>
                  )}
                </div>
                {formData.selectedStudents.size > 0 && (
                  <p className="text-sm text-blue-600 mt-2">
                    {formData.selectedStudents.size} student(s) selected
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {editingCohort ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false)
                  setEditingCohort(null)
                  setFormData({ name: '', selectedStudents: new Set<string>() })
                  setStudentSearch('')
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Cohort Button */}
      {!showCreateForm && !editingCohort && (
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          + Create Cohort
        </button>
      )}

      {/* Cohorts List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Your Cohorts ({cohorts.length})</h3>

        {cohorts.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No cohorts yet. Create one to get started!</p>
        ) : (
          <div className="grid gap-4">
            {cohorts.map((cohort) => (
              <div key={cohort.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="text-base font-semibold">{cohort.name}</h4>
                    <p className="text-sm text-gray-500">
                      {cohort.studentIds.length} student{cohort.studentIds.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopyInviteLink(cohort.id)}
                      className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                    >
                      Copy Invite Link
                    </button>
                    <button
                      onClick={() => {
                        setEditingCohort(cohort)
                        setFormData({ name: cohort.name, selectedStudents: new Set<string>() })
                      }}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCohort(cohort.id)}
                      className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Students in Cohort */}
                <div className="space-y-2">
                  {cohort.studentIds.length > 0 ? (
                    <div className="space-y-1">
                      {cohort.studentIds.map((studentId) => (
                        <div key={studentId} className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded">
                          <span className="text-gray-700">{getStudentName(studentId)}</span>
                          <button
                            onClick={() => handleRemoveStudent(cohort.id, studentId)}
                            className="text-red-600 hover:text-red-800 font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No students in this cohort</p>
                  )}
                </div>

                {/* Add Student Button */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <details className="cursor-pointer">
                    <summary className="text-sm text-blue-600 hover:text-blue-800 font-semibold">
                      + Add Student
                    </summary>
                    <div className="mt-2 border border-gray-200 rounded p-2 bg-gray-50">
                      <input
                        type="text"
                        placeholder="Search students..."
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onChange={(e) => setStudentSearch(e.target.value)}
                      />
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {filteredStudents
                          .filter(s => !cohort.studentIds.includes(s.id))
                          .map((student) => (
                            <button
                              key={student.id}
                              onClick={() => {
                                handleAddStudent(cohort.id, student.id)
                                setStudentSearch('')
                              }}
                              className="w-full text-left px-2 py-1 text-sm bg-white hover:bg-blue-50 rounded border border-gray-200 transition"
                            >
                              {student.username} ({student.email || '-'})
                            </button>
                          ))}
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close Button (if provided) */}
      {onClose && (
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
        >
          Close
        </button>
      )}
    </div>
  )
}

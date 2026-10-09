'use client'

import { useState, useEffect } from 'react'

interface Student {
  id: string
  username: string
  email?: string
}

interface Instructor {
  id: string
  username: string
  email?: string
}

interface Cohort {
  id: string
  name: string
  instructorId: string
  instructorIds?: string[]
  studentIds: string[]
  createdAt: string
  updatedAt: string
}

interface AssignedScenario {
  code: string
  title?: string
  assignedCohortId?: string
  visibility?: 'global' | 'cohort' | 'private'
  isEnabled?: boolean
  canEdit?: boolean
}

interface CohortManagerProps {
  instructorId: string
  onClose?: () => void
  onEditScenario?: (scenarioCode: string) => void
}

export default function CohortManager({ instructorId, onClose, onEditScenario }: CohortManagerProps) {
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [scenarios, setScenarios] = useState<AssignedScenario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCohort, setEditingCohort] = useState<Cohort | null>(null)
  const [formData, setFormData] = useState({ name: '', selectedStudents: new Set<string>() })
  const [studentSearch, setStudentSearch] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [expandedCohorts, setExpandedCohorts] = useState<Set<string>>(new Set())

  // Load cohorts and students
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Load cohorts, users, and scenario assignments together.
        const [cohortsRes, studentsRes, instructorsRes, scenariosRes] = await Promise.all([
          fetch('/api/cohorts'),
          fetch('/api/users?role=Student'),
          fetch('/api/users?role=Instructor'),
          fetch('/api/cohorts/scenarios'),
        ])
        if (!cohortsRes.ok) throw new Error('Failed to load cohorts')
        if (!studentsRes.ok) throw new Error('Failed to load students')
        if (!instructorsRes.ok) throw new Error('Failed to load instructors')
        if (!scenariosRes.ok) throw new Error('Failed to load scenario assignments')
        const cohortsData = await cohortsRes.json()
        const studentsData = await studentsRes.json()
        const instructorsData = await instructorsRes.json()
        const scenariosData = await scenariosRes.json()
        setCohorts(cohortsData)
        setStudents(studentsData)
        setInstructors(instructorsData)
        setScenarios(Array.isArray(scenariosData) ? scenariosData : [])
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

  const getInstructorIds = (cohort: Cohort) => {
    const normalized = Array.isArray(cohort.instructorIds)
      ? Array.from(new Set(cohort.instructorIds.map((id) => String(id || '').trim()).filter((id) => id.length > 0)))
      : []
    if (normalized.length > 0) return normalized
    return cohort.instructorId ? [cohort.instructorId] : []
  }

  const getInstructorName = (id: string) => {
    const instructor = instructors.find((user) => user.id === id)
    return instructor ? instructor.username : id
  }

  const getAssignedScenarios = (cohortId: string) =>
    scenarios.filter(
      (scenario) =>
        (scenario.visibility || (scenario.assignedCohortId ? 'cohort' : 'global')) === 'cohort' &&
        scenario.assignedCohortId === cohortId,
    )

  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 1800)
  }

  const isStudentListCollapsed = (cohortId: string) => !expandedCohorts.has(cohortId)

  const toggleStudentList = (cohortId: string) => {
    setExpandedCohorts((prev) => {
      const next = new Set(prev)
      if (next.has(cohortId)) {
        next.delete(cohortId)
      } else {
        next.add(cohortId)
      }
      return next
    })
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

  const handleAddInstructor = async (cohortId: string, nextInstructorId: string) => {
    try {
      setError(null)
      const res = await fetch('/api/cohorts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, instructorId: nextInstructorId, action: 'add_instructor' })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add instructor')
      }

      const updatedCohort = await res.json()
      setCohorts(cohorts.map(c => c.id === cohortId ? updatedCohort : c))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleRemoveInstructor = async (cohortId: string, targetInstructorId: string) => {
    try {
      setError(null)
      const res = await fetch('/api/cohorts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, instructorId: targetInstructorId, action: 'remove_instructor' })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove instructor')
      }

      const updatedCohort = await res.json()
      setCohorts(cohorts.map(c => c.id === cohortId ? updatedCohort : c))
    } catch (err: any) {
      setError(err.message)
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
      {showCreateForm && (
        <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">
            Create New Cohort
          </h3>

          <form onSubmit={handleCreateCohort} className="space-y-4">
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
          <div className="grid gap-3 lg:grid-cols-2">
            {cohorts.map((cohort) => (
              <div key={cohort.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h4 className="text-base font-semibold">{cohort.name}</h4>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-gray-600">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1">
                        {cohort.studentIds.length} student{cohort.studentIds.length !== 1 ? 's' : ''}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1">
                        {getInstructorIds(cohort).length} instructor{getInstructorIds(cohort).length !== 1 ? 's' : ''}
                      </span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                        {getAssignedScenarios(cohort.id).length} scenario{getAssignedScenarios(cohort.id).length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => handleCopyInviteLink(cohort.id)}
                      className="rounded bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-200"
                    >
                      Copy Invite Link
                    </button>
                    <button
                      onClick={() => {
                        setEditingCohort(cohort)
                        setFormData({ name: cohort.name, selectedStudents: new Set<string>() })
                      }}
                      className="rounded bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCohort(cohort.id)}
                      className="rounded bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Assigned scenarios</p>
                  {getAssignedScenarios(cohort.id).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {getAssignedScenarios(cohort.id).map((scenario) => (
                        <button
                          key={scenario.code}
                          type="button"
                          onClick={() => {
                            if (scenario.canEdit !== false) onEditScenario?.(scenario.code)
                          }}
                          disabled={scenario.canEdit === false || !onEditScenario}
                          title={scenario.canEdit === false ? 'This scenario is owned by another cohort manager.' : `Edit ${scenario.title || 'scenario'}`}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                            scenario.isEnabled === false
                              ? 'border-gray-200 bg-gray-50 text-gray-500'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          } ${
                            scenario.canEdit === false
                              ? 'cursor-not-allowed opacity-70'
                              : 'cursor-pointer hover:ring-2 hover:ring-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${scenario.isEnabled === false ? 'bg-gray-400' : 'bg-emerald-500'}`} />
                          {scenario.title || 'Untitled Scenario'}
                          {scenario.isEnabled === false ? ' (Off)' : ''}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No scenarios assigned.</p>
                  )}
                </div>

                {/* Students in Cohort */}
                <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    onClick={() => toggleStudentList(cohort.id)}
                    className="text-sm font-medium text-gray-700 hover:text-gray-900"
                  >
                    Students ({cohort.studentIds.length}) {isStudentListCollapsed(cohort.id) ? '▸' : '▾'}
                  </button>

                  {!isStudentListCollapsed(cohort.id) && (
                    <>
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
                    </>
                  )}
                </div>

                <details className="mt-3 border-t border-gray-100 pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                    Instructors ({getInstructorIds(cohort).length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {getInstructorIds(cohort).map((id) => (
                      <div key={`${cohort.id}-instructor-${id}`} className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded">
                        <span className="text-gray-700">
                          {getInstructorName(id)}
                          {id === instructorId ? ' (You)' : ''}
                        </span>
                        <button
                          onClick={() => handleRemoveInstructor(cohort.id, id)}
                          className="text-red-600 hover:text-red-800 font-semibold"
                          disabled={getInstructorIds(cohort).length <= 1}
                          title={getInstructorIds(cohort).length <= 1 ? 'A cohort must have at least one instructor' : 'Remove instructor'}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <details className="mt-2 cursor-pointer">
                    <summary className="text-sm text-blue-600 hover:text-blue-800 font-semibold">
                      + Add Co-Instructor
                    </summary>
                    <div className="mt-2 border border-gray-200 rounded p-2 bg-gray-50">
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {instructors
                          .filter((inst) => !getInstructorIds(cohort).includes(inst.id))
                          .map((inst) => (
                            <button
                              key={`${cohort.id}-add-inst-${inst.id}`}
                              onClick={() => handleAddInstructor(cohort.id, inst.id)}
                              className="w-full text-left px-2 py-1 text-sm bg-white hover:bg-blue-50 rounded border border-gray-200 transition"
                            >
                              {inst.username} ({inst.email || '-'})
                            </button>
                          ))}
                        {instructors.filter((inst) => !getInstructorIds(cohort).includes(inst.id)).length === 0 && (
                          <p className="text-sm text-gray-500 italic">No available instructors to add</p>
                        )}
                      </div>
                    </div>
                  </details>
                </details>

                {/* Add Student Button */}
                <div className="mt-3 border-t border-gray-100 pt-3">
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

      {editingCohort && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Cohort</h3>
              <button
                type="button"
                onClick={() => {
                  setEditingCohort(null)
                  setFormData({ name: '', selectedStudents: new Set<string>() })
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4">
              <form onSubmit={handleUpdateCohort} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cohort Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCohort(null)
                      setFormData({ name: '', selectedStudents: new Set<string>() })
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

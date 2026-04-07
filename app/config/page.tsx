"use client"

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import CohortManager from '../../components/CohortManager'
import NeedsReviewDashboard from '../../components/NeedsReviewDashboard'
import SimulationPreview from '../../components/simulation/SimulationPreview'
import type { DraftSimulation, RubricCriterion } from '../../components/simulation/types'

type SimulationVisibility = 'global' | 'cohort' | 'private'
type Simulation = {
  code: string
  prompt: string
  title: string
  description: string
  patientVoice?: string
  assignedCohortId?: string
  visibility?: SimulationVisibility
  isPracticeMode?: boolean
  conversationStarters?: string[]
  rubric?: RubricCriterion[]
}

const DEFAULT_PATIENT_VOICE = 'en-US-JennyNeural'
const PATIENT_VOICE_OPTIONS = [
  { value: 'en-US-JennyNeural', label: 'en-US-JennyNeural (Female)' },
  { value: 'en-US-GuyNeural', label: 'en-US-GuyNeural (Male)' },
  { value: 'en-US-AriaNeural', label: 'en-US-AriaNeural (Female)' },
  { value: 'en-US-DavisNeural', label: 'en-US-DavisNeural (Male)' },
]

const defaultDraftSim: DraftSimulation = {
  title: '',
  description: '',
  prompt: 'You are the patient in this scenario. Respond in English only.',
  patientVoice: DEFAULT_PATIENT_VOICE,
  visibility: 'global',
  assignedCohortId: undefined,
  isPracticeMode: false,
  conversationStarters: [],
  rubric: [],
}

export default function Page() {
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'Administrator' | 'Instructor' | 'Student' | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<'list' | 'editor'>('list')
  const [selectedSimId, setSelectedSimId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [draftSim, setDraftSim] = useState<DraftSimulation>(defaultDraftSim)
  const [setups, setSetups] = useState<Simulation[]>([])
  const [isEvaluationCriteriaOpen, setIsEvaluationCriteriaOpen] = useState(true)
  const [cohorts, setCohorts] = useState<{ id: string; name: string }[]>([])
  const [activeTab, setActiveTab] = useState<'simulations' | 'classes' | 'needsReview'>('simulations')

  useEffect(() => {
    if (!userId) {
      setSetups([])
      setCohorts([])
      return
    }
    ;(async () => {
      try {
        // Load setups
        const setupResp = await fetch('/api/setups')
        if (setupResp.ok) {
          const data = await setupResp.json()
          const setupsWithTitles = data.map((s: any) => ({ 
            ...s, 
            title: s.title || '', 
            description: s.description || '',
            assignedCohortId: s.assignedCohortId,
            visibility: s.visibility || (s.assignedCohortId ? 'cohort' : 'global'),
            isPracticeMode: Boolean(s.isPracticeMode),
            patientVoice:
              typeof s.patientVoice === 'string' && s.patientVoice.trim().length > 0
                ? s.patientVoice.trim()
                : DEFAULT_PATIENT_VOICE,
            conversationStarters: Array.isArray(s.conversationStarters)
              ? s.conversationStarters.map((v: any) => String(v || ''))
              : [],
            rubric: Array.isArray(s.rubric) ? s.rubric : []
          }))
          setSetups(setupsWithTitles)
        }

        // Load cohorts
        const cohortResp = await fetch('/api/cohorts')
        if (cohortResp.ok) {
          const cohortData = await cohortResp.json()
          setCohorts(cohortData)
        }
      } catch {
        // ignore
      }
    })()
  }, [userId])

  useEffect(() => {
    ;(async () => {
      try {
        const resp = await fetch('/api/auth/me')
        if (!resp.ok) return
        const data = await resp.json()
        if (!data?.userId) return
        setUserId(String(data.userId))
        setUserName(data.username || String(data.userId))
        setUserEmail(data.email || null)
        setUserRole(data.role || null)
      } finally {
        setAuthChecked(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!authChecked) return
    if (!userId) {
      router.replace('/')
      return
    }
    if (userRole === 'Student') {
      router.replace('/sim')
      return
    }
  }, [authChecked, userId, userRole, router])

  const hydrateDraftFromSetup = (setup: Simulation) => {
    const visibility = setup.visibility || (setup.assignedCohortId ? 'cohort' : 'global')
    setDraftSim({
      title: setup.title || '',
      description: setup.description || '',
      prompt: setup.prompt || defaultDraftSim.prompt,
      patientVoice:
        typeof setup.patientVoice === 'string' && setup.patientVoice.trim().length > 0
          ? setup.patientVoice.trim()
          : DEFAULT_PATIENT_VOICE,
      visibility,
      assignedCohortId: visibility === 'cohort' ? setup.assignedCohortId : undefined,
      isPracticeMode: Boolean(setup.isPracticeMode),
      conversationStarters: Array.isArray(setup.conversationStarters) ? setup.conversationStarters : [],
      rubric: Array.isArray(setup.rubric) ? setup.rubric : [],
    })
    setIsDirty(false)
  }

  useEffect(() => {
    if (activeTab !== 'simulations' || currentView !== 'editor') return

    if (!selectedSimId) {
      setDraftSim(defaultDraftSim)
      setIsDirty(false)
      return
    }

    const setup = setups.find((item) => item.code === selectedSimId)
    if (setup) {
      hydrateDraftFromSetup(setup)
    }
  }, [activeTab, currentView, selectedSimId, setups])

  const logout = async () => {
    setError(null)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setUserId(null)
      setUserName(null)
      setUserEmail(null)
      setUserRole(null)
    }
  }

  const saveSetup = async () => {
    const codeToUse = selectedSimId || Math.random().toString(36).substring(2, 8).toUpperCase()
    const setupData: any = {
      code: codeToUse,
      title: draftSim.title,
      description: draftSim.description,
      prompt: draftSim.prompt,
      patientVoice: draftSim.patientVoice || DEFAULT_PATIENT_VOICE,
      visibility: draftSim.visibility,
      isPracticeMode: draftSim.isPracticeMode,
      conversationStarters: draftSim.conversationStarters,
      rubric: draftSim.rubric,
    }
    
    // Add assignedCohortId only for cohort visibility.
    if (draftSim.visibility === 'cohort' && draftSim.assignedCohortId) {
      setupData.assignedCohortId = draftSim.assignedCohortId
    }
    
    try {
      const resp = await fetch('/api/setups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupData)
      })
      if (!resp.ok) throw new Error('Failed to save setup')
      
      const newSetups = setups.filter(s => s.code !== codeToUse)
      newSetups.push(setupData)
      setSetups(newSetups)
      setSelectedSimId(codeToUse)
      setIsDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving setup')
    }
  }

  const deleteSetup = async (code: string) => {
    try {
      const resp = await fetch(`/api/setups/${code}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error('Failed to delete setup')
      const newSetups = setups.filter((setup) => setup.code !== code)
      setSetups(newSetups)
      if (selectedSimId === code) {
        setDraftSim(defaultDraftSim)
        setSelectedSimId(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting setup')
    }
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
      <div className={`${isUserMenuOpen ? 'block' : 'hidden'} absolute right-0 mt-2 w-64 rounded-md bg-white border border-gray-200 shadow-lg p-3 text-sm z-10`}>
        <div className="text-gray-600 font-medium break-all">{userName || userId}</div>
        <div className="text-gray-500 text-xs break-all">{userEmail || '-'}</div>
        <div className="text-gray-500 text-xs">{userRole?.toUpperCase()}</div>
      </div>
    </div>
  )

  if (!authChecked || !userId || userRole === 'Student') {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-semibold text-center text-gray-900 mb-2">Redirecting...</h1>
          <p className="text-sm text-gray-600 text-center">Taking you to the main login page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50">
      <div
        className={
          activeTab === 'simulations' && currentView === 'editor'
            ? 'w-full max-w-full py-8 px-4'
            : 'max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8'
        }
      >
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Instructor Configuration</h1>
          <div className="flex items-center gap-3">
            <UserBadge />
            <button
              className="px-4 py-2 bg-red-500 text-white text-sm rounded-md hover:bg-red-600"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>

        <div>
          <div>
            {/* Tabs */}
            <div className="flex gap-0 mb-6 border-b border-gray-200 bg-white rounded-t-lg">
              <button
                onClick={() => setActiveTab('simulations')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'simulations'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Simulation Setup
              </button>
              <button
                onClick={() => setActiveTab('classes')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'classes'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Class Management
              </button>
              <button
                onClick={() => setActiveTab('needsReview')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'needsReview'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Needs Review
              </button>
            </div>

            {/* Simulation Setup Tab */}
            {activeTab === 'simulations' && currentView === 'list' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Simulation Setups</h2>
                <button
                  type="button"
                  className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700"
                  onClick={() => {
                    setSelectedSimId(null)
                    setCurrentView('editor')
                  }}
                >
                  Create New
                </button>
              </div>

              {setups.length === 0 ? (
                <div className="min-h-[320px] rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center text-center px-4">
                  <p className="text-base font-medium text-gray-700">No simulation setups found.</p>
                  <button
                    type="button"
                    className="mt-4 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700"
                    onClick={() => {
                      setSelectedSimId(null)
                      setCurrentView('editor')
                    }}
                  >
                    Create New Simulation
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {setups.map((setup) => (
                    <div key={setup.code} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="font-semibold text-gray-800">{setup.title || 'Untitled'}</p>
                      {setup.description && (
                        <p className="text-sm text-gray-600 mt-2 line-clamp-3">{setup.description}</p>
                      )}
                      <div className="mt-3 space-y-1 text-xs text-gray-600">
                        <p>
                          Availability:{' '}
                          {(() => {
                            const visibility = setup.visibility || (setup.assignedCohortId ? 'cohort' : 'global')
                            if (visibility === 'cohort' && setup.assignedCohortId) {
                              const cohortName = cohorts.find((c) => c.id === setup.assignedCohortId)?.name || 'Unknown Class'
                              return `Cohort - ${cohortName}`
                            }
                            if (visibility === 'private') return 'Private'
                            return 'Global'
                          })()}
                        </p>
                        <p>Practice: {setup.isPracticeMode ? 'Yes' : 'No'}</p>
                        <p>Voice: {setup.patientVoice || DEFAULT_PATIENT_VOICE}</p>
                        <p>Rubric Criteria: {Array.isArray(setup.rubric) ? setup.rubric.length : 0}</p>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                          onClick={() => {
                            setSelectedSimId(setup.code)
                            setCurrentView('editor')
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-sm text-red-700 bg-red-100 rounded-md hover:bg-red-200"
                          onClick={() => deleteSetup(setup.code)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {activeTab === 'simulations' && currentView === 'editor' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <button
                type="button"
                onClick={() => setCurrentView('list')}
                className="mb-4 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                &lt;- Back to Setups
              </button>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      value={draftSim.title}
                      onChange={(e) => {
                        setDraftSim((prev) => ({ ...prev, title: e.target.value }))
                        setIsDirty(true)
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                      placeholder="e.g., Customer Service Simulation"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={draftSim.description}
                      onChange={(e) => {
                        setDraftSim((prev) => ({ ...prev, description: e.target.value }))
                        setIsDirty(true)
                      }}
                      className="w-full h-24 p-4 border rounded-md resize-y focus:ring-2 focus:ring-blue-500 mb-4"
                      placeholder="e.g., You will play the role of a nurse talking to a patient..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Availability</label>
                    <select
                      value={draftSim.visibility === 'cohort' ? `cohort:${draftSim.assignedCohortId || ''}` : draftSim.visibility}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === 'global' || value === 'private') {
                          setDraftSim((prev) => ({ ...prev, visibility: value, assignedCohortId: undefined }))
                        } else if (value.startsWith('cohort:')) {
                          const cohortId = value.substring('cohort:'.length)
                          setDraftSim((prev) => ({ ...prev, visibility: 'cohort', assignedCohortId: cohortId || undefined }))
                        }
                        setIsDirty(true)
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                    >
                      <option value="global">-- Global (Available to All Students) --</option>
                      <option value="private">-- Private (Hidden Until Explicitly Assigned) --</option>
                      {cohorts.map(cohort => (
                        <option key={cohort.id} value={`cohort:${cohort.id}`}>
                          {cohort.name}
                        </option>
                      ))}
                    </select>
                    {cohorts.length === 0 && (
                      <p className="text-sm text-gray-500 mb-4">
                        No classes available. Create a class in the Class Management section to assign simulations.
                      </p>
                    )}
                  </div>

                  <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                      <input
                        type="checkbox"
                        checked={draftSim.isPracticeMode}
                        onChange={(e) => {
                        setDraftSim((prev) => ({ ...prev, isPracticeMode: e.target.checked }))
                        setIsDirty(true)
                      }}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Practice Mode (Ungraded)
                    </label>
                    <p className="mt-1 text-xs text-gray-600">
                      Practice simulations always remain available for fresh attempts and are not treated as graded submissions.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Patient Voice</label>
                    <select
                      value={draftSim.patientVoice || DEFAULT_PATIENT_VOICE}
                      onChange={(e) => {
                        setDraftSim((prev) => ({ ...prev, patientVoice: e.target.value }))
                        setIsDirty(true)
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                    >
                      {PATIENT_VOICE_OPTIONS.map((voice) => (
                        <option key={voice.value} value={voice.value}>
                          {voice.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="block text-sm font-medium text-gray-700 mb-1">Scenario Prompt</label>
                  <textarea
                    value={draftSim.prompt}
                    onChange={(e) => {
                      setDraftSim((prev) => ({ ...prev, prompt: e.target.value }))
                      setIsDirty(true)
                    }}
                    className="w-full h-64 p-4 border rounded-md resize-y focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., You are a customer service representative for a clothing store..."
                  />
                  <div className="mt-6 border border-gray-200 rounded-md p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">Conversation Starters</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftSim((prev) => ({ ...prev, conversationStarters: [...prev.conversationStarters, ''] }))
                          setIsDirty(true)
                        }}
                        className="px-3 py-1.5 bg-sky-600 text-white text-xs rounded-md hover:bg-sky-700"
                      >
                        Add Conversation Starter
                      </button>
                    </div>
                    {draftSim.conversationStarters.length === 0 ? (
                      <p className="text-sm text-gray-500">No starters added yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {draftSim.conversationStarters.map((starter, index) => (
                          <div key={`starter-${index}`} className="flex items-center gap-2">
                            <input
                              value={starter}
                              onChange={(e) => {
                                setDraftSim((prev) => {
                                  const next = [...prev.conversationStarters]
                                  next[index] = e.target.value
                                  return { ...prev, conversationStarters: next }
                                })
                                setIsDirty(true)
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g., Hello, my name is [Your Name], and I will be your nurse today."
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setDraftSim((prev) => ({
                                  ...prev,
                                  conversationStarters: prev.conversationStarters.filter((_, i) => i !== index),
                                }))
                                setIsDirty(true)
                              }}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-6 border border-gray-200 rounded-md p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        type="button"
                        onClick={() => setIsEvaluationCriteriaOpen(!isEvaluationCriteriaOpen)}
                        className="text-sm font-semibold text-gray-900 hover:text-gray-700"
                      >
                        Evaluation Criteria ({draftSim.rubric.length}) {isEvaluationCriteriaOpen ? 'v' : '>'}
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                              ? crypto.randomUUID()
                              : Math.random().toString(36).slice(2)
                            setDraftSim((prev) => ({
                              ...prev,
                              rubric: [...prev.rubric, { id, name: '', successCondition: '' }],
                            }))
                            setIsDirty(true)
                            setIsEvaluationCriteriaOpen(true)
                          }}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700"
                        >
                          Add Criterion
                        </button>
                      </div>
                    </div>
                    {isEvaluationCriteriaOpen && (
                      <>
                        {draftSim.rubric.length === 0 ? (
                          <p className="text-sm text-gray-500">No criteria added yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {draftSim.rubric.map((criterion, index) => (
                              <div key={criterion.id} className="rounded-md border border-gray-200 bg-white p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-semibold text-gray-600">Criterion {index + 1}</p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDraftSim((prev) => ({
                                        ...prev,
                                        rubric: prev.rubric.filter((r) => r.id !== criterion.id),
                                      }))
                                      setIsDirty(true)
                                    }}
                                    className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Criteria Name</label>
                                    <input
                                      value={criterion.name}
                                      onChange={(e) => {
                                        setDraftSim((prev) => ({
                                          ...prev,
                                          rubric: prev.rubric.map((r) => r.id === criterion.id ? { ...r, name: e.target.value } : r),
                                        }))
                                        setIsDirty(true)
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder="e.g., Hand Hygiene"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Success Condition</label>
                                    <textarea
                                      value={criterion.successCondition}
                                      onChange={(e) => {
                                        setDraftSim((prev) => ({
                                          ...prev,
                                          rubric: prev.rubric.map((r) => r.id === criterion.id ? { ...r, successCondition: e.target.value } : r),
                                        }))
                                        setIsDirty(true)
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-y min-h-16 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder="e.g., Student must wash hands before patient contact."
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {isDirty && (
                    <div className="mt-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4" role="alert">
                      <p className="font-bold">Warning</p>
                      <p>You have unsaved changes to the simulation setup. Save the setup to apply them.</p>
                    </div>
                  )}
                  <button
                    className="mt-6 w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors"
                    onClick={saveSetup}
                  >
                    {selectedSimId ? 'Save Changes' : 'Save as New Setup'}
                  </button>
                </div>
                <div>
                  <SimulationPreview draftSim={draftSim} />
                </div>
              </div>
            </div>
            )}

            {/* Class Management Tab */}
            {activeTab === 'classes' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <CohortManager instructorId={userId || ''} />
            </div>
            )}

            {activeTab === 'needsReview' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <NeedsReviewDashboard />
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

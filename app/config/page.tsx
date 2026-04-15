"use client"

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import CohortManager from '../../components/CohortManager'
import NeedsReviewDashboard from '../../components/NeedsReviewDashboard'
import BrandWordmark from '../../components/BrandWordmark'
import SimulationPreview from '../../components/simulation/SimulationPreview'
import UserDashboard from '../../components/UserDashboard'
import type { DraftSimulation, RubricCriterion, UploadedSimulationDocument } from '../../components/simulation/types'
import { deleteSimulationDocument, duplicateSimulation, saveSimulation, uploadSimulationDocument } from './actions'

type SimulationVisibility = 'global' | 'cohort' | 'private'
type AgentArchetype = 'clinical' | 'tutor' | 'assistant'
type Simulation = {
  code: string
  archetype?: AgentArchetype
  targetCohorts?: string[]
  prompt: string
  title: string
  description: string
  patientVoice?: string
  assignedCohortId?: string
  visibility?: SimulationVisibility
  isPracticeMode?: boolean
  conversationStarters?: string[]
  rubric?: RubricCriterion[]
  knowledgeBaseMode?: 'standard' | 'strict_rag'
  uploadedDocuments?: UploadedSimulationDocument[]
}

const DEFAULT_PATIENT_VOICE = 'en-US-JennyNeural'
const DEFAULT_ASSISTANT_PROMPT =
  'You are a helpful course assistant. Use the uploaded documents to answer student questions. Do not give medical advice.'
const MAX_DOCUMENT_SIZE_MB = 50
const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024
const ARCHETYPE_OPTIONS: Array<{ value: AgentArchetype; title: string; description: string }> = [
  { value: 'clinical', title: 'Clinical Simulator', description: 'Patient/preceptor roleplay with rubric and avatar options.' },
  { value: 'tutor', title: 'Socratic Tutor', description: 'Coaching-focused mode emphasizing grounded document retrieval.' },
  { value: 'assistant', title: 'Course Assistant', description: 'Document-grounded Q&A helper for course support.' },
]
const PATIENT_VOICE_OPTIONS = [
  { value: 'en-US-JennyNeural', label: 'en-US-JennyNeural (Female)' },
  { value: 'en-US-GuyNeural', label: 'en-US-GuyNeural (Male)' },
  { value: 'en-US-AriaNeural', label: 'en-US-AriaNeural (Female)' },
  { value: 'en-US-DavisNeural', label: 'en-US-DavisNeural (Male)' },
]

const defaultDraftSim: DraftSimulation = {
  archetype: 'clinical',
  title: '',
  description: '',
  prompt: 'You are the patient in this scenario. Respond in English only.',
  patientVoice: DEFAULT_PATIENT_VOICE,
  targetCohorts: ['global'],
  visibility: 'global',
  assignedCohortId: undefined,
  isPracticeMode: false,
  conversationStarters: [],
  rubric: [],
  knowledgeBaseMode: 'standard',
  uploadedDocuments: [],
}

const normalizeTargetCohorts = (value: unknown): string[] => {
  const normalized = Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => String(item || '').trim())
            .filter((item) => item.length > 0),
        ),
      )
    : []
  return normalized.length > 0 ? normalized : ['global']
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
  const [studioTab, setStudioTab] = useState<'simulations' | 'userManagement'>('simulations')
  const [activeTab, setActiveTab] = useState<'simulations' | 'classes' | 'needsReview'>('simulations')
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false)
  const [duplicateTargetId, setDuplicateTargetId] = useState<string | null>(null)
  const [newSimTitle, setNewSimTitle] = useState('')
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [isUploadingDocument, setIsUploadingDocument] = useState(false)
  const [deletingDocumentUrl, setDeletingDocumentUrl] = useState<string | null>(null)
  const [documentUploadError, setDocumentUploadError] = useState<string | null>(null)
  const [isDocumentUploadsOpen, setIsDocumentUploadsOpen] = useState(true)

  const loadConfigData = async () => {
    try {
      const [setupResp, cohortResp] = await Promise.all([fetch('/api/setups'), fetch('/api/cohorts')])
      if (setupResp.ok) {
        const data = await setupResp.json()
        const setupsWithTitles = data.map((s: any) => ({
          ...s,
          title: s.title || '',
          description: s.description || '',
          archetype: s.archetype === 'tutor' || s.archetype === 'assistant' ? s.archetype : 'clinical',
          targetCohorts: normalizeTargetCohorts(s.targetCohorts),
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
          rubric: Array.isArray(s.rubric) ? s.rubric : [],
          knowledgeBaseMode: s.knowledgeBaseMode === 'strict_rag' ? 'strict_rag' : 'standard',
          uploadedDocuments: Array.isArray(s.uploadedDocuments)
            ? s.uploadedDocuments
                .map((item: any) => ({
                  fileName: String(item?.fileName || '').trim(),
                  blobUrl: String(item?.blobUrl || '').trim(),
                }))
                .filter((item: UploadedSimulationDocument) => item.fileName && item.blobUrl)
            : [],
        }))
        setSetups(setupsWithTitles)
      }

      if (cohortResp.ok) {
        const cohortData = await cohortResp.json()
        setCohorts(cohortData)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!userId) {
      setSetups([])
      setCohorts([])
      return
    }
    loadConfigData()
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
      archetype: setup.archetype === 'tutor' || setup.archetype === 'assistant' ? setup.archetype : 'clinical',
      title: setup.title || '',
      description: setup.description || '',
      prompt: setup.prompt || defaultDraftSim.prompt,
      patientVoice:
        typeof setup.patientVoice === 'string' && setup.patientVoice.trim().length > 0
          ? setup.patientVoice.trim()
          : DEFAULT_PATIENT_VOICE,
      visibility,
      assignedCohortId: visibility === 'cohort' ? setup.assignedCohortId : undefined,
      targetCohorts: normalizeTargetCohorts(setup.targetCohorts),
      isPracticeMode: Boolean(setup.isPracticeMode),
      conversationStarters: Array.isArray(setup.conversationStarters) ? setup.conversationStarters : [],
      rubric: Array.isArray(setup.rubric) ? setup.rubric : [],
      knowledgeBaseMode: setup.knowledgeBaseMode === 'strict_rag' ? 'strict_rag' : 'standard',
      uploadedDocuments: Array.isArray(setup.uploadedDocuments) ? setup.uploadedDocuments : [],
    })
    setIsDirty(false)
  }

  useEffect(() => {
    if (studioTab !== 'simulations' || activeTab !== 'simulations' || currentView !== 'editor') return

    if (!selectedSimId) {
      setDraftSim(defaultDraftSim)
      setIsDirty(false)
      return
    }

    const setup = setups.find((item) => item.code === selectedSimId)
    if (setup) {
      hydrateDraftFromSetup(setup)
    }
  }, [studioTab, activeTab, currentView, selectedSimId, setups])

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
      archetype: draftSim.archetype,
      title: draftSim.title,
      description: draftSim.description,
      prompt: draftSim.prompt,
      patientVoice: draftSim.patientVoice || DEFAULT_PATIENT_VOICE,
      targetCohorts: normalizeTargetCohorts(draftSim.targetCohorts),
      visibility: draftSim.visibility,
      isPracticeMode: draftSim.isPracticeMode,
      conversationStarters: draftSim.conversationStarters,
      rubric: draftSim.rubric,
      knowledgeBaseMode: draftSim.knowledgeBaseMode,
      uploadedDocuments: draftSim.uploadedDocuments || [],
    }
    
    // Add assignedCohortId only for cohort visibility.
    if (draftSim.visibility === 'cohort' && draftSim.assignedCohortId) {
      setupData.assignedCohortId = draftSim.assignedCohortId
    }
    
    try {
      await saveSimulation(setupData)
      
      const newSetups = setups.filter(s => s.code !== codeToUse)
      newSetups.push(setupData)
      setSetups(newSetups)
      setSelectedSimId(codeToUse)
      setIsDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving setup')
    }
  }

  const handleSimulationDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''

    if (files.length === 0) return
    const oversizedFiles = files.filter((file) => file.size > MAX_DOCUMENT_SIZE_BYTES)
    if (oversizedFiles.length > 0) {
      const tooLargeNames = oversizedFiles.map((file) => file.name).join(', ')
      setDocumentUploadError(
        `File size too large. Maximum is ${MAX_DOCUMENT_SIZE_MB}MB per file. Remove: ${tooLargeNames}`,
      )
      return
    }

    setDocumentUploadError(null)
    if (!selectedSimId) {
      setError('Save the simulation first before uploading documents.')
      return
    }

    try {
      setError(null)
      setIsUploadingDocument(true)

      const existingDocuments = Array.isArray(draftSim.uploadedDocuments) ? draftSim.uploadedDocuments : []
      const filesToUpload: File[] = []
      const documentsToReplace: UploadedSimulationDocument[] = []

      for (const file of files) {
        const duplicates = existingDocuments.filter(
          (doc) => doc.fileName.trim().toLowerCase() === file.name.trim().toLowerCase(),
        )

        if (duplicates.length === 0) {
          filesToUpload.push(file)
          continue
        }

        const shouldReplace = window.confirm(
          `"${file.name}" is already uploaded for this simulation.\n\nSelect OK to replace it, or Cancel to skip this file.`,
        )

        if (shouldReplace) {
          filesToUpload.push(file)
          documentsToReplace.push(...duplicates)
        }
      }

      if (filesToUpload.length === 0) {
        setDocumentUploadError('No new files were uploaded. Duplicate files were skipped.')
        return
      }

      const uniqueDocumentsToReplace = Array.from(
        new Map(documentsToReplace.map((doc) => [doc.blobUrl, doc])).values(),
      )

      for (const doc of uniqueDocumentsToReplace) {
        await deleteSimulationDocument(selectedSimId, doc.blobUrl, draftSim.knowledgeBaseMode)
      }

      const formData = new FormData()
      for (const file of filesToUpload) {
        formData.append('files', file)
      }
      const uploaded = await uploadSimulationDocument(selectedSimId, formData, draftSim.knowledgeBaseMode)
      const removedBlobUrls = new Set(uniqueDocumentsToReplace.map((doc) => doc.blobUrl))

      setDraftSim((prev) => ({
        ...prev,
        uploadedDocuments: [
          ...(prev.uploadedDocuments || []).filter((doc) => !removedBlobUrls.has(doc.blobUrl)),
          ...uploaded,
        ],
      }))
      setSetups((prev) =>
        prev.map((setup) =>
          setup.code === selectedSimId
            ? {
                ...setup,
                knowledgeBaseMode: draftSim.knowledgeBaseMode,
                uploadedDocuments: [
                  ...(setup.uploadedDocuments || []).filter((doc) => !removedBlobUrls.has(doc.blobUrl)),
                  ...uploaded,
                ],
              }
            : setup,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error uploading document')
      setDocumentUploadError(err instanceof Error ? err.message : 'Error uploading document')
    } finally {
      setIsUploadingDocument(false)
    }
  }

  const handleSimulationDocumentDelete = async (blobUrl: string) => {
    if (!selectedSimId) return

    try {
      setError(null)
      setDeletingDocumentUrl(blobUrl)
      await deleteSimulationDocument(selectedSimId, blobUrl, draftSim.knowledgeBaseMode)

      setDraftSim((prev) => ({
        ...prev,
        uploadedDocuments: (prev.uploadedDocuments || []).filter((item) => item.blobUrl !== blobUrl),
      }))
      setSetups((prev) =>
        prev.map((setup) =>
          setup.code === selectedSimId
            ? {
                ...setup,
                knowledgeBaseMode: draftSim.knowledgeBaseMode,
                uploadedDocuments: (setup.uploadedDocuments || []).filter((item) => item.blobUrl !== blobUrl),
              }
            : setup,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting document')
    } finally {
      setDeletingDocumentUrl(null)
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

  const resetDuplicateModalState = () => {
    setIsDuplicateModalOpen(false)
    setDuplicateTargetId(null)
    setNewSimTitle('')
    setIsDuplicating(false)
  }

  const handleDuplicateConfirm = async () => {
    if (!duplicateTargetId) return
    const trimmedTitle = newSimTitle.trim()
    if (!trimmedTitle) {
      setError('New simulation name is required')
      return
    }

    try {
      setError(null)
      setIsDuplicating(true)
      await duplicateSimulation(duplicateTargetId, trimmedTitle)
      resetDuplicateModalState()
      await loadConfigData()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error duplicating setup')
      setIsDuplicating(false)
    }
  }

  const initials = userName ? userName.charAt(0).toUpperCase() : userId ? userId.charAt(0).toUpperCase() : ''

  const getArchetypeLabel = (archetype?: AgentArchetype) => {
    if (archetype === 'tutor') return 'Socratic Tutor'
    if (archetype === 'assistant') return 'Course Assistant'
    return 'Clinical Simulator'
  }

  const clinicalSetups = setups.filter((setup) => (setup.archetype || 'clinical') === 'clinical')
  const tutorSetups = setups.filter((setup) => setup.archetype === 'tutor')
  const assistantSetups = setups.filter((setup) => setup.archetype === 'assistant')

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
          <div>
            <BrandWordmark className="text-2xl" />
            <p className="mt-1 text-sm text-slate-600">Instructor Studio</p>
          </div>
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
            <div className="flex gap-2 mb-6 rounded-lg border border-gray-200 bg-white p-1">
              <button
                onClick={() => setStudioTab('simulations')}
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                  studioTab === 'simulations' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Scenarios
              </button>
              <button
                onClick={() => setStudioTab('userManagement')}
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                  studioTab === 'userManagement' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                User Management
              </button>
            </div>

            {studioTab === 'simulations' && (
              <>
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
                Scenario Setup
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

            {/* Scenario Setup Tab */}
            {activeTab === 'simulations' && currentView === 'list' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Scenario Setups</h2>
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
                  <p className="text-base font-medium text-gray-700">No scenario setups found.</p>
                  <button
                    type="button"
                    className="mt-4 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700"
                    onClick={() => {
                      setSelectedSimId(null)
                      setCurrentView('editor')
                    }}
                  >
                    Create New Scenario
                  </button>
                </div>
              ) : (
                <div className="space-y-8">
                  {[
                    { key: 'clinical', title: 'Clinical Simulators', setups: clinicalSetups },
                    { key: 'tutor', title: 'Socratic Tutors', setups: tutorSetups },
                    { key: 'assistant', title: 'Course Assistants', setups: assistantSetups },
                  ].map((group) =>
                    group.setups.length > 0 ? (
                      <section key={group.key} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{group.title}</h3>
                          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 border border-gray-200">
                            {group.setups.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {group.setups.map((setup) => (
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
                                <p>Archetype: {getArchetypeLabel(setup.archetype)}</p>
                                <p>Voice: {setup.patientVoice || DEFAULT_PATIENT_VOICE}</p>
                                <p>Target Cohorts: {normalizeTargetCohorts(setup.targetCohorts).join(', ')}</p>
                                <p>AI Mode: {setup.knowledgeBaseMode === 'strict_rag' ? 'Document Grounded' : 'Standard'}</p>
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
                                  className="px-3 py-1.5 text-sm text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200"
                                  onClick={() => {
                                    setDuplicateTargetId(setup.code)
                                    setNewSimTitle(`${setup.title || 'Untitled'} (Copy)`)
                                    setIsDuplicateModalOpen(true)
                                  }}
                                >
                                  Duplicate
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
                      </section>
                    ) : null,
                  )}
                </div>
              )}

              {isDuplicateModalOpen && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
                  <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                    <h3 className="text-lg font-semibold text-gray-900">Duplicate Scenario</h3>
                    <p className="mt-1 text-sm text-gray-600">New Scenario Name</p>
                    <input
                      value={newSimTitle}
                      onChange={(e) => setNewSimTitle(e.target.value)}
                      className="mt-2 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter new scenario name"
                    />
                    <div className="mt-5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={resetDuplicateModalState}
                        disabled={isDuplicating}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDuplicateConfirm}
                        disabled={isDuplicating}
                        className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {isDuplicating ? 'Duplicating...' : 'Confirm Duplicate'}
                      </button>
                    </div>
                  </div>
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
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Agent Archetype</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {ARCHETYPE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setDraftSim((prev) => {
                              const nextPrompt =
                                option.value === 'assistant' &&
                                (prev.prompt.trim().length === 0 || prev.prompt === defaultDraftSim.prompt)
                                  ? DEFAULT_ASSISTANT_PROMPT
                                  : prev.prompt
                              return {
                                ...prev,
                                archetype: option.value,
                                prompt: nextPrompt,
                                knowledgeBaseMode:
                                  option.value === 'tutor' || option.value === 'assistant'
                                    ? 'strict_rag'
                                    : prev.knowledgeBaseMode,
                              }
                            })
                            if (option.value === 'tutor') {
                              setIsDocumentUploadsOpen(true)
                            }
                            setIsDirty(true)
                          }}
                          className={`rounded-md border px-3 py-3 text-left transition-colors ${
                            draftSim.archetype === option.value
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <p className="text-sm font-semibold text-gray-900">{option.title}</p>
                          <p className="mt-1 text-xs text-gray-600">{option.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      value={draftSim.title}
                      onChange={(e) => {
                        setDraftSim((prev) => ({ ...prev, title: e.target.value }))
                        setIsDirty(true)
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                      placeholder="e.g., Customer Service Scenario"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Cohorts</label>
                    <input
                      value={normalizeTargetCohorts(draftSim.targetCohorts).join(', ')}
                      onChange={(e) => {
                        const parsed = e.target.value
                          .split(',')
                          .map((item) => item.trim())
                          .filter((item) => item.length > 0)
                        setDraftSim((prev) => ({ ...prev, targetCohorts: parsed.length > 0 ? Array.from(new Set(parsed)) : ['global'] }))
                        setIsDirty(true)
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                      placeholder="global, summer-2026-NAI611"
                    />
                    <p className="text-xs text-gray-500 mb-4">
                      Enter one or more cohort tags to target this scenario experience.
                    </p>
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
                        No classes available. Create a class in the Class Management section to assign scenarios.
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
                      Practice scenarios always remain available for fresh attempts and are not treated as graded submissions.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">AI Mode</label>
                    <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-800">
                        <input
                          type="radio"
                          name="knowledge-base-mode"
                          value="standard"
                          checked={draftSim.knowledgeBaseMode === 'standard'}
                          onChange={() => {
                            setDraftSim((prev) => ({ ...prev, knowledgeBaseMode: 'standard' }))
                            setIsDirty(true)
                          }}
                          className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Standard (LLM Knowledge)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-800">
                        <input
                          type="radio"
                          name="knowledge-base-mode"
                          value="strict_rag"
                          checked={draftSim.knowledgeBaseMode === 'strict_rag'}
                          onChange={() => {
                            setDraftSim((prev) => ({ ...prev, knowledgeBaseMode: 'strict_rag' }))
                            setIsDocumentUploadsOpen(true)
                            setIsDirty(true)
                          }}
                          className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Document Grounded (Strict RAG)
                      </label>
                    </div>
                  </div>

                  {draftSim.knowledgeBaseMode === 'strict_rag' && (
                    <div
                      className={`mb-4 rounded-md p-4 ${
                        draftSim.archetype === 'tutor'
                          ? 'border-2 border-amber-300 bg-amber-50'
                          : 'border border-blue-200 bg-blue-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setIsDocumentUploadsOpen((prev) => !prev)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <h3 className="text-sm font-semibold text-blue-900">Document Uploads</h3>
                        <span className="text-xs font-semibold text-blue-800">{isDocumentUploadsOpen ? 'Hide' : 'Show'}</span>
                      </button>

                      {isDocumentUploadsOpen && (
                        <>
                          <p className="mt-2 text-xs text-blue-700">
                            Uploaded files are bound to this scenario and used as the only retrieval context during chat.
                          </p>
                          {draftSim.archetype === 'tutor' && (
                            <p className="mt-1 text-xs text-amber-800 font-medium">
                              Socratic Tutor mode is document-first. Upload curriculum materials to ground responses.
                            </p>
                          )}
                          <p className="mt-1 text-xs text-blue-700">Maximum file size: {MAX_DOCUMENT_SIZE_MB}MB per file.</p>
                          <input type="hidden" name="simulationId" value={selectedSimId || ''} readOnly />
                          <div className="mt-3">
                            <input
                              type="file"
                              multiple
                              onChange={handleSimulationDocumentUpload}
                              disabled={!selectedSimId || isUploadingDocument}
                              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 disabled:opacity-60"
                            />
                            {!selectedSimId && (
                              <p className="mt-2 text-xs text-amber-700">Save this scenario first to enable document uploads.</p>
                            )}
                            {isUploadingDocument && <p className="mt-2 text-xs text-blue-700">Uploading documents...</p>}
                            {documentUploadError && <p className="mt-2 text-xs text-red-700">{documentUploadError}</p>}
                          </div>

                          <div className="mt-4">
                            {Array.isArray(draftSim.uploadedDocuments) && draftSim.uploadedDocuments.length > 0 ? (
                              <div className="space-y-2">
                                {draftSim.uploadedDocuments.map((doc) => (
                                  <div
                                    key={doc.blobUrl}
                                    className="flex items-center justify-between gap-3 rounded-md border border-blue-100 bg-white px-3 py-2"
                                  >
                                    <a
                                      href={doc.blobUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sm text-blue-700 hover:underline break-all"
                                    >
                                      {doc.fileName}
                                    </a>
                                    <button
                                      type="button"
                                      title="Delete document"
                                      onClick={() => handleSimulationDocumentDelete(doc.blobUrl)}
                                      disabled={deletingDocumentUrl === doc.blobUrl}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60"
                                    >
                                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                                        <path
                                          fillRule="evenodd"
                                          d="M8.5 2a1 1 0 00-1 1V4H5a1 1 0 100 2h.293l.853 9.386A2 2 0 008.137 17h3.726a2 2 0 001.99-1.614L14.707 6H15a1 1 0 100-2h-2.5V3a1 1 0 00-1-1h-3zM9 4V3h2v1H9zm-.845 2h3.69l-.77 8.47a.5.5 0 01-.497.43H9.422a.5.5 0 01-.497-.43L8.155 6z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-blue-700">No documents uploaded yet.</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {draftSim.archetype === 'clinical' && (
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
                  )}

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
                  {draftSim.archetype === 'clinical' && (
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
                  )}
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
                      <p>You have unsaved changes to the scenario setup. Save the setup to apply them.</p>
                    </div>
                  )}
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors"
                      onClick={saveSetup}
                    >
                      {selectedSimId ? 'Save Changes' : 'Save as New Setup'}
                    </button>
                    <button
                      type="button"
                      className="w-full px-6 py-3 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300 transition-colors"
                      onClick={() => {
                        setSelectedSimId(null)
                        setCurrentView('list')
                      }}
                    >
                      Cancel
                    </button>
                  </div>
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
              </>
            )}

            {studioTab === 'userManagement' && (
              <UserDashboard currentUserRole={userRole} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { connectDie, glowDie } from '../../services/pixelsService'
import { buildCombinedFormula, transformCombinedFormula, transformSavedFormulaRoll, type CombinedRollMode, type SavedFormulaRollMode } from '../rollHelpers'
import {
  STORAGE_WARNING_EVENT,
  STORAGE_WARNING_MESSAGE,
  getActiveProfileState,
  type Profile,
  type ProfileSkill,
  type RollHistoryEntry,
  type SavedFormula,
  useAppStore,
} from '../../stores/useAppStore'
import type { RollOptionsModalOption } from '../../components/AdvantagePrompt'
import {
  MainScreenController,
  type MainScreenLocationState,
  type ToastState,
} from './MainScreenController'

const QUICK_CONNECT_HOLD_MS = 500
const FORMULA_CARD_HOLD_MS = 1000
const FORMULA_CARD_DRAG_THRESHOLD_PX = 12

type CharacterRollMode = 'normal' | 'advantage' | 'disadvantage'
type CombinedRollChoice = 'normal' | 'doubleDice' | 'doubleAll'
type FormulaRollChoice = 'normal' | 'doubleDice' | 'doubleAll'

type FormulaHoldState = {
  formulaId: string
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  holdTriggered: boolean
  dragging: boolean
}


export function useMainScreenController() {
  const controller = useMemo(() => new MainScreenController(), [])
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as MainScreenLocationState | null
  const profiles = useAppStore((state) => state.profiles)
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const bleAvailable = useAppStore((state) => state.bleAvailable)
  const bleError = useAppStore((state) => state.bleError)
  const pixels = useAppStore((state) => state.pixels)
  const deleteSavedFormula = useAppStore((state) => state.deleteSavedFormula)
  const moveSavedFormula = useAppStore((state) => state.moveSavedFormula)
  const clearBleError = useAppStore((state) => state.clearBleError)
  const createProfile = useAppStore((state) => state.createProfile)
  const renameProfile = useAppStore((state) => state.renameProfile)
  const deleteProfile = useAppStore((state) => state.deleteProfile)
  const selectProfile = useAppStore((state) => state.selectProfile)

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [formulaToDelete, setFormulaToDelete] = useState<SavedFormula | null>(null)
  const [isProfileManagerOpen, setIsProfileManagerOpen] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [renamingProfile, setRenamingProfile] = useState<Profile | null>(null)
  const [renameProfileName, setRenameProfileName] = useState('')
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [isQuickConnecting, setIsQuickConnecting] = useState(false)
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<RollHistoryEntry | null>(null)
  const [characterPromptSkill, setCharacterPromptSkill] = useState<ProfileSkill | null>(null)
  const [selectedFormulaIds, setSelectedFormulaIds] = useState<string[]>([])
  const [isCombinedRollPromptOpen, setIsCombinedRollPromptOpen] = useState(false)
  const [formulaRollPromptFormulaId, setFormulaRollPromptFormulaId] = useState<string | null>(null)
  const [draggingFormulaId, setDraggingFormulaId] = useState<string | null>(null)
  const [dragTargetFormulaId, setDragTargetFormulaId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastId = useRef(0)
  const toastTimeoutRef = useRef<number | null>(null)
  const quickConnectHoldTimer = useRef<number | null>(null)
  const quickConnectHoldTriggered = useRef(false)
  const formulaHoldTimer = useRef<number | null>(null)
  const formulaHoldState = useRef<FormulaHoldState | null>(null)
  const formulaHoldSuppressClick = useRef(false)
  const formulaDragTargetIndex = useRef<number | null>(null)
  const formulaHoldListenersCleanup = useRef<(() => void) | null>(null)

  const bannerMessage = useMemo(() => controller.getBannerMessage(bleAvailable), [bleAvailable, controller])
  const connectedPixelIds = useMemo(() => controller.getConnectedPixelIds(pixels), [controller, pixels])
  const profileList = useMemo(
    () => Object.values(profiles).sort((left, right) => left.createdAt - right.createdAt),
    [profiles],
  )
  const activeProfile = useMemo(
    () => getActiveProfileState({ profiles, activeProfileId }),
    [activeProfileId, profiles],
  )
  const savedFormulas = activeProfile?.formulas ?? []
  const rollHistory = activeProfile?.history ?? []
  const recentHistory = useMemo(() => controller.getRecentHistory(rollHistory), [controller, rollHistory])
  const fullHistory = useMemo(() => controller.getFullHistory(rollHistory), [controller, rollHistory])
  const selectedFormulas = useMemo(
    () => savedFormulas.filter((formula) => selectedFormulaIds.includes(formula.id)),
    [savedFormulas, selectedFormulaIds],
  )
  const combinedRollFormula = useMemo(
    () => buildCombinedFormula(selectedFormulas.map((formula) => formula.formula)),
    [selectedFormulas],
  )
  const combinedRollPromptOptions = useMemo(() => {
    if (!combinedRollFormula) {
      return []
    }

    return [
      {
        choice: 'normal' as const,
        label: 'Normal Roll',
        detail: combinedRollFormula,
        tone: 'neutral' as const,
        icon: { kind: 'dice' as const, dieType: 'd20' as const },
      },
      {
        choice: 'doubleDice' as const,
        label: 'Double Dice',
        detail: transformCombinedFormula(combinedRollFormula, 'doubleDice') ?? combinedRollFormula,
        tone: 'good' as const,
        icon: { kind: 'dice' as const, dieType: 'd20' as const, count: 2, badge: 'x2' },
      },
      {
        choice: 'doubleAll' as const,
        label: 'Double All',
        detail: transformCombinedFormula(combinedRollFormula, 'doubleAll') ?? combinedRollFormula,
        tone: 'bad' as const,
        icon: { kind: 'dice' as const, dieType: 'd20' as const, count: 2, badge: 'x2 ALL' },
      },
    ]
  }, [combinedRollFormula])

  const formulaRollPromptFormula = useMemo(
    () => savedFormulas.find((formula) => formula.id === formulaRollPromptFormulaId) ?? null,
    [formulaRollPromptFormulaId, savedFormulas],
  )

  const formulaRollPromptOptions = useMemo<RollOptionsModalOption<FormulaRollChoice>[]>(() => {
    if (!formulaRollPromptFormula) {
      return []
    }

    const normalFormula = transformSavedFormulaRoll(formulaRollPromptFormula.formula, 'normal') ?? formulaRollPromptFormula.formula
    const doubleDiceFormula = transformSavedFormulaRoll(formulaRollPromptFormula.formula, 'doubleDice') ?? formulaRollPromptFormula.formula
    const doubleAllFormula = transformSavedFormulaRoll(formulaRollPromptFormula.formula, 'doubleAll') ?? formulaRollPromptFormula.formula

    return [
      {
        choice: 'normal',
        label: 'Normal Roll',
        detail: normalFormula,
        tone: 'neutral',
        icon: { kind: 'dice' as const, dieType: 'd20' as const },
      },
      {
        choice: 'doubleDice',
        label: 'Double Dice',
        detail: doubleDiceFormula,
        tone: 'good',
        icon: { kind: 'dice' as const, dieType: 'd20' as const, count: 2, badge: 'x2' },
      },
      {
        choice: 'doubleAll',
        label: 'Double All',
        detail: doubleAllFormula,
        tone: 'bad',
        icon: { kind: 'dice' as const, dieType: 'd20' as const, count: 2, badge: 'x2 ALL' },
      },
    ]
  }, [formulaRollPromptFormula])

  useEffect(() => {
    if (formulaRollPromptFormulaId && !formulaRollPromptFormula) {
      setFormulaRollPromptFormulaId(null)
    }
  }, [formulaRollPromptFormula, formulaRollPromptFormulaId])

  const closeCharacterPrompt = useCallback(() => {
    setCharacterPromptSkill(null)
  }, [])

  const buildCharacterRollTarget = useCallback(
    (skill: ProfileSkill, mode: CharacterRollMode = 'normal') => {
      const formulaText =
        mode === 'advantage'
          ? `2d20kh1${skill.modifier >= 0 ? '+' : ''}${skill.modifier}`
          : mode === 'disadvantage'
            ? `2d20kl1${skill.modifier >= 0 ? '+' : ''}${skill.modifier}`
            : `1d20${skill.modifier >= 0 ? '+' : ''}${skill.modifier}`

      const modeLabel = mode === 'normal' ? '' : mode === 'advantage' ? ' (Advantage)' : ' (Disadvantage)'
      const name = `${activeProfile?.name ?? 'Character'} - ${skill.label}${modeLabel}`

      return { formulaText, name }
    },
    [activeProfile?.name],
  )

  const handleCharacterSkillTap = useCallback(
    (skill: ProfileSkill) => {
      const target = buildCharacterRollTarget(skill, 'normal')
      navigate('/roll', {
        state: {
          ...target,
          focusRollEngine: true,
        },
      })
    },
    [buildCharacterRollTarget, navigate],
  )

  const handleCharacterSkillLongPress = useCallback((skill: ProfileSkill) => {
    setCharacterPromptSkill(skill)
  }, [])

  const handleCharacterPromptChoose = useCallback(
    (mode: CharacterRollMode) => {
      if (!characterPromptSkill) {
        return
      }

      const target = buildCharacterRollTarget(characterPromptSkill, mode)
      closeCharacterPrompt()
      navigate('/roll', {
        state: {
          ...target,
          focusRollEngine: true,
        },
      })
    },
    [buildCharacterRollTarget, characterPromptSkill, closeCharacterPrompt, navigate],
  )

  const clearCombinedSelection = useCallback(() => {
    setSelectedFormulaIds([])
  }, [])

  const closeCombinedRollPrompt = useCallback(() => {
    setIsCombinedRollPromptOpen(false)
  }, [])

  const toggleCombinedFormulaSelection = useCallback((formulaId: string) => {
    setSelectedFormulaIds((current) =>
      current.includes(formulaId)
        ? current.filter((currentFormulaId) => currentFormulaId !== formulaId)
        : [...current, formulaId],
    )
  }, [])

  const launchCombinedRoll = useCallback(
    (choice: CombinedRollChoice = 'normal') => {
      if (!combinedRollFormula) {
        return
      }

      const formulaText =
        choice === 'normal'
          ? combinedRollFormula
          : transformCombinedFormula(combinedRollFormula, choice as CombinedRollMode)

      if (!formulaText) {
        return
      }

      closeCombinedRollPrompt()
      clearCombinedSelection()
      navigate('/roll', {
        state: {
          formulaText,
          name: 'Combined Roll',
          focusRollEngine: true,
        },
      })
    },
    [clearCombinedSelection, closeCombinedRollPrompt, combinedRollFormula, navigate],
  )

  const handleCombinedRollTap = useCallback(() => {
    launchCombinedRoll('normal')
  }, [launchCombinedRoll])

  const handleCombinedRollLongPress = useCallback(() => {
    if (selectedFormulas.length === 0) {
      return
    }

    setIsCombinedRollPromptOpen(true)
  }, [selectedFormulas.length])

  const handleCombinedRollPromptChoose = useCallback(
    (choice: CombinedRollChoice) => {
      launchCombinedRoll(choice)
    },
    [launchCombinedRoll],
  )

  const clearFormulaHoldTimer = useCallback(() => {
    if (formulaHoldTimer.current !== null) {
      window.clearTimeout(formulaHoldTimer.current)
      formulaHoldTimer.current = null
    }
  }, [])

  const clearFormulaHoldListeners = useCallback(() => {
    formulaHoldListenersCleanup.current?.()
    formulaHoldListenersCleanup.current = null
  }, [])

  const resetFormulaInteractionState = useCallback(() => {
    clearFormulaHoldTimer()
    clearFormulaHoldListeners()
    formulaHoldState.current = null
    formulaHoldSuppressClick.current = false
    formulaDragTargetIndex.current = null
    setDraggingFormulaId(null)
    setDragTargetFormulaId(null)
  }, [clearFormulaHoldListeners, clearFormulaHoldTimer])

  const openFormulaRollPrompt = useCallback((formulaId: string) => {
    setFormulaRollPromptFormulaId(formulaId)
  }, [])

  const closeFormulaRollPrompt = useCallback(() => {
    setFormulaRollPromptFormulaId(null)
  }, [])

  const updateFormulaDragTarget = useCallback(
    (clientY: number) => {
      const activeState = formulaHoldState.current
      if (!activeState) {
        return
      }

      const cardElements = Array.from(document.querySelectorAll<HTMLElement>('[data-formula-card-id]'))
      const cardIds = cardElements.map((element) => element.dataset.formulaCardId).filter((formulaId): formulaId is string => Boolean(formulaId))
      const activeIndex = cardIds.indexOf(activeState.formulaId)

      if (activeIndex < 0) {
        return
      }

      let targetIndex = cardElements.length
      for (let index = 0; index < cardElements.length; index += 1) {
        const element = cardElements[index]
        if (element.dataset.formulaCardId === activeState.formulaId) {
          continue
        }

        const rect = element.getBoundingClientRect()
        if (clientY < rect.top + rect.height / 2) {
          targetIndex = index
          break
        }
      }

      const targetFormulaId = cardIds[Math.min(targetIndex, cardIds.length - 1)] ?? null
      setDragTargetFormulaId(targetFormulaId)

      if (formulaDragTargetIndex.current === targetIndex) {
        return
      }

      formulaDragTargetIndex.current = targetIndex
      moveSavedFormula(activeState.formulaId, targetIndex)
    },
    [moveSavedFormula],
  )

  const startFormulaDrag = useCallback(
    (state: FormulaHoldState) => {
      if (state.dragging) {
        return
      }

      const distance = Math.hypot(state.lastX - state.startX, state.lastY - state.startY)
      if (distance < FORMULA_CARD_DRAG_THRESHOLD_PX) {
        return
      }

      state.dragging = true
      formulaHoldSuppressClick.current = true
      setDraggingFormulaId(state.formulaId)
      updateFormulaDragTarget(state.lastY)
    },
    [updateFormulaDragTarget],
  )

  const beginFormulaHoldListeners = useCallback(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = formulaHoldState.current
      if (!state || event.pointerId !== state.pointerId) {
        return
      }

      state.lastX = event.clientX
      state.lastY = event.clientY

      if (state.holdTriggered) {
        startFormulaDrag(state)
        if (state.dragging) {
          updateFormulaDragTarget(event.clientY)
        }
      }
    }

    const finishInteraction = (event: PointerEvent) => {
      const state = formulaHoldState.current
      if (!state || event.pointerId !== state.pointerId) {
        return
      }

      clearFormulaHoldTimer()

      if (state.holdTriggered && !state.dragging) {
        formulaHoldSuppressClick.current = true
        openFormulaRollPrompt(state.formulaId)
      }

      clearFormulaHoldListeners()
      formulaHoldState.current = null
      formulaDragTargetIndex.current = null
      setDraggingFormulaId(null)
      setDragTargetFormulaId(null)
    }

    const handlePointerCancel = (event: PointerEvent) => {
      finishInteraction(event)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishInteraction)
    window.addEventListener('pointercancel', handlePointerCancel)

    formulaHoldListenersCleanup.current = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishInteraction)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [clearFormulaHoldListeners, clearFormulaHoldTimer, openFormulaRollPrompt, startFormulaDrag, updateFormulaDragTarget])

  const handleFormulaCardPointerDown = useCallback(
    (formulaId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return
      }

      resetFormulaInteractionState()
      formulaHoldSuppressClick.current = false
      formulaHoldState.current = {
        formulaId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        holdTriggered: false,
        dragging: false,
      }

      beginFormulaHoldListeners()

      formulaHoldTimer.current = window.setTimeout(() => {
        const state = formulaHoldState.current
        if (!state || state.formulaId !== formulaId) {
          return
        }

        state.holdTriggered = true
        formulaHoldTimer.current = null
        formulaHoldSuppressClick.current = true
        startFormulaDrag(state)
      }, FORMULA_CARD_HOLD_MS)
    },
    [beginFormulaHoldListeners, resetFormulaInteractionState, startFormulaDrag],
  )

  const handleFormulaCardClick = useCallback(
    (formulaId: string) => {
      if (formulaHoldSuppressClick.current) {
        formulaHoldSuppressClick.current = false
        return
      }

      navigate(`/roll/${formulaId}`)
    },
    [navigate],
  )

  const handleFormulaRollPromptChoose = useCallback(
    (choice: FormulaRollChoice) => {
      if (!formulaRollPromptFormula) {
        return
      }

      const formulaText = transformSavedFormulaRoll(formulaRollPromptFormula.formula, choice as SavedFormulaRollMode) ?? formulaRollPromptFormula.formula

      closeFormulaRollPrompt()
      navigate('/roll', {
        state: {
          formulaText,
          name: formulaRollPromptFormula.name,
          focusRollEngine: true,
        },
      })
    },
    [closeFormulaRollPrompt, formulaRollPromptFormula, navigate],
  )

  const openProfileManager = useCallback(() => {
    setProfileError(null)
    setIsProfileManagerOpen(true)
  }, [])

  const closeProfileManager = useCallback(() => {
    setIsProfileManagerOpen(false)
    setNewProfileName('')
    setRenamingProfile(null)
    setRenameProfileName('')
    setProfileToDelete(null)
    setProfileError(null)
  }, [])

  const createProfileFromInput = useCallback(() => {
    const createdId = createProfile(newProfileName)
    if (!createdId) {
      setProfileError('Profile name must be non-empty and unique')
      return false
    }

    setNewProfileName('')
    setProfileError(null)
    setIsProfileManagerOpen(false)
    return true
  }, [createProfile, newProfileName])

  const startRenameProfile = useCallback((profile: Profile) => {
    setRenamingProfile(profile)
    setRenameProfileName(profile.name)
    setProfileError(null)
  }, [])

  const cancelRenameProfile = useCallback(() => {
    setRenamingProfile(null)
    setRenameProfileName('')
  }, [])

  const saveRenameProfile = useCallback(() => {
    if (!renamingProfile) {
      return false
    }

    const renamed = renameProfile(renamingProfile.id, renameProfileName)
    if (!renamed) {
      setProfileError('Profile name must be non-empty and unique')
      return false
    }

    setRenamingProfile(null)
    setRenameProfileName('')
    setProfileError(null)
    return true
  }, [renameProfile, renameProfileName, renamingProfile])

  const requestDeleteProfile = useCallback((profile: Profile) => {
    setProfileToDelete(profile)
    setProfileError(null)
  }, [])

  const cancelDeleteProfile = useCallback(() => {
    setProfileToDelete(null)
  }, [])

  const confirmDeleteProfile = useCallback(() => {
    if (!profileToDelete) {
      return false
    }

    const deleted = deleteProfile(profileToDelete.id)
    if (!deleted) {
      setProfileError('The last remaining profile cannot be deleted')
      return false
    }

    setProfileToDelete(null)
    return true
  }, [deleteProfile, profileToDelete])

  const handleSelectProfile = useCallback((profileId: string) => {
    if (!selectProfile(profileId)) {
      setProfileError('Profile not found')
      return false
    }

    setIsProfileManagerOpen(false)
    setProfileError(null)
    return true
  }, [selectProfile])

  const clearQuickConnectHoldTimer = useCallback(() => {
    if (quickConnectHoldTimer.current !== null) {
      window.clearTimeout(quickConnectHoldTimer.current)
      quickConnectHoldTimer.current = null
    }
  }, [])

  const showToast = useCallback((message: string) => {
    toastId.current += 1
    const id = toastId.current
    setToast({ id, message })

    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }

    toastTimeoutRef.current = window.setTimeout(() => {
      if (toastId.current === id) {
        setToast(null)
      }
      toastTimeoutRef.current = null
    }, 10_000)
  }, [])

  const handleQuickConnect = useCallback(async () => {
    setIsQuickConnecting(true)
    try {
      await connectDie()
    } finally {
      setIsQuickConnecting(false)
    }
  }, [])

  const handleQuickConnectClick = useCallback(() => {
    if (quickConnectHoldTriggered.current) {
      quickConnectHoldTriggered.current = false
      return
    }

    void handleQuickConnect()
  }, [handleQuickConnect])

  const handleQuickConnectHoldStart = useCallback(() => {
    clearQuickConnectHoldTimer()
    quickConnectHoldTriggered.current = false

    if (connectedPixelIds.length === 0 || isQuickConnecting) {
      return
    }

    quickConnectHoldTimer.current = window.setTimeout(() => {
      quickConnectHoldTriggered.current = true
      quickConnectHoldTimer.current = null
      void Promise.allSettled(connectedPixelIds.map((pixelId) => glowDie(pixelId)))
    }, QUICK_CONNECT_HOLD_MS)
  }, [clearQuickConnectHoldTimer, connectedPixelIds, isQuickConnecting])

  const handleQuickConnectHoldEnd = useCallback(() => {
    clearQuickConnectHoldTimer()
  }, [clearQuickConnectHoldTimer])

  const deleteFormula = useCallback(() => {
    if (!formulaToDelete) {
      return
    }

    deleteSavedFormula(formulaToDelete.id)
    setFormulaToDelete(null)
    showToast('Formula deleted')
  }, [deleteSavedFormula, formulaToDelete, showToast])

  useEffect(() => {
    if (!bleError) {
      return
    }

    showToast(bleError)
    clearBleError()
  }, [bleError, clearBleError, showToast])

  useEffect(() => {
    const handleStorageWarning = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>
      showToast(customEvent.detail?.message ?? STORAGE_WARNING_MESSAGE)
    }

    window.addEventListener(STORAGE_WARNING_EVENT, handleStorageWarning)
    return () => {
      window.removeEventListener(STORAGE_WARNING_EVENT, handleStorageWarning)
    }
  }, [showToast])

  useEffect(() => {
    const navigationToast = locationState?.toastMessage
    if (!navigationToast) {
      return
    }

    showToast(navigationToast)
    navigate(location.pathname, {
      replace: true,
      state: locationState?.mainBackGuard ? { mainBackGuard: true } : null,
    })
  }, [location.pathname, locationState, navigate, showToast])

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current)
        toastTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (location.pathname !== '/' || locationState?.mainBackGuard) {
      return
    }

    navigate(location.pathname, {
      state: {
        ...(locationState ?? {}),
        mainBackGuard: true,
      },
    })
  }, [location.pathname, locationState, navigate])

  useEffect(() => () => {
    clearQuickConnectHoldTimer()
  }, [clearQuickConnectHoldTimer])

  useEffect(() => {
    setSelectedFormulaIds((current) => {
      const validFormulaIds = new Set(savedFormulas.map((formula) => formula.id))
      return current.filter((formulaId) => validFormulaIds.has(formulaId))
    })
  }, [savedFormulas])

  useEffect(() => {
    setSelectedFormulaIds([])
    setIsCombinedRollPromptOpen(false)
    setFormulaRollPromptFormulaId(null)
    resetFormulaInteractionState()
  }, [activeProfileId])

  useEffect(() => {
    if (selectedFormulaIds.length === 0) {
      setIsCombinedRollPromptOpen(false)
    }
  }, [selectedFormulaIds.length])

  useEffect(() => {
    if (draggingFormulaId && !savedFormulas.some((formula) => formula.id === draggingFormulaId)) {
      resetFormulaInteractionState()
    }
  }, [draggingFormulaId, resetFormulaInteractionState, savedFormulas])

  useEffect(() => () => {
    resetFormulaInteractionState()
  }, [resetFormulaInteractionState])

  return {
    activeMenuId,
    bannerMessage,
    bleAvailable,
    activeProfile,
    activeProfileId,
    profileList,
    isProfileManagerOpen,
    newProfileName,
    renamingProfile,
    renameProfileName,
    profileToDelete,
    profileError,
    formulaToDelete,
    fullHistory,
    isHistoryDialogOpen,
    isQuickConnecting,
    recentHistory,
    savedFormulas,
    selectedFormulaIds,
    combinedRollPromptOptions,
    isCombinedRollPromptOpen,
    formulaRollPromptFormula,
    formulaRollPromptOptions,
    isFormulaRollPromptOpen: formulaRollPromptFormula !== null,
    draggingFormulaId,
    dragTargetFormulaId,
    selectedHistoryEntry,
    characterPromptSkill,
    toast,
    openProfileManager,
    closeProfileManager,
    setNewProfileName,
    createProfileFromInput,
    startRenameProfile,
    cancelRenameProfile,
    setRenameProfileName,
    saveRenameProfile,
    requestDeleteProfile,
    cancelDeleteProfile,
    confirmDeleteProfile,
    handleSelectProfile,
    navigateToNewFormula: () => navigate('/formula/new'),
    navigateToSettings: () => navigate('/settings'),
    navigateToProfiles: () => navigate('/profiles'),
    navigateToEditFormula: (formulaId: string) => navigate(`/formula/${formulaId}`),
    navigateToRollFormula: (formulaId: string) => navigate(`/roll/${formulaId}`),
    openFormulaMenu: (formulaId: string) => setActiveMenuId((current) => (current === formulaId ? null : formulaId)),
    closeFormulaMenu: () => setActiveMenuId(null),
    openDeleteDialog: (formula: SavedFormula) => setFormulaToDelete(formula),
    closeDeleteDialog: () => setFormulaToDelete(null),
    deleteFormula,
    openHistoryDialog: () => setIsHistoryDialogOpen(true),
    closeHistoryDialog: () => setIsHistoryDialogOpen(false),
    openHistoryEntry: (entry: RollHistoryEntry) => setSelectedHistoryEntry(entry),
    closeHistoryEntry: () => setSelectedHistoryEntry(null),
    handleCharacterSkillTap,
    handleCharacterSkillLongPress,
    handleCharacterPromptChoose,
    closeCharacterPrompt,
    toggleCombinedFormulaSelection,
    handleCombinedRollTap,
    handleCombinedRollLongPress,
    handleCombinedRollPromptChoose,
    closeCombinedRollPrompt,
    handleFormulaCardPointerDown,
    handleFormulaCardClick,
    handleFormulaRollPromptChoose,
    closeFormulaRollPrompt,
    handleQuickConnectClick,
    handleQuickConnectHoldStart,
    handleQuickConnectHoldEnd,
  }
}
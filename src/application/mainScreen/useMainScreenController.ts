import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createRollHistoryEntry } from '../../pages/formulaHelpers'
import { rollFormula } from '../../services/characterRoll'
import { connectDie, glowDie } from '../../services/pixelsService'
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
import type { EvaluationResult } from '../../types/formula'
import {
  MainScreenController,
  type MainScreenLocationState,
  type ToastState,
} from './MainScreenController'

const QUICK_CONNECT_HOLD_MS = 500

type CharacterRollMode = 'normal' | 'advantage' | 'disadvantage'

type CharacterRollState = {
  skill: ProfileSkill
  mode: CharacterRollMode
  formulaName: string
  formulaString: string
  result: EvaluationResult
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
  const clearBleError = useAppStore((state) => state.clearBleError)
  const createProfile = useAppStore((state) => state.createProfile)
  const renameProfile = useAppStore((state) => state.renameProfile)
  const deleteProfile = useAppStore((state) => state.deleteProfile)
  const selectProfile = useAppStore((state) => state.selectProfile)
  const addRollHistory = useAppStore((state) => state.addRollHistory)

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
  const [characterRollState, setCharacterRollState] = useState<CharacterRollState | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastId = useRef(0)
  const toastTimeoutRef = useRef<number | null>(null)
  const quickConnectHoldTimer = useRef<number | null>(null)
  const quickConnectHoldTriggered = useRef(false)

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

  const closeCharacterPrompt = useCallback(() => {
    setCharacterPromptSkill(null)
  }, [])

  const rollCharacterSkill = useCallback(
    (skill: ProfileSkill, mode: CharacterRollMode = 'normal') => {
      const formulaString =
        mode === 'advantage'
          ? `2d20kh1${skill.modifier >= 0 ? '+' : ''}${skill.modifier}`
          : mode === 'disadvantage'
            ? `2d20kl1${skill.modifier >= 0 ? '+' : ''}${skill.modifier}`
            : `1d20${skill.modifier >= 0 ? '+' : ''}${skill.modifier}`

      const rolled = rollFormula(formulaString)
      if (!rolled || !activeProfile) {
        return false
      }

      const modeLabel = mode === 'normal' ? '' : mode === 'advantage' ? ' (Advantage)' : ' (Disadvantage)'
      const formulaName = `${activeProfile.name} - ${skill.label}${modeLabel}`

      addRollHistory(createRollHistoryEntry(formulaName, rolled.parsedFormula, rolled.result))
      setCharacterRollState({
        skill,
        mode,
        formulaName,
        formulaString: rolled.parsedFormula.canonical,
        result: rolled.result,
      })

      return true
    },
    [activeProfile, addRollHistory],
  )

  const handleCharacterSkillTap = useCallback(
    (skill: ProfileSkill) => {
      rollCharacterSkill(skill, 'normal')
      closeCharacterPrompt()
    },
    [closeCharacterPrompt, rollCharacterSkill],
  )

  const handleCharacterSkillLongPress = useCallback((skill: ProfileSkill) => {
    setCharacterPromptSkill(skill)
  }, [])

  const handleCharacterPromptChoose = useCallback(
    (mode: CharacterRollMode) => {
      if (!characterPromptSkill) {
        return
      }

      rollCharacterSkill(characterPromptSkill, mode)
      closeCharacterPrompt()
    },
    [characterPromptSkill, closeCharacterPrompt, rollCharacterSkill],
  )

  const closeCharacterRollResult = useCallback(() => {
    setCharacterRollState(null)
  }, [])

  const rollCharacterAgain = useCallback(() => {
    if (!characterRollState) {
      return
    }

    rollCharacterSkill(characterRollState.skill, characterRollState.mode)
  }, [characterRollState, rollCharacterSkill])

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
    selectedHistoryEntry,
    characterPromptSkill,
    characterRollState,
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
    closeCharacterRollResult,
    rollCharacterAgain,
    handleQuickConnectClick,
    handleQuickConnectHoldStart,
    handleQuickConnectHoldEnd,
  }
}
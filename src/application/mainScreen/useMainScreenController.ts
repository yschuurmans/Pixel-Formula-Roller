import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { connectDie, glowDie } from '../../services/pixelsService'
import {
  STORAGE_WARNING_EVENT,
  STORAGE_WARNING_MESSAGE,
  type RollHistoryEntry,
  type SavedFormula,
  useAppStore,
} from '../../stores/useAppStore'
import {
  MainScreenController,
  type MainScreenLocationState,
  type ToastState,
} from './MainScreenController'

const QUICK_CONNECT_HOLD_MS = 500

export function useMainScreenController() {
  const controller = useMemo(() => new MainScreenController(), [])
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as MainScreenLocationState | null
  const savedFormulas = useAppStore((state) => state.savedFormulas)
  const rollHistory = useAppStore((state) => state.rollHistory)
  const bleAvailable = useAppStore((state) => state.bleAvailable)
  const bleError = useAppStore((state) => state.bleError)
  const pixels = useAppStore((state) => state.pixels)
  const deleteSavedFormula = useAppStore((state) => state.deleteSavedFormula)
  const clearBleError = useAppStore((state) => state.clearBleError)

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [formulaToDelete, setFormulaToDelete] = useState<SavedFormula | null>(null)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [isQuickConnecting, setIsQuickConnecting] = useState(false)
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<RollHistoryEntry | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastId = useRef(0)
  const toastTimeoutRef = useRef<number | null>(null)
  const quickConnectHoldTimer = useRef<number | null>(null)
  const quickConnectHoldTriggered = useRef(false)

  const bannerMessage = useMemo(() => controller.getBannerMessage(bleAvailable), [bleAvailable, controller])
  const recentHistory = useMemo(() => controller.getRecentHistory(rollHistory), [controller, rollHistory])
  const fullHistory = useMemo(() => controller.getFullHistory(rollHistory), [controller, rollHistory])
  const connectedPixelIds = useMemo(() => controller.getConnectedPixelIds(pixels), [controller, pixels])

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
    formulaToDelete,
    fullHistory,
    isHistoryDialogOpen,
    isQuickConnecting,
    recentHistory,
    savedFormulas,
    selectedHistoryEntry,
    toast,
    navigateToNewFormula: () => navigate('/formula/new'),
    navigateToSettings: () => navigate('/settings'),
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
    handleQuickConnectClick,
    handleQuickConnectHoldStart,
    handleQuickConnectHoldEnd,
  }
}
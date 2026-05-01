import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  connectRememberedDice,
  connectDie,
  disconnectDie,
  forgetDie,
  glowCleanupOrientation,
  glowDie,
  reconnectPairedDice,
  startBatteryHighlightCycle,
  stopBatteryHighlightCycle,
  stopGlow,
} from '../../services/pixelsService'
import type { DieType } from '../../types/formula'
import { useAppStore } from '../../stores/useAppStore'
import {
  CLEANUP_BASE_GLOW,
  CLEANUP_BOTTOM_FACE_GLOW,
  CLEANUP_DIE_ORDER,
  CLEANUP_GLOW_INTERVAL_MS,
  CLEANUP_RECONNECT_INTERVAL_MS,
  CLEANUP_TOP_FACE_GLOW,
  SettingsScreenController,
} from './SettingsScreenController'

export function useSettingsScreenController() {
  const controller = useMemo(() => new SettingsScreenController(), [])
  const navigate = useNavigate()
  const pixels = useAppStore((state) => state.pixels)
  const pairedPixelIds = useAppStore((state) => state.pairedPixelIds)
  const pairedPixels = useAppStore((state) => state.pairedPixels)
  const bleAvailable = useAppStore((state) => state.bleAvailable)
  const bleError = useAppStore((state) => state.bleError)
  const clearBleError = useAppStore((state) => state.clearBleError)
  const settings = useAppStore((state) => state.settings)
  const setSettings = useAppStore((state) => state.setSettings)

  const [isConnecting, setIsConnecting] = useState(false)
  const [isFlashingAll, setIsFlashingAll] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [activeCleanupDieType, setActiveCleanupDieType] = useState<DieType | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimeoutRef = useRef<number | null>(null)
  const latestPixelsRef = useRef(pixels)
  const latestPairedPixelsRef = useRef(pairedPixels)
  const previousCleanupDieTypeRef = useRef<DieType | null>(null)

  const pixelEntries = useMemo(() => controller.getPixelEntries(pixels), [controller, pixels])
  const bleUnavailableMessage = useMemo(() => controller.getBleUnavailableMessage(bleAvailable), [bleAvailable, controller])
  const reconnectDisabledReason = useMemo(
    () => controller.getReconnectDisabledReason(bleAvailable, bleUnavailableMessage, pairedPixelIds),
    [bleAvailable, bleUnavailableMessage, controller, pairedPixelIds],
  )
  const connectedPixelIds = useMemo(() => controller.getConnectedPixelIds(pixelEntries), [controller, pixelEntries])
  const cleanupConnectedPixelIds = useMemo(
    () => controller.getCleanupConnectedPixelIds(activeCleanupDieType, pixelEntries),
    [activeCleanupDieType, controller, pixelEntries],
  )

  useEffect(() => {
    latestPixelsRef.current = pixels
  }, [pixels])

  useEffect(() => {
    latestPairedPixelsRef.current = pairedPixels
  }, [pairedPixels])

  const showToast = useCallback((message: string, durationMs = 10_000) => {
    setToast(message)

    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }

    toastTimeoutRef.current = window.setTimeout(() => setToast(null), durationMs)
  }, [])

  useEffect(() => {
    if (!bleError) {
      return
    }

    showToast(bleError)
    clearBleError()
  }, [bleError, clearBleError, showToast])

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current)
        toastTimeoutRef.current = null
      }
    }
  }, [])

  const stopCleanupGlowForType = useCallback(async (dieType: DieType) => {
    const pixelIds = controller
      .getConnectedPixelsForCleanup(latestPixelsRef.current, dieType)
      .map((pixel) => pixel.pixelId)

    await Promise.allSettled(pixelIds.map((pixelId) => stopGlow(pixelId)))
  }, [controller])

  useEffect(() => {
    const previousDieType = previousCleanupDieTypeRef.current

    if (previousDieType !== null && previousDieType !== activeCleanupDieType) {
      void stopCleanupGlowForType(previousDieType)
    }

    previousCleanupDieTypeRef.current = activeCleanupDieType
  }, [activeCleanupDieType, stopCleanupGlowForType])

  useEffect(() => {
    return () => {
      if (previousCleanupDieTypeRef.current !== null) {
        void stopCleanupGlowForType(previousCleanupDieTypeRef.current)
      }
    }
  }, [stopCleanupGlowForType])

  const handleToggleHighlight = useCallback((enabled: boolean) => {
    setSettings(controller.getNextHighlightSettings(settings, enabled))

    if (enabled) {
      setActiveCleanupDieType(null)
    }

    if (enabled) {
      if (!pairedPixelIds || pairedPixelIds.length === 0) {
        showToast('No paired dice to highlight.', 6_000)
        return
      }

      startBatteryHighlightCycle()
    } else {
      stopBatteryHighlightCycle()
    }
  }, [controller, pairedPixelIds, setSettings, settings, showToast])

  const handleConnect = useCallback(async () => {
    setIsConnecting(true)
    try {
      await connectDie()
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const handleReconnect = useCallback(async () => {
    setIsReconnecting(true)
    try {
      await reconnectPairedDice({ allowPromptFallback: true })
    } finally {
      setIsReconnecting(false)
    }
  }, [])

  const handleFlashDie = useCallback(async (pixelId: string) => {
    await glowDie(pixelId)
  }, [])

  const handleFlashAllDice = useCallback(async () => {
    setIsFlashingAll(true)
    try {
      await Promise.all(connectedPixelIds.map((pixelId) => glowDie(pixelId)))
    } finally {
      setIsFlashingAll(false)
    }
  }, [connectedPixelIds])

  const glowCleanupFacesForPixel = useCallback(async (pixelId: string) => {
    await glowCleanupOrientation(pixelId, {
      baseColor: CLEANUP_BASE_GLOW,
      lowFaceColor: CLEANUP_BOTTOM_FACE_GLOW,
      highFaceColor: CLEANUP_TOP_FACE_GLOW,
    })
  }, [])

  useEffect(() => {
    if (activeCleanupDieType === null) {
      return
    }

    let cancelled = false

    const reconnectCleanupDice = async () => {
      const rememberedPixelIds = controller.getRememberedPixelIdsForCleanup(
        latestPairedPixelsRef.current,
        activeCleanupDieType,
      )
      const connectedIds = controller
        .getConnectedPixelsForCleanup(latestPixelsRef.current, activeCleanupDieType)
        .map((pixel) => pixel.pixelId)
      const missingPixelIds = rememberedPixelIds.filter((pixelId) => !connectedIds.includes(pixelId))

      if (missingPixelIds.length === 0 || cancelled) {
        return
      }

      await connectRememberedDice(
        missingPixelIds,
        {
          suppressErrors: true,
          continueOnError: true,
        },
        'cleanup-reconnect',
      )
    }

    const glowCleanupDice = async () => {
      const connectedPixels = controller.getConnectedPixelsForCleanup(latestPixelsRef.current, activeCleanupDieType)

      if (connectedPixels.length === 0 || cancelled) {
        return
      }

      await Promise.allSettled(connectedPixels.map((pixel) => glowCleanupFacesForPixel(pixel.pixelId)))
    }

    void reconnectCleanupDice()
    void glowCleanupDice()

    const reconnectIntervalId = window.setInterval(() => {
      void reconnectCleanupDice()
    }, CLEANUP_RECONNECT_INTERVAL_MS)
    const glowIntervalId = window.setInterval(() => {
      void glowCleanupDice()
    }, CLEANUP_GLOW_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(reconnectIntervalId)
      window.clearInterval(glowIntervalId)
    }
  }, [activeCleanupDieType, controller, glowCleanupFacesForPixel])

  useEffect(() => {
    if (activeCleanupDieType === null || cleanupConnectedPixelIds.length === 0) {
      return
    }

    const connectedPixels = controller.getConnectedPixelsForCleanup(pixels, activeCleanupDieType)
    void Promise.allSettled(connectedPixels.map((pixel) => glowCleanupFacesForPixel(pixel.pixelId)))
  }, [activeCleanupDieType, cleanupConnectedPixelIds, controller, glowCleanupFacesForPixel, pixels])

  return {
    activeCleanupDieType,
    bleAvailable,
    bleUnavailableMessage,
    cleanupDieOrder: CLEANUP_DIE_ORDER,
    connectedPixelIds,
    isConnecting,
    isFlashingAll,
    isReconnecting,
    pairedPixelIds,
    pairedPixels,
    pixelEntries,
    reconnectDisabledReason,
    settings,
    toast,
    navigateHome: () => navigate('/', { replace: true }),
    handleToggleHighlight,
    handleConnect,
    handleReconnect,
    handleFlashDie,
    handleFlashAllDice,
    handleDisconnectDie: (pixelId: string) => disconnectDie(pixelId),
    handleForgetDie: (pixelId: string) => void forgetDie(pixelId),
    handleCleanupToggle: (dieType: DieType) => {
      const next = controller.getNextCleanupDieType(activeCleanupDieType, dieType)
      if (next !== null && settings.highlightLowBattery) {
        handleToggleHighlight(false)
      }
      setActiveCleanupDieType(next)
    },
    getConnectedCountForDieType: (dieType: DieType) => controller.getConnectedCountForDieType(pixelEntries, dieType),
    getRememberedCountForDieType: (dieType: DieType) => controller.getRememberedCountForDieType(pairedPixels, dieType),
  }
}
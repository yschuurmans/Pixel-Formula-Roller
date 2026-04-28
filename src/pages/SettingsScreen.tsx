import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  connectRememberedDice,
  connectDie,
  disconnectDie,
  forgetDie,
  getBleUnavailableMessage,
  glowDie,
  glowCleanupOrientation,
  reconnectPairedDice,
  stopGlow,
} from '../services/pixelsService'
import DieIcon from '../components/DieIcon'
import type { DieType } from '../types/formula'
import { useAppStore } from '../stores/useAppStore'

const CLEANUP_DIE_ORDER: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
const CLEANUP_RECONNECT_INTERVAL_MS = 2_000
const CLEANUP_GLOW_INTERVAL_MS = 30_000
const CLEANUP_BASE_GLOW = { r: 40, g: 40, b: 40 } as const
const CLEANUP_LOW_FACE_GLOW = { r: 255, g: 68, b: 68 } as const
const CLEANUP_HIGH_FACE_GLOW = { r: 34, g: 255, b: 94 } as const

function displayDieType(dieType: DieType): string {
  return dieType === 'd100' ? 'd%' : dieType
}

function connectionStatusLabel(connectionState: 'connected' | 'disconnected'): string {
  return connectionState === 'connected' ? 'Connected' : 'Disconnected'
}

export default function SettingsScreen() {
  const navigate = useNavigate()
  const pixels = useAppStore((state) => state.pixels)
  const pairedPixelIds = useAppStore((state) => state.pairedPixelIds)
  const pairedPixels = useAppStore((state) => state.pairedPixels)
  const bleAvailable = useAppStore((state) => state.bleAvailable)
  const bleError = useAppStore((state) => state.bleError)
  const clearBleError = useAppStore((state) => state.clearBleError)

  const [isConnecting, setIsConnecting] = useState(false)
  const [isFlashingAll, setIsFlashingAll] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [activeCleanupDieType, setActiveCleanupDieType] = useState<DieType | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimeoutRef = useRef<number | null>(null)
  const latestPixelsRef = useRef(pixels)
  const latestPairedPixelsRef = useRef(pairedPixels)
  const previousCleanupDieTypeRef = useRef<DieType | null>(null)

  const pixelEntries = useMemo(
    () =>
      Object.values(pixels).sort((left, right) => {
        if (left.connectionState !== right.connectionState) {
          return left.connectionState === 'connected' ? -1 : 1
        }

        return left.pixelId.localeCompare(right.pixelId)
      }),
    [pixels],
  )

  const bleUnavailableMessage = bleAvailable
    ? null
    : getBleUnavailableMessage() ?? 'Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.'

  const reconnectDisabledReason = !bleAvailable
    ? bleUnavailableMessage
    : pairedPixelIds.length === 0
      ? 'Connect a die once to enable reconnect.'
      : undefined

  const connectedPixelIds = useMemo(
    () => pixelEntries.filter((pixel) => pixel.connectionState === 'connected').map((pixel) => pixel.pixelId),
    [pixelEntries],
  )
  const cleanupConnectedPixelIds = useMemo(
    () =>
      activeCleanupDieType === null
        ? []
        : pixelEntries
            .filter((pixel) => pixel.connectionState === 'connected' && pixel.dieType === activeCleanupDieType)
            .map((pixel) => pixel.pixelId),
    [activeCleanupDieType, pixelEntries],
  )

  useEffect(() => {
    latestPixelsRef.current = pixels
  }, [pixels])

  useEffect(() => {
    latestPairedPixelsRef.current = pairedPixels
  }, [pairedPixels])

  useEffect(() => {
    if (!bleError) {
      return
    }

    setToast(bleError)
    clearBleError()

    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }

    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 10_000)
  }, [bleError, clearBleError])

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current)
        toastTimeoutRef.current = null
      }
    }
  }, [])

  const stopCleanupGlowForType = async (dieType: DieType) => {
    const pixelIds = Object.values(latestPixelsRef.current)
      .filter((pixel) => pixel.connectionState === 'connected' && pixel.dieType === dieType)
      .map((pixel) => pixel.pixelId)

    await Promise.allSettled(pixelIds.map((pixelId) => stopGlow(pixelId)))
  }

  useEffect(() => {
    const previousDieType = previousCleanupDieTypeRef.current

    if (previousDieType !== null && previousDieType !== activeCleanupDieType) {
      void stopCleanupGlowForType(previousDieType)
    }

    previousCleanupDieTypeRef.current = activeCleanupDieType
  }, [activeCleanupDieType])

  useEffect(() => {
    return () => {
      if (previousCleanupDieTypeRef.current !== null) {
        void stopCleanupGlowForType(previousCleanupDieTypeRef.current)
      }
    }
  }, [])

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      await connectDie()
    } finally {
      setIsConnecting(false)
    }
  }

  const handleReconnect = async () => {
    setIsReconnecting(true)
    try {
      await reconnectPairedDice({ allowPromptFallback: true })
    } finally {
      setIsReconnecting(false)
    }
  }

  const handleFlashDie = async (pixelId: string) => {
    await glowDie(pixelId)
  }

  const handleFlashAllDice = async () => {
    setIsFlashingAll(true)
    try {
      await Promise.all(connectedPixelIds.map((pixelId) => glowDie(pixelId)))
    } finally {
      setIsFlashingAll(false)
    }
  }

  const glowCleanupFacesForPixel = async (pixelId: string) => {
    await glowCleanupOrientation(pixelId, {
      baseColor: CLEANUP_BASE_GLOW,
      lowFaceColor: CLEANUP_LOW_FACE_GLOW,
      highFaceColor: CLEANUP_HIGH_FACE_GLOW,
    })
  }

  useEffect(() => {
    if (activeCleanupDieType === null) {
      return
    }

    let cancelled = false

    const reconnectCleanupDice = async () => {
      const rememberedPixelIds = Object.values(latestPairedPixelsRef.current)
        .filter((pixel) => pixel.dieType === activeCleanupDieType)
        .map((pixel) => pixel.pixelId)
      const connectedIds = Object.values(latestPixelsRef.current)
        .filter((pixel) => pixel.connectionState === 'connected' && pixel.dieType === activeCleanupDieType)
        .map((pixel) => pixel.pixelId)
      const missingPixelIds = rememberedPixelIds.filter((pixelId) => !connectedIds.includes(pixelId))

      if (missingPixelIds.length === 0 || cancelled) {
        return
      }

      await connectRememberedDice(missingPixelIds, {
        suppressErrors: true,
        continueOnError: true,
      })
    }

    const glowCleanupDice = async () => {
      const connectedPixels = Object.values(latestPixelsRef.current)
        .filter((pixel) => pixel.connectionState === 'connected' && pixel.dieType === activeCleanupDieType)

      if (connectedPixels.length === 0 || cancelled) {
        return
      }

      await Promise.allSettled(
        connectedPixels.map((pixel) => glowCleanupFacesForPixel(pixel.pixelId)),
      )
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
  }, [activeCleanupDieType])

  useEffect(() => {
    if (activeCleanupDieType === null || cleanupConnectedPixelIds.length === 0) {
      return
    }

    const connectedPixels = pixelEntries.filter(
      (pixel) => pixel.connectionState === 'connected' && pixel.dieType === activeCleanupDieType,
    )

    void Promise.allSettled(
      connectedPixels.map((pixel) => glowCleanupFacesForPixel(pixel.pixelId)),
    )
  }, [activeCleanupDieType, cleanupConnectedPixelIds, pixelEntries])

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 border-2 border-[#8a72a8] bg-[#1a1421] p-4 shadow-[6px_6px_0_0_#0b0810] md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5b7d8]">Hardware Check</p>
            <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">Settings</h1>
          </div>

          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4] shadow-[4px_4px_0_0_#09070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            ← Back
          </button>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm text-[#f7ead4]">Connected Dice</h2>
                <p className="mt-2 text-[9px] leading-relaxed text-[#c5b7d8]">
                  Use this screen to verify BLE pairing and manage connected dice before formula work.
                </p>
              </div>

              <div className="flex flex-col gap-3 md:items-end">
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={!bleAvailable || isConnecting}
                  title={bleUnavailableMessage ?? undefined}
                  className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c] transition-transform disabled:cursor-not-allowed disabled:border-[#4d5b52] disabled:bg-[#202721] disabled:text-[#8ba091] disabled:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  {isConnecting ? 'Connecting…' : 'Connect new die'}
                </button>
                <button
                  type="button"
                  onClick={handleReconnect}
                  disabled={!bleAvailable || isReconnecting || pairedPixelIds.length === 0}
                  title={reconnectDisabledReason ?? undefined}
                  className="border-2 border-[#7dd3fc] bg-[#102a3a] px-4 py-3 text-[10px] text-[#d9f3ff] shadow-[4px_4px_0_0_#07131a] transition-transform disabled:cursor-not-allowed disabled:border-[#4b5b63] disabled:bg-[#21272a] disabled:text-[#8d9aa0] disabled:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  {isReconnecting ? 'Reconnecting…' : 'Reconnect paired dice'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleFlashAllDice()}
                  disabled={connectedPixelIds.length === 0 || isFlashingAll}
                  title={connectedPixelIds.length === 0 ? 'Connect a die to flash it.' : undefined}
                  className="border-2 border-[#ffd166] bg-[#3b2a11] px-4 py-3 text-[10px] text-[#fff0bf] shadow-[4px_4px_0_0_#120c06] transition-transform disabled:cursor-not-allowed disabled:border-[#61563b] disabled:bg-[#272319] disabled:text-[#a89b76] disabled:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  {isFlashingAll ? 'Flashing…' : 'Flash all dice'}
                </button>
              </div>
            </div>

            {!bleAvailable && bleUnavailableMessage ? (
              <div className="mb-4 border-2 border-[#ffcc66] bg-[#362813] px-4 py-3 text-[10px] leading-relaxed text-[#ffe7b3] shadow-[4px_4px_0_0_#120c06]">
                {bleUnavailableMessage}
              </div>
            ) : null}

            {pixelEntries.length === 0 ? (
              <div className="border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] leading-relaxed text-[#c5b7d8]">
                No dice connected — tap 'Connect new die' to get started
              </div>
            ) : (
              <ul className="space-y-3">
                {pixelEntries.map((pixel) => (
                  <li
                    key={pixel.pixelId}
                    className="relative flex flex-col gap-4 border-2 border-[#5d4a7a] bg-[#1b1522] p-3 shadow-[5px_5px_0_0_#09070d] md:flex-row md:items-center md:justify-between"
                  >
                    <span
                      aria-label={connectionStatusLabel(pixel.connectionState)}
                      title={connectionStatusLabel(pixel.connectionState)}
                      className={`absolute right-3 top-3 h-3 w-3 rounded-full border ${
                        pixel.connectionState === 'connected'
                          ? 'border-[#b7f7cd] bg-[#22c55e]'
                          : 'border-[#ffc6ce] bg-[#ef4444]'
                      }`}
                    />
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => void handleFlashDie(pixel.pixelId)}
                        disabled={pixel.connectionState !== 'connected'}
                        aria-label={`Flash Pixel ${pixel.pixelId.slice(-4)}`}
                        title={pixel.connectionState === 'connected' ? 'Flash die' : 'Connect the die to flash it.'}
                        className="flex h-12 w-12 items-center justify-center rounded-none border-2 border-[#ffd166] bg-[#3b2a11] text-[#fff0bf] shadow-[3px_3px_0_0_#120c06] transition-transform disabled:cursor-not-allowed disabled:border-[#61563b] disabled:bg-[#272319] disabled:text-[#a89b76] disabled:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                      >
                        <DieIcon dieType={pixel.dieType} className="h-9 w-9" />
                      </button>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[#c5b7d8]">
                          Pixel …{pixel.pixelId.slice(-4)}
                        </p>
                        <p className="mt-2 text-[10px] text-[#f7ead4]">
                          Battery: {pixel.batteryLevel === null ? '—' : `${pixel.batteryLevel}%`}
                        </p>
                        <p className="mt-2 text-[10px] text-[#f7ead4]">
                          Last face: {pixel.lastFace ?? '—'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 md:max-w-[16rem]">
                      <button
                        type="button"
                        onClick={() => disconnectDie(pixel.pixelId)}
                        disabled={pixel.connectionState !== 'connected'}
                        className="border-2 border-[#fda4af] bg-[#35181f] px-4 py-3 text-[10px] text-[#ffe3e6] disabled:cursor-not-allowed disabled:border-[#5b494e] disabled:bg-[#272022] disabled:text-[#9a878c]"
                      >
                        Disconnect
                      </button>
                      <button
                        type="button"
                        onClick={() => void forgetDie(pixel.pixelId)}
                        className="border-2 border-[#ff8f66] bg-[#3c1d10] px-4 py-3 text-[10px] text-[#ffe2d6]"
                      >
                        Forget
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="space-y-6">
            <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
              <h2 className="text-sm text-[#f7ead4]">Cleanup</h2>
              <p className="mt-2 text-[9px] leading-relaxed text-[#c5b7d8]">
                Enable one die type to keep reconnecting remembered dice of that type and keep them glowing until they disconnect.
              </p>

              {CLEANUP_DIE_ORDER.length === 0 ? (
                <div className="mt-4 border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] leading-relaxed text-[#c5b7d8]">
                  No cleanup types available
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {CLEANUP_DIE_ORDER.map((dieType) => {
                    const isActive = activeCleanupDieType === dieType
                    const connectedCount = pixelEntries.filter(
                      (pixel) => pixel.connectionState === 'connected' && pixel.dieType === dieType,
                    ).length
                    const rememberedCount = Object.values(pairedPixels).filter((pixel) => pixel.dieType === dieType).length

                    return (
                      <li
                        key={dieType}
                        className="flex items-center justify-between gap-4 border-2 border-[#5d4a7a] bg-[#1b1522] px-3 py-3 shadow-[4px_4px_0_0_#09070d]"
                      >
                        <div className="flex items-center gap-3">
                          <DieIcon dieType={dieType} className="h-10 w-10 text-[#fff0bf]" />
                          <div>
                            <p className="text-[10px] text-[#f7ead4]">{displayDieType(dieType)} cleanup</p>
                            <p className="mt-2 text-[9px] text-[#c5b7d8]">
                              Connected: {connectedCount} · Remembered: {rememberedCount}
                            </p>
                          </div>
                        </div>

                        <label className="flex items-center gap-3 text-[10px] text-[#f7ead4]">
                          <span>{isActive ? 'On' : 'Off'}</span>
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={`${displayDieType(dieType)} cleanup`}
                            checked={isActive}
                            onChange={() => setActiveCleanupDieType((current) => (current === dieType ? null : dieType))}
                            className="h-5 w-5 accent-[#86efac]"
                          />
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-30 max-w-sm border-2 border-[#ffd166] bg-[#3a2a10] px-4 py-3 text-[10px] leading-relaxed text-[#fff0bf] shadow-[6px_6px_0_0_#120c06]">
          {toast}
        </div>
      ) : null}
    </main>
  )
}

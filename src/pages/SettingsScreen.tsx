import { formatDistanceToNow } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  connectDie,
  disconnectDie,
  forgetDie,
  getBleUnavailableMessage,
  glowDie,
  onRollResult,
  reconnectPairedDice,
} from '../services/pixelsService'
import { DieIcon } from '../components/DieResultChip'
import type { DieType } from '../types/formula'
import { useAppStore } from '../stores/useAppStore'

interface RecentRollEntry {
  id: number
  pixelId: string
  face: number
  dieType: DieType
  rolledAt: number
}

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
  const bleAvailable = useAppStore((state) => state.bleAvailable)
  const bleError = useAppStore((state) => state.bleError)
  const clearBleError = useAppStore((state) => state.clearBleError)

  const [isConnecting, setIsConnecting] = useState(false)
  const [isFlashingAll, setIsFlashingAll] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [recentRolls, setRecentRolls] = useState<RecentRollEntry[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const nextRollId = useRef(0)

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

  useEffect(() => {
    const unsubscribe = onRollResult((pixelId, face, dieType) => {
      const rolledAt = Date.now()
      nextRollId.current += 1

      setRecentRolls((current) => [
        {
          id: nextRollId.current,
          pixelId,
          face,
          dieType,
          rolledAt,
        },
        ...current,
      ].slice(0, 8))
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!bleError) {
      return
    }

    setToast(bleError)
    clearBleError()
  }, [bleError, clearBleError])

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
                  Use this screen to verify BLE pairing and recent roll events before formula work.
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
              <h2 className="text-sm text-[#f7ead4]">Recent Roll Events</h2>
              <p className="mt-2 text-[9px] leading-relaxed text-[#c5b7d8]">
                Live event feed for validating that connected dice are reporting settled rolls.
              </p>

              {recentRolls.length === 0 ? (
                <div className="mt-4 border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] leading-relaxed text-[#c5b7d8]">
                  No recent rolls detected yet
                </div>
              ) : (
                <ol className="mt-4 space-y-3">
                  {recentRolls.map((roll) => (
                    <li
                      key={roll.id}
                      className="flex items-start justify-between gap-4 border-2 border-[#5d4a7a] bg-[#1b1522] px-3 py-3 shadow-[4px_4px_0_0_#09070d]"
                    >
                      <div>
                        <p className="text-[10px] text-[#f7ead4]">
                          {displayDieType(roll.dieType)} rolled {roll.face}
                        </p>
                        <p className="mt-2 text-[9px] text-[#c5b7d8]">Pixel …{roll.pixelId.slice(-4)}</p>
                      </div>
                      <p className="text-[9px] text-[#c5b7d8]">
                        {formatDistanceToNow(roll.rolledAt, { addSuffix: true })}
                      </p>
                    </li>
                  ))}
                </ol>
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

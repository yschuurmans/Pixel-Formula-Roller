import { formatDistanceToNow } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  connectDie,
  disconnectDie,
  getBleUnavailableMessage,
  onRollResult,
  reconnectPairedDice,
} from '../services/pixelsService'
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

export default function SettingsScreen() {
  const navigate = useNavigate()
  const pixels = useAppStore((state) => state.pixels)
  const settings = useAppStore((state) => state.settings)
  const pairedPixelIds = useAppStore((state) => state.pairedPixelIds)
  const bleAvailable = useAppStore((state) => state.bleAvailable)
  const bleError = useAppStore((state) => state.bleError)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const clearBleError = useAppStore((state) => state.clearBleError)

  const [isConnecting, setIsConnecting] = useState(false)
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

  const handleHistoryLengthChange = (value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      return
    }

    updateSettings({ historyLength: Math.min(50, Math.max(1, parsed)) })
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
            onClick={() => navigate(-1)}
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
                    className="flex flex-col gap-4 border-2 border-[#5d4a7a] bg-[#1b1522] p-3 shadow-[5px_5px_0_0_#09070d] md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center border-2 border-[#ffd166] bg-[#3b2a11] text-[10px] text-[#fff0bf]">
                        {displayDieType(pixel.dieType)}
                      </div>
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

                    <div className="flex items-center gap-3">
                      <span
                        className={`border-2 px-3 py-2 text-[9px] ${
                          pixel.connectionState === 'connected'
                            ? 'border-[#86efac] bg-[#17301f] text-[#d7ffe5]'
                            : 'border-[#fda4af] bg-[#35181f] text-[#ffe3e6]'
                        }`}
                      >
                        {pixel.connectionState}
                      </span>

                      <button
                        type="button"
                        onClick={() => disconnectDie(pixel.pixelId)}
                        disabled={pixel.connectionState !== 'connected'}
                        className="border-2 border-[#fda4af] bg-[#35181f] px-4 py-3 text-[10px] text-[#ffe3e6] disabled:cursor-not-allowed disabled:border-[#5b494e] disabled:bg-[#272022] disabled:text-[#9a878c]"
                      >
                        Disconnect
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

            <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
              <h2 className="text-sm text-[#f7ead4]">History Length</h2>
              <p className="mt-2 text-[9px] leading-relaxed text-[#c5b7d8]">
                Changes persist immediately. Existing history is only trimmed the next time a new roll is written.
              </p>

              <label className="mt-4 block text-[10px] text-[#f7ead4]" htmlFor="history-length">
                Saved roll history count
              </label>
              <input
                id="history-length"
                type="number"
                min={1}
                max={50}
                value={settings.historyLength}
                onChange={(event) => handleHistoryLengthChange(event.target.value)}
                className="mt-3 w-full border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
              />
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

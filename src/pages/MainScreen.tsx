import { formatDistanceToNow } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { connectDie, getBleUnavailableMessage, glowDie } from '../services/pixelsService'
import {
  ROLL_HISTORY_PREVIEW_LIMIT,
  ROLL_HISTORY_STORAGE_LIMIT,
  STORAGE_WARNING_EVENT,
  STORAGE_WARNING_MESSAGE,
  type RollHistoryEntry,
  type SavedFormula,
  useAppStore,
} from '../stores/useAppStore'
import type { DieRollResult } from '../types/formula'
import DieResultChip from '../components/DieResultChip'
import { displayDieType } from './formulaHelpers'

type ToastState = {
  id: number
  message: string
}

type MainScreenLocationState = {
  mainBackGuard?: boolean
  toastMessage?: string
}

const QUICK_CONNECT_HOLD_MS = 500

function ConnectIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17a5 5 0 0 1 0-7l2-2" />
      <path d="M15 7a5 5 0 0 1 0 7l-2 2" />
      <path d="M10 14l4-4" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 3a9 9 0 1 1-6.36 2.64" opacity="0.35" />
      <path d="M12 3a9 9 0 0 1 6.36 2.64" />
    </svg>
  )
}

function HistoryItem({
  label,
  total,
  rolledAt,
  onClick,
}: {
  label: string
  total: number
  rolledAt: number
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start justify-between gap-4 border-2 border-[#5d4a7a] bg-[#1b1522] px-3 py-3 text-left shadow-[4px_4px_0_0_#09070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-[#f7ead4]">{label}</p>
          <p className="mt-2 text-[9px] text-[#c5b7d8]">
            {formatDistanceToNow(rolledAt, { addSuffix: true })}
          </p>
        </div>
        <p className="text-sm text-[#ffd166]">{total}</p>
      </button>
    </li>
  )
}

function formatRollLabel(roll: DieRollResult, index: number): string {
  const baseLabel = `${displayDieType(roll.dieType)} #${index + 1}`
  return roll.kept ? `${baseLabel} result ${roll.face}` : `${baseLabel} result ${roll.face} dropped`
}

export default function MainScreen() {
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

  const bannerMessage = bleAvailable
    ? null
    : getBleUnavailableMessage() ?? 'Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.'

  const recentHistory = useMemo(() => rollHistory.slice(0, ROLL_HISTORY_PREVIEW_LIMIT), [rollHistory])
  const fullHistory = useMemo(() => rollHistory.slice(0, ROLL_HISTORY_STORAGE_LIMIT), [rollHistory])
  const connectedPixelIds = useMemo(
    () => Object.values(pixels).filter((pixel) => pixel.connectionState === 'connected').map((pixel) => pixel.pixelId),
    [pixels],
  )

  const showToast = (message: string) => {
    toastId.current += 1
    const id = toastId.current
    setToast({ id, message })

    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }

    toastTimeoutRef.current = window.setTimeout(() => {
      // only clear if this is still the latest toast
      if (toastId.current === id) {
        setToast(null)
      }
      toastTimeoutRef.current = null
    }, 10_000)
  }

  const handleQuickConnect = async () => {
    setIsQuickConnecting(true)
    try {
      await connectDie()
    } finally {
      setIsQuickConnecting(false)
    }
  }

  const clearQuickConnectHoldTimer = () => {
    if (quickConnectHoldTimer.current !== null) {
      window.clearTimeout(quickConnectHoldTimer.current)
      quickConnectHoldTimer.current = null
    }
  }

  const handleQuickConnectHoldStart = () => {
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
  }

  const handleQuickConnectHoldEnd = () => {
    clearQuickConnectHoldTimer()
  }

  useEffect(() => {
    if (!bleError) {
      return
    }

    showToast(bleError)
    clearBleError()
  }, [bleError, clearBleError])

  useEffect(() => {
    const handleStorageWarning = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>
      showToast(customEvent.detail?.message ?? STORAGE_WARNING_MESSAGE)
    }

    window.addEventListener(STORAGE_WARNING_EVENT, handleStorageWarning)
    return () => {
      window.removeEventListener(STORAGE_WARNING_EVENT, handleStorageWarning)
    }
  }, [])

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
  }, [location.pathname, locationState, navigate])

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
  }, [])

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        {bannerMessage ? (
          <div className="mb-4 border-2 border-[#ffcc66] bg-[#362813] px-4 py-3 text-[10px] leading-relaxed text-[#ffe7b3] shadow-[4px_4px_0_0_#120c06]">
            {bannerMessage}
          </div>
        ) : null}

        <header className="mb-6 flex flex-col gap-4 border-2 border-[#8a72a8] bg-[#1a1421] p-4 shadow-[6px_6px_0_0_#0b0810] md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5b7d8]">Launchpad</p>
            <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">Pixels Roller</h1>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/formula/new')}
              className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              + New
            </button>
            <button
              type="button"
              onClick={() => {
                if (quickConnectHoldTriggered.current) {
                  quickConnectHoldTriggered.current = false
                  return
                }

                void handleQuickConnect()
              }}
              onMouseDown={handleQuickConnectHoldStart}
              onMouseUp={handleQuickConnectHoldEnd}
              onMouseLeave={handleQuickConnectHoldEnd}
              onTouchStart={handleQuickConnectHoldStart}
              onTouchEnd={handleQuickConnectHoldEnd}
              onTouchCancel={handleQuickConnectHoldEnd}
              disabled={!bleAvailable || isQuickConnecting}
              aria-label={isQuickConnecting ? 'Connecting dice' : 'Connect new die'}
              title={bannerMessage ?? 'Connect new die'}
              className="flex h-[42px] w-[42px] items-center justify-center border-2 border-[#7dd3fc] bg-[#102a3a] text-[#d9f3ff] shadow-[4px_4px_0_0_#07131a] transition-transform disabled:cursor-not-allowed disabled:border-[#4b5b63] disabled:bg-[#21272a] disabled:text-[#8d9aa0] disabled:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              {isQuickConnecting ? <SpinnerIcon /> : <ConnectIcon />}
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              aria-label="Open settings"
              className="border-2 border-[#f8a5c2] bg-[#351826] px-4 py-3 text-[10px] text-[#ffe0ec] shadow-[4px_4px_0_0_#12070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              ⚙
            </button>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm text-[#f7ead4]">Saved Formulas</h2>
              <p className="text-[9px] text-[#c5b7d8]">Tap a card to roll</p>
            </div>

            {savedFormulas.length === 0 ? (
              <div className="border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] leading-relaxed text-[#c5b7d8]">
                No saved formulas yet — tap + to add one
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {savedFormulas.map((formula) => (
                  <article
                    key={formula.id}
                    className="relative border-2 border-[#5d4a7a] bg-[#1b1522] p-3 shadow-[5px_5px_0_0_#09070d]"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveMenuId((current) => (current === formula.id ? null : formula.id))}
                      aria-label={`More options for ${formula.name}`}
                      className="absolute right-2 top-2 border border-[#7d6b95] bg-[#2b2136] px-2 py-1 text-xs leading-none text-[#f7ead4]"
                    >
                      ⋮
                    </button>

                    {activeMenuId === formula.id ? (
                      <div className="absolute right-2 top-10 z-10 min-w-30 border-2 border-[#8a72a8] bg-[#110d16] shadow-[4px_4px_0_0_#09070d]">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null)
                            navigate(`/formula/${formula.id}`)
                          }}
                          className="block w-full border-b border-[#4d3d61] px-3 py-3 text-left text-[10px] text-[#f7ead4] hover:bg-[#241b2d]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null)
                            setFormulaToDelete(formula)
                          }}
                          className="block w-full px-3 py-3 text-left text-[10px] text-[#ff9aa2] hover:bg-[#241b2d]"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenuId(null)
                        navigate(`/roll/${formula.id}`)
                      }}
                      className="block w-full pr-8 text-left"
                    >
                      <h3 className="text-sm leading-snug text-[#f7ead4]">{formula.name}</h3>
                      <p className="mt-4 font-mono text-xs text-[#d8cef1]">{formula.formula}</p>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm text-[#f7ead4]">Roll History</h2>
              <button
                type="button"
                onClick={() => setIsHistoryDialogOpen(true)}
                className="text-[9px] text-[#c5b7d8] underline underline-offset-2"
              >
                See more
              </button>
            </div>

            {recentHistory.length === 0 ? (
              <div className="border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] text-[#c5b7d8]">
                No rolls yet
              </div>
            ) : (
              <ol className="space-y-3">
                {recentHistory.map((entry) => (
                  <HistoryItem
                    key={entry.id}
                    label={entry.formulaName || entry.formulaString}
                    total={entry.total}
                    rolledAt={entry.rolledAt}
                    onClick={() => setSelectedHistoryEntry(entry)}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {formulaToDelete ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md border-2 border-[#ff9aa2] bg-[#1a1421] p-5 shadow-[8px_8px_0_0_#09070d]"
          >
            <h2 className="text-sm text-[#f7ead4]">Delete formula?</h2>
            <p className="mt-4 text-[10px] leading-relaxed text-[#d8cef1]">
              '{formulaToDelete.name}' will be permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFormulaToDelete(null)}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteSavedFormula(formulaToDelete.id)
                  setFormulaToDelete(null)
                  showToast('Formula deleted')
                }}
                className="border-2 border-[#ff6b6b] bg-[#4a1515] px-4 py-3 text-[10px] text-[#ffe1e1]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedHistoryEntry ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl border-2 border-[#4f94ff] bg-[#15111a] p-5 shadow-[8px_8px_0_0_#09070d]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5d7ff]">Roll Details</p>
                <h2 className="mt-3 text-sm text-[#f7ead4]">{selectedHistoryEntry.formulaName || selectedHistoryEntry.formulaString}</h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedHistoryEntry(null)}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
              <div className="border-2 border-[#5d4a7a] bg-[#1b1522] p-4 shadow-[4px_4px_0_0_#09070d]">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5b7d8]">Formula</p>
                <p className="mt-3 font-mono text-[11px] text-[#d8cef1]">{selectedHistoryEntry.formulaString}</p>
              </div>

              <div className="border-2 border-[#ffd166] bg-[#3b2a11] p-4 text-center shadow-[4px_4px_0_0_#120c06]">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#fff0bf]">Total</p>
                <p className="mt-3 text-lg text-[#fff0bf]">{selectedHistoryEntry.total}</p>
              </div>
            </div>

            <div className="mt-5 border-2 border-[#5d4a7a] bg-[#1b1522] p-4 shadow-[4px_4px_0_0_#09070d]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[10px] uppercase tracking-[0.18em] text-[#c5b7d8]">Dice Results</h3>
                <p className="text-[9px] text-[#c5b7d8]">
                  {formatDistanceToNow(selectedHistoryEntry.rolledAt, { addSuffix: true })}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {selectedHistoryEntry.result.groups.flatMap((group) =>
                  group.rolls.map((roll, index) => (
                    <DieResultChip
                      key={`roll-${group.dieType}-${index}-${roll.face}`}
                      dieType={roll.dieType}
                      face={roll.face}
                      dropped={!roll.kept}
                      ariaLabel={formatRollLabel(roll, index)}
                    />
                  )),
                )}

                {selectedHistoryEntry.result.flatModifier !== 0 ? (
                  <div className="basis-full border-t border-[#4d3d61] pt-4 text-[10px] text-[#c5b7d8]">
                    Flat modifier: {selectedHistoryEntry.result.flatModifier > 0 ? `+${selectedHistoryEntry.result.flatModifier}` : selectedHistoryEntry.result.flatModifier}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isHistoryDialogOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-3xl border-2 border-[#8a72a8] bg-[#15111a] p-5 shadow-[8px_8px_0_0_#09070d]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5d7ff]">Roll History</p>
                <h2 className="mt-3 text-sm text-[#f7ead4]">Last {ROLL_HISTORY_STORAGE_LIMIT} rolls</h2>
              </div>

              <button
                type="button"
                onClick={() => setIsHistoryDialogOpen(false)}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
              >
                Close
              </button>
            </div>

            {fullHistory.length === 0 ? (
              <div className="mt-5 border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] text-[#c5b7d8]">
                No rolls yet
              </div>
            ) : (
              <ol className="mt-5 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {fullHistory.map((entry) => (
                  <HistoryItem
                    key={entry.id}
                    label={entry.formulaName || entry.formulaString}
                    total={entry.total}
                    rolledAt={entry.rolledAt}
                    onClick={() => {
                      setIsHistoryDialogOpen(false)
                      setSelectedHistoryEntry(entry)
                    }}
                  />
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 right-4 z-30 max-w-sm border-2 border-[#ffd166] bg-[#3a2a10] px-4 py-3 text-[10px] leading-relaxed text-[#fff0bf] shadow-[6px_6px_0_0_#120c06]">
          {toast.message}
        </div>
      ) : null}
    </main>
  )
}

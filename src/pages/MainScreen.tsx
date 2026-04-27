import { formatDistanceToNow } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBleUnavailableMessage } from '../services/pixelsService'
import {
  STORAGE_WARNING_EVENT,
  STORAGE_WARNING_MESSAGE,
  type SavedFormula,
  useAppStore,
} from '../stores/useAppStore'

type ToastState = {
  id: number
  message: string
}

function HistoryItem({
  label,
  total,
  rolledAt,
}: {
  label: string
  total: number
  rolledAt: number
}) {
  return (
    <li className="flex items-start justify-between gap-4 border-2 border-[#5d4a7a] bg-[#1b1522] px-3 py-3 shadow-[4px_4px_0_0_#09070d]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-[#f7ead4]">{label}</p>
        <p className="mt-2 text-[9px] text-[#c5b7d8]">
          {formatDistanceToNow(rolledAt, { addSuffix: true })}
        </p>
      </div>
      <p className="text-sm text-[#ffd166]">{total}</p>
    </li>
  )
}

export default function MainScreen() {
  const navigate = useNavigate()
  const savedFormulas = useAppStore((state) => state.savedFormulas)
  const rollHistory = useAppStore((state) => state.rollHistory)
  const settings = useAppStore((state) => state.settings)
  const bleAvailable = useAppStore((state) => state.bleAvailable)
  const bleError = useAppStore((state) => state.bleError)
  const deleteSavedFormula = useAppStore((state) => state.deleteSavedFormula)
  const clearBleError = useAppStore((state) => state.clearBleError)

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [formulaToDelete, setFormulaToDelete] = useState<SavedFormula | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastId = useRef(0)

  const bannerMessage = bleAvailable
    ? null
    : getBleUnavailableMessage() ?? 'Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.'

  const recentHistory = useMemo(
    () => rollHistory.slice(0, settings.historyLength),
    [rollHistory, settings.historyLength],
  )

  const showToast = (message: string) => {
    toastId.current += 1
    setToast({ id: toastId.current, message })
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
            <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">Pixel Formula Roller</h1>
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
              <p className="text-[9px] text-[#c5b7d8]">Tap a card to edit</p>
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
                        navigate(`/formula/${formula.id}`)
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
              <p className="text-[9px] text-[#c5b7d8]">last {settings.historyLength}</p>
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

      {toast ? (
        <div className="fixed bottom-4 right-4 z-30 max-w-sm border-2 border-[#ffd166] bg-[#3a2a10] px-4 py-3 text-[10px] leading-relaxed text-[#fff0bf] shadow-[6px_6px_0_0_#120c06]">
          {toast.message}
        </div>
      ) : null}
    </main>
  )
}

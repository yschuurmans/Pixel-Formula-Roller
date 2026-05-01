import { useEffect, useRef, useState } from 'react'
import type { EvaluationResult, DieRollResult } from '../types/formula'
import formatRollLabel from '../utils/formatRollLabel'
import { AutoHideCountdown } from '../pages/formulaHelpers'

export default function ResultPanel({
  open,
  formulaName,
  formulaString,
  result,
  onRollAgain,
  onClose,
  variant,
  autoHideRemainingMs,
  autoHideDurationMs,
}: {
  open: boolean
  formulaName?: string
  formulaString: string
  result: EvaluationResult
  onRollAgain?: () => void
  onClose: () => void
  variant?: 'sheet' | 'modal'
  autoHideRemainingMs?: number | null
  autoHideDurationMs?: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [resolvedVariant, setResolvedVariant] = useState<'sheet' | 'modal'>(() => {
    if (variant) return variant
    if (typeof window === 'undefined') return 'modal'
    return window.innerWidth < 768 ? 'sheet' : 'modal'
  })

  useEffect(() => {
    if (variant) return void setResolvedVariant(variant)

    const onResize = () => setResolvedVariant(window.innerWidth < 768 ? 'sheet' : 'modal')
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [variant])

  useEffect(() => {
    if (!open) return
    const prevActive = document.activeElement as HTMLElement | null
    const focusTimeout = window.setTimeout(() => {
      const focusable = containerRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      focusable?.[0]?.focus()
    }, 0)

    const onKeyDown = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      if (e.key !== 'Tab') return

      const container = containerRef.current
      if (!container) return

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && (el.offsetParent as HTMLElement | null) !== null)

      if (focusable.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(focusTimeout)
      prevActive?.focus?.()
    }
  }, [open])

  if (!open) return null

  const resolvedFormulaName = formulaName?.trim() || ''
  const resolvedFormulaString = formulaString.trim()
  const title = resolvedFormulaName || resolvedFormulaString || 'Result'

  return (
    <div className="fixed inset-0 z-30">
      <div className="absolute inset-0 bg-black/75" aria-hidden />

      <div className={`absolute inset-0 flex ${resolvedVariant === 'sheet' ? 'items-end justify-center' : 'items-center justify-center'}`}>
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-panel-title"
          className={`max-h-[calc(100vh-1.25rem)] overflow-y-auto w-full ${resolvedVariant === 'sheet' ? 'rounded-t-lg border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[8px_8px_0_0_#09070d]' : 'max-w-2xl rounded-lg border-2 border-[#8a72a8] bg-[#15111a] p-5 shadow-[8px_8px_0_0_#09070d]'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="result-panel-title" className="text-sm text-[#f7ead4]">
                {title}
              </h2>
              {resolvedFormulaName && resolvedFormulaString && resolvedFormulaString !== resolvedFormulaName ? (
                <p className="mt-1 font-mono text-[11px] text-[#d8cef1]">{resolvedFormulaString}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {autoHideRemainingMs !== null && autoHideRemainingMs !== undefined ? (
                <AutoHideCountdown remainingMs={autoHideRemainingMs} durationMs={autoHideDurationMs ?? 10_000} />
              ) : null}

              {onRollAgain ? (
                <button
                  type="button"
                  onClick={() => onRollAgain?.()}
                  className="border-2 border-[#86efac] bg-[#17301f] px-3 py-2 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c]"
                >
                  Roll Again
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => onClose()}
                aria-label="Close result panel"
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-3 py-2 text-[10px] text-[#f7ead4]"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="mt-4">
            {result.groups.map((group, groupIndex) => (
              <div key={`${group.dieType}-${groupIndex}`} className="mt-3 border-t border-[#35518a] pt-3">
                <h3 className="text-[10px] uppercase tracking-[0.16em] text-[#c5d7d8]">{group.dieType === 'd100' ? 'd%' : group.dieType}</h3>
                <ul className="mt-2 space-y-1">
                  {group.rolls.map((roll: DieRollResult, idx: number) => (
                    <li key={idx} className="flex items-center justify-between text-[10px] text-[#d8cef1]">
                      <span>{formatRollLabel(roll, idx)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {result.flatModifier !== 0 ? (
              <div className="mt-4 border-t border-[#35518a] pt-3">
                <p className="text-[10px] text-[#d8cef1]">Modifier: {result.flatModifier > 0 ? `+${result.flatModifier}` : result.flatModifier}</p>
              </div>
            ) : null}

            <div className="mt-4">
              <p className="text-lg font-bold text-[#fff0bf]">Grand total: {result.total}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

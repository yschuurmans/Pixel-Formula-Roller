import { useEffect, useRef } from 'react'
import type { DieType } from '../types/formula'
import DieIcon from './DieIcon'

export type RollOptionTone = 'good' | 'neutral' | 'bad'

export type RollOptionIcon =
  | {
      kind: 'd20'
      accent: string
      stacked?: boolean
      symbol?: 'plus' | 'minus'
    }
  | {
      kind: 'dice'
      dieType: DieType
      count?: number
      badge?: string
    }

export type RollOptionsModalOption<TChoice extends string = string> = {
  choice: TChoice
  label: string
  detail?: string
  tone: RollOptionTone
  icon?: RollOptionIcon
}

type RollOptionsModalProps<TChoice extends string = string> = {
  open: boolean
  title: string
  eyebrow: string
  description?: string
  options: Array<RollOptionsModalOption<TChoice>>
  onChoose: (choice: TChoice) => void
  onClose: () => void
}

function D20Icon({ accent, stacked = false, symbol }: { accent: string; stacked?: boolean; symbol?: 'plus' | 'minus' }) {
  return (
    <div className="relative h-11 w-11" aria-hidden="true">
      <svg viewBox="0 0 48 48" className={`absolute inset-0 h-full w-full drop-shadow-[2px_2px_0_#09070d] ${stacked ? '-translate-x-2 translate-y-1' : ''}`}>
        <polygon points="24,4 40,14 44,30 24,44 4,30 8,14" fill={accent} stroke="#f7ead4" strokeWidth="2" />
      </svg>
      {stacked ? (
        <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full translate-x-2 -translate-y-1 drop-shadow-[2px_2px_0_#09070d]">
          <polygon points="24,4 40,14 44,30 24,44 4,30 8,14" fill={accent} stroke="#f7ead4" strokeWidth="2" />
        </svg>
      ) : null}
      {symbol === 'plus' ? <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#f7ead4]">+</span> : null}
      {symbol === 'minus' ? <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#f7ead4]">−</span> : null}
    </div>
  )
}

function OptionIcon({ option }: { option: RollOptionsModalOption }) {
  if (!option.icon) {
    return null
  }

  if (option.icon.kind === 'd20') {
    return <D20Icon accent={option.icon.accent} stacked={option.icon.stacked} symbol={option.icon.symbol} />
  }

  const count = option.icon.count ?? 1
  const badge = option.icon.badge

  return (
    <div className="relative h-11 w-11" aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center">
        <DieIcon dieType={option.icon.dieType} className="h-11 w-11 text-[#f7ead4] drop-shadow-[2px_2px_0_#09070d]" />
      </div>
      {count > 1 ? (
        <div className="absolute inset-0 translate-x-2 -translate-y-1">
          <DieIcon dieType={option.icon.dieType} className="h-11 w-11 text-[#f7ead4] drop-shadow-[2px_2px_0_#09070d]" />
        </div>
      ) : null}
      {badge ? (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border border-[#f7ead4] bg-[#09070d] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#f7ead4] shadow-[1px_1px_0_#09070d]">
          {badge}
        </span>
      ) : null}
    </div>
  )
}

export default function AdvantagePrompt<TChoice extends string>({
  open,
  title,
  eyebrow,
  description,
  options,
  onChoose,
  onClose,
}: RollOptionsModalProps<TChoice>) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const previousActive = document.activeElement as HTMLElement | null
    const focusTimeout = window.setTimeout(() => {
      const firstFocusable = containerRef.current?.querySelector<HTMLElement>('button')
      firstFocusable?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(focusTimeout)
      previousActive?.focus?.()
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/75"
      />

      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="roll-options-prompt-title"
          className="w-full max-w-xl border-2 border-[#8a72a8] bg-[#15111a] p-5 shadow-[8px_8px_0_0_#09070d]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5d7ff]">{eyebrow}</p>
              <h2 id="roll-options-prompt-title" className="mt-3 text-sm text-[#f7ead4]">
                {title}
              </h2>
              {description ? <p className="mt-2 text-[9px] text-[#c5b7d8]">{description}</p> : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="border-2 border-[#7d6b95] bg-[#251d2e] px-3 py-2 text-[10px] text-[#f7ead4]"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {options.map((option) => (
              <button
                key={option.choice}
                type="button"
                onClick={() => onChoose(option.choice)}
                className={`flex flex-col items-center gap-3 border-2 px-4 py-4 text-center text-[10px] shadow-[4px_4px_0_0_#09070d] ${
                  option.tone === 'good'
                    ? 'border-[#86efac] bg-[#17301f] text-[#d7ffe5]'
                    : option.tone === 'bad'
                      ? 'border-[#ff9aa2] bg-[#35181f] text-[#ffe3e6]'
                      : 'border-[#7dd3fc] bg-[#102a3a] text-[#d9f3ff]'
                }`}
              >
                <OptionIcon option={option} />
                <span className="text-[11px] uppercase tracking-[0.18em]">{option.label}</span>
                {option.detail ? <span className="font-mono text-[10px] opacity-90">{option.detail}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
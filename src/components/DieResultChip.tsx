import type { DieType } from '../types/formula'
import DieIcon from './DieIcon'

export default function DieResultChip({
  dieType,
  face,
  ariaLabel,
  dropped = false,
  pending = false,
  onClick,
}: {
  dieType: DieType
  face: number | null
  ariaLabel: string
  dropped?: boolean
  pending?: boolean
  onClick?: () => void
}) {
  const toneClass = pending
    ? 'border-[#5b6f98] bg-[#0d162a] text-[#8fa7d6]'
    : dropped
      ? 'border-[#7d6b95] bg-[#251d2e] text-[#c5b7d8]'
      : 'border-[#4f94ff] bg-[#132142] text-[#d8e6ff]'

  const faceLabel = face === null ? '' : dieType === 'd100' && face < 100 ? face.toString().padStart(2, '0') : String(face)

  const content = (
    <>
      <DieIcon dieType={dieType} className="h-14 w-14" />
      <span className={`absolute top-[24px] text-sm font-bold ${pending ? 'text-[#8fa7d6]' : 'text-[#fff0bf]'}`}>
        {faceLabel}
      </span>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => {
          // eslint-disable-next-line no-console
          console.log('DieResultChip clicked', { ariaLabel })
          // invoke provided handler
          onClick()
        }}
        className={`relative flex h-18 w-18 items-center justify-center border-2 shadow-[4px_4px_0_0_#09070d] ${toneClass} cursor-pointer transition-transform hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#86efac] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d162a]`}
        title={ariaLabel}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`relative flex h-18 w-18 items-center justify-center border-2 shadow-[4px_4px_0_0_#09070d] ${toneClass}`}
      title={ariaLabel}
    >
      {content}
    </div>
  )
}
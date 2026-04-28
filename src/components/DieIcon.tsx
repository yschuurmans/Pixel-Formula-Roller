import type { DieType } from '../types/formula'
import d4Icon from '../assets/dice-icons/d4.svg?raw'
import d6Icon from '../assets/dice-icons/d6.svg?raw'
import d8Icon from '../assets/dice-icons/d8.svg?raw'
import d10Icon from '../assets/dice-icons/d10.svg?raw'
import d12Icon from '../assets/dice-icons/d12.svg?raw'
import d20Icon from '../assets/dice-icons/d20.svg?raw'
import dPercentIcon from '../assets/dice-icons/d%.svg?raw'

type DieIconProps = {
  dieType: DieType
  className?: string
}

const ICONS: Record<DieType, string> = {
  d4: d4Icon,
  d6: d6Icon,
  d8: d8Icon,
  d10: d10Icon,
  d12: d12Icon,
  d20: d20Icon,
  d100: dPercentIcon,
}

function toInlineSvgMarkup(svg: string): string {
  return svg
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<svg\b/, '<svg class="h-full w-full" focusable="false"')
    .replace(/<path\b(?![^>]*fill=)/g, '<path fill="currentColor"')
    .replace(/<rect\b(?![^>]*fill=)/g, '<rect fill="currentColor"')
    .trim()
}

const INLINE_ICONS: Record<DieType, string> = {
  d4: toInlineSvgMarkup(ICONS.d4),
  d6: toInlineSvgMarkup(ICONS.d6),
  d8: toInlineSvgMarkup(ICONS.d8),
  d10: toInlineSvgMarkup(ICONS.d10),
  d12: toInlineSvgMarkup(ICONS.d12),
  d20: toInlineSvgMarkup(ICONS.d20),
  d100: toInlineSvgMarkup(ICONS.d100),
}

export default function DieIcon({ dieType, className = 'h-12 w-12' }: DieIconProps) {
  const iconMarkup = INLINE_ICONS[dieType]

  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: iconMarkup }}
    />
  )
}
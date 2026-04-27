import type { DieType } from '../types/formula'

type DieIconProps = {
  dieType: DieType
  className?: string
}

const SVG_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export default function DieIcon({ dieType, className = 'h-12 w-12' }: DieIconProps) {
  if (dieType === 'd4') {
    return (
      <svg viewBox="0 0 122 106" aria-hidden="true" className={className}>
        <path d="m1.6123 100.14 4.0557 3.8171h112.37l2.5592-4.4327-55.283-97.914h-4.5329z" {...SVG_PROPS} strokeWidth={3.2246} />
      </svg>
    )
  }

  if (dieType === 'd6') {
    return (
      <svg viewBox="160 0 110 120" aria-hidden="true" className={className}>
        <rect x="167.39" y="10.349" width="91.404" height="95.104" rx="6.3636" ry="9.4969" {...SVG_PROPS} strokeWidth={3.1257} />
      </svg>
    )
  }

  if (dieType === 'd8') {
    return (
      <svg viewBox="0 120 125 145" aria-hidden="true" className={className}>
        <g transform="matrix(.19571 0 0 .19571 523.21 201.56)">
          <path d="m-2354.9-392.57-296.96 338.75-1.0158-1.2344c100.54 117.51 199.33 237.47 298.62 356.38l3.2576-0.0829c98.3-117.58 189.88-243.49 288.16-360.29l-288.62-333.37z" {...SVG_PROPS} strokeWidth={16} />
          <path d="m-2650.5-53.343 587.74-4.7351" {...SVG_PROPS} strokeWidth={6} />
        </g>
      </svg>
    )
  }

  if (dieType === 'd10') {
    return (
      <svg viewBox="150 120 130 145" aria-hidden="true" className={className}>
        <g transform="matrix(.18846 0 0 .18846 58.843 93.476)">
          <path d="m531.52 523.73 19.011-70.352 277.45-258.73h9.4784l282.8 263.72 23.945 90.327-310.5 292.66-8.8497-0.47531-301.66-290.1z" {...SVG_PROPS} strokeWidth={16} />
          <path d="m519.04 547.65 111.3-61.37 199.64-291.63 198.72 300.99-200.72 95.89-199.72-107.33" {...SVG_PROPS} strokeWidth={6} />
          <path d="m1028.7 493.56 114.42 54.092" {...SVG_PROPS} strokeWidth={6} />
          <path d="m828.72 591.66-0.73554 250.68" {...SVG_PROPS} strokeWidth={5.6871} />
        </g>
      </svg>
    )
  }

  if (dieType === 'd12') {
    return (
      <svg viewBox="0 265 135 125" aria-hidden="true" className={className}>
        <path d="m66.604 384.13 33.97-8.3455 23.883-36.237-2.749-31.304-22.247-26.861-32.307-6.8007-34.44 7.5108-21.433 27.662-3.1143 30.043 21.983 35.539z" {...SVG_PROPS} strokeWidth={4.9521} />
        <path d="m33.765 323.86 10.228 36.563 43.896 0.16485 10.249-36.599-30.919-23.74z" {...SVG_PROPS} strokeWidth={1.7613} />
        <path d="m67.154 274.95-0.18318 25.83" {...SVG_PROPS} strokeWidth={1.857} />
        <path d="m34.287 325.37-24.377-15.72" {...SVG_PROPS} strokeWidth={1.857} />
        <path d="m44.233 360.16-14.45 16.64" {...SVG_PROPS} strokeWidth={1.857} />
        <path d="m87.683 360.71 13.267 15.263" {...SVG_PROPS} strokeWidth={1.857} />
        <path d="m98.251 324.45 22.939-15.93" {...SVG_PROPS} strokeWidth={1.857} />
      </svg>
    )
  }

  if (dieType === 'd20') {
    return (
      <svg viewBox="150 260 130 135" aria-hidden="true" className={className}>
        <g transform="matrix(.25983 0 0 .25983 463.76 280.15)">
          <path d="m-1160.8 71.357 208.07-122.82 208.03 122.23-11.16 232.13-197.46 122.23-196.88-119.29z" {...SVG_PROPS} strokeWidth={16} />
          <g transform="matrix(.39948 0 0 .39948 -1174.3 -120.6)">
            <path d="m560.49 177.48-4.4133 214.78m-314.82 594.33 639.93 7.35m-817.93 70.66 179.47-76.54 310.4 373.64 325.11-370.7 142.56 48.4m-960.32-541.11 497.07-104.55 491.15 106.02-177.81 489.77-317.76-597.27-314.81 592.86z" {...SVG_PROPS} strokeWidth={8} />
          </g>
        </g>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <g transform="translate(1 8) rotate(-15 12 14)">
        <rect {...SVG_PROPS} x="7" y="6" width="13" height="18" rx="1.5" />
        <circle cx="11" cy="11" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16" cy="19" r="1.5" fill="currentColor" stroke="none" />
        <path {...SVG_PROPS} d="M11 19 L16 11" />
      </g>
      <g transform="translate(18 8) rotate(15 12 14)">
        <rect {...SVG_PROPS} x="7" y="6" width="13" height="18" rx="1.5" />
        <circle cx="11" cy="11" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16" cy="19" r="1.5" fill="currentColor" stroke="none" />
        <path {...SVG_PROPS} d="M11 19 L16 11" />
      </g>
    </svg>
  )
}
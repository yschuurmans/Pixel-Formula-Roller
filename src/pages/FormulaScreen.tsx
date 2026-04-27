import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useBlocker, useLocation, useNavigate, useParams, type BlockerFunction } from 'react-router-dom'
import { evaluateFormula, extractRequiredDice, formulaToPickerState, parseFormula } from '../services/formulaParser'
import { glowDie, onRollResult, stopAllGlows } from '../services/pixelsService'
import { useAppStore } from '../stores/useAppStore'
import type { DieRollResult, DieType, EvaluationResult, ParsedFormula } from '../types/formula'
import DieIcon from '../components/DieIcon'
import DieResultChip from '../components/DieResultChip'

const DIE_ORDER: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
const DISPLAY_DIE_ORDER: DieType[] = [...DIE_ORDER].reverse() as DieType[]
const FORMULA_ROLL_TRANSITION_DELAY_MS = 900

type KeepMode = 'kh' | 'kl'

type FormulaBuilderState = {
  dice: Record<DieType, { count: number; keepMode: KeepMode; keepN: string }>
  flatModifier: number
}

type SnapshotState = {
  name: string
  formulaText: string
}

type NavigationIntent = {
  message: string
  replace?: boolean
}

type FormulaScreenLocationState = {
  focusRollEngine?: boolean
}

type FormulaScreenMode = 'builder' | 'roll-only'

type PercentRole = 'tens' | 'ones'

type RollSlot = {
  id: string
  logicalId: string
  dieType: DieType
  logicalDieType: DieType
  logicalSequence: number
  percentRole: PercentRole | null
  sequence: number
  source: 'ble' | 'manual'
  pixelId: string | null
  face: number | null
  resultSource: 'ble' | 'manual' | null
  sequentialTotal: number | null
}

type RollSession = {
  parsedFormula: ParsedFormula
  slots: RollSlot[]
  result: EvaluationResult | null
  statusMessage: string | null
  historyRecorded: boolean
}

type ConnectedPixel = {
  pixelId: string
  dieType: DieType
}

function displayDieType(dieType: DieType): string {
  return dieType === 'd100' ? 'd%' : dieType
}

function getDieFaces(dieType: DieType): number {
  switch (dieType) {
    case 'd4':
      return 4
    case 'd6':
      return 6
    case 'd8':
      return 8
    case 'd10':
      return 10
    case 'd12':
      return 12
    case 'd20':
      return 20
    case 'd100':
      return 100
  }
}

function createRollSlotId(dieType: DieType, groupIndex: number, sequence: number, percentRole?: PercentRole): string {
  return percentRole === undefined
    ? `${dieType}-${groupIndex}-${sequence}`
    : `${dieType}-${groupIndex}-${sequence}-${percentRole}`
}

function createLogicalRollId(groupIndex: number, sequence: number): string {
  return `${groupIndex}-${sequence}`
}

function getPercentOnesValue(face: number): number {
  return face === 10 ? 0 : face
}

function getPercentTensValue(face: number): number {
  if (face >= 1 && face <= 91 && face % 10 === 1) {
    return face - 1
  }

  return face
}

function combinePercentFaces(tensFace: number | null, onesFace: number | null): number | null {
  if (tensFace === null || onesFace === null) {
    return null
  }

  const total = getPercentTensValue(tensFace) + getPercentOnesValue(onesFace)
  return total === 0 ? 100 : total
}

function getManualEntryConfig(slot: RollSlot): { min: number; max: number; step: number; error: string } {
  if (slot.logicalDieType === 'd100' && slot.percentRole === 'tens') {
    return {
      min: 0,
      max: 90,
      step: 10,
      error: 'Enter a value from 0 to 90 in steps of 10',
    }
  }

  if (slot.logicalDieType === 'd100' && slot.percentRole === 'ones') {
    return {
      min: 0,
      max: 9,
      step: 1,
      error: 'Enter a value from 0 to 9',
    }
  }

  return {
    min: 1,
    max: getDieFaces(slot.dieType),
    step: 1,
    error: `Enter a value from 1 to ${getDieFaces(slot.dieType)}`,
  }
}

function getManualEntryLabel(slot: RollSlot): string {
  if (slot.logicalDieType === 'd100' && slot.percentRole === 'tens') {
    return `d% #${slot.logicalSequence} tens`
  }

  if (slot.logicalDieType === 'd100' && slot.percentRole === 'ones') {
    return `d% #${slot.logicalSequence} ones`
  }

  return `${displayDieType(slot.logicalDieType)} #${slot.logicalSequence}`
}

function pickRandomPixels(pixels: ConnectedPixel[], count: number): ConnectedPixel[] {
  if (count >= pixels.length) {
    return pixels
  }

  const shuffledPixels = [...pixels]
  for (let index = shuffledPixels.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffledPixels[index], shuffledPixels[swapIndex]] = [shuffledPixels[swapIndex], shuffledPixels[index]]
  }

  return shuffledPixels.slice(0, count)
}

function buildRollSlots(
  formula: string,
  connectedPixels: ConnectedPixel[],
): RollSlot[] {
  const requiredDice = extractRequiredDice(formula)
  const slots: RollSlot[] = []

  for (const [groupIndex, requiredDie] of requiredDice.entries()) {
    if (requiredDie.dieType === 'd100') {
      const matchingTensPixels = connectedPixels.filter((pixel) => pixel.dieType === 'd100')
      const matchingOnesPixels = connectedPixels.filter((pixel) => pixel.dieType === 'd10')
      const promptedTensPixels =
        matchingTensPixels.length <= 1
          ? matchingTensPixels
          : pickRandomPixels(matchingTensPixels, Math.min(requiredDie.count, matchingTensPixels.length))
      const promptedOnesPixels =
        matchingOnesPixels.length <= 1
          ? matchingOnesPixels
          : pickRandomPixels(matchingOnesPixels, Math.min(requiredDie.count, matchingOnesPixels.length))
      const isSequentialTens = matchingTensPixels.length === 1 && requiredDie.count > 1
      const isSequentialOnes = matchingOnesPixels.length === 1 && requiredDie.count > 1

      for (let index = 0; index < requiredDie.count; index += 1) {
        const sequence = index + 1
        const logicalId = createLogicalRollId(groupIndex, sequence)
        const assignedTensPixel =
          matchingTensPixels.length === 0
            ? null
            : matchingTensPixels.length === 1
              ? matchingTensPixels[0]
              : promptedTensPixels[index] ?? null
        const assignedOnesPixel =
          matchingOnesPixels.length === 0
            ? null
            : matchingOnesPixels.length === 1
              ? matchingOnesPixels[0]
              : promptedOnesPixels[index] ?? null

        slots.push({
          id: createRollSlotId('d100', groupIndex, sequence, 'tens'),
          logicalId,
          dieType: 'd100',
          logicalDieType: 'd100',
          logicalSequence: sequence,
          percentRole: 'tens',
          sequence,
          source: matchingTensPixels.length > 0 ? 'ble' : 'manual',
          pixelId: assignedTensPixel?.pixelId ?? null,
          face: null,
          resultSource: null,
          sequentialTotal: isSequentialTens ? requiredDie.count : null,
        })

        slots.push({
          id: createRollSlotId('d100', groupIndex, sequence, 'ones'),
          logicalId,
          dieType: 'd10',
          logicalDieType: 'd100',
          logicalSequence: sequence,
          percentRole: 'ones',
          sequence,
          source: matchingOnesPixels.length > 0 ? 'ble' : 'manual',
          pixelId: assignedOnesPixel?.pixelId ?? null,
          face: null,
          resultSource: null,
          sequentialTotal: isSequentialOnes ? requiredDie.count : null,
        })
      }

      continue
    }

    const matchingPixels = connectedPixels.filter((pixel) => pixel.dieType === requiredDie.dieType)
    const isSequential = matchingPixels.length === 1 && requiredDie.count > 1
    const promptedPixels =
      matchingPixels.length <= 1
        ? matchingPixels
        : pickRandomPixels(matchingPixels, Math.min(requiredDie.count, matchingPixels.length))

    for (let index = 0; index < requiredDie.count; index += 1) {
      const sequence = index + 1
      const logicalId = createLogicalRollId(groupIndex, sequence)
      const assignedPixel =
        matchingPixels.length === 0
          ? null
          : matchingPixels.length === 1
            ? matchingPixels[0]
            : promptedPixels[index] ?? null

      slots.push({
        id: createRollSlotId(requiredDie.dieType, groupIndex, sequence),
        logicalId,
        dieType: requiredDie.dieType,
        logicalDieType: requiredDie.dieType,
        logicalSequence: sequence,
        percentRole: null,
        sequence,
        source: matchingPixels.length > 0 ? 'ble' : 'manual',
        pixelId: assignedPixel?.pixelId ?? null,
        face: null,
        resultSource: null,
        sequentialTotal: isSequential ? requiredDie.count : null,
      })
    }
  }

  return slots
}

function toEvaluatedRolls(slots: RollSlot[]): DieRollResult[] {
  const rolls: DieRollResult[] = []
  const seenLogicalIds = new Set<string>()

  for (const slot of slots) {
    if (seenLogicalIds.has(slot.logicalId)) {
      continue
    }

    if (slot.logicalDieType === 'd100') {
      const tensSlot = slot.percentRole === 'tens' ? slot : slots.find((candidate) => candidate.logicalId === slot.logicalId && candidate.percentRole === 'tens')
      const onesSlot = slot.percentRole === 'ones' ? slot : slots.find((candidate) => candidate.logicalId === slot.logicalId && candidate.percentRole === 'ones')

      rolls.push({
        dieType: 'd100',
        face: combinePercentFaces(tensSlot?.face ?? null, onesSlot?.face ?? null) ?? 0,
        kept: true,
        source:
          tensSlot?.resultSource === 'manual' ||
          onesSlot?.resultSource === 'manual' ||
          tensSlot?.source === 'manual' ||
          onesSlot?.source === 'manual'
            ? 'manual'
            : 'ble',
      })
      seenLogicalIds.add(slot.logicalId)
      continue
    }

    rolls.push({
      dieType: slot.logicalDieType,
      face: slot.face ?? 0,
      kept: true,
      source: slot.resultSource ?? slot.source,
    })
    seenLogicalIds.add(slot.logicalId)
  }

  return rolls
}

function toDisplayedRolls(slots: RollSlot[], result: EvaluationResult | null): Array<{
  id: string
  dieType: DieType
  sequence: number
  face: number | null
  pending: boolean
  dropped: boolean
}> {
  const displayedRolls: Array<{
    id: string
    dieType: DieType
    sequence: number
    face: number | null
    pending: boolean
    dropped: boolean
  }> = []
  const seenLogicalIds = new Set<string>()

  for (const slot of slots) {
    if (seenLogicalIds.has(slot.logicalId)) {
      continue
    }

    if (slot.logicalDieType === 'd100') {
      const tensSlot = slot.percentRole === 'tens' ? slot : slots.find((candidate) => candidate.logicalId === slot.logicalId && candidate.percentRole === 'tens')
      const onesSlot = slot.percentRole === 'ones' ? slot : slots.find((candidate) => candidate.logicalId === slot.logicalId && candidate.percentRole === 'ones')

      displayedRolls.push({
        id: slot.logicalId,
        dieType: 'd100',
        sequence: slot.logicalSequence,
        face: combinePercentFaces(tensSlot?.face ?? null, onesSlot?.face ?? null),
        pending: tensSlot?.face === null || onesSlot?.face === null,
        dropped: false,
      })
      seenLogicalIds.add(slot.logicalId)
      continue
    }

    displayedRolls.push({
      id: slot.id,
      dieType: slot.logicalDieType,
      sequence: slot.logicalSequence,
      face: slot.face,
      pending: slot.face === null,
      dropped: false,
    })
    seenLogicalIds.add(slot.logicalId)
  }

  if (!result) {
    return displayedRolls
  }

  const evaluatedRolls = result.groups.flatMap((group) => group.rolls)

  return displayedRolls.map((roll, index) => {
    const evaluatedRoll = evaluatedRolls[index]

    return {
      ...roll,
      face: roll.face ?? evaluatedRoll?.face ?? null,
      pending: roll.pending,
      dropped: evaluatedRoll ? !evaluatedRoll.kept : false,
    }
  })
}

function createEmptyBuilderState(): FormulaBuilderState {
  return {
    dice: {
      d4: { count: 0, keepMode: 'kh', keepN: '' },
      d6: { count: 0, keepMode: 'kh', keepN: '' },
      d8: { count: 0, keepMode: 'kh', keepN: '' },
      d10: { count: 0, keepMode: 'kh', keepN: '' },
      d12: { count: 0, keepMode: 'kh', keepN: '' },
      d20: { count: 0, keepMode: 'kh', keepN: '' },
      d100: { count: 0, keepMode: 'kh', keepN: '' },
    },
    flatModifier: 0,
  }
}

function builderStateFromFormula(formula: string): FormulaBuilderState {
  const pickerState = formulaToPickerState(formula)
  const nextState = createEmptyBuilderState()

  if (!pickerState) {
    return nextState
  }

  for (const dieType of DIE_ORDER) {
    const entry = pickerState.dice[dieType]
    if (!entry) {
      continue
    }

    nextState.dice[dieType] = {
      count: entry.count,
      keepMode: entry.keep?.mode ?? 'kh',
      keepN: entry.count >= 2 && entry.keep ? String(entry.keep.n) : '',
    }
  }

  nextState.flatModifier = pickerState.flatModifier
  return nextState
}

function buildFormulaFromState(state: FormulaBuilderState): string {
  const parts: string[] = []

  for (const dieType of DIE_ORDER) {
    const entry = state.dice[dieType]
    if (entry.count === 0) {
      continue
    }

    let part = `${entry.count}${dieType}`
    if (entry.count >= 2 && entry.keepN !== '') {
      part += `${entry.keepMode}${entry.keepN}`
    }

    parts.push(part)
  }

  let formula = parts.join('+')

  if (state.flatModifier !== 0) {
    if (!formula) {
      formula = String(state.flatModifier)
    } else if (state.flatModifier > 0) {
      formula = `${formula}+${state.flatModifier}`
    } else {
      formula = `${formula}${state.flatModifier}`
    }
  }

  return formula
}

function normalizeFormulaState(formula: string): { builderState: FormulaBuilderState; formulaText: string } | null {
  const parsed = parseFormula(formula)
  if (!parsed) {
    return null
  }

  const builderState = builderStateFromFormula(parsed.canonical)
  return {
    builderState,
    formulaText: buildFormulaFromState(builderState),
  }
}

function getKeepError(count: number, keepN: string): string | null {
  if (count < 2 || keepN === '') {
    return null
  }

  const keepValue = Number(keepN)
  if (keepValue > count) {
    return `Cannot keep ${keepValue} of ${count} dice`
  }

  return null
}

function createFormulaId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `formula-${Date.now()}`
}

function createRollHistoryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `history-${Date.now()}`
}

function createRollHistoryEntry(
  formulaName: string,
  parsedFormula: ParsedFormula,
  result: EvaluationResult,
) {
  return {
    id: createRollHistoryId(),
    formulaName,
    formulaString: parsedFormula.canonical,
    total: result.total,
    rolledAt: Date.now(),
    result,
    parsedFormula,
  }
}

function getGlowPixelIdsForSlots(slots: RollSlot[], connectedPixels: ConnectedPixel[]): string[] {
  const promptedPixelIds = new Set(
    slots
      .filter((slot): slot is RollSlot & { pixelId: string } => slot.source === 'ble' && slot.pixelId !== null)
      .map((slot) => slot.pixelId),
  )

  if (promptedPixelIds.size > 0) {
    return Array.from(promptedPixelIds)
  }

  const requiredDieTypes = new Set(slots.filter((slot) => slot.source === 'ble').map((slot) => slot.dieType))

  return connectedPixels
    .filter((pixel) => requiredDieTypes.has(pixel.dieType))
    .map((pixel) => pixel.pixelId)
}

function getPendingGlowPixelIds(rollSession: RollSession, connectedPixels: ConnectedPixel[]): string[] {
  return getGlowPixelIdsForSlots(
    rollSession.slots.filter((slot) => slot.face === null && slot.source === 'ble'),
    connectedPixels,
  )
}

function AutoHideCountdown({ remainingMs, durationMs }: { remainingMs: number; durationMs: number }) {
  const secondsRemaining = Math.ceil(remainingMs / 1000)
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const progress = remainingMs / durationMs
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div
      aria-label={`Roll screen closes in ${secondsRemaining} seconds`}
      className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#4f94ff] bg-[#0b1324] shadow-[4px_4px_0_0_#07101f]"
      title={`Auto closes in ${secondsRemaining} seconds`}
    >
      <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#1f3257" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="#86efac"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[10px] text-[#d7ffe5]">{secondsRemaining}</span>
    </div>
  )
}

export default function FormulaScreen({ mode = 'builder' }: { mode?: FormulaScreenMode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const locationState = location.state as FormulaScreenLocationState | null
  const savedFormulas = useAppStore((state) => state.savedFormulas)
  const pixels = useAppStore((state) => state.pixels)
  const addRollHistory = useAppStore((state) => state.addRollHistory)
  const addSavedFormula = useAppStore((state) => state.addSavedFormula)
  const updateSavedFormula = useAppStore((state) => state.updateSavedFormula)
  const deleteSavedFormula = useAppStore((state) => state.deleteSavedFormula)

  const isRollOnly = mode === 'roll-only'
  const isEditing = !isRollOnly && Boolean(params.id)
  const existingFormula = useMemo(
    () => savedFormulas.find((formula) => formula.id === params.id) ?? null,
    [params.id, savedFormulas],
  )

  const [name, setName] = useState('')
  const [builderState, setBuilderState] = useState<FormulaBuilderState>(() => createEmptyBuilderState())
  const [formulaText, setFormulaText] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [formulaError, setFormulaError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [navigationIntent, setNavigationIntent] = useState<NavigationIntent | null>(null)
  const [rollSession, setRollSession] = useState<RollSession | null>(null)
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({})
  const initialSnapshotRef = useRef<SnapshotState>({ name: '', formulaText: '' })
  const skipBlockRef = useRef(false)
  const rollEngineRef = useRef<HTMLElement | null>(null)
  const hasAutoFocusedRollEngineRef = useRef(false)
  const hasAutoStartedRollRef = useRef(false)
  const pendingRollScrollRef = useRef(false)
  const pendingGlowPromptTimeoutRef = useRef<number | null>(null)
  const queuedGlowPixelIdsRef = useRef<Set<string>>(new Set())
  const [autoHideRemainingMs, setAutoHideRemainingMs] = useState<number | null>(null)
  const [rollOnlyAutoHideExpired, setRollOnlyAutoHideExpired] = useState(false)

  useEffect(() => {
    if (isRollOnly) {
      if (!existingFormula) {
        skipBlockRef.current = true
        setNavigationIntent({ message: 'Formula not found', replace: true })
        return
      }

      const normalized = normalizeFormulaState(existingFormula.formula)
      const nextBuilderState = normalized?.builderState ?? createEmptyBuilderState()
      const nextFormulaText = normalized?.formulaText ?? existingFormula.formula
      const initialState = { name: existingFormula.name, formulaText: nextFormulaText }

      initialSnapshotRef.current = initialState
      setName(initialState.name)
      setBuilderState(nextBuilderState)
      setFormulaText(initialState.formulaText)
      setNameError(null)
      setFormulaError(null)
      setShowDeleteDialog(false)
      setNavigationIntent(null)
      setRollSession(null)
      setManualInputs({})
      setRollOnlyAutoHideExpired(false)
      setIsReady(true)
      return
    }

    if (!isEditing) {
      const initialState = { name: '', formulaText: '' }
      initialSnapshotRef.current = initialState
      setName(initialState.name)
      setBuilderState(createEmptyBuilderState())
      setFormulaText(initialState.formulaText)
      setNameError(null)
      setFormulaError(null)
      setShowDeleteDialog(false)
      setNavigationIntent(null)
      setIsReady(true)
      return
    }

    if (!existingFormula) {
      skipBlockRef.current = true
      setNavigationIntent({ message: 'Formula not found', replace: true })
      return
    }

    const normalized = normalizeFormulaState(existingFormula.formula)
    const nextBuilderState = normalized?.builderState ?? createEmptyBuilderState()
    const nextFormulaText = normalized?.formulaText ?? existingFormula.formula
    const initialState = { name: existingFormula.name, formulaText: nextFormulaText }

    initialSnapshotRef.current = initialState
    setName(initialState.name)
    setBuilderState(nextBuilderState)
    setFormulaText(initialState.formulaText)
    setNameError(null)
    setFormulaError(null)
    setShowDeleteDialog(false)
    setNavigationIntent(null)
    setIsReady(true)
  }, [existingFormula, isEditing, isRollOnly, navigate])

  const keepErrors = useMemo(() => {
    const errors: Partial<Record<DieType, string>> = {}

    for (const dieType of DIE_ORDER) {
      const entry = builderState.dice[dieType]
      const error = getKeepError(entry.count, entry.keepN)
      if (error) {
        errors[dieType] = error
      }
    }

    return errors
  }, [builderState])

  const firstKeepError = useMemo(
    () => DIE_ORDER.map((dieType) => keepErrors[dieType]).find(Boolean) ?? null,
    [keepErrors],
  )
  const keepDice = useMemo(
    () => DIE_ORDER.filter((dieType) => builderState.dice[dieType].count >= 2),
    [builderState],
  )
  const hasUnsavedChanges =
    !isRollOnly &&
    isReady &&
    (name !== initialSnapshotRef.current.name || formulaText !== initialSnapshotRef.current.formulaText)

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges &&
      !skipBlockRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
    [hasUnsavedChanges],
  )

  const blocker = useBlocker(shouldBlock)

  const connectedPixels = useMemo(
    () =>
      Object.values(pixels)
        .filter((pixel) => pixel.connectionState === 'connected')
        .map((pixel) => ({ pixelId: pixel.pixelId, dieType: pixel.dieType }))
        .sort((left, right) => left.pixelId.localeCompare(right.pixelId)),
    [pixels],
  )
  const isAwaitingRolls = rollSession !== null && rollSession.result === null && rollSession.slots.some((slot) => slot.face === null)
  const pendingManualSlots = useMemo(
    () => rollSession?.slots.filter((slot) => slot.face === null && slot.source === 'manual') ?? [],
    [rollSession],
  )
  const currentSequentialSlot = useMemo(() => {
    if (!rollSession || rollSession.result) {
      return null
    }

    return rollSession.slots.find((slot) => slot.face === null && slot.source === 'ble' && slot.sequentialTotal !== null) ?? null
  }, [rollSession])
  const completedRollResult = rollSession?.result ?? null
  const displayedRollsByDieType = useMemo(() => {
    if (!rollSession) {
      return [] as Array<{
        dieType: DieType
        rolls: Array<{
          id: string
          dieType: DieType
          sequence: number
          face: number | null
          pending: boolean
          dropped: boolean
        }>
      }>
    }

    const groups = new Map<DieType, ReturnType<typeof toDisplayedRolls>>()
    for (const roll of toDisplayedRolls(rollSession.slots, completedRollResult)) {
      const existing = groups.get(roll.dieType) ?? []
      existing.push(roll)
      groups.set(roll.dieType, existing)
    }

    return DIE_ORDER
      .filter((dieType) => groups.has(dieType))
      .map((dieType) => ({ dieType, rolls: groups.get(dieType)! }))
  }, [completedRollResult, rollSession])
  const showRollEngine = rollSession !== null || formulaText.trim() !== ''
  const rollDisabled = formulaText.trim() === '' || firstKeepError !== null || isAwaitingRolls
  const manualInputErrors = useMemo(() => {
    const errors: Record<string, string> = {}

    for (const slot of pendingManualSlots) {
      const value = manualInputs[slot.id] ?? ''
      if (value === '') {
        continue
      }

      const entryConfig = getManualEntryConfig(slot)
      const parsedValue = Number(value)
      if (
        !Number.isInteger(parsedValue) ||
        parsedValue < entryConfig.min ||
        parsedValue > entryConfig.max ||
        (parsedValue - entryConfig.min) % entryConfig.step !== 0
      ) {
        errors[slot.id] = entryConfig.error
      }
    }

    return errors
  }, [manualInputs, pendingManualSlots])
  const manualSubmitDisabled =
    pendingManualSlots.length === 0 ||
    pendingManualSlots.some((slot) => (manualInputs[slot.id] ?? '') === '' || manualInputErrors[slot.id] !== undefined)

  const clearPendingGlowPrompt = useCallback(() => {
    if (pendingGlowPromptTimeoutRef.current !== null) {
      window.clearTimeout(pendingGlowPromptTimeoutRef.current)
      pendingGlowPromptTimeoutRef.current = null
    }

    queuedGlowPixelIdsRef.current.clear()
  }, [])

  const scheduleGlowPrompt = useCallback((pixelIds: Iterable<string>) => {
    let hasQueuedPixels = false

    for (const pixelId of pixelIds) {
      queuedGlowPixelIdsRef.current.add(pixelId)
      hasQueuedPixels = true
    }

    if (!hasQueuedPixels) {
      return
    }

    if (pendingGlowPromptTimeoutRef.current !== null) {
      window.clearTimeout(pendingGlowPromptTimeoutRef.current)
    }

    pendingGlowPromptTimeoutRef.current = window.setTimeout(() => {
      const pixelIdsToGlow = Array.from(queuedGlowPixelIdsRef.current)
      queuedGlowPixelIdsRef.current.clear()
      pendingGlowPromptTimeoutRef.current = null
      void Promise.allSettled(pixelIdsToGlow.map((pixelId) => glowDie(pixelId)))
    }, FORMULA_ROLL_TRANSITION_DELAY_MS)
  }, [])

  const completeRollSession = useCallback(async (nextSession: RollSession) => {
    clearPendingGlowPrompt()

    const result = evaluateFormula(nextSession.parsedFormula, toEvaluatedRolls(nextSession.slots))
    const formulaName = name.trim()

    addRollHistory(createRollHistoryEntry(formulaName, nextSession.parsedFormula, result))

    setManualInputs({})
    setRollSession({
      ...nextSession,
      result,
      statusMessage: null,
      historyRecorded: true,
    })
  }, [addRollHistory, clearPendingGlowPrompt, name])

  const scrollRollEngineIntoView = useCallback(() => {
    rollEngineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const syncBuilderState = (nextState: FormulaBuilderState) => {
    setBuilderState(nextState)
    setFormulaText(buildFormulaFromState(nextState))
    setFormulaError(null)
    if (!isAwaitingRolls) {
      setRollSession(null)
      setManualInputs({})
    }
  }

  const handleCountChange = (dieType: DieType, delta: number) => {
    const current = builderState.dice[dieType]
    const nextCount = Math.max(0, current.count + delta)
    const nextState: FormulaBuilderState = {
      ...builderState,
      dice: {
        ...builderState.dice,
        [dieType]: {
          ...current,
          count: nextCount,
          keepN: nextCount < 2 ? '' : current.keepN,
        },
      },
    }

    syncBuilderState(nextState)
  }

  const handleKeepModeChange = (dieType: DieType, mode: KeepMode) => {
    const current = builderState.dice[dieType]
    const nextState: FormulaBuilderState = {
      ...builderState,
      dice: {
        ...builderState.dice,
        [dieType]: {
          ...current,
          keepMode: mode,
        },
      },
    }

    syncBuilderState(nextState)
  }

  const handleKeepValueChange = (dieType: DieType, value: string) => {
    const current = builderState.dice[dieType]
    let sanitized = value.replace(/\D/g, '')

    if (sanitized !== '' && Number(sanitized) < 1) {
      sanitized = '1'
    }

    const nextState: FormulaBuilderState = {
      ...builderState,
      dice: {
        ...builderState.dice,
        [dieType]: {
          ...current,
          keepN: sanitized,
        },
      },
    }

    syncBuilderState(nextState)
  }

  const handleKeepPreset = (dieType: DieType, mode: KeepMode) => {
    const current = builderState.dice[dieType]
    const nextState: FormulaBuilderState = {
      ...builderState,
      dice: {
        ...builderState.dice,
        [dieType]: {
          ...current,
          count: 2,
          keepMode: mode,
          keepN: '1',
        },
      },
    }

    syncBuilderState(nextState)
  }

  const handleFlatModifierChange = (value: string) => {
    const parsedValue = value === '' ? 0 : Number(value)
    if (!Number.isFinite(parsedValue)) {
      return
    }

    const nextState: FormulaBuilderState = {
      ...builderState,
      flatModifier: Math.min(9999, Math.max(-9999, Math.trunc(parsedValue))),
    }

    syncBuilderState(nextState)
  }

  const handleFormulaBlur = () => {
    const normalized = normalizeFormulaState(formulaText)
    if (!normalized) {
      setFormulaError('Invalid formula')
      return
    }

    setBuilderState(normalized.builderState)
    setFormulaText(normalized.formulaText)
    setFormulaError(null)

    if (!isAwaitingRolls) {
      setRollSession(null)
      setManualInputs({})
    }
  }

  const handleRoll = async () => {
    const normalized = normalizeFormulaState(formulaText)
    if (!normalized) {
      setFormulaError('Invalid formula — please check and try again')
      return
    }

    const parsed = parseFormula(normalized.formulaText)
    if (!parsed) {
      setFormulaError('Invalid formula — please check and try again')
      return
    }

    setBuilderState(normalized.builderState)
    setFormulaText(normalized.formulaText)
    setFormulaError(null)
    pendingRollScrollRef.current = true
    setRollOnlyAutoHideExpired(false)
    clearPendingGlowPrompt()

    const slots = buildRollSlots(normalized.formulaText, connectedPixels)
    const nextSession: RollSession = {
      parsedFormula: parsed,
      slots,
      result: null,
      statusMessage: null,
      historyRecorded: false,
    }

    setManualInputs({})
    setRollSession(nextSession)

    const pixelIdsToGlow = getGlowPixelIdsForSlots(slots, connectedPixels)

    await Promise.allSettled(pixelIdsToGlow.map((pixelId) => glowDie(pixelId)))
  }

  const handleCancelRoll = async () => {
    clearPendingGlowPrompt()
    await stopAllGlows()
    setManualInputs({})
    setRollSession(null)
  }

  const handlePromptPendingDice = useCallback(async () => {
    if (!rollSession || rollSession.result !== null) {
      return
    }

    const pixelIdsToGlow = getPendingGlowPixelIds(rollSession, connectedPixels)
    if (pixelIdsToGlow.length === 0) {
      return
    }

    clearPendingGlowPrompt()
    await Promise.allSettled(pixelIdsToGlow.map((pixelId) => glowDie(pixelId)))
  }, [clearPendingGlowPrompt, connectedPixels, rollSession])

  const handleManualInputChange = (slotId: string, value: string) => {
    setManualInputs((current) => ({
      ...current,
      [slotId]: value.replace(/\D/g, ''),
    }))
  }

  const handleSubmitManualRolls = async () => {
    if (!rollSession || manualSubmitDisabled) {
      return
    }

    const nextSession: RollSession = {
      ...rollSession,
      statusMessage: null,
      slots: rollSession.slots.map((slot) => {
        if (slot.face !== null || slot.source !== 'manual') {
          return slot
        }

        return {
          ...slot,
          face: Number(manualInputs[slot.id]),
          resultSource: 'manual',
        }
      }),
    }

    setRollSession(nextSession)

  }

  const handleSave = () => {
    const trimmedName = name.trim()
    const normalized = normalizeFormulaState(formulaText)
    let hasError = false

    if (!trimmedName) {
      setNameError('Please enter a name')
      hasError = true
    } else {
      setNameError(null)
    }

    if (!normalized) {
      setFormulaError('Invalid formula')
      hasError = true
    } else {
      setFormulaError(null)
    }

    if (firstKeepError) {
      hasError = true
    }

    if (hasError || !normalized) {
      return
    }

    const now = Date.now()
    const formula = normalized.formulaText

    if (isEditing && existingFormula) {
      updateSavedFormula(existingFormula.id, {
        name: trimmedName,
        formula,
        updatedAt: now,
      })
    } else {
      addSavedFormula({
        id: createFormulaId(),
        name: trimmedName,
        formula,
        createdAt: now,
        updatedAt: now,
      })
    }

    skipBlockRef.current = true
    setNavigationIntent({ message: 'Formula saved' })
  }

  const handleDelete = () => {
    if (!existingFormula) {
      return
    }

    deleteSavedFormula(existingFormula.id)
    skipBlockRef.current = true
    setNavigationIntent({ message: 'Formula deleted' })
  }

  useEffect(() => {
    return () => {
      clearPendingGlowPrompt()
      void stopAllGlows()
    }
  }, [clearPendingGlowPrompt])

  useEffect(() => {
    hasAutoFocusedRollEngineRef.current = false
    hasAutoStartedRollRef.current = false
  }, [location.key])

  useEffect(() => {
    if (!isReady || !locationState?.focusRollEngine || formulaText.trim() === '' || hasAutoFocusedRollEngineRef.current) {
      return
    }

    hasAutoFocusedRollEngineRef.current = true
    const timeoutId = window.setTimeout(() => {
      scrollRollEngineIntoView()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [formulaText, isReady, locationState, scrollRollEngineIntoView])

  useEffect(() => {
    if (
      !isRollOnly ||
      !isReady ||
      formulaText.trim() === '' ||
      rollSession !== null ||
      completedRollResult !== null ||
      hasAutoStartedRollRef.current
    ) {
      return
    }

    hasAutoStartedRollRef.current = true
    void handleRoll()
  }, [completedRollResult, formulaText, isReady, isRollOnly, rollSession])

  useEffect(() => {
    if (!pendingRollScrollRef.current || !rollSession) {
      return
    }

    pendingRollScrollRef.current = false
    const timeoutId = window.setTimeout(() => {
      scrollRollEngineIntoView()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [rollSession, scrollRollEngineIntoView])

  useEffect(() => {
    if (!isRollOnly || !completedRollResult) {
      setAutoHideRemainingMs(null)
      return
    }

    const durationMs = 10_000
    const deadline = Date.now() + durationMs

    const tick = () => {
      const nextRemainingMs = Math.max(0, deadline - Date.now())
      setAutoHideRemainingMs(nextRemainingMs)

      if (nextRemainingMs === 0) {
        setRollOnlyAutoHideExpired(true)
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 100)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [completedRollResult, isRollOnly])

  useEffect(() => {
    if (!rollSession || rollSession.result !== null) {
      return
    }

    if (rollSession.slots.every((slot) => slot.face !== null)) {
      void completeRollSession(rollSession)
    }
  }, [completeRollSession, rollSession])

  useEffect(() => {
    if (!isAwaitingRolls) {
      return
    }

    return onRollResult((_pixelId, face, dieType) => {
      const pixelsToGlow = new Set<string>()

      setRollSession((current) => {
        if (!current || current.result) {
          return current
        }

        const slotIndex = current.slots.findIndex(
          (slot) =>
            slot.face === null &&
            slot.source === 'ble' &&
            slot.dieType === dieType,
        )

        if (slotIndex === -1) {
          return current
        }

        const nextSlots = current.slots.map((slot, index) =>
          index === slotIndex
            ? {
                ...slot,
                face,
                resultSource: 'ble' as const,
              }
            : slot,
        )

        const nextSession = {
          ...current,
          slots: nextSlots,
          statusMessage: null,
        }

        const pendingSameDieTypeSlots = nextSlots.filter(
          (slot) => slot.face === null && slot.source === 'ble' && slot.dieType === dieType,
        )

        if (pendingSameDieTypeSlots.length > 0) {
          for (const slot of pendingSameDieTypeSlots) {
            if (slot.pixelId) {
              pixelsToGlow.add(slot.pixelId)
            }
          }

          if (pixelsToGlow.size === 0) {
            for (const pixel of connectedPixels) {
              if (pixel.dieType === dieType) {
                pixelsToGlow.add(pixel.pixelId)
              }
            }
          }
        }

        return nextSession
      })

      if (pixelsToGlow.size > 0) {
        scheduleGlowPrompt(pixelsToGlow)
      }
    })
  }, [completeRollSession, connectedPixels, isAwaitingRolls, scheduleGlowPrompt])

  useEffect(() => {
    if (!isAwaitingRolls) {
      return
    }

    setRollSession((current) => {
      if (!current || current.result) {
        return current
      }

      let statusMessage = current.statusMessage
      let mutated = false

      const nextSlots = current.slots.map((slot) => {
        if (slot.face !== null || slot.source !== 'ble') {
          return slot
        }

        const hasConnectedDieType = Object.values(pixels).some(
          (pixel) => pixel.dieType === slot.dieType && pixel.connectionState === 'connected',
        )

        if (hasConnectedDieType) {
          return slot
        }

        mutated = true
        statusMessage = `${displayDieType(slot.logicalDieType)} disconnected — enter result manually.`

        return {
          ...slot,
          source: 'manual' as const,
          pixelId: null,
        }
      })

      if (!mutated) {
        return current
      }

      const nextSession = {
        ...current,
        slots: nextSlots,
        statusMessage,
      }

      return nextSession
    })
  }, [completeRollSession, isAwaitingRolls, pixels])

  if (navigationIntent) {
    return (
      <Navigate
        to="/"
        replace={navigationIntent.replace}
        state={{ toastMessage: navigationIntent.message }}
      />
    )
  }

  if (rollOnlyAutoHideExpired) {
    return <Navigate to="/" replace />
  }

  const rollEngineSection = showRollEngine ? (
    <section ref={rollEngineRef} className="border-2 border-[#4f94ff] bg-[#10192f] p-4 shadow-[6px_6px_0_0_#07101f]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          {currentSequentialSlot ? (
            <p role="status" className="text-[10px] text-[#d8e6ff]">
              Roll {displayDieType(currentSequentialSlot.logicalDieType)} - {currentSequentialSlot.logicalSequence} of {currentSequentialSlot.sequentialTotal}
            </p>
          ) : isAwaitingRolls ? (
            <p role="status" className="text-[10px] text-[#d8e6ff]">
              Awaiting roll results...
            </p>
          ) : isRollOnly ? (
            <p role="status" className="text-[10px] text-[#d8e6ff]">
              Preparing roll...
            </p>
          ) : (
            <p role="status" className="text-[10px] text-[#d8e6ff]">
              Press Roll to start collecting results.
            </p>
          )}
          {rollSession?.statusMessage ? (
            <p className="mt-2 text-[10px] text-[#ffe7b3]">{rollSession.statusMessage}</p>
          ) : null}
          {completedRollResult ? (
            <p className="mt-2 text-[10px] text-[#86efac]">Total: {completedRollResult.total}</p>
          ) : null}
        </div>

        {isAwaitingRolls ? (
          <button
            type="button"
            onClick={() => {
              void handleCancelRoll()
            }}
            className="border-2 border-[#ff9aa2] bg-[#35181f] px-4 py-3 text-[10px] text-[#ffe3e6] shadow-[4px_4px_0_0_#12070d]"
          >
            Cancel roll
          </button>
        ) : completedRollResult ? (
          <button
            type="button"
            onClick={() => {
              void handleRoll()
            }}
            className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c]"
          >
            Roll Again
          </button>
        ) : null}
      </div>

      {rollSession ? (
        <div className="mt-4 border-t border-[#35518a] pt-4">
          <h3 className="text-[10px] uppercase tracking-[0.16em] text-[#c5d7ff]">Rolled dice</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {displayedRollsByDieType.flatMap(({ rolls }) =>
              rolls.map((roll) => (
                <DieResultChip
                  key={roll.id}
                  dieType={roll.dieType}
                  face={roll.face}
                  pending={roll.pending}
                  dropped={roll.dropped}
                  onClick={roll.pending && isAwaitingRolls ? () => void handlePromptPendingDice() : undefined}
                  ariaLabel={
                    roll.pending
                      ? `${displayDieType(roll.dieType)} #${roll.sequence} pending`
                      : `${displayDieType(roll.dieType)} #${roll.sequence} result ${roll.face}${roll.dropped ? ' dropped' : ''}`
                  }
                />
              )),
            )}
          </div>
        </div>
      ) : null}

      {pendingManualSlots.length > 0 ? (
        <div className="mt-4 border-t border-[#35518a] pt-4">
          <h3 className="text-[10px] uppercase tracking-[0.16em] text-[#c5d7ff]">Manual entry</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {pendingManualSlots.map((slot) => (
              <div key={slot.id}>
                <label htmlFor={slot.id} className="block text-[10px] text-[#d8e6ff]">
                  {getManualEntryLabel(slot)}
                </label>
                <input
                  id={slot.id}
                  type="number"
                  inputMode="numeric"
                  min={getManualEntryConfig(slot).min}
                  max={getManualEntryConfig(slot).max}
                  step={getManualEntryConfig(slot).step}
                  value={manualInputs[slot.id] ?? ''}
                  onChange={(event) => handleManualInputChange(slot.id, event.target.value)}
                  className="mt-2 w-full border-2 border-[#4f94ff] bg-[#0d162a] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
                />
                {manualInputErrors[slot.id] ? (
                  <p className="mt-2 text-[10px] text-[#ffcc66]">{manualInputErrors[slot.id]}</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={manualSubmitDisabled}
              onClick={() => {
                void handleSubmitManualRolls()
              }}
              className="border-2 border-[#ffd166] bg-[#3b2a11] px-4 py-3 text-[10px] text-[#fff0bf] shadow-[4px_4px_0_0_#120c06] disabled:cursor-not-allowed disabled:border-[#6a614d] disabled:bg-[#282318] disabled:text-[#a89d7c] disabled:shadow-none"
            >
              Submit manual rolls
            </button>
          </div>
        </div>
      ) : null}
    </section>
  ) : null

  if (isRollOnly) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-4xl items-center justify-center">
          <section className="relative w-full border-2 border-[#8a72a8] bg-[#15111a] p-5 shadow-[8px_8px_0_0_#09070d]">
            <div className="mb-5 flex items-start justify-between gap-4 pr-16">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5b7d8]">Roll Only</p>
                <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">{name || 'Saved Formula'}</h1>
                <p className="mt-3 font-mono text-[11px] text-[#d8cef1]">{formulaText}</p>
              </div>

              <button
                type="button"
                onClick={() => navigate('/', { replace: true })}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4] shadow-[4px_4px_0_0_#09070d]"
              >
                Close
              </button>
            </div>

            {autoHideRemainingMs !== null ? (
              <div className="absolute right-4 top-4">
                <AutoHideCountdown remainingMs={autoHideRemainingMs} durationMs={10_000} />
              </div>
            ) : null}

            {rollEngineSection}
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-col gap-4 border-2 border-[#8a72a8] bg-[#1a1421] p-4 shadow-[6px_6px_0_0_#0b0810] md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5b7d8]">Builder</p>
            <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">
              {isEditing ? 'Edit Formula' : 'New Formula'}
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4] shadow-[4px_4px_0_0_#09070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              ← Back
            </button>

            {isEditing ? (
              <button
                type="button"
                onClick={() => setShowDeleteDialog(true)}
                className="border-2 border-[#ff9aa2] bg-[#35181f] px-4 py-3 text-[10px] text-[#ffe3e6] shadow-[4px_4px_0_0_#12070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                Delete
              </button>
            ) : null}
          </div>
        </header>

        <div className="space-y-6">
          <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
            <label htmlFor="formula-name" className="block text-[10px] uppercase tracking-[0.18em] text-[#c5b7d8]">
              Formula Name
            </label>
            <input
              id="formula-name"
              type="text"
              placeholder="Formula name"
              value={name}
              disabled={isAwaitingRolls}
              onChange={(event) => {
                setName(event.target.value)
                setNameError(null)
                setRollSession(null)
              }}
              className="mt-3 w-full border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
            />
            {nameError ? <p className="mt-3 text-[10px] text-[#ff9aa2]">{nameError}</p> : null}
          </section>

          <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm text-[#f7ead4]">Dice Picker</h2>
                <p className="mt-2 text-[9px] leading-relaxed text-[#c5b7d8]">
                  Pick dice visually or type the full expression below.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
              {DISPLAY_DIE_ORDER.map((dieType) => {
                const entry = builderState.dice[dieType]

                return (
                  <div
                    key={dieType}
                    className="flex min-w-0 flex-col items-center gap-1.5 rounded-[14px] border-2 border-[#5d4a7a] bg-[#1b1522] px-1 py-2 shadow-[3px_3px_0_0_#09070d]"
                  >
                    <button
                      type="button"
                      aria-label={`Add ${displayDieType(dieType)}`}
                      disabled={isAwaitingRolls}
                      onClick={() => handleCountChange(dieType, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#86efac] bg-[#17301f] text-sm leading-none text-[#d7ffe5] disabled:cursor-not-allowed disabled:border-[#4d5b52] disabled:bg-[#202721] disabled:text-[#8ba091]"
                    >
                      +
                    </button>

                    <div className="flex h-10 w-10 items-center justify-center">
                      <DieIcon dieType={dieType} className="h-10 w-10" />
                    </div>

                    <div
                      aria-label={`Count for ${displayDieType(dieType)}`}
                      className="min-w-0 rounded-full border-2 border-[#4f3f63] bg-[#120e17] px-2 py-1 text-center text-[10px] text-[#f7ead4]"
                    >
                      {entry.count}
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove ${displayDieType(dieType)}`}
                      disabled={entry.count === 0}
                      onClick={() => handleCountChange(dieType, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#7d6b95] bg-[#251d2e] text-sm leading-none text-[#f7ead4] disabled:cursor-not-allowed disabled:border-[#494355] disabled:bg-[#221d28] disabled:text-[#807a8c]"
                    >
                      -
                    </button>
                  </div>
                )
              })}
            </div>

            {keepDice.length > 0 ? (
              <div className="mt-5 border-t border-[#4f3f63] pt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-[10px] uppercase tracking-[0.16em] text-[#c5b7d8]">Keep Dice</h3>
                  <p className="text-[9px] text-[#8ba091]">Only shown for counts of 2 or more</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {DISPLAY_DIE_ORDER.filter((dieType) => keepDice.includes(dieType)).map((dieType) => {
                    const entry = builderState.dice[dieType]
                    const keepError = keepErrors[dieType]

                    return (
                      <div
                        key={`keep-${dieType}`}
                        className="rounded-[14px] border-2 border-[#5d4a7a] bg-[#1b1522] p-3 shadow-[3px_3px_0_0_#09070d]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center">
                            <DieIcon dieType={dieType} className="h-10 w-10" />
                          </div>

                          <div>
                            <p className="text-[10px] uppercase tracking-[0.16em] text-[#f7ead4]">
                              {displayDieType(dieType)} keep
                            </p>
                            <p className="mt-1 text-[9px] text-[#c5b7d8]">{entry.count} dice selected</p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-end gap-3">
                          <div>
                            <label
                              htmlFor={`keep-mode-${dieType}`}
                              className="block text-[9px] uppercase tracking-[0.16em] text-[#c5b7d8]"
                            >
                              Keep
                            </label>
                            <select
                              id={`keep-mode-${dieType}`}
                              aria-label={`Keep mode for ${displayDieType(dieType)}`}
                              value={entry.keepMode}
                              disabled={isAwaitingRolls}
                              onChange={(event) => handleKeepModeChange(dieType, event.target.value as KeepMode)}
                              className="mt-2 border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
                            >
                              <option value="kh">kh</option>
                              <option value="kl">kl</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor={`keep-count-${dieType}`}
                              className="block text-[9px] uppercase tracking-[0.16em] text-[#c5b7d8]"
                            >
                              N
                            </label>
                            <input
                              id={`keep-count-${dieType}`}
                              aria-label={`Keep count for ${displayDieType(dieType)}`}
                              type="number"
                              min={1}
                              max={entry.count}
                              placeholder="off"
                              value={entry.keepN}
                              disabled={isAwaitingRolls}
                              onChange={(event) => handleKeepValueChange(dieType, event.target.value)}
                              className="mt-2 w-20 border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
                            />
                          </div>

                          <div className="flex flex-wrap gap-2 self-end">
                            <button
                              type="button"
                              aria-label={`Set advantage for ${displayDieType(dieType)}`}
                              disabled={isAwaitingRolls}
                              onClick={() => handleKeepPreset(dieType, 'kh')}
                              className="rounded-full border border-[#86efac] bg-[#17301f] px-3 py-2 text-[9px] text-[#d7ffe5] disabled:cursor-not-allowed disabled:border-[#4d5b52] disabled:bg-[#202721] disabled:text-[#8ba091]"
                            >
                              Adv
                            </button>
                            <button
                              type="button"
                              aria-label={`Set disadvantage for ${displayDieType(dieType)}`}
                              disabled={isAwaitingRolls}
                              onClick={() => handleKeepPreset(dieType, 'kl')}
                              className="rounded-full border border-[#ff9aa2] bg-[#35181f] px-3 py-2 text-[9px] text-[#ffe3e6] disabled:cursor-not-allowed disabled:border-[#5b494e] disabled:bg-[#272022] disabled:text-[#9a878c]"
                            >
                              Dis
                            </button>
                          </div>
                        </div>

                        {keepError ? <p className="mt-3 text-[10px] text-[#ff9aa2]">{keepError}</p> : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </section>

          <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px] md:items-end">
              <div>
                <label htmlFor="formula-text" className="block text-[10px] uppercase tracking-[0.18em] text-[#c5b7d8]">
                  Formula
                </label>
                <input
                  id="formula-text"
                  type="text"
                  value={formulaText}
                  disabled={isAwaitingRolls}
                  onChange={(event) => {
                    setFormulaText(event.target.value)
                    setFormulaError(null)
                    setRollSession(null)
                  }}
                  onBlur={handleFormulaBlur}
                  className="mt-3 w-full border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 font-mono text-[11px] text-[#f7ead4] outline-none"
                />
                {formulaError ? <p className="mt-3 text-[10px] text-[#ff9aa2]">{formulaError}</p> : null}
              </div>

              <div>
                <label htmlFor="flat-modifier" className="block text-[10px] uppercase tracking-[0.18em] text-[#c5b7d8]">
                  Flat Modifier
                </label>
                <input
                  id="flat-modifier"
                  type="number"
                  min={-9999}
                  max={9999}
                  value={builderState.flatModifier}
                  disabled={isAwaitingRolls}
                  onChange={(event) => handleFlatModifierChange(event.target.value)}
                  className="mt-3 w-full border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
                />
              </div>
            </div>
          </section>

          {rollEngineSection}

          <section className="flex flex-wrap justify-end gap-3 border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
            <button
              type="button"
              disabled={rollDisabled}
              onClick={() => {
                void handleRoll()
              }}
              className="border-2 border-[#4f94ff] bg-[#102043] px-4 py-3 text-[10px] text-[#d8e6ff] shadow-[4px_4px_0_0_#07101f] disabled:cursor-not-allowed disabled:border-[#4a5569] disabled:bg-[#1d2230] disabled:text-[#8d96a5] disabled:shadow-none"
            >
              Roll
            </button>
            <button
              type="button"
              disabled={!isReady || firstKeepError !== null || isAwaitingRolls}
              onClick={handleSave}
              className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c] disabled:cursor-not-allowed disabled:border-[#4d5b52] disabled:bg-[#202721] disabled:text-[#8ba091] disabled:shadow-none"
            >
              Save
            </button>
          </section>
        </div>
      </div>

      {showDeleteDialog && existingFormula ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md border-2 border-[#ff9aa2] bg-[#1a1421] p-5 shadow-[8px_8px_0_0_#09070d]"
          >
            <h2 className="text-sm text-[#f7ead4]">Delete formula?</h2>
            <p className="mt-4 text-[10px] leading-relaxed text-[#d8cef1]">
              '{existingFormula.name}' will be permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="border-2 border-[#ff6b6b] bg-[#4a1515] px-4 py-3 text-[10px] text-[#ffe1e1]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {blocker.state === 'blocked' ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md border-2 border-[#ffd166] bg-[#1a1421] p-5 shadow-[8px_8px_0_0_#09070d]"
          >
            <h2 className="text-sm text-[#f7ead4]">Discard changes?</h2>
            <p className="mt-4 text-[10px] leading-relaxed text-[#d8cef1]">
              You have unsaved edits on this formula.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => blocker.reset()}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => blocker.proceed()}
                className="border-2 border-[#ffd166] bg-[#3b2a11] px-4 py-3 text-[10px] text-[#fff0bf]"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

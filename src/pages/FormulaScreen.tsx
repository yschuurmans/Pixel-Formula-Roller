import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useBlocker, useLocation, useNavigate, useParams, type BlockerFunction } from 'react-router-dom'
import { evaluateFormula, parseFormula } from '../services/formulaParser'
import {
  connectRememberedDie,
  disconnectDie,
  glowDie,
  enqueueReconnectDuringRoll,
  cancelAllReconnectsDuringRoll,
  onRollResult,
  stopAllGlows,
} from '../services/pixelsService'
import { nativeLog } from '../services/pixelsTransport'
import { useAppStore } from '../stores/useAppStore'
import type { DieType, EvaluationResult, ParsedFormula } from '../types/formula'
import DieIcon from '../components/DieIcon'
import DieResultChip from '../components/DieResultChip'
import {
  displayDieType,
  getManualEntryConfig,
  getManualEntryLabel,
  createFormulaId,
  createRollSessionId,
  createRollHistoryEntry,
  AutoHideCountdown,
} from './formulaHelpers'
import {
  getGlowPixelIdsForSlots,
  getPendingGlowPixelIds,
  assignPendingBlePixelIds,
  promoteRecoverableManualSlots,
  buildAvailabilityPlan,
  hasRecoverableRememberedPixel,
  markAssignedPixelsUsed,
  type RollSlot,
  type ConnectedPixel,
} from './availabilityHelpers'

import {
  buildRollSlots,
  toEvaluatedRolls,
  toDisplayedRolls,
  createEmptyBuilderState,
  buildFormulaFromState,
  normalizeFormulaState,
  getKeepError,
  type FormulaBuilderState,
} from '../application/rollHelpers'

const DIE_ORDER: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
const DISPLAY_DIE_ORDER: DieType[] = [...DIE_ORDER].reverse() as DieType[]
const FORMULA_ROLL_TRANSITION_DELAY_MS = 1200
const ROLL_GLOW_REPEAT_MS = 2_000
const REMEMBERED_DICE_RETRY_INTERVAL_MS = 2_000
const MAX_CONNECTED = 12

type KeepMode = 'kh' | 'kl'

// `FormulaBuilderState` is provided by the application layer (`rollHelpers`).

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



type RollSession = {
  parsedFormula: ParsedFormula
  slots: RollSlot[]
  result: EvaluationResult | null
  statusMessage: string | null
  historyRecorded: boolean
  sessionId?: string
}
/* Roll helpers moved to ../application/rollHelpers */



// Availability/assignment helpers moved to ./availabilityHelpers

export default function FormulaScreen({ mode = 'builder' }: { mode?: FormulaScreenMode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const locationState = location.state as FormulaScreenLocationState | null
  const savedFormulas = useAppStore((state) => state.savedFormulas)
  const pixels = useAppStore((state) => state.pixels)
  const pairedPixels = useAppStore((state) => state.pairedPixels)
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
  const lastGlowAtRef = useRef<number>(0)
  // Debounce window to prevent rapid duplicate glow calls. Use a value
  // slightly larger than `FORMULA_ROLL_TRANSITION_DELAY_MS` so scheduled
  // delayed prompts triggered shortly after an immediate glow are ignored.
  const GLOW_DEDUP_MS = FORMULA_ROLL_TRANSITION_DELAY_MS + 100
  const lastGlowByPixelRef = useRef<Map<string, number>>(new Map())
  const rollSessionRef = useRef<RollSession | null>(null)
  const executeGlowForPixels = useCallback(async (pixelIdsIterable: Iterable<string>, forceOrContext: boolean | string | null = false) => {
    const force = typeof forceOrContext === 'boolean' ? forceOrContext : false
    const now = Date.now()
    const pixelIds = Array.from(pixelIdsIterable)
    const toGlow = force
      ? pixelIds
      : pixelIds.filter((id) => {
          const last = lastGlowByPixelRef.current.get(id) ?? 0
          // Only allow glow if the cooldown has elapsed (allow equal).
          return now - last >= ROLL_GLOW_REPEAT_MS
        })
    if (toGlow.length === 0) return
    const per = pixelIds.map((id) => {
      const last = lastGlowByPixelRef.current.get(id) ?? null
      return { id, last, since: last === null ? null : now - last }
    })
    nativeLog('i', 'executeGlowForPixels', { pixelIds, toGlow, ROLL_GLOW_REPEAT_MS, per, force, ctx: typeof forceOrContext === 'string' ? forceOrContext : undefined })
    for (const id of toGlow) lastGlowByPixelRef.current.set(id, now)
    await Promise.allSettled(toGlow.map((pixelId) => glowDie(pixelId)))
  }, [])
  const glowInFlightRef = useRef(false)
  const lastAssignReassignedChangedRef = useRef(false)
  const suppressScheduledUntilRef = useRef<number | null>(null)
  const glowPauseUntilRef = useRef<number | null>(null)
  const availabilitySyncInFlightRef = useRef(false)
  const prevPixelsRef = useRef<Record<string, { connectionState?: string }>>({})
  // Persist initial availability plans for the active roll session so we
  // don't escalate disconnects across retries.
  const availabilityInitialDisconnectRef = useRef<string[] | null>(null)
  const availabilityInitialConnectRef = useRef<string[] | null>(null)
  const availabilityConnectAttemptedRef = useRef(false)
  const lastSyncRollSessionRef = useRef<string | null>(null)
  const pendingReconnectInFlightRef = useRef(false)
  const [glowPauseUntil, setGlowPauseUntil] = useState<number | null>(null)
  const [autoHideRemainingMs, setAutoHideRemainingMs] = useState<number | null>(null)
  const [rollOnlyAutoHideExpired, setRollOnlyAutoHideExpired] = useState(false)

  useEffect(() => {
    rollSessionRef.current = rollSession
  }, [rollSession])

  useEffect(() => {
    glowPauseUntilRef.current = glowPauseUntil
  }, [glowPauseUntil])

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
    const suppressUntil = suppressScheduledUntilRef.current
    if (suppressUntil !== null && Date.now() < suppressUntil) {
      // Suppressed by the caller (e.g. immediate glow already performed);
      // keep suppression cleared once the window expires.
      return
    }

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

    pendingGlowPromptTimeoutRef.current = window.setTimeout(async () => {
      const pixelIdsToGlow = Array.from(queuedGlowPixelIdsRef.current)
      queuedGlowPixelIdsRef.current.clear()
      pendingGlowPromptTimeoutRef.current = null
      const now = Date.now()
      // Debug: inspect pause state when scheduled timeout fires
      // eslint-disable-next-line no-console
      console.log('scheduled glow firing', { now, glowPauseUntilRef: glowPauseUntilRef.current, glowPauseUntilState: glowPauseUntil })
      // Respect an explicit pause requested when roll results are still arriving
      if (glowPauseUntilRef.current !== null && glowPauseUntilRef.current > now) {
        nativeLog('d', 'skipping scheduled glow due to glowPauseUntil', { now, glowPauseUntil: glowPauseUntilRef.current })
        return
      }
      if (glowInFlightRef.current) {
        nativeLog('d', 'skipping scheduled glow while glow in-flight', { now, lastGlowAt: lastGlowAtRef.current, GLOW_DEDUP_MS })
        return
      }
      if (now - lastGlowAtRef.current < GLOW_DEDUP_MS) {
        nativeLog('d', 'skipping scheduled duplicate glow', { now, lastGlowAt: lastGlowAtRef.current, GLOW_DEDUP_MS, since: now - lastGlowAtRef.current })
        return
      }
      glowInFlightRef.current = true
      lastGlowAtRef.current = now
      nativeLog('i', 'performing scheduled glow', { sessionId: rollSession?.sessionId, pixelIdsToGlow })
      await executeGlowForPixels(pixelIdsToGlow, false)
      window.setTimeout(() => {
        glowInFlightRef.current = false
      }, GLOW_DEDUP_MS)
    }, FORMULA_ROLL_TRANSITION_DELAY_MS)
  }, [])

  const completeRollSession = useCallback(async (nextSession: RollSession) => {
    clearPendingGlowPrompt()
    // Cancel any mid-roll reconnect attempts when a roll completes
    try {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      cancelAllReconnectsDuringRoll()
    } catch {}
    setGlowPauseUntil(null)
    glowPauseUntilRef.current = null

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

    const slots = promoteRecoverableManualSlots(
      buildRollSlots(normalized.formulaText, connectedPixels),
      pairedPixels,
    )
    // Debug: print pairedPixels keys used when starting a roll
    // eslint-disable-next-line no-console
    console.log('handleRoll pairedPixels keys', Object.keys(pairedPixels))
    const nextSession: RollSession = {
      parsedFormula: parsed,
      slots,
      result: null,
      statusMessage: null,
      historyRecorded: false,
      sessionId: createRollSessionId(),
    }

    setManualInputs({})
    // When we perform the immediate initial glow below we want to avoid a
    // scheduled duplicate glow created by other effects that run after the
    // `rollSession` state update. Suppress scheduling of delayed glows for
    // the `FORMULA_ROLL_TRANSITION_DELAY_MS` window so only the immediate
    // glow is observed.
    suppressScheduledUntilRef.current = Date.now() + FORMULA_ROLL_TRANSITION_DELAY_MS
    setRollSession(nextSession)
    markAssignedPixelsUsed(slots)

    const pixelIdsToGlow = getGlowPixelIdsForSlots(slots, connectedPixels)

    const now = Date.now()
    if (glowInFlightRef.current) {
      nativeLog('d', 'skipping initial glow while glow in-flight', { now, lastGlowAt: lastGlowAtRef.current, GLOW_DEDUP_MS })
    } else if (now - lastGlowAtRef.current >= GLOW_DEDUP_MS) {
      glowInFlightRef.current = true
      lastGlowAtRef.current = now
      nativeLog('i', 'performing initial glow', { sessionId: rollSession?.sessionId, pixelIdsToGlow })
      await executeGlowForPixels(pixelIdsToGlow, nextSession.sessionId)
      window.setTimeout(() => {
        glowInFlightRef.current = false
      }, GLOW_DEDUP_MS)
    } else {
      nativeLog('d', 'skipping duplicate initial glow', { since: Date.now() - lastGlowAtRef.current })
    }
  }

  const handleCancelRoll = async () => {
    clearPendingGlowPrompt()
    setGlowPauseUntil(null)
    glowPauseUntilRef.current = null
    await stopAllGlows()
    // Cancel any queued reconnects when the roll is cancelled
    try {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      cancelAllReconnectsDuringRoll()
    } catch {}
    setManualInputs({})
    setRollSession(null)
  }

  const attemptPendingReconnects = useCallback(async () => {
    if (!rollSession || pendingReconnectInFlightRef.current) return

    const storeState = useAppStore.getState()
    const latestPixels = storeState.pixels
    const latestPaired = storeState.pairedPixels
    const latestConnectedPixels: ConnectedPixel[] = Object.values(latestPixels)
      .filter((p) => p.connectionState === 'connected')
      .map((p) => ({ pixelId: p.pixelId, dieType: p.dieType }))

    // Prefer the persisted initial connect candidates for this roll session
    // (these are the only dice we should ever attempt to connect for the
    // active roll). Fall back to a freshly computed plan if not yet set.
    let candidates = availabilityInitialConnectRef.current
    if (!candidates || candidates.length === 0) {
      const plan = buildAvailabilityPlan(rollSession.slots, latestConnectedPixels, latestPaired)
      candidates = plan.connectIds.slice()
      if (availabilityInitialConnectRef.current === null) {
        availabilityInitialConnectRef.current = candidates.slice()
        nativeLog('i', 'persisted initial connect candidates (deferred)', {
          sessionId: rollSession.sessionId,
          connectCandidates: availabilityInitialConnectRef.current,
        })
      }
    }

    const disconnectedCandidates = candidates.filter((id) => latestPixels[id]?.connectionState !== 'connected')
    if (disconnectedCandidates.length === 0) return

    pendingReconnectInFlightRef.current = true
    try {
      nativeLog('i', 'attempting reconnects for pending candidates', { sessionId: rollSession.sessionId, disconnectedCandidates })
      await Promise.allSettled(
        disconnectedCandidates.map((id) => connectRememberedDie(id, { suppressErrors: true })),
      )
    } finally {
      pendingReconnectInFlightRef.current = false
    }
  }, [rollSession])

  const handlePromptPendingDice = useCallback(async (force = false) => {
    const currentSession = rollSessionRef.current
    if (!currentSession || currentSession.result !== null) {
      return
    }

    // Debug: log when handler invoked during tests
    // eslint-disable-next-line no-console
    // eslint-disable-next-line no-console
    console.log('HPD start', {
      sessionId: currentSession.sessionId,
      force,
      now: Date.now(),
      lastGlowAt: lastGlowAtRef.current,
      glowInFlight: glowInFlightRef.current,
      glowPauseUntilState: glowPauseUntil,
      glowPauseUntilRef: glowPauseUntilRef.current,
    })

    const storeState = useAppStore.getState()
    const latestConnectedPixels: ConnectedPixel[] = Object.values(storeState.pixels)
      .filter((p) => p.connectionState === 'connected')
      .map((p) => ({ pixelId: p.pixelId, dieType: p.dieType }))

    const pixelIdsToGlow = getPendingGlowPixelIds(currentSession.slots, latestConnectedPixels)
    // Debug: inspect computed pixels to glow
    // eslint-disable-next-line no-console
    console.log('HPD pixelIdsToGlow', pixelIdsToGlow)
    if (pixelIdsToGlow.length === 0) {
      return
    }

    clearPendingGlowPrompt()
    const now = Date.now()
    if (glowInFlightRef.current && !force) {
      nativeLog('d', 'skipping prompt glow while glow in-flight', { now, lastGlowAt: lastGlowAtRef.current, GLOW_DEDUP_MS })
      // eslint-disable-next-line no-console
      console.log('HPD skip due to glowInFlight', { now, lastGlowAt: lastGlowAtRef.current })
    } else if (force || now - lastGlowAtRef.current >= GLOW_DEDUP_MS) {
      glowInFlightRef.current = true
      lastGlowAtRef.current = now
      nativeLog('i', 'performing prompt glow', { sessionId: currentSession?.sessionId, pixelIdsToGlow, force })
      // eslint-disable-next-line no-console
      console.log('HPD executing glow', { now, pixelIdsToGlow, force })
      await executeGlowForPixels(pixelIdsToGlow, force)
      window.setTimeout(() => {
        glowInFlightRef.current = false
      }, GLOW_DEDUP_MS)
    } else {
      nativeLog('d', 'skipping duplicate prompt glow', { since: Date.now() - lastGlowAtRef.current })
      // eslint-disable-next-line no-console
      console.log('HPD skip duplicate', { since: Date.now() - lastGlowAtRef.current })
    }

    // After completing a blink loop, attempt to reconnect any of the
    // remembered dice that are known to be needed for this roll session.
    // Only try the persisted initial candidates (or a freshly computed
    // plan if none were persisted yet) so we do not connect unrelated dice.
    void attemptPendingReconnects()
  }, [clearPendingGlowPrompt, rollSession, attemptPendingReconnects])

  const promptGlowForRoll = useCallback(async (rollId: string, force = false) => {
    const currentSession = rollSessionRef.current
    // eslint-disable-next-line no-console
    console.log('promptGlowForRoll invoked', { rollId, force, sessionId: currentSession?.sessionId })
    if (!currentSession || currentSession.result !== null) return

    const storeState = useAppStore.getState()
    const latestConnectedPixels: ConnectedPixel[] = Object.values(storeState.pixels)
      .filter((p) => p.connectionState === 'connected')
      .map((p) => ({ pixelId: p.pixelId, dieType: p.dieType }))

    let pixelIdsToGlow: string[] = []

    // If assignments were just re-computed due to a connected-pool change,
    // a user's click should re-glow all pending slots (the global pending
    // set) so the user sees the updated assignments. Otherwise, only the
    // targeted slot(s) are re-glowed.
    if (force && lastAssignReassignedChangedRef.current) {
      const pendingSlots = currentSession.slots.filter((s) => s.face === null && s.source === 'ble')
      // eslint-disable-next-line no-console
      console.log('promptGlowForRoll (global pending) targetSlots', { rollId, pendingSlots })
      pixelIdsToGlow = getGlowPixelIdsForSlots(pendingSlots, latestConnectedPixels)
    } else {
      const targetSlots = currentSession.slots.filter((slot) => {
        if (slot.logicalDieType === 'd100') {
          return slot.logicalId === rollId
        }

        return slot.id === rollId
      })

      // Debug: show which slots are targeted for this roll prompt
      // eslint-disable-next-line no-console
      console.log('promptGlowForRoll targetSlots', { rollId, targetSlots })

      const targetPendingSlots = targetSlots.filter((s) => s.face === null && s.source === 'ble')

      // If the user clicked a pending slot and there are multiple pending
      // slots of the same die type (a partial shared-die roll), glow the
      // remaining number needed across that die type rather than only the
      // single clicked slot. This ensures clicks in multi-slot groups glow
      // the expected number of dice.
      if (force && targetPendingSlots.length === 1) {
        const dieType = targetPendingSlots[0].dieType
        const sameTypePending = currentSession.slots.filter(
          (s) => s.face === null && s.source === 'ble' && s.dieType === dieType,
        )

        if (sameTypePending.length > 1) {
          // eslint-disable-next-line no-console
          console.log('promptGlowForRoll (same-type pending) targetSlots', { rollId, sameTypePending })
          pixelIdsToGlow = getGlowPixelIdsForSlots(sameTypePending, latestConnectedPixels)
        } else {
          pixelIdsToGlow = getGlowPixelIdsForSlots(targetPendingSlots, latestConnectedPixels)
        }
      } else {
        pixelIdsToGlow = getGlowPixelIdsForSlots(targetPendingSlots, latestConnectedPixels)
      }
    }
    // eslint-disable-next-line no-console
    console.log('promptGlowForRoll pixelIdsToGlow', { rollId, pixelIdsToGlow, latestConnectedPixels })
    if (pixelIdsToGlow.length === 0) return

    clearPendingGlowPrompt()

    const now = Date.now()
    if (glowInFlightRef.current && !force) {
      nativeLog('d', 'skipping prompt glow while glow in-flight (single roll)', { now, lastGlowAt: lastGlowAtRef.current, GLOW_DEDUP_MS })
    } else if (force || now - lastGlowAtRef.current >= GLOW_DEDUP_MS) {
      glowInFlightRef.current = true
      lastGlowAtRef.current = now
      nativeLog('i', 'performing prompt glow (single roll)', { sessionId: currentSession?.sessionId, rollId, pixelIdsToGlow, force })
      await executeGlowForPixels(pixelIdsToGlow, force)
      window.setTimeout(() => {
        glowInFlightRef.current = false
      }, GLOW_DEDUP_MS)
    } else {
      nativeLog('d', 'skipping duplicate prompt glow (single roll)', { since: Date.now() - lastGlowAtRef.current })
    }
  }, [clearPendingGlowPrompt, executeGlowForPixels])

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

        return nextSession
      })

      clearPendingGlowPrompt()
      const pauseUntil = Date.now() + ROLL_GLOW_REPEAT_MS
      setGlowPauseUntil(pauseUntil)
      glowPauseUntilRef.current = pauseUntil
    })
  }, [clearPendingGlowPrompt, isAwaitingRolls])

  useEffect(() => {
    if (!isAwaitingRolls || !rollSession || rollSession.result !== null) {
      return
    }

    // Reset persisted per-roll-session state when a new roll session is started
    // (identified by `sessionId`). This prevents slot-level mutations from
    // resetting the persisted disconnect/connect plan during retries.
    if (lastSyncRollSessionRef.current !== rollSession.sessionId) {
      availabilityInitialDisconnectRef.current = null
      availabilityInitialConnectRef.current = null
      availabilityConnectAttemptedRef.current = false
      lastSyncRollSessionRef.current = rollSession.sessionId ?? null
    }

    let cancelled = false

    const syncRememberedDice = async () => {
      if (availabilitySyncInFlightRef.current) {
        return
      }

      availabilitySyncInFlightRef.current = true

      try {
        const storeState = useAppStore.getState()
        const latestPixelsMap = storeState.pixels
        const latestPaired = storeState.pairedPixels
        const latestConnectedPixels: ConnectedPixel[] = Object.values(latestPixelsMap)
          .filter((p) => p.connectionState === 'connected')
          .map((p) => ({ pixelId: p.pixelId, dieType: p.dieType }))

        const plan = buildAvailabilityPlan(rollSession.slots, latestConnectedPixels, latestPaired)
        nativeLog('i', 'syncRememberedDice plan', { sessionId: rollSession.sessionId, plan })
        // Debug: emit plan details for failing tests investigation
        // eslint-disable-next-line no-console
        console.log('syncRememberedDice plan', {
          sessionId: rollSession.sessionId,
          plan,
          latestConnectedPixels,
          latestPairedKeys: Object.keys(latestPaired),
        })

        if (cancelled) return

        // Persist the initial connect/disconnect plans for this roll session so we
        // don't expand the disconnect list across subsequent retries.
        if (availabilityInitialConnectRef.current === null) {
          availabilityInitialConnectRef.current = plan.connectIds.slice()
          nativeLog('i', 'persisted initial connect candidates', {
            sessionId: rollSession.sessionId,
            connectCandidates: availabilityInitialConnectRef.current,
          })
        }

        if (availabilityInitialDisconnectRef.current === null) {
          availabilityInitialDisconnectRef.current = plan.disconnectIds.slice()
          nativeLog('i', 'persisted initial disconnect candidates', {
            sessionId: rollSession.sessionId,
            disconnectCandidates: availabilityInitialDisconnectRef.current,
          })
        }

        const connectCandidates = availabilityInitialConnectRef.current ?? []

        if (connectCandidates.length === 0) {
          const needsRecovery = rollSession.slots.some(
            (slot) => slot.face === null && slot.source === 'ble' && !latestConnectedPixels.some((pixel) => pixel.dieType === slot.dieType),
          )

          nativeLog('d', 'no connect candidates', {
            sessionId: rollSession.sessionId,
            needsRecovery,
            pendingSlots: rollSession.slots.filter((s) => s.face === null && s.source === 'ble').length,
          })

          if (needsRecovery && !cancelled) {
            setRollSession((current) => {
              if (!current || current.result !== null) return current
              if (current.statusMessage === 'Trying to reconnect remembered dice...') return current
              return {
                ...current,
                statusMessage: 'Trying to reconnect remembered dice...',
              }
            })
          }

          return
        }

          // Only attempt connects once per roll session — do NOT retry connects.
        if (!availabilityConnectAttemptedRef.current) {
          // If connecting the candidates would exceed our MAX_CONNECTED cap,
          // preemptively disconnect the minimal number of non-assigned, least-recently-used dice.
          const currentConnectedCount = latestConnectedPixels.length
          const totalNeeded = connectCandidates.length

          nativeLog('i', 'connect attempt decision', { sessionId: rollSession.sessionId, currentConnectedCount, totalNeeded, MAX_CONNECTED })

          // Decide how many unassigned connected dice we should free up for
          // the upcoming connect attempts. If we are already over the
          // `MAX_CONNECTED` cap we must disconnect the minimal number needed;
          // otherwise we may proactively disconnect up to the number of
          // `connectCandidates` if suitable unassigned candidates exist. This
          // helps ensure remembered dice of the required type can be
          // attempted even when the native stack prefers a limited candidate
          // set.
          {
            const needToDisconnect = Math.max(0, currentConnectedCount + totalNeeded - MAX_CONNECTED)

            const assignedPixelIds = new Set<string>(
              rollSession.slots.map((s) => s.pixelId).filter((id): id is string => id !== null),
            )

            const connectedByAge = [...latestConnectedPixels]
              .filter((p) => !assignedPixelIds.has(p.pixelId))
              .sort(
                (left, right) =>
                  (latestPaired[left.pixelId]?.lastUsedAt ?? 0) - (latestPaired[right.pixelId]?.lastUsedAt ?? 0),
              )

            const initialSet = new Set(availabilityInitialDisconnectRef.current ?? [])
            const prioritized = connectedByAge
              .filter((p) => initialSet.has(p.pixelId))
              .map((p) => p.pixelId)

            const availableUnassignedCount = connectedByAge.length
            // If we strictly need to disconnect (over cap) choose that number;
            // otherwise allow up to `totalNeeded` preemptive disconnects when
            // unassigned candidates exist.
            const allowedToDisconnect = Math.min(needToDisconnect > 0 ? needToDisconnect : totalNeeded, availableUnassignedCount)

            let toDisconnectForSpace = prioritized.slice(0, allowedToDisconnect)

            if (toDisconnectForSpace.length < allowedToDisconnect) {
              const remaining = connectedByAge.map((p) => p.pixelId).filter((id) => !toDisconnectForSpace.includes(id))
              toDisconnectForSpace = toDisconnectForSpace.concat(remaining.slice(0, allowedToDisconnect - toDisconnectForSpace.length))
            }

            // Persist the expanded disconnect candidates so retries won't keep
            // expanding the set.
            if ((availabilityInitialDisconnectRef.current?.length ?? 0) < toDisconnectForSpace.length) {
              availabilityInitialDisconnectRef.current = toDisconnectForSpace.slice()
              nativeLog('i', 'expanded and persisted initial disconnect candidates', {
                sessionId: rollSession.sessionId,
                disconnectCandidates: availabilityInitialDisconnectRef.current,
              })
            }

            if (toDisconnectForSpace.length > 0) {
              nativeLog('d', 'preemptive disconnect selection', {
                sessionId: rollSession.sessionId,
                needToDisconnect,
                allowedToDisconnect,
                toDisconnectForSpace,
              })

              nativeLog('i', 'performing preemptive disconnects', { sessionId: rollSession.sessionId, toDisconnectForSpace })
              const disconnectResults = await Promise.allSettled(
                toDisconnectForSpace.map((id) => disconnectDie(id, 'required-for-roll-disconnect')),
              )
              nativeLog('i', 'preemptive disconnect results', { sessionId: rollSession.sessionId, disconnectResults })

              // Wait briefly to allow the Android BLE stack to free resources
              // after disconnects before attempting new connects.
              const pauseMs = 350
              nativeLog('i', 'pausing after preemptive disconnects', { sessionId: rollSession.sessionId, pauseMs })
              await new Promise((resolve) => window.setTimeout(resolve, pauseMs))

              nativeLog('d', 'after preemptive disconnect pause', {
                sessionId: rollSession.sessionId,
                availabilityConnectAttempted: availabilityConnectAttemptedRef.current,
                connectCandidates,
              })
            }
          }

          // Attempt connects exactly once (no retries)
          nativeLog('d', 'about to mark availabilityConnectAttemptedRef true', {
            sessionId: rollSession.sessionId,
            before: availabilityConnectAttemptedRef.current,
            connectCandidatesLength: connectCandidates.length,
          })
          availabilityConnectAttemptedRef.current = true

          if (!cancelled && connectCandidates.length > 0) {
            nativeLog('i', 'attempting single-shot connects for candidates', { sessionId: rollSession.sessionId, connectCandidates })
            const connectResults = await Promise.allSettled(
              connectCandidates.map((id) => connectRememberedDie(id, { suppressErrors: true })),
            )
            nativeLog('i', 'single-shot connect results', { sessionId: rollSession.sessionId, connectResults })
          }

          if (!cancelled) {
            const latestPixels = useAppStore.getState().pixels
            const latestConnectedPixels: ConnectedPixel[] = Object.values(latestPixels)
              .filter((p) => p.connectionState === 'connected')
              .map((p) => ({ pixelId: p.pixelId, dieType: p.dieType }))

            const pendingGlowPixelIds = getPendingGlowPixelIds(rollSession.slots, latestConnectedPixels)
            if (!cancelled && pendingGlowPixelIds.length > 0) {
              scheduleGlowPrompt(pendingGlowPixelIds)
            }

            if (!cancelled) {
              setRollSession((current) => {
                if (!current || current.result !== null) return current
                if (current.statusMessage === 'Trying to reconnect remembered dice...') return current
                return {
                  ...current,
                  statusMessage: 'Trying to reconnect remembered dice...',
                }
              })
            }
          }
        } else {
          // Connects already attempted for this roll session — do not retry.
          if (!cancelled) {
            setRollSession((current) => {
              if (!current || current.result !== null) return current
              if (current.statusMessage === 'Trying to reconnect remembered dice...') return current
              return {
                ...current,
                statusMessage: 'Trying to reconnect remembered dice...',
              }
            })
          }
        }
      } finally {
        availabilitySyncInFlightRef.current = false
      }
    }

    void syncRememberedDice()

    const intervalId = window.setInterval(() => {
      void syncRememberedDice()
    }, REMEMBERED_DICE_RETRY_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isAwaitingRolls, rollSession, scheduleGlowPrompt])

  useEffect(() => {
    if (!isAwaitingRolls) {
      return
    }

    let pixelIdsToGlow: string[] = []

    setRollSession((current) => {
      if (!current || current.result !== null) {
        return current
      }

      const reassigned = assignPendingBlePixelIds(current.slots, connectedPixels)
      pixelIdsToGlow = getGlowPixelIdsForSlots(
        reassigned.slots.filter((slot) => slot.face === null && slot.source === 'ble'),
        connectedPixels,
      )
      // Debug: log reassignment results and pixelIds to glow
      // eslint-disable-next-line no-console
      console.log('assignPendingBlePixelIds result', { sessionId: current.sessionId, reassignedChanged: reassigned.changed, pixelIdsToGlow, connectedPixels })

      // Remember that assignments changed recently so prompt clicks can
      // trigger a global re-glow for all pending slots rather than the
      // single targeted slot. Clear the flag after a short grace period.
      lastAssignReassignedChangedRef.current = reassigned.changed
      if (reassigned.changed) {
        window.setTimeout(() => {
          lastAssignReassignedChangedRef.current = false
        }, FORMULA_ROLL_TRANSITION_DELAY_MS)
      }

      if (!reassigned.changed) {
        return current
      }

      return {
        ...current,
        slots: reassigned.slots,
      }
    })

    if (pixelIdsToGlow.length > 0) {
      scheduleGlowPrompt(pixelIdsToGlow)
    }
  }, [connectedPixels, isAwaitingRolls, scheduleGlowPrompt])

  useEffect(() => {
    if (!isAwaitingRolls || !rollSession || rollSession.result !== null) {
      return
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now()
      if (glowPauseUntil !== null && glowPauseUntil > now) {
        // Respect the pause; wait for the next tick or explicit resume
        return
      }

      const storeState = useAppStore.getState()
      const latestConnectedPixels: ConnectedPixel[] = Object.values(storeState.pixels)
        .filter((p) => p.connectionState === 'connected')
        .map((p) => ({ pixelId: p.pixelId, dieType: p.dieType }))

      const pendingGlowPixelIds = getPendingGlowPixelIds(rollSession.slots, latestConnectedPixels)
      if (pendingGlowPixelIds.length === 0) {
        return
      }

      void handlePromptPendingDice()
    }, ROLL_GLOW_REPEAT_MS)

    // If a pause is active, schedule an immediate resume when it expires so
    // we don't wait for the next interval tick.
    let resumeTimeout: number | null = null
    if (glowPauseUntil !== null && glowPauseUntil > Date.now()) {
      resumeTimeout = window.setTimeout(() => {
        setGlowPauseUntil(null)
        glowPauseUntilRef.current = null
        void handlePromptPendingDice()
      }, glowPauseUntil - Date.now())
    }

    return () => {
      window.clearInterval(intervalId)
      if (resumeTimeout !== null) window.clearTimeout(resumeTimeout)
    }
  }, [isAwaitingRolls, rollSession, glowPauseUntil, handlePromptPendingDice])

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

        if (hasRecoverableRememberedPixel(slot.dieType, pairedPixels)) {
          statusMessage = 'Trying to reconnect remembered dice...'
          return {
            ...slot,
            source: 'ble' as const,
            pixelId: null,
          }
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
  }, [completeRollSession, isAwaitingRolls, pairedPixels, pixels])

  // Detect when previously-connected pixels disconnect during an active
  // roll and enqueue bounded reconnect attempts for those remembered dice.
  useEffect(() => {
    if (!isAwaitingRolls || !rollSession) {
      // Keep prev snapshot in sync outside of rolls
      prevPixelsRef.current = Object.fromEntries(
        Object.entries(pixels).map(([id, p]) => [id, { connectionState: p.connectionState }]),
      )
      return
    }

    const prev = prevPixelsRef.current

    for (const [pixelId, pState] of Object.entries(pixels)) {
      const prevConn = prev[pixelId]?.connectionState ?? null
      const curConn = pState.connectionState

      if (prevConn === 'connected' && curConn === 'disconnected') {
        const paired = pairedPixels[pixelId]
        if (!paired) continue

        const needsThisDieType = rollSession.slots.some(
          (s) => s.face === null && s.source === 'ble' && s.dieType === paired.dieType,
        )

        if (needsThisDieType) {
          enqueueReconnectDuringRoll(pixelId, { maxAttempts: 6, intervalMs: REMEMBERED_DICE_RETRY_INTERVAL_MS })
        }
      }
    }

    prevPixelsRef.current = Object.fromEntries(
      Object.entries(pixels).map(([id, p]) => [id, { connectionState: p.connectionState }]),
    )
  }, [isAwaitingRolls, rollSession, pixels, pairedPixels])

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
                  onClick={roll.pending && isAwaitingRolls ? () => void promptGlowForRoll(roll.id, true) : undefined}
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

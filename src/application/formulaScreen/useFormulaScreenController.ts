import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate, useParams, type BlockerFunction } from 'react-router-dom'
import { evaluateFormula, parseFormula } from '../../services/formulaParser'
import {
  cancelAllReconnectsDuringRoll,
  connectRememberedDie,
  disconnectDie,
  enqueueReconnectDuringRoll,
  glowDie,
  onRollResult,
  stopAllGlows,
} from '../../services/pixelsService'
import { nativeLog } from '../../services/pixelsTransport'
import { useAppStore } from '../../stores/useAppStore'
import { displayDieType, createFormulaId, createRollHistoryEntry, createRollSessionId } from '../../pages/formulaHelpers'
import {
  assignPendingBlePixelIds,
  buildAvailabilityPlan,
  getGlowPixelIdsForSlots,
  getPendingGlowPixelIds,
  hasRecoverableRememberedPixel,
  markAssignedPixelsUsed,
  type ConnectedPixel,
} from '../../pages/availabilityHelpers'
import { buildFormulaFromState, normalizeFormulaState, toEvaluatedRolls, type FormulaBuilderState, type KeepMode } from '../rollHelpers'
import {
  FormulaScreenController,
  type DisplayedRollGroup,
  type FormulaScreenLocationState,
  type FormulaScreenMode,
  type NavigationIntent,
  type RollSession,
  type SnapshotState,
} from './FormulaScreenController'

const DISPLAY_DIE_ORDER = ['d100', 'd20', 'd12', 'd10', 'd8', 'd6', 'd4'] as const
const FORMULA_ROLL_TRANSITION_DELAY_MS = 1200
const ROLL_GLOW_REPEAT_MS = 2_000
const ROLL_GLOW_RESUME_DELAY_MS = 5_000
const ROLL_GLOW_SUPPRESS_WHILE_PENDING_MS = 24 * 60 * 60 * 1000
const REMEMBERED_DICE_RETRY_INTERVAL_MS = 2_000
const MAX_CONNECTED = 12

export function useFormulaScreenController(mode: FormulaScreenMode) {
  const controller = useMemo(() => new FormulaScreenController(), [])
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
    () => controller.getExistingFormula(savedFormulas, params.id),
    [controller, params.id, savedFormulas],
  )

  const [name, setName] = useState('')
  const [builderState, setBuilderState] = useState<FormulaBuilderState>(() => controller.buildInitialState(null, false, false).builderState)
  const [formulaText, setFormulaText] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [formulaError, setFormulaError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [navigationIntent, setNavigationIntent] = useState<NavigationIntent | null>(null)
  const [rollSession, setRollSession] = useState<RollSession | null>(null)
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({})
  const [glowPauseUntil, setGlowPauseUntil] = useState<number | null>(null)
  const [autoHideRemainingMs, setAutoHideRemainingMs] = useState<number | null>(null)
  const [rollOnlyAutoHideExpired, setRollOnlyAutoHideExpired] = useState(false)

  const initialSnapshotRef = useRef<SnapshotState>({ name: '', formulaText: '' })
  const skipBlockRef = useRef(false)
  const rollEngineRef = useRef<HTMLElement | null>(null)
  const hasAutoFocusedRollEngineRef = useRef(false)
  const hasAutoStartedRollRef = useRef(false)
  const pendingRollScrollRef = useRef(false)
  const pendingGlowPromptTimeoutRef = useRef<number | null>(null)
  const queuedGlowPixelIdsRef = useRef<Set<string>>(new Set())
  const pendingRollPixelsRef = useRef<Set<string>>(new Set())
  const lastGlowAtRef = useRef<number>(0)
  const GLOW_DEDUP_MS = FORMULA_ROLL_TRANSITION_DELAY_MS + 100
  const lastGlowByPixelRef = useRef<Map<string, number>>(new Map())
  const rollSessionRef = useRef<RollSession | null>(null)
  const glowInFlightRef = useRef(false)
  const lastAssignReassignedChangedRef = useRef(false)
  const suppressScheduledUntilRef = useRef<number | null>(null)
  const glowPauseUntilRef = useRef<number | null>(null)
  const availabilitySyncInFlightRef = useRef(false)
  const prevPixelsRef = useRef<Record<string, { connectionState?: string }>>({})
  const availabilityInitialDisconnectRef = useRef<string[] | null>(null)
  const availabilityInitialConnectRef = useRef<string[] | null>(null)
  const availabilityConnectAttemptedRef = useRef(false)
  const lastSyncRollSessionRef = useRef<string | null>(null)
  const pendingReconnectInFlightRef = useRef(false)

  const keepErrors = useMemo(() => controller.getKeepErrors(builderState), [builderState, controller])
  const firstKeepError = useMemo(
    () => (Object.values(keepErrors).find(Boolean) as string | undefined) ?? null,
    [keepErrors],
  )
  const keepDice = useMemo(() => controller.getKeepDice(builderState), [builderState, controller])
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
  const connectedPixels = useMemo(() => controller.getConnectedPixels(pixels), [controller, pixels])
  const isAwaitingRolls = rollSession !== null && rollSession.result === null && rollSession.slots.some((slot) => slot.face === null)
  const pendingManualSlots = useMemo(() => controller.getPendingManualSlots(rollSession), [controller, rollSession])
  const currentSequentialSlot = useMemo(() => controller.getCurrentSequentialSlot(rollSession), [controller, rollSession])
  const completedRollResult = rollSession?.result ?? null
  const statusMessage = rollSession?.statusMessage ?? null
  const displayedRollsByDieType = useMemo<DisplayedRollGroup[]>(() => controller.getDisplayedRollsByDieType(rollSession), [controller, rollSession])
  const showRollEngine = rollSession !== null || formulaText.trim() !== ''
  const hasRollSession = rollSession !== null
  const rollDisabled = formulaText.trim() === '' || firstKeepError !== null || isAwaitingRolls
  const manualInputErrors = useMemo(
    () => controller.getManualInputErrors(pendingManualSlots, manualInputs),
    [controller, manualInputs, pendingManualSlots],
  )
  const manualSubmitDisabled = useMemo(
    () => controller.isManualSubmitDisabled(pendingManualSlots, manualInputs, manualInputErrors),
    [controller, manualInputErrors, manualInputs, pendingManualSlots],
  )

  useEffect(() => {
    rollSessionRef.current = rollSession
  }, [rollSession])

  useEffect(() => {
    glowPauseUntilRef.current = glowPauseUntil
  }, [glowPauseUntil])

  useEffect(() => {
    const nextState = controller.buildInitialState(existingFormula, isEditing, isRollOnly)

    if (nextState.navigationIntent) {
      skipBlockRef.current = true
      setNavigationIntent(nextState.navigationIntent)
      return
    }

    initialSnapshotRef.current = nextState.initialSnapshot
    setName(nextState.initialSnapshot.name)
    setBuilderState(nextState.builderState)
    setFormulaText(nextState.formulaText)
    setNameError(null)
    setFormulaError(null)
    setShowDeleteDialog(false)
    setNavigationIntent(null)
    setRollSession(null)
    setManualInputs({})
    setRollOnlyAutoHideExpired(false)
    setIsReady(nextState.isReady)
  }, [controller, existingFormula, isEditing, isRollOnly])

  const clearPendingGlowPrompt = useCallback(() => {
    if (pendingGlowPromptTimeoutRef.current !== null) {
      window.clearTimeout(pendingGlowPromptTimeoutRef.current)
      pendingGlowPromptTimeoutRef.current = null
    }

    queuedGlowPixelIdsRef.current.clear()
  }, [])

  const executeGlowForPixels = useCallback(async (pixelIdsIterable: Iterable<string>, forceOrContext: boolean | string | null = false) => {
    const force = typeof forceOrContext === 'boolean' ? forceOrContext : false
    const now = Date.now()
    const pixelIds = Array.from(pixelIdsIterable)
    const toGlow = force
      ? pixelIds
      : pixelIds.filter((id) => {
          const last = lastGlowByPixelRef.current.get(id) ?? 0
          return now - last >= ROLL_GLOW_REPEAT_MS
        })

    if (toGlow.length === 0) {
      return
    }

    const per = pixelIds.map((id) => {
      const last = lastGlowByPixelRef.current.get(id) ?? null
      return { id, last, since: last === null ? null : now - last }
    })

    nativeLog('i', 'executeGlowForPixels', {
      pixelIds,
      toGlow,
      ROLL_GLOW_REPEAT_MS,
      per,
      force,
      ctx: typeof forceOrContext === 'string' ? forceOrContext : undefined,
    })

    for (const id of toGlow) {
      lastGlowByPixelRef.current.set(id, now)
    }

    await Promise.allSettled(toGlow.map((pixelId) => glowDie(pixelId)))
  }, [])

  const scheduleGlowPrompt = useCallback((pixelIds: Iterable<string>) => {
    const suppressUntil = suppressScheduledUntilRef.current
    if (suppressUntil !== null && Date.now() < suppressUntil) {
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
      nativeLog('i', 'performing scheduled glow', { sessionId: rollSessionRef.current?.sessionId, pixelIdsToGlow })
      await executeGlowForPixels(pixelIdsToGlow, false)
      window.setTimeout(() => {
        glowInFlightRef.current = false
      }, GLOW_DEDUP_MS)
    }, FORMULA_ROLL_TRANSITION_DELAY_MS)
  }, [executeGlowForPixels])

  const completeRollSession = useCallback(async (nextSession: RollSession) => {
    clearPendingGlowPrompt()
    try {
      cancelAllReconnectsDuringRoll()
    } catch {}

    const resumeUntil = Date.now() + ROLL_GLOW_RESUME_DELAY_MS
    setGlowPauseUntil(resumeUntil)
    glowPauseUntilRef.current = resumeUntil
    pendingRollPixelsRef.current.clear()

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

  const syncBuilderState = useCallback((nextState: FormulaBuilderState) => {
    setBuilderState(nextState)
    setFormulaText(buildFormulaFromState(nextState))
    setFormulaError(null)
    if (!isAwaitingRolls) {
      setRollSession(null)
      setManualInputs({})
    }
  }, [isAwaitingRolls])

  const handleCountChange = useCallback((dieType: typeof DISPLAY_DIE_ORDER[number], delta: number) => {
    syncBuilderState(controller.updateCount(builderState, dieType, delta))
  }, [builderState, controller, syncBuilderState])

  const handleKeepModeChange = useCallback((dieType: typeof DISPLAY_DIE_ORDER[number], mode: KeepMode) => {
    syncBuilderState(controller.updateKeepMode(builderState, dieType, mode))
  }, [builderState, controller, syncBuilderState])

  const handleKeepValueChange = useCallback((dieType: typeof DISPLAY_DIE_ORDER[number], value: string) => {
    syncBuilderState(controller.updateKeepValue(builderState, dieType, value))
  }, [builderState, controller, syncBuilderState])

  const handleKeepPreset = useCallback((dieType: typeof DISPLAY_DIE_ORDER[number], mode: KeepMode) => {
    syncBuilderState(controller.applyKeepPreset(builderState, dieType, mode))
  }, [builderState, controller, syncBuilderState])

  const handleFlatModifierChange = useCallback((value: string) => {
    const nextState = controller.updateFlatModifier(builderState, value)
    if (!nextState) {
      return
    }
    syncBuilderState(nextState)
  }, [builderState, controller, syncBuilderState])

  const handleFormulaBlur = useCallback(() => {
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
  }, [formulaText, isAwaitingRolls])

  const handleRoll = useCallback(async () => {
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

    const nextSessionId = createRollSessionId()
    const nextRoll = controller.buildPendingRollSession(
      normalized.formulaText,
      parsed,
      connectedPixels,
      pairedPixels,
      nextSessionId,
    )

    setManualInputs({})
    suppressScheduledUntilRef.current = Date.now() + FORMULA_ROLL_TRANSITION_DELAY_MS
    setRollSession(nextRoll.session)
    markAssignedPixelsUsed(nextRoll.session.slots)
    pendingRollPixelsRef.current = new Set(nextRoll.pixelIdsToGlow)

    const now = Date.now()
    if (glowInFlightRef.current) {
      nativeLog('d', 'skipping initial glow while glow in-flight', { now, lastGlowAt: lastGlowAtRef.current, GLOW_DEDUP_MS })
    } else if (now - lastGlowAtRef.current >= GLOW_DEDUP_MS) {
      glowInFlightRef.current = true
      lastGlowAtRef.current = now
      nativeLog('i', 'performing initial glow', { sessionId: nextRoll.session.sessionId, pixelIdsToGlow: nextRoll.pixelIdsToGlow })
      await executeGlowForPixels(nextRoll.pixelIdsToGlow, nextRoll.session.sessionId)
      window.setTimeout(() => {
        glowInFlightRef.current = false
      }, GLOW_DEDUP_MS)
    } else {
      nativeLog('d', 'skipping duplicate initial glow', { since: Date.now() - lastGlowAtRef.current })
    }
  }, [clearPendingGlowPrompt, connectedPixels, controller, executeGlowForPixels, formulaText, pairedPixels])

  const handleCancelRoll = useCallback(async () => {
    clearPendingGlowPrompt()
    pendingRollPixelsRef.current.clear()
    setGlowPauseUntil(null)
    glowPauseUntilRef.current = null
    await stopAllGlows()
    try {
      cancelAllReconnectsDuringRoll()
    } catch {}
    setManualInputs({})
    setRollSession(null)
  }, [clearPendingGlowPrompt])

  const attemptPendingReconnects = useCallback(async () => {
    if (!rollSessionRef.current || pendingReconnectInFlightRef.current) return

    const storeState = useAppStore.getState()
    const latestPixels = storeState.pixels
    const latestPaired = storeState.pairedPixels
    const latestConnectedPixels: ConnectedPixel[] = Object.values(latestPixels)
      .filter((p) => p.connectionState === 'connected')
      .map((p) => ({ pixelId: p.pixelId, dieType: p.dieType }))

    let candidates = availabilityInitialConnectRef.current
    if (!candidates || candidates.length === 0) {
      const plan = buildAvailabilityPlan(rollSessionRef.current.slots, latestConnectedPixels, latestPaired)
      candidates = plan.connectIds.slice()
      if (availabilityInitialConnectRef.current === null) {
        availabilityInitialConnectRef.current = candidates.slice()
      }
    }

    const disconnectedCandidates = candidates.filter((id) => latestPixels[id]?.connectionState !== 'connected')
    if (disconnectedCandidates.length === 0) return

    pendingReconnectInFlightRef.current = true
    try {
      await Promise.allSettled(
        disconnectedCandidates.map((id) => connectRememberedDie(id, { suppressErrors: true })),
      )
    } finally {
      pendingReconnectInFlightRef.current = false
    }
  }, [])

  const handlePromptPendingDice = useCallback(async (force = false) => {
    const currentSession = rollSessionRef.current
    if (!currentSession || currentSession.result !== null) {
      return
    }

    const storeState = useAppStore.getState()
    const latestConnectedPixels: ConnectedPixel[] = Object.values(storeState.pixels)
      .filter((p) => p.connectionState === 'connected')
      .map((p) => ({ pixelId: p.pixelId, dieType: p.dieType }))

    const pixelIdsToGlow = getPendingGlowPixelIds(currentSession.slots, latestConnectedPixels)
    if (pixelIdsToGlow.length === 0) {
      return
    }

    clearPendingGlowPrompt()
    const now = Date.now()
    if (glowInFlightRef.current && !force) {
      nativeLog('d', 'skipping prompt glow while glow in-flight', { now, lastGlowAt: lastGlowAtRef.current, GLOW_DEDUP_MS })
    } else if (force || now - lastGlowAtRef.current >= GLOW_DEDUP_MS) {
      glowInFlightRef.current = true
      lastGlowAtRef.current = now
      nativeLog('i', 'performing prompt glow', { sessionId: currentSession?.sessionId, pixelIdsToGlow, force })
      await executeGlowForPixels(pixelIdsToGlow, force)
      window.setTimeout(() => {
        glowInFlightRef.current = false
      }, GLOW_DEDUP_MS)
    } else {
      nativeLog('d', 'skipping duplicate prompt glow', { since: Date.now() - lastGlowAtRef.current })
    }

    void attemptPendingReconnects()
  }, [attemptPendingReconnects, clearPendingGlowPrompt, executeGlowForPixels])

  const promptGlowForRoll = useCallback(async (rollId: string, force = false) => {
    const currentSession = rollSessionRef.current
    if (!currentSession || currentSession.result !== null) return

    const storeState = useAppStore.getState()
    const latestConnectedPixels: ConnectedPixel[] = Object.values(storeState.pixels)
      .filter((p) => p.connectionState === 'connected')
      .map((p) => ({ pixelId: p.pixelId, dieType: p.dieType }))

    let pixelIdsToGlow: string[] = []

    if (force && lastAssignReassignedChangedRef.current) {
      const pendingSlots = currentSession.slots.filter((s) => s.face === null && s.source === 'ble')
      pixelIdsToGlow = getGlowPixelIdsForSlots(pendingSlots, latestConnectedPixels)
    } else {
      const targetSlots = currentSession.slots.filter((slot) => {
        if (slot.logicalDieType === 'd100') {
          return slot.logicalId === rollId
        }

        return slot.id === rollId
      })

      const targetPendingSlots = targetSlots.filter((s) => s.face === null && s.source === 'ble')

      if (force && targetPendingSlots.length === 1) {
        const dieType = targetPendingSlots[0].dieType
        const sameTypePending = currentSession.slots.filter(
          (s) => s.face === null && s.source === 'ble' && s.dieType === dieType,
        )

        if (sameTypePending.length > 1) {
          pixelIdsToGlow = getGlowPixelIdsForSlots(sameTypePending, latestConnectedPixels)
        } else {
          pixelIdsToGlow = getGlowPixelIdsForSlots(targetPendingSlots, latestConnectedPixels)
        }
      } else {
        pixelIdsToGlow = getGlowPixelIdsForSlots(targetPendingSlots, latestConnectedPixels)
      }
    }

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

  const handleManualInputChange = useCallback((slotId: string, value: string) => {
    setManualInputs((current) => ({
      ...current,
      [slotId]: value.replace(/\D/g, ''),
    }))
  }, [])

  const handleSubmitManualRolls = useCallback(async () => {
    if (!rollSession || manualSubmitDisabled) {
      return
    }

    setRollSession(controller.applyManualInputs(rollSession, manualInputs))
  }, [controller, manualInputs, manualSubmitDisabled, rollSession])

  const handleSave = useCallback(() => {
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
  }, [addSavedFormula, existingFormula, firstKeepError, formulaText, isEditing, name, updateSavedFormula])

  const handleDelete = useCallback(() => {
    if (!existingFormula) {
      return
    }

    deleteSavedFormula(existingFormula.id)
    skipBlockRef.current = true
    setNavigationIntent({ message: 'Formula deleted' })
  }, [deleteSavedFormula, existingFormula])

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
  }, [completedRollResult, formulaText, handleRoll, isReady, isRollOnly, rollSession])

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
    return onRollResult((pixelId, face, dieType) => {
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

        return {
          ...current,
          slots: nextSlots,
          statusMessage: null,
        }
      })

      clearPendingGlowPrompt()
      if (pendingRollPixelsRef.current.has(pixelId)) {
        pendingRollPixelsRef.current.delete(pixelId)
      }
      const pendingIds = Array.from(pendingRollPixelsRef.current)
      const storeState = useAppStore.getState()
      const anyRolling = pendingIds.some((id) => storeState.pixels[id]?.isRolling === true)

      if (!anyRolling) {
        const resumeUntil = Date.now() + ROLL_GLOW_RESUME_DELAY_MS
        setGlowPauseUntil(resumeUntil)
        glowPauseUntilRef.current = resumeUntil
      } else {
        const suppressUntil = Date.now() + ROLL_GLOW_SUPPRESS_WHILE_PENDING_MS
        setGlowPauseUntil(suppressUntil)
        glowPauseUntilRef.current = suppressUntil
      }
    })
  }, [clearPendingGlowPrompt, isAwaitingRolls])

  useEffect(() => {
    if (pendingRollPixelsRef.current.size === 0) return
    const pendingIds = Array.from(pendingRollPixelsRef.current)
    const anyRolling = pendingIds.some((id) => pixels[id]?.isRolling === true)
    if (anyRolling) {
      const suppressUntil = Date.now() + ROLL_GLOW_SUPPRESS_WHILE_PENDING_MS
      setGlowPauseUntil(suppressUntil)
      glowPauseUntilRef.current = suppressUntil
    } else {
      const resumeUntil = Date.now() + ROLL_GLOW_RESUME_DELAY_MS
      setGlowPauseUntil(resumeUntil)
      glowPauseUntilRef.current = resumeUntil
    }
  }, [pixels])

  useEffect(() => {
    if (!isAwaitingRolls || !rollSession || rollSession.result !== null) {
      return
    }

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

        if (cancelled) return

        if (availabilityInitialConnectRef.current === null) {
          availabilityInitialConnectRef.current = plan.connectIds.slice()
        }

        if (availabilityInitialDisconnectRef.current === null) {
          availabilityInitialDisconnectRef.current = plan.disconnectIds.slice()
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

        if (!availabilityConnectAttemptedRef.current) {
          const currentConnectedCount = latestConnectedPixels.length
          const totalNeeded = connectCandidates.length

          nativeLog('i', 'connect attempt decision', { sessionId: rollSession.sessionId, currentConnectedCount, totalNeeded, MAX_CONNECTED })

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
            const allowedToDisconnect = Math.min(needToDisconnect > 0 ? needToDisconnect : totalNeeded, availableUnassignedCount)

            let toDisconnectForSpace = prioritized.slice(0, allowedToDisconnect)

            if (toDisconnectForSpace.length < allowedToDisconnect) {
              const remaining = connectedByAge.map((p) => p.pixelId).filter((id) => !toDisconnectForSpace.includes(id))
              toDisconnectForSpace = toDisconnectForSpace.concat(remaining.slice(0, allowedToDisconnect - toDisconnectForSpace.length))
            }

            if ((availabilityInitialDisconnectRef.current?.length ?? 0) < toDisconnectForSpace.length) {
              availabilityInitialDisconnectRef.current = toDisconnectForSpace.slice()
            }

            if (toDisconnectForSpace.length > 0) {
              const disconnectResults = await Promise.allSettled(
                toDisconnectForSpace.map((id) => disconnectDie(id, 'required-for-roll-disconnect')),
              )
              nativeLog('i', 'preemptive disconnect results', { sessionId: rollSession.sessionId, disconnectResults })

              const pauseMs = 350
              await new Promise((resolve) => window.setTimeout(resolve, pauseMs))
            }
          }

          availabilityConnectAttemptedRef.current = true

          if (!cancelled && connectCandidates.length > 0) {
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
        } else if (!cancelled) {
          setRollSession((current) => {
            if (!current || current.result !== null) return current
            if (current.statusMessage === 'Trying to reconnect remembered dice...') return current
            return {
              ...current,
              statusMessage: 'Trying to reconnect remembered dice...',
            }
          })
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
  }, [glowPauseUntil, handlePromptPendingDice, isAwaitingRolls, rollSession])

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

      return {
        ...current,
        slots: nextSlots,
        statusMessage,
      }
    })
  }, [isAwaitingRolls, pairedPixels, pixels])

  useEffect(() => {
    if (!isAwaitingRolls || !rollSession) {
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
  }, [isAwaitingRolls, pairedPixels, pixels, rollSession])

  return {
    autoHideRemainingMs,
    blocker,
    builderState,
    completedRollResult,
    currentSequentialSlot,
    displayedRollsByDieType,
    existingFormula,
    firstKeepError,
    formulaText,
    formulaError,
    hasRollSession,
    isAwaitingRolls,
    isEditing,
    isReady,
    isRollOnly,
    keepDice,
    keepErrors,
    manualInputErrors,
    manualInputs,
    manualSubmitDisabled,
    name,
    nameError,
    navigationIntent,
    pendingManualSlots,
    rollDisabled,
    rollEngineRef,
    rollOnlyAutoHideExpired,
    showDeleteDialog,
    showRollEngine,
    statusMessage,
    displayDieOrder: DISPLAY_DIE_ORDER,
    openDeleteDialog: () => setShowDeleteDialog(true),
    closeDeleteDialog: () => setShowDeleteDialog(false),
    navigateHome: () => navigate('/', { replace: true }),
    handleCountChange,
    handleKeepModeChange,
    handleKeepPreset,
    handleKeepValueChange,
    handleFlatModifierChange,
    handleFormulaBlur,
    handleFormulaTextChange: (value: string) => {
      setFormulaText(value)
      setFormulaError(null)
      setRollSession(null)
    },
    handleNameChange: (value: string) => {
      setName(value)
      setNameError(null)
      setRollSession(null)
    },
    handleDelete,
    handleRoll,
    handleCancelRoll,
    handleSave,
    handleManualInputChange,
    handleSubmitManualRolls,
    promptGlowForRoll: (rollId: string) => promptGlowForRoll(rollId, true),
  }
}
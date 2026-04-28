import {
  AnimConstants,
  AnimationGradient,
  AnimationSequence,
  DataSet,
  DiceUtils,
  RgbKeyframe,
  RgbTrack,
  getFaceMask,
} from '@systemic-games/pixels-core-animation'
import { Color } from '@systemic-games/pixels-web-connect'
import {
  getBleAvailability,
  getBluetoothCapabilities,
  getPixel,
  requestPixels,
  repeatConnect,
  type PixelsBleAvailability,
  type Pixel,
  type PixelStatusEvent,
  nativeLog,
} from './pixelsTransport'
import type { DieType } from '../types/formula'
import { useAppStore } from '../stores/useAppStore'

const ROLL_DEDUP_MS = 300
const CONNECTED_GLOW_COLOR: GlowColor = { r: 34, g: 197, b: 94 }
const CLEANUP_BASE_GLOW_COLOR: GlowColor = { r: 48, g: 48, b: 48 }
const CLEANUP_ANIMATION_DURATION_MS = 10_000
const MULTI_CONNECT_BATCH_SIZE = 6
const MULTI_CONNECT_BATCH_DELAY_MS = 150
// const BATTERY_HIGHLIGHT_DEFAULT_HOLD_MS = 20_000 (replaced by permanent mode)
const BATTERY_HIGHLIGHT_PERMANENT_MS = 24 * 60 * 60 * 1000 // 24 hours, used to approximate "permanent"
const BATTERY_HIGHLIGHT_YELLOW: GlowColor = { r: 250, g: 204, b: 21 }
const BATTERY_HIGHLIGHT_RED: GlowColor = { r: 239, g: 68, b: 68 }
const PERMISSION_DENIED_MESSAGE = "Bluetooth permission denied. Tap 'Connect' to try again."
const NO_PAIRED_DICE_MESSAGE = 'No paired dice available. Connect a die first.'
const NO_RECONNECTABLE_DICE_MESSAGE = 'No paired dice were available to reconnect.'
const SILENT_RECONNECT_UNAVAILABLE_MESSAGE = "Automatic reconnect is unavailable in this build. Tap 'Reconnect paired dice' or 'Connect new die' to select the die again."
const BLUETOOTH_DISABLED_MESSAGE = 'Bluetooth is turned off. Enable it and try again.'

export const BLE_UNAVAILABLE_MESSAGES = {
  unavailable: 'Bluetooth is unavailable on this build. Run the app on a supported Android device.',
  nativeBridgeMissing: 'Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.',
} as const

let cachedBleUnavailableMessage: string | null = null

export type Unsubscribe = () => void
export interface ReconnectOptions {
  allowPromptFallback?: boolean
  suppressFailureError?: boolean
}

export interface ConnectRememberedDieOptions {
  suppressErrors?: boolean
}

export interface ConnectRememberedDiceOptions extends ConnectRememberedDieOptions {
  continueOnError?: boolean
}

export interface GlowColor {
  r: number
  g: number
  b: number
}

interface GlowOptions {
  color?: GlowColor
  faceMask?: number
}

interface CleanupGlowOptions {
  baseColor?: GlowColor
  // Semantic option names: prefer `topFaceColor` / `bottomFaceColor`.
  topFaceColor?: GlowColor
  bottomFaceColor?: GlowColor
  // Backwards-compatibility aliases (kept for callers still using old names).
  lowFaceColor?: GlowColor
  highFaceColor?: GlowColor
}

type AppStore = Pick<typeof useAppStore, 'getState' | 'setState'>
type RollResultCallback = (pixelId: string, face: number, dieType: DieType) => void
type BleCapabilityProbe = {
  bluetooth?: unknown
}
type BleRuntimeProbe = {
  isNativeAndroid: boolean
  hasNativeBridge: boolean
}

type CapacitorLike = {
  getPlatform?: () => string
  isNativePlatform?: () => boolean
  isPluginAvailable?: (pluginName: string) => boolean
}

function getBleRuntimeProbe(): BleRuntimeProbe {
  const capacitor = (globalThis as typeof globalThis & { Capacitor?: CapacitorLike }).Capacitor
  const isNativeAndroid = capacitor?.isNativePlatform?.() === true && capacitor.getPlatform?.() === 'android'
  const hasNativeBridge = isNativeAndroid && capacitor?.isPluginAvailable?.('PixelsBle') === true

  return {
    isNativeAndroid,
    hasNativeBridge,
  }
}

function mapPixelDieType(dieType: string): DieType | null {
  switch (dieType) {
    case 'd4':
    case 'd6':
    case 'd8':
    case 'd10':
    case 'd12':
    case 'd20':
      return dieType
    case 'd00':
      return 'd100'
    case 'd6pipped':
      return 'd6'
    default:
      return null
  }
}

function getPixelId(pixel: Pixel): string {
  return pixel.systemId
}

function toBlinkColor(color?: GlowColor): Color {
  if (!color) {
    return Color.white
  }

  return Color.fromBytes(color.r, color.g, color.b)
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function getBleUnavailableMessage(
  probe: BleCapabilityProbe = navigator as BleCapabilityProbe,
  runtime: BleRuntimeProbe = getBleRuntimeProbe(),
): string | null {
  if (cachedBleUnavailableMessage) {
    return cachedBleUnavailableMessage
  }

  if (hasBleSupport(probe, runtime)) {
    return null
  }

  return runtime.isNativeAndroid && !runtime.hasNativeBridge
    ? BLE_UNAVAILABLE_MESSAGES.nativeBridgeMissing
    : BLE_UNAVAILABLE_MESSAGES.unavailable
}

export function hasBleSupport(
  probe: BleCapabilityProbe = navigator as BleCapabilityProbe,
  runtime: BleRuntimeProbe = getBleRuntimeProbe(),
): boolean {
  if (runtime.isNativeAndroid) {
    return runtime.hasNativeBridge
  }

  return 'bluetooth' in probe && probe.bluetooth !== undefined
}

function isPermissionDeniedError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'NotAllowedError' || error.name === 'NotFoundError'
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('permission') || message.includes('requestdevice') || message.includes('chooser')
  }

  return false
}

function toErrorMessage(error: unknown): string {
  if (isPermissionDeniedError(error)) {
    return PERMISSION_DENIED_MESSAGE
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Bluetooth connection failed. Tap \'Connect\' to try again.'
}

export class PixelsService {
  private readonly store: AppStore
  private readonly pixels = new Map<string, Pixel>()
  private readonly cleanups = new Map<string, Unsubscribe[]>()
  private readonly rollCallbacks = new Set<RollResultCallback>()
  private readonly lastRollAt = new Map<string, number>()
  private readonly cleanupAnimationHashes = new Map<string, number>()
  private batteryHighlightController: AbortController | null = null

  constructor(store: AppStore = useAppStore) {
    this.store = store
  }

  async initializeBleSupport(
    probe: BleCapabilityProbe = navigator as BleCapabilityProbe,
    runtime: BleRuntimeProbe = getBleRuntimeProbe(),
    availability?: PixelsBleAvailability,
  ): Promise<void> {
    const resolvedAvailability = availability ?? await getBleAvailability()
    const bleAvailable = hasBleSupport(probe, runtime) && resolvedAvailability.available

    cachedBleUnavailableMessage = bleAvailable
      ? null
      : resolvedAvailability.permissionsGranted
        ? resolvedAvailability.bluetoothEnabled
          ? getBleUnavailableMessage(probe, runtime)
          : BLUETOOTH_DISABLED_MESSAGE
        : PERMISSION_DENIED_MESSAGE

    this.store.setState({
      bleAvailable,
      bleError: !resolvedAvailability.permissionsGranted ? PERMISSION_DENIED_MESSAGE : null,
    })
  }

  async connectDie(): Promise<void> {
    this.store.getState().clearBleError()

    if (!hasBleSupport()) {
      this.store.setState({ bleAvailable: false })
      return
    }

    try {
      const pixels = await requestPixels()
      await this.connectPixelsInBatches(pixels, 'user-initiated-connect')
    } catch (error) {
      this.store.getState().setBleError(toErrorMessage(error))
    }
  }

  async reconnectPairedDice(options: ReconnectOptions = {}): Promise<void> {
    this.store.getState().clearBleError()

    if (!hasBleSupport()) {
      this.store.setState({ bleAvailable: false })
      return
    }

    const pairedPixelIds = this.store.getState().pairedPixelIds
    if (pairedPixelIds.length === 0) {
      this.store.getState().setBleError(NO_PAIRED_DICE_MESSAGE)
      return
    }

    const { allowPromptFallback = false, suppressFailureError = false } = options
    const capabilities = getBluetoothCapabilities()

    const reconnectResults = await this.connectRememberedDice(pairedPixelIds, {
      suppressErrors: true,
      continueOnError: true,
    })
    const reconnectedCount = reconnectResults.filter(Boolean).length

    if (reconnectedCount === 0) {
      if (allowPromptFallback && !capabilities.persistentPermissions) {
        try {
          const pixels = await requestPixels()
          await this.connectPixelsInBatches(pixels, 'reconnect-fallback-picker')
          return
        } catch (error) {
          if (!suppressFailureError) {
            this.store.getState().setBleError(toErrorMessage(error))
          }
          return
        }
      }

      if (!suppressFailureError) {
        this.store.getState().setBleError(
          capabilities.persistentPermissions
            ? NO_RECONNECTABLE_DICE_MESSAGE
            : SILENT_RECONNECT_UNAVAILABLE_MESSAGE,
        )
      }
    }
  }

  async disconnectDie(pixelId: string, reason?: string): Promise<void> {
    const pixel = this.pixels.get(pixelId)

    try {
      nativeLog('i', 'PixelsService.disconnectDie requested for', pixelId, { reason })
      await pixel?.disconnect()
      nativeLog('i', 'PixelsService.disconnectDie completed for', pixelId, { reason })
    } catch {
      // Disconnect should leave the local service state clean even if the SDK throws.
      nativeLog('w', 'PixelsService.disconnectDie error for', pixelId, { reason })
    } finally {
      this.cleanupPixel(pixelId)
      this.store.getState().updatePixelState(pixelId, { connectionState: 'disconnected' })
    }
  }

  async disconnectDice(pixelIds: string[], reason?: string): Promise<void> {
    await this.runInBatches(pixelIds, (pixelId) => this.disconnectDie(pixelId, reason))
  }

  async forgetDie(pixelId: string): Promise<void> {
    await this.disconnectDie(pixelId, 'forget-die')
    this.store.getState().forgetPairedPixelId(pixelId)
    this.store.getState().removePixel(pixelId)
  }

  async connectRememberedDie(pixelId: string, options: ConnectRememberedDieOptions = {}): Promise<boolean> {
    try {
      const pixel = await getPixel(pixelId)
      if (!pixel) {
        return false
      }

      return await this.connectRegisteredPixel(pixel, 'reconnect-remembered')
    } catch (error) {
      if (!options.suppressErrors) {
        this.store.getState().setBleError(toErrorMessage(error))
      }

      return false
    }
  }

  async connectRememberedDice(
    pixelIds: string[],
    options: ConnectRememberedDiceOptions = {},
    reason?: string,
  ): Promise<boolean[]> {
    return this.runInBatches(pixelIds, async (pixelId) => {
      try {
        const pixel = await getPixel(pixelId)
        if (!pixel) {
          return false
        }

        return await this.connectRegisteredPixel(pixel, reason ?? 'reconnect-remembered-batch')
      } catch (error) {
        if (!options.suppressErrors) {
          this.store.getState().setBleError(toErrorMessage(error))
        }

        if (!options.continueOnError) {
          throw error
        }

        return false
      }
    })
  }

  markPixelUsed(pixelId: string, usedAt = Date.now()): void {
    this.store.getState().markPairedPixelUsed(pixelId, usedAt)
  }

  onRollResult(callback: RollResultCallback): Unsubscribe {
    this.rollCallbacks.add(callback)

    return () => {
      this.rollCallbacks.delete(callback)
    }
  }

  async glowDie(pixelId: string, color?: GlowColor): Promise<void> {
    const pixel = this.pixels.get(pixelId)
    if (!pixel) {
      return
    }

    await this.blinkPixel(pixel, { color })
  }

  async glowDieFace(pixelId: string, face: number, color?: GlowColor): Promise<void> {
    const pixel = this.pixels.get(pixelId)
    if (!pixel) {
      return
    }

    const faceMask = this.getFaceMaskForPixel(pixel, face)
    if (faceMask === null) {
      return
    }

    await this.blinkPixel(pixel, { color, faceMask })
  }

  async glowDieLowestFace(pixelId: string, color?: GlowColor): Promise<void> {
    const pixel = this.pixels.get(pixelId)
    if (!pixel) {
      return
    }

    await this.glowDieFace(pixelId, DiceUtils.getLowestFace(pixel.dieType), color)
  }

  async glowDieHighestFace(pixelId: string, color?: GlowColor): Promise<void> {
    const pixel = this.pixels.get(pixelId)
    if (!pixel) {
      return
    }

    await this.glowDieFace(pixelId, DiceUtils.getHighestFace(pixel.dieType), color)
  }

  async glowCleanupOrientation(pixelId: string, options: CleanupGlowOptions = {}): Promise<void> {
    const pixel = this.pixels.get(pixelId)
    if (!pixel) {
      return
    }

    const dataSet = this.createCleanupAnimationDataSet(pixel, options)
    if (!dataSet) {
      return
    }

    const animationHash = DataSet.computeHash(dataSet.toAnimationsByteArray())
    if (this.cleanupAnimationHashes.get(pixelId) !== animationHash) {
      await pixel.transferInstantAnimations(dataSet)
      this.cleanupAnimationHashes.set(pixelId, animationHash)
    }

    await pixel.playInstantAnimation(3)
  }

  async stopGlow(pixelId: string): Promise<void> {
    const pixel = this.pixels.get(pixelId)
    if (!pixel) {
      return
    }

    await pixel.stopAllAnimations()
  }

  async stopAllGlows(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.pixels.keys(), (pixelId) => this.stopGlow(pixelId)),
    )
  }

  public startBatteryHighlightCycle(options?: { holdMs?: number; singleRun?: boolean; refreshMs?: number }) {
    const singleRun = !!options?.singleRun
    const pauseMs = 5000 // wait 5s between cycles as requested

    if (this.batteryHighlightController) {
      return {
        stop: () => {
          this.batteryHighlightController?.abort()
          void this.stopAllGlows()
        },
      }
    }

    const controller = new AbortController()
    this.batteryHighlightController = controller

    const runCycle = async () => {
      try {
        while (!controller.signal.aborted) {
          const pairedIds = this.store.getState().pairedPixelIds
          if (!pairedIds || pairedIds.length === 0) {
            return
          }

          // Track which dice we've connected/seen in this cycle so we don't re-check them
          const seenThisCycle = new Set<string>()

          // 1) Attempt to connect any die not currently connected in parallel (batched)
          const toEnsureConnected = pairedIds.filter((id) => !this.pixels.has(id))
          if (toEnsureConnected.length > 0) {
            try {
              await this.connectRememberedDice(toEnsureConnected, { suppressErrors: true, continueOnError: true }, 'battery-highlight-ensure-connected')
            } catch {
              // best-effort
            }
          }

          // 2) Read battery for all paired dice and collect actions in parallel
          const readPromises = pairedIds.map(async (pixelId) => {
            if (controller.signal.aborted) return null

            // mark as seen (we attempted to read it)
            seenThisCycle.add(pixelId)

            // Prefer persisted store value, fall back to SDK value
            let battery = this.store.getState().pixels[pixelId]?.batteryLevel
            const sdkPixel = this.pixels.get(pixelId)
            if ((battery === null || battery === undefined) && sdkPixel && Number.isFinite((sdkPixel as any).batteryLevel)) {
              battery = (sdkPixel as any).batteryLevel
            }

            // If still unknown, wait briefly for an update (up to 1500ms)
            if (battery === null || battery === undefined) {
              const deadline = Date.now() + 1500
              while (!controller.signal.aborted && Date.now() < deadline) {
                await delay(150)
                battery = this.store.getState().pixels[pixelId]?.batteryLevel
                const sdkPixelNow = this.pixels.get(pixelId)
                if ((battery === null || battery === undefined) && sdkPixelNow && Number.isFinite((sdkPixelNow as any).batteryLevel)) {
                  battery = (sdkPixelNow as any).batteryLevel
                }
                if (battery !== null && battery !== undefined) break
              }
            }

            return { pixelId, battery }
          })

          const readResults = await Promise.all(readPromises)

          const toDisconnect: string[] = []
          const toGlow: Array<{ pixelId: string; color: GlowColor }> = []

          for (const result of readResults) {
            if (!result) continue
            const { pixelId, battery } = result
            if (battery === null || battery === undefined) continue

            if (battery > 80) {
              toDisconnect.push(pixelId)
              continue
            }

            const action = batteryToHighlightAction(battery)
            const glowColor =
              action.color === 'green'
                ? CONNECTED_GLOW_COLOR
                : action.color === 'yellow'
                ? BATTERY_HIGHLIGHT_YELLOW
                : BATTERY_HIGHLIGHT_RED

            toGlow.push({ pixelId, color: glowColor })
          }

          // 3) Disconnect any fully-charged dice in parallel
          if (toDisconnect.length > 0) {
            try {
              await this.disconnectDice(toDisconnect, 'battery-full-disconnect')
            } catch {}
          }

          // 4) Highlight all remaining dice simultaneously for holdMs (20s requested by user)
          if (toGlow.length > 0) {
            // Play a long-running instant animation on each die so the glow
            // remains until explicitly stopped (approximate "permanent").
            const permanentPromises = toGlow.map((t) =>
              this.glowSolidColor(t.pixelId, t.color, BATTERY_HIGHLIGHT_PERMANENT_MS),
            )
            await Promise.allSettled(permanentPromises)
          }

          // 5) Wait pauseMs before next cycle
          if (singleRun) {
            break
          }

          const waitUntil = Date.now() + pauseMs
          while (!controller.signal.aborted && Date.now() < waitUntil) {
            // sleep in small increments so we can abort quickly
            await delay(200)
          }
        }
      } finally {
        this.batteryHighlightController = null
      }
    }

    void runCycle()

    return {
      stop: () => {
        controller.abort()
        void this.stopAllGlows()
      },
    }
  }

  public stopBatteryHighlightCycle(): Promise<void> | void {
    if (!this.batteryHighlightController) {
      return
    }

    this.batteryHighlightController.abort()
    this.batteryHighlightController = null
    return this.stopAllGlows()
  }

  private async glowSolidColor(pixelId: string, color: GlowColor, durationMs: number): Promise<void> {
    const pixel = this.pixels.get(pixelId)
    if (!pixel) {
      return
    }

    const dataSet = new DataSet()
    const trackIndex = this.pushColorKeyframeTrack(dataSet, color)

    const animation = new AnimationGradient()
    animation.duration = durationMs
    animation.faceMask = AnimConstants.faceMaskAll
    animation.gradientTrackOffset = trackIndex

    dataSet.animations.push(animation)

    try {
      await pixel.transferInstantAnimations(dataSet)
      await pixel.playInstantAnimation(0)
    } catch {
      // Ignore SDK errors for highlight best-effort
    }
  }

  private async blinkPixel(pixel: Pixel, options: GlowOptions = {}): Promise<void> {
    const blinkOptions = options.faceMask === undefined ? undefined : { faceMask: options.faceMask }
    await pixel.blink(toBlinkColor(options.color), blinkOptions)
  }

  private createCleanupAnimationDataSet(pixel: Pixel, options: CleanupGlowOptions): DataSet | null {
    // Compute the numeric lowest/highest face values for the die type and
    // map those to face masks. This uses the SDK's `getDieFaces` which
    // returns the human-facing face values (e.g. d6 -> [1..6], d10 -> [0..9],
    // d00 -> [0,10,20,..,90]). Using these concrete values avoids the
    // special-case behavior of getLowestFace/getHighestFace and fixes
    // inconsistent mappings across die types.
    const dieFaces = DiceUtils.getDieFaces(pixel.dieType as any)
    if (!dieFaces || dieFaces.length === 0) {
      return null
    }

    const lowestFaceValue = Math.min(...dieFaces)
    const highestFaceValue = Math.max(...dieFaces)

    const lowestFaceMask = this.getFaceMaskForPixel(pixel, lowestFaceValue)
    const highestFaceMask = this.getFaceMaskForPixel(pixel, highestFaceValue)
    if (lowestFaceMask === null || highestFaceMask === null) {
      return null
    }

    const dataSet = new DataSet()
    const baseColorIndex = this.pushColorKeyframeTrack(
      dataSet,
      options.baseColor ?? CLEANUP_BASE_GLOW_COLOR,
    )

    // Resolve semantic colors with fallbacks for backward compatibility.
    // Default to semantic top (green) and bottom (red) colors.
    const bottomColor: GlowColor = options.bottomFaceColor ?? options.lowFaceColor ?? { r: 255, g: 68, b: 68 }
    const topColor: GlowColor = options.topFaceColor ?? options.highFaceColor ?? { r: 34, g: 255, b: 94 }

    const bottomFaceColorIndex = this.pushColorKeyframeTrack(dataSet, bottomColor)
    const topFaceColorIndex = this.pushColorKeyframeTrack(dataSet, topColor)

    dataSet.animations.push(
      this.createGradientAnimation(AnimConstants.faceMaskAll, baseColorIndex),
      this.createGradientAnimation(lowestFaceMask, bottomFaceColorIndex),
      this.createGradientAnimation(highestFaceMask, topFaceColorIndex),
      this.createCombinedCleanupAnimation(),
    )

    return dataSet
  }

  private pushColorKeyframeTrack(dataSet: DataSet, color: GlowColor): number {
    const colorIndex = dataSet.animationBits.palette.length
    dataSet.animationBits.palette.push(toBlinkColor(color))

    const keyframe = new RgbKeyframe()
    keyframe.setTimeAndColorIndex(0, colorIndex)

    const track = new RgbTrack()
    track.keyframesOffset = dataSet.animationBits.rgbKeyframes.length
    track.keyFrameCount = 1
    track.ledMask = 0

    dataSet.animationBits.rgbKeyframes.push(keyframe)
    dataSet.animationBits.rgbTracks.push(track)

    return dataSet.animationBits.rgbTracks.length - 1
  }

  private createGradientAnimation(faceMask: number, gradientTrackOffset: number): AnimationGradient {
    const animation = new AnimationGradient()
    animation.duration = CLEANUP_ANIMATION_DURATION_MS
    animation.faceMask = faceMask
    animation.gradientTrackOffset = gradientTrackOffset
    return animation
  }

  private createCombinedCleanupAnimation(): AnimationSequence {
    const animation = new AnimationSequence()
    animation.duration = CLEANUP_ANIMATION_DURATION_MS
    animation.animation0Offset = 0
    animation.animation1Offset = 1
    animation.animation2Offset = 2
    animation.animation0Delay = 0
    animation.animation1Delay = 0
    animation.animation2Delay = 0
    animation.animationCount = 3
    return animation
  }

  private getFaceMaskForPixel(pixel: Pixel, face: number): number | null {
    try {
      return getFaceMask(face, pixel.dieType)
    } catch {
      return null
    }
  }

  private async connectRegisteredPixel(pixel: Pixel, reason?: string): Promise<boolean> {
    await repeatConnect(pixel)

    const dieType = mapPixelDieType(pixel.dieType)
    if (!dieType) {
      await pixel.disconnect().catch(() => undefined)
      this.store.getState().setBleError(`Unsupported die type: ${pixel.dieType}`)
      return false
    }

    const pixelId = getPixelId(pixel)
    this.cleanupPixel(pixelId)
    this.pixels.set(pixelId, pixel)
    this.registerPixel(pixelId, pixel, dieType)
    this.store.getState().rememberPairedPixel({ pixelId, dieType })

    this.store.getState().addPixel({
      pixelId,
      dieType,
      connectionState: 'connected',
      batteryLevel: Number.isFinite(pixel.batteryLevel) ? pixel.batteryLevel : null,
      lastFace: null,
    })

    nativeLog('i', 'PixelsService.connectRegisteredPixel registered', pixelId, {
      reason,
      dieType,
      batteryLevel: Number.isFinite(pixel.batteryLevel) ? pixel.batteryLevel : null,
      sdkDieType: pixel.dieType,
    })

    await pixel.blink(toBlinkColor(CONNECTED_GLOW_COLOR)).catch(() => undefined)

    return true
  }

  private async connectPixelsInBatches(pixels: Pixel[], reason?: string): Promise<boolean[]> {
    return this.runInBatches(pixels, (pixel) => this.connectRegisteredPixel(pixel, reason))
  }

  private async runInBatches<T, TResult>(
    items: T[],
    worker: (item: T) => Promise<TResult>,
  ): Promise<TResult[]> {
    const results: TResult[] = []

    for (let index = 0; index < items.length; index += MULTI_CONNECT_BATCH_SIZE) {
      const batch = items.slice(index, index + MULTI_CONNECT_BATCH_SIZE)
      const batchResults = await Promise.all(batch.map((item) => worker(item)))
      results.push(...batchResults)

      if (index + MULTI_CONNECT_BATCH_SIZE < items.length) {
        await delay(MULTI_CONNECT_BATCH_DELAY_MS)
      }
    }

    return results
  }

  private registerPixel(pixelId: string, pixel: Pixel, dieType: DieType): void {
    const onRoll = (rawFace: number) => {
      const lastRollAt = this.lastRollAt.get(pixelId) ?? 0
      const now = Date.now()
      if (now - lastRollAt < ROLL_DEDUP_MS) {
        return
      }

      this.lastRollAt.set(pixelId, now)

      const face = normalizeRollFace(dieType, rawFace)
      this.store.getState().updatePixelState(pixelId, { lastFace: face })
      this.store.getState().markPairedPixelUsed(pixelId, now)

      for (const callback of this.rollCallbacks) {
        callback(pixelId, face, dieType)
      }
    }

    const onBattery = (event: { level: number }) => {
      this.store.getState().updatePixelState(pixelId, { batteryLevel: event.level })
    }

    const onStatusChanged = (event: PixelStatusEvent) => {
      nativeLog('i', '[PixelsService] Pixel statusChanged', pixelId, event)
      const connectionState = event.status === 'disconnected' ? 'disconnected' : 'connected'
      this.store.getState().updatePixelState(pixelId, { connectionState })

      if (event.status === 'disconnected') {
        this.cleanupPixel(pixelId)
      }
    }

    pixel.addEventListener('roll', onRoll)
    pixel.addEventListener('battery', onBattery)
    pixel.addEventListener('statusChanged', onStatusChanged)

    this.cleanups.set(pixelId, [
      () => pixel.removeEventListener('roll', onRoll),
      () => pixel.removeEventListener('battery', onBattery),
      () => pixel.removeEventListener('statusChanged', onStatusChanged),
    ])
  }

  private cleanupPixel(pixelId: string): void {
    nativeLog('i', '[PixelsService] cleanupPixel for', pixelId)
    const cleanups = this.cleanups.get(pixelId)
    if (cleanups) {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }

    this.cleanups.delete(pixelId)
    this.pixels.delete(pixelId)
    this.lastRollAt.delete(pixelId)
    this.cleanupAnimationHashes.delete(pixelId)
  }
}

function normalizeRollFace(dieType: DieType, face: number): number {
  if (dieType !== 'd100') {
    return face
  }

  // VERIFY: d100 face range assumed 0-99 from SDK and normalized to 1-100 here.
  if (face >= 0 && face <= 99) {
    return face + 1
  }

  return face
}

export function batteryToHighlightAction(percent: number): { action: 'disconnect' | 'glow'; color?: 'red' | 'yellow' | 'green' } {
  if (!Number.isFinite(percent)) {
    return { action: 'glow', color: 'red' }
  }

  if (percent > 80) {
    return { action: 'disconnect' }
  }

  if (percent > 60) {
    return { action: 'glow', color: 'green' }
  }

  if (percent > 40) {
    return { action: 'glow', color: 'yellow' }
  }

  return { action: 'glow', color: 'red' }
}

export const pixelsService = new PixelsService()

export async function initializeBleSupport(): Promise<void> {
  await pixelsService.initializeBleSupport()
}

export async function connectDie(): Promise<void> {
  await pixelsService.connectDie()
}

export async function reconnectPairedDice(options?: ReconnectOptions): Promise<void> {
  await pixelsService.reconnectPairedDice(options)
}

export async function disconnectDie(pixelId: string, reason?: string): Promise<void> {
  await pixelsService.disconnectDie(pixelId, reason)
}

export async function disconnectDice(pixelIds: string[], reason?: string): Promise<void> {
  await pixelsService.disconnectDice(pixelIds, reason)
}

export async function forgetDie(pixelId: string): Promise<void> {
  await pixelsService.forgetDie(pixelId)
}

export async function connectRememberedDie(
  pixelId: string,
  options?: ConnectRememberedDieOptions,
): Promise<boolean> {
  return pixelsService.connectRememberedDie(pixelId, options)
}

export async function connectRememberedDice(
  pixelIds: string[],
  options?: ConnectRememberedDiceOptions,
  reason?: string,
): Promise<boolean[]> {
  return pixelsService.connectRememberedDice(pixelIds, options, reason)
}

export function startBatteryHighlightCycle(options?: { holdMs?: number; singleRun?: boolean; refreshMs?: number }) {
  return pixelsService.startBatteryHighlightCycle(options)
}

export function stopBatteryHighlightCycle() {
  return pixelsService.stopBatteryHighlightCycle()
}

export function markPixelUsed(pixelId: string, usedAt?: number): void {
  pixelsService.markPixelUsed(pixelId, usedAt)
}

export function onRollResult(callback: RollResultCallback): Unsubscribe {
  return pixelsService.onRollResult(callback)
}

export async function glowDie(pixelId: string, color?: GlowColor): Promise<void> {
  await pixelsService.glowDie(pixelId, color)
}

export async function glowDieFace(pixelId: string, face: number, color?: GlowColor): Promise<void> {
  await pixelsService.glowDieFace(pixelId, face, color)
}

export async function glowDieLowestFace(pixelId: string, color?: GlowColor): Promise<void> {
  await pixelsService.glowDieLowestFace(pixelId, color)
}

export async function glowDieHighestFace(pixelId: string, color?: GlowColor): Promise<void> {
  await pixelsService.glowDieHighestFace(pixelId, color)
}

export async function glowCleanupOrientation(pixelId: string, options?: CleanupGlowOptions): Promise<void> {
  await pixelsService.glowCleanupOrientation(pixelId, options)
}

export async function stopGlow(pixelId: string): Promise<void> {
  await pixelsService.stopGlow(pixelId)
}

export async function stopAllGlows(): Promise<void> {
  await pixelsService.stopAllGlows()
}

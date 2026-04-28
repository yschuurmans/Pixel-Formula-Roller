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
} from './pixelsTransport'
import type { DieType } from '../types/formula'
import { useAppStore } from '../stores/useAppStore'

const ROLL_DEDUP_MS = 300
const CONNECTED_GLOW_COLOR: GlowColor = { r: 34, g: 197, b: 94 }
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

export interface GlowColor {
  r: number
  g: number
  b: number
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
      await Promise.all(pixels.map((pixel) => this.connectRegisteredPixel(pixel)))
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

    let reconnectedCount = 0

    for (const pixelId of pairedPixelIds) {
      try {
        const pixel = await getPixel(pixelId)
        if (!pixel) {
          continue
        }

        const connected = await this.connectRegisteredPixel(pixel)
        if (connected) {
          reconnectedCount += 1
        }
      } catch {
        // Continue trying the remaining paired dice.
      }
    }

    if (reconnectedCount === 0) {
      if (allowPromptFallback && !capabilities.persistentPermissions) {
        try {
          const pixels = await requestPixels()
          await Promise.all(pixels.map((pixel) => this.connectRegisteredPixel(pixel)))
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

  async disconnectDie(pixelId: string): Promise<void> {
    const pixel = this.pixels.get(pixelId)

    try {
      await pixel?.disconnect()
    } catch {
      // Disconnect should leave the local service state clean even if the SDK throws.
    } finally {
      this.cleanupPixel(pixelId)
      this.store.getState().updatePixelState(pixelId, { connectionState: 'disconnected' })
    }
  }

  async forgetDie(pixelId: string): Promise<void> {
    await this.disconnectDie(pixelId)
    this.store.getState().forgetPairedPixelId(pixelId)
    this.store.getState().removePixel(pixelId)
  }

  async connectRememberedDie(pixelId: string, options: ConnectRememberedDieOptions = {}): Promise<boolean> {
    try {
      const pixel = await getPixel(pixelId)
      if (!pixel) {
        return false
      }

      return await this.connectRegisteredPixel(pixel)
    } catch (error) {
      if (!options.suppressErrors) {
        this.store.getState().setBleError(toErrorMessage(error))
      }

      return false
    }
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

    await pixel.blink(toBlinkColor(color))
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

  private async connectRegisteredPixel(pixel: Pixel): Promise<boolean> {
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

    await pixel.blink(toBlinkColor(CONNECTED_GLOW_COLOR)).catch(() => undefined)

    return true
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
    const cleanups = this.cleanups.get(pixelId)
    if (cleanups) {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }

    this.cleanups.delete(pixelId)
    this.pixels.delete(pixelId)
    this.lastRollAt.delete(pixelId)
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

export async function disconnectDie(pixelId: string): Promise<void> {
  await pixelsService.disconnectDie(pixelId)
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

export function markPixelUsed(pixelId: string, usedAt?: number): void {
  pixelsService.markPixelUsed(pixelId, usedAt)
}

export function onRollResult(callback: RollResultCallback): Unsubscribe {
  return pixelsService.onRollResult(callback)
}

export async function glowDie(pixelId: string, color?: GlowColor): Promise<void> {
  await pixelsService.glowDie(pixelId, color)
}

export async function stopGlow(pixelId: string): Promise<void> {
  await pixelsService.stopGlow(pixelId)
}

export async function stopAllGlows(): Promise<void> {
  await pixelsService.stopAllGlows()
}

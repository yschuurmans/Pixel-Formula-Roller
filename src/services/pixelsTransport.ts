import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import {
  Pixel,
  PixelSession,
  repeatConnect,
  type PixelStatusEvent,
} from '@systemic-games/pixels-core-connect'
import {
  getBluetoothCapabilities as getWebBluetoothCapabilities,
  getPixel as getWebPixel,
  requestPixel as requestWebPixel,
} from '@systemic-games/pixels-web-connect'

type NativePixelDevice = {
  systemId: string
  name?: string | null
}

type NativePixelDiscoveryResult = NativePixelDevice[] | {
  devices: NativePixelDevice[]
}

type NativeBleAvailability = {
  available: boolean
  bluetoothEnabled: boolean
  permissionsGranted: boolean
  missingPermissions: string[]
}

type NativeBleNotificationEvent = {
  systemId: string
  value: number[]
}

type NativeBleDisconnectEvent = {
  systemId: string
}

type NativeBlePlugin = {
  getAvailability(): Promise<NativeBleAvailability>
  requestPixels(): Promise<NativePixelDiscoveryResult>
  getPixel(options: { systemId: string }): Promise<NativePixelDevice | null>
  connect(options: { systemId: string; timeoutMs?: number }): Promise<NativePixelDevice>
  disconnect(options: { systemId: string }): Promise<void>
  writeValue(options: { systemId: string; value: number[]; withoutResponse?: boolean }): Promise<void>
  log(options: { message: string; level?: 'i' | 'w' | 'e' | 'd' | 'v' }): Promise<void>
  addListener(
    eventName: 'pixelsBleNotification',
    listenerFunc: (event: NativeBleNotificationEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'pixelsBleDisconnect',
    listenerFunc: (event: NativeBleDisconnectEvent) => void,
  ): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

type BluetoothCapabilities = {
  bluetooth: boolean
  persistentPermissions: boolean
}

export type PixelsBleAvailability = NativeBleAvailability & {
  nativeBridge: boolean
}

const NativePixelsBle = registerPlugin<NativeBlePlugin>('PixelsBle')
const nativePixels = new Map<string, Pixel>()
const nativeKnownDevices = new Map<string, NativePixelDevice>()

// Registry for raw native BLE notification listeners. Consumers can subscribe
// to receive the unparsed `pixelsBleNotification` events for a specific
// pixel `systemId` and inspect bytes to detect rolling/settling frames.
const nativeNotificationListeners = new Set<(event: NativeBleNotificationEvent) => void>()

export function onNativeNotification(listener: (event: NativeBleNotificationEvent) => void) {
  nativeNotificationListeners.add(listener)
  return () => nativeNotificationListeners.delete(listener)
}

type LogLevel = 'i' | 'w' | 'e' | 'd' | 'v'

export function nativeLog(level: LogLevel, ...args: unknown[]) {
  // Format message
  const message = args
    .map((a) => {
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')

  // Mirror to console for browser/dev tooling
  if (level === 'e') console.error('[PixelsBle]', message)
  else if (level === 'w') console.warn('[PixelsBle]', message)
  else if (level === 'd') console.debug?.('[PixelsBle]', message)
  else console.info('[PixelsBle]', message)

  // Forward to native plugin when available so logs appear under the PixelsBle tag in logcat
  if (isNativeBridgeAvailable()) {
    try {
      ;(NativePixelsBle as any).log?.({ message, level })
    } catch {
      // best-effort
    }
  }
}

function isNativeAndroidRuntime(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function isNativeBridgeAvailable(): boolean {
  return isNativeAndroidRuntime() && Capacitor.isPluginAvailable('PixelsBle')
}

function normalizeNativeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string') {
    return new Error(error)
  }

  return new Error('Bluetooth bridge request failed.')
}

function serializeNativeError(error: unknown): Record<string, unknown> {
  try {
    if (error instanceof Error) {
      return {
        message: error.message,
        name: error.name,
        stack: (error.stack || '').split('\n').slice(0, 5).join('\n'),
      }
    }

    if (typeof error === 'object' && error !== null) {
      const out: Record<string, unknown> = {}
      // Copy enumerable properties that are useful (message, code, status)
      for (const key of Object.keys(error as Record<string, unknown>)) {
        try {
          out[key] = (error as Record<string, unknown>)[key]
        } catch {
          out[key] = String((error as Record<string, unknown>)[key])
        }
      }
      return out
    }

    return { value: String(error) }
  } catch {
    return { value: 'unable to serialize error' }
  }
}

function toUint8Array(data: BufferSource): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }

  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

class NativePixelsSession extends PixelSession {
  private disconnectHandle?: PluginListenerHandle
  private disconnectHandlePromise?: Promise<PluginListenerHandle>
  private notificationHandle?: PluginListenerHandle
  private notificationHandlePromise?: Promise<PluginListenerHandle>

  constructor(systemId: string, name?: string) {
    super(systemId, name)

    this.disconnectHandlePromise = NativePixelsBle.addListener('pixelsBleDisconnect', (event) => {
      if (event.systemId === this.systemId) {
        nativeLog('i', 'Native pixelsBleDisconnect for', this.systemId, event)
        this._notifyConnectionEvent('disconnected')
      }
    }).then((handle) => {
      this.disconnectHandle = handle
      return handle
    })

    // Also listen for raw notifications for this session so other modules can
    // react to intermediate rolling frames prior to the settled roll event.
    this.notificationHandlePromise = NativePixelsBle.addListener('pixelsBleNotification', (event) => {
      if (event.systemId !== this.systemId) return

      try {
        for (const listener of nativeNotificationListeners) {
          try {
            listener(event)
          } catch (err) {
            // best-effort; don't let one listener blow up the rest
          }
        }
      } catch {
        // swallow
      }
    }).then((handle) => {
      this.notificationHandle = handle
      return handle
    })
  }

  dispose(): void {
    if (this.disconnectHandle) {
      void this.disconnectHandle.remove()
      this.disconnectHandle = undefined
    } else if (this.disconnectHandlePromise) {
      void this.disconnectHandlePromise.then((handle) => handle.remove())
    }
    if (this.notificationHandle) {
      void this.notificationHandle.remove()
      this.notificationHandle = undefined
    } else if (this.notificationHandlePromise) {
      void this.notificationHandlePromise.then((handle) => handle.remove())
    }
  }

  async connect(timeoutMs = 0): Promise<void> {
    this._notifyConnectionEvent('connecting')

    const attemptId = Date.now()
    const timeoutToUse = timeoutMs > 0 ? timeoutMs : 6000
    nativeLog('d', 'NativePixelsSession.connect start', { systemId: this.systemId, timeoutMs: timeoutToUse, attemptId })

    try {
      const device = await NativePixelsBle.connect({
        systemId: this.systemId,
        timeoutMs: timeoutToUse,
      })
      nativeKnownDevices.set(device.systemId, device)
      if (device.name && !this.pixelName) {
        this._setName(device.name)
      }
      nativeLog('i', 'Native connect succeeded for', this.systemId, device)
      this._notifyConnectionEvent('connected')
      this._notifyConnectionEvent('ready')
    } catch (error) {
      const serialized = serializeNativeError(error)
      nativeLog('w', 'Native connect failed structured', { systemId: this.systemId, timeoutMs: timeoutToUse, attemptId, error: serialized })
      this._notifyConnectionEvent('disconnected')
      throw normalizeNativeError(error)
    }
  }

  async disconnect(): Promise<void> {
    this._notifyConnectionEvent('disconnecting')
    try {
      nativeLog('i', 'Native disconnect requested for', this.systemId)
      await NativePixelsBle.disconnect({ systemId: this.systemId })
      nativeLog('i', 'Native disconnect completed for', this.systemId)
    } catch (error) {
      nativeLog('w', 'Native disconnect error for', this.systemId, error)
      throw normalizeNativeError(error)
    } finally {
      this._notifyConnectionEvent('disconnected')
    }
  }

  async subscribe(listener: (dataView: DataView) => void): Promise<() => void> {
    const handle = await NativePixelsBle.addListener('pixelsBleNotification', (event) => {
      if (event.systemId !== this.systemId || event.value.length === 0) {
        return
      }

      const bytes = Uint8Array.from(event.value)
      listener(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    })

    return () => {
      void handle.remove()
    }
  }

  async writeValue(data: BufferSource, withoutResponse = false): Promise<void> {
    const value = Array.from(toUint8Array(data))
    await NativePixelsBle.writeValue({
      systemId: this.systemId,
      value,
      withoutResponse,
    })
  }
}

function getOrCreateNativePixel(device: NativePixelDevice): Pixel {
  let pixel = nativePixels.get(device.systemId)
  if (!pixel) {
    nativeLog('d', 'getOrCreateNativePixel creating Pixel for', device.systemId, { name: device.name })
    pixel = new Pixel(new NativePixelsSession(device.systemId, device.name ?? undefined))
    nativePixels.set(device.systemId, pixel)
  }

  nativeKnownDevices.set(device.systemId, device)
  return pixel
}

export async function getBleAvailability(): Promise<PixelsBleAvailability> {
  if (!isNativeBridgeAvailable()) {
    const capabilities = getWebBluetoothCapabilities()
    return {
      available: capabilities.bluetooth,
      bluetoothEnabled: capabilities.bluetooth,
      permissionsGranted: capabilities.bluetooth,
      missingPermissions: [],
      nativeBridge: false,
    }
  }

  const availability = await NativePixelsBle.getAvailability()
  return {
    ...availability,
    nativeBridge: true,
  }
}

export function getBluetoothCapabilities(): BluetoothCapabilities {
  if (isNativeBridgeAvailable()) {
    return {
      bluetooth: true,
      persistentPermissions: true,
    }
  }

  return getWebBluetoothCapabilities()
}

export async function requestPixels(): Promise<Pixel[]> {
  if (!isNativeBridgeAvailable()) {
    return [await requestWebPixel()]
  }

  const discoveryResult = await NativePixelsBle.requestPixels()
  const devices = Array.isArray(discoveryResult)
    ? discoveryResult
    : discoveryResult.devices
  return Promise.all(devices.map((device) => getOrCreateNativePixel(device)))
}

export async function getPixel(systemId: string): Promise<Pixel | undefined> {
  if (!isNativeBridgeAvailable()) {
    return getWebPixel(systemId)
  }

  const pixel = nativePixels.get(systemId)
  if (pixel) {
    nativeLog('d', 'getPixel returning cached Pixel for', systemId)
    return pixel
  }

  nativeLog('d', 'getPixel native bridge lookup for', systemId)
  try {
    const device = await NativePixelsBle.getPixel({ systemId })
    nativeLog('d', 'getPixel native bridge result', { systemId, found: !!device })
    return device ? getOrCreateNativePixel(device) : undefined
  } catch (error) {
    nativeLog('w', 'getPixel native bridge error', systemId, serializeNativeError(error))
    return undefined
  }
}

export type { PixelStatusEvent }
export { repeatConnect, Pixel }
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

function toUint8Array(data: BufferSource): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }

  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

class NativePixelsSession extends PixelSession {
  private disconnectHandle?: PluginListenerHandle
  private disconnectHandlePromise?: Promise<PluginListenerHandle>

  constructor(systemId: string, name?: string) {
    super(systemId, name)

    this.disconnectHandlePromise = NativePixelsBle.addListener('pixelsBleDisconnect', (event) => {
      if (event.systemId === this.systemId) {
        this._notifyConnectionEvent('disconnected')
      }
    }).then((handle) => {
      this.disconnectHandle = handle
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
  }

  async connect(timeoutMs = 0): Promise<void> {
    this._notifyConnectionEvent('connecting')

    try {
      const device = await NativePixelsBle.connect({
        systemId: this.systemId,
        timeoutMs: timeoutMs > 0 ? timeoutMs : 6000,
      })
      nativeKnownDevices.set(device.systemId, device)
      if (device.name && !this.pixelName) {
        this._setName(device.name)
      }
      this._notifyConnectionEvent('connected')
      this._notifyConnectionEvent('ready')
    } catch (error) {
      this._notifyConnectionEvent('disconnected')
      throw normalizeNativeError(error)
    }
  }

  async disconnect(): Promise<void> {
    this._notifyConnectionEvent('disconnecting')
    try {
      await NativePixelsBle.disconnect({ systemId: this.systemId })
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
    return pixel
  }

  const device = await NativePixelsBle.getPixel({ systemId })
  return device ? getOrCreateNativePixel(device) : undefined
}

export type { PixelStatusEvent }
export { repeatConnect, Pixel }
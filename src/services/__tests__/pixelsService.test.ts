import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PixelsService, getBleUnavailableMessage, batteryToHighlightAction } from '../pixelsService'
import { DiceUtils, getFaceMask } from '@systemic-games/pixels-core-animation'
import { useAppStore } from '../../stores/useAppStore'

const {
  getBleAvailabilityMock,
  requestPixelsMock,
  repeatConnectMock,
  getPixelMock,
  getBluetoothCapabilitiesMock,
} = vi.hoisted(() => ({
  getBleAvailabilityMock: vi.fn(async () => ({
    available: true,
    bluetoothEnabled: true,
    permissionsGranted: true,
    missingPermissions: [],
    nativeBridge: false,
  })),
  requestPixelsMock: vi.fn(),
  repeatConnectMock: vi.fn(),
  getPixelMock: vi.fn(),
  getBluetoothCapabilitiesMock: vi.fn(() => ({ bluetooth: true, persistentPermissions: true })),
}))

vi.mock('../pixelsTransport', async () => {
  const actual = await vi.importActual<typeof import('../pixelsTransport')>('../pixelsTransport')
  return {
    ...actual,
    getBleAvailability: getBleAvailabilityMock,
    getBluetoothCapabilities: getBluetoothCapabilitiesMock,
    getPixel: getPixelMock,
    requestPixels: requestPixelsMock,
    repeatConnect: repeatConnectMock,
  }
})

type PixelEventMap = {
  roll: number
  battery: { level: number; isCharging: boolean }
  statusChanged: {
    status: 'disconnected' | 'connecting' | 'identifying' | 'ready' | 'disconnecting'
    lastStatus: 'disconnected' | 'connecting' | 'identifying' | 'ready' | 'disconnecting'
  }
}

class FakePixel {
  systemId: string
  dieType: string
  batteryLevel: number
  blinkCalls: Array<{ color: unknown; options: unknown }> = []
  instantAnimationDataSets: unknown[] = []
  playedInstantAnimations: number[] = []
  stopAllAnimations = vi.fn(async () => undefined)
  disconnect = vi.fn(async () => undefined)
  transferInstantAnimations = vi.fn(async (dataSet: unknown) => {
    this.instantAnimationDataSets.push(dataSet)
  })
  playInstantAnimation = vi.fn(async (animationIndex: number) => {
    this.playedInstantAnimations.push(animationIndex)
  })
  private readonly listeners = new Map<keyof PixelEventMap, Set<(event: unknown) => void>>()

  constructor({ systemId, dieType, batteryLevel = 55 }: { systemId: string; dieType: string; batteryLevel?: number }) {
    this.systemId = systemId
    this.dieType = dieType
    this.batteryLevel = batteryLevel
  }

  addEventListener<K extends keyof PixelEventMap>(type: K, listener: (event: PixelEventMap[K]) => void) {
    const listeners = this.listeners.get(type) ?? new Set<(event: unknown) => void>()
    listeners.add(listener as (event: unknown) => void)
    this.listeners.set(type, listeners)
  }

  removeEventListener<K extends keyof PixelEventMap>(type: K, listener: (event: PixelEventMap[K]) => void) {
    this.listeners.get(type)?.delete(listener as (event: unknown) => void)
  }

  blink = vi.fn(async (color: unknown, options?: unknown) => {
    this.blinkCalls.push({ color, options })
  })

  emit<K extends keyof PixelEventMap>(type: K, event: PixelEventMap[K]) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

function resetStore() {
  localStorage.clear()
  useAppStore.setState({
    pixels: {},
    pairedPixelIds: [],
    pairedPixels: {},
    bleAvailable: true,
    bleError: null,
  })
}

function setNavigatorBluetooth(value: unknown) {
  Object.defineProperty(window.navigator, 'bluetooth', {
    configurable: true,
    value,
  })
}

describe('pixelsService', () => {
  beforeEach(async () => {
    vi.useRealTimers()
    getBleAvailabilityMock.mockReset()
    getBleAvailabilityMock.mockResolvedValue({
      available: true,
      bluetoothEnabled: true,
      permissionsGranted: true,
      missingPermissions: [],
      nativeBridge: false,
    })
    requestPixelsMock.mockReset()
    repeatConnectMock.mockReset()
    getPixelMock.mockReset()
    getBluetoothCapabilitiesMock.mockReset()
    getBluetoothCapabilitiesMock.mockReturnValue({ bluetooth: true, persistentPermissions: true })
    resetStore()
    setNavigatorBluetooth({})
    await new PixelsService(useAppStore).initializeBleSupport({ bluetooth: {} })
  })

  it('marks BLE unavailable on init when the Bluetooth bridge is missing', async () => {
    const service = new PixelsService(useAppStore)

    await service.initializeBleSupport({
      bluetooth: undefined,
    })

    expect(useAppStore.getState().bleAvailable).toBe(false)
  })

  it('keeps BLE available on init when only Android permissions are missing', async () => {
    const service = new PixelsService(useAppStore)

    await service.initializeBleSupport(
      {
        bluetooth: {},
      },
      {
        isNativeAndroid: true,
        hasNativeBridge: true,
      },
      {
        available: true,
        bluetoothEnabled: true,
        permissionsGranted: false,
        missingPermissions: ['android.permission.BLUETOOTH_SCAN'],
        nativeBridge: true,
      },
    )

    expect(useAppStore.getState().bleAvailable).toBe(true)
    expect(useAppStore.getState().bleError).toBe("Bluetooth permission denied. Tap 'Connect' to try again.")
  })

  it('returns a generic unavailable message when Bluetooth is missing', () => {
    expect(
      getBleUnavailableMessage({
        bluetooth: undefined,
      }),
    ).toBe('Bluetooth is unavailable on this build. Run the app on a supported Android device.')
  })

  it('returns an Android bridge message when the native shell has no Pixels BLE plugin', () => {
    getBleAvailabilityMock.mockResolvedValue({
      available: true,
      bluetoothEnabled: true,
      permissionsGranted: true,
      missingPermissions: [],
      nativeBridge: false,
    })

    expect(
      getBleUnavailableMessage(
        {
          bluetooth: undefined,
        },
        {
          isNativeAndroid: true,
          hasNativeBridge: false,
        },
      ),
    ).toBe('Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.')
  })

  it('connects a die, stores it, and updates battery from events', async () => {
    const pixel = new FakePixel({ systemId: 'pixel-1', dieType: 'd6', batteryLevel: 42 })
    requestPixelsMock.mockResolvedValue([pixel])
    repeatConnectMock.mockResolvedValue(undefined)
    const service = new PixelsService(useAppStore)

    await service.connectDie()

    expect(repeatConnectMock).toHaveBeenCalledWith(pixel)
    expect(useAppStore.getState().pixels['pixel-1']).toMatchObject({
      pixelId: 'pixel-1',
      dieType: 'd6',
      connectionState: 'connected',
      batteryLevel: 42,
      lastFace: null,
    })
    expect(useAppStore.getState().pairedPixelIds).toEqual(['pixel-1'])
    expect(pixel.blink).toHaveBeenCalledTimes(1)
    const connectBlinkColor = pixel.blinkCalls[0]?.color as { rByte: number; gByte: number; bByte: number }
    expect(connectBlinkColor.rByte).toBe(34)
    expect(connectBlinkColor.gByte).toBe(197)
    expect(connectBlinkColor.bByte).toBe(94)

    pixel.emit('battery', { level: 88, isCharging: false })
    expect(useAppStore.getState().pixels['pixel-1']?.batteryLevel).toBe(88)
  })

  it('reconnects previously paired dice without prompting again', async () => {
    const pixel = new FakePixel({ systemId: 'pixel-9', dieType: 'd20', batteryLevel: 71 })
    useAppStore.setState({ pairedPixelIds: ['pixel-9'] })
    getPixelMock.mockResolvedValue(pixel)
    repeatConnectMock.mockResolvedValue(undefined)
    const service = new PixelsService(useAppStore)

    await service.reconnectPairedDice()

    expect(getPixelMock).toHaveBeenCalledWith('pixel-9')
    expect(repeatConnectMock).toHaveBeenCalledWith(pixel)
    expect(useAppStore.getState().pixels['pixel-9']).toMatchObject({
      pixelId: 'pixel-9',
      dieType: 'd20',
      connectionState: 'connected',
      batteryLevel: 71,
    })
  })

  it('falls back to the chooser for manual reconnect when automatic reconnect is unavailable', async () => {
    const pixel = new FakePixel({ systemId: 'pixel-10', dieType: 'd12', batteryLevel: 66 })
    useAppStore.setState({ pairedPixelIds: ['pixel-10'] })
    getPixelMock.mockResolvedValue(undefined)
    getBluetoothCapabilitiesMock.mockReturnValue({ bluetooth: true, persistentPermissions: false })
    requestPixelsMock.mockResolvedValue([pixel])
    repeatConnectMock.mockResolvedValue(undefined)
    const service = new PixelsService(useAppStore)

    await service.reconnectPairedDice({ allowPromptFallback: true })

    expect(getPixelMock).toHaveBeenCalledWith('pixel-10')
    expect(requestPixelsMock).toHaveBeenCalledTimes(1)
    expect(repeatConnectMock).toHaveBeenCalledWith(pixel)
    expect(useAppStore.getState().pixels['pixel-10']).toMatchObject({
      pixelId: 'pixel-10',
      dieType: 'd12',
      connectionState: 'connected',
      batteryLevel: 66,
    })
  })

  it('sets the permission denied error without throwing when connect is rejected', async () => {
    requestPixelsMock.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    const service = new PixelsService(useAppStore)

    await expect(service.connectDie()).resolves.toBeUndefined()
    expect(useAppStore.getState().bleError).toBe("Bluetooth permission denied. Tap 'Connect' to try again.")
  })

  it('publishes deduplicated roll events and normalizes d00 to d100 faces', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T00:00:00.000Z'))

    const pixel = new FakePixel({ systemId: 'pixel-2', dieType: 'd00' })
    requestPixelsMock.mockResolvedValue([pixel])
    repeatConnectMock.mockResolvedValue(undefined)
    const service = new PixelsService(useAppStore)
    const callback = vi.fn()
    const unsubscribe = service.onRollResult(callback)

    await service.connectDie()

    pixel.emit('roll', 0)
    pixel.emit('roll', 20)
    vi.advanceTimersByTime(301)
    pixel.emit('roll', 20)

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenNthCalledWith(1, 'pixel-2', 1, 'd100')
    expect(callback).toHaveBeenNthCalledWith(2, 'pixel-2', 21, 'd100')
    expect(useAppStore.getState().pixels['pixel-2']?.lastFace).toBe(21)

    unsubscribe()
  })

  it('glows and stops glow for a connected die', async () => {
    const pixel = new FakePixel({ systemId: 'pixel-3', dieType: 'd20' })
    requestPixelsMock.mockResolvedValue([pixel])
    repeatConnectMock.mockResolvedValue(undefined)
    const service = new PixelsService(useAppStore)

    await service.connectDie()
    await service.glowDie('pixel-3', { r: 12, g: 34, b: 56 })
    await service.stopGlow('pixel-3')

    expect(pixel.blink).toHaveBeenCalledTimes(2)
    const blinkColor = pixel.blinkCalls[1]?.color as { rByte: number; gByte: number; bByte: number }
    expect(blinkColor.rByte).toBe(12)
    expect(blinkColor.gByte).toBe(34)
    expect(blinkColor.bByte).toBe(56)
    expect(pixel.stopAllAnimations).toHaveBeenCalledTimes(1)
  })

  it('targets an individual die face by passing a face mask to blink', async () => {
    const pixel = new FakePixel({ systemId: 'pixel-5', dieType: 'd20' })
    requestPixelsMock.mockResolvedValue([pixel])
    repeatConnectMock.mockResolvedValue(undefined)
    const service = new PixelsService(useAppStore)

    await service.connectDie()
    await service.glowDieFace('pixel-5', 20, { r: 34, g: 197, b: 94 })

    expect(pixel.blink).toHaveBeenCalledTimes(2)
    expect(pixel.blinkCalls[1]?.options).toEqual({ faceMask: 1 << 19 })
  })

  it('plays cleanup orientation as one combined instant animation', async () => {
    const pixel = new FakePixel({ systemId: 'pixel-6', dieType: 'd20' })
    requestPixelsMock.mockResolvedValue([pixel])
    repeatConnectMock.mockResolvedValue(undefined)
    const service = new PixelsService(useAppStore)

    await service.connectDie()
    await service.glowCleanupOrientation('pixel-6', {
      baseColor: { r: 48, g: 48, b: 48 },
      lowFaceColor: { r: 239, g: 68, b: 68 },
      highFaceColor: { r: 34, g: 197, b: 94 },
    })

    expect(pixel.transferInstantAnimations).toHaveBeenCalledTimes(1)
    expect(pixel.playInstantAnimation).toHaveBeenCalledWith(3)
    expect(pixel.blink).toHaveBeenCalledTimes(1)
  })

  it('disconnects a die and marks it disconnected in store', async () => {
    const pixel = new FakePixel({ systemId: 'pixel-4', dieType: 'd8' })
    requestPixelsMock.mockResolvedValue([pixel])
    repeatConnectMock.mockResolvedValue(undefined)
    const service = new PixelsService(useAppStore)

    await service.connectDie()
    await service.disconnectDie('pixel-4')

    expect(pixel.disconnect).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().pixels['pixel-4']?.connectionState).toBe('disconnected')
  })

  it('connects every discovered Pixels die from the native scan', async () => {
    const firstPixel = new FakePixel({ systemId: 'pixel-a', dieType: 'd6', batteryLevel: 21 })
    const secondPixel = new FakePixel({ systemId: 'pixel-b', dieType: 'd20', batteryLevel: 64 })
    requestPixelsMock.mockResolvedValue([firstPixel, secondPixel])
    repeatConnectMock.mockResolvedValue(undefined)
    const service = new PixelsService(useAppStore)

    await service.connectDie()

    expect(repeatConnectMock).toHaveBeenCalledTimes(2)
    expect(useAppStore.getState().pairedPixelIds).toEqual(['pixel-a', 'pixel-b'])
    expect(useAppStore.getState().pixels['pixel-a']?.connectionState).toBe('connected')
    expect(useAppStore.getState().pixels['pixel-b']?.connectionState).toBe('connected')
  })

  it('reconnects paired dice in batches instead of one by one', async () => {
    vi.useFakeTimers()

    const deferredResolves = new Map<string, () => void>()
    const createDeferred = (pixelId: string) =>
      new Promise<undefined>((resolve) => {
        deferredResolves.set(pixelId, () => resolve(undefined))
      })

    const pixelIds = ['pixel-a', 'pixel-b', 'pixel-c', 'pixel-d', 'pixel-e', 'pixel-f', 'pixel-g']
    const pixelsById = new Map(
      pixelIds.map((pixelId, index) => [
        pixelId,
        new FakePixel({
          systemId: pixelId,
          dieType: (['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd6'] as const)[index],
        }),
      ]),
    )

    useAppStore.setState({ pairedPixelIds: pixelIds })
    getPixelMock.mockImplementation(async (pixelId: string) => pixelsById.get(pixelId))
    repeatConnectMock.mockImplementation((pixel: FakePixel) => createDeferred(pixel.systemId))

    const service = new PixelsService(useAppStore)
    const reconnectPromise = service.reconnectPairedDice()

    await Promise.resolve()

    expect(repeatConnectMock).toHaveBeenCalledTimes(6)
    expect(repeatConnectMock).not.toHaveBeenCalledWith(pixelsById.get('pixel-g'))

    for (const pixelId of pixelIds.slice(0, 6)) {
      deferredResolves.get(pixelId)?.()
    }
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(150)

    expect(repeatConnectMock).toHaveBeenCalledWith(pixelsById.get('pixel-g'))

    deferredResolves.get('pixel-g')?.()
    await reconnectPromise
  })

  it('disconnects dice in batches instead of one by one', async () => {
    vi.useFakeTimers()

    const deferredResolves = new Map<string, () => void>()
    const createDeferred = (pixelId: string) =>
      new Promise<undefined>((resolve) => {
        deferredResolves.set(pixelId, () => resolve(undefined))
      })

    const pixelIds = ['pixel-a', 'pixel-b', 'pixel-c', 'pixel-d', 'pixel-e', 'pixel-f', 'pixel-g']
    const pixelsById = new Map(
      pixelIds.map((pixelId, index) => [
        pixelId,
        new FakePixel({
          systemId: pixelId,
          dieType: (['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd6'] as const)[index],
        }),
      ]),
    )

    for (const pixelId of pixelIds) {
      pixelsById.get(pixelId)?.disconnect.mockImplementation(() => createDeferred(pixelId))
    }

    const service = new PixelsService(useAppStore)
    for (const pixelId of pixelIds) {
      const pixel = pixelsById.get(pixelId)
      if (pixel) {
        ;(service as unknown as { pixels: Map<string, FakePixel> }).pixels.set(pixelId, pixel)
      }
    }
    useAppStore.setState({
      pixels: Object.fromEntries(
        pixelIds.map((pixelId) => {
          const pixel = pixelsById.get(pixelId)!
          return [
            pixelId,
            {
              pixelId,
              dieType: pixel.dieType as 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20',
              connectionState: 'connected' as const,
              batteryLevel: null,
              lastFace: null,
            },
          ]
        }),
      ),
    })

    const disconnectPromise = service.disconnectDice(pixelIds)

    await Promise.resolve()

    for (const pixelId of pixelIds.slice(0, 6)) {
      expect(pixelsById.get(pixelId)?.disconnect).toHaveBeenCalledTimes(1)
    }
    expect(pixelsById.get('pixel-g')?.disconnect).not.toHaveBeenCalled()

    for (const pixelId of pixelIds.slice(0, 6)) {
      deferredResolves.get(pixelId)?.()
    }
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(150)

    expect(pixelsById.get('pixel-g')?.disconnect).toHaveBeenCalledTimes(1)

    deferredResolves.get('pixel-g')?.()
    await disconnectPromise
  })

  it('forgets a die so it is removed from reconnect memory', async () => {
    const pixel = new FakePixel({ systemId: 'pixel-5', dieType: 'd8' })
    requestPixelsMock.mockResolvedValue([pixel])
    repeatConnectMock.mockResolvedValue(undefined)
    const service = new PixelsService(useAppStore)

    await service.connectDie()
    await service.forgetDie('pixel-5')

    expect(pixel.disconnect).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().pairedPixelIds).toEqual([])
    expect(useAppStore.getState().pixels['pixel-5']).toBeUndefined()
  })

  it('normalizes die types and targets correct face masks for d10 and d00', async () => {
    const service = new PixelsService(useAppStore)

    const d10Pixel = new FakePixel({ systemId: 'pixel-d10', dieType: 'd10' })
    const d00Pixel = new FakePixel({ systemId: 'pixel-d00', dieType: 'd00' })
    const d6Pixel = new FakePixel({ systemId: 'pixel-d6', dieType: 'd6' })

    const d10DataSet = (service as any).createCleanupAnimationDataSet(d10Pixel, {})
    const d00DataSet = (service as any).createCleanupAnimationDataSet(d00Pixel, {})
    const d6DataSet = (service as any).createCleanupAnimationDataSet(d6Pixel, {})

    expect(d10DataSet).not.toBeNull()
    expect(d00DataSet).not.toBeNull()
    expect(d6DataSet).not.toBeNull()

    const d10Faces = DiceUtils.getDieFaces('d10')
    const d10LowestMask = getFaceMask(Math.min(...d10Faces), 'd10')
    const d10HighestMask = getFaceMask(Math.max(...d10Faces), 'd10')
    expect(d10DataSet.animations[1].faceMask).toBe(d10LowestMask)
    expect(d10DataSet.animations[2].faceMask).toBe(d10HighestMask)
    // Ensure the color tracks map correctly: base=0, low=1, high=2
    expect(d10DataSet.animations[1].gradientTrackOffset).toBe(1)
    expect(d10DataSet.animations[2].gradientTrackOffset).toBe(2)

    const d00Faces = DiceUtils.getDieFaces('d00')
    const d00LowestMask = getFaceMask(Math.min(...d00Faces), 'd00')
    const d00HighestMask = getFaceMask(Math.max(...d00Faces), 'd00')
    expect(d00DataSet.animations[1].faceMask).toBe(d00LowestMask)
    expect(d00DataSet.animations[2].faceMask).toBe(d00HighestMask)
    expect(d00DataSet.animations[1].gradientTrackOffset).toBe(1)
    expect(d00DataSet.animations[2].gradientTrackOffset).toBe(2)

    const d6Faces = DiceUtils.getDieFaces('d6')
    const d6LowestMask = getFaceMask(Math.min(...d6Faces), 'd6')
    const d6HighestMask = getFaceMask(Math.max(...d6Faces), 'd6')
    expect(d6DataSet.animations[1].faceMask).toBe(d6LowestMask)
    expect(d6DataSet.animations[2].faceMask).toBe(d6HighestMask)
    expect(d6DataSet.animations[1].gradientTrackOffset).toBe(1)
    expect(d6DataSet.animations[2].gradientTrackOffset).toBe(2)
  })
})

describe('batteryToHighlightAction', () => {
  it('maps battery percent boundaries to actions', () => {
    expect(batteryToHighlightAction(81)).toEqual({ action: 'disconnect' })
    expect(batteryToHighlightAction(80)).toEqual({ action: 'glow', color: 'green' })
    expect(batteryToHighlightAction(61)).toEqual({ action: 'glow', color: 'green' })
    expect(batteryToHighlightAction(60)).toEqual({ action: 'glow', color: 'yellow' })
    expect(batteryToHighlightAction(41)).toEqual({ action: 'glow', color: 'yellow' })
    expect(batteryToHighlightAction(40)).toEqual({ action: 'glow', color: 'red' })
    expect(batteryToHighlightAction(0)).toEqual({ action: 'glow', color: 'red' })
  })
})

describe('startBatteryHighlightCycle', () => {
  it('issues expected commands for a sample set of battery values (single run)', async () => {
    vi.useFakeTimers()

    const service = new PixelsService(useAppStore)

    useAppStore.setState({
      pairedPixelIds: ['pixel-a', 'pixel-b', 'pixel-c'],
      pixels: {
        'pixel-a': { pixelId: 'pixel-a', dieType: 'd6', connectionState: 'connected', batteryLevel: 85, lastFace: null },
        'pixel-b': { pixelId: 'pixel-b', dieType: 'd6', connectionState: 'connected', batteryLevel: 75, lastFace: null },
        'pixel-c': { pixelId: 'pixel-c', dieType: 'd6', connectionState: 'connected', batteryLevel: 35, lastFace: null },
      },
    })

    const disconnectSpy = vi.spyOn(service, 'disconnectDie').mockImplementation(async () => undefined)
    // Spy the internal permanent animation call used by the cycle
    const glowSpy = vi.spyOn(service as any, 'glowSolidColor').mockImplementation(async () => undefined)

    service.startBatteryHighlightCycle({ holdMs: 10, singleRun: true })

    // Let the cycle run
    await vi.advanceTimersByTimeAsync(200)

    expect(disconnectSpy).toHaveBeenCalledWith('pixel-a', 'battery-full-disconnect')
    expect(glowSpy).toHaveBeenCalledWith('pixel-b', expect.any(Object), expect.any(Number))
    expect(glowSpy).toHaveBeenCalledWith('pixel-c', expect.any(Object), expect.any(Number))

    disconnectSpy.mockRestore()
    glowSpy.mockRestore()
  })
})
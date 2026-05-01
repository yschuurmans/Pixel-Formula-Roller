import { getBleUnavailableMessage } from '../../services/pixelsService'
import type { DieType } from '../../types/formula'
import type { AppSettings, PixelEntry, RememberedPixelEntry } from '../../stores/useAppStore'

export const CLEANUP_DIE_ORDER: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
export const CLEANUP_RECONNECT_INTERVAL_MS = 2_000
export const CLEANUP_GLOW_INTERVAL_MS = 5_000
export const CLEANUP_BASE_GLOW = { r: 40, g: 40, b: 40 } as const
export const CLEANUP_TOP_FACE_GLOW = { r: 34, g: 255, b: 94 } as const
export const CLEANUP_BOTTOM_FACE_GLOW = { r: 255, g: 68, b: 68 } as const

export function connectionStatusLabel(connectionState: 'connected' | 'disconnected'): string {
  return connectionState === 'connected' ? 'Connected' : 'Disconnected'
}

export class SettingsScreenController {
  getPixelEntries(pixels: Record<string, PixelEntry>): PixelEntry[] {
    return Object.values(pixels).sort((left, right) => {
      if (left.connectionState !== right.connectionState) {
        return left.connectionState === 'connected' ? -1 : 1
      }

      return left.pixelId.localeCompare(right.pixelId)
    })
  }

  getBleUnavailableMessage(bleAvailable: boolean): string | null {
    return bleAvailable
      ? null
      : getBleUnavailableMessage() ?? 'Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.'
  }

  getReconnectDisabledReason(
    bleAvailable: boolean,
    bleUnavailableMessage: string | null,
    pairedPixelIds: string[],
  ): string | undefined {
    return !bleAvailable
      ? bleUnavailableMessage ?? undefined
      : pairedPixelIds.length === 0
        ? 'Connect a die once to enable reconnect.'
        : undefined
  }

  getConnectedPixelIds(pixelEntries: PixelEntry[]): string[] {
    return pixelEntries
      .filter((pixel) => pixel.connectionState === 'connected')
      .map((pixel) => pixel.pixelId)
  }

  getCleanupConnectedPixelIds(activeCleanupDieType: DieType | null, pixelEntries: PixelEntry[]): string[] {
    return activeCleanupDieType === null
      ? []
      : pixelEntries
          .filter((pixel) => pixel.connectionState === 'connected' && pixel.dieType === activeCleanupDieType)
          .map((pixel) => pixel.pixelId)
  }

  getConnectedCountForDieType(pixelEntries: PixelEntry[], dieType: DieType): number {
    return pixelEntries.filter((pixel) => pixel.connectionState === 'connected' && pixel.dieType === dieType).length
  }

  getRememberedCountForDieType(pairedPixels: Record<string, RememberedPixelEntry>, dieType: DieType): number {
    return Object.values(pairedPixels).filter((pixel) => pixel.dieType === dieType).length
  }

  getRememberedPixelIdsForCleanup(
    pairedPixels: Record<string, RememberedPixelEntry>,
    activeCleanupDieType: DieType,
  ): string[] {
    return Object.values(pairedPixels)
      .filter((pixel) => pixel.dieType === activeCleanupDieType)
      .map((pixel) => pixel.pixelId)
  }

  getConnectedPixelsForCleanup(
    pixels: Record<string, PixelEntry>,
    activeCleanupDieType: DieType,
  ): PixelEntry[] {
    return Object.values(pixels).filter(
      (pixel) => pixel.connectionState === 'connected' && pixel.dieType === activeCleanupDieType,
    )
  }

  getNextCleanupDieType(currentDieType: DieType | null, nextDieType: DieType): DieType | null {
    return currentDieType === nextDieType ? null : nextDieType
  }

  getNextHighlightSettings(settings: AppSettings, enabled: boolean): AppSettings {
    return { ...settings, highlightLowBattery: enabled }
  }
}
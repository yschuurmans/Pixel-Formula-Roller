import { getBleUnavailableMessage } from '../../services/pixelsService'
import {
  ROLL_HISTORY_PREVIEW_LIMIT,
  ROLL_HISTORY_STORAGE_LIMIT,
  type PixelEntry,
  type RollHistoryEntry,
} from '../../stores/useAppStore'

export type ToastState = {
  id: number
  message: string
}

export type MainScreenLocationState = {
  mainBackGuard?: boolean
  toastMessage?: string
}

export class MainScreenController {
  getBannerMessage(bleAvailable: boolean): string | null {
    return bleAvailable
      ? null
      : getBleUnavailableMessage() ?? 'Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.'
  }

  getRecentHistory(rollHistory: RollHistoryEntry[]): RollHistoryEntry[] {
    return rollHistory.slice(0, ROLL_HISTORY_PREVIEW_LIMIT)
  }

  getFullHistory(rollHistory: RollHistoryEntry[]): RollHistoryEntry[] {
    return rollHistory.slice(0, ROLL_HISTORY_STORAGE_LIMIT)
  }

  getConnectedPixelIds(pixels: Record<string, PixelEntry>): string[] {
    return Object.values(pixels)
      .filter((pixel) => pixel.connectionState === 'connected')
      .map((pixel) => pixel.pixelId)
  }
}
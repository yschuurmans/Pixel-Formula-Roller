import type { DieType } from '../types/formula'
import type { RememberedPixelEntry } from '../stores/useAppStore'
import { pickRandomPixels } from './formulaHelpers'
import { useAppStore } from '../stores/useAppStore'
import { markPixelUsed } from '../services/pixelsService'

export type PercentRole = 'tens' | 'ones'

export type RollSlot = {
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

export type ConnectedPixel = {
  pixelId: string
  dieType: DieType
}

export type AvailabilityPlan = {
  disconnectIds: string[]
  connectIds: string[]
}

const DIE_ORDER: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

export function getGlowPixelIdsForSlots(slots: RollSlot[], connectedPixels: ConnectedPixel[]): string[] {
  const promptedPixelIds = new Set<string>()
  const unassignedCounts = new Map<DieType, number>()

  for (const slot of slots) {
    if (slot.source !== 'ble') {
      continue
    }

    if (slot.pixelId !== null) {
      promptedPixelIds.add(slot.pixelId)
      continue
    }

    unassignedCounts.set(slot.dieType, (unassignedCounts.get(slot.dieType) ?? 0) + 1)
  }

  for (const [dieType, count] of unassignedCounts) {
    const availablePixels = connectedPixels.filter(
      (pixel) => pixel.dieType === dieType && !promptedPixelIds.has(pixel.pixelId),
    )

    for (const pixel of pickRandomPixels(availablePixels, Math.min(count, availablePixels.length))) {
      promptedPixelIds.add(pixel.pixelId)
    }
  }

  return Array.from(promptedPixelIds)
}

export function getPendingGlowPixelIds(slots: RollSlot[], connectedPixels: ConnectedPixel[]): string[] {
  return getGlowPixelIdsForSlots(
    slots.filter((slot) => slot.face === null && slot.source === 'ble'),
    connectedPixels,
  )
}

export function assignPendingBlePixelIds(
  slots: RollSlot[],
  connectedPixels: ConnectedPixel[],
): { slots: RollSlot[]; changed: boolean } {
  const assignments = new Map<string, string | null>()

  for (const dieType of DIE_ORDER) {
    const pendingSlots = slots.filter(
      (slot) => slot.face === null && slot.source === 'ble' && slot.dieType === dieType,
    )

    if (pendingSlots.length === 0) {
      continue
    }

    const matchingPixels = connectedPixels.filter((pixel) => pixel.dieType === dieType)
    const assignedPixels =
      matchingPixels.length === 0
        ? []
        : matchingPixels.length === 1
        ? Array.from({ length: pendingSlots.length }, () => matchingPixels[0])
        : pickRandomPixels(matchingPixels, Math.min(pendingSlots.length, matchingPixels.length))

    for (const [index, slot] of pendingSlots.entries()) {
      assignments.set(slot.id, assignedPixels[index]?.pixelId ?? null)
    }
  }

  let changed = false
  const nextSlots = slots.map((slot) => {
    if (slot.face !== null || slot.source !== 'ble') {
      return slot
    }

    const pixelId = assignments.get(slot.id) ?? null
    if (slot.pixelId === pixelId) {
      return slot
    }

    changed = true
    return {
      ...slot,
      pixelId,
    }
  })

  return { slots: nextSlots, changed }
}

export function getRememberedPixelsByDieType(rememberedPixels: Record<string, RememberedPixelEntry>): Map<DieType, RememberedPixelEntry[]> {
  const rememberedByDieType = new Map<DieType, RememberedPixelEntry[]>()

  for (const rememberedPixel of Object.values(rememberedPixels)) {
    const entries = rememberedByDieType.get(rememberedPixel.dieType) ?? []
    entries.push(rememberedPixel)
    rememberedByDieType.set(rememberedPixel.dieType, entries)
  }

  for (const entries of rememberedByDieType.values()) {
    entries.sort((left, right) => (right.lastUsedAt ?? 0) - (left.lastUsedAt ?? 0))
  }

  return rememberedByDieType
}

export function promoteRecoverableManualSlots(
  slots: RollSlot[],
  rememberedPixels: Record<string, RememberedPixelEntry>,
): RollSlot[] {
  const effectiveRememberedPixels = Object.keys(rememberedPixels || {}).length
    ? rememberedPixels
    : useAppStore.getState().pairedPixels

  const rememberedByDieType = getRememberedPixelsByDieType(effectiveRememberedPixels)

  return slots.map((slot) => {
    if (slot.source !== 'manual') {
      return slot
    }

    if (!(rememberedByDieType.get(slot.dieType)?.length)) {
      return slot
    }

    return {
      ...slot,
      source: 'ble',
    }
  })
}

export function getPendingBleCounts(slots: RollSlot[]): Map<DieType, number> {
  const counts = new Map<DieType, number>()

  for (const slot of slots) {
    if (slot.face !== null || slot.source !== 'ble') {
      continue
    }

    counts.set(slot.dieType, (counts.get(slot.dieType) ?? 0) + 1)
  }

  return counts
}

export function buildAvailabilityPlan(
  slots: RollSlot[],
  connectedPixels: ConnectedPixel[],
  rememberedPixels: Record<string, RememberedPixelEntry>,
): AvailabilityPlan {
  const pendingCounts = getPendingBleCounts(slots)
  // Debug: emit pending counts and remembered keys to diagnose availability planning
  // eslint-disable-next-line no-console
  console.log('buildAvailabilityPlan', { pendingCounts: Array.from(pendingCounts.entries()), connectedPixels, rememberedPixelsKeys: Object.keys(rememberedPixels) })
  if (pendingCounts.size === 0) {
    return { disconnectIds: [], connectIds: [] }
  }

  const connectedCounts = new Map<DieType, number>()
  const connectedPixelIds = new Set(connectedPixels.map((pixel) => pixel.pixelId))
  for (const pixel of connectedPixels) {
    connectedCounts.set(pixel.dieType, (connectedCounts.get(pixel.dieType) ?? 0) + 1)
  }

  const effectiveRememberedPixels = Object.keys(rememberedPixels || {}).length
    ? rememberedPixels
    : useAppStore.getState().pairedPixels

  const rememberedByDieType = getRememberedPixelsByDieType(effectiveRememberedPixels)
  const connectCandidates: string[] = []

  for (const dieType of DIE_ORDER) {
    const pendingCount = pendingCounts.get(dieType) ?? 0
    if (pendingCount === 0) continue

    const currentlyConnected = connectedCounts.get(dieType) ?? 0
    const missingCount = Math.max(0, pendingCount - currentlyConnected)
    if (missingCount === 0) continue

    const availableRemembered = (rememberedByDieType.get(dieType) ?? []).filter(
      (pixel) => !connectedPixelIds.has(pixel.pixelId),
    )

    for (const rememberedPixel of availableRemembered) {
      connectCandidates.push(rememberedPixel.pixelId)
    }
  }

  if (connectCandidates.length === 0) {
    return { disconnectIds: [], connectIds: [] }
  }

  const allowedDisconnect = new Map<DieType, number>()
  for (const [dieType, connectedCount] of connectedCounts) {
    const pending = pendingCounts.get(dieType) ?? 0
    allowedDisconnect.set(dieType, Math.max(0, connectedCount - pending))
  }

  const assignedPixelIds = new Set<string>(
    slots.map((s) => s.pixelId).filter((id): id is string => id !== null),
  )

  const connectedByAge = [...connectedPixels]
    .filter((p) => !assignedPixelIds.has(p.pixelId))
    .sort(
      (left, right) => (rememberedPixels[left.pixelId]?.lastUsedAt ?? 0) - (rememberedPixels[right.pixelId]?.lastUsedAt ?? 0),
    )

  const disconnectIds: string[] = []

  for (const pixel of connectedByAge) {
    const allowed = allowedDisconnect.get(pixel.dieType) ?? 0
    if (allowed <= 0) continue

    disconnectIds.push(pixel.pixelId)
    allowedDisconnect.set(pixel.dieType, allowed - 1)

    if (disconnectIds.length === connectCandidates.length) break
  }

  return { disconnectIds, connectIds: connectCandidates }
}

export function hasRecoverableRememberedPixel(
  dieType: DieType,
  rememberedPixels: Record<string, RememberedPixelEntry>,
): boolean {
  return Object.values(rememberedPixels).some((pixel) => pixel.dieType === dieType)
}

export function markAssignedPixelsUsed(slots: RollSlot[]): void {
  const seenPixelIds = new Set<string>()

  for (const slot of slots) {
    if (slot.source !== 'ble' || slot.pixelId === null || seenPixelIds.has(slot.pixelId)) {
      continue
    }

    seenPixelIds.add(slot.pixelId)
    markPixelUsed(slot.pixelId)
  }
}

import { useEffect, useRef } from 'react'
import { onRollResult } from '../services/pixelsService'
import { useAppStore } from '../stores/useAppStore'
import { createDiagnosticHistoryEntry, mergeRollIntoEntry } from '../services/diagnosticRollHistory'
import type { RollHistoryEntry } from '../types/profile'

const DIAGNOSTIC_WINDOW_MS = 5_000

export default function DiagnosticRollHistoryBridge() {
  const addRollHistory = useAppStore((state) => state.addRollHistory)
  const updateRollHistory = useAppStore((state) => state.updateRollHistory)
  const setDiagnosticPendingWindow = useAppStore((state) => state.setDiagnosticPendingWindow)
  const pendingRef = useRef<{ entry: RollHistoryEntry; lastRollAt: number } | null>(null)

  useEffect(() => {
    return () => {
      setDiagnosticPendingWindow(null)
    }
  }, [setDiagnosticPendingWindow])

  useEffect(() => {
    const unsubscribe = onRollResult((pixelId, face, dieType) => {
      const now = Date.now()
      const pending = pendingRef.current

      if (pending !== null && now - pending.lastRollAt <= DIAGNOSTIC_WINDOW_MS) {
        const merged = mergeRollIntoEntry(pending.entry, face, dieType)
        pendingRef.current = { entry: merged, lastRollAt: now }
        updateRollHistory(merged.id, merged)
        setDiagnosticPendingWindow({ entryId: merged.id, expiresAt: now + DIAGNOSTIC_WINDOW_MS })
      } else {
        const entry = createDiagnosticHistoryEntry(pixelId, face, dieType, now)
        pendingRef.current = { entry, lastRollAt: now }
        addRollHistory(entry)
        setDiagnosticPendingWindow({ entryId: entry.id, expiresAt: now + DIAGNOSTIC_WINDOW_MS })
      }
    })

    return unsubscribe
  }, [addRollHistory, updateRollHistory, setDiagnosticPendingWindow])

  return null
}

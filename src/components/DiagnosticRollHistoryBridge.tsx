import { useEffect } from 'react'
import { onRollResult } from '../services/pixelsService'
import { useAppStore } from '../stores/useAppStore'
import { createDiagnosticHistoryEntry } from '../services/diagnosticRollHistory'

export default function DiagnosticRollHistoryBridge() {
  const addRollHistory = useAppStore((state) => state.addRollHistory)

  useEffect(() => {
    const unsubscribe = onRollResult((pixelId, face, dieType) => {
      addRollHistory(createDiagnosticHistoryEntry(pixelId, face, dieType, Date.now()))
    })

    return unsubscribe
  }, [addRollHistory])

  return null
}
import { useEffect, useRef } from 'react'
import { reconnectPairedDice } from '../services/pixelsService'
import { useAppStore } from '../stores/useAppStore'

export default function PairedDiceReconnectBridge() {
  const bleAvailable = useAppStore((s) => s.bleAvailable)
  const pairedPixelIds = useAppStore((s) => s.pairedPixelIds)
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (useAppStore.persist.hasHydrated()) {
      hydratedRef.current = true
      return
    }

    const unsub = useAppStore.persist.onFinishHydration(() => {
      hydratedRef.current = true
    })

    return unsub
  }, [])

  useEffect(() => {
    if (!hydratedRef.current) return
    if (!bleAvailable || pairedPixelIds.length === 0) return
    void reconnectPairedDice({ suppressFailureError: true })
  }, [bleAvailable, pairedPixelIds.length])

  return null
}

// Kept for test compatibility; no-op under the new implementation.
export function resetInitialReconnectForTests() {
  // no-op
}
import { useEffect } from 'react'
import { reconnectPairedDice } from '../services/pixelsService'
import { useAppStore } from '../stores/useAppStore'

let hasAttemptedInitialReconnect = false

export default function PairedDiceReconnectBridge() {
  useEffect(() => {
    const maybeReconnect = () => {
      if (hasAttemptedInitialReconnect) {
        return
      }

      const { pairedPixelIds, bleAvailable } = useAppStore.getState()
      if (!bleAvailable || pairedPixelIds.length === 0) {
        hasAttemptedInitialReconnect = true
        return
      }

      hasAttemptedInitialReconnect = true
      void reconnectPairedDice({ suppressFailureError: true })
    }

    if (useAppStore.persist.hasHydrated()) {
      maybeReconnect()
      return
    }

    const unsubscribe = useAppStore.persist.onFinishHydration(() => {
      maybeReconnect()
    })

    return unsubscribe
  }, [])

  return null
}

export function resetInitialReconnectForTests() {
  hasAttemptedInitialReconnect = false
}
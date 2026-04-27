import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

type AppRouter = {
  state: {
    location: {
      pathname: string
    }
  }
  navigate: (to: string, options?: { replace?: boolean }) => Promise<void>
}

export default function AndroidBackButtonBridge({ router }: { router: AppRouter }) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    let disposed = false
    let listener: { remove: () => Promise<void> } | null = null

    void App.addListener('backButton', () => {
      if (router.state.location.pathname === '/') {
        return
      }

      void router.navigate('/', { replace: true })
    }).then((handle) => {
      if (disposed) {
        void handle.remove()
        return
      }

      listener = handle
    })

    return () => {
      disposed = true
      if (listener) {
        void listener.remove()
      }
    }
  }, [router])

  return null
}
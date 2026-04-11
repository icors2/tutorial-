import { useCallback, useEffect, useRef, useState } from 'react'

function getStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari PWA
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((navigator as any).standalone === true) return true
  return false
}

export function usePwaInstall() {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isStandalone, setIsStandalone] = useState(getStandalone)
  const [installError, setInstallError] = useState<string | null>(null)

  const isIos =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent)

  useEffect(() => {
    const onBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      deferredRef.current = e
      setCanInstall(true)
    }
    const onAppInstalled = () => {
      deferredRef.current = null
      setCanInstall(false)
      setIsStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    setInstallError(null)
    const ev = deferredRef.current
    if (!ev) return
    try {
      await ev.prompt()
      await ev.userChoice
      deferredRef.current = null
      setCanInstall(false)
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Install failed')
    }
  }, [])

  return { canInstall, isStandalone, isIos, install, installError }
}

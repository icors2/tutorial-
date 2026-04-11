import { useState } from 'react'
import { usePwaInstall } from '../hooks/usePwaInstall'

const IOS_HINT_DISMISS_KEY = 'tutodoc_pwa_ios_hint_dismissed'

export function PwaInstallPanel() {
  const { canInstall, isStandalone, isIos, install, installError } = usePwaInstall()
  const [iosDismissed, setIosDismissed] = useState(() => {
    try {
      return localStorage.getItem(IOS_HINT_DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (isStandalone) return null

  if (canInstall) {
    return (
      <div className="pwa-install-panel" role="region" aria-label="Install app">
        <img
          className="pwa-install-panel__logo"
          src="/pwa-192.png"
          width={56}
          height={56}
          alt=""
          decoding="async"
        />
        <div className="pwa-install-panel__body">
          <p className="pwa-install-panel__title">Install TutoDOC</p>
          <p className="pwa-install-panel__text muted">
            Opens from your home screen without the browser toolbar—better for photos and editing
            offline after the first load.
          </p>
          {installError ? <p className="modal__error">{installError}</p> : null}
          <button type="button" className="btn btn--primary" onClick={() => void install()}>
            Install app
          </button>
        </div>
      </div>
    )
  }

  if (isIos && !iosDismissed) {
    return (
      <div className="pwa-install-panel pwa-install-panel--ios" role="region" aria-label="Add to Home Screen">
        <p className="pwa-install-panel__title">Add to Home Screen (iPhone / iPad)</p>
        <p className="pwa-install-panel__text muted">
          Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, to open TutoDOC like an
          app.
        </p>
        <button
          type="button"
          className="btn btn--ghost pwa-install-panel__dismiss"
          onClick={() => {
            try {
              localStorage.setItem(IOS_HINT_DISMISS_KEY, '1')
            } catch {
              /* private mode */
            }
            setIosDismissed(true)
          }}
        >
          Don&apos;t show again
        </button>
      </div>
    )
  }

  return null
}

/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Chromium PWA install prompt (not in lib.dom.d.ts everywhere). */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
}

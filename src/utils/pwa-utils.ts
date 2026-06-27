import { isFirefox, isSafari } from '@/components/shared/utils/browser/browser_detect';
import { localize } from '@deriv-com/translations';

// PWA Utilities for Deriv Bot
export interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

export interface PWAInstallState {
    canInstall: boolean;
    isInstalled: boolean;
    isStandalone: boolean;
    installPrompt: BeforeInstallPromptEvent | null;
}

class PWAManager {
    private installPrompt: BeforeInstallPromptEvent | null = null;
    private installCallbacks: Array<(canInstall: boolean) => void> = [];
    private updateCallbacks: Array<() => void> = [];

    constructor() {
        this.init();
    }

    private init() {
        window.addEventListener('beforeinstallprompt', e => {
            e.preventDefault();
            this.installPrompt = e as BeforeInstallPromptEvent;
            this.notifyInstallCallbacks(true);
        });

        window.addEventListener('appinstalled', () => {
            this.installPrompt = null;
            this.notifyInstallCallbacks(false);
        });
    }

    /**
     * Service worker disabled during Deriv OAuth migration.
     * The old worker was serving cached callback bundles and blocking login fixes.
     */
    async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
        if (!('serviceWorker' in navigator)) return null;

        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.unregister()));

            if ('caches' in window) {
                const cacheKeys = await caches.keys();
                await Promise.all(cacheKeys.map(key => caches.delete(key)));
            }

            console.log('[PWA] Service worker disabled and caches cleared for OAuth reliability');
        } catch (error) {
            console.warn('[PWA] Failed to unregister service worker:', error);
        }

        return null;
    }

    async showInstallPrompt(): Promise<boolean> {
        if (!this.installPrompt) {
            console.warn('[PWA] Install prompt not available');
            return false;
        }

        try {
            await this.installPrompt.prompt();
            const choiceResult = await this.installPrompt.userChoice;

            if (choiceResult.outcome === 'accepted') {
                this.installPrompt = null;
                return true;
            }

            return false;
        } catch (error) {
            console.error('[PWA] Install prompt failed:', error);
            return false;
        }
    }

    canInstall(): boolean {
        return this.installPrompt !== null;
    }

    isInstalled(): boolean {
        return this.isStandalone();
    }

    isStandalone(): boolean {
        return (
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone === true ||
            document.referrer.includes('android-app://')
        );
    }

    getInstallState(): PWAInstallState {
        return {
            canInstall: this.canInstall(),
            isInstalled: this.isInstalled(),
            isStandalone: this.isStandalone(),
            installPrompt: this.installPrompt,
        };
    }

    onInstallStateChange(callback: (canInstall: boolean) => void): () => void {
        this.installCallbacks.push(callback);

        return () => {
            const index = this.installCallbacks.indexOf(callback);
            if (index > -1) {
                this.installCallbacks.splice(index, 1);
            }
        };
    }

    onUpdateAvailable(callback: () => void): () => void {
        this.updateCallbacks.push(callback);

        return () => {
            const index = this.updateCallbacks.indexOf(callback);
            if (index > -1) {
                this.updateCallbacks.splice(index, 1);
            }
        };
    }

    async updateApp(): Promise<void> {
        window.location.reload();
    }

    isIOS(): boolean {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    }

    isAndroid(): boolean {
        return /Android/.test(navigator.userAgent);
    }

    isMobile(): boolean {
        return this.isIOS() || this.isAndroid() || /Mobile|Tablet/.test(navigator.userAgent);
    }

    isSafariDesktop(): boolean {
        return isSafari() && window.innerWidth > 768;
    }

    getInstallInstructions(): string {
        if (this.isIOS()) {
            return localize('Tap the Share button and then "Add to Home Screen"');
        } else if (this.isAndroid()) {
            return localize('Tap the menu button and then "Add to Home Screen" or "Install App"');
        } else {
            return localize("Look for the install button in your browser's address bar");
        }
    }

    private notifyInstallCallbacks(canInstall: boolean) {
        this.installCallbacks.forEach(callback => {
            try {
                callback(canInstall);
            } catch (error) {
                console.error('[PWA] Install callback error:', error);
            }
        });
    }

    private notifyUpdateCallbacks() {
        this.updateCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('[PWA] Update callback error:', error);
            }
        });
    }
}

export const pwaManager = new PWAManager();

export const registerPWA = () => pwaManager.registerServiceWorker();
export const showInstallPrompt = () => pwaManager.showInstallPrompt();
export const canInstallPWA = () => pwaManager.canInstall();
export const isPWAInstalled = () => pwaManager.isInstalled();
export const isPWAStandalone = () => pwaManager.isStandalone();
export const getPWAInstallState = () => pwaManager.getInstallState();
export const onPWAInstallStateChange = (callback: (canInstall: boolean) => void) =>
    pwaManager.onInstallStateChange(callback);
export const onPWAUpdateAvailable = (callback: () => void) => pwaManager.onUpdateAvailable(callback);
export const updatePWA = () => pwaManager.updateApp();
export const isSafariDesktopBrowser = () => isSafari() && window.innerWidth > 768;
export const isUnsupportedPWABrowser = () => !(/Chrome/.test(navigator.userAgent) && !isFirefox() && !isSafari());
export const isChromeOnlyPWA = () => /Chrome/.test(navigator.userAgent) && !isFirefox() && !isSafari();

export const isMobileSource = (): boolean => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('source') === 'mobile';
};

export const isPWALaunch = (): boolean => {
    return pwaManager.isStandalone() && isMobileSource();
};

export const getMobileSourceInfo = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        isMobileSource: urlParams.get('source') === 'mobile',
        isStandalone: pwaManager.isStandalone(),
        isPWALaunch: pwaManager.isStandalone() && urlParams.get('source') === 'mobile',
        userAgent: navigator.userAgent,
        isMobile: pwaManager.isMobile(),
        isIOS: pwaManager.isIOS(),
        isAndroid: pwaManager.isAndroid(),
    };
};

export const PWA_MODAL_STORAGE_KEY = 'pwa-modal-timing';

export interface PWAModalTiming {
    lastShown?: string;
    dismissCount: number;
    firstVisit?: string;
    hasBeenShown: boolean;
}

export const getPWAModalTiming = (): PWAModalTiming => {
    try {
        const stored = localStorage.getItem(PWA_MODAL_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.warn('[PWA] Failed to parse modal timing data:', error);
    }

    return {
        dismissCount: 0,
        hasBeenShown: false,
    };
};

export const setPWAModalTiming = (timing: PWAModalTiming): void => {
    try {
        localStorage.setItem(PWA_MODAL_STORAGE_KEY, JSON.stringify(timing));
    } catch (error) {
        console.warn('[PWA] Failed to save modal timing data:', error);
    }
};

export const markPWAModalShown = (): void => {
    const timing = getPWAModalTiming();
    setPWAModalTiming({
        ...timing,
        firstVisit: timing.firstVisit || new Date().toISOString(),
        hasBeenShown: true,
        lastShown: new Date().toISOString(),
    });
};

export const markPWAModalDismissed = (): void => {
    const timing = getPWAModalTiming();
    setPWAModalTiming({
        ...timing,
        dismissCount: timing.dismissCount + 1,
        hasBeenShown: true,
        lastShown: new Date().toISOString(),
    });
};

export const shouldShowPWAModal = (): boolean => {
    const timing = getPWAModalTiming();
    const now = new Date();

    if (pwaManager.isStandalone()) return false;

    const isChrome = /Chrome/.test(navigator.userAgent) && !isFirefox() && !isSafari();
    if (!isChrome) return false;

    if (pwaManager.isMobile()) return false;

    if (!timing.hasBeenShown && !timing.firstVisit) return true;

    if (timing.dismissCount >= 3) return false;

    if (timing.lastShown) {
        const lastShown = new Date(timing.lastShown);
        const daysSinceLastShown = (now.getTime() - lastShown.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastShown < 7) return false;
    }

    return !timing.hasBeenShown || timing.dismissCount < 3;
};

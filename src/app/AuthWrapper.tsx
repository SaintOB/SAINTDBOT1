import React from 'react';
import ChunkLoader from '@/components/loader/chunk-loader';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { isAllowedAccount, isOwnerAccount } from '@/hooks/useIsOwner';
import { localize } from '@deriv-com/translations';
import { URLUtils } from '@deriv-com/utils';
import App from './App';
import CoursePage from '@/constants/pages/course';
import SplashLogin from '@/components/splash-login/SplashLogin';

// Extend Window interface to include is_tmb_enabled property
declare global {
    interface Window {
        is_tmb_enabled?: boolean;
    }
}

const setLocalStorageToken = async (
    loginInfo: URLUtils.LoginInfo[],
    paramsToDelete: string[],
    _setIsAuthComplete: React.Dispatch<React.SetStateAction<boolean>>,
    isOnline: boolean
) => {
    if (loginInfo.length) {
        try {
            const accountsList: Record<string, string> = {};
            const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

            loginInfo.forEach((account: { loginid: string; token: string; currency: string }) => {
                accountsList[account.loginid] = account.token;
                clientAccounts[account.loginid] = account;
            });

            localStorage.setItem('accountsList', JSON.stringify(accountsList));
            localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

            URLUtils.filterSearchParams(paramsToDelete);

            // Prefer a real (non-virtual) account as the active account.
            const defaultActiveAccount = URLUtils.getDefaultActiveAccount(loginInfo);
            const preferredAccount =
                defaultActiveAccount ?? loginInfo.find(a => !/^VRT|VRW/.test(a.loginid)) ?? loginInfo[0];

            // Commit tokens immediately — we already have everything we need from the
            // OAuth callback URL. This prevents loading-forever if the WebSocket is slow.
            localStorage.setItem('authToken', preferredAccount.token);
            localStorage.setItem('active_loginid', preferredAccount.loginid);

            // Fire-and-forget: enrich with server-side data (country, etc.) in background.
            // Failures here are non-fatal — the app is already unblocked above.
            if (isOnline) {
                (async () => {
                    try {
                        const api = await generateDerivApiInstance();
                        if (!api) return;
                        const result = await Promise.race([
                            api.authorize(preferredAccount.token) as Promise<{
                                authorize: { country: string; account_list: { loginid: string }[] };
                                error?: { code: string };
                            }>,
                            new Promise<never>((_, reject) =>
                                setTimeout(() => reject(new Error('authorize timeout')), 8000)
                            ),
                        ]);
                        api.disconnect();
                        if (result?.authorize?.country) {
                            localStorage.setItem('client.country', result.authorize.country);
                        }
                    } catch {
                        // Background enrichment failed — harmless, tokens already stored.
                    }
                })();
            }
        } catch (error) {
            console.error('Error setting up login info:', error);
            if (loginInfo[0]) {
                localStorage.setItem('authToken', loginInfo[0].token);
                localStorage.setItem('active_loginid', loginInfo[0].loginid);
            }
        }
    }
};

export const AuthWrapper = () => {
    const isCourseRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/course');
    const isCallbackPage = typeof window !== 'undefined' && window.location.pathname === '/callback';

    const [isAuthComplete, setIsAuthComplete] = React.useState(false);
    const { loginInfo, paramsToDelete } = URLUtils.getLoginInfoFromURL();
    const { isOnline } = useOfflineDetection();

    // Hold the static HTML splash for the brand animation to play out (~5s),
    // then dispatch the dismiss event. The splash itself listens for taps,
    // so an impatient user can still skip past it manually.
    React.useEffect(() => {
        if (typeof document === 'undefined') return;
        const t = window.setTimeout(() => {
            try {
                document.dispatchEvent(new Event('splashDismiss'));
            } catch {
                /* ignore */
            }
        }, 5000);
        return () => window.clearTimeout(t);
    }, []);

    if (isCourseRoute) {
        return <CoursePage standalone />;
    }

    // OAuth relay: when teamsaintfx.com visitors log in they are bounced through
    // saintdbot--saintob.replit.app (which has a registered OAuth app). The relay
    // embeds the return URL in the Deriv OAuth `state` param — Deriv echoes it back
    // verbatim so no cookie is needed.  When we land here with tokens AND a `state`
    // that looks like a URL we forward the tokens (minus `state`) to that domain.
    React.useEffect(() => {
        if (!loginInfo.length) return;
        try {
            const params = new URLSearchParams(window.location.search);
            const state = params.get('state');
            if (state && state.startsWith('https://')) {
                // Build the forwarding URL: all current params except `state`
                params.delete('state');
                const qs = params.toString();
                const forwardUrl = state + (qs ? '?' + qs : '');
                window.location.replace(forwardUrl);
                return;
            }
        } catch {
            /* ignore */
        }
    }, [loginInfo]);

    React.useEffect(() => {
        const initializeAuth = async () => {
            try {
                // Pass isOnline to setLocalStorageToken to handle offline mode properly
                await setLocalStorageToken(loginInfo, paramsToDelete, setIsAuthComplete, isOnline);
                URLUtils.filterSearchParams(['lang']);

                // After a fresh OAuth login (loginInfo populated), send the user somewhere useful.
                if (loginInfo.length > 0) {
                    // 1. If they were trying to reach a specific page before login, go there.
                    const redirectPath = localStorage.getItem('login_redirect_path');
                    if (redirectPath) {
                        localStorage.removeItem('login_redirect_path');
                        window.location.replace(window.location.origin + redirectPath);
                        return;
                    }
                    // 2. If the logged-in account is an owner, always land on the admin page.
                    const isOwner = loginInfo.some(a => isOwnerAccount(a.loginid));
                    if (isOwner) {
                        window.location.replace(window.location.origin + '/free-bots');
                        return;
                    }
                }

                setIsAuthComplete(true);
            } catch (error) {
                console.error('[Auth] Authentication initialization failed:', error);
                // Don't block the app if auth fails, especially when offline
                setIsAuthComplete(true);
            }
        };

        // If offline, set auth complete immediately but still run initializeAuth
        // to save login info to localStorage for offline use
        if (!isOnline) {
            console.log('[Auth] Offline detected, proceeding with minimal auth');
            setIsAuthComplete(true);
        }

        initializeAuth();
    }, [loginInfo, paramsToDelete, isOnline]);

    // Add timeout for offline scenarios to prevent infinite loading
    React.useEffect(() => {
        if (!isOnline && !isAuthComplete) {
            console.log('[Auth] Offline detected, setting auth timeout');
            const timeout = setTimeout(() => {
                console.log('[Auth] Offline timeout reached, proceeding without full auth');
                setIsAuthComplete(true);
            }, 2000); // 2 second timeout for offline

            return () => clearTimeout(timeout);
        }
    }, [isOnline, isAuthComplete]);

    const getLoadingMessage = () => {
        if (!isOnline) return localize('Loading offline mode...');
        return localize('Initializing...');
    };

    // After the base auth is complete, do a live server check so accounts added
    // via Account Manager after deployment are recognised without a redeployment.
    const [liveAllowed, setLiveAllowed] = React.useState<boolean | null>(null);
    const activeLoginid = typeof window !== 'undefined' ? localStorage.getItem('active_loginid') : null;

    React.useEffect(() => {
        if (!isAuthComplete) return;
        if (!activeLoginid) {
            setLiveAllowed(false);
            return;
        }

        // Build the full list of candidate accounts to check:
        // 1. The current active_loginid
        // 2. All real (non-virtual) accounts from accountsList
        // This handles the common case where active_loginid is a VR account
        // but the user has a real account that IS on the allowed list.
        const accountsList: Record<string, string> = JSON.parse(
            (typeof window !== 'undefined' && localStorage.getItem('accountsList')) || '{}'
        );
        const realAccounts = Object.keys(accountsList).filter(id => !/^VRT|VRW/.test(id));
        const candidates = [activeLoginid, ...realAccounts.filter(id => id !== activeLoginid)];

        // Check hardcoded owner accounts first — skip the network round-trip
        const hardcodedAllowed = candidates.find(id => isAllowedAccount(id));
        if (hardcodedAllowed) {
            // If a real account is allowed but isn't the active one, promote it
            if (hardcodedAllowed !== activeLoginid && accountsList[hardcodedAllowed]) {
                localStorage.setItem('active_loginid', hardcodedAllowed);
                localStorage.setItem('authToken', accountsList[hardcodedAllowed]);
            }
            setLiveAllowed(true);
            return;
        }

        // New/unknown account — ask the live server.
        // Prefer checking a real account over a virtual one.
        const idToCheck = realAccounts[0] ?? activeLoginid;
        fetch(`/api/check-account?id=${encodeURIComponent(idToCheck)}`, { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (data?.allowed === true) {
                    // Promote the real account to active if it differs
                    if (idToCheck !== activeLoginid && accountsList[idToCheck]) {
                        localStorage.setItem('active_loginid', idToCheck);
                        localStorage.setItem('authToken', accountsList[idToCheck]);
                    }
                    setLiveAllowed(true);
                } else {
                    setLiveAllowed(false);
                }
            })
            // Network error → fail open. Bot file endpoints are still server-protected,
            // so letting the UI load on a connectivity hiccup is safe.
            .catch(() => setLiveAllowed(true));
    }, [isAuthComplete, activeLoginid]);

    if (!isAuthComplete || liveAllowed === null) {
        return <ChunkLoader message={getLoadingMessage()} />;
    }

    const savedAuthToken = localStorage.getItem('authToken');
    const savedLoginId = localStorage.getItem('active_loginid');
    const hasNewOAuthLogin = Boolean(savedAuthToken && savedLoginId);

    if (!isCallbackPage && !hasNewOAuthLogin && (!activeLoginid || !liveAllowed)) {
        return <SplashLogin />;
    }

    return <App />;
};

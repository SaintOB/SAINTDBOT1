import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import Cookies from 'js-cookie';
import { observer } from 'mobx-react-lite';
import ErrorBoundary from '@/components/error-component/error-boundary';
import ErrorComponent from '@/components/error-component/error-component';
import ChunkLoader from '@/components/loader/chunk-loader';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import useTMB from '@/hooks/useTMB';
import { localize } from '@deriv-com/translations';
import './app-root.scss';

/**
 * Processes legacy OAuth acct1/token1/cur1 params returned by Deriv after login.
 * Stores them in localStorage, sets the logged_state cookie, and clears the URL.
 * Returns true if tokens were processed (caller should return null to avoid rendering).
 */
const processLegacyOAuthTokens = (): boolean => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('acct1') || !params.has('token1')) return false;

    const accountsList: Record<string, string> = {};
    const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

    let i = 1;
    while (params.has(`acct${i}`)) {
        const acct = params.get(`acct${i}`) ?? '';
        const token = params.get(`token${i}`) ?? '';
        const currency = params.get(`cur${i}`) ?? 'USD';
        if (acct && token) {
            accountsList[acct] = token;
            clientAccounts[acct] = { loginid: acct, token, currency };
        }
        i++;
    }

    localStorage.setItem('accountsList', JSON.stringify(accountsList));
    localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
    localStorage.setItem('authToken', params.get('token1') ?? '');
    localStorage.setItem('active_loginid', params.get('acct1') ?? '');

    // Use the full hostname as domain — public suffixes like replit.app are
    // rejected by browsers when used as cookie domain.
    Cookies.set('logged_state', 'true', {
        domain: window.location.hostname,
        expires: 30,
        path: '/',
        secure: true,
    });

    // Restore the path the user was trying to reach before login (e.g. /custom-bots)
    const redirectPath = localStorage.getItem('login_redirect_path') || '';
    localStorage.removeItem('login_redirect_path');

    // Remove OAuth params from URL then reload so the app boots cleanly with tokens set
    window.location.replace(window.location.origin + redirectPath);
    return true;
};

const AppContent = lazy(() => import('./app-content'));

const AppRootLoader = () => {
    return <ChunkLoader message={localize('Loading...')} />;
};

const ErrorComponentWrapper = observer(() => {
    const { common } = useStore();

    if (!common.error) return null;

    return (
        <ErrorComponent
            header={common.error?.header}
            message={common.error?.message}
            redirect_label={common.error?.redirect_label}
            redirectOnClick={common.error?.redirectOnClick}
            should_clear_error_on_click={common.error?.should_clear_error_on_click}
            setError={common.setError}
            redirect_to={common.error?.redirect_to}
            should_redirect={common.error?.should_redirect}
        />
    );
});

const AppRoot = () => {
    // All hooks must be called unconditionally before any early returns —
    // React requires a consistent hook call order on every render.
    const store = useStore();
    const api_base_initialized = useRef(false);
    const [is_api_initialized, setIsApiInitialized] = useState(false);
    const [is_tmb_check_complete, setIsTmbCheckComplete] = useState(false);
    const [, setIsTmbEnabled] = useState(false);
    const { isTmbEnabled } = useTMB();

    // Effect to check TMB status - independent of API initialization
    useEffect(() => {
        let cancelled = false;

        // Hard cap: if TMB check doesn't resolve in 3 s, proceed anyway.
        // On iOS/cellular the fetch can hang indefinitely, blocking app load.
        const fallbackTimer = setTimeout(() => {
            if (!cancelled) {
                setIsTmbCheckComplete(true);
            }
        }, 3000);

        const checkTmbStatus = async () => {
            try {
                const tmb_status = await isTmbEnabled();
                if (!cancelled) {
                    const final_status = tmb_status || window.is_tmb_enabled === true;
                    setIsTmbEnabled(final_status);
                    setIsTmbCheckComplete(true);
                }
            } catch (error) {
                console.error('TMB check failed:', error);
                if (!cancelled) setIsTmbCheckComplete(true);
            } finally {
                clearTimeout(fallbackTimer);
            }
        };

        checkTmbStatus();

        return () => {
            cancelled = true;
            clearTimeout(fallbackTimer);
        };
    }, []);

    // Initialize API when TMB check is complete with timeout fallback
    useEffect(() => {
        if (!is_tmb_check_complete) {
            return; // Wait until TMB check is complete
        }

        const timeoutId = setTimeout(() => {
            if (!is_api_initialized) {
                setIsApiInitialized(true);
            }
        }, 5000);

        const initializeApi = async () => {
            if (!api_base_initialized.current) {
                try {
                    await api_base.init();
                    api_base_initialized.current = true;
                } catch (error) {
                    console.error('API initialization failed:', error);
                    api_base_initialized.current = false;
                } finally {
                    setIsApiInitialized(true);
                    clearTimeout(timeoutId); // Clear timeout if API init completes
                }
            }
        };

        initializeApi();
        return () => clearTimeout(timeoutId);
    }, [is_tmb_check_complete]);

    // Legacy OAuth: Deriv sends acct1/token1 params to the root after login.
    // Checked AFTER all hooks so React's hook-call order stays consistent.
    // processLegacyOAuthTokens() calls window.location.replace() and returns true
    // when tokens are present — the page navigates away so we just render null.
    if (processLegacyOAuthTokens()) return null;

    if (!store || !is_api_initialized) return <AppRootLoader />;

    return (
        <Suspense fallback={<AppRootLoader />}>
            <ErrorBoundary root_store={store}>
                <ErrorComponentWrapper />
                <AppContent />
            </ErrorBoundary>
        </Suspense>
    );
};

export default AppRoot;

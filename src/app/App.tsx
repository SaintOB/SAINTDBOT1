import { initSurvicate } from '../public-path';
import { lazy, Suspense } from 'react';
import React from 'react';
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router-dom';
import ChunkLoader from '@/components/loader/chunk-loader';
import RoutePromptDialog from '@/components/route-prompt-dialog';
import { crypto_currencies_display_order, fiat_currencies_display_order } from '@/components/shared';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { StoreProvider } from '@/hooks/useStore';
import CallbackPage from '@/constants/pages/callback';
import Endpoint from '@/constants/pages/endpoint';
import RegisterApp from '@/constants/pages/register-app';
import { TAuthData } from '@/types/api-types';
import { initializeI18n, localize, TranslationProvider } from '@deriv-com/translations';
import CoreStoreProvider from './CoreStoreProvider';
import './app-root.scss';
import './saint-scroll-fix.scss';

const Layout = lazy(() => import('../components/layout'));
const AppRoot = lazy(() => import('./app-root'));
const FreeBots = lazy(() => import('../constants/pages/free-bots'));
const AnalysisTool = lazy(() => import('../constants/pages/analysis-tool'));

const { TRANSLATIONS_CDN_URL, R2_PROJECT_NAME, CROWDIN_BRANCH_NAME } = process.env;
const i18nInstance = initializeI18n({
    cdnUrl: `${TRANSLATIONS_CDN_URL}/${R2_PROJECT_NAME}/${CROWDIN_BRANCH_NAME}`,
});

// Simple Suspense wrapper without timeout that causes dark landing page
const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => {
    const { isOnline } = useOfflineDetection();

    const getLoadingMessage = () => {
        if (!isOnline) return localize('Loading offline dashboard...');
        return localize('Please wait while we connect to the server...');
    };

    return <Suspense fallback={<ChunkLoader message={getLoadingMessage()} />}>{children}</Suspense>;
};

const AppProviders = ({ children }: { children: React.ReactNode }) => (
    <SuspenseWrapper>
        <TranslationProvider defaultLang='EN' i18nInstance={i18nInstance}>
            <StoreProvider>
                <RoutePromptDialog />
                <CoreStoreProvider>{children}</CoreStoreProvider>
            </StoreProvider>
        </TranslationProvider>
    </SuspenseWrapper>
);

const router = createBrowserRouter(
    createRoutesFromElements(
        <>
            <Route path='register-app' element={<RegisterApp />} />
            <Route path='bot-builder' element={<Navigate to='/?from=saint-bots#bot-builder' replace />} />
            <Route
                path='custom-bots'
                element={
                    <AppProviders>
                        <FreeBots />
                    </AppProviders>
                }
            />
            <Route
                path='free-bots'
                element={
                    <AppProviders>
                        <FreeBots />
                    </AppProviders>
                }
            />
            <Route
                path='/'
                element={
                    <AppProviders>
                        <Layout />
                    </AppProviders>
                }
            >
                {/* All child routes will be passed as children to Layout */}
                <Route index element={<AppRoot />} />
                <Route path='endpoint' element={<Endpoint />} />
                <Route path='/callback' element={<CallbackPage />} />
                <Route path='analysis-tool' element={<AnalysisTool />} />
                {/* Clean tab routes — no hash, no underscores */}
                <Route path='dashboard' element={<AppRoot />} />
                <Route path='chart' element={<AppRoot />} />
                <Route path='tutorial' element={<AppRoot />} />
            </Route>
        </>
    )
);

function App() {
    React.useEffect(() => {
        // Use the invalid token handler hook to automatically retrigger OIDC authentication
        // when an invalid token is detected and the cookie logged state is true

        initSurvicate();
        window?.dataLayer?.push({ event: 'page_load' });
        return () => {
            // Clean up the invalid token handler when the component unmounts
            const survicate_box = document.getElementById('survicate-box');
            if (survicate_box) {
                survicate_box.style.display = 'none';
            }
        };
    }, []);

    React.useEffect(() => {
        const resetSaintBotsLayout = () => {
            const path = window.location.pathname;
            const isSaintBotsPage = path.includes('free-bots') || path.includes('custom-bots');
            if (!isSaintBotsPage) return;

            document.documentElement.style.overflowY = 'auto';
            document.documentElement.style.height = 'auto';
            document.body.style.overflowY = 'auto';
            document.body.style.height = 'auto';

            document
                .querySelectorAll<HTMLElement>(
                    '#root, .layout, .main-body, .bot-dashboard, .main, .main__container, .dc-tabs, .dc-tabs__content, [class*=dc-tabs__content], #id-free-bots, .free-bots-wrapper, .free-bots'
                )
                .forEach(element => {
                    element.style.maxHeight = 'none';
                    element.style.height = 'auto';
                    element.style.overflowY = 'visible';
                });

            document.querySelectorAll<HTMLElement>('.app-footer, .risk-disclaimer').forEach(element => {
                element.style.display = 'none';
            });
        };

        resetSaintBotsLayout();
        const interval = window.setInterval(resetSaintBotsLayout, 300);
        window.addEventListener('pageshow', resetSaintBotsLayout);
        window.addEventListener('popstate', resetSaintBotsLayout);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener('pageshow', resetSaintBotsLayout);
            window.removeEventListener('popstate', resetSaintBotsLayout);
        };
    }, []);

    React.useEffect(() => {
        const accounts_list = localStorage.getItem('accountsList');
        const client_accounts = localStorage.getItem('clientAccounts');
        const url_params = new URLSearchParams(window.location.search);
        const account_currency = url_params.get('account');
        const validCurrencies = [...fiat_currencies_display_order, ...crypto_currencies_display_order];

        const is_valid_currency = account_currency && validCurrencies.includes(account_currency?.toUpperCase());

        if (!accounts_list || !client_accounts) return;

        try {
            const parsed_accounts = JSON.parse(accounts_list);
            const parsed_client_accounts = JSON.parse(client_accounts) as TAuthData['account_list'];

            const updateLocalStorage = (token: string, loginid: string) => {
                localStorage.setItem('authToken', token);
                localStorage.setItem('active_loginid', loginid);
            };

            // Handle demo account
            if (account_currency?.toUpperCase() === 'DEMO') {
                const demo_account = Object.entries(parsed_accounts).find(([key]) => key.startsWith('VR'));

                if (demo_account) {
                    const [loginid, token] = demo_account;
                    updateLocalStorage(String(token), loginid);
                    return;
                }
            }

            // Handle real account with valid currency
            if (account_currency?.toUpperCase() !== 'DEMO' && is_valid_currency) {
                const real_account = Object.entries(parsed_client_accounts).find(
                    ([loginid, account]) =>
                        !loginid.startsWith('VR') && account.currency.toUpperCase() === account_currency?.toUpperCase()
                );

                if (real_account) {
                    const [loginid, account] = real_account;
                    if ('token' in account) {
                        updateLocalStorage(String(account?.token), loginid);
                    }
                    return;
                }
            }
        } catch (e) {
            console.warn('Error', e); // eslint-disable-line no-console
        }
    }, []);

    return <RouterProvider router={router} />;
}

export default App;

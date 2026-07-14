import { useState } from 'react';
import { useEffect } from 'react';
import Cookies from 'js-cookie';
import RootStore from '@/stores/root-store';
import { getNewDerivOAuthUrl } from '@/components/shared';
import { clearAuthData, handleOidcAuthFailure } from '@/utils/auth-utils';
import { Analytics } from '@deriv-com/analytics';

const isSaintDbotDomain = () => {
    const hostname = window.location.hostname;
    return (
        hostname.includes('.replit.app') ||
        hostname.includes('.binary.sx') ||
        hostname === 'localhost' ||
        hostname === 'teamsaintfx.com' ||
        hostname === 'www.teamsaintfx.com' ||
        hostname === 'saintdbot-1.vercel.app' ||
        (hostname.startsWith('saintdbot-1-') && hostname.endsWith('.vercel.app'))
    );
};

/**
 * Provides an object with properties: `oAuthLogout`, `retriggerOAuth2Login`, and `isSingleLoggingIn`.
 *
 * `oAuthLogout` is a function that logs out the user of the OAuth2-enabled app.
 *
 * `retriggerOAuth2Login` is a function that retriggers the OAuth2 login flow to get a new token.
 *
 * `isSingleLoggingIn` is a boolean that indicates whether the user is currently logging in.
 *
 * The `handleLogout` argument is an optional function that will be called after logging out the user.
 * If `handleLogout` is not provided, the function will resolve immediately.
 *
 * @param {{ handleLogout?: () => Promise<void> }} [options] - An object with an optional `handleLogout` property.
 * @returns {{ oAuthLogout: () => Promise<void>; retriggerOAuth2Login: () => Promise<void>; isSingleLoggingIn: boolean }}
 */
export const useOauth2 = ({
    handleLogout,
    client,
}: {
    handleLogout?: () => Promise<void>;
    client?: RootStore['client'];
} = {}) => {
    const [isSingleLoggingIn, setIsSingleLoggingIn] = useState(false);
    const accountsList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
    const isClientAccountsPopulated = Object.keys(accountsList).length > 0;
    const isSilentLoginExcluded =
        window.location.pathname.includes('callback') || window.location.pathname.includes('endpoint');

    const loggedState = Cookies.get('logged_state');

    useEffect(() => {
        window.addEventListener('unhandledrejection', event => {
            if (event?.reason?.error?.code === 'InvalidToken') {
                setIsSingleLoggingIn(false);
            }
        });
    }, []);

    useEffect(() => {
        if (isSaintDbotDomain()) {
            // SaintDBot uses its own PKCE login button and callback handler.
            // Do not let Deriv Bot's old silent SSO/SLO logic fire in the background,
            // because it calls the packaged auth-client without our client_id and causes loops.
            setIsSingleLoggingIn(false);
            return;
        }

        const willEventuallySSO = loggedState === 'true' && !isClientAccountsPopulated;
        const willEventuallySLO = loggedState === 'false' && isClientAccountsPopulated;

        if (!isSilentLoginExcluded && (willEventuallySSO || willEventuallySLO)) {
            setIsSingleLoggingIn(true);
        } else {
            setIsSingleLoggingIn(false);
        }
    }, [isClientAccountsPopulated, loggedState, isSilentLoginExcluded]);

    const logoutHandler = async () => {
        client?.setIsLoggingOut(true);
        try {
            if (isSaintDbotDomain()) {
                clearAuthData();
                Cookies.remove('logged_state');
                await (handleLogout ?? (() => Promise.resolve()))();
                await client?.logout().catch(err => {
                    // eslint-disable-next-line no-console
                    console.error('Error during TMB logout:', err);
                });
                Analytics.reset();
                return;
            }

            const { OAuth2Logout } = await import('@deriv-com/auth-client');
            await OAuth2Logout({
                redirectCallbackUri: `${window.location.origin}/callback`,
                WSLogoutAndRedirect: handleLogout ?? (() => Promise.resolve()),
                postLogoutRedirectUri: window.location.origin,
            }).catch(err => {
                // eslint-disable-next-line no-console
                console.error(err);
            });
            await client?.logout().catch(err => {
                // eslint-disable-next-line no-console
                console.error('Error during TMB logout:', err);
            });

            Analytics.reset();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error(error);
        }
    };
    const retriggerOAuth2Login = async () => {
        // SaintDBot callback expects the new code+PKCE Deriv login flow.
        // Do not use the old oauth.deriv.com app_id redirect here.
        if (isSaintDbotDomain()) {
            window.location.href = await getNewDerivOAuthUrl();
            return;
        }
        try {
            const { requestOidcAuthentication } = await import('@deriv-com/auth-client');
            await requestOidcAuthentication({
                redirectCallbackUri: `${window.location.origin}/callback`,
                postLogoutRedirectUri: window.location.origin,
            }).catch(err => {
                handleOidcAuthFailure(err);
            });
        } catch (error) {
            handleOidcAuthFailure(error);
        }
    };

    return { oAuthLogout: logoutHandler, retriggerOAuth2Login, isSingleLoggingIn };
};
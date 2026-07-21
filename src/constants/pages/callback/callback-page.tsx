import Cookies from 'js-cookie';
import { useEffect, useState } from 'react';
import { Button } from '@deriv-com/ui';

const DERIV_OAUTH_CLIENT_ID = '33FCBGiyjs6CSnISZHJT3';

const decodeJwtPayload = (token: string) => {
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
};

const pickLoginId = (data: any): string => {
    if (!data || typeof data !== 'object') return '';

    return (
        data.loginid ||
        data.login_id ||
        data.account ||
        data.account_id ||
        data.deriv_loginid ||
        data.preferred_account ||
        data.default_account ||
        data.client_id ||
        data.sub ||
        data.profile?.loginid ||
        data.profile?.login_id ||
        data.profile?.account ||
        data.accounts?.[0]?.loginid ||
        data.accounts?.[0]?.login_id ||
        data.account_list?.[0]?.loginid ||
        data.account_list?.[0]?.login_id ||
        ''
    );
};

const saveLogin = (loginid: string, token: string, currency = 'USD', isModernOAuth = false) => {
    const clientAccounts: Record<string, any> = {
        [loginid]: {
            loginid,
            token,
            currency,
            is_disabled: 0,
            is_oauth2: isModernOAuth,
        },
    };

    const accountsList: Record<string, string> = {
        [loginid]: token,
    };

    localStorage.setItem('authToken', token);
    localStorage.setItem('active_loginid', loginid);
    localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
    localStorage.setItem('accountsList', JSON.stringify(accountsList));
    localStorage.setItem('callback_token', JSON.stringify({ loginid, token_saved: true, currency, is_oauth2: isModernOAuth }));

    if (isModernOAuth) {
        // The upgraded OAuth2 access token is not the old Deriv Bot session token.
        // Keeping logged_state=true makes the legacy Deriv auth-client try silent auth and throw missing client_id errors.
        Cookies.remove('logged_state');
        document.cookie = 'logged_state=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        return;
    }

    Cookies.set('logged_state', 'true', {
        expires: 30,
        sameSite: 'Lax',
        secure: window.location.protocol === 'https:',
    });
};

const getLoginIdFromProfile = async (accessToken: string) => {
    const response = await fetch('/api/deriv/oauth/profile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: accessToken }),
    });

    const text = await response.text();
    let data: any;

    try {
        data = JSON.parse(text);
    } catch {
        return { loginid: '', profile: {}, error: 'profile_non_json', raw: text.slice(0, 120) };
    }

    if (!response.ok || data.error || !data.loginid) {
        console.warn('[Deriv OAuth Profile Lookup]', data);
        return { loginid: '', profile: data?.profile || {}, error: data?.error || 'loginid_not_found', attempts: data?.attempts || [] };
    }

    return data;
};

const redirectToBots = () => {
    window.location.replace(`/free-bots?login=success&t=${Date.now()}`);
};

const CallbackPage = () => {
    const queryParams = new URLSearchParams(window.location.search);
    const oauthCode = queryParams.get('code');
    const legacyToken = queryParams.get('token1') || queryParams.get('token');
    const legacyLoginId = queryParams.get('acct1') || queryParams.get('loginid') || queryParams.get('account');
    const legacyCurrency = queryParams.get('cur1') || queryParams.get('currency') || 'USD';

    if (legacyToken && legacyLoginId) {
        saveLogin(legacyLoginId, legacyToken, legacyCurrency, false);
        redirectToBots();
        return null;
    }

    if (!oauthCode) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2>Deriv Login</h2>
                <p>No login token was found.</p>
                <p>Please return to the bot page and click Log in with Deriv again.</p>
                <Button
                    onClick={() => {
                        window.location.href = '/custom-bots';
                    }}
                >
                    Return to Bot Login
                </Button>
            </div>
        );
    }

    const NewOAuthCallback = () => {
        const [status, setStatus] = useState('Connecting your Deriv account...');
        const [error, setError] = useState('');
        const [isSuccess, setIsSuccess] = useState(false);

        useEffect(() => {
            const exchangeCode = async () => {
                try {
                    const returnedState = queryParams.get('state');
                    const savedState = sessionStorage.getItem('deriv_oauth_state');
                    const codeVerifier = sessionStorage.getItem('deriv_oauth_code_verifier');

                    if (!codeVerifier) {
                        throw new Error('Missing secure login verifier. Please try logging in again.');
                    }

                    if (savedState && returnedState && savedState !== returnedState) {
                        throw new Error('Security check failed. Please try logging in again.');
                    }

                    const response = await fetch('/api/deriv/oauth/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            code: oauthCode,
                            code_verifier: codeVerifier,
                            redirect_uri: `${window.location.origin}/callback`,
                            client_id: DERIV_OAUTH_CLIENT_ID,
                        }),
                    });

                    const responseText = await response.text();
                    let data: any;

                    try {
                        data = JSON.parse(responseText);
                    } catch {
                        throw new Error(`Token exchange returned non-JSON response: ${responseText.slice(0, 120)}`);
                    }

                    if (!response.ok || data.error) {
                        throw new Error(data.error_description || data.message || data.error || 'Token exchange failed');
                    }

                    const accessToken = data.access_token || data.token;

                    if (!accessToken) {
                        throw new Error('No access token returned from Deriv.');
                    }

                    const profileResult = await getLoginIdFromProfile(accessToken);
                    const decodedAccessToken = decodeJwtPayload(accessToken) || {};
                    const decodedIdToken = data.id_token ? decodeJwtPayload(data.id_token) || {} : {};

                    const profile = profileResult.profile || {};
                    const accountList = Array.isArray(profile.account_list)
                        ? profile.account_list
                        : Array.isArray(profile.accounts)
                          ? profile.accounts
                          : [];

                    const accountLoginId = accountList
                        .map((account: any) => account?.loginid || account?.login_id)
                        .find(Boolean);

                    const realLoginId =
                        accountLoginId ||
                        profileResult.loginid ||
                        pickLoginId(profileResult.profile) ||
                        pickLoginId(data) ||
                        pickLoginId(decodedIdToken) ||
                        pickLoginId(decodedAccessToken) ||
                        'oauth_user';

                    const realCurrency = profile.currency || profile.account_list?.[0]?.currency || profile.accounts?.[0]?.currency || 'USD';

                    saveLogin(realLoginId, accessToken, realCurrency, true);
                    localStorage.setItem(
                        'deriv_oauth_debug',
                        JSON.stringify({ tokenResponseKeys: Object.keys(data || {}), profileResult, decodedAccessToken, decodedIdToken })
                    );

                    sessionStorage.removeItem('deriv_oauth_code_verifier');
                    sessionStorage.removeItem('deriv_oauth_state');

                    setIsSuccess(true);
                    setStatus(`Login successful. Opening Saint Bots...`);
                    window.setTimeout(redirectToBots, 300);
                } catch (err) {
                    console.error('[Deriv OAuth Error]', err);

                    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);

                    setError(message || 'Deriv login failed.');
                    setStatus('Deriv login could not complete.');
                }
            };

            exchangeCode();
        }, []);

        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2>Deriv Login</h2>
                <p>{status}</p>

                {error && <p style={{ color: '#d32f2f', maxWidth: '520px', margin: '16px auto' }}>{error}</p>}

                <Button
                    onClick={() => {
                        if (isSuccess) {
                            redirectToBots();
                            return;
                        }
                        window.location.href = '/custom-bots';
                    }}
                >
                    {isSuccess ? 'Continue to Saint Bots' : 'Return to Login'}
                </Button>
            </div>
        );
    };

    return <NewOAuthCallback />;
};

export default CallbackPage;

import Cookies from 'js-cookie';
import { useEffect, useState } from 'react';
import { crypto_currencies_display_order, fiat_currencies_display_order } from '@/components/shared';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { clearAuthData } from '@/utils/auth-utils';
import { Callback } from '@deriv-com/auth-client';
import { Button } from '@deriv-com/ui';

const DERIV_OAUTH_CLIENT_ID = '33FCBGiyjs6CSnISZHJT3';
const CALLBACK_TIMEOUT_MS = 8000;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([promise, new Promise<null>(resolve => setTimeout(() => resolve(null), ms))]);

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
        throw new Error(`Profile lookup returned non-JSON response: ${text.slice(0, 120)}`);
    }

    if (!response.ok || data.error || !data.loginid) {
        console.error('[Deriv OAuth Profile Lookup]', data);
        throw new Error(data.error || 'Could not get real Deriv login ID from OAuth profile.');
    }

    return data;
};

/**
 * Gets the selected currency or falls back to appropriate defaults
 */
const getSelectedCurrency = (
    tokens: Record<string, string>,
    clientAccounts: Record<string, any>,
    state: any
): string => {
    const getQueryParams = new URLSearchParams(window.location.search);
    const currency =
        (state && state?.account) ||
        getQueryParams.get('account') ||
        sessionStorage.getItem('query_param_currency') ||
        '';
    const firstAccountKey = tokens.acct1;
    const firstAccountCurrency = clientAccounts[firstAccountKey]?.currency;

    const validCurrencies = [...fiat_currencies_display_order, ...crypto_currencies_display_order];
    if (tokens.acct1?.startsWith('VR') || currency === 'demo') return 'demo';
    if (currency && validCurrencies.includes(currency.toUpperCase())) return currency;
    return firstAccountCurrency || 'USD';
};

const CallbackPage = () => {
    const queryParams = new URLSearchParams(window.location.search);
    const oauthCode = queryParams.get('code');

    if (oauthCode) {
        const NewOAuthCallback = () => {
            const [status, setStatus] = useState('Connecting your Deriv account...');
            const [error, setError] = useState('');

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
                            throw new Error(
                                data.error_description || data.message || data.error || 'Token exchange failed'
                            );
                        }

                        const accessToken = data.access_token || data.token;

                        if (!accessToken) {
                            throw new Error('No access token returned from Deriv.');
                        }

                        const profileResult = await getLoginIdFromProfile(accessToken);
                        const realLoginId = profileResult.loginid;
                        const profile = profileResult.profile || {};
                        const realCurrency = profile.currency || profile.account_list?.[0]?.currency || profile.accounts?.[0]?.currency || 'USD';
                        const accountList = Array.isArray(profile.account_list)
                            ? profile.account_list
                            : Array.isArray(profile.accounts)
                              ? profile.accounts
                              : [];

                        const clientAccounts: Record<string, any> = {
                            [realLoginId]: {
                                loginid: realLoginId,
                                token: accessToken,
                                currency: realCurrency,
                                is_disabled: 0,
                            },
                        };

                        const accountsList: Record<string, string> = {
                            [realLoginId]: accessToken,
                        };

                        accountList.forEach((account: any) => {
                            const loginid = account?.loginid || account?.login_id;
                            if (!loginid) return;
                            accountsList[loginid] = accessToken;
                            clientAccounts[loginid] = {
                                loginid,
                                token: accessToken,
                                currency: account.currency || realCurrency || 'USD',
                                is_disabled: 0,
                            };
                        });

                        localStorage.setItem('authToken', accessToken);
                        localStorage.setItem('active_loginid', realLoginId);
                        localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
                        localStorage.setItem('accountsList', JSON.stringify(accountsList));
                        localStorage.setItem('callback_token', JSON.stringify(profileResult));

                        Cookies.set('logged_state', 'true', {
                            expires: 30,
                            sameSite: 'Lax',
                            secure: window.location.protocol === 'https:',
                        });

                        sessionStorage.removeItem('deriv_oauth_code_verifier');
                        sessionStorage.removeItem('deriv_oauth_state');

                        setStatus(`Login successful. Login ID: ${realLoginId}`);

                        window.location.href = '/free-bots';
                    } catch (err) {
                        console.error('[Deriv OAuth Error]', err);

                        const message =
                            err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);

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
                            window.location.href = '/';
                        }}
                    >
                        Return to Login
                    </Button>
                </div>
            );
        };

        return <NewOAuthCallback />;
    }
    return (
        <Callback
            onSignInSuccess={async (tokens: Record<string, string>, rawState: unknown) => {
                const state = rawState as { account?: string } | null;
                const accountsList: Record<string, string> = {};
                const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

                for (const [key, value] of Object.entries(tokens)) {
                    if (key.startsWith('acct')) {
                        const tokenKey = key.replace('acct', 'token');
                        if (tokens[tokenKey]) {
                            accountsList[value] = tokens[tokenKey];
                            clientAccounts[value] = {
                                loginid: value,
                                token: tokens[tokenKey],
                                currency: '',
                            };
                        }
                    } else if (key.startsWith('cur')) {
                        const accKey = key.replace('cur', 'acct');
                        if (tokens[accKey]) {
                            clientAccounts[tokens[accKey]].currency = value;
                        }
                    }
                }

                localStorage.setItem('accountsList', JSON.stringify(accountsList));
                localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

                let is_token_set = false;

                try {
                    const api = await withTimeout(generateDerivApiInstance(), CALLBACK_TIMEOUT_MS);
                    if (api) {
                        const result = await withTimeout((api as any).authorize(tokens.token), CALLBACK_TIMEOUT_MS);
                        (api as any).disconnect?.();

                        if (result) {
                            const { authorize, error } = result as any;
                            if (error) {
                                if (error.code === 'InvalidToken' && Cookies.get('logged_state') === 'false') {
                                    clearAuthData();
                                }
                                is_token_set = true;
                            } else if (authorize) {
                                localStorage.setItem('callback_token', JSON.stringify(authorize));
                                const clientAccountsArray = Object.values(clientAccounts);
                                const firstId = authorize?.account_list?.[0]?.loginid;
                                const filteredTokens = clientAccountsArray.filter(
                                    account => account.loginid === firstId
                                );
                                if (filteredTokens.length) {
                                    localStorage.setItem('authToken', filteredTokens[0].token);
                                    localStorage.setItem('active_loginid', filteredTokens[0].loginid);
                                    is_token_set = true;
                                }
                            }
                        }
                    }
                } catch {
                    // Timed out or error — fall through to token fallback below
                }

                if (!is_token_set) {
                    localStorage.setItem('authToken', tokens.token1);
                    localStorage.setItem('active_loginid', tokens.acct1);
                }
                Cookies.set('logged_state', 'true', {
                    expires: 30,
                    sameSite: 'Lax',
                    secure: window.location.protocol === 'https:',
                });

                const selected_currency = getSelectedCurrency(tokens, clientAccounts, state);
                window.location.replace(window.location.origin + `/free-bots?account=${selected_currency}`);
            }}
            renderReturnButton={() => {
                return (
                    <Button
                        className='callback-return-button'
                        onClick={() => {
                            window.location.href = '/';
                        }}
                    >
                        {'Return to Bot'}
                    </Button>
                );
            }}
        />
    );
};

export default CallbackPage;

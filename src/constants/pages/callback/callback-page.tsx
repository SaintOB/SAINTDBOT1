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

const CallbackPage = () => {
    const queryParams = new URLSearchParams(window.location.search);
    const oauthCode = queryParams.get('code');

    if (!oauthCode) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2>Deriv Login</h2>
                <p>No new OAuth login code was found.</p>
                <p>If you already logged in, return to the bot page and continue.</p>
                <Button
                    onClick={() => {
                        window.location.href = '/free-bots';
                    }}
                >
                    Return to Bot
                </Button>
            </div>
        );
    }

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

                    const oauthDebug = {
                        tokenResponseKeys: Object.keys(data || {}),
                        profileResult,
                        decodedAccessToken,
                        decodedIdToken,
                    };

                    localStorage.setItem('authToken', accessToken);
                    localStorage.setItem('active_loginid', realLoginId);
                    localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
                    localStorage.setItem('accountsList', JSON.stringify(accountsList));
                    localStorage.setItem('callback_token', JSON.stringify(profileResult));
                    localStorage.setItem('deriv_oauth_debug', JSON.stringify(oauthDebug));

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
                        window.location.href = '/';
                    }}
                >
                    Return to Login
                </Button>
            </div>
        );
    };

    return <NewOAuthCallback />;
};

export default CallbackPage;

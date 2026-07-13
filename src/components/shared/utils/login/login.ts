import { CookieStorage, isStorageSupported, LocalStore } from '../storage/storage';

const DERIV_CLIENT_ID = '33FCBGiyjs6CSnISZHJT3';

const generateRandomString = (length = 64) => {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);

    return Array.from(array)
        .map(value => ('0' + value.toString(16)).slice(-2))
        .join('');
};

const base64UrlEncode = (buffer: ArrayBuffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

const generateCodeChallenge = async (verifier: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);

    return base64UrlEncode(digest);
};

export const getNewDerivOAuthUrl = async () => {
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString(32);

    sessionStorage.setItem('deriv_oauth_code_verifier', codeVerifier);
    sessionStorage.setItem('deriv_oauth_state', state);

    const url = new URL('https://auth.deriv.com/oauth2/auth');
    url.searchParams.set('client_id', DERIV_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', `${window.location.origin}/callback`);
    url.searchParams.set('scope', 'trade');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return url.toString();
};

export const redirectToLogin = (is_logged_in: boolean, _language: string, has_params = true, redirect_delay = 0) => {
    if (!is_logged_in && isStorageSupported(sessionStorage)) {
        const l = window.location;
        const redirect_url = has_params ? window.location.href : `${l.protocol}//${l.host}${l.pathname}`;
        sessionStorage.setItem('redirect_url', redirect_url);
        setTimeout(async () => {
            window.location.href = await getNewDerivOAuthUrl();
        }, redirect_delay);
    }
};

export const redirectToSignUp = () => {
    window.open('https://deriv.com/signup/');
};

type TLoginUrl = {
    language: string;
};

export const loginUrl = (_options: TLoginUrl) => {
    const server_url = LocalStore.get('config.server_url');
    const signup_device_cookie = new (CookieStorage as any)('signup_device');
    const signup_device = signup_device_cookie.get('signup_device');
    const date_first_contact_cookie = new (CookieStorage as any)('date_first_contact');
    const date_first_contact = date_first_contact_cookie.get('date_first_contact');

    void server_url;
    void signup_device;
    void date_first_contact;

    return `${window.location.origin}/`;
};

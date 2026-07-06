import { CookieStorage, isStorageSupported, LocalStore } from '../storage/storage';

const SAINTDBOT_APP_ID = 133598;

export const getNewDerivOAuthUrl = async () => {
    const url = new URL('https://oauth.deriv.com/oauth2/authorize');
    url.searchParams.set('app_id', String(SAINTDBOT_APP_ID));
    url.searchParams.set('l', 'en');
    url.searchParams.set('brand', 'deriv');
    url.searchParams.set('redirect_uri', `${window.location.origin}/callback`);
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
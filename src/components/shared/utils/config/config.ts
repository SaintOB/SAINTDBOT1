import { LocalStorageConstants, LocalStorageUtils, URLUtils } from '@deriv-com/utils';
import { isStaging } from '../url/helpers';

export const APP_IDS = {
    LOCALHOST: 36300,
    TMP_STAGING: 64584,
    STAGING: 29934,
    STAGING_BE: 29934,
    STAGING_ME: 29934,
    PRODUCTION: 65555,
    PRODUCTION_BE: 65556,
    PRODUCTION_ME: 65557,
    SAINTDBOT: 133598,
    TEAMSAINTFX: 133598,
};
export const OAUTH_CLIENT_IDS = {
    TEAMSAINTFX: '33FCBGiyjs6CSnISZHJT3',
};

export const livechat_license_id = 12049137;
export const livechat_client_id = '66aa088aad5a414484c1fd1fa8a5ace7';

const isSaintDbotVercelHost = (hostname: string) =>
    hostname === 'saintdbot-1.vercel.app' || (hostname.startsWith('saintdbot-1-') && hostname.endsWith('.vercel.app'));

const generateRandomString = (length = 64) => {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);

    return Array.from(array)
        .map(value => ('0' + value.toString(16)).slice(-2))
        .join('');
};

const rightRotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));

const sha256 = (message: string) => {
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    const words: number[] = [];
    const ascii: string = unescape(encodeURIComponent(message));
    const asciiBitLength = ascii[lengthProperty] * 8;
    const hash: number[] = [];
    const k: number[] = [];
    let primeCounter = 0;

    const isComposite: Record<number, boolean> = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (let i = 0; i < 313; i += candidate) {
                isComposite[i] = true;
            }
            hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }

    for (let i = 0; i < ascii[lengthProperty]; i++) {
        words[i >> 2] |= ascii.charCodeAt(i) << (((3 - i) % 4) * 8);
    }
    words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
    words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

    for (let j = 0; j < words[lengthProperty]; ) {
        const w = words.slice(j, (j += 16));
        const oldHash = hash.slice(0);

        for (let i = 0; i < 64; i++) {
            const w15 = w[i - 15];
            const w2 = w[i - 2];
            const a = hash[0];
            const e = hash[4];
            const temp1 =
                hash[7] +
                (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
                ((e & hash[5]) ^ (~e & hash[6])) +
                k[i] +
                (w[i] =
                    i < 16
                        ? w[i]
                        : (w[i - 16] +
                              (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                              w[i - 7] +
                              (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                          0);
            const temp2 =
                (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
                ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

            hash.unshift((temp1 + temp2) | 0);
            hash[4] = (hash[4] + temp1) | 0;
            hash.pop();
        }

        for (let i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }

    const result: number[] = [];
    for (let i = 0; i < 8; i++) {
        for (let j = 3; j + 1; j--) {
            result.push((hash[i] >> (j * 8)) & 255);
        }
    }
    return new Uint8Array(result);
};

const base64UrlEncode = (bytes: Uint8Array) => {
    let binary = '';
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const generatePkceOAuthURL = () => {
    const verifier = generateRandomString(64);
    const state = generateRandomString(32);
    const challenge = base64UrlEncode(sha256(verifier));

    sessionStorage.setItem('deriv_oauth_code_verifier', verifier);
    sessionStorage.setItem('deriv_oauth_state', state);

    const url = new URL('https://auth.deriv.com/oauth2/auth');
    url.searchParams.set('client_id', OAUTH_CLIENT_IDS.TEAMSAINTFX);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', `${window.location.origin}/callback`);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
};

export const domain_app_ids = {
    'master.bot-standalone.pages.dev': APP_IDS.TMP_STAGING,
    'staging-dbot.deriv.com': APP_IDS.STAGING,
    'staging-dbot.deriv.be': APP_IDS.STAGING_BE,
    'staging-dbot.deriv.me': APP_IDS.STAGING_ME,
    'dbot.deriv.com': APP_IDS.PRODUCTION,
    'dbot.deriv.be': APP_IDS.PRODUCTION_BE,
    'dbot.deriv.me': APP_IDS.PRODUCTION_ME,
    'saintdbot--saintob.replit.app': APP_IDS.SAINTDBOT,
    'saintdbot-1.vercel.app': APP_IDS.SAINTDBOT,
    'teamsaintfx.com': APP_IDS.TEAMSAINTFX,
    'www.teamsaintfx.com': APP_IDS.TEAMSAINTFX,
};

export const getCurrentProductionDomain = () =>
    !/^staging\./.test(window.location.hostname) &&
    Object.keys(domain_app_ids).find(domain => window.location.hostname === domain);

export const isProduction = () => {
    const all_domains = Object.keys(domain_app_ids).map(domain => `(www\\.)?${domain.replace('.', '\\.')}`);
    return new RegExp(`^(${all_domains.join('|')})$`, 'i').test(window.location.hostname);
};

export const isLocal = () => /localhost(:\d+)?$/i.test(window.location.hostname);

const isTeamSaintFxDeploy = () =>
    window.location.hostname === 'teamsaintfx.com' || window.location.hostname === 'www.teamsaintfx.com';

export const isTestLink = () => {
    const hostname = window.location.hostname;
    return (
        window.location.origin?.includes('.binary.sx') ||
        window.location.origin?.includes('bot-65f.pages.dev') ||
        window.location.origin?.includes('.replit.app') ||
        isSaintDbotVercelHost(hostname) ||
        isTeamSaintFxDeploy() ||
        isLocal()
    );
};

export const isSaintDbotDeploy = () => {
    const hostname = window.location.hostname;
    return (
        hostname.includes('.replit.app') ||
        hostname.includes('.binary.sx') ||
        isSaintDbotVercelHost(hostname) ||
        isTeamSaintFxDeploy()
    );
};

const getDefaultServerURL = () => {
    if (isTestLink()) {
        return 'ws.derivws.com';
    }

    let active_loginid_from_url;
    const search = window.location.search;
    if (search) {
        const params = new URLSearchParams(document.location.search.substring(1));
        active_loginid_from_url = params.get('acct1');
    }

    const loginid = window.localStorage.getItem('active_loginid') ?? active_loginid_from_url;
    const is_real = loginid && !/^(VRT|VRW)/.test(loginid);

    const server = is_real ? 'green' : 'blue';
    const server_url = `${server}.derivws.com`;

    return server_url;
};

export const getDefaultAppIdAndUrl = () => {
    const server_url = getDefaultServerURL();

    if (isTeamSaintFxDeploy()) {
        return { app_id: APP_IDS.TEAMSAINTFX, server_url };
    }
    if (isSaintDbotDeploy()) {
        return { app_id: APP_IDS.SAINTDBOT, server_url };
    }

    if (isTestLink()) {
        return { app_id: APP_IDS.LOCALHOST, server_url };
    }

    const current_domain = getCurrentProductionDomain() ?? '';
    const app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? APP_IDS.PRODUCTION;

    return { app_id, server_url };
};

export const getAppId = () => {
    let app_id = null;
    const config_app_id = window.localStorage.getItem('config.app_id');
    const current_domain = getCurrentProductionDomain() ?? '';

    if (config_app_id) {
        app_id = config_app_id;
    } else if (isStaging()) {
        app_id = APP_IDS.STAGING;
    } else if (isTeamSaintFxDeploy()) {
        app_id = APP_IDS.TEAMSAINTFX;
    } else if (isSaintDbotDeploy()) {
        app_id = APP_IDS.SAINTDBOT;
    } else if (isTestLink()) {
        app_id = APP_IDS.LOCALHOST;
    } else {
        app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? APP_IDS.PRODUCTION;
    }

    return app_id;
};

export const getSocketURL = () => {
    const local_storage_server_url = window.localStorage.getItem('config.server_url');
    if (local_storage_server_url) return local_storage_server_url;

    const server_url = getDefaultServerURL();

    return server_url;
};

export const checkAndSetEndpointFromUrl = () => {
    if (isTestLink()) {
        const url_params = new URLSearchParams(location.search.slice(1));

        if (url_params.has('qa_server') && url_params.has('app_id')) {
            const qa_server = url_params.get('qa_server') || '';
            const app_id = url_params.get('app_id') || '';

            url_params.delete('qa_server');
            url_params.delete('app_id');

            if (/^(^(www\.)?qa[0-9]{1,4}\.deriv\.dev|(.*)\.derivws\.com)$/.test(qa_server) && /^[a-zA-Z0-9]+$/.test(app_id)) {
                localStorage.setItem('config.app_id', app_id);
                localStorage.setItem('config.server_url', qa_server.replace(/"/g, ''));
            }

            const params = url_params.toString();
            const hash = location.hash;

            location.href = `${location.protocol}//${location.hostname}${location.pathname}${
                params ? `?${params}` : ''
            }${hash || ''}`;

            return true;
        }
    }

    return false;
};

export const getDebugServiceWorker = () => {
    const debug_service_worker_flag = window.localStorage.getItem('debug_service_worker');
    if (debug_service_worker_flag) return !!parseInt(debug_service_worker_flag);

    return false;
};

export const generateOAuthURL = () => {
    const hostname = window.location.hostname;
    const isSaintDbotDomain =
        hostname.includes('.replit.app') ||
        hostname.includes('.binary.sx') ||
        isSaintDbotVercelHost(hostname) ||
        isTeamSaintFxDeploy() ||
        hostname === 'localhost';

    if (isSaintDbotDomain) {
        return generatePkceOAuthURL();
    }

    try {
        const { getOauthURL } = URLUtils;
        const oauth_url = getOauthURL();
        const original_url = new URL(oauth_url);

        const configured_server_url = (LocalStorageUtils.getValue(LocalStorageConstants.configServerURL) ||
            localStorage.getItem('config.server_url')) as string;
        const valid_server_urls = ['green.derivws.com', 'red.derivws.com', 'blue.derivws.com', 'canary.derivws.com'];

        if (
            configured_server_url &&
            (typeof configured_server_url === 'string'
                ? !valid_server_urls.includes(configured_server_url)
                : !valid_server_urls.includes(JSON.stringify(configured_server_url)))
        ) {
            original_url.hostname = configured_server_url;
        } else if (original_url.hostname.includes('oauth.deriv.')) {
            if (hostname.includes('.deriv.me')) {
                original_url.hostname = 'oauth.deriv.me';
            } else if (hostname.includes('.deriv.be')) {
                original_url.hostname = 'oauth.deriv.be';
            } else {
                const current_domain = getCurrentProductionDomain();
                if (current_domain) {
                    const domain_suffix = current_domain.replace(/^[^.]+\./, '');
                    original_url.hostname = `oauth.${domain_suffix}`;
                }
            }
        }

        if (!original_url.searchParams.get('app_id')) {
            original_url.searchParams.set('app_id', String(APP_IDS.PRODUCTION));
        }

        return original_url.toString();
    } catch {
        return `https://auth.deriv.com/oauth2/auth?client_id=${OAUTH_CLIENT_IDS.TEAMSAINTFX}&response_type=code&redirect_uri=https://teamsaintfx.com/callback`;
    }
};
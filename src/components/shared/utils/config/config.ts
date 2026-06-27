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
    SAINTDBOT: 133598, // registered redirect: https://saintdbot-1.vercel.app (trade only)
    TEAMSAINTFX: 133598, // registered redirect: https://teamsaintfx.com  (read+trade only)
};
export const OAUTH_CLIENT_IDS = {
    TEAMSAINTFX: '32OGVtMBW9fF9IgLLgMYh',
};

export const livechat_license_id = 12049137;
export const livechat_client_id = '66aa088aad5a414484c1fd1fa8a5ace7';

const isSaintDbotVercelHost = (hostname: string) =>
    hostname === 'saintdbot-1.vercel.app' || (hostname.startsWith('saintdbot-1-') && hostname.endsWith('.vercel.app'));

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

export const isTestLink = () => {
    const hostname = window.location.hostname;
    return (
        window.location.origin?.includes('.binary.sx') ||
        window.location.origin?.includes('bot-65f.pages.dev') ||
        window.location.origin?.includes('.replit.app') ||
        isSaintDbotVercelHost(hostname) ||
        hostname === 'teamsaintfx.com' ||
        hostname === 'www.teamsaintfx.com' ||
        isLocal()
    );
};

export const isLocal = () => /localhost(:\d+)?$/i.test(window.location.hostname);

// True on all SaintDBot-owned domains
export const isSaintDbotDeploy = () => {
    const hostname = window.location.hostname;
    return (
        hostname.includes('.replit.app') ||
        hostname.includes('.binary.sx') ||
        isSaintDbotVercelHost(hostname) ||
        hostname === 'teamsaintfx.com' ||
        hostname === 'www.teamsaintfx.com'
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

const isTeamSaintFxDeploy = () =>
    window.location.hostname === 'teamsaintfx.com' || window.location.hostname === 'www.teamsaintfx.com';

export const getDefaultAppIdAndUrl = () => {
    const server_url = getDefaultServerURL();

    // teamsaintfx.com uses its own dedicated Deriv app (133598) which has
    // https://teamsaintfx.com registered as the redirect URI. Tokens issued by
    // that app must be authorized with the same app_id — using 133621 here would
    // cause an InvalidToken error.
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
        // Must match the OAuth app (133598) — tokens are issued for TEAMSAINTFX
        app_id = APP_IDS.TEAMSAINTFX;
    } else if (isSaintDbotDeploy()) {
        // Deployed site: must match the OAuth app_id so authorize succeeds
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

            if (/^(^(www\.)?qa[0-9]{1,4}\.deriv.dev|(.*)\.derivws\.com)$/.test(qa_server) && /^[a-zA-Z0-9]+$/.test(app_id)) {
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
    // Always build the OAuth URL from scratch for our deployment to avoid any
    // library quirks (empty app_id, wrong redirect_uri, etc.)
    const hostname = window.location.hostname;
    const isSaintDbotDomain =
        hostname.includes('.replit.app') ||
        hostname.includes('.binary.sx') ||
        isSaintDbotVercelHost(hostname) ||
        hostname === 'teamsaintfx.com' ||
        hostname === 'www.teamsaintfx.com' ||
        hostname === 'localhost';

    if (isSaintDbotDomain) {
        const isTeamSaintFxDomain = hostname === 'teamsaintfx.com' || hostname === 'www.teamsaintfx.com';

        if (isTeamSaintFxDomain) {
            // teamsaintfx.com has its own Deriv OAuth app (133598) with
            // https://teamsaintfx.com registered as the redirect URI.
            // Go straight to Deriv — no relay needed. Deriv redirects back
            // to teamsaintfx.com automatically after login.
            const url = new URL('https://oauth.deriv.com/oauth2/authorize');
            url.searchParams.set('app_id', String(APP_IDS.TEAMSAINTFX));
            url.searchParams.set('l', 'en');
            url.searchParams.set('brand', 'deriv');
            url.searchParams.set('redirect_uri', `${window.location.origin}/callback`);
            return url.toString();
        }

        // SaintDBot uses its own registered Deriv app directly.
        // For Vercel preview URLs, always return to the production domain that is
        // registered in the Deriv app settings.
        const redirectOrigin = isSaintDbotVercelHost(hostname) ? 'https://saintdbot-1.vercel.app' : window.location.origin;
        const url = new URL('https://oauth.deriv.com/oauth2/authorize');
        url.searchParams.set('app_id', String(APP_IDS.SAINTDBOT));
        url.searchParams.set('l', 'en');
        url.searchParams.set('brand', 'deriv');
        url.searchParams.set('redirect_uri', redirectOrigin);
        return url.toString();
    }

    // For all other domains fall through to the library + patch
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
        // Ultimate fallback
        return `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_IDS.SAINTDBOT}&l=en&brand=deriv&redirect_uri=https://saintdbot-1.vercel.app`;
    }
};

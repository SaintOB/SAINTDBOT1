import { getAppId, getSocketURL } from '@/components/shared';
import { website_name } from '@/utils/site-config';
import DerivAPIBasic from '@deriv/deriv-api/dist/DerivAPIBasic';
import { getInitialLanguage } from '@deriv-com/translations';
import APIMiddleware from './api-middleware';

const safeParse = value => {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
};

export const generateDerivApiInstance = () => {
    const cleanedServer = getSocketURL().replace(/[^a-zA-Z0-9.]/g, '');
    const cleanedAppId = getAppId()?.replace?.(/[^a-zA-Z0-9]/g, '') ?? getAppId();
    const socket_url = `wss://${cleanedServer}/websockets/v3?app_id=${cleanedAppId}&l=${getInitialLanguage()}&brand=${website_name.toLowerCase()}`;
    const deriv_socket = new WebSocket(socket_url);
    const deriv_api = new DerivAPIBasic({
        connection: deriv_socket,
        middleware: new APIMiddleware({}),
    });
    return deriv_api;
};

export const getLoginId = () => {
    const login_id = localStorage.getItem('active_loginid');
    if (login_id && login_id !== 'null') return login_id;
    return null;
};

export const V2GetActiveToken = () => {
    const active_loginid = getLoginId();
    const accountsList = safeParse(localStorage.getItem('accountsList'));

    if (active_loginid && accountsList?.[active_loginid]) {
        return accountsList[active_loginid];
    }

    const clientAccounts = safeParse(localStorage.getItem('clientAccounts'));
    if (active_loginid && clientAccounts?.[active_loginid]?.token) {
        return clientAccounts[active_loginid].token;
    }

    const token = localStorage.getItem('authToken');
    if (token && token !== 'null') return token;
    return null;
};

export const V2GetActiveClientId = () => {
    const active_loginid = getLoginId();
    if (active_loginid) return active_loginid;

    const token = V2GetActiveToken();
    if (!token) return null;

    const account_list = safeParse(localStorage.getItem('accountsList'));
    if (account_list && account_list !== 'null') {
        const active_clientId = Object.keys(account_list).find(key => account_list[key] === token);
        return active_clientId;
    }
    return null;
};

export const getToken = () => {
    const active_loginid = getLoginId();
    const client_accounts = safeParse(localStorage.getItem('accountsList')) ?? undefined;
    const active_account = (client_accounts && client_accounts[active_loginid]) || V2GetActiveToken() || undefined;
    return {
        token: active_account ?? undefined,
        account_id: active_loginid ?? undefined,
    };
};
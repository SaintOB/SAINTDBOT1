import { useApiBase } from './useApiBase';
import allowedConfig from '../../config/allowed-accounts.json';

const OWNER_ACCOUNTS = [
    'CR2706667',
    'CR2824740',
    'VRTC4566944',
    'oauth_fc2184da-758f-4917-a185-17aa06177d8f',
];

/**
 * Allowed accounts are managed in /config/allowed-accounts.json
 * Add or remove account IDs there — no code changes needed.
 */
export const ALLOWED_ACCOUNTS: string[] = allowedConfig.accounts.map((id: string) => id.toUpperCase());

export const isOwnerAccount = (loginid: string | null | undefined): boolean => {
    if (!loginid) return false;
    return OWNER_ACCOUNTS.map(id => id.toUpperCase()).includes(loginid.toUpperCase());
};

export const isAllowedAccount = (loginid: string | null | undefined): boolean => {
    if (!loginid) return false;
    const id = loginid.toUpperCase();
    return isOwnerAccount(id) || ALLOWED_ACCOUNTS.includes(id);
};

const useIsOwner = (): boolean => {
    const { activeLoginid } = useApiBase();
    const storedLoginid =
        typeof window !== 'undefined' ? localStorage.getItem('active_loginid') : null;
    return isOwnerAccount(activeLoginid) || isOwnerAccount(storedLoginid);
};

export default useIsOwner;

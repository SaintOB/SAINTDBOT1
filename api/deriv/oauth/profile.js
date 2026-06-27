const DERIV_OAUTH_CLIENT_ID = '33FCBGiyjs6CSnISZHJT3';

const POSSIBLE_PROFILE_ENDPOINTS = [
    'https://oauth.deriv.com/oauth2/userinfo',
    'https://oauth.deriv.com/userinfo',
    'https://auth.deriv.com/oauth2/userinfo',
    'https://auth.deriv.com/userinfo',
];

const pickLoginId = data => {
    if (!data || typeof data !== 'object') return '';

    const legacyLoginId =
        data.loginid ||
        data.login_id ||
        data.account ||
        data.account_id ||
        data.preferred_account ||
        data.default_account ||
        data.deriv_loginid ||
        data.accounts?.[0]?.loginid ||
        data.accounts?.[0]?.login_id ||
        data.account_list?.[0]?.loginid ||
        data.account_list?.[0]?.login_id ||
        '';

    if (legacyLoginId) return legacyLoginId;

    // New Deriv OAuth userinfo may not expose the old CR/VRTC login ID.
    // The OAuth subject is still a unique user identity, so use it with a prefix.
    if (data.sub) return `oauth_${data.sub}`;
    if (data.cid) return `oauth_${data.cid}`;

    return '';
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    const { access_token } = req.body || {};

    if (!access_token) {
        return res.status(400).json({ error: 'missing_access_token' });
    }

    const attempts = [];

    for (const endpoint of POSSIBLE_PROFILE_ENDPOINTS) {
        try {
            const url = new URL(endpoint);
            url.searchParams.set('client_id', DERIV_OAUTH_CLIENT_ID);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    Accept: 'application/json',
                },
            });

            const text = await response.text();
            let data = null;

            try {
                data = text ? JSON.parse(text) : null;
            } catch {
                data = { raw: text.slice(0, 300) };
            }

            const loginid = pickLoginId(data);

            attempts.push({
                endpoint,
                status: response.status,
                loginid,
                keys: data && typeof data === 'object' ? Object.keys(data) : [],
            });

            if (response.ok && loginid) {
                return res.status(200).json({ loginid, profile: data, attempts });
            }
        } catch (error) {
            attempts.push({ endpoint, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    }

    return res.status(404).json({ error: 'loginid_not_found', attempts });
}

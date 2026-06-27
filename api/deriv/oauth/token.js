export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    try {
        const { code, code_verifier, redirect_uri, client_id } = req.body || {};

        if (!code || !code_verifier || !redirect_uri || !client_id) {
            return res.status(400).json({ error: 'missing_required_fields' });
        }

        const body = new URLSearchParams();
        body.set('grant_type', 'authorization_code');
        body.set('code', code);
        body.set('code_verifier', code_verifier);
        body.set('redirect_uri', redirect_uri);
        body.set('client_id', client_id);

        const response = await fetch('https://auth.deriv.com/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: body.toString(),
        });

        const text = await response.text();
        let data;

        try {
            data = JSON.parse(text);
        } catch {
            data = { error: 'invalid_response', message: text.slice(0, 500) };
        }

        return res.status(response.status).json(data);
    } catch (error) {
        return res.status(500).json({
            error: 'server_error',
            message: error instanceof Error ? error.message : 'Unknown server error',
        });
    }
}

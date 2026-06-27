import React, { useState } from 'react';

const WS_URL = 'wss://ws.derivws.com/websockets/v3?app_id=36300';

const RegisterApp = () => {
    const [token, setToken] = useState('');
    const [status, setStatus] = useState('');
    const [appId, setAppId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    const run = () => {
        if (!token.trim()) {
            setStatus('Please paste your API token first.');
            return;
        }
        setLoading(true);
        setStatus('Connecting to Deriv...');
        setAppId(null);

        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            setStatus('Connected. Authorizing token...');
            ws.send(JSON.stringify({ authorize: token.trim() }));
        };

        ws.onmessage = (e: MessageEvent) => {
            const msg = JSON.parse(e.data);

            if (msg.msg_type === 'authorize') {
                if (msg.error) {
                    setStatus(`❌ Auth failed: ${msg.error.message}`);
                    setLoading(false);
                    ws.close();
                    return;
                }
                setStatus('Authorized! Registering app...');
                ws.send(
                    JSON.stringify({
                        app_register: 1,
                        name: 'SaintDBot Production',
                        redirect_uri: 'https://saintdbot--saintob.replit.app',
                        scopes: ['read', 'trade', 'payments', 'admin'],
                    })
                );
            }

            if (msg.msg_type === 'app_register') {
                if (msg.error) {
                    setStatus(`❌ Registration failed: ${msg.error.message}`);
                    setLoading(false);
                    ws.close();
                    return;
                }
                const id = msg.app_register?.app_id;
                setAppId(id);
                setStatus(`✅ App registered! Your numeric App ID is below. Send this number to configure login.`);
                setLoading(false);
                ws.close();
            }
        };

        ws.onerror = () => {
            setStatus('❌ WebSocket error. Check your connection and try again.');
            setLoading(false);
        };

        ws.onclose = () => {
            if (loading) setLoading(false);
        };
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#0e0e0e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'monospace',
            }}
        >
            <div
                style={{
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: 12,
                    padding: 40,
                    maxWidth: 540,
                    width: '100%',
                }}
            >
                <h2 style={{ color: '#ff4444', marginBottom: 8 }}>App Registration Tool</h2>
                <p style={{ color: '#aaa', fontSize: 14, marginBottom: 24 }}>
                    Paste an <strong style={{ color: '#fff' }}>Admin-scope API token</strong> from your Deriv account.
                    <br />
                    Get one at{' '}
                    <a
                        href='https://developers.deriv.com/dashboard/applications'
                        target='_blank'
                        rel='noreferrer'
                        style={{ color: '#ff6666' }}
                    >
                        developers.deriv.com
                    </a>{' '}
                    → API tokens tab → Create with Admin scope.
                </p>

                <label style={{ color: '#aaa', fontSize: 13, display: 'block', marginBottom: 6 }}>API Token</label>
                <input
                    type='text'
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    placeholder='Paste your Admin API token here'
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: '#111',
                        border: '1px solid #444',
                        borderRadius: 6,
                        color: '#fff',
                        fontSize: 14,
                        boxSizing: 'border-box',
                        marginBottom: 16,
                    }}
                />

                <button
                    onClick={run}
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '12px',
                        background: loading ? '#555' : '#c00',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 15,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                    }}
                >
                    {loading ? 'Working...' : 'Register App & Get Numeric ID'}
                </button>

                {status && (
                    <p style={{ color: '#ccc', fontSize: 13, marginTop: 20, lineHeight: 1.5 }}>{status}</p>
                )}

                {appId !== null && (
                    <div
                        style={{
                            marginTop: 20,
                            background: '#111',
                            border: '2px solid #ff4444',
                            borderRadius: 8,
                            padding: 20,
                            textAlign: 'center',
                        }}
                    >
                        <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>Your Numeric App ID</p>
                        <p
                            style={{
                                color: '#ff4444',
                                fontSize: 36,
                                fontWeight: 'bold',
                                margin: '8px 0 0',
                                letterSpacing: 2,
                            }}
                        >
                            {appId}
                        </p>
                        <p style={{ color: '#888', fontSize: 12, margin: '8px 0 0' }}>
                            Screenshot this number and send it to configure your login.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RegisterApp;

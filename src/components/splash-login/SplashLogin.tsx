import { useEffect } from 'react';
import { generateOAuthURL } from '@/components/shared';
import { OAUTH_CLIENT_IDS } from '@/components/shared/utils/config/config';
import { clearAuthData } from '@/utils/auth-utils';
import './splash-login.scss';

const SOCIAL_LINKS = [
    {
        name: 'Instagram',
        url: 'https://www.instagram.com/team.saintfx?igsh=MXZsYmZkdTc2Ym9vYw%3D%3D&utm_source=qr',
        icon: (
            <svg
                width='22'
                height='22'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.8'
                strokeLinecap='round'
                strokeLinejoin='round'
            >
                <rect x='2' y='2' width='20' height='20' rx='5' ry='5' />
                <circle cx='12' cy='12' r='4' />
                <circle cx='17.5' cy='6.5' r='0.5' fill='currentColor' stroke='none' />
            </svg>
        ),
        label: 'Instagram',
    },
    {
        name: 'TikTok',
        url: 'https://www.tiktok.com/@teamsaint_ent?_r=1&_t=ZS-953BkkAykLw',
        icon: (
            <svg width='22' height='22' viewBox='0 0 24 24' fill='currentColor'>
                <path d='M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z' />
            </svg>
        ),
        label: 'TikTok',
    },
    {
        name: 'Telegram',
        url: 'https://t.me/TEAMSAINTFX',
        icon: (
            <svg width='22' height='22' viewBox='0 0 24 24' fill='currentColor'>
                <path d='M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z' />
            </svg>
        ),
        label: 'Telegram',
    },
];

const SplashLogin = () => {
    const existingLoginid = typeof window !== 'undefined' ? localStorage.getItem('active_loginid') : null;

    const authToken = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;

    const isLoggedIn = Boolean(existingLoginid && authToken);
    const isUnauthorized = false;

    useEffect(() => {
        if (isLoggedIn && window.location.pathname === '/') {
            window.location.replace('/free-bots?account=USD');
        }
    }, [isLoggedIn]);

    const handleLogin = () => {
        // Save current path so we can return here after OAuth login completes
        const currentPath = window.location.pathname;
        if (currentPath && currentPath !== '/') {
            localStorage.setItem('login_redirect_path', currentPath);
        }
        window.location.href = generateOAuthURL();
    };
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

    const handleNewDerivLogin = async () => {
        const codeVerifier = generateRandomString(64);
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = generateRandomString(32);

        sessionStorage.setItem('deriv_oauth_code_verifier', codeVerifier);
        sessionStorage.setItem('deriv_oauth_state', state);

        const url = new URL('https://auth.deriv.com/oauth2/auth');

        url.searchParams.set('client_id', '33FCBGiyjs6CSnISZHJT3');
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('redirect_uri', `${window.location.origin}/callback`);
        url.searchParams.set('scope', 'trade');
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');

        window.location.href = url.toString();
    };
    const handleLogout = () => {
        clearAuthData(false); // clear data without auto-reload
        window.location.replace(window.location.origin); // go to home without OAuth loop
    };

    return (
        <div className='splash-login'>
            <div className='splash-login__card'>
                <div className='splash-login__logo'>
                    <svg width='56' height='56' viewBox='0 0 56 56' fill='none'>
                        <rect width='56' height='56' rx='16' fill='rgba(229,53,53,0.12)' />
                        <path
                            d='M28 12L40 20V32C40 38.627 34.627 44 28 44C21.373 44 16 38.627 16 32V20L28 12Z'
                            fill='none'
                            stroke='#e53535'
                            strokeWidth='2'
                            strokeLinejoin='round'
                        />
                        <path
                            d='M23 28L26.5 31.5L33 25'
                            stroke='#e53535'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        />
                    </svg>
                </div>

                <h1 className='splash-login__brand'>SAINTDBOT</h1>
                <p className='splash-login__tagline'>CONSISTENCY IS 🔑</p>

                {isUnauthorized ? (
                    <>
                        <div className='splash-login__denied-box'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='#e53535'
                                strokeWidth='2'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            >
                                <rect x='3' y='11' width='18' height='11' rx='2' />
                                <path d='M7 11V7a5 5 0 0 1 10 0v4' />
                            </svg>
                            <div>
                                <p className='splash-login__denied-title'>Access Restricted</p>
                                <p className='splash-login__denied-id'>{existingLoginid}</p>
                                <p className='splash-login__denied-hint'>
                                    This account hasn't been granted access. Contact us via social media to request
                                    access.
                                </p>
                            </div>
                        </div>

                        <button className='splash-login__btn' onClick={handleLogout}>
                            <svg
                                width='20'
                                height='20'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            >
                                <path d='M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' />
                                <polyline points='10 17 15 12 10 7' />
                                <line x1='15' y1='12' x2='3' y2='12' />
                            </svg>
                            Try Another Account
                        </button>
                    </>
                ) : (
                    <>
                        <p className='splash-login__description'>
                            Team.SaintFX automated trading platform. Log in with your Deriv account to access the bot
                            builder.
                        </p>

                        <p className='splash-login__trust-note'>
                            We only request access to identify your Deriv account and place trades when you choose. We
                            cannot withdraw funds or see your password.
                        </p>
                        <button className='splash-login__btn' onClick={handleNewDerivLogin}
                            <svg
                                width='20'
                                height='20'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            >
                                <path d='M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' />
                                <polyline points='10 17 15 12 10 7' />
                                <line x1='15' y1='12' x2='3' y2='12' />
                            </svg>
                            Log in with Deriv
                        </button>

                        <p className='splash-login__note'>
                            Don't have an account?{' '}
                            <a
                                href='https://track.deriv.com/_784r1wfgnfD1hit6RV3zsGNd7ZgqdRLk/1/'
                                target='_blank'
                                rel='noopener noreferrer'
                                className='splash-login__link'
                            >
                                Sign up free
                            </a>
                        </p>
                    </>
                )}

                <div className='splash-login__social'>
                    <p className='splash-login__social-label'>Follow us</p>
                    <div className='splash-login__social-links'>
                        {SOCIAL_LINKS.map(link => (
                            <a
                                key={link.name}
                                href={link.url}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='splash-login__social-btn'
                                aria-label={link.label}
                                title={link.label}
                            >
                                {link.icon}
                            </a>
                        ))}
                    </div>
                </div>

                <div className='splash-login__footer'>
                    <span>Powered by Deriv API</span>
                    <span className='splash-login__dot'>·</span>
                    <span>Team.SaintFX © {new Date().getFullYear()}</span>
                </div>
            </div>
        </div>
    );
};

export default SplashLogin;

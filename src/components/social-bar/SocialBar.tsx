import React from 'react';
import './social-bar.scss';

const SocialBar = () => (
    <div className='social-bar'>
        <a
            href='https://www.instagram.com/team.saintfx?igsh=MXZsYmZkdTc2Ym9vYw%3D%3D&utm_source=qr'
            target='_blank'
            rel='noopener noreferrer'
            className='social-bar__link'
            title='Instagram'
        >
            <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                <rect x='2' y='2' width='20' height='20' rx='5' ry='5' />
                <circle cx='12' cy='12' r='4' />
                <circle cx='17.5' cy='6.5' r='0.5' fill='currentColor' stroke='none' />
            </svg>
            <span>Instagram</span>
        </a>

        <span className='social-bar__sep' />

        <a
            href='https://www.tiktok.com/@teamsaint_ent?_r=1&_t=ZS-953BkkAykLw'
            target='_blank'
            rel='noopener noreferrer'
            className='social-bar__link'
            title='TikTok'
        >
            <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor'>
                <path d='M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z' />
            </svg>
            <span>TikTok</span>
        </a>

        <span className='social-bar__sep' />

        <a
            href='https://t.me/TEAMSAINTFX'
            target='_blank'
            rel='noopener noreferrer'
            className='social-bar__link'
            title='Telegram'
        >
            <svg width='17' height='17' viewBox='0 0 24 24' fill='currentColor'>
                <path d='M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z' />
            </svg>
            <span>Telegram</span>
        </a>
    </div>
);

export default SocialBar;

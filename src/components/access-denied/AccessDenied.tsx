import React from 'react';
import { clearAuthData } from '@/utils/auth-utils';
import './access-denied.scss';

const AccessDenied = () => {
    const loginid = typeof window !== 'undefined' ? localStorage.getItem('active_loginid') : null;

    const handleLogout = () => {
        clearAuthData();
        window.location.replace('/');
    };

    return (
        <div className='access-denied'>
            <div className='access-denied__card'>
                <div className='access-denied__lock'>
                    <svg width='48' height='48' viewBox='0 0 24 24' fill='none'>
                        <rect x='3' y='11' width='18' height='11' rx='2' stroke='#f0b429' strokeWidth='1.5' fill='rgba(240,180,41,0.08)'/>
                        <path d='M7 11V7a5 5 0 0 1 10 0v4' stroke='#f0b429' strokeWidth='1.5' strokeLinecap='round'/>
                        <circle cx='12' cy='16' r='1.5' fill='#f0b429'/>
                    </svg>
                </div>

                <h1 className='access-denied__title'>Access Restricted</h1>
                <p className='access-denied__subtitle'>
                    This platform is private. Your account has not been granted access.
                </p>

                {loginid && (
                    <div className='access-denied__account-box'>
                        <span className='access-denied__account-label'>Logged in as</span>
                        <span className='access-denied__account-id'>{loginid}</span>
                        <span className='access-denied__account-hint'>
                            Share this ID with the platform owner to request access.
                        </span>
                    </div>
                )}

                <button className='access-denied__btn' onClick={handleLogout}>
                    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                        <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'/>
                        <polyline points='16 17 21 12 16 7'/>
                        <line x1='21' y1='12' x2='9' y2='12'/>
                    </svg>
                    Log Out
                </button>

                <div className='access-denied__brand'>SAINTDBOT</div>
            </div>
        </div>
    );
};

export default AccessDenied;

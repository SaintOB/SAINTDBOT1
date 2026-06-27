import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from './app/AuthWrapper';
import { AnalyticsInitializer } from './utils/analytics';
import { registerPWA } from './utils/pwa-utils';
import './styles/index.scss';

// Debug: capture ALL console.error messages including React's component stack warnings.
// React's jsxDEV (dev mode) logs the component tree via console.error before throwing.
(function captureConsoleErrors() {
    const origError = console.error.bind(console);
    const captured: string[] = [];

    const postDebugError = (data: object) => {
        fetch('/__debug_error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }).catch(() => {});
    };

    console.error = function (...args: any[]) {
        origError(...args);
        const msg = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
        captured.push(msg);
        if (captured.length > 30) captured.shift();
        (window as any).__capturedConsoleErrors = captured;

        // If this is React's "type is invalid" warning, capture with stack and POST to server
        if (msg.includes('type is invalid') || msg.includes('Element type is invalid')) {
            const capturePoint = new Error('console.error capture point');
            const data = {
                type: 'react_invalid_type',
                msg,
                captureStack: capturePoint.stack,
                allCaptured: [...captured],
                timestamp: new Date().toISOString(),
            };
            (window as any).__invalidTypeError = data;
            postDebugError(data);
        }
    };

    // Also capture unhandled errors with full stack
    window.addEventListener('error', (evt) => {
        if (evt.message && evt.message.includes('Element type is invalid')) {
            postDebugError({
                type: 'window_error',
                message: evt.message,
                filename: evt.filename,
                lineno: evt.lineno,
                colno: evt.colno,
                errorStack: evt.error?.stack,
                allConsoleErrors: [...captured],
                timestamp: new Date().toISOString(),
            });
        }
    });
})();

AnalyticsInitializer();
registerPWA()
    .then(registration => {
        if (registration) {
            console.log('PWA service worker registered successfully for Chrome');
        } else {
            console.log('PWA service worker disabled for non-Chrome browser');
        }
    })
    .catch(error => {
        console.error('PWA service worker registration failed:', error);
    });

ReactDOM.createRoot(document.getElementById('root')!).render(<AuthWrapper />);

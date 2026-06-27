import React from 'react';
import PropTypes from 'prop-types';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, info: null };
    }

    componentDidCatch = (error, info) => {
        if (window.TrackJS) window.TrackJS.console.log(this.props.root_store);
        const errorData = {
            type: 'error_boundary',
            message: String(error?.message || error),
            componentStack: info?.componentStack,
            errorStack: error?.stack,
            allConsoleErrors: window.__capturedConsoleErrors || [],
            invalidTypeError: window.__invalidTypeError || null,
            timestamp: new Date().toISOString(),
        };
        // POST full details to dev server debug endpoint
        fetch('/__debug_error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(errorData),
        }).catch(() => {});
        console.error('[ErrorBoundary] Caught error:', error?.message || error);
        console.error('[ErrorBoundary] Component stack:', info?.componentStack);
        this.setState({ hasError: true, error, info });
    };

    render = () => {
        if (!this.state.hasError) return this.props.children;

        const errMsg = String(this.state.error?.message || this.state.error || 'Unknown error');
        const stack = String(this.state.info?.componentStack || '');
        const consoleErrors = (window.__capturedConsoleErrors || []).join('\n\n---\n\n');
        const invalidTypeError = window.__invalidTypeError;

        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: '#0a0a0a', color: '#f0f0f0', zIndex: 99999,
                overflow: 'auto', padding: '20px', fontFamily: 'monospace', fontSize: '13px',
            }}>
                <div style={{ color: '#ff6b6b', fontSize: '18px', marginBottom: '12px', fontWeight: 'bold' }}>
                    React Error — Element Type Invalid (check /tmp/browser_debug_errors.log on server)
                </div>
                <div style={{ color: '#ffd93d', marginBottom: '12px', wordBreak: 'break-all' }}>
                    Error: {errMsg}
                </div>
                <div style={{ color: '#aaa', marginBottom: '4px', fontSize: '12px' }}>
                    Component Stack (from React componentDidCatch):
                </div>
                <pre style={{
                    background: '#1a1a1a', padding: '10px', borderRadius: '4px',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#6bcb77',
                    maxHeight: '40vh', overflow: 'auto', fontSize: '11px', marginBottom: '12px',
                }}>
                    {stack || 'No component stack available'}
                </pre>
                {invalidTypeError && (
                    <>
                        <div style={{ color: '#aaa', marginBottom: '4px', fontSize: '12px' }}>
                            React Invalid Type console.error:
                        </div>
                        <pre style={{
                            background: '#1a1a1a', padding: '10px', borderRadius: '4px',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#f8a060',
                            maxHeight: '20vh', overflow: 'auto', fontSize: '11px', marginBottom: '12px',
                        }}>
                            {typeof invalidTypeError === 'object' ? JSON.stringify(invalidTypeError, null, 2) : String(invalidTypeError)}
                        </pre>
                    </>
                )}
                <div style={{ color: '#aaa', marginBottom: '4px', fontSize: '12px' }}>
                    All captured console.error messages (last 30):
                </div>
                <pre style={{
                    background: '#1a1a1a', padding: '10px', borderRadius: '4px',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#ccc',
                    maxHeight: '25vh', overflow: 'auto', fontSize: '11px',
                }}>
                    {consoleErrors || 'No console errors captured'}
                </pre>
                <button
                    onClick={() => window.location.reload()}
                    style={{
                        marginTop: '16px', padding: '8px 20px', background: '#333',
                        color: '#fff', border: '1px solid #555', borderRadius: '4px',
                        cursor: 'pointer', fontSize: '13px',
                    }}
                >
                    Reload
                </button>
            </div>
        );
    };
}

ErrorBoundary.propTypes = {
    root_store: PropTypes.object,
    children: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.node), PropTypes.node]),
};

export default ErrorBoundary;

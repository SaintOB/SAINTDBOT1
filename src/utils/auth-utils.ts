/**
 * Utility functions for authentication-related operations
 */
import Cookies from 'js-cookie';

/**
 * Clears authentication data from local storage and reloads the page
 */
export const clearAuthData = (is_reload: boolean = true): void => {
    localStorage.removeItem('accountsList');
    localStorage.removeItem('clientAccounts');
    localStorage.removeItem('callback_token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('active_loginid');
    localStorage.removeItem('client.accounts');
    localStorage.removeItem('client.country');
    sessionStorage.removeItem('query_param_currency');
    if (is_reload) {
        location.reload();
    }
};

/**
 * Handles OIDC authentication failure by clearing auth data and showing logged out view
 * @param error - The error that occurred during OIDC authentication
 */
export const handleOidcAuthFailure = (error: any): void => {
    // Log the error
    console.error('OIDC authentication failed:', error);

    // Clear auth data
    localStorage.removeItem('authToken');
    localStorage.removeItem('active_loginid');
    localStorage.removeItem('clientAccounts');
    localStorage.removeItem('accountsList');

    // Set logged_state cookie to false
    Cookies.set('logged_state', 'false', {
        domain: window.location.hostname.split('.').slice(-2).join('.'),
        expires: 30,
        path: '/',
        secure: true,
    });

    // Guard against infinite reload loops: only reload once per session.
    // If OIDC keeps failing (e.g. missing client_id on this domain), reloading
    // would just cause an endless loop. The app renders correctly in logged-out
    // state without a reload.
    const oidc_failed_key = 'oidc_auth_failed';
    if (sessionStorage.getItem(oidc_failed_key)) {
        return;
    }
    sessionStorage.setItem(oidc_failed_key, '1');
    window.location.reload();
};

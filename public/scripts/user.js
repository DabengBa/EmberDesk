import { getRequestHeaders } from './request-context.js';

/**
 * @type {import('../../src/users.js').UserViewModel} Logged in user
 */
let currentUser = null;

// Extend the session every 10 minutes
const SESSION_EXTEND_INTERVAL = 10 * 60 * 1000;

/**
 * Enable or disable user account handling.
 * @param {boolean} isEnabled User accounts enabled
 * @returns {Promise<void>}
 */
export async function setUserControls(isEnabled) {
    if (!isEnabled) {
        return;
    }

    await getCurrentUser();
}

/**
 * Gets the handle string of the current user.
 * @returns {string} User handle
 */
export function getCurrentUserHandle() {
    return currentUser?.handle || 'default-user';
}

/**
 * Get the current user.
 * @returns {Promise<void>}
 */
async function getCurrentUser() {
    try {
        const response = await fetch('/api/users/me', {
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Failed to get current user');
        }

        currentUser = await response.json();
    } catch (error) {
        console.error('Error getting current user:', error);
    }
}

/**
 * Pings the server to extend the user session.
 */
async function extendUserSession() {
    try {
        const response = await fetch('/api/ping?extend=1', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            throw new Error('Ping did not succeed', { cause: response.status });
        }
    } catch (error) {
        console.error('Failed to extend user session', error);
    }
}

jQuery(() => {
    setInterval(async () => {
        if (currentUser) {
            await extendUserSession();
        }
    }, SESSION_EXTEND_INTERVAL);
});

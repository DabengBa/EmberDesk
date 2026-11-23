import type { Request, Response } from 'express';
import { getEnableAccounts, needsSetup } from './user-storage.ts';
import { shouldRedirectToLogin, tryAutoLogin } from './user-auth.ts';
import { hasReactLoginBuild, sendReactLoginIndex } from './middleware/react-login-serve.ts';

/**
 * Middleware to host the login page.
 * @param {object} [options]
 * @param {string} [options.reactLoginDistRoot]
 * @returns {import('express').RequestHandler}
 */
/**
 * Send a clear failure when the required React auth app build is missing.
 * @param {import('express').Response} response
 * @param {string} pageName
 * @returns {void}
 */
function sendMissingReactAuthBuild(response: Response, pageName: string) {
    response.status(503).type('text/plain').send(
        `React ${pageName} build is missing. Run "pnpm run build:react" and restart the server.`,
    );
}


export function createLoginPageMiddleware({ reactLoginDistRoot }: { reactLoginDistRoot?: string } = {}) {
    return async function loginPageMiddleware(request: Request, response: Response) {
        if (!getEnableAccounts()) {
            console.log('User accounts are disabled. Redirecting to index page.');
            return response.redirect('/');
        }

        try {
            const autoLogin = await tryAutoLogin(request);

            if (autoLogin) {
                return response.redirect('/');
            }
        } catch (error) {
            console.error('Error during auto-login:', error);
        }

        if (hasReactLoginBuild(reactLoginDistRoot)) {
            return sendReactLoginIndex(response, reactLoginDistRoot);
        }

        console.error('React login build is required but app/dist/index.html was not found.');
        return sendMissingReactAuthBuild(response, 'login');
    };
}

/**
 * Middleware to host the first-time setup page.
 * @param {object} [options]
 * @param {string} [options.reactLoginDistRoot]
 * @returns {import('express').RequestHandler}
 */
export function createSetupPageMiddleware({ reactLoginDistRoot, forceNeedsSetup = false }: { reactLoginDistRoot?: string, forceNeedsSetup?: boolean } = {}) {
    return async function setupPageMiddleware(request: Request, response: Response) {
        if (!forceNeedsSetup && !await needsSetup()) {
            return response.redirect('/login');
        }

        if (hasReactLoginBuild(reactLoginDistRoot)) {
            return sendReactLoginIndex(response, reactLoginDistRoot);
        }

        console.error('React setup build is required but app/dist/index.html was not found.');
        return sendMissingReactAuthBuild(response, 'setup');
    };
}

/**
 * Middleware to host the React settings page or fall back to the legacy workspace.
 * @param {object} [options]
 * @param {string} [options.reactLoginDistRoot]
 * @returns {import('express').RequestHandler}
 */
export function createSettingsPageMiddleware({ reactLoginDistRoot }: { reactLoginDistRoot?: string } = {}) {
    return function settingsPageMiddleware(request: Request, response: Response) {
        if (shouldRedirectToLogin(request)) {
            return response.redirect('/login');
        }

        if (hasReactLoginBuild(reactLoginDistRoot)) {
            return sendReactLoginIndex(response, reactLoginDistRoot);
        }

        console.error('React settings build is required but app/dist/index.html was not found.');
        return sendMissingReactAuthBuild(response, 'settings');
    };
}

export const loginPageMiddleware = createLoginPageMiddleware();
export const setupPageMiddleware = createSetupPageMiddleware();
export const settingsPageMiddleware = createSettingsPageMiddleware();

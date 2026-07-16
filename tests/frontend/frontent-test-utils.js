const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8000';
const FALLBACK_USER = process.env.PLAYWRIGHT_USER ?? 'playwright-e2e';
const FALLBACK_PASSWORD = process.env.PLAYWRIGHT_PASSWORD ?? 'playwright';
const LEGACY_TEST_PASSWORD = 'test123';

async function pageFetchJson(page, url, init = {}) {
    return page.evaluate(async ({ targetUrl, requestInit }) => {
        const response = await fetch(targetUrl, requestInit);
        const text = await response.text();
        let json = null;

        if (text) {
            try {
                json = JSON.parse(text);
            } catch {
                json = null;
            }
        }

        return {
            ok: response.ok,
            status: response.status,
            json,
        };
    }, { targetUrl: url, requestInit: init });
}

function isAppShellPath(pathname) {
    return pathname !== '/login' && pathname !== '/setup';
}

async function isOnAppOrigin(page) {
    try {
        const currentUrl = page.url();
        if (!currentUrl || currentUrl === 'about:blank') {
            return false;
        }
        const current = new URL(currentUrl);
        const base = new URL(BASE_URL);
        return current.origin === base.origin && isAppShellPath(current.pathname);
    } catch {
        return false;
    }
}

async function isAppReady(page) {
    try {
        return await page.evaluate(() => Boolean(
            window.SillyTavern?.getContext
            && document.getElementById('preloader') === null
        ));
    } catch {
        return false;
    }
}

async function waitForAppReady(page) {
    await page.waitForFunction(
        'window.SillyTavern?.getContext && document.getElementById("preloader") === null',
        { timeout: 120_000 },
    );
}

async function ensureSession(page) {
    // Prefer waiting out an in-flight same-origin boot (e.g. after page.reload)
    // instead of issuing another full document load. A second navigation aborts
    // the unbundled module waterfall and can trip Chromium
    // net::ERR_INSUFFICIENT_RESOURCES under React panel assets + authoring panels.
    if (await isOnAppOrigin(page)) {
        if (await isAppReady(page)) {
            return;
        }
        try {
            await waitForAppReady(page);
            return;
        } catch {
            // Fall through to full bootstrap when the in-flight page never becomes ready.
        }
    }

    await page.goto(BASE_URL);

    const setupModeResponse = await pageFetchJson(page, '/api/users/setup-mode');
    const mode = setupModeResponse.json?.mode;

    const getJsonHeaders = async () => {
        const csrfTokenResponse = await pageFetchJson(page, '/csrf-token');
        const csrfPayload = csrfTokenResponse.json;
        const csrfToken = csrfPayload?.token ?? csrfPayload?.data?.token ?? null;

        return {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        };
    };

    const listUsers = async () => {
        const usersResponse = await pageFetchJson(page, '/api/users/list', {
            method: 'POST',
            headers: await getJsonHeaders(),
        });

        if (!usersResponse.ok || usersResponse.status === 204) {
            return [];
        }
        return usersResponse.json ?? [];
    };

    const loginKnownUser = async (existingUsers) => {
        const usersByHandle = new Map(existingUsers.map(user => [user.handle, user]));
        const candidates = [
            ...existingUsers.filter(user => !user.password).map(user => ({ handle: user.handle, password: '' })),
            { handle: FALLBACK_USER, password: FALLBACK_PASSWORD },
            { handle: 'default-user', password: LEGACY_TEST_PASSWORD },
            { handle: 'admin', password: FALLBACK_PASSWORD },
            { handle: 'default-user', password: FALLBACK_PASSWORD },
        ].filter(({ handle }) => !usersByHandle.size || usersByHandle.has(handle));

        const attempted = new Set();
        for (const { handle, password } of candidates) {
            const attemptKey = `${handle}\0${password}`;
            if (attempted.has(attemptKey)) {
                continue;
            }
            attempted.add(attemptKey);

            const loginResponse = await pageFetchJson(page, '/api/users/login', {
                method: 'POST',
                headers: await getJsonHeaders(),
                body: JSON.stringify({ handle, password }),
            });
            if (loginResponse.ok) {
                return true;
            }
        }

        return false;
    };

    const setupFallbackUser = async (data = { handle: FALLBACK_USER, password: FALLBACK_PASSWORD }) => {
        const setupResponse = await pageFetchJson(page, '/api/users/setup', {
            method: 'POST',
            headers: await getJsonHeaders(),
            body: JSON.stringify(data),
        });
        return setupResponse;
    };

    let authenticated = false;

    if (mode === 'set-password') {
        const setupResponse = await setupFallbackUser({ password: FALLBACK_PASSWORD });
        if (setupResponse.ok) {
            authenticated = true;
        } else {
            authenticated = await loginKnownUser(await listUsers());
        }

        if (!authenticated) {
            throw new Error(`Failed to set password for existing user: HTTP ${setupResponse.status}`);
        }
    } else {
        const existingUsers = await listUsers();

        if (existingUsers.length === 0) {
            const setupResponse = await setupFallbackUser();
            if (setupResponse.ok) {
                authenticated = true;
            } else if ([403, 409].includes(setupResponse.status)) {
                authenticated = await loginKnownUser(await listUsers());
            }

            if (!authenticated) {
                throw new Error(`Unable to create or authenticate ${FALLBACK_USER}: HTTP ${setupResponse.status}`);
            }
        } else {
            authenticated = await loginKnownUser(existingUsers);

            if (!authenticated) {
                const setupResponse = await setupFallbackUser();
                if (!setupResponse.ok) {
                    throw new Error(`Unable to authenticate an E2E user or create ${FALLBACK_USER}: HTTP ${setupResponse.status}`);
                }
                authenticated = true;
            }
        }
    }

    await page.goto(BASE_URL);
    const path = new URL(page.url()).pathname;
    if (path === '/login' || path === '/setup') {
        throw new Error(`E2E authentication did not reach the app shell; current path is ${path}`);
    }
    await waitForAppReady(page);
}

export const testSetup = {
    /**
     * Navigates to the home page without waiting for SillyTavern to load.
     * @param {Object} params
     * @param {import('@playwright/test').Page} params.page
     */
    goST: async ({ page }) => {
        await page.goto('/');
    },

    /**
     * Ensures a usable local session exists and waits for the application to finish loading.
     * This removes the dependency on the local default-user/test123 account while preserving the existing test contract.
     * @param {Object} params
     * @param {import('@playwright/test').Page} params.page
     */
    awaitST: async ({ page }) => {
        await ensureSession(page);
    },
};

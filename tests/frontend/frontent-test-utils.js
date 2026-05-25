const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8000';
const FALLBACK_USER = process.env.PLAYWRIGHT_USER ?? 'playwright-e2e';
const FALLBACK_PASSWORD = process.env.PLAYWRIGHT_PASSWORD ?? 'playwright';
const LEGACY_TEST_PASSWORD = 'test123';

async function ensureSession(page) {
    await page.goto(BASE_URL);

    const setupModeResponse = await page.request.get(`${BASE_URL}/api/users/setup-mode`);
    const { mode } = await setupModeResponse.json();

    const csrfTokenResponse = await page.request.get(`${BASE_URL}/csrf-token`);
    const csrfPayload = await csrfTokenResponse.json();
    const csrfToken = csrfPayload.token ?? csrfPayload?.data?.token ?? null;
    const headers = {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    };

    const listUsers = async () => {
        const usersResponse = await page.request.post(`${BASE_URL}/api/users/list`, { headers });
        if (!usersResponse.ok() || usersResponse.status() === 204) {
            return [];
        }
        return usersResponse.json();
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

            const loginResponse = await page.request.post(`${BASE_URL}/api/users/login`, {
                headers,
                data: { handle, password },
            });
            if (loginResponse.ok()) {
                return true;
            }
        }

        return false;
    };

    const setupFallbackUser = async (data = { handle: FALLBACK_USER, password: FALLBACK_PASSWORD }) => {
        const setupResponse = await page.request.post(`${BASE_URL}/api/users/setup`, {
            headers,
            data,
        });
        return setupResponse;
    };

    let authenticated = false;

    if (mode === 'set-password') {
        const setupResponse = await setupFallbackUser({ password: FALLBACK_PASSWORD });
        if (setupResponse.ok()) {
            authenticated = true;
        } else {
            authenticated = await loginKnownUser(await listUsers());
        }

        if (!authenticated) {
            throw new Error(`Failed to set password for existing user: HTTP ${setupResponse.status()}`);
        }
    } else {
        const existingUsers = await listUsers();

        if (existingUsers.length === 0) {
            const setupResponse = await setupFallbackUser();
            if (setupResponse.ok()) {
                authenticated = true;
            } else if ([403, 409].includes(setupResponse.status())) {
                authenticated = await loginKnownUser(await listUsers());
            }

            if (!authenticated) {
                throw new Error(`Unable to create or authenticate ${FALLBACK_USER}: HTTP ${setupResponse.status()}`);
            }
        } else {
            authenticated = await loginKnownUser(existingUsers);

            if (!authenticated) {
                const setupResponse = await setupFallbackUser();
                if (!setupResponse.ok()) {
                    throw new Error(`Unable to authenticate an E2E user or create ${FALLBACK_USER}: HTTP ${setupResponse.status()}`);
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
    await page.waitForFunction('window.SillyTavern?.getContext && document.getElementById("preloader") === null', { timeout: 120_000 });
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

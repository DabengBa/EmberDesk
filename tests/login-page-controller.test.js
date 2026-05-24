import { describe, test, expect, afterEach, jest } from '@jest/globals';

const originalLoginTestMode = globalThis.EMBERDESK_LOGIN_TEST_MODE;

async function importFreshLoginModule() {
    globalThis.EMBERDESK_LOGIN_TEST_MODE = true;
    return import(`../public/scripts/login.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('login page controller helpers', () => {
    afterEach(() => {
        if (originalLoginTestMode === undefined) {
            delete globalThis.EMBERDESK_LOGIN_TEST_MODE;
        } else {
            globalThis.EMBERDESK_LOGIN_TEST_MODE = originalLoginTestMode;
        }
    });

    test('maps known server auth errors to localized copy', async () => {
        const { getLoginErrorMessage } = await importFreshLoginModule();

        expect(getLoginErrorMessage('Incorrect credentials')).toBe('账号或密码不正确');
        expect(getLoginErrorMessage('User is disabled')).toBe('此账号已被禁用');
        expect(getLoginErrorMessage(undefined)).toBe('发生错误，请稍后重试');
        expect(getLoginErrorMessage('Custom server text')).toBe('Custom server text');
    });

    test('builds home redirect URL while removing only noauto', async () => {
        const { buildHomeRedirectUrl } = await importFreshLoginModule();

        expect(buildHomeRedirectUrl('http://localhost/login?noauto=1&foo=bar#top')).toBe('http://localhost/?foo=bar#top');
    });

    test('calculates password visibility toggle state', async () => {
        const { getPasswordVisibilityState } = await importFreshLoginModule();

        expect(getPasswordVisibilityState('password')).toEqual({
            type: 'text',
            iconClassName: 'fa-solid fa-eye-slash',
            ariaPressed: 'true',
            ariaLabel: '隐藏密码',
        });
        expect(getPasswordVisibilityState('text')).toEqual({
            type: 'password',
            iconClassName: 'fa-solid fa-eye',
            ariaPressed: 'false',
            ariaLabel: '显示密码',
        });
    });

    test('detects active recovery step from visibility', async () => {
        const { getRecoveryStep } = await importFreshLoginModule();

        expect(getRecoveryStep({ step1Display: '', step2Display: 'none' })).toBe(1);
        expect(getRecoveryStep({ step1Display: 'block', step2Display: 'none' })).toBe(1);
        expect(getRecoveryStep({ step1Display: 'none', step2Display: 'block' })).toBe(2);
    });

    test('formats lockout countdown copy', async () => {
        const { formatLockoutMessage } = await importFreshLoginModule();

        expect(formatLockoutMessage(3)).toBe('账号已锁定，请在 3 秒后重试。');
    });

    test('initializes deliberately and cleanup removes page-owned listeners', async () => {
        const { initLoginPage } = await importFreshLoginModule();
        class FakeClassList {
            add() {}
            remove() {}
        }

        class FakeElement {
            constructor(id) {
                this.id = id;
                this.value = '';
                this.type = '';
                this.textContent = '';
                this.disabled = false;
                this.style = { display: '' };
                this.classList = new FakeClassList();
                this.attributes = new Map();
                this.listeners = new Map();
            }

            addEventListener(type, callback, options = {}) {
                const listeners = this.listeners.get(type) ?? [];
                listeners.push(callback);
                this.listeners.set(type, listeners);
                options.signal?.addEventListener('abort', () => {
                    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(listener => listener !== callback));
                }, { once: true });
            }

            click() {
                for (const listener of this.listeners.get('click') ?? []) {
                    listener({ preventDefault: () => {} });
                }
            }

            setAttribute(name, value) {
                this.attributes.set(name, value);
            }

            querySelector(selector) {
                return selector === 'i' ? { className: '' } : null;
            }
        }

        const elements = Object.fromEntries([
            'loginCard',
            'loginForm',
            'handle',
            'password',
            'passwordToggle',
            'loginButton',
            'errorMessage',
            'forgotLink',
            'recoveryCard',
            'recoveryForm',
            'recoverHandle',
            'recoveryStep1',
            'recoveryStep2',
            'recoveryCode',
            'newPassword',
            'recoveryError',
            'cancelRecovery',
        ].map(id => [id, new FakeElement(id)]));
        elements.password.type = 'password';
        const root = {
            getElementById: id => elements[id] ?? null,
        };
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return { json: async () => ({ token: 'csrf-token' }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initLoginPage(root, {
            fetch: fetchMock,
            initAccessibility: () => {},
        });

        elements.passwordToggle.click();
        expect(elements.password.type).toBe('text');

        cleanup();

        elements.passwordToggle.click();
        expect(elements.password.type).toBe('text');
    });

    test('successful password recovery returns to the login card without auto-login', async () => {
        const { initLoginPage } = await importFreshLoginModule();
        class FakeClassList {
            add() {}
            remove() {}
        }

        class FakeElement {
            constructor(id) {
                this.id = id;
                this.value = '';
                this.type = '';
                this.textContent = '';
                this.disabled = false;
                this.style = { display: '' };
                this.classList = new FakeClassList();
                this.listeners = new Map();
            }

            addEventListener(type, callback, options = {}) {
                const listeners = this.listeners.get(type) ?? [];
                listeners.push(callback);
                this.listeners.set(type, listeners);
                options.signal?.addEventListener('abort', () => {
                    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(listener => listener !== callback));
                }, { once: true });
            }

            async submit() {
                for (const listener of this.listeners.get('submit') ?? []) {
                    await listener({ preventDefault: () => {} });
                }
            }

            setAttribute() {}

            querySelector(selector) {
                return selector === 'i' ? { className: '' } : null;
            }
        }

        const elements = Object.fromEntries([
            'loginCard',
            'loginForm',
            'handle',
            'password',
            'passwordToggle',
            'loginButton',
            'errorMessage',
            'forgotLink',
            'recoveryCard',
            'recoveryForm',
            'recoverHandle',
            'recoveryStep1',
            'recoveryStep2',
            'recoveryCode',
            'newPassword',
            'recoveryError',
            'cancelRecovery',
        ].map(id => [id, new FakeElement(id)]));
        elements.loginCard.style.display = 'none';
        elements.recoveryCard.style.display = 'block';
        elements.recoveryStep1.style.display = 'none';
        elements.recoveryStep2.style.display = 'block';
        elements.recoverHandle.value = 'default-user';
        elements.recoveryCode.value = '123456';
        elements.newPassword.value = 'new-password';
        const root = {
            getElementById: id => elements[id] ?? null,
        };
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return { json: async () => ({ token: 'csrf-token' }) };
            }
            if (url === '/api/users/recover-step2') {
                return { ok: true, json: async () => ({ ok: true }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initLoginPage(root, {
            fetch: fetchMock,
            initAccessibility: () => {},
        });

        await elements.recoveryForm.submit();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).not.toHaveBeenCalledWith('/api/users/login', expect.anything());
        expect(elements.loginCard.style.display).toBe('block');
        expect(elements.recoveryCard.style.display).toBe('none');

        cleanup();
    });
});

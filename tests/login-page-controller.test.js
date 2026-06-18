import { describe, test, expect, afterEach, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const originalLoginTestMode = global.EMBERDESK_LOGIN_TEST_MODE;
const originalDocument = global.document;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

async function importFreshLoginModule() {
    global.EMBERDESK_LOGIN_TEST_MODE = true;
    return import(`../public/scripts/login.js?cacheBust=${Date.now()}-${Math.random()}`);
}

class FakeClassList {
    constructor() {
        this.classes = new Set();
    }

    add(...classNames) {
        for (const className of classNames) {
            this.classes.add(className);
        }
    }

    remove(...classNames) {
        for (const className of classNames) {
            this.classes.delete(className);
        }
    }

    contains(className) {
        return this.classes.has(className);
    }
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
        this.focused = false;
        this.focusCount = 0;
        this.offsetWidth = 0;
    }

    addEventListener(type, callback, options = {}) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(callback);
        this.listeners.set(type, listeners);
        options.signal?.addEventListener('abort', () => {
            this.listeners.set(type, (this.listeners.get(type) ?? []).filter(listener => listener !== callback));
        }, { once: true });
    }

    async dispatchEvent(type, event = {}) {
        const eventWithDefault = { preventDefault: () => {}, ...event };
        for (const listener of this.listeners.get(type) ?? []) {
            await listener(eventWithDefault);
        }
    }

    click() {
        void this.dispatchEvent('click');
    }

    submit() {
        return this.dispatchEvent('submit');
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    focus() {
        this.focused = true;
        this.focusCount++;
        if (global.document) {
            global.document.activeElement = this;
        }
    }

    querySelector(selector) {
        return selector === 'i' ? { className: '' } : null;
    }
}

function createLoginElements() {
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
    return elements;
}

function createLoginRoot(elements = createLoginElements()) {
    if (!global.document) {
        global.document = { activeElement: null };
    } else if (!('activeElement' in global.document)) {
        global.document.activeElement = null;
    }
    return {
        elements,
        root: {
            getElementById: id => elements[id] ?? null,
        },
    };
}

describe('login page controller helpers', () => {
    afterEach(() => {
        if (originalLoginTestMode === undefined) {
            delete global.EMBERDESK_LOGIN_TEST_MODE;
        } else {
            global.EMBERDESK_LOGIN_TEST_MODE = originalLoginTestMode;
        }
        if (originalDocument === undefined) {
            delete global.document;
        } else {
            global.document = originalDocument;
        }
    });

    test('maps known server auth errors to localized copy', async () => {
        const { getLoginErrorMessage } = await importFreshLoginModule();

        expect(getLoginErrorMessage('Incorrect credentials')).toBe('账号或密码不正确');
        expect(getLoginErrorMessage('User is disabled')).toBe('此账号已被禁用');
        expect(getLoginErrorMessage('Password must be at least 8 characters long')).toBe('密码至少需要 8 个字符');
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

    test('keeps login error regions assertive alerts for dynamic updates', () => {
        const loginHtml = fs.readFileSync(path.join(repoRoot, 'public/login.html'), 'utf8');

        expect(loginHtml).toContain('<div class="login-error" id="errorMessage" role="alert" aria-live="assertive"></div>');
        expect(loginHtml).toContain('<div class="login-error" id="recoveryError" role="alert" aria-live="assertive"></div>');
    });

    test('declares stable autofill semantics across legacy and React login inputs', () => {
        const loginHtml = fs.readFileSync(path.join(repoRoot, 'public/login.html'), 'utf8');
        const loginFormSource = fs.readFileSync(path.join(repoRoot, 'app/components/login/LoginForm.tsx'), 'utf8');
        const recoveryFormSource = fs.readFileSync(path.join(repoRoot, 'app/components/login/RecoveryForm.tsx'), 'utf8');
        const passwordInputSource = fs.readFileSync(path.join(repoRoot, 'app/components/login/PasswordInput.tsx'), 'utf8');

        expect(loginHtml).toMatch(/<input id="handle" name="handle" type="text" autocomplete="username"/);
        expect(loginHtml).toMatch(/<input id="password" name="password" type="password" autocomplete="current-password"/);
        expect(loginHtml).toMatch(/<input id="recoverHandle" name="recoverHandle" type="text" autocomplete="username"/);
        expect(loginHtml).toMatch(/<input id="recoveryCode" name="recoveryCode" type="text" autocomplete="one-time-code" inputmode="numeric"/);
        expect(loginHtml).toMatch(/<input id="newPassword" name="newPassword" type="password" autocomplete="new-password"/);

        expect(loginFormSource).toContain('name="handle"');
        expect(recoveryFormSource).toContain('name="recoverHandle"');
        expect(recoveryFormSource).toContain('name="recoveryCode"');
        expect(recoveryFormSource).toContain('autoComplete="one-time-code"');
        expect(recoveryFormSource).toContain('name="newPassword"');
        expect(passwordInputSource).toContain('name={name}');
    });

    test('initializes deliberately and cleanup removes page-owned listeners', async () => {
        const { initLoginPage } = await importFreshLoginModule();
        const { root, elements } = createLoginRoot();
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
        const { root, elements } = createLoginRoot();
        elements.loginCard.style.display = 'none';
        elements.recoveryCard.style.display = 'block';
        elements.recoveryStep1.style.display = 'none';
        elements.recoveryStep2.style.display = 'block';
        elements.recoverHandle.value = 'default-user';
        elements.recoveryCode.value = '123456';
        elements.newPassword.value = 'new-password';
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

    test('marks login validation errors as field-associated and focusable', async () => {
        const { initLoginPage } = await importFreshLoginModule();
        const { root, elements } = createLoginRoot();
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

        await elements.loginForm.submit();

        expect(elements.errorMessage.textContent).toBe('请输入用户名');
        expect(elements.errorMessage.attributes.get('tabindex')).toBe('-1');
        expect(elements.errorMessage.focused).toBe(true);
        expect(elements.handle.attributes.get('aria-invalid')).toBe('true');
        expect(elements.handle.attributes.get('aria-describedby')).toBe('errorMessage');

        elements.handle.value = 'default-user';
        await elements.handle.dispatchEvent('input');

        expect(elements.errorMessage.textContent).toBe('');
        expect(elements.errorMessage.attributes.has('tabindex')).toBe(false);
        expect(elements.handle.attributes.has('aria-invalid')).toBe(false);
        expect(elements.handle.attributes.has('aria-describedby')).toBe(false);

        cleanup();
    });

    test('treats credential rejection as a form-level error', async () => {
        const { initLoginPage } = await importFreshLoginModule();
        const { root, elements } = createLoginRoot();
        elements.handle.value = 'default-user';
        elements.password.value = 'wrong-password';
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return { json: async () => ({ token: 'csrf-token' }) };
            }
            if (url === '/api/users/login') {
                return {
                    ok: false,
                    status: 401,
                    json: async () => ({ error: 'Incorrect credentials' }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initLoginPage(root, {
            fetch: fetchMock,
            initAccessibility: () => {},
        });

        await elements.loginForm.submit();

        expect(elements.errorMessage.textContent).toBe('账号或密码不正确');
        expect(elements.errorMessage.attributes.get('tabindex')).toBe('-1');
        expect(elements.handle.attributes.has('aria-invalid')).toBe(false);
        expect(elements.handle.attributes.has('aria-describedby')).toBe(false);
        expect(elements.password.attributes.has('aria-invalid')).toBe(false);
        expect(elements.password.attributes.has('aria-describedby')).toBe(false);
        expect(elements.handle.disabled).toBe(false);
        expect(elements.password.disabled).toBe(false);

        cleanup();
    });

    test('keeps network failures form-level instead of blaming the handle field', async () => {
        const { initLoginPage } = await importFreshLoginModule();
        const { root, elements } = createLoginRoot();
        elements.handle.value = 'default-user';
        elements.password.value = 'password';
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return { json: async () => ({ token: 'csrf-token' }) };
            }
            throw new Error('network down');
        });

        const cleanup = await initLoginPage(root, {
            fetch: fetchMock,
            initAccessibility: () => {},
        });

        await elements.loginForm.submit();

        expect(elements.errorMessage.textContent).toBe('Error: network down');
        expect(elements.handle.attributes.has('aria-invalid')).toBe(false);
        expect(elements.password.attributes.has('aria-invalid')).toBe(false);

        cleanup();
    });

    test('does not steal focus repeatedly while updating an already focused lockout error', async () => {
        const { initLoginPage } = await importFreshLoginModule();
        const { root, elements } = createLoginRoot();
        elements.handle.value = 'default-user';
        elements.password.value = 'password';
        let intervalCallback = null;
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return { json: async () => ({ token: 'csrf-token' }) };
            }
            if (url === '/api/users/login') {
                return {
                    ok: false,
                    status: 429,
                    headers: { get: () => '2' },
                    json: async () => ({ error: 'Too many attempts. Try again later or recover your password.' }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initLoginPage(root, {
            fetch: fetchMock,
            initAccessibility: () => {},
            setInterval: (callback) => {
                intervalCallback = callback;
                return 1;
            },
            clearInterval: () => {},
        });

        await elements.loginForm.submit();
        expect(elements.errorMessage.focusCount).toBe(1);
        expect(elements.handle.attributes.has('aria-invalid')).toBe(false);
        expect(elements.password.attributes.has('aria-invalid')).toBe(false);

        intervalCallback();

        expect(elements.errorMessage.textContent).toBe('账号已锁定，请在 1 秒后重试。');
        expect(elements.errorMessage.focusCount).toBe(1);

        cleanup();
    });
});

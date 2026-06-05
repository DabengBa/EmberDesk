import { describe, test, expect, afterEach, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const originalSetupTestMode = global.EMBERDESK_SETUP_TEST_MODE;
const originalDocument = global.document;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

async function importFreshSetupModule() {
    global.EMBERDESK_SETUP_TEST_MODE = true;
    return import(`../public/scripts/setup.js?cacheBust=${Date.now()}-${Math.random()}`);
}

class FakeClassList {
    constructor() {
        this.classes = new Set();
    }

    add(...classes) {
        for (const className of classes) {
            this.classes.add(className);
        }
    }

    remove(...classes) {
        for (const className of classes) {
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

    async submit() {
        for (const listener of this.listeners.get('submit') ?? []) {
            await listener({ preventDefault: () => {} });
        }
    }

    click() {
        for (const listener of this.listeners.get('click') ?? []) {
            listener({ preventDefault: () => {} });
        }
    }

    input() {
        for (const listener of this.listeners.get('input') ?? []) {
            listener({ preventDefault: () => {} });
        }
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

function createSetupRoot() {
    if (!global.document) {
        global.document = { activeElement: null };
    } else if (!('activeElement' in global.document)) {
        global.document.activeElement = null;
    }

    const elements = Object.fromEntries([
        'setupCard',
        'setupForm',
        'setup-title',
        'handleField',
        'nameField',
        'handle',
        'name',
        'password',
        'confirmPassword',
        'passwordToggle',
        'confirmPasswordToggle',
        'setupButton',
        'errorMessage',
    ].map(id => [id, new FakeElement(id)]));
    elements['setup-title'].textContent = '初始设置';
    elements.setupButton.textContent = '创建管理员账户';
    elements.password.type = 'password';
    elements.confirmPassword.type = 'password';

    return {
        elements,
        root: {
            getElementById: id => elements[id] ?? null,
        },
    };
}

function jsonResponse(data, { ok = true, status = 200 } = {}) {
    return {
        ok,
        status,
        json: async () => data,
    };
}

describe('setup page controller helpers', () => {
    afterEach(() => {
        if (originalSetupTestMode === undefined) {
            delete global.EMBERDESK_SETUP_TEST_MODE;
        } else {
            global.EMBERDESK_SETUP_TEST_MODE = originalSetupTestMode;
        }
        if (originalDocument === undefined) {
            delete global.document;
        } else {
            global.document = originalDocument;
        }
    });

    test('maps known setup errors to localized copy', async () => {
        const { getSetupErrorMessage } = await importFreshSetupModule();

        expect(getSetupErrorMessage('Setup already completed')).toBe('设置已完成，请直接登录。');
        expect(getSetupErrorMessage('Missing required fields')).toBe('请填写必填项');
        expect(getSetupErrorMessage('Password must be at least 8 characters long')).toBe('密码至少需要 8 个字符');
        expect(getSetupErrorMessage('Invalid handle')).toBe('用户名格式不正确');
        expect(getSetupErrorMessage('User already exists')).toBe('该用户名已被占用');
        expect(getSetupErrorMessage(undefined)).toBe('发生错误，请稍后重试');
        expect(getSetupErrorMessage('Custom server text')).toBe('Custom server text');
    });

    test('calculates password visibility toggle state', async () => {
        const { getSetupPasswordVisibilityState } = await importFreshSetupModule();

        expect(getSetupPasswordVisibilityState('password')).toEqual({
            type: 'text',
            iconClassName: 'fa-solid fa-eye-slash',
            ariaPressed: 'true',
            ariaLabel: '隐藏密码',
        });
        expect(getSetupPasswordVisibilityState('text')).toEqual({
            type: 'password',
            iconClassName: 'fa-solid fa-eye',
            ariaPressed: 'false',
            ariaLabel: '显示密码',
        });
    });

    test('builds setup request body by mode', async () => {
        const { buildSetupRequestBody } = await importFreshSetupModule();

        expect(buildSetupRequestBody('fresh', {
            handle: 'admin',
            name: 'Admin',
            password: 'secret',
        })).toEqual({ handle: 'admin', name: 'Admin', password: 'secret' });
        expect(buildSetupRequestBody('set-password', {
            handle: 'ignored',
            name: 'Ignored',
            password: 'secret',
        })).toEqual({ password: 'secret' });
    });

    test('keeps setup error region an assertive alert for dynamic updates', () => {
        const setupHtml = fs.readFileSync(path.join(repoRoot, 'public/setup.html'), 'utf8');

        expect(setupHtml).toContain('<div class="login-error" id="errorMessage" role="alert" aria-live="assertive"></div>');
    });

    test('initializes in set-password mode and cleanup removes page-owned listeners', async () => {
        const { initSetupPage } = await importFreshSetupModule();
        const { root, elements } = createSetupRoot();
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return jsonResponse({ token: 'csrf-token' });
            }
            if (url === '/api/users/setup-mode') {
                return jsonResponse({ mode: 'set-password' });
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initSetupPage(root, {
            fetch: fetchMock,
            initAccessibility: () => {},
        });

        expect(elements['setup-title'].textContent).toBe('设置密码');
        expect(elements.handleField.classList.contains('setup-hidden')).toBe(true);
        expect(elements.nameField.classList.contains('setup-hidden')).toBe(true);
        expect(elements.setupButton.textContent).toBe('设置密码并登录');

        elements.passwordToggle.click();
        expect(elements.password.type).toBe('text');

        cleanup();

        elements.passwordToggle.click();
        expect(elements.password.type).toBe('text');
    });

    test('fails initialization when a required setup element is missing', async () => {
        const { createSetupController } = await importFreshSetupModule();
        const { elements } = createSetupRoot();
        const missingElementId = 'setupButton';
        const root = {
            getElementById: id => elements[id],
        };
        delete elements[missingElementId];

        expect(() => createSetupController(root, {
            initAccessibility: () => {},
        })).toThrow('Missing setup page element: #setupButton');
    });

    test('falls back to fresh mode when setup-mode cannot be read', async () => {
        const { initSetupPage } = await importFreshSetupModule();
        const { root, elements } = createSetupRoot();
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return jsonResponse({ token: 'csrf-token' });
            }
            if (url === '/api/users/setup-mode') {
                throw new Error('network unavailable');
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initSetupPage(root, {
            fetch: fetchMock,
            initAccessibility: () => {},
        });

        expect(elements['setup-title'].textContent).toBe('初始设置');
        expect(elements.handleField.classList.contains('setup-hidden')).toBe(false);
        expect(elements.setupButton.textContent).toBe('创建管理员账户');

        cleanup();
    });

    test('submits fresh setup body and redirects home on success', async () => {
        const { initSetupPage } = await importFreshSetupModule();
        const { root, elements } = createSetupRoot();
        const redirectMock = jest.fn();
        let setupRequest;
        const fetchMock = jest.fn(async (url, options) => {
            if (url === '/csrf-token') {
                return jsonResponse({ token: 'csrf-token' });
            }
            if (url === '/api/users/setup-mode') {
                return jsonResponse({ mode: 'fresh' });
            }
            if (url === '/api/users/setup') {
                setupRequest = options;
                return jsonResponse({ handle: 'admin' });
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initSetupPage(root, {
            fetch: fetchMock,
            redirect: redirectMock,
            initAccessibility: () => {},
        });
        elements.handle.value = 'admin';
        elements.name.value = 'Admin';
        elements.password.value = 'secret';
        elements.confirmPassword.value = 'secret';

        await elements.setupForm.submit();

        expect(JSON.parse(setupRequest.body)).toEqual({
            handle: 'admin',
            name: 'Admin',
            password: 'secret',
        });
        expect(setupRequest.headers['X-CSRF-Token']).toBe('csrf-token');
        expect(elements.setupButton.textContent).toBe('设置完成，正在进入...');
        expect(redirectMock).toHaveBeenCalledWith('/');

        cleanup();
    });

    test('submits set-password body without handle and redirects home on success', async () => {
        const { initSetupPage } = await importFreshSetupModule();
        const { root, elements } = createSetupRoot();
        const redirectMock = jest.fn();
        let setupRequest;
        const fetchMock = jest.fn(async (url, options) => {
            if (url === '/csrf-token') {
                return jsonResponse({ token: 'csrf-token' });
            }
            if (url === '/api/users/setup-mode') {
                return jsonResponse({ mode: 'set-password' });
            }
            if (url === '/api/users/setup') {
                setupRequest = options;
                return jsonResponse({ handle: 'default-user' });
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initSetupPage(root, {
            fetch: fetchMock,
            redirect: redirectMock,
            initAccessibility: () => {},
        });
        elements.password.value = 'secret';
        elements.confirmPassword.value = 'secret';

        await elements.setupForm.submit();

        expect(JSON.parse(setupRequest.body)).toEqual({ password: 'secret' });
        expect(redirectMock).toHaveBeenCalledWith('/');

        cleanup();
    });

    test('validates required setup input before posting', async () => {
        const { initSetupPage } = await importFreshSetupModule();
        const { root, elements } = createSetupRoot();
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return jsonResponse({ token: 'csrf-token' });
            }
            if (url === '/api/users/setup-mode') {
                return jsonResponse({ mode: 'fresh' });
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initSetupPage(root, {
            fetch: fetchMock,
            initAccessibility: () => {},
        });

        await elements.setupForm.submit();
        expect(elements.errorMessage.textContent).toBe('请输入用户名');
        expect(elements.errorMessage.attributes.get('tabindex')).toBe('-1');
        expect(elements.errorMessage.focused).toBe(true);
        expect(elements.handle.attributes.get('aria-invalid')).toBe('true');
        expect(elements.handle.attributes.get('aria-describedby')).toBe('errorMessage');

        elements.handle.value = 'admin';
        elements.handle.input();
        expect(elements.errorMessage.textContent).toBe('');
        expect(elements.errorMessage.attributes.has('tabindex')).toBe(false);
        expect(elements.handle.attributes.has('aria-invalid')).toBe(false);
        expect(elements.handle.attributes.has('aria-describedby')).toBe(false);

        await elements.setupForm.submit();
        expect(elements.errorMessage.textContent).toBe('请输入密码');
        expect(elements.password.attributes.get('aria-invalid')).toBe('true');
        expect(elements.password.attributes.get('aria-describedby')).toBe('errorMessage');

        elements.password.value = 'secret';
        elements.confirmPassword.value = 'different';
        elements.password.input();
        await elements.setupForm.submit();
        expect(elements.errorMessage.textContent).toBe('两次密码不一致');
        expect(elements.confirmPassword.attributes.get('aria-invalid')).toBe('true');
        expect(elements.confirmPassword.attributes.get('aria-describedby')).toBe('errorMessage');

        expect(fetchMock).toHaveBeenCalledTimes(2);

        cleanup();
    });

    test('redirects to login when setup has already completed', async () => {
        const { initSetupPage } = await importFreshSetupModule();
        const { root } = createSetupRoot();
        const redirectMock = jest.fn();
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return jsonResponse({ token: 'csrf-token' });
            }
            if (url === '/api/users/setup-mode') {
                return jsonResponse({ mode: 'complete' });
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initSetupPage(root, {
            fetch: fetchMock,
            redirect: redirectMock,
            initAccessibility: () => {},
        });

        expect(redirectMock).toHaveBeenCalledWith('/login');
        expect(fetchMock).toHaveBeenCalledTimes(2);

        cleanup();
    });

    test('shows setup API validation errors and re-enables form controls', async () => {
        const { initSetupPage } = await importFreshSetupModule();
        const { root, elements } = createSetupRoot();
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return jsonResponse({ token: 'csrf-token' });
            }
            if (url === '/api/users/setup-mode') {
                return jsonResponse({ mode: 'fresh' });
            }
            if (url === '/api/users/setup') {
                return jsonResponse({ error: 'Invalid handle' }, { ok: false, status: 400 });
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        const cleanup = await initSetupPage(root, {
            fetch: fetchMock,
            initAccessibility: () => {},
        });
        elements.handle.value = '---';
        elements.password.value = 'secret';
        elements.confirmPassword.value = 'secret';

        await elements.setupForm.submit();

        expect(elements.errorMessage.textContent).toBe('用户名格式不正确');
        expect(elements.errorMessage.attributes.get('tabindex')).toBe('-1');
        expect(elements.handle.attributes.get('aria-invalid')).toBe('true');
        expect(elements.handle.attributes.get('aria-describedby')).toBe('errorMessage');
        expect(elements.handle.disabled).toBe(false);
        expect(elements.name.disabled).toBe(false);
        expect(elements.password.disabled).toBe(false);
        expect(elements.confirmPassword.disabled).toBe(false);
        expect(elements.setupButton.disabled).toBe(false);

        cleanup();
    });

    test('keeps setup network failures form-level and re-enables controls', async () => {
        const { initSetupPage } = await importFreshSetupModule();
        const { root, elements } = createSetupRoot();
        const fetchMock = jest.fn(async (url) => {
            if (url === '/csrf-token') {
                return jsonResponse({ token: 'csrf-token' });
            }
            if (url === '/api/users/setup-mode') {
                return jsonResponse({ mode: 'fresh' });
            }
            throw new Error('network down');
        });

        const cleanup = await initSetupPage(root, {
            fetch: fetchMock,
            initAccessibility: () => {},
        });
        elements.handle.value = 'admin';
        elements.password.value = 'secret';
        elements.confirmPassword.value = 'secret';

        await elements.setupForm.submit();

        expect(elements.errorMessage.textContent).toBe('Error: network down');
        expect(elements.handle.attributes.has('aria-invalid')).toBe(false);
        expect(elements.password.attributes.has('aria-invalid')).toBe(false);
        expect(elements.confirmPassword.attributes.has('aria-invalid')).toBe(false);
        expect(elements.handle.disabled).toBe(false);
        expect(elements.password.disabled).toBe(false);
        expect(elements.confirmPassword.disabled).toBe(false);
        expect(elements.setupButton.disabled).toBe(false);

        cleanup();
    });
});

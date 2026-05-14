import { initAccessibility } from './a11y.js';

let csrfToken = '';
let setupMode = 'fresh'; // 'fresh' or 'set-password'

const messages = {
    handleRequired: '请输入用户名',
    passwordRequired: '请输入密码',
    passwordMismatch: '两次密码不一致',
    genericError: '发生错误，请稍后重试',
    userExists: '该用户名已被占用',
    setupComplete: '设置完成，正在进入...',
    missingFields: '请填写必填项',
    creating: '创建中...',
    setting: '设置中...',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
};

const serverErrorMessages = new Map([
    ['Setup already completed', '设置已完成，请直接登录。'],
    ['Missing required fields', messages.missingFields],
    ['Invalid handle', '用户名格式不正确'],
    ['User already exists', messages.userExists],
]);

async function getCsrfToken() {
    const response = await fetch('/csrf-token');
    const data = await response.json();
    return data.token;
}

async function getSetupMode() {
    try {
        const response = await fetch('/api/users/setup-mode');
        if (response.ok) {
            const data = await response.json();
            return data.mode;
        }
    } catch {
        // fallback to fresh
    }
    return 'fresh';
}

function showError(errorBlock, message, shake = false) {
    errorBlock.textContent = message;
    errorBlock.classList.add('login-error--visible');
    if (shake) {
        errorBlock.classList.remove('login-error--shake');
        void errorBlock.offsetWidth;
        errorBlock.classList.add('login-error--shake');
    }
}

function hideError(errorBlock) {
    errorBlock.textContent = '';
    errorBlock.classList.remove('login-error--visible', 'login-error--shake');
}

function getErrorMessage(message) {
    if (typeof message !== 'string') {
        return messages.genericError;
    }
    return serverErrorMessages.get(message) || message || messages.genericError;
}

function setFormEnabled(enabled) {
    const handle = document.getElementById('handle');
    const name = document.getElementById('name');
    if (handle) handle.disabled = !enabled;
    if (name) name.disabled = !enabled;
    document.getElementById('password').disabled = !enabled;
    document.getElementById('confirmPassword').disabled = !enabled;
    document.getElementById('setupButton').disabled = !enabled;
}

function togglePasswordVisibility(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(buttonId);
    const icon = btn.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-solid fa-eye-slash';
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('aria-label', messages.hidePassword);
    } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye';
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', messages.showPassword);
    }
}

function applySetPasswordMode() {
    setupMode = 'set-password';
    document.getElementById('setup-title').textContent = '设置密码';
    document.getElementById('handleField').classList.add('setup-hidden');
    document.getElementById('nameField').classList.add('setup-hidden');
    document.getElementById('setupButton').textContent = '设置密码并登录';
}

async function performSetup(handle, name, password) {
    const errorBlock = document.getElementById('errorMessage');
    hideError(errorBlock);
    setFormEnabled(false);

    const setupBtn = document.getElementById('setupButton');
    const originalText = setupBtn.textContent;
    setupBtn.textContent = setupMode === 'set-password' ? messages.setting : messages.creating;

    try {
        const body = { password };
        if (setupMode === 'fresh') {
            body.handle = handle;
            body.name = name;
        }

        const response = await fetch('/api/users/setup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            setupBtn.textContent = originalText;
            setFormEnabled(true);

            if (response.status === 302 || errorData.error === 'Setup already completed') {
                window.location.href = '/login';
                return;
            }

            return showError(errorBlock, getErrorMessage(errorData.error), true);
        }

        const data = await response.json();
        if (data.handle) {
            setupBtn.textContent = messages.setupComplete;
            window.location.href = '/';
        }
    } catch (error) {
        setupBtn.textContent = originalText;
        setFormEnabled(true);
        showError(errorBlock, String(error), true);
    }
}

(async function () {
    initAccessibility();

    csrfToken = await getCsrfToken();

    const mode = await getSetupMode();
    if (mode === 'set-password') {
        applySetPasswordMode();
    }

    document.getElementById('setupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const handle = setupMode === 'fresh' ? String($('#handle').val()).trim() : '';
        const name = setupMode === 'fresh' ? String($('#name').val()).trim() : '';
        const password = String($('#password').val());
        const confirmPassword = String($('#confirmPassword').val());

        if (setupMode === 'fresh' && !handle) {
            return showError(document.getElementById('errorMessage'), messages.handleRequired, true);
        }
        if (!password) {
            return showError(document.getElementById('errorMessage'), messages.passwordRequired, true);
        }
        if (password !== confirmPassword) {
            return showError(document.getElementById('errorMessage'), messages.passwordMismatch, true);
        }

        await performSetup(handle, name, password);
    });

    const hideOnInput = () => {
        hideError(document.getElementById('errorMessage'));
    };
    document.getElementById('handle').addEventListener('input', hideOnInput);
    document.getElementById('password').addEventListener('input', hideOnInput);
    document.getElementById('confirmPassword').addEventListener('input', hideOnInput);

    document.getElementById('passwordToggle').addEventListener('click', () => {
        togglePasswordVisibility('password', 'passwordToggle');
    });
    document.getElementById('confirmPasswordToggle').addEventListener('click', () => {
        togglePasswordVisibility('confirmPassword', 'confirmPasswordToggle');
    });
})();

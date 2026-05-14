import { initAccessibility } from './a11y.js';

let csrfToken = '';

const messages = {
    handleRequired: '请输入用户名',
    passwordRequired: '请输入密码',
    passwordMismatch: '两次密码不一致',
    genericError: '发生错误，请稍后重试',
    userExists: '该用户名已被占用',
    setupComplete: '设置完成，正在进入...',
    missingFields: '请填写必填项',
    creating: '创建中...',
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
    document.getElementById('handle').disabled = !enabled;
    document.getElementById('name').disabled = !enabled;
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

async function performSetup(handle, name, password) {
    const errorBlock = document.getElementById('errorMessage');
    hideError(errorBlock);
    setFormEnabled(false);

    const setupBtn = document.getElementById('setupButton');
    const originalText = setupBtn.textContent;
    setupBtn.textContent = messages.creating;

    try {
        const response = await fetch('/api/users/setup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify({ handle, name, password }),
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

    document.getElementById('setupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const handle = String($('#handle').val()).trim();
        const name = String($('#name').val()).trim();
        const password = String($('#password').val());
        const confirmPassword = String($('#confirmPassword').val());

        if (!handle) {
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

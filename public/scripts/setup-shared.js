export const setupMessages = {
    handleRequired: '请输入用户名',
    passwordRequired: '请输入密码',
    passwordMismatch: '两次密码不一致',
    genericError: '发生错误，请稍后重试',
    userExists: '该用户名已被占用',
    setupComplete: '设置完成，正在进入...',
    missingFields: '请填写必填项',
    passwordTooShort: '密码至少需要 8 个字符',
    creating: '创建中...',
    setting: '设置中...',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
};

const serverErrorMessages = new Map([
    ['Setup already completed', '设置已完成，请直接登录。'],
    ['Missing required fields', setupMessages.missingFields],
    ['Password must be at least 8 characters long', setupMessages.passwordTooShort],
    ['Invalid handle', '用户名格式不正确'],
    ['User already exists', setupMessages.userExists],
]);

/**
 * Returns user-facing Chinese copy for known setup API errors.
 * @param {unknown} message Server error message
 * @returns {string}
 */
export function getSetupErrorMessage(message) {
    if (typeof message !== 'string') {
        return setupMessages.genericError;
    }

    return serverErrorMessages.get(message) || message || setupMessages.genericError;
}

/**
 * Gets the next visible state for a setup password field and toggle button.
 * @param {string} currentType Current password input type
 * @returns {{type: string, iconClassName: string, ariaPressed: string, ariaLabel: string}}
 */
export function getSetupPasswordVisibilityState(currentType) {
    if (currentType === 'password') {
        return {
            type: 'text',
            iconClassName: 'fa-solid fa-eye-slash',
            ariaPressed: 'true',
            ariaLabel: setupMessages.hidePassword,
        };
    }

    return {
        type: 'password',
        iconClassName: 'fa-solid fa-eye',
        ariaPressed: 'false',
        ariaLabel: setupMessages.showPassword,
    };
}

/**
 * Builds the setup request body for the selected setup mode.
 * @param {'fresh'|'set-password'} mode Setup mode
 * @param {{handle: string, name: string, password: string}} data Form data
 * @returns {{handle?: string, name?: string, password: string}}
 */
export function buildSetupRequestBody(mode, data) {
    const body = { password: data.password };
    if (mode === 'fresh') {
        body.handle = data.handle;
        body.name = data.name;
    }
    return body;
}

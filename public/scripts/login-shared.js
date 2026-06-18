export const loginMessages = {
    handleRequired: '请输入用户名',
    codeRequired: '请输入恢复码',
    genericError: '发生错误，请稍后重试',
    incorrectCredentials: '账号或密码不正确',
    userDisabled: '此账号已被禁用',
    userNotFound: '未找到该用户',
    incorrectCode: '恢复码不正确',
    missingFields: '请填写必填项',
    tooManyLoginAttempts: '尝试次数过多，请稍后重试或重置密码。',
    tooManyRecoveryAttempts: '尝试次数过多，请稍后重试或联系管理员。',
    passwordTooShort: '密码至少需要 8 个字符',
    signingIn: '登录中...',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
};

const serverErrorMessages = new Map([
    ['Incorrect credentials', loginMessages.incorrectCredentials],
    ['User is disabled', loginMessages.userDisabled],
    ['User not found', loginMessages.userNotFound],
    ['Incorrect code', loginMessages.incorrectCode],
    ['Missing required fields', loginMessages.missingFields],
    ['Password must be at least 8 characters long', loginMessages.passwordTooShort],
    ['Too many attempts. Try again later or recover your password.', loginMessages.tooManyLoginAttempts],
    ['Too many attempts. Try again later or contact your admin.', loginMessages.tooManyRecoveryAttempts],
]);

/**
 * Returns user-facing Chinese copy for known auth API errors.
 * @param {unknown} message Server error message
 * @returns {string} Localized error message
 */
export function getLoginErrorMessage(message) {
    if (typeof message !== 'string') {
        return loginMessages.genericError;
    }

    return serverErrorMessages.get(message) || message || loginMessages.genericError;
}

/**
 * Builds the post-login home URL, preserving all query params except noauto.
 * @param {string} href Current location href
 * @returns {string} Redirect href
 */
export function buildHomeRedirectUrl(href) {
    const currentUrl = new URL(href);
    currentUrl.searchParams.delete('noauto');
    currentUrl.pathname = '/';
    return currentUrl.toString();
}

/**
 * Gets the next visible state for the password field and toggle button.
 * @param {string} currentType Current password input type
 * @returns {{type: string, iconClassName: string, ariaPressed: string, ariaLabel: string}}
 */
export function getPasswordVisibilityState(currentType) {
    if (currentType === 'password') {
        return {
            type: 'text',
            iconClassName: 'fa-solid fa-eye-slash',
            ariaPressed: 'true',
            ariaLabel: loginMessages.hidePassword,
        };
    }

    return {
        type: 'password',
        iconClassName: 'fa-solid fa-eye',
        ariaPressed: 'false',
        ariaLabel: loginMessages.showPassword,
    };
}

/**
 * Determines which recovery step is active.
 * @param {{step1Display: string, step2Display: string}} state Recovery section display state
 * @returns {1|2}
 */
export function getRecoveryStep(state) {
    return state.step1Display === 'none' && state.step2Display !== 'none' ? 2 : 1;
}

/**
 * Formats the login lockout countdown copy.
 * @param {number} remaining Seconds remaining
 * @returns {string}
 */
export function formatLockoutMessage(remaining) {
    return `账号已锁定，请在 ${remaining} 秒后重试。`;
}

import { getConfigValue, color } from './util.ts';
import { getEnableAccounts, getAllEnabledUsers } from './user-storage.ts';

/**
 * Prints an error message and exits the process if necessary
 * @param {string} message The error message to print
 * @returns {void}
 */
function logSecurityAlert(message: string) {
    const { whitelistMode } = globalThis.COMMAND_LINE_ARGS;
    if (whitelistMode || getEnableAccounts()) return; // safe!
    console.error(color.red(message));
    if (getConfigValue('securityOverride', false, 'boolean')) {
        console.warn(color.red('Security has been overridden. If it\'s not a trusted network, change the settings.'));
        return;
    }
    process.exit(1);
}

/**
 * Verifies the security settings and prints warnings if necessary
 * @returns {Promise<void>}
 */
export async function verifySecuritySettings() {
    const { listen } = globalThis.COMMAND_LINE_ARGS;

    // Skip all security checks as listen is set to false
    if (!listen) {
        return;
    }

    if (!getEnableAccounts()) {
        logSecurityAlert('Your current EmberDesk configuration is insecure (listening to non-localhost). Enable user accounts or whitelisting.');
    }

    const users = await getAllEnabledUsers();
    const unprotectedUsers = users.filter(x => !x.password);
    const unprotectedAdminUsers = unprotectedUsers.filter(x => x.admin);

    if (unprotectedUsers.length > 0) {
        console.warn(color.blue('A friendly reminder that the following users are not password protected:'));
        unprotectedUsers.map(x => `${color.yellow(x.handle)} ${color.red(x.admin ? '(admin)' : '')}`).forEach(x => console.warn(x));
        console.log();
        console.warn(`Consider setting a password in the admin panel or by using the ${color.blue('recover.js')} script.`);
        console.log();

        if (unprotectedAdminUsers.length > 0) {
            logSecurityAlert('Set a password for all admin users via the admin panel or recover.js.');
        }
    }
}

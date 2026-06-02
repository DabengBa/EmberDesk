import path from 'node:path';

import sanitize from 'sanitize-filename';

/**
 * Normalizes a chat name for backup file naming.
 * @param {string} name Chat or card name.
 * @returns {string} Backup-safe normalized name.
 */
export function normalizeChatBackupName(name) {
    return sanitize(name).replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

/**
 * Determines whether global chat-backup retention should run.
 * @param {number} maxTotalChatBackups Maximum total backup count from config.
 * @returns {boolean} True when total retention is configured.
 */
export function shouldApplyTotalChatBackupRetention(maxTotalChatBackups) {
    return !Number.isNaN(maxTotalChatBackups) && maxTotalChatBackups >= 0;
}

/**
 * Plans deterministic chat-backup paths and retention inputs.
 * @param {object} options Planning options.
 * @param {string} options.directory User backup directory.
 * @param {string} options.name Chat or card name.
 * @param {string} options.backupPrefix Backup file prefix.
 * @param {string} options.timestamp Generated timestamp.
 * @param {number} options.maxTotalChatBackups Maximum total backup count from config.
 * @returns {{
 *   normalizedName: string,
 *   backupFile: string,
 *   perChatCleanupPrefix: string,
 *   shouldApplyTotalRetention: boolean,
 *   totalCleanupPrefix: string,
 *   totalCleanupLimit: number,
 * }} Backup planning result.
 */
export function createChatBackupPlan({
    directory,
    name,
    backupPrefix,
    timestamp,
    maxTotalChatBackups,
}) {
    const normalizedName = normalizeChatBackupName(name);
    return {
        normalizedName,
        backupFile: path.join(directory, `${backupPrefix}${normalizedName}_${timestamp}.jsonl`),
        perChatCleanupPrefix: `${backupPrefix}${normalizedName}_`,
        shouldApplyTotalRetention: shouldApplyTotalChatBackupRetention(maxTotalChatBackups),
        totalCleanupPrefix: backupPrefix,
        totalCleanupLimit: maxTotalChatBackups,
    };
}

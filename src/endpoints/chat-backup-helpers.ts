import path from 'node:path';

import sanitize from 'sanitize-filename';

type ChatBackupPlanOptions = {
    directory: string;
    name: string;
    backupPrefix: string;
    timestamp: string;
    maxTotalChatBackups: number;
};

type ChatBackupPlan = {
    normalizedName: string;
    backupFile: string;
    perChatCleanupPrefix: string;
    shouldApplyTotalRetention: boolean;
    totalCleanupPrefix: string;
    totalCleanupLimit: number;
};

/** Normalizes a chat name for backup file naming. */
export function normalizeChatBackupName(name: string): string {
    return sanitize(name).replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

/** Determines whether global chat-backup retention should run. */
export function shouldApplyTotalChatBackupRetention(maxTotalChatBackups: number): boolean {
    return !Number.isNaN(maxTotalChatBackups) && maxTotalChatBackups >= 0;
}

/** Plans deterministic chat-backup paths and retention inputs. */
export function createChatBackupPlan({
    directory,
    name,
    backupPrefix,
    timestamp,
    maxTotalChatBackups,
}: ChatBackupPlanOptions): ChatBackupPlan {
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

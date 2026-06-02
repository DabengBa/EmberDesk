import path from 'node:path';

import {
    createChatBackupPlan,
    normalizeChatBackupName,
    shouldApplyTotalChatBackupRetention,
} from '../src/endpoints/chat-backup-helpers.js';

describe('chat backup helpers', () => {
    test('normalizes backup names with the current sanitize and underscore policy', () => {
        expect(normalizeChatBackupName('Ada Lovelace! Session #1')).toBe('ada_lovelace__session__1');
        expect(normalizeChatBackupName('Mixed_CASE 42')).toBe('mixed_case_42');
    });

    test('builds backup file path and cleanup prefixes from explicit inputs', () => {
        const plan = createChatBackupPlan({
            directory: path.join('data', 'default-user', 'backups'),
            name: 'Ada Lovelace! Session #1',
            backupPrefix: 'chat_',
            timestamp: '20260602-120000',
            maxTotalChatBackups: 25,
        });

        expect(plan).toEqual({
            normalizedName: 'ada_lovelace__session__1',
            backupFile: path.join('data', 'default-user', 'backups', 'chat_ada_lovelace__session__1_20260602-120000.jsonl'),
            perChatCleanupPrefix: 'chat_ada_lovelace__session__1_',
            shouldApplyTotalRetention: true,
            totalCleanupPrefix: 'chat_',
            totalCleanupLimit: 25,
        });
    });

    test('keeps total backup retention disabled for NaN and negative limits', () => {
        expect(shouldApplyTotalChatBackupRetention(NaN)).toBe(false);
        expect(shouldApplyTotalChatBackupRetention(-1)).toBe(false);
    });

    test('keeps total backup retention enabled for zero and positive limits', () => {
        expect(shouldApplyTotalChatBackupRetention(0)).toBe(true);
        expect(shouldApplyTotalChatBackupRetention(1)).toBe(true);
    });
});

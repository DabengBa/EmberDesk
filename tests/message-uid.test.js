import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getMessageUid } from '../public/scripts/message-uid.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('message uid', () => {
    test('returns a stable uid for the same message object across splices', () => {
        const message = { name: 'Assistant', mes: 'hello', extra: {} };
        const chat = [{ mes: 'a' }, message, { mes: 'b' }];
        const before = getMessageUid(chat[1]);

        chat.splice(0, 1);
        expect(getMessageUid(chat[0])).toBe(before);

        chat.unshift({ mes: 'x' });
        expect(getMessageUid(chat[1])).toBe(before);
    });

    test('stays stable through in-place content mutation', () => {
        const message = { mes: 'before', extra: {} };
        const uid = getMessageUid(message);

        message.mes = 'after';
        message.extra.token_count = 42;

        expect(getMessageUid(message)).toBe(uid);
    });

    test('assigns distinct uids to distinct objects including equal content', () => {
        const first = { mes: 'same', extra: {} };
        const second = { mes: 'same', extra: {} };

        expect(getMessageUid(first)).not.toBe(getMessageUid(second));
    });

    test('returns an empty string for non-object input', () => {
        expect(getMessageUid(null)).toBe('');
        expect(getMessageUid(undefined)).toBe('');
        expect(getMessageUid('text')).toBe('');
        expect(getMessageUid(3)).toBe('');
    });

    test('is wired into the projection as record uid', () => {
        const source = fs.readFileSync(
            path.join(repoRoot, 'public', 'scripts', 'main-chat-store-projection.js'),
            'utf8',
        );

        expect(source).toContain("from './message-uid.js'");
        expect(source).toContain('uid: getMessageUid(message)');
    });

    test('is used as the React row key with the index id as fallback', () => {
        const source = fs.readFileSync(
            path.join(repoRoot, 'app', 'workspace-panels.tsx'),
            'utf8',
        );

        expect(source).toContain('key={message.uid || message.id}');
    });
});

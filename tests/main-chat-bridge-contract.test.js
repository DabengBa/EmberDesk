import { describe, expect, test } from '@jest/globals';

import {
    MAIN_CHAT_MESSAGE_ACTION_SNAPSHOT_SCHEMA,
    MAIN_CHAT_MESSAGE_ROW_SNAPSHOT_SCHEMA,
    MAIN_CHAT_RICH_BODY_RENDERER_REASONS,
    MAIN_CHAT_RICH_BODY_SNAPSHOT_SCHEMA,
    MAIN_CHAT_VISIBLE_TRANSPORT_PATHS,
    MAIN_CHAT_VISIBLE_TRANSPORT_REASONS,
    MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES,
    SUPPORTED_REACT_VISIBLE_GENERATION_KINDS,
} from '../public/scripts/main-chat-bridge-contract.js';

describe('main chat bridge contract', () => {
    test('publishes the shared visible transport contract constants', () => {
        expect(SUPPORTED_REACT_VISIBLE_GENERATION_KINDS).toEqual([
            'submitComposer',
            'continueLast',
            'retryGeneration',
            'swipeLeft',
            'swipeRight',
        ]);
        expect(MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES).toEqual({
            REACT_OWNED: 'react-owned',
            LEGACY_FALLBACK: 'legacy-fallback',
            UNSUPPORTED_WITH_REASON: 'unsupported-with-reason',
            LEGACY_OWNED: 'legacy-owned',
        });
        expect(MAIN_CHAT_VISIBLE_TRANSPORT_PATHS).toEqual(expect.objectContaining({
            STANDARD_OPENAI_VISIBLE_DIRECT_CHAT: 'standard-openai-visible-direct-chat',
            NON_OPENAI_PROVIDER: 'non-openai-provider',
            UNKNOWN_VISIBLE_GENERATION_KIND: 'unknown-visible-generation-kind',
            QUIET_NON_VISIBLE_HELPER: 'quiet-non-visible-helper',
            BACKGROUND_NON_VISIBLE_HELPER: 'background-non-visible-helper',
        }));
        expect(MAIN_CHAT_VISIBLE_TRANSPORT_REASONS).toEqual(expect.objectContaining({
            SUPPORTED_KIND: 'supported-kind',
            UNSUPPORTED_API: 'unsupported-api',
            UNSUPPORTED_KIND: 'unsupported-kind',
            QUIET_GENERATION: 'quiet-generation',
            BACKGROUND_GENERATION: 'background-generation',
        }));
    });

    test('publishes the shared snapshot schema markers and renderer fallback reasons', () => {
        expect(MAIN_CHAT_RICH_BODY_SNAPSHOT_SCHEMA).toBe('mainChatRichBodySnapshotSchema');
        expect(MAIN_CHAT_MESSAGE_ROW_SNAPSHOT_SCHEMA).toBe('mainChatMessageRowSnapshotSchema');
        expect(MAIN_CHAT_MESSAGE_ACTION_SNAPSHOT_SCHEMA).toBe('mainChatMessageActionSnapshotSchema');
        expect(MAIN_CHAT_RICH_BODY_RENDERER_REASONS).toEqual({
            SAFE_FINALIZED_ROW: 'safe-finalized-row',
            MISSING_MES_TEXT: 'missing-mes-text',
            EXTENSION_MUTATED_ROW: 'extension-mutated-row',
            EDITING_ROW: 'editing-row',
            STREAMING_ROW: 'streaming-row',
            UNSAFE_ROW: 'unsafe-row',
        });
    });
});

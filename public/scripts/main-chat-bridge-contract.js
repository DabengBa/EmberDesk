export const SUPPORTED_REACT_VISIBLE_GENERATION_KINDS = Object.freeze([
    'submitComposer',
    'continueLast',
    'retryGeneration',
    'swipeLeft',
    'swipeRight',
]);

export const MAIN_CHAT_VISIBLE_TRANSPORT_STATUSES = Object.freeze({
    SERVICE_OWNED: 'service-owned',
    UNSUPPORTED_WITH_REASON: 'unsupported-with-reason',
});

export const MAIN_CHAT_VISIBLE_TRANSPORT_PATHS = Object.freeze({
    STANDARD_OPENAI_VISIBLE_DIRECT_CHAT: 'standard-openai-visible-direct-chat',
    NON_OPENAI_PROVIDER: 'non-openai-provider',
    GROUP_CHAT: 'group-chat',
    DRY_RUN: 'dry-run',
    NESTED_VISIBLE_GENERATION: 'nested-visible-generation',
    QUIET_GENERATION: 'quiet-generation',
    BACKGROUND_GENERATION: 'background-generation',
    UNKNOWN_VISIBLE_GENERATION_KIND: 'unknown-visible-generation-kind',
    QUIET_NON_VISIBLE_HELPER: 'quiet-non-visible-helper',
    QUIET_TO_LOUD_NON_VISIBLE_HELPER: 'quiet-to-loud-non-visible-helper',
    BACKGROUND_NON_VISIBLE_HELPER: 'background-non-visible-helper',
});

export const MAIN_CHAT_VISIBLE_TRANSPORT_REASONS = Object.freeze({
    SUPPORTED_KIND: 'supported-kind',
    UNSUPPORTED_API: 'unsupported-api',
    GROUP_CHAT: 'group-chat',
    DRY_RUN: 'dry-run',
    NESTED_GENERATION: 'nested-generation',
    QUIET_GENERATION: 'quiet-generation',
    BACKGROUND_GENERATION: 'background-generation',
    UNSUPPORTED_KIND: 'unsupported-kind',
    QUIET_TO_LOUD: 'quiet-to-loud',
});

export const MAIN_CHAT_RICH_BODY_RENDERER_REASONS = Object.freeze({
    SAFE_FINALIZED_ROW: 'safe-finalized-row',
    MISSING_MES_TEXT: 'missing-mes-text',
    EXTENSION_MUTATED_ROW: 'extension-mutated-row',
    EDITING_ROW: 'editing-row',
    STREAMING_ROW: 'streaming-row',
    UNSAFE_ROW: 'unsafe-row',
});

export const MAIN_CHAT_RICH_BODY_SNAPSHOT_SCHEMA = 'mainChatRichBodySnapshotSchema';
export const MAIN_CHAT_MESSAGE_ROW_SNAPSHOT_SCHEMA = 'mainChatMessageRowSnapshotSchema';
export const MAIN_CHAT_MESSAGE_ACTION_SNAPSHOT_SCHEMA = 'mainChatMessageActionSnapshotSchema';

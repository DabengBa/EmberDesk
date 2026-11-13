// Compatibility facade: the synchronous typed generation owner is the sole implementation.
export {
    getFallbackOpenAIModel,
    hasFallbackProviderSettings,
    isRecoverableGenerationFailure,
    isMainChatVisibleGeneration,
} from './generation-shared-state.js';

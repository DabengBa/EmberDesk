// Compatibility facade: the synchronous typed generation owner is the sole implementation.
export {
    hasFallbackProviderForGeneration,
    buildGenerationLifecycleAttempts,
    createGenerationLifecyclePlan,
    createQuietGenerationLifecycleContract,
    getGenerationFailureDecision,
    getGenerationSuccessFinalization,
} from './generation-shared-state.js';

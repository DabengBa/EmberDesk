import { createStore } from 'zustand/vanilla';

function createDefaultMainChatObservation() {
    return {
        activeMessageId: null,
        chatId: null,
        generationPhase: 'idle',
        messageCount: 0,
        streamingPhase: 'idle',
        updatedAt: 0,
        visibleMessageIds: [],
    };
}

const mainChatObservationStore = createStore(() => createDefaultMainChatObservation());

export function getMainChatObservationStore() {
    return mainChatObservationStore;
}

export function resetMainChatObservationStore() {
    mainChatObservationStore.setState(createDefaultMainChatObservation(), true);
}

export function getMainChatObservationSnapshot() {
    return mainChatObservationStore.getState();
}

function normalizeVisibleMessageIds(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(item => item !== null && item !== undefined && item !== '')
        .map(item => String(item));
}

function normalizeActiveMessageId(...candidates) {
    for (const candidate of candidates) {
        if (Number.isInteger(candidate) && candidate >= 0) {
            return candidate;
        }
    }
    return null;
}

/**
 * @param {Record<string, any>} [state]
 */
export function updateMainChatObservation(state = {}) {
    mainChatObservationStore.setState({
        activeMessageId: normalizeActiveMessageId(
            state?.generationControl?.activeMessageId,
            state?.streamingTransport?.activeMessageId,
        ),
        chatId: typeof state?.chatId === 'string' && state.chatId.length > 0 ? state.chatId : null,
        generationPhase: state?.generationControl?.phase ?? 'idle',
        messageCount: Number.isInteger(state?.messageCount) && state.messageCount >= 0 ? state.messageCount : 0,
        streamingPhase: state?.streamingTransport?.phase ?? 'idle',
        updatedAt: Date.now(),
        visibleMessageIds: normalizeVisibleMessageIds(state?.visibleMessageIds),
    }, true);
}

export function subscribeMainChatObservation(listener) {
    return mainChatObservationStore.subscribe(listener);
}

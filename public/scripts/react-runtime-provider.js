const RUNTIME_EVENT_KEYS = Object.freeze([
    'CHAT_CHANGED',
    'SETTINGS_UPDATED',
    'GENERATION_STARTED',
    'GENERATION_STOPPED',
    'GENERATION_ENDED',
]);

function freezeSnapshot(snapshot) {
    return Object.freeze({
        chat: Object.freeze({ ...snapshot.chat }),
        generation: Object.freeze({ ...snapshot.generation }),
    });
}

function normalizeString(value) {
    const normalized = typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : '';
    return normalized || null;
}

function getGenerationPhase(context) {
    const processor = context?.streamingProcessor;
    if (!processor || typeof processor !== 'object') {
        return 'idle';
    }
    if (processor.isStopped) {
        return 'stopped';
    }
    if (processor.isFinished) {
        return 'finished';
    }
    return 'streaming';
}

function createSnapshot(getContext) {
    const context = getContext?.() ?? {};
    return freezeSnapshot({
        chat: {
            id: normalizeString(context.chatId),
            characterId: normalizeString(context.characterId),
            title: normalizeString(context.name2) ?? '',
        },
        generation: {
            phase: getGenerationPhase(context),
        },
    });
}

function snapshotsMatch(left, right) {
    return left.chat.id === right.chat.id
        && left.chat.characterId === right.chat.characterId
        && left.chat.title === right.chat.title
        && left.generation.phase === right.generation.phase;
}

function createNamedEventSubscription(eventSource, eventTypes, listener) {
    const eventNames = RUNTIME_EVENT_KEYS
        .map(key => eventTypes?.[key])
        .filter(name => typeof name === 'string' && name.length > 0);

    for (const eventName of eventNames) {
        eventSource.on(eventName, listener);
    }

    return () => {
        for (const eventName of eventNames) {
            eventSource.removeListener(eventName, listener);
        }
    };
}

export function createReactRuntimeProvider({
    getContext,
    eventSource,
    eventTypes,
    commands,
}) {
    if (typeof getContext !== 'function') {
        throw new TypeError('React runtime provider requires getContext');
    }
    if (!eventSource || typeof eventSource.on !== 'function' || typeof eventSource.removeListener !== 'function') {
        throw new TypeError('React runtime provider requires a named event source');
    }
    if (!commands || typeof commands !== 'object') {
        throw new TypeError('React runtime provider requires named commands');
    }

    const commandNames = ['submitMessage', 'stopGeneration', 'retryMessage', 'loadEarlier', 'saveSettings'];
    for (const commandName of commandNames) {
        if (typeof commands[commandName] !== 'function') {
            throw new TypeError(`React runtime provider requires command ${commandName}`);
        }
    }

    let snapshot = null;
    const refreshSnapshot = () => {
        const nextSnapshot = createSnapshot(getContext);
        if (!snapshot || !snapshotsMatch(snapshot, nextSnapshot)) {
            snapshot = nextSnapshot;
        }
        return snapshot;
    };

    return {
        getSnapshot() {
            return refreshSnapshot();
        },
        subscribe(listener) {
            if (typeof listener !== 'function') {
                throw new TypeError('React runtime subscriber must be a function');
            }
            return createNamedEventSubscription(eventSource, eventTypes, () => {
                refreshSnapshot();
                listener();
            });
        },
        commands: Object.freeze({
            submitMessage: input => Promise.resolve(commands.submitMessage(input)),
            stopGeneration: () => commands.stopGeneration(),
            retryMessage: messageId => Promise.resolve(commands.retryMessage(messageId)),
            loadEarlier: anchorId => Promise.resolve(commands.loadEarlier(anchorId)),
            saveSettings: settings => Promise.resolve(commands.saveSettings(settings)),
        }),
    };
}

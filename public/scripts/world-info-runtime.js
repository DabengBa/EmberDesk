/** Compose runtime event listeners exactly once, independently of editor rendering. */
export function createWorldInfoRuntimeInitializer({ eventSource, eventTypes, getChatWorld, getWorldNames, setChatWorldActive, getSortedEntries, getExternalActivations, registerSlashCommands }) {
    let initialized = false;
    return function ensureWorldInfoRuntimeInitialized() {
        if (initialized) return;
        eventSource.on(eventTypes.CHAT_CHANGED, async () => {
            const chatWorld = getChatWorld();
            setChatWorldActive(!!chatWorld && getWorldNames().includes(chatWorld));
            await getSortedEntries();
        });
        eventSource.on(eventTypes.WORLDINFO_FORCE_ACTIVATE, entries => {
            for (const entry of entries) {
                if (!Object.hasOwn(entry, 'world') || !Object.hasOwn(entry, 'uid')) {
                    console.error('[WI] WORLDINFO_FORCE_ACTIVATE requires all entries to have both world and uid fields, entry IGNORED', entry);
                } else {
                    getExternalActivations().set(`${entry.world}.${entry.uid}`, entry);
                    console.log('[WI] WORLDINFO_FORCE_ACTIVATE added entry', entry);
                }
            }
        });
        registerSlashCommands();
        initialized = true;
    };
}

export function buildGreetingOptions(character) {
    const authored = [character?.first_mes, ...(Array.isArray(character?.data?.alternate_greetings) ? character.data.alternate_greetings : [])];
    return authored.flatMap((text, index) => typeof text === 'string' && text.trim()
        ? [{ index, text }]
        : []);
}

export function summarizeGreeting(text) {
    return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

export function canSwitchGreeting({ characterId, chat, metadata, isGenerating, isChatSaving, isEditing }) {
    if (characterId === undefined || characterId === null || metadata?.tainted || isGenerating || isChatSaving || isEditing || !Array.isArray(chat) || chat.length === 0 || chat.length > 1) return false;
    const [message] = chat;
    return message?.is_user !== true && message?.is_system !== true
        && message?.extra?.streaming !== true && message?.extra?.editing !== true;
}

export function replaceGreeting({ characterId, chat, metadata, isGenerating, isChatSaving, isEditing, message }) {
    if (!canSwitchGreeting({ characterId, chat, metadata, isGenerating, isChatSaving, isEditing })) return null;
    const replacement = { ...message, extra: {} };
    for (const key of ['swipe_id', 'swipes', 'swipe_info', 'gen_started', 'gen_finished', 'gen_started_at', 'gen_finished_at']) delete replacement[key];
    return { chat: [replacement], metadata: structuredClone(metadata ?? {}) };
}

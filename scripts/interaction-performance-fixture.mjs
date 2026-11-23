export function createCharacterCard(index) {
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        chat: 'Session 1',
        data: {
            name: `Perf Character ${index + 1}`,
            description: `Description ${index + 1}`,
            scenario: `Scenario ${index + 1}`,
            first_mes: `First ${index + 1}`,
            mes_example: `Example ${index + 1}`,
            creator_notes: `Creator notes ${index + 1}`,
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: [],
            tags: [`tag-${index % 5}`],
            creator: 'perf-runner',
            character_version: '2.0',
            extensions: { talkativeness: 0.5, fav: index % 7 === 0, world: '' },
        },
    };
}

export function createStreamMarker(sampleIndex) {
    return `Perf streamed [sample ${sampleIndex}] `;
}

export function createChatMessages(characterIndex, chatIndex, messageCount) {
    const startedAt = new Date(Date.UTC(2026, 4, 10, 0, 0, 0) + ((characterIndex * 100) + chatIndex) * 60000);
    const messages = [{
        user_name: 'User',
        character_name: `Perf Character ${characterIndex + 1}`,
        create_date: startedAt.toISOString(),
        chat_metadata: {
            scenario: 'perf-benchmark',
            system_prompt: '',
            mes_example: '',
            // This interaction fixture has no summarization provider; memory is not measured here.
            chat_memory: { disabled: true },
        },
    }];

    for (let index = 0; index < messageCount; index++) {
        messages.push({
            name: index % 2 === 0 ? 'User' : `Perf Character ${characterIndex + 1}`,
            is_user: index % 2 === 0,
            mes: `Message ${index + 1} for character ${characterIndex + 1}, chat ${chatIndex + 1}.`,
            send_date: new Date(startedAt.getTime() + index * 15000).toISOString(),
            extra: { id: `perf-${characterIndex}-${chatIndex}-${index}` },
        });
    }
    return messages;
}

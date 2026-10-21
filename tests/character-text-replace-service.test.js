import { jest } from '@jest/globals';

import {
    buildTextMatcher,
    replaceInString,
    transformCharacterCard,
    transformWorldBookEntries,
    transformEmbeddedBook,
    transformChatMessages,
    runCharacterTextReplace,
} from '../src/endpoints/character-text-replace-service.js';

function makeMatcher(query, replacement, options = {}) {
    const result = buildTextMatcher(query, replacement, options);
    expect(result.ok).toBe(true);
    return result;
}

describe('buildTextMatcher', () => {
    test('literal mode escapes regex metacharacters in the query', () => {
        const { pattern } = makeMatcher('a.b+c', 'x');
        expect('xa.b+c'.match(pattern)).toHaveLength(1);
        expect('abbc'.match(pattern)).toBeNull();
    });

    test('literal mode escapes $ in the replacement', () => {
        const { pattern, replacer } = makeMatcher('foo', '$100');
        expect('foo'.replace(pattern, replacer)).toBe('$100');
    });

    test('case-insensitive by default, case-sensitive when opted in', () => {
        const insensitive = makeMatcher('Foo', 'x');
        expect('a FOO b'.match(insensitive.pattern)).toHaveLength(1);
        const sensitive = makeMatcher('Foo', 'x', { caseSensitive: true });
        expect('a FOO b'.match(sensitive.pattern)).toBeNull();
        expect('a Foo b'.match(sensitive.pattern)).toHaveLength(1);
    });

    test('whole word avoids substrings inside other words', () => {
        const { pattern } = makeMatcher('cat', 'dog', { wholeWord: true });
        expect('the cat sat'.match(pattern)).toHaveLength(1);
        expect('concatenate'.match(pattern)).toBeNull();
    });

    test('whole word respects unicode letters and underscore', () => {
        const { pattern } = makeMatcher('旅人', '老旅', { wholeWord: true });
        // CJK letters count as word characters: punctuation bounds, letters/underscore do not.
        expect('「旅人」·导游'.match(pattern)).toHaveLength(1);
        expect('一位旅人来了'.match(pattern)).toBeNull();
        expect('老旅人来了'.match(pattern)).toBeNull();
        expect('_旅人来了'.match(pattern)).toBeNull();
    });

    test('regex mode supports capture substitution', () => {
        const { pattern, replacer } = makeMatcher('(\\w+)_(\\d+)', '$1-$2', { regex: true });
        expect('abc_12 def_34'.replace(pattern, replacer)).toBe('abc-12 def-34');
    });

    test('rejects empty query and invalid regex', () => {
        expect(buildTextMatcher('', 'x').ok).toBe(false);
        expect(buildTextMatcher('(', 'x', { regex: true }).ok).toBe(false);
        expect(buildTextMatcher('(', 'x').ok).toBe(true);
    });
});

describe('replaceInString', () => {
    test('reports occurrences and capped before/after samples', () => {
        const matcher = makeMatcher('foo', 'bar');
        const text = Array.from({ length: 6 }, (_, i) => `${i} foo ${i}`).join('. ');
        const result = replaceInString(text, matcher);
        expect(result.occurrences).toBe(6);
        expect(result.samples).toHaveLength(3);
        expect(result.samples[0].before).toContain('「foo」');
        expect(result.samples[0].after).toContain('「bar」');
        expect(result.value).not.toContain('foo');
    });

    test('zero matches returns the original text', () => {
        const matcher = makeMatcher('zzz', 'y');
        const result = replaceInString('nothing here', matcher);
        expect(result.occurrences).toBe(0);
        expect(result.value).toBe('nothing here');
    });

    test('non-string input is treated as empty', () => {
        const matcher = makeMatcher('x', 'y');
        expect(replaceInString(undefined, matcher).occurrences).toBe(0);
        expect(replaceInString(null, matcher).occurrences).toBe(0);
    });
});

describe('transformCharacterCard', () => {
    function makeCard() {
        return {
            name: 'Seraphina',
            avatar: 'Seraphina.png',
            description: 'A mage named Seraphina.',
            scenario: 'Seraphina meets the traveler.',
            first_mes: 'Seraphina greets you.',
            mes_example: 'Seraphina said...',
            creatorcomment: 'by the Seraphina team',
            tags: ['Seraphina', 'mage', 'Seraphina lore'],
            data: {
                description: 'A mage named Seraphina.',
                scenario: 'Seraphina meets the traveler.',
                first_mes: 'Seraphina greets you.',
                mes_example: 'Seraphina said...',
                creator_notes: 'by the Seraphina team',
                system_prompt: 'You are Seraphina.',
                post_history_instructions: 'Stay in character as Seraphina.',
                alternate_greetings: ['Hi from Seraphina', 'Hello from Seraphina'],
                tags: ['Seraphina', 'mage', 'Seraphina lore'],
                creator: 'team',
                character_version: '1.0',
                extensions: {
                    depth_prompt: { prompt: 'Seraphina whispers.', depth: 4, role: 'system' },
                    world: 'Eldoria',
                    talkativeness: 0.5,
                    fav: false,
                },
            },
        };
    }

    test('replaces data.* and syncs the V1 top-level mirrors', () => {
        const card = makeCard();
        const matcher = makeMatcher('Seraphina', '塞拉菲娜');
        const { changed, matches } = transformCharacterCard(
            card,
            ['description', 'scenario', 'firstMes', 'exampleMessages', 'creatorNotes'],
            matcher,
        );

        expect(changed).toBe(true);
        expect(card.data.description).toContain('塞拉菲娜');
        expect(card.description).toContain('塞拉菲娜');
        expect(card.scenario).toContain('塞拉菲娜');
        expect(card.data.scenario).toContain('塞拉菲娜');
        expect(card.first_mes).toContain('塞拉菲娜');
        expect(card.data.first_mes).toContain('塞拉菲娜');
        expect(card.mes_example).toContain('塞拉菲娜');
        expect(card.creatorcomment).toContain('塞拉菲娜');
        expect(card.data.creator_notes).toContain('塞拉菲娜');
        // One match row per logical field; V1 mirrors are written but not listed.
        expect(matches.map(m => m.field).sort()).toEqual(
            ['creatorNotes', 'description', 'exampleMessages', 'firstMes', 'scenario'],
        );
        expect(matches.every(m => m.path.startsWith('data.'))).toBe(true);
    });

    test('does not touch identity fields or the world binding', () => {
        const card = makeCard();
        card.name = 'Seraphina';
        const matcher = makeMatcher('Seraphina', 'X');
        transformCharacterCard(
            card,
            ['description', 'scenario', 'firstMes', 'exampleMessages', 'alternateGreetings',
                'systemPrompt', 'postHistoryInstructions', 'depthPrompt', 'creatorNotes',
                'creator', 'characterVersion', 'tags'],
            matcher,
        );
        expect(card.name).toBe('Seraphina');
        expect(card.data.extensions.world).toBe('Eldoria');
        expect(card.data.extensions.depth_prompt.depth).toBe(4);
        expect(card.data.extensions.depth_prompt.role).toBe('system');
    });

    test('replaces inside alternate_greetings array items', () => {
        const card = makeCard();
        const matcher = makeMatcher('Seraphina', '塞拉菲娜');
        const { matches } = transformCharacterCard(card, ['alternateGreetings'], matcher);
        expect(card.data.alternate_greetings).toEqual(['Hi from 塞拉菲娜', 'Hello from 塞拉菲娜']);
        expect(matches.map(m => m.path)).toEqual([
            'data.alternate_greetings[0]',
            'data.alternate_greetings[1]',
        ]);
    });

    test('replaces tags and deduplicates afterward', () => {
        const card = makeCard();
        const matcher = makeMatcher('Seraphina lore', 'Seraphina');
        const { changed } = transformCharacterCard(card, ['tags'], matcher);
        expect(changed).toBe(true);
        expect(card.data.tags).toEqual(['Seraphina', 'mage']);
        expect(card.tags).toEqual(card.data.tags);
    });

    test('replaces depth_prompt.prompt only', () => {
        const card = makeCard();
        const matcher = makeMatcher('Seraphina', 'X');
        transformCharacterCard(card, ['depthPrompt'], matcher);
        expect(card.data.extensions.depth_prompt.prompt).toBe('X whispers.');
    });

    test('excluded field paths are skipped', () => {
        const card = makeCard();
        const matcher = makeMatcher('Seraphina', 'X');
        const { matches } = transformCharacterCard(
            card,
            ['description', 'alternateGreetings'],
            matcher,
            new Set(['data.description', 'data.alternate_greetings[1]']),
        );
        expect(card.data.description).toContain('Seraphina');
        expect(card.description).toContain('Seraphina');
        expect(card.data.alternate_greetings[0]).toContain('X');
        expect(card.data.alternate_greetings[1]).toContain('Seraphina');
        expect(matches.some(m => m.path === 'data.description')).toBe(false);
    });
});

describe('transformWorldBookEntries', () => {
    function makeEntries() {
        return {
            'entry-1': {
                content: 'Eldoria is ruled by Seraphina.',
                comment: 'About Seraphina',
                key: ['Seraphina', 'mage'],
                keysecondary: ['fire'],
                order: 100,
                enabled: true,
            },
            'entry-2': {
                content: 'No match here.',
                comment: '',
                key: ['forest'],
                keysecondary: [],
                order: 99,
                enabled: false,
            },
        };
    }

    test('replaces content, comment, and trigger keys', () => {
        const entries = makeEntries();
        const matcher = makeMatcher('Seraphina', '塞拉菲娜');
        const { changed, matches } = transformWorldBookEntries(entries, ['content', 'comment', 'keys'], matcher);
        expect(changed).toBe(true);
        expect(entries['entry-1'].content).toContain('塞拉菲娜');
        expect(entries['entry-1'].comment).toContain('塞拉菲娜');
        expect(entries['entry-1'].key).toEqual(['塞拉菲娜', 'mage']);
        expect(entries['entry-1'].keysecondary).toEqual(['fire']);
        expect(entries['entry-1'].order).toBe(100);
        expect(matches.every(m => m.entryUid === 'entry-1')).toBe(true);
        expect(matches[0].entryTitle).toBe('About 塞拉菲娜');
    });

    test('field selection limits which fields change', () => {
        const entries = makeEntries();
        const matcher = makeMatcher('Seraphina', 'X');
        transformWorldBookEntries(entries, ['content'], matcher);
        expect(entries['entry-1'].content).toContain('X');
        expect(entries['entry-1'].comment).toBe('About Seraphina');
        expect(entries['entry-1'].key).toEqual(['Seraphina', 'mage']);
    });
});

describe('transformEmbeddedBook', () => {
    test('uses keys/secondary_keys field names', () => {
        const book = {
            name: 'Eldoria',
            entries: [{
                keys: ['Seraphina'],
                secondary_keys: ['magic'],
                content: 'Seraphina lives here.',
                comment: '',
                enabled: true,
            }],
        };
        const matcher = makeMatcher('Seraphina', 'X');
        const { changed } = transformEmbeddedBook(book, ['keys', 'content'], matcher);
        expect(changed).toBe(true);
        expect(book.entries[0].keys).toEqual(['X']);
        expect(book.entries[0].secondary_keys).toEqual(['magic']);
        expect(book.entries[0].content).toContain('X');
    });
});

describe('transformChatMessages', () => {
    function makeChat() {
        return [
            { chat_metadata: { user_name: 'User', character_name: 'Seraphina' }, user_name: '旅人', character_name: '塞拉菲娜' },
            { name: '旅人', is_user: true, mes: 'Hello Seraphina', send_date: 1000, extra: {} },
            { name: 'Seraphina', is_user: false, mes: 'I am Seraphina.', send_date: 1001, extra: { reasoning: 'Seraphina thinks about it.', tool_invocations: [] } },
        ];
    }

    test('replaces mes and extra.reasoning, preserves header and metadata', () => {
        const chat = makeChat();
        const matcher = makeMatcher('Seraphina', '塞拉菲娜');
        const { changed, matches } = transformChatMessages(chat, ['mes', 'reasoning'], matcher);
        expect(changed).toBe(true);
        expect(chat[1].mes).toBe('Hello 塞拉菲娜');
        expect(chat[2].mes).toBe('I am 塞拉菲娜.');
        expect(chat[2].extra.reasoning).toBe('塞拉菲娜 thinks about it.');
        expect(chat[0].chat_metadata.character_name).toBe('Seraphina');
        expect(chat[0].character_name).toBe('塞拉菲娜');
        expect(chat[1].name).toBe('旅人');
        expect(chat[1].send_date).toBe(1000);
        expect(chat[2].name).toBe('Seraphina');
        const fields = matches.map(m => m.field).sort();
        expect(fields).toEqual(['mes', 'mes', 'reasoning']);
        expect(matches.every(m => m.path.startsWith('chats['))).toBe(true);
    });

    test('field selection limits to mes only', () => {
        const chat = makeChat();
        const matcher = makeMatcher('Seraphina', 'X');
        transformChatMessages(chat, ['mes'], matcher);
        expect(chat[2].extra.reasoning).toContain('Seraphina');
        expect(chat[2].mes).toContain('X');
    });

    test('header line is never touched', () => {
        const chat = [{ mes: 'Seraphina lives here', chat_metadata: {} }];
        const matcher = makeMatcher('Seraphina', 'X');
        const { changed } = transformChatMessages(chat, ['mes', 'reasoning'], matcher);
        expect(changed).toBe(false);
        expect(chat[0].mes).toBe('Seraphina lives here');
    });
});

describe('runCharacterTextReplace orchestration', () => {
    const cardJson = JSON.stringify({
        name: 'Seraphina',
        description: 'Seraphina description.',
        data: {
            description: 'Seraphina description.',
            extensions: { world: 'Eldoria' },
        },
    });

    const worldBook = {
        name: 'Eldoria',
        description: '',
        entries: {
            'e1': { content: 'Seraphina rules.', comment: '', key: ['Seraphina'], keysecondary: [], order: 1, enabled: true },
        },
        originalData: { name: 'Eldoria', entries: { e1: { keys: ['Seraphina'], content: 'Seraphina rules.' } } },
    };

    const chatPayload = [
        { chat_metadata: {} },
        { name: 'Seraphina', is_user: false, mes: 'Seraphina speaks.', send_date: 1, extra: { reasoning: 'Seraphina reason.' } },
    ];

    function makeRequest(body) {
        return {
            body,
            user: {
                profile: { handle: 'tester' },
                directories: {
                    chats: '/data/chats',
                    backups: '/data/backups',
                    characters: '/data/characters',
                },
            },
        };
    }

    function makeDependencies(overrides = {}) {
        return {
            getCanonicalCharacterCardJson: jest.fn(async () => cardJson),
            getCharacterWriteDependencies: jest.fn(() => ({ getCardJson: () => undefined })),
            getWorldInfoWriteState: jest.fn(async () => ({ ok: true, db: { fake: true } })),
            writeWorldInfoProjection: jest.fn(),
            getCanonicalWorldInfoBook: jest.fn(() => structuredClone(worldBook)),
            upsertCanonicalWorldInfoBook: jest.fn(),
            listCanonicalCharactersBoundToWorld: jest.fn(() => [{ avatar: 'Seraphina.png' }, { avatar: 'Other.png' }]),
            convertWorldInfoToCharacterBook: jest.fn((name, entries) => ({ name, entries: Object.values(entries) })),
            recordWorldInfoProjectionRepair: jest.fn(),
            getCharacterFeatureFlags: jest.fn(() => ({ enabled: true })),
            openChatSession: jest.fn(async () => ({
                ok: true, db: { fake: true }, locator: { session_id: 's1' }, filePath: '/data/chats/Seraphina/chat.jsonl', cardName: 'Seraphina',
            })),
            writeChatSession: jest.fn(() => ({ ok: true })),
            readCanonicalChatPayload: jest.fn(() => structuredClone(chatPayload)),
            editCharacterCard: jest.fn(async () => ({ ok: true })),
            ...overrides,
        };
    }

    const fullBody = {
        avatar_url: 'Seraphina.png',
        areas: { card: true, worldBook: true, chats: 'current' },
        chatFileName: 'chat',
        query: 'Seraphina',
        replacement: '塞拉菲娜',
        options: { caseSensitive: false, wholeWord: false, regex: false },
    };

    test('preview reports matches in all three areas and mutates nothing', async () => {
        const deps = makeDependencies();
        const result = await runCharacterTextReplace({
            request: makeRequest(fullBody),
            apply: false,
            dependencies: deps,
        });

        expect(result.ok).toBe(true);
        expect(result.totals.occurrences).toBeGreaterThan(0);
        expect(result.areas.card.status).toBe('preview');
        expect(result.areas.worldBook.status).toBe('preview');
        expect(result.areas.worldBook.boundCharacterCount).toBe(2);
        expect(result.areas.chats.status).toBe('preview');
        expect(result.warnings.some(w => w.code === 'shared_world_book')).toBe(true);
        expect(deps.upsertCanonicalWorldInfoBook).not.toHaveBeenCalled();
        expect(deps.editCharacterCard).not.toHaveBeenCalled();
        expect(deps.writeChatSession).not.toHaveBeenCalled();
    });

    test('apply writes world book first, then card with refreshed snapshot, then chat', async () => {
        const order = [];
        const deps = makeDependencies({
            upsertCanonicalWorldInfoBook: jest.fn(() => order.push('world')),
            editCharacterCard: jest.fn(async ({ characterData }) => {
                order.push('card');
                const card = JSON.parse(characterData);
                expect(card.data.character_book).toBeDefined();
                return { ok: true };
            }),
            writeChatSession: jest.fn(() => { order.push('chat'); return { ok: true }; }),
        });
        const result = await runCharacterTextReplace({
            request: makeRequest(fullBody),
            apply: true,
            dependencies: deps,
        });

        expect(result.ok).toBe(true);
        expect(order).toEqual(['world', 'card', 'chat']);
        expect(result.applied).toEqual({ card: true, worldBook: true, chat: true });
        expect(deps.writeWorldInfoProjection).toHaveBeenCalled();
    });

    test('apply with no matches writes nothing', async () => {
        const deps = makeDependencies();
        const result = await runCharacterTextReplace({
            request: makeRequest({ ...fullBody, query: 'nonexistent-term' }),
            apply: true,
            dependencies: deps,
        });
        expect(result.ok).toBe(true);
        expect(deps.upsertCanonicalWorldInfoBook).not.toHaveBeenCalled();
        expect(deps.editCharacterCard).not.toHaveBeenCalled();
        expect(deps.writeChatSession).not.toHaveBeenCalled();
        // Snapshot is still refreshed when the stored embedded book differs.
        expect(result.totals.changedTargets).toBeGreaterThanOrEqual(0);
    });

    test('canonical chat unavailable returns 503', async () => {
        const deps = makeDependencies({
            openChatSession: jest.fn(async () => ({ ok: false, reason: 'canonical_chat_write_blocked' })),
        });
        const result = await runCharacterTextReplace({
            request: makeRequest({ ...fullBody, areas: { card: true, worldBook: false, chats: 'current' } }),
            apply: true,
            dependencies: deps,
        });
        expect(result.ok).toBe(false);
        expect(result.status).toBe(503);
        expect(deps.editCharacterCard).not.toHaveBeenCalled();
    });

    test('missing character returns 404', async () => {
        const deps = makeDependencies({
            getCanonicalCharacterCardJson: jest.fn(async () => null),
        });
        const result = await runCharacterTextReplace({
            request: makeRequest({ ...fullBody, areas: { card: true, worldBook: false, chats: 'off' } }),
            apply: true,
            dependencies: deps,
        });
        expect(result.ok).toBe(false);
        expect(result.status).toBe(404);
    });

    test('unbound card with embedded book transforms the embedded entries', async () => {
        const embeddedCard = JSON.stringify({
            name: 'Seraphina',
            description: 'plain',
            data: {
                description: 'plain',
                extensions: {},
                character_book: {
                    name: 'Lore',
                    entries: [{ keys: ['Seraphina'], secondary_keys: [], content: 'Seraphina lore.', comment: '' }],
                },
            },
        });
        const deps = makeDependencies({
            getCanonicalCharacterCardJson: jest.fn(async () => embeddedCard),
        });
        const result = await runCharacterTextReplace({
            request: makeRequest({ ...fullBody, areas: { card: false, worldBook: true, chats: 'off' } }),
            apply: true,
            dependencies: deps,
        });
        expect(result.ok).toBe(true);
        expect(result.areas.worldBook.embedded).toBe(true);
        expect(result.areas.worldBook.status).toBe('applied');
        const writtenCard = JSON.parse(deps.editCharacterCard.mock.calls[0][0].characterData);
        expect(writtenCard.data.character_book.entries[0].content).toContain('塞拉菲娜');
    });

    test('bad request bodies are rejected with 400', async () => {
        const deps = makeDependencies();
        for (const body of [
            { ...fullBody, avatar_url: '' },
            { ...fullBody, query: '' },
            { ...fullBody, query: '(', options: { regex: true } },
            { ...fullBody, areas: { card: false, worldBook: false, chats: 'off' } },
            { ...fullBody, chatFileName: '' },
        ]) {
            const result = await runCharacterTextReplace({
                request: makeRequest(body),
                apply: false,
                dependencies: deps,
            });
            expect(result.ok).toBe(false);
            expect(result.status).toBe(400);
        }
    });
});

import {
    convertAgnaiMemoryBook,
    convertCharacterBook,
    convertNovelLorebook,
    convertRisuLorebook,
} from '../public/scripts/world-info-converters.js';

const BASE_ENTRY_KEYS = [
    'addMemo',
    'automationId',
    'caseSensitive',
    'comment',
    'constant',
    'content',
    'cooldown',
    'delay',
    'delayUntilRecursion',
    'depth',
    'disable',
    'displayIndex',
    'excludeRecursion',
    'group',
    'groupOverride',
    'groupWeight',
    'ignoreBudget',
    'key',
    'keysecondary',
    'matchCharacterDepthPrompt',
    'matchCharacterDescription',
    'matchCharacterPersonality',
    'matchCreatorNotes',
    'matchPersonaDescription',
    'matchScenario',
    'matchWholeWords',
    'order',
    'outletName',
    'position',
    'preventRecursion',
    'probability',
    'role',
    'scanDepth',
    'selective',
    'selectiveLogic',
    'sticky',
    'triggers',
    'uid',
    'useGroupScoring',
    'useProbability',
    'vectorized',
].sort();

const CHARACTER_BOOK_ENTRY_KEYS = [...BASE_ENTRY_KEYS, 'extensions'].sort();

function expectEntryKeys(entry, expectedKeys = BASE_ENTRY_KEYS) {
    expect(Object.keys(entry).sort()).toEqual(expectedKeys);
}

describe('world info converters', () => {
    test('converts Novel Lorebook entries into world info entries', () => {
        const converted = convertNovelLorebook({
            lorebookVersion: 3,
            entries: [
                {
                    displayName: 'Capital City',
                    keys: ['capital', 'city'],
                    text: 'The capital is Ember.',
                    enabled: false,
                    contextConfig: { budgetPriority: 7 },
                },
                {
                    displayName: '',
                    keys: ['river'],
                    text: 'The river runs north.',
                    enabled: true,
                },
            ],
        });

        expect(converted.entries[0]).toMatchObject({
            uid: 0,
            key: ['capital', 'city'],
            keysecondary: [],
            comment: 'Capital City',
            content: 'The capital is Ember.',
            constant: false,
            selective: false,
            selectiveLogic: 0,
            order: 7,
            position: 0,
            disable: true,
            addMemo: true,
            probability: 100,
            useProbability: true,
            groupWeight: 100,
            role: 0,
            triggers: [],
            ignoreBudget: false,
        });
        expect(converted.entries[1]).toMatchObject({
            uid: 1,
            comment: '',
            order: 0,
            disable: false,
            addMemo: false,
        });
        expectEntryKeys(converted.entries[0]);
        expectEntryKeys(converted.entries[1]);
    });

    test('converts empty Novel Lorebook entries without synthetic rows', () => {
        expect(convertNovelLorebook({ lorebookVersion: 3, entries: [] })).toEqual({ entries: {} });
    });

    test('converts Agnai Memory Book entries into world info entries', () => {
        const converted = convertAgnaiMemoryBook({
            kind: 'memory',
            entries: [
                {
                    keywords: ['ship', 'dock'],
                    name: 'Harbor',
                    entry: 'Ships dock at dusk.',
                    weight: 12,
                    enabled: true,
                },
            ],
        });

        expect(converted.entries[0]).toMatchObject({
            uid: 0,
            key: ['ship', 'dock'],
            keysecondary: [],
            comment: 'Harbor',
            content: 'Ships dock at dusk.',
            constant: false,
            selective: false,
            selectiveLogic: 0,
            order: 12,
            position: 0,
            disable: false,
            addMemo: true,
            probability: 100,
            useProbability: true,
            groupWeight: 100,
            role: 0,
        });
        expectEntryKeys(converted.entries[0]);
    });

    test('converts Agnai empty names and empty entry arrays', () => {
        const converted = convertAgnaiMemoryBook({
            kind: 'memory',
            entries: [
                {
                    keywords: ['quiet'],
                    name: '',
                    entry: 'Quiet lore.',
                    weight: 0,
                    enabled: false,
                },
            ],
        });

        expect(converted.entries[0]).toMatchObject({
            comment: '',
            disable: true,
            addMemo: false,
        });
        expectEntryKeys(converted.entries[0]);
        expect(convertAgnaiMemoryBook({ kind: 'memory', entries: [] })).toEqual({ entries: {} });
    });

    test('converts Risu Lorebook entries and preserves current activation percent behavior', () => {
        const converted = convertRisuLorebook({
            type: 'risu',
            data: [
                {
                    key: 'alpha, beta',
                    secondkey: 'gamma, delta',
                    comment: 'Risu Entry',
                    content: 'Risu lore.',
                    alwaysActive: true,
                    selective: true,
                    insertorder: 5,
                    activationPercent: 75,
                },
            ],
        });

        expect(converted.entries[0]).toMatchObject({
            uid: 0,
            key: ['alpha', 'beta'],
            keysecondary: ['gamma', 'delta'],
            comment: 'Risu Entry',
            content: 'Risu lore.',
            constant: true,
            selective: true,
            selectiveLogic: 0,
            order: 5,
            position: 0,
            disable: false,
            addMemo: true,
            probability: 75,
            useProbability: 75,
            groupWeight: 100,
            role: 0,
        });
        expectEntryKeys(converted.entries[0]);
    });

    test('converts Risu optional secondary keys and activation percent fallback', () => {
        const converted = convertRisuLorebook({
            type: 'risu',
            data: [
                {
                    key: 'solo',
                    comment: 'No Secondary',
                    content: 'No secondary lore.',
                    alwaysActive: false,
                    selective: false,
                    insertorder: 0,
                },
                {
                    key: 'empty',
                    secondkey: '',
                    comment: 'Empty Secondary',
                    content: 'Empty secondary lore.',
                    alwaysActive: false,
                    selective: false,
                    insertorder: 1,
                },
                {
                    key: 'comma',
                    secondkey: ', ',
                    comment: 'Comma Secondary',
                    content: 'Comma secondary lore.',
                    alwaysActive: false,
                    selective: false,
                    insertorder: 2,
                    activationPercent: 0,
                },
            ],
        });

        expect(converted.entries[0]).toMatchObject({
            keysecondary: [],
            probability: 100,
            useProbability: true,
        });
        expect(converted.entries[1].keysecondary).toEqual([]);
        expect(converted.entries[2]).toMatchObject({
            keysecondary: ['', ''],
            probability: 0,
            useProbability: 0,
        });
        expectEntryKeys(converted.entries[0]);
        expectEntryKeys(converted.entries[1]);
        expectEntryKeys(converted.entries[2]);
        expect(convertRisuLorebook({ type: 'risu', data: [] })).toEqual({ entries: {} });
    });

    test('converts Character Book entries with explicit ids and extensions', () => {
        const characterBook = {
            name: 'Character Book',
            entries: [
                {
                    id: 42,
                    keys: ['hero'],
                    secondary_keys: ['ally'],
                    comment: 'Hero Memo',
                    content: 'Hero lore.',
                    constant: true,
                    selective: true,
                    insertion_order: 9,
                    position: 'before_char',
                    enabled: false,
                    extensions: {
                        position: 4,
                        exclude_recursion: true,
                        prevent_recursion: true,
                        delay_until_recursion: true,
                        display_index: 3,
                        probability: 45,
                        useProbability: false,
                        depth: 8,
                        selectiveLogic: 3,
                        outlet_name: 'memory',
                        group: 'cast',
                        group_override: true,
                        group_weight: 55,
                        scan_depth: 6,
                        case_sensitive: true,
                        match_whole_words: false,
                        use_group_scoring: true,
                        automation_id: 'auto-1',
                        role: 2,
                        vectorized: true,
                        sticky: 2,
                        cooldown: 4,
                        delay: 6,
                        match_persona_description: true,
                        match_character_description: true,
                        match_character_personality: true,
                        match_character_depth_prompt: true,
                        match_scenario: true,
                        match_creator_notes: true,
                        triggers: ['normal'],
                        ignore_budget: true,
                    },
                },
            ],
        };

        const converted = convertCharacterBook(characterBook);

        expect(converted.originalData).toBe(characterBook);
        expect(converted.entries[42]).toMatchObject({
            uid: 42,
            key: ['hero'],
            keysecondary: ['ally'],
            comment: 'Hero Memo',
            content: 'Hero lore.',
            constant: true,
            selective: true,
            order: 9,
            position: 4,
            excludeRecursion: true,
            preventRecursion: true,
            delayUntilRecursion: true,
            disable: true,
            addMemo: true,
            displayIndex: 3,
            probability: 45,
            useProbability: false,
            depth: 8,
            selectiveLogic: 3,
            outletName: 'memory',
            group: 'cast',
            groupOverride: true,
            groupWeight: 55,
            scanDepth: 6,
            caseSensitive: true,
            matchWholeWords: false,
            useGroupScoring: true,
            automationId: 'auto-1',
            role: 2,
            vectorized: true,
            sticky: 2,
            cooldown: 4,
            delay: 6,
            matchPersonaDescription: true,
            matchCharacterDescription: true,
            matchCharacterPersonality: true,
            matchCharacterDepthPrompt: true,
            matchScenario: true,
            matchCreatorNotes: true,
            extensions: characterBook.entries[0].extensions,
            triggers: ['normal'],
            ignoreBudget: true,
        });
        expectEntryKeys(converted.entries[42], CHARACTER_BOOK_ENTRY_KEYS);
    });

    test('converts Character Book entries without mutating missing ids into the input', () => {
        const characterBook = {
            entries: [
                {
                    keys: ['fallback'],
                    content: 'Fallback lore.',
                    enabled: true,
                    position: 'after_char',
                },
            ],
        };

        const converted = convertCharacterBook(characterBook);

        expect(characterBook.entries[0]).not.toHaveProperty('id');
        expect(converted.entries[0]).toMatchObject({
            uid: 0,
            key: ['fallback'],
            keysecondary: [],
            comment: '',
            content: 'Fallback lore.',
            constant: false,
            selective: false,
            order: undefined,
            position: 1,
            disable: false,
            addMemo: false,
            displayIndex: 0,
            probability: 100,
            useProbability: true,
            depth: 4,
            selectiveLogic: 0,
            groupWeight: 100,
            role: 0,
            vectorized: false,
            triggers: [],
            ignoreBudget: false,
        });
        expectEntryKeys(converted.entries[0], CHARACTER_BOOK_ENTRY_KEYS);
    });

    test('converts mixed Character Book ids without overwriting generated ids', () => {
        const characterBook = {
            entries: [
                {
                    keys: ['generated'],
                    content: 'Generated id lore.',
                    enabled: true,
                },
                {
                    id: 0,
                    keys: ['explicit'],
                    content: 'Explicit id lore.',
                    enabled: true,
                },
            ],
        };

        const converted = convertCharacterBook(characterBook);

        expect(Object.keys(converted.entries).sort()).toEqual(['0', '1']);
        expect(converted.entries[0]).toMatchObject({
            uid: 0,
            key: ['explicit'],
            content: 'Explicit id lore.',
            displayIndex: 1,
        });
        expect(converted.entries[1]).toMatchObject({
            uid: 1,
            key: ['generated'],
            content: 'Generated id lore.',
            displayIndex: 0,
        });
        expect(characterBook.entries[0]).not.toHaveProperty('id');
        expectEntryKeys(converted.entries[0], CHARACTER_BOOK_ENTRY_KEYS);
        expectEntryKeys(converted.entries[1], CHARACTER_BOOK_ENTRY_KEYS);
    });

    test('converts Character Book position fallback branches', () => {
        const converted = convertCharacterBook({
            entries: [
                {
                    keys: ['before'],
                    content: 'Before lore.',
                    enabled: true,
                    position: 'before_char',
                },
                {
                    keys: ['default-after'],
                    content: 'Default after lore.',
                    enabled: true,
                },
            ],
        });

        expect(converted.entries[0].position).toBe(0);
        expect(converted.entries[1].position).toBe(1);
    });

    test('converts empty Character Book entries without synthetic rows', () => {
        const characterBook = { entries: [] };
        expect(convertCharacterBook(characterBook)).toEqual({ entries: {}, originalData: characterBook });
    });
});

import {
    UNSET_SENTINEL,
    calculateDataSize,
    processUnsetSentinels,
    toShallow,
    unsetPrivateFields,
} from '../src/endpoints/character-card-helpers.js';

describe('character-card helpers', () => {
    test('calculateDataSize sums stringified top-level values for objects', () => {
        expect(calculateDataSize({ name: 'Ada', count: 42, active: false })).toBe(10);
        expect(calculateDataSize(['alpha', 'beta'])).toBe(9);
    });

    test('calculateDataSize returns zero for non-object values', () => {
        expect(calculateDataSize(undefined)).toBe(0);
        expect(calculateDataSize('plain text')).toBe(0);
        expect(calculateDataSize(15)).toBe(0);
    });

    test('toShallow keeps list payload fields and V2 fallback data stable', () => {
        const shallow = toShallow({
            name: 'Ada',
            avatar: 'Ada.png',
            chat: 'Ada - 2026-06-02',
            fav: true,
            date_added: 10,
            create_date: '2026-06-02T00:00:00.000Z',
            date_last_chat: 20,
            chat_size: 30,
            data_size: 40,
            tags: ['outer'],
            data: {
                name: 'Ada V2',
                character_version: '1.0',
                creator: 'Maker',
                creator_notes: 'Creator notes',
                description: 'V2 description',
                mes_example: 'V2 example',
                scenario: 'V2 scenario',
                personality: 'V2 personality',
                first_mes: 'Hello',
                alternate_greetings: ['Hi'],
                tags: ['inner'],
                extensions: {
                    fav: false,
                    world: 'World A',
                    talkativeness: 0.25,
                },
            },
        });

        expect(shallow).toMatchObject({
            shallow: true,
            name: 'Ada',
            avatar: 'Ada.png',
            chat: 'Ada - 2026-06-02',
            fav: true,
            date_added: 10,
            create_date: '2026-06-02T00:00:00.000Z',
            date_last_chat: 20,
            chat_size: 30,
            data_size: 40,
            tags: ['outer'],
            description: 'V2 description',
            personality: 'V2 personality',
            scenario: 'V2 scenario',
            first_mes: 'Hello',
            mes_example: 'V2 example',
            creatorcomment: 'Creator notes',
            talkativeness: 0.25,
            data: {
                name: 'Ada V2',
                character_version: '1.0',
                creator: 'Maker',
                creator_notes: 'Creator notes',
                description: 'V2 description',
                mes_example: 'V2 example',
                scenario: 'V2 scenario',
                personality: 'V2 personality',
                first_mes: 'Hello',
                alternate_greetings: ['Hi'],
                tags: ['inner'],
                extensions: {
                    fav: false,
                    world: 'World A',
                    talkativeness: 0.25,
                },
            },
        });
    });

    test('processUnsetSentinels recursively deletes sentinel-marked fields', () => {
        const target = {
            keep: 'yes',
            removeMe: 'gone',
            data: {
                keepNested: 'yes',
                nested: {
                    remove: 'old',
                    keep: 'value',
                },
            },
        };

        processUnsetSentinels(target, {
            removeMe: UNSET_SENTINEL,
            data: {
                ignored: 'not-present',
                nested: {
                    remove: UNSET_SENTINEL,
                },
            },
        });

        expect(target).toEqual({
            keep: 'yes',
            data: {
                keepNested: 'yes',
                nested: {
                    keep: 'value',
                },
            },
        });
    });

    test('unsetPrivateFields clears share-unsafe fields in place', () => {
        const character = {
            fav: true,
            chat: 'Ada - 2026-06-02',
            data: {
                extensions: {
                    fav: true,
                    world: 'World A',
                },
            },
        };

        unsetPrivateFields(character);

        expect(character).toEqual({
            fav: false,
            data: {
                extensions: {
                    fav: false,
                    world: 'World A',
                },
            },
        });
    });

});

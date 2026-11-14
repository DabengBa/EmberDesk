import { expect, jest, test } from '@jest/globals';
import { TavernCardValidator } from '../src/validator/TavernCardValidator.js';

jest.unstable_mockModule('../src/endpoints/worldinfo.js', () => ({
    readWorldInfoFile: jest.fn(() => ({
        entries: { 0: { uid: 0, key: ['Alice'], content: 'A linked world entry', position: 0 } },
    })),
}));

const { charaFormatData } = await import('../src/endpoints/character-card-v2.js');

test('a native character edit with a linked world remains valid for the next scoped Regex merge', () => {
    const card = charaFormatData({
        ch_name: 'Alice',
        description: 'Edited description',
        world: 'Linked world',
        json_data: JSON.stringify({ data: { extensions: { custom: { keep: true } } } }),
    }, {});
    card.data.extensions.regex_scripts = [{ id: 'scoped', findRegex: '/before/g', replaceString: 'after' }];

    expect(new TavernCardValidator(card).validateV2()).toBe(true);
    expect(card.data.extensions.custom).toEqual({ keep: true });
    expect(card.data.character_book).toMatchObject({
        name: 'Linked world',
        extensions: {},
        entries: [{ keys: ['Alice'], content: 'A linked world entry' }],
    });
    expect(card.data).not.toHaveProperty('mes_example');
    expect(card.data).not.toHaveProperty('system_prompt');
    expect(card.data).not.toHaveProperty('post_history_instructions');
});

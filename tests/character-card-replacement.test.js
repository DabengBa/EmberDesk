import { expect, jest, test } from '@jest/globals';
import { replaceCharacterCard } from '../public/scripts/character-card-replacement.js';

test.each(['file', 'url'])('replacement via %s keeps the captured target and does not reopen a different chat', async method => {
    const target = { avatar: 'original.png', chat: 'original chat', session: 1 };
    let current = target;
    const replace = jest.fn(async () => { current = { avatar: 'other.png', chat: 'other chat', session: 2 }; return true; });
    const reopen = jest.fn();
    await replaceCharacterCard(target, async avatar => replace(method, avatar), () => current, reopen);
    expect(replace).toHaveBeenCalledWith(method, 'original.png');
    expect(reopen).not.toHaveBeenCalled();
});

test('only a successful replacement reloads the original live chat', async () => {
    const target = { avatar: 'original.png', chat: 'original chat', session: 1 };
    const reopen = jest.fn();
    await replaceCharacterCard(target, async () => false, () => target, reopen);
    expect(reopen).not.toHaveBeenCalled();
    await replaceCharacterCard(target, async () => true, () => ({ ...target }), reopen);
    expect(reopen).toHaveBeenCalledWith('original chat', expect.any(Function));
    expect(reopen.mock.calls[0][1]()).toBe(true);
});

test('the replacement reload can recheck its session after it begins', async () => {
    const target = { avatar: 'original.png', chat: 'original chat', session: 1 };
    let current = target;
    const reopen = jest.fn(async (_, isCurrent) => {
        expect(isCurrent()).toBe(true);
        await Promise.resolve();
        current = { ...target, session: 2 };
        expect(isCurrent()).toBe(false);
    });
    await expect(replaceCharacterCard(target, async () => true, () => current, reopen)).resolves.toBe(true);
    expect(reopen).toHaveBeenCalledTimes(1);
});

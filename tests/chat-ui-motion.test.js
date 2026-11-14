import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { cancelOpacity, scrollChatTo, transitionOpacity } from '../public/scripts/chat-ui-motion.js';

const originalMatchMedia = globalThis.matchMedia;
afterEach(() => { globalThis.matchMedia = originalMatchMedia; });

function animatedElement() {
    const animations = [];
    const element = {
        style: { opacity: '1' },
        animate: jest.fn(() => {
            let resolve, reject;
            const finished = new Promise((done, fail) => { resolve = done; reject = fail; });
            const animation = { finished, resolve, reject, cancel: jest.fn() };
            animations.push(animation);
            return animation;
        }),
    };
    return { element, animations };
}

describe('chat UI motion', () => {
    test('settles bookkeeping after stale or rejected animation without committing', async () => {
        const { element, animations } = animatedElement();
        const complete = jest.fn(), settled = jest.fn();
        transitionOpacity(element, { opacity: 0, duration: 100, complete, settled, isCurrent: () => false });
        animations[0].resolve();
        await Promise.resolve();
        expect(settled).toHaveBeenCalledTimes(1);
        transitionOpacity(element, { opacity: 0, duration: 100, complete, settled });
        animations[1].reject(new Error('canceled'));
        await Promise.resolve();
        expect(settled).toHaveBeenCalledTimes(2);
        expect(complete).not.toHaveBeenCalled();
        expect(element.style.opacity).toBe('1');
    });

    test('only the latest animation may complete, even if canceled finished resolves', async () => {
        const { element, animations } = animatedElement();
        const old = jest.fn(), latest = jest.fn();
        transitionOpacity(element, { opacity: 0, duration: 100, complete: old });
        transitionOpacity(element, { opacity: 1, duration: 100, complete: latest });
        expect(animations[0].cancel).toHaveBeenCalledTimes(1);
        animations[0].resolve();
        await Promise.resolve();
        expect(old).not.toHaveBeenCalled();
        expect(element.style.opacity).toBe('1');
        animations[1].resolve();
        await Promise.resolve();
        expect(latest).toHaveBeenCalledTimes(1);
        expect(animations[1].cancel).toHaveBeenCalledTimes(1);
    });

    test('cancel, rejected finished and stale identity never commit', async () => {
        const { element, animations } = animatedElement();
        const complete = jest.fn();
        transitionOpacity(element, { opacity: 0, duration: 100, complete });
        cancelOpacity(element);
        animations[0].reject(new Error('canceled'));
        await Promise.resolve();
        transitionOpacity(element, { opacity: 0, duration: 100, complete, isCurrent: () => false });
        animations[1].resolve();
        await Promise.resolve();
        expect(element.style.opacity).toBe('1');
        expect(complete).not.toHaveBeenCalled();
    });

    test('zero duration, missing animate, reduced motion, and unsupported easing settle immediately', () => {
        const { element } = animatedElement();
        const complete = jest.fn();
        transitionOpacity(element, { opacity: 0, duration: 0, complete });
        expect(element.style.opacity).toBe('0');
        globalThis.matchMedia = () => ({ matches: true });
        transitionOpacity(element, { opacity: 1, duration: 100, complete });
        expect(element.animate).not.toHaveBeenCalled();
        const noAnimation = { style: {} };
        transitionOpacity(noAnimation, { opacity: 0, duration: 100, complete });
        globalThis.matchMedia = () => ({ matches: false });
        element.animate.mockImplementation(() => { throw new TypeError('bad easing'); });
        transitionOpacity(element, { opacity: 0, duration: 100, complete });
        expect(complete).toHaveBeenCalledTimes(4);
        expect(noAnimation.style.opacity).toBe('0');
    });

    test('scroll uses native smooth, reduced instant and scrollTop fallback', () => {
        const chat = { scrollTo: jest.fn() };
        globalThis.matchMedia = () => ({ matches: false });
        scrollChatTo(chat, 130);
        globalThis.matchMedia = () => ({ matches: true });
        scrollChatTo(chat, 900);
        expect(chat.scrollTo.mock.calls).toEqual([[{ top: 130, behavior: 'smooth' }], [{ top: 900, behavior: 'instant' }]]);
        const fallback = { scrollTop: 0 };
        scrollChatTo(fallback, 30);
        expect(fallback.scrollTop).toBe(30);
    });
});

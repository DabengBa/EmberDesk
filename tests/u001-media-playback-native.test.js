import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('    function saveMediaStates()'), source.indexOf('    // Add media gallery to message'));

test('legacy media refresh preserves playback across all wrappers without jQuery traversal', () => {
    class Media {
        static HAVE_NOTHING = 0;
        static HAVE_METADATA = 1;
        constructor(src, time, paused, readyState = 1) {
            Object.assign(this, { currentSrc: src, currentTime: time, paused, readyState });
            this.play = jest.fn();
            this.addEventListener = jest.fn((type, handler) => { this.onMetadata = handler; });
        }
    }
    const oldVideo = new Media('/video', 12, false);
    const oldAudio = new Media('/audio', 7, true);
    const ignored = new Media('/ignored', 99, false, 0);
    const newVideo = new Media('/video', 0, true);
    const newAudio = new Media('/audio', 0, true, 0);
    const unknown = new Media('/other', 1, false);
    let lists = [[oldVideo, ignored], [oldAudio]];
    const wrappers = [0, 1].map(i => ({ querySelectorAll: jest.fn(() => lists[i]) }));
    const { saveMediaStates, restoreMediaStates } = new Function('mediaWrapper', 'HTMLMediaElement', `${code}; return { saveMediaStates, restoreMediaStates };`)(wrappers, Media);

    const states = saveMediaStates();
    expect([...states.keys()]).toEqual(['/video', '/audio']);
    lists = [[newVideo, unknown], [newAudio]];
    restoreMediaStates(states);
    expect(newVideo.currentTime).toBe(12);
    expect(newVideo.play).toHaveBeenCalledTimes(1);
    expect(unknown.currentTime).toBe(1);
    expect(newAudio.addEventListener).toHaveBeenCalledWith('loadedmetadata', expect.any(Function), { once: true });
    newAudio.onMetadata();
    expect(newAudio.currentTime).toBe(7);
    expect(newAudio.play).not.toHaveBeenCalled();
});

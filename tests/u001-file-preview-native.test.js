import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

test('file preview renders downloaded text as text and enables copying without jQuery', async () => {
    const source = readFileSync(new URL('../public/scripts/chats.js', import.meta.url), 'utf8');
    const previewSource = source.slice(source.indexOf('async function openFilePopup('), source.indexOf('\nconst NEUTRAL_CHAT_KEY'));
    const createElement = tag => ({ tag, className: '', textContent: '', children: [], append(child) { this.children.push(child); } });
    const popup = jest.fn();
    const addCopy = jest.fn();
    const getText = jest.fn(async () => '<img onerror=alert(1)>');
    const env = { document: { createElement }, getFileAttachment: getText, addCopyToCodeBlocks: addCopy, callGenericPopup: popup, POPUP_TYPE: { TEXT: 'text' }, $: () => { throw Error('preview must not depend on jQuery'); } };
    const preview = new Function(...Object.keys(env), `${previewSource}; return openFilePopup;`)(...Object.values(env));
    await preview({ url: '/attachment.txt' });
    const root = popup.mock.calls[0][0];
    expect(root.className).toBe('file_modal textarea_compact fontsize90p');
    expect(root.children[0].children[0].textContent).toBe('<img onerror=alert(1)>');
    expect(root.children[0].children[0].className).toBe('txt');
    expect(addCopy).toHaveBeenCalledWith(root);
    expect(popup).toHaveBeenCalledWith(root, 'text', '', { wide: true, large: true });
});

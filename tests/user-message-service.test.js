import { expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { createUserMessageService } from '../public/scripts/user-message-service.js';

function fixture() {
    const chat = [];
    const calls = [];
    let revision = 1;
    const service = createUserMessageService({
        getChat: () => chat, getComposerSnapshot: () => ({ contextKey: 'chat', contextRevision: revision }),
        regexUserInput: text => `regex:${text}`, timestamp: () => 'time', substitute: text => text,
        uuid: () => 'id', removeMacros: text => text.replace('{{x}}', '').trim(),
        populateAttachment: async () => calls.push('attachment'), taint: () => calls.push('taint'),
        save: async isCurrent => { if (isCurrent()) calls.push('save'); },
        emitSent: async id => calls.push(['sent', id]), emitRendered: async id => calls.push(['rendered', id]),
        reload: async () => calls.push('reload'), addMessage: () => calls.push('add'),
    });
    return { chat, calls, service, switchContext: () => { revision++; } };
}

test.each([null, 0])('builds, saves and publishes a user message in order (insertAt=%s)', async insertAt => {
    const { chat, calls, service } = fixture();
    const message = await service.sendMessageAsUser('hello {{x}}', 'bias', insertAt, true, 'User');
    expect(message).toEqual({ name: 'User', is_user: true, is_system: false, send_date: 'time', mes: 'regex:hello', extra: { id: 'id', isSmallSys: true, bias: 'bias' } });
    expect(chat).toEqual([message]);
    expect(calls).toEqual(['attachment', 'taint', 'save', ['sent', 0], insertAt === null ? 'add' : 'reload', ['rendered', 0]]);
});

test('context change while construction is pending prevents mutation', async () => {
    const { chat, calls, service, switchContext } = fixture();

    // Message construction yields before attachment begins.
    const pending = service.sendMessageAsUser('hello', '', null, false, 'User');
    switchContext();
    await pending;
    expect(chat).toEqual([]);
    expect(calls).toEqual([]);
});

test('production public exports delegate to the real service and its ports', async () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('const userMessageService = createUserMessageService({');
    const end = source.indexOf('\n/**', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const chat = [];
    const calls = [];
    const deps = {
        createUserMessageService, chat, name1: 'default user',
        getComposerSnapshot: () => ({ contextKey: 'chat', contextRevision: 1 }),
        getRegexedString: text => text, regex_placement: { USER_INPUT: 1 },
        getMessageTimeStamp: () => 'time', substituteParams: text => text,
        uuidv4: () => 'id', removeMacros: text => text,
        populateFileAttachment: async (message, input, { isCurrent }) => { if (isCurrent()) calls.push(input); },
        chat_metadata: {}, saveChatConditional: async predicate => { if (predicate()) calls.push('save'); },
        eventSource: { emit: async name => calls.push(name) },
        event_types: { MESSAGE_SENT: 'sent', USER_MESSAGE_RENDERED: 'rendered' },
        reloadCurrentChat: async () => calls.push('reload'), addOneMessage: () => calls.push('add'),
    };
    const exports = new Function(...Object.keys(deps), `${source.slice(start, end).replaceAll('export async function', 'async function')}\nreturn { buildUserMessage, sendMessageAsUser };`)(...Object.values(deps));
    expect((await exports.buildUserMessage('draft')).name).toBe('default user');
    const message = await exports.sendMessageAsUser('hello');
    expect(chat).toEqual([message]);
    expect(deps.chat_metadata.tainted).toBe(true);
    expect(calls).toEqual(['file_form_input', 'save', 'sent', 'add', 'rendered']);
});

import { afterAll, describe, expect, test } from '@jest/globals';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../src/util.js';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-group-chat-retirement-config-'));
const configPath = path.join(configRoot, 'config.yaml');
fs.writeFileSync(configPath, 'extensions:\n  enabled: true\n', 'utf8');
setConfigFilePath(configPath);

const RETIRED_BODY = {
    error: 'group_chat_feature_removed',
    message: 'Group chat functionality has been removed from EmberDesk.',
};

function listen(app) {
    const server = http.createServer(app);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                url: `http://127.0.0.1:${address.port}`,
            });
        });
    });
}

async function withRetiredApp(run) {
    const { setupPrivateEndpoints } = await import('../src/server-startup.js');
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-group-chat-retirement-'));
    const previousDataRoot = globalThis.DATA_ROOT;
    globalThis.DATA_ROOT = dataRoot;
    const { getUserDirectories } = await import('../src/user-directories.js');
    const directories = getUserDirectories('group-chat-retirement-user');
    fs.mkdirSync(directories.groups, { recursive: true });
    fs.mkdirSync(directories.groupChats, { recursive: true });
    fs.mkdirSync(directories.chats, { recursive: true });

    const groupFile = path.join(directories.groups, 'legacy-group.json');
    const groupChatFile = path.join(directories.groupChats, 'legacy-chat.jsonl');
    const groupPayload = JSON.stringify({ id: 'legacy-group', name: 'Legacy', members: [], chats: ['legacy-chat'] }, null, 2);
    const chatPayload = '{"user_name":"User","character_name":"Char"}\n{"name":"User","is_user":true,"mes":"hi"}\n';
    fs.writeFileSync(groupFile, groupPayload, 'utf8');
    fs.writeFileSync(groupChatFile, chatPayload, 'utf8');

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use((request, _response, next) => {
        request.user = {
            profile: { handle: 'group-chat-retirement-user' },
            directories,
        };
        next();
    });
    setupPrivateEndpoints(app);
    const { server, url } = await listen(app);

    try {
        await run({ url, directories, groupFile, groupChatFile, groupPayload, chatPayload });
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataRoot, { recursive: true, force: true });
        globalThis.DATA_ROOT = previousDataRoot;
    }
}

describe('group chat retirement', () => {
    test('group definition routes return stable 410 JSON without touching disk files', async () => {
        await withRetiredApp(async ({ url, groupFile, groupChatFile, groupPayload, chatPayload }) => {
            for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
                for (const route of ['', '/all', '/create', '/edit', '/delete', '/unknown-retired-route']) {
                    const response = await fetch(`${url}/api/groups${route}`, {
                        method,
                        headers: { 'content-type': 'application/json' },
                        body: method === 'GET' ? undefined : JSON.stringify({ id: 'legacy-group', name: 'Nope' }),
                    });
                    expect(response.status).toBe(410);
                    expect(response.headers.get('content-type')).toContain('application/json');
                    await expect(response.json()).resolves.toEqual(RETIRED_BODY);
                }
            }

            expect(fs.readFileSync(groupFile, 'utf8')).toBe(groupPayload);
            expect(fs.readFileSync(groupChatFile, 'utf8')).toBe(chatPayload);
        });
    });

    test('chat group endpoints and is_group write paths return 410 without mutating files', async () => {
        await withRetiredApp(async ({ url, groupFile, groupChatFile, groupPayload, chatPayload }) => {
            for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
                for (const route of ['/group', '/group/get', '/group/unknown-retired-route']) {
                    const response = await fetch(`${url}/api/chats${route}`, {
                        method,
                        headers: { 'content-type': 'application/json' },
                        body: method === 'GET' ? undefined : JSON.stringify({ is_group: true }),
                    });
                    expect(response.status).toBe(410);
                    expect(response.headers.get('content-type')).toContain('application/json');
                    await expect(response.json()).resolves.toEqual(RETIRED_BODY);
                }
            }

            const retiredRequests = [
                ['/save', { is_group: true, avatar_url: '../invalid-avatar', file_name: '../invalid-file', chat: [] }],
                ['/get', { is_group: true, avatar_url: '../invalid-avatar', file_name: '../invalid-file' }],
                ['/rename', { is_group: true, avatar_url: '../invalid-avatar', original_file: '../invalid-old', renamed_file: '../invalid-new' }],
                ['/delete', { is_group: true, avatar_url: '../invalid-avatar', chatfile: '../invalid-file' }],
                ['/export', { is_group: true, avatar_url: '../invalid-avatar', file: '../invalid-file' }],
            ];
            for (const [route, body] of retiredRequests) {
                const response = await fetch(`${url}/api/chats${route}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body),
                });
                expect(response.status).toBe(410);
                expect(response.headers.get('content-type')).toContain('application/json');
                await expect(response.json()).resolves.toEqual(RETIRED_BODY);
            }

            expect(fs.readFileSync(groupFile, 'utf8')).toBe(groupPayload);
            expect(fs.readFileSync(groupChatFile, 'utf8')).toBe(chatPayload);
            expect(fs.existsSync(path.join(path.dirname(groupChatFile), 'renamed-chat.jsonl'))).toBe(false);
        });
    });

    test('character chat routes keep invalid avatar validation after the group tombstone check', async () => {
        await withRetiredApp(async ({ url }) => {
            const response = await fetch(`${url}/api/chats/get`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ avatar_url: '../invalid-avatar', file_name: 'chat' }),
            });
            expect(response.status).toBe(400);
        });
    });

    test('retires user-facing group UI, settings, bookmark conversion, and active runtime imports', () => {
        const indexSource = fs.readFileSync(path.join(repoRoot, 'public', 'index.html'), 'utf8');
        const scriptSource = fs.readFileSync(path.join(repoRoot, 'public', 'script.js'), 'utf8');
        const bookmarksSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'bookmarks.js'), 'utf8');
        const settingsSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingsSurface.tsx'), 'utf8');
        const settingsHelperSource = fs.readFileSync(path.join(repoRoot, 'app', 'lib', 'settings-helpers.js'), 'utf8');
        const accountStorageSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'util', 'AccountStorage.js'), 'utf8');
        const scenarioOverrideSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'templates', 'scenarioOverride.html'), 'utf8');
        const forbidMediaSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'templates', 'forbidMedia.html'), 'utf8');
        const hiddenBlockSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'templates', 'hiddenBlock.html'), 'utf8');
        const stableDiffusionExtensionPath = path.join(repoRoot, 'public', 'scripts', 'extensions', 'stable-diffusion');
        const quickReplySlashSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'extensions', 'quick-reply', 'src', 'SlashCommandHandler.js'), 'utf8');
        const defaultSettingsSource = fs.readFileSync(path.join(repoRoot, 'default', 'content', 'settings.json'), 'utf8');
        const defaultOpenAiPresetSource = fs.readFileSync(path.join(repoRoot, 'default', 'content', 'presets', 'openai', 'Default.json'), 'utf8');
        const presetManagerSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'preset-manager.js'), 'utf8');

        expect(indexSource).not.toContain('id="rm_group_chats_block"');
        expect(indexSource).not.toContain('id="rm_button_group_chats"');
        expect(indexSource).not.toContain('id="option_convert_to_group"');
        expect(scriptSource).not.toContain('from \'./scripts/group-chats.js\'');
        expect(scriptSource).not.toContain('GROUP_AUTHORING_REACT_HOST_ID');
        expect(scriptSource).toContain('group memberships will be preserved');
        expect(scriptSource).not.toContain('switchWaifuMode');
        expect(bookmarksSource).not.toContain('convertSoloToGroupChat');
        expect(bookmarksSource).not.toContain('/api/chats/group/save');
        expect(settingsSource).not.toContain('newGroupChatPrompt');
        expect(settingsSource).not.toContain('groupNudgePrompt');
        expect(settingsSource).not.toContain('disableGroupTrimming');
        expect(settingsSource).not.toContain('showGroupChatQueue');
        expect(settingsHelperSource).not.toContain('newGroupChatPrompt');
        expect(settingsHelperSource).not.toContain('groupNudgePrompt');
        expect(settingsHelperSource).not.toContain('disableGroupTrimming');
        expect(settingsHelperSource).not.toContain('showGroupChatQueue');
        expect(accountStorageSource).not.toContain('GroupMembers_PerPage');
        expect(accountStorageSource).not.toContain('GroupCandidates_PerPage');
        expect(scenarioOverrideSource).not.toContain('All group members');
        expect(forbidMediaSource).not.toContain('character/group');
        expect(hiddenBlockSource).not.toContain('Characters and groups');
        expect(fs.existsSync(stableDiffusionExtensionPath)).toBe(false);
        expect(defaultSettingsSource).not.toContain('new_group_chat_prompt');
        expect(defaultOpenAiPresetSource).not.toContain('new_group_chat_prompt');
        expect(defaultOpenAiPresetSource).not.toContain('group_nudge_prompt');
        expect(quickReplySlashSource).not.toMatch(/new SlashCommandNamedArgument\('group'/);
        expect(presetManagerSource).not.toContain('character/group');

    });

    test('retires the Visual Novel mode and its settings contract with group sprites', () => {
        const activeSources = [
            'public/index.html',
            'public/script.js',
            'public/scripts/power-user.js',
            'app/components/settings/SettingsSurface.tsx',
            'app/lib/settings-helpers.js',
            'public/css/mobile-styles.css',
            'public/css/toggle-dependent.css',
        ];

        for (const file of activeSources) {
            const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
            expect(source).not.toContain('waifuMode');
            expect(source).not.toMatch(/Visual Novel Mode|Waifu Mode/);
        }
    });

    test('removes retired product localization keys without removing Prome extension copy', () => {
        const retiredKeys = [
            'Waifu Mode',
            'Set a group chat scenario',
            'Won\'t be used in groups.',
            'All group members will use the following scenario text instead of what is specified in their character cards.',
            'All group members will use the following values instead of what is specified in their character cards.',
            'Characters and groups hidden by filters or closed folders',
            'Will be automatically added as the author\'s note for this character. Will be used in groups, but can\'t be modified when a group chat is open.',
            'How often the character speaks in group chats!',
            'group chats!',
            'Allow AI messages in groups to contain lines spoken by other group members',
            'Relax message trim in Groups',
            'In group chat, highlight the character(s) that are currently queued to generate responses and the order in which they will respond.',
            'Show group chat queue',
            'Set group chat character settings overrides',
            'New Group Chat',
            'Restore new group chat prompt',
            'Set at the beginning of the chat history to indicate that a new group chat is about to start.',
            'Group Nudge Prompt Template',
            'Sent at the end of the group chat history to force reply from a specific character.',
            'Group Controls',
            'Create New Chat Group',
            'Group reply strategy',
            'Group generation handling mode',
            'Click to select a new avatar for this group',
            'Click to allow/forbid the use of external media for this group.',
            'Convert to group',
            'Convert to group chat',
            'Show only groups',
            'Add to group',
            'Remove from group',
            'Execute on group member draft',
            'Group Validation',
            'Group: ${0}',
            'Currently no group selected.',
            'Delete the group?',
            'This will also delete all your chats with that group. If you want to delete a single conversation, select a "View past chats" option in the lower left menu.',
            'Group chat could not be saved',
            'Group Chat could not be saved',
            'Group chat could not be deleted',
            'Group chat deleted.',
            'Group chat renamed.',
            'Group Created',
            'Group Deleted',
            'Group is empty.',
            'No character or group selected',
            'Hint: Use a character/group name to bind preset to a specific chat.',
            'The character/group name',
            'Prefer current character or characters in a group, if multiple characters match',
            'Force for Groups and Personas',
            'Groups and Past Personas',
            'Cannot edit scoped scripts in group chats.',
            'Can\'t peek a character while group reply is being generated',
            'Deleted group member swiped. To get a reply, add them back to the group.',
            'Not so fast! Wait for the characters to stop typing before deleting the group.',
            'Warning: Listed member ${0} does not exist as a character. It will be removed from the group.',
            '${0} is already a member of this group.',
            'Adds a new group member to the group chat.',
            'Disables a group member from being drafted for replies.',
            'Enables a group member to be drafted for replies.',
            'Moves a group member down in the group chat list.',
            'Moves a group member up in the group chat list.',
            'Removes a group member from the group chat.',
            'Retrieves a group member\'s name, index, id, or avatar.',
            'Returns the total number of group members in the group chat list.',
            'Group member index',
            'group member index (starts with 0) or name',
            'No group member found using ${0} ${1}',
            'Cannot run /ask command in a group chat!',
            'Cannot run /member-count command outside of a group chat.',
            'Cannot run /member-disable command outside of a group chat.',
            'Cannot run /member-down command outside of a group chat.',
            'Cannot run /member-enable command outside of a group chat.',
            'Cannot run /member-get command outside of a group chat.',
            'Cannot run /member-peek command outside of a group chat.',
            'Cannot run /member-peek command while the group reply is generating.',
            'Cannot run /member-remove command outside of a group chat.',
            'Cannot run /member-up command outside of a group chat.',
            'Cannot run /memberadd command outside of a group chat.',
            'In group chats, you must specify a character name.',
            'Only EmberDesk\'s own format is supported for group chat imports. Sorry!',
            'Opens the chat manager for the current character/group.',
            'Opens up a chat with the character or group by its name',
            'Shows a group member character card without switching chats.',
            'Triggers a message generation. If in group, can trigger a message for the specified group member index or name.',
            'Trying to save group chat with regular saveChat function. Aborting to prevent corruption.',
            'saveChat called for a group chat',
            'Failed to delete recent group chat. See console for details.',
            'Failed to open recent group chat. See console for details.',
            'Failed to rename recent group chat. See console for details.',
        ];
        const localeDirectory = path.join(repoRoot, 'public', 'locales');
        for (const file of fs.readdirSync(localeDirectory).filter(name => name.endsWith('.json'))) {
            const locale = JSON.parse(fs.readFileSync(path.join(localeDirectory, file), 'utf8'));
            for (const key of retiredKeys) {
                expect(locale).not.toHaveProperty(key);
            }
        }

        const zhTw = JSON.parse(fs.readFileSync(path.join(localeDirectory, 'zh-tw.json'), 'utf8'));
        expect(zhTw).toHaveProperty('Prome (Visual Novel Extension)');
        const dataMaidSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'data-maid.js'), 'utf8');
        expect(dataMaidSource).toContain('Group Chats');
        expect(dataMaidSource).toContain('Chat files associated with deleted groups.');
        const scriptSource = fs.readFileSync(path.join(repoRoot, 'public', 'script.js'), 'utf8');
        expect(scriptSource).toContain('All chats, assets and group memberships will be preserved');
    });

    test('removes unreachable group filesystem scans while retaining canonical historical owner support', () => {
        const routeSource = fs.readFileSync(path.join(repoRoot, 'src', 'endpoints', 'chat-route-service.js'), 'utf8');
        const canonicalSource = fs.readFileSync(path.join(repoRoot, 'src', 'endpoints', 'canonical-chat-query-service.js'), 'utf8');
        const storeSource = fs.readFileSync(path.join(repoRoot, 'src', 'endpoints', 'canonical-chat-store.js'), 'utf8');

        expect(routeSource).not.toContain('groupId');
        expect(canonicalSource).not.toContain('groupId');
        expect(canonicalSource).not.toContain('readGroupChatMap');
        expect(storeSource).toContain('owner_type = \'group\'');
    });

    test('preserves configured stopping strings for non-OpenAI generation', () => {
        const scriptSource = fs.readFileSync(path.join(repoRoot, 'public', 'script.js'), 'utf8');

        expect(scriptSource).toContain('result.push(...getCustomStoppingStrings());');
    });

    test('retires first-party group slash and prompt/runtime paths', () => {
        const slashSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'slash-commands.js'), 'utf8');
        const openaiSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'openai.js'), 'utf8');
        const powerUserSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'power-user.js'), 'utf8');
        const tagsSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'tags.js'), 'utf8');
        const filtersSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'filters.js'), 'utf8');
        const promptConverterSource = fs.readFileSync(path.join(repoRoot, 'src', 'prompt-converters.js'), 'utf8');

        expect(slashSource).not.toMatch(/name:\s*'member-/);
        expect(slashSource).not.toContain('is_group_generating');
        expect(slashSource).not.toContain('findGroupMemberId');
        expect(openaiSource).not.toContain('from \'./group-chats.js\'');
        expect(openaiSource).not.toContain('selected_group');
        expect(openaiSource).not.toContain('new_group_chat_prompt');
        expect(openaiSource).not.toContain('group_nudge_prompt');
        expect(powerUserSource).not.toContain('from \'./group-chats.js\'');
        expect(powerUserSource).not.toContain('show_group_chat_queue');
        expect(powerUserSource).not.toContain('disable_group_trimming');
        expect(powerUserSource).not.toContain('fuzzySearchGroups');
        expect(tagsSource).not.toContain('from \'./group-chats.js\'');
        expect(tagsSource).not.toContain('groupCandidatesFilter');
        expect(tagsSource).not.toContain('applyTagsOnGroupSelect');
        expect(filtersSource).not.toContain('FILTER_TYPES.GROUP');
        expect(filtersSource).not.toContain('groupFilter');
        expect(promptConverterSource).not.toMatch(/group_names|groupNames|startsWithGroupName|group chat/i);
        const retiredCoreSources = [
            'public/scripts/authors-note.js',
            'public/scripts/cfg-scale.js',
            'public/scripts/chats.js',
            'public/scripts/instruct-mode.js',
            'public/scripts/itemized-prompts.js',
            'public/scripts/macros/engine/MacroEnvBuilder.js',
            'public/scripts/preset-manager.js',
            'public/scripts/PromptManager.js',
            'public/scripts/tokenizers.js',
            'public/scripts/utils.js',
            'public/scripts/welcome-screen.js',
            'public/scripts/chat-backups.js',
        ];
        for (const file of retiredCoreSources) {
            const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
            expect(source).not.toMatch(/(?:from|import).*group-chats/);
            expect(source).not.toContain('selected_group');
        }

        const generationServiceSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'chat-generation-command-service.js'), 'utf8');
        const generationBridgeSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'main-chat-bridge-contract.js'), 'utf8');
        expect(generationServiceSource).not.toContain('GROUP_CHAT');
        expect(generationServiceSource).not.toContain('selectedGroup');
        expect(generationServiceSource).not.toContain('allowsGroup');
        expect(generationBridgeSource).not.toContain('GROUP_CHAT');
    });

    test('retains single-character slash generation locking after group command removal', () => {
        const slashSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'slash-commands.js'), 'utf8');
        const waitCalls = slashSource.match(/waitUntilCondition\(\(\) => !is_send_press, 10000, 100\)/g) ?? [];
        expect(waitCalls.length).toBeGreaterThanOrEqual(5);
    });

    test('retains context compatibility fields and rejects retired group operations with the stable error', () => {
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'extensions', 'expressions'))).toBe(false);

        for (const file of [
            'public/scripts/extensions/quick-reply/index.js',
            'public/scripts/extensions/quick-reply/src/AutoExecuteHandler.js',
            'public/scripts/extensions/quick-reply/src/QuickReply.js',
            'public/scripts/extensions/quick-reply/src/SlashCommandHandler.js',
            'public/scripts/extensions/quick-reply/api/QuickReplyApi.js',
            'public/scripts/extensions/quick-reply/html/qrEditor.html',
        ]) {
            const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
            expect(source).not.toMatch(/GROUP_MEMBER_DRAFTED|executeOnGroupMemberDraft|group member draft|args\.group/i);
        }

        const enumSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'slash-commands', 'SlashCommandCommonEnumsProvider.js'), 'utf8');
        expect(enumSource).not.toMatch(/group-chats|groupMembers|enumIcons\.group/i);

        const contextSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'st-context.js'), 'utf8');
        expect(contextSource).toContain('groups: []');
        expect(contextSource).toContain('groupId: null');
        expect(contextSource).not.toMatch(/from ['\"]\.\/group-chats\.js['\"]/);
        expect(contextSource).toContain('openGroupChat: rejectRetiredGroupChatOperation');
        expect(contextSource).toContain('unshallowGroupMembers: rejectRetiredGroupChatOperation');
        expect(contextSource).toContain('error.code = \'group_chat_feature_removed\'');
        expect(contextSource).toContain('error.status = 410');
    });

    test('removes retired group-row selectors while keeping character grouping overlays', () => {
        for (const file of [
            'public/scripts/BulkEditOverlay.js',
            'public/scripts/bulk-edit.js',
            'public/scripts/keyboard.js',
            'public/css/toggle-dependent.css',
            'public/css/character-group-overlay.css',
        ]) {
            const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
            expect(source).not.toContain('group_select');
        }

        const overlaySource = fs.readFileSync(path.join(repoRoot, 'public', 'css', 'character-group-overlay.css'), 'utf8');
        const runnerSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'interaction-performance-runner.mjs'), 'utf8');
        expect(runnerSource).toContain('.character_select');
        expect(runnerSource).not.toContain('.group_select');

        expect(overlaySource).toContain('group_overlay_mode_select');
    });

    test('compatibility facade rejects retired operations instead of resolving success', async () => {
        const facade = await import('../public/scripts/group-chats.js');

        for (const operation of [
            'saveGroupChat',
            'generateGroupWrapper',
            'deleteGroup',
            'regenerateGroup',
            'getGroupChat',
            'renameGroupChat',
            'deleteGroupChatByName',
            'deleteGroupChat',
            'openGroupChat',
            'openGroupById',
            'unshallowGroupMembers',
        ]) {
            await expect(facade[operation]()).rejects.toMatchObject({
                code: 'group_chat_feature_removed',
                status: 410,
            });
        }
    });
    test('retired implementation surface replaces live group CRUD module', () => {
        const groupsSource = fs.readFileSync(path.join(repoRoot, 'src', 'endpoints', 'groups.js'), 'utf8');
        expect(groupsSource).toMatch(/group_chat_feature_removed|group-chat-retirement/);
        expect(groupsSource).not.toMatch(/writeFileAtomicSync\(pathToFile/);
        expect(fs.existsSync(path.join(repoRoot, 'src', 'endpoints', 'group-chat-retirement.js'))).toBe(true);
    });
});

afterAll(() => {
    fs.rmSync(configRoot, { recursive: true, force: true });
});

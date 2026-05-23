import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { write as writeCharacterCardPngData } from '../src/character-card-parser.js';
import { DEFAULT_USER, SETTINGS_FILE, USER_DIRECTORY_TEMPLATE } from '../src/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const options = parseCliOptions(process.argv.slice(2));
const profileName = options.profile ?? 'medium';
const profiles = {
    small: {
        characters: 12,
        worlds: 4,
        chatsPerCharacter: 2,
        messagesPerChat: 18,
        groups: 2,
        groupChatsPerGroup: 2,
        groupMessagesPerChat: 24,
    },
    medium: {
        characters: 48,
        worlds: 12,
        chatsPerCharacter: 4,
        messagesPerChat: 36,
        groups: 8,
        groupChatsPerGroup: 3,
        groupMessagesPerChat: 48,
    },
    large: {
        characters: 120,
        worlds: 24,
        chatsPerCharacter: 6,
        messagesPerChat: 60,
        groups: 18,
        groupChatsPerGroup: 4,
        groupMessagesPerChat: 72,
    },
};

const profile = profiles[profileName];
if (!profile) {
    throw new Error(`Unknown profile "${profileName}". Expected one of: ${Object.keys(profiles).join(', ')}`);
}

const defaultDataRoot = path.join(repoRoot, 'data', 'dev-local');
const dataRoot = path.resolve(repoRoot, options.dataRoot ?? defaultDataRoot);
const configPath = path.resolve(repoRoot, options.configPath ?? path.join(repoRoot, 'config.dev-local.yaml'));
const userRoot = path.join(dataRoot, DEFAULT_USER.handle);
const defaultAvatarBuffer = fs.readFileSync(new URL('../public/img/ai4.png', import.meta.url));
const defaultSettingsPath = path.join(repoRoot, 'default', 'content', SETTINGS_FILE);
const defaultSettings = JSON.parse(fs.readFileSync(defaultSettingsPath, 'utf8'));

const rng = createRng(Number(options.seed ?? 260512));
const directories = createUserDirectories(userRoot);

await fs.promises.rm(dataRoot, { recursive: true, force: true });
for (const dir of Object.values(directories)) {
    await fs.promises.mkdir(dir, { recursive: true });
}

await seedBootstrapContent();
await seedSettings();
await seedBackgroundsAndThemes();

const worldNames = await seedWorlds();
const characterRecords = await seedCharacters(worldNames);
await seedGroups(characterRecords);
await writeDevConfig();

const summary = {
    dataRoot,
    configPath,
    profile: profileName,
    counts: {
        characters: profile.characters,
        worlds: profile.worlds,
        chatsPerCharacter: profile.chatsPerCharacter,
        groups: profile.groups,
        groupChatsPerGroup: profile.groupChatsPerGroup,
    },
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

async function seedSettings() {
    const settings = structuredClone(defaultSettings);
    settings.firstRun = false;
    settings.active_character = '';
    settings.active_group = null;
    settings.world_info = settings.world_info || {};
    settings.world_info.globalSelect = [];
    await fs.promises.writeFile(
        path.join(userRoot, SETTINGS_FILE),
        `${JSON.stringify(settings, null, 4)}\n`,
        'utf8',
    );
}

async function seedBootstrapContent() {
    await copyFile(
        path.join(repoRoot, 'default', 'content', 'user.css'),
        path.join(dataRoot, '_css', 'user.css'),
    );
    await copyFile(
        path.join(repoRoot, 'default', 'content', 'backgrounds', '__transparent.png'),
        path.join(directories.backgrounds, '__transparent.png'),
    );
    await copyFile(
        path.join(repoRoot, 'default', 'content', 'presets', 'quick-replies', 'Default.json'),
        path.join(directories.quickreplies, 'Default.json'),
    );
}

async function seedBackgroundsAndThemes() {
    await copyFile(
        path.join(repoRoot, 'default', 'content', 'backgrounds', '_black.jpg'),
        path.join(directories.backgrounds, '_black.jpg'),
    );
    await copyFile(
        path.join(repoRoot, 'default', 'content', 'backgrounds', 'landscape beach day.png'),
        path.join(directories.backgrounds, 'landscape beach day.png'),
    );
    await copyFile(
        path.join(repoRoot, 'default', 'content', 'themes', 'Dark V 1.0.json'),
        path.join(directories.themes, 'Dark V 1.0.json'),
    );
}

async function seedWorlds() {
    const names = [];

    for (let index = 0; index < profile.worlds; index++) {
        const name = `Dev World ${String(index + 1).padStart(2, '0')}`;
        names.push(name);
        const world = {
            entries: {},
            name,
            extensions: {
                source: 'seed-dev-environment',
                theme: pick(['fantasy', 'sci-fi', 'modern', 'post-apoc'], rng),
            },
        };

        const entryCount = 6 + (index % 4);
        for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
            const uid = entryIndex;
            world.entries[String(uid)] = {
                uid,
                key: [slugify(name), randomKeyword(), randomKeyword()],
                keysecondary: [],
                comment: `${name} entry ${entryIndex + 1}`,
                content: randomParagraphs(2 + (entryIndex % 3)),
                constant: false,
                selective: true,
                order: 100,
                position: 0,
                disable: false,
                displayIndex: uid,
                addMemo: true,
                group: '',
                groupOverride: false,
                groupWeight: 100,
                sticky: 0,
                cooldown: 0,
                delay: 0,
                probability: 100,
                depth: 4,
                useProbability: true,
                role: null,
                vectorized: false,
                excludeRecursion: false,
                preventRecursion: false,
                delayUntilRecursion: false,
                scanDepth: null,
                caseSensitive: null,
                matchWholeWords: null,
                useGroupScoring: null,
                automationId: '',
                extensions: {},
            };
        }

        await fs.promises.writeFile(
            path.join(directories.worlds, `${sanitizeFileName(name)}.json`),
            `${JSON.stringify(world, null, 4)}\n`,
            'utf8',
        );
    }

    return names;
}

async function seedCharacters(worldNames) {
    const records = [];

    for (let index = 0; index < profile.characters; index++) {
        const name = `Dev Character ${String(index + 1).padStart(3, '0')}`;
        const avatar = `${slugify(name)}.png`;
        const worldName = worldNames[index % worldNames.length];
        const alternateGreetings = Array.from({ length: 1 + (index % 3) }, (_, greetingIndex) =>
            randomSentence(18 + greetingIndex * 4),
        );

        const characterPayload = {
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name,
                description: randomParagraphs(2 + (index % 3)),
                personality: randomSentence(22),
                scenario: randomParagraphs(1 + (index % 2)),
                first_mes: randomSentence(28),
                mes_example: `${name}: ${randomSentence(18)}\nUser: ${randomSentence(16)}\n${name}: ${randomSentence(20)}`,
                creator_notes: randomParagraphs(1),
                tags: [`tag-${index % 8}`, `domain-${index % 5}`],
                creator: 'seed-dev-environment',
                character_version: '2.0',
                alternate_greetings: alternateGreetings,
                character_book: createCharacterBook(name, worldName),
                extensions: {
                    talkativeness: round(0.2 + ((index % 7) * 0.11)),
                    fav: index % 9 === 0,
                    world: worldName,
                    depth_prompt: {
                        prompt: randomSentence(18),
                        depth: 2 + (index % 4),
                        role: 0,
                    },
                },
            },
        };

        fs.writeFileSync(
            path.join(directories.characters, avatar),
            writeCharacterCardPngData(defaultAvatarBuffer, JSON.stringify(characterPayload)),
        );

        const chatFolder = path.join(directories.chats, path.parse(avatar).name);
        await fs.promises.mkdir(chatFolder, { recursive: true });

        const chatFiles = [];
        for (let chatIndex = 0; chatIndex < profile.chatsPerCharacter; chatIndex++) {
            const chatName = `${name} Session ${String(chatIndex + 1).padStart(2, '0')}.jsonl`;
            const chatHeader = {
                chat_metadata: {
                    scenario: randomSentence(12),
                    mes_example: randomSentence(10),
                    system_prompt: randomSentence(14),
                    integrity: `seed-${index + 1}-${chatIndex + 1}`,
                },
                user_name: 'unused',
                character_name: 'unused',
            };
            const lines = [JSON.stringify(chatHeader)];

            const startedAt = Date.UTC(2026, 0, 1, 8, 0, 0) + ((index * 10) + chatIndex) * 3600000;
            for (let messageIndex = 0; messageIndex < profile.messagesPerChat; messageIndex++) {
                const isUser = messageIndex % 2 === 0;
                lines.push(JSON.stringify({
                    name: isUser ? 'User' : name,
                    is_user: isUser,
                    is_system: false,
                    mes: randomSentence(24 + (messageIndex % 10)),
                    send_date: new Date(startedAt + messageIndex * 45000).toISOString(),
                }));
            }

            await fs.promises.writeFile(path.join(chatFolder, chatName), `${lines.join('\n')}\n`, 'utf8');
            chatFiles.push(chatName);
        }

        records.push({
            name,
            avatar,
            worldName,
            chatFiles,
        });
    }

    return records;
}

async function seedGroups(characterRecords) {
    for (let index = 0; index < profile.groups; index++) {
        const id = `dev-group-${String(index + 1).padStart(3, '0')}`;
        const name = `Dev Group ${String(index + 1).padStart(2, '0')}`;
        const start = (index * 3) % characterRecords.length;
        const members = [];

        for (let offset = 0; offset < 4; offset++) {
            members.push(characterRecords[(start + offset) % characterRecords.length].avatar);
        }

        const chats = [];
        for (let chatIndex = 0; chatIndex < profile.groupChatsPerGroup; chatIndex++) {
            const chatId = `${id}-chat-${chatIndex + 1}`;
            chats.push(chatId);
            const header = {
                chat_metadata: {
                    integrity: `${chatId}-integrity`,
                    scenario: randomSentence(12),
                },
                user_name: 'unused',
                character_name: 'unused',
            };
            const lines = [JSON.stringify(header)];
            const startedAt = Date.UTC(2026, 1, 1, 10, 0, 0) + ((index * 10) + chatIndex) * 7200000;

            for (let messageIndex = 0; messageIndex < profile.groupMessagesPerChat; messageIndex++) {
                const speakerRecord = messageIndex % 3 === 0
                    ? null
                    : characterRecords[(start + messageIndex) % characterRecords.length];
                const sender = speakerRecord ? speakerRecord.name : 'User';
                const message = {
                    name: sender,
                    is_user: sender === 'User',
                    is_system: false,
                    mes: randomSentence(18 + (messageIndex % 8)),
                    send_date: new Date(startedAt + messageIndex * 60000).toISOString(),
                };

                if (speakerRecord) {
                    message.original_avatar = speakerRecord.avatar;
                    message.force_avatar = buildAvatarThumbnailUrl(speakerRecord.avatar);
                }

                lines.push(JSON.stringify(message));
            }

            await fs.promises.writeFile(
                path.join(directories.groupChats, `${chatId}.jsonl`),
                `${lines.join('\n')}\n`,
                'utf8',
            );
        }

        const group = {
            id,
            name,
            members,
            avatar_url: '',
            allow_self_responses: false,
            activation_strategy: 0,
            generation_mode: 0,
            disabled_members: [],
            fav: index % 5 === 0,
            chat_id: chats[0],
            chats,
            auto_mode_delay: 5,
            generation_mode_join_prefix: '',
            generation_mode_join_suffix: '',
        };

        await fs.promises.writeFile(
            path.join(directories.groups, `${id}.json`),
            `${JSON.stringify(group, null, 4)}\n`,
            'utf8',
        );
    }
}

async function writeDevConfig() {
    const config = [
        `dataRoot: ${normalizePathForYaml(dataRoot)}`,
        'listen: false',
        'port: 8000',
        'browserLaunch:',
        '  enabled: false',
        'whitelistMode: false',
        'extensions:',
        '  enabled: true',
        '  autoUpdate: false',
        'skipContentCheck: true',
        'logging:',
        '  minLogLevel: 1',
    ].join('\n');

    await fs.promises.writeFile(configPath, `${config}\n`, 'utf8');
}

function createUserDirectories(root) {
    const directories = {};
    for (const [key, relativePath] of Object.entries(USER_DIRECTORY_TEMPLATE)) {
        directories[key] = path.join(root, relativePath);
    }
    return directories;
}

function createCharacterBook(name, worldName) {
    return {
        name: `${name} Lorebook`,
        description: `${name} embedded lorebook`,
        extensions: {},
        scan_depth: 4,
        token_budget: 512,
        recursive_scanning: false,
        entries: [
            {
                id: 0,
                keys: [slugify(name), slugify(worldName)],
                content: randomParagraphs(2),
                comment: `${name} profile`,
                insertion_order: 0,
                enabled: true,
                selective: false,
                extensions: {},
            },
            {
                id: 1,
                keys: [randomKeyword(), randomKeyword()],
                content: randomParagraphs(2),
                comment: `${worldName} clue`,
                insertion_order: 1,
                enabled: true,
                selective: true,
                extensions: {},
            },
        ],
    };
}

function buildAvatarThumbnailUrl(avatar) {
    return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
}

function randomParagraphs(count) {
    return Array.from({ length: count }, () => randomSentence(28 + Math.floor(rng() * 16))).join('\n\n');
}

function randomSentence(wordCount) {
    const words = [];
    for (let index = 0; index < wordCount; index++) {
        words.push(randomKeyword());
    }

    const sentence = words.join(' ');
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function randomKeyword() {
    const syllables = [
        'al', 'be', 'cor', 'dra', 'el', 'fin', 'gor', 'hal', 'ion', 'jor',
        'kel', 'lor', 'mor', 'nar', 'or', 'pra', 'qua', 'rin', 'sol', 'tor',
        'ur', 'val', 'wen', 'xel', 'yor', 'zen',
    ];
    const partCount = 2 + Math.floor(rng() * 3);
    let result = '';
    for (let index = 0; index < partCount; index++) {
        result += pick(syllables, rng);
    }
    return result;
}

function round(value) {
    return Math.round(value * 100) / 100;
}

function slugify(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sanitizeFileName(value) {
    return String(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
}

function normalizePathForYaml(targetPath) {
    return JSON.stringify(targetPath.replace(/\\/g, '/'));
}

function pick(items, random) {
    return items[Math.floor(random() * items.length)];
}

function createRng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function parseCliOptions(args) {
    const options = {};
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--profile') {
            options.profile = args[++index];
            continue;
        }
        if (arg === '--data-root') {
            options.dataRoot = args[++index];
            continue;
        }
        if (arg === '--config') {
            options.configPath = args[++index];
            continue;
        }
        if (arg === '--seed') {
            options.seed = args[++index];
        }
    }
    return options;
}

async function copyFile(source, target) {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.copyFile(source, target);
}

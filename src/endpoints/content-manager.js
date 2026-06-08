import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';

import express from 'express';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { getConfigValue, color, setPermissionsSync, isValidUrl } from '../util.js';
import { write } from '../character-card-parser.js';
import { serverDirectory } from '../server-directory.js';
import { Jimp, JimpMime } from '../jimp.js';
import { DEFAULT_AVATAR_PATH } from '../constants.js';
import { invalidateDirectory } from './settings-cache.js';
import {
    classifyExternalContentId,
    classifyExternalContentUrl,
    downloadExternalContentArtifact,
    fetchExternalResource,
    getHostFromUrl as getExternalHostFromUrl,
    isHostWhitelisted as isExternalHostWhitelisted,
} from './external-content-import-service.js';

const contentDirectory = path.join(serverDirectory, 'default/content');
const scaffoldDirectory = path.join(serverDirectory, 'default/scaffold');
const contentIndexPath = path.join(contentDirectory, 'index.json');
const scaffoldIndexPath = path.join(scaffoldDirectory, 'index.json');

const WHITELIST_GENERIC_URL_DOWNLOAD_SOURCES = getConfigValue('whitelistImportDomains', []);
const USER_AGENT = 'EmberDesk';

async function fetchProviderResource({ url, options = undefined, source, stage, requireOk = false, fetchResource = fetchExternalResource }) {
    const result = await fetchResource({ url, options, source, stage, requireOk });

    if (!result.ok) {
        const error = new Error(result.failure?.kind ?? 'external fetch failed');
        error.failure = result.failure;
        error.response = result.response;
        throw error;
    }

    return result.response;
}

/**
 * @typedef {Object} ContentItem
 * @property {string} filename
 * @property {string} type
 * @property {string} [name]
 * @property {string|null} [folder]
 */

/**
 * @typedef {string} ContentType
 * @enum {string}
 */
export const CONTENT_TYPES = {
    SETTINGS: 'settings',
    CHARACTER: 'character',
    SPRITES: 'sprites',
    BACKGROUND: 'background',
    WORLD: 'world',
    AVATAR: 'avatar',
    THEME: 'theme',
    WORKFLOW: 'workflow',
    KOBOLD_PRESET: 'kobold_preset',
    OPENAI_PRESET: 'openai_preset',
    NOVEL_PRESET: 'novel_preset',
    INSTRUCT: 'instruct',
    CONTEXT: 'context',
    MOVING_UI: 'moving_ui',
    QUICK_REPLIES: 'quick_replies',
    SYSPROMPT: 'sysprompt',
    REASONING: 'reasoning',
    ERROR_PAGE: 'error_page',
    STYLESHEET: 'stylesheet',
};

/**
 * @enum {string}
 */
export const CONTENT_SCOPE = {
    USER: 'user',
    GLOBAL: 'global',
};

/**
 * Gets the scope of a content type.
 * @param {CONTENT_TYPES} type Content type
 * @returns {CONTENT_SCOPE} Resolved content scope
 */
function getScopeByType(type) {
    const globalTypes = [
        CONTENT_TYPES.ERROR_PAGE,
        CONTENT_TYPES.STYLESHEET,
    ];
    return globalTypes.includes(type) ? CONTENT_SCOPE.GLOBAL : CONTENT_SCOPE.USER;
}

/**
 * Gets the default presets from the content directory.
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @returns {object[]} Array of default presets
 */
export function getDefaultPresets(directories) {
    try {
        const contentIndex = getContentIndex(CONTENT_SCOPE.USER);
        const presets = [];

        for (const contentItem of contentIndex) {
            if (contentItem.type.endsWith('_preset') || ['instruct', 'context', 'sysprompt', 'reasoning'].includes(contentItem.type)) {
                contentItem.name = path.parse(contentItem.filename).name;
                contentItem.folder = getUserTargetByType(contentItem.type, directories);
                presets.push(contentItem);
            }
        }

        return presets;
    } catch (err) {
        console.warn('Failed to get default presets', err);
        return [];
    }
}

/**
 * Gets a default JSON file from the content directory.
 * @param {string} filename Name of the file to get
 * @returns {object | null} JSON object or null if the file doesn't exist
 */
export function getDefaultPresetFile(filename) {
    try {
        const contentPath = path.join(contentDirectory, filename);

        if (!fs.existsSync(contentPath)) {
            return null;
        }

        const fileContent = fs.readFileSync(contentPath, 'utf8');
        return JSON.parse(fileContent);
    } catch (err) {
        console.warn(`Failed to get default file ${filename}`, err);
        return null;
    }
}

/**
 * Seeds content from a content index into a target location.
 * @param {ContentItem[]} contentIndex Content index
 * @param {string} contentLogPath Path to the content log file
 * @param {(type: string) => string | null} resolveTarget Function to resolve the target directory for a content type
 * @param {string[]} [forceCategories] List of categories to force check (even if content check is skipped)
 * @returns {boolean} Whether any content was added
 */
function seedContent(contentIndex, contentLogPath, resolveTarget, forceCategories) {
    let anyContentAdded = false;
    const contentLog = getContentLog(contentLogPath);
    const affectedTargets = new Set();

    for (const contentItem of contentIndex) {
        if (contentLog.includes(contentItem.filename) && !forceCategories?.includes(contentItem.type)) {
            continue;
        }

        if (!contentItem.folder) {
            console.warn(`Content file ${contentItem.filename} has no parent folder`);
            continue;
        }

        const contentPath = path.join(contentItem.folder, contentItem.filename);

        if (!fs.existsSync(contentPath)) {
            console.warn(`Content file ${contentItem.filename} is missing`);
            continue;
        }

        const contentTarget = resolveTarget(contentItem.type);

        if (!contentTarget) {
            console.warn(`Content file ${contentItem.filename} has unknown type ${contentItem.type}`);
            continue;
        }

        const basePath = path.parse(contentItem.filename).base;
        const targetPath = path.join(contentTarget, basePath);
        contentLog.push(contentItem.filename);

        if (fs.existsSync(targetPath)) {
            console.warn(`Content file ${contentItem.filename} already exists in ${contentTarget}`);
            continue;
        }

        fs.mkdirSync(contentTarget, { recursive: true });
        fs.cpSync(contentPath, targetPath, { recursive: true, force: false });
        setPermissionsSync(targetPath);
        console.info(`Content file ${contentItem.filename} copied to ${contentTarget}`);
        anyContentAdded = true;
        affectedTargets.add(contentTarget);
    }

    writeFileAtomicSync(contentLogPath, contentLog.join('\n'));
    return { anyContentAdded, affectedTargets };
}

/**
 * Seeds content for a user.
 * @param {ContentItem[]} contentIndex Content index
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {string[]} forceCategories List of categories to force check (even if content check is skipped)
 * @returns {Promise<boolean>} Whether any content was added
 */
async function seedContentForUser(contentIndex, directories, forceCategories) {
    if (!fs.existsSync(directories.root)) {
        fs.mkdirSync(directories.root, { recursive: true });
    }

    const contentLogPath = path.join(directories.root, 'content.log');
    const { anyContentAdded, affectedTargets } = seedContent(contentIndex, contentLogPath, (type) => getUserTargetByType(type, directories), forceCategories);
    for (const dir of affectedTargets) {
        invalidateDirectory(dir);
    }
    return anyContentAdded;
}

/**
 * Seeds global content that is not user-specific, such as error pages.
 * @param {ContentItem[]} contentIndex Content index
 * @returns {Promise<boolean>} Whether any content was added
 */
async function seedGlobalContent(contentIndex) {
    const contentLogPath = path.join(globalThis.DATA_ROOT, 'content.log');
    const { anyContentAdded } = seedContent(contentIndex, contentLogPath, getGlobalTargetByType);
    return anyContentAdded;
}

/**
 * Checks for new content and seeds it for all users.
 * @param {import('../users.js').UserDirectoryList[]} directoriesList List of user directories
 * @param {string[]} forceCategories List of categories to force check (even if content check is skipped)
 * @returns {Promise<void>}
 */
export async function checkForNewContent(directoriesList, forceCategories = []) {
    try {
        const contentCheckSkip = getConfigValue('skipContentCheck', false, 'boolean');
        if (contentCheckSkip && forceCategories?.length === 0) {
            return;
        }

        const userContentIndex = getContentIndex(CONTENT_SCOPE.USER);
        const globalContentIndex = getContentIndex(CONTENT_SCOPE.GLOBAL);
        let anyContentAdded = false;

        const globalSeedResult = await seedGlobalContent(globalContentIndex);
        if (globalSeedResult) {
            anyContentAdded = true;
        }

        for (const directories of directoriesList) {
            const userSeedResult = await seedContentForUser(userContentIndex, directories, forceCategories);

            if (userSeedResult) {
                anyContentAdded = true;
            }
        }

        if (anyContentAdded && !contentCheckSkip && forceCategories?.length === 0) {
            console.info();
            console.info(`${color.blue('If you don\'t want to receive content updates in the future, set')} ${color.yellow('skipContentCheck')} ${color.blue('to true in the config.yaml file.')}`);
            console.info();
        }
    } catch (err) {
        console.error('Content check failed', err);
    }
}

/**
 * Gets combined content index from the content and scaffold directories.
 * @param {CONTENT_SCOPE} scope Scope of content to get
 * @returns {ContentItem[]} Array of content index
 */
function getContentIndex(scope = CONTENT_SCOPE.USER) {
    const result = [];

    if (fs.existsSync(scaffoldIndexPath)) {
        const scaffoldIndexText = fs.readFileSync(scaffoldIndexPath, 'utf8');
        const scaffoldIndex = JSON.parse(scaffoldIndexText);
        if (Array.isArray(scaffoldIndex)) {
            scaffoldIndex.forEach((item) => {
                item.folder = scaffoldDirectory;
                item.scope = getScopeByType(item.type);
            });
            result.push(...scaffoldIndex);
        }
    }

    if (fs.existsSync(contentIndexPath)) {
        const contentIndexText = fs.readFileSync(contentIndexPath, 'utf8');
        const contentIndex = JSON.parse(contentIndexText);
        if (Array.isArray(contentIndex)) {
            contentIndex.forEach((item) => {
                item.folder = contentDirectory;
                item.scope = getScopeByType(item.type);
            });
            result.push(...contentIndex);
        }
    }

    return result.filter((item) => item.scope === scope);
}

/**
 * Gets content by type and format.
 * @param {string} type Type of content
 * @param {'json'|'string'|'raw'} format Format of content
 * @param {CONTENT_SCOPE} scope Scope of content to get
 * @returns {string[]|Buffer[]} Array of content
 */
export function getContentOfType(type, format, scope = CONTENT_SCOPE.USER) {
    const contentIndex = getContentIndex(scope);
    const indexItems = contentIndex.filter((item) => item.type === type && item.folder);
    const files = [];
    for (const item of indexItems) {
        if (!item.folder) {
            continue;
        }
        try {
            const filePath = path.join(item.folder, item.filename);
            const fileContent = fs.readFileSync(filePath);
            switch (format) {
                case 'json':
                    files.push(JSON.parse(fileContent.toString()));
                    break;
                case 'string':
                    files.push(fileContent.toString());
                    break;
                case 'raw':
                    files.push(fileContent);
                    break;
            }
        } catch {
            // Ignore errors
        }
    }
    return files;
}

/**
 * Gets the target directory for the specified asset type.
 * @param {ContentType} type Asset type
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @returns {string | null} Target directory
 */
export function getUserTargetByType(type, directories) {
    switch (type) {
        case CONTENT_TYPES.SETTINGS:
            return directories.root;
        case CONTENT_TYPES.CHARACTER:
            return directories.characters;
        case CONTENT_TYPES.SPRITES:
            return directories.characters;
        case CONTENT_TYPES.BACKGROUND:
            return directories.backgrounds;
        case CONTENT_TYPES.WORLD:
            return directories.worlds;
        case CONTENT_TYPES.AVATAR:
            return directories.avatars;
        case CONTENT_TYPES.THEME:
            return directories.themes;
        case CONTENT_TYPES.WORKFLOW:
            return directories.comfyWorkflows;
        case CONTENT_TYPES.KOBOLD_PRESET:
            return directories.koboldAI_Settings;
        case CONTENT_TYPES.OPENAI_PRESET:
            return directories.openAI_Settings;
        case CONTENT_TYPES.NOVEL_PRESET:
            return directories.novelAI_Settings;
        case CONTENT_TYPES.INSTRUCT:
            return directories.instruct;
        case CONTENT_TYPES.CONTEXT:
            return directories.context;
        case CONTENT_TYPES.MOVING_UI:
            return directories.movingUI;
        case CONTENT_TYPES.QUICK_REPLIES:
            return directories.quickreplies;
        case CONTENT_TYPES.SYSPROMPT:
            return directories.sysprompt;
        case CONTENT_TYPES.REASONING:
            return directories.reasoning;
        default:
            return null;
    }
}

/**
 * Gets the target directory for global content types.
 * @param {CONTENT_TYPES} type Content type
 * @returns {string | null} Target directory
 */
export function getGlobalTargetByType(type) {
    switch (type) {
        case CONTENT_TYPES.ERROR_PAGE:
            return path.join(globalThis.DATA_ROOT, '_errors');
        case CONTENT_TYPES.STYLESHEET:
            return path.join(globalThis.DATA_ROOT, '_css');
        default:
            return null;
    }
}

/**
 * Gets the content log from the content log file.
 * @param {string} contentLogPath Path to the content log file
 * @returns {string[]} Array of content log lines
 */
function getContentLog(contentLogPath) {
    if (!fs.existsSync(contentLogPath)) {
        return [];
    }

    const contentLogText = fs.readFileSync(contentLogPath, 'utf8');
    return contentLogText.split('\n');
}

async function downloadChubLorebook(id, dependencies = {}) {
    const fetchResource = dependencies.fetchExternalResource ?? fetchExternalResource;
    const [lorebooks, creatorName, projectName] = id.split('/');
    const result = await fetchProviderResource({
        url: `https://api.chub.ai/api/${lorebooks}/${creatorName}/${projectName}`,
        options: {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
        },
        source: 'chub_lorebook',
        stage: 'metadata',
        requireOk: true,
        fetchResource,
    });

    if (!result.ok) {
        const text = await result.text();
        console.error('Chub returned error', result.statusText, text);
        throw new Error('Failed to fetch lorebook metadata');
    }

    /** @type {any} */
    const metadata = await result.json();
    const projectId = metadata.node?.id;

    if (!projectId) {
        throw new Error('Project ID not found in lorebook metadata');
    }

    const downloadUrl = `https://api.chub.ai/api/v4/projects/${projectId}/repository/files/raw%252Fsillytavern_raw.json/raw`;
    const downloadResult = await fetchProviderResource({
        url: downloadUrl,
        options: {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
        },
        source: 'chub_lorebook',
        stage: 'artifact',
        requireOk: true,
        fetchResource,
    });

    if (!downloadResult.ok) {
        const text = await downloadResult.text();
        console.error('Chub returned error', downloadResult.statusText, text);
        throw new Error('Failed to download lorebook');
    }

    const name = projectName;
    const buffer = Buffer.from(await downloadResult.arrayBuffer());
    const fileName = `${sanitize(name)}.json`;
    const fileType = downloadResult.headers.get('content-type');

    return { buffer, fileName, fileType };
}

async function downloadChubCharacter(id, dependencies = {}) {
    const fetchResource = dependencies.fetchExternalResource ?? fetchExternalResource;
    const [creatorName, projectName] = id.split('/');
    const result = await fetchProviderResource({
        url: `https://api.chub.ai/api/characters/${creatorName}/${projectName}?full=true`,
        options: {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
        },
        source: 'chub_character',
        stage: 'metadata',
        requireOk: true,
        fetchResource,
    });

    if (!result.ok) {
        const text = await result.text();
        console.error('Chub returned error', result.statusText, text);
        throw new Error('Failed to fetch character metadata');
    }

    /** @type {any} */
    const metadata = await result.json();
    const { definition, topics } = metadata.node;

    /** @type {TavernCardV2} */
    const characterCard = {
        data: {
            name: definition.name,
            description: definition.personality,
            personality: definition.tavern_personality,
            scenario: definition.scenario,
            first_mes: definition.first_message,
            mes_example: definition.example_dialogs,
            creator_notes: definition.description,
            system_prompt: definition.system_prompt,
            post_history_instructions: definition.post_history_instructions,
            alternate_greetings: definition.alternate_greetings,
            tags: topics,
            creator: creatorName,
            character_version: '',
            character_book: definition.embedded_lorebook,
            extensions: definition.extensions,
        },
        spec: 'chara_card_v2',
        spec_version: '2.0',
    };

    const defaultAvatarPath = path.join(serverDirectory, DEFAULT_AVATAR_PATH);
    const defaultAvatarBuffer = fs.readFileSync(defaultAvatarPath);

    let imageBuffer = defaultAvatarBuffer;

    const imageUrl = metadata.node?.max_res_url;

    if (imageUrl) {
        const imageResource = await fetchResource({
            url: imageUrl,
            source: 'chub_character',
            stage: 'avatar',
        });
        if (!imageResource.ok) {
            throw new Error(imageResource.failure?.kind ?? 'Failed to download avatar');
        }
        const downloadResult = imageResource.response;
        if (downloadResult.ok) {
            imageBuffer = Buffer.from(await downloadResult.arrayBuffer());
        }
    }

    const buffer = write(imageBuffer, JSON.stringify(characterCard));
    const fileName = `${sanitize(characterCard.data.name)}.png`;
    const fileType = 'image/png';

    return { buffer, fileName, fileType };
}

/**
 * Downloads a character card from the Pygsite.
 * @param {string} id UUID of the character
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string}>}
 */
async function downloadPygmalionCharacter(id, dependencies = {}) {
    const fetchResource = dependencies.fetchExternalResource ?? fetchExternalResource;
    const result = await fetchProviderResource({
        url: `https://server.pygmalion.chat/api/export/character/${id}/v2`,
        source: 'pygmalion_character',
        stage: 'metadata',
        requireOk: true,
        fetchResource,
    });

    if (!result.ok) {
        const text = await result.text();
        console.error('Pygsite returned error', result.status, text);
        throw new Error('Failed to download character');
    }

    /** @type {any} */
    const jsonData = await result.json();
    const characterData = jsonData?.character;

    if (!characterData || typeof characterData !== 'object') {
        console.error('Pygsite returned invalid character data', jsonData);
        throw new Error('Failed to download character');
    }

    try {
        const avatarUrl = characterData?.data?.avatar;

        if (!avatarUrl) {
            console.error('Pygsite character does not have an avatar', characterData);
            throw new Error('Failed to download avatar');
        }

        const avatarResource = await fetchResource({
            url: avatarUrl,
            source: 'pygmalion_character',
            stage: 'avatar',
        });
        if (!avatarResource.ok) {
            throw new Error(avatarResource.failure?.kind ?? 'Failed to download avatar');
        }
        const avatarResult = avatarResource.response;
        const avatarBuffer = Buffer.from(await avatarResult.arrayBuffer());

        const cardBuffer = write(avatarBuffer, JSON.stringify(characterData));

        return {
            buffer: cardBuffer,
            fileName: `${sanitize(id)}.png`,
            fileType: 'image/png',
        };
    } catch (e) {
        console.error('Failed to download avatar, using JSON instead', e);
        return {
            buffer: Buffer.from(JSON.stringify(jsonData)),
            fileName: `${sanitize(id)}.json`,
            fileType: 'application/json',
        };
    }
}

// Warning: Some characters might not exist in JannyAI.me
async function downloadJannyCharacter(uuid, dependencies = {}) {
    const fetchResource = dependencies.fetchExternalResource ?? fetchExternalResource;
    // This endpoint is being guarded behind Bot Fight Mode of Cloudflare
    // So hosted ST on Azure/AWS/GCP/Collab might get blocked by IP
    // Should work normally on self-host PC/Android
    const result = await fetchProviderResource({
        url: 'https://api.jannyai.com/api/v1/download',
        options: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                'characterId': uuid,
            }),
        },
        source: 'janitor_character',
        stage: 'metadata',
        fetchResource,
    });

    if (result.ok) {
        /** @type {any} */
        const downloadResult = await result.json();
        if (downloadResult.status === 'ok') {
            const imageResource = await fetchResource({
                url: downloadResult.downloadUrl,
                source: 'janitor_character',
                stage: 'artifact',
            });
            if (!imageResource.ok) {
                throw new Error(imageResource.failure?.kind ?? 'Failed to download character');
            }
            const imageResult = imageResource.response;
            const buffer = Buffer.from(await imageResult.arrayBuffer());
            const fileName = `${sanitize(uuid)}.png`;
            const fileType = imageResult.headers.get('content-type');

            return { buffer, fileName, fileType };
        } else {
            console.error('Janny failed to download', downloadResult);
        }
    } else {
        console.error('Janny returned error', result.statusText, await result.text());
    }

    throw new Error('Failed to download character');
}

//Download Character Cards from AICharactersCards.com (AICC) API.
async function downloadAICCCharacter(id, dependencies = {}) {
    const fetchResource = dependencies.fetchExternalResource ?? fetchExternalResource;
    const apiURL = `https://aicharactercards.com/wp-json/pngapi/v1/image/${id}`;
    try {
        const response = await fetchProviderResource({
            url: apiURL,
            source: 'aicc_character',
            stage: 'artifact',
            fetchResource,
        });
        if (!response.ok) {
            throw new Error(`Failed to download character: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || 'image/png'; // Default to 'image/png' if header is missing
        const buffer = Buffer.from(await response.arrayBuffer());
        const fileName = `${sanitize(id)}.png`; // Assuming PNG, but adjust based on actual content or headers

        return {
            buffer: buffer,
            fileName: fileName,
            fileType: contentType,
        };
    } catch (error) {
        console.error('Error downloading character:', error);
        throw error;
    }
}

/**
 * Download character card from generic url.
 * @param {String} url
 */
async function downloadGenericPng(url, dependencies = {}) {
    const fetchResource = dependencies.fetchExternalResource ?? fetchExternalResource;
    try {
        const result = await fetchProviderResource({
            url,
            source: 'generic_png',
            stage: 'artifact',
            fetchResource,
        });

        if (result.ok) {
            const buffer = Buffer.from(await result.arrayBuffer());
            let fileName = sanitize(result.url.split('?')[0].split('/').reverse()[0]);
            const contentType = result.headers.get('content-type') || 'image/png'; //yoink it from AICC function lol

            // The `importCharacter()` function detects the MIME (content-type) of the file
            // using its file extension. The problem is that not all third-party APIs serve
            // their cards with a `.png` extension. To support more third-party sites,
            // dynamically append the `.png` extension to the filename if it doesn't
            // already have a file extension.
            if (contentType === 'image/png') {
                const ext = fileName.match(/\.(\w+)$/); // Same regex used by `importCharacter()`
                if (!ext) {
                    fileName += '.png';
                }
            }

            return {
                buffer: buffer,
                fileName: fileName,
                fileType: contentType,
            };
        }
    } catch (error) {
        console.error('Error downloading file: ', error);
        throw error;
    }
    return null;
}

/**
 * Download RisuAI character card
 * @param {string} uuid UUID of the character
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string}>}
 */
async function downloadRisuCharacter(uuid, dependencies = {}) {
    const fetchResource = dependencies.fetchExternalResource ?? fetchExternalResource;
    const result = await fetchProviderResource({
        url: `https://realm.risuai.net/api/v1/download/png-v3/${uuid}?non_commercial=true`,
        source: 'risu_character',
        stage: 'artifact',
        fetchResource,
    });

    if (!result.ok) {
        const text = await result.text();
        console.error('RisuAI returned error', result.statusText, text);
        throw new Error('Failed to download character');
    }

    const buffer = Buffer.from(await result.arrayBuffer());
    const fileName = `${sanitize(uuid)}.png`;
    const fileType = 'image/png';

    return { buffer, fileName, fileType };
}

/**
 * Download Perchance character card
 * @param {string} slug Slug of the character
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string} | null>}
 */
async function downloadPerchanceCharacter(slug, dependencies = {}) {
    const fetchResource = dependencies.fetchExternalResource ?? fetchExternalResource;
    // example of slug
    // 6903e991c90fd1dba52c036d917e99c6.gz
    const perchanceBaseURL = 'https://user.uploads.dev/file';

    try {
        const charURL = `${perchanceBaseURL}/${slug}`;
        console.log('Downloading Perchance character from URL:', charURL);
        const result = await fetchProviderResource({
            url: charURL,
            options: {
                headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
            },
            source: 'perchance_character',
            stage: 'metadata',
            fetchResource,
        });

        //decompress gzipped content
        if (result.ok) {
            const perchanceChar = await extractPerchanceCharacterFromGz(result);

            const avatarUrl = perchanceChar.avatar?.url;

            //check if avatarURL is a base64 of any image type
            const isAvatarBase64 = avatarUrl && avatarUrl.startsWith('data:image/');

            const charData = {
                name: perchanceChar.name || 'Unnamed Perchance Character',
                first_mes: '',
                tags: [],
                description: perchanceChar.roleInstruction || '',
                creator: perchanceChar.metaTitle || '',
                creator_notes: perchanceChar.metaDescription || '',
                alternate_greetings: [],
                character_version: '',
                mes_example: '',
                post_history_instructions: '',
                system_prompt: '',
                scenario: '',
                personality: perchanceChar.reminderMessage || '',
                extensions: {
                    perchance_data: {
                        slug: slug,
                        char_url: charURL,
                        uuid: perchanceChar.uuid || null,
                        avatar_url: isAvatarBase64 ? null : (avatarUrl || null),
                        folder_path: perchanceChar.folderPath || null,
                        folder_name: perchanceChar.folderName || null,
                        custom_data: perchanceChar.customData || {},
                    },
                },
            };

            const avatarBuffer = await fetchPerchanceAvatar(avatarUrl, isAvatarBase64, { fetchExternalResource: fetchResource });

            // Character card
            const buffer = write(avatarBuffer, JSON.stringify({
                'spec': 'chara_card_v2',
                'spec_version': '2.0',
                'data': charData,
            }));

            const fileName = `${charData.name}.png`;
            const fileType = 'image/png';

            return { buffer, fileName, fileType };
        }
    } catch (error) {
        console.error('Error downloading character:', error);
        throw error;
    }
    return null;
}

/**
 * Extracts Perchance character data from a gzipped response.
 * @param {import('node-fetch').Response} result Fetch response containing gzipped character data
 * @returns {Promise<Object>} Parsed Perchance character data
 * @throws {Error} If the character data is invalid or missing required fields
 */
async function extractPerchanceCharacterFromGz(result) {
    const compressedBuffer = await result.arrayBuffer();
    const decompressedBuffer = zlib.gunzipSync(compressedBuffer);

    // inside the gz file, there is a file of the same name without extensions, but it is a json file

    if (!decompressedBuffer || decompressedBuffer.length === 0) {
        console.error('Perchance character data is empty or invalid');
        throw new Error('Failed to download character: Invalid Perchance character data');
    }

    // Parse the decompressed JSON
    const perchanceCharData = JSON.parse(decompressedBuffer.toString());

    if (!perchanceCharData?.addCharacter) {
        console.error('Perchance character data is missing addCharacter field', perchanceCharData);
        throw new Error('Failed to download character: Invalid Perchance character data');
    }

    return perchanceCharData.addCharacter;
}

/** * Fetches the avatar from Perchance URL or uses a default avatar if not available.
 * @param {string} avatarUrl URL of the avatar
 * @param {boolean} isAvatarBase64 Flag indicating if the avatar URL is a base64 string
 * @returns {Promise<Buffer>} Buffer containing the avatar image
 */
async function fetchPerchanceAvatar(avatarUrl, isAvatarBase64, dependencies = {}) {
    const fetchResource = dependencies.fetchExternalResource ?? fetchExternalResource;
    const defaultAvatarPath = path.join(serverDirectory, DEFAULT_AVATAR_PATH);
    const defaultAvatarBuffer = fs.readFileSync(defaultAvatarPath);

    if (!avatarUrl || (!isAvatarBase64 && !isValidUrl(avatarUrl))) {
        console.warn('Perchance character does not have an avatar, it is not base64, or it is an invalid url, using default avatar');
        return defaultAvatarBuffer;
    }

    if (isAvatarBase64) {
        // check if avatarUrl is a png
        const isPng = avatarUrl.startsWith('data:image/png;base64,');
        const base64 = avatarUrl.split(',')[1];
        const buffer = Buffer.from(base64, 'base64');

        if (isPng) {
            return buffer;
        } else {
            // use jimp to convert the base64 to PNG if it's not PNG
            console.debug('Perchance character avatar is not PNG, converting to PNG...');
            return await Jimp.read(buffer).then(image => image.getBuffer(JimpMime.png));
        }
    }

    // Fetch avatar from URL
    console.log('Fetching Perchance avatar from URL:', avatarUrl);
    const avatarResource = await fetchResource({
        url: avatarUrl,
        options: { headers: { 'User-Agent': USER_AGENT } },
        source: 'perchance_character',
        stage: 'avatar',
    });
    if (!avatarResource.ok) {
        throw new Error(avatarResource.failure?.kind ?? 'Failed to fetch Perchance avatar');
    }
    const avatarResponse = avatarResource.response;

    if (avatarResponse.ok) {
        const avatarContentType = avatarResponse.headers.get('content-type');
        const avatarBuffer = Buffer.from(await avatarResponse.arrayBuffer());

        if (avatarContentType === 'image/png') {
            return avatarBuffer;
        } else {
            console.debug(`Perchance character avatar is not PNG: ${avatarContentType}. Converting to PNG...`);

            // use jimp to convert the image to PNG if it's not PNG
            return await Jimp.read(avatarBuffer)
                .then(image => image.getBuffer(JimpMime.png));
        }
    }

    console.error('Failed to fetch Perchance avatar:', avatarResponse.statusText);
    const isPerchanceOrgFileUploader = avatarUrl.includes('https://user-uploads.perchance.org');

    if (isPerchanceOrgFileUploader) {
        console.warn('Files from https://user-uploads.perchance.org are sometimes blocked by CloudFlare, try reuploading it in https://perchance.org/upload to get the new link from https://user-uploads.dev instead.');
    }

    console.warn('You can also download the avatar manually and assign it to the character:', avatarUrl);
    return defaultAvatarBuffer;
}

/**
 * Filter to get the domain host of a url instead of a blanket string search.
 * @param {String} url URL to strip
 * @returns {String} Domain name
 */
export function getHostFromUrl(url) {
    return getExternalHostFromUrl(url);
}

/**
 * Checks if host is part of generic download source whitelist.
 * @param {String} host Host to check
 * @returns {boolean} If the host is on the whitelist.
 */
export function isHostWhitelisted(host) {
    return isExternalHostWhitelisted(host, WHITELIST_GENERIC_URL_DOWNLOAD_SOURCES);
}

export function getImportDomainAllowlist() {
    return WHITELIST_GENERIC_URL_DOWNLOAD_SOURCES;
}

export const EXTERNAL_CONTENT_DOWNLOADERS = {
    chub_character: (descriptor, dependencies) => downloadChubCharacter(descriptor.id, dependencies),
    chub_lorebook: (descriptor, dependencies) => downloadChubLorebook(descriptor.id, dependencies),
    pygmalion_character: (descriptor, dependencies) => downloadPygmalionCharacter(descriptor.id, dependencies),
    janitor_character: (descriptor, dependencies) => downloadJannyCharacter(descriptor.id, dependencies),
    aicc_character: (descriptor, dependencies) => downloadAICCCharacter(descriptor.id, dependencies),
    risu_character: (descriptor, dependencies) => downloadRisuCharacter(descriptor.id, dependencies),
    perchance_character: (descriptor, dependencies) => downloadPerchanceCharacter(descriptor.id, dependencies),
    generic_png: (descriptor, dependencies) => downloadGenericPng(descriptor.id, dependencies),
};

function sendExternalContentArtifact(response, artifact, { encodeFileName = true } = {}) {
    if (artifact.fileType) {
        response.set('Content-Type', artifact.fileType);
    }

    const fileName = encodeFileName ? encodeURI(artifact.fileName) : artifact.fileName;
    response.set('Content-Disposition', `attachment; filename="${fileName}"`);
    response.set('X-Custom-Content-Type', artifact.type);
    return response.send(artifact.buffer);
}

function sendExternalContentFailure(response, failure) {
    if (failure?.kind === 'invalid_artifact' || failure?.kind === 'unsupported_host' || failure?.kind === 'invalid_url' || failure?.kind === 'unsupported_source') {
        return response.sendStatus(404);
    }

    return response.sendStatus(500);
}

export const router = express.Router();

router.post('/importURL', async (request, response) => {
    if (!request.body.url) {
        return response.sendStatus(400);
    }

    try {
        const url = request.body.url;
        const classification = classifyExternalContentUrl(url, WHITELIST_GENERIC_URL_DOWNLOAD_SOURCES);
        if (!classification.ok) {
            if (classification.failure?.kind === 'unsupported_host') {
                console.error(`Received an import for "${classification.failure.host}", but site is not whitelisted. This domain must be added to the config key "whitelistImportDomains" to allow import from this source.`);
            }
            return sendExternalContentFailure(response, classification.failure);
        }

        const result = await downloadExternalContentArtifact({
            descriptor: classification.descriptor,
            downloaders: EXTERNAL_CONTENT_DOWNLOADERS,
        });

        if (!result.ok) {
            return sendExternalContentFailure(response, result.failure);
        }

        return sendExternalContentArtifact(response, result.artifact, { encodeFileName: true });
    } catch (error) {
        console.error('Importing custom content failed', error);
        return response.sendStatus(500);
    }
});

router.post('/importUUID', async (request, response) => {
    if (!request.body.url) {
        return response.sendStatus(400);
    }

    try {
        const uuid = request.body.url;
        const classification = classifyExternalContentId(uuid);
        if (!classification.ok) {
            return sendExternalContentFailure(response, classification.failure);
        }

        const result = await downloadExternalContentArtifact({
            descriptor: classification.descriptor,
            downloaders: EXTERNAL_CONTENT_DOWNLOADERS,
        });

        if (!result.ok) {
            if (result.failure?.kind === 'invalid_artifact') {
                throw new Error('Failed to download content');
            }
            return sendExternalContentFailure(response, result.failure);
        }

        return sendExternalContentArtifact(response, result.artifact, { encodeFileName: false });
    } catch (error) {
        console.error('Importing custom content failed', error);
        return response.sendStatus(500);
    }
});

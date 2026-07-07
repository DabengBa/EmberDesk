import path from 'node:path';
import fs from 'node:fs';
import mime from 'mime-types';
import sanitize from 'sanitize-filename';
import { USER_DIRECTORY_TEMPLATE, PUBLIC_DIRECTORIES, SETTINGS_FILE, UPLOADS_DIRECTORY } from './constants.js';
import { getAllUserHandles, toAvatarKey } from './user-storage.js';
import storage from 'node-persist';

const PUBLIC_USER_AVATAR = '/img/default-user.png';

/**
 * Cache for user directories.
 * @type {Map<string, UserDirectoryList>}
 */
const DIRECTORIES_CACHE = new Map();

/**
 * @typedef {Object} UserDirectoryList
 * @property {string} root - The root directory for the user
 * @property {string} thumbnails - The directory where the thumbnails are stored
 * @property {string} thumbnailsBg - The directory where the background thumbnails are stored
 * @property {string} thumbnailsAvatar - The directory where the avatar thumbnails are stored
 * @property {string} thumbnailsPersona - The directory where the persona thumbnails are stored
 * @property {string} worlds - The directory where the WI are stored
 * @property {string} user - The directory where the user's public data is stored
 * @property {string} avatars - The directory where the avatars are stored
 * @property {string} userImages - The directory where the images are stored
 * @property {string} groups - The directory where the groups are stored
 * @property {string} groupChats - The directory where the group chats are stored
 * @property {string} chats - The directory where the chats are stored
 * @property {string} characters - The directory where the characters are stored
 * @property {string} backgrounds - The directory where the backgrounds are stored
 * @property {string} novelAI_Settings - The directory where the NovelAI settings are stored
 * @property {string} koboldAI_Settings - The directory where the KoboldAI settings are stored
 * @property {string} openAI_Settings - The directory where the OpenAI settings are stored
 * @property {string} textGen_Settings - The directory where the TextGen settings are stored
 * @property {string} themes - The directory where the themes are stored
 * @property {string} movingUI - The directory where the moving UI data is stored
 * @property {string} extensions - The directory where the extensions are stored
 * @property {string} instruct - The directory where the instruct templates is stored
 * @property {string} context - The directory where the context templates is stored
 * @property {string} quickreplies - The directory where the quick replies are stored
 * @property {string} assets - The directory where the assets are stored
 * @property {string} comfyWorkflows - The directory where the ComfyUI workflows are stored
 * @property {string} files - The directory where the uploaded files are stored
 * @property {string} vectors - The directory where the vectors are stored
 * @property {string} backups - The directory where the backups are stored
 * @property {string} sysprompt - The directory where the system prompt data is stored
 * @property {string} reasoning - The directory where the reasoning templates are stored
 * @property {string} storage - The directory where the durable canonical storage files are stored
 */

/**
 * Gets the directories listing for the provided user.
 * @param {string} handle User handle
 * @returns {UserDirectoryList} User directories
 */
export function getUserDirectories(handle) {
    if (DIRECTORIES_CACHE.has(handle)) {
        const cache = DIRECTORIES_CACHE.get(handle);
        if (cache) {
            return cache;
        }
    }

    const directories = structuredClone(USER_DIRECTORY_TEMPLATE);
    for (const key in directories) {
        directories[key] = path.join(globalThis.DATA_ROOT, handle, USER_DIRECTORY_TEMPLATE[key]);
    }
    DIRECTORIES_CACHE.set(handle, directories);
    return directories;
}

/**
 * Gets a list of all user directories.
 * @returns {Promise<import('./user-directories.js').UserDirectoryList[]>} - The list of user directories
 */
export async function getUserDirectoriesList() {
    const userHandles = await getAllUserHandles();
    const directoriesList = userHandles.map(handle => getUserDirectories(handle));
    return directoriesList;
}

/**
 * Ensures that the content directories exist.
 * @returns {Promise<import('./user-directories.js').UserDirectoryList[]>} - The list of user directories
 */
export async function ensurePublicDirectoriesExist() {
    for (const dir of Object.values(PUBLIC_DIRECTORIES)) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    const userHandles = await getAllUserHandles();
    const directoriesList = userHandles.map(handle => getUserDirectories(handle));
    for (const userDirectories of directoriesList) {
        for (const dir of Object.values(userDirectories)) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }
    return directoriesList;
}

export function cleanUploads() {
    try {
        const uploadsPath = path.join(globalThis.DATA_ROOT, UPLOADS_DIRECTORY);
        if (fs.existsSync(uploadsPath)) {
            const uploads = fs.readdirSync(uploadsPath);

            if (!uploads.length) {
                return;
            }

            console.debug(`Cleaning uploads folder (${uploads.length} files)`);
            uploads.forEach(file => {
                const pathToFile = path.join(uploadsPath, file);
                fs.unlinkSync(pathToFile);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

/**
 * Gets the avatar URL for the provided user.
 * @param {string} handle User handle
 * @returns {Promise<string>} User avatar URL
 */
export async function getUserAvatar(handle) {
    try {
        // Check if the user has a custom avatar
        const avatarKey = toAvatarKey(handle);
        const avatar = await storage.getItem(avatarKey);

        if (avatar) {
            return avatar;
        }

        // Fallback to reading from files if custom avatar is not set
        const directory = getUserDirectories(handle);
        const pathToSettings = path.join(directory.root, SETTINGS_FILE);
        const settings = fs.existsSync(pathToSettings) ? JSON.parse(fs.readFileSync(pathToSettings, 'utf8')) : {};
        const avatarFile = settings?.power_user?.default_persona || settings?.user_avatar;
        if (!avatarFile) {
            return PUBLIC_USER_AVATAR;
        }
        const avatarPath = path.join(directory.avatars, sanitize(avatarFile));
        if (!fs.existsSync(avatarPath)) {
            return PUBLIC_USER_AVATAR;
        }
        const mimeType = mime.lookup(avatarPath);
        const base64Content = fs.readFileSync(avatarPath, 'base64');
        return `data:${mimeType};base64,${base64Content}`;
    } catch {
        // Ignore errors
        return PUBLIC_USER_AVATAR;
    }
}

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import express from 'express';
import { getConfigValue, color } from './util.js';
import { updatePlugins } from './plugin-updater.js';

let _enableServerPlugins;
function getEnableServerPlugins() {
    if (_enableServerPlugins === undefined) {
        _enableServerPlugins = !!getConfigValue('enableServerPlugins', false, 'boolean');
    }
    return _enableServerPlugins;
}

/**
 * Map of loaded plugins.
 * @type {Map<string, any>}
 */
const loadedPlugins = new Map();

/**
 * Reset loaded plugins map. For use in tests.
 */
export function clearLoadedPlugins() {
    loadedPlugins.clear();
}

/**
 * @typedef {Object} PluginCandidate
 * @property {'file'|'directory'} type - Whether the candidate is a file or directory
 * @property {string} path - Absolute path to the plugin entry file
 */

/**
 * Determine if a file is a CommonJS module.
 * @param {string} file Path to file
 * @returns {boolean} True if file is a CommonJS module
 */
const isCommonJS = (file) => path.extname(file) === '.js' || path.extname(file) === '.cjs';

/**
 * Determine if a file is an ECMAScript module.
 * @param {string} file Path to file
 * @returns {boolean} True if file is an ECMAScript module
 */
const isESModule = (file) => path.extname(file) === '.mjs';

/**
 * Discover plugin candidates from the plugins directory.
 * Returns metadata only — does NOT import any plugin module.
 * @param {string} pluginsPath Path to plugins directory
 * @returns {PluginCandidate[]} List of plugin candidates
 */
function discoverPluginCandidates(pluginsPath) {
    if (!fs.existsSync(pluginsPath)) {
        return [];
    }

    const files = fs.readdirSync(pluginsPath);
    if (files.length === 0) {
        return [];
    }

    const candidates = [];

    for (const file of files) {
        const pluginFilePath = path.join(pluginsPath, file);

        if (fs.statSync(pluginFilePath).isDirectory()) {
            // Check for package.json with main field
            const packageJsonPath = path.join(pluginFilePath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                    if (packageJson.main) {
                        candidates.push({ type: 'directory', path: path.join(pluginFilePath, packageJson.main) });
                        continue;
                    }
                } catch {
                    // Fall through to index file detection
                }
            }

            // Check for index files
            const indexFiles = ['index.js', 'index.cjs', 'index.mjs'];
            for (const indexFile of indexFiles) {
                const indexPath = path.join(pluginFilePath, indexFile);
                if (fs.existsSync(indexPath)) {
                    candidates.push({ type: 'directory', path: indexPath });
                    break;
                }
            }
            continue;
        }

        // Top-level file candidate
        if (isCommonJS(file) || isESModule(file)) {
            candidates.push({ type: 'file', path: pluginFilePath });
        }
    }

    return candidates;
}

/**
 * Load and initialize server plugins from a directory if they are enabled.
 * @param {import('express').Express} app Express app
 * @param {string} pluginsPath Path to plugins directory
 * @returns {Promise<Function>} Promise that resolves when all plugins are loaded. Resolves to a "cleanup" function to
 * be called before the server shuts down.
 */
export async function loadPlugins(app, pluginsPath) {
    try {
        const exitHooks = [];
        const emptyFn = () => { };

        // Server plugins are disabled.
        if (!getEnableServerPlugins()) {
            return emptyFn;
        }

        const candidates = discoverPluginCandidates(pluginsPath);

        if (candidates.length === 0) {
            return emptyFn;
        }

        await updatePlugins(pluginsPath);

        for (const candidate of candidates) {
            await loadFromFile(app, candidate.path, exitHooks);
        }

        if (loadedPlugins.size > 0) {
            console.log(`${loadedPlugins.size} server plugin(s) are currently loaded. Make sure you know exactly what they do, and only install plugins from trusted sources!`);
        }

        // Call all plugin "exit" functions at once and wait for them to finish
        return () => Promise.all(exitHooks.map(exitFn => exitFn()));
    } catch (error) {
        console.error('Plugin loading failed.', error);
        return () => { };
    }
}

/**
 * Loads and initializes a plugin from a file.
 * @param {import('express').Express} app Express app
 * @param {string} pluginFilePath Path to plugin directory
 * @param {Array.<Function>} exitHooks Array of functions to be run on plugin exit. Will be pushed to if the plugin has
 * an "exit" function.
 * @returns {Promise<boolean>} Promise that resolves to true if plugin was loaded successfully
 */
async function loadFromFile(app, pluginFilePath, exitHooks) {
    try {
        const fileUrl = url.pathToFileURL(pluginFilePath).toString();
        const plugin = await import(fileUrl);
        console.log(`Initializing plugin from ${pluginFilePath}`);
        return await initPlugin(app, plugin, exitHooks);
    } catch (error) {
        console.error(`Failed to load plugin from ${pluginFilePath}: ${error}`);
        return false;
    }
}

/**
 * Check whether a plugin ID is valid (only lowercase alphanumeric, hyphens, and underscores).
 * @param {string} id The plugin ID to check
 * @returns {boolean} True if the plugin ID is valid.
 */
function isValidPluginID(id) {
    return /^[a-z0-9_-]+$/.test(id);
}

/**
 * Initializes a plugin module.
 * @param {import('express').Express} app Express app
 * @param {any} plugin Plugin module
 * @param {Array.<Function>} exitHooks Array of functions to be run on plugin exit. Will be pushed to if the plugin has
 * an "exit" function.
 * @returns {Promise<boolean>} Promise that resolves to true if plugin was initialized successfully
 */
async function initPlugin(app, plugin, exitHooks) {
    const info = plugin.info || plugin.default?.info;
    if (typeof info !== 'object') {
        console.error('Failed to load plugin module; plugin info not found');
        return false;
    }

    // We don't currently use "name" or "description" but it would be nice to have a UI for listing server plugins, so
    // require them now just to be safe
    for (const field of ['id', 'name', 'description']) {
        if (typeof info[field] !== 'string') {
            console.error(`Failed to load plugin module; plugin info missing field '${field}'`);
            return false;
        }
    }

    const init = plugin.init || plugin.default?.init;
    if (typeof init !== 'function') {
        console.error('Failed to load plugin module; no init function');
        return false;
    }

    const { id } = info;

    if (!isValidPluginID(id)) {
        console.error(`Failed to load plugin module; invalid plugin ID '${id}'`);
        return false;
    }

    if (loadedPlugins.has(id)) {
        console.error(`Failed to load plugin module; plugin ID '${id}' is already in use`);
        return false;
    }

    // Allow the plugin to register API routes under /api/plugins/[plugin ID] via a router
    const router = express.Router();

    await init(router);

    loadedPlugins.set(id, plugin);

    // Add API routes to the app if the plugin registered any
    if (router.stack.length > 0) {
        app.use(`/api/plugins/${id}`, router);
    }

    const exit = plugin.exit || plugin.default?.exit;
    if (typeof exit === 'function') {
        exitHooks.push(exit);
    }

    return true;
}

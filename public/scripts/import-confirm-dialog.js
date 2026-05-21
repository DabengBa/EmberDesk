import { characters, converter, substituteParams } from '../script.js';
import { accountStorage } from './util/AccountStorage.js';
import { callGenericPopup, POPUP_TYPE } from './popup.js';
import { power_user } from './power-user.js';
import { tag_import_setting } from './tags.js';
import { isScopedScriptsAllowed, allowScopedScripts } from './extensions/regex/engine.js';
import { importEmbeddedWorldInfo, world_names } from './world-info.js';

const EXCLUDED_TAGS = ['ROOT', 'TAVERN'];
const GLOBAL_STYLES_KEY_PREFIX = 'AllowGlobalStyles-';

/**
 * @typedef {Object} ImportScanResult
 * @property {string} avatar
 * @property {string} name
 * @property {boolean} hasTags
 * @property {string[]} tagNames
 * @property {boolean} hasWorldBook
 * @property {string} worldBookName
 * @property {boolean} hasRegexScripts
 * @property {number} regexScriptCount
 * @property {boolean} hasCreatorNotesCSS
 * @property {boolean} hasAnyContent
 */

/**
 * Scan a character for importable embedded content.
 * @param {Object} character - characters[chid]
 * @returns {ImportScanResult}
 */
export function scanImportedCharacter(character) {
    const data = character?.data ?? character;
    const avatar = character?.avatar ?? '';

    // Tags
    const tagNames = (character?.tags ?? data?.tags ?? [])
        .map(t => String(t).trim())
        .filter(t => t && !EXCLUDED_TAGS.includes(t));
    const hasTags = tagNames.length > 0;

    // World book
    const hasWorldBook = Boolean(data?.character_book);
    const worldBookName = data?.character_book?.name || `${character?.name ?? 'Unknown'}'s Lorebook`;

    // Regex scripts
    const regexScripts = Array.isArray(data?.extensions?.regex_scripts)
        ? data.extensions.regex_scripts
        : [];
    const hasRegexScripts = regexScripts.length > 0 && !isScopedScriptsAllowed(character);

    // Creator notes CSS
    const notes = data?.creator_notes || character?.creatorcomment || '';
    const hasCreatorNotesCSS = Boolean(getStyleContentsFromMarkdown(notes));

    return {
        avatar,
        name: character?.name ?? 'Unknown',
        hasTags,
        tagNames,
        hasWorldBook,
        worldBookName,
        hasRegexScripts,
        regexScriptCount: regexScripts.length,
        hasCreatorNotesCSS,
        hasAnyContent: hasTags || hasWorldBook || hasRegexScripts || hasCreatorNotesCSS,
    };
}

/**
 * Extract style tag contents from markdown text.
 * Mirrors the logic in chats.js:getStyleContentsFromMarkdown.
 * @param {string} text
 * @returns {string}
 */
function getStyleContentsFromMarkdown(text) {
    if (!text) return '';
    try {
        const html = converter.makeHtml(substituteParams(text));
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return Array.from(doc.querySelectorAll('style'))
            .filter(s => s.textContent.trim().length > 0)
            .map(s => s.textContent.trim())
            .join('\n\n');
    } catch {
        return '';
    }
}

/**
 * Show unified import confirmation dialog.
 * @param {ImportScanResult[]} results - One per imported character
 * @returns {Promise<Object|null>} User choices, or null if cancelled
 */
export async function showUnifiedImportConfirm(results) {
    const showTags = results.some(r => r.hasTags) && power_user.tag_import_setting === tag_import_setting.ASK;
    const showWorldBook = results.some(r => r.hasWorldBook) && power_user.world_import_dialog !== false;
    const showRegex = results.some(r => r.hasRegexScripts);
    const showCSS = results.some(r => r.hasCreatorNotesCSS);

    if (!showTags && !showWorldBook && !showRegex && !showCSS) {
        return null;
    }

    const characterNames = results.map(r => r.name).join(', ');
    let html = `<div class="import-confirm-dialog">
        <h3>Import Options for ${escapeHtml(characterNames)}</h3>
        <p>This character contains embedded content. Choose what to import:</p>
        <div class="import-confirm-options">`;

    if (showTags) {
        const allTags = [...new Set(results.flatMap(r => r.tagNames))];
        html += `<label class="checkbox_label import-confirm-option">
            <input type="checkbox" id="import_opt_tags" checked />
            <span>Import tags (${allTags.length}: ${escapeHtml(allTags.slice(0, 5).join(', '))}${allTags.length > 5 ? '...' : '')})</span>
        </label>`;
    }

    if (showWorldBook) {
        const worlds = results.filter(r => r.hasWorldBook);
        const worldList = worlds.map(w => {
            const willOverwrite = world_names.includes(w.worldBookName);
            return `${escapeHtml(w.worldBookName)}${willOverwrite ? ' (will overwrite)' : ''}`;
        }).join(', ');
        html += `<label class="checkbox_label import-confirm-option">
            <input type="checkbox" id="import_opt_world" />
            <span>Import World/Lorebook${worlds.length > 1 ? 's' : ''} (${worldList})</span>
        </label>`;
    }

    if (showRegex) {
        const total = results.reduce((sum, r) => sum + r.regexScriptCount, 0);
        html += `<label class="checkbox_label import-confirm-option">
            <input type="checkbox" id="import_opt_regex" />
            <span>Enable embedded regex script${total > 1 ? 's' : ''} (${total})</span>
        </label>`;
    }

    if (showCSS) {
        html += `<label class="checkbox_label import-confirm-option">
            <input type="checkbox" id="import_opt_css" />
            <span>Apply Creator Notes CSS to entire app</span>
        </label>`;
    }

    html += `</div></div>`;

    const result = await callGenericPopup(html, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Apply Selected',
        cancelButton: 'Skip All',
        wide: false,
    });

    if (!result) {
        return null;
    }

    return {
        importTags: showTags ? !!document.getElementById('import_opt_tags')?.checked : false,
        importWorldBook: showWorldBook ? !!document.getElementById('import_opt_world')?.checked : false,
        enableRegex: showRegex ? !!document.getElementById('import_opt_regex')?.checked : false,
        applyCSS: showCSS ? !!document.getElementById('import_opt_css')?.checked : false,
        tagImportSetting: showTags && document.getElementById('import_opt_tags')?.checked
            ? tag_import_setting.ALL
            : tag_import_setting.NONE,
    };
}

/**
 * Build "skip all" choices for when user cancels the dialog.
 * @param {ImportScanResult[]} results
 * @returns {Object}
 */
export function buildSkipAllChoices(results) {
    return {
        importTags: false,
        importWorldBook: false,
        enableRegex: false,
        applyCSS: false,
        tagImportSetting: tag_import_setting.NONE,
    };
}

/**
 * Apply user choices by pre-setting storage keys so individual popups skip.
 * @param {Object} character - characters[chid]
 * @param {Object} choices - From showUnifiedImportConfirm or buildSkipAllChoices
 */
export async function applyImportChoices(character, choices) {
    const avatar = character?.avatar;
    if (!avatar) return;

    // World book: pre-set alert key and optionally import
    if (character?.data?.character_book) {
        accountStorage.setItem(`AlertWI_${avatar}`, 'true');
        if (choices.importWorldBook) {
            // Set the chid data so importEmbeddedWorldInfo can find it
            const chid = characters.indexOf(character);
            if (chid !== -1) {
                $('#import_character_info').data('chid', chid);
                await importEmbeddedWorldInfo(true);
            }
        }
    }

    // Regex scripts: pre-set alert key and optionally enable
    if (Array.isArray(character?.data?.extensions?.regex_scripts) && character.data.extensions.regex_scripts.length > 0) {
        accountStorage.setItem(`AlertRegex_${avatar}`, 'true');
        if (choices.enableRegex) {
            allowScopedScripts(character);
        }
    }

    // Creator notes CSS: set style preference
    const notes = character?.data?.creator_notes || character?.creatorcomment || '';
    if (getStyleContentsFromMarkdown(notes)) {
        const prefKey = `${GLOBAL_STYLES_KEY_PREFIX}${avatar}`;
        accountStorage.setItem(prefKey, choices.applyCSS ? 'true' : 'false');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

import { characters, converter, substituteParams } from '../script.js';
import { accountStorage } from './util/AccountStorage.js';
import { callGenericPopup, POPUP_TYPE } from './popup.js';
import { power_user } from './power-user.js';
import { tag_import_setting } from './tags.js';
import { isScopedScriptsAllowed, allowScopedScripts } from './extensions/regex/engine.js';
import { importEmbeddedWorldInfo, world_names } from './world-info.js';
import { t } from './i18n.js';

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
        .map(tag => String(tag).trim())
        .filter(tag => tag && !EXCLUDED_TAGS.includes(tag));
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

    const nameList = results.map(r => `<span class="import-opt-char">${escapeHtml(r.name)}</span>`);
    const titleHtml = results.length > 3
        ? nameList.slice(0, 3).join(', ') + ` +${results.length - 3}`
        : nameList.join(', ');
    const style = `<style>
        .import-opt-title{font-size:1.05rem;font-weight:600;margin-bottom:10px;line-height:1.3}
        .import-opt-char{color:#E88A24}
        .import-opt-list{display:flex;flex-direction:column;gap:2px}
        .import-opt-item{display:flex;align-items:flex-start;gap:8px;padding:5px 6px;border-radius:5px;cursor:pointer;transition:background .12s}
        .import-opt-item:hover{background:rgba(255,255,255,.04)}
        .import-opt-item+.import-opt-item{border-top:1px solid rgba(255,255,255,.04)}
        .import-opt-item input[type=checkbox]{margin-top:3px;accent-color:#E88A24;flex-shrink:0}
        .import-opt-body{display:flex;flex-direction:column;gap:1px;min-width:0}
        .import-opt-label{font-size:.9rem;font-weight:500;line-height:1.3}
        .import-opt-meta{font-size:.8rem;color:#919191;line-height:1.3}
        .import-opt-chip{display:inline-block;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08);border-radius:3px;padding:0 4px;font-size:.78rem;margin-right:3px;line-height:1.5}
        .import-opt-overwrite{color:#D78872;font-weight:500}
    </style>`;
    let html = `${style}<div class="import-confirm-dialog">
        <div class="import-opt-title">${titleHtml}</div>
        <div class="import-opt-list">`;

    if (showTags) {
        const allTags = [...new Set(results.flatMap(r => r.tagNames))];
        const chips = allTags.slice(0, 5).map(tag => `<span class="import-opt-chip">${escapeHtml(tag)}</span>`).join('')
            + (allTags.length > 5 ? `<span class="import-opt-chip">+${allTags.length - 5}</span>` : '');
        html += `<label class="import-opt-item">
            <input type="checkbox" id="import_opt_tags" checked />
            <div class="import-opt-body">
                <span class="import-opt-label">${t`Tags`}</span>
                <span class="import-opt-meta">${chips}</span>
            </div>
        </label>`;
    }

    if (showWorldBook) {
        const worlds = results.filter(r => r.hasWorldBook);
        const metaParts = worlds.map(w => {
            const name = escapeHtml(w.worldBookName);
            return world_names.includes(w.worldBookName)
                ? `${name} <span class="import-opt-overwrite">${t`will overwrite`}</span>`
                : name;
        });
        const label = worlds.length > 1 ? t`World Books` : t`World Book`;
        html += `<label class="import-opt-item">
            <input type="checkbox" id="import_opt_world" />
            <div class="import-opt-body">
                <span class="import-opt-label">${label}</span>
                <span class="import-opt-meta">${metaParts.join(', ')}</span>
            </div>
        </label>`;
    }

    if (showRegex) {
        const total = results.reduce((sum, r) => sum + r.regexScriptCount, 0);
        html += `<label class="import-opt-item">
            <input type="checkbox" id="import_opt_regex" />
            <div class="import-opt-body">
                <span class="import-opt-label">${t`Regex Scripts`}</span>
                <span class="import-opt-meta">${t`${String(total)} script(s)`}</span>
            </div>
        </label>`;
    }

    if (showCSS) {
        html += `<label class="import-opt-item">
            <input type="checkbox" id="import_opt_css" />
            <div class="import-opt-body">
                <span class="import-opt-label">${t`Creator CSS`}</span>
                <span class="import-opt-meta">${t`Apply to entire app`}</span>
            </div>
        </label>`;
    }

    html += `</div></div>`;

    const result = await callGenericPopup(html, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Apply`,
        cancelButton: t`Skip All`,
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
 * @returns {Object}
 */
export function buildSkipAllChoices() {
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
            const chid = characters.indexOf(character);
            if (chid !== -1) {
                const prevChid = $('#import_character_info').data('chid');
                $('#import_character_info').data('chid', chid);
                await importEmbeddedWorldInfo(true);
                $('#import_character_info').data('chid', prevChid);
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

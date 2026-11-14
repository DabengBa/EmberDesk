import { characters, getCurrentChatId, messageFormatting, reloadCurrentChat, saveSettingsDebounced, this_chid } from '../../../script.js';
import { eventSource, event_types } from '../../events.js';
import { feature_settings, renderFeatureTemplateAsync } from '../../feature-settings.js';
import { loadWorkspacePanelsModule } from '../../workspace-panels-react-bridge.js';
import { getToolBindingsBridge } from '../../tool-bindings.js';
import { callGenericPopup, Popup, POPUP_TYPE, POPUP_RESULT } from '../../popup.js';
import { download, escapeHtml, getFileText, regexFromString, uuidv4 } from '../../utils.js';
import { allowPresetScripts, allowScopedScripts, authorizeRegexTarget, captureRegexTarget, disallowPresetScripts, disallowScopedScripts, getCurrentPresetAPI, getCurrentPresetName, getRegexScripts, getScriptsByType, getScriptsForTarget, isPresetScriptsAllowed, isScopedScriptsAllowed, regex_placement, RegexProvider, runRegexScript, saveScriptsByType, SCRIPT_TYPES } from './engine.js';
import { createRegexListBridge } from './regex-list-bridge.js';
import { createRegexImportController } from './regex-import-controller.js';
import { createRegexPresetController } from './regex-preset-controller.js';
import { t } from '../../i18n.js';
import { accountStorage } from '../../util/AccountStorage.js';
import { getPresetManager, saveSettingsStrict } from '../../preset-manager.js';

// Re-exports for legacy extensions
export { getRegexScripts };

const sanitizeFileName = name => name.replace(/[\s.<>:"/\\|?*\x00-\x1F\x7F]/g, '_').toLowerCase();

/**
 * @typedef {import('../../char-data.js').RegexScriptData} RegexScript
 */

/**
 * @typedef {object} RegexPresetItem
 * @property {string} id - UUID of the regex script
 */

/**
 * @typedef {object} RegexPreset
 * @property {string} id - UUID of the preset
 * @property {string} name - Name of the preset
 * @property {boolean} isSelected - Whether the preset is currently selected
 * @property {RegexPresetItem[]} global - The list of global preset items
 * @property {RegexPresetItem[]} scoped - The list of scoped preset items
 * @property {RegexPresetItem[]} preset - The list of preset preset items
 */

/**
 * @typedef {object} RegexPresetState
 * @property {string[]} global - List of enabled global regex script IDs
 * @property {string[]} scoped - List of enabled scoped regex script IDs
 * @property {string[]} preset - List of enabled preset regex script IDs
 */


/** React imperative handle for the mounted debugger popup, if any. */
const debuggerRef = { current: null };

const regexListBridge = createRegexListBridge({
    capture: captureRegexTarget,
    read: getScriptsForTarget,
    save: saveScriptsByType,
    authorize: authorizeRegexTarget,
    edit: onRegexEditorOpenClick,
    confirm: (kind, toType) => callGenericPopup(kind === 'delete'
        ? t`Are you sure you want to delete the selected regex scripts?`
        : toType === SCRIPT_TYPES.GLOBAL ? t`Are you sure you want to move the selected regex scripts to global?`
            : toType === SCRIPT_TYPES.PRESET ? t`Are you sure you want to move the selected regex scripts to preset?`
                : t`Are you sure you want to move the selected regex scripts to scoped?`, POPUP_TYPE.CONFIRM),
    exportScripts: scripts => {
        const fileName = scripts.length === 1 ? `regex-${sanitizeFileName(scripts[0].scriptName)}.json` : `regex-${new Date().toISOString()}.json`;
        download(JSON.stringify(scripts.length === 1 ? scripts[0] : scripts, null, 4), fileName, 'application/json');
    },
    afterChange: refreshRegexEffects,
});

async function refreshRegexEffects() {
    await loadRegexScripts();
    if (getCurrentChatId()) await reloadCurrentChat();
    debuggerRef.current?.refresh();
}

async function loadRegexScripts() {
    regexListBridge.refresh();
}

const DEBUG_GROUP_ORDER = [
    { key: 'global', label: 'Global', type: SCRIPT_TYPES.GLOBAL },
    { key: 'preset', label: 'Preset', type: SCRIPT_TYPES.PRESET },
    { key: 'scoped', label: 'Scoped', type: SCRIPT_TYPES.SCOPED },
];

/**
 * Snapshot of the current rule lists for the debugger, in execution order.
 * @returns {{key:string,label:string,type:number,rules:{id:string,name:string,enabled:boolean,pattern:string}[]}[]}
 */
function getDebugGroups() {
    return DEBUG_GROUP_ORDER.map(({ key, label, type }) => {
        let target = null;
        try { target = captureRegexTarget(type); } catch { /* An unavailable empty scope has no target. */ }
        return {
            key, label, type, snapshot: { target },
            rules: (target ? getScriptsForTarget(target) : getScriptsByType(type)).map(script => ({
                id: script.id,
                name: script.scriptName,
                enabled: !script.disabled,
                pattern: script.findRegex,
            })),
        };
    });
}

/**
 * Executes enabled rules across the given groups in order and reports each
 * transformation step plus the final output.
 * @param {{key:string,type?:number,rules:{id:string,name:string,enabled?:boolean}[]}[]} groups Debug groups
 * @param {string} input Test input
 * @param {{displayMode:'replace'|'highlight',renderMode:'text'|'message'}} options Display options
 * @returns {{steps:{label:string,html:string,id:string}[],final:string,finalHtml:string}}
 */
function runForDebug(groups, input, { displayMode, renderMode }) {
    let textForNextStep = input;
    let totalCaptured = 0;
    let totalAdded = 0;
    let totalRemoved = 0;
    const steps = [];

    for (const group of groups) {
        const live = getScriptsByType(group.type);
        for (const rule of group.rules) {
            const script = live.find(entry => entry.id === rule.id);
            if (!script) {
                continue;
            }

            const result = executeRegexScriptForDebugging(script, textForNextStep);
            totalCaptured += result.charsCaptured;
            totalAdded += result.charsAdded;
            totalRemoved += result.charsRemoved;
            const metrics = `<div class="step-metrics">Captured: ${result.charsCaptured} · Added: ${result.charsAdded} · Removed: ${result.charsRemoved}</div>`;
            const errorHtml = result.error ? `<div class="regex-debugger-error">${escapeHtml(result.error)}</div>` : '';
            const outputHtml = displayMode === 'highlight' ? result.highlightedOutput : escapeHtml(result.output);
            steps.push({
                label: `After: ${script.scriptName}`,
                html: `${metrics}${errorHtml}${outputHtml}`,
                id: script.id,
            });
            textForNextStep = result.output;
        }
    }

    const summary = `<div id="regex_debugger_final_summary" class="regex-debugger-summary">Captured: ${totalCaptured} · Added: ${totalAdded} · Removed: ${totalRemoved}</div>`;
    const finalHtml = renderMode === 'message'
        ? `<div class="mes"><div class="mes_text">${messageFormatting(textForNextStep, 'Debugger', true, false, null)}</div></div>${summary}`
        : `${escapeHtml(textForNextStep)}${summary}`;

    return { steps, final: textForNextStep, finalHtml };
}

/**
 * Persists a rule order dragged in the debugger for a single scope.
 * @param {string} groupKey Debug group key
 * @param {string[]} ids Rule ids in the desired order
 * @param {{target:object|null}} [snapshot] Target captured when the group was read
 * @returns {Promise<'saved'>}
 */
async function saveDebugOrder(groupKey, ids, snapshot) {
    const group = DEBUG_GROUP_ORDER.find(entry => entry.key === groupKey);
    if (!group) throw new Error(`Unknown regex scope: ${groupKey}`);


    // Bind the scope identity before writes so a mid-save context switch
    // cannot persist the order to a different character/preset.
    let target = snapshot?.target ?? null;
    if (!snapshot) {
        try {
            target = captureRegexTarget(group.type);
        } catch (error) {
            if (ids.length === 0 && getScriptsByType(group.type).length === 0 &&
                (error.message === 'Character not available' || error.message === 'Preset not available')) return 'saved';
            throw error;
        }
    }
    if (!target) {
        if (ids.length === 0 && getScriptsByType(group.type).length === 0) return 'saved';
        throw new Error('Regex scope was unavailable when the debugger opened');
    }
    const live = getScriptsForTarget(target);
    if (ids.length !== live.length || !ids.every(id => live.some(script => script.id === id))) {
        throw new Error('Regex rules changed while saving order');
    }

    const next = ids.map(id => live.find(script => script.id === id));
    await saveScriptsByType(next, group.type, target);
    regexListBridge.refresh();
    return 'saved';
}

/**
 * Opens the regex debugger popup.
 * @returns {Promise<void>}
 */
async function onRegexDebuggerOpenClick() {
    const workspacePanels = await loadWorkspacePanelsModule();
    const debuggerHost = document.createElement('div');
    workspacePanels.mountRegexDebugger(debuggerHost, {
        getGroups: getDebugGroups,
        reorder: saveDebugOrder,
        runForDebug,
        openEditor: (type, id) => {
            void onRegexEditorOpenClick(id ?? false, type).catch(error => toastr.error(error.message, t`Not saved`));
        },
        commands: {
            openStepsPopup: html => callGenericPopup(html, POPUP_TYPE.TEXT, t`Step-by-step Transformation`, { wide: true }),
            openFinalPopup: ({ text, html }) => callGenericPopup(
                html !== undefined ? html : $(document.createElement('pre')).text(text),
                POPUP_TYPE.TEXT,
                t`Final Output`,
                { wide: true, large: true },
            ),
        },
        ref: debuggerRef,
    });

    await new Popup(debuggerHost, POPUP_TYPE.TEXT, '', { wide: true, allowVerticalScrolling: true }).show();
}

const regexImportController = createRegexImportController({
    getFileText,
    uuid: uuidv4,
    captureTarget: captureRegexTarget,
    getScriptsForTarget,
    saveScriptsByType,
    authorizeRegexTarget,
});

const IMPORT_TARGET_TYPES = { global: SCRIPT_TYPES.GLOBAL, preset: SCRIPT_TYPES.PRESET, scoped: SCRIPT_TYPES.SCOPED };

/**
 * Runs the import-target picker and imports the selected files.
 * @param {File[]} files Files chosen in the React file input
 * @returns {Promise<void>}
 */
async function importRegexFiles(files) {
    if (!Array.isArray(files) || files.length === 0) return;

    const workspacePanels = await loadWorkspacePanelsModule();
    const template = document.createElement('div');
    const targetRef = { current: null };
    workspacePanels.mountRegexImportTarget(template, {
        characterName: characters[this_chid]?.name,
        presetName: getCurrentPresetName() || undefined,
        ref: targetRef,
    });

    const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Import`,
        cancelButton: t`Cancel`,
        defaultResult: POPUP_RESULT.NEGATIVE,
        onOpen: (popup) => { popup.closeButton.style.display = 'block'; },
    });
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    const scriptType = IMPORT_TARGET_TYPES[targetRef.current?.getTarget?.() ?? 'global'] ?? SCRIPT_TYPES.GLOBAL;
    // Bind the picker-confirmed destination before any asynchronous file reads.
    const target = captureRegexTarget(scriptType);
    for (const file of files) {
        try {
            const { imported } = await regexImportController.importRegexFile(file, scriptType, { target });
            if (imported > 0) toastr.success(t`Imported ${imported} regex script(s).`);
        } catch (error) {
            if (error?.stage === 'parse') {
                toastr.error(t`Invalid JSON file.`);
            } else if (error?.stage === 'validate') {
                toastr.error(t`Invalid regex object.`);
            } else {
                toastr.error(error?.message || String(error), t`Not saved`);
            }
            break;
        }
    }

    await refreshRegexEffects();
}

const regexToolbar = {
    openEditor: (type) => {
        if (type === SCRIPT_TYPES.SCOPED && this_chid === undefined) {
            toastr.error(t`No character selected.`);
            return;
        }

        return onRegexEditorOpenClick(false, type);
    },
    openDebugger: () => onRegexDebuggerOpenClick(),
    importFiles: (files) => importRegexFiles(files),
    setScopedAllowed: async (value) => {
        if (this_chid === undefined) throw new Error(t`No character selected.`);
        await authorizeRegexTarget(captureRegexTarget(SCRIPT_TYPES.SCOPED), value);
        await reloadCurrentChat();
    },
    setPresetAllowed: async (value) => {
        await authorizeRegexTarget(captureRegexTarget(SCRIPT_TYPES.PRESET), value);
        await reloadCurrentChat();
    },
    get scopedAllowed() {
        return isScopedScriptsAllowed(characters?.[this_chid]);
    },
    get presetAllowed() {
        return isPresetScriptsAllowed(getCurrentPresetAPI(), getCurrentPresetName());
    },
    onError: (message) => toastr.error(message, t`Not saved`),
};

/**
 * Opens the regex editor.
 * @param {string|boolean} existingId Existing ID
 * @param {SCRIPT_TYPES} scriptType Type of the script
 * @returns {Promise<'saved'|'cancelled'>}
 */
async function onRegexEditorOpenClick(existingId, scriptType, target = captureRegexTarget(scriptType)) {
    const host = document.createElement('div');
    const wrapper = $(host);
    const editorHost = document.createElement('div');
    wrapper.append(editorHost);
    const array = getScriptsForTarget(target);

    let initial = null;
    if (existingId) {
        initial = array.find((script) => script.id === existingId);
        if (!initial) throw new Error('Regex rule no longer exists');
        if (!initial.scriptName) {
            toastr.error('This script doesn\'t have a name! Please delete it.');
            return 'cancelled';
        }
    }

    const editorRef = { current: null };
    const workspacePanels = await loadWorkspacePanelsModule();
    workspacePanels.mountRegexEditor(editorHost, {
        initial,
        ref: editorRef,
        onRun: (script, input) => runRegexScript({ ...script, disabled: false }, input),
        infoFor: editorInfoFor,
    });

    const popupResult = await new Popup(wrapper, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Save`,
        cancelButton: t`Cancel`,
        allowVerticalScrolling: true,
        onClosing: (popup) => popup.result !== POPUP_RESULT.AFFIRMATIVE || (editorRef.current?.validate() ?? false),
    }).show();
    if (!popupResult) return 'cancelled';

    const draft = editorRef.current?.getDraft();
    if (!draft) return 'cancelled';
    const newRegexScript = { ...draft, id: existingId ? String(existingId) : uuidv4() };

    // The popup can outlive a character/preset switch or another edit.
    const live = getScriptsForTarget(target);
    if (existingId && !live.some(script => script.id === existingId)) throw new Error('Regex rule no longer exists');
    const next = existingId ? live.map(script => script.id === existingId ? newRegexScript : script) : [...live, newRegexScript];
    try {
        await saveScriptsByType(next, scriptType, target);
        await authorizeRegexTarget(target);
        await refreshRegexEffects();
        return 'saved';
    } finally {
        await loadRegexScripts();
    }
}

/**
 * Pure info-block text for the regex editor's find-regex hint.
 * @param {object} draft The current editor draft
 * @returns {string} The hint text
 */
function editorInfoFor(draft) {
    const findRegex = String(draft?.findRegex ?? '');
    if (!findRegex) return t`Find Regex is empty`;
    try {
        const regex = regexFromString(findRegex);
        if (!regex) return t`Invalid Find Regex`;
        const flags = [regex.flags.includes('g') ? t`Applies to all matches` : t`Applies to the first match`,
            regex.flags.includes('i') ? t`Case insensitive` : t`Case sensitive`];
        return flags.join('. ');
    } catch (error) {
        return error.message;
    }
}

/**
 * Builds an HTML string for a replacement, highlighting literal parts in green
 * and keeping back-referenced parts plain.
 * @param {RegExpMatchArray} match The match object from `matchAll`.
 * @param {string} pattern The replacement pattern string (e.g., "new text $1").
 * @returns {string} The constructed HTML string.
 */
function buildReplacementHtml(match, pattern) {
    const container = document.createDocumentFragment();
    let lastIndex = 0;
    const backrefRegex = /\$\$|\$&|\$`|\$'|\$(\d{1,2})/g;

    let reMatch;
    while ((reMatch = backrefRegex.exec(pattern)) !== null) {
        // Part of the pattern before the back-reference is a literal.
        const literalPart = pattern.substring(lastIndex, reMatch.index);
        if (literalPart) {
            const mark = document.createElement('mark');
            mark.className = 'green_hl';
            mark.innerText = literalPart;
            container.appendChild(mark);
        }

        const backref = reMatch[0];
        if (backref === '$$') {
            container.appendChild(document.createTextNode('$'));
        } else if (backref === '$&') {
            const mark = document.createElement('mark');
            mark.className = 'yellow_hl';
            mark.innerText = match[0];
            container.appendChild(mark);
        } else if (backref === '$`') {
            container.appendChild(document.createTextNode(match.input.substring(0, match.index)));
        } else if (backref === '$\'') {
            container.appendChild(document.createTextNode(match.input.substring(match.index + match[0].length)));
        } else { // It's a numbered capture group, $n.
            const groupIndex = parseInt(reMatch[1], 10);
            if (groupIndex > 0 && groupIndex < match.length && match[groupIndex] !== undefined) {
                const mark = document.createElement('mark');
                mark.className = 'yellow_hl';
                mark.innerText = match[groupIndex];
                container.appendChild(mark);
            } else {
                // Not a valid group index, treat it as a literal.
                const mark = document.createElement('mark');
                mark.className = 'green_hl';
                mark.innerText = backref;
                container.appendChild(mark);
            }
        }
        lastIndex = backrefRegex.lastIndex;
    }

    // The final part of the pattern after the last back-reference.
    const finalLiteralPart = pattern.substring(lastIndex);
    if (finalLiteralPart) {
        const mark = document.createElement('mark');
        mark.className = 'green_hl';
        mark.innerText = finalLiteralPart;
        container.appendChild(mark);
    }

    // To get the HTML content, we need a temporary parent element.
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(container);
    return tempDiv.innerHTML;
}

function executeRegexScriptForDebugging(script, text) {
    let err;
    let originalRegex;

    try {
        originalRegex = regexFromString(script.findRegex);
        if (!originalRegex) throw new Error('Invalid regex string');
    } catch (e) {
        err = `Compile error: ${e.message}`;
        return { output: text, highlightedOutput: text, error: err, charsCaptured: 0, charsAdded: 0, charsRemoved: 0 };
    }

    const globalRegex = new RegExp(originalRegex.source, originalRegex.flags.includes('g') ? originalRegex.flags : originalRegex.flags + 'g');
    const matches = [...text.matchAll(globalRegex)];

    if (matches.length === 0) {
        return { output: text, highlightedOutput: escapeHtml(text), error: null, charsCaptured: 0, charsAdded: 0, charsRemoved: 0 };
    }

    let outputText = '';
    let highlightedOutput = ''; // This will now be our "diff view"
    let lastIndex = 0;
    let totalCharsCaptured = 0;
    let totalCharsAdded = 0;
    let totalCharsRemoved = 0;

    try {
        for (const match of matches) {
            const originalMatchText = match[0];
            totalCharsCaptured += originalMatchText.length;

            // Append text between matches (this part is unchanged)
            const precedingText = text.substring(lastIndex, match.index);
            outputText += precedingText;
            highlightedOutput += escapeHtml(precedingText);

            // --- Start of new diff and statistics logic ---
            let charsAddedInMatch = 0;
            let charsKeptFromMatch = 0;
            const backrefRegex = /\$\$|\$&|\$`|\$'|\$(\d{1,2})/g;
            let lastPatternIndex = 0;
            let reMatch;
            let replacementForPlainText = '';

            // This loop calculates the stats accurately
            while ((reMatch = backrefRegex.exec(script.replaceString)) !== null) {
                const literalPart = script.replaceString.substring(lastPatternIndex, reMatch.index);
                charsAddedInMatch += literalPart.length;
                replacementForPlainText += literalPart;
                const backref = reMatch[0];
                if (backref === '$$') {
                    replacementForPlainText += '$';
                } else if (backref === '$&') {
                    charsKeptFromMatch += (match[0] || '').length; replacementForPlainText += (match[0] || '');
                } else if (backref === '$`') {
                    const part = match.input.substring(0, match.index); charsKeptFromMatch += part.length; replacementForPlainText += part;
                } else if (backref === '$\'') {
                    const part = match.input.substring(match.index + match[0].length); charsKeptFromMatch += part.length; replacementForPlainText += part;
                } else {
                    const groupIndex = parseInt(reMatch[1], 10);
                    if (groupIndex > 0 && groupIndex < match.length && match[groupIndex] !== undefined) {
                        charsKeptFromMatch += match[groupIndex].length;
                        replacementForPlainText += match[groupIndex];
                    }
                }
                lastPatternIndex = backrefRegex.lastIndex;
            }
            const finalLiteralPart = script.replaceString.substring(lastPatternIndex);
            charsAddedInMatch += finalLiteralPart.length;
            replacementForPlainText += finalLiteralPart;

            totalCharsAdded += charsAddedInMatch;
            totalCharsRemoved += (originalMatchText.length - charsKeptFromMatch);

            outputText += replacementForPlainText;
            // --- End of statistics logic ---

            // --- Build the new Diff View HTML ---
            // 1. Show the entire original match as "removed" (red strikethrough)
            highlightedOutput += `<mark class='red_hl'>${escapeHtml(originalMatchText)}</mark>`;
            // 2. Add an arrow to signify transformation
            highlightedOutput += ' → ';
            // 3. Build the replacement string with green (added) and yellow (kept) parts
            highlightedOutput += buildReplacementHtml(match, script.replaceString);

            lastIndex = match.index + originalMatchText.length;
        }

        // Append text after the last match
        const trailingText = text.substring(lastIndex);
        outputText += trailingText;
        highlightedOutput += escapeHtml(trailingText);
    } catch (e) {
        err = (err ? err + '; ' : '') + `Replace error: ${e.message}`;
        outputText = text; // Fallback
        highlightedOutput = escapeHtml(text);
    }

    return {
        output: outputText,
        highlightedOutput: highlightedOutput,
        error: err,
        charsCaptured: totalCharsCaptured,
        charsAdded: totalCharsAdded,
        charsRemoved: totalCharsRemoved,
    };
}

// Common settings migration function. Some parts will eventually be removed
// TODO: Maybe migrate placement to strings?
function migrateSettings() {
    let performSave = false;

    // Current: If MD Display is present in placement, remove it and add new placements/MD option
    feature_settings.regex.forEach((script) => {
        if (!script.id) {
            script.id = uuidv4();
            performSave = true;
        }

        if (!Array.isArray(script.placement)) {
            script.placement = [];
            performSave = true;
        }

        if (script.placement.includes(regex_placement.MD_DISPLAY)) {
            script.placement = script.placement.length === 1 ?
                Object.values(regex_placement).filter((e) => e !== regex_placement.MD_DISPLAY) :
                script.placement = script.placement.filter((e) => e !== regex_placement.MD_DISPLAY);

            script.markdownOnly = true;
            script.promptOnly = true;

            performSave = true;
        }

        // Old system and sendas placement migration
        // 4 - sendAs
        if (script.placement.includes(4)) {
            script.placement = script.placement.length === 1 ?
                [regex_placement.SLASH_COMMAND] :
                script.placement = script.placement.filter((e) => e !== 4);

            performSave = true;
        }
    });

    if (performSave) {
        saveSettingsDebounced();
    }
}

function purgeEmbeddedRegexScripts({ character }) {
    const avatar = character?.avatar;
    if (!avatar) {
        return;
    }
    const checkKey = `AlertRegex_${avatar}`;
    if (accountStorage.getItem(checkKey)) {
        accountStorage.removeItem(checkKey);
    }
    disallowScopedScripts(characters?.[this_chid]);
}

function purgePresetEmbeddedRegexScripts({ apiId, name }) {
    const checkKey = `AlertRegex_${apiId}_${name}`;
    if (accountStorage.getItem(checkKey)) {
        accountStorage.removeItem(checkKey);
    }
    disallowPresetScripts(apiId, name);
}

async function checkCharEmbeddedRegexScripts() {
    const chid = this_chid;

    if (chid !== undefined) {
        const character = characters[chid];
        const scripts = getScriptsByType(SCRIPT_TYPES.SCOPED);

        if (Array.isArray(scripts) && scripts.length > 0) {
            if (!isScopedScriptsAllowed(character)) {
                const checkKey = `AlertRegex_${character.avatar}`;
                if (!accountStorage.getItem(checkKey)) {
                    accountStorage.setItem(checkKey, 'true');
                    const template = await renderFeatureTemplateAsync('regex', 'embeddedScripts', {});
                    const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '');

                    if (result) {
                        allowScopedScripts(character);
                        await reloadCurrentChat();
                    }
                }
            }
        }
    }

    // Clear cache and reload scripts
    RegexProvider.instance.clear();
    await loadRegexScripts();
}

/**
 * Notify whether to reload current chat when preset is changed
 * @param {string} presetName The name of the preset
 */
function notifyReloadCurrentChat(presetName) {
    toastr.info(
        t`Reload the chat for regex to take effect` + '<br><u>' + t`Click here to reload immediately` + '</u>',
        t`Preset '${escapeHtml(presetName)}' contains enabled regex scripts`,
        {
            timeOut: 5000,
            escapeHtml: false,
            onclick: reloadCurrentChat,
        });
}

async function checkPresetEmbeddedRegexScripts() {
    const apiId = getCurrentPresetAPI();
    const name = getCurrentPresetName();
    const scripts = getScriptsByType(SCRIPT_TYPES.PRESET);

    if (Array.isArray(scripts) && scripts.length > 0) {
        if (!isPresetScriptsAllowed(apiId, name)) {
            const checkKey = `AlertRegex_${apiId}_${name}`;

            if (!accountStorage.getItem(checkKey)) {
                accountStorage.setItem(checkKey, 'true');
                const template = await renderFeatureTemplateAsync('regex', 'presetEmbeddedScripts', {});
                const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '');

                if (result) {
                    allowPresetScripts(apiId, name);
                    if (getCurrentChatId()) {
                        await reloadCurrentChat();
                    }
                }
            }
        } else if (getCurrentChatId() && scripts.filter(script => !script.disabled).length > 0) {
            notifyReloadCurrentChat(name);
        }
    }

    await loadRegexScripts();
}

async function onMainApiChanged({ apiId }) {
    const presetManager = getPresetManager(apiId);
    if (!presetManager) {
        return;
    }
    const presetName = presetManager.getSelectedPresetName();
    const presetScripts = presetManager.readPresetExtensionField({ path: 'regex_scripts' }) ?? [];
    if (getCurrentChatId() &&
        isPresetScriptsAllowed(apiId, presetName) &&
        Array.isArray(presetScripts) &&
        presetScripts.filter(script => !script.disabled).length > 0) {
        notifyReloadCurrentChat(presetName);
    }

    await loadRegexScripts();
}

function onPresetRenamed({ apiId, oldName, newName }) {
    const oldCheckKey = `AlertRegex_${apiId}_${oldName}`;
    const checkKey = `AlertRegex_${apiId}_${newName}`;
    const value = accountStorage.getItem(oldCheckKey);
    if (value) {
        accountStorage.setItem(checkKey, value);
        accountStorage.removeItem(oldCheckKey);
    }
    if (isPresetScriptsAllowed(apiId, oldName)) {
        disallowPresetScripts(apiId, oldName);
        allowPresetScripts(apiId, newName);
    }
}

// Workaround for loading in sequence with other extensions
// NOTE: Always puts extension at the top of the list, but this is fine since it's static
export async function init() {
    if (!Array.isArray(feature_settings.regex)) {
        feature_settings.regex = [];
    }

    if (!Array.isArray(feature_settings.regex_presets)) {
        feature_settings.regex_presets = [];
    }

    migrateSettings();

    const regexPanel = document.getElementById('RegexPanel');
    if (!regexPanel) {
        console.warn('Regex workspace panel host not found');
        return;
    }

    const regexSettingsHost = $(document.createElement('div'));
    $(regexPanel).append(regexSettingsHost);
    const workspacePanels = await loadWorkspacePanelsModule();
    regexListBridge.refresh();
    // Published library snapshots replace character objects. Refresh only the
    // list's future targets; operations already awaiting confirmation retain
    // their original references and still fail safely if those were replaced.
    document.addEventListener('emberdesk:character-library-snapshot', regexListBridge.refresh);
    const presetController = createRegexPresetController({
        getScriptsByType,
        getScriptsForTarget,
        captureTarget: captureRegexTarget,
        saveScriptsByType,
        featureSettings: feature_settings,
        saveSettings: saveSettingsStrict,
        afterChange: refreshRegexEffects,
        confirmUnsaved: (name) => Popup.show.confirm(`You have unsaved changes to the "${name}" preset.`, 'Do you want to save them before switching?', { okButton: t`Save Changes`, cancelButton: t`Discard Changes` }),
        confirmDelete: (name) => Popup.show.confirm(t`Are you sure you want to delete this regex preset?`, name),
        promptName: () => Popup.show.input(t`Enter a name for the new regex preset:`, ''),
        notify: toastr,
        uuid: uuidv4,
        SCRIPT_TYPES,
    });
    workspacePanels.mountRegexSettings(regexSettingsHost.get(0), { list: regexListBridge, toolbar: regexToolbar, presets: presetController, toolBindings: getToolBindingsBridge() });

    await loadRegexScripts();

    eventSource.on(event_types.MAIN_API_CHANGED, onMainApiChanged);
    eventSource.on(event_types.CHAT_CHANGED, checkCharEmbeddedRegexScripts);
    eventSource.on(event_types.CHARACTER_DELETED, purgeEmbeddedRegexScripts);
    eventSource.on(event_types.PRESET_RENAMED_BEFORE, onPresetRenamed);
    eventSource.on(event_types.PRESET_CHANGED, checkPresetEmbeddedRegexScripts);
    eventSource.on(event_types.PRESET_DELETED, purgePresetEmbeddedRegexScripts);
}

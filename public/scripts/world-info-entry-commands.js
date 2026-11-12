import { GENERATION_TYPE_TRIGGERS } from './constants.js';
import { DEFAULT_DEPTH, DEFAULT_WEIGHT, world_info_logic } from './world-info-state.js';

/** Standalone entry defaults and compatibility commands. */
export function createWorldInfoEntryCommands({ getFreeWorldEntryUid, Popup, t, escapeHtml }) {
    /**
     * Duplicate a WI entry by copying all of its properties and assigning a new uid
     * @param {*} data - The data of the book
     * @param {number} uid - The uid of the entry to copy in this book
     * @returns {*} The new WI duplicated entry
     */
    function duplicateWorldInfoEntry(data, uid) {
        if (!data || !('entries' in data) || !data.entries[uid]) {
            return;
        }

        // Exclude uid and gather the rest of the properties
        const originalData = structuredClone(data.entries[uid]);
        delete originalData.uid;

        // Create new entry and copy over data
        const entry = createWorldInfoEntry(data.name, data);
        Object.assign(entry, originalData);

        return entry;
    }

    /**
     * Deletes a WI entry, with a user confirmation dialog
     * @param {*[]} data - The data of the book
     * @param {number} uid - The uid of the entry to copy in this book
     * @param {object} [options={}] - Optional arguments
     * @param {boolean} [options.silent=false] - Whether to prompt the user for deletion or just do it
     * @returns {Promise<boolean>} Whether the entry deletion was successful
     */
    async function deleteWorldInfoEntry(data, uid, { silent = false } = {}) {
        if (!data || !('entries' in data)) {
            return;
        }

        const entry = data.entries[uid];
        if (!entry) {
            return false;
        }

        let previewText = '';
        if (entry.comment && entry.comment.trim()) {
            previewText = entry.comment.trim();
        } else if (entry.content) {
            const lines = entry.content.split(/\r?\n/).filter(line => line.trim());
            previewText = lines.slice(0, 2).join('\n');
        }

        const popupHeader = t`Delete world info entry with UID: ${uid}?`;
        const popupText = previewText
            ? `<strong>${t`Entry`}:</strong><br>${escapeHtml(previewText).replace(/\n/g, '<br>')}<br><br>${t`This action is irreversible!`}`
            : t`This action is irreversible!`;

        const confirmation = silent || await Popup.show.confirm(popupHeader, popupText);
        if (!confirmation) {
            return false;
        }

        delete data.entries[uid];
        return true;
    }

    /**
     * Definitions of types for new WI entries
     *
     * Use `newEntryTemplate` if you just need the template that contains default values
     *
     * @type {{[key: string]: WIEntryFieldDefinition}}
     */
    const newWorldInfoEntryDefinition = {
        key: { default: [], type: 'array' },
        keysecondary: { default: [], type: 'array' },
        comment: { default: '', type: 'string' },
        content: { default: '', type: 'string' },
        constant: { default: false, type: 'boolean' },
        vectorized: { default: false, type: 'boolean' },
        selective: { default: true, type: 'boolean' },
        selectiveLogic: { default: world_info_logic.AND_ANY, type: 'enum' },
        addMemo: { default: false, type: 'boolean' },
        order: { default: 100, type: 'number' },
        position: { default: 0, type: 'number' },
        disable: { default: false, type: 'boolean' },
        ignoreBudget: { default: false, type: 'boolean' },
        excludeRecursion: { default: false, type: 'boolean' },
        preventRecursion: { default: false, type: 'boolean' },
        matchCharacterDescription: { default: false, type: 'boolean' },
        matchCharacterDepthPrompt: { default: false, type: 'boolean' },
        matchScenario: { default: false, type: 'boolean' },
        matchCreatorNotes: { default: false, type: 'boolean' },
        delayUntilRecursion: { default: 0, type: 'number' },
        probability: { default: 100, type: 'number' },
        useProbability: { default: true, type: 'boolean' },
        depth: { default: DEFAULT_DEPTH, type: 'number' },
        outletName: { default: '', type: 'string' },
        group: { default: '', type: 'string' },
        groupOverride: { default: false, type: 'boolean' },
        groupWeight: { default: DEFAULT_WEIGHT, type: 'number' },
        scanDepth: { default: null, type: 'number?' },
        caseSensitive: { default: null, type: 'boolean?' },
        matchWholeWords: { default: null, type: 'boolean?' },
        useGroupScoring: { default: null, type: 'boolean?' },
        automationId: { default: '', type: 'string' },
        role: { default: 0, type: 'enum' },
        sticky: { default: null, type: 'number?' },
        cooldown: { default: null, type: 'number?' },
        delay: { default: null, type: 'number?' },
        characterFilterNames: { default: [], type: 'array', excludeFromTemplate: true },
        characterFilterTags: { default: [], type: 'array', excludeFromTemplate: true },
        characterFilterExclude: { default: false, type: 'boolean', excludeFromTemplate: true },
        triggers: { default: [], type: 'array', arrayFilter: (value) => GENERATION_TYPE_TRIGGERS.includes(value) },
    };

    const newWorldInfoEntryTemplate = Object.fromEntries(
        Object.entries(newWorldInfoEntryDefinition).filter(([_, value]) => !value.excludeFromTemplate).map(([key, value]) => [key, value.default]),
    );

    /**
     * Creates a new world info entry from template.
     * @param {string} _name Name of the WI (unused)
     * @param {any} data WI data
     * @returns {object | undefined} New entry object or undefined if failed
     */
    function createWorldInfoEntry(_name, data) {
        const newUid = getFreeWorldEntryUid(data);

        if (!Number.isInteger(newUid)) {
            console.error('Couldn\'t assign UID to a new entry');
            return;
        }

        const newEntry = { uid: newUid, ...structuredClone(newWorldInfoEntryTemplate) };
        data.entries[newUid] = newEntry;

        return newEntry;
    }
    return { duplicateWorldInfoEntry, deleteWorldInfoEntry, newWorldInfoEntryDefinition, newWorldInfoEntryTemplate, createWorldInfoEntry };
}

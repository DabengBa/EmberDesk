import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import { convertWorldInfoToCharacterBook } from './character-card-v2.js';
import { editCharacterCard } from './character-write-service.js';
import { listCanonicalCharactersBoundToWorld } from './character-store.js';
import {
    getCanonicalWorldInfoBook,
    normalizeCanonicalWorldInfoName,
    recordWorldInfoProjectionRepair,
    upsertCanonicalWorldInfoBook,
} from './world-info-store.js';
import {
    getCanonicalWorldInfoWriteState,
    writeWorldInfoProjectionFile,
} from './worldinfo.js';
import {
    openCanonicalChatForTextReplace,
    writeCanonicalChatForTextReplace,
} from './chats.js';
import { readCanonicalChatPayload } from './canonical-chat-read-service.js';

const MAX_SAMPLE_COUNT = 3;
const SAMPLE_CONTEXT_RADIUS = 40;
const SAMPLE_MARK_OPEN = '「';
const SAMPLE_MARK_CLOSE = '」';
const UNICODE_WORD_BOUNDARY_OPEN = String.raw`(?<![\p{L}\p{N}_])`;
const UNICODE_WORD_BOUNDARY_CLOSE = String.raw`(?![\p{L}\p{N}_])`;

export const CARD_FIELD_IDS = Object.freeze([
    'description',
    'scenario',
    'firstMes',
    'exampleMessages',
    'alternateGreetings',
    'systemPrompt',
    'postHistoryInstructions',
    'depthPrompt',
    'creatorNotes',
    'creator',
    'characterVersion',
    'tags',
]);

export const WORLD_FIELD_IDS = Object.freeze(['content', 'comment', 'keys']);
export const CHAT_FIELD_IDS = Object.freeze(['mes', 'reasoning']);
export const CHAT_SCOPES = Object.freeze(['off', 'current']);

// `label` carries the locale-independent field id; the client resolves the
// user-facing copy from it, so this server never ships localized text.
const CARD_FIELD_DEFS = Object.freeze({
    description: { label: 'description', paths: [['data', 'description'], ['description']] },
    scenario: { label: 'scenario', paths: [['data', 'scenario'], ['scenario']] },
    firstMes: { label: 'firstMes', paths: [['data', 'first_mes'], ['first_mes']] },
    exampleMessages: { label: 'exampleMessages', paths: [['data', 'mes_example'], ['mes_example']] },
    alternateGreetings: { label: 'alternateGreetings', paths: [['data', 'alternate_greetings']], array: true },
    systemPrompt: { label: 'systemPrompt', paths: [['data', 'system_prompt']] },
    postHistoryInstructions: { label: 'postHistoryInstructions', paths: [['data', 'post_history_instructions']] },
    depthPrompt: { label: 'depthPrompt', paths: [['data', 'extensions', 'depth_prompt', 'prompt']] },
    creatorNotes: { label: 'creatorNotes', paths: [['data', 'creator_notes'], ['creatorcomment']] },
    creator: { label: 'creator', paths: [['data', 'creator']] },
    characterVersion: { label: 'characterVersion', paths: [['data', 'character_version']] },
    tags: { label: 'tags', paths: [['data', 'tags'], ['tags']], array: true, dedupe: true },
});

const WORLD_BOOK_FIELD_MAP = Object.freeze({
    content: { label: 'content', fields: ['content'], array: false },
    comment: { label: 'comment', fields: ['comment'], array: false },
    keys: { label: 'keys', fields: ['key', 'keysecondary'], array: true },
});

const EMBEDDED_BOOK_FIELD_MAP = Object.freeze({
    content: { label: 'content', fields: ['content'], array: false },
    comment: { label: 'comment', fields: ['comment'], array: false },
    keys: { label: 'keys', fields: ['keys', 'secondary_keys'], array: true },
});

const CHAT_FIELD_DEFS = Object.freeze({
    mes: { label: 'mes' },
    reasoning: { label: 'reasoning' },
});

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles the user's find/replace into a RegExp + replacement-string pair.
 * Literal mode escapes metacharacters in the query and '$' in the replacement;
 * regex mode keeps JS `$`/`$1` semantics in the replacement.
 * @param {string} query Find text (literal or regex source)
 * @param {string} replacement Replacement text
 * @param {{caseSensitive?: boolean, wholeWord?: boolean, regex?: boolean}} options
 * @returns {{ ok: true, pattern: RegExp, replacer: string } | { ok: false, reason: string }}
 */
export function buildTextMatcher(query, replacement, options = {}) {
    const rawQuery = String(query ?? '');
    if (!rawQuery.length) {
        return { ok: false, reason: 'empty_query' };
    }

    const { caseSensitive = false, wholeWord = false, regex = false } = options;
    let source = regex ? rawQuery : escapeRegExp(rawQuery);
    if (wholeWord) {
        source = `${UNICODE_WORD_BOUNDARY_OPEN}(?:${source})${UNICODE_WORD_BOUNDARY_CLOSE}`;
    }

    let pattern;
    try {
        pattern = new RegExp(source, `gu${caseSensitive ? '' : 'i'}`);
    } catch (error) {
        return { ok: false, reason: `invalid_regex: ${String(error?.message ?? error ?? '')}` };
    }

    const replacer = regex ? String(replacement ?? '') : String(replacement ?? '').replaceAll('$', '$$$$');
    return { ok: true, pattern, replacer };
}

function buildSampleContext(text, matchIndex, matchLength) {
    const start = Math.max(0, matchIndex - SAMPLE_CONTEXT_RADIUS);
    const end = Math.min(text.length, matchIndex + matchLength + SAMPLE_CONTEXT_RADIUS);
    return {
        prefix: text.slice(start, matchIndex),
        suffix: text.slice(matchIndex + matchLength, end),
        leadingEllipsis: start > 0 ? '…' : '',
        trailingEllipsis: end < text.length ? '…' : '',
    };
}

/**
 * Replaces all matches in a single string, returning the new string plus
 * occurrence count and a few before/after context samples.
 * @param {string} value
 * @param {{ pattern: RegExp, replacer: string }} matcher
 * @param {number} [maxSamples]
 * @returns {{ value: string, occurrences: number, samples: {before: string, after: string}[] }}
 */
export function replaceInString(value, matcher, maxSamples = MAX_SAMPLE_COUNT) {
    const text = String(value ?? '');
    const matches = [...text.matchAll(matcher.pattern)];
    if (!matches.length) {
        return { value: text, occurrences: 0, samples: [] };
    }

    const singlePattern = new RegExp(matcher.pattern.source, matcher.pattern.flags.replace('g', ''));
    const samples = matches.slice(0, maxSamples).map((match) => {
        const index = match.index ?? 0;
        const context = buildSampleContext(text, index, match[0].length);
        let replacedSpan = match[0];
        try {
            replacedSpan = match[0].replace(singlePattern, matcher.replacer);
        } catch {
            // Keep the original span as the sample fallback.
        }
        return {
            before: `${context.leadingEllipsis}${context.prefix}${SAMPLE_MARK_OPEN}${match[0]}${SAMPLE_MARK_CLOSE}${context.suffix}${context.trailingEllipsis}`,
            after: `${context.leadingEllipsis}${context.prefix}${SAMPLE_MARK_OPEN}${replacedSpan}${SAMPLE_MARK_CLOSE}${context.suffix}${context.trailingEllipsis}`,
        };
    });

    return {
        value: text.replace(matcher.pattern, matcher.replacer),
        occurrences: matches.length,
        samples,
    };
}

function getAtPath(object, path) {
    let current = object;
    for (const key of path) {
        if (current == null || typeof current !== 'object') {
            return undefined;
        }
        current = current[key];
    }
    return current;
}

function setAtPath(object, path, value) {
    let current = object;
    for (let index = 0; index < path.length - 1; index++) {
        const next = current[path[index]];
        if (next == null || typeof next !== 'object') {
            return false;
        }
        current = next;
    }
    current[path[path.length - 1]] = value;
    return true;
}

function dedupeStrings(values) {
    const seen = new Set();
    return values.filter(value => {
        const key = String(value);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/**
 * Applies the matcher to the selected card fields, syncing the V1 top-level
 * mirrors with their `data.*` counterparts. Mutates the payload.
 * @returns {{ changed: boolean, matches: object[] }}
 */
export function transformCharacterCard(cardPayload, cardFields, matcher, excluded = new Set()) {
    const matches = [];
    let changed = false;

    // Exclusion and match reporting happen per logical field (the primary
    // `data.*` path). All existing V1/V2 mirrors of that field are written
    // together so the card never ends up half-replaced.
    for (const field of cardFields) {
        const def = CARD_FIELD_DEFS[field];
        if (!def) {
            continue;
        }
        const primaryFieldPath = def.paths[0].join('.');

        if (def.array) {
            const primary = getAtPath(cardPayload, def.paths[0]);
            if (!Array.isArray(primary)) {
                continue;
            }
            primary.forEach((item, index) => {
                const itemPath = `${primaryFieldPath}[${index}]`;
                if (excluded.has(itemPath)) {
                    return;
                }
                const result = replaceInString(item, matcher);
                if (!result.occurrences) {
                    return;
                }
                for (const path of def.paths) {
                    const mirror = getAtPath(cardPayload, path);
                    if (Array.isArray(mirror) && index < mirror.length) {
                        const mirrorResult = replaceInString(mirror[index], matcher);
                        if (mirrorResult.occurrences) {
                            mirror[index] = mirrorResult.value;
                        }
                    }
                }
                changed = true;
                matches.push({
                    field,
                    label: def.label,
                    path: itemPath,
                    occurrences: result.occurrences,
                    samples: result.samples,
                });
            });
            if (def.dedupe) {
                for (const path of def.paths) {
                    const mirror = getAtPath(cardPayload, path);
                    if (!Array.isArray(mirror)) {
                        continue;
                    }
                    const deduped = dedupeStrings(mirror);
                    if (deduped.length !== mirror.length) {
                        mirror.length = 0;
                        mirror.push(...deduped);
                        changed = true;
                    }
                }
            }
            continue;
        }

        if (excluded.has(primaryFieldPath)) {
            continue;
        }
        let occurrences = 0;
        let samples = [];
        let fieldChanged = false;
        for (const path of def.paths) {
            const result = replaceInString(getAtPath(cardPayload, path), matcher);
            if (!result.occurrences) {
                continue;
            }
            if (setAtPath(cardPayload, path, result.value)) {
                fieldChanged = true;
            }
            // Report the canonical data.* numbers; fall back to the mirror's
            // if the card somehow only carries the V1 field.
            if (!occurrences) {
                occurrences = result.occurrences;
                samples = result.samples;
            }
        }
        if (!fieldChanged) {
            continue;
        }
        changed = true;
        matches.push({
            field,
            label: def.label,
            path: primaryFieldPath,
            occurrences,
            samples,
        });
    }

    return { changed, matches };
}

function getEntryTitle(entry) {
    return String(entry?.comment ?? '')
        || (Array.isArray(entry?.key) ? entry.key.join(', ') : '')
        || (Array.isArray(entry?.keys) ? entry.keys.join(', ') : '')
        || '(unnamed)';
}

function transformBookEntryFields(entry, fieldMap, fieldIds, matcher, excluded, pathPrefix, matches) {
    let changed = false;
    for (const fieldId of fieldIds) {
        const def = fieldMap[fieldId];
        if (!def) {
            continue;
        }
        for (const fieldName of def.fields) {
            const value = entry?.[fieldName];
            if (def.array && Array.isArray(value)) {
                value.forEach((item, index) => {
                    const itemPath = `${pathPrefix}.${fieldName}[${index}]`;
                    if (excluded.has(itemPath)) {
                        return;
                    }
                    const result = replaceInString(item, matcher);
                    if (!result.occurrences) {
                        return;
                    }
                    value[index] = result.value;
                    changed = true;
                    matches.push({
                        field: fieldId,
                        label: def.label,
                        path: itemPath,
                        occurrences: result.occurrences,
                        samples: result.samples,
                    });
                });
                continue;
            }
            const fieldPath = `${pathPrefix}.${fieldName}`;
            if (excluded.has(fieldPath)) {
                continue;
            }
            const result = replaceInString(value, matcher);
            if (!result.occurrences) {
                continue;
            }
            entry[fieldName] = result.value;
            changed = true;
            matches.push({
                field: fieldId,
                label: def.label,
                path: fieldPath,
                occurrences: result.occurrences,
                samples: result.samples,
            });
        }
    }
    return changed;
}

/**
 * Applies the matcher to a standalone World Info book (entries object keyed
 * by uid). Mutates the entries.
 * @returns {{ changed: boolean, matches: object[] }}
 */
export function transformWorldBookEntries(entries, worldFields, matcher, excluded = new Set()) {
    const matches = [];
    let changed = false;

    for (const [entryKey, entry] of Object.entries(entries ?? {})) {
        const entryMatchesBefore = matches.length;
        const entryChanged = transformBookEntryFields(
            entry,
            WORLD_BOOK_FIELD_MAP,
            worldFields,
            matcher,
            excluded,
            `entries[${entryKey}]`,
            matches,
        );
        if (entryChanged) {
            changed = true;
            const title = getEntryTitle(entry);
            for (let index = entryMatchesBefore; index < matches.length; index++) {
                matches[index].entryUid = entryKey;
                matches[index].entryTitle = title;
            }
        }
    }

    return { changed, matches };
}

/**
 * Applies the matcher to an embedded `data.character_book` (entries array,
 * `keys`/`secondary_keys` field names). Mutates the book.
 * @returns {{ changed: boolean, matches: object[] }}
 */
export function transformEmbeddedBook(book, worldFields, matcher, excluded = new Set()) {
    const matches = [];
    let changed = false;
    const entries = Array.isArray(book?.entries) ? book.entries : [];

    entries.forEach((entry, index) => {
        const entryMatchesBefore = matches.length;
        const entryChanged = transformBookEntryFields(
            entry,
            EMBEDDED_BOOK_FIELD_MAP,
            worldFields,
            matcher,
            excluded,
            `character_book.entries[${index}]`,
            matches,
        );
        if (entryChanged) {
            changed = true;
            const title = getEntryTitle(entry);
            for (let i = entryMatchesBefore; i < matches.length; i++) {
                matches[i].entryUid = String(index);
                matches[i].entryTitle = title;
            }
        }
    });

    return { changed, matches };
}

/**
 * Applies the matcher to a canonical chat payload (header + message objects).
 * Only `mes` and `extra.reasoning` are eligible; the header line, `name`,
 * `is_*` flags, and `send_date` stay untouched. Mutates the payload.
 * @returns {{ changed: boolean, matches: object[] }}
 */
export function transformChatMessages(chatPayload, chatFields, matcher, excluded = new Set()) {
    const matches = [];
    let changed = false;

    for (let index = 1; index < chatPayload.length; index++) {
        const message = chatPayload[index];
        if (!message || typeof message !== 'object') {
            continue;
        }
        const role = message.is_user ? 'user' : message.is_system ? 'system' : 'assistant';

        for (const field of chatFields) {
            const def = CHAT_FIELD_DEFS[field];
            if (!def) {
                continue;
            }
            const path = field === 'mes' ? ['mes'] : ['extra', 'reasoning'];
            const fieldPath = `chats[${index}].${path.join('.')}`;
            if (excluded.has(fieldPath)) {
                continue;
            }
            const current = field === 'mes' ? message.mes : message.extra?.reasoning;
            const result = replaceInString(current, matcher);
            if (!result.occurrences) {
                continue;
            }
            if (field === 'mes') {
                message.mes = result.value;
            } else if (message.extra && typeof message.extra === 'object') {
                message.extra.reasoning = result.value;
            } else {
                continue;
            }
            changed = true;
            matches.push({
                field,
                label: def.label,
                path: fieldPath,
                index: index - 1,
                role,
                name: String(message.name ?? ''),
                occurrences: result.occurrences,
                samples: result.samples,
            });
        }
    }

    return { changed, matches };
}

function normalizeFieldSelection(requested, allowed, fallback) {
    if (!Array.isArray(requested)) {
        return [...fallback];
    }
    const allowedSet = new Set(allowed);
    return requested.filter(field => allowedSet.has(field));
}

function clonePayload(value) {
    return structuredClone(value);
}

function getBoundWorldName(cardPayload) {
    return String(cardPayload?.data?.extensions?.world ?? cardPayload?.world ?? '').trim();
}

function getInternalName(avatarFilename) {
    return String(avatarFilename ?? '').replace(/\.png$/i, '');
}

function getRequestHandle(request) {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

function errorResult(status, reason, extras = {}) {
    return { ok: false, status, reason, ...extras };
}

/**
 * Runs preview or apply for the character-card text replace feature.
 *
 * Apply order is deliberate: world book first (bound books are shared and the
 * card's embedded snapshot must be refreshed from the NEW book), then the card
 * itself (field writes + snapshot backfill), then the current chat session.
 * `editCharacterCard` is used instead of direct SQL so canonical commit, PNG
 * projection, ledger, and repair bookkeeping all run through the existing path.
 *
 * @param {object} options
 * @param {import('express').Request} options.request
 * @param {boolean} options.apply
 * @param {object} options.dependencies Injected for tests
 * @returns {Promise<object>} Structured result; `ok:false` carries `status`/`reason`
 */
export async function runCharacterTextReplace({ request, apply = false, dependencies = {} }) {
    const deps = {
        getCanonicalCharacterCardJson: dependencies.getCanonicalCharacterCardJson,
        getCharacterWriteDependencies: dependencies.getCharacterWriteDependencies,
        getWorldInfoWriteState: dependencies.getWorldInfoWriteState ?? getCanonicalWorldInfoWriteState,
        writeWorldInfoProjection: dependencies.writeWorldInfoProjection ?? writeWorldInfoProjectionFile,
        getCanonicalWorldInfoBook: dependencies.getCanonicalWorldInfoBook ?? getCanonicalWorldInfoBook,
        upsertCanonicalWorldInfoBook: dependencies.upsertCanonicalWorldInfoBook ?? upsertCanonicalWorldInfoBook,
        listCanonicalCharactersBoundToWorld: dependencies.listCanonicalCharactersBoundToWorld ?? listCanonicalCharactersBoundToWorld,
        convertWorldInfoToCharacterBook: dependencies.convertWorldInfoToCharacterBook ?? convertWorldInfoToCharacterBook,
        recordWorldInfoProjectionRepair: dependencies.recordWorldInfoProjectionRepair ?? recordWorldInfoProjectionRepair,
        getCharacterFeatureFlags: dependencies.getCharacterFeatureFlags ?? (() => getCanonicalStorageSlice('characters').getFeatureFlags()),
        openChatSession: dependencies.openChatSession ?? openCanonicalChatForTextReplace,
        writeChatSession: dependencies.writeChatSession ?? writeCanonicalChatForTextReplace,
        readCanonicalChatPayload: dependencies.readCanonicalChatPayload ?? readCanonicalChatPayload,
        editCharacterCard: dependencies.editCharacterCard ?? editCharacterCard,
    };

    const body = request.body ?? {};
    const avatarUrl = String(body.avatar_url ?? '');
    if (!avatarUrl) {
        return errorResult(400, 'missing_avatar_url');
    }

    const matcherResult = buildTextMatcher(body.query, body.replacement, body.options ?? {});
    if (!matcherResult.ok) {
        return errorResult(400, matcherResult.reason);
    }
    const matcher = matcherResult;

    const areas = {
        card: body?.areas?.card === true,
        worldBook: body?.areas?.worldBook === true,
        chats: body?.areas?.chats === 'current' ? 'current' : 'off',
    };
    if (!areas.card && !areas.worldBook && areas.chats === 'off') {
        return errorResult(400, 'no_areas_selected');
    }

    const cardFields = normalizeFieldSelection(body.cardFields, CARD_FIELD_IDS, CARD_FIELD_IDS);
    const worldFields = normalizeFieldSelection(body.worldFields, WORLD_FIELD_IDS, WORLD_FIELD_IDS);
    const chatFields = normalizeFieldSelection(body.chatFields, CHAT_FIELD_IDS, CHAT_FIELD_IDS);
    const excluded = new Set(Array.isArray(body.excluded) ? body.excluded.map(String) : []);
    const chatFileName = String(body.chatFileName ?? '');
    if (areas.chats === 'current' && !chatFileName) {
        return errorResult(400, 'missing_chat_file_name');
    }

    const directories = request.user.directories;
    const handle = getRequestHandle(request);
    const internalName = getInternalName(avatarUrl);

    // ---- Preflight: every requested area's authority must be reachable ----
    const cardJson = await deps.getCanonicalCharacterCardJson(handle, directories, avatarUrl);
    const cardMissing = cardJson == null;
    if (cardMissing && (areas.card || areas.worldBook)) {
        const flags = deps.getCharacterFeatureFlags();
        return errorResult(flags?.enabled ? 404 : 503, flags?.enabled ? 'character_not_found' : 'canonical_storage_disabled');
    }

    const cardPayload = cardJson != null ? JSON.parse(cardJson) : null;
    const boundWorldName = cardPayload ? getBoundWorldName(cardPayload) : '';
    const normalizedWorldName = normalizeCanonicalWorldInfoName(boundWorldName);
    const embeddedBook = cardPayload?.data?.character_book;
    const hasEmbeddedBook = Array.isArray(embeddedBook?.entries) && embeddedBook.entries.length > 0;

    let worldInfoState = null;
    if (areas.worldBook && boundWorldName) {
        worldInfoState = await deps.getWorldInfoWriteState(request);
        if (!worldInfoState?.ok) {
            return errorResult(503, 'canonical_world_info_unavailable', { detail: worldInfoState?.reason ?? null });
        }
    }

    let chatSession = null;
    if (areas.chats === 'current') {
        chatSession = await deps.openChatSession(request, { ownerId: internalName, chatFileName });
        if (!chatSession?.ok) {
            return errorResult(503, 'canonical_chat_unavailable', { detail: chatSession?.reason ?? null });
        }
    }

    // ---- Transform: always computed on fresh canonical data ----
    const result = {
        ok: true,
        applied: { card: false, worldBook: false, chat: false },
        areas: {
            card: { status: 'skipped', matches: [], occurrences: 0 },
            worldBook: { status: 'skipped', name: boundWorldName || null, matches: [], occurrences: 0 },
            chats: { status: 'skipped', fileName: chatFileName || null, matches: [], occurrences: 0 },
        },
        totals: { occurrences: 0, changedTargets: 0 },
        warnings: [],
    };

    // ---- Area 1: bound World Info book ----
    let refreshedCharacterBook = null;
    if (areas.worldBook && boundWorldName && worldInfoState?.ok) {
        const book = deps.getCanonicalWorldInfoBook(worldInfoState.db, normalizedWorldName);
        if (!book) {
            result.areas.worldBook = { status: 'missing', name: boundWorldName, matches: [], occurrences: 0 };
        } else {
            const bookPayload = clonePayload(book);
            const { changed, matches } = transformWorldBookEntries(bookPayload.entries, worldFields, matcher, excluded);
            result.areas.worldBook = {
                status: changed ? (apply ? 'applied' : 'preview') : 'unchanged',
                name: boundWorldName,
                boundCharacterCount: deps.listCanonicalCharactersBoundToWorld(worldInfoState.db, normalizedWorldName).length,
                matches,
                occurrences: matches.reduce((sum, item) => sum + item.occurrences, 0),
            };
            if (changed) {
                result.totals.occurrences += result.areas.worldBook.occurrences;
                result.totals.changedTargets += 1;
            }
            if (apply && changed) {
                deps.upsertCanonicalWorldInfoBook(worldInfoState.db, {
                    name: normalizedWorldName,
                    payload: bookPayload,
                    nowMs: Date.now(),
                });
                // Canonical commit already happened — a projection failure is a
                // durable repair, not a reason to un-apply the book.
                result.applied.worldBook = true;
                try {
                    deps.writeWorldInfoProjection(directories, normalizedWorldName, bookPayload, worldInfoState.db);
                } catch (error) {
                    const repairKey = `world_info:${normalizedWorldName}:text-replace`;
                    deps.recordWorldInfoProjectionRepair(worldInfoState.db, {
                        repairKey,
                        worldName: normalizedWorldName,
                        reason: 'projection_failed',
                        details: { operation: 'text-replace' },
                    });
                    result.areas.worldBook.projectionFailed = true;
                    result.areas.worldBook.repairKey = repairKey;
                    result.warnings.push({ code: 'world_book_projection_failed', name: normalizedWorldName });
                }
            }
            // The card's embedded snapshot must reflect the post-replace book —
            // read it back from the same db so preview and apply agree.
            if (apply && changed) {
                const persisted = deps.getCanonicalWorldInfoBook(worldInfoState.db, normalizedWorldName) ?? bookPayload;
                refreshedCharacterBook = persisted.originalData
                    ?? (persisted.entries ? deps.convertWorldInfoToCharacterBook(normalizedWorldName, persisted.entries) : null);
            } else if (changed) {
                refreshedCharacterBook = bookPayload.originalData
                    ?? (bookPayload.entries ? deps.convertWorldInfoToCharacterBook(normalizedWorldName, bookPayload.entries) : null);
            }
        }
    }

    // ---- Area 2: the character card ----
    let cardChangedByFields = false;
    if (areas.card && cardPayload) {
        const { changed, matches } = transformCharacterCard(cardPayload, cardFields, matcher, excluded);
        cardChangedByFields = changed;
        result.areas.card = {
            status: changed ? (apply ? 'applied' : 'preview') : 'unchanged',
            matches,
            occurrences: matches.reduce((sum, item) => sum + item.occurrences, 0),
        };
        if (changed) {
            result.totals.occurrences += result.areas.card.occurrences;
        }
    }

    let embeddedBookChanged = false;
    if (areas.worldBook && !boundWorldName && hasEmbeddedBook) {
        const embeddedMatches = transformEmbeddedBook(embeddedBook, worldFields, matcher, excluded);
        embeddedBookChanged = embeddedMatches.changed;
        result.areas.worldBook = {
            status: embeddedBookChanged ? (apply ? 'applied' : 'preview') : 'unchanged',
            name: null,
            embedded: true,
            matches: embeddedMatches.matches,
            occurrences: embeddedMatches.matches.reduce((sum, item) => sum + item.occurrences, 0),
        };
        if (embeddedBookChanged) {
            result.totals.occurrences += result.areas.worldBook.occurrences;
        }
    } else if (areas.worldBook && !boundWorldName && !hasEmbeddedBook) {
        result.areas.worldBook = { status: 'unbound', name: null, matches: [], occurrences: 0 };
    }

    // Backfill the embedded snapshot whenever a bound book changed (or the
    // stored copy is simply stale) — even when card fields were not selected.
    const snapshotNeedsRefresh = refreshedCharacterBook != null
        && JSON.stringify(cardPayload?.data?.character_book ?? null) !== JSON.stringify(refreshedCharacterBook);
    if (snapshotNeedsRefresh && cardPayload?.data && typeof cardPayload.data === 'object') {
        cardPayload.data.character_book = refreshedCharacterBook;
    }

    const cardHasChanges = cardChangedByFields || embeddedBookChanged || snapshotNeedsRefresh;
    if (cardHasChanges && cardChangedByFields === false) {
        result.areas.card.status = 'refresh';
        result.areas.card.snapshotRefreshed = true;
    }
    if (cardHasChanges) {
        result.totals.changedTargets += 1;
    }

    const cardNeedsWrite = cardHasChanges;

    if (apply && cardNeedsWrite && cardPayload) {
        const writeResult = await deps.editCharacterCard({
            request,
            avatarUrl,
            targetFile: internalName,
            characterData: JSON.stringify(cardPayload),
            dependencies: deps.getCharacterWriteDependencies(),
        });
        if (writeResult?.ok) {
            result.applied.card = true;
        } else {
            result.areas.card.status = 'failed';
            result.areas.card.reason = writeResult?.reason ?? 'write_failed';
            result.warnings.push({ code: 'card_write_failed', reason: result.areas.card.reason });
        }
    }

    // ---- Area 3: the current chat session ----
    if (areas.chats === 'current' && chatSession?.ok) {
        const payload = deps.readCanonicalChatPayload(chatSession.db, chatSession.locator);
        if (payload == null) {
            result.areas.chats = { status: 'missing', fileName: chatFileName, matches: [], occurrences: 0 };
            result.warnings.push({ code: 'chat_session_missing', fileName: chatFileName });
        } else {
            const chatPayload = clonePayload(payload);
            const { changed, matches } = transformChatMessages(chatPayload, chatFields, matcher, excluded);
            result.areas.chats = {
                status: changed ? (apply ? 'applied' : 'preview') : 'unchanged',
                fileName: chatFileName,
                matches,
                occurrences: matches.reduce((sum, item) => sum + item.occurrences, 0),
            };
            if (changed) {
                result.totals.occurrences += result.areas.chats.occurrences;
                result.totals.changedTargets += 1;
            }
            if (apply && changed) {
                const writeResult = deps.writeChatSession(request, {
                    db: chatSession.db,
                    locator: chatSession.locator,
                    filePath: chatSession.filePath,
                    cardName: chatSession.cardName,
                    avatarUrl,
                    payload: chatPayload,
                });
                if (writeResult?.ok) {
                    result.applied.chat = true;
                } else {
                    result.areas.chats.status = 'failed';
                    result.areas.chats.reason = writeResult?.reason ?? 'write_failed';
                    result.warnings.push({ code: 'chat_write_failed', reason: result.areas.chats.reason, repairKey: writeResult?.repairKey ?? null });
                }
            }
        }
    }

    if (result.areas.worldBook.boundCharacterCount > 1) {
        result.warnings.push({
            code: 'shared_world_book',
            name: boundWorldName,
            characters: result.areas.worldBook.boundCharacterCount,
        });
    }

    return result;
}

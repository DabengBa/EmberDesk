import { parseRegexFromString } from '../../public/scripts/world-info-keywords.js';
import { escapeRegex } from '../../public/scripts/util/primitives.js';

import { array, record, string, worldInfoSettings, type RecordView, type ServerPromptSnapshot } from './snapshot.ts';

export type Role = 'system' | 'user' | 'assistant';
export const roleAt = (value: unknown): Role => value === 1 || value === 'user' ? 'user' : value === 2 || value === 'assistant' ? 'assistant' : 'system';
export type Injection = { role: Role; content: string; depth: number; order: number };
export type WorldInfoActivation = RecordView & { world: string; uid: string | number; content?: string };

export function scanWorldInfo(snapshot: ServerPromptSnapshot, newest: string[], substitute: (value: string) => string, regex: (value: string, placement: number, depth?: number) => string, runtime: {
    scanPrompts?: readonly string[]; forceWorldInfo?: readonly WorldInfoActivation[];
}) {
    const avatar = string(snapshot.character.avatar);
    const filename = avatar.replace(/\.[^/.]+$/, '');
    const tags = record(snapshot.settings.tag_map)[avatar];
    const card = record(snapshot.character.data);
    const extensions = record(card.extensions);
    const metadata = record(record(snapshot.chat[0]).chat_metadata);
    const scanDepth = worldInfoSettings(snapshot.settings).world_info_depth ?? 2;
    const fields = [
        ['matchCharacterDescription', snapshot.character.description ?? card.description],
        ['matchCharacterDepthPrompt', record(extensions.depth_prompt).prompt],
        ['matchScenario', metadata.scenario || snapshot.character.scenario || card.scenario],
        ['matchCreatorNotes', card.creator_notes],
    ] as const;
    const sorted = (entries: RecordView[]) => entries.sort((a, b) => Number(b.order) - Number(a.order));
    const flattened = (scope: 'chat' | 'other') => sorted(snapshot.books
        .filter(book => (book.scope === 'chat') === (scope === 'chat'))
        .flatMap(book => book.entries.map(entry => ({ ...entry, world: book.name }))));
    const active: RecordView[] = [];
    const seen = new Set<string>();
    const forced = new Map(runtime.forceWorldInfo?.map(entry => [`${entry.world}.${entry.uid}`, entry]));
    for (const entry of [...flattened('chat'), ...flattened('other')]) {
        const id = `${entry.world}.${entry.uid}`;
        if (entry.disable || seen.has(id)) continue;
        const filter = record(entry.characterFilter);
        const names = array(filter.names);
        const selectedTags = array(filter.tags);
        if (names.length && names.includes(filename) === Boolean(filter.isExclude)) continue;
        if (selectedTags.length && Array.isArray(tags) && tags.some(tag => selectedTags.includes(tag)) === Boolean(filter.isExclude)) continue;

        let content = string(entry.content);
        const decorators = new Set<string>();
        if (content.startsWith('@@')) {
            const lines = content.split('\n');
            let fallback = false;
            for (const [index, line] of lines.entries()) {
                if (!line.startsWith('@@')) {
                    content = lines.slice(index).join('\n');
                    break;
                }
                const escaped = line.startsWith('@@@');
                if (escaped && !fallback) continue;
                const decorator = escaped ? line.slice(1) : line;
                fallback = !['@@activate', '@@dont_activate'].some(value => decorator.startsWith(value));
                if (!fallback) decorators.add(decorator);
            }
        }
        let candidate: RecordView = { ...entry, content };
        if (!decorators.has('@@activate')) {
            if (decorators.has('@@dont_activate')) continue;
            const activation = forced.get(id);
            if (activation?.content !== undefined) candidate = { ...activation, content: activation.content };
            if (!entry.constant && !activation) {
                const depth = Math.min(1000, Number(entry.scanDepth ?? scanDepth));
                if (depth <= 0) continue;
                const parts = newest.slice(0, depth).map(text => text.trim());
                for (const [flag, value] of fields) if (entry[flag] && value) parts.push(substitute(string(value).trim()));
                parts.push(...(runtime.scanPrompts ?? []));
                const text = '\x01' + parts.join('\n\x01');
                const match = array(entry.key).some(value => {
                    const expanded = substitute(string(value));
                    const key = expanded.trim();
                    if (!key) return false;
                    const needleRegex = parseRegexFromString(key);
                    if (needleRegex) return needleRegex.test(text);
                    const [haystack, needle] = entry.caseSensitive ? [text, key] : [text.toLowerCase(), key.toLowerCase()];
                    return (entry.matchWholeWords ?? true) && !/\s/.test(needle)
                        ? new RegExp(`(?:^|\\W)(${escapeRegex(needle)})(?:$|\\W)`).test(haystack)
                        : haystack.includes(needle);
                });
                if (!match) continue;
            }
        }
        if (candidate.useProbability && candidate.probability !== 100 && !(Math.random() * 100 <= Number(candidate.probability))) continue;
        seen.add(id);
        active.push(candidate);
    }

    const before: string[] = [];
    const after: string[] = [];
    const injections: Injection[] = [];
    for (const entry of sorted(active).reverse()) {
        const position = Number(entry.position);
        const depth = Number(entry.depth ?? 4);
        const content = regex(substitute(string(entry.content)), 5, position === 4 ? depth : undefined);
        if (!content) continue;
        if (position === 4) injections.push({ content, depth, role: roleAt(entry.role), order: 100 });
        else (position === 1 || position === 3 || position === 6 ? after : before).push(content);
    }
    return { text: [...before, ...after].join('\n'), injections };
}

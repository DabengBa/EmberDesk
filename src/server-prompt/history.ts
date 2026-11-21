import { createHash } from 'node:crypto';
import { imageSize } from 'image-size';

import { isAudioInliningSupportedForSettings, isImageInliningSupportedForSettings } from '../../public/scripts/openai-provider-capabilities.js';
import { array, record, ServerPromptError, string, type RecordView } from './snapshot.ts';
import type { Role } from './world-info.ts';

type MediaPart = { type: 'image_url'; image_url: { url: string; detail: string } } | { type: 'audio_url'; audio_url: { url: string } };
type ToolCall = { id: string; type: 'function'; function: { arguments: string; name: string } };
export type ServerPromptMessage = { role: Role; content: string | ({ type: 'text'; text: string } | MediaPart)[]; name?: string }
    | { role: 'assistant'; tool_calls: ToolCall[] }
    | { role: 'tool'; content: string; tool_call_id: string };
export type MediaResolver = (attachment: { url: string; type: 'image' | 'audio' }, detail: string) => Promise<{ dataUrl: string; tokens?: number } | null>;
type HistoryRow = { row: RecordView; role: Role; text: string; prose: string; name?: string; sourceKey: string; summaryTurns: string[] };
type HistoryGroup = { messages: ServerPromptMessage[]; prose?: string };

export function stripPipelineMarkup(content: string, invocations: RecordView[]) {
    if (!invocations.length) return content;
    for (const [index, invocation] of invocations.entries()) {
        const name = string(record(invocation.pipeline).tool ?? invocation.name);
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) continue;
        content = index === invocations.length - 1
            ? content.replace(new RegExp(`&lt;/?${name}&gt;|</?${name}>`, 'g'), '')
            : content.replace(new RegExp(`&lt;${name}&gt;[\\s\\S]*?&lt;/${name}&gt;|<${name}>[\\s\\S]*?</${name}>`, 'g'), '');
    }
    return content.replace(/<div data-respond-options[^>]*>[\s\S]*?<\/div><\/div>/g, '')
        .replace(/^\s*<section data-pipeline-card\b[\s\S]*?<\/section>\s*/, '')
        .replace(/\s*<section data-pipeline-card\b[\s\S]*$/, '');
}

function mediaTokens(dataUrl: string, type: 'image' | 'audio', detail: string) {
    if (type === 'audio') return 9600; // Browser fallback when duration is unavailable.
    if (detail === 'low') return 85;
    try {
        const { width, height } = imageSize(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
        if (detail === 'auto' && width <= 512 && height <= 512) return 85;
        const scale = 768 / Math.min(width, height);
        return Math.ceil(Math.round(width * scale) / 512) * Math.ceil(Math.round(height * scale) / 512) * 170 + 85;
    } catch { return 85; }
}

function replay(calls: ToolCall[], results: string[]): ServerPromptMessage[] {
    return [{ role: 'assistant', tool_calls: calls }, ...calls.map((call, index) => ({ role: 'tool' as const, tool_call_id: call.id, content: results[index] }))];
}

export function createStoryProjection(usedIds: Set<string>) {
    const ids = new Map<string, string>();
    return (key: string, tool: string, content: string, kind?: Role, name?: string) => {
        let id = ids.get(key);
        if (!id) {
            // Source keys can exceed upstream wire ID limits.
            const baseId = `story_${createHash('sha256').update(key).digest('base64url').slice(0, 24)}`;
            id = baseId;
            for (let suffix = 1; usedIds.has(id); suffix++) id = `${baseId}_${suffix}`;
            usedIds.add(id);
            ids.set(key, id);
        }
        return { id, messages: replay([{ id, type: 'function', function: { name: tool, arguments: JSON.stringify({ kind, content, ...(name ? { name } : {}) }) } }], ['OK']) };
    };
}

/** Keep every call/result pair in the same history budget group. */
export async function projectHistory(history: HistoryRow[], options: {
    settings: RecordView; model: string; tools: boolean; pipelineHistory: boolean; activeRunId?: string; resolveMedia?: MediaResolver;
}) {
    const mediaCosts = new Map<ServerPromptMessage, number>();
    const { settings, model, tools, pipelineHistory, activeRunId, resolveMedia } = options;
    const capabilities = { media_inlining: settings.media_inlining ?? true, chat_completion_source: 'openai', openai_model: model };
    const inlineImage = isImageInliningSupportedForSettings(capabilities);
    const inlineAudio = isAudioInliningSupportedForSettings(capabilities);
    const detail = string(settings.inline_image_quality) || 'auto';
    const invocations = history.map(({ row }) => array(record(row.extra).tool_invocations).map(record));
    const usedIds = new Set(invocations.flatMap(calls => calls.map(call => string(call.id))));
    const project = createStoryProjection(usedIds);
    const input = ({} as { callId?: string });
    let currentUser = -1;
    for (const [index, { role, row }] of history.entries()) {
        if (role === 'user' && !row.is_system && !record(row.extra).chatMemorySummary) currentUser = index;
    }
    const groups = await Promise.all(history.map(async ({ row, role, text, prose, name, sourceKey, summaryTurns }, index): Promise<HistoryGroup> => {
        const extra = record(row.extra);
        const calls = invocations[index];
        const purePipeline = calls.length > 0 && calls.every(call => call.pipeline);
        const settled = purePipeline && !(activeRunId && calls.some(call => record(call.pipeline).runId === activeRunId));
        if (settled && (!text.trim() || pipelineHistory && row.is_system)) return { messages: [] };
        const message = { role, content: text, ...(name ? { name } : {}) };
        const story = (messages: ServerPromptMessage[] = []): HistoryGroup => {
            if (currentUser < 0 || index < currentUser) {
                const chunks = summaryTurns.length ? summaryTurns : [prose];
                return { messages, prose: chunks.filter(chunk => chunk.trim()).join('\n\n') };
            }
            const isInput = index === currentUser;
            const entry = project(`message:${sourceKey}`, isInput ? 'story_continuation_input' : 'submit_story', text, role, name);
            if (isInput) input.callId = entry.id;
            return { messages: [...messages, ...entry.messages] };
        };
        if (calls.length && !settled && tools) {
            const structured = calls.filter(call => string(call.id) && string(call.name));
            if (structured.length) {
                const messages = replay(structured.map(call => ({ id: string(call.id), type: 'function', function: { name: string(call.name), arguments: string(call.parameters) } })),
                    structured.map(call => string(call.result) || '[No content]'));
                if (role === 'assistant' && !row.is_system && text.trim()) {
                    if (pipelineHistory) return story(messages);
                    messages.push({ role, content: text.trim() });
                }
                return { messages };
            }
        }
        if (row.is_system && extra.type !== 'narrator') return { messages: [] };
        const media = array(extra.media);

        const mediaIndex = Number(extra.media_index);
        const selection = extra.media_display === 'gallery' ? [media[mediaIndex] ?? media[0]] : media;
        const parts: MediaPart[] = [];
        let cost = 0;
        for (const entry of selection.map(record)) {
            const url = string(entry.url);
            const type = entry.type || 'image';
            if (!url || !(type === 'image' && inlineImage || type === 'audio' && inlineAudio)) continue;
            if (!url.startsWith(`data:${type}/`) && !resolveMedia) throw new ServerPromptError('invalid_config', 'Chat media projection requires a server media resolver');
            const resolved = url.startsWith(`data:${type}/`) ? { dataUrl: url } : await resolveMedia?.({ url, type }, detail);
            if (!resolved?.dataUrl.startsWith(`data:${type}/`)) continue;
            const { dataUrl } = resolved;
            parts.push(type === 'image' ? { type: 'image_url', image_url: { url: dataUrl, detail } } : { type: 'audio_url', audio_url: { url: dataUrl } });
            cost += resolved.tokens ?? mediaTokens(dataUrl, type, detail);
        }
        if (!parts.length) return pipelineHistory ? story() : { messages: [message] };
        const inlined: ServerPromptMessage = { ...message, content: [{ type: 'text', text }, ...parts] };
        mediaCosts.set(inlined, cost);
        return { messages: [inlined] };
    }));
    return { groups, currentUser, currentInput: currentUser < 0 ? undefined : input.callId ?? null, mediaCosts, project };
}

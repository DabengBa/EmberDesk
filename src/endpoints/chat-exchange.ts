import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { PassThrough } from 'node:stream';
import { ZipArchive } from 'archiver';
import yauzl from 'yauzl';
import { extractFilesFromZipBuffer } from '../archive-utils.ts';
import { ensureCanonicalSliceBackend } from '../canonical-backend.ts';
import type { UserDirectoryList } from '../user-types.ts';
import { validateAssetFileName } from './assets.ts';
import { getCanonicalChatSession } from './canonical-chat-store.ts';
import { parseCanonicalChatJsonl } from './canonical-chat-write-service.ts';
import { readManagedMediaContent } from './canonical-managed-media-read-service.ts';
import { writeCanonicalManagedMedia } from './canonical-managed-media-write-service.ts';

// The shared ZIP reader buffers extracted entries. Bound both archive input
// and uncompressed size before using it, including for compressed uploads.
export const MAX_CHAT_EXCHANGE_BYTES = 128 * 1024 * 1024;
const MAX_ATTACHMENTS = 4096;
const MANIFEST = 'manifest.json';
const HISTORY = 'chat.jsonl';
const entryName = (index: number) => `attachments/${index}`;
type Location = [number, ...(string | number)[]];
type Attachment = { source: string; locations: Location[] };

function attachmentField(payload: unknown[], location: unknown, source: string): { parent: Record<string | number, unknown>; key: string | number } {
    if (!Array.isArray(location) || location.length < 2 || !Number.isSafeInteger(location[0])
        || location[0] < 0 || location[0] >= payload.length - 1 || location[1] === 'mes') {
        throw new Error('invalid_chat_exchange_location');
    }
    let node = payload[location[0] + 1];
    for (const [index, key] of location.slice(1).entries()) {
        if (typeof node !== 'object' || node === null
            || (Array.isArray(node) ? !Number.isSafeInteger(key) : typeof key !== 'string')
            || !Object.hasOwn(node, key)) {
            throw new Error('invalid_chat_exchange_location');
        }
        // An own property with a validated string/index key on parsed JSON.
        const parent = node as Record<string | number, unknown>;
        if (index === location.length - 2 && parent[key] === source) return { parent, key };
        node = parent[key];
    }
    throw new Error('invalid_chat_exchange_location');
}

export async function exportChatExchange(db: DatabaseSync, directories: UserDirectoryList, locator: Parameters<typeof getCanonicalChatSession>[1], jsonl: string) {
    const session = getCanonicalChatSession(db, locator);
    if (!session) throw new Error('missing_chat_session');
    const payload: unknown[] = parseCanonicalChatJsonl(jsonl);
    const rows = db.prepare(`
        SELECT message.message_order, ref.compatibility_json, media.compatibility_path, blob.size_bytes
        FROM chat_attachment_refs AS ref
        JOIN chat_messages AS message ON message.id = ref.message_id
        JOIN managed_blobs AS blob ON blob.id = ref.blob_id
        LEFT JOIN media_references AS media ON media.blob_id = ref.blob_id
            AND media.compatibility_path = ltrim(json_extract(ref.compatibility_json, '$.path'), '/')
            AND media.deleted_at_ms IS NULL
        WHERE message.session_id = ? AND ref.role = 'attachment'
        ORDER BY message.message_order, ref.compatibility_json
    `).all(session.id);
    const byPath = new Map<string, { attachment: Attachment; contents: Buffer }>();
    let size = Buffer.byteLength(jsonl);
    for (const row of rows) {
        const { path: source, fieldPath } = JSON.parse(String(row.compatibility_json));
        // A plain-text mention is not a transferable attachment.
        if (Array.isArray(fieldPath) && fieldPath[0] === 'mes') continue;
        if (typeof source !== 'string' || typeof row.compatibility_path !== 'string' || !Array.isArray(fieldPath)) {
            throw new Error('missing_chat_exchange_reference');
        }
        const location: Location = [Number(row.message_order), ...fieldPath];
        attachmentField(payload, location, source);
        const existing = byPath.get(source);
        if (existing) {
            existing.attachment.locations.push(location);
            continue;
        }
        if (byPath.size >= MAX_ATTACHMENTS || size + Number(row.size_bytes) > MAX_CHAT_EXCHANGE_BYTES) {
            throw new Error('chat_exchange_too_large');
        }
        const media = readManagedMediaContent(db, directories, row.compatibility_path);
        if (!media.ok || !media.contents) throw new Error('missing_chat_exchange_content');
        size += media.contents.length;
        byPath.set(source, { attachment: { source, locations: [location] }, contents: media.contents });
    }
    const entries = [...byPath.values()];
    const manifest = JSON.stringify({ version: 1, attachments: entries.map(entry => entry.attachment) });
    if (size + Buffer.byteLength(manifest) > MAX_CHAT_EXCHANGE_BYTES) throw new Error('chat_exchange_too_large');

    const archive = new ZipArchive();
    const output = new PassThrough();
    archive.on('error', error => output.destroy(error));
    archive.pipe(output);
    archive.append(jsonl, { name: HISTORY });
    archive.append(manifest, { name: MANIFEST });
    entries.forEach(({ contents }, index) => archive.append(contents, { name: entryName(index) }));
    const chunks: Buffer[] = [];
    await Promise.all([archive.finalize(), (async () => {
        for await (const chunk of output) chunks.push(chunk);
    })()]);
    const data = Buffer.concat(chunks);
    if (data.length > MAX_CHAT_EXCHANGE_BYTES) throw new Error('chat_exchange_too_large');
    return data;
}

function inspectArchive(data: Buffer): Promise<Set<string>> {
    return new Promise((resolve, reject) => {
        yauzl.fromBuffer(data, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
            if (error || !zip) return reject(new Error('invalid_chat_exchange_zip'));
            if (zip.entryCount > MAX_ATTACHMENTS + 2) {
                zip.close();
                return reject(new Error('chat_exchange_too_large'));
            }
            const names = new Set<string>();
            let total = 0;
            zip.on('error', reject);
            zip.on('end', () => resolve(names));
            zip.on('entry', entry => {
                const name = entry.fileName;
                total += entry.uncompressedSize;
                if (total > MAX_CHAT_EXCHANGE_BYTES || names.has(name)
                    || (name !== HISTORY && name !== MANIFEST && !/^attachments\/(0|[1-9][0-9]{0,3})$/.test(name))) {
                    zip.close();
                    reject(new Error('invalid_chat_exchange_entry'));
                    return;
                }
                names.add(name);
                zip.readEntry();
            });
            zip.readEntry();
        });
    });
}

export async function readChatExchange(data: Buffer) {
    const names = await inspectArchive(data);
    if (!names.has(MANIFEST) || !names.has(HISTORY)) throw new Error('missing_chat_exchange_entries');
    const files = await extractFilesFromZipBuffer(Uint8Array.from(data).buffer, [...names]);
    const manifestFile = files.get(MANIFEST);
    const historyFile = files.get(HISTORY);
    if (files.size !== names.size || !manifestFile || !historyFile) throw new Error('missing_chat_exchange_entries');
    const manifest = JSON.parse(manifestFile.toString('utf8'));
    if (manifest?.version !== 1 || !Array.isArray(manifest.attachments) || manifest.attachments.length !== names.size - 2) {
        throw new Error('invalid_chat_exchange_manifest');
    }
    const jsonl = historyFile.toString('utf8');
    const payload: unknown[] = parseCanonicalChatJsonl(jsonl);
    const seen = new Set<string>();
    const attachments = (manifest.attachments as unknown[]).map((entry, index) => {
        if (typeof entry !== 'object' || !entry || !('source' in entry) || typeof entry.source !== 'string'
            || !('locations' in entry) || !Array.isArray(entry.locations) || !entry.locations.length) {
            throw new Error('invalid_chat_exchange_attachment');
        }
        const contents = files.get(entryName(index));
        if (!contents) throw new Error('missing_chat_exchange_attachment');
        const source = entry.source;
        const fields = entry.locations.map((location: unknown) => {
            const field = attachmentField(payload, location, source);
            const key = JSON.stringify(location);
            if (seen.has(key)) throw new Error('duplicate_chat_exchange_location');
            seen.add(key);
            return field;
        });
        const extension = path.posix.extname(source);
        const safeExtension = /^\.[a-zA-Z0-9]{1,12}$/.test(extension) ? extension : '';
        if (validateAssetFileName(`attachment${safeExtension}`).error) throw new Error('unsupported_chat_exchange_attachment_type');
        return { contents, fields, extension: safeExtension };
    });
    return { jsonl, payload, attachments };
}

export async function registerChatExchangeAttachments(exchange: Awaited<ReturnType<typeof readChatExchange>>, handle: string, directories: UserDirectoryList) {
    if (!exchange.attachments.length) return exchange.payload;
    await ensureCanonicalSliceBackend('managed_media', directories, handle);
    for (const { contents, fields, extension } of exchange.attachments) {
        const fileName = `${randomUUID()}${extension}`;
        const compatibilityPath = path.relative(directories.root, path.join(directories.files, fileName)).split(path.sep).join('/');
        const result = await writeCanonicalManagedMedia({
            handle, directories, compatibilityPath, ownerType: 'attachment', role: 'attachment', displayName: fileName, contents,
        });
        if (!('authorityCommitted' in result) || !result.authorityCommitted) throw new Error('chat_exchange_attachment_unavailable');
        for (const { parent, key } of fields) parent[key] = result.reference.compatibilityPath;
    }
    return exchange.payload;
}

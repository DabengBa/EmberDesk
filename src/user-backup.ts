import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Response } from 'express';
import { ZipArchive } from 'archiver';
import { generateTimestamp } from './util.ts';
import { SECRETS_FILE, SECRET_KEYS } from './endpoints/secrets.ts';
import { canonicalSqliteManager, resolveCanonicalDatabasePath } from './canonical-sqlite.ts';
import { exportCanonicalStorageToFiles } from './canonical-sqlite-export.ts';
import { getUserDirectories } from './user-directories.ts';

/**
 * Creates an archive of the user's data root directory.
 * @param {string} handle User handle
 * @param {import('express').Response} response Express response object to write to
 * @returns {Promise<void>} Promise that resolves when the archive is created
 */
export async function createBackupArchive(handle: string, response: Response) {
    const directories = getUserDirectories(handle);

    // Stage compatibility files separately so SQLite and secret history never
    // enter the ordinary user export; canonical rows replace projections.
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-user-export-'));
    const staging = path.join(temporary, 'archive');
    const canonical = path.join(temporary, 'canonical');
    try {
        const sourceRoot = fs.realpathSync(directories.root);
        fs.cpSync(sourceRoot, staging, {
            recursive: true,
            verbatimSymlinks: true,
            filter(source) {
                const relative = path.relative(sourceRoot, source).split(path.sep).join('/');
                return relative !== 'storage' && relative !== SECRETS_FILE && !/^backups\/secrets_migration_.*\.json$/.test(relative);
            },
        });
        const { dbPath } = resolveCanonicalDatabasePath(directories);
        if (fs.existsSync(dbPath)) {
            fs.mkdirSync(canonical);
            // Preserve existing avatar image bytes for the exporter without
            // following a link in the source or in the staged tree.
            if (fs.existsSync(directories.characters) && !fs.lstatSync(directories.characters).isSymbolicLink()) {
                fs.cpSync(directories.characters, path.join(canonical, path.relative(directories.root, directories.characters)), {
                    recursive: true,
                    filter: source => !fs.lstatSync(source).isSymbolicLink(),
                });
            }
            const db = canonicalSqliteManager.open({ handle, directories, featureFlags: { enabled: true } });
            const result = exportCanonicalStorageToFiles({ db: db!, directories, handle, outDir: canonical, sliceKeys: ['characters', 'world_info', 'settings', 'chats', 'managed_media', 'presets'] });
            if (!result.ok) throw new Error('Canonical user export failed');

            // Replace only links that collide with canonical output; all other
            // links keep the original no-follow archive behavior.
            const merge = (source: string, destination: string) => {
                for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
                    const from = path.join(source, entry.name);
                    const to = path.join(destination, entry.name);
                    let existing;
                    try { existing = fs.lstatSync(to); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
                    if (existing?.isSymbolicLink()) fs.unlinkSync(to);
                    if (entry.isDirectory()) {
                        fs.mkdirSync(to, { recursive: true });
                        merge(from, to);
                    } else {
                        fs.copyFileSync(from, to);
                    }
                }
            };
            merge(canonical, staging);
        }

        // Settings and presets from both canonical export and older on-disk
        // copies may predate migration to the secret store. Sanitize only the
        // staged copies, retaining ordinary settings and connection metadata.
        const safeSecretKeys = new Set([SECRET_KEYS.LIBRE_URL, SECRET_KEYS.LINGVA_URL, SECRET_KEYS.ONERING_URL, SECRET_KEYS.DEEPLX_URL]);
        const credentialKeys = new Set([...Object.values(SECRET_KEYS).filter(key => !safeSecretKeys.has(key)), 'api_key_openai_fallback', 'proxy_password', 'custom_include_headers']);
        const scrub = (value: unknown): unknown => {
            if (Array.isArray(value)) return value.map(scrub);
            if (!value || typeof value !== 'object') return value;
            return Object.fromEntries(Object.entries(value)
                .filter(([key]) => !credentialKeys.has(key) && !key.startsWith('api_key_'))
                .map(([key, item]) => [key, scrub(item)]));
        };
        const sanitizeSettings = (directory: string, inPresets = false) => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const item = path.join(directory, entry.name);
                if (entry.isDirectory()) {
                    sanitizeSettings(item, inPresets || entry.name === 'OpenAI Settings');
                } else if (entry.isFile() && (inPresets || /^settings(?:[._-].*)?\.json$/i.test(entry.name)) && entry.name.endsWith('.json')) {
                    try {
                        const parsed = JSON.parse(fs.readFileSync(item, 'utf8'));
                        fs.writeFileSync(item, JSON.stringify(scrub(parsed), null, 2));
                    } catch (error) {
                        // Unparseable settings cannot be safely scrubbed.
                        if (error instanceof SyntaxError) fs.unlinkSync(item);
                        else throw error;
                    }
                }
            }
        };
        sanitizeSettings(staging);
    } catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true });
        throw error;
    }

    console.info('Backup requested for', handle);
    const archive = new ZipArchive();

    response.once('close', () => {
        archive.abort();
        fs.rmSync(temporary, { recursive: true, force: true });
    });

    archive.on('error', function (err) {
        response.status(500).send({ error: err.message });
    });

    // On stream closed we can end the request
    archive.on('end', function () {
        console.info('Archive wrote %d bytes', archive.pointer());
        response.end(); // End the Express response
    });

    const timestamp = generateTimestamp();

    // Set the archive name
    response.attachment(`${handle}-${timestamp}.zip`);

    // This is the streaming magic
    // @ts-ignore
    archive.pipe(response);

    archive.glob('**/*', { cwd: staging, follow: false, stat: true, dot: true });
    archive.finalize();
}

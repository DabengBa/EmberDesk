#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const usage = 'Usage: node scripts/offline-backup.mjs <backup|restore> --source <directory> --destination <new-directory> --confirm-stopped [--include-keys]';

try {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        strict: true,
        options: {
            source: { type: 'string' },
            destination: { type: 'string' },
            'confirm-stopped': { type: 'boolean' },
            'include-keys': { type: 'boolean' },
            help: { type: 'boolean', short: 'h' },
        },
    });
    if (values.help) {
        console.log(`${usage}\nStop all writers before copying. Full backups contain secret keys.`);
    } else {
        const command = positionals[0];
        if (positionals.length !== 1 || !['backup', 'restore'].includes(command) || !values.source || !values.destination || !values['confirm-stopped']) {
            throw new Error(`Specify a command, both paths and --confirm-stopped. ${usage}`);
        }
        if (command === 'backup' && !values['include-keys']) throw new Error('Full backup requires --include-keys.');
        if (command === 'restore' && values['include-keys']) throw new Error('--include-keys applies to backup only.');
        const source = fs.realpathSync(values.source);
        if (!fs.statSync(source).isDirectory()) throw new Error('Source must be a directory.');
        const destinationPath = path.resolve(values.destination);
        const destination = path.join(fs.realpathSync(path.dirname(destinationPath)), path.basename(destinationPath));
        const overlaps = (parent, child) => {
            const relative = path.relative(parent, child);
            return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
        };
        if (overlaps(source, destination) || overlaps(destination, source)) throw new Error('Source and destination must not overlap.');
        // Resolve links against the original tree, then point each copied link
        // at the corresponding object in the copy (never back at the source).
        const links = [];
        const collectLinks = directory => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const item = path.join(directory, entry.name);
                if (entry.isSymbolicLink()) {
                    let target;
                    try { target = fs.realpathSync(item); } catch { throw new Error(`Unresolved symbolic link: ${item}`); }
                    if (!overlaps(source, target)) throw new Error(`Symbolic link points outside source: ${item}`);
                    links.push({ link: path.relative(source, item), target: path.relative(source, target) });
                } else if (entry.isDirectory()) collectLinks(item);
            }
        };
        collectLinks(source);
        fs.mkdirSync(destination);
        try {
            fs.cpSync(source, destination, { recursive: true, verbatimSymlinks: true });
            for (const { link, target } of links) {
                const copiedLink = path.join(destination, link);
                const copiedTarget = path.join(destination, target);
                const relativeTarget = path.relative(path.dirname(copiedLink), copiedTarget) || '.';
                fs.unlinkSync(copiedLink);
                fs.symlinkSync(relativeTarget, copiedLink);
            }
        } catch (error) {
            fs.rmSync(destination, { recursive: true, force: true });
            throw error;
        }
        console.log(`${command} complete: ${destination}`);
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}

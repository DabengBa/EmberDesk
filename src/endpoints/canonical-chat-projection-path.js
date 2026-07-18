import fs from 'node:fs';
import path from 'node:path';

import { isPathUnderParent } from '../util.js';

function assertNoSymlinkComponents(root, filePath) {
    const relativePath = path.relative(root, filePath);
    let currentPath = root;
    for (const component of relativePath.split(path.sep).slice(0, -1)) {
        currentPath = path.join(currentPath, component);
        try {
            if (fs.lstatSync(currentPath).isSymbolicLink()) {
                throw new Error(`Canonical chat projection path contains a symbolic link: ${currentPath}`);
            }
        } catch (error) {
            if (error?.code !== 'ENOENT') {
                throw error;
            }
            break;
        }
    }
}

export function resolveCanonicalChatProjectionPath({
    directories,
    ownerType,
    ownerId,
    sourcePath,
}) {
    if (!directories?.root) {
        throw new Error('Canonical chat projection root is required.');
    }

    const filePath = path.resolve(directories.root, String(sourcePath));
    if (path.extname(filePath).toLowerCase() !== '.jsonl') {
        throw new Error(`Canonical chat projection must be a JSONL file: ${sourcePath}`);
    }

    if (ownerType === 'character') {
        if (!directories.chats) {
            throw new Error('Canonical character chat projection directory is required.');
        }
        const ownerRoot = path.resolve(directories.chats, String(ownerId));
        if (!isPathUnderParent(directories.chats, ownerRoot)
            || path.dirname(filePath) !== ownerRoot) {
            throw new Error(`Canonical character chat projection path is invalid: ${sourcePath}`);
        }
        assertNoSymlinkComponents(directories.chats, filePath);
        return filePath;
    }

    if (ownerType === 'group') {
        if (!directories.groupChats) {
            throw new Error('Canonical group chat projection directory is required.');
        }
        if (path.dirname(filePath) !== path.resolve(directories.groupChats)
            || path.parse(filePath).name !== String(ownerId)) {
            throw new Error(`Canonical group chat projection path is invalid: ${sourcePath}`);
        }
        assertNoSymlinkComponents(directories.groupChats, filePath);
        return filePath;
    }

    throw new Error(`Canonical chat owner type is invalid: ${ownerType}`);
}

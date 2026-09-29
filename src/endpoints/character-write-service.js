import path from 'node:path';

import sanitize from 'sanitize-filename';

function getDirectories({ request, directories }) {
    return directories ?? request.user.directories;
}

function joinPath(dependencies, ...parts) {
    return dependencies.joinPath ? dependencies.joinPath(...parts) : path.join(...parts);
}

function getUploadPath(uploadFile, dependencies) {
    return uploadFile ? joinPath(dependencies, uploadFile.destination, uploadFile.filename) : null;
}

function getAvatarName(internalName) {
    return `${internalName}.png`;
}

function exists(dependencies, target) {
    return dependencies.fileExists ? dependencies.fileExists(target) : dependencies.existsSync(target);
}

function makeDirectory(dependencies, target) {
    return dependencies.makeDirectory ? dependencies.makeDirectory(target) : dependencies.mkdirSync(target);
}

function unlinkFile(dependencies, target) {
    return dependencies.unlinkFile ? dependencies.unlinkFile(target) : dependencies.unlinkSync(target);
}

function copyDirectory(dependencies, from, to) {
    if (dependencies.copyDirectory) {
        dependencies.copyDirectory(from, to);
        return;
    }

    dependencies.cpSync(from, to, { recursive: true });
}

function removeDirectory(dependencies, target) {
    if (dependencies.removeDirectory) {
        dependencies.removeDirectory(target);
        return;
    }

    dependencies.rmSync(target, { recursive: true, force: true });
}

function parsePath(dependencies, target) {
    return dependencies.parsePath ? dependencies.parsePath(target) : path.parse(target);
}

function setValue(dependencies, target, key, value) {
    dependencies.setValue(target, key, value);
}

function okResult(avatarName, details = {}) {
    return {
        ok: true,
        avatarName,
        ...details,
    };
}

function failureResult(reason, message, avatarName) {
    return {
        ok: false,
        reason,
        message,
        ...(avatarName ? { avatarName } : {}),
    };
}

function getProjectionWriteOptions(canonicalResult, extraOptions = undefined) {
    return {
        ...extraOptions,
        ...(canonicalResult.authorityCommitted ? { skipCanonicalAuditInvalidation: true } : {}),
        ...(canonicalResult.projection ? { projection: canonicalResult.projection } : {}),
    };
}

function projectionFailedResult(avatarName, repairKey) {
    return {
        ok: false,
        reason: 'projection_failed',
        message: 'Error: character data committed to canonical storage but compatibility projection failed',
        avatarName,
        repairKey,
        authorityCommitted: true,
    };
}

function canonicalUnavailableResult(avatarName) {
    return failureResult(
        'canonical_storage_unavailable',
        'Error: canonical storage is unavailable; the character cannot be persisted',
        avatarName,
    );
}

async function maybeCommitCanonicalWrite(dependencies, operation, payload) {
    if (typeof dependencies.performCanonicalWrite !== 'function') {
        return { enabled: false, authorityCommitted: false, repairKey: null };
    }

    const result = await dependencies.performCanonicalWrite(operation, payload);
    return result ?? { enabled: false, authorityCommitted: false, repairKey: null };
}

async function maybeRecordProjectionRepair(dependencies, repair) {
    if (typeof dependencies.recordProjectionRepair !== 'function') {
        return;
    }

    await dependencies.recordProjectionRepair(repair);
}

function buildProjectionRepairDetails(baseDetails = {}) {
    return Object.fromEntries(Object.entries(baseDetails).filter(([, value]) => value !== undefined));
}

function createPreparedCharacterData(body, directories, dependencies) {
    const commandBody = {
        ...body,
        ch_name: dependencies.sanitizeName(body.ch_name),
    };

    return {
        body: commandBody,
        characterData: JSON.stringify(dependencies.formatCharacterData(commandBody, directories)),
        internalName: commandBody.file_name || dependencies.getPngName(commandBody.ch_name, directories),
    };
}

function createPreparedEditData(body, directories, dependencies) {
    const character = dependencies.formatCharacterData(body, directories);
    character.chat = body.chat;
    character.create_date = body.create_date;

    const avatarUrl = body.avatar_url.toString();

    return {
        avatarUrl,
        targetFile: avatarUrl.replace('.png', ''),
        characterData: JSON.stringify(character),
    };
}

async function createPreparedRenameData(body, directories, request, dependencies) {
    const oldAvatarName = body.avatar_url;
    const newName = dependencies.sanitizeName(body.new_name);
    const oldInternalName = parsePath(dependencies, oldAvatarName).name;
    const newInternalName = dependencies.getPngName(newName, directories);
    const newAvatarName = getAvatarName(newInternalName);

    // Canonical row is the only authority; a leftover PNG is never read back.
    const rawOldData = await dependencies.readCanonicalCharacterData?.(oldAvatarName, directories);
    if (rawOldData === undefined) {
        throw new Error('Failed to read character file');
    }

    const oldData = dependencies.getCharaCardV2(JSON.parse(rawOldData), directories);
    setValue(dependencies, oldData, 'data.name', newName);
    setValue(dependencies, oldData, 'name', newName);

    return {
        directories,
        oldAvatarName,
        oldInternalName,
        newAvatarName,
        newInternalName,
        characterData: JSON.stringify(oldData),
        request,
        dependencies,
    };
}

/**
 * @param {object} options
 * @param {import('../users.js').UserDirectoryList} options.directories
 * @param {string} options.internalName
 * @param {string} options.characterData
 * @param {import('express').Request} options.request
 * @param {object} [options.body]
 * @param {{ destination: string, filename: string }} [options.uploadFile]
 * @param {{ destination: string, filename: string }} [options.file]
 * @param {string|Buffer} [options.sourceImage]
 * @param {boolean} [options.ensureChatsDirectory]
 * @param {object} [options.crop]
 * @param {object} options.dependencies
 * @returns {Promise<{ ok: boolean, avatarName?: string, internalName?: string, reason?: string, message?: string }>}
 */
export async function createCharacterCard({
    request,
    directories,
    body = null,
    internalName,
    characterData,
    file = null,
    uploadFile = null,
    sourceImage = undefined,
    ensureChatsDirectory = true,
    crop = undefined,
    dependencies,
}) {
    const userDirectories = getDirectories({ request, directories });
    const prepared = body
        ? createPreparedCharacterData(body, userDirectories, dependencies)
        : { internalName, characterData };
    const avatarName = getAvatarName(prepared.internalName);
    const chatsPath = joinPath(dependencies, userDirectories.chats, prepared.internalName);
    const uploadPath = getUploadPath(file ?? uploadFile, dependencies);
    const inputFile = sourceImage ?? uploadPath ?? dependencies.defaultAvatarPath;

    if (ensureChatsDirectory && !exists(dependencies, chatsPath)) {
        makeDirectory(dependencies, chatsPath);
    }

    const canonicalResult = await maybeCommitCanonicalWrite(dependencies, 'create', {
        avatarName,
        internalName: prepared.internalName,
        characterData: prepared.characterData,
        directories: userDirectories,
        request,
    });

    // No file-backed fallback remains: an uncommitted canonical write means
    // storage is frozen/unavailable and the character cannot persist at all.
    if (!canonicalResult.authorityCommitted) {
        if (uploadPath) {
            unlinkFile(dependencies, uploadPath);
        }
        return canonicalUnavailableResult(avatarName);
    }

    const result = await dependencies.writeCharacterData(
        inputFile,
        prepared.characterData,
        prepared.internalName,
        request,
        crop,
        getProjectionWriteOptions(canonicalResult),
    );
    if (uploadPath) {
        unlinkFile(dependencies, uploadPath);
    }

    if (!result) {
        await maybeRecordProjectionRepair(dependencies, {
            repairKey: canonicalResult.repairKey,
            repairType: 'character_projection',
            avatarName,
            operation: 'create',
            reason: 'projection_failed',
            directories: userDirectories,
            handle: request.user.profile?.handle ?? null,
            details: buildProjectionRepairDetails({
                internalName: prepared.internalName,
                sourceImage: typeof inputFile === 'string' ? inputFile : 'buffer',
                chatsDirectoryName: prepared.internalName,
            }),
        });
        return projectionFailedResult(avatarName, canonicalResult.repairKey);
    }

    return okResult(avatarName, { internalName: prepared.internalName });
}

/**
 * @param {object} options
 * @param {import('../users.js').UserDirectoryList} options.directories
 * @param {string} options.avatarUrl
 * @param {string} options.targetFile
 * @param {string} options.characterData
 * @param {import('express').Request} options.request
 * @param {import('express').Response} [options.response]
 * @param {object} [options.body]
 * @param {{ destination: string, filename: string }} [options.uploadFile]
 * @param {{ destination: string, filename: string }} [options.file]
 * @param {object} [options.crop]
 * @param {object} options.dependencies
 * @returns {Promise<{ ok: boolean, avatarName?: string, reason?: string, message?: string, avatarPath?: string }>}
 */
export async function editCharacterCard({
    request,
    response = null,
    directories,
    body = null,
    avatarUrl,
    targetFile,
    characterData,
    file = null,
    uploadFile = null,
    crop = undefined,
    dependencies,
}) {
    const userDirectories = getDirectories({ request, directories });
    const prepared = body
        ? createPreparedEditData(body, userDirectories, dependencies)
        : { avatarUrl, targetFile, characterData };
    const uploadPath = getUploadPath(file ?? uploadFile, dependencies);
    const avatarPath = joinPath(dependencies, userDirectories.characters, prepared.avatarUrl);

    // Existence must be checked before the canonical write: an edit upsert
    // would otherwise create a row for a character that never existed. A
    // replacement-avatar upload is exempt — it creates the card image.
    if (!uploadPath
        && !exists(dependencies, avatarPath)
        && !(await dependencies.characterExists?.(userDirectories, prepared.avatarUrl))) {
        return {
            ...failureResult('missing_avatar', 'Error: character file does not exist'),
            avatarPath,
        };
    }

    const canonicalResult = await maybeCommitCanonicalWrite(dependencies, 'edit', {
        avatarName: prepared.avatarUrl,
        internalName: prepared.targetFile,
        characterData: prepared.characterData,
        directories: userDirectories,
        request,
        response,
    });

    if (!canonicalResult.authorityCommitted) {
        if (uploadPath) {
            unlinkFile(dependencies, uploadPath);
        }
        return canonicalUnavailableResult(prepared.avatarUrl);
    }

    if (!uploadPath) {
        const result = await dependencies.writeCharacterData(
            avatarPath,
            prepared.characterData,
            prepared.targetFile,
            request,
            undefined,
            getProjectionWriteOptions(canonicalResult, { shouldRegenerateThumbnail: false }),
        );
        if (!result) {
            await maybeRecordProjectionRepair(dependencies, {
                repairKey: canonicalResult.repairKey,
                repairType: 'character_projection',
                avatarName: prepared.avatarUrl,
                operation: 'edit',
                reason: 'projection_failed',
                directories: userDirectories,
                handle: request.user.profile?.handle ?? null,
                details: buildProjectionRepairDetails({
                    internalName: prepared.targetFile,
                    sourceAvatarName: prepared.avatarUrl,
                    sourceImage: avatarPath,
                }),
            });
            return projectionFailedResult(prepared.avatarUrl, canonicalResult.repairKey);
        }
    } else {
        const result = await dependencies.writeCharacterData(
            uploadPath,
            prepared.characterData,
            prepared.targetFile,
            request,
            crop,
            getProjectionWriteOptions(canonicalResult),
        );
        unlinkFile(dependencies, uploadPath);
        if (!result) {
            await maybeRecordProjectionRepair(dependencies, {
                repairKey: canonicalResult.repairKey,
                repairType: 'character_projection',
                avatarName: prepared.avatarUrl,
                operation: 'edit',
                reason: 'projection_failed',
                directories: userDirectories,
                handle: request.user.profile?.handle ?? null,
                details: buildProjectionRepairDetails({
                    internalName: prepared.targetFile,
                    sourceAvatarName: prepared.avatarUrl,
                    sourceImage: uploadPath,
                }),
            });
            return projectionFailedResult(prepared.avatarUrl, canonicalResult.repairKey);
        }

        dependencies.bustCache?.(request, response);
    }

    return okResult(prepared.avatarUrl);
}

/**
 * @param {object} options
 * @param {import('../users.js').UserDirectoryList} options.directories
 * @param {string} options.oldAvatarName
 * @param {string} options.oldInternalName
 * @param {string} options.newAvatarName
 * @param {string} options.newInternalName
 * @param {string} options.characterData
 * @param {import('express').Request} options.request
 * @param {object} [options.body]
 * @param {object} options.dependencies
 * @returns {Promise<{ ok: boolean, avatarName?: string, reason?: string, message?: string }>}
 */
export async function renameCharacterCard(options) {
    if (options.body) {
        return renameCharacterCard(await createPreparedRenameData(
            options.body,
            getDirectories(options),
            options.request,
            options.dependencies,
        ));
    }

    const {
        directories,
        oldAvatarName,
        oldInternalName,
        newAvatarName,
        newInternalName,
        characterData,
        request,
        dependencies,
    } = options;
    const oldAvatarPath = joinPath(dependencies, directories.characters, oldAvatarName);
    const oldChatsPath = joinPath(dependencies, directories.chats, oldInternalName);
    const newChatsPath = joinPath(dependencies, directories.chats, newInternalName);

    const canonicalResult = await maybeCommitCanonicalWrite(dependencies, 'rename', {
        oldAvatarName,
        oldInternalName,
        newAvatarName,
        newInternalName,
        characterData,
        directories,
        request,
    });

    if (!canonicalResult.authorityCommitted) {
        return canonicalUnavailableResult(newAvatarName);
    }

    const result = await dependencies.writeCharacterData(
        oldAvatarPath,
        characterData,
        newInternalName,
        request,
        undefined,
        getProjectionWriteOptions(canonicalResult),
    );
    if (!result) {
        await maybeRecordProjectionRepair(dependencies, {
            repairKey: canonicalResult.repairKey,
            repairType: 'character_projection',
            avatarName: newAvatarName,
            operation: 'rename',
            reason: 'projection_failed',
            directories,
            handle: request.user.profile?.handle ?? null,
            details: buildProjectionRepairDetails({
                oldAvatarName,
                newAvatarName,
                oldInternalName,
                newInternalName,
                oldChatsPath,
                newChatsPath,
                sourceImage: oldAvatarPath,
            }),
        });
        return projectionFailedResult(newAvatarName, canonicalResult.repairKey);
    }

    if (exists(dependencies, oldChatsPath) && !exists(dependencies, newChatsPath)) {
        copyDirectory(dependencies, oldChatsPath, newChatsPath);
        removeDirectory(dependencies, oldChatsPath);
    }

    // Under projection 'off' the old PNG may not exist — removal is best-effort.
    try {
        unlinkFile(dependencies, oldAvatarPath);
    } catch (error) {
        if (canonicalResult.projection !== 'off') {
            throw error;
        }
    }
    dependencies.removeCompatibilityLedgerEntry?.(oldAvatarPath, directories, request.user.profile?.handle ?? null);
    return okResult(newAvatarName);
}

/**
 * @param {object} options
 * @param {import('../users.js').UserDirectoryList} [options.directories]
 * @param {string} [options.avatarName]
 * @param {import('express').Request} options.request
 * @param {boolean} [options.deleteChats]
 * @param {object} options.dependencies
 * @returns {Promise<{ ok: boolean, avatarName?: string, reason?: string, message?: string, authorityCommitted?: boolean, repairKey?: string, avatarPath?: string }>}
 */
export async function deleteCharacterCard({
    request,
    directories,
    avatarName = null,
    deleteChats = false,
    dependencies,
}) {
    const userDirectories = getDirectories({ request, directories });
    const targetAvatarName = avatarName ?? request.body?.avatar_url;
    const avatarPath = joinPath(dependencies, userDirectories.characters, targetAvatarName);

    if (!(await dependencies.characterExists?.(userDirectories, targetAvatarName))) {
        return {
            ...failureResult('missing_avatar', 'Error: character file does not exist', targetAvatarName),
            avatarPath,
        };
    }

    const canonicalResult = await maybeCommitCanonicalWrite(dependencies, 'delete', {
        avatarName: targetAvatarName,
        deleteChats,
        directories: userDirectories,
        request,
    });

    if (!canonicalResult.authorityCommitted) {
        return canonicalUnavailableResult(targetAvatarName);
    }

    try {
        if (canonicalResult.projection !== 'off' || exists(dependencies, avatarPath)) {
            unlinkFile(dependencies, avatarPath);
        }
        dependencies.removeCompatibilityLedgerEntry?.(avatarPath, userDirectories, request.user.profile?.handle ?? null);
        dependencies.invalidateThumbnail?.(userDirectories, 'avatar', targetAvatarName);

        if (deleteChats) {
            const chatsDirectoryName = sanitize(targetAvatarName.replace(/\.png$/i, ''));
            const chatsPath = joinPath(dependencies, userDirectories.chats, chatsDirectoryName);
            await dependencies.removeDirectory(chatsPath);
        }
    } catch {
        await maybeRecordProjectionRepair(dependencies, {
            repairKey: canonicalResult.repairKey,
            repairType: 'character_projection',
            avatarName: targetAvatarName,
            operation: 'delete',
            reason: 'projection_failed',
            directories: userDirectories,
            handle: request.user.profile?.handle ?? null,
            details: buildProjectionRepairDetails({
                avatarName: targetAvatarName,
                deleteChats,
                sourceAvatarPath: avatarPath,
                chatsDirectoryName: sanitize(targetAvatarName.replace(/\.png$/i, '')),
            }),
        });
        return projectionFailedResult(targetAvatarName, canonicalResult.repairKey);
    }

    return okResult(targetAvatarName);
}

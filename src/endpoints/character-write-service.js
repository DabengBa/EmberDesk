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

function writeFailedResult(avatarName) {
    return failureResult('write_failed', 'Error: failed to write character data', avatarName);
}

function getProjectionWriteOptions(canonicalResult, extraOptions = undefined) {
    return {
        ...(extraOptions ?? {}),
        ...(canonicalResult.authorityCommitted ? { skipCanonicalAuditInvalidation: true } : {}),
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

function deleteFailedResult(avatarName) {
    return failureResult('delete_failed', 'Error: failed to delete character data', avatarName);
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
    const oldAvatarPath = joinPath(dependencies, directories.characters, oldAvatarName);

    const rawOldData = await dependencies.readCharacterData(oldAvatarPath);
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
        if (canonicalResult.authorityCommitted) {
            await maybeRecordProjectionRepair(dependencies, {
                repairKey: canonicalResult.repairKey,
                repairType: 'character_projection',
                avatarName,
                operation: 'create',
                reason: 'projection_failed',
                directories: userDirectories,
                handle: request.user.profile?.handle ?? null,
            });
            return projectionFailedResult(avatarName, canonicalResult.repairKey);
        }
        return writeFailedResult(avatarName);
    }

    await dependencies.refreshCharacterIndexEntry(userDirectories, avatarName, 'create');
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

    const canonicalResult = await maybeCommitCanonicalWrite(dependencies, 'edit', {
        avatarName: prepared.avatarUrl,
        internalName: prepared.targetFile,
        characterData: prepared.characterData,
        directories: userDirectories,
        request,
        response,
    });

    if (!uploadPath) {
        const avatarPath = joinPath(dependencies, userDirectories.characters, prepared.avatarUrl);
        if (!exists(dependencies, avatarPath)) {
            return {
                ...failureResult('missing_avatar', 'Error: character file does not exist'),
                avatarPath,
            };
        }

        const result = await dependencies.writeCharacterData(
            avatarPath,
            prepared.characterData,
            prepared.targetFile,
            request,
            undefined,
            getProjectionWriteOptions(canonicalResult, { shouldRegenerateThumbnail: false }),
        );
        if (!result) {
            if (canonicalResult.authorityCommitted) {
                await maybeRecordProjectionRepair(dependencies, {
                    repairKey: canonicalResult.repairKey,
                    repairType: 'character_projection',
                    avatarName: prepared.avatarUrl,
                    operation: 'edit',
                    reason: 'projection_failed',
                    directories: userDirectories,
                    handle: request.user.profile?.handle ?? null,
                });
                return projectionFailedResult(prepared.avatarUrl, canonicalResult.repairKey);
            }
            return writeFailedResult(prepared.avatarUrl);
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
            if (canonicalResult.authorityCommitted) {
                await maybeRecordProjectionRepair(dependencies, {
                    repairKey: canonicalResult.repairKey,
                    repairType: 'character_projection',
                    avatarName: prepared.avatarUrl,
                    operation: 'edit',
                    reason: 'projection_failed',
                    directories: userDirectories,
                    handle: request.user.profile?.handle ?? null,
                });
                return projectionFailedResult(prepared.avatarUrl, canonicalResult.repairKey);
            }
            return writeFailedResult(prepared.avatarUrl);
        }

        dependencies.bustCache?.(request, response);
    }

    await dependencies.refreshCharacterIndexEntry(userDirectories, prepared.avatarUrl, 'edit');
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

    const result = await dependencies.writeCharacterData(
        oldAvatarPath,
        characterData,
        newInternalName,
        request,
        undefined,
        getProjectionWriteOptions(canonicalResult),
    );
    if (!result) {
        if (canonicalResult.authorityCommitted) {
            await maybeRecordProjectionRepair(dependencies, {
                repairKey: canonicalResult.repairKey,
                repairType: 'character_projection',
                avatarName: newAvatarName,
                operation: 'rename',
                reason: 'projection_failed',
                directories,
                handle: request.user.profile?.handle ?? null,
            });
            return projectionFailedResult(newAvatarName, canonicalResult.repairKey);
        }
        return writeFailedResult(newAvatarName);
    }

    if (exists(dependencies, oldChatsPath) && !exists(dependencies, newChatsPath)) {
        copyDirectory(dependencies, oldChatsPath, newChatsPath);
        removeDirectory(dependencies, oldChatsPath);
    }

    unlinkFile(dependencies, oldAvatarPath);
    dependencies.deleteCharacterIndexEntry(directories, oldAvatarName, 'rename');
    await dependencies.refreshCharacterIndexEntry(directories, newAvatarName, 'rename');
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

    if (!exists(dependencies, avatarPath)) {
        return {
            ...failureResult('missing_avatar', 'Error: character file does not exist', targetAvatarName),
            avatarPath,
        };
    }

    const canonicalResult = await maybeCommitCanonicalWrite(dependencies, 'delete', {
        avatarName: targetAvatarName,
        directories: userDirectories,
        request,
    });

    try {
        unlinkFile(dependencies, avatarPath);
        dependencies.invalidateThumbnail?.(userDirectories, 'avatar', targetAvatarName);

        if (deleteChats) {
            const chatsDirectoryName = sanitize(targetAvatarName.replace(/\.png$/i, ''));
            const chatsPath = joinPath(dependencies, userDirectories.chats, chatsDirectoryName);
            await dependencies.removeDirectory(chatsPath);
        }
    } catch (error) {
        if (canonicalResult.authorityCommitted) {
            await maybeRecordProjectionRepair(dependencies, {
                repairKey: canonicalResult.repairKey,
                repairType: 'character_projection',
                avatarName: targetAvatarName,
                operation: 'delete',
                reason: 'projection_failed',
                directories: userDirectories,
                handle: request.user.profile?.handle ?? null,
            });
            return projectionFailedResult(targetAvatarName, canonicalResult.repairKey);
        }

        return deleteFailedResult(targetAvatarName);
    }

    if (!canonicalResult.authorityCommitted) {
        dependencies.invalidateCanonicalAudit?.(
            request.user.profile?.handle ?? null,
            userDirectories,
            `character_delete:${targetAvatarName}`,
        );
    }

    dependencies.deleteCharacterIndexEntry(userDirectories, targetAvatarName, 'delete');
    return okResult(targetAvatarName);
}

import path from 'node:path';

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
    const inputFile = uploadPath ?? dependencies.defaultAvatarPath;

    if (!exists(dependencies, chatsPath)) {
        makeDirectory(dependencies, chatsPath);
    }

    const result = await dependencies.writeCharacterData(inputFile, prepared.characterData, prepared.internalName, request, crop);
    if (uploadPath) {
        unlinkFile(dependencies, uploadPath);
    }

    if (!result) {
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
            { shouldRegenerateThumbnail: false },
        );
        if (!result) {
            return writeFailedResult(prepared.avatarUrl);
        }
    } else {
        const result = await dependencies.writeCharacterData(uploadPath, prepared.characterData, prepared.targetFile, request, crop);
        unlinkFile(dependencies, uploadPath);
        if (!result) {
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

    const result = await dependencies.writeCharacterData(oldAvatarPath, characterData, newInternalName, request);
    if (!result) {
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

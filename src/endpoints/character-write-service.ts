import path from 'node:path';

import sanitize from 'sanitize-filename';

import type { Request, Response } from 'express';
import type { UserDirectoryList } from '../users.js';

type MaybePromise<T> = T | Promise<T>;
type UploadFile = { destination: string; filename: string };
export type CharacterCrop = { x: number; y: number; width: number; height: number; want_resize: boolean };
type CharacterBody = Record<string, unknown>;
type CreateBody = CharacterBody & { ch_name: string; file_name?: string };
type EditBody = CharacterBody & { avatar_url: { toString(): string }; chat?: unknown; create_date?: unknown };
type RenameBody = CharacterBody & { avatar_url: string; new_name: string };
type FormattedCharacter = Record<string, unknown>;
export type CanonicalWriteOperation = 'create' | 'edit' | 'rename' | 'delete';
export type CanonicalWritePayload = { directories: UserDirectoryList; request: Request; avatarName?: string; internalName?: string; characterData?: string; expectedCardJson?: string; response?: Response | null; oldAvatarName?: string; oldInternalName?: string; newAvatarName?: string; newInternalName?: string; deleteChats?: boolean };
export type CanonicalWriteResult = { enabled: boolean; authorityCommitted: boolean; repairKey: string | null; projection?: string; mediaAuthorization?: unknown; settingsRevision?: number };
export type ProjectionRepair = { repairKey: string | null; repairType: 'character_projection'; avatarName: string; operation: CanonicalWriteOperation; reason: 'projection_failed'; directories: UserDirectoryList; handle: string | null; details: Record<string, unknown> };
type ProjectionOptions = { shouldRegenerateThumbnail?: boolean; skipCanonicalAuditInvalidation?: boolean; projection?: string };
type FileOperations =
    ({ fileExists: (target: string) => boolean; existsSync?: (target: string) => boolean } | { fileExists?: undefined; existsSync: (target: string) => boolean }) &
    ({ makeDirectory: (target: string) => unknown; mkdirSync?: (target: string) => unknown } | { makeDirectory?: undefined; mkdirSync: (target: string) => unknown }) &
    ({ unlinkFile: (target: string) => unknown; unlinkSync?: (target: string) => unknown } | { unlinkFile?: undefined; unlinkSync: (target: string) => unknown }) &
    ({ copyDirectory: (from: string, to: string) => unknown; cpSync?: (from: string, to: string, options: { recursive: true }) => unknown } | { copyDirectory?: undefined; cpSync: (from: string, to: string, options: { recursive: true }) => unknown }) &
    ({ removeDirectory: (target: string) => MaybePromise<unknown>; rmSync?: (target: string, options: { recursive: true; force: true }) => unknown } | { removeDirectory?: undefined; rmSync: (target: string, options: { recursive: true; force: true }) => unknown });
export type CharacterWriteDependencies = FileOperations & {
    defaultAvatarPath: string;
    sanitizeName: (name: string) => string;
    formatCharacterData: (body: CharacterBody, directories: UserDirectoryList) => FormattedCharacter;
    getPngName: (name: string, directories: UserDirectoryList) => string;
    readCanonicalCharacterData?: (avatarName: string, directories: UserDirectoryList) => MaybePromise<string | undefined>;
    characterExists?: (directories: UserDirectoryList, avatarName: string) => MaybePromise<boolean>;
    getCharaCardV2: (data: object, directories: UserDirectoryList) => object;
    setValue: (target: object, key: string, value: unknown) => unknown;

    joinPath?: (...parts: string[]) => string;
    parsePath?: (target: string) => Pick<import('node:path').ParsedPath, 'name'>;
    writeCharacterData: (input: string | Buffer, data: string, output: string, request: Request, crop?: CharacterCrop, options?: ProjectionOptions) => MaybePromise<unknown>;
    performCanonicalWrite?: (operation: CanonicalWriteOperation, payload: CanonicalWritePayload) => MaybePromise<CanonicalWriteResult | null | undefined>;
    recordProjectionRepair?: (repair: ProjectionRepair) => MaybePromise<unknown>;
    removeCompatibilityLedgerEntry?: (target: string, directories: UserDirectoryList, handle: string | null) => unknown;
    invalidateThumbnail?: (directories: UserDirectoryList, type: 'avatar', avatarName: string) => unknown;
    bustCache?: ((request: Request, response: Response | null) => unknown) | null;
};
type CommonWriteOptions = { request: Request; directories?: UserDirectoryList; dependencies: CharacterWriteDependencies };
type FileWriteOptions = { file?: UploadFile | null; uploadFile?: UploadFile | null; crop?: CharacterCrop };
export type CreateCharacterOptions = CommonWriteOptions & FileWriteOptions & { sourceImage?: string | Buffer; ensureChatsDirectory?: boolean } & ({ body: CreateBody; internalName?: string; characterData?: string } | { body?: null; internalName: string; characterData: string });
export type EditCharacterOptions = CommonWriteOptions & FileWriteOptions & { response?: Response | null; expectedCardJson?: string } & ({ body: EditBody; avatarUrl?: string; targetFile?: string; characterData?: string } | { body?: null; avatarUrl: string; targetFile: string; characterData: string });
type PreparedRename = { directories: UserDirectoryList; oldAvatarName: string; oldInternalName: string; newAvatarName: string; newInternalName: string; characterData: string; body?: null };
export type RenameCharacterOptions = CommonWriteOptions & ({ body: RenameBody } | PreparedRename);
export type DeleteCharacterOptions = Omit<CommonWriteOptions, 'dependencies'> & { dependencies: CharacterWriteDependencies & { removeDirectory: (target: string) => MaybePromise<unknown> }; avatarName?: string | null; deleteChats?: boolean };
export type CharacterWriteResult = { ok: boolean; avatarName?: string; internalName?: string; reason?: string; message?: string; avatarPath?: string; authorityCommitted?: boolean; repairKey?: string | null; mediaAuthorization?: unknown; settingsRevision?: number };

function getDirectories({ request, directories }: Pick<CommonWriteOptions, 'request' | 'directories'>): UserDirectoryList {
    return directories ?? request.user.directories;
}

function joinPath(dependencies: CharacterWriteDependencies, ...parts: string[]): string {
    return dependencies.joinPath ? dependencies.joinPath(...parts) : path.join(...parts);
}

function getUploadPath(uploadFile: UploadFile | null, dependencies: CharacterWriteDependencies): string | null {
    return uploadFile ? joinPath(dependencies, uploadFile.destination, uploadFile.filename) : null;
}

function getAvatarName(internalName: string): string {
    return `${internalName}.png`;
}

function exists(dependencies: CharacterWriteDependencies, target: string): boolean {
    return dependencies.fileExists ? dependencies.fileExists(target) : dependencies.existsSync(target);
}

function makeDirectory(dependencies: CharacterWriteDependencies, target: string): unknown {
    return dependencies.makeDirectory ? dependencies.makeDirectory(target) : dependencies.mkdirSync(target);
}

function unlinkFile(dependencies: CharacterWriteDependencies, target: string): unknown {
    return dependencies.unlinkFile ? dependencies.unlinkFile(target) : dependencies.unlinkSync(target);
}

function copyDirectory(dependencies: CharacterWriteDependencies, from: string, to: string): void {
    if (dependencies.copyDirectory) {
        dependencies.copyDirectory(from, to);
        return;
    }

    dependencies.cpSync(from, to, { recursive: true });
}

function removeDirectory(dependencies: CharacterWriteDependencies, target: string): void {
    if (dependencies.removeDirectory) {
        dependencies.removeDirectory(target);
        return;
    }

    dependencies.rmSync(target, { recursive: true, force: true });
}

function parsePath(dependencies: CharacterWriteDependencies, target: string): Pick<import('node:path').ParsedPath, 'name'> {
    return dependencies.parsePath ? dependencies.parsePath(target) : path.parse(target);
}

function setValue(dependencies: CharacterWriteDependencies, target: object, key: string, value: unknown): void {
    dependencies.setValue(target, key, value);
}

function okResult(avatarName: string, details: object = {}): CharacterWriteResult {
    return {
        ok: true,
        avatarName,
        ...details,
    };
}

function failureResult(reason: string, message: string, avatarName?: string): CharacterWriteResult {
    return {
        ok: false,
        reason,
        message,
        ...(avatarName ? { avatarName } : {}),
    };
}

function getProjectionWriteOptions(canonicalResult: CanonicalWriteResult, extraOptions: ProjectionOptions | undefined = undefined): ProjectionOptions {
    return {
        ...extraOptions,
        ...(canonicalResult.authorityCommitted ? { skipCanonicalAuditInvalidation: true } : {}),
        ...(canonicalResult.projection ? { projection: canonicalResult.projection } : {}),
    };
}

function projectionFailedResult(avatarName: string, repairKey: string | null): CharacterWriteResult {
    return {
        ok: false,
        reason: 'projection_failed',
        message: 'Error: character data committed to canonical storage but compatibility projection failed',
        avatarName,
        repairKey,
        authorityCommitted: true,
    };
}

function canonicalUnavailableResult(avatarName: string): CharacterWriteResult {
    return failureResult(
        'canonical_storage_unavailable',
        'Error: canonical storage is unavailable; the character cannot be persisted',
        avatarName,
    );
}

async function maybeCommitCanonicalWrite(dependencies: CharacterWriteDependencies, operation: CanonicalWriteOperation, payload: CanonicalWritePayload): Promise<CanonicalWriteResult> {
    if (typeof dependencies.performCanonicalWrite !== 'function') {
        return { enabled: false, authorityCommitted: false, repairKey: null };
    }

    const result = await dependencies.performCanonicalWrite(operation, payload);
    return result ?? { enabled: false, authorityCommitted: false, repairKey: null };
}

async function maybeRecordProjectionRepair(dependencies: CharacterWriteDependencies, repair: ProjectionRepair): Promise<void> {
    if (typeof dependencies.recordProjectionRepair !== 'function') {
        return;
    }

    await dependencies.recordProjectionRepair(repair);
}

function buildProjectionRepairDetails(baseDetails: Record<string, unknown> = {}): Record<string, unknown> {
    return Object.fromEntries(Object.entries(baseDetails).filter(([, value]) => value !== undefined));
}

function createPreparedCharacterData(body: CreateBody, directories: UserDirectoryList, dependencies: CharacterWriteDependencies) {
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

function createPreparedEditData(body: EditBody, directories: UserDirectoryList, dependencies: CharacterWriteDependencies) {
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

async function createPreparedRenameData(body: RenameBody, directories: UserDirectoryList, request: Request, dependencies: CharacterWriteDependencies): Promise<RenameCharacterOptions> {
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
}: CreateCharacterOptions): Promise<CharacterWriteResult> {
    const userDirectories = getDirectories({ request, directories });
    const prepared = body
        ? createPreparedCharacterData(body, userDirectories, dependencies)
        : { internalName, characterData } as { internalName: string; characterData: string };
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
 * @param {string} [options.expectedCardJson] Canonical snapshot required for conditional edits
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
    expectedCardJson = undefined,
    file = null,
    uploadFile = null,
    crop = undefined,
    dependencies,
}: EditCharacterOptions): Promise<CharacterWriteResult> {
    const userDirectories = getDirectories({ request, directories });
    const prepared = body
        ? createPreparedEditData(body, userDirectories, dependencies)
        : { avatarUrl, targetFile, characterData } as { avatarUrl: string; targetFile: string; characterData: string };
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
        expectedCardJson,
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
export async function renameCharacterCard(options: RenameCharacterOptions): Promise<CharacterWriteResult> {
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
    return { ...okResult(newAvatarName), mediaAuthorization: canonicalResult.mediaAuthorization, settingsRevision: canonicalResult.settingsRevision };
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
}: DeleteCharacterOptions): Promise<CharacterWriteResult> {
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

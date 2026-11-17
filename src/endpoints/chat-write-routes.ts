import type { ChatRouteContext } from './chat-route-context.ts';
import type { Request, Response } from 'express';

export function registerChatSaveRoute(context: ChatRouteContext): void {
    const { router, path, sanitize, validateAvatarUrlMiddleware, rejectGroupChatRequest, coordinateWorkspaceWrite, openRequestCoordinationDatabase, getCanonicalChatOperation, getCanonicalChatWriteState, getCanonicalChatLocator, chatOperationIdentity, getChatsProjectionMode, sendCanonicalChatWriteBlocked, sendCanonicalChatWriteRejected, writeCanonicalChatPayload, invalidateCanonicalAuditStatus, getCanonicalStorageSlice, writeChatProjection, getBackupFunction, IntegrityMismatchError, applyInteractionPerfChatTimestamp, syncCanonicalChatStatsAfterCharacterChatMutation, isPathUnderParent } = context;
    router.post('/save', rejectGroupChatRequest, validateAvatarUrlMiddleware, coordinateWorkspaceWrite('chat', (request: Request) => JSON.stringify([request.body?.avatar_url, request.body?.file_name]), async function (request: Request, response: Response) {
        try {
            const handle = request.user.profile?.handle ?? null;
            const cardName = String(request.body.avatar_url).replace('.png', '');
            const chatData = request.body.chat;
            const chatFileName = `${String(request.body.file_name)}.jsonl`;
            const chatFilePath = path.join(request.user.directories.chats, cardName, sanitize(chatFileName));
            if (!isPathUnderParent(request.user.directories.chats, chatFilePath)) {
                return response.sendStatus(400);
            }

            if (Array.isArray(chatData)) {
                const isCreate = request.body.create === true;
                const version = request.body.version;
                if ((!isCreate && (typeof version !== 'string' || !/^[0-9a-f]{32}$/.test(version))) || (isCreate && version !== undefined)) {
                    return response.status(428).send({ error: 'chat_precondition_required' });
                }
                const locator = getCanonicalChatLocator(request.user.directories, { ownerType: 'character', ownerId: cardName, filePath: chatFilePath });
                const operationIdentity = chatOperationIdentity(request, 'save', locator);
                if (!operationIdentity) return response.status(400).send({ error: 'invalid_chat_operation_id' });
                const prior = getCanonicalChatOperation(openRequestCoordinationDatabase(request), operationIdentity);
                if (prior?.status === 'operation_mismatch') return response.status(409).send({ error: 'chat_operation_mismatch' });
                if (prior) return response.send({ ok: true, version: 'version' in prior ? prior.version : undefined });
                const writeState = await getCanonicalChatWriteState(request);
                if (writeState.blocked) {
                    return sendCanonicalChatWriteBlocked(response, writeState);
                }
                if (writeState.ok) {
                    const result = writeCanonicalChatPayload({
                        db: writeState.db,
                        locator,
                        payload: chatData,
                        condition: isCreate ? { create: true } : { version },
                        operationIdentity,
                        operation: 'save',
                        projection: getChatsProjectionMode(),
                        projectJsonl(jsonlData) {
                            writeChatProjection(
                                jsonlData,
                                chatFilePath,
                                handle,
                                cardName,
                                request.user.directories.backups,
                            );
                        },
                        onAuthorityCommitted(jsonlData) {
                            // Backups keep materializing the canonical payload even
                            // when the compatibility JSONL file is not written.
                            getBackupFunction(handle)(request.user.directories.backups, cardName, jsonlData);
                        },
                        onProjectionFailure() {
                            invalidateCanonicalAuditStatus(writeState.db, {
                                scope: getCanonicalStorageSlice('chats').auditScope,
                                handle,
                                reason: 'audit_stale_after_chat_projection_failure',
                                source: 'chat:save',
                            });
                        },
                    });
                    if (!result.ok) {
                        if (!result.authorityCommitted) {
                            if (result.reason === 'conflict' || result.reason === 'operation_mismatch') return response.status(409).send({ error: result.reason === 'conflict' ? 'chat_conflict' : 'chat_operation_mismatch' });
                            return sendCanonicalChatWriteRejected(response, result);
                        }
                        return response.send({ ok: true, version: result.version });
                    }
                    applyInteractionPerfChatTimestamp(chatFilePath);
                    syncCanonicalChatStatsAfterCharacterChatMutation(handle, request.user.directories, request.body.avatar_url, 'chat save');
                    return response.send({ ok: true, version: result.version });
                }

                return sendCanonicalChatWriteBlocked(response, writeState);
            } else {
                return response.status(400).send({ error: 'The request\'s body.chat is not an array.' });
            }
        } catch (error) {
            if (error instanceof IntegrityMismatchError) {
                console.error(error.message);
                return response.status(400).send({ error: 'integrity' });
            }
            console.error(error);
            return response.status(500).send({ error: 'An error has occurred, see the console logs for more information.' });
        }
    }));


}

export function registerChatRenameRoute(context: ChatRouteContext): void {
    const { router, fs, path, sanitize, writeFileAtomicSync, validateAvatarUrlMiddleware, rejectGroupChatRequest, openRequestCoordinationDatabase, getCanonicalChatOperation, getCanonicalChatWriteState, getCanonicalChatLocator, chatOperationIdentity, getChatsProjectionMode, getRequestHandle, sendCanonicalChatWriteBlocked, renameCanonicalChat, invalidateCanonicalAuditStatus, getCanonicalStorageSlice, syncCanonicalChatStatsAfterCharacterChatMutation, isPathUnderParent } = context;
    router.post('/rename', rejectGroupChatRequest, validateAvatarUrlMiddleware, async function (request, response) {
        try {
            if (!request.body || !request.body.original_file || !request.body.renamed_file) {
                return response.sendStatus(400);
            }

            const pathToFolder = path.join(request.user.directories.chats, String(request.body.avatar_url).replace('.png', ''));
            if (!isPathUnderParent(request.user.directories.chats, pathToFolder)) {
                return response.sendStatus(400);
            }
            const pathToOriginalFile = path.join(pathToFolder, sanitize(request.body.original_file));
            const pathToRenamedFile = path.join(pathToFolder, sanitize(request.body.renamed_file));
            const sanitizedFileName = path.parse(pathToRenamedFile).name;
            if (typeof request.body.version !== 'string' || !/^[0-9a-f]{32}$/.test(request.body.version)) return response.status(428).send({ error: 'chat_precondition_required' });
            const originalLocator = getCanonicalChatLocator(request.user.directories, {
                ownerType: 'character', ownerId: String(request.body.avatar_url).replace('.png', ''), filePath: pathToOriginalFile,
            });
            const operationIdentity = chatOperationIdentity(request, 'rename', originalLocator);
            if (!operationIdentity) return response.status(400).send({ error: 'invalid_chat_operation_id' });
            const prior = getCanonicalChatOperation(openRequestCoordinationDatabase(request), operationIdentity);
            if (prior?.status === 'operation_mismatch') return response.status(409).send({ error: 'chat_operation_mismatch' });
            if (prior) return response.send({ ok: true, sanitizedFileName, version: 'version' in prior ? prior.version : undefined });
            console.debug('Old chat name', pathToOriginalFile);
            console.debug('New chat name', pathToRenamedFile);

            const writeState = await getCanonicalChatWriteState(request);
            if (writeState.blocked) {
                return sendCanonicalChatWriteBlocked(response, writeState);
            }
            if (writeState.ok) {
                const nextLocator = getCanonicalChatLocator(request.user.directories, {
                    ownerType: 'character',
                    ownerId: String(request.body.avatar_url).replace('.png', ''),
                    filePath: pathToRenamedFile,
                });
                // Canonical sessions are the authority: a stale projection file can
                // be missing, and a destination name may collide with an existing
                // session even when its projection file was cleaned up.
                const result = renameCanonicalChat({
                    db: writeState.db,
                    locator: originalLocator,
                    nextLocator,
                    version: request.body.version,
                    operationIdentity,
                    projection: getChatsProjectionMode(),
                    projectRename(jsonl) {
                        writeFileAtomicSync(pathToRenamedFile, jsonl, 'utf8');
                        fs.rmSync(pathToOriginalFile, { force: true });
                    },
                    onAuthorityCommitted() {
                        fs.rmSync(pathToOriginalFile, { force: true });
                    },
                    onProjectionFailure() {
                        invalidateCanonicalAuditStatus(writeState.db, {
                            scope: getCanonicalStorageSlice('chats').auditScope,
                            handle: getRequestHandle(request),
                            reason: 'audit_stale_after_chat_projection_failure',
                            source: 'chat:rename',
                        });
                    },
                });
                if (!result.ok) {
                    if (!result.authorityCommitted) {
                        if (result.reason === 'conflict' || result.reason === 'operation_mismatch') return response.status(409).send({ error: result.reason === 'conflict' ? 'chat_conflict' : 'chat_operation_mismatch' });
                        return response.status(400).send({ error: true });
                    }
                    return response.send({ ok: true, sanitizedFileName, version: result.version });
                }
                console.info('Successfully renamed canonical chat file.');
                syncCanonicalChatStatsAfterCharacterChatMutation(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url, 'chat rename');
                return response.send({ ok: true, sanitizedFileName, version: result.version });
            }

            return sendCanonicalChatWriteBlocked(response, writeState);
        } catch (error) {
            console.error('Error renaming chat file:', error);
            return response.status(500).send({ error: true });
        }
    });
}

export function registerChatDeleteRoute(context: ChatRouteContext): void {
    const { router, fs, path, sanitize, validateAvatarUrlMiddleware, rejectGroupChatRequest, openRequestCoordinationDatabase, getCanonicalChatOperation, getCanonicalChatWriteState, getCanonicalChatLocator, chatOperationIdentity, getChatsProjectionMode, getRequestHandle, sendCanonicalChatWriteBlocked, deleteCanonicalChat, invalidateCanonicalAuditStatus, getCanonicalStorageSlice, syncCanonicalChatStatsAfterCharacterChatMutation, tryDeleteFile, isPathUnderParent } = context;
    router.post('/delete', rejectGroupChatRequest, validateAvatarUrlMiddleware, async function (request, response) {
        try {
            if (!path.extname(request.body.chatfile)) {
                request.body.chatfile += '.jsonl';
            }

            const dirName = String(request.body.avatar_url).replace('.png', '');
            const chatFileName = String(request.body.chatfile);
            const chatFilePath = path.join(request.user.directories.chats, dirName, sanitize(chatFileName));
            if (!isPathUnderParent(request.user.directories.chats, chatFilePath)) {
                return response.sendStatus(400);
            }
            if (typeof request.body.version !== 'string' || !/^[0-9a-f]{32}$/.test(request.body.version)) return response.status(428).send({ error: 'chat_precondition_required' });
            const locator = getCanonicalChatLocator(request.user.directories, { ownerType: 'character', ownerId: dirName, filePath: chatFilePath });
            const operationIdentity = chatOperationIdentity(request, 'delete', locator);
            if (!operationIdentity) return response.status(400).send({ error: 'invalid_chat_operation_id' });
            const prior = getCanonicalChatOperation(openRequestCoordinationDatabase(request), operationIdentity);
            if (prior?.status === 'operation_mismatch') return response.status(409).send({ error: 'chat_operation_mismatch' });
            if (prior) return response.send({ ok: true });
            const writeState = await getCanonicalChatWriteState(request);
            if (writeState.blocked) {
                return sendCanonicalChatWriteBlocked(response, writeState);
            }
            if (writeState.ok) {
                const chatsProjection = getChatsProjectionMode();
                const result = deleteCanonicalChat({
                    db: writeState.db,
                    locator,
                    version: request.body.version,
                    operationIdentity,
                    projection: chatsProjection,
                    projectDelete() {
                        if (chatsProjection === 'off') {
                            tryDeleteFile(chatFilePath);
                            return;
                        }
                        if (fs.existsSync(chatFilePath) && !tryDeleteFile(chatFilePath)) {
                            throw new Error('JSONL chat projection was not deleted.');
                        }
                    },
                    onProjectionFailure() {
                        invalidateCanonicalAuditStatus(writeState.db, {
                            scope: getCanonicalStorageSlice('chats').auditScope,
                            handle: getRequestHandle(request),
                            reason: 'audit_stale_after_chat_projection_failure',
                            source: 'chat:delete',
                        });
                    },
                });
                if (!result.ok) {
                    if (!result.authorityCommitted) {
                        if (result.reason === 'conflict' || result.reason === 'operation_mismatch') return response.status(409).send({ error: result.reason === 'conflict' ? 'chat_conflict' : 'chat_operation_mismatch' });
                        return response.sendStatus(400);
                    }
                    return response.send({ ok: true });
                }
                syncCanonicalChatStatsAfterCharacterChatMutation(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url, 'chat delete');
                return response.send({ ok: true });
            }
            return sendCanonicalChatWriteBlocked(response, writeState);
        } catch (error) {
            console.error(error);
            return response.sendStatus(500);
        }
    });
}

import type {} from 'multer';
import type { ChatRouteContext } from './chat-route-context.ts';
import { MAX_CHAT_EXCHANGE_BYTES, readChatExchange, registerChatExchangeAttachments } from './chat-exchange.ts';

export function registerChatImportRoute(context: ChatRouteContext): void {
    const { router, fs, path, crypto, sanitize, writeFileAtomicSync, validateAvatarUrlMiddleware, openRequestCoordinationDatabase, getCanonicalChatOperation, getCanonicalChatWriteState, getCanonicalChatLocator, getChatsProjectionMode, getRequestHandle, sendCanonicalChatWriteBlocked, sendCanonicalChatWriteRejected, writeCanonicalChatPayload, parseCanonicalChatJsonl, invalidateCanonicalAuditStatus, getCanonicalStorageSlice, syncCanonicalChatStatsAfterCharacterChatMutation, isPathUnderParent, createCharacterChatImportPlan, CHAT_IMPORT_UPLOAD_CLEANUP, warnAboutChatImportFailure } = context;
    router.post('/import', validateAvatarUrlMiddleware, async function (request, response) {
        if (!request.body) return response.sendStatus(400);
        const importId = request.body.operationId;
        if (typeof importId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(importId)) {
            return response.status(400).send({ error: 'invalid_chat_operation_id' });
        }

        const format = request.body.file_type;
        const avatarUrl = (request.body.avatar_url).replace('.png', '');
        const characterName = sanitize(request.body.character_name) || 'Character';
        const userName = sanitize(request.body.user_name) || 'User';
        const fileNames = [];

        if (!request.file) {
            return response.sendStatus(400);
        }

        const directoryPath = path.join(request.user.directories.chats, avatarUrl);
        if (!isPathUnderParent(request.user.directories.chats, directoryPath)) {
            return response.sendStatus(400);
        }

        const pathToUpload = path.join(request.file.destination, request.file.filename);
        try {
            let exchange: Awaited<ReturnType<typeof readChatExchange>> | undefined;
            let data: string;
            let fingerprintData: string;
            if (format === 'zip') {
                if (fs.statSync(pathToUpload).size > MAX_CHAT_EXCHANGE_BYTES) {
                    return response.status(413).send({ error: 'chat_exchange_too_large' });
                }
                const archive = fs.readFileSync(pathToUpload);
                try {
                    exchange = await readChatExchange(archive);
                } catch {
                    return response.status(400).send({ error: 'invalid_chat_exchange' });
                }
                data = exchange.jsonl;
                fingerprintData = crypto.createHash('sha256').update(archive).digest('hex');
            } else {
                data = fs.readFileSync(pathToUpload, 'utf8');
                fingerprintData = data;
            }
            const fingerprint = crypto.createHash('sha256').update(JSON.stringify(['chat-import', avatarUrl, characterName, userName, format, fingerprintData])).digest('hex');
            const importKey = crypto.createHash('sha256').update(importId).digest('hex');
            let importIndex = 0;

            if (format === 'json') {
                fs.unlinkSync(pathToUpload);
            }

            const importPlan = createCharacterChatImportPlan({
                format,
                data,
                directories: request.user.directories,
                avatarUrl,
                characterName,
                userName,
                timestampLabel: () => `${importKey}-${importIndex++}`,
                uploadPath: pathToUpload,
            });

            if (!importPlan.ok) {
                warnAboutChatImportFailure(importPlan);
                return response.send({ error: true, report: { reason: importPlan.errorKind } });
            }

            if (!importPlan.writes.length) return response.status(400).send({ error: 'empty_chat_import' });
            const operations = importPlan.writes.map((_, index) => ({
                id: `import-${importKey}-${index}`,
                fingerprint,
            }));
            const operationDb = openRequestCoordinationDatabase(request);
            const previous = operations.map(operation => getCanonicalChatOperation(operationDb, operation));
            if (previous.some(result => result?.status === 'operation_mismatch')) {
                return response.status(409).send({ error: 'chat_operation_mismatch' });
            }
            if (previous.every(Boolean)) {
                if (importPlan.uploadCleanup === CHAT_IMPORT_UPLOAD_CLEANUP.AFTER_SUCCESS) fs.unlinkSync(pathToUpload);
                return response.send({ res: true, fileNames: importPlan.fileNames });
            }

            const writeState = await getCanonicalChatWriteState(request);
            if (writeState.blocked) {
                return sendCanonicalChatWriteBlocked(response, writeState);
            }
            if (writeState.ok) {
                // The ZIP payload already contains the full canonical history.
                // Resolve every target-owned attachment before creating a chat.
                const exchangePayload = exchange
                    ? await registerChatExchangeAttachments(exchange, getRequestHandle(request), request.user.directories)
                    : undefined;
                for (const [index, write] of importPlan.writes.entries()) {
                    const jsonlData = write.kind === 'copy-upload'
                        ? fs.readFileSync(write.uploadPath, 'utf8')
                        : write.contents;
                    const result = writeCanonicalChatPayload({
                        db: writeState.db,
                        locator: getCanonicalChatLocator(request.user.directories, {
                            ownerType: 'character',
                            ownerId: avatarUrl,
                            filePath: write.filePath,
                        }),
                        payload: exchangePayload ?? parseCanonicalChatJsonl(jsonlData),
                        operation: 'import',
                        condition: { create: true },
                        operationIdentity: operations[index],
                        projection: getChatsProjectionMode(),
                        projectJsonl(projectedJsonl) {
                            writeFileAtomicSync(write.filePath, projectedJsonl, 'utf8');
                        },
                        onProjectionFailure() {
                            invalidateCanonicalAuditStatus(writeState.db, {
                                scope: getCanonicalStorageSlice('chats').auditScope,
                                handle: getRequestHandle(request),
                                reason: 'audit_stale_after_chat_projection_failure',
                                source: 'chat:import',
                            });
                        },
                    });
                    if (!result.ok) {
                        if (!result.authorityCommitted) {
                            if (result.reason === 'conflict' || result.reason === 'operation_mismatch') {
                                return response.status(409).send({ error: result.reason === 'conflict' ? 'chat_conflict' : 'chat_operation_mismatch', completed: importPlan.fileNames.slice(0, index) });
                            }
                            return sendCanonicalChatWriteRejected(response, result);
                        }
                    }
                }
                fileNames.push(...importPlan.fileNames);
                if (importPlan.uploadCleanup === CHAT_IMPORT_UPLOAD_CLEANUP.AFTER_SUCCESS) {
                    fs.unlinkSync(pathToUpload);
                }
                if (importPlan.shouldMarkChatStatsDirty) {
                    syncCanonicalChatStatsAfterCharacterChatMutation(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url, 'chat import');
                }
                return response.send({ res: true, fileNames });
            }

            return sendCanonicalChatWriteBlocked(response, writeState);
        } catch (error) {
            if (format === 'zip') return response.status(400).send({ error: 'chat_exchange_import_failed' });
            console.error(error);
            return response.send({ error: true });
        } finally {
            if (format === 'zip') {
                try {
                    fs.unlinkSync(pathToUpload);
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Could not remove chat exchange upload.');
                }
            }
        }
    });
}

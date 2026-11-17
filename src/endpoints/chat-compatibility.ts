import type { ChatRouteContext } from './chat-route-context.ts';

export function registerChatExportRoute(context: ChatRouteContext): void {
    const { router, path, sanitize, validateAvatarUrlMiddleware, rejectGroupChatRequest, getCanonicalChatLocator, sendCanonicalChatReadBlocked, isPathUnderParent, serializeCanonicalChatRoutePayload } = context;
    router.post('/export', rejectGroupChatRequest, validateAvatarUrlMiddleware, async function (request, response) {
        if (!request.body.file || !request.body.avatar_url) {
            return response.sendStatus(400);
        }
        const pathToFolder = path.join(request.user.directories.chats, String(request.body.avatar_url).replace('.png', ''));
        const filename = path.join(pathToFolder, sanitize(request.body.file));
        if (!isPathUnderParent(request.user.directories.chats, filename)) {
            return response.sendStatus(400);
        }
        let exportfilename = request.body.exportfilename;
        const canonical = await serializeCanonicalChatRoutePayload(request, getCanonicalChatLocator(request.user.directories, {
            ownerType: 'character',
            ownerId: String(request.body.avatar_url).replace('.png', ''),
            filePath: filename,
        }));
        if (!canonical.active) {
            return sendCanonicalChatReadBlocked(response, canonical);
        }
        if (canonical.jsonl === null) {
            const errorMessage = {
                message: `Could not find JSONL file to export. Source chat file: ${filename}.`,
            };
            console.error(errorMessage.message);
            return response.status(404).json(errorMessage);
        }
        try {
            const rawFile = canonical.jsonl;
            if (rawFile === null) {
                const errorMessage = {
                    message: `Could not find JSONL file to export. Source chat file: ${filename}.`,
                };
                console.error(errorMessage.message);
                return response.status(404).json(errorMessage);
            }

            // Short path for JSONL files
            if (request.body.format === 'jsonl') {
                const successMessage = {
                    message: `Chat saved to ${exportfilename}`,
                    result: rawFile,
                };
                console.info(`Chat exported as ${exportfilename}`);
                return response.status(200).json(successMessage);
            }

            let buffer = '';
            for (const line of rawFile.split('\n')) {
                if (!line) {
                    continue;
                }
                const data = JSON.parse(line);
                // Skip non-printable/prompt-hidden messages
                if (data.is_system) {
                    continue;
                }
                if (data.mes) {
                    const name = data.name;
                    const message = (data?.extra?.display_text || data?.mes || '').replace(/\r?\n/g, '\n');
                    buffer += (`${name}: ${message}\n\n`);
                }
            }
            const successMessage = {
                message: `Chat saved to ${exportfilename}`,
                result: buffer,
            };
            console.info(`Chat exported as ${exportfilename}`);
            return response.status(200).json(successMessage);
        } catch (err) {
            console.error('chat export failed.', err);
            return response.sendStatus(400);
        }
    });
}

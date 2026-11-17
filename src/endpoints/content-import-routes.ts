import express from 'express';
import type { Response } from 'express';
import { classifyExternalContentId, classifyExternalContentUrl, downloadExternalContentArtifact } from './external-content-import-service.ts';
import type { ArtifactResult, Downloader, ExternalContentSource } from './external-content-import-service.ts';

type Artifact = Extract<ArtifactResult, { ok: true }>['artifact'];
type Failure = { kind?: unknown } | null | undefined;
export function createContentImportRouter(WHITELIST_GENERIC_URL_DOWNLOAD_SOURCES: string[], EXTERNAL_CONTENT_DOWNLOADERS: Record<ExternalContentSource, Downloader>) {
    function sendExternalContentArtifact(response: Response, artifact: Artifact, { encodeFileName = true } = {}) {
        if (artifact.fileType) {
            response.set('Content-Type', artifact.fileType);
        }

        const fileName = encodeFileName ? encodeURI(artifact.fileName) : artifact.fileName;
        response.set('Content-Disposition', `attachment; filename="${fileName}"`);
        response.set('X-Custom-Content-Type', artifact.type);
        return response.send(artifact.buffer);
    }

    function sendExternalContentFailure(response: Response, failure: Failure) {
        if (failure?.kind === 'invalid_artifact' || failure?.kind === 'unsupported_host' || failure?.kind === 'invalid_url' || failure?.kind === 'unsupported_source') {
            return response.sendStatus(404);
        }

        return response.sendStatus(500);
    }

    const router = express.Router();

    router.post('/importURL', async (request, response) => {
        if (!request.body.url) {
            return response.sendStatus(400);
        }

        try {
            const url = request.body.url;
            const classification = classifyExternalContentUrl(url, WHITELIST_GENERIC_URL_DOWNLOAD_SOURCES);
            if (!classification.ok) {
                if (classification.failure?.kind === 'unsupported_host') {
                    console.error(`Received an import for "${classification.failure.host}", but site is not whitelisted. This domain must be added to the config key "whitelistImportDomains" to allow import from this source.`);
                }
                return sendExternalContentFailure(response, classification.failure);
            }

            const result = await downloadExternalContentArtifact({
                descriptor: classification.descriptor,
                downloaders: EXTERNAL_CONTENT_DOWNLOADERS,
            });

            if (!result.ok) {
                return sendExternalContentFailure(response, result.failure);
            }

            return sendExternalContentArtifact(response, result.artifact, { encodeFileName: true });
        } catch (error) {
            console.error('Importing custom content failed', error);
            return response.sendStatus(500);
        }
    });

    router.post('/importUUID', async (request, response) => {
        if (!request.body.url) {
            return response.sendStatus(400);
        }

        try {
            const uuid = request.body.url;
            const classification = classifyExternalContentId(uuid);
            if (!classification.ok) {
                return sendExternalContentFailure(response, classification.failure);
            }

            const result = await downloadExternalContentArtifact({
                descriptor: classification.descriptor,
                downloaders: EXTERNAL_CONTENT_DOWNLOADERS,
            });

            if (!result.ok) {
                if (result.failure?.kind === 'invalid_artifact') {
                    throw new Error('Failed to download content');
                }
                return sendExternalContentFailure(response, result.failure);
            }

            return sendExternalContentArtifact(response, result.artifact, { encodeFileName: false });
        } catch (error) {
            console.error('Importing custom content failed', error);
            return response.sendStatus(500);
        }
    });

    return router;
}

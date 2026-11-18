import type { Request, Response } from 'express';

type AuxiliaryMediaReport = { imported: number; skipped: number; failed: number } | { unconfirmed: true };
type ScenarioReport = { conflicts: number };

export type CharacterImportResult = {
    ok: boolean;
    fileName?: string;
    avatarName?: string;
    reason?: string;
    message?: string;
    refreshHandled?: boolean;
    auxiliaryMedia?: AuxiliaryMediaReport;
    scenarios?: ScenarioReport;
};

export type CharacterImportHandler = (
    uploadPath: string,
    context: { request: Request; response: Response },
    preservedFileName?: string,
) => Promise<string | CharacterImportResult | null | undefined>;

export type CharacterImporters = {
    importFromYaml: CharacterImportHandler;
    importFromJson: CharacterImportHandler;
    importFromPng: CharacterImportHandler;
    importFromCharX: CharacterImportHandler;
    importFromByaf: CharacterImportHandler;
};

export type CharacterImportOptions = {
    uploadPath: string;
    format: string;
    preservedFileName?: string;
    request: Request;
    response: Response;
};

type NormalizedImportResult =
    | { ok: true; fileName: string; auxiliaryMedia?: AuxiliaryMediaReport; scenarios?: ScenarioReport }
    | { ok: false; reason: string; message?: string };

function getAvatarName(fileName: string): string {
    return fileName.endsWith('.png') ? fileName : `${fileName}.png`;
}

function normalizeImportResult(importResult: string | CharacterImportResult | null | undefined): NormalizedImportResult {
    if (typeof importResult === 'string') {
        return importResult
            ? { ok: true, fileName: importResult }
            : { ok: false, reason: 'import_failed' };
    }

    if (!importResult || typeof importResult !== 'object') {
        return { ok: false, reason: 'import_failed' };
    }

    if (importResult.ok === false) {
        return {
            ok: false,
            reason: importResult.reason ?? 'import_failed',
            message: importResult.message,
        };
    }

    const fileName = importResult.fileName;
    if (typeof fileName !== 'string' || fileName.length === 0) {
        return { ok: false, reason: 'import_failed' };
    }

    return {
        ok: true,
        fileName,
        ...(importResult.auxiliaryMedia && { auxiliaryMedia: importResult.auxiliaryMedia }),
        ...(importResult.scenarios && { scenarios: importResult.scenarios }),
    };
}

function resolveCharacterImportHandler(format: string, importers: CharacterImporters): CharacterImportHandler | null {
    const normalizedFormat = String(format ?? '').toLowerCase();
    const importerKeyByFormat: Record<string, keyof CharacterImporters> = {
        yaml: 'importFromYaml',
        yml: 'importFromYaml',
        json: 'importFromJson',
        png: 'importFromPng',
        charx: 'importFromCharX',
        byaf: 'importFromByaf',
    };

    const importerKey = importerKeyByFormat[normalizedFormat];
    return importerKey ? importers[importerKey] : null;
}

export function createCharacterImportCoordinator({
    importFromYaml,
    importFromJson,
    importFromPng,
    importFromCharX,
    importFromByaf,
}: CharacterImporters): (options: CharacterImportOptions) => Promise<CharacterImportResult> {
    const importers = {
        importFromYaml,
        importFromJson,
        importFromPng,
        importFromCharX,
        importFromByaf,
    };

    return async function importCharacterUpload({
        uploadPath,
        format,
        preservedFileName,
        request,
        response,
    }: CharacterImportOptions): Promise<CharacterImportResult> {
        const importCharacter = resolveCharacterImportHandler(format, importers);

        if (!importCharacter) {
            throw new Error(`Unsupported format: ${format}`);
        }

        const importResult = normalizeImportResult(await importCharacter(uploadPath, { request, response }, preservedFileName));

        if (!importResult.ok) {
            return {
                ok: false,
                reason: importResult.reason,
                message: importResult.message,
            };
        }

        const fileName = importResult.fileName;

        return {
            ok: true,
            fileName,
            avatarName: getAvatarName(fileName),
            ...(importResult.auxiliaryMedia && { auxiliaryMedia: importResult.auxiliaryMedia }),
            ...(importResult.scenarios && { scenarios: importResult.scenarios }),
        };
    };
}

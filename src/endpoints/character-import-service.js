function getAvatarName(fileName) {
    return fileName.endsWith('.png') ? fileName : `${fileName}.png`;
}

function normalizeImportResult(importResult) {
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
    };
}

function resolveCharacterImportHandler(format, importers) {
    const normalizedFormat = String(format ?? '').toLowerCase();
    const importerKeyByFormat = {
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
}) {
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
    }) {
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
        };
    };
}

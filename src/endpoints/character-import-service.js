function getAvatarName(fileName) {
    return fileName.endsWith('.png') ? fileName : `${fileName}.png`;
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
    refreshCharacterIndexEntry,
    getDirectories = request => request.user.directories,
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

        const fileName = await importCharacter(uploadPath, { request, response }, preservedFileName);

        if (!fileName) {
            return {
                ok: false,
                reason: 'import_failed',
            };
        }

        const avatarName = getAvatarName(fileName);
        await refreshCharacterIndexEntry(getDirectories(request), avatarName, 'import');

        return {
            ok: true,
            fileName,
            avatarName,
        };
    };
}

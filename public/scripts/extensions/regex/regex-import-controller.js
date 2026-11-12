/**
 * Import rules against a single captured identity. The dependencies are
 * supplied by the host so this module owns neither DOM nor persistence.
 */
export function createRegexImportController({ getFileText, uuid, captureTarget, getScriptsForTarget, saveScriptsByType, authorizeRegexTarget }) {
    function failure(stage, cause, name) {
        const error = new Error(cause?.message || String(cause), { cause });
        error.stage = stage;
        if (name !== undefined) {
            error.name = name;
            error.itemName = name;
        }
        return error;
    }

    async function importRegexFile(file, scriptType, { target } = {}) {
        // Bind the destination identity before asynchronous file reading so a
        // character/preset switch cannot redirect the import.
        target ??= captureTarget(scriptType);
        let input;
        try {
            input = JSON.parse(await getFileText(file));
        } catch (error) {
            throw failure('parse', error);
        }

        const items = Array.isArray(input) ? input : [input];
        let imported = 0;
        for (const item of items) {
            if (!item?.scriptName) throw failure('validate', new Error('No script name provided.'), item?.scriptName);
            item.id = uuid();
            try {
                const list = getScriptsForTarget(target);
                list.push(item);
                await saveScriptsByType(list, scriptType, target);
            } catch (error) {
                throw failure('save', error, item.scriptName);
            }
            try {
                await authorizeRegexTarget(target);
            } catch (error) {
                throw failure('authorize', error, item.scriptName);
            }
            imported++;
        }
        return { imported };
    }

    return { importRegexFile };
}

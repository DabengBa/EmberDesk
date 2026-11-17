import type { RequestHandler } from 'express';
import { runCharacterTextReplace } from './character-text-replace-service.ts';
import type { CharacterTextReplaceDependencies } from './character-text-replace-service.ts';

export function createCharacterTextReplaceHandlers(dependencies: CharacterTextReplaceDependencies): {
    preview: RequestHandler;
    apply: RequestHandler;
} {
    return {
        preview: async function (request, response) {
            try {
                const result = await runCharacterTextReplace({ request, apply: false, dependencies });
                if (!result.ok) {
                    return response.status(result.status ?? 500).json(result);
                }
                return response.json(result);
            } catch (exception) {
                console.error('Text replace preview error:', exception);
                return response.status(500).send({ error: 'Text replace preview failed.' });
            }
        },
        apply: async function (request, response) {
            try {
                const result = await runCharacterTextReplace({ request, apply: true, dependencies });
                if (!result.ok) {
                    return response.status(result.status ?? 500).json(result);
                }
                return response.json(result);
            } catch (exception) {
                console.error('Text replace apply error:', exception);
                return response.status(500).send({ error: 'Text replace apply failed.' });
            }
        },
    };
}

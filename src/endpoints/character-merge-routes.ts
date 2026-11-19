import fs from 'node:fs';
import path from 'node:path';
import type { Request, RequestHandler } from 'express';
import type { UserDirectoryList } from '../users.js';
import _ from 'lodash';
import { forbiddenRegExp } from '../middleware/validateFileName.js';
import { deepMerge } from '../util.js';
import { TavernCardValidator } from '../validator/TavernCardValidator.ts';
import { processUnsetSentinels } from './character-card-helpers.js';
import { editCharacterCard } from './character-write-service.ts';
import type { DeleteCharacterOptions } from './character-write-service.ts';

type Dependencies = {
    getCanonicalCharacterCardJsonSafe: (handle: string | null, directories: UserDirectoryList, avatar: string) => Promise<string | null>;
    listCanonicalAvatarFilenamesSafe: (handle: string | null, directories: UserDirectoryList) => Set<string>;
    createCharacterWriteDependencies: () => DeleteCharacterOptions['dependencies'];
};
export function createCharacterMergeHandler({ getCanonicalCharacterCardJsonSafe, listCanonicalAvatarFilenamesSafe, createCharacterWriteDependencies }: Dependencies): RequestHandler {
    /** Maximum number of characters processed in parallel during bulk merge */
    const BULK_MERGE_CONCURRENCY = 10;

    /**
     * Reads a character card, applies a merge update (with sentinel-based
     * unsetting), validates the result, and writes it back.
     * @param {string} avatarPath Full path to the character PNG
     * @param {string} avatar     Avatar filename (e.g. "char.png")
     * @param {object} updateData The merge payload to apply
     * @param {import("express").Request} request Express request object
     * @param {((data: any) => boolean) | null} [shouldSkip] Optional function to determine if a character should be skipped based on its original data (used for bulk merge filtering)
     * @returns {Promise<{ok: boolean, error?: string, skipped?: boolean}>} Result of the merge operation, including any validation error
     */
    async function mergeCharacterUpdate(_avatarPath: string, avatar: string, updateData: object, request: Request, shouldSkip: ((data: object) => boolean) | null = null, expectedCardJson?: string): Promise<{ok: boolean; error?: string; skipped?: boolean; cardVersion?: string}> {
        const pngStringData = await getCanonicalCharacterCardJsonSafe(request.user.profile?.handle ?? null, request.user.directories, avatar);
        if (!pngStringData) {
            return { ok: false, error: 'Invalid character file' };
        }
        if (expectedCardJson !== undefined && pngStringData !== expectedCardJson) {
            return { ok: false, error: 'character_card_conflict' };
        }

        let character = JSON.parse(pngStringData);

        if (typeof shouldSkip === 'function' && shouldSkip(character)) {
            return { ok: false, skipped: true };
        }

        const update = _.cloneDeep(updateData);
        _.unset(update, 'json_data');
        _.unset(update, 'expected_card_json');
        _.unset(character, 'json_data');

        character = deepMerge(character, update);
        processUnsetSentinels(character, update);

        const validator = new TavernCardValidator(character);
        //Accept either V1 or V2.
        if (!validator.validate()) {
            return { ok: false, error: validator.lastValidationError ?? 'Validation failed' };
        }

        const targetImg = avatar.replace('.png', '');
        const result = await editCharacterCard({
            request,
            avatarUrl: avatar,
            targetFile: targetImg,
            characterData: JSON.stringify(character),
            expectedCardJson,
            dependencies: createCharacterWriteDependencies(),
        });

        if (!result.ok) {
            return { ok: false, error: result.message ?? 'Failed to write character data' };
        }

        return { ok: true, cardVersion: result.cardVersion };
    }

    /**
     * Handle a POST request to edit character properties.
     *
     * Operates in two modes depending on the request body:
     *
     * **Single mode** (default behavior) — when `avatar` (string) is present:
     *   Merges the request body with the selected character and validates the
     *   result against TavernCard V2 specification.
     *
     * **Bulk mode** — when `avatars` (array) is present:
     *   Applies the same merge to multiple characters in parallel. Supports:
     *   - An explicit list of avatars, or all characters when the array is empty
     *   - An optional server-side `filter` so only characters where a given
     *     JSON path exists and is non-null are updated
     *
     * In both modes, any value equal to the sentinel `__@@UNSET@@__` will cause
     * that key to be **deleted** from the character card instead of being set.
     *
     * @param {import("express").Request} request - The HTTP request object
     * @param {import("express").Response} response - The HTTP response object
     * @returns {void}
     */
    return async function (request, response) {
        try {
            // ── Bulk mode: avatars array is present ──────────────────
            if (Array.isArray(request.body.avatars)) {
                const { avatars, data, filter, expected_card_json_by_avatar } = request.body;

                if (!_.isPlainObject(data)) {
                    return response.status(400).send({ message: 'No valid update data provided.' });
                }

                // Determine which avatar files to process
                let targetAvatars;
                if (avatars.length > 0) {
                    for (const avatar of avatars) {
                        if (typeof avatar !== 'string' || forbiddenRegExp.test(avatar) || path.extname(avatar).toLowerCase() !== '.png') {
                            return response.status(400).send({ message: `Invalid avatar filename: ${avatar}` });
                        }
                    }
                    targetAvatars = avatars;
                } else {
                    // Empty array → all characters: directory scan ∪ canonical rows
                    // (projection 'off' may leave live characters fileless).
                    const files = fs.readdirSync(request.user.directories.characters);
                    const fileAvatars = files.filter(file => path.extname(file).toLowerCase() === '.png');
                    targetAvatars = [...new Set([
                        ...fileAvatars,
                        ...listCanonicalAvatarFilenamesSafe(request.user.profile?.handle ?? null, request.user.directories),
                    ])];
                }

                const updated: string[] = [];
                const skipped: string[] = [];
                const failed: string[] = [];
                const conflicts: string[] = [];
                const missingVersions: string[] = [];
                const canonicalCardVersions: Record<string, string> = Object.create(null);

                /**
                 * Process a single character in bulk: read, filter, merge, validate, write.
                 * @param {string} avatar Avatar filename
                 */
                const processOne = async (avatar: string) => {
                    const avatarPath = path.join(request.user.directories.characters, avatar);

                    try {
                        const expected = _.isPlainObject(expected_card_json_by_avatar) && Object.hasOwn(expected_card_json_by_avatar, avatar) ? expected_card_json_by_avatar[avatar] : undefined;
                        if (typeof expected !== 'string' || !expected) {
                            failed.push(avatar);
                            missingVersions.push(avatar);
                            return;
                        }
                        /** @type {(character: object) => boolean} */
                        let shouldSkip: (character: object) => boolean = () => false;

                        // Apply optional server-side filter before updating the card
                        if (filter && typeof filter.path === 'string') {
                            shouldSkip = (character) => {
                                const value = _.get(character, filter.path);
                                return value === undefined;
                            };
                        }

                        const result = await mergeCharacterUpdate(avatarPath, avatar, data, request, shouldSkip, expected);
                        if (result.ok) {
                            updated.push(avatar);
                            if (result.cardVersion) canonicalCardVersions[avatar] = result.cardVersion;
                        } else if (result.skipped) {
                            skipped.push(avatar);
                        } else {
                            if (result.error === 'character_card_conflict') conflicts.push(avatar);
                            console.warn(`Bulk merge failed for ${avatar}:`, result.error);
                            failed.push(avatar);
                        }
                    } catch (error) {
                        if (error && typeof error === 'object' && 'code' in error && error.code === 'CHARACTER_CARD_CONFLICT') conflicts.push(avatar);
                        console.error(`Bulk merge failed for ${avatar}:`, error);
                        failed.push(avatar);
                    }
                };

                // Process in parallel with a concurrency limit
                for (let i = 0; i < targetAvatars.length; i += BULK_MERGE_CONCURRENCY) {
                    const batch = targetAvatars.slice(i, i + BULK_MERGE_CONCURRENCY);
                    await Promise.allSettled(batch.map(processOne));
                }

                return response.send({ updated, skipped, failed, conflicts, missing_versions: missingVersions, canonical_card_versions: canonicalCardVersions });
            }

            // ── Single mode (default behavior) ───────────────────────
            const update = request.body;
            if (typeof update.expected_card_json !== 'string' || !update.expected_card_json) {
                return response.status(400).send('Error: expected_card_json is required');
            }
            const avatarPath = path.join(request.user.directories.characters, update.avatar);

            const result = await mergeCharacterUpdate(avatarPath, update.avatar, update, request, null, update.expected_card_json);
            if (result.ok) {
                response.send({ canonical_card_version: result.cardVersion });
            } else if (result.error === 'character_card_conflict') {
                response.status(409).send({ error: 'character_card_conflict' });
            } else {
                console.warn(result.error);
                response.status(400).send({ message: `Validation failed for ${update.avatar}`, error: result.error });
            }
        } catch (exception) {
            if (exception && typeof exception === 'object' && 'code' in exception && exception.code === 'CHARACTER_CARD_CONFLICT') {
                return response.status(409).send({ error: 'character_card_conflict' });
            }
            response.status(500).send({ message: 'Unexpected error while saving character.', error: (exception as { toString(): string }).toString() });
        }
    };
}

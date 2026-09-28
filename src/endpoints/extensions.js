import express from 'express';

export const EXTENSIONS_RETIRED_ERROR = 'extensions_retired';
export const EXTENSIONS_RETIRED_MESSAGE = 'Third-party extension support has been removed from EmberDesk.';

/**
 * Stable 410 tombstone for the retired extension-management API. These routes
 * were once reachable by external callers, so they must answer with an explicit
 * Gone status rather than falling through to the final 404.
 * @returns {{error: string, message: string}}
 */
export function getExtensionsRetiredBody() {
    return {
        error: EXTENSIONS_RETIRED_ERROR,
        message: EXTENSIONS_RETIRED_MESSAGE,
    };
}

export const router = express.Router();

router.use((_request, response) => {
    return response.status(410).json(getExtensionsRetiredBody());
});
